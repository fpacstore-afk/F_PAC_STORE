import { createHash } from 'node:crypto';
import { getDb } from '../firebase.js';
import { financialDateKey, orderSaleDateKey } from '../../shared/cashFlow.js';
import { companyCashMovements, sumCashMovements } from '../../shared/companyCashRegister.js';
import { confirmedSalesAmount, dateMatchesRange } from '../../shared/financialDashboard.js';
import { receiptPeriodRange, summarizeReceipts } from '../../shared/financialReceipts.js';

type Reader = (ref: any) => Promise<any>;
const collection = 'financial_monthly_closeouts';
const versionsCollection = 'financial_monthly_closeout_versions';
const rows = (snapshot: any) => snapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));

function validateMonth(month: unknown, today: string): asserts month is string {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '2026-01' || month >= today.slice(0, 7)) {
    throw new Error('INVALID_MONTH');
  }
}

async function calculatePosition(db: any, read: Reader, month: string) {
  const range = receiptPeriodRange(`month:${month}`)!;
  const [orders, cashflow, investments, traffic, payables, counts] = (await Promise.all([
    ...['orders', 'financial_cashflow', 'financial_investments', 'financial_traffic', 'financial_payables'].map(name => read(db.collection(name))),
    read(db.collection('inventory_counts').where('reference', '==', month))
  ])).map(rows);
  const { entries, reviewCount } = companyCashMovements(orders, cashflow, investments, traffic, payables);
  const opening = sumCashMovements(entries.filter(entry => entry.date && entry.date < range.start)).balance;
  const movements = sumCashMovements(entries.filter(entry => entry.date && dateMatchesRange(entry.date, range)));
  const stockCount = counts.sort((a: any, b: any) => String(b.capturedAt).localeCompare(String(a.capturedAt)) || b.id.localeCompare(a.id))[0];
  const receipts = summarizeReceipts(orders, range);
  return {
    opening,
    movements,
    closing: Math.round((opening + movements.balance) * 100) / 100,
    sales: confirmedSalesAmount(orders.filter((order: any) => dateMatchesRange(orderSaleDateKey(order), range))),
    received: receipts.received,
    refunded: receipts.refunded,
    undated: sumCashMovements(entries.filter(entry => !entry.date)),
    reviewCount,
    inventory: stockCount ? { id: stockCount.id, capturedAt: stockCount.capturedAt,
      variants: stockCount.lines?.length || 0, divergences: stockCount.differenceCount || 0 } : null
  };
}

function fingerprint(position: Awaited<ReturnType<typeof calculatePosition>>, revision: number) {
  return createHash('sha256').update(JSON.stringify({ position, revision })).digest('hex');
}

export async function getMonthlyCloseout(month: unknown) {
  validateMonth(month, financialDateKey(new Date())!);
  const db = getDb();
  const ref = db.collection(collection).doc(month);
  const [position, current, history, year] = await Promise.all([
    calculatePosition(db, ref => ref.get(), month),
    ref.get(),
    db.collection(versionsCollection).where('month', '==', month).get(),
    db.collection(collection).where('year', '==', month.slice(0, 4)).get()
  ]);
  const saved = current.data() || null;
  return { position, token: fingerprint(position, saved?.revision || 0), saved, versions: rows(history).sort((a: any, b: any) => b.revision - a.revision),
    annual: rows(year).map((row: any) => ({ month: row.month, sales: row.position.sales, received: row.position.received,
      refunded: row.position.refunded, expenses: row.position.movements.cashOut })).sort((a: any, b: any) => a.month.localeCompare(b.month)) };
}

export async function saveMonthlyCloseout(input: any, actor: any) {
  const { month, token, requestId, reconciled, bankAndCashBalance, receivables, payables } = input || {};
  const today = financialDateKey(new Date())!;
  validateMonth(month, today);
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (reconciled !== true || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) ||
      typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId) || note.length > 2000 ||
      [bankAndCashBalance, receivables, payables].some(amount => typeof amount !== 'number' || !Number.isFinite(amount) ||
        Math.abs(amount) > 1e12 || Math.abs(Math.round(amount * 100) - amount * 100) > 0.001) || receivables < 0 || payables < 0) {
    throw new Error('INVALID_CLOSEOUT');
  }
  const db = getDb();
  const ref = db.collection(collection).doc(month);
  const versionRef = db.collection(versionsCollection).doc(`${month}_${requestId}`);
  return db.runTransaction(async (tx: any) => {
    const priorRequest = await tx.get(versionRef);
    if (priorRequest.exists) {
      const saved = priorRequest.data();
      if (saved.bankAndCashBalance !== bankAndCashBalance || saved.receivables !== receivables ||
          saved.payables !== payables || saved.note !== note) throw new Error('CLOSEOUT_CHANGED');
      return saved;
    }
    const current = (await tx.get(ref)).data();
    const revision = current?.revision || 0;
    const position = await calculatePosition(db, ref => tx.get(ref), month);
    if (token !== fingerprint(position, revision)) throw new Error('CLOSEOUT_CHANGED');
    if ((!position.inventory || revision > 0) && !note) throw new Error('CLOSEOUT_NOTE_REQUIRED');
    const record = { month, year: month.slice(0, 4), revision: revision + 1, position, bankAndCashBalance, receivables, payables, note,
      recordedAt: new Date().toISOString(), recordedBy: actor?.email || actor?.uid || 'Admin' };
    tx.set(versionRef, record);
    tx.set(ref, record);
    return record;
  });
}

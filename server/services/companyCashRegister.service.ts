import { getDb } from '../firebase.js';
import { companyCashMovements, cashRegisterSummary } from '../../shared/companyCashRegister.js';

const sources = ['orders', 'financial_cashflow', 'financial_investments', 'financial_traffic', 'financial_payables'];
const records = (snapshot: any) => snapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
async function loadRegister(db: any, tx?: any) {
  const baselineRef = db.collection('settings').doc('company_cash_register');
  const snapshots = await Promise.all(sources.map(name => tx ? tx.get(db.collection(name)) : db.collection(name).get()));
  const baseline = tx ? await tx.get(baselineRef) : await baselineRef.get();
  const [orders, cashflow, investments, traffic, payables] = snapshots.map(records);
  const movements = companyCashMovements(orders, cashflow, investments, traffic, payables);
  return { baselineRef, summary: { ...cashRegisterSummary(movements.entries, baseline.data() || {}), reviewCount: movements.reviewCount } };
}
export async function getCompanyCashRegister() {
  return (await loadRegister(getDb())).summary;
}
export async function resetCompanyCashRegister(input: any, actor: any) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(String(input?.requestId || '')) || !Number.isInteger(input?.revision) || !Number.isFinite(input?.expectedBalance)) {
    throw new Error('INVALID_RESET');
  }
  const db = getDb();
  const historyRef = db.collection('company_cash_register_resets').doc(input.requestId);
  return db.runTransaction(async (tx: any) => {
    const existing = await tx.get(historyRef);
    if (existing.exists) return { alreadyReset: true };
    const { baselineRef, summary } = await loadRegister(db, tx);
    if (summary.revision !== input.revision || Math.abs(summary.cycle.balance - input.expectedBalance) > 0.005) throw new Error('REGISTER_CHANGED');
    const resetAt = new Date().toISOString();
    const record = { ...summary.totals, resetAt, revision: summary.revision + 1, actorId: actor?.uid || 'admin',
      actorEmail: actor?.email || '', previousCycle: summary.cycle };
    tx.set(historyRef, record);
    tx.set(baselineRef, record);
    return { resetAt };
  });
}

import { financialDateKey, isActiveFinancialRecord } from './cashFlow';
import { companyMovements } from './companyMovements';
import { datedFinancialMovements, orderReceiptHistory } from './financialReceipts';

export type CashMovement = { id: string; description: string; amount: number; type: 'in' | 'out'; date: string | null };
export type CashTotals = { cashIn: number; cashOut: number; balance: number };
const money = (value: number) => Math.round(value * 100) / 100;
export function sumCashMovements(entries: CashMovement[]): CashTotals {
  const cashIn = money(entries.filter(e => e.type === 'in').reduce((sum, e) => sum + e.amount, 0));
  const cashOut = money(entries.filter(e => e.type === 'out').reduce((sum, e) => sum + e.amount, 0));
  return { cashIn, cashOut, balance: money(cashIn - cashOut) };
}

/** Real receipts and recorded company spending only. Never subtract COGS or estimated fees. */
export function companyCashMovements(orders: any[], cashflow: any[], investments: any[], traffic: any[], payables: any[]) {
  const entries: CashMovement[] = [];
  let reviewCount = 0;
  const push = (id: string, description: string, amount: unknown, type: 'in' | 'out', date: unknown) => {
    const number = Number(amount);
    if (!Number.isFinite(number) || number < 0) { reviewCount++; return; }
    if (number > 0) entries.push({ id, description, amount: money(number), type, date: financialDateKey(date) });
  };
  for (const order of orders) {
    const receipts = orderReceiptHistory(order);
    if (receipts.conflict) reviewCount++;
    const card = order.posCardSettlement;
    if (card?.state === 'awaiting') continue;
    if (card?.state === 'settled') {
      push(`order:${order.id}:deposit`, `Crédito da operadora · pedido ${order.id}`, card.depositCents / 100, 'in', card.date);
      let retainedRefund = Number(card.refundCents || 0);
      for (const [index, entry] of [...receipts.outgoing.movements].sort((a, b) => a.date.localeCompare(b.date)).entries()) {
        const refundCents = Math.round(entry.amount * 100);
        const retained = Math.min(retainedRefund, refundCents);
        retainedRefund -= retained;
        push(`order:${order.id}:out:${index}`, `Estorno · pedido ${order.id}`, (refundCents - retained) / 100, 'out', entry.date);
      }
      const undatedRefund = Math.round(receipts.outgoing.undated * 100);
      if (retainedRefund > undatedRefund) reviewCount++;
      push(`order:${order.id}:out:undated`, `Estorno a conferir · pedido ${order.id}`, Math.max(0, undatedRefund - retainedRefund) / 100, 'out', null);
      continue;
    }
    for (const [type, history] of [['in', receipts.incoming], ['out', receipts.outgoing]] as const) {
      history.movements.forEach((entry, i) => push(`order:${order.id}:${type}:${i}`, `${type === 'in' ? 'Recebimento' : 'Estorno'} · pedido ${order.id}`, entry.amount, type, entry.date));
      push(`order:${order.id}:${type}:undated`, `Pedido ${order.id} · data a conferir`, history.undated, type, null);
    }
  }
  const movements = companyMovements(cashflow, investments).filter(isActiveFinancialRecord);
  const representedTraffic = new Set<string>();
  const linkedPayables = new Map<string, number>();
  for (const entry of movements) {
    const type = String(entry.type).toLowerCase() === 'in' ? 'in' : 'out';
    push(`${entry.recordSource}:${entry.id}`, entry.description || entry.category || 'Movimentação', entry.amount, type, entry.date || entry.paymentDate || entry.createdAt);
    if (entry.sourceType === 'traffic' && entry.sourceReferenceId) representedTraffic.add(String(entry.sourceReferenceId));
    if (type === 'out' && entry.sourceType === 'accounts_payable' && entry.sourceReferenceId) {
      const id = String(entry.sourceReferenceId);
      linkedPayables.set(id, (linkedPayables.get(id) || 0) + (Number(entry.amount) || 0));
    }
  }
  for (const entry of traffic.filter(isActiveFinancialRecord)) {
    if (!representedTraffic.has(String(entry.id))) push(`traffic:${entry.id}`, entry.campaignName || 'Tráfego pago', entry.amountSpent ?? entry.amount, 'out', entry.date || entry.createdAt);
  }
  for (const payable of payables.filter(isActiveFinancialRecord)) {
    const paid = Number(payable.amountPaid || 0);
    const represented = linkedPayables.get(String(payable.id)) || 0;
    if (represented > paid + 0.005) reviewCount++;
    const remainder = money(Math.max(0, paid - represented));
    if (!remainder) continue;
    // An incomplete mirror cannot reliably identify which dates are missing.
    const history = represented > 0 ? { movements: [], undated: remainder, conflict: false }
      : datedFinancialMovements(remainder, payable.paymentHistory || [], payable.paymentDate);
    if (history.conflict) reviewCount++;
    history.movements.forEach((entry, i) => push(`payable:${payable.id}:${i}`, payable.description || 'Fornecedor', entry.amount, 'out', entry.date));
    push(`payable:${payable.id}:undated`, `${payable.description || 'Fornecedor'} · data a conferir`, history.undated, 'out', null);
  }
  return { entries, reviewCount };
}

export function cashRegisterSummary(entries: CashMovement[], baseline: any = {}, now = new Date()) {
  const today = financialDateKey(now)!;
  const date = new Date(`${today}T12:00:00Z`);
  const weekStart = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const realized = entries.filter(entry => !entry.date || entry.date <= today);
  const totals = sumCashMovements(realized);
  const periods = Object.fromEntries(Object.entries({ today, week: weekStart, month: `${today.slice(0, 7)}-01` }).map(([key, start]) =>
    [key, sumCashMovements(realized.filter(entry => entry.date && entry.date >= start && entry.date <= today))]));
  const cycleIn = money(totals.cashIn - (Number(baseline.cashIn) || 0));
  const cycleOut = money(totals.cashOut - (Number(baseline.cashOut) || 0));
  return { totals, periods, cycle: { cashIn: cycleIn, cashOut: cycleOut, balance: money(cycleIn - cycleOut) },
    lastResetAt: baseline.resetAt || null, revision: baseline.revision || 0,
    undated: sumCashMovements(realized.filter(entry => !entry.date)),
    recent: realized.filter(entry => entry.date).sort((a,b) => b.date!.localeCompare(a.date!)).slice(0, 40) };
}

import { getOrderPaidAmount, getOrderRefundedAmount } from './orderFinancialCore';
import { financialDateKey } from './cashFlow';

export type ReceiptRange = { start: string; end: string } | null;
type Movement = { date: string; amount: number };
const money = (n: number) => Number(n.toFixed(2));
const positive = (n: unknown) => Number.isFinite(Number(n)) && Number(n) >= 0;

/** Keep incomplete histories explicit: do not assign the remainder to the last payment date. */
function datedMovements(total: number, logs: any[], fallbackDate: unknown) {
  if (!positive(total)) return { movements: [] as Movement[], undated: 0, conflict: true };
  const movements: Movement[] = [];
  const seen = new Map<string, string>();
  let recorded = 0, undated = 0, conflict = false;
  if (!logs.length) {
    const date = financialDateKey(fallbackDate);
    return { movements: date && total > 0 ? [{ date, amount: total }] : [], undated: date ? 0 : total, conflict: false };
  }
  for (const log of logs) {
    if (['pending', 'processing', 'rejected', 'cancelled', 'voided'].includes(String(log.status || '').toLowerCase())) continue;
    const amount = Number(log.amount);
    const date = financialDateKey(log.date || log.paidAt || log.refundedAt || log.timestamp || log.createdAt);
    if (!positive(amount)) { conflict = true; continue; }
    const id = log.id || log.eventId || log.ledgerEventId || log.idempotencyKey;
    if (id) {
      const signature = `${date}:${amount}`;
      if (seen.has(String(id))) { if (seen.get(String(id)) !== signature) conflict = true; continue; }
      seen.set(String(id), signature);
    }
    recorded += amount;
    if (date) movements.push({ date, amount });
    else undated += amount;
  }
  if (recorded > total + 0.005) conflict = true;
  if (conflict) return { movements: [] as Movement[], undated: total, conflict: true };
  return { movements, undated: money(undated + Math.max(0, total - recorded)), conflict: false };
}

export function orderReceiptHistory(order: any) {
  const paid = getOrderPaidAmount(order);
  const refunded = getOrderRefundedAmount(order);
  const history = Array.isArray(order.history) ? order.history : [];
  const paymentLogs = Array.isArray(order.paymentLogs) && order.paymentLogs.length ? order.paymentLogs
    : history.filter((e: any) => ['manual_payment', 'payment_approved', 'partial_payment'].includes(e.financialType || e.type) && e.amount !== undefined);
  const refundLogs = Array.isArray(order.refundLogs) && order.refundLogs.length ? order.refundLogs
    : history.filter((e: any) => ['refund', 'partial_refund'].includes(e.financialType || e.type) && e.amount !== undefined);
  const incoming = datedMovements(paid, paymentLogs, order.payment?.paidAt || order.paidAt || order.data_pagamento);
  const outgoing = datedMovements(refunded, refundLogs, order.payment?.refundedAt || order.refundedAt);
  return { paid, refunded, incoming, outgoing, conflict: incoming.conflict || outgoing.conflict || refunded > paid + 0.005 };
}

/** Calendar cash receipts, independent of order creation and delivery. */
export function summarizeReceipts(orders: any[], range: ReceiptRange = null) {
  let received = 0, refunded = 0, undatedReceived = 0, undatedRefunded = 0;
  let receivedOrders = 0, ordersNeedingReview = 0;
  for (const order of orders) {
    const data = orderReceiptHistory(order);
    undatedReceived += data.incoming.undated;
    undatedRefunded += data.outgoing.undated;
    if (data.conflict || data.incoming.undated > 0 || data.outgoing.undated > 0) ordersNeedingReview++;
    const inRange = (movements: Movement[]) => movements.reduce((sum, event) => sum + (!range || (event.date >= range.start && event.date <= range.end) ? event.amount : 0), 0);
    const incoming = range ? inRange(data.incoming.movements) : data.paid;
    const outgoing = range ? inRange(data.outgoing.movements) : data.refunded;
    received += incoming; refunded += outgoing;
    if (incoming > 0) receivedOrders++;
  }
  return { received: money(received), refunded: money(refunded), netReceived: money(received - refunded),
    undatedReceived: money(undatedReceived), undatedRefunded: money(undatedRefunded), receivedOrders, ordersNeedingReview };
}

export function receiptMonthRange(year: number, month: number): Exclude<ReceiptRange, null> {
  return { start: `${year}-${String(month + 1).padStart(2, '0')}-01`, end: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10) };
}

/** Goals use the same cutoff as the overview: future-dated receipts are not realized today. */
export function receiptGoalRanges(year: number, month: number, now = new Date()) {
  const today = financialDateKey(now)!;
  const monthly = receiptMonthRange(year, month);
  return {
    month: { ...monthly, end: monthly.end < today ? monthly.end : today },
    year: { start: `${year}-01-01`, end: `${year}-12-31` < today ? `${year}-12-31` : today }
  };
}

export function receiptPeriodRange(period: string, now = new Date()): ReceiptRange {
  if (period === 'all') return null;
  const today = financialDateKey(now)!;
  const [year, month] = today.split('-').map(Number);
  if (period === 'previous_month') return receiptMonthRange(month === 1 ? year - 1 : year, month === 1 ? 11 : month - 2);
  if (period === 'current_month') return { start: receiptMonthRange(year, month - 1).start, end: today };
  if (period === 'year') return { start: `${year}-01-01`, end: today };
  const days = period === '7days' ? 6 : period === 'quarter' ? 89 : 0;
  return { start: new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10), end: today };
}

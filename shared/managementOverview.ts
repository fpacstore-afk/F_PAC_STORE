import { financialDateKey } from './cashFlow';
import { orderReceiptHistory, type ReceiptRange } from './financialReceipts';
import { getOrderPaidAmount, getOrderPaymentStatus, getOrderPendingAmount } from './orderFinancialCore';

const DAY = 86400000;
const shiftDay = (day: string, offset: number) => new Date(Date.parse(`${day}T12:00:00Z`) + offset * DAY).toISOString().slice(0, 10);
const money = (amount: number) => Number(amount.toFixed(2));

export function previousDashboardRange(range: ReceiptRange): ReceiptRange {
  if (!range) return null;
  const length = Math.round((Date.parse(`${range.end}T12:00:00Z`) - Date.parse(`${range.start}T12:00:00Z`)) / DAY) + 1;
  return { start: shiftDay(range.start, -length), end: shiftDay(range.start, -1) };
}

/** A pending checkout attempt is not an actionable receivable. */
export function isConfirmedReceivable(order: any) {
  const status = getOrderPaymentStatus(order);
  if (order?.isGift || order?.orderKind === 'gift' || ['cancelled', 'canceled', 'cancelado', 'rejected', 'refunded', 'not_applicable'].includes(status)) return false;
  if (getOrderPendingAmount(order) <= 0) return false;
  if (order?.isManual === true || order?.confirmedAt || getOrderPaidAmount(order) > 0) return true;
  const stages = [order?.status, order?.production?.status, order?.productionStatus, order?.shipping?.status, order?.shippingStatus]
    .map(value => String(value || '').toLowerCase());
  return stages.some(value => ['confirmed', 'processing', 'in_production', 'separacao_corte', 'estamparia', 'costura', 'embalagem', 'ready', 'completed', 'shipped', 'in_transit', 'delivered', 'entregue'].includes(value));
}

export function periodChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export type ReceiptBucket = { label: string; start: string; end: string; current: number; previous: number | null };

/** Only dated payment/refund movements are charted. Undated balances remain in the reconciliation warning. */
export function receiptTrend(orders: any[], range: ReceiptRange, days: number | null, now = new Date()): ReceiptBucket[] {
  const daily = new Map<string, number>();
  for (const order of orders) {
    const history = orderReceiptHistory(order);
    for (const movement of history.incoming.movements) daily.set(movement.date, (daily.get(movement.date) || 0) + movement.amount);
    for (const movement of history.outgoing.movements) daily.set(movement.date, (daily.get(movement.date) || 0) - movement.amount);
  }
  const sum = (start: string, end: string) => {
    let total = 0;
    for (const [date, value] of daily) if (date >= start && date <= end) total += value;
    return money(total);
  };
  if (!range || days === null) {
    const today = financialDateKey(now)!;
    const [year, month] = today.split('-').map(Number);
    return Array.from({ length: 12 }, (_, index) => {
      const start = new Date(Date.UTC(year, month - 12 + index, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(year, month - 11 + index, 0)).toISOString().slice(0, 10);
      return { label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${start}T12:00:00Z`)).replace('.', ''), start, end, current: sum(start, end), previous: null };
    });
  }
  const step = days <= 7 ? 1 : days <= 30 ? 7 : 14;
  return Array.from({ length: Math.ceil(days / step) }, (_, index) => {
    const start = shiftDay(range.start, index * step);
    const end = shiftDay(range.start, Math.min(days - 1, (index + 1) * step - 1));
    const label = step === 1 ? start.slice(8, 10) : `${start.slice(8, 10)}/${start.slice(5, 7)}`;
    return { label, start, end, current: sum(start, end), previous: sum(shiftDay(start, -days), shiftDay(end, -days)) };
  });
}

import { getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderGatewayFee, getOrderShippingFinances } from './orderFinancialCore';
const roundMoney = (value: number) => Number(value.toFixed(2));

export function isActiveFinancialRecord(record: any): boolean {
  return !['voided', 'cancelled', 'canceled', 'cancelado'].includes(String(record?.status || '').toLowerCase());
}

/** Operating movements from recorded data, not a reconciled bank balance. */
export function calculateRecordedCashFlow(orders: any[], cashflow: any[] = [], traffic: any[] = [], payables: any[] = []) {
  let cashIn = 0;
  let cashOut = 0;
  let estimatedFeeOrders = 0;
  for (const order of orders) {
    cashIn += getOrderPaidAmount(order);
    cashOut += getOrderRefundedAmount(order);
    const fee = getOrderGatewayFee(order);
    cashOut += fee.fee + getOrderShippingFinances(order).shippingActualCost;
    if (!fee.isExact) estimatedFeeOrders++;
  }
  const linkedPayments = new Map<string, number>();
  for (const entry of cashflow.filter(isActiveFinancialRecord)) {
    const amount = Number(entry.amount ?? 0);
    if (String(entry.type || 'out').toLowerCase() === 'in') cashIn += amount;
    else {
      cashOut += amount;
      if (entry.sourceType === 'accounts_payable' && entry.sourceReferenceId) {
        const key = String(entry.sourceReferenceId);
        linkedPayments.set(key, (linkedPayments.get(key) || 0) + amount);
      }
    }
  }
  for (const entry of traffic.filter(isActiveFinancialRecord)) cashOut += Number(entry.amountSpent ?? entry.amount ?? 0);
  // Include only the portion of an actual payable settlement not already mirrored in cashflow.
  for (const payable of payables.filter(isActiveFinancialRecord)) {
    cashOut += Math.max(0, Number(payable.amountPaid ?? 0) - (linkedPayments.get(String(payable.id)) || 0));
  }
  return { cashIn: roundMoney(cashIn), cashOut: roundMoney(cashOut), netCashFlow: roundMoney(cashIn - cashOut), estimatedFeeOrders };
}

export function financialDateKey(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
  }
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Distribute only the authoritative balance, in due-date order; do not invent a due date. */
export function scheduleOpenBalance(balance: number, installments: any[], fallbackDue?: any) {
  let remaining = Math.max(0, balance);
  const candidates = installments.length ? installments : [{ amount: remaining, dueDate: fallbackDue }];
  const sorted = candidates.filter(i => isActiveFinancialRecord(i) && !['paid', 'paga', 'pago'].includes(String(i.status || '').toLowerCase()))
    .map(i => ({ due: financialDateKey(i.dueDate), open: Math.max(0, Number(i.amount ?? 0) - Number(i.paidAmount ?? 0)) }))
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const entries: { due: string; amount: number }[] = [];
  for (const item of sorted) {
    if (!item.due || !Number.isFinite(item.open)) continue;
    const amount = Math.min(remaining, item.open);
    if (amount > 0) entries.push({ due: item.due, amount });
    remaining = roundMoney(remaining - amount);
  }
  return { entries, unscheduled: remaining };
}

export function getRecordedOrderDueDate(order: any): Date | null {
  const balance = getOrderPendingAmount(order);
  if (!(balance > 0)) {
    const recorded = financialDateKey(order?.payment?.dueDate || order?.dueDate);
    return recorded ? new Date(`${recorded}T12:00:00Z`) : null;
  }
  const installments = Array.isArray(order?.payment?.installments) ? order.payment.installments : (Array.isArray(order?.installments) ? order.installments : []);
  const schedule = scheduleOpenBalance(balance, installments, order?.payment?.dueDate || order?.dueDate);
  return schedule.entries.length ? new Date(`${schedule.entries[0].due}T12:00:00Z`) : null;
}

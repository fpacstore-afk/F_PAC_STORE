import { calculateRecordedCashFlow, financialDateKey, isActiveFinancialRecord, scheduleOpenBalance } from './cashFlow';
import { getOrderPendingAmount } from './orderFinancialCore';
const roundMoney = (value: number) => Number(value.toFixed(2));

export function calculateCashForecast(orders: any[], payables: any[], cashflow: any[], traffic: any[], now = new Date()) {
  const cash = calculateRecordedCashFlow(orders, cashflow, traffic, payables);
  const today = financialDateKey(now)!;
  const horizon = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const receivables: {due: string; amount: number}[] = [];
  const obligations: {due: string; amount: number}[] = [];
  let unscheduledReceivables = 0, unscheduledPayables = 0;
  let overduePayablesCount = 0, dueTodayPayablesCount = 0, due3DaysPayablesCount = 0;
  for (const order of orders) {
    const balance = getOrderPendingAmount(order);
    if (!Number.isFinite(balance)) throw new Error('Saldo a receber inválido. Confira os dados do pedido.');
    const planned = scheduleOpenBalance(balance, order.payment?.installments || order.installments || [], order.payment?.dueDate || order.dueDate);
    receivables.push(...planned.entries);
    unscheduledReceivables += planned.unscheduled;
  }
  for (const payable of payables.filter(isActiveFinancialRecord)) {
    const balance = Math.max(0, Number(payable.amount ?? 0) - Number(payable.amountPaid ?? 0));
    if (!Number.isFinite(balance)) throw new Error('Saldo a pagar inválido. Confira os dados da conta.');
    const planned = scheduleOpenBalance(balance, payable.installments || [], payable.dueDate);
    obligations.push(...planned.entries);
    unscheduledPayables += planned.unscheduled;
    if (planned.entries.some(e => e.due < today)) overduePayablesCount++;
    if (planned.entries.some(e => e.due === today)) dueTodayPayablesCount++;
    if (planned.entries.some(e => e.due >= today && e.due <= horizon(3))) due3DaysPayablesCount++;
  }
  const sum = (list: typeof obligations, predicate: (due: string) => boolean) => roundMoney(list.reduce((n, e) => n + (predicate(e.due) ? e.amount : 0), 0));
  const summary: Record<string, number> = {
    currentCashBalance: cash.netCashFlow,
    estimatedFeeOrders: cash.estimatedFeeOrders,
    unscheduledReceivables: roundMoney(unscheduledReceivables),
    unscheduledPayables: roundMoney(unscheduledPayables),
    overduePayablesCount, dueTodayPayablesCount, due3DaysPayablesCount,
    overduePayablesAmount: sum(obligations, due => due < today),
    dueTodayPayablesAmount: sum(obligations, due => due === today),
    due3DaysPayablesAmount: sum(obligations, due => due >= today && due <= horizon(3))
  };
  for (const days of [7, 15, 30, 60, 90]) {
    const incoming = sum(receivables, due => due <= horizon(days));
    const outgoing = sum(obligations, due => due <= horizon(days));
    summary[`expectedReceivables${days}Days`] = incoming;
    summary[`expectedPayables${days}Days`] = outgoing;
    summary[`projectedBalance${days}Days`] = roundMoney(cash.netCashFlow + incoming - outgoing);
  }
  if (Object.values(summary).some(value => !Number.isFinite(value))) throw new Error('Há valores financeiros inválidos. Confira os lançamentos antes de projetar o caixa.');
  return summary;
}

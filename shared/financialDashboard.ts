import { financialDateKey, isActiveFinancialRecord, scheduleOpenBalance } from './cashFlow';
import { datedFinancialMovements, receiptMonthRange, receiptPeriodRange, receiptGoalRanges, summarizeReceipts, type ReceiptRange } from './financialReceipts';
import { getOrderPendingAmount, getOrderPaidAmount, getOrderTotal, getOrderPaymentStatus, getOrderRefundedAmount } from './orderFinancialCore';

const money = (value: number) => Number(value.toFixed(2));

/** Inclusive Brazilian calendar days, shared by sales cohorts and actual receipts. */
export function dashboardPeriodRange(days: number | null, now = new Date()): ReceiptRange {
  if (days === null) return null;
  const end = financialDateKey(now)!;
  return { start: new Date(Date.parse(`${end}T12:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10), end };
}

export function dateMatchesRange(value: unknown, range: ReceiptRange): boolean {
  if (!range) return true;
  const date = financialDateKey(value);
  return Boolean(date && date >= range.start && date <= range.end);
}

/** Sales goals follow the original order month; cash continues to follow each settlement date. */
export function salesGoalProgress(orders: any[], year: number, month: number, now = new Date()) {
  const ranges = receiptGoalRanges(year, month, now);
  let monthly = 0, yearly = 0, pendingConfirmation = 0, review = 0;
  for (const order of orders) {
    const status = getOrderPaymentStatus(order);
    if (order.isGift === true || order.orderKind === 'gift' || !isActiveFinancialRecord(order) || ['cancelled', 'rejected', 'refunded', 'not_applicable'].includes(status)) continue;
    const date = financialDateKey(order.createdAt || order.createdAtDate || order.created_at || order.date);
    const value = getOrderTotal(order), refunded = getOrderRefundedAmount(order);
    if (!date || !Number.isFinite(value) || value < 0 || !Number.isFinite(refunded) || refunded < 0) { review++; continue; }
    // Manual sales are confirmed by the store. Unpaid, unconfirmed online attempts stay separate.
    const operational = [order.status, order.production?.status, order.productionStatus].map(value => String(value || '').toLowerCase());
    const confirmed = getOrderPaidAmount(order) > 0 || order.isManual === true || Boolean(order.confirmedAt) || operational.some(value => ['processing', 'in_production', 'estamparia', 'costura', 'embalagem', 'ready', 'pronto', 'completed', 'shipped', 'delivered', 'entregue'].includes(value));
    const netSale = Math.max(0, value - refunded);
    if (!confirmed) {
      if (dateMatchesRange(date, ranges.month)) pendingConfirmation += netSale;
      continue;
    }
    if (dateMatchesRange(date, ranges.month)) monthly += netSale;
    if (dateMatchesRange(date, ranges.year)) yearly += netSale;
  }
  return { month: money(monthly), year: money(yearly), pendingConfirmation: money(pendingConfirmation), review };
}

export type ReceivableDateBasis = 'created' | 'due' | 'receipt';

export function receivableMatchesPeriod(order: any, period: string, basis: ReceivableDateBasis, now = new Date()): boolean {
  if (period === 'all') return true;
  let range = receiptPeriodRange(period === 'month' ? 'current_month' : period === 'prev_month' ? 'previous_month' : period, now);
  if (basis === 'due') {
    const today = financialDateKey(now)!;
    const [year, month] = today.split('-').map(Number);
    if (period === 'month') range = receiptMonthRange(year, month - 1);
    if (period === '7days') range = { start: today, end: new Date(Date.parse(`${today}T12:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10) };
  }
  if (basis === 'receipt') {
    const receipts = summarizeReceipts([order], range);
    return receipts.received > 0 || receipts.refunded > 0;
  }
  if (basis === 'created') return dateMatchesRange(order.createdAt || order.createdAtDate || order.created_at || order.date, range);
  const installments = order.payment?.installments || order.installments || [];
  const schedule = scheduleOpenBalance(getOrderPendingAmount(order), Array.isArray(installments) ? installments : [], order.payment?.dueDate || order.dueDate);
  return schedule.entries.some(entry => dateMatchesRange(entry.due, range));
}

/** Paid amounts take precedence over a stale amountOpen mirror. No missing dates are invented. */
export function payableOpenAmount(payable: any): number {
  if (!isActiveFinancialRecord(payable)) return 0;
  return money(Math.max(0, Number(payable.amount || 0) - Number(payable.amountPaid || 0)));
}

export function payableSchedule(payable: any) {
  return scheduleOpenBalance(payableOpenAmount(payable), Array.isArray(payable.installments) ? payable.installments : [], payable.dueDate);
}

export function payableIsOverdue(payable: any, today: string): boolean {
  return payableSchedule(payable).entries.some(entry => entry.due < today);
}

export function summarizePayables(payables: any[], now = new Date()) {
  const today = financialDateKey(now)!;
  const [year, month] = today.split('-').map(Number);
  const monthRange = { ...receiptMonthRange(year, month - 1), end: today };
  let totalOpen = 0, totalPaid = 0, paidInPeriod = 0, pendingCount = 0;
  let overdueCount = 0, overdueAmount = 0, dueTodayCount = 0, dueTodayAmount = 0, upcomingAmount = 0;
  let unscheduledOpen = 0, undatedPaid = 0, paymentsNeedingReview = 0, invalidAmountCount = 0;
  for (const payable of payables.filter(isActiveFinancialRecord)) {
    const paid = Number(payable.amountPaid || 0), total = Number(payable.amount);
    if (!Number.isFinite(paid) || !Number.isFinite(total) || paid < 0 || total < 0 || paid > total + 0.005) {
      invalidAmountCount++; continue;
    }
    const open = payableOpenAmount(payable);
    totalPaid += paid; totalOpen += open;
    if (open > 0) {
      pendingCount++;
      const schedule = payableSchedule(payable);
      const overdue = schedule.entries.filter(entry => entry.due < today);
      const dueToday = schedule.entries.filter(entry => entry.due === today);
      if (overdue.length) overdueCount++;
      if (dueToday.length) dueTodayCount++;
      overdueAmount += overdue.reduce((sum, entry) => sum + entry.amount, 0);
      dueTodayAmount += dueToday.reduce((sum, entry) => sum + entry.amount, 0);
      upcomingAmount += schedule.entries.filter(entry => entry.due >= today).reduce((sum, entry) => sum + entry.amount, 0);
      unscheduledOpen += schedule.unscheduled;
    }
    const history = Array.isArray(payable.paymentHistory) ? payable.paymentHistory : [];
    const payments = datedFinancialMovements(paid, history, payable.paymentDate);
    paidInPeriod += payments.movements.filter(entry => dateMatchesRange(entry.date, monthRange)).reduce((sum, entry) => sum + entry.amount, 0);
    undatedPaid += payments.undated;
    if (payments.conflict || payments.undated > 0) paymentsNeedingReview++;
  }
  return { totalOpen: money(totalOpen), totalPaid: money(totalPaid), paidInPeriod: money(paidInPeriod), pendingCount,
    overdueCount, overdueAmount: money(overdueAmount), dueTodayCount, dueTodayAmount: money(dueTodayAmount), upcomingAmount: money(upcomingAmount),
    unscheduledOpen: money(unscheduledOpen), undatedPaid: money(undatedPaid), paymentsNeedingReview, invalidAmountCount };
}

/** Conversion counts multiplied by a ticket are a scenario, never verified revenue or profit. */
export function estimateCampaignPerformance(traffic: any[], averageTicket: number) {
  const campaigns = traffic.filter(isActiveFinancialRecord).map(campaign => {
    const spend = Math.max(0, Number(campaign.amountSpent ?? campaign.amount ?? 0) || 0);
    const conversions = Math.max(0, Number(campaign.conversions || 0) || 0);
    const estimatedValue = conversions > 0 && averageTicket > 0 ? money(conversions * averageTicket) : null;
    return { ...campaign, amountSpent: spend, conversions, estimatedValue,
      roas: estimatedValue !== null && spend > 0 ? estimatedValue / spend : null,
      lucro: estimatedValue !== null ? money(estimatedValue - spend) : null };
  });
  const totalInvestido = money(campaigns.reduce((sum, campaign) => sum + campaign.amountSpent, 0));
  const totalConversions = campaigns.reduce((sum, campaign) => sum + campaign.conversions, 0);
  const allEstimated = campaigns.length > 0 && campaigns.every(campaign => campaign.estimatedValue !== null);
  const revenue = campaigns.reduce((sum, campaign) => sum + (campaign.estimatedValue || 0), 0);
  return { campaigns, totalInvestido, totalConversions,
    totalCliques: campaigns.reduce((sum, campaign) => sum + Math.max(0, Number(campaign.clicks || 0) || 0), 0),
    roas: allEstimated && totalInvestido > 0 ? revenue / totalInvestido : null,
    cac: totalConversions > 0 ? totalInvestido / totalConversions : null };
}

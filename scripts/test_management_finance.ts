import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dashboardPeriodRange, dateMatchesRange, receivableMatchesPeriod, summarizePayables, payableIsOverdue, estimateCampaignPerformance, salesGoalProgress } from '../shared/financialDashboard';
import { summarizeReceipts, receiptMonthRange } from '../shared/financialReceipts';
import { BreakEvenView } from '../src/components/admin/financial/profitability/BreakEvenView';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { calculateFinancialDRE } from '../src/utils/orderFinancial';
import { calculateCashForecast } from '../shared/cashForecast';

let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }
const now = new Date('2026-10-16T18:00:00Z');
const october = receiptMonthRange(2026, 9);
const order = { total: 300, createdAt: '2026-09-01', payment: { paidAmount: 300, refundedAmount: 70 },
  paymentLogs: [{ id: 'sept', amount: 100, date: '2026-09-10' }, { id: 'oct', amount: 200, date: '2026-10-05' }],
  refundLogs: [{ id: 'refund', amount: 70, date: '2026-10-10' }] };

check('January sale and its cost stay in January goals and results when paid in February', () => {
  const sale = { total: 100, createdAt: '2026-01-20', isManual: true, items: [{ quantity: 1, price: 100, unitCostSnapshot: 40 }], payment: { paidAmount: 100, paidAt: '2026-02-05', gatewayFee: 0 } };
  assert.equal(salesGoalProgress([sale], 2026, 0, now).month, 100);
  assert.equal(salesGoalProgress([sale], 2026, 1, now).month, 0);
  assert.equal(summarizeReceipts([sale], receiptMonthRange(2026, 0)).received, 0);
  assert.equal(summarizeReceipts([sale], receiptMonthRange(2026, 1)).received, 100);
  const januaryOrders = [sale].filter(order => dateMatchesRange(order.createdAt, receiptMonthRange(2026, 0)));
  const februaryOrders = [sale].filter(order => dateMatchesRange(order.createdAt, receiptMonthRange(2026, 1)));
  assert.equal(calculateFinancialDRE(januaryOrders).cogs, 40);
  assert.equal(calculateFinancialDRE(februaryOrders).cogs, 0);
});
check('sales goals count each order once and keep unconfirmed online attempts separate', () => {
  const sale = { total: 100, createdAt: '2026-01-20', payment: { paidAmount: 60 }, paymentLogs: [{ amount: 30, date: '2026-02-01' }, { amount: 30, date: '2026-03-01' }] };
  const result = salesGoalProgress([sale, { ...sale, payment: { paidAmount: 0 }, paymentLogs: [] }, { ...sale, status: 'cancelled' }, { ...sale, isGift: true }], 2026, 0, now);
  assert.equal(result.month, 100);
  assert.equal(result.pendingConfirmation, 100);
  assert.equal(salesGoalProgress([sale], 2026, 1, now).month, 0);
  assert.equal(salesGoalProgress([{ ...sale, isManual: true, payment: { paidAmount: 0 } }], 2026, 0, now).month, 100);
  assert.equal(salesGoalProgress([{ ...sale, payment: { paidAmount: 100, refundedAmount: 20 } }], 2026, 0, now).month, 80);
  const old = { ...sale, createdAt: '2025-12-31', payment: { paidAmount: 100, paidAt: '2026-01-20' } };
  assert.equal(salesGoalProgress([old], 2025, 11, now).year, 100);
  assert.equal(salesGoalProgress([old], 2026, 0, now).year, 0);
});

check('dashboard receives older orders by actual dates and keeps refund-only periods negative', () => {
  const range = dashboardPeriodRange(30, now);
  assert.deepEqual(range, { start: '2026-09-17', end: '2026-10-16' });
  assert.equal(dateMatchesRange(order.createdAt, range), false);
  assert.equal(summarizeReceipts([order], range).netReceived, 130);
  assert.equal(summarizeReceipts([order], { start: '2026-10-10', end: '2026-10-16' }).netReceived, -70);
});
check('calendar boundaries use Brazil and exclude future or missing dates', () => {
  const range = dashboardPeriodRange(7, new Date('2026-10-17T01:00:00Z'));
  assert.deepEqual(range, { start: '2026-10-10', end: '2026-10-16' });
  assert.equal(dateMatchesRange('2026-10-17', range), false);
  assert.equal(dateMatchesRange(undefined, range), false);
  assert.equal(dateMatchesRange({ seconds: Date.parse('2026-10-17T01:00:00Z') / 1000 }, range), true);
});
check('receivables independently filter creation, receipt and refund dates', () => {
  assert.equal(receivableMatchesPeriod(order, 'month', 'created', now), false);
  assert.equal(receivableMatchesPeriod(order, 'month', 'receipt', now), true);
  assert.equal(receivableMatchesPeriod({ ...order, createdAt: undefined }, 'month', 'created', now), false);
  assert.equal(receivableMatchesPeriod({ total: 300, createdAt: '2026-10-01', status: 'delivered' }, 'month', 'receipt', now), false);
});
check('open installments appear in their own due month and next seven days', () => {
  const due = { total: 300, createdAt: '2026-09-01', payment: { paidAmount: 100, installments: [
    { amount: 100, paidAmount: 100, dueDate: '2026-09-05', status: 'paid' },
    { amount: 100, dueDate: '2026-10-20', status: 'pending' },
    { amount: 100, dueDate: '2026-11-20', status: 'pending' }
  ] } };
  assert.equal(receivableMatchesPeriod(due, 'month', 'due', now), true);
  assert.equal(receivableMatchesPeriod(due, '7days', 'due', now), true);
  assert.equal(receivableMatchesPeriod(due, 'prev_month', 'due', now), false);
  assert.equal(receivableMatchesPeriod({ total: 100, payment: { paidAmount: 0 } }, 'month', 'due', now), false);
});
check('payable partial histories use ISO dates and deduplicate only stable events', () => {
  const settlement = { amount: 100, amountPaid: 100, status: 'paid', paymentHistory: [
    { ledgerEventId: 'sep', amount: 40, paymentDate: '2026-09-30' },
    { ledgerEventId: 'oct', amount: 60, paidAt: '2026-10-01T14:00:00Z' },
    { ledgerEventId: 'oct', amount: 60, paidAt: '2026-10-01T14:00:00Z' }
  ] };
  const result = summarizePayables([settlement], now);
  assert.equal(result.paidInPeriod, 60);
  assert.equal(result.totalPaid, 100);
  assert.equal(result.paymentsNeedingReview, 0);
});
check('missing and conflicting payable histories stay unallocated to a month', () => {
  const result = summarizePayables([
    { amount: 100, amountPaid: 100, status: 'paid', paymentDate: '2026-10-05', paymentHistory: [{ amount: 25, paymentDate: '2026-10-05' }] },
    { amount: 100, amountPaid: 100, status: 'paid', paymentHistory: [{ id: 'bad', amount: 110, paymentDate: '2026-10-05' }] }
  ], now);
  assert.equal(result.paidInPeriod, 25);
  assert.equal(result.undatedPaid, 175);
  assert.equal(result.paymentsNeedingReview, 2);
});
check('only overdue installments count as overdue; missing due dates are flagged separately', () => {
  const payable = { amount: 150, amountPaid: 50, amountOpen: 999, status: 'partially_paid', installments: [
    { amount: 50, paidAmount: 50, status: 'paid', dueDate: '2026-08-01' },
    { amount: 30, status: 'pending', dueDate: '2026-09-01' },
    { amount: 70, status: 'pending', dueDate: '2026-11-01' }
  ] };
  const missing = { amount: 20, amountPaid: 0, status: 'pending' };
  const result = summarizePayables([payable, missing, { amount: 50, amountPaid: 0, status: 'voided' }], now);
  assert.equal(result.totalOpen, 120);
  assert.equal(result.overdueAmount, 30);
  assert.equal(result.overdueCount, 1);
  assert.equal(result.upcomingAmount, 70);
  assert.equal(result.unscheduledOpen, 20);
  assert.equal(payableIsOverdue(payable, '2026-10-16'), true);
  assert.equal(payableIsOverdue(missing, '2026-10-16'), false);
});
check('payables use Brazilian month and day boundaries, not the device timezone', () => {
  const result = summarizePayables([{ amount: 10, amountPaid: 5, status: 'partially_paid', dueDate: '2026-09-30', paymentDate: '2026-10-01T01:00:00Z' }], new Date('2026-10-01T01:30:00Z'));
  assert.equal(result.dueTodayAmount, 5);
  assert.equal(result.overdueCount, 0);
  assert.equal(result.paidInPeriod, 5);
});
check('invalid aggregates and future payments never produce a false monthly total', () => {
  const result = summarizePayables([
    { amount: 10, amountPaid: 5, status: 'partially_paid', paymentDate: '2026-10-20' },
    { amount: 10, amountPaid: 20, status: 'paid' }
  ], now);
  assert.equal(result.paidInPeriod, 0);
  assert.equal(result.invalidAmountCount, 1);
});
check('campaign estimates exclude voided records and remain unavailable without a valid basis', () => {
  const result = estimateCampaignPerformance([{ id: 'active', amountSpent: 30, conversions: 2 }, { amountSpent: 999, conversions: 999, status: 'voided' }], 100);
  assert.equal(result.totalInvestido, 30);
  assert.equal(result.campaigns[0].estimatedValue, 200);
  assert.equal(result.campaigns[0].lucro, 170);
  assert.equal(estimateCampaignPerformance([{ amountSpent: 30, conversions: 2 }], 0).roas, null);
  assert.equal(estimateCampaignPerformance([{ amountSpent: 30 }], 100).campaigns[0].lucro, null);
  assert.equal(estimateCampaignPerformance([], 100).roas, null);
});
check('cash breakdown exposes included estimates and fuel reduces the recorded balance once', () => {
  const captured = { total: 100, payment: { paidAmount: 100, method: 'Cartão', gatewayFee: 5 }, shipping: 10 };
  const before = calculateCashForecast([captured], [], [], [], now);
  const after = calculateCashForecast([captured], [], [{ type: 'out', amount: 50, category: 'COMBUSTÍVEL', date: '2026-10-16' }], [], now);
  assert.equal(after.cashIn, 100);
  assert.equal(after.cashOut - before.cashOut, 50);
  assert.equal(before.currentCashBalance - after.currentCashBalance, 50);
  assert.equal(after.estimatedFeeAmount, 0);
  assert.equal(after.estimatedShippingAmount, 10);
  assert.equal(after.estimatedShippingOrders, 1);
  const known = calculateCashForecast([{ ...captured, shippingCost: 0 }], [], [], [], now);
  assert.equal(known.estimatedShippingOrders, 0);
  assert.equal(known.cashOut, 5);
});
check('automatic break-even never replaces a loss or missing sales with assumed positive values', () => {
  for (const margin of [-10, 0]) {
    const html = renderToStaticMarkup(React.createElement(BreakEvenView, { currentRevenue: 100, currentUnits: 1, averageContributionMarginRatio: margin, averageTicket: 100, fixedExpensesFromDRE: 20 }));
    assert.match(html, /Não há base para calcular/);
    assert.doesNotMatch(html, /Ponto de Equilíbrio Atingido!/);
  }
  const html = renderToStaticMarkup(React.createElement(BreakEvenView, { currentRevenue: 100, currentUnits: 1, averageContributionMarginRatio: 30, averageTicket: 100, fixedExpensesFromDRE: 20, costsEstimated: true }));
  assert.match(html, /Cálculo provisório/);
});

const db = requireIsolatedTestDb();
const { payAccountsPayableController, createAccountsPayableController } = await import('../server/controllers/admin.controller');
async function call(controller: any, id: string, body: any) {
  let status = 200, result: any;
  await controller({ params: { id }, body, headers: {}, user: { uid: 'management-test', email: 'test@example.test' } }, { status(code: number) { status = code; return this; }, json(data: any) { result = data; return this; } });
  return { status, result };
}
const ref = db.collection('financial_payables').doc('management-payable-test');
await ref.set({ amount: 100, amountPaid: 0, amountOpen: 100, description: 'Isolated fixture', dueDate: '2026-10-20', status: 'pending' });
const body = { amount: 20, paymentDate: '2026-10-16', idempotencyKey: 'management-settlement' };
assert.equal((await call(payAccountsPayableController, ref.id, body)).status, 200);
assert.equal((await call(payAccountsPayableController, ref.id, body)).result.idempotentReplay, true);
assert.equal((await call(payAccountsPayableController, ref.id, { ...body, amount: 30 })).status, 409);
assert.equal((await ref.get()).data().amountPaid, 20);
assert.equal((await ref.get()).data().paymentHistory.length, 1);
checks++; console.log('PASS retry settles once and changed payload conflicts without another movement');
assert.equal((await call(payAccountsPayableController, ref.id, { amount: 5, paymentDate: '2026-02-31', idempotencyKey: 'invalid-date' })).status, 400);
assert.equal((await call(createAccountsPayableController, '', { description: 'Isolated fixture', amount: 10, dueDate: '2026-02-31', idempotencyKey: 'invalid-due-date' })).status, 400);
assert.equal((await ref.get()).data().amountPaid, 20);
checks++; console.log('PASS invalid payment and due dates cannot write financial movements');
console.log(`Management finance: ${checks} scenarios passed. No production records accessed.`);

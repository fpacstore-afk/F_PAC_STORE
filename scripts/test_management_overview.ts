import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { isConfirmedReceivable, periodChange, previousDashboardRange, receiptTrend } from '../shared/managementOverview';
import { summarizePayables } from '../shared/financialDashboard';
import { calculateFinancialDRE } from '../src/utils/orderFinancial';
import { ManagementDashboardView } from '../src/components/management/ManagementDashboardView';

assert.deepEqual(previousDashboardRange({ start: '2026-10-01', end: '2026-10-07' }), { start: '2026-09-24', end: '2026-09-30' });
assert.deepEqual(previousDashboardRange({ start: '2026-01-01', end: '2026-01-30' }), { start: '2025-12-02', end: '2025-12-31' });
assert.equal(previousDashboardRange(null), null);
assert.equal(periodChange(150, 100), 50);
assert.equal(periodChange(70, 100), -30);
assert.equal(periodChange(50, 0), null, 'zero baseline must not produce infinite growth');
assert.equal(periodChange(-10, -20), null, 'negative receipt baselines are not comparable as growth');

const orders = [
  { total: 100, payment: { paidAmount: 100 }, paymentLogs: [{ id: 'p1', amount: 100, date: '2026-10-01' }] },
  { total: 40, payment: { paidAmount: 40 }, paymentLogs: [{ id: 'p2', amount: 40, date: '2026-09-24' }] },
  { total: 100, payment: { paidAmount: 100, refundedAmount: 30 }, paymentLogs: [{ id: 'p3', amount: 100, date: '2026-09-20' }], refundLogs: [{ id: 'r1', amount: 30, date: '2026-10-02' }] },
  { total: 50, payment: { paidAmount: 50 }, createdAt: '2026-10-01' }, // Undated receipt must not become a charted sale.
];
const range = { start: '2026-10-01', end: '2026-10-07' };
const trend = receiptTrend(orders, range, 7);
assert.equal(trend.length, 7);
assert.deepEqual(trend.slice(0, 2).map(bucket => [bucket.current, bucket.previous]), [[100, 40], [-30, 0]]);
assert.equal(trend.reduce((sum, bucket) => sum + bucket.current, 0), 70);
assert.equal(receiptTrend(orders, { start: '2026-09-08', end: '2026-10-07' }, 30).length, 5);
const all = receiptTrend(orders, null, null, new Date('2026-10-07T15:00:00Z'));
assert.equal(all.length, 12);
assert.equal(all.at(-1)?.current, 70);
assert.equal(all.at(-1)?.previous, null);

assert.equal(isConfirmedReceivable({ total: 100, paymentStatus: 'pending' }), false, 'unconfirmed online checkout is not accounts receivable');
assert.equal(isConfirmedReceivable({ total: 100, paymentStatus: 'pending', isManual: true }), true);
assert.equal(isConfirmedReceivable({ total: 100, paidAmount: 20, paymentStatus: 'partially_paid' }), true);
assert.equal(isConfirmedReceivable({ total: 100, paymentStatus: 'pending', productionStatus: 'estamparia' }), true);
assert.equal(isConfirmedReceivable({ total: 100, paymentStatus: 'cancelled', isManual: true }), false);
assert.equal(isConfirmedReceivable({ total: 100, isGift: true, isManual: true }), false);

const dashboard = {
  receipts: { received: 123.45, refunded: 0, netReceived: 123.45, receivedOrders: 1, ordersNeedingReview: 0, undatedReceived: 0, undatedRefunded: 0 },
  previousReceipts: { netReceived: 150 }, receiptsChange: -17.7, paidOrdersChange: -50,
  trend: [{ label: '01', start: '2026-10-01', end: '2026-10-01', current: 123.45, previous: 150 }],
  dre: calculateFinancialDRE([], [], [], [], []), operatingExpenses: 0, payableSummary: summarizePayables([]),
  grossRevenue: 123.45, averageReceipt: 123.45, paidOrders: 1, pendingPayments: 0, pendingAmount: 0,
  inProduction: 0, readyToShip: 0, lowStockVariants: 0, physicalStock: 0, stale30: 0, stale60: 0,
  soldUnits: 0, bestSellers: [], sessionsCount: 0, cartSessionsCount: 0, purchasesCount: 0,
  conversion: 0, abandonment: 0, newCustomers: 0, returningCustomers: 0, ltv: 0,
  traffic: [], trafficTotal: 0, integrity: { unlinked: [], unlinkedPhysical: 0 }, unresolvedPayments: 0,
  range, periodLabel: '7 dias',
};
const renderDashboard = (visible: boolean) => renderToStaticMarkup(createElement(MemoryRouter, null,
  createElement(ManagementDashboardView, {
    data: dashboard, period: '7d', onPeriodChange: () => {}, syncState: 'Atualizado',
    showFinancialValues: visible, productsCount: 1,
    formatMoney: amount => visible ? `R$ ${amount.toFixed(2).replace('.', ',')}` : 'R$ ••••••',
    formatPercent: value => visible ? `${value}%` : '••••••',
  })));
const hidden = renderDashboard(false);
assert.match(hidden, /Ative a visualização dos valores financeiros/);
assert.doesNotMatch(hidden, /R\$ 123,45|vs período anterior|Recebimento líquido por intervalo/);
const visible = renderDashboard(true);
assert.match(visible, /R\$ 123,45/);
assert.match(visible, /Recebimento líquido por intervalo/);
assert.match(visible, /-17\.7% vs período anterior/);

console.log('PASS: dashboard comparisons, dated chart, receivables and financial privacy rendering.');

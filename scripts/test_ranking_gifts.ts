import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  aggregateCustomerPurchases, buildCustomerIdentities, isGiftOrder,
  loyaltyPaidValue, normalizeCustomerPhone, orderDate, readCustomerAliases,
} from '../shared/customerPurchases';
import {
  giftMonthlyTrend, giftReportCsv, giftReportRows, giftSalesRatio,
  giftsInRange, summarizeGiftRows,
} from '../shared/giftReporting';
import { getOrderShippingFinances } from '../shared/orderFinancialCore';
import { getMultiRankings, processCustomerLoyaltyList, sanitizePublicName } from '../src/constants/loyaltyConfig';
import { buildPublicClubRanking } from '../server/services/club.service';
import { FinancialPrivacyProvider } from '../src/context/FinancialPrivacyContext';
import { GiftReportView } from '../src/components/management/AdminGifts';

// Synthetic contacts only. The bridge can arrive before or after either purchase.
const purchases = [
  { id: 'alex-1', customerName: 'Alex', customerPhone: '(47) 8765-4321', customerEmail: 'ALEX.OLD@example.invalid', paymentStatus: 'approved', total: 100.10, items: [{ name: 'Camisa', quantity: 2 }], createdAt: '2026-06-01T12:00:00Z' },
  { id: 'alex-2', customerName: 'Alex Dombrose', customerEmail: 'alex.new@example.invalid', payment: { status: 'partially_refunded', paidAmount: 200.20, refundedAmount: 50 }, amountPaid: 9000, items: [{ name: 'Camisa', quantity: 1 }], createdAt: { seconds: 1783080000 } },
  { id: 'contact-bridge', customerName: 'Alex Dombrose', customerEmail: 'Alex.New@EXAMPLE.invalid', customerPhone: '+55 (47) 98765-4321', paymentStatus: 'pending', total: 5000, items: [{ quantity: 20 }] },
  { id: 'gift-stale', customerName: 'Alex', customerPhone: '5547987654321', isGift: true, paymentStatus: 'approved', amountPaid: 10000, total: 10000, items: [{ quantity: 30 }] },
  { id: 'alex-cancelled', customerEmail: 'alex.old@example.invalid', status: 'cancelled', paymentStatus: 'approved', total: 9000 },
  { id: 'alex-refunded', customerEmail: 'alex.old@example.invalid', payment: { paidAmount: 500, refundedAmount: 500 }, total: 500 },
  { id: 'other-alex', customerName: 'Alex Dombrose', customerEmail: 'another.alex@example.invalid', total: 30, paymentStatus: 'approved', items: [{ quantity: 4 }] },
  { id: 'gift-only', customerName: 'Gift Recipient', customerEmail: 'gift@example.invalid', orderKind: 'gift', total: 8000, paidAmount: 8000, paymentStatus: 'approved', items: [{ quantity: 70 }] },
];
const snapshot = JSON.stringify(purchases);
for (const input of [purchases, [...purchases].reverse(), [purchases[2], ...purchases.slice(0, 2), ...purchases.slice(3)]]) {
  const customers = processCustomerLoyaltyList([...input, purchases[0]]);
  const alex = customers.find(customer => customer.email === 'alex.old@example.invalid' || customer.email === 'alex.new@example.invalid')!;
  assert.equal(customers.length, 2, 'names alone must not join different customers; gift-only people do not enter the ranking');
  assert.equal(alex.customerName, 'Alex Dombrose');
  assert.equal(alex.totalSpent, 250.30, 'sum canonical net paid amounts in cents, with partial refunds deducted');
  assert.equal(alex.orderCount, 2, 'gift/unpaid/cancelled/refunded orders and duplicate IDs give no purchases');
  assert.equal(alex.itemsBoughtCount, 3, 'gift/unpaid quantities give no units');
  assert.equal(alex.xp, 450, 'gift value, count and units cannot generate XP');
  assert.equal(alex.phone, '5547987654321', 'action contact retains the country code');
  assert.equal(alex.rankPositions.spent, 1);
  const publicRanking = buildPublicClubRanking(input);
  const internalRanking = getMultiRankings(input).compradores;
  assert.deepEqual(publicRanking.map(row => [row.publicName, row.tier.id]), internalRanking.map(row => [sanitizePublicName(row.customerName), row.tier.id]));
  for (const row of publicRanking) assert.deepEqual(Object.keys(row).sort(), ['position', 'publicName', 'tier']);
  assert.doesNotMatch(JSON.stringify(publicRanking), /example\.invalid|98765|netPaid|totalSpent|orderCount|identityAliases/);
}
assert.equal(JSON.stringify(purchases), snapshot, 'ranking is a projection; stored orders are never rewritten');
assert.equal(normalizeCustomerPhone('0055 47 98765 4321'), '47987654321');
assert.equal(normalizeCustomerPhone('47 8765 4321'), '47987654321');
assert.equal(normalizeCustomerPhone('47 3456 7890'), '4734567890', 'landlines do not acquire a ninth digit');
assert.equal(normalizeCustomerPhone('47999999999'), '', 'placeholder phone cannot join unrelated people');
assert.equal(normalizeCustomerPhone('4788888888'), '', 'legacy placeholder must be rejected before inserting a ninth digit');
assert.equal(normalizeCustomerPhone('88888888'), '');
assert.equal(readCustomerAliases({ userId: 'manual', customerPhone: '88888888', customerEmail: 'invalid', customerCpf: '00000000000' }).length, 0);
assert.equal(buildCustomerIdentities([{ customerName: 'Same' }, { customerName: 'Same' }]).length, 2);
assert.equal(buildCustomerIdentities([
  { id: 'a', customer: { uid: 'real-user', email: 'a@example.invalid' } },
  { id: 'b', userId: 'real-user', customerEmail: 'b@example.invalid' },
  { id: 'c', customerEmail: 'b@example.invalid', customerCpf: '123.456.789-01' },
  { id: 'd', customerInfo: { cpf: '12345678901', phone2: '47987654321' } },
]).length, 1, 'UID, email, CPF and secondary phone aliases bridge transitively');
assert.equal(aggregateCustomerPurchases([{ id: 'paid', total: 3, paidAmount: 3 }]).length, 1);
for (const gift of [{ isGift: true }, { orderKind: 'gift' }, { orderKind: 'BRINDE' }, { paymentMethod: 'BRINDE' }, { payment: { method: 'brinde' } }, { id: 'MANUAL-BRINDE-legacy' }]) {
  assert.equal(isGiftOrder(gift), true);
  assert.equal(loyaltyPaidValue({ total: 9999, amountPaid: 9999, paymentStatus: 'approved', ...gift }), 0);
}
assert.equal(isGiftOrder({ total: 0, customerName: 'Brinde Silva' }), false, 'neither a name nor a free order is proof of a gift classification');
assert.equal(loyaltyPaidValue({ paymentStatus: 'not_applicable', total: 100, amountPaid: 100 }), 0);
assert.equal(loyaltyPaidValue({ status: 'delivered', total: 100 }), 0, 'delivery alone is not proof of payment');
assert.equal(loyaltyPaidValue({ payment: { paidAmount: 25 }, total: 100 }), 25);
assert.equal(loyaltyPaidValue({ status: 'refused', paidAmount: 25 }), 0);
assert.equal(orderDate({}), null);
assert.equal(orderDate({ createdAt: 'invalid' }), null);
assert.equal(orderDate({ createdAt: { _seconds: 0 } })?.getTime(), 0);
const ties = [
  { id: 'later', customerName: 'Later Buyer', customerEmail: 'a@example.invalid', paidAmount: 50, createdAt: '2026-07-01' },
  { id: 'earlier', customerName: 'Earlier Buyer', customerEmail: 'z@example.invalid', paidAmount: 50, createdAt: '2026-06-01' },
];
assert.equal(buildPublicClubRanking(ties)[0].publicName, 'Earlier B.');
assert.equal(getMultiRankings(ties).compradores[0].customerName, 'Earlier Buyer', 'public and internal ranking must break ties identically');
const xpOrders = [
  { id: 'high-value', customerEmail: 'high@example.invalid', paidAmount: 200, items: [{ quantity: 1 }] },
  ...Array.from({ length: 3 }, (_, i) => ({ id: `repeat-${i}`, customerEmail: 'repeat@example.invalid', paidAmount: 50, items: [{ quantity: 2 }, { quantity: 9, isGift: true }] })),
];
const xp = getMultiRankings(xpOrders);
assert.equal(xp.compradores[0].email, 'high@example.invalid');
assert.equal(xp.xp[0].email, 'repeat@example.invalid');
assert.equal(xp.produtos[0].itemsBoughtCount, 6, 'individual gift lines give no purchased units');

const gifts: any[] = [
  { id: 'given', orderKind: 'gift', status: 'delivered', customerName: '=SUM(1;2)', createdAt: '2026-10-03T12:00:00Z', giftReason: 'Ação; de marca', items: [{ name: 'Camisa', color: 'Preto', size: 'G', quantity: 2, unitCostSnapshot: 15, totalCostSnapshot: 30, costCoverage: 'complete' }], giftCost: { knownCost: 30, unknownUnits: 0, coverage: 'complete' }, shippingFinances: { shippingCost: 5 } },
  { id: 'waiting', isGift: true, productionStatus: 'completed', createdAt: '2026-10-05T12:00:00Z', items: [{ name: 'Camisa', quantity: 3, unitCostSnapshot: 12, costCoverage: 'estimated' }], giftCost: { knownCost: 36, unknownUnits: 3, coverage: 'partial' } },
  { id: 'cancelled', isGift: true, status: 'cancelled', deliveredAt: '2026-10-01', createdAt: '2026-10-01T12:00:00Z', items: [{ quantity: 100, unitCostSnapshot: 100 }] },
  { id: 'catalog-estimate', isGift: true, shippingStatus: 'delivered', createdAt: '2026-10-01T01:00:00Z', items: [{ productId: 'sku', quantity: 2 }] },
  { id: 'unknown-date', isGift: true, status: 'delivered', items: [{ name: 'Custom', quantity: 1, costCoverage: 'unavailable' }], shippingCost: 0 },
  { id: 'no-items', isGift: true, status: 'delivered', giftCost: { knownCost: 7, unknownUnits: 0, coverage: 'complete' }, shippingCost: 0 },
];
const giftSnapshot = JSON.stringify(gifts);
const rows = giftReportRows([...gifts, gifts[0]], [{ id: 'sku', costPrice: 20 }]);
const byId = (id: string) => rows.find(row => row.id === id)!;
assert.equal(rows.length, gifts.length, 'duplicated order ID does not double gift costs');
assert.equal(byId('given').units, 2);
assert.equal(byId('given').knownCost, 35);
assert.equal(byId('given').estimatedCost, 0);
assert.equal(byId('waiting').state, 'open', 'finished production does not prove a gift was given');
assert.equal(byId('waiting').knownCost, 0, 'estimated order summary never becomes a confirmed cost');
assert.equal(byId('waiting').estimatedCost, 36);
assert.equal(byId('catalog-estimate').knownCost, 0, 'current catalog cannot be presented as a historical gift cost');
assert.equal(byId('catalog-estimate').estimatedCost, 40);
assert.equal(byId('catalog-estimate').pendingUnits, 2);
assert.equal(byId('catalog-estimate').date, '2026-09-30', 'period boundaries use São Paulo time');
assert.equal(byId('unknown-date').shippingMissing, false, 'explicit zero shipping is a recorded cost');
assert.equal(byId('no-items').missingItems, true);
assert.equal(byId('no-items').units, 0, 'missing lines must not invent a quantity');
const totals = summarizeGiftRows(rows);
assert.deepEqual(totals.delivered, { orders: 4, units: 5, knownCost: 42, estimatedCost: 40, pendingUnits: 3 });
assert.deepEqual(totals.open, { orders: 1, units: 3, knownCost: 0, estimatedCost: 36, pendingUnits: 3 });
assert.equal(totals.cancelledOrders, 1);
assert.equal(totals.active.units, 8);
assert.equal(totals.active.knownCost, 42, 'cancelled orders are retained in history but excluded from the accumulated cost');
assert.equal(totals.missingItems, 1);
assert.equal(totals.undated, 2);
assert.equal(totals.shippingMissing, 2);
assert.equal(JSON.stringify(gifts), giftSnapshot, 'gift report must not mutate orders, stocks or financial events');
const october = { start: '2026-10-01', end: '2026-10-31' };
assert.deepEqual(giftsInRange(rows, october).map(row => row.id).sort(), ['cancelled', 'given', 'waiting']);
assert.equal(giftsInRange(rows, null).length, 6);
assert.equal(giftSalesRatio([{ id: 'sale', paidAmount: 100, createdAt: '2026-10-02T12:00:00Z' }, { id: 'free', isGift: true, paidAmount: 10000, createdAt: '2026-10-02T12:00:00Z' }], 35, october), 35);
assert.equal(giftSalesRatio([], 35, null), null, 'empty revenue is not zero percent or infinity');
const trend = giftMonthlyTrend(rows, new Date('2026-10-24T12:00:00Z'));
assert.equal(trend.length, 12);
assert.deepEqual(trend.at(-1), { month: '2026-10', units: 2, cost: 35 });
assert.deepEqual(trend.at(-2), { month: '2026-09', units: 2, cost: 0 });
const csv = giftReportCsv(rows);
assert.equal(csv.charCodeAt(0), 0xfeff);
assert.match(csv, /"'=SUM\(1;2\)"/);
assert.match(csv, /"Ação; de marca"/);
assert.match(csv, /Não informado/);
const zero = giftReportRows([{ id: 'zero', isGift: true, items: [{ quantity: 1, unitCostSnapshot: 0 }], giftCost: { knownCost: 0, coverage: 'complete', unknownUnits: 0 }, shippingCost: 0 }])[0];
assert.equal(zero.knownCost, 0);
assert.equal(zero.pendingUnits, 0, 'a historical zero cost is different from an unknown cost');
const zeroQuantity = giftReportRows([{ id: 'none', isGift: true, items: [{ quantity: 0, costPrice: 30 }], shippingCost: 0 }])[0];
assert.equal(zeroQuantity.knownCost, 0);
assert.equal(zeroQuantity.missingItems, true);
const summaryWins = giftReportRows([{ id: 'old', isGift: true, items: [{ productId: 'sku', quantity: 2 }], giftCost: { knownCost: 18, unknownUnits: 0, coverage: 'complete' }, shippingCost: 0 }], [{ id: 'sku', costPrice: 50 }])[0];
assert.equal(summaryWins.knownCost, 18);
assert.equal(summaryWins.estimatedCost, 0);
assert.equal(summaryWins.costConflict, false, 'current catalog changes do not create historical conflicts');
assert.equal(giftReportRows([{ id: 'mismatch', isGift: true, items: [{ quantity: 1, unitCostSnapshot: 10 }], giftCost: { knownCost: 12, unknownUnits: 0, coverage: 'complete' } }])[0].costConflict, true);
assert.equal(getOrderShippingFinances({ shipping: { status: 'delivered' }, pricing: { shipping: 12 } }).shippingCharged.toFixed(2), '12.00', 'legacy shipping objects cannot crash the expanded order');

const renderReport = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(MemoryRouter, null,
  createElement(FinancialPrivacyProvider, null, createElement(GiftReportView, { orders: gifts, ...props }))));
const hidden = renderReport({});
assert.match(hidden, /Controle de brindes/);
assert.match(hidden, /5 un\./);
assert.match(hidden, /R\$ ••••••/);
assert.doesNotMatch(hidden, /R\$ 42,00|R\$ 35,00|Custo mensal registrado de brindes entregues/);
assert.match(hidden, /disabled=""[^>]*><svg[^]*?Exportar CSV/);
assert.match(hidden, /Custos e registros para conferir/);
assert.match(renderReport({ error: true }), /totais não estão disponíveis/);
assert.doesNotMatch(renderReport({ error: true }), /Brindes entregues/);
assert.match(renderReport({ loading: true }), /Carregando os pedidos/);
console.log('✅ Ranking e brindes: identidade, pagamentos líquidos, exclusão de brindes, custos históricos, filtros, CSV e privacidade.');

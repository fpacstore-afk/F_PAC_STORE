import assert from 'node:assert/strict';
import { companyExpenses } from '../shared/companyMovements';
import { auditExpenseSources } from '../shared/expenseAudit';
import { calculateRecordedCashFlow } from '../shared/cashFlow';
import { calculateFinancialDRE as clientDRE } from '../src/utils/orderFinancial';
import { calculateFinancialDRE as serverDRE } from '../server/utils/orderFinancial';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';

const db = requireIsolatedTestDb();
const { createFinancialExpenseController, updateFinancialExpenseController, voidFinancialExpenseController } = await import('../server/controllers/admin.controller');
const invoke = async (handler: any, body: any, params: any = {}) => {
  const res: any = { statusCode: 200, body: null, status(value: number) { this.statusCode = value; return this; }, json(value: any) { this.body = value; return this; } };
  await handler({ body, params, user: { uid: 'test-admin', email: 'test@example.invalid' }, ip: '127.0.0.1' } as any, res);
  return res;
};
const create = (body: any) => invoke(createFinancialExpenseController, {
  type: 'out', category: 'Combustível', amount: 50, date: '2026-10-15',
  description: 'Custo de combustível', paymentMethod: '', sourceType: 'quick_expense',
  preventSameDayDuplicate: true, ...body
});

const legacy = { id: 'legacy-dtf', type: 'out', category: 'DTF', amount: 70, date: '2026-10-14', description: 'Impressão DTF' };
const investment = { id: 'legacy-investment', title: 'Equipamento antigo', category: 'Máquinas', amount: 400, date: '2026-09-30', status: 'active' };
const traffic = { id: 'legacy-traffic', campaignName: 'Instagram', amountSpent: 300, date: '2026-09-30', status: 'active' };
await db.collection('financial_cashflow').doc(legacy.id).set(legacy);
await db.collection('financial_investments').doc(investment.id).set(investment);
await db.collection('financial_traffic').doc(traffic.id).set(traffic);
const before = companyExpenses([legacy], [investment], [traffic]);
assert.equal(before.length, 3);
assert.equal(before.reduce((total, item) => total + Number(item.amount), 0), 770);
assert.equal(auditExpenseSources([legacy], [investment], [traffic]).total, 770);
assert.equal(auditExpenseSources([legacy, { ...legacy, id: 'same-day-dtf' }], [investment], [traffic]).possibleDuplicates.length, 1);
assert.deepEqual(new Set(before.map(item => item.recordSource)), new Set(['financial_cashflow', 'financial_investments', 'financial_traffic']));
assert.equal(companyExpenses([{ ...legacy, sourceType: 'investment', sourceReferenceId: investment.id }], [investment], [traffic]).length, 2);
assert.equal(companyExpenses([{ ...legacy, sourceType: 'traffic', sourceReferenceId: traffic.id }], [investment], [traffic]).length, 2);
assert.equal(companyExpenses([{ ...legacy, status: 'voided' }], [investment], [traffic]).length, 2);
assert.equal(companyExpenses([{ ...legacy, type: 'in', category: 'Venda Manual' }], [investment], [traffic]).length, 2);
assert.equal(calculateRecordedCashFlow([], [{ ...legacy, sourceType: 'traffic', sourceReferenceId: traffic.id }], [traffic]).cashOut, 70);
const existingTraffic = await create({ category: 'Tráfego Pago', amount: 300, date: '2026-09-30', idempotencyKey: 'existing-traffic' });
assert.equal(existingTraffic.statusCode, 409, 'a quick expense must detect the existing campaign in its original collection');

const initial = await create({ idempotencyKey: 'fuel-2026-10-15' });
assert.equal(initial.statusCode, 200);
assert.equal(initial.body.entry.paymentMethod, '', 'blank payment method is preserved');
assert.equal(initial.body.entry.sourceType, 'quick_expense');
assert.equal((await create({ idempotencyKey: 'fuel-2026-10-15' })).body.idempotentReplay, true);
const duplicate = await create({ idempotencyKey: 'new-key-same-expense' });
assert.equal(duplicate.statusCode, 409);
assert.equal(duplicate.body.error, 'POSSIBLE_DUPLICATE');
assert.equal((await db.collection('financial_cashflow').get()).size, 2);
assert.equal((await db.collection('financial_events').get()).size, 1);
const secondRealPurchase = await create({ idempotencyKey: 'second-real-fuel', preventSameDayDuplicate: false, description: 'Outro abastecimento real' });
assert.equal(secondRealPurchase.statusCode, 200, 'a separately confirmed real purchase is permitted');
await invoke(voidFinancialExpenseController, { expenseId: secondRealPurchase.body.entry.id, idempotencyKey: 'void-confirmed-second', reason: 'Teste' });

const updated = await invoke(updateFinancialExpenseController, {
  amount: 55, date: '2026-10-15', description: 'Combustível para entrega', category: 'Combustível', paymentMethod: '',
  expectedUpdatedAt: initial.body.entry.updatedAt, idempotencyKey: 'edit-fuel-once'
}, { source: 'cashflow', id: initial.body.entry.id });
assert.equal(updated.statusCode, 200);
assert.equal(updated.body.entry.amount, 55);
assert.equal((await invoke(updateFinancialExpenseController, {
  amount: 55, date: '2026-10-15', description: 'Combustível para entrega', category: 'Combustível',
  idempotencyKey: 'edit-fuel-once'
}, { source: 'cashflow', id: initial.body.entry.id })).body.idempotentReplay, true);
const stale = await invoke(updateFinancialExpenseController, {
  amount: 60, date: '2026-10-15', description: 'Conflito', category: 'Combustível',
  expectedUpdatedAt: 'stale', idempotencyKey: 'edit-stale'
}, { source: 'cashflow', id: initial.body.entry.id });
assert.equal(stale.statusCode, 409);

const trafficUpdated = await invoke(updateFinancialExpenseController, {
  amount: 305, date: '2026-09-30', description: 'Instagram atualizado', category: 'Tráfego Pago',
  idempotencyKey: 'edit-old-traffic'
}, { source: 'traffic', id: traffic.id });
assert.equal(trafficUpdated.statusCode, 200);
assert.equal((await db.collection('financial_traffic').doc(traffic.id).get()).data()?.amountSpent, 305);
const investmentUpdated = await invoke(updateFinancialExpenseController, {
  amount: 401, date: '2026-09-30', description: 'Equipamento revisado', category: 'Máquinas',
  idempotencyKey: 'edit-old-investment'
}, { source: 'investments', id: investment.id });
assert.equal(investmentUpdated.statusCode, 200);
assert.equal((await db.collection('financial_investments').doc(investment.id).get()).data()?.amount, 401);

const activeCashflow = (await db.collection('financial_cashflow').get()).docs.map((item: any) => item.data());
const activeTraffic = (await db.collection('financial_traffic').get()).docs.map((item: any) => item.data());
const activeInvestments = (await db.collection('financial_investments').get()).docs.map((item: any) => item.data());
const after = companyExpenses(activeCashflow, activeInvestments, activeTraffic);
assert.equal(after.length, 4, 'voided row remains stored but leaves the active history');
assert.equal(after.reduce((total, item) => total + Number(item.amount), 0), 831);
assert.equal((await db.collection('financial_cashflow').get()).size, 3, 'original docs remain; no copied historical expenses');
for (const engine of [clientDRE, serverDRE]) {
  const summary = engine([], activeCashflow, activeInvestments, activeTraffic);
  assert.equal(summary.cashOut, 831);
  assert.equal(summary.marketingExpenses, 305);
}
const quickAds = { id: 'quick-ads', type: 'out', category: 'TRÁFEGO PAGO', amount: 20, date: '2026-10-15', description: 'Tráfego do dia' };
for (const engine of [clientDRE, serverDRE]) {
  const summary = engine([], [...activeCashflow, quickAds], activeInvestments, activeTraffic);
  assert.equal(summary.cashOut, 851);
  assert.equal(summary.marketingExpenses, 325);
  assert.equal(summary.operatingProfit, engine([], activeCashflow, activeInvestments, activeTraffic).operatingProfit - 20);
}
console.log('PASS expense center: original sources, no physical migration, duplicate gate, payment optional, edit, void, audit and financial totals');

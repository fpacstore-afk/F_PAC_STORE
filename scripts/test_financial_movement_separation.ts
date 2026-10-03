import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isSalesCashFlowEntry } from '../shared/financialMovementScope';
import { calculateRecordedCashFlow } from '../shared/cashFlow';
import { calculateCashForecast } from '../shared/cashForecast';
import { calculateFinancialDRE as clientDRE } from '../src/utils/orderFinancial';
import { calculateFinancialDRE as serverDRE } from '../server/utils/orderFinancial';
import { LegacySalesHistory } from '../src/components/admin/financial/LegacySalesHistory';
import { validateSheetSyncPayload } from '../server/utils/sheetValidation';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { companyMovements, companyMovementExportId } from '../shared/companyMovements';
import { saveCompanyMovementFromSheet } from '../server/services/companyMovementSheet.service';
import { readFileSync } from 'node:fs';

const oldSale = { id: 'old-sale', type: 'in', description: 'Venda Manual - Venda Direta - Alex', category: 'Venda Manual - Venda Direta', amount: 239.80, date: '2026-08-03' };
const order = { id: 'MANUAL-1', total: 239.80, payment: { paidAmount: 239.80, status: 'approved', gatewayFee: 0 }, items: [{ quantity: 1, unitCostSnapshot: 50 }], createdAt: '2026-08-03' };
const fuel = { id: 'fuel', type: 'out', category: 'Combustível', description: 'Visitas a clientes', amount: 50 };
const capital = { id: 'capital', type: 'in', category: 'Ajuste Caixa', description: 'Aporte do proprietário', amount: 100 };

assert.equal(isSalesCashFlowEntry(oldSale), true);
assert.equal(isSalesCashFlowEntry({ type: 'in', category: '  VENDAS_ONLINE  ' }), true);
assert.equal(isSalesCashFlowEntry({ type: 'in', orderId: order.id }), true);
assert.equal(isSalesCashFlowEntry({ type: 'in', sourceType: 'order_payment' }), true);
for (const company of [fuel, capital, { type: 'in', category: 'RECEITA', description: 'Reembolso recebido' }, { type: 'out', orderId: order.id, category: 'FRETE' }, { type: 'out', description: 'Comissão de venda' }]) {
  assert.equal(isSalesCashFlowEntry(company), false, 'company movements must remain separate, including order-related costs');
}

for (const engine of [clientDRE, serverDRE]) {
  const result = engine([order], [oldSale, fuel, capital]);
  assert.equal(result.totalPaid, 239.80);
  assert.equal(result.cashIn, 339.80);
  assert.equal(result.netCashFlow, 289.80);
  assert.equal(result.grossRevenue, 239.80, 'capital must not inflate sales');
  assert.equal(engine([{ ...order, payment: { ...order.payment, paidAmount: 100, status: 'partially_paid' } }], [oldSale]).cashIn, 100);
  assert.equal(engine([{ ...order, payment: { ...order.payment, refundedAmount: 239.80, status: 'refunded' } }], [oldSale]).netCashFlow, 0);
}
const forecast = calculateCashForecast([order], [], [oldSale, fuel, capital], [], new Date('2026-10-03T12:00:00Z'));
assert.equal(forecast.currentCashBalance, 289.80);
assert.equal(forecast.historicalSalesRecords, 1);
assert.equal(calculateCashForecast([], [], [{ ...oldSale, status: 'voided' }], []).historicalSalesRecords, 0);
assert.equal(calculateRecordedCashFlow([], [oldSale]).cashIn, 0, 'a historical sale without a verified order must not manufacture an authoritative receipt');
// Scope separation must never depend on matching a filtered subset of orders.
assert.equal(calculateRecordedCashFlow([], [oldSale, capital]).cashIn, 100);
assert.equal(oldSale.amount, 239.80, 'history is not mutated');
assert.equal(validateSheetSyncPayload({ cashflow: [oldSale, fuel] }).isValid, false);
assert.equal(validateSheetSyncPayload({ cashflow: [fuel, capital] }).isValid, true);

const history = renderToStaticMarkup(React.createElement(LegacySalesHistory, { entries: [oldSale] }));
assert.match(history, /Alex/);
assert.match(history, /03\/08\/2026/);
assert.match(history, /Sem vínculo automático/);
assert.doesNotMatch(history, /239[.,]80/, 'history respects financial privacy');
assert.match(history, /••••••/);

const structure = { id: 'structure-1', title: 'Prensa térmica', amount: 1500, date: '2026-08-01', category: 'equipamentos', status: 'active' };
const movements = companyMovements([oldSale, fuel, capital], [structure]);
assert.equal(movements.length, 3);
const equipment = movements.find(entry => entry.recordSource === 'financial_investments');
assert.equal(equipment.description, structure.title);
assert.equal(equipment.date, structure.date);
assert.equal(equipment.category, structure.category);
assert.equal(equipment.type, 'out');
assert.equal(companyMovements(movements, [structure]).length, 3, 'combining projected and original records is idempotent');
assert.equal(companyMovements([{ ...fuel, id: structure.id }], [structure]).length, 2, 'same ID in different collections does not merge unrelated records');
assert.equal(companyMovements([{ ...fuel, sourceType: 'investment', sourceReferenceId: structure.id }], [structure]).length, 1, 'an explicit mirror is counted once');
for (const engine of [clientDRE, serverDRE]) {
  const without = engine([order], [oldSale, fuel, capital]);
  const unified = engine([order], movements, [structure]);
  assert.equal(unified.cashOut, 1550);
  assert.equal(unified.netCashFlow, -1210.20);
  assert.equal(unified.capexInvestments, 1500);
  assert.equal(unified.operatingProfit, without.operatingProfit, 'structure classification survives the unified cash view');
  assert.equal(engine([], [], [{ ...structure, status: 'voided' }]).cashOut, 0);
  assert.equal(engine([], [{ type: 'out', category: 'EQUIPAMENTOS', amount: 200 }]).capexInvestments, 200);
}
assert.equal(calculateCashForecast([order], [], [oldSale, fuel, capital], [], new Date(), [structure]).currentCashBalance, -1210.20);
const financialUI = readFileSync('src/components/AdminFinancial.tsx', 'utf8');
assert.doesNotMatch(financialUI, /activeSubTab === 'investments'|id: 'investments'|handleAddInvestment|invForm/);
const tabNumbers = [...financialUI.matchAll(/id: '[a-z]+', label: '(\d+)\. /g)].map(match => Number(match[1]));
assert.deepEqual(tabNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

async function main() {
  const db = requireIsolatedTestDb();
  const { createFinancialExpenseController, getCashForecastController, voidFinancialInvestmentController } = await import('../server/controllers/admin.controller');
  const call = async (body: any) => {
    const res: any = { statusCode: 200, body: undefined, status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
    await createFinancialExpenseController({ body, user: { uid: 'isolated-test', email: 'isolated@example.invalid' }, ip: '127.0.0.1' } as any, res);
    return res;
  };
  for (const payload of [oldSale, { ...oldSale, category: 'Outros' }, { ...oldSale, category: 'RECEITA', type: 'out' }, { type: 'in', amount: 100, orderId: order.id, category: 'Outros' }]) {
    const response = await call({ ...payload, idempotencyKey: 'blocked-sale' });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'SALES_REQUIRE_ORDER');
  }
  assert.equal((await db.collection('financial_cashflow').get()).docs.length, 0, 'rejected sales cannot create cash movements');
  assert.equal((await db.collection('financial_events').get()).docs.length, 0, 'rejected sales cannot create ledger events');
  for (const entry of [fuel, capital, { id: 'domain', type: 'out', category: 'Domínio', amount: 40 }, { id: 'equipment', type: 'out', category: 'Equipamentos', amount: 200 }]) {
    const response = await call({ ...entry, idempotencyKey: `company-${entry.id}` });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.entry.amount, entry.amount);
    assert.equal(response.body.entry.type, entry.type);
    assert.equal(response.body.entry.category, entry.category.toUpperCase());
    assert.equal((await call({ ...entry, idempotencyKey: `company-${entry.id}` })).body.idempotentReplay, true);
  }
  await db.collection('financial_investments').doc(structure.id).set({ ...structure, actorEmail: 'isolated@example.invalid' });
  const exported = { ...equipment, id: companyMovementExportId(equipment), amount: 1600 };
  await saveCompanyMovementFromSheet(db, exported);
  await saveCompanyMovementFromSheet(db, exported);
  const updated = (await db.collection('financial_investments').doc(structure.id).get()).data();
  assert.equal(updated.amount, 1600);
  assert.equal(updated.actorEmail, 'isolated@example.invalid');
  assert.equal(updated.status, 'active');
  assert.equal((await db.collection('financial_cashflow').doc(exported.id).get()).exists, false);
  await assert.rejects(() => saveCompanyMovementFromSheet(db, { ...exported, id: 'investment:missing' }), /não encontrado/);
  const forecastResponse: any = { statusCode: 200, body: undefined, status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
  await getCashForecastController({} as any, forecastResponse);
  assert.equal(forecastResponse.body.summary.currentCashBalance, -1790, 'forecast API loads structure records alongside company cash movements');
  await voidFinancialInvestmentController({ body: { investmentId: structure.id, reason: 'Teste isolado', idempotencyKey: 'void-structure' }, user: { uid: 'isolated-test', email: 'isolated@example.invalid' } } as any, forecastResponse);
  assert.equal(forecastResponse.statusCode, 200);
  await getCashForecastController({} as any, forecastResponse);
  assert.equal(forecastResponse.body.summary.currentCashBalance, -190, 'voiding through the original record removes exactly one cash expense');
  console.log('PASS unified finance: sales, structure costs, partial receipts, refunds, forecasts, history, privacy, Sheets round-trip, categories, voids and tab removal');
}
main().catch(error => { console.error(error); process.exit(1); });

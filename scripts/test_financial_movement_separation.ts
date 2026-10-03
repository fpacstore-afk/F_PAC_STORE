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

async function main() {
  const db = requireIsolatedTestDb();
  const { createFinancialExpenseController } = await import('../server/controllers/admin.controller');
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
  for (const entry of [fuel, capital]) {
    const response = await call({ ...entry, idempotencyKey: `company-${entry.id}` });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.entry.amount, entry.amount);
    assert.equal(response.body.entry.type, entry.type);
    assert.equal((await call({ ...entry, idempotencyKey: `company-${entry.id}` })).body.idempotentReplay, true);
  }
  console.log('PASS sales/company separation: client, server, partial receipts, refunds, forecasts, history, privacy, Sheets and authenticated write path');
}
main().catch(error => { console.error(error); process.exit(1); });

import assert from 'node:assert/strict';
import { productionUnitCost, readProductionUsage, readStockComponent, summarizeValuation } from '../shared/stockValuation';
import { prepareStockProductCost } from '../server/controllers/stockComponents.controller';
import { INVENTORY_PURCHASE } from '../shared/cashFlowOptions';
import { calculateFinancialDRE as client } from '../src/utils/orderFinancial';
import { calculateFinancialDRE as server } from '../server/utils/orderFinancial';

const sharedRow = { reference: '', category: 'Embalagens', unit: 'un.', type: 'component' as const };
assert.deepEqual(summarizeValuation([
  { ...sharedRow, id: 'bag', name: 'Sacola', quantity: 10, unitCostCents: 125, costStatus: 'recorded' },
  { ...sharedRow, id: 'print', name: 'DTF', quantity: 1.25, unitCostCents: 520, costStatus: 'partial' },
  { ...sharedRow, id: 'label', name: 'Etiqueta', quantity: 3, unitCostCents: null, costStatus: 'missing' }
]), { recordedCents: 1250, partialCents: 650, missing: 1, partial: 1, subtotalCents: 1900 });
assert.equal(productionUnitCost([{ unitCostCents: 999, usage: 0.25 }, { unitCostCents: 2800, usage: 1 }]), 3050);
assert.equal(productionUnitCost([{ unitCostCents: null, usage: 1 }]), null);
assert.equal(readStockComponent({ name: ' Sacola ', category: 'Embalagens', unit: 'un.', quantity: 5, unitCostCents: 0, archived: false }).unitCostCents, 0);
assert.throws(() => readStockComponent({ name: 'Sacola', category: 'Embalagens', unit: 'un.', quantity: 5, archived: false }));
const usage = [{ kind: 'base', reference: 'shirt', quantity: '1' }, { kind: 'component', reference: 'print', quantity: '0,25' }];
assert.throws(() => readProductionUsage({ usage: [...usage, usage[0]], extraCents: 100 }));

const fixtures: Record<string, any> = {
  'stock_components/print': { unitCostCents: 800, archived: false },
  'product_costs/shirt': { costPrice: 28 }
};
const db = { collection: (key: string) => ({ doc: (id: string) => key + '/' + id }) };
const tx = { get: async (ref: string) => ({ data: () => fixtures[ref] }) };
assert.equal((await prepareStockProductCost(db, tx, 'finished', 31, { usage, extraCents: 100 })).unitCost, 31);
fixtures['stock_components/print'].unitCostCents = 1200;
await assert.rejects(prepareStockProductCost(db, tx, 'finished', 31, { usage, extraCents: 100 }), /mudou/);
await assert.rejects(prepareStockProductCost(db, tx, 'shirt', 32, { usage, extraCents: 100 }), /diferente/);

const sales = [{
  total: 100, otherVariableCosts: 2, payment: { paidAmount: 100, gatewayFee: 4 },
  items: [{ quantity: 1, unitCostSnapshot: 30, costCoverage: 'complete' }],
}];
const cash = [
  { type: 'out', category: INVENTORY_PURCHASE, amount: 50, date: '2026-11-01' },
  { type: 'out', category: 'Despesa fixa', amount: 10, date: '2026-11-01' },
];
const result = client(sales, cash);
assert.deepEqual(result, server(sales, cash));
assert.equal(result.operatingProfit, 54);
assert.equal(result.fixedExpenses, 10);
assert.equal(result.inventoryPurchases, 50);
assert.equal(result.cashOut, 64);
console.log('PASS valuation, incomplete costs, concurrent source-price validation, and inventory purchase in cash flow only.');

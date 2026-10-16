import assert from 'node:assert/strict';
import express from 'express';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';
import { calculateQuote, emptyCatalog } from '../shared/pricingWorkbench.ts';
import { createQuoteOrderService } from '../server/services/quoteOrder.service.ts';
import { createPricingRouter } from '../server/controllers/pricingWorkbench.ts';
import { authenticateAdmin, resetAuthForTesting, setAuthDbForTesting, setAuthTokenVerifierForTesting } from '../server/middleware/auth.middleware.ts';
import { editManualCustomOrderController } from '../server/controllers/manualOrderEdit.controller.ts';
import { manualOrderEditLines } from '../shared/manualCustomOrderEditing.ts';

const db = requireIsolatedTestDb();
const catalog: any = { ...emptyCatalog(), entries: [{ id: 'shirt', kind: 'product', name: 'Camiseta tradicional', supplier: 'Fornecedor privado', active: true, status: 'Confirmado', source: { kind: 'app' } }, { id: 'print', kind: 'stamp', name: 'Logo da equipe', method: 'fixed', cost: 4, active: true, status: 'Confirmado', source: { kind: 'app' } }] };
const item = { id: 'one', productId: 'shirt', line: 'Tradicional', color: 'Preto', size: 'M', quantity: 2, prints: [{ stampId: 'print', width: 10, height: 10, position: 'Peito esquerdo', manualCost: null }], extraIds: [], margin: .2, fee: 0, manualGarmentCost: 20, manualSalePrice: 89.9, description: 'Mesmo desenho nas duas peças' };
const input = { customer: 'Cliente isolado', contact: 'contato@example.invalid', items: [item, { ...item, id: 'two', size: 'G', quantity: 1 }], discount: 9.7, surcharge: 5.25, shipping: 11.4, shippingLabel: 'Entrega combinada', payment: 'PIX a combinar', deadline: 'A combinar', validUntil: '2027-01-01', notes: 'Conferir endereço antes de enviar.' };
const result = calculateQuote(input, catalog);
assert.deepEqual(result.errors, []);
const quote = { input, result, catalog, catalogVersion: 7, status: 'finalized', version: 3 };
await db.collection('pricing_workbench_quotes').doc('test-quote').set(quote);
const preserved = (await db.collection('pricing_workbench_quotes').doc('test-quote').get()).data();
const convert = createQuoteOrderService(() => db);
await assert.rejects(() => convert('test-quote', 3, false, 'tester'), /Confirme/);
await assert.rejects(() => convert('test-quote', 2, true, 'tester'), (error: any) => error.status === 409);
const [first, second] = await Promise.all([convert('test-quote', 3, true, 'tester'), convert('test-quote', 3, true, 'tester')]);
assert.equal(first.orderId, second.orderId);
assert.equal(second.alreadyCreated, true);
assert.equal((await db.collection('orders').get()).docs.length, 1, 'retries must not create duplicate orders');
const order = (await db.collection('orders').doc(first.orderId).get()).data();
assert.equal(order.total, result.total);
assert.equal(order.surcharge, 5.25);
assert.deepEqual(order.items.map((i: any) => [i.size, i.quantity, i.price]), [['M', 2, 89.9], ['G', 1, 89.9]]);
assert.equal(order.customerEmail, input.contact);
assert.equal(order.customProduction.groups[0].artworks[0].name, 'Logo da equipe');
assert.equal(order.customProduction.groups[0].artworks[0].location, 'Peito esquerdo');
assert.equal(order.customProduction.groups[0].artworks[0].source, 'own_art', 'pricing service IDs are not physical catalog stamp IDs');
assert.equal(order.amountPaid, 0); assert.equal(order.payment.paidAmount, 0); assert.equal(order.balanceDue, result.total);
assert.equal(order.stockControl, 'no_move'); assert.equal(order.productionStatus, 'waiting');
assert.equal((await db.collection('financial_events').get()).docs.length, 0);
assert.equal((await db.collection('inventory_movements').get()).docs.length, 0);
const savedQuote = (await db.collection('pricing_workbench_quotes').doc('test-quote').get()).data();
for (const key of ['input', 'result', 'catalog', 'version', 'status']) assert.deepEqual(savedQuote[key], preserved[key], 'conversion must preserve the finalized proposal');
await db.collection('pricing_workbench').doc('catalog').set({ catalog: emptyCatalog(), version: 99 });
assert.equal((await convert('test-quote', 3, true, 'tester')).orderId, first.orderId, 'current price changes must not reprice approved snapshots');
await db.collection('pricing_workbench_quotes').doc('draft').set({ ...quote, status: 'draft' });
await assert.rejects(() => convert('draft', 3, true, 'tester'), /Finalize/);
await db.collection('pricing_workbench_quotes').doc('unknown-cost').set({ ...quote, result: { ...result, items: result.items.map(row => ({ ...row, cost: null, totalCost: null })) } });
const unknown = await convert('unknown-cost', 3, true, 'tester');
const unknownOrder = (await db.collection('orders').doc(unknown.orderId).get()).data();
assert.equal(unknownOrder.items[0].costCoverage, 'unavailable');
assert.equal('unitCostSnapshot' in unknownOrder.items[0], false, 'unknown costs cannot become zero');
const edited = manualOrderEditLines(order); edited[0].quantity = 3;
const response: any = { statusCode: 200, status(n: number) { this.statusCode = n; return this; }, json(value: any) { this.body = value; return this; } };
await editManualCustomOrderController({ params: { orderId: first.orderId }, body: { lines: edited, expectedRevision: 0 }, user: { uid: 'tester' } } as any, response);
assert.equal(response.statusCode, 200, JSON.stringify(response.body));
assert.equal(response.body.total, Math.round((4 * 89.9 + 11.4 + 5.25 - 9.7) * 100) / 100, 'later edits preserve approved surcharges, freight and discount');

setAuthDbForTesting(db); setAuthTokenVerifierForTesting(async token => ({ uid: token, admin: token === 'manager' } as any));
const app = express(); app.use(express.json()); app.use('/pricing', authenticateAdmin, createPricingRouter(() => db));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.on('listening', resolve));
try {
  const base = `http://127.0.0.1:${(server.address() as any).port}/pricing/quotes/test-quote/order`;
  for (const token of ['', 'customer']) {
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ expectedVersion: 3, confirmCustomerApproval: true }) });
    assert.ok([401, 403].includes(response.status), 'only an authenticated admin can convert quotes');
  }
  const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer manager' }, body: JSON.stringify({ expectedVersion: 3, confirmCustomerApproval: true }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).orderId, first.orderId);
} finally { await new Promise<void>(resolve => server.close(() => resolve())); resetAuthForTesting(); }
console.log('Quote conversion preserves commercial snapshots, costs, idempotency and financial separation; authenticated API checks passed.');

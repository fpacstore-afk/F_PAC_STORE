import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { Catalog, ItemInput, QuoteInput, calculateItem, calculateQuote, customerHtml, dtfCost, emptyCatalog, quoteExtraQuantities, validateCatalog, validateQuote } from '../shared/pricingWorkbench.ts';
import { createPricingRouter } from '../server/controllers/pricingWorkbench.ts';
import { createInMemoryDb } from '../server/firebase.ts';
import { authenticateAdmin, resetAuthForTesting, setAuthDbForTesting, setAuthTokenVerifierForTesting } from '../server/middleware/auth.middleware.ts';

const source = { kind: 'app' as const };
const catalog: Catalog = { ...emptyCatalog(), entries: [
  { id: 'p', kind: 'product', name: 'Peça teste', supplier: 'Fornecedor interno', code: 'A', active: true, status: 'Confirmado', source, colors: ['Preto','Branco'], sizes: ['P','M'], restrictions: [{ colors: ['Branco'], sizes: ['P'] }] },
  ...[1,10].map((minQty, i) => ({ id: `price${i}`, kind: 'price' as const, name: 'Cotação', product: 'Peça teste', supplier: 'Fornecedor interno', minQty, cost: i ? 14 : 20, date: '2025-01-01', status: 'Confirmado', active: true, source })),
  { id: 'dtf', kind: 'stamp', name: 'DTF', width: 10, height: 20, method: 'dtf', active: true, status: 'Confirmado', source },
  { id: 'labor', kind: 'extra', name: 'Mão de obra', cost: null, basis: 'unit', active: true, status: 'Preencher', source },
  { id: 'setup', kind: 'extra', name: 'Preparação', cost: 10, basis: 'order', active: true, status: 'Confirmado', source },
  { id: 'unit-pack', kind: 'extra', name: 'Material sintético por peça', cost: .125, basis: 'unit', active: true, status: 'Confirmado', source },
  { id: 'quote-pack', kind: 'extra', name: 'Material sintético por pedido', cost: 4.375, basis: 'quote', active: true, status: 'Confirmado', source }
], rules: { ...emptyCatalog().rules, sheetWidth: 40, sheetHeight: 60, sheetCost: 12, gap: 0, margin: .2, fee: .05, staleDays: 30, dtfStatus: 'Confirmado' } };
const item: ItemInput = { id: 'i', productId: 'p', line: '', color: 'Preto', size: 'M', quantity: 10, prints: [{ stampId: 'dtf', width: 10, height: 20, position: 'Peito', manualCost: null }], extraIds: ['labor'], margin: .2, fee: .05, manualGarmentCost: null, manualSalePrice: null, description: '' };
const input: QuoteInput = { customer: 'Cliente teste', contact: '', items: [item], discount: 0, surcharge: 0, shipping: 0, shippingLabel: 'Retirada', payment: '', deadline: '', validUntil: '', notes: '' };
let count = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) { await fn(); count++; console.log(`PASS ${name}`); }
await test('DTF chooses rotated grid, rejects unknowns and oversize', () => {
  assert.deepEqual(dtfCost(10,20,catalog.rules), { count: 12, unitCost: 1 });
  assert.deepEqual(dtfCost(30,20,catalog.rules), { count: 4, unitCost: 3 });
  assert.equal(dtfCost(80,80,catalog.rules), null);
  assert.equal(dtfCost(10,20,{ ...catalog.rules, gap: null }), null);
});
await test('missing labor is not zero; explicit zero restores complete calculation', () => {
  const r = calculateItem(item,catalog); assert.equal(r.cost,null); assert.equal(r.suggested,null); assert.equal(r.margin,null); assert.equal(r.knownSubtotal,15);
  const c = structuredClone(catalog); c.entries.find(e => e.id === 'labor')!.cost = 0;
  const complete = calculateItem(item,c); assert.equal(complete.cost,15); assert.equal(complete.sale,20); assert.equal(complete.total,200); assert.equal(complete.margin,.2);
});
await test('supplier tiers, lines, manual overrides and order extras remain distinct', () => {
  assert.equal(calculateItem({ ...item, quantity: 9, extraIds: [] },catalog).cost,21);
  assert.equal(calculateItem({ ...item, line: 'Outra', extraIds: [] },catalog).cost,null);
  const r = calculateItem({ ...item, extraIds: ['setup'], manualGarmentCost: 30 },catalog); assert.equal(r.cost,32);
  assert.equal(calculateItem({ ...item, manualSalePrice: 50 },catalog).margin,null);
  assert.equal(calculateItem({ ...item, extraIds: [], fee: null },catalog).suggested,null);
});
await test('availability restrictions, inactive data and duplicate tiers are guarded', () => {
  assert.ok(calculateItem({ ...item, color: 'Branco' },catalog).errors.length);
  assert.ok(calculateItem({ ...item, color: 'Azul' },catalog).errors.length);
  assert.ok(calculateItem({ ...item, quantity: 1.5 },catalog).errors.length);
  const c = structuredClone(catalog); c.entries[0].active = false; assert.ok(calculateItem(item,c).errors.length);
  const duplicate = { ...catalog, entries: [...catalog.entries, { ...catalog.entries[2], id: 'other' }] }; assert.throws(() => validateCatalog(duplicate), /duplicado/);
  assert.equal(calculateItem({ ...item, extraIds: [] },duplicate).cost,null);
});
await test('schema rejects malformed values and missing discount; dates warn', () => {
  validateCatalog(catalog); validateQuote(input);
  assert.throws(() => validateQuote({ ...input, discount: null }));
  assert.throws(() => validateCatalog({ ...catalog, entries: [{ ...catalog.entries[0], colors: 'Preto' }] }));
  assert.throws(() => validateCatalog({ ...catalog, entries: [{ ...catalog.entries[1], cost: -1 }] }));
  assert.ok(calculateItem(item,catalog,'2026-01-01').warnings.some(w => w.includes('atualizada')));
});
const ready: QuoteInput = { ...input, items: [{ ...item, extraIds: [] }], shipping: 5, discount: 3, surcharge: 2 };
const packedItem: ItemInput = { ...item, quantity: 1, prints: [], extraIds: ['unit-pack','quote-pack'], manualGarmentCost: 0, margin: 0, fee: 0 };
const mixedPack: QuoteInput = { ...input, items: [packedItem, { ...packedItem, id: 'second', size: 'P', quantity: 3 }] };
await test('whole-order packaging is charged once across lines without rounding internal costs', () => {
  const result = calculateQuote(mixedPack,catalog);
  assert.equal(result.items.reduce((n,r) => n + r.totalCost!,0),4.875);
  assert.equal(result.items[0].cost,1.21875);
  assert.equal(result.items[1].cost,1.21875);
  assert.equal(result.items[0].suggested,1.22);
  assert.match(result.items[0].components[2].source,/rateado em 4 peças/);
  const preview = calculateItem(packedItem,catalog,undefined,quoteExtraQuantities(mixedPack.items,catalog));
  assert.equal(preview.cost,result.items[0].cost);
  const duplicated = calculateQuote({ ...mixedPack, items: [...mixedPack.items, { ...packedItem, id: 'third', quantity: 4 }] },catalog);
  assert.equal(duplicated.items.reduce((n,r) => n + r.totalCost!,0),5.375);
  assert.equal(calculateQuote({ ...mixedPack, items: [packedItem] },catalog).items[0].cost,4.5);
  const unselected = calculateQuote({ ...mixedPack, items: mixedPack.items.map(i => ({ ...i, extraIds: ['unit-pack'] })) },catalog);
  assert.equal(unselected.items.reduce((n,r) => n + r.totalCost!,0),.5);
  const oneSelected = calculateQuote({ ...mixedPack, items: [packedItem, { ...mixedPack.items[1], extraIds: ['unit-pack'] }] },catalog);
  assert.equal(oneSelected.items.reduce((n,r) => n + r.totalCost!,0),4.875);
  const pending = structuredClone(catalog); pending.entries.find(e => e.id === 'quote-pack')!.cost = null;
  assert.ok(calculateQuote(mixedPack,pending).items.every(i => i.cost === null));
  assert.equal(calculateItem({ ...packedItem, extraIds: ['setup'], quantity: 2 },catalog).cost,5);
  validateCatalog(catalog);
});
await test('quote arithmetic and public projection do not expose internal data or HTML', () => {
  const r = calculateQuote(ready,catalog); assert.equal(r.total,204);
  assert.equal(calculateQuote({ ...ready, shipping: null },catalog).total,null);
  assert.equal(calculateQuote({ ...ready, discount: 999 },catalog).total,null);
  const html = customerHtml({ ...ready, customer: '<script>alert(1)</script>' },r,'Q');
  assert.doesNotMatch(html, /Fornecedor interno|Mão de obra|Cotação|<script>|sheetCost|unitCost|custo|margem/i);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /204,00/);
});

const db = createInMemoryDb(); setAuthDbForTesting(db);
// The shared memory DB has no ordering API; implement the Firestore query shape for route tests.
const collection = db.collection.bind(db);
db.collection = ((name: string) => {
  const col: any = collection(name);
  col.orderBy = (field: string, direction: string) => ({ limit: (n: number) => ({ get: async () => {
    const data = await col.get(); data.docs.sort((a: any,b: any) => String(a.data()[field]).localeCompare(String(b.data()[field])) * (direction === 'desc' ? -1 : 1));
    data.docs = data.docs.slice(0,n); return data;
  } }) });
  return col;
}) as any;
setAuthTokenVerifierForTesting(async token => ({ uid: token, admin: token === 'manager' } as any));
const app = express(); app.use(express.json({ limit: '2mb' })); app.use('/pricing', authenticateAdmin, createPricingRouter(() => db));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/pricing`;
async function request(path = '', method = 'GET', body?: any, token: string | null = 'manager') { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, data: await r.json(), headers: r.headers }; }
try {
  await test('every private route requires admin and disables caching', async () => {
    for (const [path,method] of [['','GET'],['/import','POST'],['/catalog','PUT'],['/history','GET'],['/history/test','GET'],['/archive/test','GET'],['/quotes/test','GET'],['/quotes/test','PUT']]) {
      assert.equal((await request(path,method,method === 'GET' ? undefined : {},null)).status,401); assert.equal((await request(path,method,method === 'GET' ? undefined : {},'customer')).status,403);
    }
    assert.equal((await request()).headers.get('cache-control'),'private, no-store');
    assert.match(readFileSync('server.ts','utf8'), /adminApiLimiter, authenticateAdmin, createPricingRouter\(\)/);
  });
  await test('import preserves raw formulas once; edits use optimistic versions and snapshots', async () => {
    const imported = await request('/import','POST',{ catalog, archive: { rows: [[{ formula: '=A1' }]] } }); assert.equal(imported.status,200);
    assert.equal((await request('/import','POST',{ catalog })).status,409);
    assert.deepEqual((await request(`/archive/${imported.data.importId}`)).data, { rows: [[{ formula: '=A1' }]] });
    assert.equal((await request('/catalog','PUT',{ catalog, expectedVersion: 0 })).status,409);
    const updated = await request('/catalog','PUT',{ catalog, expectedVersion: 1 }); assert.equal(updated.status,200); assert.equal(updated.data.version,2);
  });
  await test('server recalculates quotes, preserves drafts, final versions and history', async () => {
    const draft = await request('/quotes/q','PUT',{ input, expectedVersion: 0, catalogVersion: 2, status: 'draft', result: { total: 999 } }); assert.equal(draft.status,200); assert.equal(draft.data.result.total,null);
    assert.equal((await request('/quotes/q','PUT',{ input: ready, expectedVersion: 0, catalogVersion: 2, status: 'draft' })).status,409);
    assert.equal((await request('/quotes/q','PUT',{ input: ready, expectedVersion: 1, catalogVersion: 1, status: 'draft' })).status,409);
    assert.equal((await request('/quotes/q','PUT',{ input, expectedVersion: 1, catalogVersion: 2, status: 'finalized' })).status,400);
    const final = await request('/quotes/q','PUT',{ input: ready, expectedVersion: 1, catalogVersion: 2, status: 'finalized' }); assert.equal(final.status,200); assert.equal(final.data.result.total,204);
    assert.equal((await request('/quotes/q','PUT',{ input: ready, expectedVersion: 2, catalogVersion: 2, status: 'draft' })).status,409);
    assert.equal((await request('/quotes/copy','PUT',{ input: ready, expectedVersion: 0, catalogVersion: 2, status: 'draft' })).status,200);
    assert.equal((await request('/quotes/q')).data.result.total,204);
    const events = (await request('/history')).data; assert.equal(events.length,5);
    const original = events.find((e: any) => e.type === 'quote' && e.version === 1 && e.quoteId === 'q'); assert.ok(original);
    assert.equal((await request(`/history/${original.id}`)).data.result.total,null);
    assert.equal((await request()).data.quotes.length,2);
  });
  await test('API preserves the once-per-order result across mixed sizes', async () => {
    const saved = await request('/quotes/packaging','PUT',{ input: mixedPack, expectedVersion: 0, catalogVersion: 2, status: 'draft' });
    assert.equal(saved.status,200);
    assert.equal(saved.data.result.items.reduce((n: number,r: any) => n + r.totalCost,0),4.875);
    const persisted = await request('/quotes/packaging');
    assert.deepEqual(persisted.data.result,saved.data.result);
  });
} finally { await new Promise<void>(resolve => server.close(() => resolve())); resetAuthForTesting(); }
console.log(`${count} pricing workbench regressions passed.`);

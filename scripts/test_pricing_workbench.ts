import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { packDtf, type DtfRectangle } from '../shared/dtfPacking.ts';
import { Catalog, ItemInput, QuoteInput, calculateItem, calculateQuote, customerHtml, dtfCost, dtfPurchase, emptyCatalog, quoteExtraQuantities, validateCatalog, validateQuote } from '../shared/pricingWorkbench.ts';
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
// Synthetic prices and boundaries; actual supplier rates stay in the private catalog.
const tierCatalog: Catalog = { ...catalog, rules: { ...catalog.rules, sheetHeight: 100, sheetCost: 20, dtfTiers: [{ minMeters: 8, pricePerMeter: 14 }, { minMeters: 4, pricePerMeter: 18 }] } };
await test('DTF rounds whole meters and applies inclusive purchase tiers, not garment quantities', () => {
  for (const [quantity, meters, rate] of [[60,3,20],[61,4,18],[140,7,18],[141,8,14],[180,9,14]]) {
    const q = { ...ready, items: [{ ...ready.items[0], quantity }] };
    const result = calculateQuote(q,tierCatalog);
    assert.equal(result.dtf.purchaseMeters,meters);
    assert.equal(result.dtf.pricePerMeter,rate);
    assert.equal(result.dtf.purchaseCost,meters * rate);
    assert.equal(result.items[0].components[1].unitCost,rate / 20);
  }
  // A 60 cm sheet becomes a whole-meter purchase, but cost still uses consumed material.
  assert.equal(dtfPurchase([item],catalog).purchaseMeters,1);
  assert.equal(calculateItem({ ...item, extraIds: [] },catalog).components[1].unitCost,1);
});
await test('DTF aggregates matching and rotated dimensions across sizes before rounding', () => {
  const first = { ...ready.items[0], quantity: 21 };
  const second = { ...first, id: 'second', size: 'P', quantity: 19, prints: [{ ...first.prints[0], width: 20, height: 10 }] };
  const result = calculateQuote({ ...ready, items: [first,second] },tierCatalog);
  assert.equal(result.dtf.estimatedMeters,2);
  const multiple = { ...first, quantity: 1, prints: [first.prints[0],{ ...first.prints[0], width: 30, height: 30 }] };
  assert.equal(dtfPurchase([multiple],tierCatalog).estimatedMeters,1);
  assert.equal(dtfPurchase([{ ...first, quantity: 11, prints: [first.prints[0],first.prints[0]] }],tierCatalog).estimatedMeters,2);
});
await test('manual purchase overrides and fixed/manual stamp costs remain distinct', () => {
  const q = { ...ready, dtfPurchaseMeters: 8 };
  const result = calculateQuote(q,tierCatalog);
  assert.equal(result.dtf.estimatedMeters,1); assert.equal(result.dtf.purchaseMeters,8);
  assert.equal(result.items[0].components[1].unitCost,.7);
  assert.equal(calculateQuote({ ...q, dtfPurchaseMeters: null },tierCatalog).dtf.pricePerMeter,20);
  assert.ok(dtfPurchase([{ ...item, quantity: 100 }],tierCatalog,1).warnings.some(w => w.includes('menor')));
  const manual = { ...item, prints: [{ ...item.prints[0], manualCost: 0 }] };
  assert.equal(dtfPurchase([manual],tierCatalog).hasDtf,false);
  const fixed = { ...tierCatalog, entries: tierCatalog.entries.map(e => e.id === 'dtf' ? { ...e, method: 'fixed' as const, cost: 3 } : e) };
  assert.equal(dtfPurchase([item],fixed,8).hasDtf,false);
  assert.equal(calculateItem({ ...item, extraIds: [] },fixed).components[1].unitCost,3);
  const preview = calculateItem(ready.items[0],tierCatalog,undefined,{},dtfPurchase(q.items,tierCatalog,8));
  assert.equal(preview.cost,result.items[0].cost);
  assert.doesNotMatch(customerHtml(q,result,'DTF-Q'),/purchaseMeters|pricePerMeter|compra|faixa|Fornecedor interno/);
});
await test('DTF rejects fractional overrides and malformed tiers; missing estimates stay unknown', () => {
  for (const meters of [0,-1,1.5,100001,NaN]) {
    assert.throws(() => validateQuote({ ...ready, dtfPurchaseMeters: meters }));
    assert.equal(calculateQuote({ ...ready, dtfPurchaseMeters: meters },tierCatalog).total,null);
    assert.equal(dtfPurchase([item],tierCatalog,meters).sheetCost,null);
  }
  for (const tiers of [[{minMeters: 1.5,pricePerMeter: 8}],[{minMeters: 4,pricePerMeter: -1}],[{minMeters:4,pricePerMeter:18},{minMeters:4,pricePerMeter:12}],{}]) {
    assert.throws(() => validateCatalog({ ...tierCatalog, rules: { ...tierCatalog.rules, dtfTiers: tiers } }));
  }
  validateCatalog(tierCatalog);
  const missing = { ...item, prints: [{ ...item.prints[0], width: null }] };
  assert.equal(dtfPurchase([missing],tierCatalog).estimatedMeters,null);
  assert.equal(dtfPurchase([missing],tierCatalog).pricePerMeter,null);
  assert.equal(dtfPurchase([{ ...item, prints: [{ ...item.prints[0], width: 999 }] }],tierCatalog).estimatedMeters,null);
});
const packedItem: ItemInput = { ...item, quantity: 1, prints: [], extraIds: ['unit-pack','quote-pack'], manualGarmentCost: 0, margin: 0, fee: 0 };
const fullDtf: Catalog = { ...tierCatalog, rules: { ...tierCatalog.rules, sheetWidth: 59, gap: .5, dtfCostBasis: 'purchase' } };
const mixedPrints = [[30,40],[2,3],[6,8]].map(([width,height]) => ({ ...item.prints[0], width, height }));
await test('mixed sizes share the same sheet and purchase is allocated once across artwork', () => {
  const mixed = { ...ready, items: [{ ...ready.items[0], quantity: 1, prints: mixedPrints }] };
  const result = calculateQuote(mixed,fullDtf);
  assert.equal(result.dtf.estimatedMeters,1); assert.equal(result.dtf.purchaseCost,20);
  assert.ok(Math.abs(result.items[0].components.slice(1).reduce((s,c)=>s+c.unitCost!,0)-20)<1e-9);
  const four = calculateQuote({ ...mixed, items: [{ ...mixed.items[0], quantity: 4, prints: [mixedPrints[0]] }] },fullDtf);
  assert.equal(four.dtf.estimatedMeters,2); assert.equal(four.dtf.purchaseCost,40);
  assert.equal(four.items[0].components[1].unitCost,10);
  const override = calculateQuote({ ...mixed, dtfPurchaseMeters: 8 },fullDtf);
  assert.equal(override.dtf.purchaseCost,112);
  assert.ok(Math.abs(override.items[0].components.slice(1).reduce((s,c)=>s+c.unitCost!,0)-112)<1e-9);
  const separate = calculateQuote({ ...mixed, items: [{...mixed.items[0],prints:[mixedPrints[0]],quantity:2},{...mixed.items[0],id:'other-size',size:'P',prints:mixedPrints.slice(1),quantity:3}] },fullDtf);
  const allocated=separate.items.reduce((sum,r,i)=>sum+r.components.slice(1).reduce((s,c)=>s+c.unitCost!,0)*[2,3][i],0);
  assert.ok(Math.abs(allocated-separate.dtf.purchaseCost!)<1e-9);
  assert.throws(()=>validateCatalog({...fullDtf,rules:{...fullDtf.rules,dtfCostBasis:'unknown'}}));
});
await test('missing production position does not hide known costs or invent missing amounts', () => {
  const noPosition = { ...ready.items[0], quantity:1, prints:mixedPrints.map(p=>({...p,position:''})) };
  const result = calculateItem(noPosition,fullDtf);
  assert.ok(Math.abs(result.cost!-40)<1e-9); assert.ok(Math.abs(result.totalCost!-40)<1e-9);
  assert.equal(result.suggested,53.33); assert.equal(result.total,53.33);
  assert.equal(result.errors.length,3); assert.deepEqual(result.costPending,[]);
  assert.equal(calculateQuote({...ready,items:[noPosition]},fullDtf).total,null);
  const absent=calculateItem({...noPosition,extraIds:['labor']},fullDtf);
  assert.equal(absent.cost,null); assert.deepEqual(absent.costPending,['Mão de obra']);
  assert.equal(calculateItem({...noPosition,fee:null},fullDtf).suggested,null);
});
await test('packing is physical, respects gaps and rotation, and preserves every copy', () => {
  const cases: DtfRectangle[][] = [mixedPrints.map(p=>({width:p.width!,height:p.height!,quantity:1})),[{width:30,height:40,quantity:4}],[{width:40,height:60,quantity:2}],[{width:59,height:100,quantity:1}],[{width:29.5,height:100,quantity:2}]];
  let seed=73; const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let n=0;n<30;n++) cases.push(Array.from({length:5},()=>({width:1+Math.floor(random()*40),height:1+Math.floor(random()*50),quantity:1+Math.floor(random()*8)})));
  for(const shapes of cases) {
    const packed=packDtf(shapes,59,100,.5)!; assert.ok(packed); assert.ok(packed.previewComplete);
    const expected=new Map<string,number>(), actual=new Map<string,number>();
    const key=(w:number,h:number)=>[w,h].sort((a,b)=>a-b).join('x');
    shapes.forEach(s=>expected.set(key(s.width,s.height),(expected.get(key(s.width,s.height))||0)+s.quantity));
    for(const layout of packed.layouts) for(const [i,r] of layout.rectangles.entries()) {
      assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=59+1e-8&&r.y+r.height<=100+1e-8);
      actual.set(key(r.width,r.height),(actual.get(key(r.width,r.height))||0)+layout.repeat);
      for(const other of layout.rectangles.slice(i+1)) assert.ok(r.x+r.width+.5<=other.x+1e-8||other.x+other.width+.5<=r.x+1e-8||r.y+r.height+.5<=other.y+1e-8||other.y+other.height+.5<=r.y+1e-8);
    }
    assert.deepEqual([...actual].sort(),[...expected].sort());
    assert.deepEqual(packDtf([...shapes].reverse(),59,100,.5),packed);
  }
  assert.equal(packDtf(cases[2],59,100,.5)!.sheets,2); // Area alone would incorrectly say one.
  assert.equal(packDtf(cases[3],59,100,.5)!.sheets,1); // No unnecessary outer margin.
  assert.equal(packDtf(cases[4],59,100,.5)!.sheets,2); // Gap makes two side-by-side impossible.
  assert.equal(packDtf([{width:30,height:40,quantity:100000}],59,100,.5)!.sheets,33334);
  assert.equal(packDtf([{width:60,height:101,quantity:1}],59,100,.5),null);
});
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
  await test('API calculates and persists DTF tiers without changing historical snapshots', async () => {
    assert.equal((await request('/catalog','PUT',{catalog: tierCatalog,expectedVersion:2})).status,200);
    const saved = await request('/quotes/dtf','PUT',{ input: { ...ready, dtfPurchaseMeters: 8 }, expectedVersion: 0, catalogVersion: 3, status: 'finalized', result: { total: 999 } });
    assert.equal(saved.status,200); assert.equal(saved.data.result.dtf.pricePerMeter,14);
    assert.equal(saved.data.result.items[0].components[1].unitCost,.7);
    const next = { ...tierCatalog, rules: { ...tierCatalog.rules, dtfTiers: [] } };
    assert.equal((await request('/catalog','PUT',{catalog: next,expectedVersion:3})).status,200);
    assert.deepEqual((await request('/quotes/dtf')).data.result,saved.data.result);
    assert.equal((await request('/quotes/q')).data.result.total,204);
    const copy = await request('/quotes/dtf-copy','PUT',{ input: { ...ready, dtfPurchaseMeters: 8 }, expectedVersion: 0, catalogVersion: 4, status: 'draft' });
    assert.equal(copy.data.result.dtf.pricePerMeter,20);
    assert.equal((await request('/quotes/bad-dtf','PUT',{ input: { ...ready, dtfPurchaseMeters: 1.5 }, expectedVersion: 0, catalogVersion: 4, status: 'draft' })).status,400);
  });
  await test('API preserves mixed packing and full purchase allocation; missing position blocks finalization only', async () => {
    assert.equal((await request('/catalog','PUT',{catalog:fullDtf,expectedVersion:4})).status,200);
    const mixed = {...ready,items:[{...ready.items[0],quantity:1,prints:mixedPrints.map(p=>({...p,position:''}))}]};
    const draft = await request('/quotes/mixed-layout','PUT',{input:mixed,expectedVersion:0,catalogVersion:5,status:'draft'});
    assert.equal(draft.status,200); assert.equal(draft.data.result.dtf.estimatedMeters,1);
    assert.ok(Math.abs(draft.data.result.items[0].cost-40)<1e-9);
    assert.equal(draft.data.result.total,null);
    assert.equal((await request('/quotes/mixed-layout','PUT',{input:mixed,expectedVersion:1,catalogVersion:5,status:'finalized'})).status,400);
    mixed.items[0].prints=mixedPrints;
    const final=await request('/quotes/mixed-layout','PUT',{input:mixed,expectedVersion:1,catalogVersion:5,status:'finalized'});
    assert.equal(final.status,200); assert.equal(final.data.result.dtf.costBasis,'purchase');
    assert.ok(final.data.result.dtf.packing.layouts.length);
    assert.deepEqual((await request('/quotes/mixed-layout')).data.result,final.data.result);
    assert.doesNotMatch(customerHtml(mixed,final.data.result,'MIXED'),/packing|rectangles|rateio|purchaseCost|Fornecedor interno/);
  });
} finally { await new Promise<void>(resolve => server.close(() => resolve())); resetAuthForTesting(); }
console.log(`${count} pricing workbench regressions passed.`);

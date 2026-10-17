import assert from 'node:assert/strict';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { catalogProductCost } from '../shared/catalogProductCost';
import { completeMissingProductCosts } from '../server/services/catalogProductCosts.service';
import { emptyCatalog, type Catalog, type Entry } from '../shared/pricingWorkbench';

const entry = (id: string, kind: Entry['kind'], rest: Partial<Entry>): Entry => ({ id, kind, name: id, active: true, status: 'Confirmado', source: { kind: 'app' }, ...rest });
const catalog: Catalog = { ...emptyCatalog(), entries: [
  entry('traditional', 'price', { product: 'Camiseta Suedine', supplier: 'Zimm', cost: 30, minQty: 1 }),
  entry('bulk', 'price', { product: 'Camiseta Suedine', supplier: 'Zimm', cost: 20, minQty: 10 }),
  entry('different', 'price', { product: 'Camiseta Suedine', supplier: 'Tiggas', cost: 8, minQty: 1 }),
  entry('crop', 'price', { product: 'Boxy Feminina', supplier: 'Tiggas', cost: 25, minQty: 1 }),
  entry('short', 'price', { product: 'Linho Cargo', supplier: 'Tiggas', cost: 40, minQty: 1 }),
  entry('oversized', 'price', { product: 'Oversized Suedine', supplier: 'Tiggas', cost: 50, minQty: 1 }),
  entry('pack', 'extra', { name: 'Embalagem', cost: 1, basis: 'unit', defaultForOrders: true }),
  entry('order', 'extra', { name: 'Preparação', cost: 12, basis: 'quote', defaultForOrders: true })
], rules: { ...emptyCatalog().rules, sheetWidth: 50, sheetHeight: 100, sheetCost: 50, gap: 0, dtfStatus: 'Confirmado' } };
const product = { name: 'Camiseta', baseModel: 'Tradicional Suedine', productFinish: 'printed', collection: 'MARK', stampIds: ['a'], stampSizes: ['10x10'], stampIdsByColor: { preto: ['a','b'] }, stampSizesByColor: { preto: ['10x10','20x20'] } };
const cost = catalogProductCost(catalog, product)!;
assert.equal(cost.unitCost, 37); // 30 + max(1, 1+5) DTF + embalagem 1.
assert.equal(cost.coverage, 'partial');
assert.equal(cost.components?.length, 3);
assert.match(cost.pendingComponents!.join(' '), /Mão de obra|mão de obra/);
assert.ok(!cost.components!.some(c=>c.name==='Preparação'), 'Custo por pedido não se repete por produto.');
assert.equal(catalogProductCost(catalog, { ...product, productFinish: 'plain' })?.unitCost, 30);
assert.equal(catalogProductCost(catalog, { ...product, baseModel: 'Cropped Oversized Feminino', productFinish: 'plain' })?.unitCost, 25);
assert.equal(catalogProductCost(catalog, { ...product, baseModel: 'Bermuda Linho Cargo', productFinish: 'plain' })?.unitCost, 40);
assert.equal(catalogProductCost(catalog, { ...product, baseModel: 'Modelo desconhecido' }), null);
const invalid = catalogProductCost(catalog, { ...product, stampSizes: ['999x999'], stampIdsByColor: {} })!;
assert.equal(invalid.unitCost, 31);
assert.match(invalid.pendingComponents!.join(' '), /medida válida/);
const db = requireIsolatedTestDb();
await db.collection('pricing_workbench').doc('catalog').set({ catalog, version: 7 });
await db.collection('products').doc('missing').set(product);
await db.collection('products').doc('recorded').set(product);
await db.collection('product_costs').doc('recorded').set({ costPrice: 12.34, costCalculation: { mode: 'manual' } });
await db.collection('products').doc('legacy').set({ ...product, costPrice: 22.22 });
await db.collection('products').doc('zero').set({ ...product, productFinish: 'plain' });
await db.collection('product_costs').doc('zero').set({ costPrice: 0 });
await db.collection('products').doc('unknown').set({ ...product, baseModel: 'Sem referência' });
await db.collection('orders').doc('old-order').set({ items: [{ unitCostSnapshot: 9.87 }], amountPaid: 10 });
await db.collection('inventory').doc('stock').set({ quantity: 3 });
const summary = await completeMissingProductCosts(db, 'test-admin');
assert.equal(summary.updated, 2);
assert.equal(summary.preserved, 2);
assert.equal(summary.unresolved.length, 1);
assert.equal((await db.collection('product_costs').doc('recorded').get()).data().costPrice, 12.34);
assert.equal((await db.collection('products').doc('legacy').get()).data().costPrice, 22.22);
const migrated = (await db.collection('product_costs').doc('missing').get()).data();
assert.equal(migrated.costPrice, 37);
assert.equal(migrated.costCalculation.catalogVersion, 7);
assert.equal(migrated.costCalculation.coverage, 'partial');
assert.equal((await db.collection('product_cost_events').get()).docs.length, 2);
assert.equal((await db.collection('orders').doc('old-order').get()).data().items[0].unitCostSnapshot, 9.87);
assert.equal((await db.collection('inventory').doc('stock').get()).data().quantity, 3);
const repeated = await completeMissingProductCosts(db, 'test-admin');
assert.equal(repeated.updated, 0);
assert.equal((await db.collection('product_cost_events').get()).docs.length, 2);
console.log('PASS: model/supplier matching, no unearned volume discounts, largest color recipe, pending costs, private audited zero-cost completion, preserved records and repeat safety.');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';
import { projectPublicProduct, projectPublicAvailability, loadPublicCatalog, createPublicCatalogLoader } from '../server/services/publicCatalog.service.ts';
import { cartAvailabilityIssues } from '../shared/cartAvailability.ts';
import { calculateOrderPricing } from '../server/services/pricing.service.ts';

const db = requireIsolatedTestDb();
let passed = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) { await fn(); passed++; console.log(`PASS ${name}`); }
await test('recursive allowlist excludes legacy costs and supplier metadata', () => {
  const result = projectPublicProduct('visible', {
    name: 'Camiseta', status: 'active', costPrice: 35, supplier: 'private', price: 99,
    colors: [{ name: 'Preto', cost: 44, images: ['/shirt.webp', { cost: 10 }] }],
    variants: [{ sku: 'shirt-M', size: 'M', costPrice: 30, reserved: 7, price: 99 }],
    sizeChart: [{ size: 'M', width: '50', internalNote: 'private' }],
    images: ['/main.webp'], tags: ['street', { token: 'secret' }],
  });
  assert.doesNotMatch(JSON.stringify(result), /cost|supplier|reserved|private|token|secret|internalNote/);
  assert.equal(result?.price, 99);
  assert.deepEqual(result?.colors, [{ name: 'Preto', images: ['/shirt.webp'] }]);
});
await test('draft, inactive and archived products never enter public feed', () => {
  for (const status of ['draft','hidden','inactive','archived','Rascunho','Inativa','Arquivado','unknown']) assert.equal(projectPublicProduct('private', { status }), null);
  assert.equal(projectPublicProduct('plain', { status: 'Ativa', productFinish: 'plain' }), null);
  assert.ok(projectPublicProduct('legacy', { name: 'Legacy active' }));
});
await test('stock-editor legacy active label is published with the corrected line and model', async () => {
  const database = (await import('../server/firebase.ts')).createInMemoryDb();
  await database.collection('products').doc('mark-logo').set({ slug: 'mark-logo', name: 'Logo', status: 'Ativa', collection: 'MARK', baseModel: 'Oversized Premium 240GSM', costPrice: 35 });
  await database.collection('inventory').doc('mark-logo').set({ variants: { Preto_M: { stock: 4, reserved: 0 } } });
  const catalog = await loadPublicCatalog(database);
  assert.equal(catalog.products.length, 1);
  assert.equal(catalog.products[0]?.status, 'active');
  assert.equal(catalog.products[0]?.collection, 'MARK');
  assert.equal(catalog.products[0]?.baseModel, 'Oversized Premium 240GSM');
  assert.equal(catalog.availability['mark-logo'].availableQuantity, 4);
  assert.doesNotMatch(JSON.stringify(catalog), /costPrice|reserved|physicalQuantity/);
  assert.equal((await database.collection('products').doc('mark-logo').get()).data()?.status, 'Ativa', 'public reads must not rewrite stored products');
});
await test('available stock derives from physical minus reservations; stale mirrors ignored', () => {
  const projected = projectPublicAvailability({ supplier: 'private', variants: { Preto_M: { physicalQuantity: 10, reservedQuantity: 3, availableQuantity: 999, cost: 22 }, Preto_G: { physicalQuantity: 3, reservedQuantity: 5 }, Preto_P: { stock: 8, reserved: 1, active: false } } });
  assert.equal(projected.availableQuantity, 7);
  assert.deepEqual(projected.variants.Preto_M, { available: true, availableQuantity: 7 });
  assert.equal(projected.variants.Preto_G.availableQuantity, 0);
  assert.equal(projected.variants.Preto_P.availableQuantity, 0);
  assert.doesNotMatch(JSON.stringify(projected), /physical|reserved|supplier|cost/);
});
await test('disabled inventory and empty inventory are not purchasable', () => {
  assert.equal(projectPublicAvailability({ available: false, variants: { Preto_M: { stock: 20 } } }).availableQuantity, 0);
  assert.equal(projectPublicAvailability({ stock: 500 }).availableQuantity, 0);
});
await test('catalog joins only relevant inventory and never leaks private records', async () => {
  await db.collection('products').doc('shirt').set({ slug: 'shirt', status: 'active', parentSlug: 'physical-shirt', price: 99 });
  await db.collection('products').doc('draft').set({ slug: 'draft', status: 'draft', costPrice: 35 });
  await db.collection('inventory').doc('physical-shirt').set({ variants: { Preto_M: { stock: 5, reserved: 2 } } });
  await db.collection('inventory').doc('draft').set({ supplier: 'private', variants: { Preto_M: { stock: 9 } } });
  const data = await loadPublicCatalog(db);
  assert.equal(data.products.length, 1); assert.equal(data.availability['physical-shirt'].availableQuantity, 3);
  assert.equal(data.availability.draft, undefined);
});
await test('concurrent catalog reads share cache; expiry and failure allow retry', async () => {
  let count = 0, clock = 0;
  const load = createPublicCatalogLoader(async () => { count++; return { products: [], count: 0, availability: {} }; }, () => clock);
  await Promise.all([load(), load(), load()]); assert.equal(count, 1);
  clock = 31_000; await load(); assert.equal(count, 2);
  let attempts = 0;
  const recovering = createPublicCatalogLoader(async () => { if (attempts++ === 0) throw new Error('offline'); return { products: [], count: 0, availability: {} }; });
  await assert.rejects(recovering()); await recovering(); assert.equal(attempts, 2);
});
await test('pricing accepts recovered active products and still rejects unpublished products', async () => {
  const ref = db.collection('products').doc('recovered-mark');
  const input = { items: [{ slug: 'recovered-mark', quantity: 1, color: 'Preto', size: 'M' }], customerInfo: { cep: '89200000' } };
  try {
    await ref.set({ slug: 'recovered-mark', name: 'Logo MARK', status: 'Ativa', collection: 'MARK', price: 99.9 });
    const result = await calculateOrderPricing(input);
    assert.equal(result.pricing.subtotal, 99.9);
    for (const status of ['Rascunho', 'inactive', 'archived', 'unknown']) {
      await ref.update({ status });
      await assert.rejects(calculateOrderPricing(input), /não está disponível no catálogo/);
    }
    await ref.update({ status: 'Ativa', productFinish: 'plain' });
    await assert.rejects(calculateOrderPricing(input), /não está disponível no catálogo/);
  } finally { await ref.delete(); }
});
await test('cart sums duplicate variants and never mutates selections', () => {
  const items = [{ id: 'a', parentSlug: 'physical', color: 'Preto', size: 'M', name: 'A', quantity: 2 }, { id: 'b', parentSlug: 'physical', color: 'Preto', size: 'M', name: 'B', quantity: 2 }];
  const before = JSON.stringify(items);
  const issues = cartAvailabilityIssues(items, (id, variant) => { assert.equal(id, 'physical'); assert.equal(variant, 'Preto_M'); return 3; });
  assert.equal(issues.length, 1); assert.equal(issues[0].quantity, 4); assert.equal(JSON.stringify(items), before);
});
await test('public pages no longer subscribe to raw product documents', () => {
  for (const path of ['src/components/Navbar.tsx', ...['Home','HomeV2','Catalog','CatalogStorefront','ProductCategories','ProductCategoryPage','ProductDetail','ModelStamps','PrimeCustomStudio','PrimeCustomApproved'].map(x => `src/pages/${x}.tsx`)]) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /collection\(db, ['"]products['"]\)/, path);
  }
  assert.doesNotMatch(readFileSync('src/pages/Bag.tsx','utf8'), /esgotou e foi removido|removeItem\(i\)/);
});
console.log(`${passed} public catalog security regressions passed.`);

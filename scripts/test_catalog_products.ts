import assert from 'node:assert/strict';
import {
  applyCatalogImageFallbacks,
  buildSellableCatalog,
  filterCatalogByCategory,
  getCatalogCategories,
  isSellableCatalogProduct,
  mergeCatalogProducts,
  normalizeCatalogProduct,
  resolveCatalogProduct,
} from '../src/lib/catalogProducts';
import {
  buildVariantSku,
  getActiveProductCategories,
  getProductCategory,
  normalizeProductCategory,
  productMatchesCategory,
} from '../src/lib/productTaxonomy';

const staticProducts = [
  { id: 'base-force', slug: 'force', name: 'FORCE', status: 'active', images: ['/force.jpg'], colors: [{ name: 'Preto', hex: '#000' }], sizes: ['P', 'M'], price: 89.9 },
  { id: 'force-logo', slug: 'force-logo', parentSlug: 'force', name: 'Force Logo', status: 'active', images: ['/logo.jpg'], colors: [{ name: 'Preto', hex: '#000' }], sizes: ['P', 'M'], price: 89.9 },
];

const dynamicProducts = [
  { id: 'base-force', slug: 'force', name: 'FORCE', status: 'inactive', images: ['/force-admin.jpg'], colors: [{ name: 'Off White', hex: '#faf9f6' }], sizes: ['G'], price: '99.90' },
  { id: 'force-logo', slug: 'force-logo', parentSlug: 'force', name: 'Force Logo Atualizada', status: 'active', images: [], price: '94.90' },
  { id: 'mark-new', slug: 'mark-new', parentSlug: 'mark', name: 'Mark Nova', status: 'active', images: ['/mark.jpg'], price: '109.90' },
];

const merged = mergeCatalogProducts(staticProducts, dynamicProducts);
assert.equal(merged.length, 3);
assert.equal(merged.find(p => p.slug === 'force')?.status, 'inactive');
assert.deepEqual(merged.find(p => p.slug === 'force')?.colors, [{ name: 'Off White', hex: '#faf9f6' }]);
assert.deepEqual(merged.find(p => p.slug === 'force')?.sizes, ['G']);
assert.equal(merged.find(p => p.slug === 'force')?.price, 99.9);
assert.equal(merged.find(p => p.slug === 'force-logo')?.name, 'Force Logo Atualizada');
assert.equal(merged.find(p => p.slug === 'mark-new')?.price, 109.9);

const fallbackApplied = applyCatalogImageFallbacks([
  { slug: 'force', images: ['/force-admin.jpg'] },
  { slug: 'force-logo', parentSlug: 'force', images: [] },
]);
assert.deepEqual(fallbackApplied[1].images, ['/force-admin.jpg']);

const normalized = normalizeCatalogProduct({ slug: 'x', images: ['/x.jpg', ''], colors: [{ name: 'Preto' }], sizes: ['M', ''], price: '79.90', promotionalPrice: '69.90' });
assert.deepEqual(normalized.images, ['/x.jpg']);
assert.deepEqual(normalized.sizes, ['M']);
assert.equal(normalized.price, 79.9);
assert.equal(normalized.promotionalPrice, 69.9);
assert.equal(normalized.productType, 'tshirt');

assert.equal(isSellableCatalogProduct({ slug: 'force', status: 'active', images: ['/x.jpg'] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'produto-teste-pagamento', status: 'active', images: ['/x.jpg'] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'force-logo', status: 'inactive', images: ['/x.jpg'] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'force-logo', status: 'active', images: [] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'force-logo', status: 'active', images: ['/x.jpg'] }), true);

const sellable = buildSellableCatalog(
  [
    { id: 'force', slug: 'force', name: 'FORCE', status: 'active', images: ['/force-parent.jpg'], price: 89.9 },
    { id: 'child', slug: 'force-child', parentSlug: 'force', name: 'Child', status: 'active', images: ['/static-child.jpg'], colors: [{ name: 'Preto' }], sizes: ['M'], price: 89.9 },
  ],
  [
    { id: 'child', slug: 'force-child', parentSlug: 'force', status: 'active', images: [], colors: [{ name: 'Off White' }], sizes: ['G'], price: '99.90' },
    { id: 'hidden', slug: 'hidden-product', status: 'hidden', images: ['/hidden.jpg'] },
    { id: 'test', slug: 'produto-teste', status: 'active', images: ['/test.jpg'] },
  ],
);
assert.equal(sellable.length, 1);
assert.equal(sellable[0].slug, 'force-child');
assert.deepEqual(sellable[0].images, ['/force-parent.jpg']);
assert.deepEqual(sellable[0].colors, [{ name: 'Off White' }]);
assert.deepEqual(sellable[0].sizes, ['G']);
assert.equal(sellable[0].price, 99.9);

const resolved = resolveCatalogProduct('MARK-NEW', staticProducts, dynamicProducts);
assert.equal(resolved?.id, 'mark-new');
assert.equal(resolved?.name, 'Mark Nova');
assert.equal(resolveCatalogProduct('missing', staticProducts, dynamicProducts), null);

const resolvedWithParentImage = resolveCatalogProduct('force-logo', staticProducts, dynamicProducts);
assert.deepEqual(resolvedWithParentImage?.images, ['/force-admin.jpg']);
assert.deepEqual(resolvedWithParentImage?.colors, [{ name: 'Preto', hex: '#000' }]);
assert.deepEqual(resolvedWithParentImage?.sizes, ['P', 'M']);
assert.equal(resolvedWithParentImage?.price, 94.9);

// Future-ready garment taxonomy: collections stay independent from garment types.
assert.equal(normalizeProductCategory('camisetas'), 'tshirt');
assert.equal(normalizeProductCategory('bermuda'), 'shorts');
assert.equal(normalizeProductCategory('moletom'), 'jacket');
assert.equal(normalizeProductCategory('feminino'), 'cropped');
assert.equal(getProductCategory({ productType: 'shorts', collection: 'force' } as any), 'shorts');
assert.equal(getProductCategory({ category: 'casacos', name: 'DROP 01' }), 'jacket');
assert.equal(productMatchesCategory({ productType: 'cropped' }, 'cropped'), true);
assert.equal(productMatchesCategory({ productType: 'cropped' }, 'tshirt'), false);

const futureProducts = [
  { id: 'tee', slug: 'tee', name: 'Camiseta FORCE', productType: 'tshirt', collection: 'force', status: 'active', images: ['/tee.jpg'] },
  { id: 'short', slug: 'bermuda-cargo', name: 'Bermuda Cargo', productType: 'shorts', status: 'active', images: ['/short.jpg'] },
  { id: 'coat', slug: 'casaco', name: 'Casaco', productType: 'jacket', status: 'active', images: ['/coat.jpg'] },
  { id: 'crop', slug: 'cropped', name: 'Cropped', productType: 'cropped', status: 'draft', images: ['/crop.jpg'] },
];
const activeCategories = getActiveProductCategories(futureProducts);
assert.deepEqual(activeCategories.map(category => category.id), ['tshirt', 'shorts', 'jacket']);
assert.deepEqual(getCatalogCategories(futureProducts).map(category => category.id), ['tshirt', 'shorts', 'jacket']);
assert.deepEqual(filterCatalogByCategory(futureProducts, 'shorts').map(product => product.id), ['short']);

assert.equal(buildVariantSku({ baseSku: 'BERMUDA-CARGO', color: 'Preta', size: 'M' }), 'BERMUDA-CARGO-PRETA-M');
assert.equal(buildVariantSku({ slug: 'cropped-logo', color: 'Off White', size: 'G' }), 'CROPPED-LOGO-OFF-WHITE-G');

console.log('Catalog product normalization and extensible taxonomy checks passed.');

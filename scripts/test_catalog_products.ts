import assert from 'node:assert/strict';
import {
  applyCatalogImageFallbacks,
  isSellableCatalogProduct,
  mergeCatalogProducts,
  normalizeCatalogProduct,
  resolveCatalogProduct,
} from '../src/lib/catalogProducts';

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

assert.equal(isSellableCatalogProduct({ slug: 'force', status: 'active', images: ['/x.jpg'] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'produto-teste-pagamento', status: 'active', images: ['/x.jpg'] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'force-logo', status: 'inactive', images: ['/x.jpg'] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'force-logo', status: 'active', images: [] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'force-logo', status: 'active', images: ['/x.jpg'] }), true);

const resolved = resolveCatalogProduct('MARK-NEW', staticProducts, dynamicProducts);
assert.equal(resolved?.id, 'mark-new');
assert.equal(resolved?.name, 'Mark Nova');
assert.equal(resolveCatalogProduct('missing', staticProducts, dynamicProducts), null);

console.log('Catalog product normalization checks passed.');

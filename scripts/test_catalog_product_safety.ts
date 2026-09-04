import assert from 'node:assert/strict';
import {
  calculatePhysicalStockTotal,
  deriveSafeSizeStock,
  isSellableCatalogProduct,
  normalizeAuthoritativeProduct,
} from '../src/lib/productCatalogSafety';

const source = {
  slug: 'force-logo',
  status: 'active',
  price: '89.90',
  promotionalPrice: '79.90',
  colors: [{ name: 'Preto', hex: '#000000' }],
  images: ['/force.png'],
  sizes: ['P', 'M'],
};

const normalized = normalizeAuthoritativeProduct(source);
assert.equal(normalized.price, 89.9);
assert.equal(normalized.promotionalPrice, 79.9);
assert.deepEqual(normalized.colors, source.colors);
assert.notEqual(normalized.colors, source.colors);
assert.notEqual(normalized.images, source.images);
assert.notEqual(normalized.sizes, source.sizes);

const safeRows = deriveSafeSizeStock(
  ['P', 'M', 'G'],
  [{ size: 'P', quantity: 3, minStock: 1, reserved: 1 }],
);
assert.deepEqual(safeRows, [
  { size: 'P', quantity: 3, minStock: 1, reserved: 1 },
  { size: 'M', quantity: 0, minStock: 2, reserved: 0 },
  { size: 'G', quantity: 0, minStock: 2, reserved: 0 },
]);
assert.equal(calculatePhysicalStockTotal(safeRows), 3);

assert.equal(isSellableCatalogProduct({ slug: 'produto-teste', status: 'active', images: ['/x.png'] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'force-logo', status: 'hidden', images: ['/x.png'] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'force-logo', status: 'inactive', images: ['/x.png'] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'force-logo', status: 'active', images: [] }), false);
assert.equal(isSellableCatalogProduct({ slug: 'force-logo', status: 'active', images: ['/x.png'] }), true);

console.log('Catalog product safety checks passed.');

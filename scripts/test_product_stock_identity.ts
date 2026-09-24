import assert from 'node:assert/strict';
import { hasSharedProductSlug, resolveProductStockSlug, readProductVariantQuantity } from '../shared/productStockIdentity.ts';

const first = { id: 'camaleao123', slug: 'camiseta-oversized-f-pac' };
const second = { id: 'fp456', slug: 'camiseta-oversized-f-pac' };
assert.equal(hasSharedProductSlug(first, [first]), false);
assert.equal(hasSharedProductSlug(second, [first, second]), true);
const firstNew = resolveProductStockSlug(first.id, 'FPAC-CAMALEAO-8X6');
const secondNew = resolveProductStockSlug(second.id, 'FPAC-FP-8X6');
assert.notEqual(firstNew, secondNew);
assert.notEqual(resolveProductStockSlug('anotherId', 'REPEATED SKU'), resolveProductStockSlug('differentId', 'REPEATED SKU'));
assert.equal(resolveProductStockSlug(first.id, 'CHANGED-SKU', firstNew), firstNew, 'edits preserve an exclusive URL and inventory');
assert.equal(resolveProductStockSlug(second.id, 'FPAC-FP-8X6', second.slug, true), secondNew);
assert.equal(resolveProductStockSlug(second.id, 'FPAC-FP-8X6'), secondNew, 'retry uses the same inventory');
assert.ok(resolveProductStockSlug(second.id, 'A'.repeat(200)).length <= 160);

const sizes = ['P', 'M', 'G', 'GG'];
const ownMatrix = Object.fromEntries(sizes.map(size => [`Preto_${size}`, 1]));
const sharedInventory = { variants: Object.fromEntries(sizes.flatMap(size => [
  [`Preto_${size}`, { physicalQuantity: 1 }], [`Off White_${size}`, { physicalQuantity: 1 }]
])) };
const restored = sizes.reduce((total, size) => total + readProductVariantQuantity(
  { variantsStock: ownMatrix }, sharedInventory, `Preto_${size}`, size, 4, true
), 0);
assert.equal(restored, 4, 'repair restores this product\'s four units without inheriting the other color');
assert.equal(readProductVariantQuantity({ variantsStock: ownMatrix }, sharedInventory, 'Off White_P', 'P', 4, true), 0);
assert.equal(readProductVariantQuantity({ variantsStock: ownMatrix }, { variants: { Preto_P: { physicalQuantity: 0 } } }, 'Preto_P', 'P', 1), 0, 'authoritative zero wins over a stale mirror');
assert.equal(readProductVariantQuantity({ sizeStock: [{ size: 'P', quantity: 4 }] }, undefined, 'Preto_P', 'P', 2), 0, 'legacy size total must not multiply by color count');
console.log('Product stock identity regression checks passed.');

import assert from 'node:assert/strict';
import { stockMovementDisplay } from '../src/lib/stockMovementDisplay.ts';
import { stockProductIdentity, matchesStockProduct, duplicateProductReferences, hasDuplicateProductReference } from '../src/lib/stockProductIdentity.ts';
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

const designs = [{ id: 'd1', name: 'Águia', code: 'EST-029' }, { id: 'd2', name: 'FP', code: 'EST-037' }];
const products = [
  { id: 'p1', name: 'Camiseta Oversized F PAC', sku: ' FPAC-FP-8X6 ', stampIds: ['d1'], tags: ['Premium'] },
  { id: 'p2', name: 'Camiseta Oversized F PAC', sku: 'fpac-fp-8x6', stampIds: ['d2'] }
];
const identities = products.map(product => stockProductIdentity(product, designs));
assert.notEqual(identities[0].displayName, identities[1].displayName);
assert.equal(matchesStockProduct(identities[0].searchable, 'aguia premium oversized'), true);
assert.equal(matchesStockProduct(identities[1].searchable, 'aguia'), false);
assert.equal(matchesStockProduct(identities[1].searchable, 'EST-037'), true);
assert.equal(matchesStockProduct(identities[0].searchable, '   '), true);
assert.ok(stockProductIdentity(products[0], []).displayName.includes('d1'), 'missing design metadata keeps its reference');
const duplicates = duplicateProductReferences(products);
assert.equal(hasDuplicateProductReference('FPAC-FP-8X6', duplicates), true);
assert.equal(duplicateProductReferences([products[0], products[0]]).size, 0, 'the same product is not its own duplicate');
assert.equal(duplicateProductReferences([{ id: 'a' }, { id: 'b', sku: ' ' }]).size, 0);
assert.equal(products[0].sku, ' FPAC-FP-8X6 ', 'display helpers never mutate saved records');
console.log('Stock identification, search and duplicate reference checks passed.');

const reserved = stockMovementDisplay({ type: 'reservation_create', quantity: 2, previousPhysicalQuantity: 4, newPhysicalQuantity: 4, performedBy: 'system', productSlug: 'shirt' }, [{ slug: 'shirt', name: 'Camiseta' }]);
assert.equal(reserved.quantity, 0, 'reserving stock is not a physical entry');
assert.equal(reserved.type, 'Reserva');
assert.equal(reserved.operator, 'system');
assert.equal(reserved.productName, 'Camiseta');
assert.equal(stockMovementDisplay({ type: 'sale', quantity: 2, previousPhysicalQuantity: 4, newPhysicalQuantity: 2 }, []).quantity, -2);
assert.equal(stockMovementDisplay({ type: 'subtract', quantity: 2 }, []).quantity, -2);
assert.equal(stockMovementDisplay({ type: 'Ajuste', quantity: -1 }, []).quantity, -1);
assert.equal(stockMovementDisplay({ type: 'new_event', sku: 'ABC' }, []).type, 'new_event', 'unknown events retain their real label');
console.log('Stock history provider fields and physical delta checks passed.');

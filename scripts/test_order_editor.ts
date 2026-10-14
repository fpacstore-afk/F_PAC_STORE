import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyOrderEditArtworks,
  calculateOrderEditTotals,
  createOrderEditArtworkFromCatalogStamp,
  getOrderEditArtworks,
  getOrderEditProductOptionLabel,
  validateOrderEditDraft,
} from '../shared/orderEditor.ts';

const existing = {
  id: 'shirt-1',
  productId: 'shirt-1',
  name: 'Camiseta FP',
  color: 'Preta',
  size: 'M',
  quantity: 2,
  price: 69.9,
  productFinish: 'printed',
  printConfigs: [
    { stampId: 'art-front', stamp: 'Frente', location: 'Peito', printSize: '10x10', image: 'front.png' },
    { stampId: 'art-back', stamp: 'Costas', location: 'Costas', printSize: '28x20', image: 'back.png' },
  ],
  stampRecipe: [
    { stampId: 'art-front', printSize: '10x10' },
    { stampId: 'art-back', printSize: '28x20' },
  ],
};

const editableArtworks = getOrderEditArtworks(existing);
assert.equal(editableArtworks.length, 2, 'every artwork on the order must be editable');
assert.deepEqual(editableArtworks.map((art) => [art.stampId, art.location, art.printSize]), [
  ['art-front', 'Peito', '10x10'],
  ['art-back', 'Costas', '28x20'],
]);

editableArtworks[0] = { ...editableArtworks[0], printSize: '12x12', artSize: '12x12 cm', location: 'Peito esquerdo' };
const saved = applyOrderEditArtworks(existing, editableArtworks, { productFinish: 'printed' });
assert.equal(saved.printConfigs[0].printSize, '12x12', 'production print dimensions are persisted');
assert.equal(saved.printConfigs[0].artSize, '12x12 cm', 'per-application production dimensions are persisted separately from stock size');
assert.equal(saved.stampRecipe[0].printSize, '12x12', 'stock print size snapshot follows the editor');
assert.equal(saved.printConfigs[1].printSize, '28x20', 'other artwork remains unchanged');

const legacyStamp = getOrderEditArtworks({ stampId: 'legacy-art', stampName: 'Logo', printSize: '8x8' });
assert.equal(legacyStamp.length, 1, 'single-stamp legacy orders remain editable');
assert.equal(legacyStamp[0].printSize, '8x8');
assert.equal(legacyStamp[0].artSize, '', 'stock measurement is not guessed as the production artwork dimension');

const switchedStamp = createOrderEditArtworkFromCatalogStamp({
  id: 'new-stamp', name: 'Nova arte', code: 'ART-02', printColor: 'Branco',
  availableSizes: ['8x8', '12x12'], thumbnailUrl: 'new.png', status: 'active',
}, 'Costas');
assert.deepEqual(switchedStamp, {
  stampId: 'new-stamp', name: 'Nova arte', code: 'ART-02', location: 'Costas',
  color: 'Branco', printSize: '', artSize: '', image: 'new.png', source: 'catalog', status: 'active',
}, 'changing the stamp clears all previous stamp-specific values and leaves ambiguous stock size for an explicit choice');
const singleSizeStamp = createOrderEditArtworkFromCatalogStamp({ id: 'one', availableSizes: ['10x10'] }, 'Peito');
assert.equal(singleSizeStamp.printSize, '10x10');
assert.equal(singleSizeStamp.artSize, '', 'stock size must not be copied into the production dimension');

const duplicateProductA = getOrderEditProductOptionLabel({ id: 'a', name: 'Camiseta', sku: 'CAM-01', colors: [{ name: 'Preta' }], sizes: ['P', 'M'] });
const duplicateProductB = getOrderEditProductOptionLabel({ id: 'b', name: 'Camiseta', sku: 'CAM-02', colors: [{ name: 'Branca' }], sizes: ['G'] });
assert.notEqual(duplicateProductA, duplicateProductB, 'same-title products have distinguishing references and variants');
assert.match(duplicateProductA, /CAM-01/);

assert.deepEqual(calculateOrderEditTotals([
  { name: 'A', price: 20, quantity: 2 },
  { name: 'B', price: 15.5, quantity: 1 },
], 11.4, 5), { subtotal: 55.5, shipping: 11.4, couponDiscount: 5, total: 61.9 });

assert.equal(validateOrderEditDraft([], 'Site'), 'O pedido precisa ter ao menos um item.');
assert.match(validateOrderEditDraft([{ name: 'Camiseta', quantity: 0, price: 50, artworks: [] }], 'Site') || '', /quantidade/i);
assert.match(validateOrderEditDraft([{ name: 'Camiseta', quantity: 1, price: '', artworks: [] }], 'Site') || '', /preço/i);
assert.match(validateOrderEditDraft([{ name: 'Camiseta', quantity: 1, price: 50, artworks: [{ stampId: 'art', name: 'FP', printSize: '' }] }], 'Site') || '', /medida/i);
assert.equal(validateOrderEditDraft([{ name: 'Camiseta', quantity: 1, price: 50, artworks: [{ stampId: 'art', name: 'FP', printSize: '10x10' }] }], 'Site'), null);

const drawer = fs.readFileSync('src/components/OrderProductionDrawer.tsx', 'utf8');
const controller = fs.readFileSync('server/controllers/admin.controller.ts', 'utf8');
const routes = fs.readFileSync('server.ts', 'utf8');
assert.match(drawer, /onClick=\{cancelOrderDetailsEdit\}[^>]*>Cancelar/);
assert.match(drawer, /if \(!onSaveOrderDetails \|\| isSavingOrderDetails\) return/);
assert.match(drawer, /catch \(error: any\)[\s\S]*toast\.error\(error\?\.message/);
assert.match(drawer, /createOrderEditArtworkFromCatalogStamp\(stamp, art\.location\)/, 'changing a stamp refreshes its dependent metadata');
assert.match(drawer, /aria-label=\{`Dimensão de produção da estampa/);
assert.match(drawer, /Produção: \{pc\.artSize \|\| 'medida não informada'\}/);
assert.doesNotMatch(drawer, /pc\.artSize \|\| pc\.printSize/, 'production summaries do not disguise stock size as artwork dimensions');
assert.match(controller, /order_edit_requests/);
assert.match(controller, /reconcileOrderInventoryReservationsInTransaction/);
assert.match(controller, /reconcileOrderStampStockInTransaction/);
assert.match(controller, /ORDER_EDIT_FINANCIAL_HISTORY_PROTECTED/);
assert.match(routes, /put\("\/admin\/orders\/:orderId\/details"[^\n]*authenticateAdmin/);
const inventoryService = fs.readFileSync('server/services/store.service.ts', 'utf8');
assert.match(inventoryService, /stats\.availableQuantity < delta/, 'edits cannot over-reserve physical stock');
assert.match(inventoryService, /inventoryBySlug\.set\(physicalSlug/, 'multiple variants of one product are accumulated before inventory is written');
assert.match(inventoryService, /inventoryManaged === false/, 'custom unlinked product lines do not invent catalog stock identities');

console.log('PASS: order editor preserves multiple arts and dimensions, validates totals, blocks duplicate saves, and routes edits through stock and payment guards.');

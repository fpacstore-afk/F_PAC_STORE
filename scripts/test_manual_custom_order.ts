import assert from 'node:assert/strict';
import { buildManualCustomOrderLines, buildManualCustomProduction, filterManualCustomArtworkRows, inferManualStampPrintColor, isPrivateManualArtworkUrl } from '../src/lib/manualCustomOrder.ts';
import { stampRequirementsInTransaction } from '../server/services/stampStock.service.ts';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';

const customerArtworkUrl = `https://fpacstore.com.br/api/artwork/12345678-1234-1234-1234-123456789abc?token=${'a'.repeat(64)}`;

const sparseArtworkRows = filterManualCustomArtworkRows([
  { id: 'empty', name: '', location: '', color: '', artSize: '' },
  { id: 'identified', name: 'Logo da empresa', location: '', color: '', artSize: '' },
]);
assert.deepEqual(sparseArtworkRows.map((art) => art.name), ['Logo da empresa'], 'blank artwork rows are optional while partially described artwork is preserved');

const lines = buildManualCustomOrderLines({
  companyName: 'Equipe Alpha',
  productName: 'Camisa de uniforme',
  model: 'Oversized',
  garmentColor: 'Bege',
  notes: 'Gola reforçada',
  unitPrice: 89.9,
  unitCost: 42,
  sizeRows: [
    { id: 'size-p', size: 'P', quantity: 2 },
    { id: 'size-m', size: 'M', quantity: 3 },
  ],
  artworks: [
    {
      id: 'fp-black',
      catalogStampId: 'FP-PRETA',
      code: 'FP-PRETA-10x10',
      name: 'FP preta',
      location: 'Peito esquerdo',
      color: 'Preta',
      artSize: '10 × 10 cm',
      stockPrintSize: '10x10',
    },
    {
      id: 'company-logo',
      name: 'Logo da empresa',
      location: 'Costas',
      color: 'Branca',
      artSize: '28 × 20 cm',
      image: customerArtworkUrl,
    },
  ],
});

assert.equal(lines.length, 2, 'each size should become a separate order line');
assert.deepEqual(lines.map((item) => [item.size, item.quantity]), [['P', 2], ['M', 3]]);
assert.equal(lines[0].displayName, 'Camisa de uniforme · Oversized');
assert.equal(lines[0].color, 'Bege');
assert.equal(lines[0].customDetails.companyName, 'Equipe Alpha');
assert.equal(lines[0].customDetails.notes, 'Gola reforçada');
assert.equal(lines[0].stamps[0].id, 'FP-PRETA', 'the precise black artwork variant must be retained');
assert.equal(lines[0].stamps[0].location, 'Peito esquerdo');
assert.equal(lines[0].stamps[0].stockPrintSize, '10x10');
assert.equal(lines[0].stamps[0].code, 'FP-PRETA-10x10');
assert.equal(lines[0].stamps[1].id, 'own_art_company-logo');
assert.equal(lines[0].stamps[1].image, customerArtworkUrl, 'customer artwork must stay attached to each order line');
assert.equal(lines[0].customDetails.artworks[1].image, customerArtworkUrl, 'production ticket data must retain the private image');
assert.equal(isPrivateManualArtworkUrl(customerArtworkUrl), true);
assert.equal(isPrivateManualArtworkUrl('javascript:alert(1)'), false);
assert.equal(isPrivateManualArtworkUrl('https://other.example/api/artwork/12345678-1234-1234-1234-123456789abc?token=' + 'a'.repeat(64)), false);

const minimalLines = buildManualCustomOrderLines({
  productName: 'Camiseta personalizada',
  model: '',
  garmentColor: '',
  unitPrice: 68,
  sizeRows: [{ id: 'size-m', size: 'M', quantity: 1 }],
  artworks: [],
});
assert.equal(minimalLines.length, 1, 'a custom order can be created without optional model, color, cost, notes, or artwork details');
assert.equal(minimalLines[0].stamps.length, 0, 'no artwork rows means no stamp-stock deduction');
assert.equal(inferManualStampPrintColor({ name: 'Estampa FP Preta', code: 'FP-PRETA' }), 'Preta');
assert.equal(inferManualStampPrintColor({ name: 'Estampa FP Branca', code: 'FP-BRANCA' }), 'Branca');

const orderItems = lines.map((item) => ({
  id: item.id,
  productId: item.product.id,
  slug: item.product.slug,
  color: item.color,
  size: item.size,
  quantity: item.quantity,
  customization: {
    prints: item.stamps.map((stamp) => ({
      stampId: stamp.id,
      printSize: stamp.stockPrintSize || stamp.printSize,
    })),
  },
}));
const fakeDb = { collection: (name: string) => ({ doc: (id: string) => ({ name, id }) }) };
const fakeTransaction = { get: async () => ({ exists: false, data: () => undefined }) };
const requirements = await stampRequirementsInTransaction(fakeTransaction as any, fakeDb as any, orderItems);
assert.deepEqual(requirements, [{ stampId: 'FP-PRETA', printSize: '10x10', quantity: 5 }]);

const secondProduct = buildManualCustomOrderLines({
  groupId: 'another-garment',
  companyName: 'Equipe Alpha',
  productName: 'Boné',
  model: 'Aba curva',
  garmentColor: 'Preto',
  unitPrice: 39.9,
  sizeRows: [{ id: 'size-unique', size: 'Único', quantity: 1 }],
  artworks: [{ id: 'second-logo', name: 'Logo boné', location: 'Acima da aba', color: '', artSize: '8 × 6 cm', image: customerArtworkUrl }],
});
const otherColor = buildManualCustomOrderLines({
  groupId: 'third-garment',
  productName: 'Camisa de uniforme',
  model: 'Oversized',
  garmentColor: 'Branco',
  unitPrice: 89.9,
  sizeRows: [{ id: 'size-other-m', size: 'M', quantity: 1 }],
  artworks: [],
});
const summary = buildManualCustomProduction([...lines, ...secondProduct, ...otherColor]);
assert.equal(summary?.groups.length, 3, 'one order may contain different products, colors and sizes');
assert.deepEqual(summary?.groups.map(group => [group.productName, group.garmentColor, group.sizes]), [
  ['Camisa de uniforme', 'Bege', [{ size: 'P', quantity: 2 }, { size: 'M', quantity: 3 }]],
  ['Boné', 'Preto', [{ size: 'Único', quantity: 1 }]],
  ['Camisa de uniforme', 'Branco', [{ size: 'M', quantity: 1 }]],
]);
assert.deepEqual(summary?.groups.map(group => group.artworks.map((art: any) => [art.location, art.artSize, art.image])), [
  [['Peito esquerdo', '10 × 10 cm', ''], ['Costas', '28 × 20 cm', customerArtworkUrl]],
  [['Acima da aba', '8 × 6 cm', customerArtworkUrl]],
  [],
], 'artwork, position and dimensions must remain attached to the correct product');
assert.equal(summary?.productName, 'Camisa de uniforme', 'legacy single-product consumers still see the first product');
assert.equal(buildManualCustomProduction([]), null);

// Exercise the real manual-order endpoint against an isolated in-memory database.
// Two products and an uploaded image must survive saving without creating a live order.
const isolatedDb = requireIsolatedTestDb();
const { createManualOrderController } = await import('../server/controllers/admin.controller.ts');
const customItems = [...secondProduct, ...otherColor].map((item) => ({
  id: item.product.id,
  productId: item.product.id,
  manualLineId: item.id,
  name: item.displayName,
  color: item.color,
  size: item.size,
  quantity: item.quantity,
  price: item.price,
  customProduct: true,
  customDetails: item.customDetails,
  customization: { prints: item.stamps.map((art) => ({ stampId: art.id, printSize: art.printSize })) },
}));
const customOrder = {
  id: 'MANUAL-MULTI-ISOLATED',
  items: customItems,
  customProduction: buildManualCustomProduction([...secondProduct, ...otherColor]),
  total: customItems.reduce((total, item) => total + item.price * item.quantity, 0),
  stockControl: 'no_move',
  shippingStatus: 'pending',
};
const response: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } };
await createManualOrderController({ body: { order: customOrder }, user: { uid: 'isolated-test', email: 'isolated@example.invalid' } } as any, response);
assert.equal(response.statusCode, 201);
const saved = (await isolatedDb.collection('orders').doc(customOrder.id).get()).data();
assert.equal(saved.items.length, 2);
assert.deepEqual(saved.items.map((item: any) => [item.name, item.color, item.size]), [
  ['Boné · Aba curva', 'Preto', 'Único'], ['Camisa de uniforme · Oversized', 'Branco', 'M'],
]);
assert.deepEqual(saved.customProduction.groups.map((group: any) => [group.productName, group.artworks.map((art: any) => art.image)]), [
  ['Boné', [customerArtworkUrl]], ['Camisa de uniforme', []],
]);

console.log('PASS: custom order lines preserve per-product artwork, multi-product production details and precise stock debit.');

import assert from 'node:assert/strict';
import { buildManualCustomOrderLines, inferManualStampPrintColor } from '../src/lib/manualCustomOrder.ts';
import { stampRequirementsInTransaction } from '../server/services/stampStock.service.ts';

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

console.log('PASS: custom uniform lines preserve the selected print variant, artwork details, size grade, and exact stamp-stock debit.');

import assert from 'node:assert/strict';
import { buildStockVariantRows, summarizeStockVariants } from '../src/lib/stockVariantRows';

const product = {
  id: 'shirt-1',
  slug: 'shirt-1',
  sku: 'FPAC-SHIRT',
  status: 'active',
  colors: [{ name: 'Preto', hex: '#000' }, { name: 'Branco', hex: '#fff' }],
  sizes: ['M', 'G'],
  minStock: 2,
};
const inventory = {
  physicalQuantity: 11,
  reservedQuantity: 2,
  availableQuantity: 9,
  variants: {
    Preto_M: { physicalQuantity: 5, reservedQuantity: 0, availableQuantity: 5 },
    Preto_G: { physicalQuantity: 3, reservedQuantity: 2, availableQuantity: 1 },
    Branco_M: { physicalQuantity: 3, reservedQuantity: 0, availableQuantity: 3 },
    Branco_G: { physicalQuantity: 0, reservedQuantity: 0, availableQuantity: 0 },
  },
};
const rows = buildStockVariantRows(product as any, inventory as any);
assert.equal(rows.length, 4, 'cada combinação cor/tamanho deve ser contabilizada');
assert.equal(rows.find(row => row.key === 'Preto_G')?.status, 'critical', 'reservas devem reduzir o disponível');
assert.equal(rows.find(row => row.key === 'Branco_G')?.status, 'out');
assert.deepEqual(summarizeStockVariants(rows), { skuCount: 4, activeCount: 4, inactiveCount: 0, criticalCount: 1, outCount: 1 });
assert.equal(new Set(rows.map(row => row.sku)).size, 4, 'as referências geradas devem distinguir variações');

const inactiveRows = buildStockVariantRows({ ...product, status: 'inactive' } as any, inventory as any);
assert.equal(summarizeStockVariants(inactiveRows).inactiveCount, 4);
assert.ok(inactiveRows.every(row => row.status === 'inactive'));

const legacyRows = buildStockVariantRows({ ...product, stock: 7 } as any);
assert.equal(legacyRows.length, 1, 'o saldo legado sem matriz não pode ser distribuído arbitrariamente');
assert.equal(legacyRows[0].status, 'unallocated');
assert.equal(legacyRows[0].physical, 7);

const disabledRows = buildStockVariantRows({
  ...product,
  variants: [{ sku: 'PRETO-M', colorName: 'Preto', size: 'M', active: false }],
} as any, inventory as any);
assert.equal(disabledRows.find(row => row.key === 'Preto_M')?.status, 'inactive');
console.log('✅ SKUs, disponibilidade e status por cor/tamanho: verificações aprovadas.');

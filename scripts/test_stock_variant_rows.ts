import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildStockVariantRows, summarizeStockVariants, withSaleAvailability } from '../src/lib/stockVariantRows';
import { StockVariantBreakdown } from '../src/components/StockVariantBreakdown';

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
const internal = { ...product, status:'draft', productFinish:'plain', baseModel:'Tradicional Suedine', garmentModelId:'TIG-001' };
assert.equal(buildStockVariantRows(internal as any, inventory as any).find(row=>row.key==='Preto_M')?.status,'safe','Internal draft blanks are operational stock, not unpublished finished products');
assert.equal(buildStockVariantRows({ ...internal, productFinish:'printed' } as any, inventory as any)[0].status,'inactive','Draft retail products remain unpublished/inactive');
const pending = buildStockVariantRows({ ...internal, garmentModelId:undefined, modelSeparationRequired:true } as any, inventory as any);
assert.equal(pending.find(row=>row.key==='Preto_M')?.physical,5);
assert.equal(pending.find(row=>row.key==='Preto_M')?.available,0);
assert.equal(pending.find(row=>row.key==='Preto_M')?.status,'classification_pending');
assert.equal(buildStockVariantRows({ ...internal, garmentModelId:undefined, modelSeparationRequired:true, stock:5 } as any)[0].available,0,'Aggregate mixed stock must not be released either');
assert.equal(buildStockVariantRows(internal as any,{...inventory,variants:{...inventory.variants,Preto_M:{...inventory.variants.Preto_M,active:false}}} as any).find(row=>row.key==='Preto_M')?.status,'inactive','Explicit inventory deactivation is never undone by a draft-base display fix');

const printedInventory = { variants: { Preto_M: { physicalQuantity: 0, reservedQuantity: 0, availableQuantity: 0, active: false } } };
const printedRows = buildStockVariantRows({ ...product, productFinish: 'printed' } as any, printedInventory as any);
const saleRows = withSaleAvailability(printedRows, {
  availableQuantity: 5,
  variants: {
    Preto_M: { available: true, availableQuantity: 4 },
    Preto_G: { available: true, availableQuantity: 1 },
    Branco_M: { available: false, availableQuantity: 3 },
    Branco_G: { available: false, availableQuantity: 0 },
  },
});
assert.equal(saleRows.find(row => row.key === 'Preto_M')?.physical, 0, 'shared blanks never become printed physical stock');
assert.equal(saleRows.find(row => row.key === 'Preto_M')?.saleAvailable, 4);
assert.equal(saleRows.find(row => row.key === 'Preto_M')?.status, 'safe', 'a disabled ready variant can still be sold using a shared blank');
assert.equal(saleRows.find(row => row.key === 'Preto_G')?.status, 'critical');
assert.equal(saleRows.find(row => row.key === 'Branco_M')?.saleAvailable, 0, 'a blocked public variant is not offered for sale');
assert.equal(saleRows.find(row => row.key === 'Branco_G')?.status, 'out');
assert.deepEqual(withSaleAvailability(legacyRows, { availableQuantity: 7, variants: {} }), legacyRows, 'an aggregate balance cannot be assigned to a colour or size');
const printedMarkup = renderToStaticMarkup(React.createElement(StockVariantBreakdown, { rows: saleRows }));
assert.match(printedMarkup, /Prontas disponíveis/);
assert.match(printedMarkup, /À venda/);
assert.match(printedMarkup, /peças lisas compartilhadas/);
const plainMarkup = renderToStaticMarkup(React.createElement(StockVariantBreakdown, { rows }));
assert.doesNotMatch(plainMarkup, /À venda/, 'plain stock keeps its own physical availability display');
console.log('✅ SKUs, disponibilidade e status por cor/tamanho: verificações aprovadas.');

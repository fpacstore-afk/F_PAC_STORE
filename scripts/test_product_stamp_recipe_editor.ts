import assert from 'node:assert/strict';
import { clearEditableStampRecipe, completeEditableStampRecipe, readEditableStampRecipe, writeEditableStampRecipe } from '../shared/productStampRecipeEditor';
import { resolveProductStampRecipeEntries } from '../shared/productStampRecipe';

const starting = {
  stampIds: ['logo', 'back'],
  stampSizes: ['8x6', '30x30'],
  stampIdsByColor: { 'Off White': ['white-logo', 'white-back'] },
  stampSizesByColor: { 'off white': ['8x6', '30x30'] },
};

assert.deepEqual(readEditableStampRecipe(starting, 'OFF WHITE'), [
  { stampId: 'white-logo', printSize: '8x6' },
  { stampId: 'white-back', printSize: '30x30' },
]);

const changed = writeEditableStampRecipe(starting, [{ stampId: 'white-back', printSize: '30x30' }], 'Off White');
assert.deepEqual(changed.stampIdsByColor, { 'Off White': ['white-back'] });
assert.deepEqual(changed.stampSizesByColor, { 'Off White': ['30x30'] });
assert.deepEqual(resolveProductStampRecipeEntries(changed, 'off white'), [{ stampId: 'white-back', printSize: '30x30' }]);
assert.deepEqual(resolveProductStampRecipeEntries(changed, 'Bege'), [], 'unknown color must not fall back to another color-specific recipe');
assert.deepEqual(resolveProductStampRecipeEntries(changed, ''), [], 'missing garment color must not use a generic recipe when color recipes are configured');
assert.deepEqual(resolveProductStampRecipeEntries({ stampIds: ['legacy-stamp'], stampSizes: ['8x6'] }, 'Bege'), [{ stampId: 'legacy-stamp', printSize: '8x6' }], 'legacy products without color-specific recipes retain their default');
assert.deepEqual(starting.stampIdsByColor['Off White'], ['white-logo', 'white-back'], 'edição não deve mutar a receita anterior');

const copied = writeEditableStampRecipe(changed, readEditableStampRecipe(changed, 'Off White') || [], 'Preto');
assert.deepEqual(resolveProductStampRecipeEntries(copied, 'Preto'), [{ stampId: 'white-back', printSize: '30x30' }]);
const inherited = clearEditableStampRecipe(copied, 'preto');
assert.deepEqual(resolveProductStampRecipeEntries(inherited, 'Preto'), [
  { stampId: 'logo', printSize: '8x6' },
  { stampId: 'back', printSize: '30x30' },
]);
assert.deepEqual(resolveProductStampRecipeEntries(inherited, 'Off White'), [{ stampId: 'white-back', printSize: '30x30' }]);

assert.deepEqual(completeEditableStampRecipe(['logo'], [''], [{ id: 'logo', availableSizes: ['8x6'] }]), [
  { stampId: 'logo', printSize: '8x6' },
], 'medida única deve ser gravada explicitamente para a baixa de estoque');
assert.deepEqual(completeEditableStampRecipe(['back'], [''], [{ id: 'back', availableSizes: ['27x30', '30x30'] }]), [
  { stampId: 'back', printSize: '' },
], 'medidas múltiplas exigem seleção da pessoa que cadastra');

console.log('Product stamp recipe editor checks passed.');

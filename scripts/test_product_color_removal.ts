import assert from 'node:assert/strict';
import { buildVariantStockChanges } from '../shared/productStockChanges.ts';

const saved = { Preto_P: 1, Preto_M: 1, Preto_G: 1, Preto_GG: 1, 'Off White_P': 1, 'Off White_M': 1, 'Off White_G': 1, 'Off White_GG': 1 };
const active = { Preto_P: 1, Preto_M: 1, Preto_G: 1, Preto_GG: 1 };
const changes = buildVariantStockChanges(saved, active);
assert.equal(changes.length, 4);
assert.ok(changes.every(change => change.removed && change.newStock === 0 && change.variantKey.startsWith('Off White_')));
const inventoryAfterSave = { ...saved, ...Object.fromEntries(changes.map(change => [change.variantKey, change.newStock])) };
assert.equal(Object.values(inventoryAfterSave).reduce((sum, quantity) => sum + quantity, 0), 4, 'removing a stocked color must also update the consolidated balance');
assert.equal(inventoryAfterSave.Preto_P, 1, 'the other color must retain its quantity');
assert.equal(saved['Off White_P'], 1, 'calculating pending changes must not mutate the saved baseline');
assert.deepEqual(buildVariantStockChanges(saved, saved), [], 'canceling or restoring the original colors must not change inventory');
assert.deepEqual(buildVariantStockChanges({ Preto_P: 1 }, { Preto_P: 3, 'Azul_P': 0 }), [
  { variantKey: 'Preto_P', previousStock: 1, newStock: 3, removed: false }
], 'adding a color must not erase another pending quantity edit');
assert.deepEqual(buildVariantStockChanges({ Preto_P: 2, Branco_P: 0 }, { Preto_P: 2 }), [], 'removing an empty color needs no quantity adjustment');
assert.deepEqual(buildVariantStockChanges({}, { Preto_P: 2 }), [
  { variantKey: 'Preto_P', previousStock: 0, newStock: 2, removed: false }
]);
console.log('Product color removal regression checks passed.');

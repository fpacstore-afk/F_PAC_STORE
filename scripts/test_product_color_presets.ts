import assert from 'node:assert/strict';
import { changeProductColorPresets, readProductColorPresets } from '../shared/productColorPresets.ts';

const defaults = readProductColorPresets(undefined);
const reduced = changeProductColorPresets(defaults, { type: 'remove', name: ' preto ' });
assert.equal(reduced.length, defaults.length - 1);
assert.equal(defaults.length, 8, 'deletion must not mutate shared defaults');
assert.ok(!readProductColorPresets({ colors: reduced }).some(color => color.name === 'Preto'), 'a deleted default must stay deleted after reloading');
assert.deepEqual(readProductColorPresets({ colors: [] }), [], 'deleting the last preset must not restore the defaults');
const custom = changeProductColorPresets(reduced, { type: 'add', color: { name: ' Azul Teste ', hex: '#abcdef' } });
assert.deepEqual(custom.at(-1), { name: 'Azul Teste', hex: '#ABCDEF' });
assert.equal(changeProductColorPresets(custom, { type: 'add', color: { name: 'azul teste', hex: '#FFFFFF' } }).length, custom.length, 'color names are case insensitive');
assert.deepEqual(changeProductColorPresets(custom, { type: 'remove', name: 'AZUL TESTE' }), reduced, 'custom colors must be removable too');
const restored = changeProductColorPresets(reduced, { type: 'add', color: defaults[0] });
assert.ok(restored.some(color => color.name === 'Preto'), 'adding a deleted color must restore it to the quick list');
assert.throws(() => readProductColorPresets({ colors: 'broken' }), 'invalid saved data must not be silently replaced with defaults');
assert.throws(() => changeProductColorPresets(defaults, { type: 'add', color: { name: '', hex: '#000000' } }));
assert.throws(() => changeProductColorPresets(defaults, { type: 'add', color: { name: 'Invalid', hex: '000000' } }));
console.log('Product quick-color list persistence checks passed.');

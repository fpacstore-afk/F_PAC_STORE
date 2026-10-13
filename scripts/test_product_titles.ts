import assert from 'node:assert/strict';
import { buildStampNameMap, getStorefrontProductTitle } from '../src/lib/productTitles';

const stampNames = buildStampNameMap([
  { id: 'stamp-eagle', code: 'EST-001', name: 'ÁGUIA' },
  { id: 'stamp-phoenix', code: 'EST-002', name: 'FENIX' },
]);

assert.equal(stampNames['EST-001'], 'ÁGUIA');
assert.equal(getStorefrontProductTitle({
  name: 'Camiseta Oversized F PAC',
  headline: '',
  collection: 'MARK',
  stampIdsByColor: {
    'Azul Marinho': ['stamp-eagle'],
    Preto: ['stamp-phoenix'],
  },
}, stampNames, 'Azul Marinho'), 'Camiseta Oversized F PAC | ÁGUIA | MARK');

assert.equal(getStorefrontProductTitle({
  name: 'Cropped Camaleão | MARK',
  headline: 'Cropped Camaleão | MARK',
  collection: 'MARK',
}, stampNames), 'Cropped Camaleão | MARK');

console.log('Storefront product title checks passed.');

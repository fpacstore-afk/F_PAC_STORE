import assert from 'node:assert/strict';
import { buildStampNameMap, getStorefrontProductTitle, withStorefrontProductNames } from '../src/lib/productTitles';
import { approvedStampDisplayNames, getStampDisplayName } from '../shared/stampDisplayNames';
import { matchesStorefrontSearch } from '../src/lib/storefrontSearch';

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
}, stampNames, 'Azul Marinho'), 'Camiseta Oversized F PAC — ÁGUIA');

assert.equal(getStorefrontProductTitle({
  name: 'Cropped Camaleão | MARK',
  headline: 'Cropped Camaleão | MARK',
  collection: 'MARK',
}, stampNames), 'Cropped Camaleão');

assert.equal(approvedStampDisplayNames.length, 35);
const musical = { id: 'sSSnxdoqwqjXzqhbulog', code: 'EST-022', name: 'INK DROP' };
const musicNames = buildStampNameMap([musical]);
assert.equal(musicNames[musical.id], 'Notas Musicais');
assert.equal(getStampDisplayName({ ...musical, id: 'unrelated' }), 'INK DROP', 'an unrelated stamp must not inherit an approved rename');
assert.equal(getStampDisplayName({ ...musical, name: 'Nome novo do proprietário' }), 'Nome novo do proprietário', 'later deliberate renames remain authoritative');

const original = { name: 'Camiseta Oversized F PAC', collection: 'MARK', slug: 'shirt', price: 89.9,
  stampIds: [musical.id], stampIdsByColor: { Preto: [musical.id], Branco: [], Bege: ['not-public'] } };
const before = JSON.stringify(original);
const [presented] = withStorefrontProductNames([original], [musical]);
assert.equal(presented.name, 'Camiseta Oversized F PAC — Notas Musicais');
assert.equal(presented.catalogName, original.name);
assert.equal(presented.slug, original.slug);
assert.equal(presented.price, original.price);
assert.equal(JSON.stringify(original), before, 'presentation must not mutate canonical product data');
assert.ok(matchesStorefrontSearch(presented, 'notas musicais'));
assert.ok(matchesStorefrontSearch(presented, 'ink drop'), 'old artwork names remain searchable');
assert.equal(getStorefrontProductTitle(presented, musicNames, 'Branco'), original.name, 'empty selected-color recipe must not borrow another artwork');
assert.equal(getStorefrontProductTitle(presented, musicNames, 'Bege'), original.name, 'unknown/private artwork must not produce a false title');
assert.equal(getStorefrontProductTitle(presented), presented.name, 'already presented products keep their descriptive name');
assert.equal(getStorefrontProductTitle({ name: 'Camiseta — Notas Musicais', stampIds: [musical.id] }, musicNames), 'Camiseta — Notas Musicais', 'artwork names are not duplicated');
const outline = buildStampNameMap([{ id: 'vo2LghyKMljtLAX36ccX', name: 'FP - Branco' }]);
assert.equal(getStorefrontProductTitle({ name: 'Camiseta Oversized F PAC', stampIds: ['vo2LghyKMljtLAX36ccX'] }, outline), 'Camiseta Oversized F PAC — FP', 'print-color suffix must not be mistaken for the garment color');
assert.equal(withStorefrontProductNames([original], [])[0].name, original.name, 'missing artwork service leaves the canonical fallback usable');

console.log('Storefront product title checks passed.');

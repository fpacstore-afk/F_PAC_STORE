import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeStampCategory, STAMP_CATEGORIES } from '../src/constants/stampCategories.ts';
import { normalizeDesignDocument } from '../src/lib/stampCatalog.ts';
import { toPublicStamp } from '../server/services/publicStampCatalog.service.ts';

const source = fs.readFileSync('src/pages/StampsGallery.tsx', 'utf8');
const gridView = source.split('/* GRID VIEW */')[1]?.split('/* LIST VIEW */')[0] || '';
const listView = source.split('/* LIST VIEW */')[1]?.split('{/* ESTAMPA DETAIL MODAL */}')[0] || '';
const detailModal = source.split('{/* ESTAMPA DETAIL MODAL */}')[1] || '';

assert.ok(gridView, 'grid view section must exist');
assert.ok(listView, 'list view section must exist');
assert.ok(detailModal, 'detail modal section must exist');
assert.match(source, /fetchPublicStamps\(/, 'public gallery must use the sanitized stamp API instead of raw Firestore documents');
assert.doesNotMatch(source, /collection\(db,\s*['"]designs['"]\)/, 'public gallery must not read raw inventory-bearing design documents');

const primeSource = fs.readFileSync('src/pages/PrimeCustomApproved.tsx', 'utf8');
assert.match(primeSource, /fetchPublicStamps\(/, 'PRIME must use the sanitized stamp API');
assert.doesNotMatch(primeSource, /collection\(db,\s*['"]designs['"]\)/, 'PRIME must not read raw inventory-bearing design documents');

const publicStamp = toPublicStamp('fp-black', {
  code: 'FP-PRETA', name: 'FP preta', category: 'Logos & Branding',
  pngUrl: 'https://cdn.example.invalid/fp-black.png', status: 'active',
  availableForCustomization: true, stockBalance: 6,
  stockBySize: { '8x6': 2 }, masterFileUrl: 'https://private.invalid/master.png',
  history: [{ author: 'admin', action: 'stock adjusted' }],
});
assert.equal(publicStamp?.name, 'FP preta');
assert.equal(publicStamp?.availableSizes.length, 0);
assert.ok(!('stockBalance' in (publicStamp || {})), 'public stamp projection must omit aggregate stock');
assert.ok(!('stockBySize' in (publicStamp || {})), 'public stamp projection must omit stock by size');
assert.ok(!('masterFileUrl' in (publicStamp || {})), 'public stamp projection must omit production masters');
assert.ok(!('history' in (publicStamp || {})), 'public stamp projection must omit admin history');
assert.equal(toPublicStamp('draft', { status: 'draft', pngUrl: '/draft.png', availableForCustomization: true }), null);

for (const [name, section] of [['grid', gridView], ['list', listView]] as const) {
  assert.doesNotMatch(section, /\{design\.code\}/, `${name} cards must not expose the internal stamp code`);
  assert.doesNotMatch(section, /design\.category/, `${name} cards must not expose the stamp category`);
  assert.doesNotMatch(section, /design\.compatibleProducts/, `${name} cards must not expose product compatibility`);
  assert.match(section, /Ver informações/, `${name} cards must provide the details action`);
}

assert.match(detailModal, /selectedDesign\.code/, 'detail modal must retain the internal code');
assert.match(detailModal, /selectedDesign\.category/, 'detail modal must retain the category');
assert.match(detailModal, /selectedDesign\.compatibleProducts/, 'detail modal must retain product compatibility');

assert.deepEqual(STAMP_CATEGORIES, [
  'Tipografia', 'Minimalista', 'Logos & Branding', 'Esporte', 'Exclusiva',
], 'only the five approved categories should appear in storefront and admin options');
assert.equal(normalizeStampCategory('Frases', 'Manifesto F PAC'), 'Tipografia', 'legacy phrase category should use the approved typography label');
assert.equal(normalizeStampCategory('🖋️ Tipografia', 'Manifesto F PAC'), 'Tipografia', 'legacy typography designs should use the approved label');
assert.equal(normalizeStampCategory('Minimalistas', 'Linha essencial'), 'Minimalista', 'legacy minimal category should use the approved singular label');
assert.equal(normalizeStampCategory('🦅 Logos & Branding', 'FP Emblem'), 'Logos & Branding', 'legacy logo label should be normalized');
assert.equal(normalizeStampCategory('🏀 Esportes', 'Futebol'), 'Esporte', 'legacy sport label should be normalized');
assert.equal(normalizeStampCategory('🏆 Exclusivas', 'Cyber Skull'), 'Exclusiva', 'legacy exclusive label should be normalized');
assert.equal(normalizeStampCategory('Animais', 'Lobo urbano'), 'Exclusiva', 'retired animal category should remain accessible under Exclusiva');

const inferredTopics = [
  ['Tipografia', 'Manifesto F PAC', 'Lettering da marca', ['texto']],
  ['Exclusiva', 'Lobo urbano', 'Arte de animal', ['wildlife']],
  ['Exclusiva', 'Grafite noturno', 'Arte street urbana', ['cidade']],
  ['Minimalista', 'Linha essencial', 'Design clean', ['minimalista']],
  ['Exclusiva', 'Floresta viva', 'Folhas e montanhas', ['natureza']],
] as const;

for (const [expected, name, description, tags] of inferredTopics) {
  assert.equal(
    normalizeStampCategory(undefined, name, description, [...tags]),
    expected,
    `stamp topic inference must map "${name}" to ${expected}`,
  );
  assert.equal(
    normalizeDesignDocument(name, { name, description, tags, status: 'active' }).category,
    expected,
    `customer-facing stamp normalization must expose the ${expected} category`,
  );
}

console.log('Stamp gallery and five active category checks passed.');

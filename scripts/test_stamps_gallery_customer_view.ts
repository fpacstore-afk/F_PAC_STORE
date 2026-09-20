import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/pages/StampsGallery.tsx', 'utf8');
const gridView = source.split('/* GRID VIEW */')[1]?.split('/* LIST VIEW */')[0] || '';
const listView = source.split('/* LIST VIEW */')[1]?.split('{/* ESTAMPA DETAIL MODAL */}')[0] || '';
const detailModal = source.split('{/* ESTAMPA DETAIL MODAL */}')[1] || '';

assert.ok(gridView, 'grid view section must exist');
assert.ok(listView, 'list view section must exist');
assert.ok(detailModal, 'detail modal section must exist');

for (const [name, section] of [['grid', gridView], ['list', listView]] as const) {
  assert.doesNotMatch(section, /\{design\.code\}/, `${name} cards must not expose the internal stamp code`);
  assert.doesNotMatch(section, /design\.category/, `${name} cards must not expose the stamp category`);
  assert.doesNotMatch(section, /design\.compatibleProducts/, `${name} cards must not expose product compatibility`);
  assert.match(section, /Ver informações/, `${name} cards must provide the details action`);
}

assert.match(detailModal, /selectedDesign\.code/, 'detail modal must retain the internal code');
assert.match(detailModal, /selectedDesign\.category/, 'detail modal must retain the category');
assert.match(detailModal, /selectedDesign\.compatibleProducts/, 'detail modal must retain product compatibility');

console.log('3 public stamp-gallery checks passed: clean cards, explicit details action and complete modal.');

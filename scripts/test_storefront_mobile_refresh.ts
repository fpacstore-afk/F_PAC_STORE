import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const stamps = read('src/pages/StampsGallery.tsx');
const categories = read('src/pages/ProductCategories.tsx');
const catalog = read('src/pages/CatalogStorefront.tsx');
const prime = read('src/pages/PrimeCustomApproved.tsx');
const app = read('src/App.tsx');
const pricing = read('server/services/pricing.service.ts');

assert.match(stamps, /grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4/, 'stamp catalog must show two cards per row on mobile');
assert.doesNotMatch(stamps, /BIBLIOTECA DE ARTES & CONCEPT DESIGNS/, 'stamp page must not keep the oversized legacy introduction');
assert.match(categories, /grid grid-cols-2 lg:grid-cols-3/, 'product categories must start with a two-column mobile grid');
assert.match(categories, /ProductMockupSprite/, 'category cards must use photorealistic product visuals');
assert.match(catalog, /productMatchesCommercialLine/, 'collection filtering must use the canonical multi-product resolver');
assert.match(catalog, /pageCopy/, 'FORCE and MARK must use the refreshed shared storefront');
assert.match(app, /path="\/model\/force" element=\{<Navigate to="\/catalog\/all\?line=force"/, 'legacy FORCE route must redirect to the refreshed storefront');
assert.match(app, /path="\/model\/mark" element=\{<Navigate to="\/catalog\/all\?line=mark"/, 'legacy MARK route must redirect to the refreshed storefront');
assert.match(prime, /ProductMockupSprite/, 'PRIME must use the new photorealistic mockup system');
assert.match(prime, /baseProductSlug/, 'PRIME cart items must preserve the selected base product');
assert.match(prime, /own_art_/, 'uploaded PRIME artwork must be marked as owned artwork for secure checkout');
assert.match(pricing, /requestedBaseProductSlug/, 'server pricing must validate the selected PRIME base product');

for (const asset of ['oversized', 'traditional', 'cropped', 'hoodie', 'shorts', 'cap']) {
  assert.equal(fs.existsSync(`public/product-visuals/${asset}-front-v1.webp`), true, `missing ${asset} front visual`);
  assert.equal(fs.existsSync(`public/product-visuals/${asset}-back-v1.webp`), true, `missing ${asset} back visual`);
}

console.log('Storefront mobile refresh checks passed.');

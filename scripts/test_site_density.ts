import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

const density = read('src/site-density.css');
const app = read('src/App.tsx');
const catalog = read('src/pages/CatalogStorefront.tsx');
const categories = read('src/pages/ProductCategories.tsx');
const category = read('src/pages/ProductCategoryPage.tsx');
const stamps = read('src/pages/StampsGallery.tsx');

assert.match(app, /<main data-site-main/, 'every routed page must inherit the shared density system');
assert.match(density, /--container-7xl:\s*92rem/, 'wide desktop content must use the available viewport');
assert.match(density, /@media screen and \(min-width: 1280px\)[\s\S]*--spacing:\s*0\.171875rem/, 'wide desktops must use the compact rhythm');
assert.match(density, /@media screen and \(max-width: 767px\)[\s\S]*--spacing:\s*0\.203125rem/, 'mobile pages must use a denser responsive rhythm');
assert.match(density, /min-width:\s*44px; min-height:\s*44px/, 'tablet and mobile navigation controls must keep safe tap targets');
assert.match(density, /font-size:\s*16px;[\s\S]*min-height:\s*44px/, 'mobile form fields must remain comfortable and avoid browser zoom');
assert.match(density, /text-wrap:\s*pretty/, 'paragraphs and headings must distribute text without short orphan lines');
assert.match(catalog, /2xl:grid-cols-6/, 'wide catalog screens must show six products per row');
assert.match(category, /2xl:grid-cols-6/, 'wide category screens must show six products per row');
assert.match(categories, /xl:grid-cols-4/, 'wide product navigation must use four balanced cards per row');
assert.match(stamps, /2xl:grid-cols-7/, 'wide stamp screens must use the extra horizontal space');

console.log('Site-wide responsive density checks passed.');

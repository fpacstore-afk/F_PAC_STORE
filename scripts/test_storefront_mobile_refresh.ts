import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const stamps = read('src/pages/StampsGallery.tsx');
const categories = read('src/pages/ProductCategories.tsx');
const categoryPage = read('src/pages/ProductCategoryPage.tsx');
const catalog = read('src/pages/CatalogStorefront.tsx');
const navbar = read('src/components/Navbar.tsx');
const notificationDefaults = read('shared/productionNotificationDefaults.ts');
const prime = read('src/pages/PrimeCustomApproved.tsx');
const app = read('src/App.tsx');
const pricing = read('server/services/pricing.service.ts');
const server = read('server.ts');
const publicProducts = read('src/services/publicProducts.ts');

assert.match(stamps, /grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4/, 'stamp catalog must show two cards per row on mobile');
assert.doesNotMatch(stamps, /BIBLIOTECA DE ARTES & CONCEPT DESIGNS/, 'stamp page must not keep the oversized legacy introduction');
assert.match(categories, /grid grid-cols-2 lg:grid-cols-3/, 'product categories must start with a two-column mobile grid');
assert.match(categories, /ProductMockupSprite/, 'category cards must use photorealistic product visuals');
assert.match(catalog, /productMatchesCommercialLine/, 'collection filtering must use the canonical multi-product resolver');
assert.match(catalog, /pageCopy/, 'FORCE and MARK must use the refreshed shared storefront');
assert.doesNotMatch(catalog, /LINE_PRODUCT_TYPES|Consultar/, 'collection pages must show only registered products, never synthetic consultation cards');
assert.match(categoryPage, /\['force', 'mark', 'prime'\]/, 'each dedicated product-type page must expose the three collections');
assert.match(categoryPage, /productMatchesCommercialLine\(product, selectedLine\)/, 'dedicated product-type pages must show registered products from the selected collection');
assert.match(navbar, /to="\/produtos"[\s\S]*TODOS OS PRODUTOS/, 'Todos os produtos must open the product-type catalog');
assert.match(navbar, /to="\/prime"[\s\S]*LINHA PRIME/, 'the PRIME collection menu must open the dedicated customizer');
assert.match(notificationDefaults, /\(47\) 99746-5602/, 'customer messages must use the official WhatsApp number');
assert.doesNotMatch([catalog, navbar, notificationDefaults].join('\n'), /99756|5547997565602/, 'the previous incorrect WhatsApp number must not remain');
assert.match(app, /path="\/model\/force" element=\{<Navigate to="\/catalog\/all\?line=force"/, 'legacy FORCE route must redirect to the refreshed storefront');
assert.match(app, /path="\/model\/mark" element=\{<Navigate to="\/catalog\/all\?line=mark"/, 'legacy MARK route must redirect to the refreshed storefront');
assert.match(app, /path="\/model\/prime" element=\{<Navigate to="\/prime"/, 'legacy PRIME route must redirect to the dedicated customizer');
assert.match(prime, /ProductMockupSprite/, 'PRIME must use the new photorealistic mockup system');
assert.match(prime, /6 modelos personalizáveis/, 'PRIME must offer the six supported product models');
assert.match(prime, /Catálogo[\s\S]*Dispositivo[\s\S]*Link/, 'PRIME must support catalog artwork, device upload and image link');
assert.match(prime, /registeredCatalogSizes/, 'catalog art must use only dimensions registered by the administrator');
assert.match(prime, /Digite a medida aproximada da arte/, 'customer uploads must request approximate width and height');
assert.match(prime, /Largura \(cm\)[\s\S]*Altura \(cm\)/, 'customer uploads must expose explicit dimension fields');
assert.match(prime, /event\.currentTarget\.value = ''/, 'device upload must allow selecting the same image again');
assert.match(prime, /fixed inset-x-0 bottom-0/, 'PRIME must keep the purchase action accessible on mobile');
assert.match(prime, /tone=\{mockupTone\}/, 'PRIME color choices must update the mockup preview');
assert.match(prime, /baseProductSlug/, 'PRIME cart items must preserve the selected base product');
assert.match(prime, /own_art_/, 'uploaded PRIME artwork must be marked as owned artwork for secure checkout');
assert.match(pricing, /requestedBaseProductSlug/, 'server pricing must validate the selected PRIME base product');
assert.match(server, /apiRouter\.get\("\/products"/, 'the storefront must have a secure backend product projection');
const publicProductRoute = server.split('apiRouter.get("/products"')[1]?.split('apiRouter.get("/instagram/feed"')[0] || '';
assert.doesNotMatch(publicProductRoute, /costPrice|costCalculation|['"]cost['"]/, 'the public product projection must not expose internal costs');
assert.match(publicProducts, /getPublicApiUrl\('\/api\/products'\)/, 'the browser must recover products through the public backend');
assert.match(catalog, /fetchPublicProducts/, 'the catalog must use the backend when Firestore is empty or blocked');

for (const asset of ['oversized', 'traditional', 'cropped', 'hoodie', 'shorts', 'cap']) {
  assert.equal(fs.existsSync(`public/product-visuals/${asset}-front-v1.webp`), true, `missing ${asset} front visual`);
  assert.equal(fs.existsSync(`public/product-visuals/${asset}-back-v1.webp`), true, `missing ${asset} back visual`);
}

console.log('Storefront mobile refresh checks passed.');

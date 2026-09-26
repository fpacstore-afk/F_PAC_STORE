import assert from 'node:assert/strict';
import { getPrimeAreaGeometry, getVisibleArtworkBounds, placePrimeArtwork, validatePrimeArtworkPlacement, PRIME_GARMENT_MEASUREMENTS, type MeasuredPrimeModel, type PrimeAreaId } from '../shared/primePlacement';
import {
  PRIME_PRINT_SIZE_SURCHARGE,
  getActiveProductColorNames,
  getActiveProductSizes,
  isCatalogLocationAllowed,
  isCatalogPrimeSizeRegistered,
  isConfiguredVariantAllowed,
  isPrimeSizeAllowedAtLocation,
  isTrustedCloudinaryArtwork,
  resolvePrimeStampId,
} from '../server/services/prime-custom-rules';
import {
  formatPrimePrintSize,
  isPrimePrintSizeWithin,
  normalizePrimePrintSize,
  normalizeRegisteredPrimePrintSizes,
} from '../shared/primeArtworkSizing';
import {
  PRIME_CUSTOM_FIXED_PRICE,
  getCustomizationProfileByCartSlug,
  getCustomizationProfileById,
} from '../shared/customizationProfiles';
import { getCanvasStampBox } from '../src/lib/primeMockupGeometry';
import {
  getCompatiblePrintSizes,
  getSafePrintSize,
  getStampPreviewStyle,
  isSizeCompatibleWithPosition,
  parseDimensionsCm,
} from '../src/lib/primePrintSizing';

const chest = {
  maxDimensions: '30x40 cm',
  coordinateStyle: {
    top: '38%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '38%',
    maxHeight: '38%',
  },
};

const sleeve = {
  maxDimensions: '10x12 cm',
  coordinateStyle: {
    top: '28%',
    left: '20%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '14%',
    maxHeight: '18%',
  },
};

const sizes = [
  { id: '5x5' },
  { id: '8x8' },
  { id: '10x12' },
  { id: '12x15' },
  { id: '30x40' },
] as const;

assert.deepEqual(parseDimensionsCm('30x40 cm'), [30, 40]);
assert.deepEqual(parseDimensionsCm('10 x 12'), [10, 12]);
assert.equal(parseDimensionsCm('invalid'), null);

assert.equal(isSizeCompatibleWithPosition('30x40', chest), true);
assert.equal(isSizeCompatibleWithPosition('30x30', chest), true);
assert.equal(isSizeCompatibleWithPosition('30x40', sleeve), false);
assert.equal(isSizeCompatibleWithPosition('10x12', sleeve), true);
assert.equal(isSizeCompatibleWithPosition('12x15', sleeve), false);

assert.deepEqual(
  getCompatiblePrintSizes(sizes, sleeve).map(size => size.id),
  ['5x5', '8x8', '10x12'],
);
assert.equal(getSafePrintSize('12x15', sizes, sleeve, '8x8'), '8x8');
assert.equal(getSafePrintSize('10x12', sizes, sleeve, '8x8'), '10x12');
assert.equal(getSafePrintSize('invalid', sizes, sleeve, 'invalid'), '5x5');

const chest20 = getStampPreviewStyle('20x20', chest);
assert.equal(chest20.width, '25.3333%');
assert.equal(chest20.height, '19%');

const sleeve8 = getStampPreviewStyle('8x8', sleeve);
assert.equal(sleeve8.width, '11.2%');
assert.equal(sleeve8.height, '12%');

assert.deepEqual(getCanvasStampBox(chest20, 400, 400), {
  x: 149.3334,
  y: 114,
  width: 101.3332,
  height: 76,
});
assert.deepEqual(getCanvasStampBox(sleeve8, 400, 400, 400, 0), {
  x: 457.6,
  y: 88,
  width: 44.8,
  height: 48,
});
assert.equal(getCanvasStampBox({ left: '50%', top: '50%' }, 400, 400), null);

// Fixed-price PRIME CUSTOM: print size is an allow-list only, never a surcharge.
assert.equal(PRIME_PRINT_SIZE_SURCHARGE['30x40'], 0);
assert.equal(PRIME_PRINT_SIZE_SURCHARGE['20x30'], 0);
assert.equal(PRIME_PRINT_SIZE_SURCHARGE['10x5'], 0);
assert.equal(PRIME_CUSTOM_FIXED_PRICE, 119.90);

// Catalog dimensions come only from registration; customer uploads may use an
// approximate custom dimension while remaining inside the garment print area.
assert.equal(normalizePrimePrintSize('Peito 10 × 12 cm'), '10x12');
assert.equal(normalizePrimePrintSize('17,5 x 22,5 cm'), '17.5x22.5');
assert.equal(formatPrimePrintSize('17.5x22.5'), '17.5 × 22.5 cm');
assert.deepEqual(normalizeRegisteredPrimePrintSizes(['10 × 12 cm', 'Peito 10x12', '20x30', 'inválido']), ['10x12', '20x30']);
assert.equal(isPrimePrintSizeWithin('17.5x22.5', 30, 40), true);
assert.equal(isPrimePrintSizeWithin('31x22.5', 30, 40), false);
assert.equal(isCatalogPrimeSizeRegistered(['Peito 10 × 12 cm', '20x30'], '10x12'), true);
assert.equal(isCatalogPrimeSizeRegistered(['Peito 10 × 12 cm', '20x30'], '15x20'), false);

// Current labels used by the storefront.
assert.equal(isPrimeSizeAllowedAtLocation('30x40', 'Frente'), true);
assert.equal(isPrimeSizeAllowedAtLocation('30x40', 'Costas'), true);
assert.equal(isPrimeSizeAllowedAtLocation('30x40', 'Peito Central'), true); // legacy cart compatibility
assert.equal(isPrimeSizeAllowedAtLocation('30x40', 'Peito Esquerdo'), false);
assert.equal(isPrimeSizeAllowedAtLocation('17.5x22.5', 'Frente'), true);
assert.equal(isPrimeSizeAllowedAtLocation('10x12', 'Manga Esquerda'), true); // legacy compatibility
assert.equal(isPrimeSizeAllowedAtLocation('10x10', 'Posição Inexistente'), false);

assert.equal(
  resolvePrimeStampId({ id: 'design_abc_peito_central_1788490000000' }, 'Frente'),
  'design_abc',
);
assert.equal(
  resolvePrimeStampId({ id: 'design_abc_manga_esquerda_1788490000000' }, 'Manga Esquerda'),
  'design_abc',
);
assert.equal(
  resolvePrimeStampId({ id: 'legacy', stampId: 'design-explicit' }, 'Frente'),
  'design-explicit',
);
assert.equal(resolvePrimeStampId({ id: 'malformed' }, 'Frente'), '');

assert.equal(isTrustedCloudinaryArtwork('https://res.cloudinary.com/fpac/image/upload/art.png'), true);
assert.equal(isTrustedCloudinaryArtwork('https://res.cloudinary.com/fpac/image/upload/v123/folder/art.webp'), true);
assert.equal(isTrustedCloudinaryArtwork('http://res.cloudinary.com/fpac/image/upload/art.png'), false);
assert.equal(isTrustedCloudinaryArtwork('https://res.cloudinary.com/fpac/video/upload/art.mp4'), false);
assert.equal(isTrustedCloudinaryArtwork('https://res.cloudinary.com/fpac/image/fetch/https://evil.example/art.png'), false);
assert.equal(isTrustedCloudinaryArtwork('https://res.cloudinary.com/image/upload/art.png'), false);
assert.equal(isTrustedCloudinaryArtwork('https://evil.example/art.png'), false);

assert.equal(isCatalogLocationAllowed(undefined, 'Frente'), true);
assert.equal(isCatalogLocationAllowed(['Frente'], 'Frente'), true);
assert.equal(isCatalogLocationAllowed(['peito_central'], 'Frente'), true);
assert.equal(isCatalogLocationAllowed(['Costas'], 'Frente'), false);

const activeColors = getActiveProductColorNames([
  { name: 'Preto', available: true },
  { name: 'Verde Militar', available: false },
  { name: 'Oculta', status: 'hidden' },
  'Off White',
]);
assert.deepEqual(activeColors, ['Preto', 'Off White']);
assert.equal(isConfiguredVariantAllowed(activeColors, 'preto'), true);
assert.equal(isConfiguredVariantAllowed(activeColors, 'Verde Militar'), false);

const activeSizes = getActiveProductSizes(['P', 'M', { name: 'G', available: true }, { name: 'GG', available: false }]);
assert.deepEqual(activeSizes, ['P', 'M', 'G']);
assert.equal(isConfiguredVariantAllowed(activeSizes, 'm'), true);
assert.equal(isConfiguredVariantAllowed(activeSizes, 'GG'), false);

// Scalable customizer registry: every supported garment can use PRIME without
// coupling the commercial line to a single oversized base.
const primeProfile = getCustomizationProfileByCartSlug('prime-custom');
assert.ok(primeProfile);
assert.equal(primeProfile?.id, 'oversized');
assert.equal(primeProfile?.productSlug, 'prime');
assert.equal(primeProfile?.pricingMode, 'graduated');
assert.equal(primeProfile?.fixedPrice, null);
assert.equal(primeProfile?.maxPrints, 3);
assert.equal(primeProfile?.printAreas.length, 3);
assert.deepEqual(primeProfile?.printAreas.slice(0, 2).map(area => [area.maxWidthCm, area.maxHeightCm]), [[30, 40], [30, 40]]);

for (const id of ['cropped', 'traditional', 'hoodie', 'shorts', 'cap'] as const) {
  assert.equal(getCustomizationProfileById(id)?.enabled, true, `${id} must be enabled in PRIME`);
  assert.equal(getCustomizationProfileById(id)?.pricingMode, 'fixed');
  assert.equal(getCustomizationProfileById(id)?.fixedPrice, 119.90);
}

console.log('PRIME fixed-price, sizing, mockup and scalable customization checks passed.');

// Measured PRIME geometry and transparent-padding regressions.
const padded = new Uint8ClampedArray(100 * 100 * 4);
for (let y = 10; y < 90; y++) for (let x = 20; x < 80; x++) padded[(y * 100 + x) * 4 + 3] = 255;
const crop = getVisibleArtworkBounds(padded, 100, 100);
assert.deepEqual(crop, { left: .2, top: .1, width: .6, height: .8 });
const art = { sourceWidth: 100, sourceHeight: 100, crop };
const fullArt = placePrimeArtwork('oversized', 'M', 'front', '30x40', art);
assert.deepEqual([fullArt.xCm, fullArt.yCm, fullArt.widthCm, fullArt.heightCm], [0, 0, 30, 40]);
assert.equal(placePrimeArtwork('oversized', 'M', 'front', '30x40', art, { xCm: 20, yCm: -50 }).xCm, 0);
const small = placePrimeArtwork('oversized', 'M', 'front', '6x8', art, { xCm: -5, yCm: 100 });
assert.equal(small.xCm, 0); assert.equal(small.yCm, 32);
const sleeveArt = placePrimeArtwork('oversized', 'M', 'sleeve', '2x3', art);
assert.equal(sleeveArt.widthCm, 2); assert.ok(sleeveArt.heightCm <= 3);
assert.equal(sleeveArt.yCm + sleeveArt.heightCm, 12);
assert.ok(sleeveArt.rotationDeg < 0);
for (const model of ['oversized', 'traditional', 'cropped'] as MeasuredPrimeModel[]) {
  for (const row of PRIME_GARMENT_MEASUREMENTS[model]) for (const areaId of ['front', 'back', 'sleeve'] as PrimeAreaId[]) {
    const area = getPrimeAreaGeometry(model, row.size, areaId);
    assert.equal(area.estimated, false);
    if (areaId === 'sleeve') assert.ok(area.centerX > 375, 'Wearer left = viewer right');
    else {
      const bottom = area.centerY + area.heightCm * area.pixelsPerCm / 2;
      assert.ok(bottom < area.garmentHemY, model + ' print area stays above garment hem');
    }
    const initial = placePrimeArtwork(model, row.size, areaId, '6x8', art);
    assert.equal(area.imageTransform, 'none');
    assert.deepEqual(area, getPrimeAreaGeometry(model, 'M', areaId), 'Size changes never shift photo, print or area');
    const moved = placePrimeArtwork(model, row.size, areaId, '6x8', art, { xCm: 900, yCm: -900 });
    assert.equal(moved.xCm + moved.widthCm, area.widthCm); assert.equal(moved.yCm, 0);
    assert.deepEqual(getPrimeAreaGeometry(model, row.size, areaId), area, 'Moving or resizing art never moves the fixed area');
    const location = areaId === 'front' ? 'Frente' : areaId === 'back' ? 'Costas' : 'Manga Esquerda';
    assert.deepEqual(validatePrimeArtworkPlacement(JSON.parse(JSON.stringify(initial)), model, row.size, location, '6x8'), initial);
  }
  assert.deepEqual(getPrimeAreaGeometry(model, 'GG', 'front'), getPrimeAreaGeometry(model, 'P', 'front'));
}
assert.equal(getPrimeAreaGeometry('traditional', 'G2', 'front').estimated, false);
assert.throws(() => placePrimeArtwork('cropped', 'M', 'front', '30x40', art), /ultrapassa/);
assert.throws(() => validatePrimeArtworkPlacement({ ...small, xCm: 100 }, 'oversized', 'M', 'Frente', '6x8'), /ultrapassa/);
assert.throws(() => validatePrimeArtworkPlacement({ ...small, yCm: NaN }, 'oversized', 'M', 'Frente', '6x8'), /inválido/);
assert.throws(() => validatePrimeArtworkPlacement({ ...small, artwork: { ...art, crop: { ...crop, left: 2 } } }, 'oversized', 'M', 'Frente', '6x8'), /inválido/);
assert.equal(validatePrimeArtworkPlacement(undefined, 'oversized', 'M', 'Frente', '6x8'), undefined);
console.log('Measured PRIME: padding, full-size fit, drag bounds, sleeve orientation, all garment sizes and checkout metadata passed.');

import { calculatePrimePrice } from '../shared/primePricing';
import { primeBaseOptions } from '../shared/primeBaseOptions';
const includedSleeve = { stampId: 'logo', location: 'Manga Esquerda', printSize: '2x3' };
const priced = (...sizes: string[]) => calculatePrimePrice('oversized', [includedSleeve, ...sizes.map((printSize, i) => ({ stampId: 'design', location: i === 0 ? 'Frente' : 'Costas', printSize }))]).total;
assert.equal(priced(), 79.9);
for (const [sizes, expected] of [ [['15x15'],84.9], [['15x15','15x15'],89.9], [['30x30'],94.9], [['30x30','30x30'],99.9], [['30x40'],109.9], [['30x40','30x40'],119.9], [['15x15','30x30'],99.9], [['30x40','15x15'],114.9], [['30x30','30x40'],114.9] ] as [string[],number][]) assert.equal(priced(...sizes), expected);
assert.equal(calculatePrimePrice('oversized', []).total, 82.9);
assert.equal(calculatePrimePrice('traditional', [includedSleeve]).total, 119.9);
assert.equal(priced('15x15','30x40'), priced('30x40','15x15'));
for (const model of ['oversized','traditional','cropped'] as MeasuredPrimeModel[]) {
  const logo = placePrimeArtwork(model,'GG','sleeve','2x3',art,undefined,true);
  assert.equal(logo.areaWidthCm,2); assert.equal(logo.areaHeightCm,3);
  assert.throws(() => placePrimeArtwork(model,'M','sleeve','8x8',art,undefined,true));
  assert.deepEqual(validatePrimeArtworkPlacement(logo,model,'GG','Manga Esquerda','2x3',true),logo);
  const right = getPrimeAreaGeometry(model,'M','sleeve_right');
  const left = getPrimeAreaGeometry(model,'M','sleeve');
  assert.equal(left.centerX + right.centerX,512); assert.equal(left.rotationDeg,-right.rotationDeg);
}
assert.throws(() => getPrimeAreaGeometry('hoodie','M','sleeve'));
assert.equal(getCustomizationProfileById('hoodie')?.printAreas.length,2);
const options = primeBaseOptions([{id:'blank',slug:'blank',colors:[{name:'Branco'},{name:'Preto'},{name:'Bege',available:false}],sizes:['M','G']}],{blank:{available:true,variants:{Branco_M:{availableQuantity:2},Branco_G:{availableQuantity:0},Preto_G:{availableQuantity:1},Bege_M:{availableQuantity:3},Azul_M:{availableQuantity:2}}}});
assert.deepEqual(options.combinations.map(x=>x.color.name+'_'+x.size),['Branco_M','Preto_G']);
console.log('PRIME feedback: stable previews, both sleeves, catalog logo, plain inventory and all approved price combinations passed.');

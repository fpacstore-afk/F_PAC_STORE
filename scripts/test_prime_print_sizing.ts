import assert from 'node:assert/strict';
import {
  PRIME_PRINT_SIZE_SURCHARGE,
  getActiveProductColorNames,
  getActiveProductSizes,
  isCatalogLocationAllowed,
  isConfiguredVariantAllowed,
  isPrimeSizeAllowedAtLocation,
  isTrustedCloudinaryArtwork,
  resolvePrimeStampId,
} from '../server/services/prime-custom-rules';
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
assert.equal(PRIME_CUSTOM_FIXED_PRICE, 119.90);

// Current labels used by the storefront.
assert.equal(isPrimeSizeAllowedAtLocation('30x40', 'Frente'), true);
assert.equal(isPrimeSizeAllowedAtLocation('30x40', 'Costas'), true);
assert.equal(isPrimeSizeAllowedAtLocation('30x40', 'Peito Central'), true); // legacy cart compatibility
assert.equal(isPrimeSizeAllowedAtLocation('30x40', 'Peito Esquerdo'), false);
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

// Scalable customizer registry: only oversized is live today; future garments remain safely disabled.
const primeProfile = getCustomizationProfileByCartSlug('prime-custom');
assert.ok(primeProfile);
assert.equal(primeProfile?.id, 'oversized');
assert.equal(primeProfile?.productSlug, 'prime');
assert.equal(primeProfile?.pricingMode, 'fixed');
assert.equal(primeProfile?.fixedPrice, 119.90);
assert.equal(primeProfile?.maxPrints, 2);
assert.equal(primeProfile?.printAreas.length, 2);
assert.deepEqual(primeProfile?.printAreas.map(area => [area.maxWidthCm, area.maxHeightCm]), [[30, 40], [30, 40]]);

assert.equal(getCustomizationProfileById('cropped'), undefined);
assert.equal(getCustomizationProfileById('cropped', true)?.enabled, false);
assert.equal(getCustomizationProfileById('traditional', true)?.enabled, false);
assert.equal(getCustomizationProfileById('hoodie', true)?.enabled, false);
assert.equal(getCustomizationProfileById('cap', true)?.enabled, false);

console.log('PRIME fixed-price, sizing, mockup and scalable customization checks passed.');

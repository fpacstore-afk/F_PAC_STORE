import assert from 'node:assert/strict';
import { getProductGallery } from '../src/lib/productGallery';
import { FP_BLACK_ANGLE_IMAGE } from '../src/lib/verifiedCatalogMedia';

const product = {
  images: ['/general.jpg', '/brown.jpg'],
  colorVariants: [
    { name: 'Verde Militar', hex: '#333b32', images: ['/green-front.jpg', '/green-back.jpg'] },
    { name: 'Marrom', hex: '#47352b', images: ['/brown.jpg'] },
    { name: 'Areia', hex: '#c9b89e', images: [] },
  ],
};

assert.deepEqual(getProductGallery(product, 'verde militar'), [
  '/green-front.jpg', '/green-back.jpg', '/general.jpg',
]);
assert.deepEqual(getProductGallery(product, 'Marrom'), ['/brown.jpg', '/general.jpg']);
assert.deepEqual(getProductGallery(product, 'Areia'), ['/general.jpg']);
assert.deepEqual(getProductGallery({ images: [], colorVariants: [] }, 'Preto', ['/fallback.jpg']), ['/fallback.jpg']);
assert.deepEqual(getProductGallery({
  images: ['/general.jpg'],
  colorVariants: [],
  mockups: [
    { id: 'green-lifestyle', url: '/green-lifestyle.jpg', colorName: 'Verde Militar', order: 2 },
    { id: 'green-primary', url: '/green-primary.jpg', colorName: 'verde militar', order: 4, isPrimary: true },
    { id: 'black-front', url: '/black-front.jpg', colorName: 'Preto', order: 1 },
  ],
}, 'VERDE MILITAR'), ['/green-primary.jpg', '/green-lifestyle.jpg', '/general.jpg']);
// A missing color photograph must never borrow a photo explicitly belonging
// to another variant; shared photos intentionally assigned to both remain.
assert.deepEqual(getProductGallery({ images: ['/brown.jpg'], colorVariants: product.colorVariants }, 'Areia'), []);
assert.deepEqual(getProductGallery({ images: ['/shared.jpg'], colorVariants: [
  { name: 'Preto', hex: '#000', images: ['/shared.jpg'] },
  { name: 'Branco', hex: '#fff', images: ['/shared.jpg', '/white.jpg'] },
] }, 'Preto'), ['/shared.jpg']);
assert.deepEqual(getProductGallery({ images: ['/black.jpg'], mockups: [
  { id: 'black', url: '/black.jpg', colorName: 'Preto', order: 0 },
  { id: 'white', url: '/white.jpg', colorName: 'Branco', order: 1 },
] }, 'branco'), ['/white.jpg']);
console.log('Product color gallery checks passed.');
const verified = [
  '/catalog/1790265191025-1751e7e5-front.png',
  '/catalog/1790265187193-2c28a8c5-duplicate.png',
  '/catalog/1790265181534-e8f55c75-blue.png',
  '/catalog/1790265184250-b0c07fd5-brown.png',
  '/catalog/1790265189924-352b2a80-green.png',
];
assert.deepEqual(getProductGallery({images: verified}, 'Preto'), [verified[0], FP_BLACK_ANGLE_IMAGE]);
assert.deepEqual(getProductGallery({images: verified}, 'Azul Marinho'), [verified[2]]);
assert.deepEqual(getProductGallery({images: verified}, 'Marrom Café'), [verified[3]]);
assert.deepEqual(getProductGallery({images: verified}, 'Verde Militar'), [verified[4]]);
assert.deepEqual(getProductGallery({images: ['/new-art.png']}, 'Preto'), ['/new-art.png'], 'new artwork must not inherit the old FP photograph');

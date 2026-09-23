import assert from 'node:assert/strict';
import { getProductGallery } from '../src/lib/productGallery';

const product = {
  images: ['/general.jpg', '/brown.jpg'],
  colorVariants: [
    { name: 'Verde Militar', hex: '#333b32', images: ['/green-front.jpg', '/green-back.jpg'] },
    { name: 'Marrom', hex: '#47352b', images: ['/brown.jpg'] },
    { name: 'Areia', hex: '#c9b89e', images: [] },
  ],
};

assert.deepEqual(getProductGallery(product, 'verde militar'), [
  '/green-front.jpg', '/green-back.jpg', '/general.jpg', '/brown.jpg',
]);
assert.deepEqual(getProductGallery(product, 'Marrom'), ['/brown.jpg', '/general.jpg']);
assert.deepEqual(getProductGallery(product, 'Areia'), product.images);
assert.deepEqual(getProductGallery({ images: [], colorVariants: [] }, 'Preto', ['/fallback.jpg']), ['/fallback.jpg']);
console.log('Product color gallery checks passed.');

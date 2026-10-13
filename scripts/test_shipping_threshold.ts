import assert from 'node:assert/strict';
import { qualifiesForFreeShipping, FREE_SHIPPING_MIN_PIECES } from '../shared/shippingThreshold';

assert.equal(FREE_SHIPPING_MIN_PIECES, 3);
assert.equal(qualifiesForFreeShipping(0), false);
assert.equal(qualifiesForFreeShipping(1), false);
assert.equal(qualifiesForFreeShipping(2), false);
assert.equal(qualifiesForFreeShipping(3), true);
assert.equal(qualifiesForFreeShipping(4), true);
assert.equal(qualifiesForFreeShipping(2.9), false);

console.log('Shipping threshold regression passed: free shipping starts at 3 pieces.');

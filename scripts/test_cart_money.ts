import assert from 'node:assert/strict';
import { calculateCartMoney, formatBRL, toCents } from '../src/lib/money';

const money = calculateCartMoney({
  items: [{ price: 79.9, quantity: 1 }],
  promotionDiscount: 0,
  flashSaleDiscount: 0,
  couponRate: 5,
  pixRate: 5,
  pixEnabled: true,
  shipping: 15.9,
});

assert.equal(money.subtotal, 79.9);
assert.equal(money.couponDiscount, 4);
assert.equal(money.pixDiscount, 3.8);
assert.equal(money.shipping, 15.9);
assert.equal(money.total, 88);
assert.equal(formatBRL(money.total).replace(/\s/g, ' '), 'R$ 88,00');
assert.equal(toCents(1.005), 101);

const freeShipping = calculateCartMoney({
  items: [{ price: 24.95, quantity: 2 }],
  promotionDiscount: 3.5,
  flashSaleDiscount: 5,
  couponRate: 0,
  pixRate: 5,
  pixEnabled: false,
  shipping: 0,
});
assert.equal(freeShipping.subtotal, 49.9);
assert.equal(freeShipping.promotionDiscount, 3.5);
assert.equal(freeShipping.total, 41.4);

console.log('Cart currency rounding checks passed.');

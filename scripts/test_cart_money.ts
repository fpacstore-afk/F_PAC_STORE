import assert from 'node:assert/strict';
import { calculateCartMoney, formatBRL, toCents } from '../src/lib/money';
import { getEffectivePrice, getDisplayPrices } from '../src/lib/utils';

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

for (const [product, expected] of [
  [{ price: 100, promotionalPrice: 75 }, 75],
  [{ price: 100 }, 100],
  [{ price: 100, promotionalPrice: null }, 100],
  [{ price: 100, promotionalPrice: 0 }, 100],
  [{ price: 100, promotionalPrice: -1 }, 100],
  [{ price: 100, promotionalPrice: 120 }, 100],
] as const) {
  assert.equal(getEffectivePrice(product), expected);
  assert.equal(getDisplayPrices(product).effectivePrice, expected);
  const manualCart = calculateCartMoney({ items: [{ price: getEffectivePrice(product), quantity: 3 }], shipping: 10, promotionDiscount: 0, flashSaleDiscount: 0, couponRate: 0, pixRate: 0, pixEnabled: false });
  assert.equal(manualCart.total, expected * 3 + 10, 'manual order totals must use the same promotional price displayed in the catalog picker');
}

console.log('Cart currency rounding checks passed.');

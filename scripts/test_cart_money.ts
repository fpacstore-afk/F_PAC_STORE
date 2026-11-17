import assert from 'node:assert/strict';
import { calculateCartMoney, formatBRL, toCents } from '../src/lib/money';
import { getEffectivePrice, getDisplayPrices } from '../src/lib/utils';
import { calculateStorefrontTotals, campaignCouponOffer } from '../shared/storefrontTotals';
import type { CartItem } from '../src/types/cart';
import type { WeeklyPromotion } from '../src/types/promotions';

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

const date = Date.parse('2026-11-17T15:00:00Z');
const items = [
  { id: 'shirt', price: 89, quantity: 1 },
  { id: 'shorts', price: 69, quantity: 1 },
] as CartItem[];
const exclusive: WeeklyPromotion = {
  id: 'campaign-coupon', title: 'Camisetas', active: true, priority: 1, discount_type: 'cupom',
  discount_value: 15, coupon_code: 'CAMISA15', product_ids: ['shirt'], minimum_cart_value: 150,
  start_date: '2026-11-17T00:00:00Z', end_date: '2026-11-19T00:00:00Z',
  countdown_enabled: true, banner_image: '', description: '',
};
const automatic: WeeklyPromotion = {
  ...exclusive, id: 'auto', priority: 2, discount_type: 'percentage', coupon_code: undefined,
  discount_value: 5, product_ids: [], minimum_cart_value: 0,
};
const checkout = { items, promotions: [automatic, exclusive], now: date, shipping: 10, pixEnabled: false, city: 'Joinville' };
assert.equal(calculateStorefrontTotals(checkout).promotionDiscount, 7.90);
const withCode = calculateStorefrontTotals({ ...checkout, coupon: 'camisa 15' });
assert.equal(withCode.couponDiscount, 13.35, 'the entered campaign wins and only the selected shirt is discounted');
assert.equal(withCode.promotionDiscount, 0);
assert.equal(withCode.total, 154.65);
assert.equal(calculateStorefrontTotals({ ...checkout, coupon: 'camisa16' }).couponDiscount, 0);
assert.equal(calculateStorefrontTotals({ ...checkout, coupon: 'camisa15', items: items.slice(0, 1) }).couponDiscount, 0);
assert.equal(campaignCouponOffer([exclusive], 'camisa15', items, date + 3 * 86400000), null);
assert.equal(campaignCouponOffer([{ ...exclusive, discount_value: null }], 'camisa15', items, date), null);
assert.equal(campaignCouponOffer([{ ...exclusive, active: false }], 'camisa15', items, date), null);
assert.equal(campaignCouponOffer([{ ...exclusive, discount_value: 150 }], 'camisa15', items, date), null);

console.log('Cart currency rounding and campaign coupon checks passed.');

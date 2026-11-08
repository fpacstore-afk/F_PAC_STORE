import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatStorefrontAmount, formatStorefrontCurrency } from '../src/lib/storefrontPrice';
import { StorefrontPrice } from '../src/components/StorefrontPrice';
import { getDisplayPrices } from '../src/lib/utils';
import { calculateCartMoney } from '../src/lib/money';

for (const [price, visible] of [[149, '149'], [149.9, '149,90'], [129.05, '129,05'], [0, '0'], [1499, '1.499'], [1234.56, '1.234,56']] as const) {
  assert.equal(formatStorefrontAmount(price), visible);
  const product = { price: 199, promotionalPrice: price };
  const before = JSON.stringify(product);
  const displayed = getDisplayPrices(product);
  const html = renderToStaticMarkup(React.createElement(StorefrontPrice, { price: displayed.effectivePrice, originalPrice: displayed.hasDiscount ? displayed.originalPrice : undefined }));
  assert.ok(html.includes('Em reais'));
  assert.ok(html.includes('R$'), 'assistive technology retains the full currency name');
  assert.equal(JSON.stringify(product), before, 'presentation cannot mutate the product record');
  const total = calculateCartMoney({ items: [{ price: displayed.effectivePrice, quantity: 2 }], promotionDiscount: 0, flashSaleDiscount: 0, couponRate: 0, pixRate: 0, pixEnabled: false, shipping: 0 });
  assert.equal(total.total, Math.round(displayed.effectivePrice * 100) * 2 / 100, 'the amount offered is the exact amount used at checkout');
}
const fractional = renderToStaticMarkup(React.createElement(StorefrontPrice, { price: 79.9, originalPrice: 99.9 }));
assert.match(fractional, /79,90/); assert.match(fractional, /<del>99,90<\/del>/);
for (const originalPrice of [79.9, 70, NaN, undefined]) {
  const html = renderToStaticMarkup(React.createElement(StorefrontPrice, { price: 79.9, originalPrice }));
  assert.ok(!html.includes('<del>'), 'no invented discount when the reference is equal, lower or absent');
}
assert.equal(formatStorefrontCurrency(149), 'R$ 149');
assert.equal(formatStorefrontCurrency(149.9), 'R$ 149,90');
for (const invalid of [NaN, Infinity, -1]) {
  assert.equal(formatStorefrontAmount(invalid), 'Indisponível');
  assert.match(renderToStaticMarkup(React.createElement(StorefrontPrice, { price: invalid })), /Preço indisponível/);
}
console.log('PASS exact prices, optional zero decimals, real discount comparisons, currency accessibility and checkout consistency.');

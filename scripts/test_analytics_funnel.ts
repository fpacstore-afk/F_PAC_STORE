import assert from 'node:assert/strict';
import { buildConversionFunnel } from '../src/lib/analyticsFunnel';

const steps = buildConversionFunnel([
  { viewedProducts: ['force'], events: [{ type: 'product_color_select' }, { type: 'product_size_select' }], cartStarted: true, checkoutStarted: true, purchaseCompleted: true },
  { viewedProducts: ['mark'], events: [{ type: 'product_color_select' }, { type: 'product_size_select' }], cartStarted: true, checkoutStarted: true },
  { viewedProducts: ['prime'], events: [{ type: 'product_color_select' }] },
  { viewedProducts: [] },
]);

assert.deepEqual(steps.map(step => [step.name, step.count, step.rate]), [
  ['1. Acessou o site', 4, 100],
  ['2. Viu um produto', 3, 75],
  ['3. Escolheu uma cor', 3, 75],
  ['4. Escolheu um tamanho', 2, 50],
  ['5. Adicionou à sacola', 2, 50],
  ['6. Iniciou o checkout', 2, 50],
  ['7. Compra aprovada', 1, 25],
]);
assert.deepEqual(buildConversionFunnel([]).map(step => [step.count, step.rate]), Array.from({ length: 7 }, () => [0, 0]));
const optional = buildConversionFunnel([
  { viewedProducts: ['force'], cartStarted: true, checkoutStarted: true, purchaseCompleted: true },
  { viewedProducts: ['mark'] },
  { cartStarted: true, checkoutStarted: true },
]);
assert.equal(optional[2].dropRate, null, 'missing optional color clicks are not abandonment');
assert.equal(optional[3].dropRate, null, 'missing optional size clicks are not abandonment');
assert.equal(optional[4].dropRate, 50, 'compare the sessions that viewed a product, not unrelated returning carts');
assert.equal(optional[5].dropRate, 0);
assert.equal(optional[6].dropRate, 50, 'approved purchases are compared with the same checkout sessions');

console.log('Conversion funnel counts unique sessions by product, option, cart, checkout, and approved purchase.');

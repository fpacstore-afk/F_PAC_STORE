import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCurrencyInput } from '../shared/currencyInput';

const cases: Array<[string, number]> = [
  ['', 0],
  ['0', 0],
  ['0,01', 0.01],
  ['0,10', 0.1],
  ['0.10', 0.1],
  ['250,90', 250.9],
  ['12.50', 12.5],
  ['1.000,50', 1000.5],
  ['1000.50', 1000.5],
  ['1,000.50', 1000.5],
  ['1.000', 1000],
  ['125,5', 125.5],
  ['R$ 2.345,67', 2345.67],
  ['-10,00', 0]
];

for (const [input, expected] of cases) {
  assert.equal(parseCurrencyInput(input), expected, `${input || '(vazio)'} deveria resultar em ${expected}`);
}

const promotionForm = readFileSync('src/components/AdminPromotions.tsx', 'utf8');
const priceSimulator = readFileSync('src/components/admin/financial/profitability/PriceSimulator.tsx', 'utf8');
const productForm = readFileSync('src/components/admin/products/ProductFormWizard.tsx', 'utf8');
assert.match(promotionForm, /setDiscountValue\(e\.target\.value === '' \? '' : Number\(e\.target\.value\)\)/, 'promotion discount can be cleared');
assert.match(priceSimulator, /setDiscountPercent\(e\.target\.value === '' \? '' :/, 'price simulator discount can be cleared');
assert.match(productForm, /promotionalPrice: raw === '' \? undefined : parseFloat\(raw\)/, 'product promotional price can be cleared');

console.log(`PASS currency input parsing and blank discount fields: ${cases.length} parsing cases`);

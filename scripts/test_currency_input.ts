import assert from 'node:assert/strict';
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

console.log(`PASS currency input parsing: ${cases.length} cases`);

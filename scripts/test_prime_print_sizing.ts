import assert from 'node:assert/strict';
import {
  getCompatiblePrintSizes,
  getSafePrintSize,
  getStampPreviewStyle,
  isSizeCompatibleWithPosition,
  parseDimensionsCm,
} from '../src/lib/primePrintSizing';

const chest = {
  maxDimensions: '30x40 cm',
  coordinateStyle: {
    top: '38%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '38%',
    maxHeight: '38%',
  },
};

const sleeve = {
  maxDimensions: '10x12 cm',
  coordinateStyle: {
    top: '28%',
    left: '20%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '14%',
    maxHeight: '18%',
  },
};

const sizes = [
  { id: '5x5' },
  { id: '8x8' },
  { id: '10x12' },
  { id: '12x15' },
  { id: '30x40' },
] as const;

assert.deepEqual(parseDimensionsCm('30x40 cm'), [30, 40]);
assert.deepEqual(parseDimensionsCm('10 x 12'), [10, 12]);
assert.equal(parseDimensionsCm('invalid'), null);

assert.equal(isSizeCompatibleWithPosition('30x40', chest), true);
assert.equal(isSizeCompatibleWithPosition('30x30', chest), true);
assert.equal(isSizeCompatibleWithPosition('30x40', sleeve), false);
assert.equal(isSizeCompatibleWithPosition('10x12', sleeve), true);
assert.equal(isSizeCompatibleWithPosition('12x15', sleeve), false);

assert.deepEqual(
  getCompatiblePrintSizes(sizes, sleeve).map(size => size.id),
  ['5x5', '8x8', '10x12'],
);
assert.equal(getSafePrintSize('12x15', sizes, sleeve, '8x8'), '8x8');
assert.equal(getSafePrintSize('10x12', sizes, sleeve, '8x8'), '10x12');
assert.equal(getSafePrintSize('invalid', sizes, sleeve, 'invalid'), '5x5');

const chest20 = getStampPreviewStyle('20x20', chest);
assert.equal(chest20.width, '25.3333%');
assert.equal(chest20.height, '19%');

const sleeve8 = getStampPreviewStyle('8x8', sleeve);
assert.equal(sleeve8.width, '11.2%');
assert.equal(sleeve8.height, '12%');

console.log('PRIME print sizing checks passed.');

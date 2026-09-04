import assert from 'node:assert/strict';
import {
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

assert.deepEqual(parseDimensionsCm('30x40 cm'), [30, 40]);
assert.deepEqual(parseDimensionsCm('10 x 12'), [10, 12]);
assert.equal(parseDimensionsCm('invalid'), null);

assert.equal(isSizeCompatibleWithPosition('30x40', chest), true);
assert.equal(isSizeCompatibleWithPosition('30x30', chest), true);
assert.equal(isSizeCompatibleWithPosition('30x40', sleeve), false);
assert.equal(isSizeCompatibleWithPosition('10x12', sleeve), true);
assert.equal(isSizeCompatibleWithPosition('12x15', sleeve), false);

const chest20 = getStampPreviewStyle('20x20', chest);
assert.equal(chest20.width, '25.3333%');
assert.equal(chest20.height, '19%');

const sleeve8 = getStampPreviewStyle('8x8', sleeve);
assert.equal(sleeve8.width, '11.2%');
assert.equal(sleeve8.height, '12%');

console.log('PRIME print sizing checks passed.');

import assert from 'node:assert/strict';
import { reorderDesignCatalog } from '../src/lib/stampCatalog';
import { Design } from '../src/types/design';

function design(id: string, name: string, displayOrder: number): Design {
  return {
    id,
    code: id.toUpperCase(),
    name,
    category: 'Logos & Branding',
    collection: 'MARK',
    tags: [],
    pngUrl: '',
    mockupUrl: '',
    thumbnailUrl: '',
    author: 'Teste',
    status: 'active',
    availableForCustomization: true,
    readyToShip: false,
    displayOrder,
  };
}

const catalog = [
  design('a', 'Alpha', 10),
  design('b', 'Bravo', 20),
  design('c', 'Charlie', 30),
];

const gridResult = reorderDesignCatalog(catalog, ['a', 'b', 'c'], 'c', 'a');
assert.deepEqual(gridResult.map((item) => item.id), ['c', 'a', 'b']);
assert.deepEqual(gridResult.map((item) => item.displayOrder), [1, 2, 3]);

const filteredResult = reorderDesignCatalog(catalog, ['a', 'c'], 'c', 'a');
assert.deepEqual(filteredResult.map((item) => item.id), ['c', 'b', 'a']);
assert.deepEqual(filteredResult.map((item) => item.displayOrder), [1, 2, 3]);

const duplicateOrders = [
  design('b', 'Bravo', 9999),
  design('a', 'Alpha', 9999),
  design('c', 'Charlie', 9999),
];
const normalizedResult = reorderDesignCatalog(duplicateOrders, ['a', 'b', 'c'], 'b', 'c');
assert.deepEqual(normalizedResult.map((item) => item.id), ['a', 'c', 'b']);
assert.deepEqual(normalizedResult.map((item) => item.displayOrder), [1, 2, 3]);

console.log('Ordenação de estampas validada para grade, lista filtrada e ordens antigas duplicadas.');

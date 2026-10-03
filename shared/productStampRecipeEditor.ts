import { normalizeStampRecipeColor, sanitizeProductStampRecipe, type ProductStampRecipeEntry } from './productStampRecipe.js';
import { normalizePrimePrintSize } from './primeArtworkSizing.js';

export interface EditableProductStampRecipes {
  stampIds?: string[];
  stampSizes?: string[];
  stampIdsByColor?: Record<string, string[]>;
  stampSizesByColor?: Record<string, string[]>;
}

export function completeEditableStampRecipe(ids: string[] | undefined, sizes: string[] | undefined, stamps: { id: string; availableSizes: string[] }[]): ProductStampRecipeEntry[] {
  return sanitizeProductStampRecipe(ids, sizes).map(entry => {
    const options = stamps.find(stamp => stamp.id === entry.stampId)?.availableSizes || [];
    const registeredSize = options.find(size => normalizePrimePrintSize(size) === normalizePrimePrintSize(entry.printSize));
    return { ...entry, printSize: registeredSize || (options.length === 1 ? options[0] : entry.printSize) || '' };
  });
}

export function findStampRecipeColorKey(recipes: Record<string, string[]> | undefined, color: string): string | undefined {
  const normalized = normalizeStampRecipeColor(color);
  return Object.keys(recipes || {}).find(key => normalizeStampRecipeColor(key) === normalized);
}

export function readEditableStampRecipe(product: EditableProductStampRecipes, color?: string): ProductStampRecipeEntry[] | undefined {
  if (!color) return sanitizeProductStampRecipe(product.stampIds, product.stampSizes);
  const key = findStampRecipeColorKey(product.stampIdsByColor, color);
  if (!key) return undefined;
  const sizeKey = findStampRecipeColorKey(product.stampSizesByColor, color);
  return sanitizeProductStampRecipe(product.stampIdsByColor?.[key], sizeKey ? product.stampSizesByColor?.[sizeKey] : []);
}

export function writeEditableStampRecipe<T extends EditableProductStampRecipes>(product: T, entries: ProductStampRecipeEntry[], color?: string): T {
  const limited = entries.filter(entry => entry.stampId).slice(0, 5);
  const ids = limited.map(entry => entry.stampId);
  const sizes = limited.map(entry => entry.printSize || '');
  if (!color) return { ...product, stampIds: ids, stampSizes: sizes };

  const stampIdsByColor = { ...(product.stampIdsByColor || {}) };
  const stampSizesByColor = { ...(product.stampSizesByColor || {}) };
  const oldIdKey = findStampRecipeColorKey(stampIdsByColor, color);
  const oldSizeKey = findStampRecipeColorKey(stampSizesByColor, color);
  if (oldIdKey) delete stampIdsByColor[oldIdKey];
  if (oldSizeKey) delete stampSizesByColor[oldSizeKey];
  stampIdsByColor[color] = ids;
  stampSizesByColor[color] = sizes;
  return { ...product, stampIdsByColor, stampSizesByColor };
}

export function clearEditableStampRecipe<T extends EditableProductStampRecipes>(product: T, color: string): T {
  const stampIdsByColor = { ...(product.stampIdsByColor || {}) };
  const stampSizesByColor = { ...(product.stampSizesByColor || {}) };
  const oldIdKey = findStampRecipeColorKey(stampIdsByColor, color);
  const oldSizeKey = findStampRecipeColorKey(stampSizesByColor, color);
  if (oldIdKey) delete stampIdsByColor[oldIdKey];
  if (oldSizeKey) delete stampSizesByColor[oldSizeKey];
  return { ...product, stampIdsByColor, stampSizesByColor };
}

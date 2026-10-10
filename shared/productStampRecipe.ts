import { normalizePrimePrintSize } from './primeArtworkSizing.js';

/** A print variation is a stock-bearing choice, even when the artwork name is the same. */
export function normalizeStampRecipeColor(value: unknown): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function sanitizeStampRecipe(ids: unknown): string[] {
  return (Array.isArray(ids) ? ids : []).map(id => String(id || '').trim()).filter(Boolean).slice(0, 5);
}

export type ProductStampRecipeEntry = { stampId: string; printSize?: string };

/** Keep each configured print size aligned with the stamp in the same recipe slot. */
export function sanitizeProductStampRecipe(ids: unknown, sizes: unknown): ProductStampRecipeEntry[] {
  const rawIds = Array.isArray(ids) ? ids : [];
  const rawSizes = Array.isArray(sizes) ? sizes : [];
  return rawIds.slice(0, 5).map((value, index) => {
    const stampId = String(value || '').trim();
    const rawSize = String(rawSizes[index] || '').trim();
    const printSize = normalizePrimePrintSize(rawSize) || rawSize;
    return stampId ? { stampId, ...(printSize ? { printSize } : {}) } : null;
  }).filter((entry): entry is ProductStampRecipeEntry => Boolean(entry));
}

export function resolveProductStampRecipeEntries(product: any, color: unknown): ProductStampRecipeEntry[] {
  const byColor = product?.stampIdsByColor;
  const colorKey = normalizeStampRecipeColor(color);
  const hasColorRecipes = byColor && typeof byColor === 'object' && Object.keys(byColor).length > 0;

  if (hasColorRecipes) {
    // A product with per-color artwork must never silently fall back to a
    // different color's generic recipe. Unknown colors fail closed.
    if (!colorKey) return [];
    const matchedKey = Object.keys(byColor).find(key => normalizeStampRecipeColor(key) === colorKey);
    if (!matchedKey) return [];

    const sizesByColor = product?.stampSizesByColor;
    const sizeKey = sizesByColor && typeof sizesByColor === 'object'
      ? Object.keys(sizesByColor).find(key => normalizeStampRecipeColor(key) === colorKey)
      : undefined;
    const colorSizes = sizeKey ? sizesByColor[sizeKey] : [];
    const entries = sanitizeProductStampRecipe(byColor[matchedKey], colorSizes);
    const defaultEntries = sanitizeProductStampRecipe(product?.stampIds, product?.stampSizes);
    return entries.map((entry, index) => ({
      ...entry,
      printSize: entry.printSize || (defaultEntries[index]?.stampId === entry.stampId ? defaultEntries[index].printSize : undefined) || undefined,
    }));
  }

  const entries = sanitizeProductStampRecipe(product?.stampIds, product?.stampSizes);
  return entries.map((entry, index) => ({
    ...entry,
    printSize: entry.printSize || normalizePrimePrintSize(product?.stampSize) || undefined,
  }));
}

export function resolveProductStampRecipe(product: any, color: unknown): string[] {
  return resolveProductStampRecipeEntries(product, color).map(entry => entry.stampId);
}

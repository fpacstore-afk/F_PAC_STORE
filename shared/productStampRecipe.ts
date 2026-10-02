/** A print variation is a stock-bearing choice, even when the artwork name is the same. */
export function normalizeStampRecipeColor(value: unknown): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function sanitizeStampRecipe(ids: unknown): string[] {
  return [...new Set((Array.isArray(ids) ? ids : []).map(id => String(id || '').trim()).filter(Boolean))].slice(0, 5);
}

export function resolveProductStampRecipe(product: any, color: unknown): string[] {
  const byColor = product?.stampIdsByColor;
  const colorKey = normalizeStampRecipeColor(color);
  if (byColor && typeof byColor === 'object' && colorKey) {
    const matchedKey = Object.keys(byColor).find(key => normalizeStampRecipeColor(key) === colorKey);
    if (matchedKey) return sanitizeStampRecipe(byColor[matchedKey]);
  }
  return sanitizeStampRecipe(product?.stampIds);
}

type StockCategoryProduct = {
  category?: unknown;
  baseModel?: unknown;
  fit?: unknown;
  modeling?: unknown;
  name?: unknown;
  parentSlug?: unknown;
};

export const OVERSIZED_CATEGORY = 'Camisetas Oversized';
export const TRADITIONAL_CATEGORY = 'Camisetas Tradicionais';

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

export function categoryForBaseModel(model: unknown): string | undefined {
  const value = normalize(model);
  if (/cropped|boxy feminina/.test(value)) return 'Cropped Oversized';
  if (/tradicional|suedine|regular/.test(value)) return TRADITIONAL_CATEGORY;
  if (/oversized|boxy masculina/.test(value)) return OVERSIZED_CATEGORY;
  if (/bermuda/.test(value)) return 'Bermudas';
  if (/moletom/.test(value)) return 'Moletons';
  if (/calca/.test(value)) return 'Calças';
  if (/\bpolo\b/.test(value)) return 'Polos';
  if (/regata/.test(value)) return 'Regatas';
  if (/bone/.test(value)) return 'Bonés';
  if (/\bkit\b/.test(value)) return 'Kit F PAC';
  return undefined;
}

/** Classify old generic shirt records for stock search without changing Firestore data. */
export function getStockCategory(product: StockCategoryProduct): string {
  const savedCategory = String(product.category ?? '').trim();
  if (savedCategory && normalize(savedCategory) !== 'camisetas') return savedCategory;

  const structuredModel = categoryForBaseModel(product.baseModel)
    || categoryForBaseModel(product.fit)
    || categoryForBaseModel(product.modeling);
  if (structuredModel) return structuredModel;

  const name = normalize(product.name);
  if (/cropped|boxy feminina/.test(name)) return 'Cropped Oversized';
  if (/tradicional|suedine/.test(name)) return TRADITIONAL_CATEGORY;
  if (/oversized/.test(name)) return OVERSIZED_CATEGORY;
  if (['force', 'mark', 'prime'].includes(normalize(product.parentSlug))) return OVERSIZED_CATEGORY;
  return savedCategory || 'Peça Catalogada';
}

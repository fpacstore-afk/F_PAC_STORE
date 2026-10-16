export type CatalogSort = 'recommended' | 'best-selling' | 'newest' | 'price-asc' | 'price-desc';
export const catalogFilterKeys = ['q', 'color', 'size', 'min', 'max', 'sort', 'available', 'line', 'promo'];
const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const price = (value: string | null) => value !== null && value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? value : '';

export function readCatalogFilters(params: URLSearchParams) {
  const sort = params.get('sort') as CatalogSort;
  return {
    search: (params.get('q') || '').slice(0, 128),
    colorFilter: (params.get('color') || '').slice(0, 50),
    sizeFilter: (params.get('size') || '').slice(0, 20),
    minPrice: price(params.get('min')),
    maxPrice: price(params.get('max')),
    hideOutOfStock: params.get('available') === '1',
    sortBy: (['recommended', 'best-selling', 'newest', 'price-asc', 'price-desc'].includes(sort) ? sort : 'recommended') as CatalogSort,
  };
}

export function catalogVariantAvailable(product: any, color: string, size: string, available: (key?: string) => boolean) {
  if (!color && !size) return available();
  const colors = (product.colors || []).map((item: any) => typeof item === 'string' ? item : item?.name || item?.label || item?.color).filter(Boolean);
  const sizes = [...(product.sizes || [])];
  for (const variant of Array.isArray(product.variants) ? product.variants : []) {
    const variantColor = variant?.color || variant?.colorName || variant?.color_name;
    const variantSize = variant?.size || variant?.sizeName || variant?.size_name;
    if (variantColor && !colors.includes(variantColor)) colors.push(variantColor);
    if (variantSize && !sizes.includes(variantSize)) sizes.push(variantSize);
  }
  return colors.filter((value: string) => !color || normalize(value) === normalize(color)).some((variantColor: string) =>
    sizes.filter((value: string) => !size || normalize(value) === normalize(size)).some((variantSize: string) => available(`${variantColor}_${variantSize}`)));
}

export function catalogProductLink(base: string, color: string, size: string) {
  const params = new URLSearchParams();
  if (color) params.set('color', color);
  if (size) params.set('size', size);
  return base + (params.size ? `?${params}` : '');
}

export function catalogCreatedTime(value: any): number {
  const date = value?.toDate?.() || (typeof value?.seconds === 'number' ? new Date(value.seconds * 1000) : value);
  const result = typeof date === 'string' ? Date.parse(date) : Number(date || 0);
  return Number.isFinite(result) ? result : 0;
}

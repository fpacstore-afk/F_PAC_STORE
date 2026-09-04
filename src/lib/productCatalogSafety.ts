export interface SizeStockLike {
  size: string;
  quantity?: number;
  minStock?: number;
  reserved?: number;
}

export interface ProductLike {
  id?: string;
  slug?: string;
  status?: string;
  price?: number | string | null;
  promotionalPrice?: number | string | null;
  sizes?: string[];
  sizeStock?: SizeStockLike[];
  stock?: number;
  images?: string[];
  colors?: Array<{ name: string; hex: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

const toFiniteNonNegativeNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
};

/**
 * Normalizes catalog-facing product data without inventing business values.
 * Firestore/dynamic values remain authoritative when present.
 */
export const normalizeAuthoritativeProduct = <T extends ProductLike>(product: T): T => {
  const normalized = { ...product } as T;

  const price = toFiniteNonNegativeNumber(product.price);
  if (price !== null) normalized.price = price;

  if (product.promotionalPrice !== undefined && product.promotionalPrice !== null) {
    const promotionalPrice = toFiniteNonNegativeNumber(product.promotionalPrice);
    normalized.promotionalPrice = promotionalPrice === null ? null : promotionalPrice;
  }

  if (Array.isArray(product.colors)) {
    normalized.colors = product.colors.map(color => ({ ...color }));
  }
  if (Array.isArray(product.images)) {
    normalized.images = [...product.images];
  }
  if (Array.isArray(product.sizes)) {
    normalized.sizes = [...product.sizes];
  }
  if (Array.isArray(product.sizeStock)) {
    normalized.sizeStock = product.sizeStock.map(item => ({ ...item }));
  }

  return normalized;
};

/**
 * Returns stock rows for the editor without fabricating physical quantity.
 * Existing explicit rows are preserved. Missing rows start at zero.
 */
export const deriveSafeSizeStock = (
  sizes: readonly string[] | undefined,
  existing: readonly SizeStockLike[] | undefined,
  defaultMinStock = 2,
): SizeStockLike[] => {
  const normalizedSizes = (sizes || []).filter(size => typeof size === 'string' && size.trim() !== '');
  const existingBySize = new Map((existing || []).map(item => [item.size, item]));

  return normalizedSizes.map(size => {
    const current = existingBySize.get(size);
    return {
      size,
      quantity: Math.max(0, Number(current?.quantity) || 0),
      minStock: Math.max(0, Number(current?.minStock) || defaultMinStock),
      reserved: Math.max(0, Number(current?.reserved) || 0),
    };
  });
};

export const calculatePhysicalStockTotal = (rows: readonly SizeStockLike[] | undefined): number =>
  (rows || []).reduce((total, row) => total + Math.max(0, Number(row.quantity) || 0), 0);

export const isSellableCatalogProduct = (product: ProductLike): boolean => {
  const slug = String(product.slug || '').toLowerCase();
  const id = String(product.id || '').toLowerCase();
  const isTest = slug.includes('test') || slug.includes('teste') || id.includes('test') || id.includes('teste');
  if (isTest) return false;
  if (product.status === 'hidden' || product.status === 'inactive') return false;
  return Array.isArray(product.images) && product.images.some(image => typeof image === 'string' && image.trim() !== '');
};

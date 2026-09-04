export interface CatalogProductLike {
  id?: string;
  slug?: string;
  sku?: string;
  name?: string;
  status?: string;
  parentSlug?: string;
  images?: string[];
  colors?: Array<Record<string, any>>;
  sizes?: string[];
  price?: number | string;
  promotionalPrice?: number | string | null;
  [key: string]: any;
}

const normalizeKey = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export const isStructuralCatalogModel = (product: CatalogProductLike): boolean => {
  const slug = normalizeKey(product.slug);
  return slug === 'force' || slug === 'mark' || slug === 'prime';
};

export const isTestCatalogProduct = (product: CatalogProductLike): boolean => {
  const slug = normalizeKey(product.slug);
  const name = normalizeKey(product.name);
  return (
    slug.includes('teste') ||
    slug.includes('test') ||
    name.includes('teste') ||
    name.includes('test') ||
    name.includes('produto teste pagamento')
  );
};

export const normalizeCatalogProduct = <T extends CatalogProductLike>(product: T): T => {
  const normalized: CatalogProductLike = { ...product };

  if (Array.isArray(product.images)) normalized.images = [...product.images].filter(Boolean);
  if (Array.isArray(product.colors)) normalized.colors = product.colors.map(color => ({ ...color }));
  if (Array.isArray(product.sizes)) normalized.sizes = [...product.sizes].filter(size => typeof size === 'string' && size.trim().length > 0);

  if (product.price !== undefined && product.price !== null) {
    const parsed = typeof product.price === 'number' ? product.price : Number.parseFloat(product.price);
    if (Number.isFinite(parsed)) normalized.price = parsed;
  }

  if (product.promotionalPrice !== undefined && product.promotionalPrice !== null) {
    const parsed = typeof product.promotionalPrice === 'number'
      ? product.promotionalPrice
      : Number.parseFloat(product.promotionalPrice);
    normalized.promotionalPrice = Number.isFinite(parsed) ? parsed : undefined;
  }

  return normalized as T;
};

export const mergeCatalogProducts = <T extends CatalogProductLike>(
  staticProducts: readonly T[],
  dynamicProducts: readonly CatalogProductLike[],
): T[] => {
  const merged = staticProducts.map(staticProduct => {
    const dynamicProduct = dynamicProducts.find(candidate =>
      (candidate.id && staticProduct.id && candidate.id === staticProduct.id) ||
      (normalizeKey(candidate.slug) && normalizeKey(candidate.slug) === normalizeKey(staticProduct.slug)),
    );
    return normalizeCatalogProduct({ ...staticProduct, ...(dynamicProduct || {}) } as T);
  });

  dynamicProducts.forEach(dynamicProduct => {
    const alreadyIncluded = staticProducts.some(staticProduct =>
      (dynamicProduct.id && staticProduct.id && dynamicProduct.id === staticProduct.id) ||
      (normalizeKey(dynamicProduct.slug) && normalizeKey(dynamicProduct.slug) === normalizeKey(staticProduct.slug)),
    );
    if (!alreadyIncluded) merged.push(normalizeCatalogProduct(dynamicProduct as T));
  });

  return merged;
};

export const applyCatalogImageFallbacks = <T extends CatalogProductLike>(products: readonly T[]): T[] => {
  const normalized = products.map(product => normalizeCatalogProduct(product));
  const bySlug = new Map(normalized.map(product => [normalizeKey(product.slug), product]));

  return normalized.map(product => {
    if (!product.parentSlug || (product.images && product.images.length > 0)) return product;
    const parent = bySlug.get(normalizeKey(product.parentSlug));
    if (!parent?.images?.length) return product;
    return { ...product, images: [...parent.images] } as T;
  });
};

export const isSellableCatalogProduct = (product: CatalogProductLike): boolean => {
  if (isTestCatalogProduct(product) || isStructuralCatalogModel(product)) return false;
  if (normalizeKey(product.status) === 'hidden' || normalizeKey(product.status) === 'inactive' || normalizeKey(product.status) === 'archived') return false;
  return Array.isArray(product.images) && product.images.filter(Boolean).length > 0;
};

/**
 * Single catalog preparation pipeline used by storefront views.
 * Firestore/dynamic fields remain authoritative over static fallback fields;
 * parent model images are inherited only when the child truly has no image;
 * structural/test/inactive/imageless records are removed from the sellable feed.
 */
export const buildSellableCatalog = <T extends CatalogProductLike>(
  staticProducts: readonly T[],
  dynamicProducts: readonly CatalogProductLike[],
): T[] => applyCatalogImageFallbacks(mergeCatalogProducts(staticProducts, dynamicProducts))
  .filter(product => isSellableCatalogProduct(product));

export const resolveCatalogProduct = <T extends CatalogProductLike>(
  slugOrId: string,
  staticProducts: readonly T[],
  dynamicProducts: readonly CatalogProductLike[],
): T | null => {
  const target = normalizeKey(decodeURIComponent(slugOrId));
  const merged = applyCatalogImageFallbacks(mergeCatalogProducts(staticProducts, dynamicProducts));
  const found = merged.find(product =>
    normalizeKey(product.slug) === target ||
    normalizeKey(product.id) === target ||
    normalizeKey(product.sku) === target,
  );
  return found ? normalizeCatalogProduct(found) : null;
};

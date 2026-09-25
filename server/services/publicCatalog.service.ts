import { getDb } from '../firebase.js';
import { getVariantStats } from './store.service.js';
import { isProductPublished, normalizeProductStatus } from '../../shared/productPublication.js';

const scalarFields = ['slug', 'sku', 'name', 'headline', 'description', 'status', 'parentSlug', 'category', 'productType', 'collection', 'line', 'sizeSystem', 'price', 'promotionalPrice', 'is_prime', 'customizable', 'baseModel', 'fit', 'modeling', 'material', 'gsm', 'isNew', 'isBestseller', 'isLimitedEdition', 'weight', 'width', 'height', 'length', 'fabric', 'collar', 'printDetails', 'videoUrl', 'pixDiscountPercent', 'maxInstallments', 'stampSize', 'seal', 'displayOrder', 'brand', 'productFinish'];
const listFields = ['images', 'collections', 'lines', 'sizes', 'tags', 'specs', 'careInstructions', 'imageStampSizes', 'stampGallery', 'stampGallerySizes'];
const nestedFields: Record<string, string[]> = {
  colors: ['name', 'label', 'hex', 'images', 'status', 'available'],
  colorVariants: ['name', 'hex', 'images'],
  variants: ['sku', 'size', 'colorName', 'price', 'active'],
  mockups: ['id', 'url', 'colorName', 'type', 'isPrimary', 'order', 'altText'],
  videos: ['id', 'url', 'title', 'order', 'status'],
  sizeChart: ['size', 'length', 'width', 'sleeve', 'notes'],
};
const scalar = (value: unknown) => value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value));

/** Whitelist at every nesting level: costs, suppliers and arbitrary metadata never pass through. */
export function projectPublicProduct(id: string, source: Record<string, any>) {
  if (!isProductPublished(source)) return null;
  const item: Record<string, any> = { id };
  for (const field of scalarFields) if (source[field] !== undefined && scalar(source[field])) item[field] = source[field];
  item.status = normalizeProductStatus(source.status);
  for (const field of listFields) if (Array.isArray(source[field])) item[field] = source[field].filter((v: unknown) => typeof v === 'string');
  for (const [field, allowed] of Object.entries(nestedFields)) {
    if (!Array.isArray(source[field])) continue;
    item[field] = source[field].flatMap((entry: any) => {
      if (field === 'colors' && typeof entry === 'string') return [{ name: entry }];
      if (!entry || typeof entry !== 'object') return [];
      const projected: Record<string, any> = {};
      for (const key of allowed) {
        if (key === 'images' && Array.isArray(entry[key])) projected[key] = entry[key].filter((v: unknown) => typeof v === 'string');
        else if (entry[key] !== undefined && scalar(entry[key])) projected[key] = entry[key];
      }
      return [projected];
    });
  }
  const createdAt = typeof source.createdAt?.toDate === 'function' ? source.createdAt.toDate().toISOString() : source.createdAt;
  if (typeof createdAt === 'string') item.createdAt = createdAt;
  return item;
}

/** Available-to-buy quantities only; no physical stock, reservations, costs or supplier data. */
export function projectPublicAvailability(source: Record<string, any>) {
  const variants: Record<string, { available: boolean; availableQuantity: number }> = Object.create(null);
  for (const [key, value] of Object.entries(source.variants || {})) {
    if (!value || typeof value !== 'object') continue;
    const stats = getVariantStats(value);
    const raw = value as any;
    const quantity = source.available !== false && source.active !== false && raw.available !== false && stats.active !== false
      ? Math.max(0, Math.floor(Number.isFinite(stats.availableQuantity) ? stats.availableQuantity : 0)) : 0;
    variants[key] = { available: quantity > 0, availableQuantity: quantity };
  }
  const availableQuantity = Object.values(variants).reduce((sum, v) => sum + v.availableQuantity, 0);
  return { available: availableQuantity > 0, availableQuantity, variants };
}

export async function loadPublicCatalog(database = getDb()) {
  const [productSnapshot, inventorySnapshot] = await Promise.all([
    database.collection('products').get(), database.collection('inventory').get(),
  ]);
  const products = productSnapshot.docs.map(doc => projectPublicProduct(doc.id, doc.data() || {})).filter(Boolean);
  const allowedIds = new Set(products.flatMap(product => [product!.id, product!.slug, product!.parentSlug].filter(Boolean)));
  const availability: Record<string, ReturnType<typeof projectPublicAvailability>> = Object.create(null);
  for (const doc of inventorySnapshot.docs) if (allowedIds.has(doc.id)) availability[doc.id] = projectPublicAvailability(doc.data() || {});
  return { products, count: products.length, availability };
}

export function createPublicCatalogLoader(load = () => loadPublicCatalog(), now = () => Date.now()) {
  let pending: ReturnType<typeof load> | null = null;
  let expires = 0;
  return () => {
    if (!pending || now() >= expires) {
      expires = now() + 30_000;
      pending = load().catch(error => { pending = null; throw error; });
    }
    return pending;
  };
}
export const getPublicCatalog = createPublicCatalogLoader();

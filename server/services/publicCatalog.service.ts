import { resolveGarmentBase, stockSlug, garmentAvailability, countedReadyInventory } from '../../shared/sharedGarmentStock.js';
import { getDb } from '../firebase.js';
import { getVariantStats } from './store.service.js';
import { isProductPublished, normalizeProductStatus } from '../../shared/productPublication.js';
import { isPrimeBaseProduct } from '../../shared/primeBaseProduct.js';
import { createCachedRequest } from '../../shared/cachedRequest.js';

const scalarFields = ['slug', 'sku', 'name', 'headline', 'description', 'status', 'parentSlug', 'category', 'productType', 'collection', 'line', 'sizeSystem', 'price', 'promotionalPrice', 'is_prime', 'customizable', 'baseModel', 'fit', 'modeling', 'material', 'gsm', 'isNew', 'isBestseller', 'isLimitedEdition', 'weight', 'width', 'height', 'length', 'fabric', 'collar', 'printDetails', 'videoUrl', 'pixDiscountPercent', 'maxInstallments', 'stampSize', 'seal', 'displayOrder', 'brand', 'productFinish', 'stockBaseSlug', 'stockMode'];
const listFields = ['images', 'collections', 'lines', 'sizes', 'tags', 'specs', 'careInstructions', 'imageStampSizes', 'stampGallery', 'stampGallerySizes'];
const nestedFields: Record<string, string[]> = {
  colors: ['name', 'label', 'hex', 'images', 'status', 'available', 'active'],
  colorVariants: ['name', 'hex', 'images'],
  variants: ['sku', 'size', 'colorName', 'price', 'active'],
  mockups: ['id', 'url', 'colorName', 'type', 'isPrimary', 'order', 'altText'],
  videos: ['id', 'url', 'title', 'order', 'status'],
  sizeChart: ['size', 'length', 'width', 'sleeve', 'notes'],
};
const scalar = (value: unknown) => value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value));
const publicStampIds = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((id): id is string => typeof id === 'string' && /^[\w-]{1,150}$/.test(id)).slice(0, 5)
  : [];

/** Whitelist at every nesting level: costs, suppliers and arbitrary metadata never pass through. */
export function projectPublicProduct(id: string, source: Record<string, any>) {
  if (!isProductPublished(source)) return null;
  const item: Record<string, any> = { id };
  for (const field of scalarFields) if (source[field] !== undefined && scalar(source[field])) item[field] = source[field];
  item.status = normalizeProductStatus(source.status);
  // Only public artwork identifiers, never print sizes, usage, costs or stock-bearing recipes.
  if (Array.isArray(source.stampIds)) item.stampIds = publicStampIds(source.stampIds);
  if (source.stampIdsByColor && typeof source.stampIdsByColor === 'object' && !Array.isArray(source.stampIdsByColor)) {
    item.stampIdsByColor = Object.fromEntries(Object.entries(source.stampIdsByColor)
      .filter(([color, ids]) => color.length <= 80 && Array.isArray(ids))
      .slice(0, 64).map(([color, ids]) => [color, publicStampIds(ids)]));
  }
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

/** Plain garments are offered only as PRIME bases, never as printed catalog items. */
export function projectPrimeBase(id: string, source: Record<string, any>) {
  if (!isPrimeBaseProduct(source)) return null;
  const publicData = projectPublicProduct(id, { ...source, status: 'active', productFinish: 'printed' })!;
  const base: Record<string, any> = { id, productFinish: 'plain' };
  for (const key of ['slug', 'name', 'status', 'baseModel', 'category', 'productType', 'fit', 'modeling', 'colors', 'sizes', 'variants', 'price', 'sizeChart']) {
    if (publicData[key] !== undefined) base[key] = publicData[key];
  }
  return base;
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
  const rawProducts = productSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  const products = rawProducts.map(product => {
    const projected = projectPublicProduct(product.id, product);
    const base = resolveGarmentBase(product, rawProducts);
    if (projected && !base) delete projected.stockBaseSlug;
    return projected && base ? { ...projected, stockBaseSlug: stockSlug(base), fulfillment: 'made_to_order' } : projected;
  }).filter(Boolean);
  const primeBases = productSnapshot.docs.map(doc => projectPrimeBase(doc.id, doc.data() || {})).filter(Boolean);
  const allowedIds = new Set([...products, ...primeBases].flatMap(product => [product!.id, product!.slug, product!.parentSlug, product!.stockBaseSlug].filter(Boolean)));
  const availability: Record<string, ReturnType<typeof projectPublicAvailability>> = Object.create(null);
  for (const doc of inventorySnapshot.docs) if (allowedIds.has(doc.id)) availability[doc.id] = projectPublicAvailability(doc.data() || {});
  const inventories = new Map(inventorySnapshot.docs.map(doc => [doc.id, doc.data()]));
  for (const product of rawProducts) {
    const base = resolveGarmentBase(product, rawProducts);
    if (!products.some(p => p!.id === product.id)) continue;
    if (!base && product.productFinish !== 'printed') continue;
    const slug = stockSlug(product);
    availability[slug] = base ? garmentAvailability(product, base, inventories.get(slug), inventories.get(stockSlug(base))) : projectPublicAvailability(countedReadyInventory(inventories.get(slug)) || {});
    availability[product.id] = availability[slug];
  }
  return { products, primeBases, count: products.length, availability };
}

export function createPublicCatalogLoader(load = () => loadPublicCatalog(), now = () => Date.now()) {
  // Pause retries during a database outage, and keep slow requests single-flight.
  // Checkout still validates prices and stock against the authoritative database.
  return createCachedRequest(load, { now });
}
export const getPublicCatalog = createPublicCatalogLoader();

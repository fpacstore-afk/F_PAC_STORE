import { applyGarmentProfile, garmentFamily, garmentProfiles, requiresGarmentClassification } from '../../shared/garmentModels';
import { resolveGarmentBase, stockSlug, garmentAvailability, countedReadyInventory } from '../../shared/sharedGarmentStock.js';
import { getDb } from '../firebase.js';
import { getVariantStats } from './store.service.js';
import { isProductPublished, normalizeProductStatus } from '../../shared/productPublication.js';
import { isPrimeBaseProduct } from '../../shared/primeBaseProduct.js';
import { createCachedRequest } from '../../shared/cachedRequest.js';

const scalarFields = ['slug', 'sku', 'name', 'headline', 'description', 'status', 'parentSlug', 'category', 'productType', 'collection', 'line', 'sizeSystem', 'price', 'promotionalPrice', 'is_prime', 'customizable', 'baseModel', 'fit', 'modeling', 'material', 'gsm', 'isNew', 'isBestseller', 'isLimitedEdition', 'weight', 'width', 'height', 'length', 'fabric', 'collar', 'printDetails', 'videoUrl', 'pixDiscountPercent', 'maxInstallments', 'stampSize', 'seal', 'displayOrder', 'brand', 'productFinish', 'stockBaseSlug', 'stockMode', 'garmentModelId', 'garmentModelName', 'neckline', 'garmentModelRevision', 'shrinkage', 'sizeChartMode', 'modelSeparationRequired', 'modelClassificationPending'];
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
  for (const key of ['slug', 'name', 'status', 'baseModel', 'category', 'productType', 'fit', 'modeling', 'colors', 'sizes', 'variants', 'price', 'sizeChart', 'garmentModelId', 'garmentModelName', 'neckline', 'collar', 'fabric', 'gsm', 'specs', 'shrinkage', 'sizeChartMode', 'modelClassificationPending', 'modelSeparationRequired']) {
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
  const modelConfig = await database.collection('pricing_workbench').doc('catalog').get();
  const profiles = garmentProfiles(modelConfig.data()?.catalog);
  const rawProducts = productSnapshot.docs.map(doc => applyGarmentProfile({ ...doc.data(), id: doc.id }, profiles));
  const products = rawProducts.map(product => {
    const projected = projectPublicProduct(product.id, product);
    const base = resolveGarmentBase(product, rawProducts);
    if (projected && !base) delete projected.stockBaseSlug;
    if (projected && base?.garmentModelId) Object.assign(projected, ...['garmentModelId','garmentModelName','neckline','collar','sizeChartMode','sizeChart','fabric','gsm','fit','specs'].map(key => ({ [key]: base[key] })));
    if (projected && garmentFamily(product) && product.modelSeparationRequired && !product.garmentModelId) {
      projected.garmentOptions = rawProducts.filter(p => p.productFinish === 'plain' && p.garmentModelId && p.baseModel === product.baseModel && !['inactive','archived'].includes(p.status)).map(p => projectPrimeBase(p.id, p)).filter(Boolean);
    }
    return projected && base ? { ...projected, stockBaseSlug: stockSlug(base), fulfillment: 'made_to_order' } : projected;
  }).filter(Boolean);
  const primeBases = rawProducts.map(product => projectPrimeBase(product.id, product)).filter(Boolean);
  const allowedIds = new Set([...products, ...primeBases].flatMap(product => [product!.id, product!.slug, product!.parentSlug, product!.stockBaseSlug].filter(Boolean)));
  const availability: Record<string, ReturnType<typeof projectPublicAvailability>> = Object.create(null);
  for (const doc of inventorySnapshot.docs) if (allowedIds.has(doc.id)) {
    const owner = rawProducts.find(p => [p.id,p.slug].includes(doc.id));
    availability[doc.id] = requiresGarmentClassification(owner) ? { available: false, availableQuantity: 0, variants: {} } : projectPublicAvailability(doc.data() || {});
  }
  const inventories = new Map(inventorySnapshot.docs.map(doc => [doc.id, doc.data()]));
  for (const product of rawProducts) {
    const base = resolveGarmentBase(product, rawProducts);
    if (!products.some(p => p!.id === product.id)) continue;
    if (!base && product.productFinish !== 'printed') continue;
    const slug = stockSlug(product);
    availability[slug] = base ? garmentAvailability(product, base, inventories.get(slug), inventories.get(stockSlug(base))) : projectPublicAvailability(countedReadyInventory(inventories.get(slug)) || {});
    if (requiresGarmentClassification(product)) {
      const options = products.find(p => p!.id === product.id)?.garmentOptions || [];
      const variants: Record<string, any> = {};
      for (const option of options) for (const [key, value] of Object.entries(availability[option.slug || option.id]?.variants || {})) {
        const quantity = Number((value as any).availableQuantity || 0) + Number(variants[key]?.availableQuantity || 0);
        variants[key] = { available: quantity > 0, availableQuantity: quantity };
      }
      const total = Object.values(variants).reduce((n: number, v: any) => n + v.availableQuantity, 0);
      availability[slug] = { available: total > 0, availableQuantity: total, variants };
    }
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

import { garmentFamily, garmentTitle, requiresGarmentClassification, sameGarmentModel } from './garmentModels';

/** One physical garment pool serves every artwork using that exact base model. */
export type StockProduct = { id?: string; slug?: string; parentSlug?: string; productFinish?: string; baseModel?: string; stockBaseSlug?: string; stockMode?: string; status?: string; [key: string]: any };
export type InventoryAllocation = { productSlug: string; variantKey: string; quantity: number; source: 'plain' | 'ready' };
const normalized = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
export const stockSlug = (product: StockProduct) => String(product.slug || product.id || '').trim();

/** Legacy Suedine templates may switch supplier, never silently switch fabric. */
export function compatibleGarmentSource(product: StockProduct, base: StockProduct) {
  const model = normalized(product.baseModel);
  if (model !== normalized(base.baseModel)) return false;
  if ((base.confirmedBaseModels || []).some((value: string) => normalized(value) === model)) return true;
  if (!base.garmentModelId || product.garmentModelId) return true;
  if (/suedine|oversized premium 240gsm/.test(model)) return /suedine/.test(normalized(base.sourceProductName || base.name));
  return true;
}

export function resolveGarmentBase(product: StockProduct, products: StockProduct[]): StockProduct | undefined {
  if (product.productFinish === 'plain' || product.stockMode === 'ready_only') return undefined;
  const bases = products.filter(p => p.productFinish === 'plain' && !['archived', 'inactive'].includes(String(p.status)));
  if (requiresGarmentClassification(product)) return undefined;
  if (product.stockBaseSlug) return bases.find(p => [p.id, p.slug].includes(product.stockBaseSlug) && sameGarmentModel(product, p));
  const model = normalized(product.baseModel);
  if (!model || /outro|sem modelo/.test(model)) return undefined;
  const matches = bases.filter(p => compatibleGarmentSource(product, p) && sameGarmentModel(product, p));
  // Ambiguous physical bases need an explicit choice, never an invented pool.
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolveItemGarmentBase(item: any, product: StockProduct | undefined, products: StockProduct[]) {
  if (product?.garmentModelId && item.garmentModelId && product.garmentModelId !== item.garmentModelId) throw new Error('O modelo da peça mudou. Confira sua escolha antes de comprar.');
  if (product?.productFinish === 'plain') return requiresGarmentClassification(product) ? undefined : product;
  if (product && item.garmentModelId && !product.garmentModelId) {
    return resolveGarmentBase({ ...product, garmentModelId: item.garmentModelId, stockBaseSlug: undefined }, products);
  }
  if (product) return resolveGarmentBase(product, products);
  if (item.garmentModelId) {
    const candidates = products.filter(p => p.productFinish === 'plain' && p.garmentModelId === item.garmentModelId && !['inactive', 'archived'].includes(String(p.status)));
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  return resolveManualGarmentBase(item.customDetails?.model, products);
}

export function resolveManualGarmentBase(model: unknown, products: StockProduct[]) {
  const names: Record<string, string> = { tradicional: 'Tradicional Suedine', oversized: 'Oversized Premium 240GSM', cropped: 'Cropped Oversized Feminino', cargo: 'Bermuda Linho Cargo' };
  return resolveGarmentBase({ baseModel: names[normalized(model)] || String(model || '') }, products);
}

export function variantAvailable(data: any, key: string): number {
  const variant = data?.variants?.[key];
  if (!variant || data.active === false || data.available === false || variant.active === false || variant.available === false) return 0;
  const physical = Number(variant.physicalQuantity ?? variant.stock ?? 0);
  const reserved = Number(variant.reservedQuantity ?? variant.reserved ?? 0);
  if (!Number.isSafeInteger(physical) || !Number.isSafeInteger(reserved) || physical < 0 || reserved < 0) return 0;
  return Math.max(0, physical - reserved);
}

export function isGarmentVariantAllowed(product: StockProduct, key: string): boolean {
  const colors = Array.isArray(product.colors) ? product.colors.filter((c: any) => typeof c === 'string' || (c?.active !== false && c?.available !== false && c?.status !== 'inactive')).map((c: any) => typeof c === 'string' ? c : c.name) : [];
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  const size = sizes.find((value: string) => key.endsWith(`_${value}`));
  const color = size ? key.slice(0, -(size.length + 1)) : key.slice(0, key.lastIndexOf('_'));
  const restricted = (product.sourceRestrictions || product.restrictions || []).some((rule: any) => (rule.colors || []).some((value: string) => normalized(value) === normalized(color)) && !(rule.sizes || []).includes(size));
  const configured = (product.variants || []).find((variant: any) => variant.colorName === color && variant.size === size);
  return !restricted && configured?.active !== false && (!colors.length || colors.some((color: string) => key.startsWith(`${color}_`))) && (!sizes.length || Boolean(size));
}

/** Legacy catalog quantities described sale options, not physical ready pieces.
 * Preserve those records but admit ready stock only after an explicit physical count. */
export function countedReadyInventory(source: any) {
  if (!source) return source;
  return { ...source, variants: Object.fromEntries(Object.entries(source.variants || {}).map(([key, value]: [string, any]) => [key, value.physicalCountVerified === true ? value : { ...value, physicalQuantity: 0, stock: 0, reservedQuantity: 0, availableQuantity: 0, available: false }])) };
}

/** Available-to-buy projection. Ready pieces and shared blanks stay physically separate. */
export function garmentAvailability(product: StockProduct, base: StockProduct, own: any, plain: any) {
  const variants: Record<string, { available: boolean; availableQuantity: number; readyQuantity: number; madeToOrderQuantity: number }> = {};
  for (const key of new Set([...Object.keys(own?.variants || {}), ...Object.keys(plain?.variants || {})])) {
    const allowed = isGarmentVariantAllowed(product, key);
    const readyQuantity = allowed ? variantAvailable(countedReadyInventory(own), key) : 0;
    const madeToOrderQuantity = allowed && isGarmentVariantAllowed(base, key) ? variantAvailable(plain, key) : 0;
    const availableQuantity = readyQuantity + madeToOrderQuantity;
    variants[key] = { available: availableQuantity > 0, availableQuantity, readyQuantity, madeToOrderQuantity };
  }
  const availableQuantity = Object.values(variants).reduce((sum, v) => sum + v.availableQuantity, 0);
  return { available: availableQuantity > 0, availableQuantity, variants };
}

/** Resolve exactly the same physical sources for the UI and transactional orders. */
function garmentStockSources(item: any, products: StockProduct[], inventories: Map<string, any>, used: Map<string, number>) {
  const product = products.find(p => [p.id, p.slug].filter(Boolean).some(id => [item.productId, item.slug, item.baseProductSlug].includes(id)));
  const base = resolveItemGarmentBase(item, product, products);
  if ((requiresGarmentClassification(product) || item.garmentModelId) && !base) throw new Error('Escolha um modelo com estoque conferido. As peças misturadas aguardam separação por fornecedor.');
  const readySlug = String(product ? (product.parentSlug || stockSlug(product)) : (item.parentSlug || item.slug || item.productId || item.id || ''));
  const variantKey = String(item.variantKey || `${item.color}_${item.size}`);
  if (product && !isGarmentVariantAllowed(product, variantKey)) throw new Error(`Variação indisponível: ${item.color} ${item.size}.`);
  const remaining = (slug: string) => Math.max(0, variantAvailable(inventories.get(slug), variantKey) - (used.get(`${slug}::${variantKey}`) || 0));
  const readyInventory = inventories.get(readySlug);
  const readyVerified = product?.productFinish !== 'printed' || readyInventory?.variants?.[variantKey]?.physicalCountVerified === true;
  const readyQuantity = product?.productFinish === 'plain' || !readyVerified || requiresGarmentClassification(product) || Boolean(base?.garmentModelId && !product?.garmentModelId) ? 0 : remaining(readySlug);
  const baseSlug = base && stockSlug(base);
  const plainQuantity = baseSlug && isGarmentVariantAllowed(base!, variantKey) ? remaining(baseSlug) : 0;
  return { product, base, readySlug, baseSlug, variantKey, readyQuantity, plainQuantity, availableQuantity: readyQuantity + plainQuantity };
}

/** Draft lines share the pool too, but this preview never changes a real balance. */
export function garmentOrderBalance(item: any, products: StockProduct[], inventories: Map<string, any>, draftItems: any[] = []) {
  const used = new Map<string, number>();
  for (const line of allocateGarments(draftItems, products, inventories)) for (const allocation of line.inventoryAllocations) {
    const key = `${allocation.productSlug}::${allocation.variantKey}`;
    used.set(key, (used.get(key) || 0) + allocation.quantity);
  }
  const balance = garmentStockSources(item, products, inventories, used);
  return { availableQuantity: balance.availableQuantity, readyQuantity: balance.readyQuantity, plainQuantity: balance.plainQuantity, stockBaseSlug: balance.baseSlug, garmentModelName: balance.base?.garmentModelName || balance.product?.garmentModelName || '' };
}

/** Allocate all designs together; never validate each against the same untouched pool. */
export function allocateGarments(items: any[], products: StockProduct[], inventories: Map<string, any>) {
  const used = new Map<string, number>();
  return items.map(item => {
    const { product, base, readySlug, baseSlug, variantKey, readyQuantity, plainQuantity } = garmentStockSources(item, products, inventories, used);
    const requested = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const ready = Math.min(requested, readyQuantity);
    const plain = Math.min(requested - ready, plainQuantity);
    if (ready + plain < requested) {
      const error: any = new Error(`Estoque disponível insuficiente para "${item.name || readySlug}" (${item.color} - ${item.size}). Disponível: ${ready + plain}, Solicitado: ${requested}`);
      error.name = 'OutOfStockError'; error.details = { item: item.name || readySlug, requested, available: ready + plain };
      throw error;
    }
    const allocations: InventoryAllocation[] = [];
    for (const [slug, quantity, source] of [[readySlug, ready, 'ready'], [baseSlug, plain, 'plain']] as const) {
      if (!slug || !quantity) continue;
      allocations.push({ productSlug: slug, variantKey, quantity, source });
      const key = `${slug}::${variantKey}`;
      used.set(key, (used.get(key) || 0) + quantity);
    }
    // Ignore caller-supplied allocations; these come exclusively from authoritative balances.
    const modelSource = base?.garmentModelId ? base : product;
    const modelSnapshot = modelSource?.garmentModelId ? { garmentModelId: modelSource.garmentModelId, garmentModelName: modelSource.garmentModelName || '', neckline: modelSource.neckline || '', name: garmentTitle(String(item.name || product?.name || ''), modelSource) } : {};
    return { ...item, ...modelSnapshot, inventoryAllocations: allocations, ...(baseSlug ? { stockBaseSlug: baseSlug } : {}), ...(plain ? { printProcurementStatus: 'to_order', madeToOrderQuantity: plain } : { madeToOrderQuantity: 0 }) };
  });
}

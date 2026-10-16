/** One physical garment pool serves every artwork using that exact base model. */
export type StockProduct = { id?: string; slug?: string; parentSlug?: string; productFinish?: string; baseModel?: string; stockBaseSlug?: string; stockMode?: string; status?: string; [key: string]: any };
export type InventoryAllocation = { productSlug: string; variantKey: string; quantity: number; source: 'plain' | 'ready' };
const normalized = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
export const stockSlug = (product: StockProduct) => String(product.slug || product.id || '').trim();

export function resolveGarmentBase(product: StockProduct, products: StockProduct[]): StockProduct | undefined {
  if (product.productFinish === 'plain' || product.stockMode === 'ready_only') return undefined;
  const bases = products.filter(p => p.productFinish === 'plain' && !['archived', 'inactive'].includes(String(p.status)));
  if (product.stockBaseSlug) return bases.find(p => [p.id, p.slug].includes(product.stockBaseSlug));
  const model = normalized(product.baseModel);
  if (!model || /outro|sem modelo/.test(model)) return undefined;
  const matches = bases.filter(p => normalized(p.baseModel) === model);
  // Ambiguous physical bases need an explicit choice, never an invented pool.
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolveManualGarmentBase(model: unknown, products: StockProduct[]) {
  const names: Record<string, string> = { tradicional: 'Tradicional Suedine', oversized: 'Oversized Premium 240GSM', cropped: 'Cropped Oversized Feminino', cargo: 'Bermuda Linho Cargo' };
  return resolveGarmentBase({ baseModel: names[normalized(model)] || String(model || '') }, products);
}

export function variantAvailable(data: any, key: string): number {
  const variant = data?.variants?.[key];
  if (!variant || data.active === false || data.available === false || variant.active === false || variant.available === false) return 0;
  return Math.max(0, Number(variant.physicalQuantity ?? variant.stock ?? 0) - Number(variant.reservedQuantity ?? variant.reserved ?? 0));
}

export function isGarmentVariantAllowed(product: StockProduct, key: string): boolean {
  const colors = Array.isArray(product.colors) ? product.colors.filter((c: any) => typeof c === 'string' || (c?.active !== false && c?.available !== false && c?.status !== 'inactive')).map((c: any) => typeof c === 'string' ? c : c.name) : [];
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  return (!colors.length || colors.some((color: string) => key.startsWith(`${color}_`))) && (!sizes.length || sizes.some((size: string) => key.endsWith(`_${size}`)));
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

/** Allocate all designs together; never validate each against the same untouched pool. */
export function allocateGarments(items: any[], products: StockProduct[], inventories: Map<string, any>) {
  const used = new Map<string, number>();
  const take = (slug: string, variant: string, requested: number) => {
    const key = `${slug}::${variant}`;
    const quantity = Math.min(requested, Math.max(0, variantAvailable(inventories.get(slug), variant) - (used.get(key) || 0)));
    used.set(key, (used.get(key) || 0) + quantity);
    return quantity;
  };
  return items.map(item => {
    const product = products.find(p => [p.id, p.slug].filter(Boolean).some(id => [item.productId, item.slug, item.baseProductSlug].includes(id)));
    const customModel = item.customProduct && item.customDetails?.model;
    const base = product?.productFinish === 'plain' ? product : (product ? resolveGarmentBase(product, products) : resolveManualGarmentBase(customModel, products));
    const readySlug = String(product ? (product.parentSlug || stockSlug(product)) : (item.parentSlug || item.slug || item.productId || item.id || ''));
    const variantKey = String(item.variantKey || `${item.color}_${item.size}`);
    const requested = Math.max(1, Math.floor(Number(item.quantity) || 1));
    if (product && !isGarmentVariantAllowed(product, variantKey)) throw new Error(`Variação indisponível: ${item.color} ${item.size}.`);
    const allocations: InventoryAllocation[] = [];
    const isPlain = product?.productFinish === 'plain';
    const readyInventory = inventories.get(readySlug);
    const readyVerified = product?.productFinish !== 'printed' || readyInventory?.variants?.[variantKey]?.physicalCountVerified === true;
    const ready = isPlain || !readyVerified ? 0 : take(readySlug, variantKey, requested);
    if (ready) allocations.push({ productSlug: readySlug, variantKey, quantity: ready, source: 'ready' });
    const baseSlug = base && stockSlug(base);
    const plain = baseSlug && isGarmentVariantAllowed(base!, variantKey) ? take(baseSlug, variantKey, requested - ready) : 0;
    if (plain) allocations.push({ productSlug: baseSlug!, variantKey, quantity: plain, source: 'plain' });
    if (ready + plain < requested) {
      const error: any = new Error(`Estoque disponível insuficiente para "${item.name || readySlug}" (${item.color} - ${item.size}). Disponível: ${ready + plain}, Solicitado: ${requested}`);
      error.name = 'OutOfStockError'; error.details = { item: item.name || readySlug, requested, available: ready + plain };
      throw error;
    }
    // Ignore caller-supplied allocations; these come exclusively from authoritative balances.
    return { ...item, inventoryAllocations: allocations, ...(baseSlug ? { stockBaseSlug: baseSlug } : {}), ...(plain ? { printProcurementStatus: 'to_order', madeToOrderQuantity: plain } : { madeToOrderQuantity: 0 }) };
  });
}

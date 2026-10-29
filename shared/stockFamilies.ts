/** Owner-approved product range. Technical supplier sheets are variants, not families. */
export const STOCK_FAMILIES = [
  { id: 'oversized', label: 'Camisa Oversized', visualKind: 'oversized', productType: 'tshirt', collars: true },
  { id: 'tradicional', label: 'Camisa Tradicional', visualKind: 'traditional', productType: 'tshirt', collars: true },
  { id: 'bermudas', label: 'Bermuda de Linho Cargo', visualKind: 'shorts', productType: 'shorts', collars: false },
  { id: 'regatas', label: 'Camiseta Regata', visualKind: 'regata', productType: 'tshirt', collars: false },
  { id: 'croppeds', label: 'Cropped Boxy Oversized', visualKind: 'cropped', productType: 'cropped', collars: false },
  { id: 'casacos', label: 'Casaco de Moletom', visualKind: 'hoodie', productType: 'jacket', collars: false },
  { id: 'bones', label: 'Boné de Telinha Trucker', visualKind: 'cap', productType: 'cap', collars: false },
] as const;
export type StockFamilyId = typeof STOCK_FAMILIES[number]['id'];
export const stockFamilyDefinition = (id: unknown) => STOCK_FAMILIES.find(family => family.id === id);
const normalized = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

function classify(value: unknown): StockFamilyId | null {
  const text = normalized(value);
  if (/infantil|\bpolo\b|\bkit\b|chinelo|slide|\bcalcas?\b|plus size/.test(text)) return null;
  if (/regata|\btank\b/.test(text)) return 'regatas';
  if (/cropped|boxy feminin/.test(text)) return 'croppeds';
  if (/moletom|casaco|hoodie/.test(text)) return 'casacos';
  if (/bermuda|\bshorts?\b|linho cargo/.test(text)) return 'bermudas';
  if (/\bbones?\b|\bcaps?\b|trucker/.test(text)) return 'bones';
  // An oversized Suedine is still oversized; "gola tradicional" is not a fit.
  if (/oversized|oversaized|over sized|boxy masculin/.test(text)) return 'oversized';
  if (/tradicional|traditional|suedine|\bregular\b/.test(text)) return 'tradicional';
  return null;
}

export function stockFamily(product: any): StockFamilyId | null {
  if (!product) return null;
  const identity = normalized([product.baseModel,product.fit,product.category,product.name].filter(Boolean).join(' '));
  // Do not relabel a different fabric/style as one of the approved pieces.
  if (/infantil|\bpolo\b|\bkit\b|chinelo|slide|\bcalcas?\b|plus size/.test(identity)
    || /(?:bermuda|shorts?).*(?:moletom|jeans|tactel|sarja)/.test(identity)
    || /bone.*(?:snapback|baseball|aba reta)/.test(identity)
    || /corta[\s-]*vento/.test(identity)
    || /cropped.*(?:baby look|justo|justa|slim|regata)/.test(identity)) return null;
  const explicit = stockFamilyDefinition(product.stockFamily);
  if (explicit) return explicit.id;
  for (const value of [product.baseModel, product.fit, product.modeling, product.category, product.name]) {
    if (/infantil|\bpolo\b|\bkit\b|chinelo|slide|\bcalcas?\b|plus size/.test(normalized(value))) return null;
  }
  return classify(product.baseModel) || classify(product.fit) || classify(product.modeling)
    || classify(product.category) || classify(product.name)
    || ({ shorts: 'bermudas', cropped: 'croppeds', jacket: 'casacos', cap: 'bones' } as Record<string, StockFamilyId>)[product.productType]
    || (['force','mark','prime'].includes(normalized(product.slug || product.parentSlug)) ? 'oversized' : null);
}

export function stockCollar(product: any): 'classic_open' | 'high_closed' | 'unclassified' | 'none' {
  const family = stockFamilyDefinition(stockFamily(product));
  if (!family?.collars) return 'none';
  if (product.neckline === 'classic_open' || product.neckline === 'high_closed') return product.neckline;
  const text = normalized(product.garmentModelName || product.collar);
  if (/gola alta|alta e fechada/.test(text)) return 'high_closed';
  if (/gola tradicional|gola classica|baixa e aberta/.test(text)) return 'classic_open';
  return 'unclassified';
}
export const stockCollarLabel = (product: any) => ({ classic_open: 'Gola tradicional', high_closed: 'Gola alta', unclassified: 'Gola a conferir', none: '' })[stockCollar(product)];

/** Archived rows stay available for reconciliation, not as new operational stock. */
export const isOperationalStockProduct = (product: any) => Boolean(stockFamily(product))
  && !product.mergedIntoProductId && product.rangeArchived !== true && product.status !== 'archived';

export function summarizeStockFamilies(items: any[]) {
  const seen = new Set<string>();
  const unique = items.filter(item => {
    const key = String(item.slug || item.id || '');
    if (!key || seen.has(key) || !isOperationalStockProduct(item)) return false;
    seen.add(key); return true;
  });
  return STOCK_FAMILIES.map(family => {
    const rows = unique.filter(item => stockFamily(item) === family.id);
    const quantity = (source: any[]) => source.reduce((sum, item) => sum + Math.max(0, Number(item.totalStock) || 0), 0);
    return { ...family, rows, physical: quantity(rows), plain: quantity(rows.filter(item => item.stockGroup === 'plain')), printed: quantity(rows.filter(item => item.stockGroup === 'printed')), classic: quantity(rows.filter(item => stockCollar(item) === 'classic_open')), high: quantity(rows.filter(item => stockCollar(item) === 'high_closed')), unclassified: quantity(rows.filter(item => stockCollar(item) === 'unclassified')) };
  });
}

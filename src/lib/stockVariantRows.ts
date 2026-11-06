import type { Product } from '../types/product';
import type { InventoryState } from '../hooks/useInventory';
import { normalizeProductStatus } from '../../shared/productPublication';
import { requiresGarmentClassification } from '../../shared/garmentModels';

export type StockVariantStatus = 'inactive' | 'out' | 'critical' | 'safe' | 'unallocated' | 'classification_pending';

export type StockVariantRow = {
  key: string;
  sku: string;
  color: string;
  size: string;
  physical: number;
  reserved: number;
  available: number;
  /** Customer-facing availability, which may include a shared blank garment. */
  saleAvailable?: number;
  minimum: number;
  active: boolean;
  status: StockVariantStatus;
};

export type SaleAvailability = {
  availableQuantity: number;
  variants?: Record<string, { available?: boolean; availableQuantity?: number }>;
};

type InventoryEntry = InventoryState[string] | undefined;
type StockProduct = Partial<Product> & { id?: string; slug?: string };

const quantity = (value: unknown) => Math.max(0, Number(value) || 0);
const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('pt-BR');
const skuPart = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

const parseVariantKey = (key: string) => {
  const divider = key.lastIndexOf('_');
  return divider < 0
    ? { color: 'Única', size: key }
    : { color: key.slice(0, divider), size: key.slice(divider + 1) };
};

export function buildStockVariantRows(product: StockProduct, inventoryEntry?: InventoryEntry): StockVariantRow[] {
  const colors = (product.colors || []).map(color => color.name).filter(Boolean);
  const sizes = (product.sizes || []).filter(Boolean);
  const inventoryVariants = inventoryEntry?.variants || {};
  const mirror = product.variantsStock || {};
  const definitions = product.variants || [];
  const keys = new Set<string>();

  if (colors.length && sizes.length) {
    colors.forEach(color => sizes.forEach(size => keys.add(`${color}_${size}`)));
  } else if (sizes.length) {
    sizes.forEach(size => keys.add(size));
  }
  Object.keys(mirror).forEach(key => keys.add(key));
  Object.keys(inventoryVariants).forEach(key => keys.add(key));
  definitions.forEach(variant => {
    if (variant.colorName && variant.size) keys.add(`${variant.colorName}_${variant.size}`);
  });

  const baseSku = String(product.sku || product.slug || product.id || 'PROD').trim().toUpperCase();
  const publication = normalizeProductStatus(product.status);
  // Internal blank bases are deliberately drafts; publication is not a stock switch.
  const productActive = publication === 'active' || (product.productFinish === 'plain' && publication === 'draft');
  const classificationPending = requiresGarmentClassification(product);
  const aggregateStock = quantity(inventoryEntry?.physicalQuantity ?? product.stock);
  // Older products may have only one aggregate balance. Never assign it to an
  // arbitrary color or size: show it explicitly as unallocated stock.
  if (keys.size === 0 || (Object.keys(inventoryVariants).length === 0 && Object.keys(mirror).length === 0 && aggregateStock > 0)) {
    return [{
      key: '__unallocated__',
      sku: baseSku,
      color: 'Não detalhada',
      size: 'Não detalhado',
      physical: aggregateStock,
      reserved: quantity(inventoryEntry?.reservedQuantity),
      available: classificationPending ? 0 : quantity(inventoryEntry?.availableQuantity ?? aggregateStock),
      minimum: quantity(product.minStock ?? 1),
      active: productActive,
      status: !productActive ? 'inactive' : classificationPending ? 'classification_pending' : 'unallocated',
    }];
  }

  return [...keys].map(key => {
    const { color, size } = parseVariantKey(key);
    const definition = definitions.find(variant => normalize(variant.colorName || 'Única') === normalize(color) && normalize(variant.size) === normalize(size));
    const sizeStock = (product.sizeStock || []).find(entry => normalize(entry.size) === normalize(size) && (!entry.colorName || normalize(entry.colorName) === normalize(color)));
    const state = inventoryVariants[key];
    const physical = quantity(state?.physicalQuantity ?? (inventoryEntry ? 0 : mirror[key] ?? definition?.stock ?? sizeStock?.quantity));
    const reserved = quantity(state?.reservedQuantity ?? definition?.reserved ?? sizeStock?.reserved);
    const available = classificationPending ? 0 : quantity(state?.availableQuantity ?? physical - reserved);
    const minimum = quantity(definition?.minStock ?? sizeStock?.minStock ?? product.minStock ?? 1);
    const colorDefinition = product.colors?.find(entry => normalize(entry.name) === normalize(color)) as any;
    const active = productActive && definition?.active !== false && (state as any)?.active !== false && colorDefinition?.active !== false;
    const status: StockVariantStatus = !active ? 'inactive' : classificationPending && physical > 0 ? 'classification_pending' : available === 0 ? 'out' : available <= minimum ? 'critical' : 'safe';
    return {
      key,
      sku: definition?.sku || `${baseSku}-${skuPart(color)}-${skuPart(size)}`,
      color,
      size,
      physical,
      reserved,
      available,
      minimum,
      active,
      status,
    };
  });
}

/** Use the storefront projection for sale status without changing physical stock. */
export function withSaleAvailability(rows: StockVariantRow[], sale: SaleAvailability): StockVariantRow[] {
  return rows.map(row => {
    // An old aggregate without a colour/size cannot be assigned to a variant.
    if (row.key === '__unallocated__') return row;
    const projected = sale.variants?.[row.key];
    const saleAvailable = projected?.available === false ? 0 : quantity(projected?.availableQuantity);
    // A ready-stock variant can be inactive while its shared blank is sellable.
    const active = row.active || saleAvailable > 0;
    const status: StockVariantStatus = row.status === 'classification_pending'
      ? 'classification_pending'
      : !active ? 'inactive' : saleAvailable === 0 ? 'out' : saleAvailable <= row.minimum ? 'critical' : 'safe';
    return { ...row, active, saleAvailable, status };
  });
}

export function summarizeStockVariants(rows: StockVariantRow[]) {
  return {
    skuCount: rows.length,
    activeCount: rows.filter(row => row.active).length,
    inactiveCount: rows.filter(row => !row.active).length,
    criticalCount: rows.filter(row => row.status === 'critical').length,
    outCount: rows.filter(row => row.status === 'out').length,
  };
}

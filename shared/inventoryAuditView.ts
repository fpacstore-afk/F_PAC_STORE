export type InventoryAuditRow = {
  productSlug: string;
  productName: string;
  productCode: string;
  baseModel: string;
  variantKey: string;
  color: string;
  size: string;
  systemQuantity: number;
  countVerified: boolean;
  reservedQuantity: number;
  stockType: 'plain' | 'printed';
  stockFamily?: string;
  collar?: string;
};

export type InventoryAuditFilters = {
  stockType: 'all' | 'plain' | 'printed';
  search: string;
  productSlug: string;
  baseModel: string;
  color: string;
  size: string;
  situation: 'all' | 'positive' | 'zero' | 'reserved' | 'unverified' | 'counted' | 'uncounted' | 'difference';
  sortBy: 'product' | 'size';
  stockFamily?: string;
  collar?: string;
};

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const letterSizes = ['RN', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'G1', 'G2', 'G3', 'G4', 'G5'];
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const inventoryCountKey = (row: Pick<InventoryAuditRow, 'productSlug' | 'variantKey'>) => `${row.productSlug}:${row.variantKey}`;
export const hasInventoryCount = (row: InventoryAuditRow, counts: Record<string, string>) => (counts[inventoryCountKey(row)] ?? '').trim() !== '';

export function compareInventorySizes(left: string, right: string): number {
  const a = left.trim().toUpperCase();
  const b = right.trim().toUpperCase();
  const aIndex = letterSizes.indexOf(a);
  const bIndex = letterSizes.indexOf(b);
  if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
  if (aIndex >= 0) return -1;
  if (bIndex >= 0) return 1;
  return collator.compare(a, b);
}

export function selectInventoryRows<T extends InventoryAuditRow>(rows: T[], filters: InventoryAuditFilters, counts: Record<string, string>): T[] {
  const words = normalized(filters.search).split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    if (filters.stockFamily && row.stockFamily !== filters.stockFamily) return false;
    if (filters.collar && row.collar !== filters.collar) return false;
    if (filters.stockType !== 'all' && row.stockType !== filters.stockType) return false;
    if (filters.productSlug && row.productSlug !== filters.productSlug) return false;
    if (filters.baseModel && row.baseModel !== filters.baseModel) return false;
    if (filters.color && row.color !== filters.color) return false;
    if (filters.size && row.size !== filters.size) return false;
    if (words.length && !words.every(word => normalized([row.productName, row.productCode, row.baseModel, row.color, row.size].join(' ')).includes(word))) return false;
    const counted = hasInventoryCount(row, counts);
    switch (filters.situation) {
      case 'positive': return row.systemQuantity > 0;
      case 'zero': return row.systemQuantity === 0;
      case 'reserved': return row.reservedQuantity > 0;
      case 'unverified': return !row.countVerified;
      case 'counted': return counted;
      case 'uncounted': return !counted;
      case 'difference': return counted && Number(counts[inventoryCountKey(row)]) !== row.systemQuantity;
      default: return true;
    }
  }).sort((a, b) => {
    if (filters.sortBy === 'size') {
      const sizeDifference = compareInventorySizes(a.size, b.size);
      if (sizeDifference) return sizeDifference;
    }
    return collator.compare(a.productName, b.productName)
      || collator.compare(a.productCode, b.productCode)
      || collator.compare(a.productSlug, b.productSlug)
      || collator.compare(a.color, b.color)
      || compareInventorySizes(a.size, b.size);
  });
}

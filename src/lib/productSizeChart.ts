import { PRIME_GARMENT_MEASUREMENTS } from '../../shared/primePlacement';
import { PRODUCT_VISUALS, type ProductVisualKind } from './productPresentation';

export type SizeChartRow = { size: string; length: string; width: string; sleeve: string; notes?: string };

/** Approved supplier measurements. Pending models deliberately have no numbers. */
export function getProductSizeChart(model: ProductVisualKind): SizeChartRow[] {
  if (model === 'cap') return [];
  const measurements = PRIME_GARMENT_MEASUREMENTS[model as keyof typeof PRIME_GARMENT_MEASUREMENTS];
  if (!measurements) return ['P', 'M', 'G', 'GG'].map(size => ({ size, length: '', width: '', sleeve: '' }));
  return measurements.map(row => ({ size: row.size, length: `${row.length} cm`, width: `${row.width} cm`, sleeve: `${row.sleeve} cm`, notes: PRODUCT_VISUALS[model].label }));
}

/** Product measurements override model defaults; never invent a missing measurement. */
export function resolveProductSizeChart(model?: ProductVisualKind, customData?: SizeChartRow[], availableSizes?: string[]): SizeChartRow[] {
  const custom = Array.isArray(customData) ? customData.filter(row => typeof row?.size === 'string' && row.size.trim()).map(row => ({
    size: row.size.trim(), length: String(row.length || '').trim(), width: String(row.width || '').trim(), sleeve: String(row.sleeve || '').trim(), notes: row.notes,
  })) : [];
  const rows = custom.length ? custom : getProductSizeChart(model || 'oversized');
  if (!availableSizes?.length) return rows;
  return availableSizes.map(size => rows.find(row => row.size.toLowerCase() === size.toLowerCase()) || { size, length: '', width: '', sleeve: '' });
}

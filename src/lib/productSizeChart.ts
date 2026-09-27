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

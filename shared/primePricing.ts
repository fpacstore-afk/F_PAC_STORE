import { parsePrimePrintSize } from './primeArtworkSizing';

export const OVERSIZED_PRIME_BASE_PRICE = 79.90;
export const REMOVE_CATALOG_SLEEVE_PRICE = 3;
export type PrimePricePrint = { stampId?: string; location?: string; printSize?: string; source?: string };
export function isIncludedPrimeSleeve(print: PrimePricePrint): boolean {
  return print.location === 'Manga Esquerda' && print.printSize === '2x3'
    && (print.source === 'catalog' || Boolean(print.stampId && !print.stampId.startsWith('own_art_')));
}
export function primePrintTier(size: string): 0 | 1 | 2 {
  const dimensions = parsePrimePrintSize(size);
  if (!dimensions || dimensions[0] > 30 || dimensions[1] > 40) throw new Error('Medida de estampa inválida para o preço PRIME.');
  if (dimensions[0] <= 15 && dimensions[1] <= 15) return 0;
  if (dimensions[0] <= 30 && dimensions[1] <= 30) return 1;
  return 2;
}

/** Store-approved oversized table. Largest print pays the first-print rate;
 * each additional print pays its own tier's second-print rate. */
export function calculatePrimePrice(model: string, prints: PrimePricePrint[]) {
  if (model !== 'oversized') return { total: 119.90, base: 119.90, prints: 0, removal: 0 };
  const tiers = prints.filter(print => !isIncludedPrimeSleeve(print)).map(print => primePrintTier(print.printSize || '')).sort((a, b) => b - a);
  const printPrice = tiers.reduce((sum, tier, index) => sum + (index === 0 ? [5, 15, 30][tier] : [5, 5, 10][tier]), 0);
  const removal = prints.some(isIncludedPrimeSleeve) ? 0 : REMOVE_CATALOG_SLEEVE_PRICE;
  return { total: Number((OVERSIZED_PRIME_BASE_PRICE + printPrice + removal).toFixed(2)), base: OVERSIZED_PRIME_BASE_PRICE, prints: printPrice, removal };
}

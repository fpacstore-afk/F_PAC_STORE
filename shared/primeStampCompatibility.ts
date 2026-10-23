import type { CustomizationProfileId } from './customizationProfiles';
import { getCatalogSleeveSizes, isPrimePrintSizeWithin, normalizeRegisteredPrimePrintSizes } from './primeArtworkSizing';

const PRIME_PRODUCT_LABEL: Readonly<Record<CustomizationProfileId, string>> = {
  oversized: 'Camisetas',
  traditional: 'Camisetas',
  cropped: 'Cropped Oversized',
  hoodie: 'Moletons',
  shorts: 'Bermudas',
  cap: 'Bonés',
};

const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('pt-BR').replace(/[\s_-]+/g, ' ');

/** Match catalog position restrictions before displaying or applying artwork. */
export function isPrimeStampAllowedAtLocation(allowedLocations: unknown, location: string, positionId: string): boolean {
  if (!Array.isArray(allowedLocations) || allowedLocations.length === 0) return true;
  const label = normalize(location);
  const id = normalize(positionId);
  return allowedLocations.some(value => {
    const allowed = normalize(value);
    return Boolean(allowed) && (allowed === label || allowed === id || label.includes(allowed) || allowed.includes(label) || id.includes(allowed) || allowed.includes(id));
  });
}

/**
 * Bermuda and cap have small, specialised print areas. They require an explicit
 * product selection in the stamp catalog; legacy "Todos os produtos" entries
 * only opt into the regular garments.
 */
export function isPrimeStampCompatible(products: unknown, model: CustomizationProfileId): boolean {
  if (!Array.isArray(products)) return false;
  const selected = products.map(normalize);
  if (selected.includes(normalize(PRIME_PRODUCT_LABEL[model]))) return true;
  return model !== 'shorts' && model !== 'cap' && selected.includes(normalize('Todos os produtos'));
}

export function getPrimeCompatiblePrintSizes(
  sizes: unknown,
  products: unknown,
  model: CustomizationProfileId,
  area: { id: string; maxWidthCm: number; maxHeightCm: number; location?: string; positionId?: string },
  allowedLocations?: unknown,
): string[] {
  if (!isPrimeStampCompatible(products, model)) return [];
  if (area.location && !isPrimeStampAllowedAtLocation(allowedLocations, area.location, area.positionId || area.id)) return [];
  if (area.id === 'sleeve' || area.id === 'left-sleeve') return getCatalogSleeveSizes(sizes);
  return normalizeRegisteredPrimePrintSizes(sizes)
    .filter(size => isPrimePrintSizeWithin(size, area.maxWidthCm, area.maxHeightCm));
}

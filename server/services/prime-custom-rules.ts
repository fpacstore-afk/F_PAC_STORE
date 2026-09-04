export interface PrimePrintConfigLike {
  id?: string;
  stampId?: string;
  stamp?: string;
  location?: string;
  printSize?: string;
  image?: string;
}

export const PRIME_PRINT_SIZE_SURCHARGE: Readonly<Record<string, number>> = Object.freeze({
  '2x3': 0,
  '5x5': 0,
  '8x8': 0,
  '10x10': 0,
  '10x12': 5,
  '12x15': 8,
  '15x15': 10,
  '15x20': 12,
  '20x20': 15,
  '20x30': 18,
  '25x30': 22,
  '30x30': 25,
  '30x40': 30,
});

export const PRIME_POSITION_RULES = Object.freeze({
  'Peito Esquerdo': { id: 'peito_esquerdo', max: [15, 15] as const },
  'Peito Central': { id: 'peito_central', max: [30, 40] as const },
  'Costas Principal': { id: 'costas', max: [30, 40] as const },
  'Manga Esquerda': { id: 'manga_esquerda', max: [10, 12] as const },
  'Manga Direita': { id: 'manga_direita', max: [10, 12] as const },
  'Barra Inferior': { id: 'barra_inferior', max: [10, 10] as const },
  'Gola Traseira': { id: 'gola_traseira', max: [10, 10] as const },
});

export const parsePrimePrintDimensions = (value: string): readonly [number, number] | null => {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return [width, height];
};

export const isPrimeSizeAllowedAtLocation = (printSize: string, location: string): boolean => {
  const dimensions = parsePrimePrintDimensions(printSize);
  const rule = PRIME_POSITION_RULES[location as keyof typeof PRIME_POSITION_RULES];
  if (!dimensions || !rule) return false;
  return dimensions[0] <= rule.max[0] && dimensions[1] <= rule.max[1];
};

export const isTrustedCloudinaryArtwork = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return false;
    if (parsed.username || parsed.password) return false;

    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments.length < 4) return false;

    const [, resourceType, deliveryType] = pathSegments;
    if (resourceType !== 'image' || deliveryType !== 'upload') return false;

    return true;
  } catch {
    return false;
  }
};

export const resolvePrimeStampId = (config: PrimePrintConfigLike, location: string): string => {
  const explicitStampId = String(config?.stampId || '').trim();
  if (explicitStampId) return explicitStampId;

  const placementId = String(config?.id || '').trim();
  const rule = PRIME_POSITION_RULES[location as keyof typeof PRIME_POSITION_RULES];
  if (!placementId || !rule) return '';
  const marker = `_${rule.id}_`;
  const markerIndex = placementId.lastIndexOf(marker);
  if (markerIndex <= 0) return '';
  const timestamp = placementId.slice(markerIndex + marker.length);
  if (!/^\d{10,}$/.test(timestamp)) return '';
  return placementId.slice(0, markerIndex);
};

const normalize = (value: unknown): string => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');

export const isCatalogLocationAllowed = (allowedLocations: unknown, location: string): boolean => {
  if (!Array.isArray(allowedLocations) || allowedLocations.length === 0) return true;
  const rule = PRIME_POSITION_RULES[location as keyof typeof PRIME_POSITION_RULES];
  if (!rule) return false;
  const label = normalize(location);
  const id = normalize(rule.id);
  return allowedLocations.some((entry) => {
    const allowed = normalize(entry);
    return Boolean(allowed) && (allowed === label || allowed === id || label.includes(allowed) || allowed.includes(label) || id.includes(allowed) || allowed.includes(id));
  });
};

export const getActiveProductColorNames = (colors: unknown): string[] => {
  if (!Array.isArray(colors)) return [];
  return colors.flatMap((entry: any) => {
    if (typeof entry === 'string') return entry.trim() ? [entry.trim()] : [];
    if (!entry || typeof entry !== 'object') return [];
    if (entry.status === 'hidden' || entry.status === 'inactive' || entry.available === false) return [];
    const name = String(entry.name || entry.label || '').trim();
    return name ? [name] : [];
  });
};

export const getActiveProductSizes = (sizes: unknown): string[] => {
  if (!Array.isArray(sizes)) return [];
  return sizes.flatMap((entry: any) => {
    if (typeof entry === 'string') return entry.trim() ? [entry.trim()] : [];
    if (!entry || typeof entry !== 'object') return [];
    if (entry.status === 'hidden' || entry.status === 'inactive' || entry.available === false) return [];
    const value = String(entry.name || entry.label || entry.id || '').trim();
    return value ? [value] : [];
  });
};

export const isConfiguredVariantAllowed = (availableValues: string[], selectedValue: string): boolean => {
  if (availableValues.length === 0) return true;
  const selected = normalize(selectedValue);
  return availableValues.some(value => normalize(value) === selected);
};

const DIMENSION_PATTERN = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i;

const formatDimension = (value: number): string => Number(value.toFixed(2)).toString();

/**
 * Converts a catalog/admin label such as "Peito 10 × 12 cm" into the canonical
 * checkout value "10x12". Text around the dimensions is intentionally ignored.
 */
export const normalizePrimePrintSize = (value: unknown): string => {
  const match = String(value || '').match(DIMENSION_PATTERN);
  if (!match) return '';

  const width = Number(match[1].replace(',', '.'));
  const height = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';

  return `${formatDimension(width)}x${formatDimension(height)}`;
};

export const parsePrimePrintSize = (value: unknown): readonly [number, number] | null => {
  const normalized = normalizePrimePrintSize(value);
  if (!normalized) return null;
  const [width, height] = normalized.split('x').map(Number);
  return [width, height];
};

/** Returns only valid, unique dimensions explicitly registered for the art. */
export const normalizeRegisteredPrimePrintSizes = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizePrimePrintSize).filter(Boolean))];
};

export const isPrimePrintSizeWithin = (
  value: unknown,
  maxWidth: number,
  maxHeight: number,
): boolean => {
  const dimensions = parsePrimePrintSize(value);
  return Boolean(dimensions && dimensions[0] <= maxWidth && dimensions[1] <= maxHeight);
};

export const formatPrimePrintSize = (value: unknown): string => {
  const normalized = normalizePrimePrintSize(value);
  return normalized ? `${normalized.replace('x', ' × ')} cm` : '';
};

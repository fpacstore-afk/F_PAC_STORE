/**
 * Converts a human-entered monetary value to reais without assuming the
 * keyboard locale. Both Brazilian and international separators are accepted.
 */
export const parseCurrencyInput = (value: string): number => {
  const clean = value.trim().replace(/[^0-9,.-]/g, '');
  if (!clean || clean.startsWith('-')) return 0;

  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  const decimalIndex = Math.max(lastComma, lastDot);

  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // The final separator is the decimal separator; the other is thousands.
    const fraction = clean.slice(decimalIndex + 1).replace(/\D/g, '');
    const integer = clean.slice(0, decimalIndex).replace(/\D/g, '');
    normalized = `${integer}.${fraction}`;
  } else if (decimalIndex >= 0) {
    const digitsAfter = clean.length - decimalIndex - 1;
    // A single separator followed by exactly three digits is conventionally a
    // thousands separator (e.g. 1.000 / 1,000), not a fractional cent value.
    normalized = digitsAfter === 3
      ? clean.replace(/[^0-9]/g, '')
      : `${clean.slice(0, decimalIndex).replace(/\D/g, '')}.${clean.slice(decimalIndex + 1).replace(/\D/g, '')}`;
  } else {
    normalized = clean.replace(/\D/g, '');
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
};

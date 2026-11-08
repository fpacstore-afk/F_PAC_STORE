import { fromCents, toCents } from './money';

/** Display simplification never changes the amount used by catalog or checkout. */
export function formatStorefrontAmount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'Indisponível';
  const cents = toCents(value);
  const digits = cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(fromCents(cents));
}

export function formatStorefrontCurrency(value: number): string {
  const amount = formatStorefrontAmount(value);
  return amount === 'Indisponível' ? amount : `R$ ${amount}`;
}

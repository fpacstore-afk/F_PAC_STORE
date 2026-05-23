/**
 * Detects if a clean, numeric CEP belongs to Joinville, SC.
 * The CEP range for Joinville, Santa Catarina, is 89200-000 to 89239-999.
 */
export function isJoinvilleCEP(cep: string): boolean {
  if (!cep) return false;
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return false;
  const num = parseInt(clean, 10);
  return num >= 89200000 && num <= 89239999;
}

/**
 * Custom timeframe for local Joinville delivery.
 * Keeping this easily editable.
 */
export const JOINVILLE_DELIVERY_TIME = "1 a 5 dias úteis";

/**
 * Custom name for Joinville delivery.
 */
export const JOINVILLE_SHIPPING_NAME = "Entrega Local F PAC";

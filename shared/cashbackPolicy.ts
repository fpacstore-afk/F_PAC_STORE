export const SIGNUP_BONUS_CENTS = 500;
export const PURCHASE_CASHBACK_LIFETIME_DAYS = 180;
export const MAX_EARN_CENTS = 2000;
export const MAX_REDEEM_CENTS = 2000;

const cents = (amount: number) => Math.round(amount * 100);

export function cashbackRate(productSubtotalCents: number): number {
  if (productSubtotalCents >= 25000) return 4;
  if (productSubtotalCents >= 15000) return 3;
  if (productSubtotalCents >= 6000) return 2;
  return 0;
}

/** Amount paid for eligible catalogue products after all discounts; never shipping or redeemed credit. */
export function purchaseCashbackCents(input: {
  source: string; paymentMethod: string; hasAccount: boolean; catalogueOnly: boolean;
  productSubtotalCents: number; paidProductCents: number;
}): number {
  if (input.source !== 'checkout_link' || input.paymentMethod !== 'pix' || !input.hasAccount || !input.catalogueOnly) return 0;
  return Math.min(MAX_EARN_CENTS, Math.max(0, Math.round(input.paidProductCents * cashbackRate(input.productSubtotalCents) / 100)));
}

export function redeemableCashbackCents(availableCents: number, discountedProductCents: number): number {
  if (discountedProductCents < 6000) return 0;
  return Math.min(Math.max(0, availableCents), MAX_REDEEM_CENTS, Math.floor(discountedProductCents / 10));
}

export function moneyCents(amount: unknown) {
  return typeof amount === 'number' && Number.isFinite(amount) ? Math.max(0, cents(amount)) : 0;
}

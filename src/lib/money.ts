const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export type CartMoneyLine = { price: number; quantity: number };

export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100 + Number.EPSILON * Math.max(1, Math.abs(value * 100)) * Math.sign(value));
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function formatBRL(value: number): string {
  return CURRENCY_FORMATTER.format(fromCents(toCents(value)));
}

export function calculateCartMoney(input: {
  items: CartMoneyLine[];
  promotionDiscount: number;
  flashSaleDiscount: number;
  couponRate: number;
  pixRate: number;
  pixEnabled: boolean;
  shipping: number;
}) {
  const subtotalCents = input.items.reduce(
    (total, item) => total + toCents(item.price) * Math.max(0, Math.trunc(item.quantity)),
    0,
  );
  const promotionDiscountCents = toCents(input.promotionDiscount);
  const flashSaleDiscountCents = toCents(input.flashSaleDiscount);
  const subtotalAfterPromotionCents = Math.max(10, subtotalCents - promotionDiscountCents);
  const couponBaseCents = Math.max(0, subtotalAfterPromotionCents - flashSaleDiscountCents);
  const couponDiscountCents = Math.round(couponBaseCents * Math.max(0, input.couponRate) / 100);
  const subtotalAfterDiscountsCents = Math.max(
    10,
    subtotalAfterPromotionCents - flashSaleDiscountCents - couponDiscountCents,
  );
  const pixDiscountCents = input.pixEnabled
    ? Math.round(subtotalAfterDiscountsCents * Math.max(0, input.pixRate) / 100)
    : 0;
  const shippingCents = toCents(input.shipping);
  const hasItems = input.items.some(item => item.quantity > 0);
  const totalCents = hasItems
    ? Math.max(10, subtotalAfterDiscountsCents - pixDiscountCents + shippingCents)
    : 0;

  return {
    subtotal: fromCents(subtotalCents),
    promotionDiscount: fromCents(promotionDiscountCents),
    flashSaleDiscount: fromCents(flashSaleDiscountCents),
    couponDiscount: fromCents(couponDiscountCents),
    pixDiscount: fromCents(pixDiscountCents),
    shipping: fromCents(shippingCents),
    total: fromCents(totalCents),
  };
}

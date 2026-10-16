import type { CartItem } from '../src/types/cart';
import type { WeeklyPromotion } from '../src/types/promotions';
import { applyPromotion } from '../src/services/promotions/applyPromotion';
import { calculateCartMoney, fromCents, toCents } from '../src/lib/money';
import { getDailyPromoCode } from '../src/lib/promo';
import { getFlashSaleInfo } from '../src/lib/flashSale';
import { qualifiesForFreeShipping } from './shippingThreshold';

/** One monetary policy for the storefront and the authoritative checkout. */
export function calculateStorefrontTotals(input: {
  items: CartItem[]; promotion: WeeklyPromotion | null; shipping: number;
  coupon?: string | null; pixEnabled: boolean; city: string; now?: number;
}) {
  const now = input.now ?? Date.now();
  const promotion = input.promotion ? selectActivePromotion([input.promotion], now) : null;
  const applied = applyPromotion(input.items, promotion, input.shipping, input.city);
  const shippingDiscount = fromCents(toCents(applied.shippingDiscount));
  const quantity = input.items.reduce((sum, item) => sum + item.quantity, 0);
  const shipping = qualifiesForFreeShipping(quantity) || shippingDiscount > 0 ? 0 : input.shipping;
  const cleanCoupon = String(input.coupon || '').toUpperCase().replace(/\s/g, '');
  let couponRate = 0;
  if (promotion) {
    if (promotion.discount_type === 'cupom' && cleanCoupon && cleanCoupon === String(promotion.coupon_code || '').toUpperCase().replace(/\s/g, '')) {
      couponRate = promotion.discount_value === null ? 0 : promotion.discount_value ?? 5;
    }
  } else if (cleanCoupon && cleanCoupon === getDailyPromoCode(new Date(now))) couponRate = 5;
  let pixDiscountRate = 5;
  if (promotion?.discount_type === 'pix_discount') {
    pixDiscountRate = promotion.pix_discount === null ? 0
      : promotion.pix_discount ?? (promotion.discount_value === null ? 0 : promotion.discount_value ?? 10);
  } else if (promotion?.pix_discount !== undefined) pixDiscountRate = promotion.pix_discount === null ? 0 : promotion.pix_discount;
  const flash = getFlashSaleInfo(now);
  const money = calculateCartMoney({
    items: input.items, promotionDiscount: applied.promotionDiscount,
    flashSaleDiscount: flash.isActive && input.items.length > 0 && !promotion ? flash.discountValue : 0,
    couponRate, pixRate: pixDiscountRate, pixEnabled: input.pixEnabled, shipping,
  });
  return { ...money, pixDiscountRate, shippingDiscount, weeklyPromotionLabel: applied.discountLabel };
}

export function selectActivePromotion(promotions: WeeklyPromotion[], now = Date.now()): WeeklyPromotion | null {
  return promotions.filter(promotion => {
    const start = promotion.start_date ? new Date(promotion.start_date).getTime() : 0;
    const end = promotion.end_date ? new Date(promotion.end_date).getTime() : Infinity;
    return promotion.active && now >= start && now <= end;
  }).sort((a,b) => (b.priority ?? 0) - (a.priority ?? 0) || b.id.localeCompare(a.id))[0] ?? null;
}

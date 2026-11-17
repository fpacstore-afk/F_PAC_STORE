import type { CartItem } from '../src/types/cart';
import type { WeeklyPromotion } from '../src/types/promotions';
import { applyPromotion, matchesPromotionProduct } from '../src/services/promotions/applyPromotion';
import { calculateCartMoney, fromCents, toCents } from '../src/lib/money';
import { getDailyPromoCode } from '../src/lib/promo';
import { getFlashSaleInfo } from '../src/lib/flashSale';
import { qualifiesForFreeShipping } from './shippingThreshold';
import { campaign1111CartOffer } from './campaign1111';

export function normalizeCampaignCoupon(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/\s/g, '');
}

export function campaignCouponOffer(promotions: WeeklyPromotion[], coupon: unknown, items: CartItem[], now = Date.now()) {
  const code = normalizeCampaignCoupon(coupon);
  if (!code) return null;
  const promotion = selectActivePromotion(promotions.filter(candidate => candidate.discount_type === 'cupom'
    && normalizeCampaignCoupon(candidate.coupon_code) === code), now);
  if (!promotion) return null;
  const rate = promotion.discount_value === undefined ? 5 : Number(promotion.discount_value);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return null;
  const lineCents = (item: CartItem) => toCents(item.price) * Math.max(0, Math.trunc(item.quantity));
  const subtotal = items.reduce((sum, item) => sum + lineCents(item), 0);
  if (subtotal < toCents(promotion.minimum_cart_value || 0)) return null;
  const eligible = items.filter(item => matchesPromotionProduct(item, promotion))
    .reduce((sum, item) => sum + lineCents(item), 0);
  return Math.round(eligible * rate / 100) > 0 ? { promotion, rate, eligibleSubtotal: fromCents(eligible) } : null;
}

/** One monetary policy for the storefront and the authoritative checkout. */
export function calculateStorefrontTotals(input: {
  items: CartItem[]; promotion?: WeeklyPromotion | null; promotions?: WeeklyPromotion[]; shipping: number;
  coupon?: string | null; pixEnabled: boolean; city: string; now?: number;
  customerCouponRate?: number;
}) {
  const now = input.now ?? Date.now();
  const promotions = input.promotions ?? (input.promotion ? [input.promotion] : []);
  const campaignCoupon = campaignCouponOffer(promotions, input.coupon, input.items, now);
  const promotion = campaignCoupon?.promotion ?? selectActivePromotion(promotions, now);
  const applied = applyPromotion(input.items, promotion, input.shipping, input.city);
  const shippingDiscount = fromCents(toCents(applied.shippingDiscount));
  const quantity = input.items.reduce((sum, item) => sum + item.quantity, 0);
  const shipping = qualifiesForFreeShipping(quantity) || shippingDiscount > 0 ? 0 : input.shipping;
  const cleanCoupon = normalizeCampaignCoupon(input.coupon);
  let couponRate = campaignCoupon?.rate ?? 0;
  const hasCustomerBonus = Number.isFinite(input.customerCouponRate) && Number(input.customerCouponRate) > 0;
  if (!promotion && cleanCoupon === getDailyPromoCode(new Date(now))) couponRate = 5;
  if (hasCustomerBonus && !campaignCoupon) {
    // The personal post-purchase coupon is an additional 5 percentage points.
    // It may combine with the currently active coupon, even when the customer
    // enters their unique code instead of the public campaign code.
    const activeCouponRate = promotion?.discount_type === 'cupom'
      ? (promotion.discount_value === null ? 0 : promotion.discount_value ?? 5)
      : !promotion ? 5 : couponRate;
    couponRate = Math.min(50, activeCouponRate + Number(input.customerCouponRate));
  }
  let pixDiscountRate = 5;
  if (promotion?.discount_type === 'pix_discount') {
    pixDiscountRate = promotion.pix_discount === null ? 0
      : promotion.pix_discount ?? (promotion.discount_value === null ? 0 : promotion.discount_value ?? 10);
  } else if (promotion?.pix_discount !== undefined) pixDiscountRate = promotion.pix_discount === null ? 0 : promotion.pix_discount;
  const flash = getFlashSaleInfo(now);
  const flashSaleDiscount = flash.isActive && input.items.length > 0 && !promotion ? flash.discountValue : 0;
  const campaign = campaign1111CartOffer(input.items, now);
  const useCampaign = !campaignCoupon && toCents(campaign.discount) > toCents(applied.promotionDiscount) + toCents(flashSaleDiscount);
  const money = calculateCartMoney({
    items: input.items, promotionDiscount: useCampaign ? campaign.discount : applied.promotionDiscount,
    flashSaleDiscount: useCampaign ? 0 : flashSaleDiscount,
    couponRate, couponEligibleSubtotal: campaignCoupon?.eligibleSubtotal,
    pixRate: pixDiscountRate, pixEnabled: input.pixEnabled, shipping,
  });
  const weeklyPromotionLabel = useCampaign
    ? (campaign.hasCombo ? 'Ofertas e combos 11.11' : 'Oferta 11.11')
    : applied.discountLabel;
  return { ...money, pixDiscountRate, shippingDiscount, weeklyPromotionLabel };
}

export function selectActivePromotion(promotions: WeeklyPromotion[], now = Date.now()): WeeklyPromotion | null {
  return promotions.filter(promotion => {
    const start = promotion.start_date ? new Date(promotion.start_date).getTime() : 0;
    const end = promotion.end_date ? new Date(promotion.end_date).getTime() : Infinity;
    return promotion.active && now >= start && now <= end;
  }).sort((a,b) => (b.priority ?? 0) - (a.priority ?? 0) || b.id.localeCompare(a.id))[0] ?? null;
}

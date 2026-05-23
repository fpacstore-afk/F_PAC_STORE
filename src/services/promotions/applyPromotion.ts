import { CartItem } from '../../types/cart';
import { WeeklyPromotion } from '../../types/promotions';

interface AppliedPromotionResult {
  discountedItems: (CartItem & { originalPrice: number; promotionalPrice: number })[];
  promotionDiscount: number;
  shippingDiscount: number;
  discountLabel: string;
}

export function applyPromotion(
  items: CartItem[],
  promotion: WeeklyPromotion | null,
  shippingPrice: number,
  customerCity = 'Joinville'
): AppliedPromotionResult {
  
  // Default non-promotional result
  const defaultResult: AppliedPromotionResult = {
    discountedItems: items.map(item => ({
      ...item,
      originalPrice: item.price,
      promotionalPrice: item.price
    })),
    promotionDiscount: 0,
    shippingDiscount: 0,
    discountLabel: ''
  };

  if (!promotion || !promotion.active || items.length === 0) {
    return defaultResult;
  }

  const promoProductIdsSet = new Set(promotion.product_ids || []);
  const matchingItems = items.filter(item => promoProductIdsSet.has(item.id));
  const totalMatchingQty = matchingItems.reduce((acc, item) => acc + item.quantity, 0);

  let promotionDiscount = 0;
  let shippingDiscount = 0;
  let discountLabel = '';

  const discountedItems = items.map(item => {
    const isPromoProduct = promoProductIdsSet.has(item.id);
    let originalPrice = item.price;
    let promotionalPrice = item.price;

    if (isPromoProduct) {
      if (promotion.discount_type === 'percentage') {
        // e.g. -20%
        const rate = promotion.discount_value / 100;
        promotionalPrice = originalPrice * (1 - rate);
        const itemDiscount = (originalPrice - promotionalPrice) * item.quantity;
        promotionDiscount += itemDiscount;
        discountLabel = `${promotion.title}: -${promotion.discount_value}% OFF`;

      } else if (promotion.discount_type === 'fixed_amount') {
        // e.g. -R$20 OFF
        promotionalPrice = Math.max(0.10, originalPrice - promotion.discount_value);
        const itemDiscount = (originalPrice - promotionalPrice) * item.quantity;
        promotionDiscount += itemDiscount;
        discountLabel = `${promotion.title}: R$ ${promotion.discount_value} OFF`;

      } else if (promotion.discount_type === 'combo') {
        const comboQty = promotion.combo_qty ?? 2;
        const discountPercent = promotion.combo_discount_percent ?? promotion.discount_value;
        if (totalMatchingQty >= comboQty) {
          const rate = discountPercent / 100;
          promotionalPrice = originalPrice * (1 - rate);
          const itemDiscount = (originalPrice - promotionalPrice) * item.quantity;
          promotionDiscount += itemDiscount;
          discountLabel = `Combo ${promotion.title}: ${discountPercent}% OFF (Min ${comboQty} peças)`;
        }

      } else if (promotion.discount_type === 'progressive') {
        // Custom progression or standard fallback: 1 item = 10%, 2 items = 20%, 3+ items = 30%
        let discountPercent = 0;
        if (promotion.progressive_rules && promotion.progressive_rules.length > 0) {
          // Sort rules descending by qty
          const sortedRules = [...promotion.progressive_rules].sort((a, b) => b.qty - a.qty);
          const matchingRule = sortedRules.find(r => totalMatchingQty >= r.qty);
          if (matchingRule) {
            discountPercent = matchingRule.discount_percent;
          }
        } else {
          // Fallback progressivo default
          if (totalMatchingQty === 1) discountPercent = 10;
          else if (totalMatchingQty === 2) discountPercent = 20;
          else if (totalMatchingQty >= 3) discountPercent = 30;
        }

        if (discountPercent > 0) {
          const rate = discountPercent / 100;
          promotionalPrice = originalPrice * (1 - rate);
          const itemDiscount = (originalPrice - promotionalPrice) * item.quantity;
          promotionDiscount += itemDiscount;
          discountLabel = `Desconto Progressivo: ${discountPercent}% OFF (${totalMatchingQty} peças)`;
        }
      }
    }

    return {
      ...item,
      originalPrice,
      promotionalPrice: Number(promotionalPrice.toFixed(2))
    };
  });

  // Handle Free Shipping promotion
  if (promotion.discount_type === 'free_shipping') {
    const isCityMatch = promotion.free_shipping_city 
      ? customerCity.trim().toLowerCase() === promotion.free_shipping_city.trim().toLowerCase()
      : true;

    const currentSubtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const isThresholdMatch = promotion.free_shipping_threshold
      ? currentSubtotal >= promotion.free_shipping_threshold
      : true;

    if (isCityMatch && isThresholdMatch) {
      shippingDiscount = shippingPrice;
      discountLabel = promotion.title || 'Frete Grátis Ativo';
    }
  }

  return {
    discountedItems,
    promotionDiscount: Number(promotionDiscount.toFixed(2)),
    shippingDiscount: Number(shippingDiscount.toFixed(2)),
    discountLabel
  };
}

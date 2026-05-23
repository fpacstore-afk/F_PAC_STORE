import { CartItem } from '../../types/cart';
import { WeeklyPromotion } from '../../types/promotions';

interface AppliedPromotionResult {
  discountedItems: (CartItem & { originalPrice: number; promotionalPrice: number })[];
  promotionDiscount: number;
  shippingDiscount: number;
  discountLabel: string;
  cashbackEarned?: number;
  freeGiftEarned?: boolean;
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
    discountLabel: '',
    cashbackEarned: 0,
    freeGiftEarned: false
  };

  if (!promotion || !promotion.active || items.length === 0) {
    return defaultResult;
  }

  const discountType = (promotion.discount_type || 'percentage') as string;
  const discountVal = promotion.discount_value ?? 0;

  // Identify matching products. If product_ids is empty or not specified, assume all products participate.
  const hasSpecificProducts = Array.isArray(promotion.product_ids) && promotion.product_ids.length > 0;
  const isPromoProduct = (item: CartItem) => {
    // If specific products are selected
    if (hasSpecificProducts) {
      return promotion.product_ids.includes(item.id);
    }
    // If specific categories are configured
    if (Array.isArray(promotion.categories_participating) && promotion.categories_participating.length > 0) {
      const match = promotion.categories_participating.some(cat => 
        String((item as any).category || '').toLowerCase().trim() === cat.toLowerCase().trim()
      );
      if (match) return true;
    }
    // If no specific restrictions, default to all products participating
    return !hasSpecificProducts && (!Array.isArray(promotion.categories_participating) || promotion.categories_participating.length === 0);
  };

  const matchingItems = items.filter(isPromoProduct);
  const totalMatchingQty = matchingItems.reduce((acc, item) => acc + item.quantity, 0);
  const currentSubtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);

  let promotionDiscount = 0;
  let shippingDiscount = 0;
  let discountLabel = '';
  let cashbackEarned = 0;
  let freeGiftEarned = false;

  // Minimum cart value rule
  if (promotion.minimum_cart_value && currentSubtotal < promotion.minimum_cart_value) {
    return defaultResult;
  }

  // Define discounted items list
  let discountedItems = items.map(item => ({
    ...item,
    originalPrice: item.price,
    promotionalPrice: item.price
  }));

  if (discountType === 'percentage') {
    // Percentage OFF
    discountedItems = items.map(item => {
      let originalPrice = item.price;
      let promotionalPrice = item.price;
      if (isPromoProduct(item)) {
        const rate = discountVal / 100;
        promotionalPrice = originalPrice * (1 - rate);
        promotionDiscount += (originalPrice - promotionalPrice) * item.quantity;
      }
      return {
        ...item,
        originalPrice,
        promotionalPrice: Number(promotionalPrice.toFixed(2))
      };
    });
    discountLabel = `${promotion.title}: -${discountVal}% OFF em itens selecionados`;

  } else if (discountType === 'fixed_amount') {
    // Fixed amount OFF per unit of participating item
    discountedItems = items.map(item => {
      let originalPrice = item.price;
      let promotionalPrice = item.price;
      if (isPromoProduct(item)) {
        promotionalPrice = Math.max(0.10, originalPrice - discountVal);
        promotionDiscount += (originalPrice - promotionalPrice) * item.quantity;
      }
      return {
        ...item,
        originalPrice,
        promotionalPrice: Number(promotionalPrice.toFixed(2))
      };
    });
    discountLabel = `${promotion.title}: R$ ${discountVal} OFF por unidade`;

  } else if (discountType === 'category' || discountType === 'collection') {
    // Category/Collection specific discount
    discountedItems = items.map(item => {
      let originalPrice = item.price;
      let promotionalPrice = item.price;
      if (isPromoProduct(item)) {
        const rate = discountVal / 100;
        promotionalPrice = originalPrice * (1 - rate);
        promotionDiscount += (originalPrice - promotionalPrice) * item.quantity;
      }
      return {
        ...item,
        originalPrice,
        promotionalPrice: Number(promotionalPrice.toFixed(2))
      };
    });
    discountLabel = `${promotion.title}: ${discountVal}% OFF na coleção/categoria`;

  } else if (discountType === 'min_value') {
    // Discount applied because minimum value threshold is crossed
    discountedItems = items.map(item => {
      let originalPrice = item.price;
      let promotionalPrice = item.price;
      if (isPromoProduct(item)) {
        const rate = discountVal / 100;
        promotionalPrice = originalPrice * (1 - rate);
        promotionDiscount += (originalPrice - promotionalPrice) * item.quantity;
      }
      return {
        ...item,
        originalPrice,
        promotionalPrice: Number(promotionalPrice.toFixed(2))
      };
    });
    discountLabel = `${promotion.title}: ${discountVal}% OFF (Comprou mais de R$ ${promotion.minimum_cart_value})`;

  } else if (discountType === 'free_shipping' || discountType === 'free_shipping_regional') {
    // Free Shipping or Regional Free Shipping campaign
    let qualifies = true;
    if (discountType === 'free_shipping_regional' && Array.isArray(promotion.allowed_regions) && promotion.allowed_regions.length > 0) {
      const cityClean = customerCity.trim().toLowerCase();
      qualifies = promotion.allowed_regions.some(reg => cityClean.includes(reg.trim().toLowerCase()) || reg.trim().toLowerCase().includes(cityClean));
    }
    if (promotion.free_shipping_city && customerCity.trim().toLowerCase() !== promotion.free_shipping_city.trim().toLowerCase()) {
      qualifies = false;
    }
    if (promotion.free_shipping_threshold && currentSubtotal < promotion.free_shipping_threshold) {
      qualifies = false;
    }

    if (qualifies) {
      shippingDiscount = shippingPrice;
      discountLabel = promotion.title || 'Frete Grátis Ativo';
    }

  } else if (discountType === 'combo') {
    const comboQty = promotion.combo_qty ?? 2;
    const discountPercent = promotion.combo_discount_percent ?? discountVal;
    if (totalMatchingQty >= comboQty) {
      discountedItems = items.map(item => {
        let originalPrice = item.price;
        let promotionalPrice = item.price;
        if (isPromoProduct(item)) {
          const rate = discountPercent / 100;
          promotionalPrice = originalPrice * (1 - rate);
          promotionDiscount += (originalPrice - promotionalPrice) * item.quantity;
        }
        return {
          ...item,
          originalPrice,
          promotionalPrice: Number(promotionalPrice.toFixed(2))
        };
      });
      discountLabel = `Combo ${promotion.title}: ${discountPercent}% OFF (Min ${comboQty} peças)`;
    }

  } else if (discountType === 'progressive') {
    let discountPercent = 0;
    if (promotion.progressive_rules && promotion.progressive_rules.length > 0) {
      const sortedRules = [...promotion.progressive_rules].sort((a, b) => b.qty - a.qty);
      const matchingRule = sortedRules.find(r => totalMatchingQty >= r.qty);
      if (matchingRule) {
        discountPercent = matchingRule.discount_percent;
      }
    } else {
      // Fallback
      if (totalMatchingQty === 1) discountPercent = 10;
      else if (totalMatchingQty === 2) discountPercent = 20;
      else if (totalMatchingQty >= 3) discountPercent = 30;
    }

    if (discountPercent > 0) {
      discountedItems = items.map(item => {
        let originalPrice = item.price;
        let promotionalPrice = item.price;
        if (isPromoProduct(item)) {
          const rate = discountPercent / 100;
          promotionalPrice = originalPrice * (1 - rate);
          promotionDiscount += (originalPrice - promotionalPrice) * item.quantity;
        }
        return {
          ...item,
          originalPrice,
          promotionalPrice: Number(promotionalPrice.toFixed(2))
        };
      });
      discountLabel = `Desconto Progressivo: ${discountPercent}% OFF (${totalMatchingQty} peças)`;
    }

  } else if (discountType === '2x1') {
    // 2x1: group all matching individual units, order by price ascending, then make Math.floor(totalQty/2) of them free!
    if (totalMatchingQty >= 2) {
      // Deconstruct items into single item units
      const singleUnits: { id: string; price: number; orderIndex: number }[] = [];
      items.forEach((item, oIdx) => {
        if (isPromoProduct(item)) {
          for (let q = 0; q < item.quantity; q++) {
            singleUnits.push({ id: item.id, price: item.price, orderIndex: oIdx });
          }
        }
      });

      // Sort single units of promo items by price ascending
      singleUnits.sort((a, b) => a.price - b.price);
      const freeUnitsCount = Math.floor(singleUnits.length / 2);
      
      // Mark which units are free
      const freeIndexes: { [orderIndex: number]: number } = {};
      for (let f = 0; f < freeUnitsCount; f++) {
        const u = singleUnits[f];
        freeIndexes[u.orderIndex] = (freeIndexes[u.orderIndex] || 0) + 1;
      }

      // Calculate promotional prices for all items in the basket
      discountedItems = items.map((item, oIdx) => {
        let originalPrice = item.price;
        let promotionalPrice = item.price;
        if (isPromoProduct(item)) {
          const freeQty = freeIndexes[oIdx] || 0;
          if (freeQty > 0) {
            // Price averaged across the quantity
            const paidQty = item.quantity - freeQty;
            promotionalPrice = (originalPrice * paidQty) / item.quantity;
            promotionDiscount += (originalPrice - promotionalPrice) * item.quantity;
          }
        }
        return {
          ...item,
          originalPrice,
          promotionalPrice: Number(promotionalPrice.toFixed(2))
        };
      });
      discountLabel = `Campanha 2x1 Ativa: Pague 1 Leve 2 em itens selecionados`;
    }

  } else if (discountType === 'buy3get2') {
    // Leve 3 Pague 2: for every 3 matching units in basket, make 1 unit (the cheapest) free!
    if (totalMatchingQty >= 3) {
      const singleUnits: { id: string; price: number; orderIndex: number }[] = [];
      items.forEach((item, oIdx) => {
        if (isPromoProduct(item)) {
          for (let q = 0; q < item.quantity; q++) {
            singleUnits.push({ id: item.id, price: item.price, orderIndex: oIdx });
          }
        }
      });

      singleUnits.sort((a, b) => a.price - b.price);
      const freeUnitsCount = Math.floor(singleUnits.length / 3);

      const freeIndexes: { [orderIndex: number]: number } = {};
      for (let f = 0; f < freeUnitsCount; f++) {
        const u = singleUnits[f];
        freeIndexes[u.orderIndex] = (freeIndexes[u.orderIndex] || 0) + 1;
      }

      discountedItems = items.map((item, oIdx) => {
        let originalPrice = item.price;
        let promotionalPrice = item.price;
        if (isPromoProduct(item)) {
          const freeQty = freeIndexes[oIdx] || 0;
          if (freeQty > 0) {
            const paidQty = item.quantity - freeQty;
            promotionalPrice = (originalPrice * paidQty) / item.quantity;
            promotionDiscount += (originalPrice - promotionalPrice) * item.quantity;
          }
        }
        return {
          ...item,
          originalPrice,
          promotionalPrice: Number(promotionalPrice.toFixed(2))
        };
      });
      discountLabel = `Campanha Leve 3 Pague 2 Ativa!`;
    }

  } else if (discountType === 'cashback') {
    // Cashback earns cashback percentage for future orders
    const pct = promotion.cashback_percentage || discountVal || 10;
    const activeSub = matchingItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    cashbackEarned = activeSub * (pct / 100);
    discountLabel = `Elegível para Cashback de ${pct}% (R$ ${cashbackEarned.toFixed(2)})`;

  } else if (discountType === 'brinde') {
    // Earn gift with purchase
    freeGiftEarned = true;
    discountLabel = `Campanha Cupom de Brinde Inteligente Ativo!`;

  } else if (discountType === 'pix_discount') {
    // Handled at checkout and total calculation directly inside useCart
    discountLabel = `Super Promoção Especial Pix: ${promotion.pix_discount || discountVal || 10}% de desconto extra no PIX!`;
  }

  return {
    discountedItems,
    promotionDiscount: Number(promotionDiscount.toFixed(2)),
    shippingDiscount: Number(shippingDiscount.toFixed(2)),
    discountLabel,
    cashbackEarned: Number(cashbackEarned.toFixed(2)),
    freeGiftEarned
  };
}

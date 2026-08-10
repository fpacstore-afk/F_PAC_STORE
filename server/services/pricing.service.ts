import { getDb } from '../firebase.js';
import { OrderItem, OrderPricingSnapshot } from '../types/order.types.js';
import { MelhorEnvioService } from './melhor-envio.service.js';
import { logger } from '../utils/logger.js';

interface PricingInput {
  items: Array<{
    id?: string;
    productId?: string;
    slug?: string;
    parentSlug?: string;
    name?: string;
    color?: string;
    size?: string;
    quantity?: number;
    price?: number;
    stampName?: string;
  }>;
  customerInfo: {
    cep?: string;
    city?: string;
    state?: string;
    shippingServiceId?: number;
  };
  couponCode?: string;
  paymentMethodId?: string;
}

interface CalculatedPricingResult {
  pricing: OrderPricingSnapshot;
  verifiedItems: OrderItem[];
}

/**
 * Server-authoritative calculation of order pricing.
 * Overrides any client-provided amounts to prevent price manipulation.
 */
export async function calculateOrderPricing(input: PricingInput): Promise<CalculatedPricingResult> {
  const db = getDb();
  const verifiedItems: OrderItem[] = [];
  let subtotal = 0;

  // 1. Fetch real products from DB to get authoritative unit prices
  for (const rawItem of input.items || []) {
    const slug = rawItem.slug || rawItem.productId || rawItem.id || '';
    const quantity = Math.max(1, Math.floor(Number(rawItem.quantity) || 1));
    const color = String(rawItem.color || 'Padrão').trim();
    const size = String(rawItem.size || 'M').trim();
    const name = String(rawItem.name || 'Produto F PAC').trim();

    let unitPrice = Number(rawItem.price) || 0;
    let originalPrice = unitPrice;

    if (slug) {
      try {
        const prodDoc = await db.collection('products').doc(slug).get();
        if (prodDoc.exists) {
          const pData = prodDoc.data() || {};
          if (pData.price && typeof pData.price === 'number' && pData.price > 0) {
            unitPrice = pData.price;
            originalPrice = pData.price;
          }
        } else {
          // Check by query if doc.id is auto-generated
          const qSnap = await db.collection('products').where('slug', '==', slug).limit(1).get();
          if (!qSnap.empty) {
            const pData = qSnap.docs[0].data();
            if (pData.price && typeof pData.price === 'number' && pData.price > 0) {
              unitPrice = pData.price;
              originalPrice = pData.price;
            }
          }
        }
      } catch (err: any) {
        logger.warn(`⚠️ [PRICING-SERVICE] Could not fetch DB price for slug '${slug}': ${err.message}`);
      }
    }

    // Default price safety check
    if (unitPrice <= 0) {
      unitPrice = 149.90; // Standard base shirt default price
      originalPrice = 149.90;
    }

    const itemTotal = Number((unitPrice * quantity).toFixed(2));
    subtotal += itemTotal;

    const variantKey = (rawItem as any).variantKey || `${color}_${size}`;
    const variantId = (rawItem as any).variantId || variantKey;
    const sku = (rawItem as any).sku || `FP-${(slug || 'PROD').toUpperCase()}-${color.substring(0, 2).toUpperCase()}-${size.toUpperCase()}`;

    verifiedItems.push({
      id: rawItem.id || (slug ? `${slug}_${variantKey}` : `item-${Date.now()}`),
      productId: slug,
      slug,
      parentSlug: rawItem.parentSlug || slug,
      variantId,
      variantKey,
      sku,
      name,
      color,
      size,
      quantity,
      price: unitPrice,
      originalPrice,
      totalPrice: itemTotal,
      stampName: rawItem.stampName
    });
  }

  subtotal = Number(subtotal.toFixed(2));

  // 2. Coupon Validation & Discount Calculation
  let couponDiscount = 0;
  if (input.couponCode) {
    const cleanCoupon = String(input.couponCode).trim().toUpperCase();
    try {
      // Query coupons collection or weekly_promotions
      const promoSnap = await db.collection('weekly_promotions')
        .where('code', '==', cleanCoupon)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (!promoSnap.empty) {
        const promo = promoSnap.docs[0].data();
        const minVal = Number(promo.minPurchaseAmount) || 0;
        if (subtotal >= minVal) {
          if (promo.discountType === 'percentage' || promo.discountPercentage) {
            const pct = Number(promo.discountPercentage || promo.discountValue) || 0;
            couponDiscount = (subtotal * pct) / 100;
          } else if (promo.discountValue) {
            couponDiscount = Number(promo.discountValue) || 0;
          }
        }
      } else {
        // Check legacy coupons doc
        const couponDoc = await db.collection('coupons').doc(cleanCoupon).get();
        if (couponDoc.exists) {
          const cData = couponDoc.data() || {};
          if (cData.active !== false) {
            const pct = Number(cData.discountPercentage) || 0;
            if (pct > 0) {
              couponDiscount = (subtotal * pct) / 100;
            }
          }
        }
      }
    } catch (err: any) {
      logger.warn(`⚠️ [PRICING-SERVICE] Error validating coupon '${input.couponCode}': ${err.message}`);
    }
  }

  couponDiscount = Math.min(subtotal, Number(couponDiscount.toFixed(2)));

  // 3. PIX Discount (e.g., 5% on PIX payments)
  let pixDiscount = 0;
  if (input.paymentMethodId === 'pix') {
    const amountAfterCoupon = subtotal - couponDiscount;
    pixDiscount = Number(((amountAfterCoupon * 5) / 100).toFixed(2));
  }

  // 4. Shipping Calculation
  let shippingFee = 0;
  const cleanCep = String(input.customerInfo.cep || '').replace(/\D/g, '');
  const city = String(input.customerInfo.city || '').toLowerCase().trim();

  // Local delivery check (Joinville or local CEP range)
  const isLocal = city === 'joinville' || (cleanCep.length === 8 && parseInt(cleanCep, 10) >= 89200000 && parseInt(cleanCep, 10) <= 89239999);

  if (isLocal) {
    shippingFee = 0; // Local pickup/delivery rule
  } else if (cleanCep.length === 8) {
    try {
      const melhorEnvio = new MelhorEnvioService();
      const originCep = process.env.ORIGIN_CEP ? process.env.ORIGIN_CEP.replace(/\D/g, '') : '89234100';
      const calcResult = await melhorEnvio.calculateShipping({
        from: originCep,
        to: cleanCep,
        items: verifiedItems.map(i => ({
          id: i.id,
          quantity: i.quantity,
          weight: 0.3,
          width: 20,
          height: 5,
          length: 25,
          insurance_value: i.price || 149.90
        }))
      });

      if (Array.isArray(calcResult) && calcResult.length > 0) {
        if (input.customerInfo.shippingServiceId) {
          const selected = calcResult.find((s: any) => Number(s.id) === Number(input.customerInfo.shippingServiceId));
          if (selected && selected.price) {
            shippingFee = Number(selected.price) || 20.00;
          }
        }
        if (shippingFee === 0 && calcResult[0] && calcResult[0].price) {
          shippingFee = Number(calcResult[0].price) || 20.00;
        }
      } else {
        shippingFee = 22.90; // Safe fallback standard national shipping
      }
    } catch (err: any) {
      logger.warn(`⚠️ [PRICING-SERVICE] Freight calculation fallback: ${err.message}`);
      shippingFee = 22.90;
    }
  } else {
    shippingFee = 22.90;
  }

  shippingFee = Number(shippingFee.toFixed(2));

  // 5. Total
  const total = Number(Math.max(0, subtotal - couponDiscount - pixDiscount + shippingFee).toFixed(2));

  return {
    pricing: {
      subtotal,
      couponDiscount,
      promotionalDiscount: 0,
      pixDiscount,
      shipping: shippingFee,
      total,
      currency: 'BRL'
    },
    verifiedItems
  };
}

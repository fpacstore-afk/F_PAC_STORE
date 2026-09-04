import { getDb } from '../firebase.js';
import { OrderItem, OrderPricingSnapshot } from '../types/order.types.js';
import { MelhorEnvioService } from './melhor-envio.service.js';
import { logger } from '../utils/logger.js';
import { FINANCIAL_DEFAULTS, roundMoney } from '../../shared/financialDefaults.js';
import {
  PRIME_PRINT_SIZE_SURCHARGE,
  getActiveProductColorNames,
  getActiveProductSizes,
  isCatalogLocationAllowed,
  isConfiguredVariantAllowed,
  isPrimeSizeAllowedAtLocation,
  isTrustedCloudinaryArtwork,
  resolvePrimeStampId,
} from './prime-custom-rules.js';

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
    printConfigs?: Array<{
      id?: string;
      stampId?: string;
      stamp?: string;
      location?: string;
      printSize?: string;
      image?: string;
      background?: string;
    }>;
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

  for (const rawItem of input.items || []) {
    const slug = rawItem.slug || rawItem.productId || rawItem.id || '';
    const quantity = Math.max(1, Math.floor(Number(rawItem.quantity) || 1));
    const color = String(rawItem.color || 'Padrão').trim();
    const size = String(rawItem.size || 'M').trim();
    const name = String(rawItem.name || 'Produto F PAC').trim();

    const isPrimeCustom = slug === 'prime-custom';
    let customization: OrderItem['customization'] | undefined;
    if (isPrimeCustom) {
      const configs = Array.isArray(rawItem.printConfigs) ? rawItem.printConfigs : [];
      if (configs.length < 1 || configs.length > 3) {
        throw new Error('PRIME CUSTOM exige entre 1 e 3 estampas válidas.');
      }

      const prints = [];
      const seenLocations = new Set<string>();
      for (let index = 0; index < configs.length; index += 1) {
        const cfg = configs[index];
        const stamp = String(cfg?.stamp || '').trim();
        const location = String(cfg?.location || '').trim();
        const printSize = String(cfg?.printSize || '').trim();
        const stampId = resolvePrimeStampId(cfg, location);
        if (!stampId || !stamp || !location || !printSize) {
          throw new Error(`Configuração de estampa inválida no PRIME CUSTOM (posição ${index + 1}).`);
        }
        if (seenLocations.has(location)) {
          throw new Error(`A posição ${location} foi configurada mais de uma vez no PRIME CUSTOM.`);
        }
        seenLocations.add(location);
        if (!(printSize in PRIME_PRINT_SIZE_SURCHARGE)) {
          throw new Error(`Tamanho de estampa não permitido no PRIME CUSTOM: ${printSize}`);
        }
        if (!isPrimeSizeAllowedAtLocation(printSize, location)) {
          throw new Error(`Tamanho ${printSize} incompatível com a posição ${location} no PRIME CUSTOM.`);
        }

        const ownArtwork = stampId.startsWith('own_art_');
        let canonicalStampName = stamp.slice(0, 160);
        let canonicalImage = '';

        if (ownArtwork) {
          const suppliedImage = String(cfg?.image || '').trim().slice(0, 2048);
          if (!isTrustedCloudinaryArtwork(suppliedImage)) {
            throw new Error(`Arte própria inválida no PRIME CUSTOM (posição ${index + 1}).`);
          }
          canonicalImage = suppliedImage;
        } else {
          let catalogData: any | undefined;
          for (const collectionName of ['designs', 'estampas']) {
            const stampDoc = await db.collection(collectionName).doc(stampId).get();
            if (stampDoc.exists) {
              catalogData = stampDoc.data() || {};
              break;
            }
          }
          if (!catalogData || catalogData.status === 'archived' || catalogData.available === false) {
            throw new Error(`Estampa inválida ou indisponível no PRIME CUSTOM (posição ${index + 1}).`);
          }
          if (!isCatalogLocationAllowed(catalogData.allowedLocations, location)) {
            throw new Error(`A estampa ${String(catalogData.name || stamp).slice(0, 80)} não é permitida em ${location}.`);
          }

          canonicalStampName = String(catalogData.name || stamp).trim().slice(0, 160);
          canonicalImage = String(
            catalogData.pngUrl || catalogData.mockupUrl || catalogData.image || catalogData.imageUrl || ''
          ).trim().slice(0, 2048);
        }

        prints.push({
          id: String(cfg?.id || `print-${index + 1}`).slice(0, 160),
          stampId: stampId.slice(0, 160),
          stamp: canonicalStampName,
          location: location.slice(0, 120),
          printSize: printSize.slice(0, 80),
          image: canonicalImage || undefined,
          background: cfg?.background ? String(cfg.background).slice(0, 80) : undefined,
        });
      }

      customization = { type: 'prime-custom', prints };
    }

    let unitPrice = 0;
    let originalPrice = unitPrice;
    let dbCost: number | undefined = undefined;
    let canonicalProductData: any | undefined;
    const pricingSlug = isPrimeCustom ? 'prime' : slug;

    if (pricingSlug) {
      try {
        const prodDoc = await db.collection('products').doc(pricingSlug).get();
        if (prodDoc.exists) {
          const pData = prodDoc.data() || {};
          canonicalProductData = pData;
          if (pData.price && typeof pData.price === 'number' && pData.price > 0) {
            unitPrice = pData.price;
            originalPrice = pData.price;
          }
          if (typeof pData.costPrice === 'number' && pData.costPrice > 0) dbCost = pData.costPrice;
          else if (typeof pData.cost === 'number' && pData.cost > 0) dbCost = pData.cost;
        } else {
          const qSnap = await db.collection('products').where('slug', '==', pricingSlug).limit(1).get();
          if (!qSnap.empty) {
            const pData = qSnap.docs[0].data();
            canonicalProductData = pData;
            if (pData.price && typeof pData.price === 'number' && pData.price > 0) {
              unitPrice = pData.price;
              originalPrice = pData.price;
            }
            if (typeof pData.costPrice === 'number' && pData.costPrice > 0) dbCost = pData.costPrice;
            else if (typeof pData.cost === 'number' && pData.cost > 0) dbCost = pData.cost;
          }
        }
      } catch (err: any) {
        logger.warn(`⚠️ [PRICING-SERVICE] Could not fetch DB price for slug '${slug}': ${err.message}`);
      }
    }

    if (unitPrice <= 0) {
      throw new Error(`Produto inválido ou sem preço cadastrado: ${slug || 'sem-identificador'}`);
    }

    if (isPrimeCustom && canonicalProductData) {
      const activeColors = getActiveProductColorNames(canonicalProductData.colors);
      const activeSizes = getActiveProductSizes(canonicalProductData.sizes);
      if (!isConfiguredVariantAllowed(activeColors, color)) {
        throw new Error(`Cor indisponível para PRIME CUSTOM: ${color}`);
      }
      if (!isConfiguredVariantAllowed(activeSizes, size)) {
        throw new Error(`Tamanho indisponível para PRIME CUSTOM: ${size}`);
      }
    }

    if (isPrimeCustom && customization) {
      const extras = customization.prints.reduce((sum, print) => {
        const surcharge = PRIME_PRINT_SIZE_SURCHARGE[print.printSize];
        if (typeof surcharge !== 'number') {
          throw new Error(`Tamanho de estampa não permitido no PRIME CUSTOM: ${print.printSize}`);
        }
        return sum + surcharge;
      }, 0);
      unitPrice = roundMoney(unitPrice + extras);
      originalPrice = unitPrice;
    }

    const isCostExact = typeof dbCost === 'number' && dbCost > 0;
    let unitCost = dbCost;
    if (!unitCost || unitCost <= 0) {
      const lower = `${slug} ${name}`.toLowerCase();
      if (lower.includes('mark')) unitCost = FINANCIAL_DEFAULTS.estimatedProductCosts.MARK;
      else if (lower.includes('prime')) unitCost = FINANCIAL_DEFAULTS.estimatedProductCosts.PRIME;
      else if (lower.includes('force')) unitCost = FINANCIAL_DEFAULTS.estimatedProductCosts.FORCE;
      else unitCost = FINANCIAL_DEFAULTS.estimatedProductCosts.DEFAULT;
    }

    const unitCostSnapshot = roundMoney(unitCost);
    const totalCostSnapshot = roundMoney(unitCostSnapshot * quantity);
    const costCoverage = isCostExact ? 'complete' : 'estimated';
    const itemTotal = roundMoney(unitPrice * quantity);
    subtotal += itemTotal;

    const variantKey = (rawItem as any).variantKey || `${color}_${size}`;
    const variantId = (rawItem as any).variantId || variantKey;
    const canonicalParentSlug = isPrimeCustom ? 'prime' : String(canonicalProductData?.parentSlug || slug).trim();
    const canonicalName = String(canonicalProductData?.name || name).trim().slice(0, 200);
    const canonicalSkuBase = String(canonicalProductData?.sku || '').trim();
    const sku = canonicalSkuBase
      ? `${canonicalSkuBase}-${color.substring(0, 2).toUpperCase()}-${size.toUpperCase()}`
      : `FP-${(slug || 'PROD').toUpperCase()}-${color.substring(0, 2).toUpperCase()}-${size.toUpperCase()}`;

    verifiedItems.push({
      id: rawItem.id || (slug ? `${slug}_${variantKey}` : `item-${Date.now()}`),
      productId: slug,
      slug,
      parentSlug: canonicalParentSlug,
      variantId,
      variantKey,
      sku,
      name: canonicalName,
      color,
      size,
      quantity,
      price: unitPrice,
      originalPrice,
      totalPrice: itemTotal,
      stampName: rawItem.stampName || customization?.prints?.[0]?.stamp,
      customization,
      unitCostSnapshot,
      totalCostSnapshot,
      costCoverage
    });
  }

  subtotal = Number(subtotal.toFixed(2));

  let couponDiscount = 0;
  if (input.couponCode) {
    const cleanCoupon = String(input.couponCode).trim().toUpperCase();
    try {
      const promoSnap = await db.collection('weekly_promotions').where('code', '==', cleanCoupon).where('active', '==', true).limit(1).get();
      if (!promoSnap.empty) {
        const promo = promoSnap.docs[0].data();
        const minVal = Number(promo.minPurchaseAmount) || 0;
        if (subtotal >= minVal) {
          if (promo.discountType === 'percentage' || promo.discountPercentage) {
            const pct = Number(promo.discountPercentage || promo.discountValue) || 0;
            couponDiscount = (subtotal * pct) / 100;
          } else if (promo.discountValue) couponDiscount = Number(promo.discountValue) || 0;
        }
      } else {
        const couponDoc = await db.collection('coupons').doc(cleanCoupon).get();
        if (couponDoc.exists) {
          const cData = couponDoc.data() || {};
          if (cData.active !== false) {
            const pct = Number(cData.discountPercentage) || 0;
            if (pct > 0) couponDiscount = (subtotal * pct) / 100;
          }
        }
      }
    } catch (err: any) {
      logger.warn(`⚠️ [PRICING-SERVICE] Error validating coupon '${input.couponCode}': ${err.message}`);
    }
  }
  couponDiscount = Math.min(subtotal, Number(couponDiscount.toFixed(2)));

  let pixDiscount = 0;
  if (input.paymentMethodId === 'pix') {
    const amountAfterCoupon = subtotal - couponDiscount;
    pixDiscount = Number(((amountAfterCoupon * 5) / 100).toFixed(2));
  }

  let shippingFee = 0;
  const cleanCep = String(input.customerInfo.cep || '').replace(/\D/g, '');
  const city = String(input.customerInfo.city || '').toLowerCase().trim();
  const isLocal = city === 'joinville' || (cleanCep.length === 8 && parseInt(cleanCep, 10) >= 89200000 && parseInt(cleanCep, 10) <= 89239999);

  if (isLocal) {
    shippingFee = 0;
  } else if (cleanCep.length === 8) {
    try {
      const melhorEnvio = new MelhorEnvioService();
      const originCep = process.env.ORIGIN_CEP ? process.env.ORIGIN_CEP.replace(/\D/g, '') : '89234100';
      const calcResult = await melhorEnvio.calculateShipping({
        from: originCep,
        to: cleanCep,
        items: verifiedItems.map(i => ({ id: i.id, quantity: i.quantity, weight: 0.3, width: 20, height: 5, length: 25, insurance_value: i.price || 149.90 }))
      });
      if (Array.isArray(calcResult) && calcResult.length > 0) {
        if (input.customerInfo.shippingServiceId) {
          const selected = calcResult.find((s: any) => Number(s.id) === Number(input.customerInfo.shippingServiceId));
          if (selected && selected.price) shippingFee = Number(selected.price) || 20.00;
        }
        if (shippingFee === 0 && calcResult[0] && calcResult[0].price) shippingFee = Number(calcResult[0].price) || 20.00;
      } else throw new Error('Não foi possível obter uma cotação de frete válida.');
    } catch (err: any) {
      logger.warn(`⚠️ [PRICING-SERVICE] Freight calculation failed: ${err.message}`);
      throw new Error('Não foi possível calcular o frete neste momento. Tente novamente.');
    }
  } else throw new Error('CEP inválido para cálculo de frete.');

  shippingFee = Number(shippingFee.toFixed(2));
  const total = Number(Math.max(0, subtotal - couponDiscount - pixDiscount + shippingFee).toFixed(2));

  return {
    pricing: { subtotal, couponDiscount, promotionalDiscount: 0, pixDiscount, shipping: shippingFee, total, currency: 'BRL' },
    verifiedItems
  };
}

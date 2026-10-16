import { isCatalogSleeveSize } from '../../shared/primeArtworkSizing.js';
import { calculateStorefrontTotals, selectActivePromotion } from '../../shared/storefrontTotals.js';
import { shippingParcel } from '../../shared/shippingParcel.js';
import type { CartItem } from '../../src/types/cart.js';
import type { WeeklyPromotion } from '../../src/types/promotions.js';
import { validatePrimeArtworkPlacement } from '../../shared/primePlacement.js';
import { getDb } from '../firebase.js';
import { OrderItem, OrderPricingSnapshot } from '../types/order.types.js';
import { quoteCheckoutDelivery, type DeliveryDependencies } from './checkoutDelivery.service.js';
import { logger } from '../utils/logger.js';
import { loadPrivateProductCost, mergePrivateProductCost } from '../utils/productCosts.js';
import { FINANCIAL_DEFAULTS, roundMoney } from '../../shared/financialDefaults.js';
import { getCustomizationProfileByCartSlug } from '../../shared/customizationProfiles.js';
import { isProductPublished } from '../../shared/productPublication.js';
import { isPrimeBaseProduct } from '../../shared/primeBaseProduct.js';
import { calculatePrimePrice } from '../../shared/primePricing.js';
import { resolveProductStampRecipeEntries } from '../../shared/productStampRecipe.js';
import { getProductVisualKind } from '../../src/lib/productPresentation.js';
import {
  isCatalogPrimeSizeRegistered,
  isPrimeCatalogArtworkId,
  getActiveProductColorNames,
  getActiveProductSizes,
  isCatalogLocationAllowed,
  isConfiguredVariantAllowed,
  isPrimeSizeAllowedAtLocation,
  resolvePrimeStampId,
  parsePrimePrintDimensions,
  PRIME_POSITION_RULES,
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
      placement?: unknown;
      rotationDeg?: number;
      orientationInstruction?: string;
    }>;
    baseProductSlug?: string;
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
export async function calculateOrderPricing(input: PricingInput, context: Partial<DeliveryDependencies> & { now?: number; priceOnly?: boolean } = {}): Promise<CalculatedPricingResult> {
  const db = getDb();
  const verifiedItems: OrderItem[] = [];
  const storefrontItems: CartItem[] = [];

  for (const rawItem of input.items || []) {
    const slug = rawItem.slug || rawItem.productId || rawItem.id || '';
    const quantity = Math.max(1, Math.floor(Number(rawItem.quantity) || 1));
    const color = String(rawItem.color || 'Padrão').trim();
    const size = String(rawItem.size || 'M').trim();
    const name = String(rawItem.name || 'Produto F PAC').trim();

    const customizationProfile = getCustomizationProfileByCartSlug(slug);
    const isPrimeCustom = Boolean(customizationProfile);
    let customization: OrderItem['customization'] | undefined;

    if (isPrimeCustom && customizationProfile) {
      const configs = Array.isArray(rawItem.printConfigs) ? rawItem.printConfigs : [];
      const minPrints = customizationProfile.id === 'oversized' ? 0 : 1;
      if (configs.length < minPrints || configs.length > customizationProfile.maxPrints) {
        throw new Error(`PRIME CUSTOM exige entre 1 e ${customizationProfile.maxPrints} estampas válidas.`);
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
        if (!isPrimeSizeAllowedAtLocation(printSize, location)) {
          throw new Error(`Tamanho ${printSize} incompatível com a posição ${location} no PRIME CUSTOM.`);
        }

        if (!isPrimeCatalogArtworkId(stampId)) {
          throw new Error('O PRIME aceita somente estampas disponíveis no catálogo do site.');
        }
        const isSleeve = location === 'Manga Esquerda' || location === 'Manga Direita';
        const area = customizationProfile.printAreas.find(area => area.positionId === PRIME_POSITION_RULES[location as keyof typeof PRIME_POSITION_RULES]?.id || (isSleeve && area.id === 'left-sleeve'));
        const dimensions = parsePrimePrintDimensions(printSize);
        if (!area || !dimensions || dimensions[0] > area.maxWidthCm || dimensions[1] > area.maxHeightCm) throw new Error('Área de estampa indisponível para este modelo.');
        if (isSleeve && (location !== 'Manga Esquerda' || !isCatalogSleeveSize(printSize))) throw new Error('Estampas do catálogo na manga devem ter 2 × 3 ou 3 × 2 cm no braço esquerdo.');

        let catalogData: any | undefined;
        for (const collectionName of ['designs', 'estampas']) {
          const stampDoc = await db.collection(collectionName).doc(stampId).get();
          if (stampDoc.exists) {
            catalogData = stampDoc.data() || {};
            break;
          }
        }
        const catalogStatus = String(catalogData?.status || 'active');
        if (!catalogData || ['draft', 'archived', 'unavailable'].includes(catalogStatus) || catalogData.available === false || catalogData.availableForCustomization === false) {
          throw new Error(`Estampa inválida ou indisponível no PRIME CUSTOM (posição ${index + 1}).`);
        }
        if (!isCatalogLocationAllowed(catalogData.allowedLocations, location)) {
          throw new Error(`A estampa ${String(catalogData.name || stamp).slice(0, 80)} não é permitida em ${location}.`);
        }
        if (!isCatalogPrimeSizeRegistered(catalogData.availableSizes, printSize)) {
          throw new Error(`A medida ${printSize} não está cadastrada para a estampa ${String(catalogData.name || stamp)}.`);
        }

        const canonicalStampName = String(catalogData.name || stamp).trim().slice(0, 160);
        const canonicalImage = String(
          catalogData.pngUrl || catalogData.mockupUrl || catalogData.image || catalogData.imageUrl || ''
        ).trim().slice(0, 2048);
        if (!canonicalImage) throw new Error(`A estampa ${canonicalStampName} não possui imagem disponível no catálogo.`);

        prints.push({
          id: String(cfg?.id || `print-${index + 1}`).slice(0, 160),
          stampId: stampId.slice(0, 160),
          stamp: canonicalStampName,
          location: location.slice(0, 120),
          printSize: printSize.slice(0, 80),
          image: canonicalImage || undefined,
          ...(cfg?.placement != null ? { placement: validatePrimeArtworkPlacement(cfg.placement, customizationProfile.id, size, location, printSize, isSleeve) } : {}),
          ...(area.rotationDeg === undefined ? {} : { rotationDeg: area.rotationDeg }),
          ...(area.orientationInstruction ? { orientationInstruction: area.orientationInstruction } : {}),
          background: cfg?.background ? String(cfg.background).slice(0, 80) : undefined,
        });
      }

      customization = { type: 'prime-custom', prints };
    }

    let unitPrice = 0;
    let originalPrice = unitPrice;
    let dbCost: number | undefined = undefined;
    let canonicalProductData: any | undefined;
    let canonicalProductId = '';
    let stampRecipeSnapshot: NonNullable<OrderItem['stampRecipe']> = [];
    const requestedBaseProductSlug = String(rawItem.baseProductSlug || '').trim();
    const pricingSlug = isPrimeCustom && requestedBaseProductSlug
      ? requestedBaseProductSlug
      : (customizationProfile?.productSlug || slug);

    if (pricingSlug) {
      try {
        const prodDoc = await db.collection('products').doc(pricingSlug).get();
        if (prodDoc.exists) {
          const pData = prodDoc.data() || {};
          canonicalProductData = pData;
          canonicalProductId = prodDoc.id;
          if (pData.price && typeof pData.price === 'number' && pData.price > 0) {
            unitPrice = pData.price;
            originalPrice = pData.price;
          }
          if (typeof pData.costPrice === 'number' && pData.costPrice > 0) dbCost = pData.costPrice;
          else if (typeof pData.cost === 'number' && pData.cost > 0) dbCost = pData.cost;
        } else {
          const qSnap = await db.collection('products').where('slug', '==', pricingSlug).limit(1).get();
          if (!qSnap.empty) {
            const matchedProduct = qSnap.docs[0];
            const pData = matchedProduct.data();
            canonicalProductData = pData;
            canonicalProductId = matchedProduct.id;
            if (pData.price && typeof pData.price === 'number' && pData.price > 0) {
              unitPrice = pData.price;
              originalPrice = pData.price;
            }
            if (typeof pData.costPrice === 'number' && pData.costPrice > 0) dbCost = pData.costPrice;
            else if (typeof pData.cost === 'number' && pData.cost > 0) dbCost = pData.cost;
          }
        }

        if (canonicalProductData && canonicalProductId) {
          const privateCost = await loadPrivateProductCost(db, canonicalProductId);
          canonicalProductData = mergePrivateProductCost(canonicalProductData, privateCost);
          if (typeof privateCost?.costPrice === 'number' && privateCost.costPrice > 0) dbCost = privateCost.costPrice;
          else if (typeof privateCost?.cost === 'number' && privateCost.cost > 0) dbCost = privateCost.cost;
        }
      } catch (err: any) {
        logger.warn(`⚠️ [PRICING-SERVICE] Could not fetch DB price for slug '${slug}': ${err.message}`);
      }
    }

    if (canonicalProductData?.productFinish === 'printed') {
      const recipe = resolveProductStampRecipeEntries(canonicalProductData, color);
      const colorRecipes = canonicalProductData.stampIdsByColor;
      if (
        colorRecipes && typeof colorRecipes === 'object' && Object.keys(colorRecipes).length > 0 &&
        recipe.length === 0
      ) {
        throw new Error(`Receita de estampa não cadastrada para a cor "${color}" do produto "${String(canonicalProductData.name || name)}". Revise o cadastro antes de vender.`);
      }
      stampRecipeSnapshot = await Promise.all(recipe.map(async entry => {
        const stampSnap = await db.collection('designs').doc(entry.stampId).get();
        const stamp = stampSnap.exists ? stampSnap.data() || {} : {};
        return {
          ...entry,
          name: String(stamp.name || stamp.code || entry.stampId).slice(0, 160),
          ...(stamp.code ? { code: String(stamp.code).slice(0, 80) } : {}),
          ...((stamp.printColor || stamp.inkColor || stamp.stampColor || stamp.color)
            ? { printColor: String(stamp.printColor || stamp.inkColor || stamp.stampColor || stamp.color).slice(0, 40) }
            : {}),
          ...((stamp.thumbnailUrl || stamp.mockupUrl || stamp.pngUrl)
            ? { image: String(stamp.thumbnailUrl || stamp.mockupUrl || stamp.pngUrl).slice(0, 2048) }
            : {}),
        };
      }));
    }

    const isInternalPrimeBase = isPrimeCustom && isPrimeBaseProduct(canonicalProductData);
    if (isPrimeCustom && (!isInternalPrimeBase || getProductVisualKind(canonicalProductData) !== customizationProfile!.id)) {
      throw new Error('Escolha uma peça lisa disponível para este modelo PRIME.');
    }
    if (!canonicalProductData || (!isInternalPrimeBase && !isProductPublished(canonicalProductData))) {
      throw new Error('Este produto não está disponível no catálogo. Escolha um produto publicado.');
    }

    if (!customizationProfile) {
      const promotionalPrice = Number(canonicalProductData.promotionalPrice);
      if (Number.isFinite(promotionalPrice) && promotionalPrice > 0 && promotionalPrice < unitPrice) unitPrice = promotionalPrice;
    }

    if (customizationProfile) {
      unitPrice = calculatePrimePrice(customizationProfile.id, customization?.prints || []).total;
      originalPrice = unitPrice;
    }

    if (unitPrice <= 0) {
      throw new Error(`Produto inválido ou sem preço cadastrado: ${slug || 'sem-identificador'}`);
    }

    if (isPrimeCustom && canonicalProductData) {
      const activeColors = getActiveProductColorNames(canonicalProductData.colors);
      const activeSizes = getActiveProductSizes(canonicalProductData.sizes);
      if (activeColors.length === 0 || !isConfiguredVariantAllowed(activeColors, color)) {
        throw new Error(`Cor indisponível para PRIME CUSTOM: ${color}`);
      }
      if (activeSizes.length === 0 || !isConfiguredVariantAllowed(activeSizes, size)) {
        throw new Error(`Tamanho indisponível para PRIME CUSTOM: ${size}`);
      }
    }

    const hasCatalogCost = typeof dbCost === 'number' && dbCost > 0;
    const isCostComplete = hasCatalogCost && canonicalProductData?.costCalculation?.coverage !== 'partial';
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
    const costCoverage = isCostComplete ? 'complete' : 'estimated';
    const itemTotal = roundMoney(unitPrice * quantity);


    const variantKey = (rawItem as any).variantKey || `${color}_${size}`;
    const variantId = (rawItem as any).variantId || variantKey;
    const canonicalParentSlug = isPrimeCustom ? String(canonicalProductData?.slug || canonicalProductId) : String(canonicalProductData?.parentSlug || slug).trim();
    const canonicalName = String(canonicalProductData?.name || name).trim().slice(0, 200);
    const canonicalSkuBase = String(canonicalProductData?.sku || '').trim();
    const sku = canonicalSkuBase
      ? `${canonicalSkuBase}-${color.substring(0, 2).toUpperCase()}-${size.toUpperCase()}`
      : `FP-${(slug || 'PROD').toUpperCase()}-${color.substring(0, 2).toUpperCase()}-${size.toUpperCase()}`;

    const parcel = shippingParcel({ ...canonicalProductData, id: canonicalProductId, quantity, price: unitPrice });
    const category = typeof canonicalProductData.category === 'string' ? canonicalProductData.category : '';
    storefrontItems.push({
      id: canonicalProductId, slug: String(canonicalProductData.slug || canonicalProductId),
      name: canonicalName, price: unitPrice, originalPrice, quantity, color, size, image: '', category,
    });
    verifiedItems.push({
      id: rawItem.id || (slug ? `${slug}_${variantKey}` : `item-${Date.now()}`),
      productId: canonicalProductId || pricingSlug || slug,
      slug: pricingSlug || slug,
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
      category, width: parcel.width, height: parcel.height, length: parcel.length, weight: parcel.weight,
      stampName: stampRecipeSnapshot.length
        ? stampRecipeSnapshot.map(print => print.name).join(' + ').slice(0, 320)
        : (customization?.prints?.[0]?.stamp || rawItem.stampName),
      stampRecipe: stampRecipeSnapshot.length ? stampRecipeSnapshot : undefined,
      customization,
      unitCostSnapshot,
      totalCostSnapshot,
      costCoverage
    });
  }

  const delivery = context.priceOnly ? { destination: { city: '', state: '', neighborhood: '' }, shipping: 0 } : await quoteCheckoutDelivery(input.customerInfo, verifiedItems, context);
  const campaigns = await db.collection('weekly_promotions').where('active', '==', true).get();
  const promotion = selectActivePromotion(campaigns.docs.map(doc => ({ ...doc.data(), id: doc.id } as WeeklyPromotion)), context.now);
  const money = calculateStorefrontTotals({
    items: storefrontItems, promotion, shipping: delivery.shipping, coupon: input.couponCode,
    pixEnabled: input.paymentMethodId === 'pix', city: delivery.destination.city, now: context.now,
  });
  return {
    pricing: {
      subtotal: money.subtotal, couponDiscount: money.couponDiscount,
      promotionalDiscount: roundMoney(money.promotionDiscount + money.flashSaleDiscount),
      weeklyPromotionDiscount: money.promotionDiscount, flashSaleDiscount: money.flashSaleDiscount,
      pixDiscount: money.pixDiscount, shipping: money.shipping, total: money.total, currency: 'BRL',
    },
    verifiedItems,
  };
}

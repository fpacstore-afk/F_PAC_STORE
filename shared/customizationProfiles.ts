export type CustomizationProfileId = 'oversized' | 'traditional' | 'cropped' | 'hoodie' | 'shorts' | 'cap';

export interface CustomizationPrintArea {
  id: string;
  positionId: string;
  label: string;
  viewSide: 'front' | 'back';
  maxWidthCm: number;
  maxHeightCm: number;
  defaultSizeCm: string;
}

export interface CustomizationProductProfile {
  id: CustomizationProfileId;
  label: string;
  shortLabel: string;
  enabled: boolean;
  cartSlug: string;
  productSlug: string;
  parentSlug: string;
  pricingMode: 'fixed' | 'catalog';
  fixedPrice: number | null;
  maxPrints: number;
  printAreas: CustomizationPrintArea[];
}

const FRONT_30X40: CustomizationPrintArea = {
  id: 'front',
  positionId: 'peito_central',
  label: 'Frente',
  viewSide: 'front',
  maxWidthCm: 30,
  maxHeightCm: 40,
  defaultSizeCm: '20x30',
};

const BACK_30X40: CustomizationPrintArea = {
  id: 'back',
  positionId: 'costas',
  label: 'Costas',
  viewSide: 'back',
  maxWidthCm: 30,
  maxHeightCm: 40,
  defaultSizeCm: '20x30',
};

/**
 * Registry for the F PAC customization engine.
 * PRIME is product-agnostic: every enabled garment can use the same secure
 * customization checkout while keeping its own stable profile and print limits.
 */
export const CUSTOMIZATION_PRODUCT_PROFILES: Readonly<Record<CustomizationProfileId, CustomizationProductProfile>> = Object.freeze({
  oversized: {
    id: 'oversized',
    label: 'Camiseta Oversized PRIME',
    shortLabel: 'Oversized',
    enabled: true,
    cartSlug: 'prime-custom',
    productSlug: 'prime',
    parentSlug: 'prime',
    pricingMode: 'fixed',
    fixedPrice: 119.90,
    maxPrints: 3,
    printAreas: [FRONT_30X40, BACK_30X40, { id: 'left-sleeve', positionId: 'manga_esquerda', label: 'Manga esquerda', viewSide: 'front', maxWidthCm: 10, maxHeightCm: 12, defaultSizeCm: '8x8' }],
  },
  traditional: {
    id: 'traditional',
    label: 'Camiseta Tradicional Suedine',
    shortLabel: 'Tradicional',
    enabled: true,
    cartSlug: 'traditional-custom',
    productSlug: 'traditional',
    parentSlug: 'prime',
    pricingMode: 'fixed',
    fixedPrice: 119.90,
    maxPrints: 3,
    printAreas: [FRONT_30X40, BACK_30X40, { id: 'left-sleeve', positionId: 'manga_esquerda', label: 'Manga esquerda', viewSide: 'front', maxWidthCm: 10, maxHeightCm: 12, defaultSizeCm: '8x8' }],
  },
  cropped: {
    id: 'cropped',
    label: 'Cropped Personalizado',
    shortLabel: 'Cropped',
    enabled: true,
    cartSlug: 'cropped-custom',
    productSlug: 'cropped',
    parentSlug: 'prime',
    pricingMode: 'fixed',
    fixedPrice: 119.90,
    maxPrints: 3,
    printAreas: [{ ...FRONT_30X40, maxHeightCm: 35 }, BACK_30X40, { id: 'left-sleeve', positionId: 'manga_esquerda', label: 'Manga esquerda', viewSide: 'front', maxWidthCm: 10, maxHeightCm: 12, defaultSizeCm: '8x8' }],
  },
  hoodie: {
    id: 'hoodie',
    label: 'Casaco / Moletom Personalizado',
    shortLabel: 'Casaco',
    enabled: true,
    cartSlug: 'hoodie-custom',
    productSlug: 'hoodie',
    parentSlug: 'prime',
    pricingMode: 'fixed',
    fixedPrice: 119.90,
    maxPrints: 3,
    printAreas: [FRONT_30X40, BACK_30X40, { id: 'left-sleeve', positionId: 'manga_esquerda', label: 'Manga esquerda', viewSide: 'front', maxWidthCm: 10, maxHeightCm: 12, defaultSizeCm: '8x8' }],
  },
  shorts: {
    id: 'shorts',
    label: 'Bermuda Personalizada',
    shortLabel: 'Bermuda',
    enabled: true,
    cartSlug: 'shorts-custom',
    productSlug: 'shorts',
    parentSlug: 'prime',
    pricingMode: 'fixed',
    fixedPrice: 119.90,
    maxPrints: 2,
    printAreas: [{ id: 'front', positionId: 'bermuda_frente', label: 'Frente', viewSide: 'front', maxWidthCm: 15, maxHeightCm: 20, defaultSizeCm: '10x12' }, { id: 'back', positionId: 'bermuda_costas', label: 'Costas', viewSide: 'back', maxWidthCm: 15, maxHeightCm: 20, defaultSizeCm: '10x12' }],
  },
  cap: {
    id: 'cap',
    label: 'Boné Personalizado',
    shortLabel: 'Boné',
    enabled: true,
    cartSlug: 'cap-custom',
    productSlug: 'cap',
    parentSlug: 'prime',
    pricingMode: 'fixed',
    fixedPrice: 119.90,
    maxPrints: 1,
    printAreas: [{ id: 'front', positionId: 'bone_frontal', label: 'Frente', viewSide: 'front', maxWidthCm: 12, maxHeightCm: 6, defaultSizeCm: '10x5' }],
  },
});

export const ACTIVE_CUSTOMIZATION_PROFILE_ID: CustomizationProfileId = 'oversized';
export const PRIME_CUSTOM_FIXED_PRICE = CUSTOMIZATION_PRODUCT_PROFILES.oversized.fixedPrice as number;

export const getCustomizationProfileById = (
  id: string | null | undefined,
  includeDisabled = false,
): CustomizationProductProfile | undefined => {
  const profile = CUSTOMIZATION_PRODUCT_PROFILES[id as CustomizationProfileId];
  if (!profile) return undefined;
  if (!includeDisabled && !profile.enabled) return undefined;
  return profile;
};

export const getCustomizationProfileByCartSlug = (
  cartSlug: string | null | undefined,
  includeDisabled = false,
): CustomizationProductProfile | undefined => {
  const normalized = String(cartSlug || '').trim().toLowerCase();
  return Object.values(CUSTOMIZATION_PRODUCT_PROFILES).find(profile =>
    profile.cartSlug.toLowerCase() === normalized && (includeDisabled || profile.enabled),
  );
};

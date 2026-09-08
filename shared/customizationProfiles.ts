export type CustomizationProfileId = 'oversized' | 'traditional' | 'cropped' | 'hoodie' | 'cap';

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
 * Only `oversized` is commercially enabled today. The disabled profiles reserve
 * stable IDs/routes so new garments can be activated without rebuilding checkout.
 * Their print areas intentionally remain empty until physical measurements are approved.
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
    maxPrints: 2,
    printAreas: [FRONT_30X40, BACK_30X40],
  },
  traditional: {
    id: 'traditional',
    label: 'Camiseta Tradicional Suedine',
    shortLabel: 'Tradicional',
    enabled: false,
    cartSlug: 'traditional-custom',
    productSlug: 'traditional',
    parentSlug: 'traditional',
    pricingMode: 'catalog',
    fixedPrice: null,
    maxPrints: 2,
    printAreas: [],
  },
  cropped: {
    id: 'cropped',
    label: 'Cropped Personalizado',
    shortLabel: 'Cropped',
    enabled: false,
    cartSlug: 'cropped-custom',
    productSlug: 'cropped',
    parentSlug: 'cropped',
    pricingMode: 'catalog',
    fixedPrice: null,
    maxPrints: 2,
    printAreas: [],
  },
  hoodie: {
    id: 'hoodie',
    label: 'Casaco / Moletom Personalizado',
    shortLabel: 'Casaco',
    enabled: false,
    cartSlug: 'hoodie-custom',
    productSlug: 'hoodie',
    parentSlug: 'hoodie',
    pricingMode: 'catalog',
    fixedPrice: null,
    maxPrints: 2,
    printAreas: [],
  },
  cap: {
    id: 'cap',
    label: 'Boné Personalizado',
    shortLabel: 'Boné',
    enabled: false,
    cartSlug: 'cap-custom',
    productSlug: 'cap',
    parentSlug: 'cap',
    pricingMode: 'catalog',
    fixedPrice: null,
    maxPrints: 1,
    printAreas: [],
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

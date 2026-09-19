import type { ProductCategory, ProductSizeSystem, ProductVariantDefinition } from '../types/product';

export interface Product {
  id: string;
  slug: string;
  name: string;
  headline: string;
  price: number;
  costPrice?: number;
  description: string;

  // Garment type is independent from the commercial collection.
  category?: string;
  productType?: ProductCategory;
  collection?: string;
  sizeSystem?: ProductSizeSystem;

  images: string[];
  imageStampSizes?: string[];
  stampGallery?: string[];
  stampGallerySizes?: string[];
  sizes: string[];
  colors: { name: string; hex: string }[];
  variants?: ProductVariantDefinition[];
  specs: string[];
  isNew?: boolean;
  isBestseller?: boolean;
  status?: string;
  is_prime?: boolean;
  parentSlug?: string;
  stampSize?: string;
  sleeveLogo?: string;
}

// The live catalog is Firestore-only. FORCE, MARK and PRIME are commercial
// collections attached to each real product, not standalone fallback products.
// Keeping this list empty prevents deleted legacy bases from reappearing and lets
// new catalog registrations become the single source of truth everywhere.
export const products: Product[] = [];

export function getProductBySlug(slug: string): Product | undefined {
  return products.find(p => p.slug === slug);
}

import { COLLECTIONS_CONFIG } from './collectionsConfig';

export interface Product {
  id: string;
  slug: string;
  name: string;
  headline: string;
  price: number;
  costPrice?: number;
  description: string;
  images: string[];
  imageStampSizes?: string[];
  stampGallery?: string[];
  stampGallerySizes?: string[];
  sizes: string[];
  colors: { name: string; hex: string }[];
  specs: string[];
  isNew?: boolean;
  isBestseller?: boolean;
  status?: string;
  is_prime?: boolean;
  parentSlug?: string;
  stampSize?: string;
  sleeveLogo?: string;
}

export const products: Product[] = [];

export function getProductBySlug(slug: string): Product | undefined {
  return products.find(p => p.slug === slug);
}

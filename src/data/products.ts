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

const baseColors = [
  { name: 'Preto', hex: '#111111' },
  { name: 'Off White', hex: '#FAF9F6' },
  { name: 'Azul Marinho', hex: '#1b263b' },
  { name: 'Verde Militar', hex: '#3f4238' },
  { name: 'Marrom', hex: '#6b4f3a' }
];

// Structural collection cards used as a safe Home fallback. Firestore data with the
// same slug/id overrides these values at runtime, so real product media and settings
// remain authoritative. Keeping these three entries prevents the Home collection
// carousel from becoming completely empty while Firestore is loading or incomplete.
export const products: Product[] = [
  {
    id: 'force',
    slug: 'force',
    name: 'FORCE',
    headline: 'FORCE',
    price: 89.9,
    description: 'Coleção FORCE — identidade minimalista e presença streetwear.',
    category: 'collection',
    collection: 'FORCE',
    productType: 'tshirt',
    sizeSystem: 'alpha',
    images: ['/estampas/logo-fpac.png'],
    sizes: ['P', 'M', 'G', 'GG'],
    colors: baseColors,
    specs: ['Streetwear premium', 'Modelagem oversized'],
    status: 'active'
  },
  {
    id: 'mark',
    slug: 'mark',
    name: 'MARK',
    headline: 'MARK',
    price: 99.9,
    description: 'Coleção MARK — estampas de maior destaque e atitude urbana.',
    category: 'collection',
    collection: 'MARK',
    productType: 'tshirt',
    sizeSystem: 'alpha',
    images: ['/estampas/logo-fpac.png'],
    sizes: ['P', 'M', 'G', 'GG'],
    colors: baseColors,
    specs: ['Streetwear premium', 'Estampas de destaque'],
    status: 'active'
  },
  {
    id: 'prime',
    slug: 'prime',
    name: 'PRIME',
    headline: 'PRIME',
    price: 119.9,
    description: 'PRIME — personalize sua peça do seu jeito.',
    category: 'collection',
    collection: 'PRIME',
    productType: 'tshirt',
    sizeSystem: 'alpha',
    images: ['/estampas/logo-fpac.png'],
    sizes: ['P', 'M', 'G', 'GG'],
    colors: baseColors,
    specs: ['Personalização PRIME', 'Streetwear premium'],
    status: 'active',
    is_prime: true
  }
];

export function getProductBySlug(slug: string): Product | undefined {
  return products.find(p => p.slug === slug);
}

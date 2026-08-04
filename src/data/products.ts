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
  
  export const products: Product[] = [
    {
      id: "prod_force_01",
      slug: "force",
      name: COLLECTIONS_CONFIG.force.name,
      headline: COLLECTIONS_CONFIG.force.slogan,
      price: COLLECTIONS_CONFIG.force.price,
      costPrice: 42.00,
      description: COLLECTIONS_CONFIG.force.marketingPitch,
      images: [],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#FAF9F6" },
        { name: "Azul Marinho", hex: "#1b263b" },
        { name: "Verde Militar", hex: "#3f4238" }
      ],
      specs: COLLECTIONS_CONFIG.force.specs,
      sleeveLogo: COLLECTIONS_CONFIG.force.sleeveLogo,
    },
    {
      id: "prod_mark_02",
      slug: "mark",
      name: COLLECTIONS_CONFIG.mark.name,
      headline: COLLECTIONS_CONFIG.mark.slogan,
      price: COLLECTIONS_CONFIG.mark.price,
      costPrice: 48.00,
      description: COLLECTIONS_CONFIG.mark.marketingPitch,
      images: [],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#FAF9F6" },
        { name: "Azul Marinho", hex: "#1b263b" },
        { name: "Verde Militar", hex: "#3f4238" }
      ],
      specs: COLLECTIONS_CONFIG.mark.specs,
      isBestseller: true,
      sleeveLogo: COLLECTIONS_CONFIG.mark.sleeveLogo,
    },
    {
      id: "prod_prime_03",
      slug: "prime",
      name: COLLECTIONS_CONFIG.prime.name,
      headline: COLLECTIONS_CONFIG.prime.slogan,
      price: COLLECTIONS_CONFIG.prime.price,
      costPrice: 55.00,
      description: COLLECTIONS_CONFIG.prime.marketingPitch,
      images: [],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#FAF9F6" },
        { name: "Azul Marinho", hex: "#1b263b" },
        { name: "Verde Militar", hex: "#3f4238" }
      ],
      specs: COLLECTIONS_CONFIG.prime.specs,
      isNew: true,
      is_prime: true,
      sleeveLogo: COLLECTIONS_CONFIG.prime.sleeveLogo,
    }
  ];
  
  export function getProductBySlug(slug: string): Product | undefined {
    return products.find(p => p.slug === slug);
  }


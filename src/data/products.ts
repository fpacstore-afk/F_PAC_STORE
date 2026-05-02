export interface Product {
    id: string;
    slug: string;
    name: string;
    headline: string;
    price: number;
    description: string;
    images: string[];
    sizes: string[];
    colors: { name: string; hex: string }[];
    specs: string[];
    isNew?: boolean;
    isBestseller?: boolean;
  }
  
  export const products: Product[] = [
    {
      id: "prod_force_01",
      slug: "force",
      name: "FORCE",
      headline: "Camisas com estampas de texto",
      price: 89.90,
      description: "Camisas com estampas de texto",
      images: [
        "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1503342394128-c104d54dba01?q=80&w=800&auto=format&fit=crop"
      ],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#f8f9fa" }
      ],
      specs: ["Algodão 100%", "fio 30.1", "caimento adequado", "reforço ombro a ombro"],
      isBestseller: true
    },
    {
      id: "prod_mark_02",
      slug: "mark",
      name: "MARK",
      headline: "Camisas com estampas de desenho",
      price: 99.90,
      description: "Camisas com estampas de desenho",
      images: [
        "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?q=80&w=800&auto=format&fit=crop"
      ],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#f8f9fa" }
      ],
      specs: ["Algodão 100%", "fio 30.1", "caimento adequado", "reforço ombro a ombro"],
      isNew: true
    },
    {
      id: "prod_prime_03",
      slug: "prime",
      name: "PRIME",
      headline: "Camisas para personalizar do seu jeito",
      price: 119.90,
      description: "Camisas para personalizar do seu jeito",
      images: [
        "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop"
      ],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#f8f9fa" }
      ],
      specs: ["Algodão 100%", "fio 30.1", "caimento adequado", "reforço ombro a ombro"],
    }
  ];

  export function getProductBySlug(slug: string): Product | undefined {
    return products.find(p => p.slug === slug);
  }

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
      description: "A camiseta FORCE traz a essência do minimalismo brutalista. Feita em 100% algodão premium de alta gramatura (220gsm), oferece o caimento perfeito para quem busca presença e conforto. Estampa em DTF de alta definição com toque zero.",
      images: [
        "https://images.unsplash.com/photo-1554568218-0f1715e72254?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop"
      ],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#FAF9F6" }
      ],
      specs: ["Algodão 100% Premium", "Gramatura 220gsm", "Modelagem Oversized", "Reforço de gola ombro a ombro"],
    },
    {
      id: "prod_mark_02",
      slug: "mark",
      name: "MARK",
      headline: "Camisas com estampas de desenho",
      price: 99.90,
      description: "A linha MARK foca na identidade visual através de artes exclusivas. Uma peça que fala por si só, mantendo o padrão de qualidade F PAC com tecido encorpado e durabilidade extrema.",
      images: [
        "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?q=80&w=800&auto=format&fit=crop"
      ],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#FAF9F6" }
      ],
      specs: ["Algodão 100% Premium", "Gramatura 220gsm", "Estampa Digital HD", "Resistente a lavagens"],
      isBestseller: true
    },
    {
      id: "prod_prime_03",
      slug: "prime",
      name: "PRIME",
      headline: "Camisas para personalizar",
      price: 119.90,
      description: "A tela em branco para a sua identidade. A linha PRIME permite que você escolha entre nossas estampas exclusivas para criar uma peça única. Qualidade impecável com o toque de personalização que você procura.",
      images: [
        "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop"
      ],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#FAF9F6" }
      ],
      specs: ["Algodão 100%", "Fio 30.1 Penteado", "Pode ser personalizada", "Conforto térmico"],
      isNew: true
    }
  ];

  export function getProductBySlug(slug: string): Product | undefined {
    return products.find(p => p.slug === slug);
  }

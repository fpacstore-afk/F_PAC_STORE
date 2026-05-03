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
        { name: "Off White", hex: "#f8f9fa" }
      ],
      specs: ["Algodão 100% Premium", "Gramatura 220gsm", "Modelagem Oversized", "Reforço de gola ombro a ombro"],
      isBestseller: true
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
        { name: "Preto", hex: "#000000" }
      ],
      specs: ["Algodão 100% Premium", "Gramatura 220gsm", "Estampa Digital HD", "Resistente a lavagens"],
      isNew: true
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
        { name: "Cinza Mescla", hex: "#888888" }
      ],
      specs: ["Algodão 100%", "Fio 30.1 Penteado", "Pode ser personalizada", "Conforto térmico"],
    },
    {
      id: "prod_chrono_04",
      slug: "chrono",
      name: "CHRONO",
      headline: "Hoodie Streetwear Oversized",
      price: 189.90,
      description: "Conforto e blindagem para os dias frios. O Hoodie CHRONO é feito em moletom pesado 3 cabos, com interior flanelado e modelagem boxy super moderna.",
      images: [
        "https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1556306535-0f09a537f0a3?q=80&w=800&auto=format&fit=crop"
      ],
      sizes: ["P", "M", "G", "GG"],
      colors: [
         { name: "Preto", hex: "#000000" },
         { name: "Cinza Chumbo", hex: "#333333" }
      ],
      specs: ["Moletom 3 Cabos", "Interior Flanelado", "Capuz Estruturado", "Punhos em Ribana"],
      isNew: true
    },
    {
      id: "prod_axis_05",
      slug: "axis",
      name: "AXIS",
      headline: "Sweatshirt Signature",
      price: 159.90,
      description: "A definição de sofisticação urbana. Um sweatshirt limpo, focado no tecido e no caimento, com o logo discreto bordado em tom sobre tom.",
      images: [
        "https://images.unsplash.com/photo-1578587018452-892bacefd3f2?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1520975867597-0af37a22e31e?q=80&w=800&auto=format&fit=crop"
      ],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Preto", hex: "#000000" },
        { name: "Navy", hex: "#000080" }
      ],
      specs: ["Moletom sem flanela", "Leve e versátil", "Bordado de alta precisão", "Costuras reforçadas"]
    },
    {
      id: "prod_vibe_06",
      slug: "vibe",
      name: "VIBE",
      headline: "T-Shirt Graphic Backprint",
      price: 109.90,
      description: "Impacto visual em 360 graus. A VIBE traz nossa estampa principal nas costas em tamanho gigante, mantendo a frente limpa e minimalista.",
      images: [
        "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1503342394128-c104d54dba01?q=80&w=800&auto=format&fit=crop"
      ],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Preto", hex: "#000000" },
        { name: "Branco", hex: "#ffffff" }
      ],
      specs: ["Estampa Gigante Costas", "Algodão 100% Penteado", "Gola com elastano", "Durabilidade Premium"]
    }
  ];

  export function getProductBySlug(slug: string): Product | undefined {
    return products.find(p => p.slug === slug);
  }

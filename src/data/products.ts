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
      description: "A camiseta FORCE é a combinação estética minimalista com atitude marcante. Entrega estrutura, conforto e um caimento firme no corpo com estampas em DTF de alta definição que garante cores intensas, mantendo a peça sofisticada e confortável em qualquer ocasião.",
      images: [],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#FAF9F6" },
        { name: "Azul Marinho", hex: "#1b263b" },
        { name: "Verde Militar", hex: "#3f4238" }
      ],
      specs: ["90% Algodão e 10 Poliéster Premium", "Gramatura 240gsm", "Modelagem Oversized", "Ribana Canelada 3cm", "Tecido Macio", "Reforço de gola ombro a ombro"],
    },
    {
      id: "prod_mark_02",
      slug: "mark",
      name: "MARK",
      headline: "Camisas com estampas de desenho",
      price: 99.90,
      description: "A linha MARK foca na identidade visual através de artes exclusivas. Uma peça que fala por si só, mantendo o padrão de qualidade F PAC com tecido encorpado e durabilidade extrema.",
      images: [],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#FAF9F6" },
        { name: "Azul Marinho", hex: "#1b263b" },
        { name: "Verde Militar", hex: "#3f4238" }
      ],
      specs: ["90% Algodão e 10 Poliéster Premium", "Gramatura 240gsm", "Ribana Canelada 3cm", "Tecido Macio", "Estampa DTF de qualidade", "Resistente a lavagens"],
      isBestseller: true
    },
    {
      id: "prod_prime_03",
      slug: "prime",
      name: "PRIME",
      headline: "Camisas para personalizar",
      price: 119.90,
      description: "A tela em branco para a sua identidade. A linha PRIME permite que você escolha entre nossas estampas exclusivas para criar uma peça única. Qualidade impecável com o toque de personalização que você procura.",
      images: [],
      sizes: ["P", "M", "G", "GG"],
      colors: [
        { name: "Branco", hex: "#ffffff" },
        { name: "Preto", hex: "#000000" },
        { name: "Off White", hex: "#FAF9F6" },
        { name: "Azul Marinho", hex: "#1b263b" },
        { name: "Verde Militar", hex: "#3f4238" }
      ],
      specs: ["90% Algodão e 10 Poliéster", "Fio 30.1 Penteado", "Pode ser personalizada", "Conforto térmico"],
      isNew: true
    }
  ];

  export function getProductBySlug(slug: string): Product | undefined {
    return products.find(p => p.slug === slug);
  }

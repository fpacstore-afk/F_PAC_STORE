export interface CollectionSEO {
  title: string;
  description: string;
  keywords: string[];
}

export interface CollectionConfig {
  id: 'force' | 'mark' | 'prime';
  slug: string;
  name: string;
  shortName: string;
  tagline: string;
  positioning: string;
  audience: string;
  slogan: string;
  marketingPitch: string;
  characteristics: string[];
  rules: string[];
  sleeveLogo: string; // "FP" | "FPAC" | "LOBO"
  price: number;
  route: string;
  isConfigurable: boolean;
  maxStamps: number;
  badgeText: string;
  bannerImage?: string;
  specs: string[];
  seo: CollectionSEO;
}

export const COLLECTIONS_CONFIG: Record<'force' | 'mark' | 'prime', CollectionConfig> = {
  force: {
    id: 'force',
    slug: 'force',
    name: 'FORCE',
    shortName: 'FORCE',
    tagline: 'Coleção Minimalista',
    positioning: 'Coleção minimalista de alta elegância.',
    audience: 'Quem prefere elegância discreta e posicionamento firme.',
    slogan: 'Menos exagero. Mais identidade.',
    marketingPitch: 'O essencial que se destaca pelo significado. Estampas tipográficas e mensagens conceituais com tipografia forte para quem comunica sua essência com sofisticação.',
    characteristics: [
      'Visual limpo',
      'Poucos elementos visuais',
      'Foco em frases e textos conceituais',
      'Tipografia forte e marcante',
      'Design sofisticado e atemporal',
      'Pouca informação visual, alta presença',
      'Fácil combinação para o dia a dia',
      'Estilo casual & street minimalista'
    ],
    rules: [
      'Até 1 estampa principal',
      'Foco total em tipografia, frases e lettering',
      'Elementos visuais discretos',
      'Logo FP obrigatória na manga'
    ],
    sleeveLogo: 'FP',
    price: 89.90,
    route: '/model/force',
    isConfigurable: false,
    maxStamps: 1,
    badgeText: 'MINIMALISTA',
    specs: [
      '100% Algodão Premium (Malha Encorpada 240GSM)',
      'Modelagem Oversized Streetwear',
      'Ribana Canelada de 3cm',
      'Estampa Tipográfica em DTF HD',
      'Logo FP na Manga'
    ],
    seo: {
      title: 'Coleção FORCE | Camisetas Minimalistas & Tipografia - F PAC STORE',
      description: 'Descubra a linha FORCE da F PAC STORE. Camisetas com estética minimalista, foco em tipografia e frases marcantes. Menos exagero. Mais identidade.',
      keywords: ['force', 'camiseta minimalista', 'f pac store', 'streetwear minimalista', 'tipografia', 'algodão 240gsm', 'logo fp']
    }
  },
  mark: {
    id: 'mark',
    slug: 'mark',
    name: 'MARK',
    shortName: 'MARK',
    tagline: 'Coleção de Impacto Visual',
    positioning: 'Coleção de artes completas e alto impacto visual.',
    audience: 'Quem gosta de chamar atenção e se destacar no ambiente.',
    slogan: 'Sua presença começa antes da sua voz.',
    marketingPitch: 'Artes autorais, grandes ilustrações e presença marcante que não passa despercebida. Para quem faz do vestir uma verdadeira declaração de atitude.',
    characteristics: [
      'Grandes ilustrações autorais',
      'Artes completas em altíssima definição',
      'Personagens e elementos gráficos ricos',
      'Streetwear autêntico e de alta expressão',
      'Design elaborado e marcante',
      'Composição com até duas estampas',
      'Visual de forte impacto urbano'
    ],
    rules: [
      'Até 2 estampas (Frente e Costas)',
      'Desenhos grandes e ricos em detalhes',
      'Composição artística elaborada',
      'Logo FPAC obrigatória na manga'
    ],
    sleeveLogo: 'FPAC',
    price: 99.90,
    route: '/model/mark',
    isConfigurable: false,
    maxStamps: 2,
    badgeText: 'ARTES EXCLUSIVAS',
    specs: [
      '100% Algodão Premium (Malha Encorpada 240GSM)',
      'Modelagem Oversized Streetwear',
      'Ribana Canelada de 3cm',
      'Artes em DTF HD de Alta Resolução (Frente/Costas)',
      'Logo FPAC na Manga'
    ],
    seo: {
      title: 'Coleção MARK | Camisetas de Impacto Visual & Artes Exclusivas - F PAC STORE',
      description: 'Conheça a linha MARK da F PAC STORE. Camisetas streetwear com grandes ilustrações, artes autorais e caimento perfeito. Sua presença começa antes da sua voz.',
      keywords: ['mark', 'artes exclusivas', 'f pac store', 'streetwear de impacto', 'ilustrações', 'oversized', 'logo fpac']
    }
  },
  prime: {
    id: 'prime',
    slug: 'prime',
    name: 'PRIME CUSTOM',
    shortName: 'PRIME',
    tagline: 'Coleção Premium Personalizada',
    positioning: 'Coleção premium personalizada com configurador em tempo real.',
    audience: 'Quem busca liberdade criativa total e peças 100% exclusivas.',
    slogan: 'Você cria. Nós produzimos.',
    marketingPitch: 'Sua tela em branco para a sua própria identidade. Não possui estampas pré-definidas — monte sua peça escolhendo cor, tamanho, estampas, posições e tamanhos no nosso construtor interativo.',
    characteristics: [
      'Sem estampas pré-definidas (Configurador Livre)',
      'Escolha de cor da camiseta base',
      'Escolha de tamanho e caimento',
      'Seleção de estampas exclusivas do acervo',
      'Posicionamento livre (Peito, Costas, Manga)',
      'Ajuste do tamanho da estampa em tempo real',
      'Visualização interativa da peça em tempo real',
      'Montagem de peça 100% única'
    ],
    rules: [
      'Personalização totalmente livre no construtor',
      'Escolha de estampas, posições e dimensões personalizadas',
      'Monte sua peça exclusiva no construtor interativo',
      'Logo LOBO obrigatória aplicada automaticamente na manga'
    ],
    sleeveLogo: 'LOBO',
    price: 119.90,
    route: '/prime',
    isConfigurable: true,
    maxStamps: 3,
    badgeText: 'PERSONALIZÁVEL',
    specs: [
      '100% Algodão Premium (Malha Encorpada 240GSM)',
      'Modelagem Custom / Oversized',
      'Ribana Canelada de 3cm',
      'Configuração Livre em Tempo Real',
      'Logo LOBO na Manga'
    ],
    seo: {
      title: 'PRIME CUSTOM | Construtor de Camisetas Personalizadas - F PAC STORE',
      description: 'Crie sua própria camiseta na linha PRIME CUSTOM da F PAC STORE. Escolha cores, estampas e posições em tempo real. Você cria. Nós produzimos.',
      keywords: ['prime custom', 'personalizar camiseta', 'f pac store', 'construtor de camiseta', 'camisa personalizada', 'exclusividade', 'logo lobo']
    }
  }
};

export function getCollectionBySlug(slug?: string): CollectionConfig | undefined {
  if (!slug) return undefined;
  const cleanSlug = slug.toLowerCase().trim();
  if (cleanSlug === 'force') return COLLECTIONS_CONFIG.force;
  if (cleanSlug === 'mark') return COLLECTIONS_CONFIG.mark;
  if (cleanSlug === 'prime' || cleanSlug === 'prime-custom' || cleanSlug === 'custom') return COLLECTIONS_CONFIG.prime;
  return undefined;
}

export function getAllCollections(): CollectionConfig[] {
  return [COLLECTIONS_CONFIG.force, COLLECTIONS_CONFIG.mark, COLLECTIONS_CONFIG.prime];
}

export function getCollectionSleeveLogo(slug?: string): string {
  const collection = getCollectionBySlug(slug);
  return collection ? collection.sleeveLogo : 'FPAC';
}

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
  price?: number;
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
    tagline: 'Linha de Estampas Pequenas',
    positioning: 'Linha aplicável a qualquer produto F PAC com estampa pequena e composição discreta.',
    audience: 'Quem prefere identidade no detalhe e menor área de estampa.',
    slogan: 'Menos exagero. Mais identidade.',
    marketingPitch: 'FORCE identifica produtos com estampa pequena e presença discreta. A linha pode existir em camisetas, croppeds, moletons, bonés e demais produtos compatíveis.',
    characteristics: [
      'Visual limpo',
      'Poucos elementos visuais',
      'Uma aplicação principal pequena',
      'Composição discreta',
      'Aplicável a diferentes tipos de produto',
      'Identidade visual concentrada no detalhe'
    ],
    rules: [
      'Até 1 estampa principal pequena',
      'A dimensão deve respeitar a área válida do produto',
      'A definição FORCE independe do tipo de peça',
      'Logo FP aplicada quando houver área compatível no produto'
    ],
    sleeveLogo: 'FP',
    route: '/catalog/all?line=force',
    isConfigurable: false,
    maxStamps: 1,
    badgeText: 'MINIMALISTA',
    specs: [
      'Estampa pequena',
      'Até 1 aplicação principal',
      'Produto e material definidos no cadastro da peça',
      'Logo FP quando aplicável ao produto'
    ],
    seo: {
      title: 'Linha FORCE | Produtos com Estampas Pequenas - F PAC STORE',
      description: 'Descubra produtos F PAC na linha FORCE, identificada por estampas pequenas e composição discreta.',
      keywords: ['force', 'estampa pequena', 'f pac store', 'streetwear minimalista', 'produto force', 'logo fp']
    }
  },
  mark: {
    id: 'mark',
    slug: 'mark',
    name: 'MARK',
    shortName: 'MARK',
    tagline: 'Linha de Estampas Grandes',
    positioning: 'Linha aplicável a qualquer produto F PAC com estampa grande ou mais de uma aplicação.',
    audience: 'Quem gosta de chamar atenção e se destacar no ambiente.',
    slogan: 'Sua presença começa antes da sua voz.',
    marketingPitch: 'MARK identifica produtos com estampas grandes ou mais de uma estampa. A linha pode existir em camisetas, croppeds, moletons e demais produtos compatíveis.',
    characteristics: [
      'Estampa principal grande',
      'Uma ou mais aplicações',
      'Composição de maior impacto visual',
      'Aplicável a diferentes tipos de produto'
    ],
    rules: [
      'Estampa grande ou mais de uma estampa',
      'Até 2 aplicações principais',
      'As dimensões devem respeitar as áreas válidas do produto',
      'Logo FPAC aplicada quando houver área compatível no produto'
    ],
    sleeveLogo: 'FPAC',
    route: '/catalog/all?line=mark',
    isConfigurable: false,
    maxStamps: 2,
    badgeText: 'ARTES EXCLUSIVAS',
    specs: [
      'Estampa grande ou múltiplas aplicações',
      'Até 2 aplicações principais',
      'Produto e material definidos no cadastro da peça',
      'Logo FPAC quando aplicável ao produto'
    ],
    seo: {
      title: 'Linha MARK | Produtos com Estampas Grandes - F PAC STORE',
      description: 'Conheça produtos F PAC na linha MARK, com estampas grandes ou mais de uma aplicação.',
      keywords: ['mark', 'estampa grande', 'f pac store', 'streetwear de impacto', 'múltiplas estampas', 'logo fpac']
    }
  },
  prime: {
    id: 'prime',
    slug: 'prime',
    name: 'PRIME CUSTOM',
    shortName: 'PRIME',
    tagline: 'Linha Personalizável',
    positioning: 'Linha personalizável disponível nos produtos habilitados no catálogo.',
    audience: 'Quem busca liberdade criativa total e peças 100% exclusivas.',
    slogan: 'Você cria. Nós produzimos.',
    marketingPitch: 'PRIME identifica os produtos personalizáveis. O cliente escolhe o produto, a cor, o tamanho, as estampas, as posições e as dimensões permitidas.',
    characteristics: [
      'Sem estampas pré-definidas (Configurador Livre)',
      'Escolha do produto base compatível',
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
      'Logo LOBO aplicada automaticamente quando houver área compatível no produto'
    ],
    sleeveLogo: 'LOBO',
    route: '/prime',
    isConfigurable: true,
    maxStamps: 3,
    badgeText: 'PERSONALIZÁVEL',
    specs: [
      'Produto personalizável',
      'Material e modelagem definidos no cadastro da peça',
      'Configuração Livre em Tempo Real',
      'Logo LOBO quando aplicável ao produto'
    ],
    seo: {
      title: 'PRIME CUSTOM | Produtos Personalizáveis - F PAC STORE',
      description: 'Personalize produtos compatíveis na linha PRIME CUSTOM. Escolha produto, cor, tamanho, estampas, posições e dimensões.',
      keywords: ['prime custom', 'personalizar produto', 'f pac store', 'produto personalizado', 'estampa personalizada', 'exclusividade', 'logo lobo']
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

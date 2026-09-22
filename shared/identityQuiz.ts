export type StyleType = 'force' | 'mark' | 'prime';

export interface QuestionOption {
  id: string;
  text: string;
  emoji: string;
  iconName: string;
  scores: {
    collections: { force: number; mark: number; prime: number };
    profiles: {
      lobo: number;
      street_king: number;
      black_force: number;
      alpha: number;
      minimal: number;
      elite: number;
    }
  };
}

export interface Question {
  id: number;
  title: string;
  options: QuestionOption[];
}

export const QUESTIONS: Question[] = [
  {
    id: 1,
    title: 'Como você define seu estilo?',
    options: [
      {
        id: 'streetwear',
        text: 'Streetwear',
        emoji: '👟',
        iconName: 'Flame',
        scores: {
          collections: { force: 1, mark: 3, prime: 0 },
          profiles: { lobo: 1, street_king: 3, black_force: 0, alpha: 2, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'esportivo',
        text: 'Esportivo',
        emoji: '⚡',
        iconName: 'Activity',
        scores: {
          collections: { force: 3, mark: 1, prime: 1 },
          profiles: { lobo: 2, street_king: 1, black_force: 2, alpha: 2, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'casual',
        text: 'Casual',
        emoji: '🌿',
        iconName: 'Smile',
        scores: {
          collections: { force: 0, mark: 1, prime: 3 },
          profiles: { lobo: 1, street_king: 0, black_force: 0, alpha: 1, minimal: 2, elite: 2 }
        }
      },
      {
        id: 'militar',
        text: 'Militar',
        emoji: '🎖️',
        iconName: 'Shield',
        scores: {
          collections: { force: 3, mark: 1, prime: 0 },
          profiles: { lobo: 2, street_king: 0, black_force: 3, alpha: 2, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'minimalista',
        text: 'Minimalista',
        emoji: '◼️',
        iconName: 'Minimize2',
        scores: {
          collections: { force: 1, mark: 0, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 0, alpha: 1, minimal: 3, elite: 1 }
        }
      },
      {
        id: 'elegante',
        text: 'Elegante',
        emoji: '⚜️',
        iconName: 'Crown',
        scores: {
          collections: { force: 1, mark: 0, prime: 3 },
          profiles: { lobo: 0, street_king: 0, black_force: 0, alpha: 1, minimal: 1, elite: 3 }
        }
      }
    ]
  },
  {
    id: 2,
    title: 'Onde você mais usa suas camisetas?',
    options: [
      {
        id: 'academia',
        text: 'Academia',
        emoji: '💪',
        iconName: 'Activity',
        scores: {
          collections: { force: 3, mark: 0, prime: 1 },
          profiles: { lobo: 1, street_king: 0, black_force: 3, alpha: 2, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'trabalho',
        text: 'Trabalho',
        emoji: '💼',
        iconName: 'Briefcase',
        scores: {
          collections: { force: 0, mark: 0, prime: 3 },
          profiles: { lobo: 1, street_king: 0, black_force: 0, alpha: 1, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'roles',
        text: 'Rolês',
        emoji: '🌃',
        iconName: 'Music',
        scores: {
          collections: { force: 1, mark: 3, prime: 0 },
          profiles: { lobo: 1, street_king: 3, black_force: 1, alpha: 2, minimal: 0, elite: 1 }
        }
      },
      {
        id: 'dia_a_dia',
        text: 'Dia a dia',
        emoji: '👕',
        iconName: 'Clock',
        scores: {
          collections: { force: 1, mark: 1, prime: 2 },
          profiles: { lobo: 2, street_king: 1, black_force: 1, alpha: 1, minimal: 2, elite: 1 }
        }
      },
      {
        id: 'eventos',
        text: 'Eventos',
        emoji: '🍾',
        iconName: 'Sparkles',
        scores: {
          collections: { force: 1, mark: 2, prime: 3 },
          profiles: { lobo: 0, street_king: 2, black_force: 0, alpha: 2, minimal: 1, elite: 3 }
        }
      }
    ]
  },
  {
    id: 3,
    title: 'Qual cor você mais usa?',
    options: [
      {
        id: 'preto',
        text: 'Preto',
        emoji: '⚫',
        iconName: 'Eye',
        scores: {
          collections: { force: 2, mark: 2, prime: 2 },
          profiles: { lobo: 3, street_king: 2, black_force: 3, alpha: 2, minimal: 2, elite: 2 }
        }
      },
      {
        id: 'branco',
        text: 'Branco',
        emoji: '⚪',
        iconName: 'Sun',
        scores: {
          collections: { force: 1, mark: 2, prime: 3 },
          profiles: { lobo: 1, street_king: 2, black_force: 1, alpha: 1, minimal: 3, elite: 2 }
        }
      },
      {
        id: 'verde_militar',
        text: 'Verde Militar',
        emoji: '🌲',
        iconName: 'ShieldAlert',
        scores: {
          collections: { force: 3, mark: 1, prime: 0 },
          profiles: { lobo: 2, street_king: 0, black_force: 3, alpha: 2, minimal: 1, elite: 0 }
        }
      },
      {
        id: 'off_white',
        text: 'Off White',
        emoji: '🍦',
        iconName: 'Filter',
        scores: {
          collections: { force: 1, mark: 3, prime: 2 },
          profiles: { lobo: 1, street_king: 3, black_force: 0, alpha: 2, minimal: 2, elite: 2 }
        }
      },
      {
        id: 'azul_marinho',
        text: 'Azul Marinho',
        emoji: '🔵',
        iconName: 'Compass',
        scores: {
          collections: { force: 1, mark: 1, prime: 3 },
          profiles: { lobo: 1, street_king: 0, black_force: 1, alpha: 2, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'marrom',
        text: 'Marrom',
        emoji: '🪵',
        iconName: 'TreePine',
        scores: {
          collections: { force: 1, mark: 3, prime: 1 },
          profiles: { lobo: 2, street_king: 2, black_force: 1, alpha: 1, minimal: 1, elite: 1 }
        }
      }
    ]
  },
  {
    id: 4,
    title: 'Você prefere?',
    options: [
      {
        id: 'estampas_grandes',
        text: 'Estampas grandes',
        emoji: '🖼️',
        iconName: 'Maximize2',
        scores: {
          collections: { force: 2, mark: 3, prime: 0 },
          profiles: { lobo: 0, street_king: 3, black_force: 2, alpha: 3, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'estampas_discretas',
        text: 'Estampas discretas',
        emoji: '🔍',
        iconName: 'Minimize2',
        scores: {
          collections: { force: 2, mark: 1, prime: 3 },
          profiles: { lobo: 3, street_king: 0, black_force: 1, alpha: 1, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'com_texto',
        text: 'Com texto',
        emoji: '✍️',
        iconName: 'Type',
        scores: {
          collections: { force: 3, mark: 1, prime: 1 },
          profiles: { lobo: 1, street_king: 2, black_force: 2, alpha: 2, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'sem_estampa',
        text: 'Sem estampa',
        emoji: '📭',
        iconName: 'Square',
        scores: {
          collections: { force: 0, mark: 0, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 0, alpha: 1, minimal: 3, elite: 2 }
        }
      }
    ]
  },
  {
    id: 5,
    title: 'O que é mais importante?',
    options: [
      {
        id: 'qualidade',
        text: 'Qualidade',
        emoji: '💎',
        iconName: 'Award',
        scores: {
          collections: { force: 2, mark: 2, prime: 3 },
          profiles: { lobo: 1, street_king: 1, black_force: 1, alpha: 2, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'conforto',
        text: 'Conforto',
        emoji: '☁️',
        iconName: 'Heart',
        scores: {
          collections: { force: 1, mark: 2, prime: 3 },
          profiles: { lobo: 2, street_king: 2, black_force: 1, alpha: 1, minimal: 3, elite: 2 }
        }
      },
      {
        id: 'exclusividade',
        text: 'Exclusividade',
        emoji: '🔑',
        iconName: 'Key',
        scores: {
          collections: { force: 2, mark: 3, prime: 1 },
          profiles: { lobo: 3, street_king: 3, black_force: 1, alpha: 2, minimal: 0, elite: 2 }
        }
      },
      {
        id: 'estilo',
        text: 'Estilo',
        emoji: '⚡',
        iconName: 'Zap',
        scores: {
          collections: { force: 2, mark: 3, prime: 1 },
          profiles: { lobo: 1, street_king: 3, black_force: 2, alpha: 3, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'preco',
        text: 'Preço',
        emoji: '🏷️',
        iconName: 'Tag',
        scores: {
          collections: { force: 2, mark: 2, prime: 2 },
          profiles: { lobo: 1, street_king: 1, black_force: 1, alpha: 1, minimal: 2, elite: 1 }
        }
      }
    ]
  },
  {
    id: 6,
    title: 'Qual local prefere a estampa?',
    options: [
      {
        id: 'centro_peito',
        text: 'Centro do peito',
        emoji: '👕',
        iconName: 'Layers',
        scores: {
          collections: { force: 3, mark: 2, prime: 1 },
          profiles: { lobo: 1, street_king: 2, black_force: 2, alpha: 3, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'costas',
        text: 'Costas',
        emoji: '🛡️',
        iconName: 'UserCheck',
        scores: {
          collections: { force: 2, mark: 3, prime: 0 },
          profiles: { lobo: 1, street_king: 3, black_force: 2, alpha: 2, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'peito_esquerdo',
        text: 'Peito esquerdo',
        emoji: '❤️',
        iconName: 'HeartHandshake',
        scores: {
          collections: { force: 2, mark: 1, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 1, alpha: 1, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'manga',
        text: 'Manga',
        emoji: '🦾',
        iconName: 'Anchor',
        scores: {
          collections: { force: 2, mark: 2, prime: 1 },
          profiles: { lobo: 2, street_king: 1, black_force: 2, alpha: 2, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'sem_estampas',
        text: 'Sem estampas',
        emoji: '⏹️',
        iconName: 'X',
        scores: {
          collections: { force: 0, mark: 0, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 0, alpha: 1, minimal: 3, elite: 2 }
        }
      }
    ]
  },
  {
    id: 7,
    title: 'Como você gosta do caimento?',
    options: [
      {
        id: 'oversized',
        text: 'Oversized',
        emoji: '🧥',
        iconName: 'Expand',
        scores: {
          collections: { force: 2, mark: 3, prime: 1 },
          profiles: { lobo: 1, street_king: 3, black_force: 1, alpha: 3, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'tradicional',
        text: 'Tradicional',
        emoji: '👔',
        iconName: 'Menu',
        scores: {
          collections: { force: 1, mark: 0, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 1, alpha: 1, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'largo',
        text: 'Largo',
        emoji: '🛹',
        iconName: 'Maximize',
        scores: {
          collections: { force: 1, mark: 3, prime: 1 },
          profiles: { lobo: 2, street_king: 3, black_force: 1, alpha: 2, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'ajustado',
        text: 'Ajustado',
        emoji: '🦾',
        iconName: 'Activity',
        scores: {
          collections: { force: 3, mark: 0, prime: 1 },
          profiles: { lobo: 1, street_king: 0, black_force: 3, alpha: 2, minimal: 1, elite: 1 }
        }
      }
    ]
  },
  {
    id: 8,
    title: 'Qual frase mais combina com você?',
    options: [
      {
        id: 'não_sigo_tendencias',
        text: 'Não sigo tendências.',
        emoji: '🦅',
        iconName: 'Compass',
        scores: {
          collections: { force: 2, mark: 2, prime: 1 },
          profiles: { lobo: 3, street_king: 2, black_force: 2, alpha: 2, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'gosto_de_exclusividade',
        text: 'Gosto de exclusividade.',
        emoji: '💎',
        iconName: 'Star',
        scores: {
          collections: { force: 2, mark: 3, prime: 2 },
          profiles: { lobo: 2, street_king: 3, black_force: 1, alpha: 2, minimal: 1, elite: 3 }
        }
      },
      {
        id: 'meu_estilo_fala_por_mim',
        text: 'Meu estilo fala por mim.',
        emoji: '🔥',
        iconName: 'MessageSquare',
        scores: {
          collections: { force: 2, mark: 3, prime: 1 },
          profiles: { lobo: 2, street_king: 3, black_force: 2, alpha: 3, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'menos_aparencia_mais_qualidade',
        text: 'Menos aparência. Mais qualidade.',
        emoji: '🛡️',
        iconName: 'Shield',
        scores: {
          collections: { force: 1, mark: 0, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 1, alpha: 1, minimal: 3, elite: 2 }
        }
      },
      {
        id: 'nao_e_so_roupa_e_identidade',
        text: 'Não é só roupa. É identidade.',
        emoji: '⚜️',
        iconName: 'Crown',
        scores: {
          collections: { force: 2, mark: 2, prime: 2 },
          profiles: { lobo: 2, street_king: 2, black_force: 2, alpha: 2, minimal: 2, elite: 2 }
        }
      }
    ]
  }
];

export interface ProfileDetails {
  id: string;
  name: string;
  emoji: string;
  title: string;
  description: string;
  badge: {
    name: string;
    icon: string;
    emoji: string;
  };
  recommendedCollection: 'force' | 'mark' | 'prime';
  aiText: string;
}

export const PROFILES: Record<string, ProfileDetails> = {
  lobo: {
    id: 'lobo',
    name: 'Lobo',
    emoji: '🐺',
    title: '🐺 Lobo',
    description: 'Você não segue a multidão. Prefere fazer seu próprio caminho, mantendo discrição, confiança e presença. Seu estilo transmite independência e personalidade. Ideal para quem gosta de: peças discretas, tons escuros e atitude.',
    badge: {
      name: 'Lobo Solitário',
      icon: 'User',
      emoji: '🐺'
    },
    recommendedCollection: 'force',
    aiText: 'Com base nas suas escolhas, percebemos que você valoriza a independência, mantendo um estilo sóbrio com presença marcante. A discrição e atitude da linha FORCE combinam perfeitamente com seu perfil tático e focado.'
  },
  street_king: {
    id: 'street_king',
    name: 'Street King',
    emoji: '👑',
    title: '👑 Street King',
    description: 'A rua é seu território. Você gosta de chamar atenção pelo estilo, não pelo exagero. Cada peça faz parte da sua identidade. Ideal para quem vive o streetwear e a cultura urbana.',
    badge: {
      name: 'Street Master',
      icon: 'Flame',
      emoji: '🔥'
    },
    recommendedCollection: 'mark',
    aiText: 'Com base nas suas escolhas, percebemos que você é guiado pela cultura streetwear e pela expressão urbana autêntica. As estampas conceituais e artes ousadas da linha MARK combinam de forma espetacular com sua presença urbana.'
  },
  black_force: {
    id: 'black_force',
    name: 'Black Force',
    emoji: '⚫',
    title: '⚫ Black Force',
    description: 'Inspirado na disciplina, resistência e força. Seu estilo transmite respeito, presença e confiança. Ideal para quem prefere visual militar, tático e robusto.',
    badge: {
      name: 'Estilo Militar',
      icon: 'Shield',
      emoji: '🏆'
    },
    recommendedCollection: 'force',
    aiText: 'Com base nas suas escolhas, percebemos que você valoriza a força física e mental, a robustez e a estrutura de alto nível. O caimento encorpado e a gramatura pesada da linha FORCE se alinham idealmente ao seu estilo de vida implacável.'
  },
  alpha: {
    id: 'alpha',
    name: 'Alpha',
    emoji: '🦅',
    title: '🦅 Alpha',
    description: 'Você lidera naturalmente. Não precisa provar nada para ninguém. Seu estilo demonstra confiança e determinação. Ideal para quem busca presença marcante.',
    badge: {
      name: 'Street Master',
      icon: 'Zap',
      emoji: '🔥'
    },
    recommendedCollection: 'mark',
    aiText: 'Com base nas suas escolhas, percebemos que sua presença inspira liderança e autenticidade. Seu estilo une sofisticação visual e energia contagiante. O design assertivo da linha MARK é a expressão definitiva da sua postura Alpha.'
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    emoji: '◼️',
    title: '◼ Minimal',
    description: 'Menos é mais. Você acredita que simplicidade também chama atenção quando bem executada. Ideal para quem prefere um visual limpo e moderno.',
    badge: {
      name: 'Lobo Solitário',
      icon: 'Minimize2',
      emoji: '🐺'
    },
    recommendedCollection: 'prime',
    aiText: 'Com base nas suas escolhas, percebemos que você valoriza o minimalismo sofisticado, onde cada detalhe sutil e acabamento perfeito comunicam sua identidade sem ruídos. O corte clássico e customizável da linha PRIME é ideal para você.'
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    emoji: '⚜️',
    title: '⚜ Elite',
    description: 'Elegância sem exageros. Você prefere qualidade, acabamento premium e peças que passam sofisticação. Ideal para quem gosta de um visual refinado.',
    badge: {
      name: 'Elite',
      icon: 'Crown',
      emoji: '👑'
    },
    recommendedCollection: 'prime',
    aiText: 'Com base nas suas escolhas, percebemos que você tem um olhar apurado para a excelência e acabamentos impecáveis. Peças que vestem bem em qualquer contexto premium. A malha nobre e a personalização da linha PRIME foram feitas para seu padrão elevado.'
  }
};


export function calculateIdentity(answers: Record<number, string>) {
  const collections = { force: 0, mark: 0, prime: 0 };
  const profiles = { lobo: 0, street_king: 0, black_force: 0, alpha: 0, minimal: 0, elite: 0 };
  for (const question of QUESTIONS) {
    const option = question.options.find(item => item.id === answers[question.id]);
    if (!option) continue;
    for (const key of Object.keys(collections)) collections[key] += option.scores.collections[key];
    for (const key of Object.keys(profiles)) profiles[key] += option.scores.profiles[key];
  }
  const profileId = Object.keys(profiles).sort((a, b) => profiles[b] - profiles[a])[0];
  const total = Object.values(collections).reduce((a, b) => a + b, 0) || 1;
  const fractions = Object.entries(collections).map(([key, value]) => ({ key, value: value * 100 / total }));
  const scores = Object.fromEntries(fractions.map(item => [item.key, Math.floor(item.value)])) as typeof collections;
  let remaining = 100 - Object.values(scores).reduce((a, b) => a + b, 0);
  for (const item of fractions.sort((a, b) => (b.value % 1) - (a.value % 1))) if (remaining-- > 0) scores[item.key]++;
  return { profile: PROFILES[profileId], scores };
}

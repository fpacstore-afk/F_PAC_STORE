export interface LoyaltyTierConfig {
  id: 'bronze' | 'prata' | 'ouro' | 'diamante';
  name: string;
  badge: string;
  symbol: string;
  color: string;
  bgColor: string;
  borderColor: string;
  minAmount: number;
  maxAmount: number | null;
  tagline: string;
  description: string;
  benefits: string[];
  animatedBadge?: boolean;
}

export interface LoyaltyRuleConfig {
  xpPerReais: number; // e.g. 1 R$ = 1 XP
  xpPerOrder: number; // e.g. +100 XP per order
  xpPerReview: number; // +50 XP
  xpPerReferral: number; // +80 XP
  xpPerShare: number; // +30 XP
  xpPerBirthday: number; // +150 XP
  inactivityDaysThreshold: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  icon: string;
  desc: string;
  category: 'purchases' | 'engagement' | 'tier' | 'community';
  xpBonus: number;
}

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  icon: string;
  category: string;
  actionType: 'buy' | 'vote' | 'review' | 'profile' | 'refer' | 'share';
  actionUrl?: string;
}

export const DEFAULT_TIERS: LoyaltyTierConfig[] = [
  {
    id: 'bronze',
    name: 'Bronze',
    badge: '🥉',
    symbol: '🥉',
    color: '#cd7f32',
    bgColor: 'bg-amber-900/10',
    borderColor: 'border-amber-700/30',
    minAmount: 0,
    maxAmount: 299,
    tagline: 'Você entrou para o movimento F PAC.',
    description: 'A porta de entrada para o ecossistema streetwear F PAC.',
    benefits: [
      'Perfil oficial no Clube F PAC',
      'Participação no Ranking Oficial',
      'Sistema de XP desbloqueado',
      'Histórico completo de compras',
      'Histórico de conquistas e selos',
      'Badge Bronze exclusivo',
      'Participação em desafios da comunidade',
      'Medalha da primeira compra'
    ]
  },
  {
    id: 'prata',
    name: 'Prata',
    badge: '🥈',
    symbol: '🥈',
    color: '#c0c0c0',
    bgColor: 'bg-slate-200/20',
    borderColor: 'border-slate-300',
    minAmount: 300,
    maxAmount: 799,
    tagline: 'Você já faz parte da comunidade F PAC.',
    description: 'Membro engajado da comunidade com privilégios de acesso antecipado.',
    benefits: [
      'Todos os benefícios do nível Bronze',
      'Acesso às coleções 24 horas antes do público',
      'Reserva de produtos por até 24h antes do lançamento',
      'Participação em votações de novas estampas',
      'Chance dobrada em sorteios mensais',
      'Badge Prata exclusivo',
      'Desafios exclusivos para membros Prata'
    ]
  },
  {
    id: 'ouro',
    name: 'Ouro',
    badge: '🥇',
    symbol: '🥇',
    color: '#eab308',
    bgColor: 'bg-[#eab308]/10',
    borderColor: 'border-[#eab308]/40',
    minAmount: 800,
    maxAmount: 1999,
    tagline: 'Você ajuda a construir a história da F PAC.',
    description: 'Construtores do movimento com direito a voz na criação de estampas e parede digital.',
    benefits: [
      'Todos os benefícios dos níveis Bronze + Prata',
      'Nome na parede digital dos membros Ouro',
      'Direito de votar para trazer estampas antigas de volta',
      'Personalização gratuita do nome na etiqueta interna',
      'Convites VIP para testar novas coleções',
      'Prioridade total na compra de produtos que voltarem ao estoque',
      'Badge Ouro animado',
      'Conquistas exclusivas da categoria Ouro'
    ],
    animatedBadge: true
  },
  {
    id: 'diamante',
    name: 'Diamante',
    badge: '💎',
    symbol: '💎',
    color: '#38bdf8',
    bgColor: 'bg-sky-500/10',
    borderColor: 'border-sky-400/40',
    minAmount: 2000,
    maxAmount: null,
    tagline: 'Você faz parte da elite F PAC.',
    description: 'O topo da comunidade. Acesso irrestrito ao universo exclusivo e drops secretos.',
    benefits: [
      'Todos os benefícios dos níveis anteriores',
      'Acesso a produtos exclusivos para membros Diamante',
      'Acesso antecipado a Drops secretos e edições limitadas',
      'Camiseta exclusiva anual entregue de presente',
      'Número oficial de membro VIP (Ex.: Diamond #024)',
      'Presença de destaque no Hall da Fama F PAC',
      'Convites diretos para decisões sobre futuras coleções',
      'Embalagem Premium exclusiva em todos os envios',
      'Certificado digital exclusivo de membro da elite',
      'Badge Diamante animado com efeito neon'
    ],
    animatedBadge: true
  }
];

export const DEFAULT_LOYALTY_RULES: LoyaltyRuleConfig = {
  xpPerReais: 1,
  xpPerOrder: 100,
  xpPerReview: 50,
  xpPerReferral: 80,
  xpPerShare: 30,
  xpPerBirthday: 150,
  inactivityDaysThreshold: 30
};

export const DEFAULT_ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_buy', title: 'Primeira Compra', icon: '🥇', desc: 'Garantiu sua primeira peça oficial e entrou pro movimento F PAC', category: 'purchases', xpBonus: 100 },
  { id: 'buy_5', title: 'Colecionador 5x', icon: '👕', desc: 'Fez 5 ou mais pedidos oficiais F PAC', category: 'purchases', xpBonus: 250 },
  { id: 'buy_10', title: 'Lenda Streetwear', icon: '👑', desc: 'Conquistou 10 ou mais compras no catálogo oficial', category: 'purchases', xpBonus: 500 },
  { id: 'drop_hunter', title: 'Caçador de Drops', icon: '🚀', desc: 'Garantiu um lançamento exclusivo de Drop', category: 'engagement', xpBonus: 150 },
  { id: 'became_diamond', title: 'Elite Diamante', icon: '💎', desc: 'Alcançou o nível supremo Diamante do Clube F PAC', category: 'tier', xpBonus: 1000 },
  { id: 'pioneer_2026', title: 'Cliente Fundador', icon: '⭐', desc: 'Membro com histórico registrado desde 2026', category: 'community', xpBonus: 200 },
  { id: 'frequent_buyer', title: 'Cliente Frequente', icon: '🔥', desc: 'Realizou mais de 3 compras em um intervalo de 60 dias', category: 'purchases', xpBonus: 300 },
  { id: 'top_10_ranking', title: 'Top 10 Ranking', icon: '🏆', desc: 'Entrou para o Top 10 oficial dos maiores membros', category: 'tier', xpBonus: 400 },
  { id: 'order_50', title: '50 Pedidos Lenda', icon: '📦', desc: 'Alcançou a marca épica de 50 pedidos', category: 'purchases', xpBonus: 2000 },
  { id: 'active_voter', title: 'Votante Ativo', icon: '🎯', desc: 'Participou de votações de novas estampas da marca', category: 'community', xpBonus: 150 }
];

export const DEFAULT_MISSIONS: MissionDef[] = [
  {
    id: 'm_first_buy',
    title: 'Fazer Primeira Compra',
    description: 'Escolha qualquer peça no catálogo e faça sua primeira compra para destravar +100 XP.',
    xpReward: 100,
    icon: '🛒',
    category: 'Compras',
    actionType: 'buy',
    actionUrl: '/catalog'
  },
  {
    id: 'm_new_collection',
    title: 'Comprar Coleção Nova',
    description: 'Adquira pelo menos 1 produto do último lançamento oficial.',
    xpReward: 150,
    icon: '🔥',
    category: 'Lançamentos',
    actionType: 'buy',
    actionUrl: '/catalog'
  },
  {
    id: 'm_repeat_30d',
    title: 'Comprar Novamente em 30 Dias',
    description: 'Faça um novo pedido dentro de 30 dias após sua última compra.',
    xpReward: 120,
    icon: '⚡',
    category: 'Recorrência',
    actionType: 'buy',
    actionUrl: '/catalog'
  },
  {
    id: 'm_vote_design',
    title: 'Participar de Votação de Estampa',
    description: 'Dê seu voto na próxima estampa ou no retorno de estampas clássicas.',
    xpReward: 50,
    icon: '🗳️',
    category: 'Comunidade',
    actionType: 'vote'
  },
  {
    id: 'm_review_product',
    title: 'Avaliar Produto Adquirido',
    description: 'Deixe sua opinião sincera sobre a qualidade e estilo da sua peça.',
    xpReward: 50,
    icon: '⭐',
    category: 'Engajamento',
    actionType: 'review'
  },
  {
    id: 'm_complete_profile',
    title: 'Completar Perfil de Membro',
    description: 'Mantenha seu e-mail, WhatsApp e endereço atualizados para avisos VIP.',
    xpReward: 40,
    icon: '👤',
    category: 'Perfil',
    actionType: 'profile'
  },
  {
    id: 'm_refer_friend',
    title: 'Convidar Amigo para a F PAC',
    description: 'Indique um amigo que conclua a primeira compra usando seu código ou link.',
    xpReward: 80,
    icon: '🤝',
    category: 'Indicação',
    actionType: 'refer'
  }
];

// Helper to sanitize name for public display (Security Rule: No full name / sensitive data)
export function sanitizePublicName(fullName: string): string {
  if (!fullName) return 'Cliente F PAC';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

// XP to Level calculation formula: Level 1 = 0-199 XP, Level 2 = 200-399 XP, etc.
export function calculateXpLevel(xp: number): { level: number; xpForCurrentLevel: number; xpForNextLevel: number; progressPercent: number } {
  const level = Math.floor(xp / 250) + 1;
  const xpForCurrentLevel = (level - 1) * 250;
  const xpForNextLevel = level * 250;
  const xpInCurrentLevel = xp - xpForCurrentLevel;
  const progressPercent = Math.min(100, Math.round((xpInCurrentLevel / 250) * 100));

  return {
    level,
    xpForCurrentLevel,
    xpForNextLevel,
    progressPercent
  };
}

// Generate stylized member number: e.g. "DIAMANTE #024" or "OURO #108"
export function generateMemberNumber(tierId: string, index: number): string {
  const prefix = tierId.toUpperCase();
  const numStr = String(index + 1).padStart(3, '0');
  return `${prefix} #${numStr}`;
}

// Get tier configuration based on total spent
export function getTierByAmount(totalSpent: number, customTiers: LoyaltyTierConfig[] = DEFAULT_TIERS): LoyaltyTierConfig {
  const dTier = customTiers.find(t => t.id === 'diamante') || DEFAULT_TIERS[3];
  const oTier = customTiers.find(t => t.id === 'ouro') || DEFAULT_TIERS[2];
  const pTier = customTiers.find(t => t.id === 'prata') || DEFAULT_TIERS[1];
  const bTier = customTiers.find(t => t.id === 'bronze') || DEFAULT_TIERS[0];

  if (totalSpent >= dTier.minAmount) return dTier;
  if (totalSpent >= oTier.minAmount) return oTier;
  if (totalSpent >= pTier.minAmount) return pTier;
  return bTier;
}

export interface CustomerLoyaltyData {
  key: string; // Phone or Email
  memberNumber: string;
  customerName: string;
  email: string;
  phone: string;
  city: string;
  orders: any[];
  orderCount: number;
  totalSpent: number;
  averageTicket: number;
  lastPurchaseDate: Date | null;
  firstPurchaseDate: Date | null;
  daysSinceLastPurchase: number;
  tier: LoyaltyTierConfig;
  nextTier: LoyaltyTierConfig | null;
  amountNeededForNextTier: number;
  progressPercent: number;
  xp: number;
  xpLevel: number;
  xpForNextLevel: number;
  xpProgressPercent: number;
  achievements: { id: string; title: string; icon: string; desc: string; unlocked: boolean }[];
  completedMissions: string[];
  isInactive: boolean;
  isPrestesASubir: boolean;
  isVip: boolean;
  itemsBoughtCount: number;
  purchasedProducts: { name: string; qty: number; image?: string }[];
  rankPositions: {
    spent: number;
    xp: number;
    items: number;
    achievements: number;
  };
}

export function processCustomerLoyaltyList(
  allOrders: any[],
  customTiers: LoyaltyTierConfig[] = DEFAULT_TIERS,
  customAchievements: AchievementDef[] = DEFAULT_ACHIEVEMENTS,
  customMissions: MissionDef[] = DEFAULT_MISSIONS
): CustomerLoyaltyData[] {
  const customerMap = new Map<string, {
    name: string;
    email: string;
    phone: string;
    city: string;
    orders: any[];
  }>();

  // Group orders by email or phone
  allOrders.forEach(order => {
    const key = (order.customerEmail || order.customerPhone || order.id || 'guest').toLowerCase().trim();
    if (!customerMap.has(key)) {
      let city = 'Joinville/SC';
      if (typeof order.address === 'object' && order.address?.city) {
        city = `${order.address.city}/${order.address.state || 'SC'}`;
      } else if (order.city) {
        city = `${order.city}/${order.state || 'SC'}`;
      }

      customerMap.set(key, {
        name: order.customerName || 'Cliente',
        email: order.customerEmail || '',
        phone: order.customerPhone || '',
        city,
        orders: []
      });
    }
    customerMap.get(key)!.orders.push(order);
  });

  const rawList: {
    key: string;
    data: any;
    orderCount: number;
    totalSpent: number;
    averageTicket: number;
    lastDate: Date | null;
    firstDate: Date | null;
    daysSinceLastPurchase: number;
    tier: LoyaltyTierConfig;
    nextTier: LoyaltyTierConfig | null;
    amountNeededForNextTier: number;
    progressPercent: number;
    xp: number;
    xpLevelInfo: any;
    itemsBoughtCount: number;
    purchasedProducts: any[];
    achievements: any[];
    completedMissions: string[];
    isInactive: boolean;
    isPrestesASubir: boolean;
    isVip: boolean;
  }[] = [];

  const now = Date.now();

  customerMap.forEach((data, key) => {
    const orders = data.orders;
    const orderCount = orders.length;
    
    // Calculate total spent only on non-cancelled orders
    const validOrders = orders.filter(o => o.status !== 'cancelled');
    const totalSpent = validOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
    const averageTicket = orderCount > 0 ? totalSpent / orderCount : 0;

    // Purchase dates
    let lastDate: Date | null = null;
    let firstDate: Date | null = null;

    orders.forEach(o => {
      const d = o.createdAt?.toMillis ? new Date(o.createdAt.toMillis()) : new Date(o.createdAt || now);
      if (!lastDate || d > lastDate) lastDate = d;
      if (!firstDate || d < firstDate) firstDate = d;
    });

    const daysSinceLastPurchase = lastDate ? Math.floor((now - lastDate.getTime()) / (1000 * 3600 * 24)) : 999;
    const tier = getTierByAmount(totalSpent, customTiers);

    // Determine next tier
    let nextTier: LoyaltyTierConfig | null = null;
    let amountNeededForNextTier = 0;
    let progressPercent = 100;

    if (tier.id === 'bronze') {
      nextTier = customTiers.find(t => t.id === 'prata') || DEFAULT_TIERS[1];
      amountNeededForNextTier = Math.max(0, nextTier.minAmount - totalSpent);
      progressPercent = Math.min(100, Math.round((totalSpent / nextTier.minAmount) * 100));
    } else if (tier.id === 'prata') {
      nextTier = customTiers.find(t => t.id === 'ouro') || DEFAULT_TIERS[2];
      amountNeededForNextTier = Math.max(0, nextTier.minAmount - totalSpent);
      const span = nextTier.minAmount - customTiers.find(t => t.id === 'prata')!.minAmount;
      const currentSpan = totalSpent - customTiers.find(t => t.id === 'prata')!.minAmount;
      progressPercent = Math.min(100, Math.round((currentSpan / span) * 100));
    } else if (tier.id === 'ouro') {
      nextTier = customTiers.find(t => t.id === 'diamante') || DEFAULT_TIERS[3];
      amountNeededForNextTier = Math.max(0, nextTier.minAmount - totalSpent);
      const span = nextTier.minAmount - customTiers.find(t => t.id === 'ouro')!.minAmount;
      const currentSpan = totalSpent - customTiers.find(t => t.id === 'ouro')!.minAmount;
      progressPercent = Math.min(100, Math.round((currentSpan / span) * 100));
    } else {
      nextTier = null;
      amountNeededForNextTier = 0;
      progressPercent = 100;
    }

    // Purchased products summary
    const prodMap = new Map<string, { name: string; qty: number; image?: string }>();
    let itemsBoughtCount = 0;
    let hasBoughtDrop = false;

    validOrders.forEach(o => {
      (o.items || []).forEach((item: any) => {
        const pName = item.name || 'Produto F PAC';
        const qty = Number(item.quantity) || 1;
        itemsBoughtCount += qty;
        if (pName.toLowerCase().includes('drop') || pName.toLowerCase().includes('exclusiv')) {
          hasBoughtDrop = true;
        }
        if (!prodMap.has(pName)) {
          prodMap.set(pName, { name: pName, qty: 0, image: item.image });
        }
        prodMap.get(pName)!.qty += qty;
      });
    });

    // Gamification achievements unlock state
    const achievements = customAchievements.map(ach => {
      let unlocked = false;
      if (ach.id === 'first_buy' && orderCount >= 1) unlocked = true;
      else if (ach.id === 'buy_5' && (orderCount >= 5 || itemsBoughtCount >= 5)) unlocked = true;
      else if (ach.id === 'buy_10' && (orderCount >= 10 || itemsBoughtCount >= 10)) unlocked = true;
      else if (ach.id === 'drop_hunter' && (hasBoughtDrop || orderCount >= 2)) unlocked = true;
      else if (ach.id === 'became_diamond' && tier.id === 'diamante') unlocked = true;
      else if (ach.id === 'pioneer_2026' && firstDate && firstDate.getFullYear() <= 2026) unlocked = true;
      else if (ach.id === 'frequent_buyer' && orderCount >= 3) unlocked = true;
      else if (ach.id === 'order_50' && orderCount >= 50) unlocked = true;
      else if (ach.id === 'active_voter' && orderCount >= 1) unlocked = true;
      else if (ach.id === 'top_10_ranking' && totalSpent >= 800) unlocked = true;

      return {
        id: ach.id,
        title: ach.title,
        icon: ach.icon,
        desc: ach.desc,
        unlocked
      };
    });

    const unlockedAchievementsCount = achievements.filter(a => a.unlocked).length;

    // Completed missions calculation
    const completedMissions: string[] = [];
    if (orderCount >= 1) completedMissions.push('m_first_buy', 'm_complete_profile');
    if (hasBoughtDrop || itemsBoughtCount >= 2) completedMissions.push('m_new_collection');
    if (daysSinceLastPurchase <= 30 && orderCount > 1) completedMissions.push('m_repeat_30d');
    if (orderCount >= 1) completedMissions.push('m_vote_design', 'm_review_product');

    // XP calculation: 1 R$ = 1 XP, Order = +100 XP, Missions = variable, Unlocked achievements bonus
    const achievementBonusXp = achievements.filter(a => a.unlocked).reduce((acc, a) => {
      const def = customAchievements.find(c => c.id === a.id);
      return acc + (def ? def.xpBonus : 100);
    }, 0);

    const baseXp = Math.round(totalSpent) + (orderCount * 100) + achievementBonusXp;
    const xp = baseXp;
    const xpLevelInfo = calculateXpLevel(xp);

    const isInactive = daysSinceLastPurchase >= 30;
    const isPrestesASubir = nextTier !== null && amountNeededForNextTier <= 150 && amountNeededForNextTier > 0;
    const isVip = tier.id === 'diamante' || tier.id === 'ouro' || totalSpent >= 800;

    rawList.push({
      key,
      data,
      orderCount,
      totalSpent,
      averageTicket,
      lastDate,
      firstDate,
      daysSinceLastPurchase,
      tier,
      nextTier,
      amountNeededForNextTier,
      progressPercent,
      xp,
      xpLevelInfo,
      itemsBoughtCount,
      purchasedProducts: Array.from(prodMap.values()),
      achievements,
      completedMissions,
      isInactive,
      isPrestesASubir,
      isVip
    });
  });

  // Sort by spent to assign ranks
  const sortedBySpent = [...rawList].sort((a, b) => b.totalSpent - a.totalSpent);
  const sortedByXp = [...rawList].sort((a, b) => b.xp - a.xp);
  const sortedByItems = [...rawList].sort((a, b) => b.itemsBoughtCount - a.itemsBoughtCount);
  const sortedByAchievements = [...rawList].sort((a, b) => b.achievements.filter(x => x.unlocked).length - a.achievements.filter(x => x.unlocked).length);

  return sortedBySpent.map((item, index) => {
    const xpRank = sortedByXp.findIndex(x => x.key === item.key) + 1;
    const itemsRank = sortedByItems.findIndex(x => x.key === item.key) + 1;
    const achRank = sortedByAchievements.findIndex(x => x.key === item.key) + 1;

    return {
      key: item.key,
      memberNumber: generateMemberNumber(item.tier.id, index),
      customerName: item.data.name,
      email: item.data.email,
      phone: item.data.phone,
      city: item.data.city,
      orders: item.data.orders,
      orderCount: item.orderCount,
      totalSpent: item.totalSpent,
      averageTicket: item.averageTicket,
      lastPurchaseDate: item.lastDate,
      firstPurchaseDate: item.firstDate,
      daysSinceLastPurchase: item.daysSinceLastPurchase,
      tier: item.tier,
      nextTier: item.nextTier,
      amountNeededForNextTier: item.amountNeededForNextTier,
      progressPercent: item.progressPercent,
      xp: item.xp,
      xpLevel: item.xpLevelInfo.level,
      xpForNextLevel: item.xpLevelInfo.xpForNextLevel,
      xpProgressPercent: item.xpLevelInfo.progressPercent,
      achievements: item.achievements,
      completedMissions: item.completedMissions,
      isInactive: item.isInactive,
      isPrestesASubir: item.isPrestesASubir,
      isVip: item.isVip,
      itemsBoughtCount: item.itemsBoughtCount,
      purchasedProducts: item.purchasedProducts,
      rankPositions: {
        spent: index + 1,
        xp: xpRank,
        items: itemsRank,
        achievements: achRank
      }
    };
  });
}

// Multi-Rankings helper function
export function getMultiRankings(allOrders: any[], customTiers: LoyaltyTierConfig[] = DEFAULT_TIERS, topN = 10) {
  const list = processCustomerLoyaltyList(allOrders, customTiers);

  const formatList = (arr: CustomerLoyaltyData[], valueFormatter: (item: CustomerLoyaltyData) => string) => {
    return arr.slice(0, topN).map((item, idx) => ({
      position: idx + 1,
      medalSymbol: idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`,
      memberNumber: item.memberNumber,
      publicName: sanitizePublicName(item.customerName),
      city: item.city || 'Joinville/SC',
      tierSymbol: item.tier.symbol,
      tierName: item.tier.name,
      tierColor: item.tier.color,
      badge: item.tier.badge,
      xpLevel: item.xpLevel,
      metricValue: valueFormatter(item)
    }));
  };

  const topCompradores = formatList(
    [...list].sort((a, b) => b.orderCount - a.orderCount || b.totalSpent - a.totalSpent),
    (item) => `${item.orderCount} ${item.orderCount === 1 ? 'pedido' : 'pedidos'}`
  );

  const maiorXp = formatList(
    [...list].sort((a, b) => b.xp - a.xp),
    (item) => `${item.xp.toLocaleString('pt-BR')} XP (Nív. ${item.xpLevel})`
  );

  const maisProdutos = formatList(
    [...list].sort((a, b) => b.itemsBoughtCount - a.itemsBoughtCount),
    (item) => `${item.itemsBoughtCount} ${item.itemsBoughtCount === 1 ? 'peça' : 'peças'}`
  );

  const membrosHistoricos = formatList(
    [...list].sort((a, b) => {
      const timeA = a.firstPurchaseDate ? a.firstPurchaseDate.getTime() : Date.now();
      const timeB = b.firstPurchaseDate ? b.firstPurchaseDate.getTime() : Date.now();
      return timeA - timeB;
    }),
    (item) => item.firstPurchaseDate ? `Desde ${item.firstPurchaseDate.getFullYear()}` : 'Membro 2026'
  );

  const maisConquistas = formatList(
    [...list].sort((a, b) => {
      const achA = a.achievements.filter(x => x.unlocked).length;
      const achB = b.achievements.filter(x => x.unlocked).length;
      return achB - achA;
    }),
    (item) => `${item.achievements.filter(x => x.unlocked).length}/${item.achievements.length} Selos`
  );

  return {
    topCompradores,
    maiorXp,
    maisProdutos,
    membrosHistoricos,
    maisConquistas
  };
}


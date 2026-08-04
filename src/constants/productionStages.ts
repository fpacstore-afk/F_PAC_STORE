export interface ProductionStage {
  id: string;
  label: string;
  emoji: string;
  progress: number;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  accentColor: string;
  legacyMatches: string[];
}

export const PRODUCTION_STAGES: ProductionStage[] = [
  {
    id: 'received',
    label: 'Pedido Recebido',
    emoji: '📦',
    progress: 10,
    badgeBg: 'bg-[#eab308]/10',
    badgeText: 'text-[#eab308]',
    borderColor: 'border-[#eab308]/40',
    accentColor: '#eab308',
    legacyMatches: ['received', 'recebido', 'Pedido Recebido']
  },
  {
    id: 'payment_pending',
    label: 'Aguardando Pagamento',
    emoji: '💳',
    progress: 20,
    badgeBg: 'bg-amber-500/10',
    badgeText: 'text-amber-600',
    borderColor: 'border-amber-400/40',
    accentColor: '#f59e0b',
    legacyMatches: ['payment_pending', 'aguardando_pagamento', 'Aguardando Pagamento PIX', 'Aguardando Pagamento']
  },
  {
    id: 'aguardando_impressao',
    label: 'Aguardando Impressão',
    emoji: '🖨️',
    progress: 35,
    badgeBg: 'bg-blue-500/10',
    badgeText: 'text-blue-600',
    borderColor: 'border-blue-400/40',
    accentColor: '#3b82f6',
    legacyMatches: ['aguardando_impressao', 'Aguardando Impressão', 'em_impressao', 'Em Impressão', 'separacao', 'separando_camisa']
  },
  {
    id: 'estampa_finalizada',
    label: 'Estampa Finalizada',
    emoji: '🎨',
    progress: 50,
    badgeBg: 'bg-emerald-500/10',
    badgeText: 'text-emerald-600',
    borderColor: 'border-emerald-400/40',
    accentColor: '#10b981',
    legacyMatches: ['estampa_finalizada', 'Estampa Finalizada']
  },
  {
    id: 'controle_qualidade',
    label: 'Controle de Qualidade',
    emoji: '🔍',
    progress: 70,
    badgeBg: 'bg-stone-500/10',
    badgeText: 'text-stone-700',
    borderColor: 'border-stone-400/40',
    accentColor: '#78716c',
    legacyMatches: ['controle_qualidade', 'Controle de Qualidade', 'embalagem', 'embalando', 'Embalando']
  },
  {
    id: 'pronto_envio',
    label: 'Pronto para Envio',
    emoji: '📦',
    progress: 85,
    badgeBg: 'bg-sky-500/10',
    badgeText: 'text-sky-600',
    borderColor: 'border-sky-400/40',
    accentColor: '#0ea5e9',
    legacyMatches: ['pronto_envio', 'Pronto para Envio', 'payment_approved', 'Pagamento Aprovado']
  },
  {
    id: 'shipped',
    label: 'Enviado',
    emoji: '🚚',
    progress: 95,
    badgeBg: 'bg-violet-500/10',
    badgeText: 'text-violet-600',
    borderColor: 'border-violet-400/40',
    accentColor: '#8b5cf6',
    legacyMatches: ['shipped', 'enviado', 'Enviado']
  },
  {
    id: 'delivered',
    label: 'Finalizado',
    emoji: '✅',
    progress: 100,
    badgeBg: 'bg-black text-[#eab308]',
    badgeText: 'text-[#eab308]',
    borderColor: 'border-black',
    accentColor: '#10b981',
    legacyMatches: ['delivered', 'finalizado', 'Entregue', 'Finalizado']
  },
  {
    id: 'cancelled',
    label: 'Cancelado',
    emoji: '❌',
    progress: 0,
    badgeBg: 'bg-red-500/10',
    badgeText: 'text-red-600',
    borderColor: 'border-red-400/40',
    accentColor: '#ef4444',
    legacyMatches: ['cancelled', 'cancelado', 'canceled', 'Pagamento Não Realizado', 'Cancelado']
  }
];

export function getStageFromStatus(status: string): ProductionStage {
  if (!status) return PRODUCTION_STAGES[0];
  const cleaned = status.trim().toLowerCase();
  
  const found = PRODUCTION_STAGES.find(stage => 
    stage.id === cleaned ||
    stage.label.toLowerCase() === cleaned ||
    stage.legacyMatches.some(m => m.toLowerCase() === cleaned)
  );

  if (found) return found;

  // Fallbacks
  if (cleaned.includes('pagamento') && cleaned.includes('pend')) return PRODUCTION_STAGES[1];
  if (cleaned.includes('pago') || cleaned.includes('aprovado')) return PRODUCTION_STAGES[5];
  if (cleaned.includes('separa')) return PRODUCTION_STAGES[2];
  if (cleaned.includes('impress')) return PRODUCTION_STAGES[2];
  if (cleaned.includes('estampa')) return PRODUCTION_STAGES[3];
  if (cleaned.includes('qualidade')) return PRODUCTION_STAGES[4];
  if (cleaned.includes('embal')) return PRODUCTION_STAGES[4];
  if (cleaned.includes('pronto')) return PRODUCTION_STAGES[5];
  if (cleaned.includes('enviad') || cleaned.includes('shipped')) return PRODUCTION_STAGES[6];
  if (cleaned.includes('entreg') || cleaned.includes('delivered')) return PRODUCTION_STAGES[7];
  if (cleaned.includes('cancel')) return PRODUCTION_STAGES[8];

  return PRODUCTION_STAGES[0];
}

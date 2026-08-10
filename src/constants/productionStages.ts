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
    id: 'waiting',
    label: 'Aguardando Fila',
    emoji: '⏳',
    progress: 10,
    badgeBg: 'bg-amber-500/10',
    badgeText: 'text-amber-600',
    borderColor: 'border-amber-400/40',
    accentColor: '#f59e0b',
    legacyMatches: ['waiting', 'received', 'recebido', 'Pedido Recebido', 'Aguardando Fila']
  },
  {
    id: 'separacao_corte',
    label: 'Separação e Corte',
    emoji: '✂️',
    progress: 25,
    badgeBg: 'bg-blue-500/10',
    badgeText: 'text-blue-600',
    borderColor: 'border-blue-400/40',
    accentColor: '#3b82f6',
    legacyMatches: ['separacao_corte', 'separacao', 'corte', 'Separação e Corte', 'Aguardando Impressão', 'aguardando_impressao']
  },
  {
    id: 'estamparia',
    label: 'Estamparia e Impressão',
    emoji: '🎨',
    progress: 45,
    badgeBg: 'bg-purple-500/10',
    badgeText: 'text-purple-600',
    borderColor: 'border-purple-400/40',
    accentColor: '#a855f7',
    legacyMatches: ['estamparia', 'estampa_finalizada', 'Estampa Finalizada', 'Estamparia e Impressão']
  },
  {
    id: 'costura',
    label: 'Costura e Confecção',
    emoji: '🪡',
    progress: 65,
    badgeBg: 'bg-indigo-500/10',
    badgeText: 'text-indigo-600',
    borderColor: 'border-indigo-400/40',
    accentColor: '#6366f1',
    legacyMatches: ['costura', 'Costura e Confecção']
  },
  {
    id: 'embalagem',
    label: 'CQ e Embalagem',
    emoji: '🔍',
    progress: 80,
    badgeBg: 'bg-stone-500/10',
    badgeText: 'text-stone-700',
    borderColor: 'border-stone-400/40',
    accentColor: '#78716c',
    legacyMatches: ['embalagem', 'controle_qualidade', 'Controle de Qualidade', 'CQ e Embalagem']
  },
  {
    id: 'ready',
    label: 'Pronto para Envio',
    emoji: '📦',
    progress: 95,
    badgeBg: 'bg-sky-500/10',
    badgeText: 'text-sky-600',
    borderColor: 'border-sky-400/40',
    accentColor: '#0ea5e9',
    legacyMatches: ['ready', 'pronto_envio', 'Pronto para Envio']
  },
  {
    id: 'completed',
    label: 'Concluído',
    emoji: '✅',
    progress: 100,
    badgeBg: 'bg-black text-[#eab308]',
    badgeText: 'text-[#eab308]',
    borderColor: 'border-black',
    accentColor: '#10b981',
    legacyMatches: ['completed', 'finalizado', 'Concluído']
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

  // Fallbacks for production stages
  if (cleaned.includes('separa') || cleaned.includes('corte') || cleaned.includes('impress')) return PRODUCTION_STAGES[1];
  if (cleaned.includes('estamp')) return PRODUCTION_STAGES[2];
  if (cleaned.includes('costur')) return PRODUCTION_STAGES[3];
  if (cleaned.includes('qualidad') || cleaned.includes('embal')) return PRODUCTION_STAGES[4];
  if (cleaned.includes('pronto')) return PRODUCTION_STAGES[5];
  if (cleaned.includes('conclu') || cleaned.includes('finaliz')) return PRODUCTION_STAGES[6];

  return PRODUCTION_STAGES[0];
}

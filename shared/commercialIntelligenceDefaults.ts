/**
 * Configuração e Parâmetros Canônicos do Motor de Inteligência Comercial
 * FASE 9.6.3-A
 */

export const COMMERCIAL_SCORE_WEIGHTS = {
  marginPercentWeight: 0.4, // 40% peso da margem percentual
  volumeWeight: 0.3,        // 30% peso do volume de vendas
  contributionMarginWeight: 0.3 // 30% peso da margem em R$
} as const;

export const SENSITIVITY_PERCENTAGES = [5, 10, 15, 20] as const;

export interface CommercialScenarioPreset {
  id: 'conservative' | 'base' | 'aggressive';
  name: string;
  label: string;
  description: string;
  volumeChangePercent: number;
  costChangePercent: number;
  shippingCostChangePercent: number;
  averageDiscountPercent: number;
  marketingInvestmentDelta: number;
  badgeClass: string;
}

export const SCENARIO_PRESETS: Record<'conservative' | 'base' | 'aggressive', CommercialScenarioPreset> = {
  conservative: {
    id: 'conservative',
    name: 'Conservador',
    label: 'Cenário 1: Conservador',
    description: 'Queda de volume e pressão de custos operacionais e frete',
    volumeChangePercent: -15,
    costChangePercent: 10,
    shippingCostChangePercent: 10,
    averageDiscountPercent: 5,
    marketingInvestmentDelta: 0,
    badgeClass: 'bg-rose-100 text-rose-800'
  },
  base: {
    id: 'base',
    name: 'Base Atual',
    label: 'Cenário 2: Base Atual',
    description: 'Desempenho vigente e parâmetros reais observados no período',
    volumeChangePercent: 0,
    costChangePercent: 0,
    shippingCostChangePercent: 0,
    averageDiscountPercent: 0,
    marketingInvestmentDelta: 0,
    badgeClass: 'bg-[#eab308] text-black'
  },
  aggressive: {
    id: 'aggressive',
    name: 'Agressivo',
    label: 'Cenário 3: Agressivo',
    description: 'Expansão de volume impulsionada por investimento em marketing (premissa de simulação)',
    volumeChangePercent: 25,
    costChangePercent: 0,
    shippingCostChangePercent: 0,
    averageDiscountPercent: 3,
    marketingInvestmentDelta: 1500,
    badgeClass: 'bg-emerald-100 text-emerald-800'
  }
};

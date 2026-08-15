/**
 * CONFIGURAÇÃO CANÔNICA CENTRAL DE DEFAULTS E ESTIMATIVAS FINANCEIRAS
 * FASE 9.6.1 - FPAC Store
 *
 * Módulo compartilhado entre Frontend (src/) e Backend (server/).
 * Elimina completamente números mágicos e divergências de cálculo entre cliente e servidor.
 */

export const FINANCIAL_DEFAULTS = {
  // Custos unitários de confecção/produção estimados por linha (quando não há snapshot nem catálogo)
  estimatedProductCosts: {
    MARK: 51.00,
    PRIME: 42.00,
    FORCE: 40.00,
    DEFAULT: 40.00
  },

  // Parâmetros de taxas de adquirentes e gateways de pagamento
  gateway: {
    pixFeePercent: 0.99,
    pixFixedFee: 0.00,
    cardFeePercent: 3.99,
    cardFixedFee: 0.40,
    defaultFeePercent: 0.99,
    defaultFixedFee: 0.00
  },

  // Parâmetros de simulação de margens e precificação
  defaultDesiredMarginPercent: 30.00, // 30% de margem de contribuição desejada
  defaultDiscountPercent: 0.00,
  defaultSalePrice: 149.90
} as const;

export const MARGIN_THRESHOLDS = {
  CRITICAL: 15.00, // < 15% is critical
  LOW: 25.00,      // 15% to 25% is low
  HEALTHY: 40.00   // 25% to 40% is healthy, > 40% is excellent
} as const;

export const BREAKEVEN_THRESHOLDS = {
  CLOSE: 80.00,    // 80% to 99.9% is close
  REACHED: 100.00, // 100% to 110% is reached
  EXCEEDED: 110.00 // > 110% is exceeded
} as const;

export type MarginClassification = 'negative' | 'critical' | 'low' | 'healthy' | 'excellent';

export interface MarginClassificationResult {
  type: MarginClassification;
  label: string;
  badgeClass: string;
  colorHex: string;
}

export function classifyMargin(marginPercent: number): MarginClassificationResult {
  const p = Number(marginPercent || 0);
  if (p < 0) {
    return {
      type: 'negative',
      label: 'Negativa',
      badgeClass: 'bg-red-500/10 text-red-500 border-red-500/30',
      colorHex: '#ef4444'
    };
  }
  if (p < MARGIN_THRESHOLDS.CRITICAL) {
    return {
      type: 'critical',
      label: 'Crítica',
      badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
      colorHex: '#f59e0b'
    };
  }
  if (p < MARGIN_THRESHOLDS.LOW) {
    return {
      type: 'low',
      label: 'Baixa',
      badgeClass: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
      colorHex: '#ca8a04'
    };
  }
  if (p <= MARGIN_THRESHOLDS.HEALTHY) {
    return {
      type: 'healthy',
      label: 'Saudável',
      badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
      colorHex: '#3b82f6'
    };
  }
  return {
    type: 'excellent',
    label: 'Excelente',
    badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    colorHex: '#10b981'
  };
}

export type BreakEvenStatus = 'not_reached' | 'close' | 'reached' | 'exceeded';

export interface BreakEvenStatusResult {
  status: BreakEvenStatus;
  label: string;
  badgeClass: string;
  colorHex: string;
}

export function classifyBreakEvenStatus(currentRevenue: number, requiredRevenue: number): BreakEvenStatusResult {
  if (requiredRevenue <= 0) {
    return {
      status: 'reached',
      label: 'Atingido',
      badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
      colorHex: '#10b981'
    };
  }
  const pct = (currentRevenue / requiredRevenue) * 100;
  if (pct < BREAKEVEN_THRESHOLDS.CLOSE) {
    return {
      status: 'not_reached',
      label: 'Não Atingido',
      badgeClass: 'bg-red-500/10 text-red-500 border-red-500/30',
      colorHex: '#ef4444'
    };
  }
  if (pct < BREAKEVEN_THRESHOLDS.REACHED) {
    return {
      status: 'close',
      label: 'Próximo',
      badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
      colorHex: '#f59e0b'
    };
  }
  if (pct <= BREAKEVEN_THRESHOLDS.EXCEEDED) {
    return {
      status: 'reached',
      label: 'Atingido',
      badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
      colorHex: '#3b82f6'
    };
  }
  return {
    status: 'exceeded',
    label: 'Superado',
    badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    colorHex: '#10b981'
  };
}

/**
 * Arredonda valor monetário em reais para 2 casas decimais exatas,
 * evitando anomalias de precisão de ponto flutuante do JavaScript.
 */
export function roundMoney(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Arredonda porcentagem para o número de casas decimais especificado (padrão 2).
 */
export function roundPercent(val: number, decimals: number = 2): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Converte valor em reais para centavos inteiros (base 100).
 */
export function toCents(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round(val * 100);
}

/**
 * Converte centavos inteiros de volta para reais decimais.
 */
export function fromCents(cents: number): number {
  if (isNaN(cents) || !isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

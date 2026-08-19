/**
 * CONTRATOS CANÔNICOS DE FORECAST & PLANEJAMENTO COMERCIAL
 * FASE 9.6.5-A — FPAC Store
 *
 * Módulo de tipos fechados para Projeções, Cenários What-If, Baseline Imutável,
 * Current Actuals, Comparativos Real x Meta x Forecast e Eventos de Auditoria.
 */

export type ForecastHorizon = 'current_month' | 'next_month' | 'quarter' | 'year' | 'custom';

export type ForecastMetricType =
  | 'revenue'
  | 'operating_profit'
  | 'contribution_margin'
  | 'units'
  | 'average_ticket'
  | 'orders';

export type ForecastConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';

export interface ForecastConfidenceDetails {
  level: ForecastConfidenceLevel;
  score: number; // 0 a 100
  sampleSize: number; // Quantidade de pedidos considerados
  costCoveragePercent: number; // % de produtos com custo registrado ponderado por unidades
  timeHorizonDays: number;
  missingUnits?: number;
  estimatedUnits?: number;
  costSourceBreakdown?: {
    snapshotUnits: number;
    catalogUnits: number;
    estimatedUnits: number;
    missingUnits: number;
  };
  reasons: string[];
}

/**
 * Snapshot histórico e imutável do Baseline de dados no momento da geração do Forecast
 */
export interface ForecastBaselineSnapshot {
  isHistoricalSnapshot: true;
  snapshotCapturedAt: string;
  snapshotVersion: '1.0';
  
  // Períodos explícitos de amostragem e projeção
  sourceStartDate: string;
  sourceEndDate: string;
  asOfDate?: string;
  forecastStartDate: string;
  forecastEndDate: string;
  
  sampleOrdersCount: number;
  sampleDaysCount: number; // Dias efetivamente transcorridos na amostragem
  
  // Médias diárias de run-rate
  dailyAverageRevenue: number;
  dailyAverageOrders: number;
  dailyAverageUnits: number;
  dailyAverageContributionMargin: number;
  dailyAverageOperatingProfit: number;
  
  // Realizados totais no período de amostragem
  realizedRevenue: number;
  realizedOrders: number;
  realizedUnits: number;
  realizedContributionMargin: number;
  realizedOperatingProfit: number;
  realizedAverageTicket: number; // realizedRevenue / realizedOrders
  averageTicket?: number; // Alias canônico de realizedAverageTicket
  
  // Despesas e Custos Canônicos Detalhados (Auditáveis)
  cogs: number;
  variableCosts: number;
  gatewayFees?: number;
  shippingSubsidy?: number;
  orderOtherVariableCosts?: number;
  administrativeVariableExpenses?: number;
  otherExpenses?: number;
  fixedExpenses: number;
  trafficExpenses: number;
  costCoveragePercent: number;
  costSourceBreakdown?: {
    snapshotUnits: number;
    catalogUnits: number;
    estimatedUnits: number;
    missingUnits: number;
  };
}

/**
 * Dados realizados atuais (Current Actuals) que evoluem com o tempo sem alterar o Baseline Snapshot
 */
export interface ForecastCurrentActuals {
  revenue: number;
  operatingProfit: number;
  contributionMargin: number;
  units: number;
  averageTicket: number;
  orders: number;
  calculatedAt: string;
}

/**
 * Parâmetros de Simulação de Cenário What-If
 */
export interface WhatIfScenarioParams {
  name: string;
  priceAdjustmentPercent?: number; // Ex: +5 ou -10 (%)
  volumeElasticityFactor?: number; // Elasticidade da demanda (padrão: 1.0)
  volumeAdjustmentPercent?: number; // Ex: +15 (%)
  costInflationPercent?: number; // Ex: +4 (%) no COGS
  trafficSpendAdjustment?: number; // Ex: +R$ 500 em anúncios
  fixedExpenseAdjustment?: number; // Ex: -R$ 200 em despesas fixas
  targetProductId?: string; // Opcional se for focado em produto específico
  targetCategoryId?: string;
}

/**
 * Resultado Calculado da Projeção de Cenário What-If
 */
export interface WhatIfScenarioResult {
  id: string;
  name: string;
  params: WhatIfScenarioParams;
  
  // Valores Projetados Finais
  projectedRevenue: number;
  projectedOrders: number;
  projectedUnits: number;
  projectedContributionMargin: number;
  projectedContributionMarginPercent: number;
  projectedOperatingProfit: number;
  projectedAverageTicket: number;
  
  // Variações Absolutas em relação ao Baseline Projetado
  deltaRevenue: number;
  deltaContributionMargin: number;
  deltaOperatingProfit: number;
  deltaUnits: number;
  deltaOrders: number;
  
  impactAssessment: 'positive' | 'neutral' | 'negative';
  summary: string;
  simulatedAt: string;
}

/**
 * Comparativo Real vs Meta vs Forecast
 */
export interface RealVsGoalVsForecastComparison {
  metric: ForecastMetricType;
  realized: number; // Real atual (currentActuals ou baseline inicial)
  targetGoal?: number;
  forecasted: number;
  
  // Gaps e Ritmo
  gapGoalVsForecast: number; // targetGoal - forecasted
  gapRealVsGoal: number; // realized - targetGoal
  isGoalOnTrack: boolean;
  projectedAttainmentPercent: number; // (forecasted / targetGoal) * 100
  currentAttainmentPercent: number; // (realized / targetGoal) * 100
  paceStatus: 'ahead' | 'on_track' | 'behind' | 'critical';
}

/**
 * Contrato Canônico de Forecast Comercial (CommercialForecast)
 */
export interface CommercialForecast {
  id: string;
  title: string;
  horizon: ForecastHorizon;
  
  // Períodos explícitos
  sourceStartDate: string;
  sourceEndDate: string;
  asOfDate?: string;
  forecastStartDate: string;
  forecastEndDate: string;
  
  startDate: string; // Compatibilidade retroativa (aponta para forecastStartDate)
  endDate: string; // Compatibilidade retroativa (aponta para forecastEndDate)
  targetDaysCount: number;
  
  // Baseline Imutável
  baseline: ForecastBaselineSnapshot;
  
  // Realizados Atuais (Atualizados em recálculos sem mutar o baseline)
  currentActuals?: ForecastCurrentActuals;
  
  // Nível de Confiança
  confidence: ForecastConfidenceDetails;
  
  // Projeções Canônicas Run-Rate
  projectedRevenue: number;
  projectedOrders: number;
  projectedUnits: number;
  projectedContributionMargin: number;
  projectedContributionMarginPercent: number;
  projectedOperatingProfit: number;
  projectedAverageTicket: number;
  
  // Cenários What-If Simulados
  scenarios?: WhatIfScenarioResult[];
  
  // Comparativos Real x Meta x Forecast
  comparisons?: RealVsGoalVsForecastComparison[];
  
  status: 'active' | 'archived' | 'superseded' | 'completed';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastRecalculatedAt?: string;
  createdBy: string;
}

/**
 * Evento de Auditoria Imutável do Forecast (Append-Only)
 */
export interface CommercialForecastEvent {
  id: string;
  forecastId: string;
  type:
    | 'created'
    | 'updated'
    | 'recalculated'
    | 'activated'
    | 'completed'
    | 'scenario_added'
    | 'converted_to_action'
    | 'archived';
  performedBy: string;
  timestamp: string;
  payload: Record<string, any>;
}

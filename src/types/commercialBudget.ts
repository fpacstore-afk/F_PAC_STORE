/**
 * CONTRATOS CANÔNICOS DE ORÇAMENTO COMERCIAL & GUARDRAILS FINANCEIROS
 * FASE 9.6.6 — FPAC Store
 *
 * Módulo de tipos fechados para Orçamentos (Budgets), Alocações por Categoria/Despesa,
 * Snapshots de Baseline e Forecast Imutáveis, Realizado to-Date, Variâncias (Receita/Despesa),
 * Análise 3-Way e 4-Way (Real x Budget x Forecast x Meta), Guardrails e Alertas de Limite.
 */

import { CommercialGoalPeriod, CommercialGoalType, CommercialGoal } from './commercialGovernance.js';
import { CommercialForecast, ForecastBaselineSnapshot, ForecastMetricType } from './commercialForecast.js';

export type BudgetPeriod = CommercialGoalPeriod | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type BudgetStatus = 'draft' | 'active' | 'completed' | 'archived';
export type LineAllocationMethod = 'manual' | 'revenue_proportional' | 'historical_mix' | 'equal_split';

export type BudgetConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';

export interface BudgetCostSourceBreakdown {
  snapshotUnits: number;
  catalogUnits: number;
  estimatedUnits: number;
  missingUnits: number;
}

export interface BudgetConfidenceDetails {
  level: BudgetConfidenceLevel;
  score: number; // 0 a 100
  sampleSize: number;
  costCoveragePercent: number;
  timeHorizonDays: number;
  costSourceBreakdown?: BudgetCostSourceBreakdown;
  reasons: string[];
}

export interface CommercialBudgetLineAllocation {
  line: 'FORCE' | 'MARK' | 'PRIME' | 'OTHER' | string;
  targetRevenue: number;
  targetRevenuePercent: number;
  targetCogs: number;
  targetContributionMargin: number;
  targetUnits: number;
}

export interface CommercialBudgetAllocations {
  cogsBudget: number;
  trafficBudget: number;
  fixedExpensesBudget: number;
  variableExpensesBudget?: number; // Compatibilidade histórica
  shippingSubsidyBudget?: number;
  gatewayFeesBudget?: number;
  orderOtherVariableCostsBudget?: number;
  administrativeVariableExpensesBudget?: number;
  marketingBudget?: number; // Alias para trafficBudget
  otherExpensesBudget?: number;
  totalExpensesBudget: number;
}

export interface BudgetApprovedSnapshot {
  isApprovedSnapshot: true;
  approvedAt: string;
  approvedBy: string;
  version: number;
  targetRevenue: number;
  targetContributionMargin: number;
  targetContributionMarginPercent?: number;
  targetOperatingProfit: number;
  targetOperatingProfitPercent?: number;
  targetOrders: number;
  targetUnits: number;
  targetAverageTicket?: number;
  allocations: CommercialBudgetAllocations;
  guardrails?: CommercialBudgetGuardrails;
  linkedGoalIds?: string[];
  linkedGoalId?: string;
  linkedForecastId?: string;
  forecastSnapshot?: any;
  lineAllocationMethod?: LineAllocationMethod;
  lineAllocations?: CommercialBudgetLineAllocation[];
}

export interface CommercialBudgetGuardrails {
  maxTrafficSpendPercentOfRevenue?: number; // Ex: 15 (%)
  minContributionMarginPercent?: number; // Ex: 30 (%)
  maxCogsPercentOfRevenue?: number; // Ex: 40 (%)
  maxDiscountPercent?: number; // Ex: 20 (%)
  burnRateAlertThresholdPercent?: number; // Ex: 110 (%) de pro-rata
}

export type BudgetVarianceAlertType =
  | 'REVENUE_BELOW_BUDGET'
  | 'MARKETING_OVER_BUDGET'
  | 'COGS_OVER_BUDGET'
  | 'CONTRIBUTION_MARGIN_BELOW_BUDGET'
  | 'OPERATING_PROFIT_BELOW_BUDGET'
  | 'LOW_COST_COVERAGE';

export interface BudgetVarianceAlert {
  id?: string;
  type: BudgetVarianceAlertType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  currentValue: number;
  budgetedValue: number;
  variancePercent: number;
  recommendation?: string;
  triggeredAt?: string;
}

export interface BudgetGuardrailAlert {
  id: string;
  guardrailType:
    | 'traffic_exceeded'
    | 'margin_below_threshold'
    | 'cogs_exceeded'
    | 'burn_rate_exceeded'
    | 'unfavorable_operating_profit'
    | 'custom';
  type?: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  currentValue: number;
  thresholdValue: number;
  triggeredAt: string;
}

export interface BudgetBaselineSnapshot {
  isHistoricalSnapshot: true;
  snapshotCapturedAt: string;
  snapshotVersion: '1.0';
  sourceStartDate: string;
  sourceEndDate: string;
  budgetStartDate: string;
  budgetEndDate: string;
  sampleOrdersCount: number;
  sampleDaysCount: number;
  realizedRevenue: number;
  realizedOrders: number;
  realizedUnits: number;
  realizedContributionMargin: number;
  realizedOperatingProfit: number;
  realizedAverageTicket: number;
  cogs: number;
  variableCosts: number;
  gatewayFees: number;
  shippingSubsidy: number;
  fixedExpenses: number;
  trafficExpenses: number;
  costCoveragePercent: number;
}

export interface BudgetForecastSnapshot {
  isHistoricalSnapshot: true;
  snapshotCapturedAt: string;
  snapshotVersion: '1.0';
  forecastId: string;
  forecastTitle: string;
  projectedRevenue: number;
  projectedOrders: number;
  projectedUnits: number;
  projectedContributionMargin: number;
  projectedOperatingProfit: number;
  projectedAverageTicket: number;
  projectedCogs: number;
  projectedTraffic: number;
  projectedFixedExpenses: number;
}

export interface BudgetCurrentActuals {
  revenue: number;
  orders: number;
  ordersCount?: number;
  units: number;
  averageTicket: number;
  cogs: number;
  gatewayFees: number;
  shippingSubsidy: number;
  administrativeVariableExpenses?: number;
  variableCosts: number;
  fixedExpenses: number;
  trafficExpenses: number;
  otherExpenses: number;
  totalExpenses: number;
  contributionMargin: number;
  contributionMarginPercent: number;
  operatingProfit: number;
  operatingProfitPercent: number;
  costCoveragePercent: number;
  daysElapsed: number;
  totalDays: number;
  elapsedRatio: number;
  calculatedAt: string;
}

export interface BudgetVarianceMetric {
  metric: string;
  metricName?: string;
  benchmark?: number;
  budget?: number;
  budgeted: number;
  budgetedToDate: number;
  realized: number;
  delta: number; // realized - budgeted (ou realized - budgetedToDate)
  variancePercent: number; // delta / budgeted
  isFavorable: boolean; // para receita, delta > 0 é favorável; para despesa, delta < 0 é favorável
  status: 'favorable' | 'neutral' | 'unfavorable';
}

export interface BudgetToDateProRata {
  daysElapsed: number;
  totalDays: number;
  elapsedRatio: number;
  revenueToDate: number;
  cogsToDate: number;
  trafficToDate: number;
  fixedExpensesToDate: number;
  variableExpensesToDate: number;
  shippingSubsidyToDate: number;
  gatewayFeesToDate: number;
  totalExpensesToDate: number;
  contributionMarginToDate: number;
  operatingProfitToDate: number;
  ordersToDate: number;
  unitsToDate: number;
}

export interface BudgetReconciliation {
  budgetToDate: BudgetToDateProRata;
  realVsBudget: BudgetVarianceMetric[];
  budgetVsForecast?: BudgetVarianceMetric[];
  budgetVsGoal?: BudgetVarianceMetric[];
  revenueVariance: BudgetVarianceMetric;
  expenseVariance: BudgetVarianceMetric;
  cogsVariance: BudgetVarianceMetric;
  trafficVariance: BudgetVarianceMetric;
  fixedExpensesVariance: BudgetVarianceMetric;
  variableExpensesVariance: BudgetVarianceMetric;
  contributionMarginVariance: BudgetVarianceMetric;
  operatingProfitVariance: BudgetVarianceMetric;
  alerts: BudgetGuardrailAlert[];
  varianceAlerts?: BudgetVarianceAlert[];
  reconciledAt: string;
}

export interface CommercialBudget {
  id: string;
  title: string;
  description?: string;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  status: BudgetStatus;
  version: number;
  parentBudgetId?: string;
  previousVersionId?: string;
  
  // Targets Orçados
  targetRevenue: number;
  targetContributionMargin: number;
  targetContributionMarginPercent: number;
  targetOperatingProfit: number;
  targetOperatingProfitPercent?: number;
  targetOrders: number;
  targetUnits: number;
  targetAverageTicket: number;
  
  // Alocações por Departamento / Categoria
  allocations: CommercialBudgetAllocations;
  
  // Alocações por Linha de Produto
  lineAllocationMethod?: LineAllocationMethod;
  lineAllocations?: CommercialBudgetLineAllocation[];
  
  // Guardrails
  guardrails: CommercialBudgetGuardrails;
  
  // Vínculos
  linkedForecastId?: string;
  linkedGoalId?: string;
  linkedGoalIds?: string[];
  
  // Snapshots Imutáveis
  baselineSnapshot: BudgetBaselineSnapshot;
  forecastSnapshot?: BudgetForecastSnapshot;
  approvedSnapshot?: BudgetApprovedSnapshot;
  
  // Realizado Atual
  currentActuals: BudgetCurrentActuals;
  
  // Reconciliação Multi-Way & Alertas
  reconciliation: BudgetReconciliation;
  
  // Confiabilidade de Custo
  confidence: BudgetConfidenceDetails;
  
  // Auditoria
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  archivedAt?: string;
}

export type BudgetEventType =
  | 'created'
  | 'updated'
  | 'activated'
  | 'recalculated'
  | 'archived'
  | 'rebudgeted'
  | 'version_created';

export interface CommercialBudgetEvent {
  id: string;
  budgetId: string;
  type: BudgetEventType;
  performedBy: string;
  timestamp: string;
  payload?: Record<string, any>;
}

/**
 * Tipos Canônicos para Pós-Mortem Comercial, Eficácia de Ações e Aprendizado Contínuo (FASE 9.6.8)
 * FPAC Store — Sistema de Inteligência & Execução Comercial
 */

export type CommercialActionAttribution = 'direct' | 'correlated' | 'estimated' | 'insufficient';
export type CommercialActionConfidence = 'high' | 'medium' | 'low' | 'insufficient';

export type CommercialExecutionReviewStatus = 'draft' | 'generated' | 'approved' | 'archived';

export type CommercialActionEffectivenessStatus = 
  | 'exceeded' 
  | 'met' 
  | 'below_expected' 
  | 'insufficient' 
  | 'cancelled';

export type CommercialVarianceDriverType =
  | 'ORDER_VOLUME'
  | 'AVERAGE_TICKET'
  | 'PRODUCT_MIX'
  | 'COGS'
  | 'GATEWAY_FEES'
  | 'SHIPPING'
  | 'MARKETING'
  | 'FIXED_EXPENSES'
  | 'OTHER_VARIABLE_COSTS'
  | 'OTHER_EXPENSES'
  | 'PLANNING_RESIDUAL';

export type CommercialLearningInsightType =
  | 'FORECAST_CALIBRATION'
  | 'BUDGET_PLANNING'
  | 'ACTION_EFFECTIVENESS'
  | 'EXECUTION_PROCESS'
  | 'PRODUCT_LINE'
  | 'COST_QUALITY'
  | 'MARGIN'
  | 'GOAL_ATTAINMENT';

export type CommercialLearningConfidence = 'high' | 'medium' | 'low' | 'insufficient';

export type CommercialReviewEventType =
  | 'review_created'
  | 'review_generated'
  | 'review_recalculated'
  | 'review_approved'
  | 'review_archived'
  | 'insight_converted_to_action';

export interface CommercialVarianceDriver {
  driver: CommercialVarianceDriverType;
  amount: number;
  direction: 'favorable' | 'unfavorable' | 'neutral';
  favorable: boolean;
  explanation: string;
}

export interface CommercialVarianceBridge {
  budgetRevenue: number;
  actualRevenue: number;
  totalVariance: number;
  orderVolumeEffect: number;
  ticketEffect: number;
  planningResidual: number;
  residualExplanation?: string;
  isCentExact: boolean;
  drivers: CommercialVarianceDriver[];
}

export interface CommercialForecastCalibrationMetric {
  metric: 'revenue' | 'orders' | 'units' | 'averageTicket' | 'contributionMargin' | 'operatingProfit';
  forecastValue: number;
  actualValue: number;
  error: number; // actual - forecast
  absoluteError: number;
  errorPercent: number | null; // null when forecast is 0
  direction: 'over_forecast' | 'under_forecast' | 'accurate';
}

export interface CommercialForecastCalibration {
  forecastId?: string;
  forecastTitle?: string;
  metrics: CommercialForecastCalibrationMetric[];
  meanAbsolutePercentageError?: number | null;
  overallBias: 'over_forecast' | 'under_forecast' | 'balanced';
  calibrationRecommendation?: string;
}

export interface CommercialLearningInsightEvidence {
  metric: string;
  referenceValue: number | string;
  actualValue: number | string;
  variance?: number | string;
  source: string;
}

export interface CommercialLearningInsight {
  id: string;
  type: CommercialLearningInsightType;
  title: string;
  description: string;
  evidence: CommercialLearningInsightEvidence[];
  metrics: Record<string, number | string | boolean | null>;
  confidence: CommercialLearningConfidence;
  recommendedNextStep: string;
  canCreateAction: boolean;
  sourceReviewId: string;
  convertedActionId?: string;
  convertedAt?: string;
}

export interface CommercialActionEffectiveness {
  actionId: string;
  executionCycleId: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  productLine?: string;
  channel?: string;
  owner?: string;
  expectedRevenue?: number;
  expectedUnits?: number;
  expectedContributionMargin?: number;
  actualRevenue: number;
  actualUnits: number;
  actualContributionMargin?: number;
  revenueVarianceAbsolute?: number;
  revenueVariancePercent?: number | null;
  impactAttribution: CommercialActionAttribution;
  confidence: CommercialActionConfidence;
  costCoveragePercent?: number;
  executionStatus: string;
  completedAt?: string;
  effectivenessStatus: CommercialActionEffectivenessStatus;
  attributionNote: string;
}

export interface CommercialLineOutcome {
  line: 'FORCE' | 'MARK' | 'PRIME' | 'OTHER' | string;
  revenue: number;
  orders: number;
  units: number;
  cogs: number;
  contributionMargin: number;
  contributionMarginPercent: number;
  shareOfRevenuePercent: number;
  costCoveragePercent: number;
  confidence: CommercialActionConfidence;
}

export interface CommercialMetricComparison {
  budget: number;
  actual: number;
  varianceAbsolute: number; // actual - budget for revenue/profit; budget - actual for expenses
  variancePercent: number | null;
  favorable: boolean;
  available?: boolean;
  unavailableReason?: string;
}

export interface CommercialGoalComparison {
  goalId: string;
  title: string;
  type: 'revenue' | 'operating_profit' | 'contribution_margin' | 'units' | 'average_ticket' | string;
  targetValue: number;
  actualValue: number;
  gapAbsolute: number; // actual - target
  gapPercent: number | null;
  attained: boolean;
  confidence: CommercialLearningConfidence;
}

export interface CommercialExecutionOutcomeSnapshot {
  executionCycleSnapshot: any;
  budgetSnapshot?: any;
  forecastSnapshot?: any;
  goalSnapshots: any[];
  goalComparisons: CommercialGoalComparison[];
  finalActuals: {
    revenue: number;
    orders: number;
    units: number;
    averageTicket: number;
    cogs: number;
    gatewayFees: number;
    shippingSubsidy: number;
    otherVariableCosts: number;
    contributionMargin: number;
    contributionMarginPercent: number;
    marketingSpend: number;
    fixedExpenses: number;
    otherExpenses: number;
    operatingProfit: number;
    operatingProfitPercent: number;
    costCoveragePercent: number;
    confidence: CommercialLearningConfidence;
  };
  budgetComparisons: {
    revenue: CommercialMetricComparison;
    orders: CommercialMetricComparison;
    units: CommercialMetricComparison;
    averageTicket: CommercialMetricComparison;
    cogs: CommercialMetricComparison;
    gatewayFees: CommercialMetricComparison;
    shippingSubsidy: CommercialMetricComparison;
    marketingSpend: CommercialMetricComparison;
    contributionMargin: CommercialMetricComparison;
    operatingProfit: CommercialMetricComparison;
  };
  lineOutcomes: CommercialLineOutcome[];
  actionEffectivenessSummary: {
    totalActions: number;
    completedActions: number;
    cancelledActions: number;
    blockedActions: number;
    overdueAtEnd: number;
    completionRate: number;
    criticalActionsTotal: number;
    criticalActionsCompleted: number;
    criticalActionsFailedOrBlocked: number;
    exceededCount: number;
    metCount: number;
    belowExpectedCount: number;
    insufficientCount: number;
    directActionsCompleted?: number;
    directActionsSuccess?: number;
    directActionEffectivenessRate?: number;
    directAttributedRevenue: number;
    correlatedAttributedRevenue: number;
  };
  executionProgress: {
    timeElapsedDays: number;
    totalDays: number;
    timeProgressPercent: number;
    averageWeightedActionProgress: number;
    reasonCode?: string;
  };
  varianceBridge: CommercialVarianceBridge;
  forecastCalibration?: CommercialForecastCalibration;
  learningInsights: CommercialLearningInsight[];
  costCoveragePercent: number;
  confidence: CommercialLearningConfidence;
  budgetSnapshotSource?: 'approved_snapshot' | 'fallback_unapproved' | 'none';
  budgetSnapshotMissingReason?: string;
  capturedAt: string;
}

export interface CommercialExecutionReview {
  id: string;
  executionCycleId: string;
  executionCycleVersion: number;
  title: string;
  periodStart: string;
  periodEnd: string;
  budgetId?: string;
  linkedForecastId?: string;
  forecastId?: string;
  linkedGoalIds: string[];
  status: CommercialExecutionReviewStatus;
  analysisVersion: number;
  createdAt: string;
  createdBy: string;
  generatedAt?: string;
  generatedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  archivedAt?: string;
  archivedBy?: string;
  outcomeSnapshot?: CommercialExecutionOutcomeSnapshot;
  summary?: {
    headline: string;
    budgetAdherence: 'exceeded' | 'achieved' | 'missed';
    primaryVarianceDriver: string;
    keyLearning: string;
    actionEffectivenessRate: number;
    forecastAccuracyRating: 'high' | 'medium' | 'low' | 'insufficient' | 'unavailable';
  };
  notes?: string;
  deterministicKey?: string;
}

export interface CommercialExecutionReviewActionSnapshot {
  id: string;
  reviewId: string;
  actionId: string;
  executionCycleId: string;
  title: string;
  priority: string;
  productLine?: string;
  channel?: string;
  owner?: string;
  expectedImpactSnapshot: any;
  actualImpactSnapshot: any;
  attributionSnapshot: CommercialActionAttribution;
  confidenceSnapshot: CommercialActionConfidence;
  executionSnapshot: {
    executionStatus: string;
    progressPercent: number;
    completedAt?: string;
  };
  effectivenessResult: CommercialActionEffectivenessStatus;
  capturedAt: string;
}

export interface CommercialExecutionReviewEvent {
  id: string;
  reviewId: string;
  eventType: CommercialReviewEventType;
  actorUid: string;
  actorEmail?: string;
  timestamp: string;
  before?: any;
  after?: any;
  idempotencyKeyHash?: string;
}

export interface CommercialHistoricalLearningSummary {
  reviewCount: number;
  periodStart: string;
  periodEnd: string;
  productLineFilter?: string;
  averageBudgetVariancePercent: number | null;
  averageForecastErrorPercent: number | null;
  forecastBias: {
    meanError: number;
    direction: 'over_forecast' | 'under_forecast' | 'balanced';
    biasDescription: string;
    sampleSize: number;
  };
  goalAttainmentRate: number | null;
  actionCompletionRate: number;
  directActionEffectivenessRate: number;
  linePerformanceSummary: Array<{
    line: string;
    totalRevenue: number;
    averageContributionMarginPercent: number;
    shareOfRevenuePercent: number;
    reviewsCount: number;
  }>;
  suggestedCalibrationAdjustment?: {
    revenueAdjustmentPercent: number;
    notes: string;
    evidence: CommercialLearningInsightEvidence[];
  };
  confidence: CommercialLearningConfidence;
  confidenceReason: string;
}

export type CommercialReviewEvent = CommercialExecutionReviewEvent;
export type CommercialReviewActionSnapshot = CommercialExecutionReviewActionSnapshot;

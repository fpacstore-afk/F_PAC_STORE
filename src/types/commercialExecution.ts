/**
 * CONTRATOS CANÔNICOS DE EXECUÇÃO COMERCIAL & GOVERNANÇA OPERACIONAL
 * FASE 9.6.7 — FPAC Store
 *
 * Módulo de tipos fechados para Ciclos Operacionais Comerciais, Planos de Ação,
 * Atribuição de Impacto, Reconciliação Temporal, Health e Auditoria Append-Only.
 */

import {
  CommercialGoalType,
  CommercialGoalPeriod,
  CommercialAction,
  CommercialActionType,
  CommercialActionStatus,
  CommercialActionSourceSnapshot
} from './commercialGovernance.js';
import { CommercialBudgetLineAllocation, BudgetPeriod } from './commercialBudget.js';

export type CommercialExecutionStatus = 'draft' | 'active' | 'completed' | 'archived';

export type CommercialExecutionHealthStatus = 'healthy' | 'attention' | 'critical' | 'insufficient';

export type CommercialActionExecutionStatus =
  | 'planned'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export type CommercialActionPriority = 'low' | 'medium' | 'high' | 'critical';

export type CommercialImpactAttribution = 'direct' | 'correlated' | 'estimated' | 'insufficient';

export type CommercialProductLine = 'FORCE' | 'MARK' | 'PRIME' | 'OTHER' | 'ALL';

export type CommercialExecutionAlertCode =
  | 'ACTION_OVERDUE'
  | 'ACTION_BLOCKED'
  | 'CRITICAL_ACTION_BLOCKED'
  | 'EXECUTION_BEHIND_PLAN'
  | 'REVENUE_BELOW_EXPECTED'
  | 'UNITS_BELOW_EXPECTED'
  | 'AVERAGE_TICKET_BELOW_EXPECTED'
  | 'CONTRIBUTION_MARGIN_BELOW_EXPECTED'
  | 'OPERATING_PROFIT_BELOW_EXPECTED'
  | 'FORECAST_BELOW_BUDGET'
  | 'GOAL_AT_RISK'
  | 'LOW_COST_COVERAGE'
  | 'INSUFFICIENT_DATA';

export type CommercialExecutionEventType =
  | 'cycle_created'
  | 'cycle_updated'
  | 'cycle_activated'
  | 'cycle_completed'
  | 'cycle_archived'
  | 'action_added'
  | 'action_updated'
  | 'action_ready'
  | 'action_started'
  | 'action_blocked'
  | 'action_unblocked'
  | 'action_completed'
  | 'action_cancelled'
  | 'impact_recalculated';

/**
 * Impacto esperado estimado para uma ação comercial
 */
export interface CommercialActionExpectedImpact {
  revenueImpact?: number;
  ordersImpact?: number;
  unitsImpact?: number;
  averageTicketImpact?: number;
  contributionMarginImpact?: number;
  operatingProfitImpact?: number;
  marketingSpendImpact?: number;
}

/**
 * Impacto real calculado pelo backend quando houver dados suficientes
 */
export interface CommercialActionActualImpact {
  revenue?: number;
  orders?: number;
  units?: number;
  averageTicket?: number;
  contributionMargin?: number;
  operatingProfit?: number;
  costCoveragePercent?: number;
  comparisonWindowStart?: string;
  comparisonWindowEnd?: string;
  calculationMethod?: string;
  confidence?: 'high' | 'medium' | 'low' | 'insufficient';
  impactAttribution: CommercialImpactAttribution;
  notes?: string;
}

/**
 * Snapshot imutável do Budget congelado no momento da ativação do Ciclo
 */
export interface BudgetExecutionSnapshot {
  budgetId: string;
  budgetVersion: number;
  targetRevenue: number;
  targetContributionMargin: number;
  targetOperatingProfit: number;
  targetUnits: number;
  targetAverageTicket: number;
  lineAllocations: CommercialBudgetLineAllocation[];
  linkedGoalIds: string[];
  capturedAt: string;
}

/**
 * Snapshot imutável de Metas congeladas
 */
export interface GoalExecutionSnapshot {
  goalId: string;
  title: string;
  type: CommercialGoalType;
  targetValue: number;
  period: CommercialGoalPeriod;
  startDate: string;
  endDate: string;
}

/**
 * Entidade Canônica: Ciclo Operacional Comercial (CommercialExecutionCycle)
 */
export interface CommercialExecutionCycle {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  budgetId: string;
  linkedGoalIds: string[];
  linkedForecastId?: string;
  status: CommercialExecutionStatus;
  
  version: number;
  
  budgetExecutionSnapshot?: BudgetExecutionSnapshot;
  goalExecutionSnapshots?: GoalExecutionSnapshot[];
  
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  
  activatedAt?: string;
  activatedBy?: string;
  
  completedAt?: string;
  completedBy?: string;
  
  archivedAt?: string;
  archivedBy?: string;
  
  updatedAt?: string;
  notes?: string;
}

/**
 * Item de Ação dentro do Ciclo de Execução (Evolução Canônica da CommercialAction)
 */
export interface CommercialExecutionActionItem extends Partial<CommercialAction> {
  id: string;
  executionCycleId: string;
  budgetId?: string;
  goalIds?: string[];
  forecastId?: string;
  
  productLine?: CommercialProductLine;
  
  title: string;
  description: string;
  
  ownerUid?: string;
  ownerName?: string;
  
  priority: CommercialActionPriority;
  executionStatus: CommercialActionExecutionStatus;
  
  plannedStartDate: string;
  plannedEndDate: string;
  
  actualStartDate?: string;
  actualCompletedAt?: string;
  
  expectedImpact?: CommercialActionExpectedImpact;
  actualImpact?: CommercialActionActualImpact;
  
  completionPercent: number; // 0 a 100
  
  blockingReason?: string;
  executionNotes?: string;
  
  sourceRecommendationId?: string;
  sourceRecommendationSnapshot?: any;
  
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

/**
 * Progresso de Execução das Ações do Ciclo
 */
export interface CommercialExecutionProgress {
  totalActions: number;
  plannedActions: number;
  readyActions: number;
  inProgressActions: number;
  blockedActions: number;
  completedActions: number;
  cancelledActions: number;
  completionPercent: number;
  overdueActions: number;
  criticalBlockedActions: number;
}

/**
 * Comparativo Temporal Canônico de Orçamento/Metas vs Real vs Forecast
 */
export interface CommercialMetricExecutionProgress {
  metric: 'revenue' | 'units' | 'averageTicket' | 'contributionMargin' | 'operatingProfit';
  budgetTarget: number;
  actualToDate: number;
  expectedToDate: number;
  forecast: number;
  goalTarget: number;
  varianceToBudget: number;
  varianceToExpected: number;
  varianceToExpectedPercent: number;
  gapToGoal: number;
}

/**
 * Saúde Operacional do Ciclo Comercial
 */
export interface CommercialExecutionHealth {
  status: CommercialExecutionHealthStatus;
  reasons: string[];
  signals: Array<{
    name: string;
    level: 'ok' | 'warning' | 'critical';
    description: string;
  }>;
}

/**
 * Alerta Operacional Canônico
 */
export interface CommercialExecutionAlert {
  code: CommercialExecutionAlertCode;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  actionId?: string;
  metric?: string;
  timestamp: string;
}

/**
 * Priorização Canônica de Ação Comercial
 */
export interface CommercialActionPrioritization {
  actionId: string;
  priorityScore: number;
  priorityBand: 'critical' | 'high' | 'medium' | 'low';
  reasons: string[];
}

/**
 * Dashboard Agregado Server-Side do Ciclo Comercial
 */
export interface CommercialExecutionDashboard {
  cycle: CommercialExecutionCycle;
  progress: CommercialExecutionProgress;
  health: CommercialExecutionHealth;
  alerts: CommercialExecutionAlert[];
  budgetExecution: {
    revenue: CommercialMetricExecutionProgress;
    units: CommercialMetricExecutionProgress;
    averageTicket: CommercialMetricExecutionProgress;
    contributionMargin: CommercialMetricExecutionProgress;
    operatingProfit: CommercialMetricExecutionProgress;
    timeProgressPercent: number;
    daysElapsed: number;
    totalDays: number;
  };
  actions: CommercialExecutionActionItem[];
  prioritizedActions: CommercialActionPrioritization[];
  linePerformance?: Record<string, {
    line: string;
    targetRevenue: number;
    actualRevenue: number;
    targetUnits: number;
    actualUnits: number;
    targetContributionMargin: number;
    actualContributionMargin: number;
  }>;
  calculatedAt: string;
}

/**
 * Evento de Auditoria Append-Only (commercial_execution_events)
 */
export interface CommercialExecutionEvent {
  id: string;
  executionCycleId: string;
  actionId?: string;
  eventType: CommercialExecutionEventType;
  actorUid: string;
  actorEmail?: string;
  actorName?: string;
  timestamp: string;
  before?: any;
  after?: any;
  idempotencyKeyHash?: string;
  metadata?: Record<string, any>;
}

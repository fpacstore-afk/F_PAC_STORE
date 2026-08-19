/**
 * CONTRATOS CANÔNICOS DE GOVERNANÇA COMERCIAL
 * FASE 9.6.4 — FPAC Store
 *
 * Módulo de tipos fechados para Ações Comerciais, Eventos Imutáveis e Metas Persistentes.
 */

export type CommercialActionType =
  | 'review_price'
  | 'review_cost'
  | 'review_shipping'
  | 'review_gateway'
  | 'review_discount'
  | 'review_promotion'
  | 'improve_margin'
  | 'register_cost'
  | 'review_product'
  | 'review_line'
  | 'break_even_plan'
  | 'profit_target_plan'
  | 'custom';

export type CommercialActionStatus =
  | 'draft'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'dismissed'
  | 'cancelled'
  | 'expired';

export type CommercialActionPriority = 'low' | 'medium' | 'high' | 'critical';

export type CommercialActionResultClassification =
  | 'successful'
  | 'partially_successful'
  | 'unsuccessful'
  | 'not_measurable';

export type CommercialActionEventType =
  | 'created'
  | 'approved'
  | 'started'
  | 'completed'
  | 'dismissed'
  | 'cancelled'
  | 'note_added'
  | 'due_date_changed';

export type CommercialGoalType =
  | 'revenue'
  | 'operating_profit'
  | 'contribution_margin'
  | 'units'
  | 'average_ticket';

export type CommercialGoalPeriod = 'monthly' | 'quarterly' | 'yearly' | 'custom';

export type CommercialGoalStatus = 'active' | 'achieved' | 'missed' | 'cancelled';

/**
 * Snapshot histórico imutável capturado no momento em que a recomendação é convertida em Ação Comercial
 */
export interface CommercialActionSourceSnapshot {
  isHistoricalSnapshot: true;
  snapshotCapturedAt: string;
  snapshotVersion: string;
  recommendationType?: string;
  reasonCodes?: string[];
  confidence?: 'high' | 'medium' | 'low' | 'insufficient';
  isEstimated?: boolean;
  
  // Métricas na criação (auditável / imutável)
  currentPrice?: number;
  minimumPrice?: number;
  targetPrice?: number;
  unitCost?: number;
  costSource?: string;
  costCoveragePercent?: number;
  unitsSold?: number;
  grossRevenue?: number;
  netRevenue?: number;
  cogs?: number;
  grossProfit?: number;
  marginPercent?: number;
  contributionMargin?: number;
  contributionMarginPercent?: number;
  shippingSubsidy?: number;
  gatewayFees?: number;
}

/**
 * Contrato Canônico de Ação Comercial (CommercialAction)
 */
export interface CommercialAction {
  id: string;
  recommendationId?: string;
  recommendationFingerprint?: string;
  type: CommercialActionType;
  entityType: 'product' | 'line' | 'store' | 'shipping' | 'gateway' | 'custom' | 'category';
  entityId?: string;
  entityName?: string;
  title: string;
  description: string;
  status: CommercialActionStatus;
  priority: CommercialActionPriority;
  source: 'commercial_intelligence' | 'manual';
  
  // Rastreamento e Auditoria
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  
  approvedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  
  startedAt?: string;
  startedBy?: string;
  startedByName?: string;
  
  completedAt?: string;
  completedBy?: string;
  completedByName?: string;
  resultNote?: string;
  resultClassification?: CommercialActionResultClassification;
  
  dismissedAt?: string;
  dismissedBy?: string;
  dismissedByName?: string;
  dismissReason?: string;
  
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledByName?: string;
  cancelReason?: string;
  
  dueDate?: string;
  assignedTo?: string;
  assignedToName?: string;
  notes?: string;
  
  // Snapshot imutável
  sourceSnapshot: CommercialActionSourceSnapshot;
  
  // Campos de Execução Comercial (FASE 9.6.7)
  executionCycleId?: string;
  executionStatus?: 'planned' | 'ready' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  budgetId?: string;
  goalIds?: string[];
  forecastId?: string;
  productLine?: 'FORCE' | 'MARK' | 'PRIME' | 'OTHER' | 'ALL';
  ownerUid?: string;
  ownerName?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualCompletedAt?: string;
  expectedImpact?: any;
  actualImpact?: any;
  completionPercent?: number;
  blockingReason?: string;
  executionNotes?: string;
  sourceRecommendationId?: string;
  sourceRecommendationSnapshot?: any;

  updatedAt?: string;
}

/**
 * Contrato Canônico de Evento de Ação Comercial (Audit Trail Append-Only)
 */
export interface CommercialActionEvent {
  id: string;
  actionId: string;
  eventType: CommercialActionEventType;
  timestamp: string;
  operatorUid: string;
  operatorEmail: string;
  operatorName?: string;
  fromStatus?: CommercialActionStatus;
  toStatus?: CommercialActionStatus;
  note?: string;
  reason?: string;
  metadata?: Record<string, any>;
  idempotencyKeyHash?: string;
}

/**
 * Contrato Canônico de Meta Comercial Persistente (CommercialGoal)
 */
export interface CommercialGoal {
  id: string;
  title: string;
  type: CommercialGoalType;
  targetValue: number;
  startDate: string;
  endDate: string;
  period: CommercialGoalPeriod;
  status: CommercialGoalStatus;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}

/**
 * Resultado da avaliação de progresso de meta (Função read-only sem alteração no motor)
 */
export interface CommercialGoalEvaluation {
  goalId: string;
  type: CommercialGoalType;
  targetValue: number;
  currentValue: number;
  progressPercent: number;
  remainingValue: number;
  calculatedStatus: 'on_track' | 'achieved' | 'behind' | 'missed';
  isMathematicallyAchieved: boolean;
  isOverdue: boolean;
}

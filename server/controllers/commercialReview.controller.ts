/**
 * Controller Oficial para Pós-Mortem Comercial, Eficácia de Ações e Aprendizado Contínuo (FASE 9.6.8 / FASE 9.6.8-B Hardened)
 * FPAC Store — Sistema de Inteligência & Execução Comercial
 *
 * REGRAS DE SEGURANÇA E ARQUITETURA (FASE 9.6.8-B):
 * 1. NENHUMA mutação operacional automática (sem alteração de preços, estoques, orçamentos, pedidos).
 * 2. Source Cycle DEVE ser 'completed' ou 'archived' (409 EXECUTION_CYCLE_NOT_COMPLETED).
 * 3. Review Único por cycleId:version através de identidade e lock determinístico SHA256 (multi-instance safe).
 * 4. Imutabilidade absoluta após 'approved' ou 'archived' (409 REVIEW_IMMUTABLE).
 * 5. Reutilização estrita dos motores financeiros canônicos certificados (sem fórmulas paralelas).
 * 6. Idempotência atômica com verificação e gravação dentro de transação Firestore.
 * 7. Insight -> Action exclusivamente com targetCycleId obrigatório válido e não-imutável.
 * 8. Review approved permanece 100% inalterado (SHA256 outcomeSnapshot idêntico) ao converter insights.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../firebase.js';
import { logger } from '../utils/logger.js';
import { fetchCommercialDataset } from '../utils/commercialDataset.js';
import {
  CommercialExecutionReview,
  CommercialExecutionReviewStatus,
  CommercialExecutionOutcomeSnapshot,
  CommercialActionEffectiveness,
  CommercialLineOutcome,
  CommercialReviewEventType
} from '../../src/types/commercialReview.js';
import {
  CommercialAction,
  CommercialActionType,
  CommercialActionSourceSnapshot
} from '../../src/types/commercialGovernance.js';
import {
  calculateRevenueVarianceBridge,
  compareMetricBudgetVsActual,
  compareGoalVsActual,
  calibrateForecastVsActual,
  evaluateActionEffectiveness,
  generateCommercialLearningInsights,
  calculateHistoricalLearningSummary
} from '../../src/utils/commercialReview.js';
import { calculateBudgetCurrentActuals } from '../../src/utils/commercialBudget.js';
import {
  calculateFinancialDRE,
  calculateProductProfitability,
  calculateOrderProfitability
} from '../../src/utils/orderFinancial.js';
import { aggregateProfitabilityByLine } from '../../src/utils/profitability.js';
import { roundMoney, roundPercent } from '../../src/config/financialDefaults.js';

// ==========================================
// DB INJECTION FOR TESTING
// ==========================================

let customDb: any = null;

export function setCommercialReviewDb(db: any) {
  customDb = db;
}

export function resetCommercialReviewDb() {
  customDb = null;
}

function resolveDb() {
  if (customDb) return customDb;
  return getDb();
}

// ==========================================
// CANONICAL IDEMPOTENCY & FINGERPRINT
// ==========================================

export function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

export function computeCanonicalIdempotencyKey(params: {
  actorUid: string;
  method: string;
  operationScope: string;
  idempotencyKey: string;
}): string {
  const normActor = (params.actorUid || 'system_admin').trim();
  const normMethod = (params.method || 'POST').trim().toUpperCase();
  const normScope = (params.operationScope || '').trim().toLowerCase();
  const normKey = (params.idempotencyKey || '').trim();
  const rawIdentity = `${normActor}:${normMethod}:${normScope}:${normKey}`;
  return crypto.createHash('sha256').update(rawIdentity).digest('hex');
}

export function stableCanonicalize(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    const items = value.map(item => stableCanonicalize(item));
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
      .filter(k => k !== 'idempotencyKey' && k !== 'idempotency_key' && value[k] !== undefined)
      .sort();
    const parts = keys.map(k => `${JSON.stringify(k)}:${stableCanonicalize(value[k])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(String(value));
}

export function computePayloadFingerprint(payload: any): string {
  if (!payload || typeof payload !== 'object') {
    return crypto.createHash('sha256').update(String(payload ?? '')).digest('hex');
  }
  const canonical = stableCanonicalize(payload);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function computeCanonicalOperationFingerprint(params: {
  method: string;
  operationScope: string;
  routeParams?: Record<string, any>;
  body?: any;
}): string {
  const normMethod = (params.method || 'POST').trim().toUpperCase();
  const normScope = (params.operationScope || '').trim().toLowerCase();
  const normParams = stableCanonicalize(params.routeParams || {});
  const normBody = stableCanonicalize(params.body || {});
  const combined = `method=${normMethod}|scope=${normScope}|params=${normParams}|body=${normBody}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

function getIdempotencyKey(req: Request): string | null {
  const headerKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  if (typeof headerKey === 'string' && headerKey.trim().length > 0) return headerKey.trim();
  if (Array.isArray(headerKey) && headerKey.length > 0 && typeof headerKey[0] === 'string') return headerKey[0].trim();
  if (req.body && typeof req.body.idempotencyKey === 'string' && req.body.idempotencyKey.trim().length > 0) return req.body.idempotencyKey.trim();
  return null;
}

export function cleanUndefined<T = any>(obj: T): T {
  if (obj === undefined) return null as any;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined) as any;
  }
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = cleanUndefined(value);
    }
  }
  return result;
}

function sanitizeEventPayload(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload ?? null;
  const sanitized = { ...payload };
  const forbiddenKeys = ['authorization', 'cookie', 'token', 'apiKey', 'password', 'secret', 'key'];
  for (const k of Object.keys(sanitized)) {
    if (sanitized[k] === undefined) {
      delete sanitized[k];
    } else if (forbiddenKeys.some(fk => k.toLowerCase().includes(fk))) {
      delete sanitized[k];
    } else if (typeof sanitized[k] === 'object' && sanitized[k] !== null) {
      sanitized[k] = sanitizeEventPayload(sanitized[k]);
    }
  }
  return cleanUndefined(sanitized);
}

async function recordReviewEvent(
  db: any,
  tx: any,
  params: {
    reviewId: string;
    eventType: CommercialReviewEventType;
    actorUid: string;
    actorEmail?: string;
    before?: any;
    after?: any;
    idempotencyKeyHash?: string;
  }
) {
  const eventId = `rev_ev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const eventRef = db.collection('commercial_execution_review_events').doc(eventId);
  const eventData = {
    id: eventId,
    reviewId: params.reviewId,
    eventType: params.eventType,
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    timestamp: new Date().toISOString(),
    before: sanitizeEventPayload(params.before),
    after: sanitizeEventPayload(params.after),
    idempotencyKeyHash: params.idempotencyKeyHash
  };

  if (tx && typeof tx.set === 'function') {
    tx.set(eventRef, eventData);
  } else {
    await eventRef.set(eventData);
  }
}

// ==========================================
// CORE COMPUTATION HELPER
// ==========================================

async function computeReviewOutcomeSnapshot(params: {
  db: any;
  cycle: any;
  budget?: any;
  forecast?: any;
  goals: any[];
  actions: any[];
  reviewId: string;
  forecastMismatchReason?: string;
}): Promise<CommercialExecutionOutcomeSnapshot> {
  const { db, cycle, budget, forecast, goals, actions, reviewId, forecastMismatchReason } = params;
  const startDate = cycle.periodStart;
  const endDate = cycle.periodEnd;

  // 1. Buscar dataset comercial consolidado
  const dataset = await fetchCommercialDataset(db, startDate, endDate);

  // 2. Calcular Actuals canônicos via DRE e motor de rentabilidade
  const dre = calculateFinancialDRE(
    dataset.orders,
    dataset.expenses,
    dataset.investments,
    dataset.traffic,
    dataset.products
  );

  const budgetActuals = calculateBudgetCurrentActuals({
    orders: dataset.orders,
    expenses: dataset.expenses,
    investments: dataset.investments,
    traffic: dataset.traffic,
    productCatalog: dataset.products,
    budgetStartDate: startDate,
    budgetEndDate: endDate,
    asOfDate: endDate
  });

  const productsProf = calculateProductProfitability(dataset.orders, dataset.products);
  const orderProfs = dataset.orders.map((o: any) => calculateOrderProfitability(o, dataset.products));
  const lineAggregates = aggregateProfitabilityByLine(productsProf, orderProfs);

  // Cobertura de custo global
  const totalUnits = dataset.orders.reduce((acc: number, o: any) => acc + (o.items?.reduce((iAcc: number, item: any) => iAcc + (item.quantity || 1), 0) || 1), 0) || 1;
  const completeCostUnits = orderProfs.reduce((acc: number, op: any) => acc + (op.costCoveragePercent >= 99.9 ? op.unitsSold || 1 : 0), 0);
  const costCoveragePercent = roundPercent((completeCostUnits / totalUnits) * 100);

  const hasApprovedBudget = !!budget?.approvedSnapshot;
  const budgetSnapshotSource: 'approved_snapshot' | 'fallback_unapproved' | 'none' = hasApprovedBudget
    ? 'approved_snapshot'
    : (budget ? 'fallback_unapproved' : 'none');
  const budgetSnapshotMissingReason = !hasApprovedBudget && budget ? 'APPROVED_BUDGET_SNAPSHOT_MISSING' : undefined;

  let overallConfidence: CommercialExecutionOutcomeSnapshot['confidence'] = 'high';
  if (costCoveragePercent < 60) overallConfidence = 'insufficient';
  else if (costCoveragePercent < 90) overallConfidence = 'medium';

  // Governança de completude de fontes (Source Completeness)
  if (!hasApprovedBudget && budget && overallConfidence === 'high') {
    overallConfidence = 'medium';
  }

  if (forecastMismatchReason) {
    overallConfidence = 'insufficient';
  } else if (cycle.linkedForecastId && !forecast && overallConfidence === 'high') {
    overallConfidence = 'medium';
  }

  // Progresso temporal e validação estrita de datas
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const isValidPeriod = !isNaN(startMs) && !isNaN(endMs) && endMs >= startMs;
  const totalDays = isValidPeriod ? Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1) : 0;
  const timeElapsedDays = isValidPeriod ? totalDays : 0;

  if (!isValidPeriod) {
    overallConfidence = 'insufficient';
  }

  // 3. Final Actuals
  const finalActuals: CommercialExecutionOutcomeSnapshot['finalActuals'] = {
    revenue: budgetActuals.revenue ?? dre.netReceived ?? 0,
    orders: budgetActuals.ordersCount ?? dre.totalValidOrders ?? 0,
    units: budgetActuals.units ?? totalUnits,
    averageTicket: budgetActuals.averageTicket ?? dre.averageTicket ?? 0,
    cogs: budgetActuals.cogs ?? dre.cogs ?? 0,
    gatewayFees: budgetActuals.gatewayFees ?? dre.variableExpenses ?? 0,
    shippingSubsidy: budgetActuals.shippingSubsidy ?? 0,
    otherVariableCosts: budgetActuals.administrativeVariableExpenses ?? 0,
    contributionMargin: budgetActuals.contributionMargin ?? dre.contributionMargin ?? 0,
    contributionMarginPercent: budgetActuals.contributionMarginPercent ?? dre.contributionMarginPercent ?? 0,
    marketingSpend: budgetActuals.trafficExpenses ?? dre.marketingExpenses ?? 0,
    fixedExpenses: budgetActuals.fixedExpenses ?? dre.fixedExpenses ?? 0,
    otherExpenses: budgetActuals.otherExpenses ?? dre.otherExpenses ?? 0,
    operatingProfit: budgetActuals.operatingProfit ?? dre.operatingProfit ?? 0,
    operatingProfitPercent: budgetActuals.operatingProfitPercent ?? dre.operatingMarginPercent ?? 0,
    costCoveragePercent,
    confidence: overallConfidence
  };

  // 4. Comparações de Budget vs Actual
  // REQUISITO CANÔNICO: Usar prioritariamente budget.approvedSnapshot para targets e alocações
  const approvedSnapshot = budget?.approvedSnapshot;
  const allocations = approvedSnapshot?.allocations ?? budget?.allocations;

  const targetRevenue = approvedSnapshot?.targetRevenue !== undefined 
    ? roundMoney(Number(approvedSnapshot.targetRevenue)) 
    : (budget?.targetRevenue !== undefined ? roundMoney(Number(budget.targetRevenue)) : undefined);
  const targetOrders = approvedSnapshot?.targetOrders !== undefined 
    ? Math.max(0, Number(approvedSnapshot.targetOrders)) 
    : (budget?.targetOrders !== undefined ? Math.max(0, Number(budget.targetOrders)) : undefined);
  const targetUnits = approvedSnapshot?.targetUnits !== undefined 
    ? Math.max(0, Number(approvedSnapshot.targetUnits)) 
    : (budget?.targetUnits !== undefined ? Math.max(0, Number(budget.targetUnits)) : undefined);
  const targetAverageTicket = approvedSnapshot?.targetAverageTicket !== undefined 
    ? roundMoney(Number(approvedSnapshot.targetAverageTicket)) 
    : (budget?.targetAverageTicket !== undefined 
      ? roundMoney(Number(budget.targetAverageTicket)) 
      : (targetRevenue !== undefined && targetOrders !== undefined && targetOrders > 0 ? roundMoney(targetRevenue / targetOrders) : undefined));
  const targetContributionMargin = approvedSnapshot?.targetContributionMargin !== undefined 
    ? roundMoney(Number(approvedSnapshot.targetContributionMargin)) 
    : (budget?.targetContributionMargin !== undefined ? roundMoney(Number(budget.targetContributionMargin)) : undefined);
  const targetOperatingProfit = approvedSnapshot?.targetOperatingProfit !== undefined 
    ? roundMoney(Number(approvedSnapshot.targetOperatingProfit)) 
    : (budget?.targetOperatingProfit !== undefined ? roundMoney(Number(budget.targetOperatingProfit)) : undefined);

  // REQUISITO CANÔNICO: Despesas obtidas exclusivamente de allocations (cogsBudget, gatewayFeesBudget, shippingSubsidyBudget, trafficBudget/marketingBudget, fixedExpensesBudget)
  const targetCogs = allocations?.cogsBudget !== undefined ? roundMoney(Number(allocations.cogsBudget)) : undefined;
  const targetGatewayFees = allocations?.gatewayFeesBudget !== undefined ? roundMoney(Number(allocations.gatewayFeesBudget)) : undefined;
  const targetShippingSubsidy = allocations?.shippingSubsidyBudget !== undefined ? roundMoney(Number(allocations.shippingSubsidyBudget)) : undefined;
  const targetMarketingInvestment = allocations?.trafficBudget !== undefined 
    ? roundMoney(Number(allocations.trafficBudget)) 
    : (allocations?.marketingBudget !== undefined ? roundMoney(Number(allocations.marketingBudget)) : undefined);
  const targetFixedExpenses = allocations?.fixedExpensesBudget !== undefined ? roundMoney(Number(allocations.fixedExpensesBudget)) : undefined;

  const budgetComparisons: CommercialExecutionOutcomeSnapshot['budgetComparisons'] = {
    revenue: compareMetricBudgetVsActual(targetRevenue, finalActuals.revenue, false),
    orders: compareMetricBudgetVsActual(targetOrders, finalActuals.orders, false),
    units: compareMetricBudgetVsActual(targetUnits, finalActuals.units, false),
    averageTicket: compareMetricBudgetVsActual(targetAverageTicket, finalActuals.averageTicket, false),
    cogs: compareMetricBudgetVsActual(targetCogs, finalActuals.cogs, true),
    gatewayFees: compareMetricBudgetVsActual(targetGatewayFees, finalActuals.gatewayFees, true),
    shippingSubsidy: compareMetricBudgetVsActual(targetShippingSubsidy, finalActuals.shippingSubsidy, true),
    marketingSpend: compareMetricBudgetVsActual(targetMarketingInvestment, finalActuals.marketingSpend, true),
    contributionMargin: compareMetricBudgetVsActual(targetContributionMargin, finalActuals.contributionMargin, false),
    operatingProfit: compareMetricBudgetVsActual(targetOperatingProfit, finalActuals.operatingProfit, false)
  };

  // 5. Linhas de Produto (FORCE, MARK, PRIME, OTHER) com contagem real de pedidos
  const lineOrdersCount: Record<string, Set<string>> = {
    FORCE: new Set(),
    MARK: new Set(),
    PRIME: new Set(),
    OTHER: new Set()
  };
  for (const order of dataset.orders) {
    const orderId = order.id || order.orderId || Math.random().toString();
    for (const item of order.items || []) {
      const prod = dataset.products.find((p: any) => p.id === item.productId || p.sku === item.sku);
      const rawLine = prod?.productLine || prod?.line || item.line || 'OTHER';
      const normLine = ['FORCE', 'MARK', 'PRIME'].includes(String(rawLine).toUpperCase()) ? String(rawLine).toUpperCase() : 'OTHER';
      lineOrdersCount[normLine].add(orderId);
    }
  }

  const lineOutcomes: CommercialLineOutcome[] = lineAggregates.map(l => ({
    line: l.lineName,
    revenue: l.netRevenue,
    orders: lineOrdersCount[l.lineName]?.size ?? 0,
    units: l.unitsSold,
    cogs: l.cogs,
    contributionMargin: l.contributionMargin,
    contributionMarginPercent: l.contributionMarginPercent,
    shareOfRevenuePercent: finalActuals.revenue > 0 ? roundPercent((l.netRevenue / finalActuals.revenue) * 100) : 0,
    costCoveragePercent: l.costCoverage,
    confidence: l.costCoverage >= 90 ? 'high' : (l.costCoverage >= 60 ? 'medium' : 'insufficient')
  }));

  // 6. Variance Bridge de Receita (cent-exact)
  const varianceBridge = calculateRevenueVarianceBridge({
    budgetRevenue: targetRevenue,
    budgetOrders: targetOrders,
    budgetAverageTicket: targetAverageTicket,
    actualRevenue: finalActuals.revenue,
    actualOrders: finalActuals.orders,
    actualAverageTicket: finalActuals.averageTicket,
    budgetCogs: targetCogs,
    actualCogs: finalActuals.cogs,
    budgetGateway: targetGatewayFees,
    actualGateway: finalActuals.gatewayFees,
    budgetShipping: targetShippingSubsidy,
    actualShipping: finalActuals.shippingSubsidy,
    budgetMarketing: targetMarketingInvestment,
    actualMarketing: finalActuals.marketingSpend,
    budgetFixedExpenses: targetFixedExpenses,
    actualFixedExpenses: finalActuals.fixedExpenses
  });

  // 7. Calibração de Forecast
  let forecastCalibration: CommercialExecutionOutcomeSnapshot['forecastCalibration'] = undefined;
  if (forecast) {
    forecastCalibration = calibrateForecastVsActual({
      forecastId: forecast.id,
      forecastTitle: forecast.title,
      forecastRevenue: forecast.projectedRevenue || forecast.expectedRevenue || 0,
      actualRevenue: finalActuals.revenue,
      forecastOrders: forecast.projectedOrders || forecast.expectedOrders || 0,
      actualOrders: finalActuals.orders,
      forecastUnits: forecast.projectedUnits || forecast.expectedUnits || 0,
      actualUnits: finalActuals.units,
      forecastAverageTicket: forecast.projectedAverageTicket || (forecast.projectedOrders > 0 ? forecast.projectedRevenue / forecast.projectedOrders : 0),
      actualAverageTicket: finalActuals.averageTicket,
      forecastContributionMargin: forecast.projectedContributionMargin,
      actualContributionMargin: finalActuals.contributionMargin,
      forecastOperatingProfit: forecast.projectedOperatingProfit,
      actualOperatingProfit: finalActuals.operatingProfit
    });
  }

  // 8. Comparação de Metas Comerciais (Goal Comparisons)
  const goalComparisons = (goals || []).map((g: any) => compareGoalVsActual(g, finalActuals));

  // 9. Avaliação de Ações Comerciais
  const actionEffectivenessList: CommercialActionEffectiveness[] = (actions || []).map(evaluateActionEffectiveness);

  const completedActions = actionEffectivenessList.filter(a => a.executionStatus === 'completed');
  const cancelledActions = actionEffectivenessList.filter(a => a.executionStatus === 'cancelled');
  const blockedActions = actionEffectivenessList.filter(a => a.executionStatus === 'blocked');
  const criticalActions = actionEffectivenessList.filter(a => a.priority === 'critical' || a.priority === 'high');
  const criticalCompleted = criticalActions.filter(a => a.executionStatus === 'completed');
  const criticalFailedOrBlocked = criticalActions.filter(a => a.executionStatus === 'blocked' || a.executionStatus === 'cancelled');

  const overdueAtEnd = actionEffectivenessList.filter(a =>
    a.executionStatus !== 'completed' &&
    a.executionStatus !== 'cancelled' &&
    ((a as any).plannedEndDate ? (a as any).plannedEndDate < endDate : false)
  ).length;

  const exceededCount = completedActions.filter(a => a.effectivenessStatus === 'exceeded').length;
  const metCount = completedActions.filter(a => a.effectivenessStatus === 'met').length;
  const belowExpectedCount = completedActions.filter(a => a.effectivenessStatus === 'below_expected').length;
  const insufficientCount = completedActions.filter(a => a.effectivenessStatus === 'insufficient').length;

  const directCompleted = completedActions.filter(a => a.impactAttribution === 'direct');
  const directSuccess = directCompleted.filter(a => a.effectivenessStatus === 'exceeded' || a.effectivenessStatus === 'met').length;
  const directActionEffectivenessRate = directCompleted.length > 0 ? roundPercent((directSuccess / directCompleted.length) * 100) : 0;

  const directAttributedRevenue = directCompleted.reduce((acc, a) => acc + a.actualRevenue, 0);
  const correlatedAttributedRevenue = completedActions
    .filter(a => a.impactAttribution === 'correlated')
    .reduce((acc, a) => acc + a.actualRevenue, 0);

  const actionEffectivenessSummary: CommercialExecutionOutcomeSnapshot['actionEffectivenessSummary'] = {
    totalActions: actions.length,
    completedActions: completedActions.length,
    cancelledActions: cancelledActions.length,
    blockedActions: blockedActions.length,
    overdueAtEnd,
    completionRate: actions.length > 0 ? roundPercent((completedActions.length / actions.length) * 100) : 0,
    criticalActionsTotal: criticalActions.length,
    criticalActionsCompleted: criticalCompleted.length,
    criticalActionsFailedOrBlocked: criticalFailedOrBlocked.length,
    exceededCount,
    metCount,
    belowExpectedCount,
    insufficientCount,
    directActionsCompleted: directCompleted.length,
    directActionsSuccess: directSuccess,
    directActionEffectivenessRate,
    directAttributedRevenue,
    correlatedAttributedRevenue
  };

  // 10. Progresso Temporal com validação estrita de período (sem fallback arbitrário de 30 dias)
  const executionProgress: CommercialExecutionOutcomeSnapshot['executionProgress'] = {
    timeElapsedDays,
    totalDays,
    timeProgressPercent: isValidPeriod ? 100 : 0,
    averageWeightedActionProgress: actionEffectivenessSummary.completionRate,
    reasonCode: !isValidPeriod ? 'INVALID_EXECUTION_PERIOD' : undefined
  };

  // 11. Insights Estruturados com Evidências
  const learningInsights = generateCommercialLearningInsights({
    reviewId,
    varianceBridge,
    budgetComparison: {
      revenue: budgetComparisons.revenue,
      contributionMargin: budgetComparisons.contributionMargin,
      operatingProfit: budgetComparisons.operatingProfit,
      orders: budgetComparisons.orders,
      averageTicket: budgetComparisons.averageTicket
    },
    forecastCalibration,
    lineOutcomes,
    actionEffectivenessList,
    costCoveragePercent,
    overallConfidence
  });

  return {
    executionCycleSnapshot: cycle,
    budgetSnapshot: budget?.approvedSnapshot ?? budget ?? null,
    forecastSnapshot: forecast ?? null,
    goalSnapshots: goals || [],
    goalComparisons,
    finalActuals,
    budgetComparisons,
    lineOutcomes,
    actionEffectivenessSummary,
    executionProgress,
    varianceBridge,
    forecastCalibration,
    learningInsights,
    costCoveragePercent,
    confidence: overallConfidence,
    budgetSnapshotSource,
    budgetSnapshotMissingReason,
    capturedAt: new Date().toISOString()
  };
}

// ==========================================
// CONTROLLERS
// ==========================================

/**
 * GET /api/admin/commercial/reviews
 * Lista reviews com paginação server-side via cursor Firestore.
 */
export async function listCommercialExecutionReviewsController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const status = req.query.status ? String(req.query.status) : null;

    let query: any = db.collection('commercial_execution_reviews');
    if (status) {
      query = query.where('status', '==', status);
    }
    query = query.orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await db.collection('commercial_execution_reviews').doc(cursor).get();
      if (!cursorDoc || !cursorDoc.exists) {
        return res.status(400).json({ error: 'Cursor de paginação inválido', code: 'INVALID_CURSOR' });
      }
      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.limit(limit + 1).get();
    const docs = snapshot.docs.map((d: any) => d.data());

    const hasMore = docs.length > limit;
    const paginated = docs.slice(0, limit);
    const nextCursor = hasMore && paginated.length > 0 ? paginated[paginated.length - 1].id : null;

    return res.status(200).json({
      reviews: paginated,
      pagination: {
        limit,
        hasMore,
        nextCursor
      }
    });
  } catch (error: any) {
    logger.error('❌ [REVIEW-LIST-ERR]', error);
    return res.status(500).json({ error: 'Erro ao listar reviews comerciais' });
  }
}

/**
 * GET /api/admin/commercial/reviews/:id
 */
export async function getCommercialExecutionReviewController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const { id } = req.params;
    const doc = await db.collection('commercial_execution_reviews').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Review comercial não encontrado', code: 'REVIEW_NOT_FOUND' });
    }

    return res.status(200).json({ review: doc.data() });
  } catch (error: any) {
    logger.error('❌ [REVIEW-GET-ERR]', error);
    return res.status(500).json({ error: 'Erro ao buscar review comercial' });
  }
}

/**
 * GET /api/admin/commercial/reviews/:id/dashboard
 */
export async function getCommercialExecutionReviewDashboardController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const { id } = req.params;
    const doc = await db.collection('commercial_execution_reviews').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Review comercial não encontrado', code: 'REVIEW_NOT_FOUND' });
    }

    const review = doc.data() as CommercialExecutionReview;
    return res.status(200).json({
      review,
      dashboard: {
        outcomeSnapshot: review.outcomeSnapshot,
        varianceBridge: review.outcomeSnapshot?.varianceBridge,
        actionEffectiveness: review.outcomeSnapshot?.actionEffectivenessSummary,
        lineOutcomes: review.outcomeSnapshot?.lineOutcomes,
        forecastCalibration: review.outcomeSnapshot?.forecastCalibration,
        learningInsights: review.outcomeSnapshot?.learningInsights,
        goalComparisons: review.outcomeSnapshot?.goalComparisons
      }
    });
  } catch (error: any) {
    logger.error('❌ [REVIEW-DASHBOARD-ERR]', error);
    return res.status(500).json({ error: 'Erro ao carregar dashboard de review' });
  }
}

/**
 * GET /api/admin/commercial/reviews/:id/actions
 * Lista snapshots de ações avaliadas no review com paginação server-side.
 */
export async function listCommercialExecutionReviewActionsController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const { id } = req.params;
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    let query: any = db.collection('commercial_execution_review_actions')
      .where('reviewId', '==', id)
      .orderBy('capturedAt', 'desc');

    if (cursor) {
      const cursorDoc = await db.collection('commercial_execution_review_actions').doc(cursor).get();
      if (!cursorDoc || !cursorDoc.exists) {
        return res.status(400).json({ error: 'Cursor de paginação inválido', code: 'INVALID_CURSOR' });
      }
      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.limit(limit + 1).get();
    const docs = snapshot.docs.map((d: any) => d.data());

    const hasMore = docs.length > limit;
    const paginated = docs.slice(0, limit);
    const nextCursor = hasMore && paginated.length > 0 ? paginated[paginated.length - 1].id : null;

    return res.status(200).json({
      actions: paginated,
      pagination: {
        limit,
        hasMore,
        nextCursor
      },
      total: paginated.length
    });
  } catch (error: any) {
    logger.error('❌ [REVIEW-ACTIONS-ERR]', error);
    return res.status(500).json({ error: 'Erro ao listar ações do review' });
  }
}

/**
 * GET /api/admin/commercial/reviews/:id/events
 * Lista eventos de auditoria do review com paginação server-side.
 */
export async function listCommercialExecutionReviewEventsController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const { id } = req.params;
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    let query: any = db.collection('commercial_execution_review_events')
      .where('reviewId', '==', id)
      .orderBy('timestamp', 'desc');

    if (cursor) {
      const cursorDoc = await db.collection('commercial_execution_review_events').doc(cursor).get();
      if (!cursorDoc || !cursorDoc.exists) {
        return res.status(400).json({ error: 'Cursor de paginação inválido', code: 'INVALID_CURSOR' });
      }
      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.limit(limit + 1).get();
    const docs = snapshot.docs.map((d: any) => d.data());

    const hasMore = docs.length > limit;
    const paginated = docs.slice(0, limit);
    const nextCursor = hasMore && paginated.length > 0 ? paginated[paginated.length - 1].id : null;

    return res.status(200).json({
      events: paginated,
      pagination: {
        limit,
        hasMore,
        nextCursor
      }
    });
  } catch (error: any) {
    logger.error('❌ [REVIEW-EVENTS-ERR]', error);
    return res.status(500).json({ error: 'Erro ao listar eventos do review' });
  }
}

/**
 * POST /api/admin/commercial/reviews
 * Cria um novo Review comercial.
 * REQUISITOS:
 * 1. Idempotency-Key obrigatória.
 * 2. Execution Cycle DEVE estar 'completed' ou 'archived' (409 EXECUTION_CYCLE_NOT_COMPLETED se 'active' ou 'draft').
 * 3. Lock determinístico SHA256 (executionCycleId + ":" + executionCycleVersion) para prevenir reviews duplicados em concorrência.
 * 4. Contrato canônico: cycle.linkedForecastId (proibido cycle.forecastId).
 */
export async function createCommercialExecutionReviewController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }

    const actorUid = (req as any).user?.uid || 'system_admin';
    const actorEmail = (req as any).user?.email;
    const operationScope = 'commercial_review:create';
    const canonicalKeyHash = computeCanonicalIdempotencyKey({
      actorUid,
      method: req.method,
      operationScope,
      idempotencyKey
    });
    const payloadFingerprint = computeCanonicalOperationFingerprint({
      method: req.method,
      operationScope,
      routeParams: {},
      body: req.body
    });

    const { executionCycleId, title, notes } = req.body;
    if (!executionCycleId) {
      return res.status(400).json({ error: 'executionCycleId é obrigatório' });
    }

    const result = await db.runTransaction(async (tx: any) => {
      // 1. Verificar idempotência
      const idempRef = db.collection('idempotency_records').doc(canonicalKeyHash);
      const idempDoc = await tx.get(idempRef);
      if (idempDoc && idempDoc.exists) {
        const idempData = idempDoc.data();
        if (idempData.operationScope !== operationScope || idempData.payloadFingerprint !== payloadFingerprint) {
          throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH', message: 'Chave de idempotência reutilizada com payload divergente' };
        }
        return { status: idempData.statusCode || 200, data: idempData.responseBody, isReplay: true };
      }

      // 2. Buscar Ciclo de Execução
      const cycleRef = db.collection('commercial_execution_cycles').doc(executionCycleId);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc || !cycleDoc.exists) {
        throw { status: 404, code: 'CYCLE_NOT_FOUND', message: 'Ciclo de execução não encontrado' };
      }
      const cycleData = cycleDoc.data();

      // Ciclo deve estar completed ou archived!
      if (cycleData.status !== 'completed' && cycleData.status !== 'archived') {
        throw {
          status: 409,
          code: 'EXECUTION_CYCLE_NOT_COMPLETED',
          message: 'Review comercial somente pode ser criado para ciclo concluído (completed) ou arquivado (archived).'
        };
      }

      const cycleVersion = cycleData.version || 1;
      const deterministicLockKey = `rev_lock_${crypto.createHash('sha256').update(`${executionCycleId}:${cycleVersion}`).digest('hex')}`;
      const lockRef = db.collection('commercial_review_cycle_locks').doc(deterministicLockKey);
      const lockDoc = await tx.get(lockRef);

      if (lockDoc && lockDoc.exists) {
        const existingReviewId = lockDoc.data().reviewId;
        const existingReviewDoc = await tx.get(db.collection('commercial_execution_reviews').doc(existingReviewId));
        if (existingReviewDoc && existingReviewDoc.exists) {
          const responseBody = { review: existingReviewDoc.data() };
          tx.set(idempRef, {
            idempotencyKeyHash: hashKey(idempotencyKey),
            keyHash: canonicalKeyHash,
            payloadFingerprint,
            operationScope,
            endpoint: '/api/admin/commercial/reviews',
            statusCode: 200,
            responseBody,
            createdAt: new Date().toISOString(),
            actorUid
          });
          return { status: 200, data: responseBody, isReplay: true };
        }
      }

      // 3. Criar Review
      const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const reviewRef = db.collection('commercial_execution_reviews').doc(reviewId);

      const reviewData: CommercialExecutionReview = cleanUndefined({
        id: reviewId,
        executionCycleId,
        executionCycleVersion: cycleVersion,
        title: title || `Review Comercial - ${cycleData.title || cycleData.periodStart}`,
        periodStart: cycleData.periodStart,
        periodEnd: cycleData.periodEnd,
        budgetId: cycleData.budgetId || null,
        linkedForecastId: cycleData.linkedForecastId || null,
        forecastId: cycleData.linkedForecastId || null,
        linkedGoalIds: cycleData.linkedGoalIds || [],
        status: 'draft',
        analysisVersion: 1,
        createdAt: new Date().toISOString(),
        createdBy: actorUid,
        notes: notes || null,
        deterministicKey: deterministicLockKey
      });

      tx.set(reviewRef, reviewData);
      tx.set(lockRef, {
        id: deterministicLockKey,
        reviewId,
        executionCycleId,
        executionCycleVersion: cycleVersion,
        createdAt: new Date().toISOString(),
        actorUid
      });

      // Evento de auditoria
      await recordReviewEvent(db, tx, {
        reviewId,
        eventType: 'review_created',
        actorUid,
        actorEmail,
        after: reviewData,
        idempotencyKeyHash: hashKey(idempotencyKey)
      });

      const responseBody = { review: reviewData };
      tx.set(idempRef, {
        idempotencyKeyHash: hashKey(idempotencyKey),
        keyHash: canonicalKeyHash,
        payloadFingerprint,
        operationScope,
        endpoint: '/api/admin/commercial/reviews',
        statusCode: 201,
        responseBody,
        createdAt: new Date().toISOString(),
        actorUid
      });

      return { status: 201, data: responseBody, isReplay: false };
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    logger.error('❌ [REVIEW-CREATE-ERR]', error?.stack || error?.message || error);
    return res.status(500).json({ error: 'Erro ao criar review comercial', details: error?.message });
  }
}

/**
 * PATCH /api/admin/commercial/reviews/:id
 * Atualiza campos não-estruturais (ex: notes, title).
 * Bloqueado se status for 'approved' ou 'archived' (409 REVIEW_IMMUTABLE).
 */
export async function updateCommercialExecutionReviewController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const { id } = req.params;
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }

    const actorUid = (req as any).user?.uid || 'system_admin';
    const actorEmail = (req as any).user?.email;
    const operationScope = `commercial_review:update:${id}`;
    const canonicalKeyHash = computeCanonicalIdempotencyKey({
      actorUid,
      method: req.method,
      operationScope,
      idempotencyKey
    });
    const payloadFingerprint = computeCanonicalOperationFingerprint({
      method: req.method,
      operationScope,
      routeParams: { id },
      body: req.body
    });

    const result = await db.runTransaction(async (tx: any) => {
      const idempRef = db.collection('idempotency_records').doc(canonicalKeyHash);
      const idempDoc = await tx.get(idempRef);
      if (idempDoc && idempDoc.exists) {
        const idempData = idempDoc.data();
        if (idempData.operationScope !== operationScope || idempData.payloadFingerprint !== payloadFingerprint) {
          throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH', message: 'Chave de idempotência reutilizada com payload divergente' };
        }
        return { status: idempData.statusCode || 200, data: idempData.responseBody, isReplay: true };
      }

      const reviewRef = db.collection('commercial_execution_reviews').doc(id);
      const reviewDoc = await tx.get(reviewRef);
      if (!reviewDoc || !reviewDoc.exists) {
        throw { status: 404, code: 'REVIEW_NOT_FOUND', message: 'Review comercial não encontrado' };
      }
      const reviewData = reviewDoc.data();

      if (reviewData.status === 'approved' || reviewData.status === 'archived') {
        throw { status: 409, code: 'REVIEW_IMMUTABLE', message: 'Review aprovado ou arquivado é estritamente imutável.' };
      }

      const updates: any = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.notes !== undefined) updates.notes = req.body.notes;

      tx.update(reviewRef, updates);

      const updatedData = { ...reviewData, ...updates };
      await recordReviewEvent(db, tx, {
        reviewId: id,
        eventType: 'review_recalculated',
        actorUid,
        actorEmail,
        before: reviewData,
        after: updatedData,
        idempotencyKeyHash: hashKey(idempotencyKey)
      });

      const responseBody = { review: updatedData };
      tx.set(idempRef, {
        idempotencyKeyHash: hashKey(idempotencyKey),
        keyHash: canonicalKeyHash,
        payloadFingerprint,
        operationScope,
        endpoint: `/api/admin/commercial/reviews/${id}`,
        statusCode: 200,
        responseBody,
        createdAt: new Date().toISOString(),
        actorUid
      });

      return { status: 200, data: responseBody, isReplay: false };
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    logger.error('❌ [REVIEW-UPDATE-ERR]', error);
    return res.status(500).json({ error: 'Erro ao atualizar review' });
  }
}

/**
 * POST /api/admin/commercial/reviews/:id/generate
 * Gera a análise pós-mortem, computa snapshot financeiro e passa de 'draft' para 'generated'.
 * REQUISITOS ATÔMICOS:
 * 1. Verificação e persistência de Idempotência 100% dentro da transação Firestore.
 * 2. Se status já for 'generated': 409 REVIEW_ALREADY_GENERATED.
 * 3. Se status for 'approved' ou 'archived': 409 REVIEW_IMMUTABLE.
 * 4. Contrato canônico: cycle.linkedForecastId e cycle.goalExecutionSnapshots.
 */
export async function generateCommercialExecutionReviewController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const { id } = req.params;
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }

    const actorUid = (req as any).user?.uid || 'system_admin';
    const actorEmail = (req as any).user?.email;
    const operationScope = `commercial_review:generate:${id}`;
    const canonicalKeyHash = computeCanonicalIdempotencyKey({
      actorUid,
      method: req.method,
      operationScope,
      idempotencyKey
    });
    const payloadFingerprint = computeCanonicalOperationFingerprint({
      method: req.method,
      operationScope,
      routeParams: { id },
      body: req.body
    });

    const result = await db.runTransaction(async (tx: any) => {
      // 1. Checar idempotência DENTRO da transação
      const idempRef = db.collection('idempotency_records').doc(canonicalKeyHash);
      const existingIdemp = await tx.get(idempRef);
      if (existingIdemp && existingIdemp.exists) {
        const idData = existingIdemp.data();
        if (idData.operationScope !== operationScope || idData.payloadFingerprint !== payloadFingerprint) {
          throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH', message: 'Chave de idempotência reutilizada com payload divergente' };
        }
        return { status: idData.statusCode || 200, data: idData.responseBody, isReplay: true };
      }

      // 2. Buscar Review
      const reviewRef = db.collection('commercial_execution_reviews').doc(id);
      const reviewDoc = await tx.get(reviewRef);
      if (!reviewDoc || !reviewDoc.exists) {
        throw { status: 404, code: 'REVIEW_NOT_FOUND', message: 'Review comercial não encontrado' };
      }
      const reviewData = reviewDoc.data() as CommercialExecutionReview;

      if (reviewData.status === 'approved' || reviewData.status === 'archived') {
        throw { status: 409, code: 'REVIEW_IMMUTABLE', message: 'Review aprovado ou arquivado é estritamente imutável.' };
      }

      if (reviewData.status === 'generated') {
        throw { status: 409, code: 'REVIEW_ALREADY_GENERATED', message: 'Review já gerado. Utilize a operação de recalcular para atualizar um review existente.' };
      }

      // 3. Buscar Ciclo, Budget, Forecast, Goals, Actions
      const cycleRef = db.collection('commercial_execution_cycles').doc(reviewData.executionCycleId);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc || !cycleDoc.exists) {
        throw { status: 404, code: 'CYCLE_NOT_FOUND', message: 'Ciclo de execução vinculado não encontrado' };
      }
      const cycleData = cycleDoc.data();

      let budgetData: any = null;
      if (cycleData.budgetId) {
        const bDoc = await tx.get(db.collection('commercial_budgets').doc(cycleData.budgetId));
        if (bDoc && bDoc.exists) budgetData = bDoc.data();
      }

      // Forecast canônico via cycle.linkedForecastId (sem fallback vivo)
      let forecastData: any = null;
      let forecastMismatchReason: string | undefined = undefined;
      const linkedForecastId = cycleData.linkedForecastId;

      if (linkedForecastId) {
        let candidateForecast: any = null;
        if (budgetData?.approvedSnapshot?.forecastSnapshot) {
          candidateForecast = budgetData.approvedSnapshot.forecastSnapshot;
        } else if (cycleData.budgetExecutionSnapshot?.forecastSnapshot) {
          candidateForecast = cycleData.budgetExecutionSnapshot.forecastSnapshot;
        }

        if (candidateForecast) {
          const candidateId = candidateForecast.forecastId || candidateForecast.id;
          if (candidateId === linkedForecastId) {
            forecastData = candidateForecast;
          } else {
            // Snapshot ID mismatch: não tratar como verdade
            forecastData = null;
            forecastMismatchReason = 'FORECAST_SNAPSHOT_ID_MISMATCH';
          }
        }
      }

      // Metas prioritariamente de cycle.goalExecutionSnapshots
      let goalsData: any[] = [];
      if (cycleData.goalExecutionSnapshots && Array.isArray(cycleData.goalExecutionSnapshots) && cycleData.goalExecutionSnapshots.length > 0) {
        goalsData = cycleData.goalExecutionSnapshots;
      } else if (cycleData.linkedGoalIds && Array.isArray(cycleData.linkedGoalIds) && cycleData.linkedGoalIds.length > 0) {
        for (const gid of cycleData.linkedGoalIds) {
          const gDoc = await tx.get(db.collection('commercial_goals').doc(gid));
          if (gDoc && gDoc.exists) goalsData.push(gDoc.data());
        }
      }

      const actionsSnap = await db.collection('commercial_actions').where('executionCycleId', '==', reviewData.executionCycleId).get();
      const actionsData = actionsSnap.docs.map((d: any) => d.data());

      // 4. Executar motores canônicos
      const outcomeSnapshot = await computeReviewOutcomeSnapshot({
        db,
        cycle: cycleData,
        budget: budgetData,
        forecast: forecastData,
        goals: goalsData,
        actions: actionsData,
        reviewId: id,
        forecastMismatchReason
      });

      const targetRev = budgetData?.approvedSnapshot?.targetRevenue ?? budgetData?.targetRevenue ?? 0;
      const budgetAdherence = outcomeSnapshot.finalActuals.revenue >= targetRev
        ? (outcomeSnapshot.finalActuals.revenue >= targetRev * 1.05 ? 'exceeded' : 'achieved')
        : 'missed';

      const hasApprovedBudget = !!budgetData?.approvedSnapshot;
      const headlineText = hasApprovedBudget
        ? `Ciclo finalizado com R$ ${outcomeSnapshot.finalActuals.revenue.toFixed(2)} (${budgetAdherence === 'achieved' || budgetAdherence === 'exceeded' ? 'Meta batida' : 'Abaixo da meta'}).`
        : `Ciclo finalizado com R$ ${outcomeSnapshot.finalActuals.revenue.toFixed(2)} (Diagnóstico preliminar: ${budgetAdherence === 'achieved' || budgetAdherence === 'exceeded' ? 'aderente ao orçamento preliminar' : 'abaixo do orçamento preliminar'}).`;

      const forecastMape = outcomeSnapshot.forecastCalibration?.meanAbsolutePercentageError;
      const forecastAccuracyRating: CommercialExecutionReview['summary']['forecastAccuracyRating'] =
        !outcomeSnapshot.forecastCalibration || forecastMape === undefined || forecastMape === null
          ? 'insufficient'
          : (forecastMape <= 5 ? 'high' : (forecastMape <= 15 ? 'medium' : 'low'));

      const summary: CommercialExecutionReview['summary'] = {
        headline: headlineText,
        budgetAdherence,
        primaryVarianceDriver: outcomeSnapshot.varianceBridge.drivers[0]?.driver || 'ORDER_VOLUME',
        keyLearning: outcomeSnapshot.learningInsights[0]?.title || 'Aprendizados registrados no relatório.',
        actionEffectivenessRate: outcomeSnapshot.actionEffectivenessSummary.completionRate,
        forecastAccuracyRating
      };

      const updatedReview: CommercialExecutionReview = cleanUndefined({
        ...reviewData,
        status: 'generated',
        generatedAt: new Date().toISOString(),
        generatedBy: actorUid,
        outcomeSnapshot,
        summary
      });

      tx.update(reviewRef, updatedReview);

      // Salvar snapshots de ações
      for (const act of actionsData) {
        const eff = evaluateActionEffectiveness(act);
        const actSnapRef = db.collection('commercial_execution_review_actions').doc(`rev_act_${id}_${act.id}`);
        tx.set(actSnapRef, cleanUndefined({
          id: `rev_act_${id}_${act.id}`,
          reviewId: id,
          actionId: act.id,
          executionCycleId: reviewData.executionCycleId,
          title: act.title,
          priority: act.priority || 'medium',
          productLine: act.productLine || 'ALL',
          channel: act.channel || null,
          owner: act.owner || act.assignedTo || null,
          expectedImpactSnapshot: act.expectedImpact || { revenue: act.targetRevenue || 0, units: act.targetUnits || 0 },
          actualImpactSnapshot: act.actualImpact || {},
          attributionSnapshot: eff.impactAttribution,
          confidenceSnapshot: eff.confidence,
          executionSnapshot: {
            executionStatus: act.executionStatus || act.status,
            progressPercent: act.progressPercent || 0,
            completedAt: act.completedAt || null
          },
          effectivenessResult: eff.effectivenessStatus,
          capturedAt: new Date().toISOString()
        }));
      }

      await recordReviewEvent(db, tx, {
        reviewId: id,
        eventType: 'review_generated',
        actorUid,
        actorEmail,
        before: reviewData,
        after: updatedReview,
        idempotencyKeyHash: hashKey(idempotencyKey)
      });

      const responseBody = { review: updatedReview };
      tx.set(idempRef, {
        idempotencyKeyHash: hashKey(idempotencyKey),
        keyHash: canonicalKeyHash,
        payloadFingerprint,
        operationScope,
        endpoint: `/api/admin/commercial/reviews/${id}/generate`,
        statusCode: 200,
        responseBody,
        createdAt: new Date().toISOString(),
        actorUid
      });

      return { status: 200, data: responseBody, isReplay: false };
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    logger.error('❌ [REVIEW-GENERATE-ERR]', error);
    return res.status(500).json({ error: 'Erro ao gerar review comercial' });
  }
}

/**
 * POST /api/admin/commercial/reviews/:id/recalculate
 * Recalcula o review atualizando o snapshot e incrementando analysisVersion.
 * REQUISITOS ATÔMICOS:
 * 1. Idempotência 100% transacional.
 * 2. Bloqueado se status for 'approved' ou 'archived' (409 REVIEW_IMMUTABLE).
 */
export async function recalculateCommercialExecutionReviewController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const { id } = req.params;
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }

    const actorUid = (req as any).user?.uid || 'system_admin';
    const actorEmail = (req as any).user?.email;
    const operationScope = `commercial_review:recalculate:${id}`;
    const canonicalKeyHash = computeCanonicalIdempotencyKey({
      actorUid,
      method: req.method,
      operationScope,
      idempotencyKey
    });
    const payloadFingerprint = computeCanonicalOperationFingerprint({
      method: req.method,
      operationScope,
      routeParams: { id },
      body: req.body
    });

    const result = await db.runTransaction(async (tx: any) => {
      // 1. Idempotência atômica
      const idempRef = db.collection('idempotency_records').doc(canonicalKeyHash);
      const existingIdemp = await tx.get(idempRef);
      if (existingIdemp && existingIdemp.exists) {
        const idData = existingIdemp.data();
        if (idData.operationScope !== operationScope || idData.payloadFingerprint !== payloadFingerprint) {
          throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH', message: 'Chave de idempotência reutilizada com payload divergente' };
        }
        return { status: idData.statusCode || 200, data: idData.responseBody, isReplay: true };
      }

      const reviewRef = db.collection('commercial_execution_reviews').doc(id);
      const reviewDoc = await tx.get(reviewRef);
      if (!reviewDoc || !reviewDoc.exists) {
        throw { status: 404, code: 'REVIEW_NOT_FOUND', message: 'Review comercial não encontrado' };
      }
      const reviewData = reviewDoc.data() as CommercialExecutionReview;

      if (reviewData.status === 'approved' || reviewData.status === 'archived') {
        throw { status: 409, code: 'REVIEW_IMMUTABLE', message: 'Review aprovado ou arquivado é estritamente imutável.' };
      }

      const cycleRef = db.collection('commercial_execution_cycles').doc(reviewData.executionCycleId);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc || !cycleDoc.exists) {
        throw { status: 404, code: 'CYCLE_NOT_FOUND', message: 'Ciclo de execução não encontrado' };
      }
      const cycleData = cycleDoc.data();

      let budgetData: any = null;
      if (cycleData.budgetId) {
        const bDoc = await tx.get(db.collection('commercial_budgets').doc(cycleData.budgetId));
        if (bDoc && bDoc.exists) budgetData = bDoc.data();
      }

      // Forecast canônico via cycle.linkedForecastId (sem fallback vivo)
      let forecastData: any = null;
      let forecastMismatchReason: string | undefined = undefined;
      const linkedForecastId = cycleData.linkedForecastId;

      if (linkedForecastId) {
        let candidateForecast: any = null;
        if (budgetData?.approvedSnapshot?.forecastSnapshot) {
          candidateForecast = budgetData.approvedSnapshot.forecastSnapshot;
        } else if (cycleData.budgetExecutionSnapshot?.forecastSnapshot) {
          candidateForecast = cycleData.budgetExecutionSnapshot.forecastSnapshot;
        }

        if (candidateForecast) {
          const candidateId = candidateForecast.forecastId || candidateForecast.id;
          if (candidateId === linkedForecastId) {
            forecastData = candidateForecast;
          } else {
            // Snapshot ID mismatch: não tratar como verdade
            forecastData = null;
            forecastMismatchReason = 'FORECAST_SNAPSHOT_ID_MISMATCH';
          }
        }
      }

      let goalsData: any[] = [];
      if (cycleData.goalExecutionSnapshots && Array.isArray(cycleData.goalExecutionSnapshots) && cycleData.goalExecutionSnapshots.length > 0) {
        goalsData = cycleData.goalExecutionSnapshots;
      } else if (cycleData.linkedGoalIds && Array.isArray(cycleData.linkedGoalIds) && cycleData.linkedGoalIds.length > 0) {
        for (const gid of cycleData.linkedGoalIds) {
          const gDoc = await tx.get(db.collection('commercial_goals').doc(gid));
          if (gDoc && gDoc.exists) goalsData.push(gDoc.data());
        }
      }

      const actionsSnap = await db.collection('commercial_actions').where('executionCycleId', '==', reviewData.executionCycleId).get();
      const actionsData = actionsSnap.docs.map((d: any) => d.data());

      const outcomeSnapshot = await computeReviewOutcomeSnapshot({
        db,
        cycle: cycleData,
        budget: budgetData,
        forecast: forecastData,
        goals: goalsData,
        actions: actionsData,
        reviewId: id,
        forecastMismatchReason
      });

      const targetRev = budgetData?.approvedSnapshot?.targetRevenue ?? budgetData?.targetRevenue ?? 0;
      const budgetAdherence = outcomeSnapshot.finalActuals.revenue >= targetRev
        ? (outcomeSnapshot.finalActuals.revenue >= targetRev * 1.05 ? 'exceeded' : 'achieved')
        : 'missed';

      const hasApprovedBudget = !!budgetData?.approvedSnapshot;
      const headlineText = hasApprovedBudget
        ? `Ciclo finalizado com R$ ${outcomeSnapshot.finalActuals.revenue.toFixed(2)} (${budgetAdherence === 'achieved' || budgetAdherence === 'exceeded' ? 'Meta batida' : 'Abaixo da meta'}).`
        : `Ciclo finalizado com R$ ${outcomeSnapshot.finalActuals.revenue.toFixed(2)} (Diagnóstico preliminar: ${budgetAdherence === 'achieved' || budgetAdherence === 'exceeded' ? 'aderente ao orçamento preliminar' : 'abaixo do orçamento preliminar'}).`;

      const forecastMape = outcomeSnapshot.forecastCalibration?.meanAbsolutePercentageError;
      const forecastAccuracyRating: CommercialExecutionReview['summary']['forecastAccuracyRating'] =
        !outcomeSnapshot.forecastCalibration || forecastMape === undefined || forecastMape === null
          ? 'insufficient'
          : (forecastMape <= 5 ? 'high' : (forecastMape <= 15 ? 'medium' : 'low'));

      const summary: CommercialExecutionReview['summary'] = {
        headline: headlineText,
        budgetAdherence,
        primaryVarianceDriver: outcomeSnapshot.varianceBridge.drivers[0]?.driver || 'ORDER_VOLUME',
        keyLearning: outcomeSnapshot.learningInsights[0]?.title || 'Aprendizados registrados no relatório.',
        actionEffectivenessRate: outcomeSnapshot.actionEffectivenessSummary.completionRate,
        forecastAccuracyRating
      };

      const updatedReview: CommercialExecutionReview = cleanUndefined({
        ...reviewData,
        analysisVersion: (reviewData.analysisVersion || 1) + 1,
        outcomeSnapshot,
        summary,
        generatedAt: new Date().toISOString()
      });

      tx.update(reviewRef, updatedReview);

      // Atualizar snapshots de ações
      for (const act of actionsData) {
        const eff = evaluateActionEffectiveness(act);
        const actSnapRef = db.collection('commercial_execution_review_actions').doc(`rev_act_${id}_${act.id}`);
        tx.set(actSnapRef, cleanUndefined({
          id: `rev_act_${id}_${act.id}`,
          reviewId: id,
          actionId: act.id,
          executionCycleId: reviewData.executionCycleId,
          title: act.title,
          priority: act.priority || 'medium',
          productLine: act.productLine || 'ALL',
          channel: act.channel || null,
          owner: act.owner || act.assignedTo || null,
          expectedImpactSnapshot: act.expectedImpact || { revenue: act.targetRevenue || 0, units: act.targetUnits || 0 },
          actualImpactSnapshot: act.actualImpact || {},
          attributionSnapshot: eff.impactAttribution,
          confidenceSnapshot: eff.confidence,
          executionSnapshot: {
            executionStatus: act.executionStatus || act.status,
            progressPercent: act.progressPercent || 0,
            completedAt: act.completedAt || null
          },
          effectivenessResult: eff.effectivenessStatus,
          capturedAt: new Date().toISOString()
        }));
      }

      await recordReviewEvent(db, tx, {
        reviewId: id,
        eventType: 'review_recalculated',
        actorUid,
        actorEmail,
        before: reviewData,
        after: updatedReview,
        idempotencyKeyHash: hashKey(idempotencyKey)
      });

      const responseBody = { review: updatedReview };
      tx.set(idempRef, {
        idempotencyKeyHash: hashKey(idempotencyKey),
        keyHash: canonicalKeyHash,
        payloadFingerprint,
        operationScope,
        endpoint: `/api/admin/commercial/reviews/${id}/recalculate`,
        statusCode: 200,
        responseBody,
        createdAt: new Date().toISOString(),
        actorUid
      });

      return { status: 200, data: responseBody, isReplay: false };
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    logger.error('❌ [REVIEW-RECALC-ERR]', error);
    return res.status(500).json({ error: 'Erro ao recalcular review' });
  }
}

/**
 * POST /api/admin/commercial/reviews/:id/approve
 * Aprova o review e congela os snapshots como estritamente imutáveis.
 */
export async function approveCommercialExecutionReviewController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const { id } = req.params;
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }

    const actorUid = (req as any).user?.uid || 'system_admin';
    const actorEmail = (req as any).user?.email;
    const operationScope = `commercial_review:approve:${id}`;
    const canonicalKeyHash = computeCanonicalIdempotencyKey({
      actorUid,
      method: req.method,
      operationScope,
      idempotencyKey
    });
    const payloadFingerprint = computeCanonicalOperationFingerprint({
      method: req.method,
      operationScope,
      routeParams: { id },
      body: req.body
    });

    const result = await db.runTransaction(async (tx: any) => {
      const idempRef = db.collection('idempotency_records').doc(canonicalKeyHash);
      const idempDoc = await tx.get(idempRef);
      if (idempDoc && idempDoc.exists) {
        const idempData = idempDoc.data();
        if (idempData.operationScope !== operationScope || idempData.payloadFingerprint !== payloadFingerprint) {
          throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH', message: 'Chave de idempotência reutilizada com payload divergente' };
        }
        return { status: idempData.statusCode || 200, data: idempData.responseBody, isReplay: true };
      }

      const reviewRef = db.collection('commercial_execution_reviews').doc(id);
      const reviewDoc = await tx.get(reviewRef);
      if (!reviewDoc || !reviewDoc.exists) {
        throw { status: 404, code: 'REVIEW_NOT_FOUND', message: 'Review comercial não encontrado' };
      }
      const reviewData = reviewDoc.data() as CommercialExecutionReview;

      if (reviewData.status === 'approved') {
        const responseBody = { review: reviewData };
        tx.set(idempRef, {
          idempotencyKeyHash: hashKey(idempotencyKey),
          keyHash: canonicalKeyHash,
          payloadFingerprint,
          operationScope,
          endpoint: `/api/admin/commercial/reviews/${id}/approve`,
          statusCode: 200,
          responseBody,
          createdAt: new Date().toISOString(),
          actorUid
        });
        return { status: 200, data: responseBody, isReplay: true };
      }

      if (reviewData.status !== 'generated') {
        throw { status: 409, code: 'REVIEW_NOT_GENERATED', message: 'Apenas reviews gerados podem ser aprovados.' };
      }

      const updatedReview: CommercialExecutionReview = {
        ...reviewData,
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: actorUid
      };

      tx.update(reviewRef, updatedReview);

      await recordReviewEvent(db, tx, {
        reviewId: id,
        eventType: 'review_approved',
        actorUid,
        actorEmail,
        before: reviewData,
        after: updatedReview,
        idempotencyKeyHash: hashKey(idempotencyKey)
      });

      const responseBody = { review: updatedReview };
      tx.set(idempRef, {
        idempotencyKeyHash: hashKey(idempotencyKey),
        keyHash: canonicalKeyHash,
        payloadFingerprint,
        operationScope,
        endpoint: `/api/admin/commercial/reviews/${id}/approve`,
        statusCode: 200,
        responseBody,
        createdAt: new Date().toISOString(),
        actorUid
      });

      return { status: 200, data: responseBody, isReplay: false };
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    logger.error('❌ [REVIEW-APPROVE-ERR]', error);
    return res.status(500).json({ error: 'Erro ao aprovar review comercial' });
  }
}

/**
 * POST /api/admin/commercial/reviews/:id/archive
 * Transição de estado: apenas reviews APROVADOS podem ser arquivados.
 */
export async function archiveCommercialExecutionReviewController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const { id } = req.params;
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }

    const actorUid = (req as any).user?.uid || 'system_admin';
    const actorEmail = (req as any).user?.email;
    const operationScope = `commercial_review:archive:${id}`;
    const canonicalKeyHash = computeCanonicalIdempotencyKey({
      actorUid,
      method: req.method,
      operationScope,
      idempotencyKey
    });
    const payloadFingerprint = computeCanonicalOperationFingerprint({
      method: req.method,
      operationScope,
      routeParams: { id },
      body: req.body
    });

    const result = await db.runTransaction(async (tx: any) => {
      const idempRef = db.collection('idempotency_records').doc(canonicalKeyHash);
      const idempDoc = await tx.get(idempRef);
      if (idempDoc && idempDoc.exists) {
        const idempData = idempDoc.data();
        if (idempData.operationScope !== operationScope || idempData.payloadFingerprint !== payloadFingerprint) {
          throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH', message: 'Chave de idempotência reutilizada com payload divergente' };
        }
        return { status: idempData.statusCode || 200, data: idempData.responseBody, isReplay: true };
      }

      const reviewRef = db.collection('commercial_execution_reviews').doc(id);
      const reviewDoc = await tx.get(reviewRef);
      if (!reviewDoc || !reviewDoc.exists) {
        throw { status: 404, code: 'REVIEW_NOT_FOUND', message: 'Review comercial não encontrado' };
      }
      const reviewData = reviewDoc.data() as CommercialExecutionReview;

      if (reviewData.status === 'archived') {
        const responseBody = { review: reviewData };
        tx.set(idempRef, {
          idempotencyKeyHash: hashKey(idempotencyKey),
          keyHash: canonicalKeyHash,
          payloadFingerprint,
          operationScope,
          endpoint: `/api/admin/commercial/reviews/${id}/archive`,
          statusCode: 200,
          responseBody,
          createdAt: new Date().toISOString(),
          actorUid
        });
        return { status: 200, data: responseBody, isReplay: true };
      }

      if (reviewData.status !== 'approved') {
        throw { status: 409, code: 'INVALID_STATE_TRANSITION', message: 'Apenas reviews aprovados podem ser arquivados.' };
      }

      const updatedReview: CommercialExecutionReview = {
        ...reviewData,
        status: 'archived',
        archivedAt: new Date().toISOString(),
        archivedBy: actorUid
      };

      tx.update(reviewRef, updatedReview);

      await recordReviewEvent(db, tx, {
        reviewId: id,
        eventType: 'review_archived',
        actorUid,
        actorEmail,
        before: reviewData,
        after: updatedReview,
        idempotencyKeyHash: hashKey(idempotencyKey)
      });

      const responseBody = { review: updatedReview };
      tx.set(idempRef, {
        idempotencyKeyHash: hashKey(idempotencyKey),
        keyHash: canonicalKeyHash,
        payloadFingerprint,
        operationScope,
        endpoint: `/api/admin/commercial/reviews/${id}/archive`,
        statusCode: 200,
        responseBody,
        createdAt: new Date().toISOString(),
        actorUid
      });

      return { status: 200, data: responseBody, isReplay: false };
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    logger.error('❌ [REVIEW-ARCHIVE-ERR]', error);
    return res.status(500).json({ error: 'Erro ao arquivar review comercial' });
  }
}

/**
 * POST /api/admin/commercial/reviews/:id/insights/:insightId/create-action
 * Converte manualmente um Insight em uma nova CommercialAction planejada/draft.
 *
 * REQUISITOS CANÔNICOS (FASE 9.6.8-B):
 * 1. targetCycleId é OBRIGATÓRIO no corpo da requisição (400 TARGET_CYCLE_ID_REQUIRED se omitido).
 * 2. O Ciclo Alvo (targetCycleId) deve existir e NÃO pode estar 'completed' ou 'archived' (409 TARGET_CYCLE_IMMUTABLE).
 * 3. Lock determinístico SHA256 (reviewId + ":" + insightId + ":" + targetCycleId) para deduplicação multi-instância.
 * 4. CommercialAction criada com contrato 9.6.4/9.6.7 (source: 'commercial_intelligence', status: 'draft', executionStatus: 'planned').
 * 5. IMUTABILIDADE: O documento do Review aprovado NÃO sofre mutação (SHA256 outcomeSnapshot idêntico).
 */
export async function convertInsightToCommercialActionController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const { id } = req.params;
    const insightId = req.params.insightId || req.body.insightId;
    if (!insightId || typeof insightId !== 'string') {
      return res.status(400).json({ error: 'insightId é obrigatório para converter insight em ação', code: 'INSIGHT_ID_REQUIRED' });
    }
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }

    const actorUid = (req as any).user?.uid || 'system_admin';
    const actorEmail = (req as any).user?.email;
    const operationScope = `commercial_review:create_action:${id}:${insightId}`;
    const canonicalKeyHash = computeCanonicalIdempotencyKey({
      actorUid,
      method: req.method,
      operationScope,
      idempotencyKey
    });
    const payloadFingerprint = computeCanonicalOperationFingerprint({
      method: req.method,
      operationScope,
      routeParams: { id, insightId },
      body: req.body
    });

    const targetCycleId = req.body.targetCycleId;
    if (!targetCycleId || typeof targetCycleId !== 'string' || targetCycleId.trim().length === 0) {
      return res.status(400).json({
        error: 'targetCycleId é obrigatório para converter um insight em ação comercial.',
        code: 'TARGET_CYCLE_ID_REQUIRED'
      });
    }

    const result = await db.runTransaction(async (tx: any) => {
      // 1. Idempotência por Idempotency-Key
      const idempRef = db.collection('idempotency_records').doc(canonicalKeyHash);
      const idempDoc = await tx.get(idempRef);
      if (idempDoc && idempDoc.exists) {
        const idempData = idempDoc.data();
        if (idempData.operationScope !== operationScope || idempData.payloadFingerprint !== payloadFingerprint) {
          throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH', message: 'Chave de idempotência reutilizada com payload divergente' };
        }
        return { status: idempData.statusCode || 200, data: idempData.responseBody, isReplay: true };
      }

      // 2. Buscar Review e validar que insight existe
      const reviewRef = db.collection('commercial_execution_reviews').doc(id);
      const reviewDoc = await tx.get(reviewRef);
      if (!reviewDoc || !reviewDoc.exists) {
        throw { status: 404, code: 'REVIEW_NOT_FOUND', message: 'Review comercial não encontrado' };
      }
      const reviewData = reviewDoc.data() as CommercialExecutionReview;
      const allInsights = reviewData.outcomeSnapshot?.learningInsights || (reviewData.outcomeSnapshot as any)?.insights || [];
      const insight = allInsights.find((i: any) => i.id === insightId);

      if (!insight) {
        throw { status: 404, code: 'INSIGHT_NOT_FOUND', message: 'Insight não encontrado no review' };
      }

      if (insight.canCreateAction === false) {
        throw { status: 400, code: 'ACTION_NOT_PERMITTED_FOR_INSIGHT', message: 'Este tipo de insight não permite criação de ação direta.' };
      }

      // 3. Validar Ciclo Alvo (Target Cycle)
      const targetCycleRef = db.collection('commercial_execution_cycles').doc(targetCycleId);
      const targetCycleDoc = await tx.get(targetCycleRef);
      if (!targetCycleDoc || !targetCycleDoc.exists) {
        throw { status: 404, code: 'TARGET_CYCLE_NOT_FOUND', message: 'Ciclo de destino não encontrado.' };
      }
      const targetCycleData = targetCycleDoc.data();
      if (targetCycleData.status === 'completed' || targetCycleData.status === 'archived') {
        throw {
          status: 409,
          code: 'TARGET_CYCLE_IMMUTABLE',
          message: 'Não é permitido criar ações em ciclos de execução concluídos ou arquivados. Selecione um ciclo ativo ou em planejamento.'
        };
      }

      // 4. Deduplicação persistente do Insight no Target Cycle (SHA256 Lock)
      const deterministicLockKey = `rec_lock_insight_${crypto.createHash('sha256').update(`${id}:${insightId}:${targetCycleId}`).digest('hex')}`;
      const lockRef = db.collection('commercial_review_insight_locks').doc(deterministicLockKey);
      const lockDoc = await tx.get(lockRef);

      if (lockDoc && lockDoc.exists) {
        const existingActionId = lockDoc.data().actionId;
        const existingActionDoc = await tx.get(db.collection('commercial_actions').doc(existingActionId));
        if (existingActionDoc && existingActionDoc.exists) {
          const responseBody = {
            action: existingActionDoc.data(),
            alreadyCreated: true,
            message: 'Ação comercial já existente para este insight no ciclo alvo'
          };
          tx.set(idempRef, {
            idempotencyKeyHash: hashKey(idempotencyKey),
            keyHash: canonicalKeyHash,
            payloadFingerprint,
            operationScope,
            endpoint: `/api/admin/commercial/reviews/${id}/insights/${insightId}/create-action`,
            statusCode: 200,
            responseBody,
            createdAt: new Date().toISOString(),
            actorUid
          });
          return { status: 200, data: responseBody, isReplay: true };
        }
      }

      // 5. Criar a nova CommercialAction canônica (FASE 9.6.4/9.6.7/9.6.8-C)
      const actionId = `act_ins_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const actionRef = db.collection('commercial_actions').doc(actionId);

      const VALID_ACTION_TYPES: CommercialActionType[] = [
        'review_price', 'review_cost', 'review_shipping', 'review_gateway',
        'review_discount', 'review_promotion', 'improve_margin', 'register_cost',
        'review_product', 'review_line', 'break_even_plan', 'profit_target_plan', 'custom'
      ];

      let canonicalType: CommercialActionType = 'custom';
      if (req.body.type && VALID_ACTION_TYPES.includes(req.body.type)) {
        canonicalType = req.body.type;
      } else {
        switch (insight.type) {
          case 'BUDGET_PLANNING':
            canonicalType = 'profit_target_plan';
            break;
          case 'ACTION_EFFECTIVENESS':
            canonicalType = 'review_promotion';
            break;
          case 'PRODUCT_LINE':
            canonicalType = 'review_line';
            break;
          case 'COST_QUALITY':
            canonicalType = 'register_cost';
            break;
          case 'MARGIN':
            canonicalType = 'improve_margin';
            break;
          case 'FORECAST_CALIBRATION':
          default:
            canonicalType = 'custom';
            break;
        }
      }

      const targetRev = req.body.targetRevenue !== undefined ? Number(req.body.targetRevenue) : undefined;
      const targetUnits = req.body.targetUnits !== undefined ? Number(req.body.targetUnits) : undefined;
      const targetCM = req.body.targetContributionMargin !== undefined ? Number(req.body.targetContributionMargin) : undefined;

      let expectedImpact: any = undefined;
      if (req.body.expectedImpact && typeof req.body.expectedImpact === 'object') {
        expectedImpact = req.body.expectedImpact;
      } else if (targetRev !== undefined || targetUnits !== undefined || targetCM !== undefined) {
        expectedImpact = {
          ...(targetRev !== undefined ? { revenue: targetRev } : {}),
          ...(targetUnits !== undefined ? { units: targetUnits } : {}),
          ...(targetCM !== undefined ? { contributionMargin: targetCM } : {})
        };
      }

      const nowIso = new Date().toISOString();
      const sourceSnapshot: CommercialActionSourceSnapshot = {
        isHistoricalSnapshot: true,
        snapshotCapturedAt: nowIso,
        snapshotVersion: '9.6.8',
        recommendationType: insight.type,
        confidence: insight.confidence,
        reasonCodes: [insight.type],
        costCoveragePercent: reviewData.outcomeSnapshot?.costCoveragePercent,
        currentPrice: req.body.currentPrice,
        unitCost: req.body.unitCost,
        grossRevenue: targetRev,
        contributionMargin: targetCM
      };

        let defaultProductLine: any = 'ALL';
        if (insight.type === 'PRODUCT_LINE') {
          defaultProductLine = insight.metrics?.bestMarginLine || insight.metrics?.topRevenueLine || insight.metrics?.line || 'ALL';
        }

        const newAction: CommercialAction = {
          id: actionId,
          executionCycleId: targetCycleId,
          type: canonicalType,
          entityType: req.body.entityType || (insight.type === 'PRODUCT_LINE' ? 'line' : 'custom'),
          entityId: req.body.entityId,
          entityName: req.body.entityName,
          title: req.body.title || `[Plano Pós-Mortem] ${insight.title}`,
          description: req.body.description || insight.description,
          status: 'draft',
          priority: req.body.priority || 'high',
          source: 'commercial_intelligence',
          sourceSnapshot,
          createdAt: nowIso,
          createdBy: actorUid,
          budgetId: targetCycleData.budgetId,
          goalIds: targetCycleData.linkedGoalIds || [],
          forecastId: targetCycleData.linkedForecastId,
          productLine: req.body.productLine || defaultProductLine,
          assignedTo: req.body.assignedTo || actorUid,
          expectedImpact,
          executionStatus: 'planned',
          completionPercent: 0,
          plannedStartDate: req.body.plannedStartDate || targetCycleData.periodStart || nowIso.split('T')[0],
          plannedEndDate: req.body.plannedEndDate || targetCycleData.periodEnd,
          sourceRecommendationId: insight.id,
          sourceRecommendationSnapshot: {
            insightId: insight.id,
            reviewId: id,
            type: insight.type,
            title: insight.title,
            evidence: insight.evidence,
            confidence: insight.confidence
          }
        };

      tx.set(actionRef, cleanUndefined(newAction));
      tx.set(lockRef, {
        id: deterministicLockKey,
        reviewId: id,
        insightId,
        targetCycleId,
        actionId,
        createdAt: new Date().toISOString(),
        actorUid
      });

      // Se o review NÃO estiver aprovado nem arquivado, podemos registrar a conversão no review.
      // Se já estiver APROVADO, preservamos o review com IMUTABILIDADE ESTRITA.
      if (reviewData.status !== 'approved' && reviewData.status !== 'archived') {
        const updatedInsights = reviewData.outcomeSnapshot?.learningInsights?.map(ins => {
          if (ins.id === insightId) {
            return {
              ...ins,
              convertedActionId: actionId,
              convertedAt: new Date().toISOString()
            };
          }
          return ins;
        });

        if (updatedInsights && reviewData.outcomeSnapshot) {
          tx.update(reviewRef, {
            'outcomeSnapshot.learningInsights': updatedInsights
          });
        }
      }

      await recordReviewEvent(db, tx, {
        reviewId: id,
        eventType: 'insight_converted_to_action',
        actorUid,
        actorEmail,
        after: { insightId, targetCycleId, actionId },
        idempotencyKeyHash: hashKey(idempotencyKey)
      });

      const responseBody = { action: newAction, alreadyCreated: false };
      tx.set(idempRef, {
        idempotencyKeyHash: hashKey(idempotencyKey),
        keyHash: canonicalKeyHash,
        payloadFingerprint,
        operationScope,
        endpoint: `/api/admin/commercial/reviews/${id}/insights/${insightId}/create-action`,
        statusCode: 201,
        responseBody,
        createdAt: new Date().toISOString(),
        actorUid
      });

      return { status: 201, data: responseBody, isReplay: false };
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    logger.error('❌ [INSIGHT-CONVERT-ERR]', error?.stack || error?.message || error);
    return res.status(500).json({ error: 'Erro ao converter insight em ação comercial', details: error?.message || String(error) });
  }
}

/**
 * GET /api/admin/commercial/learning/summary
 * Retorna o sumário de aprendizado contínuo de todos os reviews APROVADOS dentro do período.
 */
export async function getCommercialHistoricalLearningSummaryController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    const periodStart = String(req.query.periodStart || '2026-01-01');
    const periodEnd = String(req.query.periodEnd || '2026-12-31');
    const productLine = req.query.productLine ? String(req.query.productLine) : undefined;

    const BATCH_SIZE = 50;
    let lastDoc: any = null;
    let hasMore = true;
    const matchingReviews: CommercialExecutionReview[] = [];

    while (hasMore) {
      let query = db.collection('commercial_execution_reviews')
        .where('status', '==', 'approved')
        .where('periodStart', '<=', periodEnd)
        .orderBy('periodStart', 'desc')
        .limit(BATCH_SIZE);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty || snapshot.docs.length === 0) {
        hasMore = false;
        break;
      }

      for (const doc of snapshot.docs) {
        const rev = doc.data() as CommercialExecutionReview;
        if (rev.periodEnd >= periodStart) {
          matchingReviews.push(rev);
        }
      }

      if (snapshot.docs.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
      }
    }

    const summary = calculateHistoricalLearningSummary({
      reviews: matchingReviews,
      periodStart,
      periodEnd,
      productLineFilter: productLine
    });

    return res.status(200).json({ summary });
  } catch (error: any) {
    logger.error('❌ [HISTORICAL-LEARNING-ERR]', error);
    return res.status(500).json({ error: 'Erro ao gerar sumário de aprendizado histórico' });
  }
}

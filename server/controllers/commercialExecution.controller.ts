/**
 * CONTROLLER CANÔNICO DE EXECUÇÃO COMERCIAL, PLANOS DE AÇÃO & CONTROLE DE RESULTADOS
 * FASE 9.6.7-A — HARDENING DE INTEGRIDADE, ACTUALS E COMPATIBILIDADE — FPAC Store
 *
 * Fornece endpoints autenticados e protegidos para:
 * - Ciclos de Execução Comercial (Execution Cycle) com Snapshot Imutável de Budget e Goals
 * - Planos de Ação e Ações de Execução com Máquina de Estados Estrita (planned -> ready -> in_progress -> completed/blocked/cancelled)
 * - Compatibilidade Total 9.6.4 com a coleção commercial_actions
 * - Reutilização dos motores financeiros certificados sem fórmulas paralelas
 * - Consulta de datasets sem full-scan via range queries (ISO + Timestamp) com deduplicação
 * - Multi-Goals canônico (revenue, operating_profit, contribution_margin, units, average_ticket)
 * - Impacto Real calculado exclusivamente no backend com atribuição transparente (direct, correlated, estimated, insufficient)
 * - Validação estrita de Action/Cycle ownership e bloqueio de mutações em ciclos finalizados
 * - Transações atômicas no Firestore com idempotência persistida, replay seguro e detecção de conflitos
 * - Eventos de Auditoria Append-Only (commercial_execution_events) com paginação server-side
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../firebase.js';
import { logger } from '../utils/logger.js';
import { fetchCommercialDataset } from '../utils/commercialDataset.js';
export { fetchCommercialDataset };
import {
  CommercialExecutionCycle,
  CommercialExecutionActionItem,
  CommercialExecutionEvent,
  CommercialExecutionStatus,
  CommercialActionExecutionStatus,
  CommercialActionPriority,
  CommercialImpactAttribution,
  BudgetExecutionSnapshot,
  GoalExecutionSnapshot,
  CommercialActionExpectedImpact,
  CommercialActionActualImpact,
  CommercialExecutionDashboard
} from '../../src/types/commercialExecution.js';
import {
  CommercialAction,
  CommercialActionType,
  CommercialActionStatus,
  CommercialActionSourceSnapshot,
  CommercialGoal
} from '../../src/types/commercialGovernance.js';
import {
  calculateExecutionProgress,
  calculateBudgetExecutionProgress,
  calculateExecutionHealth,
  generateExecutionAlerts,
  prioritizeCommercialActions,
  normalizeDateToObj,
  formatDateToYMD
} from '../../src/utils/commercialExecution.js';
import {
  calculateBudgetCurrentActuals,
  evaluateBudgetConfidence,
  countDaysBetween,
  roundMoney,
  roundPercent,
  normalizeBudgetAllocations
} from '../../src/utils/commercialBudget.js';
import {
  calculateOrderProfitability,
  calculateProductProfitability,
  aggregateProfitabilityByLine
} from '../../src/utils/profitability.js';
import {
  calculateFinancialDRE,
  calculateOperatingResult,
  calculateOrderFinancials,
  getOrderItemCost,
  getOrderPaidAmount,
  getOrderTotal,
  getOrderRefundedAmount,
  getOrderGatewayFee,
  getOrderShippingFinances
} from '../../src/utils/orderFinancial.js';

// Suporte a injeção de Mock DB para testes
let customExecutionDb: any = null;

export function setCommercialExecutionDb(db: any) {
  customExecutionDb = db;
}

function resolveDb() {
  return customExecutionDb || getDb();
}

/**
 * Utilitário SHA256 para Idempotency Keys
 */
function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

/**
 * Serializador canônico recursivo:
 * - Ordena chaves de objetos recursivamente em todos os níveis
 * - Preserva arrays em ordem exata, serializando recursivamente cada elemento
 * - Preserva valores aninhados (números, strings, booleanos, null, dates)
 * - Remove campos explicitamente não-semânticos como 'idempotencyKey'
 */
export function stableCanonicalize(value: any): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
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

/**
 * Sanitiza objetos para auditoria (remove senhas, tokens ou dados sensíveis)
 */
function sanitizeAuditPayload(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const clone = JSON.parse(JSON.stringify(data));
  const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'apiKey', 'admin_api_key'];
  function removeKeys(obj: any) {
    if (!obj || typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
      if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk.toLowerCase()))) {
        obj[k] = '[REDACTED]';
      } else if (typeof obj[k] === 'object') {
        removeKeys(obj[k]);
      }
    }
  }
  removeKeys(clone);
  return clone;
}

/**
 * Registra evento de auditoria append-only
 */
function appendExecutionEventTx(
  tx: any,
  db: any,
  cycleId: string,
  eventType: any,
  actorUid: string,
  actorEmail?: string,
  actorName?: string,
  data?: {
    actionId?: string;
    before?: any;
    after?: any;
    idempotencyKeyHash?: string;
    metadata?: Record<string, any>;
  }
) {
  const eventRef = db.collection('commercial_execution_events').doc();
  const eventPayload: CommercialExecutionEvent = {
    id: eventRef.id,
    executionCycleId: cycleId,
    actionId: data?.actionId,
    eventType,
    actorUid,
    actorEmail: actorEmail || '',
    actorName: actorName || '',
    timestamp: new Date().toISOString(),
    before: data?.before ? sanitizeAuditPayload(data.before) : null,
    after: data?.after ? sanitizeAuditPayload(data.after) : null,
    idempotencyKeyHash: data?.idempotencyKeyHash || null,
    metadata: data?.metadata ? sanitizeAuditPayload(data.metadata) : null
  };
  tx.set(eventRef, eventPayload);
  return eventRef.id;
}

/**
 * Mapeia executionStatus da 9.6.7 para o status canônico da 9.6.4
 */
function mapExecutionStatusToCanonical(executionStatus: CommercialActionExecutionStatus): CommercialActionStatus {
  switch (executionStatus) {
    case 'planned':
      return 'draft';
    case 'ready':
      return 'approved';
    case 'in_progress':
    case 'blocked':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'draft';
  }
}

/**
 * Helper interno para calcular o dashboard canônico sem duplicação de fórmulas
 */
async function computeCanonicalDashboard(
  db: any,
  cycle: CommercialExecutionCycle,
  asOfDate?: string
): Promise<CommercialExecutionDashboard> {
  // 1. Buscar Ações vinculadas ao ciclo
  const actionsSnap = await db.collection('commercial_actions')
    .where('executionCycleId', '==', cycle.id)
    .get();

  const actions: CommercialExecutionActionItem[] = actionsSnap.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  }));

  // 2. Buscar dados do Budget vinculado
  let budgetTarget = {
    revenue: 0,
    units: 0,
    averageTicket: 0,
    contributionMargin: 0,
    operatingProfit: 0,
    lineAllocations: [] as any[],
    allocations: {} as any
  };

  if (cycle.budgetExecutionSnapshot) {
    budgetTarget = {
      revenue: cycle.budgetExecutionSnapshot.targetRevenue,
      units: cycle.budgetExecutionSnapshot.targetUnits,
      averageTicket: cycle.budgetExecutionSnapshot.targetAverageTicket,
      contributionMargin: cycle.budgetExecutionSnapshot.targetContributionMargin,
      operatingProfit: cycle.budgetExecutionSnapshot.targetOperatingProfit,
      lineAllocations: cycle.budgetExecutionSnapshot.lineAllocations || [],
      allocations: {}
    };
  } else if (cycle.budgetId) {
    const budgetDoc = await db.collection('commercial_budgets').doc(cycle.budgetId).get();
    if (budgetDoc.exists) {
      const bData = budgetDoc.data();
      budgetTarget = {
        revenue: bData.targetRevenue || 0,
        units: bData.targetUnits || 0,
        averageTicket: bData.targetAverageTicket || 0,
        contributionMargin: bData.targetContributionMargin || 0,
        operatingProfit: bData.targetOperatingProfit || 0,
        lineAllocations: bData.lineAllocations || [],
        allocations: bData.allocations || {}
      };
    }
  }

  // 3. Buscar Realizado (Actuals) do período usando motor canônico
  const dataset = await fetchCommercialDataset(db, cycle.periodStart, cycle.periodEnd);
  
  const normAlloc = normalizeBudgetAllocations(budgetTarget.allocations);
  const actuals = calculateBudgetCurrentActuals({
    orders: dataset.orders,
    expenses: dataset.expenses,
    traffic: dataset.traffic,
    investments: dataset.investments,
    productCatalog: dataset.products,
    budgetStartDate: cycle.periodStart,
    budgetEndDate: cycle.periodEnd,
    asOfDate
  });

  const totalDays = countDaysBetween(cycle.periodStart, cycle.periodEnd);
  const confidence = evaluateBudgetConfidence(dataset.orders, dataset.products, totalDays);

  // 4. Line Performance reutilizando aggregateProfitabilityByLine da 9.6.2
  const linePerformanceMap: Record<string, {
    line: string;
    targetRevenue: number;
    actualRevenue: number;
    targetUnits: number;
    actualUnits: number;
    targetContributionMargin: number;
    actualContributionMargin: number;
  }> = {
    FORCE: { line: 'FORCE', targetRevenue: 0, actualRevenue: 0, targetUnits: 0, actualUnits: 0, targetContributionMargin: 0, actualContributionMargin: 0 },
    MARK: { line: 'MARK', targetRevenue: 0, actualRevenue: 0, targetUnits: 0, actualUnits: 0, targetContributionMargin: 0, actualContributionMargin: 0 },
    PRIME: { line: 'PRIME', targetRevenue: 0, actualRevenue: 0, targetUnits: 0, actualUnits: 0, targetContributionMargin: 0, actualContributionMargin: 0 },
    OTHER: { line: 'OTHER', targetRevenue: 0, actualRevenue: 0, targetUnits: 0, actualUnits: 0, targetContributionMargin: 0, actualContributionMargin: 0 }
  };

  // Preencher targets por linha caso existam snapshots ou allocations
  if (budgetTarget.lineAllocations && budgetTarget.lineAllocations.length > 0) {
    for (const la of budgetTarget.lineAllocations) {
      if (linePerformanceMap[la.line]) {
        linePerformanceMap[la.line].targetRevenue = la.targetRevenue;
        linePerformanceMap[la.line].targetUnits = la.targetUnits;
        linePerformanceMap[la.line].targetContributionMargin = la.targetContributionMargin;
      }
    }
  }

  // Filtrar pedidos elegíveis na janela do ciclo para agregação de linhas
  const effectiveEnd = asOfDate && asOfDate < cycle.periodEnd ? asOfDate : cycle.periodEnd;
  const filteredOrders = dataset.orders.filter((o: any) => {
    if (!o) return false;
    const paymentStatus = o.paymentStatus || o.status;
    if (['cancelled', 'refunded', 'rejected', 'pending', 'Cancelado'].includes(paymentStatus)) {
      return false;
    }
    const orderDate = formatDateToYMD(o.createdAt || o.date || o.timestamp);
    return orderDate >= cycle.periodStart && orderDate <= effectiveEnd;
  });

  const ordersProfitability = filteredOrders.map((order: any) =>
    calculateOrderProfitability(order, dataset.products)
  );

  const productsProfitability = calculateProductProfitability(
    filteredOrders,
    dataset.products
  );

  const lineAggregates = aggregateProfitabilityByLine(
    productsProfitability,
    ordersProfitability
  );

  for (const item of lineAggregates) {
    const rawLine = String(item.lineName || 'OTHER').toUpperCase();
    const normalizedKey = ['FORCE', 'MARK', 'PRIME'].includes(rawLine) ? rawLine : 'OTHER';
    if (linePerformanceMap[normalizedKey]) {
      linePerformanceMap[normalizedKey].actualRevenue = roundMoney(
        linePerformanceMap[normalizedKey].actualRevenue + (item.grossRevenue ?? item.netRevenue ?? item.totalRevenue ?? 0)
      );
      linePerformanceMap[normalizedKey].actualUnits += (item.unitsSold || 0);
      linePerformanceMap[normalizedKey].actualContributionMargin = roundMoney(
        linePerformanceMap[normalizedKey].actualContributionMargin + (item.contributionMargin || 0)
      );
    }
  }

  // 5. Multi-Goals: carregar todas as metas vinculadas
  let goalTargets = {
    revenue: budgetTarget.revenue,
    operatingProfit: budgetTarget.operatingProfit,
    contributionMargin: budgetTarget.contributionMargin,
    units: budgetTarget.units,
    averageTicket: budgetTarget.averageTicket
  };

  const goalIdsToLoad = cycle.linkedGoalIds || [];
  if (cycle.goalExecutionSnapshots && cycle.goalExecutionSnapshots.length > 0) {
    for (const g of cycle.goalExecutionSnapshots) {
      if (g.type === 'revenue') goalTargets.revenue = g.targetValue;
      if (g.type === 'operating_profit') goalTargets.operatingProfit = g.targetValue;
      if (g.type === 'contribution_margin') goalTargets.contributionMargin = g.targetValue;
      if (g.type === 'units') goalTargets.units = g.targetValue;
      if (g.type === 'average_ticket') goalTargets.averageTicket = g.targetValue;
    }
  } else if (goalIdsToLoad.length > 0) {
    for (const gid of goalIdsToLoad) {
      try {
        const gDoc = await db.collection('commercial_goals').doc(gid).get();
        if (gDoc.exists) {
          const gData = gDoc.data() as CommercialGoal;
          if (gData.type === 'revenue') goalTargets.revenue = gData.targetValue;
          if (gData.type === 'operating_profit') goalTargets.operatingProfit = gData.targetValue;
          if (gData.type === 'contribution_margin') goalTargets.contributionMargin = gData.targetValue;
          if (gData.type === 'units') goalTargets.units = gData.targetValue;
          if (gData.type === 'average_ticket') goalTargets.averageTicket = gData.targetValue;
        }
      } catch (err) {
        logger.warn(`Could not load goal ${gid}`, err);
      }
    }
  }

  // 6. Forecast
  let forecastVals: any = undefined;
  if (cycle.linkedForecastId) {
    try {
      const fcDoc = await db.collection('commercial_forecasts').doc(cycle.linkedForecastId).get();
      if (fcDoc.exists) {
        const fcData = fcDoc.data();
        const projRev = Number(fcData.projectedRevenue || 0);
        const projOrders = Number(fcData.projectedOrders || fcData.orders || 0);
        const projUnits = Number(fcData.projectedUnits || fcData.units || 0);
        const avgTicket = projOrders > 0 ? roundMoney(projRev / projOrders) : 0;

        forecastVals = {
          revenue: projRev,
          orders: projOrders,
          projectedOrders: projOrders,
          units: projUnits,
          averageTicket: avgTicket,
          contributionMargin: Number(fcData.projectedContributionMargin || 0),
          operatingProfit: Number(fcData.projectedOperatingProfit || 0)
        };
      }
    } catch (err) {
      logger.warn(`Could not load forecast ${cycle.linkedForecastId}`, err);
    }
  }

  // 7. Cálculos de Progresso, Health, Alertas e Priorização
  const effectiveRefDate = asOfDate ? normalizeDateToObj(asOfDate) : new Date();
  const budgetExecution = calculateBudgetExecutionProgress({
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    referenceDate: effectiveRefDate,
    budget: budgetTarget,
    actuals: {
      revenue: actuals.revenue,
      orders: (actuals as any).ordersCount || (actuals as any).orders || filteredOrders.length,
      units: actuals.units,
      contributionMargin: actuals.contributionMargin,
      operatingProfit: actuals.operatingProfit
    },
    forecast: forecastVals,
    goals: goalTargets
  });

  const progress = calculateExecutionProgress(actions, effectiveRefDate);

  const hasSufficientData = confidence.level !== 'insufficient' && actuals.costCoveragePercent >= 50;

  const health = calculateExecutionHealth({
    progress,
    budgetExecution,
    costCoveragePercent: actuals.costCoveragePercent,
    confidence: confidence.level,
    hasSufficientData
  });

  const alerts = generateExecutionAlerts({
    actions,
    progress,
    budgetExecution,
    costCoveragePercent: actuals.costCoveragePercent,
    hasSufficientData,
    now: effectiveRefDate
  });

  const prioritizedActions = prioritizeCommercialActions(actions, {
    revenueVarianceToExpected: budgetExecution.revenue.varianceToExpected,
    goalGap: budgetExecution.revenue.gapToGoal,
    referenceDate: effectiveRefDate
  });

  return {
    cycle,
    progress,
    health,
    alerts,
    budgetExecution,
    actions,
    prioritizedActions,
    linePerformance: linePerformanceMap,
    calculatedAt: new Date().toISOString()
  };
}

// =========================================================================
// 1. GET /api/admin/commercial/execution-cycles
// =========================================================================
export async function getCommercialExecutionCyclesController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { status, limit = '50' } = req.query;
    let query = db.collection('commercial_execution_cycles');

    if (status && typeof status === 'string') {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.limit(Number(limit) || 50).get();
    const cycles = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    cycles.sort((a: any, b: any) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    res.json({ cycles });
  } catch (err: any) {
    logger.error('❌ [EXECUTION-CYCLES-GET-ERR]', err);
    res.status(500).json({ error: err.message || 'Erro ao listar ciclos de execução' });
  }
}

// =========================================================================
// 2. GET /api/admin/commercial/execution-cycles/:id
// =========================================================================
export async function getCommercialExecutionCycleByIdController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const doc = await db.collection('commercial_execution_cycles').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Ciclo de execução não encontrado' });
    }

    res.json({ cycle: { id: doc.id, ...doc.data() } });
  } catch (err: any) {
    logger.error('❌ [EXECUTION-CYCLE-BY-ID-ERR]', err);
    res.status(500).json({ error: err.message || 'Erro ao obter ciclo de execução' });
  }
}

// =========================================================================
// 3. GET /api/admin/commercial/execution-cycles/:id/events (PAGINAÇÃO SERVER-SIDE)
// =========================================================================
export async function getCommercialExecutionEventsController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const { limit = '50', startAfter } = req.query;
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));

    let query: any = db.collection('commercial_execution_events')
      .where('executionCycleId', '==', id)
      .orderBy('timestamp', 'desc');

    if (startAfter && typeof startAfter === 'string') {
      const cursorDoc = await db.collection('commercial_execution_events').doc(startAfter).get();
      if (!cursorDoc || !cursorDoc.exists) {
        return res.status(400).json({ error: 'Cursor de paginação inválido ou não encontrado', code: 'INVALID_CURSOR' });
      }
      if (typeof query.startAfter === 'function') {
        query = query.startAfter(cursorDoc);
      }
    }

    query = query.limit(limitNum + 1);

    const snapshot = await query.get();
    const docs = snapshot.docs || [];
    const hasMore = docs.length > limitNum;
    const resultDocs = hasMore ? docs.slice(0, limitNum) : docs;
    const events = resultDocs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    const nextCursor = events.length > 0 ? events[events.length - 1].id : null;

    res.json({
      events: events,
      count: events.length,
      hasMore,
      nextCursor
    });
  } catch (err: any) {
    logger.error('❌ [EXECUTION-EVENTS-GET-ERR]', err);
    res.status(500).json({ error: err.message || 'Erro ao obter eventos de execução' });
  }
}

// =========================================================================
// 4. POST /api/admin/commercial/execution-cycles (CREATE CYCLE)
// =========================================================================
export async function createCommercialExecutionCycleController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório para criação de ciclo' });
    }

    const {
      title,
      periodStart,
      periodEnd,
      budgetId,
      linkedGoalIds = [],
      linkedForecastId,
      notes
    } = req.body;

    if (!title || !periodStart || !periodEnd || !budgetId) {
      return res.status(400).json({ error: 'Campos obrigatórios: title, periodStart, periodEnd, budgetId' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`cycle_create_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 201, payload: data.responsePayload };
        return;
      }

      // Validar existência do Budget
      const budgetDoc = await tx.get(db.collection('commercial_budgets').doc(budgetId));
      if (!budgetDoc.exists) {
        throw new Error(`BUDGET_NOT_FOUND: Budget ${budgetId} não existe.`);
      }

      const cycleRef = db.collection('commercial_execution_cycles').doc();
      const newCycle: CommercialExecutionCycle = {
        id: cycleRef.id,
        title: String(title).trim(),
        periodStart: formatDateToYMD(periodStart),
        periodEnd: formatDateToYMD(periodEnd),
        budgetId,
        linkedGoalIds: Array.isArray(linkedGoalIds) ? linkedGoalIds : [],
        linkedForecastId: linkedForecastId || undefined,
        status: 'draft',
        version: 1,
        createdAt: new Date().toISOString(),
        createdBy: operatorUid,
        createdByName: operatorName,
        notes: notes || undefined
      };

      tx.set(cycleRef, newCycle);

      appendExecutionEventTx(tx, db, cycleRef.id, 'cycle_created', operatorUid, operatorEmail, operatorName, {
        after: newCycle,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { cycle: newCycle };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 201,
        responsePayload
      });

      result = { replayed: false, status: 201, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [EXECUTION-CYCLE-CREATE-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('BUDGET_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao criar ciclo de execução' });
  }
}

// =========================================================================
// 5. PATCH /api/admin/commercial/execution-cycles/:id (UPDATE CYCLE / STRUCTURAL IMMUTABILITY)
// =========================================================================
export async function updateCommercialExecutionCycleController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório para atualização de ciclo' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`cycle_patch_${id}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }

      const currentCycle = cycleDoc.data() as CommercialExecutionCycle;

      if (currentCycle.status === 'completed' || currentCycle.status === 'archived') {
        throw new Error(`CYCLE_IMMUTABLE: Ciclos no estado '${currentCycle.status}' não permitem edições.`);
      }

      // Se o ciclo já estiver ATIVO, bloquear alterações estruturais (budgetId, datas, metas, forecast)
      if (currentCycle.status === 'active') {
        const hasStructuralChanges =
          (req.body.budgetId && req.body.budgetId !== currentCycle.budgetId) ||
          (req.body.periodStart && formatDateToYMD(req.body.periodStart) !== currentCycle.periodStart) ||
          (req.body.periodEnd && formatDateToYMD(req.body.periodEnd) !== currentCycle.periodEnd) ||
          (req.body.linkedGoalIds && JSON.stringify(req.body.linkedGoalIds) !== JSON.stringify(currentCycle.linkedGoalIds)) ||
          (req.body.linkedForecastId !== undefined && req.body.linkedForecastId !== currentCycle.linkedForecastId);

        if (hasStructuralChanges) {
          throw new Error('ACTIVE_CYCLE_STRUCTURAL_IMMUTABLE: Ciclo ativo não permite alteração de budget, período, metas ou forecast. Crie uma nova versão/ciclo.');
        }
      }

      const updatedCycle: CommercialExecutionCycle = {
        ...currentCycle,
        title: req.body.title ? String(req.body.title).trim() : currentCycle.title,
        notes: req.body.notes !== undefined ? req.body.notes : currentCycle.notes,
        ...(currentCycle.status === 'draft' ? {
          periodStart: req.body.periodStart ? formatDateToYMD(req.body.periodStart) : currentCycle.periodStart,
          periodEnd: req.body.periodEnd ? formatDateToYMD(req.body.periodEnd) : currentCycle.periodEnd,
          budgetId: req.body.budgetId || currentCycle.budgetId,
          linkedGoalIds: req.body.linkedGoalIds !== undefined ? req.body.linkedGoalIds : currentCycle.linkedGoalIds,
          linkedForecastId: req.body.linkedForecastId !== undefined ? req.body.linkedForecastId : currentCycle.linkedForecastId,
        } : {}),
        updatedAt: new Date().toISOString()
      };

      tx.set(cycleRef, updatedCycle);

      appendExecutionEventTx(tx, db, id, 'cycle_updated', operatorUid, operatorEmail, operatorName, {
        before: currentCycle,
        after: updatedCycle,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { cycle: updatedCycle };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [EXECUTION-CYCLE-UPDATE-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('CYCLE_IMMUTABLE') || err.message?.includes('ACTIVE_CYCLE_STRUCTURAL_IMMUTABLE')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao atualizar ciclo de execução' });
  }
}

// =========================================================================
// 6. POST /api/admin/commercial/execution-cycles/:id/activate (ACTIVATE)
// =========================================================================
export async function activateCommercialExecutionCycleController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório para ativação de ciclo' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`cycle_act_${id}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }

      const currentCycle = cycleDoc.data() as CommercialExecutionCycle;
      if (currentCycle.status === 'active') {
        const responsePayload = { cycle: currentCycle, message: 'Ciclo já ativo.' };
        tx.set(idempRef, {
          keyHash,
          payloadFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          responseStatus: 200,
          responsePayload
        });
        result = { replayed: false, status: 200, payload: responsePayload };
        return;
      }

      if (currentCycle.status !== 'draft') {
        throw new Error(`INVALID_STATE_TRANSITION: Apenas ciclos em 'draft' podem ser ativados (atual: ${currentCycle.status}).`);
      }

      // Buscar e congelar o snapshot do Budget
      const budgetDoc = await tx.get(db.collection('commercial_budgets').doc(currentCycle.budgetId));
      if (!budgetDoc.exists) {
        throw new Error(`BUDGET_NOT_FOUND: Budget ${currentCycle.budgetId} não encontrado.`);
      }

      const budgetData = budgetDoc.data();
      const budgetSnapshot: BudgetExecutionSnapshot = {
        budgetId: currentCycle.budgetId,
        budgetVersion: budgetData.version || 1,
        targetRevenue: budgetData.targetRevenue || 0,
        targetContributionMargin: budgetData.targetContributionMargin || 0,
        targetOperatingProfit: budgetData.targetOperatingProfit || 0,
        targetUnits: budgetData.targetUnits || 0,
        targetAverageTicket: budgetData.targetAverageTicket || 0,
        lineAllocations: budgetData.lineAllocations || [],
        linkedGoalIds: budgetData.linkedGoalIds || [],
        capturedAt: new Date().toISOString()
      };

      // Buscar e congelar snapshots das Metas Vinculadas
      const goalSnapshots: GoalExecutionSnapshot[] = [];
      if (currentCycle.linkedGoalIds && currentCycle.linkedGoalIds.length > 0) {
        for (const goalId of currentCycle.linkedGoalIds) {
          const gDoc = await tx.get(db.collection('commercial_goals').doc(goalId));
          if (gDoc.exists) {
            const gData = gDoc.data() as CommercialGoal;
            goalSnapshots.push({
              goalId: gDoc.id,
              title: gData.title,
              type: gData.type,
              targetValue: gData.targetValue,
              period: gData.period,
              startDate: gData.startDate,
              endDate: gData.endDate
            });
          }
        }
      }

      const activatedCycle: CommercialExecutionCycle = {
        ...currentCycle,
        status: 'active',
        budgetExecutionSnapshot: budgetSnapshot,
        goalExecutionSnapshots: goalSnapshots,
        activatedAt: new Date().toISOString(),
        activatedBy: operatorUid,
        updatedAt: new Date().toISOString()
      };

      tx.set(cycleRef, activatedCycle);

      appendExecutionEventTx(tx, db, id, 'cycle_activated', operatorUid, operatorEmail, operatorName, {
        before: currentCycle,
        after: activatedCycle,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { cycle: activatedCycle };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [EXECUTION-CYCLE-ACTIVATE-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('INVALID_STATE_TRANSITION')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('CYCLE_NOT_FOUND') || err.message?.includes('BUDGET_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao ativar ciclo de execução' });
  }
}

// =========================================================================
// 7. POST /api/admin/commercial/execution-cycles/:id/complete (COMPLETE CYCLE)
// =========================================================================
export async function completeCommercialExecutionCycleController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório para conclusão de ciclo' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`cycle_comp_${id}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }

      const currentCycle = cycleDoc.data() as CommercialExecutionCycle;
      if (currentCycle.status === 'completed') {
        const responsePayload = { cycle: currentCycle, message: 'Ciclo já concluído.' };
        tx.set(idempRef, {
          keyHash,
          payloadFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          responseStatus: 200,
          responsePayload
        });
        result = { replayed: false, status: 200, payload: responsePayload };
        return;
      }

      if (currentCycle.status !== 'active') {
        throw new Error(`INVALID_STATE_TRANSITION: Apenas ciclos em 'active' podem ser concluídos (atual: ${currentCycle.status}).`);
      }

      const completedCycle: CommercialExecutionCycle = {
        ...currentCycle,
        status: 'completed',
        completedAt: new Date().toISOString(),
        completedBy: operatorUid,
        updatedAt: new Date().toISOString()
      };

      tx.set(cycleRef, completedCycle);

      appendExecutionEventTx(tx, db, id, 'cycle_completed', operatorUid, operatorEmail, operatorName, {
        before: currentCycle,
        after: completedCycle,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { cycle: completedCycle };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [EXECUTION-CYCLE-COMPLETE-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('INVALID_STATE_TRANSITION')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao concluir ciclo de execução' });
  }
}

// =========================================================================
// 8. POST /api/admin/commercial/execution-cycles/:id/archive (ARCHIVE - APENAS COMPLETED)
// =========================================================================
export async function archiveCommercialExecutionCycleController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório para arquivamento de ciclo' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`cycle_arch_${id}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }

      const currentCycle = cycleDoc.data() as CommercialExecutionCycle;
      if (currentCycle.status === 'archived') {
        const responsePayload = { cycle: currentCycle, message: 'Ciclo já arquivado.' };
        tx.set(idempRef, {
          keyHash,
          payloadFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          responseStatus: 200,
          responsePayload
        });
        result = { replayed: false, status: 200, payload: responsePayload };
        return;
      }

      // Estrito: Apenas ciclos em completed podem ser arquivados
      if (currentCycle.status !== 'completed') {
        throw new Error(`INVALID_STATE_TRANSITION: Apenas ciclos em 'completed' podem ser arquivados (atual: ${currentCycle.status}).`);
      }

      const archivedCycle: CommercialExecutionCycle = {
        ...currentCycle,
        status: 'archived',
        archivedAt: new Date().toISOString(),
        archivedBy: operatorUid,
        updatedAt: new Date().toISOString()
      };

      tx.set(cycleRef, archivedCycle);

      appendExecutionEventTx(tx, db, id, 'cycle_archived', operatorUid, operatorEmail, operatorName, {
        before: currentCycle,
        after: archivedCycle,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { cycle: archivedCycle };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [EXECUTION-CYCLE-ARCHIVE-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('INVALID_STATE_TRANSITION')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao arquivar ciclo de execução' });
  }
}

// =========================================================================
// 9. GET /api/admin/commercial/execution-cycles/:id/dashboard (SERVER-SIDE CANONICAL DASHBOARD)
// =========================================================================
export async function getCommercialExecutionDashboardController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const { asOfDate } = req.query;

    const cycleDoc = await db.collection('commercial_execution_cycles').doc(id).get();
    if (!cycleDoc.exists) {
      return res.status(404).json({ error: 'Ciclo de execução não encontrado' });
    }

    const cycle = { id: cycleDoc.id, ...cycleDoc.data() } as CommercialExecutionCycle;
    const dashboard = await computeCanonicalDashboard(db, cycle, asOfDate ? String(asOfDate) : undefined);

    res.json({
      dashboard,
      ...dashboard
    });
  } catch (err: any) {
    logger.error('❌ [EXECUTION-DASHBOARD-GET-ERR]', err);
    res.status(500).json({ error: err.message || 'Erro ao calcular dashboard de execução comercial' });
  }
}

// =========================================================================
// 10. POST /api/admin/commercial/execution-cycles/:id/recalculate (RECÁLCULO REAL)
// =========================================================================
export async function recalculateCommercialExecutionCycleController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório para recálculo' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`cycle_recalc_${id}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }

      const cycle = { id: cycleDoc.id, ...cycleDoc.data() } as CommercialExecutionCycle;

      // Executa o recálculo canônico
      const dashboard = await computeCanonicalDashboard(db, cycle, req.body.asOfDate);

      appendExecutionEventTx(tx, db, id, 'cycle_updated', operatorUid, operatorEmail, operatorName, {
        metadata: {
          action: 'recalculate',
          healthStatus: dashboard.health.status,
          calculatedAt: dashboard.calculatedAt
        },
        idempotencyKeyHash: keyHash
      });

      const responsePayload = {
        cycle,
        dashboard,
        recalculatedAt: dashboard.calculatedAt
      };

      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [EXECUTION-CYCLE-RECALCULATE-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao recalcular ciclo de execução' });
  }
}

// =========================================================================
// 11. POST /api/admin/commercial/execution-cycles/:id/actions (ADD ACTION - COMPATÍVEL 9.6.4)
// =========================================================================
export async function addCommercialActionToCycleController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório para adicionar ação' });
    }

    const {
      title,
      description,
      priority = 'medium',
      productLine = 'ALL',
      plannedStartDate,
      plannedEndDate,
      ownerUid,
      ownerName,
      expectedImpact,
      sourceRecommendationId,
      sourceRecommendationSnapshot,
      type = 'custom',
      entityType = 'custom',
      entityId,
      entityName
    } = req.body;

    if (!title || !plannedStartDate || !plannedEndDate) {
      return res.status(400).json({ error: 'Campos obrigatórios: title, plannedStartDate, plannedEndDate' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`action_add_${id}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 201, payload: data.responsePayload };
        return;
      }

      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }

      const cycleData = cycleDoc.data() as CommercialExecutionCycle;
      if (cycleData.status === 'completed' || cycleData.status === 'archived') {
        throw new Error(`CYCLE_IMMUTABLE: Não é possível adicionar ações a um ciclo com status '${cycleData.status}'.`);
      }

      // Idempotência e Deduplicação Determinística por sourceRecommendationId via Lock Transacional
      let existingActionFromRec: any = null;
      let recLockRef: any = null;

      if (sourceRecommendationId) {
        const lockKey = `${id}:${String(sourceRecommendationId).trim()}`;
        const lockHash = crypto.createHash('sha256').update(lockKey).digest('hex');
        recLockRef = db.collection('commercial_action_recommendation_locks').doc(`rec_lock_${lockHash}`);
        const recLockDoc = await tx.get(recLockRef);
        if (recLockDoc.exists) {
          const lockData = recLockDoc.data();
          const existingActionDoc = await tx.get(db.collection('commercial_actions').doc(lockData.actionId));
          if (existingActionDoc.exists) {
            existingActionFromRec = { id: existingActionDoc.id, ...existingActionDoc.data() };
          }
        }
      }

      if (existingActionFromRec) {
        const responsePayload = { action: existingActionFromRec, message: 'Ação já vinculada para esta recomendação.' };
        tx.set(idempRef, {
          keyHash,
          payloadFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          responseStatus: 200,
          responsePayload
        });
        result = { replayed: true, status: 200, payload: responsePayload };
        return;
      }

      const actionRef = db.collection('commercial_actions').doc();
      const nowIso = new Date().toISOString();

      // Snapshot canônico da 9.6.4
      const defaultSnapshot: CommercialActionSourceSnapshot = sourceRecommendationSnapshot || {
        isHistoricalSnapshot: true,
        snapshotCapturedAt: nowIso,
        snapshotVersion: '1.0'
      };

      const newAction: CommercialExecutionActionItem = {
        id: actionRef.id,
        // Campos canônicos 9.6.4
        type: (type || 'custom') as CommercialActionType,
        entityType: entityType || (productLine && productLine !== 'ALL' ? 'line' : 'custom'),
        entityId: entityId || undefined,
        entityName: entityName || undefined,
        title: String(title).trim(),
        description: String(description || title).trim(),
        status: 'draft', // Sincronizado com 'planned'
        priority: (['low', 'medium', 'high', 'critical'].includes(priority) ? priority : 'medium') as CommercialActionPriority,
        source: sourceRecommendationId ? 'commercial_intelligence' : 'manual',
        sourceSnapshot: defaultSnapshot,
        createdAt: nowIso,
        createdBy: operatorUid,
        createdByName: operatorName,

        // Campos canônicos 9.6.7
        executionCycleId: id,
        budgetId: cycleData.budgetId,
        goalIds: cycleData.linkedGoalIds || [],
        forecastId: cycleData.linkedForecastId,
        productLine: productLine || 'ALL',
        ownerUid: ownerUid || undefined,
        ownerName: ownerName || undefined,
        executionStatus: 'planned',
        plannedStartDate: formatDateToYMD(plannedStartDate),
        plannedEndDate: formatDateToYMD(plannedEndDate),
        expectedImpact: expectedImpact || undefined,
        completionPercent: 0,
        sourceRecommendationId: sourceRecommendationId || undefined,
        sourceRecommendationSnapshot: sourceRecommendationSnapshot || undefined
      };

      tx.set(actionRef, newAction);
      if (recLockRef) {
        tx.set(recLockRef, {
          executionCycleId: id,
          sourceRecommendationId,
          actionId: actionRef.id,
          createdAt: nowIso
        });
      }

      appendExecutionEventTx(tx, db, id, 'action_added', operatorUid, operatorEmail, operatorName, {
        actionId: actionRef.id,
        after: newAction,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { action: newAction };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 201,
        responsePayload
      });

      result = { replayed: false, status: 201, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [ACTION-ADD-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('CYCLE_IMMUTABLE')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao adicionar ação ao ciclo de execução' });
  }
}

// =========================================================================
// 12. PATCH /api/admin/commercial/execution-cycles/:id/actions/:actionId
// =========================================================================
export async function updateCommercialActionController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id, actionId } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório para edição de ação' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`action_patch_${actionId}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      // Validar Cycle e Imutabilidade
      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }
      const cycle = cycleDoc.data() as CommercialExecutionCycle;
      if (cycle.status === 'completed' || cycle.status === 'archived') {
        throw new Error(`CYCLE_IMMUTABLE: Ciclo no estado '${cycle.status}' não permite alterações operacionais em ações.`);
      }

      const actionRef = db.collection('commercial_actions').doc(actionId);
      const actionDoc = await tx.get(actionRef);
      if (!actionDoc.exists) {
        throw new Error('ACTION_NOT_FOUND: Ação não encontrada.');
      }

      const currentAction = actionDoc.data() as CommercialExecutionActionItem;

      // Ownership check
      if (currentAction.executionCycleId && currentAction.executionCycleId !== id) {
        throw new Error('ACTION_CYCLE_MISMATCH: Ação não pertence a este ciclo de execução.');
      }

      if (currentAction.executionStatus === 'completed' || currentAction.executionStatus === 'cancelled') {
        throw new Error(`ACTION_TERMINAL_STATE: Ação com status '${currentAction.executionStatus}' não permite alteração de dados.`);
      }

      const updatedAction: CommercialExecutionActionItem = {
        ...currentAction,
        title: req.body.title ? String(req.body.title).trim() : currentAction.title,
        description: req.body.description !== undefined ? String(req.body.description).trim() : currentAction.description,
        priority: req.body.priority || currentAction.priority,
        productLine: req.body.productLine || currentAction.productLine,
        ownerUid: req.body.ownerUid !== undefined ? req.body.ownerUid : currentAction.ownerUid,
        ownerName: req.body.ownerName !== undefined ? req.body.ownerName : currentAction.ownerName,
        plannedStartDate: req.body.plannedStartDate ? formatDateToYMD(req.body.plannedStartDate) : currentAction.plannedStartDate,
        plannedEndDate: req.body.plannedEndDate ? formatDateToYMD(req.body.plannedEndDate) : currentAction.plannedEndDate,
        expectedImpact: req.body.expectedImpact !== undefined ? req.body.expectedImpact : currentAction.expectedImpact,
        completionPercent: typeof req.body.completionPercent === 'number' ? Math.max(0, Math.min(100, req.body.completionPercent)) : currentAction.completionPercent,
        executionNotes: req.body.executionNotes !== undefined ? req.body.executionNotes : currentAction.executionNotes,
        updatedAt: new Date().toISOString()
      };

      tx.set(actionRef, updatedAction);

      appendExecutionEventTx(tx, db, id, 'action_updated', operatorUid, operatorEmail, operatorName, {
        actionId,
        before: currentAction,
        after: updatedAction,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { action: updatedAction };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [ACTION-UPDATE-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('ACTION_CYCLE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'ACTION_CYCLE_MISMATCH' });
    }
    if (err.message?.includes('CYCLE_IMMUTABLE')) {
      return res.status(409).json({ error: err.message, code: 'CYCLE_IMMUTABLE' });
    }
    if (err.message?.includes('ACTION_TERMINAL_STATE')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('ACTION_NOT_FOUND') || err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao atualizar ação comercial' });
  }
}

// =========================================================================
// 13. POST /api/admin/commercial/execution-cycles/:id/actions/:actionId/ready (PLANNED -> READY)
// =========================================================================
export async function readyCommercialActionController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id, actionId } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`action_rdy_${actionId}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      // Validar Cycle e Imutabilidade
      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }
      const cycle = cycleDoc.data() as CommercialExecutionCycle;
      if (cycle.status === 'completed' || cycle.status === 'archived') {
        throw new Error(`CYCLE_IMMUTABLE: Ciclo no estado '${cycle.status}' não permite alterações operacionais em ações.`);
      }

      const actionRef = db.collection('commercial_actions').doc(actionId);
      const actionDoc = await tx.get(actionRef);
      if (!actionDoc.exists) {
        throw new Error('ACTION_NOT_FOUND: Ação não encontrada.');
      }

      const currentAction = actionDoc.data() as CommercialExecutionActionItem;

      // Ownership check
      if (currentAction.executionCycleId && currentAction.executionCycleId !== id) {
        throw new Error('ACTION_CYCLE_MISMATCH: Ação não pertence a este ciclo de execução.');
      }

      if (currentAction.executionStatus === 'ready') {
        const responsePayload = { action: currentAction, message: 'Ação já pronta (ready).' };
        tx.set(idempRef, {
          keyHash,
          payloadFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          responseStatus: 200,
          responsePayload
        });
        result = { replayed: false, status: 200, payload: responsePayload };
        return;
      }

      // Transição estrita: apenas a partir de planned
      if (currentAction.executionStatus !== 'planned') {
        throw new Error(`INVALID_STATE_TRANSITION: Transição inválida para ready a partir de '${currentAction.executionStatus}'.`);
      }

      const nowIso = new Date().toISOString();
      const updatedAction: CommercialExecutionActionItem = {
        ...currentAction,
        executionStatus: 'ready',
        status: 'approved', // Sincronia canônica 9.6.4
        approvedAt: nowIso,
        approvedBy: operatorUid,
        approvedByName: operatorName,
        updatedAt: nowIso
      };

      tx.set(actionRef, updatedAction);

      appendExecutionEventTx(tx, db, id, 'action_ready', operatorUid, operatorEmail, operatorName, {
        actionId,
        before: currentAction,
        after: updatedAction,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { action: updatedAction };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [ACTION-READY-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('ACTION_CYCLE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'ACTION_CYCLE_MISMATCH' });
    }
    if (err.message?.includes('CYCLE_IMMUTABLE')) {
      return res.status(409).json({ error: err.message, code: 'CYCLE_IMMUTABLE' });
    }
    if (err.message?.includes('INVALID_STATE_TRANSITION')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('ACTION_NOT_FOUND') || err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao definir ação como pronta' });
  }
}

// =========================================================================
// 14. POST /api/admin/commercial/execution-cycles/:id/actions/:actionId/start (READY -> IN_PROGRESS)
// =========================================================================
export async function startCommercialActionController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id, actionId } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`action_start_${actionId}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      // Validar Cycle e Imutabilidade
      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }
      const cycle = cycleDoc.data() as CommercialExecutionCycle;
      if (cycle.status === 'completed' || cycle.status === 'archived') {
        throw new Error(`CYCLE_IMMUTABLE: Ciclo no estado '${cycle.status}' não permite alterações operacionais em ações.`);
      }

      const actionRef = db.collection('commercial_actions').doc(actionId);
      const actionDoc = await tx.get(actionRef);
      if (!actionDoc.exists) {
        throw new Error('ACTION_NOT_FOUND: Ação não encontrada.');
      }

      const currentAction = actionDoc.data() as CommercialExecutionActionItem;

      // Ownership check
      if (currentAction.executionCycleId && currentAction.executionCycleId !== id) {
        throw new Error('ACTION_CYCLE_MISMATCH: Ação não pertence a este ciclo de execução.');
      }

      if (currentAction.executionStatus === 'in_progress') {
        const responsePayload = { action: currentAction, message: 'Ação já em andamento.' };
        tx.set(idempRef, {
          keyHash,
          payloadFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          responseStatus: 200,
          responsePayload
        });
        result = { replayed: false, status: 200, payload: responsePayload };
        return;
      }

      // Transição estrita: apenas a partir de ready (não permite direto de planned)
      if (currentAction.executionStatus !== 'ready') {
        throw new Error(`INVALID_STATE_TRANSITION: Transição inválida para start a partir de '${currentAction.executionStatus}'. Ação deve estar em 'ready' antes de iniciar.`);
      }

      const nowIso = new Date().toISOString();
      const updatedAction: CommercialExecutionActionItem = {
        ...currentAction,
        executionStatus: 'in_progress',
        status: 'in_progress', // Sincronia canônica 9.6.4
        actualStartDate: currentAction.actualStartDate || nowIso,
        startedAt: nowIso,
        startedBy: operatorUid,
        startedByName: operatorName,
        updatedAt: nowIso
      };

      tx.set(actionRef, updatedAction);

      appendExecutionEventTx(tx, db, id, 'action_started', operatorUid, operatorEmail, operatorName, {
        actionId,
        before: currentAction,
        after: updatedAction,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { action: updatedAction };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [ACTION-START-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('ACTION_CYCLE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'ACTION_CYCLE_MISMATCH' });
    }
    if (err.message?.includes('CYCLE_IMMUTABLE')) {
      return res.status(409).json({ error: err.message, code: 'CYCLE_IMMUTABLE' });
    }
    if (err.message?.includes('INVALID_STATE_TRANSITION')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('ACTION_NOT_FOUND') || err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao iniciar ação' });
  }
}

// =========================================================================
// 15. POST /api/admin/commercial/execution-cycles/:id/actions/:actionId/block (IN_PROGRESS -> BLOCKED)
// =========================================================================
export async function blockCommercialActionController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id, actionId } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório' });
    }

    const blockingReason = req.body?.blockingReason || req.body?.reason;
    if (!blockingReason) {
      return res.status(400).json({ error: 'blockingReason é obrigatório para bloquear ação' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`action_block_${actionId}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      // Validar Cycle e Imutabilidade
      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }
      const cycle = cycleDoc.data() as CommercialExecutionCycle;
      if (cycle.status === 'completed' || cycle.status === 'archived') {
        throw new Error(`CYCLE_IMMUTABLE: Ciclo no estado '${cycle.status}' não permite alterações operacionais em ações.`);
      }

      const actionRef = db.collection('commercial_actions').doc(actionId);
      const actionDoc = await tx.get(actionRef);
      if (!actionDoc.exists) {
        throw new Error('ACTION_NOT_FOUND: Ação não encontrada.');
      }

      const currentAction = actionDoc.data() as CommercialExecutionActionItem;

      // Ownership check
      if (currentAction.executionCycleId && currentAction.executionCycleId !== id) {
        throw new Error('ACTION_CYCLE_MISMATCH: Ação não pertence a este ciclo de execução.');
      }

      if (currentAction.executionStatus === 'blocked') {
        const responsePayload = { action: currentAction, message: 'Ação já bloqueada.' };
        tx.set(idempRef, {
          keyHash,
          payloadFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          responseStatus: 200,
          responsePayload
        });
        result = { replayed: false, status: 200, payload: responsePayload };
        return;
      }

      if (currentAction.executionStatus !== 'in_progress') {
        throw new Error(`INVALID_STATE_TRANSITION: Apenas ações em 'in_progress' podem ser bloqueadas (atual: ${currentAction.executionStatus}).`);
      }

      const updatedAction: CommercialExecutionActionItem = {
        ...currentAction,
        executionStatus: 'blocked',
        blockingReason: String(blockingReason).trim(),
        updatedAt: new Date().toISOString()
      };

      tx.set(actionRef, updatedAction);

      appendExecutionEventTx(tx, db, id, 'action_blocked', operatorUid, operatorEmail, operatorName, {
        actionId,
        before: currentAction,
        after: updatedAction,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { action: updatedAction };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [ACTION-BLOCK-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('ACTION_CYCLE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'ACTION_CYCLE_MISMATCH' });
    }
    if (err.message?.includes('CYCLE_IMMUTABLE')) {
      return res.status(409).json({ error: err.message, code: 'CYCLE_IMMUTABLE' });
    }
    if (err.message?.includes('INVALID_STATE_TRANSITION')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('ACTION_NOT_FOUND') || err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao bloquear ação' });
  }
}

// =========================================================================
// 16. POST /api/admin/commercial/execution-cycles/:id/actions/:actionId/unblock (BLOCKED -> IN_PROGRESS)
// =========================================================================
export async function unblockCommercialActionController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id, actionId } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`action_unblock_${actionId}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      // Validar Cycle e Imutabilidade
      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }
      const cycle = cycleDoc.data() as CommercialExecutionCycle;
      if (cycle.status === 'completed' || cycle.status === 'archived') {
        throw new Error(`CYCLE_IMMUTABLE: Ciclo no estado '${cycle.status}' não permite alterações operacionais em ações.`);
      }

      const actionRef = db.collection('commercial_actions').doc(actionId);
      const actionDoc = await tx.get(actionRef);
      if (!actionDoc.exists) {
        throw new Error('ACTION_NOT_FOUND: Ação não encontrada.');
      }

      const currentAction = actionDoc.data() as CommercialExecutionActionItem;

      // Ownership check
      if (currentAction.executionCycleId && currentAction.executionCycleId !== id) {
        throw new Error('ACTION_CYCLE_MISMATCH: Ação não pertence a este ciclo de execução.');
      }

      if (currentAction.executionStatus !== 'blocked') {
        throw new Error(`INVALID_STATE_TRANSITION: Apenas ações em 'blocked' podem ser desbloqueadas (atual: ${currentAction.executionStatus}).`);
      }

      const updatedAction: CommercialExecutionActionItem = {
        ...currentAction,
        executionStatus: 'in_progress',
        blockingReason: undefined,
        updatedAt: new Date().toISOString()
      };

      tx.set(actionRef, updatedAction);

      appendExecutionEventTx(tx, db, id, 'action_unblocked', operatorUid, operatorEmail, operatorName, {
        actionId,
        before: currentAction,
        after: updatedAction,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { action: updatedAction };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [ACTION-UNBLOCK-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('ACTION_CYCLE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'ACTION_CYCLE_MISMATCH' });
    }
    if (err.message?.includes('CYCLE_IMMUTABLE')) {
      return res.status(409).json({ error: err.message, code: 'CYCLE_IMMUTABLE' });
    }
    if (err.message?.includes('INVALID_STATE_TRANSITION')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('ACTION_NOT_FOUND') || err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao desbloquear ação' });
  }
}

/**
 * Helper interno para identificar a linha canônica de um item do pedido
 */
function resolveItemCanonicalLine(item: any, productCatalog: any[] = []): string {
  const direct = item.line || item.productLine;
  if (direct) return String(direct).trim().toUpperCase();
  const searchKeys = [item.productId, item.slug, item.id, item.parentSlug].filter(Boolean);
  const found = Array.isArray(productCatalog)
    ? productCatalog.find((p: any) => searchKeys.includes(p.id) || searchKeys.includes(p.slug))
    : undefined;
  if (found && (found.line || found.productLine)) {
    return String(found.line || found.productLine).trim().toUpperCase();
  }
  const name = String(item.name || item.slug || '').toLowerCase();
  if (name.includes('force')) return 'FORCE';
  if (name.includes('mark')) return 'MARK';
  if (name.includes('prime')) return 'PRIME';
  return 'OTHER';
}

/**
 * Constrói uma representação scoped proporcional de um pedido para itens elegíveis de uma ação comercial.
 * Rateia rigorosamente receita bruta, receita paga, estornos (refunds), taxas de gateway, frete e outros custos variáveis.
 */
export function buildFinanciallyScopedOrder(
  originalOrder: any,
  eligibleItems: any[],
  share: number
): any {
  const scopedGross = eligibleItems.reduce(
    (acc, it) => acc + (Number(it.price || it.unitPrice || 0) * Math.max(1, Number(it.quantity) || 1)),
    0
  );

  const originalPaid = getOrderPaidAmount(originalOrder);
  const originalTotal = getOrderTotal(originalOrder);
  const originalRefund = getOrderRefundedAmount(originalOrder);
  const originalShipping = getOrderShippingFinances(originalOrder);
  const originalGatewayFee = (originalOrder.payment?.gatewayFee !== undefined && originalOrder.payment?.gatewayFee !== null && !isNaN(Number(originalOrder.payment.gatewayFee)))
    ? Number(originalOrder.payment.gatewayFee)
    : getOrderGatewayFee(originalOrder).fee;
  const originalOtherVariable = Number(originalOrder.otherVariableCosts || originalOrder.pricing?.otherVariableCosts || 0);

  const scopedPaid = roundMoney(originalPaid * share);
  const scopedTotal = roundMoney(originalTotal * share);
  const scopedRefund = roundMoney(originalRefund * share);
  const scopedGatewayFee = roundMoney(originalGatewayFee * share);
  const scopedShippingCharged = roundMoney(originalShipping.shippingCharged * share);
  const scopedShippingActualCost = roundMoney(originalShipping.shippingActualCost * share);
  const scopedShippingSubsidy = roundMoney(originalShipping.shippingSubsidy * share);
  const scopedOtherVariable = roundMoney(originalOtherVariable * share);

  return {
    ...originalOrder,
    id: originalOrder.id || originalOrder.orderId,
    items: eligibleItems,
    pricing: {
      ...(originalOrder.pricing || {}),
      total: scopedTotal,
      subtotal: roundMoney(scopedGross),
      shipping: scopedShippingCharged,
      shippingActualCost: scopedShippingActualCost,
      refundedAmount: scopedRefund,
      otherVariableCosts: scopedOtherVariable
    },
    payment: {
      ...(originalOrder.payment || {}),
      paidAmount: scopedPaid,
      refundedAmount: scopedRefund,
      gatewayFee: scopedGatewayFee
    },
    shippingFinances: {
      shippingCharged: scopedShippingCharged,
      shippingCost: scopedShippingActualCost,
      shippingActualCost: scopedShippingActualCost,
      shippingSubsidy: scopedShippingSubsidy
    },
    shipping: {
      ...(typeof originalOrder.shipping === 'object' ? originalOrder.shipping : {}),
      shippingSubsidy: scopedShippingSubsidy,
      cost: scopedShippingActualCost,
      charged: scopedShippingCharged
    },
    shippingCost: scopedShippingActualCost,
    shippingDetails: {
      ...(originalOrder.shippingDetails || {}),
      actualCost: scopedShippingActualCost
    },
    frete: scopedShippingCharged,
    total: scopedTotal,
    totalAmount: scopedTotal,
    paidAmount: scopedPaid,
    amountPaid: scopedPaid,
    refundedAmount: scopedRefund,
    gatewayFee: scopedGatewayFee,
    otherVariableCosts: scopedOtherVariable
  };
}

/**
 * Calcula o Impacto Realizado Server-Side de uma Ação Comercial
 * Utiliza o motor financeiro canônico e DRE real sem nenhuma fórmula artificial (sem 40%, sem 45%, sem 70%).
 * Respeita isolamento estrito de linha de produto (mesmo em atribuição direta) e governança de custo.
 */
export function computeActionActualImpactCanonical(params: {
  action: CommercialExecutionActionItem;
  dataset: {
    orders: any[];
    expenses: any[];
    investments: any[];
    traffic: any[];
    products: any[];
  };
  startDate: string;
  endDate: string;
}): CommercialActionActualImpact {
  const { action, dataset, startDate, endDate } = params;

  const filteredOrders = (dataset.orders || []).filter((o: any) => {
    if (!o) return false;
    const paymentStatus = o.paymentStatus || o.status;
    if (['cancelled', 'refunded', 'rejected', 'pending', 'Cancelado'].includes(paymentStatus)) {
      return false;
    }
    const orderDate = formatDateToYMD(o.createdAt || o.date || o.timestamp);
    return orderDate >= startDate && orderDate <= endDate;
  });

  const trackingIdentifier = (action as any).actionTrackingId || (action as any).campaignId || (action as any).couponId || (action as any).promotionId || (action as any).couponCode;
  const targetProductLine = (action.productLine && action.productLine !== 'ALL') ? action.productLine.toUpperCase() : null;

  // Identificar se houve match determinístico direto em qualquer pedido ou item
  let isDirectDeterministic = false;
  if (trackingIdentifier) {
    const anyOrderMatched = filteredOrders.some((o: any) => {
      const oMatch = Boolean(
        o.couponCode === trackingIdentifier ||
        o.campaignId === trackingIdentifier ||
        o.actionTrackingId === trackingIdentifier ||
        o.pricing?.couponCode === trackingIdentifier ||
        (o as any).promotionId === trackingIdentifier
      );
      const iMatch = Array.isArray(o.items) && o.items.some((i: any) => (
        i.actionTrackingId === trackingIdentifier ||
        i.campaignId === trackingIdentifier ||
        i.couponCode === trackingIdentifier ||
        i.promotionId === trackingIdentifier
      ));
      return oMatch || iMatch;
    });
    if (anyOrderMatched) {
      isDirectDeterministic = true;
    }
  }

  // Construir scopedOrders respeitando separação de Order-Level Tracking vs Item-Level Tracking
  const scopedOrders: any[] = [];

  for (const o of filteredOrders) {
    const allItems = (Array.isArray(o.items) && o.items.length > 0)
      ? o.items
      : [{ id: o.id || 'item_default', name: 'Item', price: getOrderPaidAmount(o) || getOrderTotal(o) || 0, quantity: 1, line: 'OTHER' }];

    const orderHasTracking = Boolean(
      trackingIdentifier && (
        o.couponCode === trackingIdentifier ||
        o.campaignId === trackingIdentifier ||
        o.actionTrackingId === trackingIdentifier ||
        o.pricing?.couponCode === trackingIdentifier ||
        (o as any).promotionId === trackingIdentifier
      )
    );

    let eligibleItems: any[] = [];

    if (trackingIdentifier) {
      if (orderHasTracking) {
        // ORDER-LEVEL TRACKING: usar todos os itens compatíveis com targetProductLine
        eligibleItems = targetProductLine
          ? allItems.filter((i: any) => resolveItemCanonicalLine(i, dataset.products) === targetProductLine)
          : allItems;
      } else {
        // ITEM-LEVEL TRACKING: match SOMENTE no item -> usar SOMENTE os itens com o identificador e compatíveis com targetProductLine
        eligibleItems = allItems.filter((i: any) => {
          const itemHasTracking = (
            i.actionTrackingId === trackingIdentifier ||
            i.campaignId === trackingIdentifier ||
            i.couponCode === trackingIdentifier ||
            i.promotionId === trackingIdentifier
          );
          if (!itemHasTracking) return false;
          if (targetProductLine) {
            return resolveItemCanonicalLine(i, dataset.products) === targetProductLine;
          }
          return true;
        });
      }
    } else {
      // Sem tracking identifier: aplicar targetProductLine se especificado
      eligibleItems = targetProductLine
        ? allItems.filter((i: any) => resolveItemCanonicalLine(i, dataset.products) === targetProductLine)
        : allItems;
    }

    if (eligibleItems.length > 0) {
      if (eligibleItems.length === allItems.length) {
        scopedOrders.push({ ...o, items: allItems });
      } else {
        // Criar scopedOrder com rateio proporcional exato das variáveis financeiras do pedido
        const originalGross = allItems.reduce((acc, it) => acc + (Number(it.price || it.unitPrice || 0) * Math.max(1, Number(it.quantity) || 1)), 0);
        const scopedGross = eligibleItems.reduce((acc, it) => acc + (Number(it.price || it.unitPrice || 0) * Math.max(1, Number(it.quantity) || 1)), 0);
        const share = originalGross > 0 ? Math.min(1, scopedGross / originalGross) : 1;

        const scopedOrder = buildFinanciallyScopedOrder(o, eligibleItems, share);
        scopedOrders.push(scopedOrder);
      }
    }
  }

  let attribution: CommercialImpactAttribution = 'correlated';
  if (isDirectDeterministic) {
    attribution = 'direct';
  } else if (scopedOrders.length === 0) {
    attribution = 'insufficient';
  } else if (targetProductLine) {
    attribution = 'correlated';
  } else {
    attribution = 'estimated';
  }

  if (scopedOrders.length === 0 || attribution === 'insufficient') {
    return {
      revenue: 0,
      orders: 0,
      units: 0,
      averageTicket: 0,
      contributionMargin: undefined,
      operatingProfit: undefined,
      costCoveragePercent: 0,
      comparisonWindowStart: startDate,
      comparisonWindowEnd: endDate,
      calculationMethod: 'canonical_order_dataset_aggregation',
      confidence: 'insufficient',
      impactAttribution: 'insufficient',
      notes: `Sem dados financeiros suficientes na janela observada (${startDate} a ${endDate}).`
    };
  }

  // Avaliar governança de custos em todos os itens elegíveis
  let totalItemsEvaluated = 0;
  let completeCostItems = 0;
  let estimatedCostItems = 0;
  let unavailableCostItems = 0;

  scopedOrders.forEach(o => {
    (o.items || []).forEach((item: any) => {
      totalItemsEvaluated++;
      const costInfo = getOrderItemCost(item, dataset.products);
      if (costInfo.costCoverage === 'unavailable' || costInfo.unitCost <= 0) {
        unavailableCostItems++;
      } else if (costInfo.costCoverage === 'estimated' || costInfo.isEstimated) {
        estimatedCostItems++;
      } else {
        completeCostItems++;
      }
    });
  });

  const costCoveragePercent = totalItemsEvaluated > 0
    ? roundPercent((completeCostItems / totalItemsEvaluated) * 100)
    : 0;

  const hasMissingCost = unavailableCostItems > 0 || totalItemsEvaluated === 0;
  const confidence: 'high' | 'medium' | 'low' | 'insufficient' = hasMissingCost
    ? 'insufficient'
    : (estimatedCostItems > 0 ? 'medium' : (attribution === 'direct' ? 'high' : 'medium'));

  // Executar Motores Canônicos certificados sobre os pedidos elegíveis
  const ordersProfitability = scopedOrders.map(order =>
    calculateOrderProfitability(order, dataset.products)
  );

  const productsProfitability = calculateProductProfitability(
    scopedOrders,
    dataset.products
  );

  const lineAggregates = aggregateProfitabilityByLine(
    productsProfitability,
    ordersProfitability
  );

  let actRev = 0;
  let actUnits = 0;
  let actCm = 0;

  if (targetProductLine) {
    const lineAgg = lineAggregates.find(l => String(l.lineName).toUpperCase() === targetProductLine);
    if (lineAgg) {
      actRev = roundMoney(lineAgg.netRevenue ?? lineAgg.grossRevenue ?? 0);
      actUnits = lineAgg.unitsSold || 0;
      actCm = roundMoney(lineAgg.contributionMargin || 0);
    } else {
      const lineProds = productsProfitability.filter(p => String(p.line).toUpperCase() === targetProductLine);
      actRev = roundMoney(lineProds.reduce((acc, p) => acc + (p.netRevenue ?? p.grossRevenue ?? 0), 0));
      actUnits = lineProds.reduce((acc, p) => acc + (p.unitsSold || 0), 0);
      actCm = roundMoney(lineProds.reduce((acc, p) => acc + (p.contributionMargin || 0), 0));
    }
  } else {
    actRev = roundMoney(productsProfitability.reduce((acc, p) => acc + (p.netRevenue ?? p.grossRevenue ?? 0), 0));
    actUnits = productsProfitability.reduce((acc, p) => acc + (p.unitsSold || 0), 0);
    actCm = roundMoney(productsProfitability.reduce((acc, p) => acc + (p.contributionMargin || 0), 0));
  }

  const eligibleOrdersCount = scopedOrders.length;
  const actAvgTicket = eligibleOrdersCount > 0 ? roundMoney(actRev / eligibleOrdersCount) : 0;

  if (hasMissingCost) {
    return {
      revenue: actRev,
      orders: eligibleOrdersCount,
      units: actUnits,
      averageTicket: actAvgTicket,
      contributionMargin: undefined,
      operatingProfit: undefined,
      costCoveragePercent,
      comparisonWindowStart: startDate,
      comparisonWindowEnd: endDate,
      calculationMethod: 'canonical_order_dataset_aggregation',
      confidence: 'insufficient',
      impactAttribution: attribution,
      notes: attribution === 'direct'
        ? `Impacto direto apurado sobre ${eligibleOrdersCount} pedido(s) rastreado(s) com tracking '${trackingIdentifier}' (${startDate} a ${endDate}). Dados de custo de mercadoria insuficientes.`
        : `Resultado observado no período (${startDate} a ${endDate}) com ${eligibleOrdersCount} pedidos elegíveis. Dados de custo de mercadoria insuficientes.`
    };
  }

  // Rateio de despesas operacionais da janela para cálculo de operatingProfit
  const windowExpenses = (dataset.expenses || []).filter((e: any) => {
    if (e.status === 'voided' || e.status === 'cancelled') return false;
    const expDate = formatDateToYMD(e.date || e.paymentDate || e.createdAt);
    return expDate >= startDate && expDate <= endDate;
  });

  const windowTraffic = (dataset.traffic || []).filter((t: any) => {
    if (t.status === 'voided') return false;
    const trafDate = formatDateToYMD(t.date || t.createdAt);
    return trafDate >= startDate && trafDate <= endDate;
  });

  const windowDre = calculateFinancialDRE(filteredOrders, windowExpenses, dataset.investments, windowTraffic, dataset.products);
  const totalDreRev = windowDre.netReceived || windowDre.grossRevenue || 1;
  const actionShare = Math.min(1, actRev / Math.max(1, totalDreRev));
  const actionFixed = roundMoney(windowDre.fixedExpenses * actionShare);
  const actionMarketing = roundMoney(windowDre.marketingExpenses * actionShare);
  const actionOperatingProfit = roundMoney(calculateOperatingResult({
    contributionMargin: actCm,
    fixedExpenses: actionFixed,
    marketingExpenses: actionMarketing
  }));

  return {
    revenue: actRev,
    orders: eligibleOrdersCount,
    units: actUnits,
    averageTicket: actAvgTicket,
    contributionMargin: actCm,
    operatingProfit: actionOperatingProfit,
    costCoveragePercent,
    comparisonWindowStart: startDate,
    comparisonWindowEnd: endDate,
    calculationMethod: 'canonical_order_dataset_aggregation',
    confidence,
    impactAttribution: attribution,
    notes: attribution === 'direct'
      ? `Impacto direto apurado exclusivamente sobre ${eligibleOrdersCount} pedido(s) rastreado(s) com tracking '${trackingIdentifier}' (${startDate} a ${endDate}).`
      : (targetProductLine
        ? `Resultado observado no período (${startDate} a ${endDate}) para a linha ${action.productLine} com ${eligibleOrdersCount} pedidos elegíveis.`
        : `Resultado observado no período (${startDate} a ${endDate}) via DRE Canônico com ${eligibleOrdersCount} pedidos elegíveis.`)
  };
}

// =========================================================================
// 17. POST /api/admin/commercial/execution-cycles/:id/actions/:actionId/complete (IN_PROGRESS -> COMPLETED)
// FRONTEND NÃO É AUTORIDADE PARA actualImpact!
// =========================================================================
export async function completeCommercialActionController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id, actionId } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório' });
    }

    const { executionNotes } = req.body; // actualImpact NÃO É ACEITO DO FRONTEND!

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`action_comp_${actionId}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      // Validar Cycle e Imutabilidade
      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }
      const cycle = cycleDoc.data() as CommercialExecutionCycle;
      if (cycle.status === 'completed' || cycle.status === 'archived') {
        throw new Error(`CYCLE_IMMUTABLE: Ciclo no estado '${cycle.status}' não permite alterações operacionais em ações.`);
      }

      const actionRef = db.collection('commercial_actions').doc(actionId);
      const actionDoc = await tx.get(actionRef);
      if (!actionDoc.exists) {
        throw new Error('ACTION_NOT_FOUND: Ação não encontrada.');
      }

      const currentAction = actionDoc.data() as CommercialExecutionActionItem;

      // Ownership check
      if (currentAction.executionCycleId && currentAction.executionCycleId !== id) {
        throw new Error('ACTION_CYCLE_MISMATCH: Ação não pertence a este ciclo de execução.');
      }

      if (currentAction.executionStatus === 'completed') {
        const responsePayload = { action: currentAction, message: 'Ação já concluída.' };
        tx.set(idempRef, {
          keyHash,
          payloadFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          responseStatus: 200,
          responsePayload
        });
        result = { replayed: false, status: 200, payload: responsePayload };
        return;
      }

      // Transição estrita: apenas de in_progress (não permite de ready direto para complete!)
      if (currentAction.executionStatus !== 'in_progress') {
        throw new Error(`INVALID_STATE_TRANSITION: Transição inválida para complete a partir de '${currentAction.executionStatus}'. Ação deve estar em 'in_progress' para ser concluída.`);
      }

      const nowIso = new Date().toISOString();
      const startDate = formatDateToYMD(currentAction.actualStartDate || currentAction.plannedStartDate);
      const endDate = formatDateToYMD(nowIso);

      // Calcular Impacto Realizado Server-Side via motor canônico
      const dataset = await fetchCommercialDataset(db, startDate, endDate);
      const computedImpact = computeActionActualImpactCanonical({
        action: currentAction,
        dataset,
        startDate,
        endDate
      });

      const updatedAction: CommercialExecutionActionItem = {
        ...currentAction,
        executionStatus: 'completed',
        status: 'completed', // Sincronia canônica 9.6.4
        completionPercent: 100,
        actualCompletedAt: nowIso,
        completedAt: nowIso,
        completedBy: operatorUid,
        completedByName: operatorName,
        executionNotes: executionNotes !== undefined ? executionNotes : currentAction.executionNotes,
        actualImpact: computedImpact,
        updatedAt: nowIso
      };

      tx.set(actionRef, updatedAction);

      appendExecutionEventTx(tx, db, id, 'action_completed', operatorUid, operatorEmail, operatorName, {
        actionId,
        before: currentAction,
        after: updatedAction,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { action: updatedAction };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [ACTION-COMPLETE-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('ACTION_CYCLE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'ACTION_CYCLE_MISMATCH' });
    }
    if (err.message?.includes('CYCLE_IMMUTABLE')) {
      return res.status(409).json({ error: err.message, code: 'CYCLE_IMMUTABLE' });
    }
    if (err.message?.includes('INVALID_STATE_TRANSITION')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('ACTION_NOT_FOUND') || err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao concluir ação' });
  }
}

// =========================================================================
// 18. POST /api/admin/commercial/execution-cycles/:id/actions/:actionId/cancel (CANCEL ACTION)
// =========================================================================
export async function cancelCommercialActionController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id, actionId } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório' });
    }

    const { cancelReason } = req.body;

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`action_cancel_${actionId}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      // Validar Cycle e Imutabilidade
      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }
      const cycle = cycleDoc.data() as CommercialExecutionCycle;
      if (cycle.status === 'completed' || cycle.status === 'archived') {
        throw new Error(`CYCLE_IMMUTABLE: Ciclo no estado '${cycle.status}' não permite alterações operacionais em ações.`);
      }

      const actionRef = db.collection('commercial_actions').doc(actionId);
      const actionDoc = await tx.get(actionRef);
      if (!actionDoc.exists) {
        throw new Error('ACTION_NOT_FOUND: Ação não encontrada.');
      }

      const currentAction = actionDoc.data() as CommercialExecutionActionItem;

      // Ownership check
      if (currentAction.executionCycleId && currentAction.executionCycleId !== id) {
        throw new Error('ACTION_CYCLE_MISMATCH: Ação não pertence a este ciclo de execução.');
      }

      if (currentAction.executionStatus === 'cancelled') {
        const responsePayload = { action: currentAction, message: 'Ação já cancelada.' };
        tx.set(idempRef, {
          keyHash,
          payloadFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          responseStatus: 200,
          responsePayload
        });
        result = { replayed: false, status: 200, payload: responsePayload };
        return;
      }

      if (currentAction.executionStatus === 'completed') {
        throw new Error('INVALID_STATE_TRANSITION: Ações concluídas não podem ser canceladas.');
      }

      const nowIso = new Date().toISOString();
      const updatedAction: CommercialExecutionActionItem = {
        ...currentAction,
        executionStatus: 'cancelled',
        status: 'cancelled', // Sincronia canônica 9.6.4
        cancelledAt: nowIso,
        cancelledBy: operatorUid,
        cancelledByName: operatorName,
        cancelReason: cancelReason || undefined,
        executionNotes: cancelReason ? `Cancelada: ${cancelReason}` : currentAction.executionNotes,
        updatedAt: nowIso
      };

      tx.set(actionRef, updatedAction);

      appendExecutionEventTx(tx, db, id, 'action_cancelled', operatorUid, operatorEmail, operatorName, {
        actionId,
        before: currentAction,
        after: updatedAction,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { action: updatedAction };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [ACTION-CANCEL-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('ACTION_CYCLE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'ACTION_CYCLE_MISMATCH' });
    }
    if (err.message?.includes('CYCLE_IMMUTABLE')) {
      return res.status(409).json({ error: err.message, code: 'CYCLE_IMMUTABLE' });
    }
    if (err.message?.includes('INVALID_STATE_TRANSITION')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes('ACTION_NOT_FOUND') || err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao cancelar ação' });
  }
}

// =========================================================================
// 19. POST /api/admin/commercial/execution-cycles/:id/actions/:actionId/recalculate-impact
// =========================================================================
export async function recalculateCommercialActionImpactController(req: Request, res: Response) {
  try {
    const db = resolveDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id, actionId } = req.params;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Header Idempotency-Key é obrigatório' });
    }

    const keyHash = hashKey(idempotencyKey);
    const fingerprint = computePayloadFingerprint(req.body);
    const idempRef = db.collection('idempotency_records').doc(`action_recalc_${actionId}_${keyHash}`);

    const operatorUid = (req as any).user?.uid || 'admin';
    const operatorEmail = (req as any).user?.email || 'fpacstore@gmail.com';
    const operatorName = (req as any).user?.name || 'Administrador';

    let result: any = null;

    await db.runTransaction(async (tx: any) => {
      const idempDoc = await tx.get(idempRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data.payloadFingerprint !== fingerprint) {
          throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH: Chave de idempotência reutilizada com payload divergente.');
        }
        result = { replayed: true, status: data.responseStatus || 200, payload: data.responsePayload };
        return;
      }

      // Validar Cycle e Action
      const cycleRef = db.collection('commercial_execution_cycles').doc(id);
      const cycleDoc = await tx.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error('CYCLE_NOT_FOUND: Ciclo de execução não encontrado.');
      }

      const actionRef = db.collection('commercial_actions').doc(actionId);
      const actionDoc = await tx.get(actionRef);
      if (!actionDoc.exists) {
        throw new Error('ACTION_NOT_FOUND: Ação não encontrada.');
      }

      const currentAction = actionDoc.data() as CommercialExecutionActionItem;

      // Ownership check
      if (currentAction.executionCycleId && currentAction.executionCycleId !== id) {
        throw new Error('ACTION_CYCLE_MISMATCH: Ação não pertence a este ciclo de execução.');
      }

      // Cálculo server-side do impacto real observado na janela temporal
      const startDate = formatDateToYMD(currentAction.actualStartDate || currentAction.plannedStartDate);
      const endDate = currentAction.actualCompletedAt 
        ? formatDateToYMD(currentAction.actualCompletedAt) 
        : formatDateToYMD(new Date());

      // Busca dados reais na janela da ação usando range queries e motor canônico
      const dataset = await fetchCommercialDataset(db, startDate, endDate);
      const computedImpact = computeActionActualImpactCanonical({
        action: currentAction,
        dataset,
        startDate,
        endDate
      });

      const updatedAction: CommercialExecutionActionItem = {
        ...currentAction,
        actualImpact: computedImpact,
        updatedAt: new Date().toISOString()
      };

      tx.set(actionRef, updatedAction);

      appendExecutionEventTx(tx, db, id, 'impact_recalculated', operatorUid, operatorEmail, operatorName, {
        actionId,
        after: updatedAction,
        idempotencyKeyHash: keyHash
      });

      const responsePayload = { action: updatedAction };
      tx.set(idempRef, {
        keyHash,
        payloadFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        responseStatus: 200,
        responsePayload
      });

      result = { replayed: false, status: 200, payload: responsePayload };
    });

    res.status(result.status).json(result.payload);
  } catch (err: any) {
    logger.error('❌ [ACTION-RECALCULATE-IMPACT-ERR]', err);
    if (err.message?.includes('IDEMPOTENCY_KEY_REUSE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' });
    }
    if (err.message?.includes('ACTION_CYCLE_MISMATCH')) {
      return res.status(409).json({ error: err.message, code: 'ACTION_CYCLE_MISMATCH' });
    }
    if (err.message?.includes('ACTION_NOT_FOUND') || err.message?.includes('CYCLE_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erro ao recalcular impacto da ação' });
  }
}

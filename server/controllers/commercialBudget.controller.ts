/**
 * CONTROLLER CANÔNICO DE ORÇAMENTO COMERCIAL & GUARDRAILS FINANCEIROS
 * FASE 9.6.6 — FPAC Store
 *
 * Fornece endpoints autenticados e protegidos para:
 * - Criação de Orçamento com Idempotência Persistida e Snapshots Imutáveis
 * - Atualização (PATCH), Ativação, Recálculo e Arquivamento com Auditoria Append-Only
 * - Transações atômicas no Firestore com bloqueio de concorrência e replay idempotente
 * - Reconciliações 3-Way / 4-Way (Real vs Budget vs Forecast vs Goal)
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../firebase.js';
import { logger } from '../utils/logger.js';
import {
  generateCommercialBudget,
  buildBudgetBaselineSnapshot,
  recalculateCommercialBudgetActuals,
  createApprovedBudgetSnapshot,
  createRebudgetVersion,
  generateCommercialBudgetLineAllocations,
  normalizeBudgetAllocations,
  calculateOperatingResult,
  roundMoney,
  roundPercent
} from '../../src/utils/commercialBudget.js';
import {
  CommercialBudget,
  CommercialBudgetEvent,
  BudgetStatus,
  BudgetApprovedSnapshot,
  CommercialBudgetAllocations,
  CommercialBudgetLineAllocation,
  LineAllocationMethod,
  CommercialBudgetGuardrails
} from '../../src/types/commercialBudget.js';

// Suporte a injeção de Mock DB para testes unitários/integração
let customBudgetDb: any = null;

export function setCommercialBudgetDb(db: any) {
  customBudgetDb = db;
}

function resolveDb() {
  return customBudgetDb || getDb();
}

/**
 * Gerenciamento interno de relógio para testes
 */
let budgetClockFn: () => Date = () => new Date();

export function setBudgetClockForTests(fn: (() => Date) | null) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setBudgetClockForTests is only permitted in test environment (NODE_ENV=test)');
  }
  budgetClockFn = fn || (() => new Date());
}

export function getBudgetClock(): Date {
  return budgetClockFn();
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
 * - Independente da ordem original das propriedades
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
      .filter(k => k !== 'idempotencyKey' && value[k] !== undefined)
      .sort();
    const entries = keys.map(k => `${JSON.stringify(k)}:${stableCanonicalize(value[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(String(value));
}

/**
 * Utilitário SHA256 para Fingerprint Canônico Recursivo do Payload de Requisição
 */
export function computePayloadFingerprint(payload: any): string {
  if (!payload || typeof payload !== 'object') {
    return crypto.createHash('sha256').update(String(payload ?? '')).digest('hex');
  }
  const canonicalString = stableCanonicalize(payload);
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Extrai idempotency key de headers ou body
 */
function extractIdempotencyKey(req: Request): string | null {
  const headerKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string;
  const bodyKey = req.body?.idempotencyKey as string;
  return headerKey || bodyKey || null;
}

/**
 * Utilitário de busca de dados no Firestore sem Full Scan
 */
async function fetchBudgetDataset(db: any, startDateStr: string, endDateStr: string) {
  const startIsoString = startDateStr.includes('T') ? startDateStr : `${startDateStr}T00:00:00.000Z`;
  const endIsoString = endDateStr.includes('T') ? endDateStr : `${endDateStr}T23:59:59.999Z`;

  const startDateObj = new Date(startIsoString);
  const endDateObj = new Date(endIsoString);

  let startTimestamp: any;
  let endTimestamp: any;

  try {
    startTimestamp = Timestamp.fromDate(startDateObj);
    endTimestamp = Timestamp.fromDate(endDateObj);
  } catch {
    startTimestamp = {
      seconds: Math.floor(startDateObj.getTime() / 1000),
      nanoseconds: (startDateObj.getTime() % 1000) * 1000000,
      toDate: () => startDateObj,
      toMillis: () => startDateObj.getTime()
    };
    endTimestamp = {
      seconds: Math.floor(endDateObj.getTime() / 1000),
      nanoseconds: (endDateObj.getTime() % 1000) * 1000000,
      toDate: () => endDateObj,
      toMillis: () => endDateObj.getTime()
    };
  }

  const [
    ordersStringSnap,
    ordersTimestampSnap,
    cashflowSnap,
    trafficSnap,
    investmentsSnap,
    productsSnap
  ] = await Promise.all([
    db.collection('orders')
      .where('createdAt', '>=', startIsoString)
      .where('createdAt', '<=', endIsoString)
      .get(),
    db.collection('orders')
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', endTimestamp)
      .get(),
    db.collection('financial_cashflow')
      .where('date', '>=', startDateStr.split('T')[0])
      .where('date', '<=', endDateStr.split('T')[0])
      .get(),
    db.collection('financial_traffic')
      .where('date', '>=', startDateStr.split('T')[0])
      .where('date', '<=', endDateStr.split('T')[0])
      .get(),
    db.collection('financial_investments')
      .where('date', '>=', startDateStr.split('T')[0])
      .where('date', '<=', endDateStr.split('T')[0])
      .get(),
    db.collection('products').get()
  ]);

  // Deduplicação dos pedidos por ID
  const ordersMap = new Map<string, any>();
  ordersStringSnap.docs.forEach((doc: any) => ordersMap.set(doc.id, { id: doc.id, ...doc.data() }));
  ordersTimestampSnap.docs.forEach((doc: any) => ordersMap.set(doc.id, { id: doc.id, ...doc.data() }));
  const orders = Array.from(ordersMap.values());

  const expenses = cashflowSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  const traffic = trafficSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  const investments = investmentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  const products = productsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  return { orders, expenses, traffic, investments, products };
}

/**
 * GET /api/admin/commercial-budgets
 * Lista orçamentos comerciais com filtros opcionais
 */
export async function getCommercialBudgetsController(req: Request, res: Response): Promise<void> {
  try {
    const db = resolveDb();
    const { status, period } = req.query;

    let query = db.collection('commercial_budgets');

    if (status && typeof status === 'string') {
      query = query.where('status', '==', status);
    }
    if (period && typeof period === 'string') {
      query = query.where('period', '==', period);
    }

    const snapshot = await query.get();
    const budgets: CommercialBudget[] = [];

    snapshot.forEach((doc: any) => {
      budgets.push({ id: doc.id, ...doc.data() } as CommercialBudget);
    });

    // Ordenar decrescente por createdAt
    budgets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.status(200).json({ success: true, count: budgets.length, budgets });
  } catch (error: any) {
    logger.error('Erro ao listar orçamentos comerciais:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro interno no servidor' });
  }
}

/**
 * GET /api/admin/commercial-budgets/:id
 */
export async function getCommercialBudgetByIdController(req: Request, res: Response): Promise<void> {
  try {
    const db = resolveDb();
    const { id } = req.params;

    const doc = await db.collection('commercial_budgets').doc(id).get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Orçamento comercial não encontrado' });
      return;
    }

    res.status(200).json({ success: true, budget: { id: doc.id, ...doc.data() } });
  } catch (error: any) {
    logger.error(`Erro ao buscar orçamento comercial ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Erro interno no servidor' });
  }
}

/**
 * GET /api/admin/commercial-budgets/:id/events
 */
export async function getCommercialBudgetEventsController(req: Request, res: Response): Promise<void> {
  try {
    const db = resolveDb();
    const { id } = req.params;

    const snapshot = await db.collection('commercial_budget_events')
      .where('budgetId', '==', id)
      .get();

    const events: CommercialBudgetEvent[] = [];
    snapshot.forEach((doc: any) => {
      events.push({ id: doc.id, ...doc.data() } as CommercialBudgetEvent);
    });

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.status(200).json({ success: true, count: events.length, events });
  } catch (error: any) {
    logger.error(`Erro ao buscar eventos do orçamento ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Erro interno no servidor' });
  }
}

/**
 * POST /api/admin/commercial-budgets
 * Criação atômica e idempotente de Orçamento Comercial
 */
export async function createCommercialBudgetController(req: Request, res: Response): Promise<void> {
  const idempotencyKey = extractIdempotencyKey(req);
  if (!idempotencyKey) {
    res.status(400).json({
      success: false,
      error: 'Idempotency-Key é obrigatória para criação de orçamento comercial',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
    return;
  }

  const db = resolveDb();
  const hashedKey = hashKey(idempotencyKey);
  const currentFingerprint = computePayloadFingerprint(req.body);
  const idempotencyDocRef = db.collection('idempotency_records').doc(`budget_create_${hashedKey}`);

  try {
    let resultBudget: CommercialBudget | null = null;
    let isReplay = false;

    await db.runTransaction(async (transaction: any) => {
      const idempDoc = await transaction.get(idempotencyDocRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data && data.responsePayload) {
          resultBudget = data.responsePayload;
          isReplay = true;
          return;
        }
      }

      const {
        title,
        description,
        period,
        startDate,
        endDate,
        sourceStartDate,
        sourceEndDate,
        targetRevenue,
        allocations,
        guardrails,
        linkedForecastId,
        linkedGoalId,
        linkedGoalIds,
        lineAllocationMethod,
        customLineAllocations,
        lineAllocations
      } = req.body;

      if (!title || !startDate || !endDate || targetRevenue === undefined || !allocations) {
        throw new Error('MISSING_REQUIRED_FIELDS');
      }

      // Buscar datasets relacionados se vinculados
      let linkedForecast: any = undefined;
      if (linkedForecastId) {
        const fcDoc = await transaction.get(db.collection('commercial_forecasts').doc(linkedForecastId));
        if (fcDoc.exists) {
          linkedForecast = { id: fcDoc.id, ...fcDoc.data() };
        }
      }

      // Suporte a linkedGoalIds (array canônico) e linkedGoalId (legado)
      const allGoalIds: string[] = [];
      if (Array.isArray(linkedGoalIds)) {
        allGoalIds.push(...linkedGoalIds.filter(Boolean));
      }
      if (linkedGoalId && !allGoalIds.includes(linkedGoalId)) {
        allGoalIds.push(linkedGoalId);
      }

      let loadedGoals: any[] = [];
      if (allGoalIds.length > 0) {
        const goalDocs = await Promise.all(
          allGoalIds.map(gid => transaction.get(db.collection('commercial_goals').doc(gid)))
        );
        loadedGoals = goalDocs
          .filter((d: any) => d && d.exists)
          .map((d: any) => ({ id: d.id, ...d.data() }));
      }

      const { orders, expenses, traffic, investments, products } = await fetchBudgetDataset(
        db,
        sourceStartDate || startDate,
        sourceEndDate || endDate
      );

      const budgetId = `budget_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const nowIso = getBudgetClock().toISOString();

      const newBudget = generateCommercialBudget({
        id: budgetId,
        title,
        description,
        period,
        startDate,
        endDate,
        sourceStartDate,
        sourceEndDate,
        targetRevenue: Number(targetRevenue),
        allocations,
        guardrails,
        lineAllocationMethod,
        customLineAllocations: customLineAllocations || lineAllocations,
        linkedForecastId,
        linkedGoalId: allGoalIds[0] || linkedGoalId,
        linkedGoalIds: allGoalIds,
        orders,
        expenses,
        investments,
        traffic,
        productCatalog: products,
        forecast: linkedForecast,
        goal: loadedGoals[0],
        goals: loadedGoals,
        createdBy: (req as any).user?.email || 'admin',
        asOfDate: nowIso
      });

      const budgetRef = db.collection('commercial_budgets').doc(budgetId);
      transaction.set(budgetRef, newBudget);

      // Evento de Auditoria Append-Only
      const eventId = `ev_budget_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const eventRef = db.collection('commercial_budget_events').doc(eventId);
      const auditEvent: CommercialBudgetEvent = {
        id: eventId,
        budgetId,
        type: 'created',
        performedBy: (req as any).user?.email || 'admin',
        timestamp: nowIso,
        payload: {
          targetRevenue: newBudget.targetRevenue,
          totalExpensesBudget: newBudget.allocations.totalExpensesBudget,
          targetContributionMargin: newBudget.targetContributionMargin,
          targetOperatingProfit: newBudget.targetOperatingProfit
        }
      };
      transaction.set(eventRef, auditEvent);

      // Registrar Idempotência com requestFingerprint
      transaction.set(idempotencyDocRef, {
        id: `budget_create_${hashedKey}`,
        keyHash: hashedKey,
        requestFingerprint: currentFingerprint,
        action: 'CREATE_COMMERCIAL_BUDGET',
        responsePayload: newBudget,
        createdAt: nowIso
      });

      resultBudget = newBudget;
    });

    if (isReplay) {
      res.status(200).json({
        success: true,
        budget: resultBudget,
        idempotentReplay: true
      });
      return;
    }

    res.status(201).json({
      success: true,
      budget: resultBudget
    });
  } catch (error: any) {
    if (error.message === 'IDEMPOTENCY_KEY_REUSE_MISMATCH') {
      res.status(409).json({
        success: false,
        error: 'Idempotency-Key reutilizada com payload diferente',
        code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH'
      });
      return;
    }
    if (error.message === 'MISSING_REQUIRED_FIELDS') {
      res.status(400).json({
        success: false,
        error: 'Campos obrigatórios ausentes: title, startDate, endDate, targetRevenue, allocations'
      });
      return;
    }
    logger.error('Erro na criação de orçamento comercial:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro interno no servidor' });
  }
}

/**
 * PATCH /api/admin/commercial-budgets/:id
 * Atualiza campos cadastrais, targets ou guardrails de um orçamento mantendo baseline imutável
 */
export async function updateCommercialBudgetController(req: Request, res: Response): Promise<void> {
  const idempotencyKey = extractIdempotencyKey(req);
  if (!idempotencyKey) {
    res.status(400).json({
      success: false,
      error: 'Idempotency-Key é obrigatória para atualizar orçamento comercial',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
    return;
  }

  const db = resolveDb();
  const { id } = req.params;
  const hashedKey = hashKey(idempotencyKey);
  const currentFingerprint = computePayloadFingerprint(req.body);
  const idempotencyDocRef = db.collection('idempotency_records').doc(`budget_patch_${id}_${hashedKey}`);

  try {
    let resultBudget: CommercialBudget | null = null;
    let isReplay = false;

    await db.runTransaction(async (transaction: any) => {
      const idempDoc = await transaction.get(idempotencyDocRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data) {
          if (data.requestFingerprint && data.requestFingerprint !== currentFingerprint) {
            throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH');
          }
          if (data.responsePayload) {
            resultBudget = data.responsePayload;
            isReplay = true;
            return;
          }
        }
      }

      const budgetRef = db.collection('commercial_budgets').doc(id);
      const budgetDoc = await transaction.get(budgetRef);
      if (!budgetDoc.exists) {
        throw new Error('BUDGET_NOT_FOUND');
      }

      const currentBudget = budgetDoc.data() as CommercialBudget;

      const {
        title,
        description,
        targetRevenue,
        allocations,
        guardrails,
        lineAllocationMethod,
        lineAllocations
      } = req.body;

      // Hardening 9.6.6-F: Orçamento ativo é imutável em metas, alocações e método de alocação (exige Rebudget)
      if (currentBudget.status === 'active') {
        if (targetRevenue !== undefined || allocations !== undefined || guardrails !== undefined || lineAllocations !== undefined || lineAllocationMethod !== undefined) {
          throw new Error('ACTIVE_BUDGET_IMMUTABLE');
        }
      }

      // Hardening 9.6.6-F: Orçamentos completed ou archived são imutáveis em metas, alocações e método (409 BUDGET_NOT_EDITABLE)
      if (currentBudget.status === 'completed' || currentBudget.status === 'archived') {
        if (targetRevenue !== undefined || allocations !== undefined || guardrails !== undefined || lineAllocations !== undefined || lineAllocationMethod !== undefined) {
          throw new Error('BUDGET_NOT_EDITABLE');
        }
      }

      const nowIso = getBudgetClock().toISOString();

      const updatedAllocations: CommercialBudgetAllocations = allocations
        ? normalizeBudgetAllocations({
            ...currentBudget.allocations,
            ...allocations
          })
        : currentBudget.allocations;

      const finalTargetRevenue = targetRevenue !== undefined ? Number(targetRevenue) : currentBudget.targetRevenue;

      // CM Canônica: Revenue - COGS - Gateway - Shipping Subsidy - Order Other Variable Costs
      // Administrative Variable NÃO entra na Margem de Contribuição
      const targetContributionMargin = roundMoney(
        finalTargetRevenue -
        (updatedAllocations.cogsBudget || 0) -
        (updatedAllocations.gatewayFeesBudget || 0) -
        (updatedAllocations.shippingSubsidyBudget || 0) -
        (updatedAllocations.orderOtherVariableCostsBudget || 0)
      );

      const targetContributionMarginPercent = finalTargetRevenue > 0
        ? roundPercent((targetContributionMargin / finalTargetRevenue) * 100)
        : 0;

      // OP Canônico via calculateOperatingResult
      const targetOperatingProfit = calculateOperatingResult({
        contributionMargin: targetContributionMargin,
        administrativeVariableExpenses: updatedAllocations.administrativeVariableExpensesBudget,
        fixedExpenses: updatedAllocations.fixedExpensesBudget,
        marketingExpenses: updatedAllocations.trafficBudget,
        otherExpenses: updatedAllocations.otherExpensesBudget
      });

      const targetOperatingProfitPercent = finalTargetRevenue > 0
        ? roundPercent((targetOperatingProfit / finalTargetRevenue) * 100)
        : 0;

      let finalLineAllocations = currentBudget.lineAllocations;
      if (lineAllocations) {
        const generatedLines = generateCommercialBudgetLineAllocations({
          targetRevenue: finalTargetRevenue,
          cogsBudget: updatedAllocations.cogsBudget || 0,
          targetContributionMargin,
          targetUnits: currentBudget.targetUnits || 0,
          method: 'manual',
          customLineAllocations: lineAllocations
        });
        finalLineAllocations = generatedLines.lineAllocations;
      } else if (currentBudget.lineAllocations && currentBudget.lineAllocations.length > 0 && currentBudget.targetRevenue > 0 && finalTargetRevenue !== currentBudget.targetRevenue) {
        const ratio = finalTargetRevenue / currentBudget.targetRevenue;
        finalLineAllocations = currentBudget.lineAllocations.map(l => ({
          ...l,
          targetRevenue: roundMoney(l.targetRevenue * ratio),
          targetCogs: roundMoney(l.targetCogs * ratio),
          targetContributionMargin: roundMoney(l.targetContributionMargin * ratio),
          targetUnits: Math.round(l.targetUnits * ratio)
        }));
      }

      const updatedBudget: CommercialBudget = {
        ...currentBudget,
        title: title || currentBudget.title,
        description: description !== undefined ? description : currentBudget.description,
        targetRevenue: finalTargetRevenue,
        targetContributionMargin,
        targetContributionMarginPercent,
        targetOperatingProfit,
        targetOperatingProfitPercent,
        allocations: updatedAllocations,
        lineAllocationMethod: lineAllocationMethod || currentBudget.lineAllocationMethod,
        lineAllocations: finalLineAllocations,
        guardrails: guardrails ? { ...currentBudget.guardrails, ...guardrails } : currentBudget.guardrails,
        // BASELINE E FORECAST SNAPSHOT PERMANECEM ESTRITAMENTE IMUTÁVEIS
        baselineSnapshot: currentBudget.baselineSnapshot,
        forecastSnapshot: currentBudget.forecastSnapshot,
        updatedAt: nowIso
      };

      transaction.update(budgetRef, updatedBudget);

      // Evento de Auditoria Append-Only
      const eventId = `ev_budget_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const eventRef = db.collection('commercial_budget_events').doc(eventId);
      const auditEvent: CommercialBudgetEvent = {
        id: eventId,
        budgetId: id,
        type: 'updated',
        performedBy: (req as any).user?.email || 'admin',
        timestamp: nowIso,
        payload: req.body
      };
      transaction.set(eventRef, auditEvent);

      transaction.set(idempotencyDocRef, {
        id: `budget_patch_${id}_${hashedKey}`,
        keyHash: hashedKey,
        requestFingerprint: currentFingerprint,
        action: 'UPDATE_COMMERCIAL_BUDGET',
        responsePayload: updatedBudget,
        createdAt: nowIso
      });

      resultBudget = updatedBudget;
    });

    if (isReplay) {
      res.status(200).json({ success: true, budget: resultBudget, idempotentReplay: true });
      return;
    }

    res.status(200).json({ success: true, budget: resultBudget });
  } catch (error: any) {
    if (error.message === 'IDEMPOTENCY_KEY_REUSE_MISMATCH') {
      res.status(409).json({
        success: false,
        error: 'Idempotency-Key reutilizada com payload diferente',
        code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH'
      });
      return;
    }
    if (error.message === 'ACTIVE_BUDGET_IMMUTABLE') {
      res.status(409).json({
        success: false,
        error: 'Orçamento ativo é imutável em metas e alocações. Para alterar metas, realize um Rebudget.',
        code: 'ACTIVE_BUDGET_IMMUTABLE'
      });
      return;
    }
    if (error.message === 'BUDGET_NOT_EDITABLE') {
      res.status(409).json({
        success: false,
        error: 'Orçamentos finalizados (completed) ou arquivados (archived) não podem ser alterados.',
        code: 'BUDGET_NOT_EDITABLE'
      });
      return;
    }
    if (error.message === 'BUDGET_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Orçamento comercial não encontrado' });
      return;
    }
    console.error('UpdateBudgetError:', error);
    logger.error(`Erro ao atualizar orçamento ${id}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Erro interno no servidor' });
  }
}

/**
 * POST /api/admin/commercial-budgets/:id/activate
 * Ativa o orçamento comercial e congela o Approved Snapshot imutável
 */
export async function activateCommercialBudgetController(req: Request, res: Response): Promise<void> {
  const idempotencyKey = extractIdempotencyKey(req);
  if (!idempotencyKey) {
    res.status(400).json({
      success: false,
      error: 'Idempotency-Key é obrigatória para ativar orçamento comercial',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
    return;
  }

  const db = resolveDb();
  const { id } = req.params;
  const hashedKey = hashKey(idempotencyKey);
  const currentFingerprint = computePayloadFingerprint(req.body);
  const idempotencyDocRef = db.collection('idempotency_records').doc(`budget_activate_${id}_${hashedKey}`);

  try {
    let resultBudget: CommercialBudget | null = null;
    let isReplay = false;

    await db.runTransaction(async (transaction: any) => {
      const idempDoc = await transaction.get(idempotencyDocRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data) {
          if (data.requestFingerprint && data.requestFingerprint !== currentFingerprint) {
            throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH');
          }
          if (data.responsePayload) {
            resultBudget = data.responsePayload;
            isReplay = true;
            return;
          }
        }
      }

      const budgetRef = db.collection('commercial_budgets').doc(id);
      const budgetDoc = await transaction.get(budgetRef);
      if (!budgetDoc.exists) {
        throw new Error('BUDGET_NOT_FOUND');
      }

      const currentBudget = budgetDoc.data() as CommercialBudget;
      const nowIso = getBudgetClock().toISOString();
      const performedBy = (req as any).user?.email || 'admin';

      const approvedSnapshot = createApprovedBudgetSnapshot(currentBudget, performedBy);

      const updatedBudget: CommercialBudget = {
        ...currentBudget,
        status: 'active',
        approvedSnapshot,
        activatedAt: nowIso,
        updatedAt: nowIso
      };

      transaction.update(budgetRef, {
        status: 'active',
        approvedSnapshot,
        activatedAt: nowIso,
        updatedAt: nowIso
      });

      const eventId = `ev_budget_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const eventRef = db.collection('commercial_budget_events').doc(eventId);
      const auditEvent: CommercialBudgetEvent = {
        id: eventId,
        budgetId: id,
        type: 'activated',
        performedBy,
        timestamp: nowIso,
        payload: {
          approvedSnapshot
        }
      };
      transaction.set(eventRef, auditEvent);

      transaction.set(idempotencyDocRef, {
        id: `budget_activate_${id}_${hashedKey}`,
        keyHash: hashedKey,
        requestFingerprint: currentFingerprint,
        action: 'ACTIVATE_COMMERCIAL_BUDGET',
        responsePayload: updatedBudget,
        createdAt: nowIso
      });

      resultBudget = updatedBudget;
    });

    if (isReplay) {
      res.status(200).json({ success: true, budget: resultBudget, idempotentReplay: true });
      return;
    }

    res.status(200).json({ success: true, budget: resultBudget });
  } catch (error: any) {
    if (error.message === 'IDEMPOTENCY_KEY_REUSE_MISMATCH') {
      res.status(409).json({
        success: false,
        error: 'Idempotency-Key reutilizada com payload diferente',
        code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH'
      });
      return;
    }
    if (error.message === 'BUDGET_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Orçamento comercial não encontrado' });
      return;
    }
    logger.error(`Erro ao ativar orçamento ${id}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Erro interno no servidor' });
  }
}

/**
 * POST /api/admin/commercial-budgets/:id/rebudget
 * Cria uma nova versão/revisão (Rebudgeting) a partir de um orçamento existente
 */
export async function rebudgetCommercialBudgetController(req: Request, res: Response): Promise<void> {
  const idempotencyKey = extractIdempotencyKey(req);
  if (!idempotencyKey) {
    res.status(400).json({
      success: false,
      error: 'Idempotency-Key é obrigatória para realizar rebudgeting',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
    return;
  }

  const db = resolveDb();
  const { id } = req.params;
  const hashedKey = hashKey(idempotencyKey);
  const currentFingerprint = computePayloadFingerprint(req.body);
  const idempotencyDocRef = db.collection('idempotency_records').doc(`budget_rebudget_${id}_${hashedKey}`);

  try {
    let resultBudget: CommercialBudget | null = null;
    let isReplay = false;

    await db.runTransaction(async (transaction: any) => {
      const idempDoc = await transaction.get(idempotencyDocRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data) {
          if (data.requestFingerprint && data.requestFingerprint !== currentFingerprint) {
            throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH');
          }
          if (data.responsePayload) {
            resultBudget = data.responsePayload;
            isReplay = true;
            return;
          }
        }
      }

      const parentBudgetRef = db.collection('commercial_budgets').doc(id);
      const parentBudgetDoc = await transaction.get(parentBudgetRef);
      if (!parentBudgetDoc.exists) {
        throw new Error('BUDGET_NOT_FOUND');
      }

      const parentBudget = parentBudgetDoc.data() as CommercialBudget;

      const {
        title,
        description,
        targetRevenue,
        allocations,
        guardrails,
        lineAllocationMethod,
        customLineAllocations
      } = req.body;

      if (targetRevenue === undefined || !allocations) {
        throw new Error('MISSING_REQUIRED_FIELDS');
      }

      const { orders, expenses, traffic, investments, products } = await fetchBudgetDataset(
        db,
        parentBudget.baselineSnapshot?.sourceStartDate || parentBudget.startDate,
        parentBudget.baselineSnapshot?.sourceEndDate || parentBudget.endDate
      );

      let linkedForecast: any = undefined;
      if (parentBudget.linkedForecastId) {
        const fcDoc = await transaction.get(db.collection('commercial_forecasts').doc(parentBudget.linkedForecastId));
        if (fcDoc.exists) {
          linkedForecast = { id: fcDoc.id, ...fcDoc.data() };
        }
      }

      // Suporte a múltiplas metas no Rebudget
      const targetGoalIds: string[] = [];
      if (Array.isArray(parentBudget.linkedGoalIds)) {
        targetGoalIds.push(...parentBudget.linkedGoalIds.filter(Boolean));
      }
      if (parentBudget.linkedGoalId && !targetGoalIds.includes(parentBudget.linkedGoalId)) {
        targetGoalIds.push(parentBudget.linkedGoalId);
      }

      let loadedGoals: any[] = [];
      if (targetGoalIds.length > 0) {
        const goalDocs = await Promise.all(
          targetGoalIds.map(gid => transaction.get(db.collection('commercial_goals').doc(gid)))
        );
        loadedGoals = goalDocs
          .filter((d: any) => d && d.exists)
          .map((d: any) => ({ id: d.id, ...d.data() }));
      }

      const performedBy = (req as any).user?.email || 'admin';

      const newBudget = createRebudgetVersion(parentBudget, {
        title,
        description,
        targetRevenue: Number(targetRevenue),
        allocations,
        guardrails,
        lineAllocationMethod,
        customLineAllocations,
        orders,
        expenses,
        investments,
        traffic,
        productCatalog: products,
        forecast: linkedForecast,
        goal: loadedGoals[0],
        goals: loadedGoals,
        performedBy
      });

      const newBudgetRef = db.collection('commercial_budgets').doc(newBudget.id);
      transaction.set(newBudgetRef, newBudget);

      // Evento de Auditoria Append-Only
      const eventId = `ev_budget_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const eventRef = db.collection('commercial_budget_events').doc(eventId);
      const auditEvent: CommercialBudgetEvent = {
        id: eventId,
        budgetId: newBudget.id,
        type: 'rebudgeted',
        performedBy,
        timestamp: new Date().toISOString(),
        payload: {
          parentBudgetId: parentBudget.id,
          version: newBudget.version,
          newTargetRevenue: newBudget.targetRevenue
        }
      };
      transaction.set(eventRef, auditEvent);

      transaction.set(idempotencyDocRef, {
        id: `budget_rebudget_${id}_${hashedKey}`,
        keyHash: hashedKey,
        requestFingerprint: currentFingerprint,
        action: 'REBUDGET_COMMERCIAL_BUDGET',
        responsePayload: newBudget,
        createdAt: new Date().toISOString()
      });

      resultBudget = newBudget;
    });

    if (isReplay) {
      res.status(201).json({ success: true, budget: resultBudget, idempotentReplay: true });
      return;
    }

    res.status(201).json({ success: true, budget: resultBudget });
  } catch (error: any) {
    if (error.message === 'IDEMPOTENCY_KEY_REUSE_MISMATCH') {
      res.status(409).json({
        success: false,
        error: 'Idempotency-Key reutilizada com payload diferente',
        code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH'
      });
      return;
    }
    if (error.message === 'BUDGET_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Orçamento comercial pai não encontrado' });
      return;
    }
    if (error.message === 'MISSING_REQUIRED_FIELDS') {
      res.status(400).json({ success: false, error: 'targetRevenue e allocations são obrigatórios para rebudget' });
      return;
    }
    logger.error(`Erro ao realizar rebudget para ${id}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Erro interno no servidor' });
  }
}

/**
 * POST /api/admin/commercial-budgets/:id/recalculate
 * Recalcula o realizado e reconciliação mantendo o baseline histórico 100% imutável
 */
export async function recalculateCommercialBudgetController(req: Request, res: Response): Promise<void> {
  const idempotencyKey = extractIdempotencyKey(req);
  if (!idempotencyKey) {
    res.status(400).json({
      success: false,
      error: 'Idempotency-Key é obrigatória para recalcular orçamento comercial',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
    return;
  }

  const db = resolveDb();
  const { id } = req.params;
  const hashedKey = hashKey(idempotencyKey);
  const currentFingerprint = computePayloadFingerprint(req.body);
  const idempotencyDocRef = db.collection('idempotency_records').doc(`budget_recalc_${id}_${hashedKey}`);

  try {
    let resultBudget: CommercialBudget | null = null;
    let isReplay = false;

    await db.runTransaction(async (transaction: any) => {
      const idempDoc = await transaction.get(idempotencyDocRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data) {
          if (data.requestFingerprint && data.requestFingerprint !== currentFingerprint) {
            throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH');
          }
          if (data.responsePayload) {
            resultBudget = data.responsePayload;
            isReplay = true;
            return;
          }
        }
      }

      const budgetRef = db.collection('commercial_budgets').doc(id);
      const budgetDoc = await transaction.get(budgetRef);
      if (!budgetDoc.exists) {
        throw new Error('BUDGET_NOT_FOUND');
      }

      const currentBudget = budgetDoc.data() as CommercialBudget;
      const nowIso = getBudgetClock().toISOString();

      let linkedForecast: any = undefined;
      if (currentBudget.linkedForecastId) {
        const fcDoc = await transaction.get(db.collection('commercial_forecasts').doc(currentBudget.linkedForecastId));
        if (fcDoc.exists) {
          linkedForecast = { id: fcDoc.id, ...fcDoc.data() };
        }
      }

      // Suporte a múltiplas metas salvas no orçamento
      const targetGoalIds: string[] = [];
      if (Array.isArray(currentBudget.linkedGoalIds)) {
        targetGoalIds.push(...currentBudget.linkedGoalIds.filter(Boolean));
      }
      if (currentBudget.linkedGoalId && !targetGoalIds.includes(currentBudget.linkedGoalId)) {
        targetGoalIds.push(currentBudget.linkedGoalId);
      }

      let loadedGoals: any[] = [];
      if (targetGoalIds.length > 0) {
        const goalDocs = await Promise.all(
          targetGoalIds.map(gid => transaction.get(db.collection('commercial_goals').doc(gid)))
        );
        loadedGoals = goalDocs
          .filter((d: any) => d && d.exists)
          .map((d: any) => ({ id: d.id, ...d.data() }));
      }

      const { orders, expenses, traffic, investments, products } = await fetchBudgetDataset(
        db,
        currentBudget.startDate,
        currentBudget.endDate
      );

      const recalculated = recalculateCommercialBudgetActuals(currentBudget, {
        orders,
        expenses,
        investments,
        traffic,
        productCatalog: products,
        asOfDate: nowIso,
        forecast: linkedForecast,
        goal: loadedGoals[0],
        goals: loadedGoals
      });

      transaction.update(budgetRef, recalculated);

      const eventId = `ev_budget_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const eventRef = db.collection('commercial_budget_events').doc(eventId);
      const auditEvent: CommercialBudgetEvent = {
        id: eventId,
        budgetId: id,
        type: 'recalculated',
        performedBy: (req as any).user?.email || 'admin',
        timestamp: nowIso,
        payload: {
          revenue: recalculated.currentActuals.revenue,
          operatingProfit: recalculated.currentActuals.operatingProfit,
          totalExpenses: recalculated.currentActuals.totalExpenses,
          alertsCount: recalculated.reconciliation.alerts.length
        }
      };
      transaction.set(eventRef, auditEvent);

      transaction.set(idempotencyDocRef, {
        id: `budget_recalc_${id}_${hashedKey}`,
        keyHash: hashedKey,
        requestFingerprint: currentFingerprint,
        action: 'RECALCULATE_COMMERCIAL_BUDGET',
        responsePayload: recalculated,
        createdAt: nowIso
      });

      resultBudget = recalculated;
    });

    if (isReplay) {
      res.status(200).json({ success: true, budget: resultBudget, idempotentReplay: true });
      return;
    }

    res.status(200).json({ success: true, budget: resultBudget });
  } catch (error: any) {
    if (error.message === 'IDEMPOTENCY_KEY_REUSE_MISMATCH') {
      res.status(409).json({
        success: false,
        error: 'Idempotency-Key reutilizada com payload diferente',
        code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH'
      });
      return;
    }
    if (error.message === 'BUDGET_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Orçamento comercial não encontrado' });
      return;
    }
    logger.error(`Erro ao recalcular orçamento ${id}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Erro interno no servidor' });
  }
}

/**
 * POST /api/admin/commercial-budgets/:id/archive
 * Arquiva o orçamento comercial
 */
export async function archiveCommercialBudgetController(req: Request, res: Response): Promise<void> {
  const idempotencyKey = extractIdempotencyKey(req);
  if (!idempotencyKey) {
    res.status(400).json({
      success: false,
      error: 'Idempotency-Key é obrigatória para arquivar orçamento comercial',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
    return;
  }

  const db = resolveDb();
  const { id } = req.params;
  const hashedKey = hashKey(idempotencyKey);
  const currentFingerprint = computePayloadFingerprint(req.body);
  const idempotencyDocRef = db.collection('idempotency_records').doc(`budget_archive_${id}_${hashedKey}`);

  try {
    let resultBudget: CommercialBudget | null = null;
    let isReplay = false;

    await db.runTransaction(async (transaction: any) => {
      const idempDoc = await transaction.get(idempotencyDocRef);
      if (idempDoc.exists) {
        const data = idempDoc.data();
        if (data) {
          if (data.requestFingerprint && data.requestFingerprint !== currentFingerprint) {
            throw new Error('IDEMPOTENCY_KEY_REUSE_MISMATCH');
          }
          if (data.responsePayload) {
            resultBudget = data.responsePayload;
            isReplay = true;
            return;
          }
        }
      }

      const budgetRef = db.collection('commercial_budgets').doc(id);
      const budgetDoc = await transaction.get(budgetRef);
      if (!budgetDoc.exists) {
        throw new Error('BUDGET_NOT_FOUND');
      }

      const currentBudget = budgetDoc.data() as CommercialBudget;
      const nowIso = getBudgetClock().toISOString();

      const updatedBudget: CommercialBudget = {
        ...currentBudget,
        status: 'archived',
        archivedAt: nowIso,
        updatedAt: nowIso
      };

      transaction.update(budgetRef, {
        status: 'archived',
        archivedAt: nowIso,
        updatedAt: nowIso
      });

      const eventId = `ev_budget_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const eventRef = db.collection('commercial_budget_events').doc(eventId);
      const auditEvent: CommercialBudgetEvent = {
        id: eventId,
        budgetId: id,
        type: 'archived',
        performedBy: (req as any).user?.email || 'admin',
        timestamp: nowIso
      };
      transaction.set(eventRef, auditEvent);

      transaction.set(idempotencyDocRef, {
        id: `budget_archive_${id}_${hashedKey}`,
        keyHash: hashedKey,
        requestFingerprint: currentFingerprint,
        action: 'ARCHIVE_COMMERCIAL_BUDGET',
        responsePayload: updatedBudget,
        createdAt: nowIso
      });

      resultBudget = updatedBudget;
    });

    if (isReplay) {
      res.status(200).json({ success: true, budget: resultBudget, idempotentReplay: true });
      return;
    }

    res.status(200).json({ success: true, budget: resultBudget });
  } catch (error: any) {
    if (error.message === 'IDEMPOTENCY_KEY_REUSE_MISMATCH') {
      res.status(409).json({
        success: false,
        error: 'Idempotency-Key reutilizada com payload diferente',
        code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH'
      });
      return;
    }
    if (error.message === 'BUDGET_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Orçamento comercial não encontrado' });
      return;
    }
    logger.error(`Erro ao arquivar orçamento ${id}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Erro interno no servidor' });
  }
}

/**
 * GET /api/admin/commercial-budgets/baseline
 * Retorna preview do baseline de dados para criação de orçamento
 */
export async function getCommercialBudgetBaselinePreviewController(req: Request, res: Request | Response): Promise<void> {
  const expressRes = res as Response;
  try {
    const { sourceStartDate, sourceEndDate, budgetStartDate, budgetEndDate } = req.query;
    if (!sourceStartDate || !sourceEndDate || !budgetStartDate || !budgetEndDate) {
      expressRes.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios: sourceStartDate, sourceEndDate, budgetStartDate, budgetEndDate'
      });
      return;
    }

    const db = resolveDb();
    const { orders, expenses, traffic, investments, products } = await fetchBudgetDataset(
      db,
      sourceStartDate as string,
      sourceEndDate as string
    );

    const baseline = buildBudgetBaselineSnapshot({
      orders,
      expenses,
      investments,
      traffic,
      productCatalog: products,
      sourceStartDate: sourceStartDate as string,
      sourceEndDate: sourceEndDate as string,
      budgetStartDate: budgetStartDate as string,
      budgetEndDate: budgetEndDate as string
    });

    expressRes.status(200).json({ success: true, baseline });
  } catch (error: any) {
    logger.error('Erro ao gerar preview de baseline de orçamento:', error);
    expressRes.status(500).json({ success: false, error: error.message || 'Erro interno no servidor' });
  }
}

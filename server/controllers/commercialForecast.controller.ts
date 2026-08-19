/**
 * CONTROLLER CANÔNICO DE FORECAST E PLANEJAMENTO COMERCIAL
 * FASE 9.6.5-A — FPAC Store
 *
 * Fornece endpoints protegidos para cálculo de baseline histórico imutável, projeções run-rate,
 * auditoria imutável (Append-Only), concorrência atômica via Firestore Transaction,
 * idempotência persistida em `idempotency_records`, e conversão de cenários com governança canônica.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../firebase.js';
import { logger } from '../utils/logger.js';
import {
  generateCommercialForecast,
  buildForecastBaselineSnapshot,
  recalculateCommercialForecastActuals,
  simulateWhatIfScenario,
  convertScenarioToCommercialActionPayload,
  compareRealVsGoalVsForecast,
  resolveForecastWindows,
  generateScenarioFingerprint
} from '../../src/utils/commercialForecast.js';
import {
  CommercialForecast,
  WhatIfScenarioParams,
  CommercialForecastEvent
} from '../../src/types/commercialForecast.js';
import {
  createCommercialActionTransactional
} from './commercialGovernance.controller.js';

// Suporte a injeção de Mock DB para testes de integração unitários/server-side
let customForecastDb: any = null;

export function setCommercialForecastDb(db: any) {
  customForecastDb = db;
}

function resolveDb() {
  return customForecastDb || getDb();
}

/**
 * Gerenciamento interno de relógio para testes unitários/integração
 * Em produção, sempre utiliza a data real (new Date()).
 * O override só é permitido se process.env.NODE_ENV === 'test'.
 */
let forecastClockFn: () => Date = () => new Date();

export function setForecastClockForTests(fn: (() => Date) | null) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setForecastClockForTests is only permitted in test environment (NODE_ENV=test)');
  }
  forecastClockFn = fn || (() => new Date());
}

export function getForecastClock(): Date {
  return forecastClockFn();
}

/**
 * Utilitário SHA256 para Idempotency Keys
 */
function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

/**
 * Utilitário para extrair e validar idempotency key
 */
function extractIdempotencyKey(req: Request): string | null {
  const headerKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string;
  const bodyKey = req.body?.idempotencyKey as string;
  return headerKey || bodyKey || null;
}

/**
 * Utilitário de busca de dados no Firestore sem Full Scan
 * Executa queries separadas para datas em formato ISO String e Firestore Timestamp com deduplicação por ID
 */
async function fetchForecastDataset(db: any, startDateStr: string, endDateStr: string) {
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

  // Deduplicação estrita de orders por document ID
  const ordersById = new Map<string, any>();

  for (const doc of (ordersStringSnap?.docs || [])) {
    const data = typeof doc.data === 'function' ? doc.data() : doc.data;
    ordersById.set(doc.id, { id: doc.id, ...data });
  }

  for (const doc of (ordersTimestampSnap?.docs || [])) {
    const data = typeof doc.data === 'function' ? doc.data() : doc.data;
    ordersById.set(doc.id, { id: doc.id, ...data });
  }

  const rawOrders = Array.from(ordersById.values());

  const expenses = (cashflowSnap?.docs || []).map((d: any) => ({
    id: d.id,
    ...(typeof d.data === 'function' ? d.data() : d.data)
  }));

  const traffic = (trafficSnap?.docs || []).map((d: any) => ({
    id: d.id,
    ...(typeof d.data === 'function' ? d.data() : d.data)
  }));

  const investments = (investmentsSnap?.docs || []).map((d: any) => ({
    id: d.id,
    ...(typeof d.data === 'function' ? d.data() : d.data)
  }));

  const productCatalog = (productsSnap?.docs || []).map((d: any) => ({
    id: d.id,
    ...(typeof d.data === 'function' ? d.data() : d.data)
  }));

  return {
    rawOrders,
    expenses,
    traffic,
    investments,
    productCatalog
  };
}

/**
 * GET /api/admin/commercial/forecast/baseline
 * Retorna o baseline histórico calculado em tempo real para um período solicitado
 */
export async function getForecastBaselineController(req: Request, res: Response): Promise<void> {
  try {
    const { startDate, endDate, sourceStartDate, sourceEndDate, asOfDate } = req.query;

    const start = String(sourceStartDate || startDate || '');
    const end = String(asOfDate || sourceEndDate || endDate || '');

    if (!start || !end) {
      res.status(400).json({ error: 'startDate e endDate (ou sourceStartDate e sourceEndDate) são obrigatórios.' });
      return;
    }

    const db = resolveDb();
    const { rawOrders, expenses, traffic, investments, productCatalog } =
      await fetchForecastDataset(db, start, end);

    const baseline = buildForecastBaselineSnapshot({
      rawOrders,
      expenses,
      traffic,
      investments,
      productCatalog,
      periodStartDate: start,
      periodEndDate: end,
      sourceStartDate: start,
      sourceEndDate: end,
      asOfDate: asOfDate ? String(asOfDate) : undefined
    });

    res.json({
      success: true,
      baseline,
      ordersCount: rawOrders.length,
      expensesCount: expenses.length
    });
  } catch (error: any) {
    logger.error('❌ [FORECAST-BASELINE-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao calcular baseline de forecast.' });
  }
}

/**
 * POST /api/admin/commercial/forecasts
 * Cria uma nova projeção de forecast comercial com snapshot de baseline imutável e transação persistida
 */
export async function createCommercialForecastController(req: Request, res: Response): Promise<void> {
  const idempotencyKey = extractIdempotencyKey(req);

  if (!idempotencyKey) {
    res.status(400).json({
      error: 'Idempotency-Key é obrigatória para criação de Forecast comercial.',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
    return;
  }

  try {
    const {
      title,
      horizon,
      startDate,
      endDate,
      sourceStartDate,
      sourceEndDate,
      asOfDate,
      forecastStartDate,
      forecastEndDate,
      notes
    } = req.body;

    const clock = getForecastClock();

    // Resolução única e canônica de janelas temporais
    const windows = resolveForecastWindows({
      horizon,
      startDate,
      endDate,
      sourceStartDate,
      sourceEndDate,
      asOfDate,
      forecastStartDate,
      forecastEndDate,
      testNow: clock
    });

    const forecastStart = windows.forecastStartDate;
    const forecastEnd = windows.forecastEndDate;
    const baselineStart = windows.sourceStartDate;
    const baselineEnd = windows.sourceEndDate;
    const effectiveAsOf = windows.asOfDate;

    if (!title || !horizon || !forecastStart || !forecastEnd) {
      res.status(400).json({ error: 'Campos title, horizon, startDate e endDate são obrigatórios.' });
      return;
    }

    const db = resolveDb();
    const keyHash = hashKey(idempotencyKey);
    const idempotencyRef = db.collection('idempotency_records').doc(`comm_fc_${keyHash}`);

    // Carregar dados de amostragem no intervalo resolvido
    const { rawOrders, expenses, traffic, investments, productCatalog } =
      await fetchForecastDataset(db, baselineStart, baselineEnd);

    const forecastId = `fc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const forecastRef = db.collection('commercial_forecasts').doc(forecastId);
    const eventRef = db.collection('commercial_forecast_events').doc();

    const forecast = generateCommercialForecast({
      id: forecastId,
      title,
      horizon,
      startDate: forecastStart,
      endDate: forecastEnd,
      sourceStartDate: baselineStart,
      sourceEndDate: baselineEnd,
      asOfDate: effectiveAsOf,
      forecastStartDate: forecastStart,
      forecastEndDate: forecastEnd,
      rawOrders,
      expenses,
      traffic,
      investments,
      productCatalog,
      createdBy: (req as any).user?.uid || 'admin',
      notes,
      testNow: clock
    });

    const nowIso = clock.toISOString();

    const event: CommercialForecastEvent = {
      id: eventRef.id,
      forecastId: forecast.id,
      type: 'created',
      performedBy: (req as any).user?.uid || 'admin',
      timestamp: nowIso,
      payload: {
        title: forecast.title,
        projectedRevenue: forecast.projectedRevenue,
        projectedOperatingProfit: forecast.projectedOperatingProfit,
        confidenceLevel: forecast.confidence.level,
        idempotencyKeyHash: keyHash
      }
    };

    const transactionResult = await db.runTransaction(async (transaction: any) => {
      // 1. Verificar se a chave idempotente já existe
      const idempDoc = await transaction.get(idempotencyRef);
      if (idempDoc.exists) {
        const cachedData = idempDoc.data();
        return {
          idempotentReplay: true,
          status: 200,
          body: cachedData?.body || cachedData
        };
      }

      // 2. Gravar Forecast + Evento + Idempotency Record
      transaction.set(forecastRef, forecast);
      transaction.set(eventRef, event);

      const responseBody = {
        success: true,
        forecast,
        event
      };

      transaction.set(idempotencyRef, {
        idempotencyKeyHash: keyHash,
        forecastId: forecast.id,
        createdAt: nowIso,
        body: responseBody
      });

      return {
        idempotentReplay: false,
        status: 201,
        body: responseBody
      };
    });

    res.status(transactionResult.status).json(transactionResult.body);
  } catch (err: any) {
    logger.error('❌ [CREATE-FORECAST-EXEC-ERR]', err);
    res.status(500).json({ error: err.message || 'Erro ao persistir forecast comercial.' });
  }
}

/**
 * GET /api/admin/commercial/forecasts
 * Lista todos os forecasts comerciais salvos
 */
export async function getCommercialForecastsController(req: Request, res: Response): Promise<void> {
  try {
    const db = resolveDb();
    const snap = await db.collection('commercial_forecasts').get();
    const forecasts = (snap?.docs || []).map((d: any) => ({
      id: d.id,
      ...(typeof d.data === 'function' ? d.data() : d.data)
    }));

    res.json({
      success: true,
      forecasts
    });
  } catch (error: any) {
    logger.error('❌ [GET-FORECASTS-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao listar forecasts.' });
  }
}

/**
 * GET /api/admin/commercial/forecasts/:id
 * Retorna detalhes de um forecast específico
 */
export async function getCommercialForecastByIdController(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const db = resolveDb();
    const doc = await db.collection('commercial_forecasts').doc(id).get();

    if (!doc.exists && (!doc.data || typeof doc.data !== 'function')) {
      res.status(404).json({ error: 'Forecast não encontrado.' });
      return;
    }

    const forecast = typeof doc.data === 'function' ? doc.data() : (doc.data || doc);

    res.json({
      success: true,
      forecast: { id, ...forecast }
    });
  } catch (error: any) {
    logger.error('❌ [GET-FORECAST-BY-ID-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao obter forecast.' });
  }
}

/**
 * PATCH /api/admin/commercial/forecasts/:id
 * Atualiza campos parciais do forecast (status, notas) de forma transacional e idempotente
 * sem alterar o snapshot histórico do baseline
 */
export async function updateCommercialForecastController(req: Request, res: Response): Promise<void> {
  const idempotencyKey = extractIdempotencyKey(req);
  if (!idempotencyKey) {
    res.status(400).json({
      error: 'Idempotency-Key é obrigatória para operações de mutação comercial.',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
    return;
  }

  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const db = resolveDb();
    const docRef = db.collection('commercial_forecasts').doc(id);
    const keyHash = idempotencyKey ? hashKey(idempotencyKey) : null;
    const idempotencyRef = keyHash ? db.collection('idempotency_records').doc(`comm_fc_patch_${keyHash}`) : null;

    const result = await db.runTransaction(async (transaction: any) => {
      if (idempotencyRef) {
        const idempDoc = await transaction.get(idempotencyRef);
        if (idempDoc.exists) {
          const cachedData = idempDoc.data();
          return {
            idempotentReplay: true,
            status: 200,
            body: cachedData?.body || cachedData
          };
        }
      }

      const doc = await transaction.get(docRef);
      if (!doc.exists && (!doc.data || typeof doc.data !== 'function')) {
        return {
          status: 404,
          body: { error: 'Forecast não encontrado.' }
        };
      }

      const nowIso = new Date().toISOString();
      const updates: Record<string, any> = {
        updatedAt: nowIso
      };

      if (status) updates.status = status;
      if (notes !== undefined) updates.notes = notes;

      transaction.set(docRef, updates, { merge: true });

      // Registrar evento de auditoria
      const eventRef = db.collection('commercial_forecast_events').doc();
      let eventType = 'updated';
      if (status === 'archived') eventType = 'archived';
      else if (status === 'active') eventType = 'activated';
      else if (status === 'completed') eventType = 'completed';

      const event: CommercialForecastEvent = {
        id: eventRef.id,
        forecastId: id,
        type: eventType as any,
        performedBy: (req as any).user?.uid || 'admin',
        timestamp: nowIso,
        payload: {
          updates,
          idempotencyKeyHash: keyHash
        }
      };

      transaction.set(eventRef, event);

      const responseBody = {
        success: true,
        updated: updates,
        event
      };

      if (idempotencyRef) {
        transaction.set(idempotencyRef, {
          idempotencyKeyHash: keyHash,
          forecastId: id,
          createdAt: nowIso,
          body: responseBody
        });
      }

      return {
        idempotentReplay: false,
        status: 200,
        body: responseBody
      };
    });

    if (result.idempotentReplay) {
      res.setHeader('X-Idempotent-Replay', 'true');
      res.status(result.status || 200).json({ ...result.body, idempotentReplay: true });
      return;
    }

    res.status(result.status || 200).json({ ...result.body, idempotentReplay: false });
  } catch (error: any) {
    logger.error('❌ [UPDATE-FORECAST-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao atualizar forecast.' });
  }
}

/**
 * POST /api/admin/commercial/forecasts/:id/recalculate
 * Recalcula as projeções e atualiza currentActuals com dados recentes
 * PRESERVANDO ESTRITAMENTE O BASELINE SNAPSHOT IMUTÁVEL
 */
export async function recalculateCommercialForecastController(req: Request, res: Response): Promise<void> {
  const idempotencyKey = extractIdempotencyKey(req);

  if (!idempotencyKey) {
    res.status(400).json({
      error: 'Idempotency-Key é obrigatória para recalcular Forecast comercial.',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
    return;
  }

  try {
    const { id } = req.params;
    const db = resolveDb();
    const keyHash = hashKey(idempotencyKey);
    const idempotencyRef = db.collection('idempotency_records').doc(`comm_fc_recalc_${keyHash}`);
    const docRef = db.collection('commercial_forecasts').doc(id);

    const doc = await docRef.get();
    if (!doc.exists && (!doc.data || typeof doc.data !== 'function')) {
      res.status(404).json({ error: 'Forecast não encontrado.' });
      return;
    }

    const currentForecast = typeof doc.data === 'function' ? doc.data() : (doc.data || doc);

    const clock = getForecastClock();
    const nowIsoDate = `${clock.getUTCFullYear()}-${String(clock.getUTCMonth() + 1).padStart(2, '0')}-${String(clock.getUTCDate()).padStart(2, '0')}`;

    const currentActualsStart = currentForecast.forecastStartDate || currentForecast.startDate || '2026-08-01';
    const targetEnd = currentForecast.forecastEndDate || currentForecast.endDate || '2026-08-31';
    const currentActualsEnd = nowIsoDate < targetEnd ? (nowIsoDate < currentActualsStart ? currentActualsStart : nowIsoDate) : targetEnd;

    // Buscar dados na janela estendida do início do forecast até a data atual
    const { rawOrders, expenses, traffic, investments, productCatalog } =
      await fetchForecastDataset(db, currentActualsStart, currentActualsEnd);

    // Recalcular mantendo baseline intacto
    const updatedForecast = recalculateCommercialForecastActuals(currentForecast, {
      rawOrders,
      expenses,
      traffic,
      investments,
      productCatalog,
      testNow: clock
    });

    const nowIso = clock.toISOString();
    const eventRef = db.collection('commercial_forecast_events').doc();
    const event: CommercialForecastEvent = {
      id: eventRef.id,
      forecastId: id,
      type: 'recalculated',
      performedBy: (req as any).user?.uid || 'admin',
      timestamp: nowIso,
      payload: {
        previousRevenue: currentForecast.projectedRevenue,
        newRevenue: updatedForecast.projectedRevenue,
        newOperatingProfit: updatedForecast.projectedOperatingProfit,
        idempotencyKeyHash: keyHash
      }
    };

    const transactionResult = await db.runTransaction(async (transaction: any) => {
      const idempDoc = await transaction.get(idempotencyRef);
      if (idempDoc.exists) {
        const cachedData = idempDoc.data();
        return {
          idempotentReplay: true,
          status: 200,
          body: cachedData?.body || cachedData
        };
      }

      transaction.set(docRef, updatedForecast);
      transaction.set(eventRef, event);

      const responseBody = {
        success: true,
        forecast: updatedForecast,
        event
      };

      transaction.set(idempotencyRef, {
        idempotencyKeyHash: keyHash,
        forecastId: id,
        createdAt: nowIso,
        body: responseBody
      });

      return {
        idempotentReplay: false,
        status: 200,
        body: responseBody
      };
    });

    if (transactionResult.idempotentReplay) {
      res.setHeader('X-Idempotent-Replay', 'true');
      res.status(transactionResult.status || 200).json({ ...transactionResult.body, idempotentReplay: true });
      return;
    }

    res.status(transactionResult.status || 200).json({ ...transactionResult.body, idempotentReplay: false });
  } catch (error: any) {
    logger.error('❌ [RECALCULATE-FORECAST-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao recalcular forecast.' });
  }
}

/**
 * POST /api/admin/commercial/forecast/scenario
 * Simula Cenário What-If em tempo real sem alterar nenhum registro no banco
 */
export async function simulateForecastScenarioController(req: Request, res: Response): Promise<void> {
  try {
    const { forecastId, params, forecast: directForecast } = req.body;

    let targetForecast = directForecast;

    if (!targetForecast && forecastId) {
      const db = resolveDb();
      const doc = await db.collection('commercial_forecasts').doc(forecastId).get();
      if (doc.exists || (doc.data && typeof doc.data === 'function')) {
        targetForecast = typeof doc.data === 'function' ? doc.data() : (doc.data || doc);
      }
    }

    if (!targetForecast) {
      res.status(400).json({ error: 'Forecast ou forecastId válido é necessário para a simulação.' });
      return;
    }

    const scenarioResult = simulateWhatIfScenario(targetForecast, params || {});

    res.json({
      success: true,
      scenario: scenarioResult
    });
  } catch (error: any) {
    logger.error('❌ [SIMULATE-SCENARIO-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao simular cenário What-If.' });
  }
}

/**
 * POST /api/admin/commercial/forecast/scenario/convert-to-action
 * Transforma um Cenário What-If em uma Ação Comercial concreta via Governança Canônica Transacional
 */
export async function convertScenarioToActionController(req: Request, res: Response): Promise<void> {
  const idempotencyKey = extractIdempotencyKey(req);

  if (!idempotencyKey) {
    res.status(400).json({
      error: 'Idempotency-Key é obrigatória para converter cenário em ação comercial.',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
    return;
  }

  try {
    const { forecastId, scenario, targetProductId, targetProductName, notes } = req.body;

    if (!scenario || !forecastId) {
      res.status(400).json({ error: 'Dados do cenário e forecastId são obrigatórios.' });
      return;
    }

    const db = resolveDb();
    const doc = await db.collection('commercial_forecasts').doc(forecastId).get();
    const forecast = typeof doc.data === 'function' ? doc.data() : (doc.data || doc);

    if (!forecast) {
      res.status(404).json({ error: 'Forecast associado não encontrado.' });
      return;
    }

    const actionPayload = convertScenarioToCommercialActionPayload(scenario, forecast, {
      targetProductId,
      targetProductName,
      createdBy: (req as any).user?.uid || 'admin'
    });

    const fingerprint = actionPayload.recommendationFingerprint || generateScenarioFingerprint({
      priceAdjustmentPercent: scenario.params?.priceAdjustmentPercent || 0,
      volumeElasticityFactor: scenario.params?.volumeElasticityFactor ?? 1,
      volumeAdjustmentPercent: scenario.params?.volumeAdjustmentPercent || 0,
      costInflationPercent: scenario.params?.costInflationPercent || 0,
      trafficSpendAdjustment: scenario.params?.trafficSpendAdjustment || 0,
      fixedExpenseAdjustment: scenario.params?.fixedExpenseAdjustment || 0
    });

    // Reuso direto e estrito da função transacional de 9.6.4 (governança unificada)
    const result = await createCommercialActionTransactional({
      idempotencyKey,
      title: actionPayload.title || `Implementar Cenário: ${scenario.name}`,
      description: actionPayload.description,
      type: actionPayload.type,
      priority: actionPayload.priority,
      entityType: actionPayload.entityType,
      entityId: actionPayload.entityId,
      entityName: actionPayload.entityName,
      recommendationId: `scenario_${scenario.id}`,
      recommendationFingerprint: fingerprint,
      reasonCodes: [`what_if_${fingerprint.substring(0, 16)}`, `forecast_${forecastId}`],
      notes: notes || `Originado do Forecast "${forecast.title}" / Cenário "${scenario.name}".`,
      sourceSnapshot: actionPayload.sourceSnapshot,
      source: 'commercial_intelligence',
      user: (req as any).user
    });

    if (result.duplicateConflict) {
      res.status(409).json({
        error: 'ACTIVE_ACTION_ALREADY_EXISTS',
        message: 'Já existe um plano de ação ativo para este cenário comercial.',
        existingActionId: result.existingActionId
      });
      return;
    }

    // Registrar evento determinístico no histórico do Forecast (Append-Only) com atomicidade estrita
    const keyHash = hashKey(idempotencyKey);
    const eventId = `ev_conv_${crypto.createHash('sha256').update(`${forecastId}_${result.action?.id}_${keyHash}_converted_to_action`).digest('hex').substring(0, 24)}`;
    const eventRef = db.collection('commercial_forecast_events').doc(eventId);
    
    const nowIso = getForecastClock().toISOString();
    
    // Transação Firestore atômica: se o evento já existe, retorna o existente sem mutação
    const forecastEvent: CommercialForecastEvent = await db.runTransaction(async (transaction: any) => {
      const eventDoc = await transaction.get(eventRef);
      if (eventDoc.exists) {
        return typeof eventDoc.data === 'function' ? eventDoc.data() : eventDoc.data;
      }
      
      const newEvent: CommercialForecastEvent = {
        id: eventId,
        forecastId,
        type: 'converted_to_action',
        performedBy: (req as any).user?.uid || 'admin',
        timestamp: nowIso,
        payload: {
          actionId: result.action?.id,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          idempotencyKeyHash: keyHash
        }
      };
      
      transaction.set(eventRef, newEvent);
      return newEvent;
    });

    res.status(result.idempotentReplay ? 200 : 201).json({
      success: true,
      action: result.action,
      forecastEvent,
      idempotentReplay: result.idempotentReplay
    });
  } catch (error: any) {
    logger.error('❌ [CONVERT-SCENARIO-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao converter cenário em ação comercial.' });
  }
}

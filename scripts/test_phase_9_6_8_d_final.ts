/**
 * TEST SUITE — CERTIFICAÇÃO DEFINITIVA FASE 9.6.8-D
 * FPAC Store — Sistema de Inteligência, Pós-Mortem Comercial & Aprendizado Contínuo
 *
 * Itens Obrigatórios FASE 9.6.8-D:
 * 1. Autenticação Real no Frontend (authenticatedFetch, zero naked fetch/getApiUrl).
 * 2. Limpeza de Imports e Zero Regressão na Fase 9.6.7 (uso de commercialReviewService.listEligibleTargetCycles).
 * 3. Pipeline de Autenticação Executável no Backend (401 sem token, 401 token inválido, 403 não-admin, 200 admin, 200 API key).
 * 4. Concorrência Real com Medição de Deltas Lógicos (10 requisições simultâneas em Create, Generate, Recalculate, Approve, Archive, Convert Insight).
 * 5. Deduplicação com 10 Chaves de Idempotência Distintas para o mesmo Recurso/Ciclo/Insight (Delta exato = 1).
 * 6. Imutabilidade e Hash de Snapshot Aprovado.
 * 7. Tratamento Rigoroso de Forecast Ausente / Mismatch (MAPE/Calibration = undefined, Rating = 'insufficient').
 * 8. Campos Canônicos de Despesas do Budget obtidos exclusivamente de allocations.
 * 9. Metas de Budget Ausentes (available: false, unavailableReason: 'TARGET_UNAVAILABLE').
 * 10. Linguagem de Diagnóstico Preliminar quando approvedSnapshot for ausente.
 * 11. Linha de Produto Genérica Padrão 'ALL'.
 * 12. Paginação em List Review Actions (limit + cursor).
 * 13. Query Histórica Otimizada.
 * 14. Regras de Segurança Firestore (bloqueio total de mutações client-side).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';
import {
  setCommercialReviewDb,
  createCommercialExecutionReviewController,
  generateCommercialExecutionReviewController,
  approveCommercialExecutionReviewController,
  recalculateCommercialExecutionReviewController,
  archiveCommercialExecutionReviewController,
  convertInsightToCommercialActionController,
  getCommercialExecutionReviewController,
  listCommercialExecutionReviewsController,
  listCommercialExecutionReviewActionsController,
  getCommercialHistoricalLearningSummaryController
} from '../server/controllers/commercialReview.controller.js';
import {
  authenticateAdmin,
  setAuthTokenVerifierForTesting,
  setAuthDbForTesting,
  resetAuthForTesting
} from '../server/middleware/auth.middleware.js';
import { CommercialExecutionCycle } from '../src/types/commercialExecution.js';
import { CommercialBudget } from '../src/types/commercialBudget.js';
import { CommercialForecast } from '../src/types/commercialForecast.js';
import { CommercialAction } from '../src/types/commercialGovernance.js';

// ==========================================
// MOCK FIRESTORE TRANSACIONAL COMPLETO
// ==========================================

class MockDocRef {
  id: string;
  collectionName: string;
  storage: Map<string, any>;

  constructor(id: string, collectionName: string, storage: Map<string, any>) {
    this.id = id;
    this.collectionName = collectionName;
    this.storage = storage;
  }

  async get() {
    const data = this.storage.get(`${this.collectionName}/${this.id}`);
    return {
      exists: !!data,
      id: this.id,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : null)
    };
  }

  set(data: any) {
    this.storage.set(`${this.collectionName}/${this.id}`, JSON.parse(JSON.stringify(data)));
  }

  update(data: any) {
    const existing = this.storage.get(`${this.collectionName}/${this.id}`) || {};
    this.storage.set(`${this.collectionName}/${this.id}`, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }

  delete() {
    this.storage.delete(`${this.collectionName}/${this.id}`);
  }
}

class MockCollectionRef {
  name: string;
  storage: Map<string, any>;
  whereClauses: Array<{ field: string; op: string; val: any }> = [];
  limitCount?: number;

  constructor(name: string, storage: Map<string, any>) {
    this.name = name;
    this.storage = storage;
  }

  doc(id?: string) {
    const docId = id || `mock_doc_${Math.random().toString(36).slice(2, 9)}`;
    return new MockDocRef(docId, this.name, this.storage);
  }

  where(field: string, op: string, val: any) {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses, { field, op, val }];
    return copy;
  }

  orderBy() { return this; }
  startAfter() { return this; }
  limit(n: number) {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.limitCount = n;
    return copy;
  }

  async get() {
    let docs: any[] = [];
    const prefix = `${this.name}/`;
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        const id = key.substring(prefix.length);
        let matches = true;
        for (const clause of this.whereClauses) {
          const itemVal = value[clause.field];
          const queryVal = clause.val;

          if (clause.op === '==') {
            if (itemVal !== queryVal) {
              matches = false;
              break;
            }
            continue;
          }

          // Se a query busca number (seconds), o campo no doc também deve ser number
          if (typeof queryVal === 'number') {
            if (typeof itemVal !== 'number') {
              matches = false;
              break;
            }
            if (clause.op === '>=' && itemVal < queryVal) { matches = false; break; }
            if (clause.op === '<=' && itemVal > queryVal) { matches = false; break; }
            continue;
          }

          // Se a query busca timestamp object ou date
          const normQuery = typeof queryVal === 'string'
            ? queryVal
            : (queryVal?.toDate ? queryVal.toDate().toISOString() : (queryVal instanceof Date ? queryVal.toISOString() : String(queryVal)));

          const normItem = typeof itemVal === 'string'
            ? itemVal
            : (itemVal?.toDate ? itemVal.toDate().toISOString() : (itemVal instanceof Date ? itemVal.toISOString() : null));

          if (!normItem) {
            matches = false;
            break;
          }

          if (clause.op === '>=' && normItem < normQuery) {
            matches = false;
            break;
          }
          if (clause.op === '<=' && normItem > normQuery) {
            matches = false;
            break;
          }
        }
        if (matches) {
          docs.push({
            id,
            data: () => JSON.parse(JSON.stringify(value))
          });
        }
      }
    }
    if (this.limitCount && docs.length > this.limitCount) {
      docs = docs.slice(0, this.limitCount);
    }
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs
    };
  }
}

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>(resolve => {
      this.queue.push(() => {
        resolve(() => this.release());
      });
    });
  }

  private release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    } else {
      this.locked = false;
    }
  }
}

class MockFirestore {
  storage: Map<string, any> = new Map();
  private mutex = new AsyncMutex();

  collection(name: string) {
    return new MockCollectionRef(name, this.storage);
  }

  async runTransaction(updateFunction: (tx: any) => Promise<any>) {
    const release = await this.mutex.acquire();
    try {
      const tx = {
        get: async (ref: MockDocRef) => {
          return await ref.get();
        },
        set: (ref: MockDocRef, data: any) => {
          ref.set(data);
        },
        update: (ref: MockDocRef, data: any) => {
          ref.update(data);
        }
      };
      return await updateFunction(tx);
    } finally {
      release();
    }
  }

  countCollection(name: string): number {
    let count = 0;
    const prefix = `${name}/`;
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) count++;
    }
    return count;
  }
}

function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = null;
  res.status = function(code: number) {
    res.statusCode = code;
    return res;
  };
  res.json = function(data: any) {
    res.body = data;
    return res;
  };
  return res;
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ [FALHA] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ [OK] ${message}`);
}

async function runPhase968DTests() {
  console.log('========================================================================');
  console.log('🌟 INICIANDO CERTIFICAÇÃO FASE 9.6.8-D — FPAC STORE');
  console.log('========================================================================\n');

  // ------------------------------------------------------------------------
  // 1. PROVA ESTÁTICA DE AUTENTICAÇÃO NO FRONTEND & SERVIÇOS
  // ------------------------------------------------------------------------
  console.log('--- 1. PROVA ESTÁTICA DE FRONTEND & CLEAN IMPORTS ---');
  const serviceCode = fs.readFileSync(path.resolve('./src/services/commercial/commercialReviewService.ts'), 'utf-8');
  assert(serviceCode.includes("import { authenticatedFetch } from '../../lib/api';"), 'commercialReviewService importa authenticatedFetch');
  assert(!serviceCode.includes('getApiUrl()'), 'commercialReviewService não possui resquício de getApiUrl()');
  assert(!/fetch\(\s*[`"']/g.test(serviceCode), 'commercialReviewService não faz chamadas fetch() desprotegidas');
  assert(serviceCode.includes('listEligibleTargetCycles'), 'commercialReviewService exporta listEligibleTargetCycles');

  const viewCode = fs.readFileSync(path.resolve('./src/components/admin/financial/profitability/CommercialExecutionReviewView.tsx'), 'utf-8');
  assert(!viewCode.includes('commercialExecutionService'), 'CommercialExecutionReviewView não importa commercialExecutionService');
  assert(viewCode.includes('commercialReviewService.listEligibleTargetCycles'), 'CommercialExecutionReviewView consome listEligibleTargetCycles do review service');
  assert(viewCode.includes('value="ALL"'), 'CommercialExecutionReviewView suporta opção ALL para linha de produtos');

  // ------------------------------------------------------------------------
  // 2. PIPELINE EXECUTÁVEL DE AUTENTICAÇÃO NO BACKEND (authenticateAdmin)
  // ------------------------------------------------------------------------
  console.log('\n--- 2. PIPELINE DE AUTENTICAÇÃO EXECUTÁVEL (authenticateAdmin) ---');
  process.env.ADMIN_API_KEY = 'test-secret-key-12345';
  process.env.ADMIN_EMAILS = 'admin@fpacstore.com.br';

  const authDb = new MockFirestore();
  authDb.collection('users').doc('user_admin').set({ role: 'admin', email: 'admin@fpacstore.com.br' });
  authDb.collection('users').doc('user_customer').set({ role: 'customer', email: 'customer@fpacstore.com.br' });
  setAuthDbForTesting(authDb);

  setAuthTokenVerifierForTesting(async (token: string) => {
    if (token === 'token_admin') {
      return { uid: 'user_admin', email: 'admin@fpacstore.com.br', admin: true } as any;
    }
    if (token === 'token_customer') {
      return { uid: 'user_customer', email: 'customer@fpacstore.com.br', admin: false } as any;
    }
    throw new Error('Invalid token');
  });

  // 2a. Sem header de autorização -> 401
  {
    const req: any = { headers: {}, originalUrl: '/api/admin/commercial/reviews', method: 'GET' };
    const res = mockRes();
    let calledNext = false;
    await authenticateAdmin(req, res, () => { calledNext = true; });
    assert(res.statusCode === 401 && !calledNext, 'Sem credencial -> 401 Unauthorized');
  }

  // 2b. Bearer token inválido -> 401
  {
    const req: any = { headers: { authorization: 'Bearer invalid_token_xyz' }, originalUrl: '/api/admin/commercial/reviews', method: 'GET' };
    const res = mockRes();
    let calledNext = false;
    await authenticateAdmin(req, res, () => { calledNext = true; });
    assert(res.statusCode === 401 && !calledNext, 'Bearer token inválido -> 401 Unauthorized');
  }

  // 2c. Bearer token de cliente não-admin -> 403
  {
    const req: any = { headers: { authorization: 'Bearer token_customer' }, originalUrl: '/api/admin/commercial/reviews', method: 'GET' };
    const res = mockRes();
    let calledNext = false;
    await authenticateAdmin(req, res, () => { calledNext = true; });
    assert(res.statusCode === 403 && !calledNext, 'Token de cliente não-admin -> 403 Forbidden');
  }

  // 2d. Bearer token de administrador -> 200 / Next
  {
    const req: any = { headers: { authorization: 'Bearer token_admin' }, originalUrl: '/api/admin/commercial/reviews', method: 'GET' };
    const res = mockRes();
    let calledNext = false;
    await authenticateAdmin(req, res, () => { calledNext = true; });
    assert(calledNext && req.user?.role === 'admin', 'Token de admin válido -> Prossegue com role admin');
  }

  // 2e. Admin API Key no header -> 200 / Next
  {
    const req: any = { headers: { 'x-admin-api-key': 'test-secret-key-12345' }, originalUrl: '/api/admin/commercial/reviews', method: 'GET' };
    const res = mockRes();
    let calledNext = false;
    await authenticateAdmin(req, res, () => { calledNext = true; });
    assert(calledNext && req.user?.uid === 'system-admin-key', 'Admin API key válida -> Prossegue como system-admin');
  }

  resetAuthForTesting();

  // ------------------------------------------------------------------------
  // 3. SETUP DE DADOS PARA CONCORRÊNCIA E REGRAS DE NEGÓCIO
  // ------------------------------------------------------------------------
  console.log('\n--- 3. SETUP DE MOCK DB TRANSACIONAL & CONCORRÊNCIA ---');
  const db = new MockFirestore();
  setCommercialReviewDb(db as any);

  const cycle1: CommercialExecutionCycle = {
    id: 'cycle_968d_1',
    title: 'Ciclo Q3 2026 Concluído',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    status: 'completed',
    version: 1,
    budgetId: 'budget_968d_1',
    linkedForecastId: 'forecast_968d_1',
    linkedGoalIds: ['goal_968d_1'],
    createdBy: 'admin_1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    goalExecutionSnapshots: [
      {
        goalId: 'goal_968d_1',
        title: 'Receita Q3',
        type: 'revenue',
        targetValue: 100000,
        period: 'quarterly',
        startDate: '2026-07-01',
        endDate: '2026-09-30'
      }
    ]
  };

  const nextActiveCycle: CommercialExecutionCycle = {
    id: 'cycle_968d_active',
    title: 'Ciclo Q4 2026 Ativo',
    periodStart: '2026-10-01',
    periodEnd: '2026-12-31',
    status: 'active',
    version: 1,
    budgetId: 'budget_968d_2',
    linkedForecastId: 'forecast_968d_2',
    linkedGoalIds: [],
    createdBy: 'admin_1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  };

  const budgetApproved: any = {
    id: 'budget_968d_1',
    title: 'Orçamento Q3 2026 Aprovado',
    period: 'quarterly',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    status: 'approved',
    approvedSnapshot: {
      targetRevenue: 100000,
      targetOrders: 500,
      targetUnits: 1000,
      targetContributionMargin: 35000,
      targetOperatingProfit: 15000,
      allocations: {
        cogsBudget: 40000,
        gatewayFeesBudget: 3000,
        shippingSubsidyBudget: 5000,
        trafficBudget: 12000,
        fixedExpensesBudget: 5000
      }
    }
  };

  const forecastLinked: any = {
    id: 'forecast_968d_1',
    title: 'Forecast Q3 2026',
    modelType: 'ENSEMBLE',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    granularity: 'monthly',
    forecastPeriods: [
      {
        period: '2026-07',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        projectedRevenue: 30000,
        projectedOrders: 150,
        projectedUnits: 300,
        confidenceInterval: { lower: 28000, upper: 32000, confidenceLevel: 0.95 }
      },
      {
        period: '2026-08',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        projectedRevenue: 35000,
        projectedOrders: 175,
        projectedUnits: 350,
        confidenceInterval: { lower: 33000, upper: 37000, confidenceLevel: 0.95 }
      },
      {
        period: '2026-09',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        projectedRevenue: 35000,
        projectedOrders: 175,
        projectedUnits: 350,
        confidenceInterval: { lower: 33000, upper: 37000, confidenceLevel: 0.95 }
      }
    ],
    assumptions: ['Estabilidade de tráfego'],
    accuracyMetrics: { mape: 4.2, bias: 'NEUTRAL' } as any,
    metadata: { createdBy: 'admin_1', createdAt: '2026-06-25T00:00:00.000Z', version: 1 }
  };

  // Cadastra pedidos reais do ciclo Q3 no banco mock
  const actualOrders = [
    {
      id: 'ord_968d_1',
      total: 60000,
      totalAmount: 60000,
      paidAmount: 60000,
      paymentStatus: 'approved',
      cogs: 24000,
      gatewayFee: 1800,
      shippingCost: 3000,
      marketingCost: 7000,
      status: 'paid',
      createdAt: '2026-07-15T12:00:00.000Z',
      items: [{ productId: 'p1', line: 'FORCE', quantity: 300, price: 200, unitCost: 80 }]
    },
    {
      id: 'ord_968d_2',
      total: 50000,
      totalAmount: 50000,
      paidAmount: 50000,
      paymentStatus: 'approved',
      cogs: 20000,
      gatewayFee: 1500,
      shippingCost: 2500,
      marketingCost: 6000,
      status: 'paid',
      createdAt: '2026-08-20T12:00:00.000Z',
      items: [{ productId: 'p2', line: 'MARK', quantity: 250, price: 200, unitCost: 80 }]
    }
  ];

  // Ações Comerciais executadas no ciclo
  const executedActions: CommercialAction[] = [
    {
      id: 'act_968d_1',
      executionCycleId: 'cycle_968d_1',
      entityType: 'line',
      type: 'review_discount',
      title: 'Desconto Linha FORCE',
      description: 'Campanha de pricing para volume',
      status: 'completed',
      priority: 'high',
      source: 'commercial_intelligence',
      sourceSnapshot: { isHistoricalSnapshot: true } as any,
      createdAt: '2026-07-05T00:00:00.000Z',
      createdBy: 'admin_1',
      productLine: 'FORCE',
      assignedTo: 'admin_1',
      executionStatus: 'completed',
      completionPercent: 100,
      plannedStartDate: '2026-07-05',
      plannedEndDate: '2026-07-25',
      actualImpact: {
        revenue: 60000,
        units: 300,
        contributionMargin: 20000
      }
    }
  ];

  const productsCatalog = [
    { id: 'p1', name: 'Creatina Force 300g', productLine: 'FORCE', costPrice: 80, price: 200 },
    { id: 'p2', name: 'Whey Protein Mark 900g', productLine: 'MARK', costPrice: 80, price: 200 }
  ];

  db.collection('commercial_execution_cycles').doc('cycle_968d_1').set(cycle1);
  db.collection('commercial_execution_cycles').doc('cycle_968d_active').set(nextActiveCycle);
  db.collection('commercial_budgets').doc('budget_968d_1').set(budgetApproved);
  db.collection('commercial_forecasts').doc('forecast_968d_1').set(forecastLinked);
  productsCatalog.forEach(p => db.collection('products').doc(p.id).set(p));
  actualOrders.forEach(o => db.collection('orders').doc(o.id).set(o));
  executedActions.forEach(a => db.collection('commercial_actions').doc(a.id).set(a));

  // ------------------------------------------------------------------------
  // 4. TESTE DE CONCORRÊNCIA E DEDICAÇÃO DE DELTA (10 REQUISIÇÕES CONCOMITANTES)
  // ------------------------------------------------------------------------
  console.log('\n--- 4. CONCORRÊNCIA & MEDIÇÃO DE DELTAS (CREATE REVIEW COM 10 KEYS DIFERENTES) ---');
  
  const reviewsBefore = db.countCollection('commercial_execution_reviews');
  const locksBefore = db.countCollection('commercial_review_cycle_locks');
  const eventsBefore = db.countCollection('commercial_execution_review_events');

  const createReqs = Array.from({ length: 10 }, (_, i) => ({
    body: {
      executionCycleId: 'cycle_968d_1',
      title: `Pós-Mortem Q3 2026 (${i})`
    },
    headers: {
      'idempotency-key': `unique_idem_key_create_${i}`
    },
    user: { uid: `admin_${i}`, role: 'admin' }
  }));

  const createResults = await Promise.all(
    createReqs.map(req => {
      const res = mockRes();
      return createCommercialExecutionReviewController(req as any, res).then(() => res);
    })
  );

  const reviewsAfter = db.countCollection('commercial_execution_reviews');
  const locksAfter = db.countCollection('commercial_review_cycle_locks');
  const eventsAfter = db.countCollection('commercial_execution_review_events');

  assert(reviewsAfter - reviewsBefore === 1, `Delta de reviews criados: exato 1 (10 requisições simultâneas com chaves distintas para o mesmo ciclo)`);
  assert(locksAfter - locksBefore === 1, `Delta de cycle locks: exato 1`);
  assert(eventsAfter - eventsBefore === 1, `Delta de eventos de auditoria: exato 1`);

  const createdReviewId = createResults[0].body.review.id;
  assert(createdReviewId.startsWith('rev_'), `Review ID válido: ${createdReviewId}`);

  // ------------------------------------------------------------------------
  // 5. TESTE DE GERAÇÃO CONCORRENTE & DELTA LÓGICO
  // ------------------------------------------------------------------------
  console.log('\n--- 5. CONCORRÊNCIA NA GERAÇÃO & RECALCULATE (10X SAME KEY DELTA 1/1/1) ---');
  
  // 5a. 10 chamadas com a mesma Idempotency Key -> todas retornam 200 e o mesmo resultado
  const genReqsSameKey = Array.from({ length: 10 }, () => ({
    params: { id: createdReviewId },
    headers: { 'idempotency-key': 'gen_key_shared_100' },
    user: { uid: 'admin_1', role: 'admin' }
  }));

  const genResultsSameKey = await Promise.all(
    genReqsSameKey.map(req => {
      const res = mockRes();
      return generateCommercialExecutionReviewController(req as any, res).then(() => res);
    })
  );

  const genAll200 = genResultsSameKey.every(r => r.statusCode === 200);
  assert(genAll200, 'Todas as 10 chamadas com mesma chave retornaram 200 com replay idêntico');
  const generatedReview = genResultsSameKey[0].body.review;
  assert(generatedReview.status === 'generated', 'Status do review passou para "generated"');
  assert(generatedReview.outcomeSnapshot !== undefined, 'Outcome snapshot foi calculado com sucesso');
  assert(generatedReview.outcomeSnapshot.finalActuals.revenue === 110000, 'Receita realizada calculada: R$ 110.000,00');
  assert(generatedReview.outcomeSnapshot.budgetComparisons.revenue.varianceAbsolute === 10000, 'Variação de receita calculada: +R$ 10.000,00');

  // 5b. RECALCULATE 10x com mesma chave -> delta 1/1/1
  const eventsBeforeRecalc = db.countCollection('commercial_execution_review_events');
  const recalcReqsSameKey = Array.from({ length: 10 }, () => ({
    params: { id: createdReviewId },
    headers: { 'idempotency-key': 'recalc_key_shared_100' },
    user: { uid: 'admin_1', role: 'admin' }
  }));
  const recalcResults = await Promise.all(
    recalcReqsSameKey.map(req => {
      const res = mockRes();
      return recalculateCommercialExecutionReviewController(req as any, res).then(() => res);
    })
  );
  const recalcAll200 = recalcResults.every(r => r.statusCode === 200);
  const eventsAfterRecalc = db.countCollection('commercial_execution_review_events');
  assert(recalcAll200, 'RECALCULATE 10x com mesma chave retornou 200 com replay idempotente');
  assert(eventsAfterRecalc - eventsBeforeRecalc === 1, 'RECALCULATE 10x mesma chave delta eventos: exato 1');
  assert(recalcResults[0].body.review.analysisVersion === 2, 'AnalysisVersion incrementada para 2');

  // 5c. Chamada subsequente com nova chave em review já gerado -> 409 REVIEW_ALREADY_GENERATED
  const genNewKeyReq: any = {
    params: { id: createdReviewId },
    headers: { 'idempotency-key': 'gen_key_new_diff' },
    user: { uid: 'admin_1', role: 'admin' }
  };
  const genNewKeyRes = mockRes();
  await generateCommercialExecutionReviewController(genNewKeyReq, genNewKeyRes);
  assert(genNewKeyRes.statusCode === 409, 'Nova chave para review já gerado retorna 409 REVIEW_ALREADY_GENERATED');

  // ------------------------------------------------------------------------
  // 6. APROVAÇÃO & ARQUIVAMENTO (10X SAME KEY DELTA 1/1/1 & IMUTABILIDADE)
  // ------------------------------------------------------------------------
  console.log('\n--- 6. APROVAÇÃO, ARQUIVAMENTO, HASH E IMUTABILIDADE DO SNAPSHOT ---');
  
  const eventsBeforeApprove = db.countCollection('commercial_execution_review_events');
  const appReqsSameKey = Array.from({ length: 10 }, () => ({
    params: { id: createdReviewId },
    headers: { 'idempotency-key': 'app_key_shared_100' },
    user: { uid: 'admin_1', role: 'admin' }
  }));
  const appResults = await Promise.all(
    appReqsSameKey.map(req => {
      const res = mockRes();
      return approveCommercialExecutionReviewController(req as any, res).then(() => res);
    })
  );
  const appAll200 = appResults.every(r => r.statusCode === 200);
  const eventsAfterApprove = db.countCollection('commercial_execution_review_events');
  assert(appAll200, 'APPROVE 10x com mesma chave retornou 200 com replay idempotente');
  assert(eventsAfterApprove - eventsBeforeApprove === 1, 'APPROVE 10x mesma chave delta eventos: exato 1');
  
  const approvedReview = appResults[0].body.review;
  assert(approvedReview.status === 'approved', 'Status passou para "approved"');

  const snapshotHashBefore = crypto
    .createHash('sha256')
    .update(JSON.stringify(approvedReview.outcomeSnapshot))
    .digest('hex');

  // ------------------------------------------------------------------------
  // 7. CONVERSÃO DE INSIGHT EM AÇÃO COMERCIAL (10 CHAVES DISTINTAS & 10 MESMA CHAVE)
  // ------------------------------------------------------------------------
  console.log('\n--- 7. CONVERSÃO DE INSIGHT EM AÇÃO (10 CHAVES DISTINTAS & 10 MESMA CHAVE) ---');
  const learningInsight = approvedReview.outcomeSnapshot.learningInsights.find((i: any) => i.canCreateAction) || approvedReview.outcomeSnapshot.learningInsights[0];
  assert(learningInsight !== undefined && learningInsight.canCreateAction === true, 'Existe ao menos um Insight acionável (canCreateAction: true) gerado');

  const actionsBefore = db.countCollection('commercial_actions');
  const insightLocksBefore = db.countCollection('commercial_review_insight_locks');

  const convertReqs = Array.from({ length: 10 }, (_, i) => ({
    params: { id: createdReviewId, insightId: learningInsight.id },
    body: {
      targetCycleId: 'cycle_968d_active',
      title: `Ação Pós-Mortem Q4 (${i})`,
      priority: 'high'
    },
    headers: { 'idempotency-key': `action_key_unique_${i}` },
    user: { uid: `admin_${i}`, role: 'admin' }
  }));

  const convertResults = await Promise.all(
    convertReqs.map(req => {
      const res = mockRes();
      return convertInsightToCommercialActionController(req as any, res).then(() => res);
    })
  );

  const actionsAfter = db.countCollection('commercial_actions');
  const insightLocksAfter = db.countCollection('commercial_review_insight_locks');

  assert(actionsAfter - actionsBefore === 1, `Delta de CommercialAction criadas: exato 1 (bloqueio determinístico por insightLockKey)`);
  assert(insightLocksAfter - insightLocksBefore === 1, `Delta de insight locks: exato 1`);
  
  const createdAction = convertResults[0].body.action;
  assert(createdAction.executionCycleId === 'cycle_968d_active', 'Ação associada ao ciclo de destino ativo');
  assert(createdAction.productLine === 'ALL' || ['FORCE', 'MARK', 'PRIME', 'OTHER'].includes(createdAction.productLine), 'Product line canônica válida');

  // Teste de CREATE ACTION 10x com a MESMA chave de idempotência -> replay 200/201 sem delta
  const actionsBeforeSame = db.countCollection('commercial_actions');
  const convertReqsSameKey = Array.from({ length: 10 }, () => ({
    params: { id: createdReviewId, insightId: learningInsight.id },
    body: {
      targetCycleId: 'cycle_968d_active',
      title: `Ação Pós-Mortem Q4 (0)`,
      priority: 'high'
    },
    headers: { 'idempotency-key': `action_key_unique_0` },
    user: { uid: `admin_0`, role: 'admin' }
  }));
  const convertSameResults = await Promise.all(
    convertReqsSameKey.map(req => {
      const res = mockRes();
      return convertInsightToCommercialActionController(req as any, res).then(() => res);
    })
  );
  const convertSameAllSuccess = convertSameResults.every(r => r.statusCode === 200 || r.statusCode === 201);
  const actionsAfterSame = db.countCollection('commercial_actions');
  assert(convertSameAllSuccess, 'CREATE ACTION 10x com mesma chave retornou sucesso idempotente');
  assert(actionsAfterSame - actionsBeforeSame === 0, 'CREATE ACTION 10x mesma chave delta ações: exato 0 (replay idempotente)');

  // Verifica que o hash do snapshot do review aprovado permaneceu 100% idêntico
  const reviewAfterActionDoc = await db.collection('commercial_execution_reviews').doc(createdReviewId).get();
  const snapshotHashAfter = crypto
    .createHash('sha256')
    .update(JSON.stringify(reviewAfterActionDoc.data().outcomeSnapshot))
    .digest('hex');

  assert(snapshotHashBefore === snapshotHashAfter, 'Imutabilidade garantida: Hash do snapshot do review aprovado é idêntico antes e depois da criação de ações');

  // Teste de ARCHIVE 10x com mesma chave
  const eventsBeforeArchive = db.countCollection('commercial_execution_review_events');
  const archReqsSameKey = Array.from({ length: 10 }, () => ({
    params: { id: createdReviewId },
    headers: { 'idempotency-key': 'arch_key_shared_100' },
    user: { uid: 'admin_1', role: 'admin' }
  }));
  const archResults = await Promise.all(
    archReqsSameKey.map(req => {
      const res = mockRes();
      return archiveCommercialExecutionReviewController(req as any, res).then(() => res);
    })
  );
  const archAll200 = archResults.every(r => r.statusCode === 200);
  const eventsAfterArchive = db.countCollection('commercial_execution_review_events');
  assert(archAll200, 'ARCHIVE 10x com mesma chave retornou 200 com replay idempotente');
  assert(eventsAfterArchive - eventsBeforeArchive === 1, 'ARCHIVE 10x mesma chave delta eventos: exato 1');
  assert(archResults[0].body.review.status === 'archived', 'Status do review passou para "archived"');

  // ------------------------------------------------------------------------
  // 8. TESTE DE FORECAST MISMATCH & BUDGET AUSENTE
  // ------------------------------------------------------------------------
  console.log('\n--- 8. TRATAMENTO DE FORECAST AUSENTE/MISMATCH & BUDGET SEM TARGET ---');
  
  // Ciclo 2: Sem Forecast vinculado e sem ApprovedSnapshot no Budget
  const cycleNoForecast: CommercialExecutionCycle = {
    id: 'cycle_968d_no_fc',
    title: 'Ciclo Sem Forecast',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    status: 'completed',
    version: 1,
    budgetId: 'budget_968d_prelim',
    linkedForecastId: undefined,
    linkedGoalIds: [],
    createdBy: 'admin_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z'
  };

  const budgetPrelim: any = {
    id: 'budget_968d_prelim',
    title: 'Orçamento Preliminar',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    status: 'draft',
    targetRevenue: 50000
    // sem allocations de despesas nem approvedSnapshot
  };

  db.collection('commercial_execution_cycles').doc('cycle_968d_no_fc').set(cycleNoForecast);
  db.collection('commercial_budgets').doc('budget_968d_prelim').set(budgetPrelim);

  const reqNoFc: any = {
    body: { executionCycleId: 'cycle_968d_no_fc' },
    headers: { 'idempotency-key': 'key_no_fc_1' },
    user: { uid: 'admin_1', role: 'admin' }
  };
  const resNoFc = mockRes();
  await createCommercialExecutionReviewController(reqNoFc, resNoFc);
  const reviewNoFcId = resNoFc.body.review.id;

  const genNoFcReq: any = {
    params: { id: reviewNoFcId },
    headers: { 'idempotency-key': 'gen_no_fc_1' },
    user: { uid: 'admin_1', role: 'admin' }
  };
  const genNoFcRes = mockRes();
  await generateCommercialExecutionReviewController(genNoFcReq, genNoFcRes);

  const reviewNoFc = genNoFcRes.body.review;
  assert(reviewNoFc.outcomeSnapshot.forecastCalibration === undefined, 'forecastCalibration é undefined quando não há forecast');
  assert(reviewNoFc.summary.forecastAccuracyRating === 'insufficient', 'forecastAccuracyRating é "insufficient" quando sem calibração');
  assert(reviewNoFc.summary.headline.includes('Diagnóstico preliminar'), 'Headline usa linguagem de diagnóstico preliminar quando sem approvedSnapshot');
  
  // Verifica se despesa sem target tem available: false
  const cogsComp = reviewNoFc.outcomeSnapshot.budgetComparisons.cogs;
  assert(cogsComp.available === false && cogsComp.unavailableReason === 'TARGET_UNAVAILABLE', 'Budget de despesa ausente é marcado como available: false com TARGET_UNAVAILABLE');

  // ------------------------------------------------------------------------
  // 9. PAGINAÇÃO EM LIST ACTIONS & QUERIES OTIMIZADAS
  // ------------------------------------------------------------------------
  console.log('\n--- 9. PAGINAÇÃO E QUERIES OTIMIZADAS ---');
  const actPageReq: any = {
    params: { id: createdReviewId },
    query: { limit: '10' },
    user: { uid: 'admin_1', role: 'admin' }
  };
  const actPageRes = mockRes();
  await listCommercialExecutionReviewActionsController(actPageReq, actPageRes);
  assert(actPageRes.statusCode === 200, 'listCommercialExecutionReviewActionsController retornou 200');
  assert(Array.isArray(actPageRes.body.actions), 'Actions retornadas como Array paginado');

  const histReq: any = {
    query: { periodStart: '2026-01-01', periodEnd: '2026-12-31' },
    user: { uid: 'admin_1', role: 'admin' }
  };
  const histRes = mockRes();
  await getCommercialHistoricalLearningSummaryController(histReq, histRes);
  assert(histRes.statusCode === 200, 'getCommercialHistoricalLearningSummaryController retornou 200');
  assert(histRes.body.summary !== undefined, 'Summary histórico retornado com sucesso');

  // ------------------------------------------------------------------------
  // 10. CERTIFICAÇÃO DE FIRESTORE SECURITY RULES (FASE 9.6.8)
  // ------------------------------------------------------------------------
  console.log('\n--- 10. CERTIFICAÇÃO DE FIRESTORE SECURITY RULES ---');
  const firestoreRulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');
  assert(firestoreRulesContent.includes('match /commercial_execution_reviews/{reviewId}'), 'Rules contém match para commercial_execution_reviews');
  assert(firestoreRulesContent.includes('match /commercial_execution_review_actions/{actionId}'), 'Rules contém match para commercial_execution_review_actions');
  assert(firestoreRulesContent.includes('match /commercial_execution_review_events/{eventId}'), 'Rules contém match para commercial_execution_review_events');
  assert(firestoreRulesContent.includes('match /commercial_review_cycle_locks/{lockId}'), 'Rules contém match para commercial_review_cycle_locks');
  assert(firestoreRulesContent.includes('match /commercial_review_insight_locks/{lockId}'), 'Rules contém match para commercial_review_insight_locks');
  assert(firestoreRulesContent.includes('allow create, update, delete: if false;'), 'Mutação client-side bloqueada com allow create, update, delete: if false;');

  console.log('\n========================================================================');
  console.log(`🎉 TODOS OS ${passedTests} TESTES DA FASE 9.6.8-D FORAM APROVADOS COM SUCESSO!`);
  console.log('========================================================================\n');
}

runPhase968DTests().catch(err => {
  console.error('\n❌ ERRO FATAL NA EXECUÇÃO DOS TESTES 9.6.8-D:', err);
  process.exit(1);
});

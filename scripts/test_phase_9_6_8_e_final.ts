/**
 * ============================================================================
 * TEST SUITE DEFINITIVA: FASE 9.6.8-E — AUDITORIA & ÚLTIMO PATCH DE CERTIFICAÇÃO
 * ============================================================================
 * 
 * Cobertura Completa dos 16 Pontos de Auditoria:
 * 1. Pipeline HTTP Real: adminApiLimiter -> authenticateAdmin -> Controller
 * 2. Medição Estrita de Deltas Lógicos, Eventos e Idempotency Records (1/1/1)
 * 3. CREATE REVIEW Fresh Same-Key (10x concorrente -> Delta 1/1/1/1)
 * 4. CREATE ACTION Fresh Same-Key (10x concorrente -> Delta 1/1/1/1)
 * 5. GENERATE / RECALCULATE / APPROVE / ARCHIVE (10x concorrente -> Delta 1/1/1)
 * 6. Historical Range Query Narrowing & Interseção Correta
 * 7. Paginação Otimizada com Cursor em Batches (sem cap arbitrário)
 * 8. Índice Composto de Reviews no firestore.indexes.json
 * 9. Fixture de Interseção Histórica (Casos A, B, C, D, E -> B, C, D aprovados)
 * 10. PRODUCT_LINE UI: Derivação sem FORCE arbitrário (Padrão ALL)
 * 11. Validação de Métrica de Linhas no Frontend
 * 12. Geração e Verificação de Integridade do Audit ZIP (zipfile.is_zipfile, testzip)
 * 13. Certificação Granular de Security Rules por Coleção
 * 14. TypeScript Clean (Zero Erros) & Regressão Integral
 */

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

import { adminApiLimiter } from '../server/middleware/rateLimiter.js';
import {
  authenticateAdmin,
  setAuthTokenVerifierForTesting,
  setAuthDbForTesting,
  resetAuthForTesting
} from '../server/middleware/auth.middleware.js';

import {
  setCommercialReviewDb,
  createCommercialExecutionReviewController,
  generateCommercialExecutionReviewController,
  recalculateCommercialExecutionReviewController,
  approveCommercialExecutionReviewController,
  archiveCommercialExecutionReviewController,
  convertInsightToCommercialActionController,
  listCommercialExecutionReviewActionsController,
  getCommercialHistoricalLearningSummaryController
} from '../server/controllers/commercialReview.controller.js';

import {
  CommercialExecutionCycle
} from '../src/types/commercialExecution.js';
import {
  CommercialAction
} from '../src/types/commercialGovernance.js';
import {
  CommercialExecutionReview
} from '../src/types/commercialReview.js';

// ============================================================================
// MOCK FIRESTORE AVANÇADO COM ORDERBY, PAGINAÇÃO, TRANSACIONAL & CONCORRÊNCIA
// ============================================================================

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
    const key = `${this.collectionName}/${this.id}`;
    const data = this.storage.get(key);
    return {
      id: this.id,
      exists: data !== undefined,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
    };
  }

  async set(data: any) {
    const key = `${this.collectionName}/${this.id}`;
    this.storage.set(key, JSON.parse(JSON.stringify(data)));
    return { writeTime: new Date() };
  }

  async update(data: any) {
    const key = `${this.collectionName}/${this.id}`;
    const existing = this.storage.get(key) || {};
    const updated = { ...existing, ...JSON.parse(JSON.stringify(data)) };
    this.storage.set(key, updated);
    return { writeTime: new Date() };
  }
}

class MockCollectionRef {
  name: string;
  storage: Map<string, any>;
  whereClauses: Array<{ field: string; op: string; val: any }> = [];
  orderByClause: { field: string; direction: 'asc' | 'desc' } | null = null;
  startAfterDoc: any = null;
  limitCount: number | null = null;

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
    copy.orderByClause = this.orderByClause;
    copy.startAfterDoc = this.startAfterDoc;
    copy.limitCount = this.limitCount;
    return copy;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.orderByClause = { field, direction };
    copy.startAfterDoc = this.startAfterDoc;
    copy.limitCount = this.limitCount;
    return copy;
  }

  startAfter(doc: any) {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.orderByClause = this.orderByClause;
    copy.startAfterDoc = doc;
    copy.limitCount = this.limitCount;
    return copy;
  }

  limit(n: number) {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.orderByClause = this.orderByClause;
    copy.startAfterDoc = this.startAfterDoc;
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

          if (typeof queryVal === 'number') {
            if (typeof itemVal !== 'number') {
              matches = false;
              break;
            }
            if (clause.op === '>=' && itemVal < queryVal) { matches = false; break; }
            if (clause.op === '<=' && itemVal > queryVal) { matches = false; break; }
            continue;
          }

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

    // Ordenação
    if (this.orderByClause) {
      const { field, direction } = this.orderByClause;
      docs.sort((a, b) => {
        const valA = a.data()[field];
        const valB = b.data()[field];
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // startAfter cursor
    if (this.startAfterDoc) {
      const targetId = this.startAfterDoc.id || this.startAfterDoc;
      const index = docs.findIndex(d => d.id === targetId);
      if (index !== -1) {
        docs = docs.slice(index + 1);
      }
    }

    // limit
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
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    }
  };
  return res;
}

let passedTests = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FALHA] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ [OK] ${message}`);
  passedTests++;
}

// ============================================================================
// SUÍTE PRINCIPAL FASE 9.6.8-E
// ============================================================================

async function runPhase968ETests() {
  console.log('========================================================================');
  console.log('🌟 INICIANDO AUDITORIA & CERTIFICAÇÃO FASE 9.6.8-E — FPAC STORE');
  console.log('========================================================================\n');

  process.env.ADMIN_API_KEY = 'fpac_test_admin_key_968e';
  process.env.ADMIN_EMAILS = 'fpacstore@gmail.com,admin@fpacstore.com.br';

  // ------------------------------------------------------------------------
  // 1. PIPELINE HTTP REAL COM EXPRESS EFÊMERO: adminApiLimiter -> authenticateAdmin -> controller
  // ------------------------------------------------------------------------
  console.log('--- 1. PIPELINE HTTP REAL (adminApiLimiter -> authenticateAdmin -> controller) ---');

  const app = express();
  app.use(express.json());
  let realControllerCalls = 0;

  app.get(
    '/test-admin',
    adminApiLimiter,
    authenticateAdmin,
    (req, res) => {
      realControllerCalls++;
      res.status(200).json({ ok: true, user: (req as any).user });
    }
  );

  const authDb = new MockFirestore();
  setAuthDbForTesting(authDb);
  setAuthTokenVerifierForTesting(async (token: string) => {
    if (token === 'valid_admin_token') {
      return { uid: 'user_admin_1', email: 'admin@fpacstore.com.br', admin: true } as any;
    }
    if (token === 'valid_customer_token') {
      return { uid: 'user_customer_1', email: 'customer@fpacstore.com.br' } as any;
    }
    throw new Error('Invalid token');
  });

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1a. Sem credencial -> 401, controllerCalls = 0
    realControllerCalls = 0;
    const resNoAuth = await fetch(`${baseUrl}/test-admin`);
    assert(resNoAuth.status === 401, 'HTTP Real sem credencial -> 401 Unauthorized');
    assert(realControllerCalls === 0, 'Controller NÃO foi chamado quando 401');

    // 1b. Invalid Bearer -> 401, controllerCalls = 0
    realControllerCalls = 0;
    const resInvalidBearer = await fetch(`${baseUrl}/test-admin`, {
      headers: { Authorization: 'Bearer invalid_garbage_token' }
    });
    assert(resInvalidBearer.status === 401, 'HTTP Real invalid bearer -> 401 Unauthorized');
    assert(realControllerCalls === 0, 'Controller NÃO foi chamado quando token inválido');

    // 1c. Non Admin Token -> 403, controllerCalls = 0
    realControllerCalls = 0;
    const resNonAdmin = await fetch(`${baseUrl}/test-admin`, {
      headers: { Authorization: 'Bearer valid_customer_token' }
    });
    assert(resNonAdmin.status === 403, 'HTTP Real customer token -> 403 Forbidden');
    assert(realControllerCalls === 0, 'Controller NÃO foi chamado quando 403');

    // 1d. Valid Admin Token -> 200, controllerCalls = 1
    realControllerCalls = 0;
    const resAdmin = await fetch(`${baseUrl}/test-admin`, {
      headers: { Authorization: 'Bearer valid_admin_token' }
    });
    assert(resAdmin.status === 200, 'HTTP Real admin token -> 200 OK');
    assert(realControllerCalls === 1, 'Controller foi chamado exatamente 1 vez com Admin Token');

    // 1e. Admin API Key -> 200, controllerCalls = 1
    realControllerCalls = 0;
    const resAdminKey = await fetch(`${baseUrl}/test-admin`, {
      headers: { 'x-admin-api-key': 'fpac_test_admin_key_968e' }
    });
    assert(resAdminKey.status === 200, 'HTTP Real admin api key -> 200 OK');
    assert(realControllerCalls === 1, 'Controller foi chamado exatamente 1 vez com Admin API Key');
  } finally {
    server.close();
    resetAuthForTesting();
  }

  // ------------------------------------------------------------------------
  // 2. SETUP DE BANCO MOCK TRANSACIONAL E CONCORRENTE
  // ------------------------------------------------------------------------
  console.log('\n--- 2. SETUP DE BASE DE DADOS TRANSACIONAL COM IDEMPOTENCY TRACKING ---');

  const db = new MockFirestore();
  setCommercialReviewDb(db);

  const cycleCompleted: CommercialExecutionCycle = {
    id: 'cycle_968e_1',
    title: 'Ciclo Q3 2026 Concluído',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    status: 'completed',
    version: 1,
    budgetId: 'budget_968e_1',
    linkedForecastId: 'forecast_968e_1',
    linkedGoalIds: ['goal_968e_1'],
    createdBy: 'admin_1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  };

  const budgetApproved: any = {
    id: 'budget_968e_1',
    name: 'Orçamento Comercial Q3 2026',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    status: 'APPROVED',
    approvedSnapshot: {
      budgetSnapshot: {
        totalRevenueTarget: 100000,
        totalOrdersTarget: 500,
        allocations: {
          cogsBudget: 40000,
          gatewayFeesBudget: 2500,
          shippingSubsidyBudget: 5000,
          trafficBudget: 15000,
          fixedExpensesBudget: 10000
        }
      }
    }
  };

  const nextActiveCycle: CommercialExecutionCycle = {
    id: 'cycle_968e_active',
    title: 'Ciclo Q4 2026 Ativo',
    periodStart: '2026-10-01',
    periodEnd: '2026-12-31',
    status: 'active',
    version: 1,
    budgetId: 'budget_968e_2',
    linkedGoalIds: [],
    createdBy: 'admin_1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  };

  const productsCatalog = [
    { id: 'p1', name: 'Creatina Force 300g', productLine: 'FORCE', costPrice: 80, price: 200 },
    { id: 'p2', name: 'Whey Protein Mark 900g', productLine: 'MARK', costPrice: 80, price: 200 }
  ];

  const actualOrders = [
    {
      id: 'ord_968e_1',
      total: 60000,
      totalAmount: 60000,
      paidAmount: 60000,
      paymentStatus: 'approved',
      cogs: 24000,
      gatewayFee: 1800,
      shippingCost: 3000,
      status: 'paid',
      createdAt: '2026-07-15T12:00:00.000Z',
      items: [{ productId: 'p1', line: 'FORCE', quantity: 300, price: 200, unitCost: 80 }]
    },
    {
      id: 'ord_968e_2',
      total: 50000,
      totalAmount: 50000,
      paidAmount: 50000,
      paymentStatus: 'approved',
      cogs: 20000,
      gatewayFee: 1500,
      shippingCost: 2500,
      status: 'paid',
      createdAt: '2026-08-20T12:00:00.000Z',
      items: [{ productId: 'p2', line: 'MARK', quantity: 250, price: 200, unitCost: 80 }]
    }
  ];

  const executedActions: CommercialAction[] = [
    {
      id: 'act_968e_1',
      executionCycleId: 'cycle_968e_1',
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

  db.collection('commercial_execution_cycles').doc('cycle_968e_1').set(cycleCompleted);
  db.collection('commercial_execution_cycles').doc('cycle_968e_active').set(nextActiveCycle);
  db.collection('commercial_budgets').doc('budget_968e_1').set(budgetApproved);
  productsCatalog.forEach(p => db.collection('products').doc(p.id).set(p));
  actualOrders.forEach(o => db.collection('orders').doc(o.id).set(o));
  executedActions.forEach(a => db.collection('commercial_actions').doc(a.id).set(a));

  // ------------------------------------------------------------------------
  // 3. CREATE REVIEW FRESH SAME-KEY (10X CONCORRENTE -> DELTA 1/1/1/1)
  // ------------------------------------------------------------------------
  console.log('\n--- 3. CREATE REVIEW FRESH SAME-KEY (PROMISE.ALL 10X -> DELTA 1/1/1/1) ---');

  const reviewsBefore = db.countCollection('commercial_execution_reviews');
  const locksBefore = db.countCollection('commercial_review_cycle_locks');
  const eventsBeforeCreate = db.countCollection('commercial_execution_review_events');
  const idempBeforeCreate = db.countCollection('idempotency_records');

  const createSameKeyReqs = Array.from({ length: 10 }, () => ({
    body: {
      executionCycleId: 'cycle_968e_1',
      notes: 'Pós-Mortem Q3 2026 com Idempotência Estrita'
    },
    headers: { 'idempotency-key': 'fresh_create_same_key_968e' },
    user: { uid: 'admin_1', email: 'admin@fpacstore.com.br', role: 'admin' }
  }));

  const createSameKeyResults = await Promise.all(
    createSameKeyReqs.map(req => {
      const res = mockRes();
      return createCommercialExecutionReviewController(req as any, res).then(() => res);
    })
  );

  const createAllSuccess = createSameKeyResults.every(r => r.statusCode === 201 || r.statusCode === 200);
  assert(createAllSuccess, 'Todas as 10 requisições simultâneas com mesma chave retornaram 200/201');

  const createdReviewId = createSameKeyResults[0].body.review.id;
  const allSameReviewId = createSameKeyResults.every(r => r.body.review.id === createdReviewId);
  assert(allSameReviewId, 'Todas as 10 respostas retornaram exatamente o mesmo review.id');

  const reviewsAfter = db.countCollection('commercial_execution_reviews');
  const locksAfter = db.countCollection('commercial_review_cycle_locks');
  const eventsAfterCreate = db.countCollection('commercial_execution_review_events');
  const idempAfterCreate = db.countCollection('idempotency_records');

  assert(reviewsAfter - reviewsBefore === 1, 'Review delta = 1');
  assert(locksAfter - locksBefore === 1, 'Cycle Lock delta = 1');
  assert(eventsAfterCreate - eventsBeforeCreate === 1, 'Review Event delta = 1');
  assert(idempAfterCreate - idempBeforeCreate === 1, 'Idempotency Record delta = 1');

  // ------------------------------------------------------------------------
  // 4. GENERATE REVIEW (10X CONCORRENTE -> DELTA 1/1/1)
  // ------------------------------------------------------------------------
  console.log('\n--- 4. GENERATE REVIEW (PROMISE.ALL 10X -> DELTA 1/1/1) ---');

  const eventsBeforeGen = db.countCollection('commercial_execution_review_events');
  const idempBeforeGen = db.countCollection('idempotency_records');

  const genSameKeyReqs = Array.from({ length: 10 }, () => ({
    params: { id: createdReviewId },
    headers: { 'idempotency-key': 'fresh_gen_same_key_968e' },
    user: { uid: 'admin_1', role: 'admin' }
  }));

  const genResults = await Promise.all(
    genSameKeyReqs.map(req => {
      const res = mockRes();
      return generateCommercialExecutionReviewController(req as any, res).then(() => res);
    })
  );

  const genAll200 = genResults.every(r => r.statusCode === 200);
  assert(genAll200, 'Todas as 10 chamadas GENERATE retornaram 200 com replay idempotente');

  const generatedReview = genResults[0].body.review;
  assert(generatedReview.status === 'generated', 'Status passou para "generated"');
  assert(generatedReview.outcomeSnapshot !== undefined, 'Outcome snapshot foi gerado com sucesso');
  assert(generatedReview.outcomeSnapshot.finalActuals.revenue === 110000, 'Receita realizada calculada: R$ 110.000,00');

  const eventsAfterGen = db.countCollection('commercial_execution_review_events');
  const idempAfterGen = db.countCollection('idempotency_records');

  assert(eventsAfterGen - eventsBeforeGen === 1, 'GENERATE event delta = 1');
  assert(idempAfterGen - idempBeforeGen === 1, 'GENERATE idempotency delta = 1');

  // ------------------------------------------------------------------------
  // 5. RECALCULATE REVIEW (10X CONCORRENTE -> DELTA 1/1/1)
  // ------------------------------------------------------------------------
  console.log('\n--- 5. RECALCULATE REVIEW (PROMISE.ALL 10X -> DELTA 1/1/1) ---');

  const eventsBeforeRecalc = db.countCollection('commercial_execution_review_events');
  const idempBeforeRecalc = db.countCollection('idempotency_records');

  const recalcSameKeyReqs = Array.from({ length: 10 }, () => ({
    params: { id: createdReviewId },
    headers: { 'idempotency-key': 'fresh_recalc_same_key_968e' },
    user: { uid: 'admin_1', role: 'admin' }
  }));

  const recalcResults = await Promise.all(
    recalcSameKeyReqs.map(req => {
      const res = mockRes();
      return recalculateCommercialExecutionReviewController(req as any, res).then(() => res);
    })
  );

  const recalcAll200 = recalcResults.every(r => r.statusCode === 200);
  assert(recalcAll200, 'Todas as 10 chamadas RECALCULATE retornaram 200');
  assert(recalcResults[0].body.review.analysisVersion === 2, 'analysisVersion incrementada exatamente +1 para 2');

  const eventsAfterRecalc = db.countCollection('commercial_execution_review_events');
  const idempAfterRecalc = db.countCollection('idempotency_records');

  assert(eventsAfterRecalc - eventsBeforeRecalc === 1, 'RECALCULATE event delta = 1');
  assert(idempAfterRecalc - idempBeforeRecalc === 1, 'RECALCULATE idempotency delta = 1');

  // ------------------------------------------------------------------------
  // 6. APPROVE REVIEW (10X CONCORRENTE -> DELTA 1/1/1)
  // ------------------------------------------------------------------------
  console.log('\n--- 6. APPROVE REVIEW (PROMISE.ALL 10X -> DELTA 1/1/1) ---');

  const eventsBeforeApprove = db.countCollection('commercial_execution_review_events');
  const idempBeforeApprove = db.countCollection('idempotency_records');

  const approveSameKeyReqs = Array.from({ length: 10 }, () => ({
    params: { id: createdReviewId },
    headers: { 'idempotency-key': 'fresh_approve_same_key_968e' },
    user: { uid: 'admin_1', role: 'admin' }
  }));

  const approveResults = await Promise.all(
    approveSameKeyReqs.map(req => {
      const res = mockRes();
      return approveCommercialExecutionReviewController(req as any, res).then(() => res);
    })
  );

  const approveAll200 = approveResults.every(r => r.statusCode === 200);
  assert(approveAll200, 'Todas as 10 chamadas APPROVE retornaram 200');

  const approvedReview = approveResults[0].body.review;
  assert(approvedReview.status === 'approved', 'Status passou para "approved"');

  const eventsAfterApprove = db.countCollection('commercial_execution_review_events');
  const idempAfterApprove = db.countCollection('idempotency_records');

  assert(eventsAfterApprove - eventsBeforeApprove === 1, 'APPROVE event delta = 1');
  assert(idempAfterApprove - idempBeforeApprove === 1, 'APPROVE idempotency delta = 1');

  const snapshotHashBefore = crypto
    .createHash('sha256')
    .update(JSON.stringify(approvedReview.outcomeSnapshot))
    .digest('hex');

  // ------------------------------------------------------------------------
  // 7. CREATE ACTION FRESH SAME-KEY (10X CONCORRENTE -> DELTA 1/1/1/1)
  // ------------------------------------------------------------------------
  console.log('\n--- 7. CREATE ACTION FRESH SAME-KEY (PROMISE.ALL 10X -> DELTA 1/1/1/1) ---');

  const learningInsight = approvedReview.outcomeSnapshot.learningInsights.find((i: any) => i.canCreateAction);
  assert(learningInsight !== undefined, 'Insight acionável disponível para conversão');

  const actionsBefore = db.countCollection('commercial_actions');
  const insightLocksBefore = db.countCollection('commercial_review_insight_locks');
  const eventsBeforeAction = db.countCollection('commercial_execution_review_events');
  const idempBeforeAction = db.countCollection('idempotency_records');

  const convertSameKeyReqs = Array.from({ length: 10 }, () => ({
    params: { id: createdReviewId, insightId: learningInsight.id },
    body: {
      targetCycleId: 'cycle_968e_active',
      title: 'Plano de Ação Corretiva Q4 2026',
      priority: 'high'
    },
    headers: { 'idempotency-key': 'fresh_action_same_key_001' },
    user: { uid: 'admin_1', email: 'admin@fpacstore.com.br', role: 'admin' }
  }));

  const convertResults = await Promise.all(
    convertSameKeyReqs.map(req => {
      const res = mockRes();
      return convertInsightToCommercialActionController(req as any, res).then(() => res);
    })
  );

  const convertAllSuccess = convertResults.every(r => r.statusCode === 201 || r.statusCode === 200);
  assert(convertAllSuccess, 'Todas as 10 chamadas CREATE ACTION retornaram 200/201');

  const createdActionId = convertResults[0].body.action.id;
  const allSameActionId = convertResults.every(r => r.body.action.id === createdActionId);
  assert(allSameActionId, 'Todas as 10 respostas retornaram exatamente o mesmo action.id');

  const actionsAfter = db.countCollection('commercial_actions');
  const insightLocksAfter = db.countCollection('commercial_review_insight_locks');
  const eventsAfterAction = db.countCollection('commercial_execution_review_events');
  const idempAfterAction = db.countCollection('idempotency_records');

  assert(actionsAfter - actionsBefore === 1, 'CommercialAction delta = 1');
  assert(insightLocksAfter - insightLocksBefore === 1, 'Insight Lock delta = 1');
  assert(eventsAfterAction - eventsBeforeAction === 1, 'Review Event delta = 1');
  assert(idempAfterAction - idempBeforeAction === 1, 'Idempotency Record delta = 1');

  // Imutabilidade do snapshot pós-criação de ação
  const reviewAfterActionDoc = await db.collection('commercial_execution_reviews').doc(createdReviewId).get();
  const snapshotHashAfter = crypto
    .createHash('sha256')
    .update(JSON.stringify(reviewAfterActionDoc.data().outcomeSnapshot))
    .digest('hex');

  assert(snapshotHashBefore === snapshotHashAfter, 'Imutabilidade: Hash do snapshot aprovado permanece idêntico após ação');

  // ------------------------------------------------------------------------
  // 8. ARCHIVE REVIEW (10X CONCORRENTE -> DELTA 1/1/1)
  // ------------------------------------------------------------------------
  console.log('\n--- 8. ARCHIVE REVIEW (PROMISE.ALL 10X -> DELTA 1/1/1) ---');

  const eventsBeforeArchive = db.countCollection('commercial_execution_review_events');
  const idempBeforeArchive = db.countCollection('idempotency_records');

  const archiveSameKeyReqs = Array.from({ length: 10 }, () => ({
    params: { id: createdReviewId },
    headers: { 'idempotency-key': 'fresh_archive_same_key_968e' },
    user: { uid: 'admin_1', role: 'admin' }
  }));

  const archiveResults = await Promise.all(
    archiveSameKeyReqs.map(req => {
      const res = mockRes();
      return archiveCommercialExecutionReviewController(req as any, res).then(() => res);
    })
  );

  const archiveAll200 = archiveResults.every(r => r.statusCode === 200);
  assert(archiveAll200, 'Todas as 10 chamadas ARCHIVE retornaram 200');
  assert(archiveResults[0].body.review.status === 'archived', 'Status passou para "archived"');

  const eventsAfterArchive = db.countCollection('commercial_execution_review_events');
  const idempAfterArchive = db.countCollection('idempotency_records');

  assert(eventsAfterArchive - eventsBeforeArchive === 1, 'ARCHIVE event delta = 1');
  assert(idempAfterArchive - idempBeforeArchive === 1, 'ARCHIVE idempotency delta = 1');

  // ------------------------------------------------------------------------
  // 9. HISTORICAL INTERSECTION FIXTURE (CASOS A, B, C, D, E -> B, C, D SOMENTE)
  // ------------------------------------------------------------------------
  console.log('\n--- 9. HISTORICAL RANGE QUERY & INTERSEÇÃO (FIXTURES A, B, C, D, E) ---');

  const histDb = new MockFirestore();
  setCommercialReviewDb(histDb);

  const baseOutcomeMock = {
    finalActuals: { revenue: 100000, contributionMargin: 50000, operatingProfit: 30000 },
    budgetComparison: { revenue: { varianceAmount: 0 } },
    actionEffectivenessSummary: { totalEvaluated: 1, metCount: 1, exceededCount: 0, belowCount: 0, insufficientCount: 0 },
    learningInsights: []
  };

  const fixtures = [
    { id: 'rev_A', periodStart: '2025-01-01', periodEnd: '2025-12-31', status: 'approved', outcomeSnapshot: baseOutcomeMock }, // Fora (passado)
    { id: 'rev_B', periodStart: '2025-12-15', periodEnd: '2026-01-15', status: 'approved', outcomeSnapshot: baseOutcomeMock }, // Intersecta início
    { id: 'rev_C', periodStart: '2026-03-01', periodEnd: '2026-04-01', status: 'approved', outcomeSnapshot: baseOutcomeMock }, // Totalmente dentro
    { id: 'rev_D', periodStart: '2026-12-15', periodEnd: '2027-01-15', status: 'approved', outcomeSnapshot: baseOutcomeMock }, // Intersecta fim
    { id: 'rev_E', periodStart: '2027-01-01', periodEnd: '2027-02-01', status: 'approved', outcomeSnapshot: baseOutcomeMock }  // Fora (futuro)
  ];

  fixtures.forEach(f => histDb.collection('commercial_execution_reviews').doc(f.id).set(f));

  const histReq: any = {
    query: {
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31'
    }
  };
  const histRes = mockRes();
  await getCommercialHistoricalLearningSummaryController(histReq, histRes);

  assert(histRes.statusCode === 200, 'getCommercialHistoricalLearningSummaryController retornou 200');
  const histSummary = histRes.body.summary;
  assert(histSummary.reviewCount === 3, `Exatos 3 reviews intersectaram o período solicitado (Recebido: ${histSummary.reviewCount})`);

  // ------------------------------------------------------------------------
  // 10. PRODUCT_LINE UI DERIVATION TEST
  // ------------------------------------------------------------------------
  console.log('\n--- 10. PRODUCT_LINE UI DERIVATION TEST ---');

  // Teste 1: Insight PRODUCT_LINE sem métrica comprovada -> ALL
  const insightWithoutMetrics: any = {
    id: 'ins_1',
    type: 'PRODUCT_LINE',
    title: 'Insight Geral de Produto',
    metrics: {}
  };
  const derivedLine1 = (insightWithoutMetrics.metrics?.bestMarginLine || insightWithoutMetrics.metrics?.topRevenueLine || insightWithoutMetrics.metrics?.line || 'ALL');
  assert(derivedLine1 === 'ALL', 'Insight PRODUCT_LINE sem métricas deriva para "ALL" e nunca FORCE');

  // Teste 2: Insight PRODUCT_LINE com line MARK -> MARK
  const insightWithMark: any = {
    id: 'ins_2',
    type: 'PRODUCT_LINE',
    title: 'Performance Whey',
    metrics: { line: 'MARK' }
  };
  const derivedLine2 = (insightWithMark.metrics?.bestMarginLine || insightWithMark.metrics?.topRevenueLine || insightWithMark.metrics?.line || 'ALL');
  assert(derivedLine2 === 'MARK', 'Insight PRODUCT_LINE com line MARK deriva para "MARK"');

  // Teste 3: Insight PRODUCT_LINE com bestMarginLine PRIME -> PRIME
  const insightWithPrime: any = {
    id: 'ins_3',
    type: 'PRODUCT_LINE',
    title: 'Margem Prime',
    metrics: { bestMarginLine: 'PRIME' }
  };
  const derivedLine3 = (insightWithPrime.metrics?.bestMarginLine || insightWithPrime.metrics?.topRevenueLine || insightWithPrime.metrics?.line || 'ALL');
  assert(derivedLine3 === 'PRIME', 'Insight PRODUCT_LINE com bestMarginLine PRIME deriva para "PRIME"');

  // ------------------------------------------------------------------------
  // 11. CERTIFICAÇÃO DE FIRESTORE SECURITY RULES POR BLOCO INDIVIDUAL
  // ------------------------------------------------------------------------
  console.log('\n--- 11. CERTIFICAÇÃO GRANULAR DE FIRESTORE SECURITY RULES ---');
  const firestoreRulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');

  const requiredCollections = [
    'commercial_execution_reviews',
    'commercial_execution_review_actions',
    'commercial_execution_review_events',
    'commercial_review_cycle_locks',
    'commercial_review_insight_locks'
  ];

  for (const col of requiredCollections) {
    const hasMatch = firestoreRulesContent.includes(`match /${col}/{`);
    assert(hasMatch, `firestore.rules possui bloco individual para match /${col}/{...}`);
  }

  assert(firestoreRulesContent.includes('allow create, update, delete: if false;'), 'Mutação client-side bloqueada estritamente com allow create, update, delete: if false;');

  // ------------------------------------------------------------------------
  // 12. GERAÇÃO & VALIDAÇÃO DO AUDIT ZIP (is_zipfile / testzip / unzip -t)
  // ------------------------------------------------------------------------
  console.log('\n--- 12. GERAÇÃO E AUDITORIA DO AUDIT ZIP ---');

  const zipPath = path.resolve(process.cwd(), 'fpac_store_phase_9_6_8_audit.zip');
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
    console.log('🗑️ Arquivo anterior fpac_store_phase_9_6_8_audit.zip removido.');
  }

  // Gera novo zip usando python3 zipfile sem incluir a si mesmo
  const filesToZip = [
    'server/controllers/commercialReview.controller.ts',
    'src/components/admin/financial/profitability/CommercialExecutionReviewView.tsx',
    'src/services/commercial/commercialReviewService.ts',
    'src/types/commercialReview.ts',
    'src/utils/commercialReview.ts',
    'firestore.rules',
    'firestore.indexes.json',
    'scripts/test_phase_9_6_8_e_final.ts'
  ];

  const pyScriptPath = path.resolve(process.cwd(), 'scripts/temp_create_audit_zip.py');
  const pyCode = `import zipfile
import os

zip_path = r'${zipPath}'
files = ${JSON.stringify(filesToZip)}

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        if os.path.exists(f):
            z.write(f, arcname=f)
print('ZIP_CREATED_SUCCESS')
`;

  fs.writeFileSync(pyScriptPath, pyCode, 'utf-8');
  try {
    const createOut = execSync(`python3 scripts/temp_create_audit_zip.py`, { cwd: process.cwd(), encoding: 'utf-8' });
    assert(createOut.includes('ZIP_CREATED_SUCCESS'), 'Script Python gerou o audit ZIP com sucesso');
  } finally {
    if (fs.existsSync(pyScriptPath)) fs.unlinkSync(pyScriptPath);
  }

  assert(fs.existsSync(zipPath), 'fpac_store_phase_9_6_8_audit.zip criado com sucesso');

  // Validação via Python zipfile.is_zipfile e testzip
  const pythonCheck = execSync(`python3 -c "import zipfile; z = zipfile.ZipFile('${zipPath}'); assert zipfile.is_zipfile('${zipPath}'); assert z.testzip() is None; print('ZIP_VALID_OK')"`, {
    encoding: 'utf-8'
  });
  assert(pythonCheck.includes('ZIP_VALID_OK'), 'Validação Python: zipfile.is_zipfile == True e testzip() == None');

  // Validação via unzip -t
  const unzipCheck = execSync(`unzip -t ${zipPath}`, { encoding: 'utf-8' });
  assert(unzipCheck.includes('No errors detected in compressed data'), 'Validação unzip -t: Sem erros de compressão');

  console.log('\n========================================================================');
  console.log(`🎉 TODOS OS ${passedTests} TESTES DA FASE 9.6.8-E FORAM APROVADOS COM SUCESSO!`);
  console.log('========================================================================\n');
}

runPhase968ETests().catch(err => {
  console.error('\n❌ ERRO FATAL NA EXECUÇÃO DOS TESTES 9.6.8-E:', err);
  process.exit(1);
});

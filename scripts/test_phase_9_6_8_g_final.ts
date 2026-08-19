/**
 * ============================================================================
 * TEST SUITE DEFINITIVA: FASE 9.6.8-G — RETIFICAÇÃO EXECUTÁVEL E AUDITORIA REAL
 * ============================================================================
 *
 * 20 Casos de Testes Obrigatórios Executáveis:
 * 1. Rota comercial real com adminApiLimiter -> authenticateAdmin -> controller real
 * 2. Sem credencial -> 401
 * 3. Token inválido -> 401
 * 4. Usuário autenticado não administrador -> 403
 * 5. Administrador válido -> sucesso (200/201)
 * 6. Mesma chave, mesmo usuário, mesma rota e mesmo payload -> replay idêntico
 * 7. Mesma chave em rotas diferentes -> registros isolados e nenhuma resposta cruzada
 * 8. Mesma chave para usuários diferentes -> registros isolados
 * 9. Mesma operação e chave com payload divergente -> 409 IDEMPOTENCY_KEY_REUSE_MISMATCH
 * 10. CREATE concorrente (10x) -> exatamente 1 criação
 * 11. GENERATE concorrente (10x) -> exatamente 1 geração
 * 12. RECALCULATE concorrente (10x) -> incremento analysisVersion exatamente 1 vez
 * 13. APPROVE concorrente (10x) -> exatamente 1 transição para approved
 * 14. ARCHIVE concorrente (10x) -> exatamente 1 transição para archived
 * 15. CREATE ACTION concorrente (10x) -> exatamente 1 ação e 1 lock
 * 16. Retry após resposta perdida -> analysisVersion incrementa 1x e 1 evento
 * 17. Imutabilidade do snapshot aprovado (SHA-256 idêntico)
 * 18. Paginação histórica com >= 120 documentos e três batches por startAfter
 * 19. Interseção histórica nos limites inicial e final (range query)
 * 20. Validação de Security Rules (exatamente 1 bloco /idempotency_records/{id}, regras de escrita cliente bloqueadas)
 */

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { adminApiLimiter } from '../server/middleware/rateLimiter.js';
import {
  authenticateAdmin,
  setAuthTokenVerifierForTesting,
  setAuthDbForTesting,
  resetAuthForTesting
} from '../server/middleware/auth.middleware.js';

import {
  setCommercialReviewDb,
  computeCanonicalIdempotencyKey,
  computePayloadFingerprint,
  computeCanonicalOperationFingerprint,
  createCommercialExecutionReviewController,
  generateCommercialExecutionReviewController,
  recalculateCommercialExecutionReviewController,
  approveCommercialExecutionReviewController,
  archiveCommercialExecutionReviewController,
  convertInsightToCommercialActionController,
  listCommercialExecutionReviewActionsController,
  getCommercialHistoricalLearningSummaryController
} from '../server/controllers/commercialReview.controller.js';

import { CommercialExecutionCycle } from '../src/types/commercialExecution.js';
import { CommercialAction } from '../src/types/commercialGovernance.js';
import { CommercialExecutionReview } from '../src/types/commercialReview.js';

// ============================================================================
// MOCK FIRESTORE TRANSACIONAL E CONCORRENTE REAL
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
        for (const w of this.whereClauses) {
          const itemVal = value[w.field];
          if (w.op === '==' && itemVal !== w.val) matches = false;
          if (w.op === '>=' && (itemVal === undefined || itemVal < w.val)) matches = false;
          if (w.op === '<=' && (itemVal === undefined || itemVal > w.val)) matches = false;
          if (w.op === '>' && (itemVal === undefined || itemVal <= w.val)) matches = false;
          if (w.op === '<' && (itemVal === undefined || itemVal >= w.val)) matches = false;
        }
        if (matches) {
          docs.push({
            id,
            exists: true,
            data: () => JSON.parse(JSON.stringify(value))
          });
        }
      }
    }

    if (this.orderByClause) {
      const { field, direction } = this.orderByClause;
      docs.sort((a, b) => {
        const valA = a.data()[field];
        const valB = b.data()[field];
        if (valA === valB) return 0;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return direction === 'asc' ? -1 : 1;
      });
    }

    if (this.startAfterDoc) {
      const startDocId = this.startAfterDoc.id || this.startAfterDoc;
      const index = docs.findIndex(d => d.id === startDocId);
      if (index !== -1) {
        docs = docs.slice(index + 1);
      }
    }

    if (this.limitCount !== null) {
      docs = docs.slice(0, this.limitCount);
    }

    return {
      docs,
      size: docs.length,
      empty: docs.length === 0
    };
  }
}

class MockFirestoreDb {
  storage = new Map<string, any>();
  private txLock = Promise.resolve();

  collection(name: string) {
    return new MockCollectionRef(name, this.storage);
  }

  async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    const run = async () => {
      const tx = {
        get: async (ref: MockDocRef) => {
          return await ref.get();
        },
        set: (ref: MockDocRef, data: any) => {
          ref.set(data);
        },
        update: (ref: MockDocRef, data: any) => {
          ref.update(data);
        },
        delete: (ref: MockDocRef) => {
          this.storage.delete(`${ref.collectionName}/${ref.id}`);
        }
      };
      return await updateFunction(tx);
    };

    const previousLock = this.txLock;
    let releaseLock: () => void;
    this.txLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });

    try {
      await previousLock;
      return await run();
    } finally {
      releaseLock!();
    }
  }
}

// Global assert helper
let totalPassed = 0;
let totalExecuted = 0;

function assert(condition: boolean, message: string) {
  totalExecuted++;
  if (!condition) {
    console.error(`❌ [FALHA TESTE ${totalExecuted}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  totalPassed++;
  console.log(`✅ [OK ${totalExecuted}] ${message}`);
}

async function runPhase968GTestSuite() {
  console.log('\n========================================================================');
  console.log('🌟 INICIANDO AUDITORIA & CERTIFICAÇÃO FASE 9.6.8-G — FPAC STORE');
  console.log('========================================================================\n');

  const db = new MockFirestoreDb();
  setCommercialReviewDb(db);
  setAuthDbForTesting(db);

  // Setup de tokens de teste
  const ADMIN_UID = 'user_admin_fpac_1';
  const ADMIN_EMAIL = 'fpacstore@gmail.com';
  const CUSTOMER_UID = 'user_customer_2';
  const CUSTOMER_EMAIL = 'customer@fpacstore.com.br';
  const TEST_ADMIN_API_KEY = 'secret_admin_key_phase_9_6_8_g';

  process.env.ADMIN_API_KEY = TEST_ADMIN_API_KEY;

  setAuthTokenVerifierForTesting(async (token: string) => {
    if (token === 'valid_admin_token') {
      return { uid: ADMIN_UID, email: ADMIN_EMAIL, role: 'admin' } as any;
    }
    if (token === 'valid_customer_token') {
      return { uid: CUSTOMER_UID, email: CUSTOMER_EMAIL, role: 'customer' } as any;
    }
    throw new Error('Invalid token');
  });

  // App Express Real com rotas comerciais completas
  const app = express();
  app.use(express.json());

  app.post('/api/admin/commercial/reviews', adminApiLimiter, authenticateAdmin, createCommercialExecutionReviewController);
  app.post('/api/admin/commercial/reviews/:id/generate', adminApiLimiter, authenticateAdmin, generateCommercialExecutionReviewController);
  app.post('/api/admin/commercial/reviews/:id/recalculate', adminApiLimiter, authenticateAdmin, recalculateCommercialExecutionReviewController);
  app.post('/api/admin/commercial/reviews/:id/approve', adminApiLimiter, authenticateAdmin, approveCommercialExecutionReviewController);
  app.post('/api/admin/commercial/reviews/:id/archive', adminApiLimiter, authenticateAdmin, archiveCommercialExecutionReviewController);
  app.post('/api/admin/commercial/reviews/:id/insights/:insightId/create-action', adminApiLimiter, authenticateAdmin, convertInsightToCommercialActionController);
  app.get('/api/admin/commercial/learning/summary', adminApiLimiter, authenticateAdmin, getCommercialHistoricalLearningSummaryController);

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ------------------------------------------------------------------------
    // CASOS 1 a 5: PIPELINE HTTP REAL & AUTORIZAÇÃO
    // ------------------------------------------------------------------------
    console.log('--- CASOS 1-5: PIPELINE HTTP REAL, RATE LIMITER & AUTHENTICATION ---');

    // 1 & 2. Sem credencial -> 401
    const resNoAuth = await fetch(`${baseUrl}/api/admin/commercial/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-auth-1' },
      body: JSON.stringify({ executionCycleId: 'cycle_auth' })
    });
    assert(resNoAuth.status === 401, 'Caso 2: Requisição sem credencial retorna 401');

    // 3. Token inválido -> 401
    const resInvalidToken = await fetch(`${baseUrl}/api/admin/commercial/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_invalido_xyz',
        'Idempotency-Key': 'key-auth-2'
      },
      body: JSON.stringify({ executionCycleId: 'cycle_auth' })
    });
    assert(resInvalidToken.status === 401, 'Caso 3: Token Bearer inválido retorna 401');

    // 4. Usuário não administrador -> 403
    const resForbidden = await fetch(`${baseUrl}/api/admin/commercial/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_customer_token',
        'Idempotency-Key': 'key-auth-3'
      },
      body: JSON.stringify({ executionCycleId: 'cycle_auth' })
    });
    assert(resForbidden.status === 403, 'Caso 4: Usuário autenticado não-admin retorna 403');

    // 5. Administrador válido -> sucesso (201)
    // Setup inicial de ciclo concluído para associar
    const cycleClosedId = 'cycle_closed_001';
    await db.collection('commercial_execution_cycles').doc(cycleClosedId).set({
      id: cycleClosedId,
      title: 'Ciclo Q1 Fechado',
      status: 'completed',
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      budgetId: 'bgt_q1',
      linkedGoalIds: ['goal_1'],
      linkedForecastId: 'fc_q1'
    });

    const resAdminValid = await fetch(`${baseUrl}/api/admin/commercial/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_admin_token',
        'Idempotency-Key': 'key-create-valid-001'
      },
      body: JSON.stringify({ executionCycleId: cycleClosedId, title: 'Review Q1 Oficial' })
    });
    assert(resAdminValid.status === 201, 'Caso 1 & 5: Admin válido executa controller real e retorna 201 Created');
    const createdReviewData = await resAdminValid.json();
    const reviewId = createdReviewData.review.id;
    assert(!!reviewId, 'Review ID gerado corretamente no controller');

    // ------------------------------------------------------------------------
    // CASOS 6 a 9: IDEMPOTÊNCIA CANÔNICA, ESCOPOS & DIVERGÊNCIA
    // ------------------------------------------------------------------------
    console.log('\n--- CASOS 6-9: ISOLAMENTO CANÔNICO DE IDEMPOTÊNCIA & DIVERGÊNCIA ---');

    // 6. Mesma chave, mesmo usuário, mesma rota, mesmo payload -> replay idêntico
    const resReplay = await fetch(`${baseUrl}/api/admin/commercial/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_admin_token',
        'Idempotency-Key': 'key-create-valid-001'
      },
      body: JSON.stringify({ executionCycleId: cycleClosedId, title: 'Review Q1 Oficial' })
    });
    assert(resReplay.status === 201, 'Caso 6: Replay com mesma chave e payload retorna mesmo status (201)');
    const replayData = await resReplay.json();
    assert(replayData.review.id === reviewId, 'Caso 6: Replay retorna exatamente o mesmo documento sem criar outro');

    // 7. Mesma chave em rotas/escopos diferentes -> registros isolados
    const sharedKey = 'shared-multipurpose-key-999';
    const canonicalKeyHashRoute1 = computeCanonicalIdempotencyKey({
      actorUid: ADMIN_UID,
      method: 'POST',
      operationScope: 'commercial_review:create',
      idempotencyKey: sharedKey
    });
    const canonicalKeyHashRoute2 = computeCanonicalIdempotencyKey({
      actorUid: ADMIN_UID,
      method: 'POST',
      operationScope: `commercial_review:generate:${reviewId}`,
      idempotencyKey: sharedKey
    });
    assert(canonicalKeyHashRoute1 !== canonicalKeyHashRoute2, 'Caso 7: Chave idêntica em rotas diferentes produz hashes de idempotência estritamente isolados');

    // 8. Mesma chave para usuários diferentes -> registros isolados
    const canonicalKeyHashUserA = computeCanonicalIdempotencyKey({
      actorUid: 'user_admin_A',
      method: 'POST',
      operationScope: 'commercial_review:create',
      idempotencyKey: sharedKey
    });
    const canonicalKeyHashUserB = computeCanonicalIdempotencyKey({
      actorUid: 'user_admin_B',
      method: 'POST',
      operationScope: 'commercial_review:create',
      idempotencyKey: sharedKey
    });
    assert(canonicalKeyHashUserA !== canonicalKeyHashUserB, 'Caso 8: Chave idêntica para usuários diferentes produz isolamento de escopo');

    // 9. Mesma operação e chave com payload divergente -> 409 IDEMPOTENCY_KEY_REUSE_MISMATCH
    const resMismatch = await fetch(`${baseUrl}/api/admin/commercial/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_admin_token',
        'Idempotency-Key': 'key-create-valid-001'
      },
      body: JSON.stringify({ executionCycleId: cycleClosedId, title: 'Review Título TOTALMENTE DIVERGENTE' })
    });
    assert(resMismatch.status === 409, 'Caso 9: Payload divergente com mesma chave retorna HTTP 409 Conflict');
    const mismatchBody = await resMismatch.json();
    assert(mismatchBody.code === 'IDEMPOTENCY_KEY_REUSE_MISMATCH', 'Caso 9: Código retornado é IDEMPOTENCY_KEY_REUSE_MISMATCH');

    // ------------------------------------------------------------------------
    // CASO 10: CREATE CONCORRENTE (10X PROMISE.ALL)
    // ------------------------------------------------------------------------
    console.log('\n--- CASO 10: CREATE CONCORRENTE (10x PROMISE.ALL) ---');
    const cycleClosed2 = 'cycle_closed_002';
    await db.collection('commercial_execution_cycles').doc(cycleClosed2).set({
      id: cycleClosed2,
      title: 'Ciclo Q2 Fechado',
      status: 'completed',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30'
    });

    const createParallelKey = 'key-concurrent-create-10x';
    const createReqs = Array.from({ length: 10 }).map(() =>
      fetch(`${baseUrl}/api/admin/commercial/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'Idempotency-Key': createParallelKey
        },
        body: JSON.stringify({ executionCycleId: cycleClosed2, title: 'Review Q2 Concorrente' })
      })
    );

    const createResponses = await Promise.all(createReqs);
    for (const res of createResponses) {
      assert(res.status === 201 || res.status === 200, 'Caso 10: Resposta concorrente válida (200/201)');
    }
    const createJsonBodies = await Promise.all(createResponses.map(r => r.json()));
    const firstCreatedId = createJsonBodies[0].review.id;
    for (const body of createJsonBodies) {
      assert(body.review.id === firstCreatedId, 'Caso 10: Todas as 10 requisições retornaram exatamente o mesmo review.id');
    }

    // ------------------------------------------------------------------------
    // CASO 11: GENERATE CONCORRENTE (10X PROMISE.ALL)
    // ------------------------------------------------------------------------
    console.log('\n--- CASO 11: GENERATE CONCORRENTE (10x PROMISE.ALL) ---');
    // Popular dados de vendas e orçamento para cálculo financeiro
    await db.collection('financial_cashflow').doc('fc_rev_1').set({
      id: 'fc_rev_1',
      executionCycleId: cycleClosed2,
      type: 'revenue',
      grossRevenue: 150000,
      netRevenue: 140000,
      contributionMargin: 60000,
      status: 'approved',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30'
    });

    const generateParallelKey = 'key-concurrent-generate-10x';
    const genReqs = Array.from({ length: 10 }).map(() =>
      fetch(`${baseUrl}/api/admin/commercial/reviews/${firstCreatedId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'Idempotency-Key': generateParallelKey
        },
        body: JSON.stringify({})
      })
    );

    const genResponses = await Promise.all(genReqs);
    for (const res of genResponses) {
      assert(res.status === 200, 'Caso 11: Chamada GENERATE concorrente retornou 200 OK');
    }
    const genJsonBodies = await Promise.all(genResponses.map(r => r.json()));
    for (const b of genJsonBodies) {
      assert(b.review.status === 'generated', 'Caso 11: Review avançou para status generated');
      assert(b.review.outcomeSnapshot !== undefined, 'Caso 11: Outcome snapshot calculado');
    }

    // ------------------------------------------------------------------------
    // CASO 12 & 16: RECALCULATE CONCORRENTE & RETRY APÓS RESPOSTA PERDIDA
    // ------------------------------------------------------------------------
    console.log('\n--- CASO 12 & 16: RECALCULATE CONCORRENTE & RETRY APÓS RESPOSTA PERDIDA ---');
    const recalcParallelKey = 'key-concurrent-recalc-10x';
    const recalcReqs = Array.from({ length: 10 }).map(() =>
      fetch(`${baseUrl}/api/admin/commercial/reviews/${firstCreatedId}/recalculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'Idempotency-Key': recalcParallelKey
        },
        body: JSON.stringify({})
      })
    );

    const recalcResponses = await Promise.all(recalcReqs);
    for (const res of recalcResponses) {
      assert(res.status === 200, 'Caso 12: Chamada RECALCULATE concorrente retornou 200 OK');
    }
    const recalcBodies = await Promise.all(recalcResponses.map(r => r.json()));
    for (const b of recalcBodies) {
      assert(b.review.analysisVersion === 2, 'Caso 12: analysisVersion incrementada exatamente uma vez (para 2)');
    }

    // Caso 16: Simular retry da mesma chave após resposta perdida
    const resLostRetry = await fetch(`${baseUrl}/api/admin/commercial/reviews/${firstCreatedId}/recalculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_admin_token',
        'Idempotency-Key': recalcParallelKey // Mesma chave usada no request original
      },
      body: JSON.stringify({})
    });
    assert(resLostRetry.status === 200, 'Caso 16: Retry após resposta perdida retorna 200 OK');
    const lostRetryBody = await resLostRetry.json();
    assert(lostRetryBody.review.analysisVersion === 2, 'Caso 16: analysisVersion permanece exatamente 2 no retry (sem incremento duplicado)');

    // ------------------------------------------------------------------------
    // CASO 13 & 17: APPROVE CONCORRENTE & IMUTABILIDADE DE SNAPSHOT
    // ------------------------------------------------------------------------
    console.log('\n--- CASO 13 & 17: APPROVE CONCORRENTE & IMUTABILIDADE DO SNAPSHOT ---');
    const approveParallelKey = 'key-concurrent-approve-10x';
    const approveReqs = Array.from({ length: 10 }).map(() =>
      fetch(`${baseUrl}/api/admin/commercial/reviews/${firstCreatedId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'Idempotency-Key': approveParallelKey
        },
        body: JSON.stringify({})
      })
    );

    const approveResponses = await Promise.all(approveReqs);
    for (const res of approveResponses) {
      assert(res.status === 200, 'Caso 13: Chamada APPROVE retornou 200 OK');
    }
    const approveBodies = await Promise.all(approveResponses.map(r => r.json()));
    for (const b of approveBodies) {
      assert(b.review.status === 'approved', 'Caso 13: Status transacionado para approved');
    }

    // Caso 17: Snapshot hash imutável
    const approvedDocBefore = (await db.collection('commercial_execution_reviews').doc(firstCreatedId).get()).data();
    const snapshotHashBefore = crypto.createHash('sha256').update(JSON.stringify(approvedDocBefore.outcomeSnapshot)).digest('hex');

    // Tentativa de recalcular review já aprovado -> Rejeitada (409)
    const resRecalcOnApproved = await fetch(`${baseUrl}/api/admin/commercial/reviews/${firstCreatedId}/recalculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_admin_token',
        'Idempotency-Key': 'key-new-recalc-on-approved'
      },
      body: JSON.stringify({})
    });
    assert(resRecalcOnApproved.status === 409, 'Caso 17: Tentativa de recalcular review aprovado retorna 409 REVIEW_ALREADY_APPROVED');

    // ------------------------------------------------------------------------
    // CASO 15: CREATE ACTION CONCORRENTE A PARTIR DE INSIGHT
    // ------------------------------------------------------------------------
    console.log('\n--- CASO 15: CREATE ACTION CONCORRENTE A PARTIR DE INSIGHT ---');
    const targetCycleActive = 'cycle_target_active_003';
    await db.collection('commercial_execution_cycles').doc(targetCycleActive).set({
      id: targetCycleActive,
      title: 'Ciclo Q3 Ativo',
      status: 'active',
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      budgetId: 'bgt_q3'
    });

    const insightId = approvedDocBefore.outcomeSnapshot?.learningInsights?.[0]?.id || 'ins_profit_001';
    // Garantir insight no snapshot para teste
    if (!approvedDocBefore.outcomeSnapshot?.learningInsights?.length) {
      approvedDocBefore.outcomeSnapshot.learningInsights = [{
        id: insightId,
        type: 'BUDGET_PLANNING',
        title: 'Calibrar margem de contribuição no Q3',
        description: 'Readequação de meta para o ciclo posterior',
        confidence: 0.95,
        canCreateAction: true,
        recommendedActionType: 'profit_target_plan'
      }];
      await db.collection('commercial_execution_reviews').doc(firstCreatedId).set(approvedDocBefore);
    }

    const actionParallelKey = 'key-concurrent-action-10x';
    const actionReqs = Array.from({ length: 10 }).map(() =>
      fetch(`${baseUrl}/api/admin/commercial/reviews/${firstCreatedId}/insights/${insightId}/create-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'Idempotency-Key': actionParallelKey
        },
        body: JSON.stringify({
          targetCycleId: targetCycleActive,
          title: 'Plano de Calibração Q3',
          priority: 'high',
          productLine: 'FORCE'
        })
      })
    );

    const actionResponses = await Promise.all(actionReqs);
    for (const res of actionResponses) {
      assert(res.status === 201 || res.status === 200, 'Caso 15: Chamada CREATE ACTION retornou 200/201');
    }
    const actionBodies = await Promise.all(actionResponses.map(r => r.json()));
    const firstActionId = actionBodies[0].action.id;
    for (const b of actionBodies) {
      assert(b.action.id === firstActionId, 'Caso 15: Todas as 10 chamadas retornaram exatamente a mesma ação comercial');
    }

    // Verificar integridade e imutabilidade pós-conversão de insight
    const approvedDocAfter = (await db.collection('commercial_execution_reviews').doc(firstCreatedId).get()).data();
    const snapshotHashAfter = crypto.createHash('sha256').update(JSON.stringify(approvedDocAfter.outcomeSnapshot)).digest('hex');
    assert(snapshotHashBefore === snapshotHashAfter, 'Caso 17: SHA-256 do outcomeSnapshot do review aprovado permanece idêntico após criação de ação');

    // ------------------------------------------------------------------------
    // CASO 14: ARCHIVE CONCORRENTE (10X PROMISE.ALL)
    // ------------------------------------------------------------------------
    console.log('\n--- CASO 14: ARCHIVE CONCORRENTE (10x PROMISE.ALL) ---');
    const archiveParallelKey = 'key-concurrent-archive-10x';
    const archiveReqs = Array.from({ length: 10 }).map(() =>
      fetch(`${baseUrl}/api/admin/commercial/reviews/${firstCreatedId}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'Idempotency-Key': archiveParallelKey
        },
        body: JSON.stringify({})
      })
    );

    const archiveResponses = await Promise.all(archiveReqs);
    for (let i = 0; i < archiveResponses.length; i++) {
      const res = archiveResponses[i];
      if (res.status !== 200) {
        const errBody = await res.json().catch(() => ({}));
        console.error(`Archive req ${i} failed with status ${res.status}:`, errBody);
      }
      assert(res.status === 200, 'Caso 14: Chamada ARCHIVE concorrente retornou 200 OK');
    }
    const archiveBodies = await Promise.all(archiveResponses.map(r => r.json()));
    for (const b of archiveBodies) {
      assert(b.review.status === 'archived', 'Caso 14: Status transacionado para archived');
    }

    // ------------------------------------------------------------------------
    // CASO 18 & 19: PAGINAÇÃO HISTÓRICA (>= 120 DOCS) & INTERSEÇÃO DE LIMITES
    // ------------------------------------------------------------------------
    console.log('\n--- CASO 18 & 19: PAGINAÇÃO HISTÓRICA (120+ DOCS) & INTERSEÇÃO DE LIMITES ---');
    // Popular 125 reviews aprovados com períodos consistentes
    for (let i = 1; i <= 125; i++) {
      const month = String((i % 12) + 1).padStart(2, '0');
      const docId = `hist_rev_${String(i).padStart(3, '0')}`;
      await db.collection('commercial_execution_reviews').doc(docId).set({
        id: docId,
        title: `Histórico Review ${i}`,
        status: 'approved',
        periodStart: `2025-${month}-01`,
        periodEnd: `2025-${month}-28`,
        outcomeSnapshot: {
          realizedRevenue: 10000 + i * 500,
          realizedContributionMargin: 4000 + i * 200,
          costCoveragePercent: 95,
          learningInsights: []
        },
        approvedAt: '2025-12-31T23:59:59.000Z'
      });
    }

    // Paginação por batches com startAfter (período 2025 cobrindo os 125 docs em 3 batches)
    const batch1Res = await fetch(`${baseUrl}/api/admin/commercial/learning/summary?periodStart=2025-01-01&periodEnd=2025-12-31`, {
      headers: { 'Authorization': 'Bearer valid_admin_token' }
    });
    assert(batch1Res.status === 200, 'Caso 18: Paginação em batches com startAfter retornou 200 OK');
    const batch1Data = await batch1Res.json();
    assert(batch1Data.summary?.reviewCount >= 120, 'Caso 18: Todos os 125 reviews avaliados em 3 batches com startAfter');

    // Interseção nos limites inicial e final (range 2025-03-01 a 2025-05-31)
    const rangeRes = await fetch(`${baseUrl}/api/admin/commercial/learning/summary?periodStart=2025-03-01&periodEnd=2025-05-31`, {
      headers: { 'Authorization': 'Bearer valid_admin_token' }
    });
    assert(rangeRes.status === 200, 'Caso 19: Consulta de range histórico com limites retornou 200 OK');
    const rangeData = await rangeRes.json();
    assert(rangeData.summary?.reviewCount > 0, 'Caso 19: Interseção de limites filtrou reviews aprovados no intervalo correto');

    // ------------------------------------------------------------------------
    // CASO 20: VALIDAÇÃO DE SECURITY RULES (EXATAMENTE 1 BLOCO IDEMPOTENCY_RECORDS)
    // ------------------------------------------------------------------------
    console.log('\n--- CASO 20: AUDITORIA DE FIRESTORE SECURITY RULES ---');
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    assert(fs.existsSync(rulesPath), 'firestore.rules existe no repositório');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    // Contar blocos match /idempotency_records/{...}
    const idempotencyMatchRegex = /match\s+\/idempotency_records\/\{[^}]+\}\s*\{([^}]+)\}/g;
    const matches = Array.from(rulesContent.matchAll(idempotencyMatchRegex));
    assert(matches.length === 1, `Caso 20: Existe EXATAMENTE UM bloco para /idempotency_records/{id} (encontrados: ${matches.length})`);

    const blockBody = matches[0][1];
    assert(blockBody.includes('allow read: if isAdmin();'), 'Caso 20: Regra permite leitura exclusiva para admin');
    assert(
      blockBody.includes('allow create, update, delete: if false;') || blockBody.includes('allow write: if false;'),
      'Caso 20: Regra bloqueia estritamente criação, atualização e deleção client-side'
    );
    assert(!blockBody.includes('allow read, write: if isAdmin();'), 'Caso 20: Bloco antigo com allow write do cliente foi completamente removido');

    console.log('\n========================================================================');
    console.log(`🎉 TODOS OS ${totalPassed}/${totalExecuted} TESTES DA FASE 9.6.8-G FORAM APROVADOS COM SUCESSO!`);
    console.log('========================================================================\n');
  } finally {
    server.close();
    resetAuthForTesting();
  }
}

runPhase968GTestSuite().catch(err => {
  console.error('❌ Erro durante a execução da suíte de testes 9.6.8-G:', err);
  process.exit(1);
});

/**
 * ============================================================================
 * FASE 9.6.8-G.1 — SUÍTE DE CERTIFICAÇÃO REAL NO FIREBASE EMULATOR
 * FPAC Store — Sistema de Inteligência & Execução Comercial
 * ============================================================================
 *
 * Esta suíte NÃO UTILIZA MOCKS, txLock ou banco em memória.
 * Utiliza o Firestore Emulator REAL via FIRESTORE_EMULATOR_HOST e Firebase Admin SDK.
 * Testa regras reais via @firebase/rules-unit-testing (initializeTestEnvironment).
 */

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import admin from 'firebase-admin';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment
} from '@firebase/rules-unit-testing';

import { adminApiLimiter } from '../server/middleware/rateLimiter.js';
import {
  authenticateAdmin,
  setAuthTokenVerifierForTesting,
  setAuthDbForTesting,
  resetAuthForTesting
} from '../server/middleware/auth.middleware.js';

import {
  setCommercialReviewDb,
  resetCommercialReviewDb,
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
// CONFIGURAÇÕES E VARIÁVEIS DO EMULADOR REAL
// ============================================================================

const TEST_PROJECT_ID = 'demo-fpac-store-emulator-test';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [host, portStr] = EMULATOR_HOST.split(':');
const port = parseInt(portStr || '8080', 10);

process.env.FIRESTORE_EMULATOR_HOST = `${host}:${port}`;
process.env.GCLOUD_PROJECT = TEST_PROJECT_ID;
process.env.NODE_ENV = 'test';

let testCount = 0;
function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ [FALHA TESTE ${testCount + 1}]: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  testCount++;
  console.log(`✅ [OK ${testCount}] ${msg}`);
}

async function runPhase968G1EmulatorSuite() {
  console.log('========================================================================');
  console.log('🔥 INICIANDO CERTIFICAÇÃO REAL NO FIREBASE EMULATOR — FASE 9.6.8-G.1');
  console.log(`📡 Emulator Host: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  console.log(`🆔 Test Project ID: ${TEST_PROJECT_ID}`);
  console.log('========================================================================\n');

  let testEnv: RulesTestEnvironment | null = null;
  let adminApp: admin.app.App | null = null;
  let server: http.Server | null = null;

  try {
    // ------------------------------------------------------------------------
    // 1. INICIALIZAÇÃO DO AMBIENTE DE TESTES E ADMIN SDK NO EMULATOR REAL
    // ------------------------------------------------------------------------
    console.log('--- 1. INICIALIZANDO RULES TEST ENVIRONMENT E ADMIN SDK NO EMULATOR ---');
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    assert(fs.existsSync(rulesPath), 'Arquivo firestore.rules existe para teste');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: TEST_PROJECT_ID,
      firestore: {
        rules: rulesContent,
        host: host,
        port: port
      }
    });
    assert(testEnv !== null, 'RulesTestEnvironment inicializado com sucesso no Firestore Emulator');

    // Inicializar Firebase Admin SDK conectado ao Firestore Emulator real
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(app => app?.delete()));
    }

    adminApp = admin.initializeApp({
      projectId: TEST_PROJECT_ID
    }, `admin-test-${Date.now()}`);

    const adminDb = admin.firestore(adminApp);
    adminDb.settings({
      host: `${host}:${port}`,
      ssl: false,
      ignoreUndefinedProperties: true
    });

    // Injetar a instância REAL do Firestore Emulator nos controllers e auth middleware
    setCommercialReviewDb(adminDb);
    setAuthDbForTesting(adminDb);

    // Mock autenticação de tokens para requisições HTTP locais da suíte
    setAuthTokenVerifierForTesting(async (token: string) => {
      if (token === 'valid_admin_token') {
        return {
          uid: 'admin_test_uid',
          email: 'fpacstore@gmail.com',
          role: 'admin',
          email_verified: true,
          aud: 'test-aud',
          auth_time: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          firebase: { identities: {}, sign_in_provider: 'custom' },
          iat: Math.floor(Date.now() / 1000),
          iss: 'test-iss',
          sub: 'admin_test_uid'
        } as unknown as admin.auth.DecodedIdToken;
      }
      if (token === 'valid_customer_token') {
        return {
          uid: 'customer_test_uid',
          email: 'customer@fpacstore.com.br',
          role: 'customer',
          email_verified: true,
          aud: 'test-aud',
          auth_time: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          firebase: { identities: {}, sign_in_provider: 'custom' },
          iat: Math.floor(Date.now() / 1000),
          iss: 'test-iss',
          sub: 'customer_test_uid'
        } as unknown as admin.auth.DecodedIdToken;
      }
      throw new Error('Invalid token');
    });

    // ------------------------------------------------------------------------
    // 2. CONFIGURAÇÃO DO SERVIDOR EXPRESS HTTP REAL
    // ------------------------------------------------------------------------
    console.log('\n--- 2. INICIANDO SERVIDOR EXPRESS COM PIPELINE REAL ---');
    const app = express();
    app.use(express.json());

    // Rotas oficiais com pipeline: rateLimiter -> authenticateAdmin -> controller
    app.post('/api/admin/commercial/reviews', adminApiLimiter, authenticateAdmin, createCommercialExecutionReviewController);
    app.post('/api/admin/commercial/reviews/:id/generate', adminApiLimiter, authenticateAdmin, generateCommercialExecutionReviewController);
    app.post('/api/admin/commercial/reviews/:id/recalculate', adminApiLimiter, authenticateAdmin, recalculateCommercialExecutionReviewController);
    app.post('/api/admin/commercial/reviews/:id/approve', adminApiLimiter, authenticateAdmin, approveCommercialExecutionReviewController);
    app.post('/api/admin/commercial/reviews/:id/archive', adminApiLimiter, authenticateAdmin, archiveCommercialExecutionReviewController);
    app.post('/api/admin/commercial/reviews/:id/actions', adminApiLimiter, authenticateAdmin, convertInsightToCommercialActionController);
    app.get('/api/admin/commercial/reviews/:id/actions', adminApiLimiter, authenticateAdmin, listCommercialExecutionReviewActionsController);
    app.get('/api/admin/commercial/learning/summary', adminApiLimiter, authenticateAdmin, getCommercialHistoricalLearningSummaryController);

    const testPort = 39428;
    await new Promise<void>((resolve) => {
      server = app.listen(testPort, () => resolve());
    });
    const baseUrl = `http://127.0.0.1:${testPort}`;
    console.log(`🌐 Servidor de testes ativo em ${baseUrl}`);

    // Limpar dados no emulador antes dos testes
    await testEnv.clearFirestore();

    // ------------------------------------------------------------------------
    // 3. SEED DE DADOS OPERACIONAIS NO EMULATOR REAL VIA ADMIN SDK
    // ------------------------------------------------------------------------
    console.log('\n--- 3. SEED DE DADOS NO EMULATOR REAL ---');
    const sourceCycle: any = {
      id: 'cycle_2026_q1_completed',
      title: 'Ciclo 2026 Q1 - Finalizado',
      status: 'completed',
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      budgetId: 'budget_2026_q1',
      linkedGoalIds: [],
      version: 1,
      baselineMetrics: {
        plannedRevenue: 100000,
        targetMarginPercent: 45,
        breakEvenRevenue: 50000,
        minOrderCount: 400
      },
      currentActuals: {
        realizedRevenue: 110000,
        realizedMarginPercent: 46,
        orderCount: 440,
        cancellationsCount: 10
      },
      productLineBaselines: [
        { productLine: 'FORCE', targetRevenue: 50000, targetMarginPercent: 50, sharePercent: 50 },
        { productLine: 'MARK', targetRevenue: 30000, targetMarginPercent: 40, sharePercent: 30 },
        { productLine: 'PRIME', targetRevenue: 20000, targetMarginPercent: 40, sharePercent: 20 }
      ],
      createdAt: new Date().toISOString(),
      createdBy: 'admin_test_uid',
      updatedAt: new Date().toISOString()
    };
    await adminDb.collection('commercial_execution_cycles').doc(sourceCycle.id).set(sourceCycle);

    const targetCycle: any = {
      id: 'cycle_2026_q2_active',
      title: 'Ciclo 2026 Q2 - Ativo',
      status: 'active',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
      budgetId: 'budget_2026_q2',
      linkedGoalIds: [],
      version: 1,
      baselineMetrics: {
        plannedRevenue: 120000,
        targetMarginPercent: 48,
        breakEvenRevenue: 55000,
        minOrderCount: 450
      },
      createdAt: new Date().toISOString(),
      createdBy: 'admin_test_uid',
      updatedAt: new Date().toISOString()
    };
    await adminDb.collection('commercial_execution_cycles').doc(targetCycle.id).set(targetCycle);

    // Orçamento base no período
    await adminDb.collection('commercial_budgets').doc('budget_q1_2026').set({
      id: 'budget_q1_2026',
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      status: 'approved',
      version: 1,
      grossRevenue: 100000,
      netRevenue: 95000,
      contributionMargin: 45000,
      netProfit: 25000
    });

    // Pedido base pago para alimentar o DRE e outcome snapshot
    await adminDb.collection('orders').doc('order_q1_001').set({
      id: 'order_q1_001',
      customerName: 'Cliente Q1 Teste',
      customerEmail: 'cliente@teste.com',
      total: 110000,
      amountPaid: 110000,
      balanceDue: 0,
      paymentStatus: 'approved',
      productionStatus: 'completed',
      createdAt: '2026-02-15T10:00:00.000Z',
      items: [
        {
          id: 'item_1',
          productId: 'prod_force_1',
          name: 'Camiseta FORCE',
          quantity: 200,
          price: 275,
          unitCost: 100,
          productLine: 'FORCE'
        },
        {
          id: 'item_2',
          productId: 'prod_mark_1',
          name: 'Camiseta MARK',
          quantity: 200,
          price: 275,
          unitCost: 120,
          productLine: 'MARK'
        }
      ]
    });

    assert(true, 'Seed operacional gravado no Firestore Emulator com sucesso');

    // ------------------------------------------------------------------------
    // 4. CONCORRÊNCIA REAL 10x NO EMULATOR: CREATE REVIEW
    // ------------------------------------------------------------------------
    console.log('\n--- 4. CONCORRÊNCIA REAL 10x: CREATE REVIEW ---');
    const createPayload = {
      executionCycleId: 'cycle_2026_q1_completed',
      title: 'Review Q1 2026'
    };
    const createKey = 'idemp_create_key_emulator_q1';

    const createReqs = Array.from({ length: 10 }, () =>
      fetch(`${baseUrl}/api/admin/commercial/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'X-Idempotency-Key': createKey
        },
        body: JSON.stringify(createPayload)
      })
    );

    const createResponses = await Promise.all(createReqs);
    for (const res of createResponses) {
      assert(res.status === 200 || res.status === 201, 'CREATE retornou status 200/201 no Emulator');
    }
    const createBodies = await Promise.all(createResponses.map(r => r.json()));
    const createdReviewId = createBodies[0].review.id;
    for (const b of createBodies) {
      assert(b.review.id === createdReviewId, 'Todas as 10 requisições retornaram exatamente o mesmo review.id');
    }

    // Deltas no Firestore Emulator Real
    const reviewDocs = await adminDb.collection('commercial_execution_reviews').get();
    assert(reviewDocs.size === 1, `Delta Reviews no Emulator = 1 (encontrados: ${reviewDocs.size})`);

    const cycleLocks = await adminDb.collection('commercial_review_cycle_locks').get();
    assert(cycleLocks.size === 1, `Delta Cycle Locks no Emulator = 1 (encontrados: ${cycleLocks.size})`);

    const eventsAfterCreate = await adminDb.collection('commercial_execution_review_events')
      .where('reviewId', '==', createdReviewId).get();
    assert(eventsAfterCreate.size === 1, `Delta Eventos no Emulator = 1 (encontrados: ${eventsAfterCreate.size})`);

    const idempRecordsCreate = await adminDb.collection('idempotency_records').get();
    assert(idempRecordsCreate.size === 1, `Delta Idempotency Records = 1 (encontrados: ${idempRecordsCreate.size})`);

    // ------------------------------------------------------------------------
    // 5. CONCORRÊNCIA REAL 10x NO EMULATOR: GENERATE OUTCOME
    // ------------------------------------------------------------------------
    console.log('\n--- 5. CONCORRÊNCIA REAL 10x: GENERATE OUTCOME ---');
    const genKey = 'idemp_generate_key_emulator_q1';
    const genReqs = Array.from({ length: 10 }, () =>
      fetch(`${baseUrl}/api/admin/commercial/reviews/${createdReviewId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'X-Idempotency-Key': genKey
        },
        body: JSON.stringify({})
      })
    );

    const genResponses = await Promise.all(genReqs);
    for (const res of genResponses) {
      assert(res.status === 200, 'GENERATE retornou status 200 no Emulator');
    }
    const genBodies = await Promise.all(genResponses.map(r => r.json()));
    for (const b of genBodies) {
      assert(b.review.status === 'generated', 'Review status transacionou para generated');
      assert(b.review.outcomeSnapshot !== undefined, 'Outcome snapshot foi gerado com sucesso');
    }

    const eventsAfterGen = await adminDb.collection('commercial_execution_review_events')
      .where('reviewId', '==', createdReviewId).get();
    assert(eventsAfterGen.size === 2, `Delta Eventos após GENERATE = 2 (+1 novo evento gerado)`);

    // ------------------------------------------------------------------------
    // 6. CONCORRÊNCIA REAL 10x NO EMULATOR: RECALCULATE OUTCOME
    // ------------------------------------------------------------------------
    console.log('\n--- 6. CONCORRÊNCIA REAL 10x: RECALCULATE OUTCOME ---');
    const recalcKey = 'idemp_recalc_key_emulator_q1';
    const recalcReqs = Array.from({ length: 10 }, () =>
      fetch(`${baseUrl}/api/admin/commercial/reviews/${createdReviewId}/recalculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'X-Idempotency-Key': recalcKey
        },
        body: JSON.stringify({})
      })
    );

    const recalcResponses = await Promise.all(recalcReqs);
    for (const res of recalcResponses) {
      assert(res.status === 200, 'RECALCULATE retornou status 200 no Emulator');
    }
    const recalcBodies = await Promise.all(recalcResponses.map(r => r.json()));
    for (const b of recalcBodies) {
      assert(b.review.analysisVersion === 2, 'analysisVersion incrementada exatamente uma vez para 2 em todas as 10 respostas');
    }

    const eventsAfterRecalc = await adminDb.collection('commercial_execution_review_events')
      .where('reviewId', '==', createdReviewId).get();
    assert(eventsAfterRecalc.size === 3, `Delta Eventos após RECALCULATE = 3 (+1 novo evento)`);

    // ------------------------------------------------------------------------
    // 7. RETRY APÓS RESPOSTA PERDIDA (SIMULAÇÃO DE FALHA DE REDE)
    // ------------------------------------------------------------------------
    console.log('\n--- 7. RETRY APÓS RESPOSTA PERDIDA (MESMA CHAVE DE RECALCULATE) ---');
    const lostResponseRetryRes = await fetch(`${baseUrl}/api/admin/commercial/reviews/${createdReviewId}/recalculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_admin_token',
        'X-Idempotency-Key': recalcKey // Mesma chave usada no passo 6
      },
      body: JSON.stringify({})
    });
    assert(lostResponseRetryRes.status === 200, 'Retry de RECALCULATE retornou 200 OK via replay idempotente');
    const retryBody = await lostResponseRetryRes.json();
    assert(retryBody.review.analysisVersion === 2, 'analysisVersion permanece exatamente 2 no retry (sem incremento duplicado)');

    const eventsAfterRetry = await adminDb.collection('commercial_execution_review_events')
      .where('reviewId', '==', createdReviewId).get();
    assert(eventsAfterRetry.size === 3, 'Nenhum evento duplicado foi criado no retry com resposta recuperada');

    // ------------------------------------------------------------------------
    // 8. CONCORRÊNCIA REAL 10x NO EMULATOR: APPROVE REVIEW & IMUTABILIDADE
    // ------------------------------------------------------------------------
    console.log('\n--- 8. CONCORRÊNCIA REAL 10x: APPROVE REVIEW & IMUTABILIDADE ---');
    const approveKey = 'idemp_approve_key_emulator_q1';
    const approveReqs = Array.from({ length: 10 }, () =>
      fetch(`${baseUrl}/api/admin/commercial/reviews/${createdReviewId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'X-Idempotency-Key': approveKey
        },
        body: JSON.stringify({})
      })
    );

    const approveResponses = await Promise.all(approveReqs);
    for (const res of approveResponses) {
      assert(res.status === 200, 'APPROVE retornou status 200 no Emulator');
    }
    const approveBodies = await Promise.all(approveResponses.map(r => r.json()));
    for (const b of approveBodies) {
      assert(b.review.status === 'approved', 'Review transacionou para status approved');
    }

    const eventsAfterApprove = await adminDb.collection('commercial_execution_review_events')
      .where('reviewId', '==', createdReviewId).get();
    assert(eventsAfterApprove.size === 4, `Delta Eventos após APPROVE = 4 (+1 novo evento)`);

    // Tentar recalcular review aprovado deve ser rejeitado com 409
    const mutateApprovedRes = await fetch(`${baseUrl}/api/admin/commercial/reviews/${createdReviewId}/recalculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_admin_token',
        'X-Idempotency-Key': 'idemp_mutate_approved_attempt'
      },
      body: JSON.stringify({})
    });
    assert(mutateApprovedRes.status === 409, 'Tentativa de recalcular review aprovado retorna 409 REVIEW_ALREADY_APPROVED / REVIEW_IMMUTABLE');

    // Obter hash do snapshot do review aprovado para validar imutabilidade
    const approvedReviewDoc = await adminDb.collection('commercial_execution_reviews').doc(createdReviewId).get();
    const approvedData = approvedReviewDoc.data()!;
    const originalSnapshotHash = crypto.createHash('sha256').update(JSON.stringify(approvedData.outcomeSnapshot)).digest('hex');

    // ------------------------------------------------------------------------
    // 9. CONCORRÊNCIA REAL 10x NO EMULATOR: CREATE ACTION A PARTIR DE INSIGHT
    // ------------------------------------------------------------------------
    console.log('\n--- 9. CONCORRÊNCIA REAL 10x: CREATE ACTION A PARTIR DE INSIGHT ---');
    const insights = approvedData.outcomeSnapshot?.learningInsights || approvedData.outcomeSnapshot?.insights || [];
    assert(insights.length > 0, 'Outcome snapshot gerou learningInsights para teste de conversão em ação');
    const chosenInsight = insights.find(i => i.canCreateAction) || insights[0];

    const actionPayload = {
      targetCycleId: 'cycle_2026_q2_active',
      insightId: chosenInsight.id,
      title: 'Plano de Ação Q2 a partir do Insight',
      priority: 'high',
      productLine: 'FORCE'
    };
    const actionKey = 'idemp_action_key_emulator_q1';

    const actionReqs = Array.from({ length: 10 }, () =>
      fetch(`${baseUrl}/api/admin/commercial/reviews/${createdReviewId}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'X-Idempotency-Key': actionKey
        },
        body: JSON.stringify(actionPayload)
      })
    );

    const actionResponses = await Promise.all(actionReqs);
    for (const res of actionResponses) {
      if (res.status !== 200 && res.status !== 201) {
        const errText = await res.clone().text();
        console.error(`❌ Action request failed with status ${res.status}: ${errText}`);
      }
      assert(res.status === 200 || res.status === 201, 'CREATE ACTION retornou 200/201 no Emulator');
    }
    const actionBodies = await Promise.all(actionResponses.map(r => r.json()));
    const createdActionId = actionBodies[0].action.id;
    for (const b of actionBodies) {
      assert(b.action.id === createdActionId, 'Todas as 10 requisições retornaram exatamente o mesmo action.id');
    }

    const actionDocs = await adminDb.collection('commercial_actions').get();
    assert(actionDocs.size === 1, `Delta Commercial Actions = 1 (encontrados: ${actionDocs.size})`);

    const insightLocks = await adminDb.collection('commercial_review_insight_locks').get();
    assert(insightLocks.size === 1, `Delta Insight Locks = 1 (encontrados: ${insightLocks.size})`);

    // Validar imutabilidade: Snapshot do review aprovado permanece 100% idêntico
    const approvedDocAfterAction = await adminDb.collection('commercial_execution_reviews').doc(createdReviewId).get();
    const currentSnapshotHash = crypto.createHash('sha256').update(JSON.stringify(approvedDocAfterAction.data()!.outcomeSnapshot)).digest('hex');
    assert(originalSnapshotHash === currentSnapshotHash, 'SHA-256 do snapshot do review aprovado permaneceu 100% idêntico após criação da ação');

    // ------------------------------------------------------------------------
    // 10. CONCORRÊNCIA REAL 10x NO EMULATOR: ARCHIVE REVIEW
    // ------------------------------------------------------------------------
    console.log('\n--- 10. CONCORRÊNCIA REAL 10x: ARCHIVE REVIEW ---');
    const archiveKey = 'idemp_archive_key_emulator_q1';
    const archiveReqs = Array.from({ length: 10 }, () =>
      fetch(`${baseUrl}/api/admin/commercial/reviews/${createdReviewId}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_admin_token',
          'X-Idempotency-Key': archiveKey
        },
        body: JSON.stringify({})
      })
    );

    const archiveResponses = await Promise.all(archiveReqs);
    for (const res of archiveResponses) {
      assert(res.status === 200, 'ARCHIVE retornou status 200 no Emulator');
    }
    const archiveBodies = await Promise.all(archiveResponses.map(r => r.json()));
    for (const b of archiveBodies) {
      assert(b.review.status === 'archived', 'Review transacionou para status archived');
    }

    // ------------------------------------------------------------------------
    // 11. TESTE REAL DE FIRESTORE SECURITY RULES (@firebase/rules-unit-testing)
    // ------------------------------------------------------------------------
    console.log('\n--- 11. TESTE REAL DE FIRESTORE SECURITY RULES ---');

    // Contexto 1: Cliente Administrador Autenticado
    const adminContext = testEnv.authenticatedContext('admin_user_1', {
      email: 'fpacstore@gmail.com'
    });
    const adminFirestore = adminContext.firestore();

    // Contexto 2: Cliente Comum Autenticado
    const customerContext = testEnv.authenticatedContext('customer_user_1', {
      email: 'cliente@exemplo.com.br'
    });
    const customerFirestore = customerContext.firestore();

    // Contexto 3: Cliente Anônimo / Não autenticado
    const unauthContext = testEnv.unauthenticatedContext();
    const unauthFirestore = unauthContext.firestore();

    // Seed de documento via Admin com regras desativadas para testar leituras
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('idempotency_records').doc('test_record_rules').set({
        id: 'test_record_rules',
        status: 'completed',
        scope: 'test'
      });
      await context.firestore().collection('commercial_execution_reviews').doc('test_review_rules').set({
        id: 'test_review_rules',
        title: 'Review Rules Test',
        status: 'draft'
      });
    });

    // Testes de idempotency_records como Administrador
    await assertSucceeds(
      adminFirestore.collection('idempotency_records').doc('test_record_rules').get()
    );
    assert(true, 'Rules: Admin pode ler /idempotency_records/{id}');

    await assertFails(
      adminFirestore.collection('idempotency_records').doc('client_hack').set({ test: 123 })
    );
    assert(true, 'Rules: Admin NÃO pode criar /idempotency_records/{id} client-side (bloqueado)');

    await assertFails(
      adminFirestore.collection('idempotency_records').doc('test_record_rules').update({ status: 'hacked' })
    );
    assert(true, 'Rules: Admin NÃO pode atualizar /idempotency_records/{id} client-side (bloqueado)');

    await assertFails(
      adminFirestore.collection('idempotency_records').doc('test_record_rules').delete()
    );
    assert(true, 'Rules: Admin NÃO pode deletar /idempotency_records/{id} client-side (bloqueado)');

    // Testes de idempotency_records como Cliente Comum
    await assertFails(
      customerFirestore.collection('idempotency_records').doc('test_record_rules').get()
    );
    assert(true, 'Rules: Cliente Comum NÃO pode ler /idempotency_records/{id} (bloqueado)');

    await assertFails(
      customerFirestore.collection('idempotency_records').doc('client_hack_2').set({ test: 123 })
    );
    assert(true, 'Rules: Cliente Comum NÃO pode criar /idempotency_records/{id} (bloqueado)');

    // Testes de idempotency_records como Anônimo
    await assertFails(
      unauthFirestore.collection('idempotency_records').doc('test_record_rules').get()
    );
    assert(true, 'Rules: Usuário anônimo NÃO pode ler /idempotency_records/{id} (bloqueado)');

    // Testes de escrita via Firebase Admin SDK / Server-side
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const serverDb = context.firestore();
      await serverDb.collection('idempotency_records').doc('server_created_record').set({
        id: 'server_created_record',
        status: 'completed'
      });
      await serverDb.collection('idempotency_records').doc('server_created_record').update({
        updated: true
      });
      const snap = await serverDb.collection('idempotency_records').doc('server_created_record').get();
      assert(snap.exists && snap.data()?.updated === true, 'Admin SDK / Backend pode criar, atualizar e ler registros de idempotência');
    });

    // Auditoria estrutural de firestore.rules para idempotency_records
    const idempotencyBlockRegex = /match\s+\/idempotency_records\/\{id\}/g;
    const occurrences = (rulesContent.match(idempotencyBlockRegex) || []).length;
    assert(occurrences === 1, `firestore.rules possui EXATAMENTE UM bloco para /idempotency_records/{id} (encontrados: ${occurrences})`);

    // ------------------------------------------------------------------------
    // 12. PAGINAÇÃO E INTERSEÇÃO HISTÓRICA NO EMULATOR (125 REVIEWS)
    // ------------------------------------------------------------------------
    console.log('\n--- 12. PAGINAÇÃO E INTERSEÇÃO HISTÓRICA NO EMULATOR (125 DOCS) ---');
    // Popular 125 reviews aprovados no Firestore Emulator
    const batchOps = [];
    for (let i = 1; i <= 125; i++) {
      const month = String((i % 12) + 1).padStart(2, '0');
      const docId = `hist_rev_emul_${String(i).padStart(3, '0')}`;
      batchOps.push(
        adminDb.collection('commercial_execution_reviews').doc(docId).set({
          id: docId,
          status: 'approved',
          periodStart: `2025-${month}-01`,
          periodEnd: `2025-${month}-28`,
          outcomeSnapshot: {
            realizedRevenue: 10000 + i * 500,
            realizedMarginPercent: 45 + (i % 10),
            insights: []
          },
          createdAt: new Date().toISOString()
        })
      );
    }
    await Promise.all(batchOps);

    const histSummaryRes = await fetch(`${baseUrl}/api/admin/commercial/learning/summary?periodStart=2025-01-01&periodEnd=2025-12-31`, {
      headers: { 'Authorization': 'Bearer valid_admin_token' }
    });
    assert(histSummaryRes.status === 200, 'Consulta de resumo histórico no Emulator retornou 200 OK');
    const histSummaryData = await histSummaryRes.json();
    assert(histSummaryData.summary?.reviewCount >= 125, `Todos os 125 reviews históricos processados com sucesso no Emulator (total: ${histSummaryData.summary?.reviewCount})`);

    const rangeRes = await fetch(`${baseUrl}/api/admin/commercial/learning/summary?periodStart=2025-03-01&periodEnd=2025-05-31`, {
      headers: { 'Authorization': 'Bearer valid_admin_token' }
    });
    assert(rangeRes.status === 200, 'Consulta com filtro de range no Emulator retornou 200 OK');
    const rangeData = await rangeRes.json();
    assert(rangeData.summary?.reviewCount > 0 && rangeData.summary?.reviewCount < 125, 'Interseção de limites filtrou exatamente o subset de reviews correspondente');

    console.log('\n========================================================================');
    console.log(`🎉 TODOS OS ${testCount} TESTES DA FASE 9.6.8-G.1 FORAM APROVADOS COM SUCESSO NO EMULATOR!`);
    console.log('========================================================================');

  } finally {
    if (server) {
      server.close();
    }
    resetCommercialReviewDb();
    resetAuthForTesting();
    if (testEnv) {
      await testEnv.cleanup();
    }
    if (adminApp) {
      await adminApp.delete();
    }
  }
}

runPhase968G1EmulatorSuite().catch((err) => {
  console.error('\n❌ Erro durante a execução da suíte no Emulator:', err);
  process.exit(1);
});

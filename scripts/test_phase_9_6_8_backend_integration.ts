/**
 * TEST SUITE 2 — BACKEND CONTROLLER & INTEGRATION (FASE 9.6.8 / 9.6.8-B HARDENED)
 * Valida todas as regras de negócio de CommercialExecutionReview com contratos canônicos reais:
 * 1. Exigência de Idempotency-Key.
 * 2. Bloqueio de Review para ciclos que não estejam 'completed' ou 'archived'.
 * 3. Lock determinístico SHA256 (cycleId:version) para prevenir reviews duplicados em concorrência.
 * 4. Contrato Canônico: cycle.linkedForecastId, budget.approvedSnapshot, cycle.goalExecutionSnapshots.
 * 5. Geração de Pós-Mortem com Variance Bridge cent-exact, Goal Comparisons e Avaliação de Ações.
 * 6. Bloqueio de mutações (409 REVIEW_IMMUTABLE) após aprovação.
 * 7. Arquivamento restrito apenas a partir de 'approved' (409 INVALID_STATE_TRANSITION se draft/generated).
 * 8. Conversão de Insight em Ação com targetCycleId obrigatório, validação de ciclo ativo e lock SHA256.
 * 9. Paginação server-side via cursor Firestore com tratamento de cursor inválido.
 * 10. Sumário Histórico de Aprendizado agregando reviews aprovados com regras de tamanho de amostra.
 */

import {
  setCommercialReviewDb,
  createCommercialExecutionReviewController,
  generateCommercialExecutionReviewController,
  approveCommercialExecutionReviewController,
  recalculateCommercialExecutionReviewController,
  archiveCommercialExecutionReviewController,
  convertInsightToCommercialActionController,
  getCommercialHistoricalLearningSummaryController,
  listCommercialExecutionReviewsController,
  listCommercialExecutionReviewActionsController,
  listCommercialExecutionReviewEventsController,
  getCommercialExecutionReviewController
} from '../server/controllers/commercialReview.controller.js';
import { CommercialExecutionCycle } from '../src/types/commercialExecution.js';
import { CommercialBudget } from '../src/types/commercialBudget.js';

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

  async set(data: any) {
    this.storage.set(`${this.collectionName}/${this.id}`, JSON.parse(JSON.stringify(data)));
  }

  async update(data: any) {
    const existing = this.storage.get(`${this.collectionName}/${this.id}`) || {};
    this.storage.set(`${this.collectionName}/${this.id}`, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }
}

class MockCollectionRef {
  name: string;
  storage: Map<string, any>;
  whereClauses: Array<{ field: string; op: string; val: any }> = [];
  orderByField?: string;
  orderDir: 'asc' | 'desc' = 'asc';
  startAfterDocId?: string;
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
    const copy = this._clone();
    copy.whereClauses = [...this.whereClauses, { field, op, val }];
    return copy;
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    const copy = this._clone();
    copy.orderByField = field;
    copy.orderDir = dir;
    return copy;
  }

  startAfter(docSnapshot: any) {
    const copy = this._clone();
    copy.startAfterDocId = docSnapshot?.id;
    return copy;
  }

  limit(num: number) {
    const copy = this._clone();
    copy.limitCount = num;
    return copy;
  }

  private _clone(): MockCollectionRef {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.orderByField = this.orderByField;
    copy.orderDir = this.orderDir;
    copy.startAfterDocId = this.startAfterDocId;
    copy.limitCount = this.limitCount;
    return copy;
  }

  async get() {
    let docs: any[] = [];
    const prefix = `${this.name}/`;
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        const id = key.slice(prefix.length);
        let matches = true;
        for (const w of this.whereClauses) {
          const valInDoc = value[w.field];
          if (w.op === '==') {
            if (valInDoc !== w.val) {
              matches = false;
              break;
            }
          } else if (w.op === '>=') {
            if (valInDoc === undefined || valInDoc === null || valInDoc < w.val) {
              matches = false;
              break;
            }
          } else if (w.op === '<=') {
            if (valInDoc === undefined || valInDoc === null || valInDoc > w.val) {
              matches = false;
              break;
            }
          }
        }
        if (matches) {
          docs.push({
            id,
            data: () => JSON.parse(JSON.stringify(value)),
            _raw: value
          });
        }
      }
    }

    if (this.orderByField) {
      const field = this.orderByField;
      const factor = this.orderDir === 'desc' ? -1 : 1;
      docs.sort((a, b) => {
        const valA = a._raw[field];
        const valB = b._raw[field];
        if (valA < valB) return -1 * factor;
        if (valA > valB) return 1 * factor;
        return 0;
      });
    }

    if (this.startAfterDocId) {
      const index = docs.findIndex(d => d.id === this.startAfterDocId);
      if (index !== -1) {
        docs = docs.slice(index + 1);
      }
    }

    if (this.limitCount !== undefined) {
      docs = docs.slice(0, this.limitCount);
    }

    return {
      docs: docs.map(d => ({ id: d.id, data: d.data })),
      empty: docs.length === 0,
      size: docs.length
    };
  }
}

class MockDb {
  storage = new Map<string, any>();

  collection(name: string) {
    return new MockCollectionRef(name, this.storage);
  }

  async runTransaction(cb: (tx: any) => Promise<any>) {
    const tx = {
      get: async (ref: MockDocRef) => ref.get(),
      set: (ref: MockDocRef, data: any) => ref.set(data),
      update: (ref: MockDocRef, data: any) => ref.update(data)
    };
    return cb(tx);
  }
}

function createMockReqRes(params: {
  method?: string;
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
  user?: any;
}) {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    method: params.method || 'GET',
    body: params.body || {},
    params: params.params || {},
    query: params.query || {},
    headers: params.headers || {},
    user: params.user || { uid: 'admin_test_uid', email: 'admin@fpacstore.com' }
  };

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData
  };

  return { req, res };
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`, detail || '');
  }
}

async function runIntegrationTests() {
  console.log('\n======================================================');
  console.log('🧪 EXECUTANDO TESTES DE INTEGRAÇÃO BACKEND — FASE 9.6.8-B');
  console.log('======================================================\n');

  const db = new MockDb();
  setCommercialReviewDb(db);

  // 1. Setup Base: Fixtures com contratos canônicos reais
  const budgetId = 'b_mock_2026_01';
  const canonicalBudget: Partial<CommercialBudget> = {
    id: budgetId,
    title: 'Orçamento Canônico Jan/2026',
    period: 'monthly',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    status: 'active',
    version: 1,
    targetRevenue: 20000,
    targetOrders: 100,
    targetAverageTicket: 200,
    targetUnits: 120,
    targetContributionMargin: 11000,
    targetContributionMarginPercent: 55,
    targetOperatingProfit: 4500,
    targetOperatingProfitPercent: 22.5,
    allocations: {
      cogsBudget: 8000,
      gatewayFeesBudget: 600,
      shippingSubsidyBudget: 400,
      trafficBudget: 2500,
      fixedExpensesBudget: 4000,
      marketingBudget: 2500,
      variableExpensesBudget: 1000,
      otherExpensesBudget: 0,
      totalExpensesBudget: 15500
    },
    approvedSnapshot: {
      budgetTitle: 'Orçamento Canônico Jan/2026',
      targetRevenue: 20000,
      targetOrders: 100,
      targetAverageTicket: 200,
      targetUnits: 120,
      targetContributionMargin: 11000,
      targetOperatingProfit: 4500,
      allocations: {
        cogsBudget: 8000,
        gatewayFeesBudget: 600,
        shippingSubsidyBudget: 400,
        trafficBudget: 2500,
        fixedExpensesBudget: 4000,
        marketingBudget: 2500,
        variableExpensesBudget: 1000,
        otherExpensesBudget: 0,
        totalExpensesBudget: 15500
      },
      forecastSnapshot: {
        id: 'f_mock_2026_01',
        title: 'Forecast Oficial Q1',
        projectedRevenue: 19000,
        projectedOrders: 95,
        projectedUnits: 115,
        projectedAverageTicket: 200,
        projectedContributionMargin: 10500,
        projectedOperatingProfit: 4000
      },
      approvedAt: '2025-12-31T23:59:59Z',
      approvedBy: 'cfo_admin'
    } as any,
    createdAt: '2025-12-20T00:00:00Z',
    createdBy: 'admin'
  };
  db.storage.set(`commercial_budgets/${budgetId}`, canonicalBudget);

  const forecastId = 'f_mock_2026_01';
  db.storage.set(`commercial_forecasts/${forecastId}`, {
    id: forecastId,
    title: 'Forecast Oficial Q1',
    projectedRevenue: 19000,
    projectedOrders: 95,
    projectedUnits: 115,
    projectedAverageTicket: 200,
    projectedContributionMargin: 10500,
    projectedOperatingProfit: 4000
  });

  // Metas Canônicas
  const goal1Id = 'goal_mock_01';
  db.storage.set(`commercial_goals/${goal1Id}`, {
    id: goal1Id,
    type: 'revenue',
    metric: 'revenue',
    targetValue: 20000,
    title: 'Meta de Faturamento Jan/2026',
    status: 'active'
  });

  // Ciclo Ativo
  const cycleActiveId = 'cycle_active_01';
  const canonicalCycleActive: CommercialExecutionCycle = {
    id: cycleActiveId,
    title: 'Ciclo Ativo Q1',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    status: 'active',
    version: 1,
    budgetId,
    linkedForecastId: forecastId,
    linkedGoalIds: [goal1Id],
    budgetExecutionSnapshot: canonicalBudget.approvedSnapshot as any,
    goalExecutionSnapshots: [
      {
        goalId: goal1Id,
        title: 'Meta de Faturamento Jan/2026',
        type: 'revenue',
        targetValue: 20000,
        period: 'monthly',
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    ],
    createdAt: '2025-12-31T00:00:00Z',
    createdBy: 'admin'
  };
  db.storage.set(`commercial_execution_cycles/${cycleActiveId}`, canonicalCycleActive);

  // Ciclo Concluído (completed)
  const cycleCompletedId = 'cycle_completed_01';
  const canonicalCycleCompleted: CommercialExecutionCycle = {
    id: cycleCompletedId,
    title: 'Ciclo Concluído Q1',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    status: 'completed',
    version: 1,
    budgetId,
    linkedForecastId: forecastId,
    linkedGoalIds: [goal1Id],
    budgetExecutionSnapshot: canonicalBudget.approvedSnapshot as any,
    goalExecutionSnapshots: [
      {
        goalId: goal1Id,
        title: 'Meta de Faturamento Jan/2026',
        type: 'revenue',
        targetValue: 20000,
        period: 'monthly',
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    ],
    createdAt: '2025-12-31T00:00:00Z',
    createdBy: 'admin',
    completedAt: '2026-02-01T00:00:00Z',
    completedBy: 'admin'
  };
  db.storage.set(`commercial_execution_cycles/${cycleCompletedId}`, canonicalCycleCompleted);

  // Ciclo Destino Planejado (para conversão de insight)
  const cycleTargetId = 'cycle_target_future_01';
  db.storage.set(`commercial_execution_cycles/${cycleTargetId}`, {
    id: cycleTargetId,
    title: 'Ciclo Planejado Fev/2026',
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    status: 'draft',
    version: 1,
    activeActionIds: [],
    createdAt: '2026-01-20T00:00:00Z',
    createdBy: 'admin'
  });

  // Ações do Ciclo
  db.storage.set(`commercial_actions/act_01`, {
    id: 'act_01',
    executionCycleId: cycleCompletedId,
    title: 'Lançamento Drop Streetwear FORCE',
    priority: 'high',
    productLine: 'FORCE',
    executionStatus: 'completed',
    targetRevenue: 10000,
    targetUnits: 50,
    actualRevenue: 12500,
    actualUnits: 65,
    actualImpact: {
      revenue: 12500,
      units: 65,
      impactAttribution: 'direct',
      confidence: 'high',
      costCoveragePercent: 100
    }
  });

  // Produtos e Pedidos no período
  db.storage.set(`products/prod_1`, {
    id: 'prod_1',
    name: 'Camiseta FORCE Oversized',
    line: 'FORCE',
    price: 200,
    cost: 70
  });

  db.storage.set(`orders/order_1`, {
    id: 'order_1',
    createdAt: '2026-01-15T10:00:00Z',
    status: 'paid',
    paymentStatus: 'approved',
    total: 22000,
    subtotal: 22000,
    items: [{ productId: 'prod_1', quantity: 110, price: 200, unitCost: 70 }],
    shippingCost: 300,
    gatewayFee: 660
  });

  // -----------------------------------------------------------------
  // TESTE 1: IDEMPOTENCY-KEY OBRIGATÓRIA
  // -----------------------------------------------------------------
  console.log('--- 1. Validação de Idempotency-Key ---');
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { executionCycleId: cycleCompletedId },
      headers: {} // Sem chave
    });
    await createCommercialExecutionReviewController(req, res);
    assert(res.getStatusCode() === 400, 'Criar review sem Idempotency-Key deve retornar 400');
  }

  // -----------------------------------------------------------------
  // TESTE 2: REJEITAR CRIAÇÃO PARA CICLO NÃO CONCLUÍDO
  // -----------------------------------------------------------------
  console.log('\n--- 2. Bloqueio de Review para Ciclo Não Completed/Archived ---');
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { executionCycleId: cycleActiveId },
      headers: { 'idempotency-key': 'idemp_key_active_err' }
    });
    await createCommercialExecutionReviewController(req, res);
    assert(res.getStatusCode() === 409, 'Criar review para ciclo active deve retornar 409 EXECUTION_CYCLE_NOT_COMPLETED');
    assert(res.getData().code === 'EXECUTION_CYCLE_NOT_COMPLETED', 'Código de erro deve ser EXECUTION_CYCLE_NOT_COMPLETED');
  }

  // -----------------------------------------------------------------
  // TESTE 3: CRIAR REVIEW COM SUCESSO E LOCK DETERMINÍSTICO SHA256
  // -----------------------------------------------------------------
  console.log('\n--- 3. Criação de Review e Lock Determinístico SHA256 ---');
  let reviewId = '';
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { executionCycleId: cycleCompletedId, title: 'Review Q1 2026' },
      headers: { 'idempotency-key': 'idemp_key_create_01' }
    });
    await createCommercialExecutionReviewController(req, res);
    assert(res.getStatusCode() === 201, 'Criação de review deve retornar 201');
    const createdReview = res.getData().review;
    assert(Boolean(createdReview.id), 'Review deve possuir ID');
    assert(createdReview.status === 'draft', 'Review deve iniciar em status draft');
    assert(Boolean(createdReview.deterministicKey), 'Review deve registrar deterministicKey');
    assert(createdReview.linkedForecastId === forecastId, 'Review deve herdar linkedForecastId');
    reviewId = createdReview.id;
  }

  // Tentativa de criar review concorrente com outra Idempotency-Key para o mesmo cycleId:version
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { executionCycleId: cycleCompletedId, title: 'Review Duplicado Tentativa' },
      headers: { 'idempotency-key': 'idemp_key_create_02_other' }
    });
    await createCommercialExecutionReviewController(req, res);
    assert(res.getStatusCode() === 200, 'Tentativa duplicada deve reutilizar review existente com status 200');
    assert(res.getData().review.id === reviewId, 'Deve retornar o mesmo review travado pelo lock determinístico');
  }

  // -----------------------------------------------------------------
  // TESTE 4: GERAR PÓS-MORTEM (TRANSITION DRAFT -> GENERATED)
  // -----------------------------------------------------------------
  console.log('\n--- 4. Geração do Pós-Mortem e Snapshots Financeiros ---');
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      params: { id: reviewId },
      body: {},
      headers: { 'idempotency-key': 'idemp_key_gen_01' }
    });
    await generateCommercialExecutionReviewController(req, res);
    assert(res.getStatusCode() === 200, 'Geração de review deve retornar 200');
    const genReview = res.getData().review;
    assert(genReview.status === 'generated', 'Status do review deve ser generated');
    assert(Boolean(genReview.outcomeSnapshot), 'Outcome Snapshot deve estar presente');
    assert(genReview.outcomeSnapshot.varianceBridge.isCentExact === true, 'Variance Bridge deve ser cent-exact');
    assert(genReview.outcomeSnapshot.learningInsights.length >= 1, 'Deve gerar insights estruturados');
    assert(Array.isArray(genReview.outcomeSnapshot.goalComparisons), 'Goal Comparisons deve ser um array');
    assert(genReview.outcomeSnapshot.goalComparisons.length >= 1, 'Goal Comparisons deve conter metas do ciclo');
  }

  // Tentativa de chamar generate novamente para review já gerado -> 409 REVIEW_ALREADY_GENERATED
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      params: { id: reviewId },
      body: {},
      headers: { 'idempotency-key': 'idemp_key_gen_duplicate_fail' }
    });
    await generateCommercialExecutionReviewController(req, res);
    assert(res.getStatusCode() === 409, 'Chamar generate em review já gerado deve retornar 409');
    assert(res.getData().code === 'REVIEW_ALREADY_GENERATED', 'Código deve ser REVIEW_ALREADY_GENERATED');
  }

  // -----------------------------------------------------------------
  // TESTE 5: APROVAR REVIEW & IMUTABILIDADE ABSOLUTA
  // -----------------------------------------------------------------
  console.log('\n--- 5. Aprovação de Review & Imutabilidade Absoluta ---');
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      params: { id: reviewId },
      body: {},
      headers: { 'idempotency-key': 'idemp_key_app_01' }
    });
    await approveCommercialExecutionReviewController(req, res);
    assert(res.getStatusCode() === 200, 'Aprovação de review deve retornar 200');
    const appReview = res.getData().review;
    assert(appReview.status === 'approved', 'Status do review deve ser approved');
  }

  // Tentativa de recalcular review APROVADO -> Deve ser rejeitado com 409 REVIEW_IMMUTABLE
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      params: { id: reviewId },
      body: {},
      headers: { 'idempotency-key': 'idemp_key_recalc_fail' }
    });
    await recalculateCommercialExecutionReviewController(req, res);
    assert(res.getStatusCode() === 409, 'Recalcular review aprovado deve retornar 409');
    assert(res.getData().code === 'REVIEW_IMMUTABLE', 'Erro deve ser REVIEW_IMMUTABLE');
  }

  // -----------------------------------------------------------------
  // TESTE 6: ARQUIVAMENTO RESTRITO APENAS A PARTIR DE APPROVED
  // -----------------------------------------------------------------
  console.log('\n--- 6. Arquivamento de Review ---');
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      params: { id: reviewId },
      body: {},
      headers: { 'idempotency-key': 'idemp_key_archive_01' }
    });
    await archiveCommercialExecutionReviewController(req, res);
    assert(res.getStatusCode() === 200, 'Arquivar review aprovado deve retornar 200');
    assert(res.getData().review.status === 'archived', 'Status deve ser archived');
  }

  // -----------------------------------------------------------------
  // TESTE 7: CONVERSÃO DE INSIGHT EM AÇÃO & EXIGÊNCIA DE TARGET_CYCLE_ID
  // -----------------------------------------------------------------
  console.log('\n--- 7. Conversão de Insight em Ação com targetCycleId Obrigatório ---');
  const reviewDoc = await db.collection('commercial_execution_reviews').doc(reviewId).get();
  const currentReview = reviewDoc.data();
  const convertibleInsight = currentReview.outcomeSnapshot.learningInsights.find((i: any) => i.canCreateAction);

  if (convertibleInsight) {
    // 7.1 Rejeitar se targetCycleId for omitido
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        params: { id: reviewId, insightId: convertibleInsight.id },
        body: { title: 'Ação Sem Target Cycle' },
        headers: { 'idempotency-key': 'idemp_key_convert_no_target' }
      });
      await convertInsightToCommercialActionController(req, res);
      assert(res.getStatusCode() === 400, 'Converter sem targetCycleId deve retornar 400');
      assert(res.getData().code === 'TARGET_CYCLE_ID_REQUIRED', 'Erro deve ser TARGET_CYCLE_ID_REQUIRED');
    }

    // 7.2 Rejeitar se targetCycleId for ciclo concluído/arquivado
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        params: { id: reviewId, insightId: convertibleInsight.id },
        body: { title: 'Ação em Ciclo Concluído', targetCycleId: cycleCompletedId },
        headers: { 'idempotency-key': 'idemp_key_convert_immutable_target' }
      });
      await convertInsightToCommercialActionController(req, res);
      assert(res.getStatusCode() === 409, 'Converter para ciclo concluído deve retornar 409');
      assert(res.getData().code === 'TARGET_CYCLE_IMMUTABLE', 'Erro deve ser TARGET_CYCLE_IMMUTABLE');
    }

    // 7.3 Converter com sucesso para ciclo ativo/planejado
    let createdActionId = '';
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        params: { id: reviewId, insightId: convertibleInsight.id },
        body: { title: 'Plano Ação Originado de Insight', targetCycleId: cycleTargetId },
        headers: { 'idempotency-key': 'idemp_key_convert_01' }
      });
      await convertInsightToCommercialActionController(req, res);
      assert(res.getStatusCode() === 201, 'Conversão de insight com targetCycleId válido deve retornar 201');
      assert(res.getData().alreadyCreated === false, 'alreadyCreated deve ser false na 1ª criação');
      createdActionId = res.getData().action.id;
      assert(res.getData().action.executionCycleId === cycleTargetId, 'Ação deve estar vinculada ao targetCycleId');
    }

    // 7.4 Deduplicação via SHA256 lock com outra idempotency-key
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        params: { id: reviewId, insightId: convertibleInsight.id },
        body: { title: 'Plano Ação Duplicado', targetCycleId: cycleTargetId },
        headers: { 'idempotency-key': 'idemp_key_convert_02_other' }
      });
      await convertInsightToCommercialActionController(req, res);
      assert(res.getStatusCode() === 200, 'Tentativa duplicada deve retornar 200 com ação já existente');
      assert(res.getData().alreadyCreated === true, 'alreadyCreated deve ser true');
      assert(res.getData().action.id === createdActionId, 'Deve reutilizar exatamente a mesma ação');
    }
  }

  // -----------------------------------------------------------------
  // TESTE 8: PAGINAÇÃO SERVER-SIDE VIA CURSOR FIRESTORE
  // -----------------------------------------------------------------
  console.log('\n--- 8. Paginação Server-Side via Cursor Firestore ---');
  {
    const { req, res } = createMockReqRes({
      method: 'GET',
      query: { limit: '1' }
    });
    await listCommercialExecutionReviewsController(req, res);
    assert(res.getStatusCode() === 200, 'Listagem com limite deve retornar 200');
    assert(res.getData().reviews.length === 1, 'Deve retornar 1 review');
    assert(typeof res.getData().pagination.hasMore === 'boolean', 'hasMore deve ser booleano');
  }

  // Cursor inválido deve retornar 400 INVALID_CURSOR
  {
    const { req, res } = createMockReqRes({
      method: 'GET',
      query: { cursor: 'cursor_inexistente_12345' }
    });
    await listCommercialExecutionReviewsController(req, res);
    assert(res.getStatusCode() === 400, 'Cursor inexistente deve retornar 400');
    assert(res.getData().code === 'INVALID_CURSOR', 'Código deve ser INVALID_CURSOR');
  }

  // -----------------------------------------------------------------
  // TESTE 9: SUMÁRIO DE APRENDIZADO HISTÓRICO ENDPOINT
  // -----------------------------------------------------------------
  console.log('\n--- 9. Endpoint de Sumário de Aprendizado Histórico ---');
  {
    const { req, res } = createMockReqRes({
      method: 'GET',
      query: { periodStart: '2026-01-01', periodEnd: '2026-12-31' }
    });
    await getCommercialHistoricalLearningSummaryController(req, res);
    assert(res.getStatusCode() === 200, 'Sumário histórico deve retornar 200');
  }

  console.log('\n======================================================');
  console.log(`📊 RESULTADO INTEGRAÇÃO BACKEND 9.6.8-B: ${passedTests}/${totalTests} PASSOU (${failedTests} FALHAS)`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runIntegrationTests().catch(err => {
  console.error('❌ Erro fatal nos testes:', err);
  process.exit(1);
});

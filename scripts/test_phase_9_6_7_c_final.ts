/**
 * TESTE DE CERTIFICAÇÃO FASE 9.6.7-C
 * Fechamento Final de Atribuição, Paginação Firestore Real, Governança de Custo, Deduplicação e Segurança
 */

import {
  calculateExecutionProgress,
  calculateBudgetExecutionProgress,
  calculateExecutionHealth,
  generateExecutionAlerts,
  prioritizeCommercialActions
} from '../src/utils/commercialExecution.js';
import {
  setCommercialExecutionDb,
  createCommercialExecutionCycleController,
  updateCommercialExecutionCycleController,
  activateCommercialExecutionCycleController,
  completeCommercialExecutionCycleController,
  archiveCommercialExecutionCycleController,
  getCommercialExecutionDashboardController,
  recalculateCommercialExecutionCycleController,
  getCommercialExecutionEventsController,
  addCommercialActionToCycleController,
  updateCommercialActionController,
  readyCommercialActionController,
  startCommercialActionController,
  blockCommercialActionController,
  unblockCommercialActionController,
  completeCommercialActionController,
  cancelCommercialActionController,
  recalculateCommercialActionImpactController,
  computeActionActualImpactCanonical
} from '../server/controllers/commercialExecution.controller.js';
import {
  authenticateAdmin,
  setAuthTokenVerifierForTesting,
  resetAuthForTesting
} from '../server/middleware/auth.middleware.js';
import {
  CommercialExecutionActionItem,
  CommercialExecutionCycle
} from '../src/types/commercialExecution.js';

// Setup Mock Firestore InMemory DB com suporte a Query Tracking e Transações Serializáveis
class MockDocRef {
  id: string;
  dataObj: any;
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
  orderDir?: 'asc' | 'desc';
  limitNum?: number;
  startAfterCursor?: any;
  static queryInvocations: Array<{ name: string; where: any[]; orderBy?: string; limit?: number; startAfter?: any }> = [];

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
    copy.orderByField = this.orderByField;
    copy.orderDir = this.orderDir;
    copy.limitNum = this.limitNum;
    copy.startAfterCursor = this.startAfterCursor;
    return copy;
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.orderByField = field;
    copy.orderDir = dir;
    copy.limitNum = this.limitNum;
    copy.startAfterCursor = this.startAfterCursor;
    return copy;
  }

  startAfter(cursor: any) {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.orderByField = this.orderByField;
    copy.orderDir = this.orderDir;
    copy.limitNum = this.limitNum;
    copy.startAfterCursor = cursor;
    return copy;
  }

  limit(num: number) {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.orderByField = this.orderByField;
    copy.orderDir = this.orderDir;
    copy.limitNum = num;
    copy.startAfterCursor = this.startAfterCursor;
    return copy;
  }

  async get() {
    MockCollectionRef.queryInvocations.push({
      name: this.name,
      where: this.whereClauses,
      orderBy: this.orderByField,
      limit: this.limitNum,
      startAfter: this.startAfterCursor
    });

    let docs: any[] = [];
    const prefix = `${this.name}/`;
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        const id = key.slice(prefix.length);
        let matches = true;
        for (const w of this.whereClauses) {
          if (value[w.field] !== w.val) {
            matches = false;
            break;
          }
        }
        if (matches) {
          docs.push({
            id,
            ...value,
            data: () => JSON.parse(JSON.stringify(value))
          });
        }
      }
    }

    if (this.orderByField) {
      const field = this.orderByField;
      const isDesc = this.orderDir === 'desc';
      docs.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA < valB) return isDesc ? 1 : -1;
        if (valA > valB) return isDesc ? -1 : 1;
        return 0;
      });
    }

    if (this.startAfterCursor) {
      const cursorId = typeof this.startAfterCursor === 'object' && this.startAfterCursor.id ? this.startAfterCursor.id : this.startAfterCursor;
      const idx = docs.findIndex(d => d.id === cursorId);
      if (idx >= 0) {
        docs = docs.slice(idx + 1);
      }
    }

    if (this.limitNum !== undefined) {
      docs = docs.slice(0, this.limitNum);
    }

    return {
      docs,
      empty: docs.length === 0,
      size: docs.length
    };
  }
}

class MockDb {
  storage = new Map<string, any>();
  private txQueue: Promise<any> = Promise.resolve();

  collection(name: string) {
    return new MockCollectionRef(name, this.storage);
  }

  async runTransaction(cb: (tx: any) => Promise<any>) {
    const run = async () => {
      const tx = {
        get: async (ref: MockDocRef) => ref.get(),
        set: (ref: MockDocRef, data: any) => {
          ref.storage.set(`${ref.collectionName}/${ref.id}`, JSON.parse(JSON.stringify(data)));
        },
        update: (ref: MockDocRef, data: any) => {
          const existing = ref.storage.get(`${ref.collectionName}/${ref.id}`) || {};
          ref.storage.set(`${ref.collectionName}/${ref.id}`, { ...existing, ...JSON.parse(JSON.stringify(data)) });
        }
      };
      return await cb(tx);
    };

    const next = this.txQueue.then(run, run);
    this.txQueue = next.then(() => {}, () => {});
    return next;
  }
}

function createMockReqRes(body: any = {}, headers: any = {}, params: any = {}, query: any = {}) {
  const req: any = {
    body,
    headers,
    params,
    query,
    user: {
      uid: 'admin_test_uid',
      email: 'admin@fpac.com.br',
      name: 'Admin Tester',
      role: 'admin'
    }
  };

  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    }
  };

  return { req, res };
}

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failedTests++;
  }
}

async function runPhase967CFinalSuite() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO CERTIFICAÇÃO FASE 9.6.7-C (FINAL HARDENING & GOVERNANCE)');
  console.log('===============================================================\n');

  const mockDb = new MockDb();
  setCommercialExecutionDb(mockDb);

  // -------------------------------------------------------------
  // 1. EVENT PAGINATION FIRESTORE REAL
  // -------------------------------------------------------------
  console.log('--- TESTE 1: PAGINAÇÃO REAL FIRESTORE NO CONTROLLER DE EVENTOS ---');
  MockCollectionRef.queryInvocations = [];
  
  // Injetar 10 eventos no mock
  const cycleId = 'cycle_events_pagination_test';
  for (let i = 1; i <= 10; i++) {
    const timeStr = new Date(Date.now() - (10 - i) * 60000).toISOString();
    mockDb.storage.set(`commercial_execution_events/event_${i}`, {
      id: `event_${i}`,
      executionCycleId: cycleId,
      eventType: 'action_added',
      timestamp: timeStr,
      operatorEmail: 'test@fpac.com'
    });
  }

  // Chamar página 1 (limit 3)
  const { req: reqEvt1, res: resEvt1 } = createMockReqRes({}, {}, { id: cycleId }, { limit: '3' });
  await getCommercialExecutionEventsController(reqEvt1, resEvt1);

  assert(resEvt1.statusCode === 200, 'Page 1 HTTP 200');
  assert(resEvt1.body?.events?.length === 3, 'Page 1 retornou exatamente 3 eventos');
  assert(resEvt1.body?.hasMore === true, 'Page 1 detectou hasMore: true');
  assert(resEvt1.body?.nextCursor === 'event_8', 'Page 1 nextCursor aponta para o último evento da página');

  // Verificar que o mock do Firestore recebeu orderBy('timestamp', 'desc') e limit(4)
  const lastQuery = MockCollectionRef.queryInvocations[MockCollectionRef.queryInvocations.length - 1];
  assert(lastQuery.name === 'commercial_execution_events', 'Query executada na coleção commercial_execution_events');
  assert(lastQuery.orderBy === 'timestamp', 'Query Firestore utilizou orderBy("timestamp") nativo');
  assert(lastQuery.limit === 4, 'Query Firestore utilizou limit(limit + 1) = 4 nativo');

  // Chamar página 2 usando cursor startAfter
  const { req: reqEvt2, res: resEvt2 } = createMockReqRes({}, {}, { id: cycleId }, { limit: '3', startAfter: resEvt1.body.nextCursor });
  await getCommercialExecutionEventsController(reqEvt2, resEvt2);

  assert(resEvt2.statusCode === 200, 'Page 2 HTTP 200');
  assert(resEvt2.body?.events?.length === 3, 'Page 2 retornou 3 eventos subsequentes');
  assert(resEvt2.body?.events[0].id !== resEvt1.body.events[0].id, 'Page 2 contém eventos diferentes da Page 1');

  // -------------------------------------------------------------
  // 2. DIRECT ATTRIBUTION ISOLATION (FIXED TRACKING)
  // -------------------------------------------------------------
  console.log('\n--- TESTE 2: ATRIBUIÇÃO DIRETA DETERMINÍSTICA ISOLADA ---');
  
  // Fixture: 10 pedidos na janela de 2026-06-01 a 2026-06-15.
  // Apenas 2 pedidos têm actionTrackingId: 'PROMO_VIP' (R$ 500 cada, CM R$ 200 cada).
  // Os outros 8 pedidos NÃO têm o tracking (R$ 800 cada).
  const ordersFixture: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const isTracked = i === 1 || i === 2;
    ordersFixture.push({
      id: `ord_${i}`,
      status: 'paid',
      paymentStatus: 'paid',
      total: isTracked ? 500 : 800,
      paidAmount: isTracked ? 500 : 800,
      createdAt: '2026-06-05T12:00:00Z',
      actionTrackingId: isTracked ? 'PROMO_VIP' : undefined,
      items: [
        {
          productId: isTracked ? 'prod_vip' : 'prod_std',
          quantity: isTracked ? 2 : 4,
          unitPrice: isTracked ? 250 : 200,
          unitCostSnapshot: isTracked ? 100 : 80,
          costCoverage: 'complete',
          isEstimated: false
        }
      ]
    });
  }

  const actionDirect: any = {
    id: 'act_direct_01',
    executionCycleId: 'cycle_01',
    title: 'Campanha VIP',
    executionStatus: 'in_progress',
    actionTrackingId: 'PROMO_VIP',
    productLine: 'ALL'
  };

  const directImpact = computeActionActualImpactCanonical({
    action: actionDirect,
    dataset: {
      orders: ordersFixture,
      expenses: [],
      investments: [],
      traffic: [],
      products: [
        { id: 'prod_vip', name: 'VIP Product', unitCost: 100, costCoverage: 'complete', isEstimated: false },
        { id: 'prod_std', name: 'Standard Product', unitCost: 80, costCoverage: 'complete', isEstimated: false }
      ]
    },
    startDate: '2026-06-01',
    endDate: '2026-06-15'
  });

  assert(directImpact.impactAttribution === 'direct', 'impactAttribution é "direct"');
  assert(directImpact.orders === 2, 'Isolamento estrito: Impacto calculado exclusivamente sobre os 2 pedidos rastreados (não 10)');
  assert(directImpact.revenue === 1000, 'Receita direta isolada é R$ 1.000,00 (2 x R$ 500)');
  assert(directImpact.units === 4, 'Unidades rastreadas são 4 (2 x 2 un)');
  assert(directImpact.averageTicket === 500, 'Ticket médio direto isolado é R$ 500,00');
  assert(directImpact.confidence === 'high', 'Confiança é "high" devido a rastreamento determinístico e custos completos');
  assert(directImpact.notes?.includes("Impacto direto apurado exclusivamente sobre 2 pedido(s) rastreado(s)"), 'Nota explícita de apuração direta');

  // -------------------------------------------------------------
  // 3. CORRELATED ATTRIBUTION (LINE / WINDOW)
  // -------------------------------------------------------------
  console.log('\n--- TESTE 3: ATRIBUIÇÃO CORRELACIONADA POR LINHA ---');

  const actionCorrelated: any = {
    id: 'act_corr_01',
    executionCycleId: 'cycle_01',
    title: 'Ação Linha Camisetas',
    executionStatus: 'in_progress',
    productLine: 'CAMISETAS'
  };

  const lineOrders: any[] = [
    {
      id: 'ord_line_1',
      status: 'paid',
      paymentStatus: 'paid',
      total: 200,
      paidAmount: 200,
      createdAt: '2026-06-05T12:00:00Z',
      items: [
        { productId: 'p1', line: 'CAMISETAS', quantity: 2, unitPrice: 100, unitCostSnapshot: 40, costCoverage: 'complete' }
      ]
    },
    {
      id: 'ord_line_2',
      status: 'paid',
      paymentStatus: 'paid',
      total: 150,
      paidAmount: 150,
      createdAt: '2026-06-06T12:00:00Z',
      items: [
        { productId: 'p2', line: 'BERMUDAS', quantity: 1, unitPrice: 150, unitCostSnapshot: 60, costCoverage: 'complete' }
      ]
    }
  ];

  const correlatedImpact = computeActionActualImpactCanonical({
    action: actionCorrelated,
    dataset: {
      orders: lineOrders,
      expenses: [],
      investments: [],
      traffic: [],
      products: []
    },
    startDate: '2026-06-01',
    endDate: '2026-06-15'
  });

  assert(correlatedImpact.impactAttribution === 'correlated', 'impactAttribution é "correlated"');
  assert(correlatedImpact.orders === 1, 'Apenas 1 pedido continha itens da linha CAMISETAS');
  assert(correlatedImpact.revenue === 200, 'Receita da linha é R$ 200,00');
  assert(correlatedImpact.notes?.includes('Resultado observado no período'), 'Linguagem honesta "Resultado observado no período"');

  // -------------------------------------------------------------
  // 4. COST GOVERNANCE (MISSING / UNAVAILABLE COST)
  // -------------------------------------------------------------
  console.log('\n--- TESTE 4: GOVERNANÇA DE CUSTOS & MISSING COST FIXTURE ---');

  const actionMissingCost: any = {
    id: 'act_missing_cost_01',
    executionCycleId: 'cycle_01',
    title: 'Ação Custo Ausente',
    executionStatus: 'in_progress',
    actionTrackingId: 'PROMO_NO_COST'
  };

  const missingCostOrders: any[] = [
    {
      id: 'ord_no_cost_1',
      status: 'paid',
      paymentStatus: 'paid',
      total: 300,
      paidAmount: 300,
      createdAt: '2026-06-05T12:00:00Z',
      actionTrackingId: 'PROMO_NO_COST',
      items: [
        {
          productId: 'prod_unknown_cost',
          quantity: 1,
          unitPrice: 300,
          costCoverage: 'unavailable'
        }
      ]
    }
  ];

  const ungovImpact = computeActionActualImpactCanonical({
    action: actionMissingCost,
    dataset: {
      orders: missingCostOrders,
      expenses: [],
      investments: [],
      traffic: [],
      products: [
        { id: 'prod_unknown_cost', name: 'Unknown Cost Item', costCoverage: 'unavailable' }
      ]
    },
    startDate: '2026-06-01',
    endDate: '2026-06-15'
  });

  assert(ungovImpact.confidence === 'insufficient', 'Governança: confidence é rebaixada para "insufficient" quando custo é indisponível');

  // -------------------------------------------------------------
  // 5. RECOMMENDATION DEDUPE TRANSACTIONAL LOCK (MULTI-INSTANCE)
  // -------------------------------------------------------------
  console.log('\n--- TESTE 5: DEDUPLICAÇÃO DE RECOMENDAÇÃO EM EXECUÇÃO CONCORRENTE ---');

  // Criar ciclo base
  const cycleDedupeId = 'cycle_dedupe_test';
  mockDb.storage.set(`commercial_execution_cycles/${cycleDedupeId}`, {
    id: cycleDedupeId,
    title: 'Ciclo Teste Dedupe',
    status: 'active',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30'
  });

  const recSourceId = 'rec_intelligence_999';

  // Executar 2 requisições concorrentes tentando criar ação a partir da MESMA recomendação
  const p1 = (async () => {
    const { req, res } = createMockReqRes({
      title: 'Ação Rec Instância 1',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-15',
      sourceRecommendationId: recSourceId,
      productLine: 'ALL'
    }, { 'idempotency-key': 'idemp_rec_call_1' }, { id: cycleDedupeId });
    await addCommercialActionToCycleController(req, res);
    return res;
  })();

  const p2 = (async () => {
    const { req, res } = createMockReqRes({
      title: 'Ação Rec Instância 2',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-15',
      sourceRecommendationId: recSourceId,
      productLine: 'ALL'
    }, { 'idempotency-key': 'idemp_rec_call_2' }, { id: cycleDedupeId });
    await addCommercialActionToCycleController(req, res);
    return res;
  })();

  const [resRec1, resRec2] = await Promise.all([p1, p2]);

  assert(resRec1.statusCode === 201 || resRec1.statusCode === 200, 'Primeira chamada concluída com 200/201');
  assert(resRec2.statusCode === 201 || resRec2.statusCode === 200, 'Segunda chamada concluída com 200/201');

  // Verificar que apenas UMA ação foi persistida no Firestore para essa recomendação
  let totalActionsForRec = 0;
  for (const [key, val] of mockDb.storage.entries()) {
    if (key.startsWith('commercial_actions/') && val.sourceRecommendationId === recSourceId) {
      totalActionsForRec++;
    }
  }
  assert(totalActionsForRec === 1, `Exatamente 1 ação criada para a recomendação '${recSourceId}' (deduplicação multi-instância garantida)`);
  assert(resRec1.body.action.id === resRec2.body.action.id, 'Ambas as instâncias retornaram o mesmo ID de ação');

  // -------------------------------------------------------------
  // 6. CONCURRENCY PERSISTENCE COUNTS (10x SAME KEY)
  // -------------------------------------------------------------
  console.log('\n--- TESTE 6: PERSISTÊNCIA DETERMINÍSTICA 10X CONCORRENTE COM MESMA CHAVE ---');

  const actionToReadyId = 'act_ready_concurrency_test';
  mockDb.storage.set(`commercial_actions/${actionToReadyId}`, {
    id: actionToReadyId,
    executionCycleId: cycleDedupeId,
    title: 'Ação para teste 10x',
    executionStatus: 'planned',
    status: 'draft'
  });

  const concurrencyKey = 'idemp_concurrency_10x_exact_key';
  const initialEventsCount = Array.from(mockDb.storage.keys()).filter(k => k.startsWith('commercial_execution_events/')).length;
  const initialIdempCount = Array.from(mockDb.storage.keys()).filter(k => k.startsWith('idempotency_records/')).length;

  const calls10x = Array.from({ length: 10 }, () => {
    const { req, res } = createMockReqRes({}, { 'idempotency-key': concurrencyKey }, { id: cycleDedupeId, actionId: actionToReadyId });
    return readyCommercialActionController(req, res).then(() => res);
  });

  const results10x = await Promise.all(calls10x);

  const finalEventsCount = Array.from(mockDb.storage.keys()).filter(k => k.startsWith('commercial_execution_events/')).length;
  const finalIdempCount = Array.from(mockDb.storage.keys()).filter(k => k.startsWith('idempotency_records/')).length;

  assert(results10x.every(r => r.statusCode === 200), 'Todos os 10 responses retornaram HTTP 200');
  assert(finalEventsCount - initialEventsCount === 1, `Exatamente 1 evento gerado para as 10 chamadas (delta = ${finalEventsCount - initialEventsCount})`);
  assert(finalIdempCount - initialIdempCount === 1, `Exatamente 1 registro de idempotência gerado (delta = ${finalIdempCount - initialIdempCount})`);

  // -------------------------------------------------------------
  // 7. SECURITY & AUTH (401 INVALID TOKEN / 403 NON-ADMIN / 200 ADMIN)
  // -------------------------------------------------------------
  console.log('\n--- TESTE 7: SEGURANÇA E AUTENTICAÇÃO REAL ---');

  // Testar sem token
  const { req: reqNoToken, res: resNoToken } = createMockReqRes({}, {});
  let nextCalled = false;
  await authenticateAdmin(reqNoToken, resNoToken, () => { nextCalled = true; });
  assert(resNoToken.statusCode === 401, 'Requisição sem Bearer token retorna 401 Unauthorized');
  assert(!nextCalled, 'Next() não é chamado sem token');

  // Testar com token inválido
  setAuthTokenVerifierForTesting(async () => {
    throw new Error('Firebase token signature is invalid');
  });

  const { req: reqInvalidToken, res: resInvalidToken } = createMockReqRes({}, { authorization: 'Bearer invalid_fake_token' });
  let nextCalled2 = false;
  await authenticateAdmin(reqInvalidToken, resInvalidToken, () => { nextCalled2 = true; });
  assert(resInvalidToken.statusCode === 401, 'Requisição com token inválido retorna 401 Unauthorized');
  assert(!nextCalled2, 'Next() não é chamado com token inválido');

  // Testar com token válido de usuário comum (não admin)
  setAuthTokenVerifierForTesting(async (token: string) => {
    return {
      uid: 'regular_user_123',
      email: 'customer@fpac.com.br',
      admin: false,
      aud: 'fpac',
      auth_time: 123,
      exp: 456,
      firebase: { identities: {}, sign_in_provider: 'password' },
      iat: 123,
      iss: 'firebase',
      sub: 'regular_user_123'
    };
  });

  const { req: reqRegularUser, res: resRegularUser } = createMockReqRes({}, { authorization: 'Bearer valid_user_token' });
  let nextCalled3 = false;
  await authenticateAdmin(reqRegularUser, resRegularUser, () => { nextCalled3 = true; });
  assert(resRegularUser.statusCode === 403, 'Usuário comum não-admin é bloqueado com 403 Forbidden');
  assert(!nextCalled3, 'Next() não é chamado para não-admin');

  // Testar com token válido de admin
  setAuthTokenVerifierForTesting(async (token: string) => {
    return {
      uid: 'admin_user_456',
      email: 'fpacstore@gmail.com',
      admin: true,
      aud: 'fpac',
      auth_time: 123,
      exp: 456,
      firebase: { identities: {}, sign_in_provider: 'password' },
      iat: 123,
      iss: 'firebase',
      sub: 'admin_user_456'
    };
  });

  const { req: reqAdminUser, res: resAdminUser } = createMockReqRes({}, { authorization: 'Bearer valid_admin_token' });
  let nextCalled4 = false;
  await authenticateAdmin(reqAdminUser, resAdminUser, () => { nextCalled4 = true; });
  assert(nextCalled4, 'Admin legítimo é autenticado e avança para next()');

  resetAuthForTesting();

  console.log('\n===============================================================');
  console.log(`📊 RESULTADO FASE 9.6.7-C: ${passedTests} PASSOU | ${failedTests} FALHOU`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase967CFinalSuite().catch((err) => {
  console.error('❌ Erro inesperado na suíte 9.6.7-C:', err);
  process.exit(1);
});

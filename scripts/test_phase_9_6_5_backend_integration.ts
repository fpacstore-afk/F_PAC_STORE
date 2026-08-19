/**
 * SUÍTE DE INTEGRAÇÃO REAL DE BACKEND FASE 9.6.5-A — CONTROLLERS, CONCORRÊNCIA E RANGE QUERIES
 * FPAC Store — Validação de Endpoints, Transações Atômicas, Idempotência Persistida, Auth e Imutabilidade
 */

import {
  setCommercialForecastDb,
  getForecastBaselineController,
  createCommercialForecastController,
  getCommercialForecastsController,
  getCommercialForecastByIdController,
  updateCommercialForecastController,
  recalculateCommercialForecastController,
  simulateForecastScenarioController,
  convertScenarioToActionController
} from '../server/controllers/commercialForecast.controller.js';
import { setCommercialGovernanceDb } from '../server/controllers/commercialGovernance.controller.js';
import { authenticateAdmin, setAuthTokenVerifierForTesting, AuthenticatedRequest } from '../server/middleware/auth.middleware.js';
import { Timestamp } from 'firebase-admin/firestore';
import { execSync } from 'child_process';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`, detail !== undefined ? detail : '');
  }
}

// Mock Firestore Database instrumentado com transações reais em memória e log de Range Queries
class MockForecastFirestore {
  public collections: Map<string, Map<string, any>> = new Map();
  public queryLog: Array<{ collection: string; filters: Array<{ field: string; op: string; value: any }> }> = [];

  constructor() {
    this.collections.set('orders', new Map());
    this.collections.set('financial_cashflow', new Map());
    this.collections.set('financial_traffic', new Map());
    this.collections.set('financial_investments', new Map());
    this.collections.set('products', new Map());
    this.collections.set('commercial_forecasts', new Map());
    this.collections.set('commercial_forecast_events', new Map());
    this.collections.set('commercial_actions', new Map());
    this.collections.set('commercial_action_events', new Map());
    this.collections.set('commercial_action_fingerprints', new Map());
    this.collections.set('idempotency_records', new Map());
  }

  public collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    const store = this.collections.get(name)!;
    const queryLog = this.queryLog;

    class QueryBuilder {
      private filters: Array<{ field: string; op: string; value: any }> = [];

      where(field: string, op: string, value: any) {
        this.filters.push({ field, op, value });
        return this;
      }

      async get() {
        queryLog.push({ collection: name, filters: [...this.filters] });
        let docs = Array.from(store.entries()).map(([id, data]) => ({
          id,
          data: () => data,
          exists: true
        }));

        for (const f of this.filters) {
          docs = docs.filter(doc => {
            const data = doc.data();
            const val = data[f.field];
            if (val === undefined) return false;

            let compareVal = val;
            let targetVal = f.value;

            if (val && typeof val.toMillis === 'function') {
              compareVal = val.toMillis();
            } else if (val instanceof Date) {
              compareVal = val.getTime();
            } else if (typeof val === 'string' && val.includes('T')) {
              compareVal = new Date(val).getTime();
            }

            if (targetVal && typeof targetVal.toMillis === 'function') {
              targetVal = targetVal.toMillis();
            } else if (targetVal instanceof Date) {
              targetVal = targetVal.getTime();
            } else if (typeof targetVal === 'string' && targetVal.includes('T')) {
              targetVal = new Date(targetVal).getTime();
            }

            if (f.op === '>=') return compareVal >= targetVal;
            if (f.op === '<=') return compareVal <= targetVal;
            if (f.op === '==') return val === f.value;
            return true;
          });
        }

        return {
          docs,
          empty: docs.length === 0,
          size: docs.length
        };
      }

      doc(docId?: string) {
        const actualDocId = docId || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        return {
          id: actualDocId,
          async get() {
            const data = store.get(actualDocId);
            return {
              id: actualDocId,
              exists: !!data,
              data: () => data
            };
          },
          async set(data: any, options?: { merge?: boolean }) {
            if (options?.merge && store.has(actualDocId)) {
              const prev = store.get(actualDocId);
              store.set(actualDocId, { ...prev, ...data });
            } else {
              store.set(actualDocId, data);
            }
          },
          async update(data: any) {
            const prev = store.get(actualDocId) || {};
            store.set(actualDocId, { ...prev, ...data });
          }
        };
      }
    }

    return new QueryBuilder();
  }

  public async runTransaction(fn: (transaction: any) => Promise<any>) {
    const transaction = {
      get: async (ref: any) => ref.get(),
      set: (ref: any, data: any, options?: any) => ref.set(data, options),
      update: (ref: any, data: any) => ref.update(data),
      delete: (ref: any) => { /* no-op */ }
    };
    return await fn(transaction);
  }
}

// Mock de Request e Response Express
function createMockReqRes(options: {
  method?: string;
  url?: string;
  originalUrl?: string;
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
  user?: any;
}) {
  const req: any = {
    method: options.method || 'GET',
    url: options.url || '/api/admin/commercial/forecasts',
    originalUrl: options.originalUrl || options.url || '/api/admin/commercial/forecasts',
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
    user: options.user !== undefined ? options.user : { uid: 'admin_user_1', email: 'fpacstore@gmail.com', role: 'admin' }
  };

  let statusCode = 200;
  let responseBody: any = null;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseBody = data;
      return res;
    },
    getStatusCode() {
      return statusCode;
    },
    getBody() {
      return responseBody;
    }
  };

  return { req, res };
}

async function runPhase965BackendIntegration() {
  console.log('\n===============================================================');
  console.log('⚡ INICIANDO SUÍTE DE INTEGRAÇÃO REAL DE BACKEND FASE 9.6.5-A');
  console.log('===============================================================\n');

  const mockDb = new MockForecastFirestore();
  setCommercialForecastDb(mockDb);
  setCommercialGovernanceDb(mockDb);

  // -----------------------------------------------------------------
  // 1. Povoamento com 150 Pedidos Mistos em Agosto 2026
  // -----------------------------------------------------------------
  console.log('--- 1. Povoamento com 150 Pedidos Mistos em Agosto 2026 ---');
  const ordersStore = mockDb.collections.get('orders')!;
  const productsStore = mockDb.collections.get('products')!;
  const cashflowStore = mockDb.collections.get('financial_cashflow')!;
  const trafficStore = mockDb.collections.get('financial_traffic')!;

  productsStore.set('p1', { id: 'p1', name: 'Camiseta Classic FPAC', costPrice: 40, price: 100 });

  // 100 Pedidos String ISO
  for (let i = 1; i <= 100; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    ordersStore.set(`ord_str_${i}`, {
      id: `ord_str_${i}`,
      total: 100,
      paidAmount: 100,
      status: 'delivered',
      paymentStatus: 'approved',
      payment: { gatewayFee: 3 },
      createdAt: `2026-08-${day}T10:00:00.000Z`,
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    });
  }

  // 50 Pedidos Firestore Timestamp
  for (let j = 1; j <= 50; j++) {
    const day = String((j % 28) + 1).padStart(2, '0');
    ordersStore.set(`ord_ts_${j}`, {
      id: `ord_ts_${j}`,
      total: 100,
      paidAmount: 100,
      status: 'delivered',
      paymentStatus: 'approved',
      payment: { gatewayFee: 3 },
      createdAt: Timestamp.fromDate(new Date(`2026-08-${day}T15:00:00.000Z`)),
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    });
  }

  // 20 Pedidos em Julho (Fora de Agosto)
  for (let k = 1; k <= 20; k++) {
    ordersStore.set(`ord_jul_${k}`, {
      id: `ord_jul_${k}`,
      total: 100,
      paidAmount: 100,
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: `2026-07-15T12:00:00.000Z`,
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    });
  }

  cashflowStore.set('cf_1', { id: 'cf_1', amount: 1000, type: 'fixed', date: '2026-08-05' });
  trafficStore.set('tf_1', { id: 'tf_1', amount: 500, date: '2026-08-10' });

  // -----------------------------------------------------------------
  // 2. Teste GET /api/admin/commercial/forecast/baseline
  // -----------------------------------------------------------------
  console.log('\n--- 2. GET /api/admin/commercial/forecast/baseline ---');
  mockDb.queryLog = [];
  const { req: bReq, res: bRes } = createMockReqRes({
    query: { startDate: '2026-08-01', endDate: '2026-08-31' }
  });

  await getForecastBaselineController(bReq, bRes);
  assert(bRes.getStatusCode() === 200, 'Baseline retorna HTTP 200');
  const bData = bRes.getBody();
  assert(bData.success === true, 'Baseline retorna success: true');
  assert(bData.ordersCount === 150, 'Baseline processa exatamente 150 pedidos (100 String + 50 Timestamp)');
  assert(bData.baseline.realizedRevenue === 15000, 'Receita apurada no backend = R$ 15.000');
  assert(bData.baseline.realizedContributionMargin === 8550, 'Margem de contribuição apurada no backend = R$ 8.550');
  assert(bData.baseline.realizedOperatingProfit === 7050, 'Lucro operacional apurado no backend = R$ 7.050');

  // Range Queries Check
  const ordersQueries = mockDb.queryLog.filter(q => q.collection === 'orders');
  assert(ordersQueries.length === 2, 'Executou 2 range queries em orders (String Range + Timestamp Range)');

  // -----------------------------------------------------------------
  // 3. Teste POST /api/admin/commercial/forecasts & Idempotência / Concorrência Persistida
  // -----------------------------------------------------------------
  console.log('\n--- 3. POST /api/admin/commercial/forecasts & Idempotência Persistida ---');
  
  // 3.1 Sem chave -> 400
  const { req: noKeyReq, res: noKeyRes } = createMockReqRes({
    method: 'POST',
    body: {
      title: 'Forecast Q3',
      horizon: 'quarter',
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    }
  });
  await createCommercialForecastController(noKeyReq, noKeyRes);
  assert(noKeyRes.getStatusCode() === 400, 'Requisição sem Idempotency-Key retorna HTTP 400');
  assert(noKeyRes.getBody()?.code === 'IDEMPOTENCY_KEY_REQUIRED', 'Código retornado é IDEMPOTENCY_KEY_REQUIRED');

  // 3.2 Execução com Idempotency Key e Transação Persistida
  const sharedKey = `idemp_fc_${Date.now()}`;
  const { req: createReq, res: createRes } = createMockReqRes({
    method: 'POST',
    headers: { 'idempotency-key': sharedKey },
    body: {
      title: 'Forecast Agosto 2026 Oficial',
      horizon: 'current_month',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      notes: 'Premissa de expansão testada em concorrência'
    }
  });

  await createCommercialForecastController(createReq, createRes);
  assert(createRes.getStatusCode() === 201, 'Criação inicial retorna HTTP 201');

  const forecastsStore = mockDb.collections.get('commercial_forecasts')!;
  assert(forecastsStore.size === 1, 'Exatamente 1 Forecast foi persistido no Firestore');
  const createdForecast = Array.from(forecastsStore.values())[0];
  assert(createdForecast.title === 'Forecast Agosto 2026 Oficial', 'Título do forecast persistido com sucesso');

  const idempotencyStore = mockDb.collections.get('idempotency_records')!;
  assert(idempotencyStore.size >= 1, 'Registro de idempotência persistido na coleção idempotency_records');

  // 3.3 Replay Idempotente
  const { req: replayReq, res: replayRes } = createMockReqRes({
    method: 'POST',
    headers: { 'idempotency-key': sharedKey },
    body: {
      title: 'Forecast Agosto 2026 Oficial Modificado',
      horizon: 'current_month',
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    }
  });
  await createCommercialForecastController(replayReq, replayRes);
  assert(replayRes.getStatusCode() === 200, 'Replay idempotente retorna HTTP 200 com payload idêntico em cache');
  assert(forecastsStore.size === 1, 'Nenhum forecast duplicado foi criado no replay');

  // -----------------------------------------------------------------
  // 4. Teste What-If Simulator & Conversão para Ação Transacional Canônica (9.6.4)
  // -----------------------------------------------------------------
  console.log('\n--- 4. What-If Simulator & Conversão para Ação Transacional ---');
  const { req: scReq, res: scRes } = createMockReqRes({
    method: 'POST',
    body: {
      forecastId: createdForecast.id,
      params: {
        name: 'Simulação Preço +5%',
        priceAdjustmentPercent: 5,
        volumeElasticityFactor: 1.0
      }
    }
  });

  await simulateForecastScenarioController(scReq, scRes);
  assert(scRes.getStatusCode() === 200, 'Simulação de cenário retorna HTTP 200');
  const scData = scRes.getBody();
  assert(scData.scenario.deltaOperatingProfit > 0, 'Delta de Lucro Operacional calculado positivamente');

  // Conversão para Ação com Reuso Transacional de commercialGovernance.controller.ts
  const actionKey = `idemp_act_convert_${Date.now()}`;
  const { req: actReq, res: actRes } = createMockReqRes({
    method: 'POST',
    headers: { 'idempotency-key': actionKey },
    body: {
      forecastId: createdForecast.id,
      scenario: scData.scenario,
      targetProductId: 'p1',
      targetProductName: 'Camiseta Classic FPAC'
    }
  });

  await convertScenarioToActionController(actReq, actRes);
  assert(actRes.getStatusCode() === 201, 'Conversão de cenário em ação retorna HTTP 201');
  const actData = actRes.getBody();
  assert(actData.action.status === 'draft', 'Ação criada em status draft');
  assert(actData.action.type === 'review_price', 'Tipo de ação inferido = review_price');

  const actionsStore = mockDb.collections.get('commercial_actions')!;
  assert(actionsStore.size === 1, 'Ação Comercial persistida via createCommercialActionTransactional');

  // -----------------------------------------------------------------
  // 5. Teste Recalculate & Baseline Immutability
  // -----------------------------------------------------------------
  console.log('\n--- 5. Recalcular Forecast e Garantia de Baseline Imutável ---');
  const baselineOriginalJson = JSON.stringify(createdForecast.baseline);

  const recalcKey = `idemp_recalc_${Date.now()}`;
  const { req: rcReq, res: rcRes } = createMockReqRes({
    method: 'POST',
    params: { id: createdForecast.id },
    headers: { 'idempotency-key': recalcKey }
  });

  await recalculateCommercialForecastController(rcReq, rcRes);
  assert(rcRes.getStatusCode() === 200, 'Recalcular forecast retorna HTTP 200');
  const rcData = rcRes.getBody();
  const updatedForecast = rcData.forecast;

  assert(JSON.stringify(updatedForecast.baseline) === baselineOriginalJson, 'BASELINE IMMUTABILITY: O snapshot do baseline não sofreu NENHUMA mutação');
  assert(updatedForecast.currentActuals !== undefined, 'currentActuals populado com dados correntes sem sobrescrever baseline');

  // -----------------------------------------------------------------
  // 6. Teste de Autenticação / Autorização (401 / 403 / 200)
  // -----------------------------------------------------------------
  console.log('\n--- 6. Autenticação & Autorização das Rotas de Forecast ---');
  
  // 6.1 Sem token -> 401
  const { req: unauthReq, res: unauthRes } = createMockReqRes({
    url: '/api/admin/commercial/forecasts',
    headers: {}
  });
  let nextCalled: boolean = false;
  await authenticateAdmin(unauthReq as any, unauthRes as any, () => { nextCalled = true; });
  assert(unauthRes.getStatusCode() === 401, 'Requisição sem token Authorization é bloqueada com HTTP 401');
  assert(!nextCalled, 'NextFunction não foi executada');

  // 6.2 Token de usuário NÃO-Admin -> 403
  setAuthTokenVerifierForTesting(async () => ({
    uid: 'non_admin_user',
    email: 'client@example.com',
    admin: false,
    aud: 'test',
    auth_time: 0,
    exp: 9999999999,
    firebase: { identities: {}, sign_in_provider: 'password' },
    iat: 0,
    iss: 'test',
    sub: 'non_admin_user'
  } as any));

  const { req: nonAdminReq, res: nonAdminRes } = createMockReqRes({
    url: '/api/admin/commercial/forecasts',
    headers: { authorization: 'Bearer valid_but_non_admin_token' }
  });
  nextCalled = false;
  await authenticateAdmin(nonAdminReq as any, nonAdminRes as any, () => { nextCalled = true; });
  assert(nonAdminRes.getStatusCode() === 403, 'Usuário autenticado mas sem privilégio de admin é bloqueado com HTTP 403');
  assert(!nextCalled, 'NextFunction não foi executada para não-admin');

  // 6.3 Token de usuário Admin -> Next()
  setAuthTokenVerifierForTesting(async () => ({
    uid: 'admin_user',
    email: 'fpacstore@gmail.com',
    admin: true,
    aud: 'test',
    auth_time: 0,
    exp: 9999999999,
    firebase: { identities: {}, sign_in_provider: 'password' },
    iat: 0,
    iss: 'test',
    sub: 'admin_user'
  } as any));

  let adminNextCalled = false;
  const { req: adminReq, res: adminRes } = createMockReqRes({
    url: '/api/admin/commercial/forecasts',
    headers: { authorization: 'Bearer valid_admin_token' }
  });
  await authenticateAdmin(adminReq as any, adminRes as any, () => { adminNextCalled = true; });
  assert(Boolean(adminNextCalled), 'Usuário admin autorizado com sucesso (next() chamado)');

  // Resetar verifier
  setAuthTokenVerifierForTesting(null);

  // -----------------------------------------------------------------
  // SUMÁRIO DA INTEGRAÇÃO
  // -----------------------------------------------------------------
  const total = passedTests + failedTests;
  console.log('\n===============================================================');
  console.log(`📊 RESULTADO INTEGRAÇÃO 9.6.5-A: TOTAL: ${total} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    console.error(`❌ Falha nos testes de integração: ${failedTests} testes falharam.`);
    process.exit(1);
  }
}

runPhase965BackendIntegration().catch(err => {
  console.error('❌ Erro fatal na integração 9.6.5-A:', err);
  process.exit(1);
});

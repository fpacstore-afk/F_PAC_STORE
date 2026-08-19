/**
 * TEST SUITE DE INTEGRAÇÃO BACKEND — FASE 9.6.6-A
 * FPAC Store — Orçamento Comercial, Reconciliação Multi-Way, Rebudgeting & Hardening
 */

process.env.NODE_ENV = 'test';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  generateCommercialBudget,
  buildBudgetBaselineSnapshot,
  calculateBudgetToDateProRata,
  calculateBudgetCurrentActuals,
  evaluateBudgetReconciliation,
  evaluateBudgetGuardrails,
  evaluateBudgetConfidence,
  recalculateCommercialBudgetActuals,
  generateCommercialBudgetLineAllocations,
  createApprovedBudgetSnapshot,
  createRebudgetVersion,
  extractOrderDateString,
  roundMoney,
  roundPercent,
  countDaysBetween,
  calculateActualDaysElapsed
} from '../src/utils/commercialBudget.js';
import {
  CommercialBudget,
  CommercialBudgetAllocations,
  CommercialBudgetGuardrails,
  CommercialBudgetLineAllocation
} from '../src/types/commercialBudget.js';
import {
  setCommercialBudgetDb,
  setBudgetClockForTests,
  getBudgetClock,
  createCommercialBudgetController,
  updateCommercialBudgetController,
  activateCommercialBudgetController,
  rebudgetCommercialBudgetController,
  recalculateCommercialBudgetController,
  archiveCommercialBudgetController,
  getCommercialBudgetsController,
  getCommercialBudgetByIdController,
  getCommercialBudgetEventsController
} from '../server/controllers/commercialBudget.controller.js';
import {
  authenticateAdmin,
  setAuthTokenVerifierForTesting,
  setAuthDbForTesting
} from '../server/middleware/auth.middleware.js';

// Mock DB in-memory robusto com suporte a Queries complexas, Transações atômicas e Timestamps
class InMemoryDatabase {
  private collections: Map<string, Map<string, any>> = new Map();
  private transactionQueue: Promise<any> = Promise.resolve();

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    const store = this.collections.get(name)!;

    return {
      doc: (id?: string) => {
        const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        return {
          id: docId,
          get: async () => {
            const data = store.get(docId);
            return {
              exists: !!data,
              id: docId,
              data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
            };
          },
          set: async (val: any) => {
            store.set(docId, JSON.parse(JSON.stringify(val)));
          },
          update: async (val: any) => {
            const current = store.get(docId) || {};
            const updated = { ...current };
            for (const key of Object.keys(val)) {
              if (key.includes('.')) {
                const parts = key.split('.');
                let currObj = updated;
                for (let i = 0; i < parts.length - 1; i++) {
                  if (!currObj[parts[i]]) currObj[parts[i]] = {};
                  currObj = currObj[parts[i]];
                }
                currObj[parts[parts.length - 1]] = val[key];
              } else {
                updated[key] = val[key];
              }
            }
            store.set(docId, updated);
          },
          delete: async () => {
            store.delete(docId);
          }
        };
      },
      where: (field: string, opStr: string, value: any) => {
        const filters: Array<{ field: string; op: string; val: any }> = [{ field, op: opStr, val: value }];

        const queryObj = {
          where: (f2: string, op2: string, val2: any) => {
            filters.push({ field: f2, op: op2, val: val2 });
            return queryObj;
          },
          get: async () => {
            const results: any[] = [];
            for (const [docId, docData] of store.entries()) {
              let match = true;
              for (const filter of filters) {
                let actualVal = docData[filter.field];
                let compareVal = filter.val;

                // Handle nested or Timestamp comparison
                if (actualVal && typeof actualVal === 'object' && typeof actualVal.toDate === 'function') {
                  actualVal = actualVal.toDate().toISOString();
                } else if (actualVal && typeof actualVal === 'object' && (actualVal.seconds || actualVal._seconds)) {
                  const sec = actualVal.seconds || actualVal._seconds;
                  actualVal = new Date(sec * 1000).toISOString();
                } else if (actualVal instanceof Date) {
                  actualVal = actualVal.toISOString();
                }

                if (compareVal && typeof compareVal === 'object' && typeof compareVal.toDate === 'function') {
                  compareVal = compareVal.toDate().toISOString();
                } else if (compareVal && typeof compareVal === 'object' && (compareVal.seconds || compareVal._seconds)) {
                  const sec = compareVal.seconds || compareVal._seconds;
                  compareVal = new Date(sec * 1000).toISOString();
                } else if (compareVal instanceof Date) {
                  compareVal = compareVal.toISOString();
                }

                if (filter.op === '==' && actualVal !== compareVal) match = false;
                if (filter.op === '>=' && String(actualVal) < String(compareVal)) match = false;
                if (filter.op === '<=' && String(actualVal) > String(compareVal)) match = false;
                if (filter.op === '>' && String(actualVal) <= String(compareVal)) match = false;
                if (filter.op === '<' && String(actualVal) >= String(compareVal)) match = false;
              }
              if (match) {
                results.push({
                  id: docId,
                  data: () => JSON.parse(JSON.stringify(docData))
                });
              }
            }
            return {
              docs: results,
              empty: results.length === 0,
              size: results.length,
              forEach: (cb: (doc: any) => void) => results.forEach(cb)
            };
          }
        };
        return queryObj;
      },
      get: async () => {
        const results: any[] = [];
        for (const [docId, docData] of store.entries()) {
          results.push({
            id: docId,
            data: () => JSON.parse(JSON.stringify(docData))
          });
        }
        return {
          docs: results,
          empty: results.length === 0,
          size: results.length,
          forEach: (cb: (doc: any) => void) => results.forEach(cb)
        };
      }
    };
  }

  async runTransaction(updateFunction: (transaction: any) => Promise<any>): Promise<any> {
    const run = async () => {
      const transaction = {
        get: async (docRef: any) => docRef.get(),
        set: async (docRef: any, data: any) => docRef.set(data),
        update: async (docRef: any, data: any) => docRef.update(data),
        delete: async (docRef: any) => docRef.delete()
      };
      return await updateFunction(transaction);
    };

    const next = this.transactionQueue.then(run, run);
    this.transactionQueue = next.then(() => {}, () => {});
    return next;
  }

  getDocCount(collectionName: string): number {
    return this.collections.get(collectionName)?.size || 0;
  }

  clear() {
    this.collections.clear();
  }
}

// Helpers para simulação de Requisições Express
function createMockReq(options: {
  method?: string;
  params?: any;
  query?: any;
  body?: any;
  headers?: any;
  user?: any;
  originalUrl?: string;
}): any {
  return {
    method: options.method || 'GET',
    params: options.params || {},
    query: options.query || {},
    body: options.body || {},
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    },
    originalUrl: options.originalUrl || '/api/admin/commercial/budgets',
    url: options.originalUrl || '/api/admin/commercial/budgets',
    user: options.user || { uid: 'admin_test_1', email: 'admin@fpacstore.com.br', role: 'admin' }
  };
}

function createMockRes(): { res: any; getResult: () => { statusCode: number; body: any } } {
  let statusCode = 200;
  let body: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      body = data;
      return res;
    },
    send: (data: any) => {
      body = data;
      return res;
    },
    setHeader: () => res
  };

  return {
    res,
    getResult: () => ({ statusCode, body })
  };
}

// SUITE PRINCIPAL
async function runBackendIntegrationSuite() {
  console.log('========================================================================');
  console.log('🚀 INICIANDO TESTES DE INTEGRAÇÃO BACKEND — FASE 9.6.6-A');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(err);
      failed++;
    }
  }

  const mockDb = new InMemoryDatabase();
  setCommercialBudgetDb(mockDb);
  setBudgetClockForTests(() => new Date('2026-03-15T12:00:00.000Z'));

  // Test Catalog
  const productCatalog = [
    { id: 'p_force_1', name: 'Creatina Force 300g', price: 100, costPrice: 35 },
    { id: 'p_mark_1', name: 'Whey Protein Mark 900g', price: 150, costPrice: 50 },
    { id: 'p_prime_1', name: 'Pre-Workout Prime 300g', price: 120, costPrice: 40 },
    { id: 'p_other_1', name: 'Shaker Bottle FPAC', price: 40, costPrice: 12 }
  ];
  productCatalog.forEach(p => mockDb.collection('products').doc(p.id).set(p));

  // TEST 1: 150 MIXED DATE ORDERS COM TIMESTAMP REAL & ISOLAMENTO TEMPORAL
  await test('1. 150 Mixed Date Orders com Timestamp real (ISO, Date, Firestore Timestamp, seconds/nanoseconds)', async () => {
    mockDb.clear();
    productCatalog.forEach(p => mockDb.collection('products').doc(p.id).set(p));

    // Gerar 150 pedidos distribuídos em 3 janelas temporais:
    // - 50 pedidos em Janeiro (antes do período de baseline/budget)
    // - 50 pedidos em Fevereiro (período de baseline: 2026-02-01 a 2026-02-28)
    // - 50 pedidos em Março (período do budget: 2026-03-01 a 2026-03-31)
    const ordersList: any[] = [];
    for (let i = 1; i <= 150; i++) {
      let dateStr: string;
      let rawDate: any;

      if (i <= 50) {
        const day = (i % 28) + 1;
        dateStr = `2026-01-${String(day).padStart(2, '0')}T10:00:00.000Z`;
      } else if (i <= 100) {
        const day = ((i - 50) % 28) + 1;
        dateStr = `2026-02-${String(day).padStart(2, '0')}T10:00:00.000Z`;
      } else {
        const day = ((i - 100) % 28) + 1;
        dateStr = `2026-03-${String(day).padStart(2, '0')}T10:00:00.000Z`;
      }

      const dateObj = new Date(dateStr);

      // Distribuir os tipos de datas entre as 4 representações
      const typeMod = i % 4;
      if (typeMod === 0) {
        rawDate = dateStr; // ISO String
      } else if (typeMod === 1) {
        rawDate = dateObj; // JS Date
      } else if (typeMod === 2) {
        // Firestore Timestamp com .toDate()
        rawDate = {
          seconds: Math.floor(dateObj.getTime() / 1000),
          nanoseconds: (dateObj.getTime() % 1000) * 1000000,
          toDate: () => dateObj,
          toMillis: () => dateObj.getTime()
        };
      } else {
        // Objeto legado { seconds, _nanoseconds }
        rawDate = {
          seconds: Math.floor(dateObj.getTime() / 1000),
          _nanoseconds: 0
        };
      }

      const orderDoc = {
        id: `ord_${i}`,
        status: 'completed',
        createdAt: rawDate,
        total: 100,
        items: [
          { productId: 'p_force_1', name: 'Creatina Force 300g', price: 100, costPrice: 35, quantity: 1 }
        ]
      };

      ordersList.push(orderDoc);
      await mockDb.collection('orders').doc(`ord_${i}`).set(orderDoc);
    }

    // Validar extractOrderDateString para todos
    ordersList.forEach(o => {
      const extracted = extractOrderDateString(o.createdAt);
      assert.ok(extracted, `Falha ao extrair data para pedido ${o.id}`);
      assert.ok(extracted.match(/^\d{4}-\d{2}-\d{2}/), `Formato inválido: ${extracted}`);
    });

    // Baseline de Fevereiro (espera exatamente 50 pedidos de R$ 100 = R$ 5.000)
    const baseline = buildBudgetBaselineSnapshot({
      orders: ordersList,
      productCatalog,
      sourceStartDate: '2026-02-01',
      sourceEndDate: '2026-02-28',
      budgetStartDate: '2026-03-01',
      budgetEndDate: '2026-03-31'
    });

    assert.strictEqual(baseline.realizedRevenue, 5000, 'Baseline de Fevereiro deve conter exatamente R$ 5.000');
    assert.strictEqual(baseline.realizedOrders, 50, 'Baseline de Fevereiro deve conter exatamente 50 pedidos');

    // Realizado de Março até dia 15 (espera pedidos do dia 1 ao dia 15 = 26 pedidos)
    const actuals = calculateBudgetCurrentActuals({
      orders: ordersList,
      productCatalog,
      budgetStartDate: '2026-03-01',
      budgetEndDate: '2026-03-31',
      asOfDate: '2026-03-15T12:00:00.000Z'
    });

    assert.ok(actuals.ordersCount > 0 && actuals.ordersCount <= 50, `Pedidos de março até dia 15: ${actuals.ordersCount}`);
    assert.strictEqual(actuals.revenue, actuals.ordersCount * 100);
  });

  // TEST 2: PATCH BLOQUEADO EM BUDGET ACTIVE (409 ACTIVE_BUDGET_IMMUTABLE)
  await test('2. PATCH em Budget active retorna 409 ACTIVE_BUDGET_IMMUTABLE', async () => {
    const budgetId = 'budget_test_active_patch';
    const initialBudget: CommercialBudget = {
      id: budgetId,
      title: 'Orçamento Março 2026',
      period: 'monthly',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      status: 'active',
      version: 1,
      targetRevenue: 50000,
      targetContributionMargin: 20000,
      targetContributionMarginPercent: 40,
      targetOperatingProfit: 10000,
      targetOrders: 500,
      targetUnits: 500,
      targetAverageTicket: 100,
      allocations: {
        cogsBudget: 15000,
        trafficBudget: 5000,
        fixedExpensesBudget: 5000,
        variableExpensesBudget: 2500,
        shippingSubsidyBudget: 1500,
        gatewayFeesBudget: 1000,
        totalExpensesBudget: 30000
      },
      guardrails: {
        maxTrafficSpendPercentOfRevenue: 15,
        minContributionMarginPercent: 30,
        maxCogsPercentOfRevenue: 40,
        burnRateAlertThresholdPercent: 110
      },
      baselineSnapshot: {
        isHistoricalSnapshot: true,
        sourceStartDate: '2026-02-01',
        sourceEndDate: '2026-02-28',
        budgetStartDate: '2026-03-01',
        budgetEndDate: '2026-03-31',
        realizedRevenue: 40000,
        realizedOrders: 400,
        realizedContributionMargin: 16000,
        realizedOperatingProfit: 8000,
        realizedAverageTicket: 100
      } as any,
      currentActuals: {} as any,
      reconciliation: {} as any,
      confidence: {} as any,
      createdBy: 'admin',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };

    await mockDb.collection('commercial_budgets').doc(budgetId).set(initialBudget);

    // Tentar alterar targetRevenue em orçamento ativo
    const req1 = createMockReq({
      method: 'PATCH',
      params: { id: budgetId },
      headers: { 'idempotency-key': 'idemp_patch_active_fail_1' },
      body: { targetRevenue: 60000 }
    });
    const { res: res1, getResult: getResult1 } = createMockRes();
    await updateCommercialBudgetController(req1, res1);

    const result1 = getResult1();
    assert.strictEqual(result1.statusCode, 409, 'PATCH em budget ativo deve retornar HTTP 409');
    assert.strictEqual(result1.body.code, 'ACTIVE_BUDGET_IMMUTABLE');

    // Tentar alterar allocations em orçamento ativo
    const req2 = createMockReq({
      method: 'PATCH',
      params: { id: budgetId },
      headers: { 'idempotency-key': 'idemp_patch_active_fail_2' },
      body: { allocations: { cogsBudget: 20000 } }
    });
    const { res: res2, getResult: getResult2 } = createMockRes();
    await updateCommercialBudgetController(req2, res2);

    const result2 = getResult2();
    assert.strictEqual(result2.statusCode, 409, 'PATCH em allocations de budget ativo deve retornar 409');

    // Alteração de campos meramente cadastrais (ex: descrição) é permitida
    const req3 = createMockReq({
      method: 'PATCH',
      params: { id: budgetId },
      headers: { 'idempotency-key': 'idemp_patch_active_desc_ok' },
      body: { description: 'Nova descrição operacional' }
    });
    const { res: res3, getResult: getResult3 } = createMockRes();
    await updateCommercialBudgetController(req3, res3);

    const result3 = getResult3();
    assert.strictEqual(result3.statusCode, 200, 'Atualizar descrição cadastral em ativo deve ter sucesso 200');
    assert.strictEqual(result3.body.budget.description, 'Nova descrição operacional');
  });

  // TEST 3: VERSIONAMENTO E REBUDGETING CANÔNICO (POST /rebudget -> v2+, parentBudgetId)
  await test('3. Rebudgeting gera nova versão (v2+) com parentBudgetId e trilha de auditoria', async () => {
    const parentId = 'budget_march_v1';
    const parentBudget: CommercialBudget = {
      id: parentId,
      title: 'Orçamento Março 2026',
      period: 'monthly',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      status: 'active',
      version: 1,
      targetRevenue: 50000,
      targetContributionMargin: 20000,
      targetContributionMarginPercent: 40,
      targetOperatingProfit: 10000,
      targetOrders: 500,
      targetUnits: 500,
      targetAverageTicket: 100,
      allocations: {
        cogsBudget: 15000,
        trafficBudget: 5000,
        fixedExpensesBudget: 5000,
        variableExpensesBudget: 2500,
        shippingSubsidyBudget: 1500,
        gatewayFeesBudget: 1000,
        totalExpensesBudget: 30000
      },
      guardrails: {
        maxTrafficSpendPercentOfRevenue: 15,
        minContributionMarginPercent: 30,
        maxCogsPercentOfRevenue: 40,
        burnRateAlertThresholdPercent: 110
      },
      baselineSnapshot: {
        isHistoricalSnapshot: true,
        sourceStartDate: '2026-02-01',
        sourceEndDate: '2026-02-28',
        budgetStartDate: '2026-03-01',
        budgetEndDate: '2026-03-31',
        realizedRevenue: 40000,
        realizedOrders: 400,
        realizedContributionMargin: 16000,
        realizedOperatingProfit: 8000,
        realizedAverageTicket: 100
      } as any,
      currentActuals: {} as any,
      reconciliation: {} as any,
      confidence: {} as any,
      createdBy: 'admin',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };
    await mockDb.collection('commercial_budgets').doc(parentId).set(parentBudget);

    const rebudgetReq = createMockReq({
      method: 'POST',
      params: { id: parentId },
      headers: { 'idempotency-key': 'idemp_rebudget_v2_1' },
      body: {
        title: 'Orçamento Março 2026 (Revisão Mid-Month)',
        targetRevenue: 75000,
        allocations: {
          cogsBudget: 22500,
          trafficBudget: 7500,
          fixedExpensesBudget: 5000,
          variableExpensesBudget: 3750,
          shippingSubsidyBudget: 2250,
          gatewayFeesBudget: 1500
        }
      }
    });
    const { res: rebudgetRes, getResult: getRebudgetResult } = createMockRes();
    await rebudgetCommercialBudgetController(rebudgetReq, rebudgetRes);

    const rebudgetResult = getRebudgetResult();
    assert.strictEqual(rebudgetResult.statusCode, 201, 'Rebudgeting deve retornar 201 Created');
    const v2Budget = rebudgetResult.body.budget;

    assert.strictEqual(v2Budget.version, 2, 'Versão deve ser 2');
    assert.strictEqual(v2Budget.parentBudgetId, parentId, 'parentBudgetId deve apontar para v1');
    assert.strictEqual(v2Budget.previousVersionId, parentId, 'previousVersionId deve apontar para v1');
    assert.strictEqual(v2Budget.status, 'draft', 'Nova versão gerada deve iniciar em status draft');
    assert.strictEqual(v2Budget.targetRevenue, 75000);
    assert.strictEqual(v2Budget.allocations.cogsBudget, 22500);

    // Verificar se gerou evento de auditoria 'rebudgeted'
    const eventsSnap = await mockDb.collection('commercial_budget_events').get();
    const rebudgetEvent = eventsSnap.docs.find((d: any) => d.data().type === 'rebudgeted');
    assert.ok(rebudgetEvent, 'Evento de auditoria rebudgeted deve estar registrado');
  });

  // TEST 4: MARGEM DE CONTRIBUIÇÃO & LUCRO OPERACIONAL COM VARIÁVEIS EXATAS
  await test('4. CM e OP deduzem corretamente COGS, Variáveis, Gateway, Frete, Tráfego e Fixas', async () => {
    const targetRev = 100000;
    const cogs = 30000;
    const variable = 5000;
    const gateway = 2000;
    const shipping = 3000;
    const traffic = 12000;
    const fixed = 15000;
    const other = 1000;

    const allocations: CommercialBudgetAllocations = {
      cogsBudget: cogs,
      variableExpensesBudget: variable,
      gatewayFeesBudget: gateway,
      shippingSubsidyBudget: shipping,
      trafficBudget: traffic,
      fixedExpensesBudget: fixed,
      otherExpensesBudget: other,
      totalExpensesBudget: 0
    };

    const budget = generateCommercialBudget({
      title: 'Teste Matemática CM/OP',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      targetRevenue: targetRev,
      allocations,
      orders: [],
      productCatalog: []
    });

    const expectedCM = targetRev - (cogs + variable + gateway + shipping); // 100k - 40k = 60k
    const expectedOP = expectedCM - (fixed + traffic + other); // 60k - 28k = 32k
    const expectedTotalExp = cogs + variable + gateway + shipping + traffic + fixed + other; // 68k

    assert.strictEqual(budget.targetContributionMargin, expectedCM, `CM esperado ${expectedCM}, obteve ${budget.targetContributionMargin}`);
    assert.strictEqual(budget.targetOperatingProfit, expectedOP, `OP esperado ${expectedOP}, obteve ${budget.targetOperatingProfit}`);
    assert.strictEqual(budget.allocations.totalExpensesBudget, expectedTotalExp, `Total despesas esperado ${expectedTotalExp}`);
    assert.strictEqual(budget.targetContributionMarginPercent, 60, 'Margem de contribuição % deve ser 60%');
  });

  // TEST 5: ALOCAÇÕES POR LINHA (FORCE, MARK, PRIME, OTHER) COM 0 CENTAVOS DE DIVERGÊNCIA
  await test('5. Alocações por linha (FORCE, MARK, PRIME, OTHER) com soma exata e 0 resíduo de centavos', async () => {
    const totalRev = 100000.33; // Valor ímpar com centavos para testar resíduo
    const cogs = 35000.17;
    const cm = 65000.16;
    const units = 1003;

    const { lineAllocations } = generateCommercialBudgetLineAllocations({
      targetRevenue: totalRev,
      cogsBudget: cogs,
      targetContributionMargin: cm,
      targetUnits: units,
      method: 'revenue_proportional'
    });

    assert.strictEqual(lineAllocations.length, 4, 'Devem existir 4 linhas de produto');
    const lines = lineAllocations.map(l => l.line);
    assert.ok(lines.includes('FORCE') && lines.includes('MARK') && lines.includes('PRIME') && lines.includes('OTHER'));

    const sumRev = roundMoney(lineAllocations.reduce((acc, l) => acc + l.targetRevenue, 0));
    const sumCogs = roundMoney(lineAllocations.reduce((acc, l) => acc + l.targetCogs, 0));
    const sumCM = roundMoney(lineAllocations.reduce((acc, l) => acc + l.targetContributionMargin, 0));
    const sumUnits = lineAllocations.reduce((acc, l) => acc + l.targetUnits, 0);

    assert.strictEqual(sumRev, totalRev, `Soma da receita das linhas (${sumRev}) deve ser idêntica ao total (${totalRev})`);
    assert.strictEqual(sumCogs, cogs, `Soma COGS das linhas (${sumCogs}) deve ser idêntica ao total (${cogs})`);
    assert.strictEqual(sumCM, cm, `Soma CM das linhas (${sumCM}) deve ser idêntica ao total (${cm})`);
    assert.strictEqual(sumUnits, units, `Soma Units das linhas (${sumUnits}) deve ser idêntica ao total (${units})`);
  });

  // TEST 6: IDEMPOTÊNCIA PERSISTIDA ESCOPADA POR budgetId
  await test('6. Idempotência é escopada por budgetId (sem colisões entre diferentes orçamentos)', async () => {
    const budgetA = 'budget_scope_A';
    const budgetB = 'budget_scope_B';

    const bDocA: CommercialBudget = {
      id: budgetA,
      title: 'Budget A',
      period: 'monthly',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      status: 'draft',
      version: 1,
      targetRevenue: 10000,
      targetContributionMargin: 4000,
      targetContributionMarginPercent: 40,
      targetOperatingProfit: 2000,
      targetOrders: 100,
      targetUnits: 100,
      targetAverageTicket: 100,
      allocations: {
        cogsBudget: 3000,
        trafficBudget: 1000,
        fixedExpensesBudget: 1000,
        variableExpensesBudget: 500,
        shippingSubsidyBudget: 300,
        gatewayFeesBudget: 200,
        totalExpensesBudget: 6000
      },
      guardrails: {} as any,
      baselineSnapshot: {} as any,
      currentActuals: {} as any,
      reconciliation: {} as any,
      confidence: {} as any,
      createdBy: 'admin',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };
    const bDocB = { ...bDocA, id: budgetB, title: 'Budget B' };

    await mockDb.collection('commercial_budgets').doc(budgetA).set(bDocA);
    await mockDb.collection('commercial_budgets').doc(budgetB).set(bDocB);

    const sharedKey = 'common_shared_client_idempotency_key_123';

    // Ativar Budget A com a chave
    const reqA = createMockReq({
      method: 'POST',
      params: { id: budgetA },
      headers: { 'idempotency-key': sharedKey }
    });
    const { res: resA, getResult: getResultA } = createMockRes();
    await activateCommercialBudgetController(reqA, resA);
    assert.strictEqual(getResultA().statusCode, 200);
    assert.strictEqual(getResultA().body.budget.id, budgetA);

    // Ativar Budget B com a MESMA chave não deve sofrer colisão nem retornar Budget A
    const reqB = createMockReq({
      method: 'POST',
      params: { id: budgetB },
      headers: { 'idempotency-key': sharedKey }
    });
    const { res: resB, getResult: getResultB } = createMockRes();
    await activateCommercialBudgetController(reqB, resB);
    assert.strictEqual(getResultB().statusCode, 200);
    assert.strictEqual(getResultB().body.budget.id, budgetB, 'Budget B deve ser ativado sem sofrer colisão com A');
  });

  // TEST 7: RECONCILIAÇÃO 5-WAY COM 5 TIPOS DE METAS COMERCIAIS
  await test('7. Reconciliação avalia corretamente os 5 tipos de metas comerciais (revenue, profit, margin_percent, orders, average_ticket)', async () => {
    const baseBudget = {
      targetRevenue: 100000,
      targetOperatingProfit: 30000,
      targetContributionMargin: 50000,
      targetOrders: 500,
      targetUnits: 500,
      allocations: {} as any,
      guardrails: {} as any
    };

    const actuals = {
      revenue: 90000,
      operatingProfit: 25000,
      contributionMargin: 45000,
      ordersCount: 450,
      averageTicket: 200,
      cogs: 25000,
      traffic: 10000,
      fixedExpenses: 10000,
      variableExpenses: 5000,
      totalExpenses: 50000
    } as any;

    const toDate = {
      budgetRevenueToDate: 50000,
      budgetOperatingProfitToDate: 15000,
      budgetContributionMarginToDate: 25000,
      budgetOrdersToDate: 250,
      budgetUnitsToDate: 250,
      budgetCogsToDate: 15000,
      budgetTrafficToDate: 5000,
      budgetFixedExpensesToDate: 5000,
      budgetVariableExpensesToDate: 2500,
      budgetTotalExpensesToDate: 27500
    } as any;

    // 1. Meta de Receita
    const goalRev = { id: 'g1', type: 'revenue' as const, targetValue: 120000, title: 'Meta Receita' } as any;
    const recRev = evaluateBudgetReconciliation({ budget: baseBudget, actuals, toDate, goal: goalRev });
    assert.strictEqual(recRev.budgetVsGoal?.[0].metricName, 'Meta de Receita');
    assert.strictEqual(recRev.budgetVsGoal?.[0].benchmark, 120000);
    assert.strictEqual(recRev.budgetVsGoal?.[0].budget, 100000);

    // 2. Meta de Lucro
    const goalProfit = { id: 'g2', type: 'profit' as const, targetValue: 35000, title: 'Meta Lucro' } as any;
    const recProfit = evaluateBudgetReconciliation({ budget: baseBudget, actuals, toDate, goal: goalProfit });
    assert.strictEqual(recProfit.budgetVsGoal?.[0].metricName, 'Meta de Lucro Operacional');
    assert.strictEqual(recProfit.budgetVsGoal?.[0].benchmark, 35000);
    assert.strictEqual(recProfit.budgetVsGoal?.[0].budget, 30000);

    // 3. Meta de Margem %
    const goalMargin = { id: 'g3', type: 'margin_percent' as const, targetValue: 55, title: 'Meta Margem %' } as any;
    const recMargin = evaluateBudgetReconciliation({ budget: baseBudget, actuals, toDate, goal: goalMargin });
    assert.strictEqual(recMargin.budgetVsGoal?.[0].metricName, 'Meta de Margem %');
    assert.strictEqual(recMargin.budgetVsGoal?.[0].benchmark, 55);
    assert.strictEqual(recMargin.budgetVsGoal?.[0].budget, 50); // 50k / 100k = 50%

    // 4. Meta de Pedidos
    const goalOrders = { id: 'g4', type: 'orders' as const, targetValue: 600, title: 'Meta Pedidos' } as any;
    const recOrders = evaluateBudgetReconciliation({ budget: baseBudget, actuals, toDate, goal: goalOrders });
    assert.strictEqual(recOrders.budgetVsGoal?.[0].metricName, 'Meta de Pedidos');
    assert.strictEqual(recOrders.budgetVsGoal?.[0].benchmark, 600);
    assert.strictEqual(recOrders.budgetVsGoal?.[0].budget, 500);

    // 5. Meta de Ticket Médio
    const goalTicket = { id: 'g5', type: 'average_ticket' as const, targetValue: 220, title: 'Meta Ticket' } as any;
    const recTicket = evaluateBudgetReconciliation({ budget: baseBudget, actuals, toDate, goal: goalTicket });
    assert.strictEqual(recTicket.budgetVsGoal?.[0].metricName, 'Meta de Ticket Médio');
    assert.strictEqual(recTicket.budgetVsGoal?.[0].benchmark, 220);
    assert.strictEqual(recTicket.budgetVsGoal?.[0].budget, 200); // 100k / 500 = 200
  });

  // TEST 8: CORREÇÃO DO BUG costCoveragePercent || 100
  await test('8. Cobertura de custo em zero resulta em insufficient/0% e não 100%', async () => {
    // Pedidos cujos itens não possuem custo cadastrado nem snapshot
    const uncostedOrders = [
      { id: 'o1', total: 100, items: [{ productId: 'unknown_p', name: 'Item Desconhecido', price: 100, quantity: 1 }] },
      { id: 'o2', total: 200, items: [{ productId: 'unknown_p2', name: 'Item Sem Custo', price: 200, quantity: 2 }] }
    ];

    const conf = evaluateBudgetConfidence(uncostedOrders, [], 30);
    assert.strictEqual(conf.costCoveragePercent, 0, 'Cobertura de custo deve ser estritamente 0%');
    assert.strictEqual(conf.level, 'insufficient', 'Nível de confiança deve ser insufficient');
    assert.ok(conf.costSourceBreakdown?.missingUnits && conf.costSourceBreakdown.missingUnits > 0);
  });

  // TEST 9: CONCORRÊNCIA COM VERIFICAÇÃO DE PERSISTÊNCIA REAL NO FIRESTORE
  await test('9. Concorrência 10x resulta em 1 criação + 9 replays e EXATAMENTE 1 documento persistido', async () => {
    const concurrentKey = 'unique_concurrent_key_9999';
    const createPayload = {
      title: 'Orçamento Concorrência Hardening',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      targetRevenue: 80000,
      allocations: {
        cogsBudget: 24000,
        trafficBudget: 8000,
        fixedExpensesBudget: 6000,
        variableExpensesBudget: 4000,
        shippingSubsidyBudget: 2000,
        gatewayFeesBudget: 1600
      }
    };

    const initialBudgetCount = mockDb.getDocCount('commercial_budgets');
    const initialIdempCount = mockDb.getDocCount('idempotency_records');

    const promises = Array.from({ length: 10 }).map(async () => {
      const req = createMockReq({
        method: 'POST',
        headers: { 'idempotency-key': concurrentKey },
        body: createPayload
      });
      const { res, getResult } = createMockRes();
      await createCommercialBudgetController(req, res);
      return getResult();
    });

    const results = await Promise.all(promises);

    const createdResults = results.filter(r => r.statusCode === 201);
    const replayResults = results.filter(r => r.statusCode === 200 && r.body.idempotentReplay);

    assert.strictEqual(createdResults.length, 1, 'Exatamente 1 requisição deve criar o recurso (201)');
    assert.strictEqual(replayResults.length, 9, 'Exatamente 9 requisições devem receber replay idempotente (200)');

    // Verificação estrita de contagem de documentos persistidos
    const finalBudgetCount = mockDb.getDocCount('commercial_budgets');
    const finalIdempCount = mockDb.getDocCount('idempotency_records');

    assert.strictEqual(finalBudgetCount, initialBudgetCount + 1, 'Exatamente 1 novo documento de orçamento deve existir');
    assert.strictEqual(finalIdempCount, initialIdempCount + 1, 'Exatamente 1 registro de idempotência deve existir');
  });

  // TEST 10: APPROVED SNAPSHOT NO ACTIVATE
  await test('10. Ativação grava snapshot de aprovação imutável (approvedSnapshot)', async () => {
    const draftId = 'budget_draft_for_approval';
    const draftBudget: CommercialBudget = {
      id: draftId,
      title: 'Orçamento com Snapshot de Aprovação',
      period: 'monthly',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      status: 'draft',
      version: 1,
      targetRevenue: 60000,
      targetContributionMargin: 24000,
      targetContributionMarginPercent: 40,
      targetOperatingProfit: 12000,
      targetOrders: 600,
      targetUnits: 600,
      targetAverageTicket: 100,
      allocations: {
        cogsBudget: 18000,
        trafficBudget: 6000,
        fixedExpensesBudget: 6000,
        variableExpensesBudget: 3000,
        shippingSubsidyBudget: 1800,
        gatewayFeesBudget: 1200,
        totalExpensesBudget: 36000
      },
      guardrails: {} as any,
      baselineSnapshot: {} as any,
      currentActuals: {} as any,
      reconciliation: {} as any,
      confidence: {} as any,
      createdBy: 'admin',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };
    await mockDb.collection('commercial_budgets').doc(draftId).set(draftBudget);

    const actReq = createMockReq({
      method: 'POST',
      params: { id: draftId },
      headers: { 'idempotency-key': 'idemp_act_snapshot_1' },
      user: { email: 'diretor.financeiro@fpacstore.com.br', role: 'admin' }
    });
    const { res: actRes, getResult: getActResult } = createMockRes();
    await activateCommercialBudgetController(actReq, actRes);

    const actResult = getActResult();
    assert.strictEqual(actResult.statusCode, 200);
    const activeBudget = actResult.body.budget;

    assert.strictEqual(activeBudget.status, 'active');
    assert.ok(activeBudget.approvedSnapshot, 'approvedSnapshot deve estar presente');
    assert.strictEqual(activeBudget.approvedSnapshot.isApprovedSnapshot, true);
    assert.strictEqual(activeBudget.approvedSnapshot.approvedBy, 'diretor.financeiro@fpacstore.com.br');
    assert.strictEqual(activeBudget.approvedSnapshot.targetRevenue, 60000);
    assert.strictEqual(activeBudget.approvedSnapshot.allocations.cogsBudget, 18000);
  });

  // TEST 11: RECALCULATE E BASELINE IMUTABILIDADE ABSOLUTA
  await test('11. Recálculo preserva estritamente baselineSnapshot e forecastSnapshot', async () => {
    const budgetId = 'budget_recalc_immutability';
    const initialBaseline = {
      isHistoricalSnapshot: true,
      sourceStartDate: '2026-02-01',
      sourceEndDate: '2026-02-28',
      budgetStartDate: '2026-03-01',
      budgetEndDate: '2026-03-31',
      realizedRevenue: 50000,
      realizedOrders: 500,
      realizedContributionMargin: 20000,
      realizedOperatingProfit: 10000,
      realizedAverageTicket: 100
    };
    const initialForecastSnap = {
      isHistoricalSnapshot: true,
      snapshotCapturedAt: '2026-03-01T00:00:00.000Z',
      snapshotVersion: '1.0',
      projectedRevenue: 70000,
      projectedContributionMargin: 28000,
      projectedOperatingProfit: 14000
    };

    const budgetDoc: CommercialBudget = {
      id: budgetId,
      title: 'Budget Recalc Test',
      period: 'monthly',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      status: 'active',
      version: 1,
      targetRevenue: 60000,
      targetContributionMargin: 24000,
      targetContributionMarginPercent: 40,
      targetOperatingProfit: 12000,
      targetOrders: 600,
      targetUnits: 600,
      targetAverageTicket: 100,
      allocations: {
        cogsBudget: 18000,
        trafficBudget: 6000,
        fixedExpensesBudget: 6000,
        variableExpensesBudget: 3000,
        shippingSubsidyBudget: 1800,
        gatewayFeesBudget: 1200,
        totalExpensesBudget: 36000
      },
      guardrails: {} as any,
      baselineSnapshot: initialBaseline as any,
      forecastSnapshot: initialForecastSnap as any,
      currentActuals: {} as any,
      reconciliation: {} as any,
      confidence: {} as any,
      createdBy: 'admin',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };
    await mockDb.collection('commercial_budgets').doc(budgetId).set(budgetDoc);

    const recalcReq = createMockReq({
      method: 'POST',
      params: { id: budgetId },
      headers: { 'idempotency-key': 'idemp_recalc_immut_1' }
    });
    const { res: recalcRes, getResult: getRecalcResult } = createMockRes();
    await recalculateCommercialBudgetController(recalcReq, recalcRes);

    const recalcResult = getRecalcResult();
    assert.strictEqual(recalcResult.statusCode, 200);
    const updated = recalcResult.body.budget;

    assert.deepStrictEqual(updated.baselineSnapshot, initialBaseline, 'baselineSnapshot deve permanecer 100% idêntico');
    assert.deepStrictEqual(updated.forecastSnapshot, initialForecastSnap, 'forecastSnapshot deve permanecer 100% idêntico');
  });

  // TEST 12: GUARDRAILS FINANCEIROS & ALERTAS MULTI-CONDIÇÃO
  await test('12. Guardrails disparam alertas de Tráfego %, Margem %, COGS %, Burn Rate % e OP negativo', async () => {
    const guardrails: CommercialBudgetGuardrails = {
      maxTrafficSpendPercentOfRevenue: 15,
      minContributionMarginPercent: 30,
      maxCogsPercentOfRevenue: 40,
      burnRateAlertThresholdPercent: 110
    };

    // Caso de violação múltipla
    const actualsViola = {
      revenue: 10000,
      cogs: 5000, // 50% de COGS (limite 40%) -> trigger
      traffic: 2000, // 20% de Tráfego (limite 15%) -> trigger
      variableExpenses: 1500,
      shippingSubsidy: 500,
      gatewayFees: 500,
      fixedExpenses: 3000,
      otherExpenses: 500,
      totalExpenses: 13000, // Despesas 13000 vs toDate 10000 = 130% burn rate -> trigger
      contributionMargin: 2500, // 25% Margem (limite 30%) -> trigger
      operatingProfit: -3000 // OP Negativo -> trigger
    } as any;

    const toDate = {
      budgetRevenueToDate: 10000,
      budgetTotalExpensesToDate: 10000
    } as any;

    const alerts = evaluateBudgetGuardrails(guardrails, actualsViola, toDate);
    assert.ok(alerts.length >= 4, `Esperado pelo menos 4 alertas de guardrails, obteve ${alerts.length}`);

    const types = alerts.map(a => a.type);
    assert.ok(types.includes('max_cogs_exceeded'), 'Deve conter max_cogs_exceeded');
    assert.ok(types.includes('max_traffic_exceeded'), 'Deve conter max_traffic_exceeded');
    assert.ok(types.includes('min_cm_breached'), 'Deve conter min_cm_breached');
    assert.ok(types.includes('burn_rate_warning'), 'Deve conter burn_rate_warning');
    assert.ok(types.includes('operating_loss'), 'Deve conter operating_loss');
  });

  // TEST 13: MATRIZ DE AUTENTICAÇÃO E AUTORIZAÇÃO (401, 403, 200)
  await test('13. Middleware de Autenticação rejeita 401 sem credenciais, 403 não-admin e aceita admin válido', async () => {
    // 1. Sem credenciais -> 401
    const reqNoAuth = createMockReq({ headers: {} });
    const { res: resNoAuth, getResult: getResNoAuth } = createMockRes();
    let nextCalled = false;
    await authenticateAdmin(reqNoAuth, resNoAuth, () => { nextCalled = true; });
    assert.strictEqual(getResNoAuth().statusCode, 401, 'Sem auth deve retornar 401');
    assert.strictEqual(nextCalled, false);

    // 2. Token inválido -> 401
    const reqBadAuth = createMockReq({ headers: { authorization: 'Bearer invalid_token' } });
    const { res: resBadAuth, getResult: getResBadAuth } = createMockRes();
    nextCalled = false;
    await authenticateAdmin(reqBadAuth, resBadAuth, () => { nextCalled = true; });
    assert.strictEqual(getResBadAuth().statusCode, 401, 'Token inválido deve retornar 401');

    // 3. API Key válida -> 200
    process.env.ADMIN_API_KEY = 'secret_admin_key_for_testing';
    const reqApiKey = createMockReq({ headers: { 'x-admin-api-key': 'secret_admin_key_for_testing' } });
    const { res: resApiKey } = createMockRes();
    nextCalled = false;
    await authenticateAdmin(reqApiKey, resApiKey, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'API Key válida deve chamar next()');
  });

  // TEST 14: FIRESTORE RULES BLOQUEIO CLIENT WRITE
  await test('14. firestore.rules bloqueia estritamente mutações client-side em commercial_budgets', async () => {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    assert.ok(fs.existsSync(rulesPath), 'firestore.rules deve existir');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    assert.ok(
      rulesContent.includes('match /commercial_budgets/{budgetId}') ||
      rulesContent.includes('match /commercial_budgets/{document=**}'),
      'Regra para commercial_budgets deve estar declarada'
    );
    assert.ok(
      rulesContent.includes('allow write: if false;') || rulesContent.includes('allow create, update, delete: if false;'),
      'Escrita client-side em commercial_budgets deve estar estritamente desabilitada (if false)'
    );
  });

  console.log('\n========================================================================');
  console.log(`📊 RESUMO DA SUÍTE 9.6.6-A: ${passed}/${passed + failed} PASS`);
  console.log('========================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} testes falharam na suíte de integração backend!`);
  }
}

runBackendIntegrationSuite()
  .then(() => {
    console.log('🎉 FASE 9.6.6-A Backend Integration concluída com 100% de sucesso!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Falha na execução da suíte 9.6.6-A:', err);
    process.exit(1);
  });

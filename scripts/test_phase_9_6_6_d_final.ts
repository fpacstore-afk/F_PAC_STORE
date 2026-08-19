/**
 * SUÍTE DE TESTES E CERTIFICAÇÃO DEFINITIVA — FASE 9.6.6-D
 *
 * Validação rigorosa dos bloqueios finais:
 * 1. Fingerprint Recursivo Canônico & Independência de Ordem
 * 2. Idempotency Mismatch Nested (409 IDEMPOTENCY_KEY_REUSE_MISMATCH)
 * 3. 5 Goals Regression (Preservação de 5 metas antes e após Recalculate)
 * 4. Administrative Variable Expense & Full Financial Zero Variance
 * 5. Concorrência 10x Promise.all com a MESMA Chave de Idempotência e Contagem de Persistência
 * 6. Auth Stack Real (401, 401 inválido, 403 customer, 200 admin, 200 API Key)
 * 7. Create Commercial Budget com Manual Line Allocation End-to-End
 */

import crypto from 'crypto';
import {
  generateCommercialBudget,
  buildBudgetBaselineSnapshot,
  calculateBudgetCurrentActuals,
  evaluateBudgetConfidence,
  recalculateCommercialBudgetActuals,
  createApprovedBudgetSnapshot,
  createRebudgetVersion,
  generateCommercialBudgetLineAllocations,
  normalizeBudgetAllocations,
  calculateOperatingResult,
  evaluateBudgetReconciliation
} from '../src/utils/commercialBudget.js';

import {
  setCommercialBudgetDb,
  computePayloadFingerprint,
  stableCanonicalize,
  createCommercialBudgetController,
  updateCommercialBudgetController,
  activateCommercialBudgetController,
  rebudgetCommercialBudgetController,
  recalculateCommercialBudgetController,
  archiveCommercialBudgetController,
  getCommercialBudgetsController,
  getCommercialBudgetByIdController
} from '../server/controllers/commercialBudget.controller.js';

import {
  authenticateAdmin,
  setAuthTokenVerifierForTesting,
  setAuthDbForTesting,
  resetAuthForTesting
} from '../server/middleware/auth.middleware.js';

import { CommercialGoal } from '../src/types/commercialGovernance.js';
import { CommercialBudgetLineAllocation } from '../src/types/commercialBudget.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// -------------------------------------------------------------
// Mock Firestore com suporte a Transaction, Where, Get, Set, Update
// -------------------------------------------------------------
class MockFirestore {
  data: Record<string, Record<string, any>> = {};
  private txnQueue: Promise<void> = Promise.resolve();

  collection(name: string) {
    if (!this.data[name]) {
      this.data[name] = {};
    }
    const colData = this.data[name];

    const colObj: any = {
      doc: (id?: string) => {
        const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        return {
          id: docId,
          get: async () => ({
            id: docId,
            exists: !!colData[docId],
            data: () => colData[docId]
          }),
          set: async (docData: any, opts?: any) => {
            if (opts && opts.merge && colData[docId]) {
              colData[docId] = { ...colData[docId], ...docData };
            } else {
              colData[docId] = { ...docData };
            }
          },
          update: async (patch: any) => {
            if (!colData[docId]) throw new Error(`Doc ${docId} not found`);
            colData[docId] = { ...colData[docId], ...patch };
          },
          collection: (subName: string) => this.collection(`${name}/${docId}/${subName}`)
        };
      },
      add: async (docData: any) => {
        const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        colData[id] = { ...docData, id };
        return { id };
      },
      where: (field: string, op: string, val: any) => {
        const filterFn = (item: any) => {
          const itemVal = item[field];
          if (op === '==') return itemVal === val;
          if (op === '>=') return itemVal >= val;
          if (op === '<=') return itemVal <= val;
          if (op === '>') return itemVal > val;
          if (op === '<') return itemVal < val;
          return true;
        };
        return {
          where: (f2: string, op2: string, val2: any) => ({
            orderBy: () => ({
              get: async () => ({
                empty: false,
                docs: Object.keys(colData)
                  .map(k => ({ id: k, data: () => colData[k] }))
                  .filter(d => filterFn(d.data()) && (op2 === '==' ? d.data()[f2] === val2 : true))
              })
            }),
            get: async () => ({
              empty: false,
              docs: Object.keys(colData)
                .map(k => ({ id: k, data: () => colData[k] }))
                .filter(d => filterFn(d.data()) && (op2 === '==' ? d.data()[f2] === val2 : true))
            })
          }),
          orderBy: () => ({
            get: async () => ({
              empty: false,
              docs: Object.keys(colData)
                .map(k => ({ id: k, data: () => colData[k] }))
                .filter(d => filterFn(d.data()))
            })
          }),
          get: async () => ({
            empty: false,
            docs: Object.keys(colData)
              .map(k => ({ id: k, data: () => colData[k] }))
              .filter(d => filterFn(d.data()))
          })
        };
      },
      get: async () => ({
        empty: Object.keys(colData).length === 0,
        docs: Object.keys(colData).map(k => ({
          id: k,
          data: () => colData[k]
        }))
      })
    };
    return colObj;
  }

  async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
    const run = async () => {
      const txn = {
        get: async (docRef: any) => docRef.get(),
        set: async (docRef: any, data: any, opts?: any) => docRef.set(data, opts),
        update: async (docRef: any, patch: any) => docRef.update(patch),
        delete: async (docRef: any) => {}
      };
      return updateFunction(txn);
    };

    const res = this.txnQueue.then(run);
    this.txnQueue = res.then(() => {}, () => {});
    return res;
  }
}

function createMockReq(body: any = {}, params: any = {}, query: any = {}, headers: any = {}, user: any = { uid: 'usr_admin', email: 'admin@fpacstore.com', role: 'admin' }) {
  return {
    body,
    params,
    query,
    headers: { ...headers },
    header: (name: string) => headers[name.toLowerCase()] || headers[name],
    get: (name: string) => headers[name.toLowerCase()] || headers[name],
    user,
    adminUser: user && user.role === 'admin' ? user : undefined
  } as any;
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    }
  };
  return res;
}

async function runSuite() {
  console.log('🚀 INICIANDO SUÍTE DE TESTES E CERTIFICAÇÃO DEFINITIVA — FASE 9.6.6-D\n');

  // =========================================================================
  // 1. RECURSIVE FINGERPRINT NESTED & INDEPENDÊNCIA DE ORDEM
  // =========================================================================
  console.log('🔹 1. Validando Fingerprint Recursivo Canônico...');
  {
    const payloadA = {
      targetRevenue: 100000,
      allocations: {
        cogsBudget: 40000,
        trafficBudget: 15000,
        fixedExpensesBudget: 10000
      },
      guardrails: {
        maxCogsPercentOfRevenue: 40
      }
    };

    const payloadB = {
      targetRevenue: 100000,
      allocations: {
        cogsBudget: 80000, // Diferença nested
        trafficBudget: 15000,
        fixedExpensesBudget: 10000
      },
      guardrails: {
        maxCogsPercentOfRevenue: 40
      }
    };

    const payloadC = {
      guardrails: {
        maxCogsPercentOfRevenue: 60 // Diferença em guardrails
      },
      allocations: {
        fixedExpensesBudget: 10000,
        trafficBudget: 15000,
        cogsBudget: 40000
      },
      targetRevenue: 100000
    };

    const payloadA_Reordered = {
      guardrails: {
        maxCogsPercentOfRevenue: 40
      },
      targetRevenue: 100000,
      allocations: {
        fixedExpensesBudget: 10000,
        trafficBudget: 15000,
        cogsBudget: 40000
      },
      idempotencyKey: 'some-key-that-must-be-ignored'
    };

    const fpA = computePayloadFingerprint(payloadA);
    const fpB = computePayloadFingerprint(payloadB);
    const fpC = computePayloadFingerprint(payloadC);
    const fpA_Reordered = computePayloadFingerprint(payloadA_Reordered);

    assert(fpA !== fpB, 'Fingerprint A e B devem ser diferentes quando allocations.cogsBudget difere');
    assert(fpA !== fpC, 'Fingerprint A e C devem ser diferentes quando guardrails.maxCogsPercent difere');
    assert(fpA === fpA_Reordered, 'Fingerprint A e A_Reordered devem ser exatamente iguais independente da ordem de chaves ou idempotencyKey');
    console.log('  ✅ Fingerprint recursivo canônico e independência de ordem validados com sucesso.');
  }

  // =========================================================================
  // 2. IDEMPOTENCY MISMATCH NESTED (409)
  // =========================================================================
  console.log('\n🔹 2. Validando Idempotency Mismatch em Níveis Aninhados (409)...');
  {
    const mockDb = new MockFirestore();
    setCommercialBudgetDb(mockDb as any);

    // Criação inicial
    const createReq = createMockReq({
      title: 'Orçamento Base Idempotency',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      targetRevenue: 100000,
      allocations: {
        cogsBudget: 40000,
        trafficBudget: 15000,
        fixedExpensesBudget: 10000,
        totalExpensesBudget: 65000
      },
      idempotencyKey: 'key_seed_mismatch_budget'
    });
    const createRes = createMockRes();
    await createCommercialBudgetController(createReq, createRes);
    assert(createRes.statusCode === 201, 'Criação do budget para teste de mismatch deve retornar 201');
    const budgetId = (createRes.body.budget || createRes.body.data).id;

    // PATCH 1 com chave idempotency 'key_nested_mismatch_1'
    const patchReq1 = createMockReq(
      {
        allocations: {
          cogsBudget: 40000,
          trafficBudget: 15000,
          fixedExpensesBudget: 10000,
          totalExpensesBudget: 65000
        },
        idempotencyKey: 'key_nested_mismatch_1'
      },
      { id: budgetId }
    );
    const patchRes1 = createMockRes();
    await updateCommercialBudgetController(patchReq1, patchRes1);
    assert(patchRes1.statusCode === 200, 'Primeiro PATCH deve retornar 200');

    // PATCH 2 com MESMA chave mas allocations.cogsBudget = 80000 (Divergente)
    const patchReq2 = createMockReq(
      {
        allocations: {
          cogsBudget: 80000, // Divergência nested
          trafficBudget: 15000,
          fixedExpensesBudget: 10000,
          totalExpensesBudget: 105000
        },
        idempotencyKey: 'key_nested_mismatch_1'
      },
      { id: budgetId }
    );
    const patchRes2 = createMockRes();
    await updateCommercialBudgetController(patchReq2, patchRes2);
    assert(patchRes2.statusCode === 409, `Reuso de chave com payload aninhado divergente deve retornar 409. Obteve ${patchRes2.statusCode}`);
    assert(patchRes2.body.code === 'IDEMPOTENCY_KEY_REUSE_MISMATCH', 'Código retornado deve ser IDEMPOTENCY_KEY_REUSE_MISMATCH');

    // Teste também com Guardrails nested mismatch
    const patchReq3 = createMockReq(
      {
        guardrails: {
          maxCogsPercentOfRevenue: 40
        },
        idempotencyKey: 'key_guardrail_mismatch_1'
      },
      { id: budgetId }
    );
    const patchRes3 = createMockRes();
    await updateCommercialBudgetController(patchReq3, patchRes3);
    assert(patchRes3.statusCode === 200, 'Primeiro PATCH guardrails deve retornar 200');

    const patchReq4 = createMockReq(
      {
        guardrails: {
          maxCogsPercentOfRevenue: 60 // Divergência
        },
        idempotencyKey: 'key_guardrail_mismatch_1'
      },
      { id: budgetId }
    );
    const patchRes4 = createMockRes();
    await updateCommercialBudgetController(patchReq4, patchRes4);
    assert(patchRes4.statusCode === 409, `Guardrails mismatch deve retornar 409. Obteve ${patchRes4.statusCode}`);
    console.log('  ✅ Detecção de divergência de payload aninhado com 409 validada.');
  }

  // =========================================================================
  // 3. 5 GOALS REGRESSION (BEFORE & AFTER RECALCULATE)
  // =========================================================================
  console.log('\n🔹 3. Validando 5 Goals Regression (CREATE e RECALCULATE)...');
  {
    const mockDb = new MockFirestore();
    setCommercialBudgetDb(mockDb as any);

    const goals: CommercialGoal[] = [
      { id: 'goal_rev', title: 'Meta Receita', type: 'revenue', targetValue: 100000, period: 'quarterly', startDate: '2026-10-01', endDate: '2026-12-31', status: 'active', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', createdBy: 'admin' },
      { id: 'goal_op', title: 'Meta Lucro Op', type: 'operating_profit', targetValue: 20000, period: 'quarterly', startDate: '2026-10-01', endDate: '2026-12-31', status: 'active', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', createdBy: 'admin' },
      { id: 'goal_cm', title: 'Meta Margem Contrib', type: 'contribution_margin', targetValue: 40000, period: 'quarterly', startDate: '2026-10-01', endDate: '2026-12-31', status: 'active', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', createdBy: 'admin' },
      { id: 'goal_units', title: 'Meta Unidades', type: 'units', targetValue: 1000, period: 'quarterly', startDate: '2026-10-01', endDate: '2026-12-31', status: 'active', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', createdBy: 'admin' },
      { id: 'goal_ticket', title: 'Meta Ticket Médio', type: 'average_ticket', targetValue: 100, period: 'quarterly', startDate: '2026-10-01', endDate: '2026-12-31', status: 'active', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', createdBy: 'admin' }
    ];

    // Seed goals in mockDb
    for (const g of goals) {
      await mockDb.collection('commercial_goals').doc(g.id).set(g);
    }

    const budget = generateCommercialBudget({
      title: 'Orçamento 5 Goals',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      targetRevenue: 100000,
      allocations: {
        cogsBudget: 40000,
        trafficBudget: 15000,
        fixedExpensesBudget: 10000,
        administrativeVariableExpensesBudget: 5000,
        totalExpensesBudget: 70000
      },
      linkedGoalIds: goals.map(g => g.id),
      goals: goals,
      orders: [],
      productCatalog: []
    });

    assert(budget.reconciliation.budgetVsGoal !== undefined, 'budgetVsGoal deve existir');
    assert(budget.reconciliation.budgetVsGoal.length === 5, `Antes de recalculate: esperado 5 metas comparadas. Obteve ${budget.reconciliation.budgetVsGoal.length}`);

    // Executa Recalculate com os 5 goals repassados
    const recalculated = recalculateCommercialBudgetActuals(budget, {
      orders: [],
      productCatalog: [],
      goals: goals
    });

    assert(recalculated.reconciliation.budgetVsGoal !== undefined, 'budgetVsGoal deve existir após recalculate');
    assert(recalculated.reconciliation.budgetVsGoal.length === 5, `Após recalculate: esperado 5 metas comparadas. Obteve ${recalculated.reconciliation.budgetVsGoal.length}`);

    // Testa controller de Recalculate
    await mockDb.collection('commercial_budgets').doc(budget.id).set(budget);
    const recalcReq = createMockReq({ idempotencyKey: 'recalc_5goals_test' }, { id: budget.id });
    const recalcRes = createMockRes();
    await recalculateCommercialBudgetController(recalcReq, recalcRes);
    assert(recalcRes.statusCode === 200, 'Controller de recalculate deve retornar 200');
    const recalcBudget = recalcRes.body.budget || recalcRes.body.data;
    assert(recalcBudget.reconciliation.budgetVsGoal.length === 5, `Controller recalculate deve preservar as 5 metas. Obteve ${recalcBudget.reconciliation.budgetVsGoal.length}`);
    console.log('  ✅ 5 Goals regression validada: exatamente 5 comparações antes e após recalculate.');
  }

  // =========================================================================
  // 4. ADMIN VARIABLE & FULL FINANCIAL ZERO VARIANCE
  // =========================================================================
  console.log('\n🔹 4. Validando Zero Variance Real e Despesas Variáveis Administrativas...');
  {
    // Budget:
    // Revenue: 10000
    // COGS: 4000
    // Gateway: 300
    // Shipping Subsidy: 200
    // Order Other Variable: 100
    // Admin Variable: 400
    // Fixed: 1000
    // Marketing: 500
    // Other: 100
    // Total Expenses: 6600
    // CM: 10000 - 4000 - 300 - 200 - 100 = 5400
    // OP: 5400 - 400 - 1000 - 500 - 100 = 3400

    const mockCatalog = [{ id: 'prod_1', sku: 'SKU_1', name: 'FORCE Item', unitCost: 40 }];
    const mockOrders = [
      {
        id: 'ord_1',
        created_at: '2026-10-15T12:00:00Z',
        status: 'approved',
        paymentStatus: 'approved',
        total: 10000,
        subtotal: 10000,
        discount: 0,
        payment: {
          status: 'approved',
          paidAmount: 10000,
          gatewayFee: 300
        },
        shippingFinances: {
          shippingCost: 200,
          shippingCharged: 0
        },
        shippingCost: 200,
        items: [{ sku: 'SKU_1', name: 'FORCE Item', quantity: 100, price: 100, cost: 40 }]
      }
    ];

    const mockExpenses = [
      { id: 'exp_fix', date: '2026-10-15', amount: 1000, category: 'aluguel', type: 'fixed' },
      { id: 'exp_adm_var', date: '2026-10-15', amount: 400, category: 'impostos', type: 'variable' },
      { id: 'exp_oth', date: '2026-10-15', amount: 100, category: 'outros', type: 'other' }
    ];

    const mockTraffic = [
      { id: 'traf_1', date: '2026-10-15', amountSpent: 500, amount: 500, spend: 500 }
    ];

    const actuals = calculateBudgetCurrentActuals({
      orders: mockOrders,
      expenses: mockExpenses,
      traffic: mockTraffic,
      productCatalog: mockCatalog,
      budgetStartDate: '2026-10-01',
      budgetEndDate: '2026-10-31',
      asOfDate: '2026-10-31' // 100% transcorrido (to-date = total)
    });

    assert(actuals.revenue === 10000, `Receita realizada esperada 10000. Obteve ${actuals.revenue}`);
    assert(actuals.cogs === 4000, `COGS realizado esperado 4000. Obteve ${actuals.cogs}`);
    assert(actuals.gatewayFees === 300, `Gateway realizado esperado 300. Obteve ${actuals.gatewayFees}`);
    assert(actuals.shippingSubsidy === 200, `Shipping realizado esperado 200. Obteve ${actuals.shippingSubsidy}`);
    assert(actuals.administrativeVariableExpenses === 400, `Admin variable realizado esperado 400. Obteve ${actuals.administrativeVariableExpenses}`);
    assert(actuals.fixedExpenses === 1000, `Fixed realizado esperado 1000. Obteve ${actuals.fixedExpenses}`);
    assert(actuals.trafficExpenses === 500, `Traffic realizado esperado 500. Obteve ${actuals.trafficExpenses}`);
    assert(actuals.contributionMargin === 5500, `CM realizada esperada 5500 (10000-4000-300-200). Obteve ${actuals.contributionMargin}`);
    assert(actuals.operatingProfit === 3500, `OP realizado esperado 3500 (5500-400-1000-500-100). Obteve ${actuals.operatingProfit}`);

    const reconciliation = evaluateBudgetReconciliation({
      budget: {
        targetRevenue: 10000,
        targetOperatingProfit: 3500,
        targetContributionMargin: 5500,
        targetOrders: 1,
        targetUnits: 100,
        targetAverageTicket: 10000,
        allocations: {
          cogsBudget: 4000,
          gatewayFeesBudget: 300,
          shippingSubsidyBudget: 200,
          administrativeVariableExpensesBudget: 400,
          fixedExpensesBudget: 1000,
          trafficBudget: 500,
          otherExpensesBudget: 100,
          totalExpensesBudget: 6500
        },
        guardrails: {
          maxTrafficSpendPercentOfRevenue: 15,
          minContributionMarginPercent: 30,
          maxCogsPercentOfRevenue: 40,
          burnRateAlertThresholdPercent: 110
        }
      },
      actuals,
      toDate: {
        daysElapsed: 31,
        totalDays: 31,
        elapsedRatio: 100,
        revenueToDate: 10000,
        cogsToDate: 4000,
        gatewayFeesToDate: 300,
        shippingSubsidyToDate: 200,
        variableExpensesToDate: 400,
        fixedExpensesToDate: 1000,
        trafficToDate: 500,
        totalExpensesToDate: 6500,
        contributionMarginToDate: 5500,
        operatingProfitToDate: 3500,
        ordersToDate: 1,
        unitsToDate: 100
      },
      confidence: {
        level: 'high',
        score: 100,
        sampleSize: 1,
        costCoveragePercent: 100,
        timeHorizonDays: 31,
        reasons: []
      }
    });

    assert(reconciliation.revenueVariance.variancePercent === 0, `Revenue variance deve ser 0%. Obteve ${reconciliation.revenueVariance.variancePercent}%`);
    assert(reconciliation.cogsVariance.variancePercent === 0, `COGS variance deve ser 0%. Obteve ${reconciliation.cogsVariance.variancePercent}%`);
    assert(reconciliation.variableExpensesVariance.variancePercent === 0, `Admin variable expense variance deve ser 0%. Obteve ${reconciliation.variableExpensesVariance.variancePercent}%`);
    assert(reconciliation.fixedExpensesVariance.variancePercent === 0, `Fixed expense variance deve ser 0%. Obteve ${reconciliation.fixedExpensesVariance.variancePercent}%`);
    assert(reconciliation.trafficVariance.variancePercent === 0, `Traffic variance deve ser 0%. Obteve ${reconciliation.trafficVariance.variancePercent}%`);
    assert(reconciliation.contributionMarginVariance.variancePercent === 0, `CM variance deve ser 0%. Obteve ${reconciliation.contributionMarginVariance.variancePercent}%`);
    assert(reconciliation.operatingProfitVariance.variancePercent === 0, `OP variance deve ser 0%. Obteve ${reconciliation.operatingProfitVariance.variancePercent}%`);
    console.log('  ✅ Zero variance financeira real confirmada: nenhuma divergência espúria de despesa variável.');
  }

  // =========================================================================
  // 5. CONCURRENCY — MESMA KEY 10X EM TODOS OS 6 ENDPOINTS & CONTAGEM DE PERSISTÊNCIA
  // =========================================================================
  console.log('\n🔹 5. Validando Concorrência 10x com MESMA chave de idempotência e contagem de persistência...');
  {
    const mockDb = new MockFirestore();
    setCommercialBudgetDb(mockDb as any);

    // 5.1 CREATE (10x mesma key)
    const createPayload = {
      title: 'Orçamento Concorrência Mesma Key',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      targetRevenue: 100000,
      allocations: {
        cogsBudget: 40000,
        trafficBudget: 15000,
        fixedExpensesBudget: 10000,
        totalExpensesBudget: 65000
      },
      idempotencyKey: 'same_key_create_100'
    };

    const createResponses = await Promise.all(
      Array.from({ length: 10 }).map(() => {
        const req = createMockReq(createPayload);
        const res = createMockRes();
        return createCommercialBudgetController(req, res).then(() => res);
      })
    );

    // 1 deve retornar 201 (criação) e 9 devem retornar 200 (replay idempotente)
    const count201 = createResponses.filter(r => r.statusCode === 201).length;
    const count200 = createResponses.filter(r => r.statusCode === 200).length;
    assert(count201 === 1, `Esperado exatamente 1 resposta 201 na criação concorrente. Obteve ${count201}`);
    assert(count200 === 9, `Esperado 9 respostas 200 (replay idempotente). Obteve ${count200}`);
    const budgetId = (createResponses[0].body.budget || createResponses[0].body.data).id;

    // Verificar persistência no mockDb:
    const budgetsCount = Object.keys(mockDb.data['commercial_budgets'] || {}).length;
    const eventsCreateCount = Object.values(mockDb.data['commercial_budget_events'] || {}).filter(e => e.type === 'created' || e.eventType === 'created').length;
    const idempRecordsCount = Object.keys(mockDb.data['idempotency_records'] || mockDb.data['commercial_budget_idempotency'] || {}).length;

    assert(budgetsCount === 1, `Esperado exatamente 1 budget criado. Encontrado: ${budgetsCount}`);
    assert(eventsCreateCount === 1, `Esperado exatamente 1 evento 'created'. Encontrado: ${eventsCreateCount}`);
    assert(idempRecordsCount === 1, `Esperado exatamente 1 registro de idempotência. Encontrado: ${idempRecordsCount}`);

    // 5.2 PATCH (10x mesma key)
    const patchPayload = {
      title: 'Orçamento Concorrência Mesma Key (Atualizado)',
      idempotencyKey: 'same_key_patch_100'
    };
    const patchResponses = await Promise.all(
      Array.from({ length: 10 }).map(() => {
        const req = createMockReq(patchPayload, { id: budgetId });
        const res = createMockRes();
        return updateCommercialBudgetController(req, res).then(() => res);
      })
    );
    patchResponses.forEach((res, i) => {
      assert(res.statusCode === 200, `Patch call ${i} deve retornar 200. Obteve ${res.statusCode}`);
    });
    const eventsUpdateCount = Object.values(mockDb.data['commercial_budget_events'] || {}).filter(e => e.type === 'updated' || e.eventType === 'updated').length;
    assert(eventsUpdateCount === 1, `Esperado exatamente 1 evento 'updated'. Encontrado: ${eventsUpdateCount}`);

    // 5.3 ACTIVATE (10x mesma key)
    const activatePayload = {
      idempotencyKey: 'same_key_activate_100'
    };
    const activateResponses = await Promise.all(
      Array.from({ length: 10 }).map(() => {
        const req = createMockReq(activatePayload, { id: budgetId });
        const res = createMockRes();
        return activateCommercialBudgetController(req, res).then(() => res);
      })
    );
    activateResponses.forEach((res, i) => {
      assert(res.statusCode === 200, `Activate call ${i} deve retornar 200. Obteve ${res.statusCode}`);
    });
    const eventsActivateCount = Object.values(mockDb.data['commercial_budget_events'] || {}).filter(e => e.type === 'activated' || e.eventType === 'activated').length;
    assert(eventsActivateCount === 1, `Esperado exatamente 1 evento 'activated'. Encontrado: ${eventsActivateCount}`);
    const budgetAfterActivate = mockDb.data['commercial_budgets'][budgetId];
    assert(budgetAfterActivate.status === 'active', 'Status deve ser active');
    assert(budgetAfterActivate.approvedSnapshot !== undefined, 'approvedSnapshot deve ter sido criado');

    // 5.4 RECALCULATE (10x mesma key)
    const recalcPayload = {
      idempotencyKey: 'same_key_recalc_100'
    };
    const recalcResponses = await Promise.all(
      Array.from({ length: 10 }).map(() => {
        const req = createMockReq(recalcPayload, { id: budgetId });
        const res = createMockRes();
        return recalculateCommercialBudgetController(req, res).then(() => res);
      })
    );
    recalcResponses.forEach((res, i) => {
      assert(res.statusCode === 200, `Recalculate call ${i} deve retornar 200. Obteve ${res.statusCode}`);
    });
    const eventsRecalcCount = Object.values(mockDb.data['commercial_budget_events'] || {}).filter(e => e.type === 'recalculated' || e.eventType === 'recalculated').length;
    assert(eventsRecalcCount === 1, `Esperado exatamente 1 evento 'recalculated'. Encontrado: ${eventsRecalcCount}`);

    // 5.5 REBUDGET (10x mesma key)
    const rebudgetPayload = {
      targetRevenue: 120000,
      allocations: {
        cogsBudget: 48000,
        trafficBudget: 18000,
        fixedExpensesBudget: 10000,
        totalExpensesBudget: 76000
      },
      idempotencyKey: 'same_key_rebudget_100'
    };
    const rebudgetResponses = await Promise.all(
      Array.from({ length: 10 }).map(() => {
        const req = createMockReq(rebudgetPayload, { id: budgetId });
        const res = createMockRes();
        return rebudgetCommercialBudgetController(req, res).then(() => res);
      })
    );
    // Todas as 10 retornam 201, sendo 1 execução inicial e 9 replays idempotentes
    rebudgetResponses.forEach((res, i) => {
      assert(res.statusCode === 201, `Rebudget call ${i} deve retornar 201. Obteve ${res.statusCode}`);
    });
    const replayCount = rebudgetResponses.filter(r => r.body.idempotentReplay === true).length;
    assert(replayCount === 9, `Esperado 9 respostas com idempotentReplay: true. Obteve ${replayCount}`);
    const eventsRebudgetCount = Object.values(mockDb.data['commercial_budget_events'] || {}).filter(e => e.type === 'rebudgeted' || e.eventType === 'rebudgeted').length;
    assert(eventsRebudgetCount === 1, `Esperado exatamente 1 evento 'rebudgeted'. Encontrado: ${eventsRebudgetCount}`);
    const budgetsCountAfterRebudget = Object.keys(mockDb.data['commercial_budgets'] || {}).length;
    assert(budgetsCountAfterRebudget === 2, `Esperado exatamente 2 budgets no total (original + 1 nova versão). Encontrado: ${budgetsCountAfterRebudget}`);

    // 5.6 ARCHIVE (10x mesma key)
    const archivePayload = {
      idempotencyKey: 'same_key_archive_100'
    };
    const archiveResponses = await Promise.all(
      Array.from({ length: 10 }).map(() => {
        const req = createMockReq(archivePayload, { id: budgetId });
        const res = createMockRes();
        return archiveCommercialBudgetController(req, res).then(() => res);
      })
    );
    archiveResponses.forEach((res, i) => {
      assert(res.statusCode === 200, `Archive call ${i} deve retornar 200. Obteve ${res.statusCode}`);
    });
    const eventsArchiveCount = Object.values(mockDb.data['commercial_budget_events'] || {}).filter(e => e.type === 'archived' || e.eventType === 'archived').length;
    assert(eventsArchiveCount === 1, `Esperado exatamente 1 evento 'archived'. Encontrado: ${eventsArchiveCount}`);
    const budgetAfterArchive = mockDb.data['commercial_budgets'][budgetId];
    assert(budgetAfterArchive.status === 'archived', 'Status final deve ser archived');

    console.log('  ✅ Concorrência 10x com mesma chave de idempotência validada em todos os 6 endpoints: exatamente 1 mutação persistida e 9 replays por operação.');
  }

  // =========================================================================
  // 6. AUTH STACK REAL (authenticateAdmin com Verifier / Firestore)
  // =========================================================================
  console.log('\n🔹 6. Validando Auth Stack Real (authenticateAdmin)...');
  {
    const authDb = new MockFirestore();
    setAuthDbForTesting(authDb as any);

    // Configura o token verifier de teste
    setAuthTokenVerifierForTesting(async (token: string): Promise<any> => {
      if (token === 'token_customer_user') {
        return { uid: 'user_cust_123', email: 'customer@fpacstore.com' };
      }
      if (token === 'token_admin_user') {
        return { uid: 'user_adm_123', email: 'admin@fpacstore.com', admin: true };
      }
      throw new Error('Invalid Firebase Token');
    });

    // Caso 1: Sem credenciais -> 401
    const req1 = createMockReq({}, {}, {}, {});
    const res1 = createMockRes();
    let next1Called = false;
    await authenticateAdmin(req1, res1, () => { next1Called = true; });
    assert(res1.statusCode === 401, `Sem credenciais deve retornar 401. Obteve ${res1.statusCode}`);
    assert(!next1Called, 'Next não deve ser chamado no 401');

    // Caso 2: Token inválido -> 401
    const req2 = createMockReq({}, {}, {}, { authorization: 'Bearer token_invalido_xyz' });
    const res2 = createMockRes();
    let next2Called = false;
    await authenticateAdmin(req2, res2, () => { next2Called = true; });
    assert(res2.statusCode === 401, `Token inválido deve retornar 401. Obteve ${res2.statusCode}`);
    assert(!next2Called, 'Next não deve ser chamado para token inválido');

    // Caso 3: Token válido de Customer (não admin) -> 403
    const req3 = createMockReq({}, {}, {}, { authorization: 'Bearer token_customer_user' });
    const res3 = createMockRes();
    let next3Called = false;
    await authenticateAdmin(req3, res3, () => { next3Called = true; });
    assert(res3.statusCode === 403, `Usuário customer deve retornar 403. Obteve ${res3.statusCode}`);
    assert(!next3Called, 'Next não deve ser chamado no 403');

    // Caso 4: Token válido de Admin -> 200 (chama next)
    const req4 = createMockReq({}, {}, {}, { authorization: 'Bearer token_admin_user' });
    const res4 = createMockRes();
    let next4Called = false;
    await authenticateAdmin(req4, res4, () => { next4Called = true; });
    assert(next4Called, 'Admin com token válido deve passar no middleware (next)');
    assert(req4.adminUser !== undefined, 'adminUser deve estar populado no request');

    // Caso 5: API Key válida no header x-admin-api-key -> 200 (chama next)
    const validApiKey = process.env.ADMIN_API_KEY || 'fpac_dev_admin_key_2026';
    process.env.ADMIN_API_KEY = validApiKey;

    const req5 = createMockReq({}, {}, {}, { 'x-admin-api-key': validApiKey });
    const res5 = createMockRes();
    let next5Called = false;
    await authenticateAdmin(req5, res5, () => { next5Called = true; });
    assert(next5Called, 'API Key válida deve passar no middleware (next)');

    resetAuthForTesting();
    console.log('  ✅ Auth Stack real validada: 401 (sem credencial), 401 (token inválido), 403 (customer), 200 (admin), 200 (API Key).');
  }

  // =========================================================================
  // 7. CREATE COMMERCIAL BUDGET COM MANUAL LINE ALLOCATION END-TO-END
  // =========================================================================
  console.log('\n🔹 7. Validando CREATE com Manual Line Allocation End-to-End...');
  {
    const mockDb = new MockFirestore();
    setCommercialBudgetDb(mockDb as any);

    const manualLines: CommercialBudgetLineAllocation[] = [
      { line: 'FORCE', targetRevenue: 50000, targetRevenuePercent: 50, targetCogs: 20000, targetContributionMargin: 25000, targetUnits: 500 },
      { line: 'MARK', targetRevenue: 30000, targetRevenuePercent: 30, targetCogs: 12000, targetContributionMargin: 15000, targetUnits: 300 },
      { line: 'PRIME', targetRevenue: 15000, targetRevenuePercent: 15, targetCogs: 6000, targetContributionMargin: 7500, targetUnits: 150 },
      { line: 'OTHER', targetRevenue: 5000, targetRevenuePercent: 5, targetCogs: 2000, targetContributionMargin: 2500, targetUnits: 50 }
    ];

    const createReq = createMockReq({
      title: 'Orçamento Linhas Manuais',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      targetRevenue: 100000,
      allocations: {
        cogsBudget: 40000,
        trafficBudget: 15000,
        fixedExpensesBudget: 10000,
        totalExpensesBudget: 65000
      },
      lineAllocationMethod: 'manual',
      customLineAllocations: manualLines,
      idempotencyKey: 'manual_line_alloc_create_test'
    });
    const createRes = createMockRes();
    await createCommercialBudgetController(createReq, createRes);

    assert(createRes.statusCode === 201, 'Criação com manual line allocation deve retornar 201');
    const createdBudget = createRes.body.budget || createRes.body.data;
    assert(createdBudget.lineAllocationMethod === 'manual', `lineAllocationMethod esperado 'manual'. Obteve '${createdBudget.lineAllocationMethod}'`);
    assert(createdBudget.lineAllocations !== undefined && createdBudget.lineAllocations.length === 4, 'Deve conter 4 linhas de produto');
    
    const forceLine = createdBudget.lineAllocations.find((l: any) => l.line === 'FORCE');
    assert(forceLine !== undefined, 'Linha FORCE deve existir');
    assert(forceLine.targetRevenue === 50000, `FORCE targetRevenue esperado 50000. Obteve ${forceLine.targetRevenue}`);
    assert(forceLine.targetRevenuePercent === 50, `FORCE targetRevenuePercent esperado 50%. Obteve ${forceLine.targetRevenuePercent}%`);

    console.log('  ✅ CREATE com Manual Line Allocation validado de ponta a ponta.');
  }

  console.log('\n=============================================================');
  console.log('🎉 TODAS AS VALIDAÇÕES DA FASE 9.6.6-D PASSARAM COM SUCESSO!');
  console.log('=============================================================\n');
}

runSuite().catch(err => {
  console.error('\n❌ ERRO NA EXECUÇÃO DA SUÍTE:', err);
  process.exit(1);
});

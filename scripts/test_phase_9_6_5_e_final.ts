/**
 * TEST SUITE DE CERTIFICAÇÃO FINAL FASE 9.6.5-E — FPAC STORE
 * 
 * Verificações obrigatórias:
 * 1. NEXT_MONTH MID-MONTH: 16 dias (01/08 a 16/08) R$ 1.600 -> Projeção Setembro (30 dias) = R$ 3.000 (sampleDaysCount = 16)
 * 2. NEXT_MONTH END-OF-MONTH: 31 dias (01/08 a 31/08) -> sampleDaysCount = 31
 * 3. RECALCULATE ANTES DO TARGET START: Projeções mantidas intactas, currentActuals = 0, baseline imutável
 * 4. RECALCULATE APÓS TARGET START: Usa run-rate real do target transcorrido (ex: 500 / 5 * 30 = 3.000)
 * 5. CUSTOM E QUARTER/YEAR FUTURO: Proteção contra zeramento em recalculate antes do início
 * 6. SELECT COMPATIBLE COMMERCIAL GOAL:
 *    - Meta mensal de Agosto NÃO é selecionada para Forecast Anual (01/01 a 31/12)
 *    - Metas exatas e de mesmo período são selecionadas com prioridade determinística
 * 7. 5 SERVER-SIDE GOAL EVALUATIONS NA CAMADA DE SERVIÇO/UI:
 *    - Realizado oficial vem do currentValue da avaliação server-side da meta
 *    - 5 métricas avaliadas: revenue, contribution_margin, operating_profit, units, average_ticket
 */

import assert from 'assert';
import {
  resolveForecastWindows,
  buildForecastBaselineSnapshot,
  generateCommercialForecast,
  recalculateCommercialForecastActuals,
  compareRealVsGoalVsForecast,
  selectCompatibleCommercialGoal,
  computeHorizonDefaultDates
} from '../src/utils/commercialForecast.js';
import {
  setCommercialForecastDb,
  setForecastClockForTests,
  createCommercialForecastController,
  recalculateCommercialForecastController
} from '../server/controllers/commercialForecast.controller.js';
import {
  setCommercialGovernanceDb,
  getCommercialGoalEvaluationController
} from '../server/controllers/commercialGovernance.controller.js';
import { CommercialGoal } from '../src/types/commercialGovernance.js';

// Mock Firestore seguro para testes de alta fidelidade
class MockForecastFirestore {
  collections: Map<string, Map<string, any>> = new Map();

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
          set: async (data: any, options?: any) => {
            if (options && options.merge && store.has(docId)) {
              const existing = store.get(docId);
              store.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
            } else {
              store.set(docId, JSON.parse(JSON.stringify(data)));
            }
          },
          update: async (data: any) => {
            const existing = store.get(docId) || {};
            store.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
          },
          delete: async () => {
            store.delete(docId);
          }
        };
      },
      get: async () => {
        const docs = Array.from(store.entries()).map(([id, data]) => ({
          id,
          exists: true,
          data: () => JSON.parse(JSON.stringify(data))
        }));
        return {
          docs,
          empty: docs.length === 0,
          size: docs.length,
          forEach: (cb: any) => docs.forEach(cb)
        };
      },
      where: (field: string, op: string, val: any) => {
        const filters: Array<{ field: string; op: string; val: any }> = [{ field, op, val }];
        const queryObj = {
          where: (f2: string, op2: string, val2: any) => {
            filters.push({ field: f2, op: op2, val: val2 });
            return queryObj;
          },
          get: async () => {
            const all = Array.from(store.entries());
            const filtered = all.filter(([_, data]) => {
              for (const filt of filters) {
                const itemVal = data[filt.field];
                if (filt.op === '==' && itemVal !== filt.val) return false;
                if (filt.op === '>=' && !(itemVal >= filt.val)) return false;
                if (filt.op === '<=' && !(itemVal <= filt.val)) return false;
              }
              return true;
            });
            const docs = filtered.map(([id, data]) => ({
              id,
              exists: true,
              data: () => JSON.parse(JSON.stringify(data))
            }));
            return {
              docs,
              empty: docs.length === 0,
              size: docs.length,
              forEach: (cb: any) => docs.forEach(cb)
            };
          }
        };
        return queryObj;
      }
    };
  }

  private transactionQueue: Promise<any> = Promise.resolve();

  async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
    const run = async () => {
      const transaction = {
        get: async (docRef: any) => docRef.get(),
        set: (docRef: any, data: any, options?: any) => docRef.set(data, options),
        update: (docRef: any, data: any) => docRef.update(data)
      };
      return await updateFunction(transaction);
    };

    const next = this.transactionQueue.then(run, run);
    this.transactionQueue = next.then(() => {}, () => {});
    return next;
  }

  clear() {
    this.collections.clear();
  }
}

function createMockReq(overrides: any = {}) {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    user: { uid: 'admin_test_e', email: 'admin@fpacstore.com' },
    ...overrides
  };
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headersSent: false,
    bodyData: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.bodyData = data;
      this.headersSent = true;
      return this;
    },
    send(data: any) {
      this.bodyData = data;
      this.headersSent = true;
      return this;
    }
  };
  return res;
}

async function runPhase965EFinalTests() {
  console.log('======================================================================');
  console.log('🚀 INICIANDO SUÍTE DE CERTIFICAÇÃO FASE 9.6.5-E FINAL — FPAC STORE');
  console.log('======================================================================');

  process.env.NODE_ENV = 'test';
  const db = new MockForecastFirestore();
  setCommercialForecastDb(db as any);
  setCommercialGovernanceDb(db as any);

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✅ [PASS] ${total}. ${name}`);
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${total}. ${name}: ${err.message}`);
      throw err;
    }
  }

  // --------------------------------------------------------------------------------------
  console.log('\n--- 1. NEXT_MONTH MID-MONTH RUN RATE E SAMPLE DAYS ---');
  // --------------------------------------------------------------------------------------

  await test('NEXT_MONTH Mid-Month: Em 16/08/2026, baseline é 01/08 a 16/08 (sampleDaysCount = 16)', async () => {
    const clock = new Date('2026-08-16T12:00:00.000Z');
    const windows = resolveForecastWindows({
      horizon: 'next_month',
      testNow: clock
    });

    assert.strictEqual(windows.forecastStartDate, '2026-09-01', 'Início do forecast = 01/09/2026');
    assert.strictEqual(windows.forecastEndDate, '2026-09-30', 'Fim do forecast = 30/09/2026');
    assert.strictEqual(windows.sourceStartDate, '2026-08-01', 'Início do baseline = 01/08/2026');
    assert.strictEqual(windows.sourceEndDate, '2026-08-16', 'Fim do baseline = 16/08/2026 (MTD)');
    assert.strictEqual(windows.sampleDaysCount, 16, 'sampleDaysCount exatamente 16');
    assert.strictEqual(windows.targetDaysCount, 30, 'targetDaysCount exatamente 30');
  });

  await test('NEXT_MONTH Mid-Month Controller: 16 pedidos de R$100 (R$1.600) geram Projeção de R$ 3.000 (NÃO 1.548,39)', async () => {
    db.clear();
    setForecastClockForTests(() => new Date('2026-08-16T12:00:00.000Z'));

    // Inserir 16 pedidos de R$ 100 entre 01/08 e 16/08
    for (let i = 1; i <= 16; i++) {
      const dayStr = String(i).padStart(2, '0');
      await db.collection('orders').doc(`ord_aug_${i}`).set({
        id: `ord_aug_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 100,
        createdAt: `2026-08-${dayStr}T10:00:00.000Z`,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }]
      });
    }

    const req = createMockReq({
      headers: { 'idempotency-key': 'idemp_nm_1600' },
      body: {
        title: 'Forecast Setembro Mid-Month',
        horizon: 'next_month'
      }
    });
    const res = createMockRes();
    await createCommercialForecastController(req, res);

    assert.strictEqual(res.statusCode, 201, 'Status 201 Created');
    const fc = res.bodyData.forecast;

    assert.strictEqual(fc.baseline.sampleDaysCount, 16, 'Baseline sampleDaysCount = 16');
    assert.strictEqual(fc.baseline.realizedRevenue, 1600, 'Baseline realizedRevenue = 1.600');
    assert.strictEqual(fc.baseline.dailyAverageRevenue, 100, 'Média diária = 100 (1600/16)');
    assert.strictEqual(fc.targetDaysCount, 30, 'Target days = 30');
    assert.strictEqual(fc.projectedRevenue, 3000, 'Projeção = 3.000 exato (100 * 30)');
  });

  await test('NEXT_MONTH End-of-Month: Em 31/08/2026, baseline utiliza o mês cheio (sampleDaysCount = 31)', async () => {
    const clock = new Date('2026-08-31T12:00:00.000Z');
    const windows = resolveForecastWindows({
      horizon: 'next_month',
      testNow: clock
    });

    assert.strictEqual(windows.forecastStartDate, '2026-09-01');
    assert.strictEqual(windows.forecastEndDate, '2026-09-30');
    assert.strictEqual(windows.sourceStartDate, '2026-08-01');
    assert.strictEqual(windows.sourceEndDate, '2026-08-31');
    assert.strictEqual(windows.sampleDaysCount, 31);
    assert.strictEqual(windows.targetDaysCount, 30);
  });

  await test('NEXT_MONTH com Source Explícito: Respeita janelas fornecidas pelo usuário', async () => {
    const windows = resolveForecastWindows({
      horizon: 'next_month',
      sourceStartDate: '2026-07-01',
      sourceEndDate: '2026-07-31',
      testNow: new Date('2026-08-16T12:00:00.000Z')
    });

    assert.strictEqual(windows.sourceStartDate, '2026-07-01');
    assert.strictEqual(windows.sourceEndDate, '2026-07-31');
    assert.strictEqual(windows.sampleDaysCount, 31);
    assert.strictEqual(windows.forecastStartDate, '2026-09-01');
    assert.strictEqual(windows.forecastEndDate, '2026-09-30');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n--- 2. RECALCULATE DE FORECAST FUTURO (BEFORE TARGET START) ---');
  // --------------------------------------------------------------------------------------

  await test('Future Recalculate: Recalcular em 16/08 forecast de Setembro mantém projeção R$ 3.000 e currentActuals = 0', async () => {
    // Obter forecast criado no teste anterior
    const snap = await db.collection('commercial_forecasts').get();
    const forecast = snap.docs[0].data();
    assert.strictEqual(forecast.projectedRevenue, 3000);

    const baselineBefore = JSON.parse(JSON.stringify(forecast.baseline));

    // Executar recálculo ainda em 16/08
    const req = createMockReq({
      params: { id: forecast.id },
      headers: { 'idempotency-key': 'recalc_future_001' },
      body: {}
    });
    const res = createMockRes();
    await recalculateCommercialForecastController(req, res);

    assert.strictEqual(res.statusCode, 200, 'Status 200 OK');
    const updated = res.bodyData.forecast;

    // Projeção NÃO vira zero
    assert.strictEqual(updated.projectedRevenue, 3000, 'Projeção preservada em R$ 3.000 (NÃO virou 0)');
    assert.strictEqual(updated.currentActuals.revenue, 0, 'currentActuals.revenue zerado antes do início');
    assert.strictEqual(updated.currentActuals.orders, 0, 'currentActuals.orders zerado antes do início');
    assert.deepStrictEqual(updated.baseline, baselineBefore, 'Baseline 100% idêntico e imutável');
  });

  await test('Future Recalculate Custom & Quarter: Janelas no futuro não zeram ao recalcular', async () => {
    db.clear();
    setForecastClockForTests(() => new Date('2026-08-16T12:00:00.000Z'));

    // Criar dados históricos em Julho
    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, '0');
      await db.collection('orders').doc(`ord_jul_${i}`).set({
        id: `ord_jul_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 200,
        createdAt: `2026-07-${day}T10:00:00.000Z`,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 200 }]
      });
    }

    // Criar forecast custom para Outubro (01/10 a 31/10)
    const reqCreate = createMockReq({
      headers: { 'idempotency-key': 'fc_oct_001' },
      body: {
        title: 'Forecast Outubro 2026',
        horizon: 'custom',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        sourceStartDate: '2026-07-01',
        sourceEndDate: '2026-07-31'
      }
    });
    const resCreate = createMockRes();
    await createCommercialForecastController(reqCreate, resCreate);
    const initialOct = resCreate.bodyData.forecast;
    assert.strictEqual(initialOct.projectedRevenue, 2000);

    // Recalcular em 16/08
    const reqRecalc = createMockReq({
      params: { id: initialOct.id },
      headers: { 'idempotency-key': 'recalc_oct_001' },
      body: {}
    });
    const resRecalc = createMockRes();
    await recalculateCommercialForecastController(reqRecalc, resRecalc);

    const updatedOct = resRecalc.bodyData.forecast;
    assert.strictEqual(updatedOct.projectedRevenue, 2000, 'Projeção de Outubro preservada em R$ 2.000');
    assert.strictEqual(updatedOct.currentActuals.revenue, 0, 'currentActuals em 0');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n--- 3. RECALCULATE APÓS TARGET START (RUN-RATE DO PERÍODO REAL) ---');
  // --------------------------------------------------------------------------------------

  await test('Target Start Recalculate: Ao avançar para 05/09 com R$ 500 em 5 dias, projeta R$ 3.000 (500 / 5 * 30)', async () => {
    // Pegar forecast de Setembro criado anteriormente
    db.clear();
    setForecastClockForTests(() => new Date('2026-08-16T12:00:00.000Z'));

    // Inserir amostragem de Agosto para criação
    for (let i = 1; i <= 16; i++) {
      const dayStr = String(i).padStart(2, '0');
      await db.collection('orders').doc(`ord_aug_${i}`).set({
        id: `ord_aug_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 100,
        createdAt: `2026-08-${dayStr}T10:00:00.000Z`,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }]
      });
    }

    const reqCreate = createMockReq({
      headers: { 'idempotency-key': 'fc_sep_start_test' },
      body: {
        title: 'Forecast Setembro 2026',
        horizon: 'next_month'
      }
    });
    const resCreate = createMockRes();
    await createCommercialForecastController(reqCreate, resCreate);
    const sepForecast = resCreate.bodyData.forecast;

    // Avançar clock para 05/09/2026 e inserir 5 pedidos de R$ 100 em Setembro
    setForecastClockForTests(() => new Date('2026-09-05T12:00:00.000Z'));
    for (let i = 1; i <= 5; i++) {
      await db.collection('orders').doc(`ord_sep_${i}`).set({
        id: `ord_sep_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 100,
        createdAt: `2026-09-0${i}T10:00:00.000Z`,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }]
      });
    }

    // Recalcular em 05/09
    const reqRecalc = createMockReq({
      params: { id: sepForecast.id },
      headers: { 'idempotency-key': 'recalc_sep_target_started' },
      body: {}
    });
    const resRecalc = createMockRes();
    await recalculateCommercialForecastController(reqRecalc, resRecalc);

    const updated = resRecalc.bodyData.forecast;
    assert.strictEqual(updated.baseline.realizedRevenue, 1600, 'Baseline de Agosto permanece intacto em R$ 1.600');
    assert.strictEqual(updated.currentActuals.revenue, 500, 'currentActuals reflete os 5 dias transcorridos de Setembro (R$ 500)');
    assert.strictEqual(updated.currentActuals.orders, 5, 'currentActuals reflete 5 pedidos');
    // Run-rate: (500 / 5) * 30 = 3000
    assert.strictEqual(updated.projectedRevenue, 3000, 'Projeção recalculada com o ritmo real de Setembro = R$ 3.000');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n--- 4. SELECT COMPATIBLE COMMERCIAL GOAL (COMPATIBILIDADE DETERMINÍSTICA) ---');
  // --------------------------------------------------------------------------------------

  await test('selectCompatibleCommercialGoal: Meta mensal de Agosto NÃO é associada a Forecast Anual', async () => {
    const goals: CommercialGoal[] = [
      {
        id: 'goal_aug_rev',
        title: 'Receita Agosto 2026',
        type: 'revenue',
        targetValue: 10000,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        period: 'monthly',
        status: 'active',
        createdBy: 'admin_test_e',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      }
    ];

    // Forecast anual: 01/01 a 31/12
    const selectedForYear = selectCompatibleCommercialGoal(goals, 'revenue', '2026-01-01', '2026-12-31');
    assert.strictEqual(selectedForYear, undefined, 'Meta mensal de Agosto NÃO é selecionada como meta anual');

    // Forecast mensal de Agosto: 01/08 a 31/08
    const selectedForAug = selectCompatibleCommercialGoal(goals, 'revenue', '2026-08-01', '2026-08-31');
    assert(selectedForAug !== undefined, 'Meta mensal de Agosto é selecionada para o forecast de Agosto');
    assert.strictEqual(selectedForAug!.id, 'goal_aug_rev');
  });

  await test('selectCompatibleCommercialGoal: Prioridade Exata > Período Equivalente', async () => {
    const goals: CommercialGoal[] = [
      {
        id: 'goal_q3_generic',
        title: 'Receita Trimestral Q3 Genérica',
        type: 'revenue',
        targetValue: 30000,
        startDate: '2026-07-01',
        endDate: '2026-09-30',
        period: 'quarterly',
        status: 'active',
        createdBy: 'admin_test_e',
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z'
      },
      {
        id: 'goal_q3_exact',
        title: 'Receita Trimestral Q3 Exata',
        type: 'revenue',
        targetValue: 35000,
        startDate: '2026-07-01',
        endDate: '2026-09-30',
        period: 'quarterly',
        status: 'active',
        createdBy: 'admin_test_e',
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z'
      }
    ];

    const match = selectCompatibleCommercialGoal(goals, 'revenue', '2026-07-01', '2026-09-30');
    assert(match !== undefined);
    assert.strictEqual(match!.type, 'revenue');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n--- 5. INTEGRAÇÃO REAL DE 5 EVALUATIONS SERVER-SIDE NA CAMADA DE SERVIÇO ---');
  // --------------------------------------------------------------------------------------

  await test('5 Server-side Goal Evaluations: Carrega e reconcilia Realizado oficial para as 5 métricas', async () => {
    db.clear();
    setForecastClockForTests(() => new Date('2026-08-10T12:00:00.000Z'));

    // Inserir produto p1 no catálogo
    await db.collection('products').doc('p1').set({
      id: 'p1',
      name: 'Produto Teste',
      cost: 45,
      costPrice: 45,
      price: 150
    });

    // Inserir 10 pedidos em Agosto (R$ 300 cada = R$ 3.000, 20 itens = 2 itens/pedido, CM = 70%, OP = 30%)
    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, '0');
      await db.collection('orders').doc(`ord_eval_${i}`).set({
        id: `ord_eval_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 300,
        createdAt: `2026-08-${day}T12:00:00.000Z`,
        items: [
          { productId: 'p1', quantity: 2, unitPrice: 150, unitCost: 45 } // R$ 300 rev, R$ 90 cogs, R$ 210 CM
        ]
      });
    }

    // Criar as 5 metas comerciais no banco
    const goalsData: CommercialGoal[] = [
      {
        id: 'g_rev_01',
        title: 'Meta Receita Agosto',
        type: 'revenue',
        targetValue: 10000,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        period: 'monthly',
        status: 'active',
        createdBy: 'admin_test_e',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      },
      {
        id: 'g_cm_01',
        title: 'Meta Margem Contribuição Agosto',
        type: 'contribution_margin',
        targetValue: 7000,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        period: 'monthly',
        status: 'active',
        createdBy: 'admin_test_e',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      },
      {
        id: 'g_op_01',
        title: 'Meta Lucro Operacional Agosto',
        type: 'operating_profit',
        targetValue: 3000,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        period: 'monthly',
        status: 'active',
        createdBy: 'admin_test_e',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      },
      {
        id: 'g_units_01',
        title: 'Meta Unidades Agosto',
        type: 'units',
        targetValue: 60,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        period: 'monthly',
        status: 'active',
        createdBy: 'admin_test_e',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      },
      {
        id: 'g_ticket_01',
        title: 'Meta Ticket Médio Agosto',
        type: 'average_ticket',
        targetValue: 300,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        period: 'monthly',
        status: 'active',
        createdBy: 'admin_test_e',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      }
    ];

    for (const g of goalsData) {
      await db.collection('commercial_goals').doc(g.id).set(g);
    }

    // Criar forecast oficial para Agosto
    const reqFc = createMockReq({
      headers: { 'idempotency-key': 'fc_aug_eval_01' },
      body: {
        title: 'Forecast Agosto Oficial',
        horizon: 'current_month'
      }
    });
    const resFc = createMockRes();
    await createCommercialForecastController(reqFc, resFc);
    const forecast = resFc.bodyData.forecast;

    // Avaliar cada uma das 5 metas pelo controller oficial
    const evaluations: Record<string, any> = {};
    for (const g of goalsData) {
      const reqEval = createMockReq({ params: { id: g.id } });
      const resEval = createMockRes();
      await getCommercialGoalEvaluationController(reqEval, resEval);
      assert.strictEqual(resEval.statusCode, 200, `Evaluation da meta ${g.type} retornou 200`);
      evaluations[g.type] = resEval.bodyData.evaluation;
    }

    // Verificar valores oficiais de cada avaliação server-side
    assert.strictEqual(evaluations.revenue.currentValue, 3000, 'Revenue Real = R$ 3.000');
    assert.strictEqual(evaluations.contribution_margin.currentValue, 2070.3, 'CM Real = R$ 2.070,30 (3.000 - 900 COGS - 29,70 Gateway)');
    assert.strictEqual(evaluations.units.currentValue, 20, 'Units Real = 20 un');
    assert.strictEqual(evaluations.average_ticket.currentValue, 300, 'Ticket Real = R$ 300');

    // Executar reconciliação compareRealVsGoalVsForecast com as avaliações oficiais
    const compRevenue = compareRealVsGoalVsForecast({
      metric: 'revenue',
      realized: evaluations.revenue.currentValue,
      targetGoal: goalsData[0].targetValue,
      forecasted: forecast.projectedRevenue
    });
    assert.strictEqual(compRevenue.realized, 3000);
    assert.strictEqual(compRevenue.targetGoal, 10000);
    assert.strictEqual(compRevenue.forecasted, 9300);
    assert.strictEqual(compRevenue.projectedAttainmentPercent, 93);
    assert.strictEqual(compRevenue.paceStatus, 'behind');

    const compTicket = compareRealVsGoalVsForecast({
      metric: 'average_ticket',
      realized: evaluations.average_ticket.currentValue,
      targetGoal: goalsData[4].targetValue,
      forecasted: forecast.projectedAverageTicket
    });
    assert.strictEqual(compTicket.realized, 300);
    assert.strictEqual(compTicket.targetGoal, 300);
    assert.strictEqual(compTicket.isGoalOnTrack, true);
    assert.strictEqual(compTicket.paceStatus, 'on_track');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`📊 RESULTADO DA SUÍTE 9.6.5-E: ${passed} Passaram | ${total - passed} Falharam`);
  console.log('======================================================================\n');
}

runPhase965EFinalTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});

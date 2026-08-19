/**
 * SUÍTE DEFINITIVA DE TESTES E CERTIFICAÇÃO — FASE 9.6.5-D
 * FPAC Store — Fechamento Definitivo de Horizontes, Clock e Integração Real
 *
 * Valida:
 * 1. Clock Seguro (Request testNow override = Deny / Ignored)
 * 2. Clock Interno Testável (setForecastClockForTests)
 * 3. Resolução Canônica de Horizontes:
 *    - current_month (Run-rate real com asOfDate automático)
 *    - next_month (Baseline no mês imediatamente anterior)
 *    - quarter (Trimestre calendário > 80 dias, baseline no trimestre anterior)
 *    - year (Ano calendário >= 365 dias, baseline no ano anterior)
 *    - custom futuro (Janela histórica anterior de duração idêntica)
 * 4. UI Horizon Default Dates (computeHorizonDefaultDates)
 * 5. Metas Comerciais Reais (5 metas carregadas + 5 avaliações server-side)
 * 6. Concorrência Promise.all (Create, Recalculate, Update/PATCH, Convert)
 * 7. Imutabilidade e Atomicidade Append-Only do Evento Converted-To-Action
 */

import assert from 'assert';
import {
  resolveForecastWindows,
  buildForecastBaselineSnapshot,
  generateCommercialForecast,
  recalculateCommercialForecastActuals,
  simulateWhatIfScenario,
  convertScenarioToCommercialActionPayload,
  compareRealVsGoalVsForecast,
  generateScenarioFingerprint,
  computeHorizonDefaultDates,
  countInclusiveDays
} from '../src/utils/commercialForecast';
import {
  setCommercialForecastDb,
  setForecastClockForTests,
  getForecastClock,
  createCommercialForecastController,
  recalculateCommercialForecastController,
  updateCommercialForecastController,
  convertScenarioToActionController
} from '../server/controllers/commercialForecast.controller';
import {
  setCommercialGovernanceDb,
  getCommercialGoalEvaluationController
} from '../server/controllers/commercialGovernance.controller';

// Mock DB in-memory robusto com suporte a transações Firestore atômicas e queries com filtros
class InMemoryDatabase {
  private collections: Map<string, Map<string, any>> = new Map();

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
            if (options?.merge && store.has(docId)) {
              const existing = store.get(docId);
              store.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
            } else {
              store.set(docId, JSON.parse(JSON.stringify(data)));
            }
          },
          update: async (data: any) => {
            if (!store.has(docId)) throw new Error('NOT_FOUND');
            const existing = store.get(docId);
            store.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
          }
        };
      },
      where: (field: string, op: string, val: any) => {
        let filters = [{ field, op, val }];
        const queryObj: any = {
          where: (f: string, o: string, v: any) => {
            filters.push({ field: f, op: o, val: v });
            return queryObj;
          },
          get: async () => {
            let docs = Array.from(store.entries()).map(([id, data]) => ({
              id,
              data: () => JSON.parse(JSON.stringify(data)),
              ...JSON.parse(JSON.stringify(data))
            }));

            for (const { field, op, val } of filters) {
              docs = docs.filter((doc: any) => {
                let docVal = doc[field];
                if (docVal && typeof docVal === 'object' && docVal.toMillis) {
                  docVal = docVal.toDate ? docVal.toDate().toISOString() : new Date(docVal.toMillis()).toISOString();
                }
                let targetVal = val;
                if (targetVal && typeof targetVal === 'object' && targetVal.toMillis) {
                  targetVal = targetVal.toDate ? targetVal.toDate().toISOString() : new Date(targetVal.toMillis()).toISOString();
                }

                if (op === '==') return docVal === targetVal;
                if (op === '>=') return docVal >= targetVal;
                if (op === '<=') return docVal <= targetVal;
                if (op === '>') return docVal > targetVal;
                if (op === '<') return docVal < targetVal;
                return true;
              });
            }

            return {
              docs: docs.map((d: any) => ({
                id: d.id,
                data: () => d
              }))
            };
          }
        };
        return queryObj;
      },
      get: async () => {
        const docs = Array.from(store.entries()).map(([id, data]) => ({
          id,
          data: () => JSON.parse(JSON.stringify(data)),
          ...JSON.parse(JSON.stringify(data))
        }));
        return {
          docs: docs.map((d: any) => ({
            id: d.id,
            data: () => d
          }))
        };
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

function createMockReq(overrides: any = {}): any {
  return {
    headers: {},
    body: {},
    query: {},
    params: {},
    user: { uid: 'admin_test', email: 'admin@fpac.test' },
    ...overrides
  };
}

function createMockRes(): any {
  const res: any = {
    statusCode: 200,
    headers: {},
    bodyData: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(data: any) {
      this.bodyData = data;
      return this;
    }
  };
  return res;
}

async function runPhase965DTests() {
  console.log('======================================================================');
  console.log('🚀 INICIANDO SUÍTE DE TESTES E CERTIFICAÇÃO FASE 9.6.5-D — FPAC STORE');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            passed++;
            console.log(`  ✅ [PASS] ${total}. ${name}`);
          })
          .catch((err: any) => {
            console.error(`  ❌ [FAIL] ${total}. ${name}:`, err.message || err);
            throw err;
          });
      } else {
        passed++;
        console.log(`  ✅ [PASS] ${total}. ${name}`);
      }
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${total}. ${name}:`, err.message || err);
      throw err;
    }
  }

  const db = new InMemoryDatabase();
  setCommercialForecastDb(db);
  setCommercialGovernanceDb(db);

  // Configurar ambiente para 'test'
  process.env.NODE_ENV = 'test';

  // --------------------------------------------------------------------------------------
  console.log('--- 1. SEGURANÇA DO RELÓGIO & ISOLAMENTO DE TESTNOW ---');
  // --------------------------------------------------------------------------------------

  await test('Clock seguro: setForecastClockForTests bloqueado fora de NODE_ENV=test', () => {
    process.env.NODE_ENV = 'production';
    let threw = false;
    try {
      setForecastClockForTests(() => new Date('2026-08-10T12:00:00.000Z'));
    } catch (e: any) {
      threw = true;
      assert(e.message.includes('only permitted in test environment'));
    }
    process.env.NODE_ENV = 'test';
    assert(threw, 'setForecastClockForTests deve lançar erro se não for ambiente test');
  });

  await test('Clock seguro: Parâmetros testNow em body, query e headers são IGORADOS pelo controller', async () => {
    // Definir relógio de teste oficial para 10 de Agosto de 2026
    setForecastClockForTests(() => new Date('2026-08-10T12:00:00.000Z'));

    db.clear();
    // Popular 10 pedidos entre 01/08 e 10/08 (R$ 300 cada = R$ 3.000)
    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, '0');
      await db.collection('orders').doc(`ord_${i}`).set({
        id: `ord_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 300,
        createdAt: `2026-08-${day}T10:00:00.000Z`,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 300 }]
      });
    }

    // Cliente malicioso envia testNow='2026-08-01' via body, query e header tentando fraudar a janela
    const req = createMockReq({
      headers: {
        'idempotency-key': 'fc_clock_sec_001',
        'x-test-now': '2026-08-01T12:00:00.000Z'
      },
      query: {
        testNow: '2026-08-01T12:00:00.000Z'
      },
      body: {
        title: 'Forecast Teste Clock Seguro',
        horizon: 'current_month',
        testNow: '2026-08-01T12:00:00.000Z'
      }
    });
    const res = createMockRes();

    await createCommercialForecastController(req, res);

    assert.strictEqual(res.statusCode, 201);
    const fc = res.bodyData.forecast;
    // O forecast deve ter sido gerado com o relógio interno (10 dias de amostragem: 01/08 a 10/08)
    assert.strictEqual(fc.baseline.sampleDaysCount, 10, 'Amostragem deve ser de 10 dias baseada no clock oficial');
    assert.strictEqual(fc.baseline.realizedRevenue, 3000, 'Receita realizada no baseline deve ser R$ 3.000');
    assert.strictEqual(fc.projectedRevenue, 9300, 'Receita projetada deve ser 3000/10*31 = 9300');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n--- 2. RESOLUÇÃO CANÔNICA DE HORIZONTES (QUARTER, YEAR, CUSTOM FUTURO) ---');
  // --------------------------------------------------------------------------------------

  await test('Horizonte QUARTER: Trimestre civil com > 80 dias e baseline no trimestre anterior', () => {
    // Hoje: 16 de Agosto de 2026 (pertence a Q3: 01/07 a 30/09)
    const refDate = new Date('2026-08-16T12:00:00.000Z');
    const windows = resolveForecastWindows({
      horizon: 'quarter',
      testNow: refDate
    });

    assert.strictEqual(windows.forecastStartDate, '2026-07-01');
    assert.strictEqual(windows.forecastEndDate, '2026-09-30');
    assert.strictEqual(windows.sourceStartDate, '2026-04-01');
    assert.strictEqual(windows.sourceEndDate, '2026-06-30');
    assert(windows.targetDaysCount > 80, `Target days deve ser > 80 (obtido: ${windows.targetDaysCount})`);
    assert.strictEqual(windows.targetDaysCount, 92, 'Q3 tem 92 dias');
    assert.strictEqual(windows.sampleDaysCount, 91, 'Q2 tem 91 dias');
  });

  await test('Horizonte YEAR: Ano civil com >= 365 dias e baseline no ano anterior', () => {
    const refDate = new Date('2026-08-16T12:00:00.000Z');
    const windows = resolveForecastWindows({
      horizon: 'year',
      testNow: refDate
    });

    assert.strictEqual(windows.forecastStartDate, '2026-01-01');
    assert.strictEqual(windows.forecastEndDate, '2026-12-31');
    assert.strictEqual(windows.sourceStartDate, '2025-01-01');
    assert.strictEqual(windows.sourceEndDate, '2025-12-31');
    assert(windows.targetDaysCount >= 365, `Target days do ano deve ser >= 365 (obtido: ${windows.targetDaysCount})`);
    assert.strictEqual(windows.targetDaysCount, 365, 'Ano 2026 tem 365 dias');
  });

  await test('CUSTOM FUTURO: Target no futuro sem source usa janela histórica imediatamente anterior de duração idêntica', () => {
    // Hoje: 10/08/2026. Target futuro: 01/09 a 30/09 (30 dias)
    const refDate = new Date('2026-08-10T12:00:00.000Z');
    const windows = resolveForecastWindows({
      horizon: 'custom',
      forecastStartDate: '2026-09-01',
      forecastEndDate: '2026-09-30',
      testNow: refDate
    });

    assert.strictEqual(windows.forecastStartDate, '2026-09-01');
    assert.strictEqual(windows.forecastEndDate, '2026-09-30');
    assert.strictEqual(windows.targetDaysCount, 30);
    // Baseline deve ser os 30 dias imediatamente anteriores ao target (02/08 a 31/08)
    assert.strictEqual(windows.sourceStartDate, '2026-08-02');
    assert.strictEqual(windows.sourceEndDate, '2026-08-31');
    assert.strictEqual(windows.sampleDaysCount, 30);
    assert(windows.sourceEndDate < windows.forecastStartDate, 'sourceEndDate deve ser anterior ao forecastStartDate');
    assert.strictEqual(windows.sampleDaysCount, windows.targetDaysCount, 'sampleDaysCount deve ser exatamente igual a targetDaysCount');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n--- 3. UI HELPER COMPUTE HORIZON DEFAULT DATES ---');
  // --------------------------------------------------------------------------------------

  await test('computeHorizonDefaultDates: Selecionar Next Month em 10/08/2026 gera 01/09 a 30/09', () => {
    const refDate = new Date(2026, 7, 10); // 10 de Agosto de 2026
    const dates = computeHorizonDefaultDates('next_month', refDate);
    assert.strictEqual(dates.startDate, '2026-09-01');
    assert.strictEqual(dates.endDate, '2026-09-30');
  });

  await test('computeHorizonDefaultDates: Selecionar Current Month em 10/08/2026 gera 01/08 a 31/08', () => {
    const refDate = new Date(2026, 7, 10);
    const dates = computeHorizonDefaultDates('current_month', refDate);
    assert.strictEqual(dates.startDate, '2026-08-01');
    assert.strictEqual(dates.endDate, '2026-08-31');
  });

  await test('computeHorizonDefaultDates: Selecionar Quarter em 10/08/2026 gera 01/07 a 30/09', () => {
    const refDate = new Date(2026, 7, 10);
    const dates = computeHorizonDefaultDates('quarter', refDate);
    assert.strictEqual(dates.startDate, '2026-07-01');
    assert.strictEqual(dates.endDate, '2026-09-30');
  });

  await test('computeHorizonDefaultDates: Selecionar Year em 10/08/2026 gera 01/01 a 31/12', () => {
    const refDate = new Date(2026, 7, 10);
    const dates = computeHorizonDefaultDates('year', refDate);
    assert.strictEqual(dates.startDate, '2026-01-01');
    assert.strictEqual(dates.endDate, '2026-12-31');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n--- 4. INTEGRAÇÃO REAL DE METAS & 5 SERVER-SIDE GOAL EVALUATIONS ---');
  // --------------------------------------------------------------------------------------

  await test('Metas Comerciais: 5 metas carregadas e avaliadas com o motor oficial DRE', async () => {
    db.clear();
    setForecastClockForTests(() => new Date('2026-08-10T12:00:00.000Z'));

    // 1. Cadastrar 5 metas no banco
    const goalsData = [
      { id: 'goal_rev', title: 'Meta de Receita', type: 'revenue', targetValue: 10000, startDate: '2026-08-01', endDate: '2026-08-31', period: 'monthly', status: 'active' },
      { id: 'goal_cm', title: 'Meta de Margem Contrib.', type: 'contribution_margin', targetValue: 5000, startDate: '2026-08-01', endDate: '2026-08-31', period: 'monthly', status: 'active' },
      { id: 'goal_op', title: 'Meta de Lucro Operac.', type: 'operating_profit', targetValue: 2000, startDate: '2026-08-01', endDate: '2026-08-31', period: 'monthly', status: 'active' },
      { id: 'goal_units', title: 'Meta de Unidades', type: 'units', targetValue: 40, startDate: '2026-08-01', endDate: '2026-08-31', period: 'monthly', status: 'active' },
      { id: 'goal_ticket', title: 'Meta de Ticket Médio', type: 'average_ticket', targetValue: 300, startDate: '2026-08-01', endDate: '2026-08-31', period: 'monthly', status: 'active' }
    ];

    for (const g of goalsData) {
      await db.collection('commercial_goals').doc(g.id).set(g);
    }

    // 2. Inserir produtos e pedidos realizados (10 pedidos de R$ 300 com custo de R$ 100 cada)
    await db.collection('products').doc('p1').set({ id: 'p1', name: 'Perfume Luxo', costPrice: 100, price: 300 });

    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, '0');
      await db.collection('orders').doc(`ord_${i}`).set({
        id: `ord_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 300,
        subtotal: 300,
        createdAt: `2026-08-${day}T10:00:00.000Z`,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 300, costPrice: 100 }]
      });
    }

    // Despesas fixas no período: R$ 500
    await db.collection('financial_cashflow').doc('exp_1').set({
      id: 'exp_1',
      type: 'expense',
      category: 'fixed',
      amount: 500,
      date: '2026-08-05'
    });

    // 3. Executar avaliação oficial server-side para cada uma das 5 metas
    const evaluations: Record<string, any> = {};
    for (const g of goalsData) {
      const req = createMockReq({ params: { id: g.id } });
      const res = createMockRes();
      await getCommercialGoalEvaluationController(req, res);
      assert.strictEqual(res.statusCode, 200, `Avaliação da meta ${g.type} deve retornar 200`);
      evaluations[g.type] = res.bodyData.evaluation;
    }

    // Comprovar os valores realizados oficiais da 9.6.4 / 9.6.1 DRE:
    assert.strictEqual(evaluations.revenue.currentValue, 3000, 'Realizado Receita = R$ 3.000');
    assert.strictEqual(evaluations.units.currentValue, 10, 'Realizado Unidades = 10');
    assert.strictEqual(evaluations.average_ticket.currentValue, 300, 'Realizado Ticket = R$ 300');
    // Margem de Contribuição apurada pelo motor 9.6.1 considerando impostos e taxas variáveis
    assert.strictEqual(evaluations.contribution_margin.currentValue, 1970.3, 'Realizado CM = R$ 1.970,30 (com deduções variáveis do motor 9.6.1)');
    assert.strictEqual(evaluations.operating_profit.currentValue, 1470.3, 'Realizado OP = 1970.3 - 500 = R$ 1.470,30');

    // 4. Comprovar que o comparador de Forecast integra as 5 metas perfeitamente
    const comparisons = [
      compareRealVsGoalVsForecast({ metric: 'revenue', realized: evaluations.revenue.currentValue, targetGoal: 10000, forecasted: 9300 }),
      compareRealVsGoalVsForecast({ metric: 'contribution_margin', realized: evaluations.contribution_margin.currentValue, targetGoal: 5000, forecasted: 6200 }),
      compareRealVsGoalVsForecast({ metric: 'operating_profit', realized: evaluations.operating_profit.currentValue, targetGoal: 2000, forecasted: 4650 }),
      compareRealVsGoalVsForecast({ metric: 'units', realized: evaluations.units.currentValue, targetGoal: 40, forecasted: 31 }),
      compareRealVsGoalVsForecast({ metric: 'average_ticket', realized: evaluations.average_ticket.currentValue, targetGoal: 300, forecasted: 300 })
    ];

    assert.strictEqual(comparisons.length, 5, '5 comparações geradas com sucesso');
    assert.strictEqual(comparisons[0].projectedAttainmentPercent, 93, 'Atingimento Receita = 93%');
    assert.strictEqual(comparisons[4].isGoalOnTrack, true, 'Ticket médio no alvo = on track');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n--- 5. CONCORRÊNCIA EM ALTA ESCALA COM PROMISE.ALL ---');
  // --------------------------------------------------------------------------------------

  await test('CREATE Concurrency: 10 criações simultâneas resultam em 1 Forecast real (201) + 9 replays (200)', async () => {
    db.clear();
    setForecastClockForTests(() => new Date('2026-08-10T12:00:00.000Z'));

    // Inserir pedidos de amostragem
    for (let i = 1; i <= 5; i++) {
      await db.collection('orders').doc(`ord_c_${i}`).set({
        id: `ord_c_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 500,
        createdAt: `2026-08-0${i}T10:00:00.000Z`,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 500 }]
      });
    }

    const createKey = 'idemp_create_batch_456';
    const requests = Array.from({ length: 10 }).map(() => {
      const req = createMockReq({
        headers: { 'idempotency-key': createKey },
        body: {
          title: 'Forecast Concorrente Batch',
          horizon: 'current_month'
        }
      });
      const res = createMockRes();
      return createCommercialForecastController(req, res).then(() => res);
    });

    const responses = await Promise.all(requests);
    const createdCount = responses.filter(r => r.statusCode === 201).length;
    const replay200Count = responses.filter(r => r.statusCode === 200).length;

    assert.strictEqual(createdCount, 1, 'Exatamente 1 resposta HTTP 201');
    assert.strictEqual(replay200Count, 9, 'Exatamente 9 respostas HTTP 200');

    // Verificar se no banco há exatamente 1 forecast persistido
    const forecastsSnap = await db.collection('commercial_forecasts').get();
    assert.strictEqual(forecastsSnap.docs.length, 1, 'Exatamente 1 forecast persistido');
  });

  await test('RECALCULATE Concurrency: 10 recálculos simultâneos resultam em 1 recálculo real + 9 replays', async () => {
    // Usar o forecast criado no teste anterior
    const forecastsSnap = await db.collection('commercial_forecasts').get();
    const forecastId = forecastsSnap.docs[0].id;

    const recalcKey = 'idemp_recalc_batch_999';
    const requests = Array.from({ length: 10 }).map(() => {
      const req = createMockReq({
        params: { id: forecastId },
        headers: { 'idempotency-key': recalcKey },
        body: {}
      });
      const res = createMockRes();
      return recalculateCommercialForecastController(req, res).then(() => res);
    });

    const responses = await Promise.all(requests);
    const statuses = responses.map(r => r.statusCode);
    const replayCount = responses.filter(r => r.bodyData?.idempotentReplay === true).length;
    const realCount = responses.filter(r => r.bodyData?.idempotentReplay === false).length;

    assert(statuses.every(s => s === 200), 'Todos retornam HTTP 200');
    assert.strictEqual(realCount, 1, 'Exatamente 1 execução real de recálculo');
    assert.strictEqual(replayCount, 9, 'Exatamente 9 replays idempotentes');
  });

  await test('PATCH Concurrency: 10 updates simultâneos resultam em 1 mutação real + 9 replays', async () => {
    db.clear();
    setForecastClockForTests(() => new Date('2026-08-10T12:00:00.000Z'));

    // Criar um forecast base
    await db.collection('commercial_forecasts').doc('fc_patch_target').set({
      id: 'fc_patch_target',
      title: 'Forecast Original',
      status: 'active',
      notes: 'Nota Inicial'
    });

    const patchKey = 'idemp_patch_batch_123';
    const requests = Array.from({ length: 10 }).map(() => {
      const req = createMockReq({
        params: { id: 'fc_patch_target' },
        headers: { 'idempotency-key': patchKey },
        body: { status: 'archived', notes: 'Atualizado em lote' }
      });
      const res = createMockRes();
      return updateCommercialForecastController(req, res).then(() => res);
    });

    const responses = await Promise.all(requests);

    const statuses = responses.map(r => r.statusCode);
    const replayCount = responses.filter(r => r.bodyData?.idempotentReplay === true).length;
    const realCount = responses.filter(r => r.bodyData?.idempotentReplay === false).length;

    assert(statuses.every(s => s === 200), 'Todos os status devem ser 200');
    assert.strictEqual(realCount, 1, 'Exatamente 1 execução real da mutação');
    assert.strictEqual(replayCount, 9, 'Exatamente 9 respostas via idempotent replay');

    // Verificar se o documento no banco foi atualizado
    const updatedDoc = await db.collection('commercial_forecasts').doc('fc_patch_target').get();
    assert.strictEqual(updatedDoc.data().status, 'archived');
    assert.strictEqual(updatedDoc.data().notes, 'Atualizado em lote');
  });

  await test('Convert Concurrency: 10 conversões simultâneas criam 1 ação comercial + 9 replays', async () => {
    db.clear();
    setForecastClockForTests(() => new Date('2026-08-10T12:00:00.000Z'));

    // Criar forecast base
    await db.collection('commercial_forecasts').doc('fc_conv_target').set({
      id: 'fc_conv_target',
      title: 'Forecast para Ação',
      status: 'active',
      projectedRevenue: 10000,
      projectedOperatingProfit: 2500,
      confidence: { level: 'high', score: 85 }
    });

    const convertKey = 'idemp_conv_batch_789';
    const scenario = {
      id: 'scen_opt_1',
      name: 'Aumento de Margem',
      projectedRevenue: 11000,
      projectedContributionMargin: 6000,
      projectedOperatingProfit: 3000,
      deltaRevenue: 1000,
      deltaOperatingProfit: 500,
      params: {
        priceAdjustmentPercent: 10,
        volumeElasticityFactor: 0.8
      }
    };

    const requests = Array.from({ length: 10 }).map(() => {
      const req = createMockReq({
        headers: { 'idempotency-key': convertKey },
        body: {
          forecastId: 'fc_conv_target',
          scenario,
          notes: 'Conversão em ação'
        }
      });
      const res = createMockRes();
      return convertScenarioToActionController(req, res).then(() => res);
    });

    const responses = await Promise.all(requests);

    const statuses = responses.map(r => r.statusCode);
    const createdCount = statuses.filter(s => s === 201).length;
    const replay200Count = statuses.filter(s => s === 200).length;

    assert.strictEqual(createdCount, 1, 'Exatamente 1 retorno HTTP 201 (criação da ação comercial)');
    assert.strictEqual(replay200Count, 9, 'Exatamente 9 retornos HTTP 200 (replay idempotente)');

    // Verificar se no banco há exatamente 1 ação criada
    const actionsSnap = await db.collection('commercial_actions').get();
    assert.strictEqual(actionsSnap.docs.length, 1, 'Deve existir exatamente 1 commercial_action');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n--- 6. EVENT APPEND-ONLY & ATOMICIDADE DO EVENTO CONVERTIDO ---');
  // --------------------------------------------------------------------------------------

  await test('Event Immutability: Replays concorrentes não alteram timestamp nem payload do evento converted_to_action', async () => {
    // Buscar o evento gravado no teste anterior
    const eventsSnap = await db.collection('commercial_forecast_events').get();
    const convertEvents = eventsSnap.docs
      .map(d => d.data())
      .filter((e: any) => e.type === 'converted_to_action');

    assert.strictEqual(convertEvents.length, 1, 'Deve existir exatamente 1 evento converted_to_action');

    const originalEvent = JSON.parse(JSON.stringify(convertEvents[0]));

    // Executar mais 5 replays subsequentes
    const convertKey = 'idemp_conv_batch_789';
    const scenario = {
      id: 'scen_opt_1',
      name: 'Aumento de Margem',
      projectedRevenue: 11000,
      projectedContributionMargin: 6000,
      projectedOperatingProfit: 3000,
      deltaRevenue: 1000,
      deltaOperatingProfit: 500,
      params: {
        priceAdjustmentPercent: 10,
        volumeElasticityFactor: 0.8
      }
    };

    for (let i = 0; i < 5; i++) {
      const req = createMockReq({
        headers: { 'idempotency-key': convertKey },
        body: {
          forecastId: 'fc_conv_target',
          scenario,
          notes: 'Conversão em ação'
        }
      });
      const res = createMockRes();
      await convertScenarioToActionController(req, res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.bodyData?.idempotentReplay, true);
    }

    // Buscar o evento novamente e verificar imutabilidade estrita
    const eventsSnapAfter = await db.collection('commercial_forecast_events').get();
    const convertEventsAfter = eventsSnapAfter.docs
      .map(d => d.data())
      .filter((e: any) => e.type === 'converted_to_action');

    assert.strictEqual(convertEventsAfter.length, 1, 'Total de eventos converted_to_action permanece 1');
    const afterEvent = convertEventsAfter[0];

    assert.strictEqual(afterEvent.id, originalEvent.id, 'ID do evento permanece idêntico');
    assert.strictEqual(afterEvent.timestamp, originalEvent.timestamp, 'Timestamp permanece 100% imutável');
    assert.deepStrictEqual(afterEvent.payload, originalEvent.payload, 'Payload permanece 100% idêntico');
  });

  // --------------------------------------------------------------------------------------
  console.log('\n--- 7. REGRESSÃO COMPLETA DE MOTOR, NEXT_MONTH E ACTUALS ADVANCE ---');
  // --------------------------------------------------------------------------------------

  await test('NEXT_MONTH Motor: Setembro 2026 utiliza Agosto 2026 completo como baseline', async () => {
    db.clear();
    setForecastClockForTests(() => new Date('2026-08-31T12:00:00.000Z'));

    // Popular 31 pedidos em Agosto de 2026 (R$ 100 cada = R$ 3.100 no mês de 31 dias)
    for (let i = 1; i <= 31; i++) {
      const day = String(i).padStart(2, '0');
      await db.collection('orders').doc(`ord_aug_${i}`).set({
        id: `ord_aug_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 100,
        createdAt: `2026-08-${day}T12:00:00.000Z`,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }]
      });
    }

    const req = createMockReq({
      headers: { 'idempotency-key': 'fc_next_month_001' },
      body: {
        title: 'Forecast Setembro 2026',
        horizon: 'next_month'
      }
    });
    const res = createMockRes();
    await createCommercialForecastController(req, res);

    assert.strictEqual(res.statusCode, 201);
    const fc = res.bodyData.forecast;

    assert.strictEqual(fc.forecastStartDate, '2026-09-01');
    assert.strictEqual(fc.forecastEndDate, '2026-09-30');
    assert.strictEqual(fc.sourceStartDate, '2026-08-01');
    assert.strictEqual(fc.sourceEndDate, '2026-08-31');
    assert.strictEqual(fc.baseline.sampleDaysCount, 31);
    assert.strictEqual(fc.baseline.realizedRevenue, 3100);
    // Setembro tem 30 dias: (3100 / 31) * 30 = 3000
    assert.strictEqual(fc.projectedRevenue, 3000);
  });

  await test('Actuals Advance: Avanço de 3.000 -> 4.500 no recálculo mantém baseline R$ 3.000 intacto', async () => {
    db.clear();
    setForecastClockForTests(() => new Date('2026-08-10T12:00:00.000Z'));

    // 10 pedidos até 10/08 (R$ 300 cada = R$ 3.000)
    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, '0');
      await db.collection('orders').doc(`ord_adv_${i}`).set({
        id: `ord_adv_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 300,
        createdAt: `2026-08-${day}T12:00:00.000Z`,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 300 }]
      });
    }

    // Criar forecast inicial em 10/08
    const reqCreate = createMockReq({
      headers: { 'idempotency-key': 'fc_adv_001' },
      body: {
        title: 'Forecast Avanço Actuals',
        horizon: 'current_month'
      }
    });
    const resCreate = createMockRes();
    await createCommercialForecastController(reqCreate, resCreate);
    const initialFc = resCreate.bodyData.forecast;

    assert.strictEqual(initialFc.baseline.realizedRevenue, 3000);
    assert.strictEqual(initialFc.projectedRevenue, 9300);

    // O tempo avança para 15/08 e chegam mais 5 pedidos (totalizando 15 pedidos = R$ 4.500)
    setForecastClockForTests(() => new Date('2026-08-15T12:00:00.000Z'));
    for (let i = 11; i <= 15; i++) {
      const day = String(i).padStart(2, '0');
      await db.collection('orders').doc(`ord_adv_${i}`).set({
        id: `ord_adv_${i}`,
        status: 'completed',
        financialStatus: 'paid',
        paymentStatus: 'paid',
        total: 300,
        createdAt: `2026-08-${day}T12:00:00.000Z`,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 300 }]
      });
    }

    // Recalcular forecast em 15/08
    const reqRecalc = createMockReq({
      params: { id: initialFc.id },
      headers: { 'idempotency-key': 'recalc_adv_001' },
      body: {}
    });
    const resRecalc = createMockRes();
    await recalculateCommercialForecastController(reqRecalc, resRecalc);

    const updatedFc = resRecalc.bodyData.forecast;

    // Baseline original permanece estritamente idêntico a R$ 3.000
    assert.strictEqual(updatedFc.baseline.realizedRevenue, 3000, 'Baseline permanece R$ 3.000');
    assert.strictEqual(updatedFc.baseline.sampleDaysCount, 10, 'Baseline sampleDaysCount permanece 10');

    // Current Actuals agora reflete os 15 dias (R$ 4.500)
    assert.strictEqual(updatedFc.currentActuals.revenue, 4500, 'Current Actuals atualizado para R$ 4.500');
    assert.strictEqual(updatedFc.currentActuals.orders, 15, 'Current Actuals orders = 15');

    // Projeção atualizada com base no novo ritmo: (4500 / 15) * 31 = 9300
    assert.strictEqual(updatedFc.projectedRevenue, 9300);
  });

  // --------------------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`📊 RESULTADO DA SUÍTE 9.6.5-D: ${passed} Passaram | ${total - passed} Falharam`);
  console.log('======================================================================\n');
}

runPhase965DTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});

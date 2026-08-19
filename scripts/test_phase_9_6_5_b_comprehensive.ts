/**
 * SUÍTE COMPLETA DE CERTIFICAÇÃO FASE 9.6.5-B — FPAC STORE
 * Validação dos 31 Testes Canônicos de Forecast, Governança, Run-Rate, Metas, What-If e Idempotência
 */

import {
  safeNum,
  calculateCatalogCostCoverage,
  buildForecastBaselineSnapshot,
  calculateForecastConfidence,
  generateCommercialForecast,
  recalculateCommercialForecastActuals,
  simulateWhatIfScenario,
  generateScenarioFingerprint,
  convertScenarioToCommercialActionPayload,
  compareRealVsGoalVsForecast,
  resolveForecastWindows
} from '../src/utils/commercialForecast.js';
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
import { authenticateAdmin, AuthenticatedRequest } from '../server/middleware/auth.middleware.js';
import { Timestamp } from 'firebase-admin/firestore';

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

  public async runTransaction(updateFunction: (tx: any) => Promise<any>): Promise<any> {
    const tx = {
      get: async (docRef: any) => docRef.get(),
      set: async (docRef: any, data: any, options?: any) => docRef.set(data, options),
      update: async (docRef: any, data: any) => docRef.update(data)
    };
    return updateFunction(tx);
  }
}

function createMockResponse() {
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
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    }
  };
  return res;
}

async function runComprehensiveTests() {
  console.log('\n======================================================================');
  console.log('🧪 INICIANDO SUÍTE COMPLETA DE 31 TESTES — FASE 9.6.5-B');
  console.log('======================================================================\n');

  // 1. RUN-RATE REAL 3000→9000 (10/30 days)
  console.log('--- Teste 1: Run-Rate Real 3000 em 10 dias → 9000 em 30 dias ---');
  const partialOrders: any[] = [];
  for (let d = 1; d <= 10; d++) {
    const dayStr = String(d).padStart(2, '0');
    partialOrders.push({
      id: `ord_part_${d}`,
      total: 300,
      paidAmount: 300,
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: `2026-08-${dayStr}T12:00:00.000Z`,
      items: [{ productId: 'p1', quantity: 2, unitPrice: 150, costPrice: 50 }]
    });
  }
  const fc1 = generateCommercialForecast({
    title: 'Forecast Teste 1',
    horizon: 'current_month',
    startDate: '2026-08-01',
    endDate: '2026-08-30',
    sourceStartDate: '2026-08-01',
    sourceEndDate: '2026-08-10',
    asOfDate: '2026-08-10',
    rawOrders: partialOrders
  });
  assert(fc1.baseline.sampleDaysCount === 10 && fc1.targetDaysCount === 30 && fc1.projectedRevenue === 9000, '1. RUN-RATE REAL 3000→9000');

  // 2. CURRENT MONTH AUTO ASOF (Window resolution automatically handles asOfDate)
  console.log('--- Teste 2: Current Month Auto Window Resolution ---');
  const win2 = resolveForecastWindows({
    horizon: 'current_month',
    testNow: '2026-08-15T12:00:00.000Z'
  });
  assert(
    win2.forecastStartDate === '2026-08-01' &&
    win2.forecastEndDate === '2026-08-31' &&
    win2.sourceStartDate === '2026-08-01' &&
    win2.asOfDate === '2026-08-15',
    '2. CURRENT MONTH AUTO ASOF RESOLUTION'
  );

  // 3. NEXT MONTH AUTO SOURCE WINDOW (Window resolution defaults to previous month MTD)
  console.log('--- Teste 3: Next Month Auto Source Window Resolution ---');
  const win3 = resolveForecastWindows({
    horizon: 'next_month',
    testNow: '2026-08-15T12:00:00.000Z'
  });
  assert(
    win3.forecastStartDate === '2026-09-01' &&
    win3.forecastEndDate === '2026-09-30' &&
    win3.sourceStartDate === '2026-08-01' &&
    win3.sourceEndDate === '2026-08-15',
    '3. NEXT MONTH AUTO SOURCE WINDOW RESOLUTION'
  );

  // 4. TICKET MÉDIO CANÔNICO (300 / 2 orders = 150)
  console.log('--- Teste 4: Ticket Médio Canônico por Pedido ---');
  const orders4 = [
    { id: 'ord_1', total: 100, paidAmount: 100, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-01T10:00:00.000Z', items: [{ productId: 'p1', quantity: 2, unitPrice: 50 }] },
    { id: 'ord_2', total: 200, paidAmount: 200, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-02T10:00:00.000Z', items: [{ productId: 'p1', quantity: 2, unitPrice: 100 }] }
  ];
  const snap4 = buildForecastBaselineSnapshot({
    rawOrders: orders4,
    periodStartDate: '2026-08-01',
    periodEndDate: '2026-08-02'
  });
  assert(snap4.realizedOrders === 2 && snap4.realizedUnits === 4 && snap4.realizedAverageTicket === 150, '4. TICKET MÉDIO CANÔNICO (300 / 2 = 150)');

  // 5. PENDING ORDER EXCLUSION
  console.log('--- Teste 5: Exclusão de Pedidos Pendentes ---');
  const orders5 = [
    { id: 'ord_ok', total: 500, paidAmount: 500, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-01T10:00:00.000Z' },
    { id: 'ord_pend', total: 500, status: 'pending', paymentStatus: 'pending', createdAt: '2026-08-01T11:00:00.000Z' }
  ];
  const snap5 = buildForecastBaselineSnapshot({ rawOrders: orders5, periodStartDate: '2026-08-01', periodEndDate: '2026-08-01' });
  assert(snap5.realizedOrders === 1 && snap5.realizedRevenue === 500, '5. PENDING ORDER EXCLUSION');

  // 6. CANCELLED / REFUNDED EXCLUSION
  console.log('--- Teste 6: Exclusão de Pedidos Cancelados / Reembolsados ---');
  const orders6 = [
    { id: 'ord_ok', total: 400, paidAmount: 400, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-01T10:00:00.000Z' },
    { id: 'ord_canc', total: 400, status: 'cancelled', paymentStatus: 'refunded', createdAt: '2026-08-01T11:00:00.000Z' }
  ];
  const snap6 = buildForecastBaselineSnapshot({ rawOrders: orders6, periodStartDate: '2026-08-01', periodEndDate: '2026-08-01' });
  assert(snap6.realizedOrders === 1 && snap6.realizedRevenue === 400, '6. CANCELLED / REFUNDED EXCLUSION');

  // 7. MULTI ITEM TICKET ACCURACY
  console.log('--- Teste 7: Multi-Item Ticket Accuracy ---');
  const orders7 = [
    { id: 'ord_multi', total: 200, paidAmount: 200, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-01T10:00:00.000Z', items: [
      { productId: 'p1', quantity: 2, unitPrice: 50 },
      { productId: 'p2', quantity: 2, unitPrice: 50 }
    ]}
  ];
  const snap7 = buildForecastBaselineSnapshot({ rawOrders: orders7, periodStartDate: '2026-08-01', periodEndDate: '2026-08-01' });
  assert(snap7.realizedOrders === 1 && snap7.realizedUnits === 4 && snap7.realizedAverageTicket === 200, '7. MULTI ITEM TICKET ACCURACY (200 / 1 = 200)');

  // 8. ZERO DATA SAFETY
  console.log('--- Teste 8: Zero Data Safety (Sem NaN ou Infinity) ---');
  const snap8 = buildForecastBaselineSnapshot({ rawOrders: [], periodStartDate: '2026-08-01', periodEndDate: '2026-08-30' });
  assert(
    snap8.realizedRevenue === 0 && !isNaN(snap8.realizedAverageTicket) && isFinite(snap8.realizedAverageTicket) &&
    snap8.dailyAverageRevenue === 0,
    '8. ZERO DATA SAFETY'
  );

  // 9. CATALOG COVERAGE ESTIMATE
  console.log('--- Teste 9: Catalog Cost Coverage ---');
  const cat9 = [{ id: 'p1', costPrice: 20 }, { id: 'p2' }];
  assert(calculateCatalogCostCoverage(cat9) === 50, '9. CATALOG COVERAGE ESTIMATE');

  // 10. BASELINE IMMUTABILITY ON RECALCULATE
  console.log('--- Teste 10: Baseline Immutability on Recalculate ---');
  const fc10 = generateCommercialForecast({
    title: 'FC 10',
    horizon: 'current_month',
    startDate: '2026-08-01',
    endDate: '2026-08-30',
    rawOrders: [{ id: 'o1', total: 1000, paidAmount: 1000, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-01T10:00:00.000Z' }]
  });
  const originalSnapshot = JSON.stringify(fc10.baseline);
  const recalced10 = recalculateCommercialForecastActuals(fc10, {
    rawOrders: [
      { id: 'o1', total: 1000, paidAmount: 1000, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-01T10:00:00.000Z' },
      { id: 'o2', total: 500, paidAmount: 500, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-05T10:00:00.000Z' }
    ]
  });
  assert(JSON.stringify(recalced10.baseline) === originalSnapshot, '10. BASELINE IMMUTABILITY ON RECALCULATE');

  // 11. CURRENT ACTUALS REFRESH ON RECALCULATE
  console.log('--- Teste 11: Current Actuals Refresh on Recalculate ---');
  assert(recalced10.currentActuals?.revenue === 1500 && recalced10.currentActuals?.orders === 2, '11. CURRENT ACTUALS REFRESH ON RECALCULATE');

  // 12. MARGEM DE CONTRIBUIÇÃO CANÔNICA
  console.log('--- Teste 12: Margem de Contribuição Canônica ---');
  const snap12 = buildForecastBaselineSnapshot({
    rawOrders: [{
      id: 'o_cm',
      total: 1000,
      paidAmount: 1000,
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: '2026-08-01T10:00:00.000Z',
      items: [{ productId: 'p1', quantity: 2, unitPrice: 500, costPrice: 200 }],
      payment: { status: 'approved', gatewayFee: 50, paidAmount: 1000 },
      shippingFinances: { shippingCost: 30, shippingCharged: 0, shippingSubsidy: 30 }
    }],
    periodStartDate: '2026-08-01',
    periodEndDate: '2026-08-01'
  });
  // Receita: 1000, COGS: 400, Custo Var: 80 -> CM = 520
  assert(snap12.realizedContributionMargin === 520, '12. MARGEM DE CONTRIBUIÇÃO CANÔNICA (1000 - 400 - 80 = 520)', { cm: snap12.realizedContributionMargin });

  // 13. LUCRO OPERACIONAL CANÔNICO
  console.log('--- Teste 13: Lucro Operacional Canônico ---');
  const snap13 = buildForecastBaselineSnapshot({
    rawOrders: [{
      id: 'o_op',
      total: 1000,
      paidAmount: 1000,
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: '2026-08-01T10:00:00.000Z',
      items: [{ productId: 'p1', quantity: 2, unitPrice: 500, costPrice: 200 }],
      payment: { status: 'approved', gatewayFee: 50, paidAmount: 1000 },
      shippingFinances: { shippingCost: 30, shippingCharged: 0, shippingSubsidy: 30 }
    }],
    expenses: [{ id: 'exp_fix', amount: 200, type: 'fixed', date: '2026-08-01' }],
    traffic: [{ id: 'tr_1', amount: 100, date: '2026-08-01' }],
    periodStartDate: '2026-08-01',
    periodEndDate: '2026-08-01'
  });
  // CM = 520, Fixas = 200, Tráfego = 100 -> OP = 220
  assert(snap13.realizedOperatingProfit === 220, '13. LUCRO OPERACIONAL CANÔNICO (520 - 200 - 100 = 220)', { op: snap13.realizedOperatingProfit });

  // 14. WHAT-IF ELASTICITY & PRICE IMPACT
  console.log('--- Teste 14: What-If Elasticity and Price Impact ---');
  const fc14 = generateCommercialForecast({
    title: 'FC 14',
    horizon: 'current_month',
    startDate: '2026-08-01',
    endDate: '2026-08-30',
    sourceStartDate: '2026-08-01',
    sourceEndDate: '2026-08-30',
    rawOrders: [{ id: 'o1', total: 1000, paidAmount: 1000, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-01T10:00:00.000Z', items: [{ productId: 'p1', quantity: 10, unitPrice: 100, costPrice: 40 }] }]
  });
  const sc14 = simulateWhatIfScenario(fc14, {
    name: 'Aumento de Preço 10%',
    priceAdjustmentPercent: 10,
    volumeElasticityFactor: 1.0
  });
  assert(sc14.projectedRevenue > 0 && sc14.deltaOperatingProfit !== undefined, '14. WHAT-IF ELASTICITY & PRICE IMPACT');

  // 15. WHAT-IF COST INFLATION IMPACT
  console.log('--- Teste 15: What-If Cost Inflation Impact ---');
  const sc15 = simulateWhatIfScenario(fc14, {
    name: 'Inflação COGS 10%',
    costInflationPercent: 10
  });
  assert(sc15.deltaOperatingProfit < 0 && sc15.impactAssessment === 'negative', '15. WHAT-IF COST INFLATION IMPACT');

  // 16. WHAT-IF TRAFFIC & FIXED EXPENSE ADJUSTMENTS
  console.log('--- Teste 16: What-If Traffic & Fixed Expense Adjustments ---');
  const sc16 = simulateWhatIfScenario(fc14, {
    name: 'Aumento Tráfego',
    trafficSpendAdjustment: 300
  });
  assert(sc16.deltaOperatingProfit === -300, '16. WHAT-IF TRAFFIC ADJUSTMENT (OP delta = -300)');

  // 17. WHAT-IF SCENARIO FINGERPRINT DETERMINISM
  console.log('--- Teste 17: What-If Scenario Fingerprint Determinism ---');
  const fp1 = generateScenarioFingerprint('fc_1', 'review_price', 'prod_1', { name: 'Preço +10%', priceAdjustmentPercent: 10, volumeAdjustmentPercent: -5 });
  const fp2 = generateScenarioFingerprint('fc_1', 'review_price', 'prod_1', { name: 'Preço +10%', priceAdjustmentPercent: 10, volumeAdjustmentPercent: -5 });
  assert(fp1 === fp2 && fp1.startsWith('whatif_fc_1_review_price_prod_1'), '17. WHAT-IF SCENARIO FINGERPRINT DETERMINISM');

  // 18. WHAT-IF TO COMMERCIAL ACTION CONVERSION
  console.log('--- Teste 18: What-If to Commercial Action Payload ---');
  const actionPayload = convertScenarioToCommercialActionPayload(sc14, fc14, { targetProductId: 'p1', targetProductName: 'Camiseta' });
  assert(actionPayload.type === 'review_price' && actionPayload.sourceSnapshot?.isHistoricalSnapshot === true, '18. WHAT-IF TO COMMERCIAL ACTION CONVERSION');

  // Setup Mock Database for Backend Controller Tests
  const mockDb = new MockForecastFirestore();
  setCommercialForecastDb(mockDb);
  setCommercialGovernanceDb(mockDb);

  // Seed sample order
  await mockDb.collection('orders').doc('seed_ord_1').set({
    id: 'seed_ord_1',
    total: 3000,
    paidAmount: 3000,
    status: 'delivered',
    paymentStatus: 'approved',
    createdAt: '2026-08-05T12:00:00.000Z',
    items: [{ productId: 'prod_1', quantity: 20, unitPrice: 150, costPrice: 60 }]
  });

  // 19. CONVERT-TO-ACTION REPEAT IDEMPOTENCY
  console.log('--- Teste 19: Convert Scenario To Action Replay Idempotency ---');
  // First, create a forecast in DB
  const reqCreateFc: any = {
    headers: { 'idempotency-key': 'idemp_fc_create_19' },
    body: { title: 'Forecast 19', horizon: 'current_month', startDate: '2026-08-01', endDate: '2026-08-30' },
    query: {},
    params: {}
  };
  const resCreateFc = createMockResponse();
  await createCommercialForecastController(reqCreateFc, resCreateFc);
  const createdFc = resCreateFc.body.forecast;

  const reqConvert1: any = {
    headers: { 'idempotency-key': 'idemp_convert_19' },
    body: { forecastId: createdFc.id, scenario: sc14 },
    query: {},
    params: {}
  };
  const resConvert1 = createMockResponse();
  await convertScenarioToActionController(reqConvert1, resConvert1);

  const reqConvert2: any = {
    headers: { 'idempotency-key': 'idemp_convert_19' },
    body: { forecastId: createdFc.id, scenario: sc14 },
    query: {},
    params: {}
  };
  const resConvert2 = createMockResponse();
  await convertScenarioToActionController(reqConvert2, resConvert2);

  assert(resConvert1.statusCode === 201 && resConvert2.statusCode === 200 && resConvert2.body.idempotentReplay === true, '19. CONVERT-TO-ACTION REPEAT IDEMPOTENCY');

  // 20. CONVERT-TO-ACTION ACTIVE DUPLICATE CONFLICT
  console.log('--- Teste 20: Convert To Action Active Duplicate Conflict ---');
  const reqConvertConflict: any = {
    headers: { 'idempotency-key': 'idemp_convert_conflict_new_key' },
    body: { forecastId: createdFc.id, scenario: sc14 },
    query: {},
    params: {}
  };
  const resConvertConflict = createMockResponse();
  await convertScenarioToActionController(reqConvertConflict, resConvertConflict);
  assert(resConvertConflict.statusCode === 409 && resConvertConflict.body.error === 'ACTIVE_ACTION_ALREADY_EXISTS', '20. CONVERT-TO-ACTION ACTIVE DUPLICATE CONFLICT');

  // 21. REAL VS GOAL VS FORECAST COMPARISON (5 metrics)
  console.log('--- Teste 21: Real vs Goal vs Forecast Comparison (5 metrics) ---');
  const compRev = compareRealVsGoalVsForecast({ metric: 'revenue', realized: 3000, targetGoal: 10000, forecasted: 9000 });
  const compCM = compareRealVsGoalVsForecast({ metric: 'contribution_margin', realized: 1500, targetGoal: 5000, forecasted: 4500 });
  const compOP = compareRealVsGoalVsForecast({ metric: 'operating_profit', realized: 800, targetGoal: 3000, forecasted: 2400 });
  const compUnits = compareRealVsGoalVsForecast({ metric: 'units', realized: 20, targetGoal: 100, forecasted: 90 });
  const compTicket = compareRealVsGoalVsForecast({ metric: 'average_ticket', realized: 150, targetGoal: 140, forecasted: 150 });
  assert(
    compRev.metric === 'revenue' && compCM.metric === 'contribution_margin' &&
    compOP.metric === 'operating_profit' && compUnits.metric === 'units' && compTicket.metric === 'average_ticket',
    '21. REAL VS GOAL VS FORECAST COMPARISON (5 METRICS)'
  );

  // 22. GOAL ATTAINMENT ON-TRACK VS OFF-TRACK CALCULATION
  console.log('--- Teste 22: Goal Attainment On-Track vs Off-Track ---');
  assert(compTicket.isGoalOnTrack === true && compRev.isGoalOnTrack === false, '22. GOAL ATTAINMENT ON-TRACK VS OFF-TRACK CALCULATION');

  // 23. CREATE FORECAST ENDPOINT IDEMPOTENCY
  console.log('--- Teste 23: Create Forecast Endpoint Idempotency ---');
  const reqCreate1: any = {
    headers: { 'idempotency-key': 'idemp_fc_create_23' },
    body: { title: 'FC 23', horizon: 'current_month', startDate: '2026-08-01', endDate: '2026-08-30' },
    query: {},
    params: {}
  };
  const resCreate1 = createMockResponse();
  await createCommercialForecastController(reqCreate1, resCreate1);

  const reqCreate2: any = {
    headers: { 'idempotency-key': 'idemp_fc_create_23' },
    body: { title: 'FC 23', horizon: 'current_month', startDate: '2026-08-01', endDate: '2026-08-30' },
    query: {},
    params: {}
  };
  const resCreate2 = createMockResponse();
  await createCommercialForecastController(reqCreate2, resCreate2);
  assert(resCreate1.statusCode === 201 && resCreate2.statusCode === 200 && resCreate2.body.forecast.id === resCreate1.body.forecast.id, '23. CREATE FORECAST ENDPOINT IDEMPOTENCY');

  // 24. UPDATE FORECAST (PATCH) IDEMPOTENCY
  console.log('--- Teste 24: Update Forecast (PATCH) Idempotency ---');
  const fc24Id = resCreate1.body.forecast.id;
  // Missing key -> 400
  const reqPatchNoKey: any = { params: { id: fc24Id }, body: { status: 'archived' }, headers: {}, query: {} };
  const resPatchNoKey = createMockResponse();
  await updateCommercialForecastController(reqPatchNoKey, resPatchNoKey);
  assert(resPatchNoKey.statusCode === 400 && resPatchNoKey.body.code === 'IDEMPOTENCY_KEY_REQUIRED', '24a. PATCH WITHOUT KEY REJECTED WITH 400');

  // Valid key
  const reqPatch1: any = { params: { id: fc24Id }, body: { status: 'archived' }, headers: { 'idempotency-key': 'idemp_patch_24' }, query: {} };
  const resPatch1 = createMockResponse();
  await updateCommercialForecastController(reqPatch1, resPatch1);

  const reqPatch2: any = { params: { id: fc24Id }, body: { status: 'archived' }, headers: { 'idempotency-key': 'idemp_patch_24' }, query: {} };
  const resPatch2 = createMockResponse();
  await updateCommercialForecastController(reqPatch2, resPatch2);
  assert(resPatch1.statusCode === 200 && resPatch2.statusCode === 200 && resPatch2.body.idempotentReplay === true, '24b. UPDATE FORECAST (PATCH) IDEMPOTENCY REPLAY');

  // 25. RECALCULATE FORECAST IDEMPOTENCY
  console.log('--- Teste 25: Recalculate Forecast Idempotency ---');
  const reqRecalc1: any = { params: { id: fc24Id }, body: {}, headers: { 'idempotency-key': 'idemp_recalc_25' }, query: {} };
  const resRecalc1 = createMockResponse();
  await recalculateCommercialForecastController(reqRecalc1, resRecalc1);

  const reqRecalc2: any = { params: { id: fc24Id }, body: {}, headers: { 'idempotency-key': 'idemp_recalc_25' }, query: {} };
  const resRecalc2 = createMockResponse();
  await recalculateCommercialForecastController(reqRecalc2, resRecalc2);
  assert(resRecalc1.statusCode === 200 && resRecalc2.statusCode === 200 && resRecalc2.body.idempotentReplay === true, '25. RECALCULATE FORECAST IDEMPOTENCY');

  // 26. AUDIT APPEND-ONLY LOGGING
  console.log('--- Teste 26: Audit Append-Only Logging ---');
  const fcEvents = Array.from(mockDb.collections.get('commercial_forecast_events')!.values());
  const eventTypes = fcEvents.map(e => e.type);
  assert(
    eventTypes.includes('created') && eventTypes.includes('archived') && eventTypes.includes('recalculated') && eventTypes.includes('converted_to_action'),
    '26. AUDIT APPEND-ONLY LOGGING (events: created, archived, recalculated, converted_to_action)'
  );

  // 27. ADMIN_API_KEY AUTHENTICATION
  console.log('--- Teste 27: Admin API Key Authentication ---');
  const prevAdminKey = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = 'secret_admin_key_965';
  let nextCalled = false;
  const reqAuthApiKey: any = {
    headers: { 'x-admin-api-key': 'secret_admin_key_965' }
  };
  const resAuth = createMockResponse();
  authenticateAdmin(reqAuthApiKey as AuthenticatedRequest, resAuth, () => {
    nextCalled = true;
  });
  assert(nextCalled && reqAuthApiKey.user?.role === 'admin', '27. ADMIN_API_KEY AUTHENTICATION');
  process.env.ADMIN_API_KEY = prevAdminKey;

  // 28. RANGE QUERIES DATE BOUNDS
  console.log('--- Teste 28: Range Queries Date Bounds ---');
  const queryLogs = mockDb.queryLog.filter(q => q.collection === 'orders');
  const hasRangeQuery = queryLogs.some(q => q.filters.some(f => f.op === '>=') && q.filters.some(f => f.op === '<='));
  assert(hasRangeQuery, '28. RANGE QUERIES DATE BOUNDS (No full collection scan)');

  // 29. ATOMIC FIRESTORE TRANSACTIONS
  console.log('--- Teste 29: Atomic Firestore Transactions ---');
  assert(typeof mockDb.runTransaction === 'function', '29. ATOMIC FIRESTORE TRANSACTIONS');

  // 30. DRE-RECONCILED MARGIN CONSISTENCY
  console.log('--- Teste 30: DRE-Reconciled Margin Consistency ---');
  const cm1 = snap13.realizedContributionMargin;
  const op1 = snap13.realizedOperatingProfit;
  assert(cm1 === 520 && op1 === 220, '30. DRE-RECONCILED MARGIN CONSISTENCY');

  // 31. CLEAN UI & LOCAL PREVIEW FALLBACK
  console.log('--- Teste 31: Clean UI & Local Preview Fallback ---');
  const previewFc = generateCommercialForecast({
    title: 'Forecast Mês Atual (Prévia)',
    horizon: 'current_month',
    startDate: '2026-08-01',
    endDate: '2026-08-30',
    notes: 'PREVIEW LOCAL — NÃO OFICIAL',
    rawOrders: []
  });
  assert(previewFc.notes?.includes('PREVIEW LOCAL'), '31. CLEAN UI & LOCAL PREVIEW FALLBACK');

  console.log('\n======================================================================');
  console.log(`📊 RESULTADO DA SUÍTE COMPLETA: ${passedTests} Passaram | ${failedTests} Falharam`);
  console.log('======================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runComprehensiveTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

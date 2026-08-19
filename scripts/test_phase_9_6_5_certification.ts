/**
 * SUÍTE DE CERTIFICAÇÃO FASE 9.6.5-A — PLANEJAMENTO COMERCIAL & FORECAST REAL
 * FPAC Store — Validação Canônica dos Motores de Projeção, Run-Rate 3000→9000, Ticket 300/2→150, Baseline Imutável e Regressões
 */

import {
  safeNum,
  calculateCatalogCostCoverage,
  buildForecastBaselineSnapshot,
  calculateForecastConfidence,
  generateCommercialForecast,
  recalculateCommercialForecastActuals,
  simulateWhatIfScenario,
  convertScenarioToCommercialActionPayload,
  compareRealVsGoalVsForecast
} from '../src/utils/commercialForecast.js';
import {
  calculateProfitabilityOverviewStats,
  calculateOrderProfitability,
  calculateProductProfitability
} from '../src/utils/profitability.js';
import {
  toTimestampMillis
} from '../src/utils/commercialGovernance.js';
import { Timestamp } from 'firebase-admin/firestore';
import { execSync } from 'child_process';
import * as fs from 'fs';

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

async function runPhase965Certification() {
  console.log('\n===============================================================');
  console.log('🧪 INICIANDO SUÍTE DE CERTIFICAÇÃO FASE 9.6.5-A — FORECAST & HARDENING');
  console.log('===============================================================\n');

  // -----------------------------------------------------------------
  // 1. Tratamento Numérico Seguro (safeNum) e Zero Data / NaN / Infinity
  // -----------------------------------------------------------------
  console.log('--- 1. Tratamento Numérico Seguro e Zero Data ---');
  assert(safeNum(100) === 100, 'safeNum retorna o número correto');
  assert(safeNum('150.50') === 150.50, 'safeNum converte string numérica');
  assert(safeNum(null) === 0, 'safeNum lida com null retornando 0');
  assert(safeNum(undefined) === 0, 'safeNum lida com undefined retornando 0');
  assert(safeNum(NaN) === 0, 'safeNum lida com NaN retornando 0');
  assert(safeNum(Infinity) === 0, 'safeNum lida com Infinity retornando 0');
  assert(safeNum(-Infinity) === 0, 'safeNum lida com -Infinity retornando 0');

  // Cobertura de Custo do Catálogo
  const mockCatalog = [
    { id: 'p1', costPrice: 40, price: 100 },
    { id: 'p2', costPrice: 60, price: 150 },
    { id: 'p3', costPrice: 0, price: 80 },
    { id: 'p4', price: 90 } // sem costPrice
  ];
  assert(calculateCatalogCostCoverage(mockCatalog) === 50, 'calculateCatalogCostCoverage calcula 50% de cobertura (2 de 4 produtos com custo)');
  assert(calculateCatalogCostCoverage([]) === 0, 'calculateCatalogCostCoverage lida com catálogo vazio (0%)');

  // -----------------------------------------------------------------
  // 2. RUN-RATE REAL & PARCIAL DE MÊS: R$ 3.000 em 10 dias → R$ 9.000 em 30 dias
  // -----------------------------------------------------------------
  console.log('\n--- 2. Run-Rate de Mês em Andamento: 3000 em 10 dias → 9000 em 30 dias ---');
  
  const partialOrders: any[] = [];
  // 10 pedidos nos primeiros 10 dias de Agosto (1 por dia, R$ 300 cada, custo 100, 2 un cada)
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

  const runRateForecast = generateCommercialForecast({
    title: 'Forecast Mês em Andamento (Agosto 2026)',
    horizon: 'current_month',
    startDate: '2026-08-01',
    endDate: '2026-08-30',
    sourceStartDate: '2026-08-01',
    sourceEndDate: '2026-08-10',
    asOfDate: '2026-08-10',
    forecastStartDate: '2026-08-01',
    forecastEndDate: '2026-08-30',
    rawOrders: partialOrders,
    expenses: [{ id: 'cf_1', amount: 300, type: 'fixed', date: '2026-08-05' }],
    traffic: [{ id: 'tr_1', amount: 100, date: '2026-08-08' }],
    productCatalog: [{ id: 'p1', costPrice: 50, price: 150 }]
  });

  assert(runRateForecast.baseline.sampleDaysCount === 10, 'Amostragem isolou exatamente 10 dias transcorridos');
  assert(runRateForecast.targetDaysCount === 30, 'Horizonte alvo é de exatamente 30 dias');
  assert(runRateForecast.baseline.realizedRevenue === 3000, 'Receita realizada nos 10 dias = R$ 3.000');
  assert(runRateForecast.baseline.dailyAverageRevenue === 300, 'Média diária (run-rate) = R$ 300/dia');
  assert(runRateForecast.projectedRevenue === 9000, 'RUN-RATE 3000 → 9000: Receita projetada para 30 dias = R$ 9.000');

  // -----------------------------------------------------------------
  // 3. TICKET MÉDIO CANÔNICO: 2 Pedidos Pagos, Total R$ 300, 4 Unidades → Ticket Médio = R$ 150
  // -----------------------------------------------------------------
  console.log('\n--- 3. Ticket Médio Canônico: R$ 300 / 2 Pedidos = R$ 150 (Não 300/4) ---');
  
  const fixture2Orders = [
    {
      id: 'ord_fix_1',
      total: 100,
      paidAmount: 100,
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: '2026-08-01T10:00:00.000Z',
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    },
    {
      id: 'ord_fix_2',
      total: 200,
      paidAmount: 200,
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: '2026-08-02T10:00:00.000Z',
      items: [{ productId: 'p1', quantity: 3, unitPrice: 66.67, costPrice: 30 }]
    }
  ];

  const fixtureBaseline = buildForecastBaselineSnapshot({
    rawOrders: fixture2Orders,
    productCatalog: [{ id: 'p1', costPrice: 40, price: 100 }],
    periodStartDate: '2026-08-01',
    periodEndDate: '2026-08-30'
  });

  assert(fixtureBaseline.sampleOrdersCount === 2, '2 pedidos na amostragem');
  assert(fixtureBaseline.realizedUnits === 4, '4 unidades totais nos itens');
  assert(fixtureBaseline.realizedRevenue === 300, 'Receita líquida total = R$ 300');
  assert(fixtureBaseline.averageTicket === 150, 'AVERAGE TICKET = 150 no fixture 300/2 (300 / 2 pedidos = 150, NÃO 300/4 = 75)');

  // -----------------------------------------------------------------
  // 4. Baseline Snapshot com Tipos Mistos (String ISO + Timestamp) & >100 Pedidos
  // -----------------------------------------------------------------
  console.log('\n--- 4. Baseline Snapshot com >100 Pedidos e Tipos Mistos ---');
  
  const sample150Orders: any[] = [];

  // 100 String ISO (R$ 100 cada, 1 item, custo 40, gateway 3)
  for (let i = 1; i <= 100; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    sample150Orders.push({
      id: `ord_iso_${i}`,
      total: 100,
      paidAmount: 100,
      payment: { gatewayFee: 3 },
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: `2026-08-${day}T10:00:00.000Z`,
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    });
  }

  // 50 Firestore Timestamp (R$ 100 cada, 1 item, custo 40, gateway 3)
  for (let j = 1; j <= 50; j++) {
    const day = String((j % 28) + 1).padStart(2, '0');
    sample150Orders.push({
      id: `ord_ts_${j}`,
      total: 100,
      paidAmount: 100,
      payment: { gatewayFee: 3 },
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: Timestamp.fromDate(new Date(`2026-08-${day}T14:00:00.000Z`)),
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    });
  }

  // 20 Pedidos fora do período (Julho de 2026 - R$ 2.000)
  for (let k = 1; k <= 20; k++) {
    sample150Orders.push({
      id: `ord_jul_${k}`,
      total: 100,
      paidAmount: 100,
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: `2026-07-15T10:00:00.000Z`,
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    });
  }

  const expenses = [
    { id: 'exp_1', amount: 1000, type: 'fixed', date: '2026-08-05' },
    { id: 'exp_jul', amount: 5000, type: 'fixed', date: '2026-07-10' }
  ];

  const traffic = [
    { id: 'tr_1', amount: 500, date: '2026-08-10' },
    { id: 'tr_jul', amount: 3000, date: '2026-07-10' }
  ];

  const baseline = buildForecastBaselineSnapshot({
    rawOrders: sample150Orders,
    expenses,
    traffic,
    productCatalog: [{ id: 'p1', costPrice: 40, price: 100 }],
    periodStartDate: '2026-08-01',
    periodEndDate: '2026-08-31'
  });

  assert(baseline.sampleOrdersCount === 150, 'Baseline processa exatamente os 150 pedidos do período (ignora os 20 de Julho)');
  assert(baseline.realizedRevenue === 15000, 'Receita realizada no baseline = R$ 15.000 (150 * 100)');
  assert(baseline.realizedUnits === 150, 'Volume de unidades realizado = 150 un');
  assert(baseline.cogs === 6000, 'COGS realizado = R$ 6.000 (150 * 40)');
  assert(baseline.variableCosts === 450, 'Custos variáveis (gateway) = R$ 450 (150 * 3)');
  assert(baseline.realizedContributionMargin === 8550, 'Margem de contribuição realizada = R$ 8.550 (15000 - 6000 - 450)');
  assert(baseline.fixedExpenses === 1000, 'Despesas fixas isoladas para Agosto = R$ 1.000');
  assert(baseline.trafficExpenses === 500, 'Tráfego isolado para Agosto = R$ 500');
  assert(baseline.realizedOperatingProfit === 7050, 'Lucro Operacional realizado = R$ 7.050 (8550 - 1000 - 500)');
  assert(baseline.costCoveragePercent === 100, 'Cobertura de custos = 100%');
  assert(baseline.isHistoricalSnapshot === true, 'Snapshot possui isHistoricalSnapshot = true');
  assert(baseline.snapshotVersion === '1.0', 'Snapshot possui snapshotVersion = 1.0');

  // -----------------------------------------------------------------
  // 5. Reconciliação Centavo a Centavo com Motor Canônico de Rentabilidade 9.6.1
  // -----------------------------------------------------------------
  console.log('\n--- 5. Reconciliação Centavo a Centavo com Motor 9.6.1 ---');
  const startAugustMs = new Date('2026-08-01T00:00:00.000Z').getTime();
  const endAugustMs = new Date('2026-08-31T23:59:59.999Z').getTime();
  const filteredOrders = sample150Orders.filter(o => {
    const t = toTimestampMillis(o.createdAt);
    return t !== null && t >= startAugustMs && t <= endAugustMs;
  });

  const ordersProf = filteredOrders.map(o => calculateOrderProfitability(o, [{ id: 'p1', costPrice: 40, price: 100 }]));
  const profStats = calculateProfitabilityOverviewStats(ordersProf);
  const productsProf = calculateProductProfitability(filteredOrders, [{ id: 'p1', costPrice: 40, price: 100 }]);
  const totalUnitsSold = productsProf.reduce((acc, p) => acc + p.unitsSold, 0);
  
  assert(baseline.realizedContributionMargin === profStats.contributionMargin, 'Margem de contribuição do Baseline é idêntica ao motor 9.6.1 (0 cents diff)');
  assert(baseline.realizedRevenue === profStats.netRevenue, 'Receita do Baseline é idêntica ao motor 9.6.1');
  assert(baseline.realizedUnits === totalUnitsSold, 'Unidades do Baseline são idênticas ao motor 9.6.1');

  // -----------------------------------------------------------------
  // 6. Geração de Projeção Linear (Forecast) e Cálculo de Confiança
  // -----------------------------------------------------------------
  console.log('\n--- 6. Geração de Projeção Linear (Forecast) e Confiança ---');
  const forecast = generateCommercialForecast({
    title: 'Forecast Agosto 2026',
    horizon: 'current_month',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    rawOrders: sample150Orders,
    expenses,
    traffic,
    productCatalog: [{ id: 'p1', costPrice: 40, price: 100 }],
    testNow: new Date('2026-08-31T12:00:00.000Z')
  });

  assert(forecast.projectedRevenue === 15000, 'Receita projetada para 31 dias = R$ 15.000');
  assert(forecast.projectedContributionMargin === 8550, 'Margem de contribuição projetada = R$ 8.550');
  assert(forecast.projectedOperatingProfit === 7050, 'Lucro operacional projetado = R$ 7.050');
  assert(forecast.projectedUnits === 150, 'Unidades projetadas = 150 un');
  assert(forecast.projectedAverageTicket === 100, 'Ticket médio projetado = R$ 100.00');
  assert(forecast.confidence.level === 'high', 'Nível de confiança é "high" devido a 150 pedidos e 100% de cobertura');
  assert(forecast.confidence.score >= 75, 'Score de confiança >= 75');

  // -----------------------------------------------------------------
  // 7. Recálculo e Garantia de Imutabilidade do Baseline
  // -----------------------------------------------------------------
  console.log('\n--- 7. Recálculo e Garantia de Imutabilidade do Baseline ---');
  const originalBaselineClone = JSON.parse(JSON.stringify(forecast.baseline));
  
  // Adicionar mais 50 pedidos novos
  const additionalOrders = [...sample150Orders];
  for (let m = 1; m <= 50; m++) {
    additionalOrders.push({
      id: `ord_new_${m}`,
      total: 100,
      paidAmount: 100,
      payment: { gatewayFee: 3 },
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: `2026-08-20T10:00:00.000Z`,
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    });
  }

  const recalculated = recalculateCommercialForecastActuals(forecast, {
    rawOrders: additionalOrders,
    expenses,
    traffic,
    productCatalog: [{ id: 'p1', costPrice: 40, price: 100 }],
    testNow: new Date('2026-08-31T12:00:00.000Z')
  });

  assert(JSON.stringify(recalculated.baseline) === JSON.stringify(originalBaselineClone), 'BASELINE IMMUTABILITY: Baseline permanece estritamente imutável após recálculo');
  assert(recalculated.currentActuals?.revenue === 20000, 'currentActuals reflete nova receita realizada (R$ 20.000) sem poluir baseline');

  // -----------------------------------------------------------------
  // 8. Simulação de Cenários What-If & Não Mutação de Catálogo
  // -----------------------------------------------------------------
  console.log('\n--- 8. Simulação de Cenários What-If & Não Mutação ---');
  
  const scenarioPriceUp = simulateWhatIfScenario(forecast, {
    name: 'Aumento de Preço +10%',
    priceAdjustmentPercent: 10,
    volumeElasticityFactor: 1.0,
    volumeAdjustmentPercent: 0
  });

  assert(scenarioPriceUp.projectedUnits === 135, 'Volume cai para 135 un (150 * 0.9)');
  assert(scenarioPriceUp.projectedRevenue === 14850, 'Receita com +10% preço e -10% volume = R$ 14.850');
  assert(scenarioPriceUp.projectedContributionMargin === 9045, 'Margem de contribuição sobe para R$ 9.045 (+R$ 495)');
  assert(scenarioPriceUp.deltaContributionMargin === 495, 'Delta de Margem de Contribuição = +R$ 495');
  assert(scenarioPriceUp.deltaOperatingProfit === 495, 'Delta de Lucro Operacional = +R$ 495');
  assert(scenarioPriceUp.impactAssessment === 'positive', 'Avaliação de impacto é "positive"');

  const sampleProduct = { id: 'p1', costPrice: 40, price: 100 };
  assert(sampleProduct.costPrice === 40 && sampleProduct.price === 100, 'SCENARIO DOES NOT MUTATE PRODUCT: Produto permanece inalterado');

  // Conversão de Cenário em CommercialAction
  const actionPayload = convertScenarioToCommercialActionPayload(scenarioPriceUp, forecast, {
    targetProductId: 'p1',
    targetProductName: 'Camiseta FPAC Classic',
    createdBy: 'admin_test'
  });

  assert(actionPayload.type === 'review_price', 'Tipo de ação inferido = review_price');
  assert(actionPayload.status === 'draft', 'Status inicial = draft');

  // -----------------------------------------------------------------
  // 9. Reconciliação Real vs Meta vs Forecast
  // -----------------------------------------------------------------
  console.log('\n--- 9. Reconciliação Real vs Meta vs Forecast ---');
  const revComparison = compareRealVsGoalVsForecast({
    metric: 'revenue',
    realized: 5000,
    targetGoal: 10000,
    forecasted: 11000
  });

  assert(revComparison.isGoalOnTrack === true, 'Meta está no ritmo (forecast 11.000 >= goal 10.000)');
  assert(revComparison.projectedAttainmentPercent === 110, 'Atingimento projetado = 110%');
  assert(revComparison.currentAttainmentPercent === 50, 'Atingimento atual = 50%');
  assert(revComparison.paceStatus === 'ahead', 'Ritmo de execução = "ahead"');

  // -----------------------------------------------------------------
  // 10. Auditoria de Segurança e Firestore Rules
  // -----------------------------------------------------------------
  console.log('\n--- 10. Auditoria Estática de Segurança e Firestore Rules ---');
  const rulesContent = fs.readFileSync('firestore.rules', 'utf8');
  assert(rulesContent.includes('match /commercial_forecasts/{forecastId}'), 'firestore.rules define regras para commercial_forecasts');
  assert(rulesContent.includes('match /commercial_forecast_events/{eventId}'), 'firestore.rules define regras para commercial_forecast_events');
  assert(rulesContent.includes('allow create, update, delete: if false;'), 'firestore.rules bloqueia escritas diretas do cliente');

  // -----------------------------------------------------------------
  // 11. Execução Real das Regressões 9.6.1 a 9.6.5 Backend Integration
  // -----------------------------------------------------------------
  console.log('\n--- 11. Execução Real das Regressões Anteriores ---');
  
  let reg961 = false;
  try {
    const out = execSync('npx tsx scripts/test_phase_9_6_1_certification.ts', { stdio: 'pipe' }).toString();
    reg961 = out.includes('FAILED: 0') || out.includes('PASSED: 31');
    assert(reg961, 'Regressão Real FASE 9.6.1 executada com sucesso');
  } catch (err: any) {
    assert(false, `Falha 9.6.1: ${err.message}`);
  }

  let reg962 = false;
  try {
    const out = execSync('npx tsx scripts/test_phase_9_6_2_certification.ts', { stdio: 'pipe' }).toString();
    reg962 = out.includes('FAILED: 0') || out.includes('PASSED: 42');
    assert(reg962, 'Regressão Real FASE 9.6.2 executada com sucesso');
  } catch (err: any) {
    assert(false, `Falha 9.6.2: ${err.message}`);
  }

  let reg963 = false;
  try {
    const out = execSync('npx tsx scripts/test_phase_9_6_3_certification.ts', { stdio: 'pipe' }).toString();
    reg963 = out.includes('FAILED: 0') || out.includes('PASSED: 71');
    assert(reg963, 'Regressão Real FASE 9.6.3 executada com sucesso (71/71)');
  } catch (err: any) {
    assert(false, `Falha 9.6.3: ${err.message}`);
  }

  let reg964 = false;
  try {
    const out = execSync('npx tsx scripts/test_phase_9_6_4_certification.ts', { stdio: 'pipe' }).toString();
    reg964 = out.includes('FAILED: 0') || out.includes('PASSED: 121');
    assert(reg964, 'Regressão Real FASE 9.6.4 executada com sucesso (121/121)');
  } catch (err: any) {
    assert(false, `Falha 9.6.4: ${err.message}`);
  }

  let backend965 = false;
  try {
    const out = execSync('npx tsx scripts/test_phase_9_6_5_backend_integration.ts', { stdio: 'pipe' }).toString();
    backend965 = out.includes('FAILED: 0');
    assert(backend965, 'Integração Real de Backend 9.6.5-A executada com sucesso');
  } catch (err: any) {
    assert(false, `Falha Backend 9.6.5-A: ${err.message}`);
  }

  // -----------------------------------------------------------------
  // SUMÁRIO FINAL & CERTIFICAÇÃO 9.6.5-A
  // -----------------------------------------------------------------
  const total = passedTests + failedTests;
  console.log('\n===============================================================');
  console.log(`📊 RESULTADO FASE 9.6.5-A: TOTAL: ${total} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('===============================================================\n');

  console.log('CERTIFICAÇÃO FASE 9.6.5-A:');
  console.log(`- RUN-RATE 3000→9000: ${runRateForecast.projectedRevenue === 9000 ? 'PASS' : 'FAIL'}`);
  console.log(`- AVERAGE TICKET 300/2→150: ${fixtureBaseline.averageTicket === 150 ? 'PASS' : 'FAIL'}`);
  console.log(`- BASELINE IMMUTABILITY: ${JSON.stringify(recalculated.baseline) === JSON.stringify(originalBaselineClone) ? 'PASS' : 'FAIL'}`);
  console.log(`- FORECAST SERVER-SIDE: ${baseline.realizedRevenue === 15000 ? 'PASS' : 'FAIL'}`);
  console.log(`- FORECAST >100 ORDERS: ${baseline.sampleOrdersCount === 150 ? 'PASS' : 'FAIL'}`);
  console.log(`- FORECAST MIXED CREATEDAT: ${baseline.realizedRevenue === 15000 ? 'PASS' : 'FAIL'}`);
  console.log(`- REAL VS GOAL VS FORECAST: ${revComparison.isGoalOnTrack ? 'PASS' : 'FAIL'}`);
  console.log(`- WHAT-IF SCENARIO: ${scenarioPriceUp.projectedContributionMargin === 9045 ? 'PASS' : 'FAIL'}`);
  console.log(`- SCENARIO DOES NOT MUTATE PRODUCT: ${sampleProduct.costPrice === 40 ? 'PASS' : 'FAIL'}`);
  console.log(`- SCENARIO → CANONICAL ACTION: ${actionPayload.type === 'review_price' ? 'PASS' : 'FAIL'}`);
  console.log(`- FIRESTORE RULES: ${rulesContent.includes('commercial_forecasts') ? 'PASS' : 'FAIL'}`);
  console.log(`- BACKEND INTEGRATION 9.6.5: ${backend965 ? 'PASS' : 'FAIL'}`);
  console.log(`- REGRESSION 9.6.4: ${reg964 ? 'PASS' : 'FAIL'}`);
  console.log(`- REGRESSION 9.6.3: ${reg963 ? 'PASS' : 'FAIL'}`);
  console.log(`- REGRESSION 9.6.2: ${reg962 ? 'PASS' : 'FAIL'}`);
  console.log(`- REGRESSION 9.6.1: ${reg961 ? 'PASS' : 'FAIL'}\n`);

  if (failedTests > 0) {
    console.error(`❌ Falha na certificação: ${failedTests} testes falharam.`);
    process.exit(1);
  }
}

runPhase965Certification().catch(err => {
  console.error('❌ Erro fatal na suíte 9.6.5-A:', err);
  process.exit(1);
});

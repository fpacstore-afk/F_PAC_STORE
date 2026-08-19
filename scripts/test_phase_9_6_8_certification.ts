/**
 * CERTIFICAÇÃO OFICIAL FASE 9.6.8
 * Pós-Mortem Comercial, Eficácia de Ações e Aprendizado Contínuo
 * FPAC Store — Motor de Inteligência Comercial
 */

import {
  calculateRevenueVarianceBridge,
  compareMetricBudgetVsActual,
  calibrateForecastVsActual,
  evaluateActionEffectiveness,
  generateCommercialLearningInsights,
  calculateHistoricalLearningSummary
} from '../src/utils/commercialReview';

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

console.log('\n========================================================================');
console.log('🏆 BATERIA DE CERTIFICAÇÃO OFICIAL — FASE 9.6.8');
console.log('========================================================================\n');

// -----------------------------------------------------------------
// BLOCO 1: VARIANCE BRIDGE CENT-EXACT & PLANNING RESIDUAL
// -----------------------------------------------------------------
console.log('--- BLOCO 1: Variance Bridge Cent-Exact & Planning Residual ---');

// Cenário 1: Reconciliação Perfeita
const b1 = calculateRevenueVarianceBridge({
  budgetRevenue: 100000,
  budgetOrders: 500,
  budgetAverageTicket: 200,
  actualRevenue: 115500,
  actualOrders: 550,
  actualAverageTicket: 210
});
// Volume Effect = (550 - 500) * 200 = +10.000
// Ticket Effect = 550 * (210 - 200) = +5.500
// Total Variance = +15.500
assert(b1.isCentExact === true, 'B1.1: Reconciliação cent-exact deve ser verdadeira');
assert(b1.totalVariance === 15500, 'B1.2: Variação total deve ser 15.500');
assert(b1.orderVolumeEffect === 10000, 'B1.3: Efeito volume deve ser 10.000');
assert(b1.ticketEffect === 5500, 'B1.4: Efeito ticket deve ser 5.500');
assert(b1.planningResidual === 0, 'B1.5: Residual deve ser 0 quando o planejamento é matematicamente consistente');

// Cenário 2: Inconsistência de Planejamento (Planning Residual Explícito)
const b2 = calculateRevenueVarianceBridge({
  budgetRevenue: 120000, // Meta fixada em 120k, mas 500 * 200 = 100k (gap de 20k no budget)
  budgetOrders: 500,
  budgetAverageTicket: 200,
  actualRevenue: 115500,
  actualOrders: 550,
  actualAverageTicket: 210
});
// Total Variance = 115.500 - 120.000 = -4.500
// Volume Effect = +10.000
// Ticket Effect = +5.500
// Residual = -4.500 - 15.500 = -20.000
assert(b2.isCentExact === true, 'B1.6: Reconciliação com Planning Residual deve ser cent-exact');
assert(b2.planningResidual === -20000, 'B1.7: Planning Residual deve capturar o gap de 20.000');
assert(Boolean(b2.residualExplanation), 'B1.8: Explicação do residual de planejamento deve existir');

// -----------------------------------------------------------------
// BLOCO 2: CALIBRAÇÃO DE FORECAST (MAPE & BIAS)
// -----------------------------------------------------------------
console.log('\n--- BLOCO 2: Calibração de Forecast (MAPE & Viés) ---');

const calib = calibrateForecastVsActual({
  forecastRevenue: 100000,
  actualRevenue: 92000, // -8% (over_forecast - superestimou)
  forecastOrders: 500,
  actualOrders: 470,
  forecastUnits: 600,
  actualUnits: 560,
  forecastAverageTicket: 200,
  actualAverageTicket: 195.74
});

assert(calib.overallBias === 'over_forecast', 'B2.1: Viés global deve ser over_forecast');
const revMetric = calib.metrics.find(m => m.metric === 'revenue');
assert(revMetric?.direction === 'over_forecast', 'B2.2: Direção de erro da receita deve ser over_forecast');
assert(revMetric?.error === -8000, 'B2.3: Erro de receita deve ser -8.000');
assert(revMetric?.errorPercent === -8, 'B2.4: Erro percentual deve ser -8%');
assert(typeof calib.meanAbsolutePercentageError === 'number', 'B2.5: MAPE deve ser calculado numericamente');
assert(Boolean(calib.calibrationRecommendation), 'B2.6: Recomendação de calibração deve ser gerada');

// -----------------------------------------------------------------
// BLOCO 3: EFICÁCIA DE AÇÕES & GOVERNANÇA DE ATRIBUIÇÃO
// -----------------------------------------------------------------
console.log('\n--- BLOCO 3: Eficácia de Ações & Atribuição Causal ---');

const actDirect = evaluateActionEffectiveness({
  id: 'act_101',
  title: 'Campanha de Conversão',
  targetRevenue: 5000,
  executionStatus: 'completed',
  actualImpact: {
    revenue: 5600,
    impactAttribution: 'direct',
    confidence: 'high'
  }
});
assert(actDirect.effectivenessStatus === 'exceeded', 'B3.1: Ação com 112% da meta deve ser exceeded');
assert(actDirect.impactAttribution === 'direct', 'B3.2: Atribuição deve ser direct');
assert(actDirect.attributionNote.includes('atribuído diretamente'), 'B3.3: Nota deve conter "atribuído diretamente"');

const actCorr = evaluateActionEffectiveness({
  id: 'act_102',
  title: 'Banner de Promoção',
  targetRevenue: 5000,
  executionStatus: 'completed',
  actualImpact: {
    revenue: 4700,
    impactAttribution: 'correlated',
    confidence: 'medium'
  }
});
assert(actCorr.effectivenessStatus === 'met', 'B3.4: Ação com 94% da meta deve ser met');
assert(actCorr.attributionNote.includes('observado/associado'), 'B3.5: Nota deve conter "observado/associado"');

const actInsuff = evaluateActionEffectiveness({
  id: 'act_103',
  title: 'Stories Sem UTM',
  targetRevenue: 3000,
  executionStatus: 'completed',
  actualImpact: {
    revenue: 0,
    impactAttribution: 'insufficient',
    confidence: 'insufficient'
  }
});
assert(actInsuff.effectivenessStatus === 'insufficient', 'B3.6: Ação sem dados deve ser insufficient');

// -----------------------------------------------------------------
// BLOCO 4: INSIGHTS EVIDENCIADOS DE APRENDIZADO CONTÍNUO
// -----------------------------------------------------------------
console.log('\n--- BLOCO 4: Insights Evidenciados de Aprendizado Contínuo ---');

const insights = generateCommercialLearningInsights({
  reviewId: 'rev_cert_01',
  varianceBridge: b1,
  budgetComparison: {
    revenue: compareMetricBudgetVsActual(100000, 115500, false),
    contributionMargin: compareMetricBudgetVsActual(50000, 60000, false),
    operatingProfit: compareMetricBudgetVsActual(25000, 32000, false),
    orders: compareMetricBudgetVsActual(500, 550, false),
    averageTicket: compareMetricBudgetVsActual(200, 210, false)
  },
  forecastCalibration: calib,
  lineOutcomes: [
    {
      line: 'FORCE',
      revenue: 70000,
      orders: 350,
      units: 400,
      cogs: 28000,
      contributionMargin: 42000,
      contributionMarginPercent: 60,
      shareOfRevenuePercent: 60.6,
      costCoveragePercent: 100,
      confidence: 'high'
    }
  ],
  actionEffectivenessList: [actDirect, actCorr, actInsuff],
  costCoveragePercent: 100,
  overallConfidence: 'high'
});

assert(insights.length >= 3, 'B4.1: Deve gerar múltiplos insights de aprendizado');
insights.forEach((ins, idx) => {
  assert(Array.isArray(ins.evidence) && ins.evidence.length > 0, `B4.2.${idx + 1}: Insight ${ins.type} deve conter array de evidências numéricas`);
  assert(typeof ins.canCreateAction === 'boolean', `B4.3.${idx + 1}: canCreateAction deve ser booleano`);
});

// -----------------------------------------------------------------
// BLOCO 5: GOVERNANÇA DE TAMANHO DE AMOSTRA HISTÓRICA
// -----------------------------------------------------------------
console.log('\n--- BLOCO 5: Governança de Tamanho de Amostra Histórica ---');

const r1 = {
  id: 'r1',
  status: 'approved',
  outcomeSnapshot: {
    finalActuals: { revenue: 10000, costCoveragePercent: 100 },
    costCoveragePercent: 100,
    budgetComparisons: { revenue: { variancePercent: 5 } },
    forecastCalibration: { metrics: [{ metric: 'revenue', error: 500, errorPercent: 5 }] },
    actionEffectivenessSummary: { totalActions: 2, completedActions: 2, exceededCount: 1, metCount: 1 },
    lineOutcomes: [{ line: 'FORCE', revenue: 10000, contributionMargin: 5000 }]
  }
} as any;

const hist1 = calculateHistoricalLearningSummary({
  reviews: [r1],
  periodStart: '2026-01-01',
  periodEnd: '2026-03-31'
});
assert(hist1.confidence === 'insufficient', 'B5.1: 1 review aprovado (<3) deve conferir confiança insufficient');

const hist3 = calculateHistoricalLearningSummary({
  reviews: [r1, { ...r1, id: 'r2' }, { ...r1, id: 'r3' }],
  periodStart: '2026-01-01',
  periodEnd: '2026-03-31'
});
assert(hist3.confidence === 'medium', 'B5.2: 3 reviews aprovados (3-5) deve conferir confiança medium');

const hist6 = calculateHistoricalLearningSummary({
  reviews: [r1, { ...r1, id: 'r2' }, { ...r1, id: 'r3' }, { ...r1, id: 'r4' }, { ...r1, id: 'r5' }, { ...r1, id: 'r6' }],
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30'
});
assert(hist6.confidence === 'high', 'B5.3: 6 reviews aprovados (>5) com 100% cost coverage deve conferir confiança high');

console.log('\n========================================================================');
console.log(`🏆 RESULTADO CERTIFICAÇÃO OFICIAL FASE 9.6.8: ${passedTests}/${totalTests} PASSOU (${failedTests} FALHAS)`);
console.log('========================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}

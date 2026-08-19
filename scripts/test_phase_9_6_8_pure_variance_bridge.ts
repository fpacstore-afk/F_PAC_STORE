/**
 * TEST SUITE 1 — PURE VARIANCE BRIDGE, CALIBRATION & LEARNING LOGIC (FASE 9.6.8)
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
import { CommercialExecutionReview } from '../src/types/commercialReview';

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

console.log('\n======================================================');
console.log('🧪 EXECUTANDO TESTES UNITÁRIOS PUROS — FASE 9.6.8');
console.log('======================================================\n');

// -----------------------------------------------------------------
// 1. VARIANCE BRIDGE CENT-EXACT MATHEMATICS
// -----------------------------------------------------------------
console.log('--- 1. Variance Bridge (Cent-Exact & Planning Residual) ---');

// Caso 1: Meta coerente (Meta: 100 pedidos * R$ 200 = R$ 20.000. Real: 120 pedidos * R$ 210 = R$ 25.200)
// Volume Effect = (120 - 100) * 200 = +4.000
// Ticket Effect = 120 * (210 - 200) = +1.200
// Total Variance = 25.200 - 20.000 = +5.200
// Residual = 0.00
const bridge1 = calculateRevenueVarianceBridge({
  budgetRevenue: 20000,
  budgetOrders: 100,
  budgetAverageTicket: 200,
  actualRevenue: 25200,
  actualOrders: 120,
  actualAverageTicket: 210
});

assert(bridge1.isCentExact === true, 'Bridge 1 deve ser cent-exact');
assert(bridge1.totalVariance === 5200, 'Bridge 1 Total Variance deve ser 5200');
assert(bridge1.orderVolumeEffect === 4000, 'Bridge 1 Volume Effect deve ser 4000');
assert(bridge1.ticketEffect === 1200, 'Bridge 1 Ticket Effect deve ser 1200');
assert(bridge1.planningResidual === 0, 'Bridge 1 Planning Residual deve ser 0');
assert(bridge1.residualExplanation === undefined, 'Bridge 1 não deve ter residualExplanation');

// Caso 2: Inconsistência de Planejamento (Meta Receita: 25.000, mas Meta Orders: 100 * Ticket: 200 = 20.000)
// Gap no budget = 5.000
// Real: 110 pedidos * R$ 220 = R$ 24.200
// Total Variance = 24.200 - 25.000 = -800
// Volume Effect = (110 - 100) * 200 = +2.000
// Ticket Effect = 110 * (220 - 200) = +2.200
// Volume + Ticket = 4.200
// Residual = -800 - 4.200 = -5.000 (exatamente a inconsistência do planejamento!)
const bridge2 = calculateRevenueVarianceBridge({
  budgetRevenue: 25000,
  budgetOrders: 100,
  budgetAverageTicket: 200,
  actualRevenue: 24200,
  actualOrders: 110,
  actualAverageTicket: 220
});

assert(bridge2.isCentExact === true, 'Bridge 2 deve ser cent-exact com residual');
assert(bridge2.totalVariance === -800, 'Bridge 2 Total Variance deve ser -800');
assert(bridge2.orderVolumeEffect === 2000, 'Bridge 2 Volume Effect deve ser +2000');
assert(bridge2.ticketEffect === 2200, 'Bridge 2 Ticket Effect deve ser +2200');
assert(bridge2.planningResidual === -5000, 'Bridge 2 Planning Residual deve ser -5000');
assert(
  bridge2.residualExplanation?.includes('Inconsistência entre meta de receita e composição Orders × Average Ticket') === true,
  'Bridge 2 deve conter explicação canônica de Planning Residual'
);
assert(
  Math.abs((bridge2.orderVolumeEffect + bridge2.ticketEffect + bridge2.planningResidual) - bridge2.totalVariance) < 0.001,
  'Volume + Ticket + Residual === Total Variance cent-exact'
);

// -----------------------------------------------------------------
// 2. DRIVERS ADICIONAIS (COGS, GATEWAY, SHIPPING, MARKETING, EXPENSES)
// -----------------------------------------------------------------
console.log('\n--- 2. Drivers Adicionais de Variação Financeira ---');

const bridge3 = calculateRevenueVarianceBridge({
  budgetRevenue: 10000,
  budgetOrders: 50,
  budgetAverageTicket: 200,
  actualRevenue: 9000,
  actualOrders: 45,
  actualAverageTicket: 200,
  budgetCogs: 4000,
  actualCogs: 3500, // Menos custo = favorável (+500)
  budgetGateway: 300,
  actualGateway: 350, // Mais taxa = desfavorável (-50)
  budgetShipping: 200,
  actualShipping: 150, // Menos frete = favorável (+50)
  budgetMarketing: 1500,
  actualMarketing: 2000 // Mais gasto = desfavorável (-500)
});

assert(bridge3.drivers.length >= 4, 'Deve conter múltiplos drivers calculados');
const cogsDriver = bridge3.drivers.find(d => d.driver === 'COGS');
assert(cogsDriver?.favorable === true && cogsDriver?.amount === 500, 'COGS menor que o previsto deve ser favorável (+500)');

const mktDriver = bridge3.drivers.find(d => d.driver === 'MARKETING');
assert(mktDriver?.favorable === false && mktDriver?.amount === -500, 'Marketing maior que o previsto deve ser desfavorável (-500)');

// -----------------------------------------------------------------
// 3. COMPARAÇÃO BUDGET VS ACTUAL
// -----------------------------------------------------------------
console.log('\n--- 3. Comparação Budget vs Actual ---');

const compRevenue = compareMetricBudgetVsActual(10000, 12000, false);
assert(compRevenue.favorable === true, 'Receita maior deve ser favorável');
assert(compRevenue.varianceAbsolute === 2000, 'Variação absoluta da receita deve ser +2000');
assert(compRevenue.variancePercent === 20, 'Variação percentual da receita deve ser +20%');

const compExpense = compareMetricBudgetVsActual(3000, 3500, true);
assert(compExpense.favorable === false, 'Despesa maior deve ser desfavorável');
assert(compExpense.varianceAbsolute === -500, 'Variação absoluta da despesa deve ser -500');
assert(compExpense.variancePercent === -16.67, 'Variação percentual da despesa deve ser -16.67%');

// -----------------------------------------------------------------
// 4. CALIBRAÇÃO DE FORECAST (MAPE & BIAS)
// -----------------------------------------------------------------
console.log('\n--- 4. Calibração de Forecast vs Actual ---');

const calibration = calibrateForecastVsActual({
  forecastRevenue: 50000,
  actualRevenue: 55000, // +10% (under_forecast - subestimou)
  forecastOrders: 250,
  actualOrders: 260,
  forecastUnits: 300,
  actualUnits: 310,
  forecastAverageTicket: 200,
  actualAverageTicket: 211.54
});

assert(calibration.overallBias === 'under_forecast', 'Viés global deve ser under_forecast');
const revFcMetric = calibration.metrics.find(m => m.metric === 'revenue');
assert(revFcMetric?.direction === 'under_forecast', 'Métrica de receita deve ser under_forecast');
assert(revFcMetric?.error === 5000, 'Erro de receita deve ser +5000');
assert(revFcMetric?.errorPercent === 10, 'Erro percentual deve ser +10%');
assert(typeof calibration.meanAbsolutePercentageError === 'number', 'MAPE deve ser calculado');

// -----------------------------------------------------------------
// 5. EFICÁCIA DE AÇÕES COMERCIAIS & ATRIBUIÇÃO
// -----------------------------------------------------------------
console.log('\n--- 5. Eficácia de Ações Comerciais ---');

const actionDirect = {
  id: 'act_001',
  title: 'Campanha Linha FORCE',
  targetRevenue: 10000,
  executionStatus: 'completed',
  actualImpact: {
    revenue: 12000,
    units: 60,
    impactAttribution: 'direct',
    confidence: 'high',
    costCoveragePercent: 100
  }
};

const effDirect = evaluateActionEffectiveness(actionDirect);
assert(effDirect.effectivenessStatus === 'exceeded', 'Ação direta que superou a meta deve ser exceeded');
assert(effDirect.impactAttribution === 'direct', 'Atribuição deve ser direct');
assert(
  effDirect.attributionNote.includes('Resultado atribuído diretamente à ação comercial'),
  'Nota de atribuição direta deve seguir a governança exata'
);

const actionCorrelated = {
  id: 'act_002',
  title: 'Ajuste de Preço MARK',
  targetRevenue: 5000,
  executionStatus: 'completed',
  actualImpact: {
    revenue: 4800,
    units: 25,
    impactAttribution: 'correlated',
    confidence: 'medium',
    costCoveragePercent: 95
  }
};

const effCorrelated = evaluateActionEffectiveness(actionCorrelated);
assert(effCorrelated.effectivenessStatus === 'met', 'Ação dentro de 90-104% deve ser met');
assert(
  effCorrelated.attributionNote.includes('Resultado observado/associado à linha/janela'),
  'Nota de atribuição correlacionada deve conter "observado/associado"'
);

const actionInsufficient = {
  id: 'act_003',
  title: 'Post Social Orgânico',
  targetRevenue: 2000,
  executionStatus: 'completed',
  actualImpact: {
    revenue: 0,
    impactAttribution: 'insufficient',
    confidence: 'insufficient'
  }
};

const effInsufficient = evaluateActionEffectiveness(actionInsufficient);
assert(effInsufficient.effectivenessStatus === 'insufficient', 'Ação com dados insuficientes deve ter status insufficient');
assert(
  effInsufficient.attributionNote.includes('Dados insuficientes para atribuição causal'),
  'Nota de atribuição insuficiente deve ser explícita'
);

// -----------------------------------------------------------------
// 6. INSIGHTS EVIDENCIADOS E APRENDIZADO
// -----------------------------------------------------------------
console.log('\n--- 6. Geração de Insights Evidenciados ---');

const insights = generateCommercialLearningInsights({
  reviewId: 'rev_test_01',
  varianceBridge: bridge1,
  budgetComparison: {
    revenue: compRevenue,
    contributionMargin: compareMetricBudgetVsActual(8000, 10000, false),
    operatingProfit: compareMetricBudgetVsActual(4000, 5000, false),
    orders: compareMetricBudgetVsActual(100, 120, false),
    averageTicket: compareMetricBudgetVsActual(200, 210, false)
  },
  forecastCalibration: calibration,
  lineOutcomes: [
    {
      line: 'FORCE',
      revenue: 15000,
      orders: 70,
      units: 75,
      cogs: 6000,
      contributionMargin: 7500,
      contributionMarginPercent: 50,
      shareOfRevenuePercent: 60,
      costCoveragePercent: 100,
      confidence: 'high'
    },
    {
      line: 'MARK',
      revenue: 10200,
      orders: 50,
      units: 55,
      cogs: 4500,
      contributionMargin: 4000,
      contributionMarginPercent: 39.2,
      shareOfRevenuePercent: 40,
      costCoveragePercent: 98,
      confidence: 'high'
    }
  ],
  actionEffectivenessList: [effDirect, effCorrelated, effInsufficient],
  costCoveragePercent: 99.5,
  overallConfidence: 'high'
});

assert(insights.length >= 3, 'Deve gerar pelo menos 3 insights estruturados');
insights.forEach((ins, idx) => {
  assert(ins.evidence && ins.evidence.length > 0, `Insight ${idx + 1} (${ins.type}) deve conter array de evidências`);
  assert(Boolean(ins.recommendedNextStep), `Insight ${idx + 1} deve conter recomendação de próximo passo`);
  assert(Boolean(ins.confidence), `Insight ${idx + 1} deve conter nível de confiança`);
});

// -----------------------------------------------------------------
// 7. GOVERNANÇA DE AMOSTRA HISTÓRICA (SAMPLE SIZE RULES)
// -----------------------------------------------------------------
console.log('\n--- 7. Governança de Amostra Histórica ---');

const mockReviewsApproved: CommercialExecutionReview[] = [
  {
    id: 'rev_1',
    executionCycleId: 'c1',
    executionCycleVersion: 1,
    linkedGoalIds: [],
    analysisVersion: 1,
    status: 'approved',
    title: 'Review 1',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    createdAt: '2026-02-01',
    createdBy: 'admin',
    outcomeSnapshot: {
      finalActuals: { revenue: 20000, orders: 100, units: 100, averageTicket: 200, cogs: 8000, gatewayFees: 600, shippingSubsidy: 400, otherVariableCosts: 0, contributionMargin: 11000, contributionMarginPercent: 55, marketingSpend: 3000, fixedExpenses: 4000, otherExpenses: 0, operatingProfit: 4000, operatingProfitPercent: 20, costCoveragePercent: 100, confidence: 'high' },
      costCoveragePercent: 100,
      budgetComparisons: { revenue: { budget: 18000, actual: 20000, varianceAbsolute: 2000, variancePercent: 11.1, favorable: true } } as any,
      forecastCalibration: { metrics: [{ metric: 'revenue', forecastValue: 18000, actualValue: 20000, error: 2000, absoluteError: 2000, errorPercent: 11.1, direction: 'under_forecast' }] } as any,
      actionEffectivenessSummary: { totalActions: 3, completedActions: 3, cancelledActions: 0, blockedActions: 0, overdueAtEnd: 0, completionRate: 100, criticalActionsTotal: 1, criticalActionsCompleted: 1, criticalActionsFailedOrBlocked: 0, exceededCount: 1, metCount: 2, belowExpectedCount: 0, insufficientCount: 0, directAttributedRevenue: 10000, correlatedAttributedRevenue: 10000 },
      lineOutcomes: [{ line: 'FORCE', revenue: 20000, orders: 1, units: 100, cogs: 8000, contributionMargin: 11000, contributionMarginPercent: 55, shareOfRevenuePercent: 100, costCoveragePercent: 100, confidence: 'high' }]
    } as any
  },
  {
    id: 'rev_2',
    executionCycleId: 'c2',
    executionCycleVersion: 1,
    linkedGoalIds: [],
    analysisVersion: 1,
    status: 'approved',
    title: 'Review 2',
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    createdAt: '2026-03-01',
    createdBy: 'admin',
    outcomeSnapshot: {
      finalActuals: { revenue: 22000, orders: 110, units: 110, averageTicket: 200, cogs: 9000, gatewayFees: 660, shippingSubsidy: 440, otherVariableCosts: 0, contributionMargin: 11900, contributionMarginPercent: 54, marketingSpend: 3200, fixedExpenses: 4000, otherExpenses: 0, operatingProfit: 4700, operatingProfitPercent: 21.3, costCoveragePercent: 100, confidence: 'high' },
      costCoveragePercent: 100,
      budgetComparisons: { revenue: { budget: 20000, actual: 22000, varianceAbsolute: 2000, variancePercent: 10.0, favorable: true } } as any,
      forecastCalibration: { metrics: [{ metric: 'revenue', forecastValue: 20000, actualValue: 22000, error: 2000, absoluteError: 2000, errorPercent: 10.0, direction: 'under_forecast' }] } as any,
      actionEffectivenessSummary: { totalActions: 2, completedActions: 2, cancelledActions: 0, blockedActions: 0, overdueAtEnd: 0, completionRate: 100, criticalActionsTotal: 1, criticalActionsCompleted: 1, criticalActionsFailedOrBlocked: 0, exceededCount: 1, metCount: 1, belowExpectedCount: 0, insufficientCount: 0, directAttributedRevenue: 12000, correlatedAttributedRevenue: 10000 },
      lineOutcomes: [{ line: 'FORCE', revenue: 22000, orders: 1, units: 110, cogs: 9000, contributionMargin: 11900, contributionMarginPercent: 54, shareOfRevenuePercent: 100, costCoveragePercent: 100, confidence: 'high' }]
    } as any
  }
];

// Amostra de 2 reviews (<3) -> Deve retornar confiança INSUFFICIENT
const summary2 = calculateHistoricalLearningSummary({
  reviews: mockReviewsApproved,
  periodStart: '2026-01-01',
  periodEnd: '2026-03-31'
});

assert(summary2.confidence === 'insufficient', 'Amostra com 2 reviews (<3) deve ter confiança insufficient');
assert(summary2.confidenceReason.includes('insuficiente'), 'Motivo deve citar amostra insuficiente');

// Adicionando 3º e 4º review -> Confiança MEDIUM
const mockReviews4 = [
  ...mockReviewsApproved,
  {
    ...mockReviewsApproved[0],
    id: 'rev_3',
    executionCycleId: 'c3'
  },
  {
    ...mockReviewsApproved[1],
    id: 'rev_4',
    executionCycleId: 'c4'
  }
];

const summary4 = calculateHistoricalLearningSummary({
  reviews: mockReviews4,
  periodStart: '2026-01-01',
  periodEnd: '2026-04-30'
});

assert(summary4.confidence === 'medium', 'Amostra com 4 reviews (3 a 5) deve ter confiança medium');
assert(summary4.reviewCount === 4, 'Review count deve ser 4');
assert(summary4.forecastBias.direction === 'under_forecast', 'Viés deve detectar under_forecast');
assert(summary4.suggestedCalibrationAdjustment !== undefined, 'Com 4 reviews e viés deve sugerir calibração');

console.log('\n======================================================');
console.log(`📊 RESULTADO FINAL TESTES UNITÁRIOS 9.6.8: ${passedTests}/${totalTests} PASSOU (${failedTests} FALHAS)`);
console.log('======================================================\n');

if (failedTests > 0) {
  process.exit(1);
}

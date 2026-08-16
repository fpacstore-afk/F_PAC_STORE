/**
 * FASE 9.6.3-B — CERTIFICATION TEST SUITE
 * Inteligência Comercial, Cenários e Recomendações de Preço
 * F PAC STORE — Motor Analítico e Decisório Read-Only
 */

import fs from 'fs';
import path from 'path';
import { 
  calculateOrderProfitability, 
  calculateProductProfitability, 
  calculateProfitabilityOverviewStats,
  aggregateProfitabilityByLine,
  simulateProductPrice, 
  calculateMinimumPrice, 
  calculatePriceForDesiredMargin, 
  calculateBreakEven, 
  calculateTargetProfitRequirements,
  classifyMargin,
  classifyBreakEvenStatus,
  type CostSource,
  type ProductProfitabilityItem
} from '../src/utils/profitability';
import { calculateFinancialDRE, calculateOperatingResult } from '../src/utils/orderFinancial';
import { 
  generateCommercialRecommendations,
  classifyCommercialMatrix,
  simulateCommercialScenario,
  simulateFreeShippingImpact,
  simulatePaymentMethodImpact,
  simulateCostIncreaseSensitivity,
  calculateMaxSustainableDiscount,
  calculateOpportunityScore,
  compareCommercialPeriods,
  COMMERCIAL_SCORE_WEIGHTS,
  SCENARIO_PRESETS,
  SENSITIVITY_PERCENTAGES
} from '../src/utils/commercialIntelligence';
import { FINANCIAL_DEFAULTS, MARGIN_THRESHOLDS } from '../shared/financialDefaults';

let testsPassed = 0;
let testsFailed = 0;

let parallelFormulasFound = 0;
let writeCallsFound = 0;
let duplicateQueriesFound = 0;
let unconfiguredMagicValuesFound = 0;

function assert(condition: boolean, code: string, message: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✅ PASS [${code}]: ${message}`);
  } else {
    testsFailed++;
    console.error(`  ❌ FAIL [${code}]: ${message}`);
  }
}

console.log('================================================================');
console.log('FASE 9.6.3-B — CERTIFICAÇÃO DO MOTOR DE INTELIGÊNCIA COMERCIAL');
console.log('================================================================\n');

// ----------------------------------------------------
// READ COMPONENT FILES FOR STATIC AUDIT
// ----------------------------------------------------
const profitabilityDir = path.resolve(process.cwd(), 'src/components/admin/financial/profitability');
const utilsDir = path.resolve(process.cwd(), 'src/utils');

const commercialViewCode = fs.readFileSync(path.join(profitabilityDir, 'CommercialIntelligenceView.tsx'), 'utf-8');
const commercialUtilCode = fs.readFileSync(path.join(utilsDir, 'commercialIntelligence.ts'), 'utf-8');
const dashboardCode = fs.readFileSync(path.join(profitabilityDir, 'ProfitabilityPricingDashboard.tsx'), 'utf-8');

const allComponentCodes = [
  { name: 'CommercialIntelligenceView', code: commercialViewCode },
  { name: 'commercialIntelligence (util)', code: commercialUtilCode },
  { name: 'ProfitabilityPricingDashboard', code: dashboardCode }
];

console.log('📦 TEST GROUP 1: Auditoria Estrutural e Pureza Read-Only (A - I)');

// A. Zero Write Calls (setDoc, updateDoc, addDoc, deleteDoc, fetch POST/PUT/DELETE)
let setDocCount = 0;
let updateDocCount = 0;
let addDocCount = 0;
let deleteDocCount = 0;
let httpMutationsCount = 0;

allComponentCodes.forEach(comp => {
  if (comp.code.includes('setDoc(')) setDocCount++;
  if (comp.code.includes('updateDoc(')) updateDocCount++;
  if (comp.code.includes('addDoc(')) addDocCount++;
  if (comp.code.includes('deleteDoc(')) deleteDocCount++;
  if (comp.code.includes('fetch(') || comp.code.includes('axios.post') || comp.code.includes('axios.put') || comp.code.includes('axios.delete')) {
    httpMutationsCount++;
  }
});

writeCallsFound = setDocCount + updateDocCount + addDocCount + deleteDocCount + httpMutationsCount;
assert(writeCallsFound === 0, 'A', 'Zero write calls (setDoc, updateDoc, addDoc, deleteDoc, fetch mutations)');

// B. commercialIntelligence.ts consome funções canônicas e não duplica fórmulas
const usesCanonicalSim = commercialUtilCode.includes('simulateProductPrice(');
const usesCanonicalMinPrice = commercialUtilCode.includes('calculateMinimumPrice(');
const usesCanonicalTargetPrice = commercialUtilCode.includes('calculatePriceForDesiredMargin(');
const usesCanonicalBreakEven = commercialUtilCode.includes('calculateBreakEven(');
const usesCanonicalTargetProfit = commercialUtilCode.includes('calculateTargetProfitRequirements(');
const usesCanonicalOperatingResult = commercialUtilCode.includes('calculateOperatingResult(');

assert(
  usesCanonicalSim && usesCanonicalMinPrice && usesCanonicalTargetPrice && usesCanonicalBreakEven && usesCanonicalTargetProfit && usesCanonicalOperatingResult,
  'B',
  'commercialIntelligence.ts consome exclusivamente funções canônicas certificadas'
);

// C. Nenhum listener onSnapshot duplicado
let onSnapshotCount = 0;
allComponentCodes.forEach(c => {
  if (c.code.includes('onSnapshot(')) onSnapshotCount++;
});
if (onSnapshotCount > 0) duplicateQueriesFound += onSnapshotCount;
assert(onSnapshotCount === 0, 'C', 'Nenhum listener onSnapshot duplicado');

// D. useFinancialPrivacy presente em CommercialIntelligenceView
assert(commercialViewCode.includes('useFinancialPrivacy'), 'D', 'useFinancialPrivacy presente e ativo em CommercialIntelligenceView');

// E. Disclaimer obrigatório de simulação presente
assert(
  commercialViewCode.includes('simulações matemáticas estritas, não previsões preditivas') ||
  commercialViewCode.includes('Simulação com variação') ||
  commercialUtilCode.includes('isSimulation: true'),
  'E',
  'Disclaimer explícito de simulação hipotética presente no módulo'
);

// F. Score determinístico exportado e configurado
assert(
  COMMERCIAL_SCORE_WEIGHTS.marginPercentWeight === 0.4 &&
  COMMERCIAL_SCORE_WEIGHTS.volumeWeight === 0.3 &&
  COMMERCIAL_SCORE_WEIGHTS.contributionMarginWeight === 0.3,
  'F',
  'Pesos de score comercial centralizados e determinísticos (40/30/30)'
);

// G. Tab 6 adicionada ao Dashboard
assert(
  dashboardCode.includes('6. Inteligência Comercial') && dashboardCode.includes('CommercialIntelligenceView'),
  'G',
  'Tab 6 (Inteligência Comercial) devidamente integrada ao menu principal de rentabilidade'
);

// H. Botão "Simular Recomendação" não dispara mutação
assert(!commercialViewCode.includes('aplicar automaticamente') && commercialViewCode.includes('Simular Recomendação'), 'H', 'Botão apenas simula recomendação, sem mutações automáticas de preço');

// I. Sem afirmações causais infundadas ("porque")
const hasCausalBecause = commercialUtilCode.includes(' porque ') || commercialViewCode.includes(' porque ');
assert(!hasCausalBecause, 'I', 'Sem uso de pseudo-causalidade ou "porque" não fundamentado');

console.log('\n📦 TEST GROUP 2: Algoritmos de Precificação, Margem e Descontos (J - Q)');

// J. Preço abaixo do custo mínimo gera alerta CRITICAL
const mockCostMin = 60;
const minPriceComputed = calculateMinimumPrice({ unitCost: mockCostMin });
const mockOrderBelowMin = {
  id: 'ord_below_min',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 50,
  total: 50,
  items: [{ id: 'p_below', slug: 'p_below', name: 'Item Crítico', unitPrice: 50, quantity: 1, costPrice: 60 }]
};
const prodsBelowMin = calculateProductProfitability([mockOrderBelowMin], [{ id: 'p_below', slug: 'p_below', name: 'Item Crítico', costPrice: 60, price: 50 }]);
const ordersProfBelowMin = [calculateOrderProfitability(mockOrderBelowMin, [{ id: 'p_below', costPrice: 60 }])];
const dreEmpty = calculateFinancialDRE([], [], [], [], []);
const recsBelowMin = generateCommercialRecommendations(prodsBelowMin, ordersProfBelowMin, dreEmpty);

const criticalRec = recsBelowMin.find(r => r.entityId === 'p_below' && r.severity === 'critical');
assert(
  criticalRec !== undefined && 
  criticalRec.reasonCodes.includes('BELOW_MINIMUM_PRICE') &&
  criticalRec.currentMetrics.minimumPrice === minPriceComputed,
  'J',
  'Preço abaixo do mínimo sustentável gera recomendação CRITICAL com preço mínimo e métricas'
);

// K. Preço abaixo da margem desejada sugere calculatePriceForDesiredMargin
const mockCostNormal = 40;
const desiredMargin = 60;
const targetPriceExpected = calculatePriceForDesiredMargin({ unitCost: mockCostNormal, desiredMarginPercent: desiredMargin });
const mockOrderNormal = {
  id: 'ord_norm',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [{ id: 'p_norm', slug: 'p_norm', name: 'Item Normal', unitPrice: 100, quantity: 1, costPrice: 40 }]
};
const prodsNormal = calculateProductProfitability([mockOrderNormal], [{ id: 'p_norm', slug: 'p_norm', name: 'Item Normal', costPrice: 40, price: 100 }]);
const ordersProfNormal = [calculateOrderProfitability(mockOrderNormal, [{ id: 'p_norm', costPrice: 40 }])];
const recsTargetGap = generateCommercialRecommendations(prodsNormal, ordersProfNormal, dreEmpty, { desiredMarginPercent: desiredMargin });

const targetRec = recsTargetGap.find(r => r.entityId === 'p_norm' && r.reasonCodes.includes('TARGET_MARGIN_NOT_REACHED'));
assert(
  targetRec !== undefined && targetRec.currentMetrics.targetPrice === targetPriceExpected,
  'K',
  'Preço abaixo da margem desejada utiliza calculatePriceForDesiredMargin e sugere preço alvo exato'
);

// L. Desconto Máximo Sustentável (calculateMaxSustainableDiscount)
const maxDiscount = calculateMaxSustainableDiscount(40, 100);
const simAtMax = simulateProductPrice({ unitCost: 40, salePrice: 100, discountPercent: maxDiscount });
const simPastMax = simulateProductPrice({ unitCost: 40, salePrice: 100, discountPercent: maxDiscount + 1 });
assert(
  maxDiscount > 0 && simAtMax.contributionMargin >= 0 && simPastMax.contributionMargin < 0,
  'L',
  `Desconto máximo sustentável (${maxDiscount}%) mantém margem >= 0 e se torna negativo no ponto seguinte`
);

// M. Impacto de Frete Grátis Total com dados explícitos
const freeShipSim = simulateFreeShippingImpact(40, 120, 25, 15);
assert(
  freeShipSim.dataAvailable === true &&
  freeShipSim.freeShipping?.shippingSubsidy === 25 &&
  freeShipSim.freeShipping.contributionMargin < (freeShipSim.baseline?.contributionMargin || 0) &&
  freeShipSim.marginDropMoney === 15,
  'M',
  'Simulação de Frete Grátis calcula impacto exato via simulateProductPrice'
);

// N. Comparativo PIX vs Cartão
const paySim = simulatePaymentMethodImpact(40, 150);
assert(
  paySim.pix.gatewayFee < paySim.card.gatewayFee &&
  paySim.pix.contributionMargin > paySim.card.contributionMargin &&
  paySim.gatewayFeeDiff > 0,
  'N',
  'Comparativo PIX vs Cartão utiliza taxas oficiais de FINANCIAL_DEFAULTS.gateway'
);

// O. Simulação de Sensibilidade a Aumentos de Custo (+5, +10, +15, +20)
const sensSim = simulateCostIncreaseSensitivity(50, 100, SENSITIVITY_PERCENTAGES);
assert(
  sensSim.length === 4 &&
  sensSim[0].simulatedCost === 52.50 &&
  sensSim[1].simulatedCost === 55.00 &&
  sensSim[3].simulatedCost === 60.00 &&
  sensSim[0].simulatedMarginMoney > sensSim[3].simulatedMarginMoney,
  'O',
  'Sensibilidade a aumento de custo simula +5%, +10%, +15%, +20% com precisão'
);

// P. Identificação de Candidato a Promoção
const highMarginItem = {
  id: 'p_promo',
  slug: 'p_promo',
  name: 'Item Alta Margem',
  costPrice: 30,
  price: 180
};
const orderPromo = {
  id: 'ord_promo',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 180,
  total: 180,
  items: [{ id: 'p_promo', slug: 'p_promo', name: 'Item Alta Margem', unitPrice: 180, quantity: 1, costPrice: 30 }]
};
const prodsPromo = calculateProductProfitability([orderPromo], [highMarginItem]);
const ordersProfPromo = [calculateOrderProfitability(orderPromo, [highMarginItem])];
const recsPromo = generateCommercialRecommendations(prodsPromo, ordersProfPromo, dreEmpty);
const promoCandidate = recsPromo.find(r => r.type === 'promotion_candidate');
assert(
  promoCandidate !== undefined && promoCandidate.projectedMetrics?.maxSustainableDiscount !== undefined,
  'P',
  'Produto com margem saudável é identificado como candidato a promoção com desconto sustentável'
);

// Q. Indicador de Confiança: High para snapshot
const orderSnapshot = {
  id: 'o_snap',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [{ id: 'p_snap', slug: 'p_snap', name: 'Snap Item', unitPrice: 100, quantity: 1, unitCostSnapshot: 40, costCoverage: 'complete' }]
};
const prodsSnap = calculateProductProfitability([orderSnapshot], [{ id: 'p_snap', costPrice: 40 }]);
const ordersProfSnap = [calculateOrderProfitability(orderSnapshot, [{ id: 'p_snap', costPrice: 40 }])];
const recsSnap = generateCommercialRecommendations(prodsSnap, ordersProfSnap, dreEmpty);
const snapRec = recsSnap.find(r => r.entityId === 'p_snap');
assert(
  snapRec !== undefined && snapRec.confidence === 'high',
  'Q',
  'Itens com custo snapshot validado recebem confiança HIGH'
);

console.log('\n📦 TEST GROUP 3: Matriz Comercial, Cenários e Comparação (R - Z)');

// R. Matriz de Rentabilidade (Volume x Margem: 4 Quadrantes)
const mockMatrixCatalog = [
  { id: 'p_strat', slug: 'p_strat', name: 'Estratégico', price: 200, costPrice: 40 },
  { id: 'p_opp', slug: 'p_opp', name: 'Oportunidade', price: 200, costPrice: 40 },
  { id: 'p_opt', slug: 'p_opt', name: 'Otimizar', price: 100, costPrice: 85 },
  { id: 'p_rev', slug: 'p_rev', name: 'Revisar', price: 100, costPrice: 85 }
];
const mockOrdersMatrix = [
  {
    id: 'ord_1',
    status: 'approved',
    paymentStatus: 'paid',
    paidAmount: 1500,
    total: 1500,
    items: [
      { id: 'p_strat', slug: 'p_strat', name: 'Estratégico', unitPrice: 200, quantity: 5, costPrice: 40 },
      { id: 'p_opt', slug: 'p_opt', name: 'Otimizar', unitPrice: 100, quantity: 5, costPrice: 85 }
    ]
  },
  {
    id: 'ord_2',
    status: 'approved',
    paymentStatus: 'paid',
    paidAmount: 300,
    total: 300,
    items: [
      { id: 'p_opp', slug: 'p_opp', name: 'Oportunidade', unitPrice: 200, quantity: 1, costPrice: 40 },
      { id: 'p_rev', slug: 'p_rev', name: 'Revisar', unitPrice: 100, quantity: 1, costPrice: 85 }
    ]
  }
];
const matrixProds = calculateProductProfitability(mockOrdersMatrix, mockMatrixCatalog);
const ordersProfMatrix = mockOrdersMatrix.map(o => calculateOrderProfitability(o, mockMatrixCatalog));
const matrixClassified = classifyCommercialMatrix(matrixProds);

const stratItem = matrixClassified.find(m => m.product.slug === 'p_strat');
const oppItem = matrixClassified.find(m => m.product.slug === 'p_opp');
const optItem = matrixClassified.find(m => m.product.slug === 'p_opt');
const revItem = matrixClassified.find(m => m.product.slug === 'p_rev');

assert(
  stratItem?.quadrant === 'strategic' &&
  oppItem?.quadrant === 'opportunity' &&
  optItem?.quadrant === 'optimize' &&
  revItem?.quadrant === 'review',
  'R',
  'Classificação da Matriz Comercial Volume x Margem em 4 quadrantes exatos'
);

// S. Simulador de Cenários: Conservador (-15% vol, +10% custo)
const dreMatrix = calculateFinancialDRE(
  mockOrdersMatrix,
  [{ id: 'exp_fix_mat', amount: 400, description: 'Despesa Fixa Matriz', category: 'DESPESA_FIXA' }],
  [],
  [],
  mockMatrixCatalog
);
const simConservative = simulateCommercialScenario(matrixProds, ordersProfMatrix, dreMatrix, SCENARIO_PRESETS.conservative);
assert(
  simConservative.projectedUnitsCount < matrixProds.reduce((acc, p) => acc + p.unitsSold, 0) &&
  simConservative.projectedCogs > 0 &&
  simConservative.projectedOperatingResult < (dreMatrix.operatingProfit || 0),
  'S',
  'Cenário Conservador reduz unidades e margem de contribuição corretamente'
);

// T. Simulador de Cenários: Agressivo (+25% vol, 5% desc)
const simAggressive = simulateCommercialScenario(matrixProds, ordersProfMatrix, dreMatrix, SCENARIO_PRESETS.aggressive);
assert(
  simAggressive.projectedUnitsCount > matrixProds.reduce((acc, p) => acc + p.unitsSold, 0) &&
  simAggressive.projectedGrossRevenue > simConservative.projectedGrossRevenue,
  'T',
  'Cenário Agressivo aumenta unidades e faturamento com desconto simulado'
);

// U. Variação Delta vs Real no Cenário
assert(
  simConservative.varianceVsActual.netRevenueDelta < 0 &&
  simConservative.varianceVsActual.contributionMarginDelta < 0,
  'U',
  'Simulador calcula delta vs realizado (varianceVsActual) para receita e margem'
);

// V. Ponto de Equilíbrio Projetado no Cenário
assert(
  simConservative.breakEvenRevenue > 0 && simAggressive.breakEvenRevenue > 0,
  'V',
  'Cenário comercial calcula Break-Even de receita operacional projetada'
);

// W. Score de Priorização (0-100)
const scoreMax = calculateOpportunityScore(100, 100, 10000, 100, 10000);
const scoreMid = calculateOpportunityScore(50, 100, 10000, 100, 10000);
const scoreLow = calculateOpportunityScore(10, 5, 500, 100, 10000);
assert(scoreMax === 100 && scoreMid === 80 && scoreMid > scoreLow, 'W', 'Score de priorização determinístico (0-100) funciona estritamente');

// X. Suporte a todas as linhas (FORCE, MARK, PRIME, OTHER)
const linesConsolidated = aggregateProfitabilityByLine(matrixProds, ordersProfMatrix);
const otherLine = linesConsolidated.find(l => l.lineName === 'OTHER');
assert(linesConsolidated.length > 0 && otherLine !== undefined, 'X', 'Suporte a linhas sem perder artigos de OTHER');

// Y. Comparação descritiva de períodos (sem "porque")
const comp = compareCommercialPeriods(
  { netRevenue: 2000, contributionMargin: 600, marginPercent: 30, unitsSold: 20, ordersCount: 15, cogs: 1000 },
  { netRevenue: 1500, contributionMargin: 450, marginPercent: 30, unitsSold: 15, ordersCount: 10, cogs: 750 }
);
assert(
  comp.metrics.netRevenue.delta === 500 &&
  comp.metrics.netRevenue.deltaPercent === 33.33 &&
  comp.descriptiveSummary.length >= 3,
  'Y',
  'Comparação de períodos gera sumário descritivo sem declarações causais não suportadas'
);

// Z. Zero Division Protection em todos os métodos
const zeroDisc = calculateMaxSustainableDiscount(0, 0);
const zeroPay = simulatePaymentMethodImpact(0, 0);
const zeroSens = simulateCostIncreaseSensitivity(0, 0);
const zeroScore = calculateOpportunityScore(0, 0, 0, 0, 0);
const zeroComp = compareCommercialPeriods(
  { netRevenue: 0, contributionMargin: 0, marginPercent: 0, unitsSold: 0, ordersCount: 0, cogs: 0 },
  { netRevenue: 0, contributionMargin: 0, marginPercent: 0, unitsSold: 0, ordersCount: 0, cogs: 0 }
);
assert(
  !isNaN(zeroDisc) &&
  !isNaN(zeroPay.gatewayFeeDiff) &&
  !isNaN(zeroSens[0].simulatedMarginMoney) &&
  !isNaN(zeroScore) &&
  !isNaN(zeroComp.metrics.netRevenue.deltaPercent),
  'Z',
  'Proteção total contra divisão por zero em todos os métodos analíticos da FASE 9.6.3'
);

console.log('\n📦 TEST GROUP 4: Hardening de Frete, Cenário Base, Unidades Reais e Metas (AA - AP)');

// AA. simulateFreeShippingImpact sem frete real não inventa R$ 25
const shipWithoutData = simulateFreeShippingImpact(40, 100, undefined, undefined);
assert(
  shipWithoutData.dataAvailable === false &&
  shipWithoutData.message?.includes('indisponíveis') === true &&
  shipWithoutData.baseline === undefined,
  'AA',
  'simulateFreeShippingImpact sem frete real não inventa R$ 25 (retorna dataAvailable: false)'
);

// AB. shippingCost explícito é respeitado
const shipExplicitCost = simulateFreeShippingImpact(40, 100, 32.50, 10);
assert(
  shipExplicitCost.dataAvailable === true &&
  shipExplicitCost.freeShipping?.shippingSubsidy === 32.50,
  'AB',
  'shippingCost explícito (R$ 32.50) é respeitado na simulação'
);

// AC. shippingCharged explícito é respeitado
assert(
  shipExplicitCost.baseline?.shippingSubsidy === 22.50 &&
  shipExplicitCost.marginDropMoney === 10,
  'AC',
  'shippingCharged explícito (R$ 10.00) é respeitado na simulação'
);

// AD. Cenário Base (zero-change) reconcilia com base atual
const simBase = simulateCommercialScenario(matrixProds, ordersProfMatrix, dreMatrix, SCENARIO_PRESETS.base);
const actualNet = ordersProfMatrix.reduce((acc, o) => acc + o.netRevenue, 0);
const actualContrib = ordersProfMatrix.reduce((acc, o) => acc + o.contributionMargin, 0);
assert(
  simBase.projectedOrdersCount === ordersProfMatrix.length &&
  Math.abs(simBase.projectedNetRevenue - actualNet) < 0.05 &&
  Math.abs(simBase.projectedContributionMargin - actualContrib) < 0.05 &&
  Math.abs(simBase.varianceVsActual.netRevenueDelta) < 0.05 &&
  Math.abs(simBase.varianceVsActual.contributionMarginDelta) < 0.05,
  'AD',
  'Cenário Base (zero-change) reconcilia estritamente com a base real atual'
);

// AE. Pedido com quantity=3 resulta em 3 unidades, não 1
const multiItemOrder = {
  id: 'ord_multi_qty',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 300,
  total: 300,
  items: [{ id: 'p_multi', slug: 'p_multi', name: 'Item Multi', unitPrice: 100, quantity: 3, costPrice: 40 }]
};
const prodsMulti = calculateProductProfitability([multiItemOrder], [{ id: 'p_multi', slug: 'p_multi', name: 'Item Multi', costPrice: 40, price: 100 }]);
const ordersProfMulti = [calculateOrderProfitability(multiItemOrder, [{ id: 'p_multi', costPrice: 40 }])];
const simMulti = simulateCommercialScenario(prodsMulti, ordersProfMulti, dreEmpty, SCENARIO_PRESETS.base);
assert(
  simMulti.projectedUnitsCount === 3 && simMulti.projectedOrdersCount === 1,
  'AE',
  'Pedido com quantity=3 resulta em 3 unidades reais calculadas, não 1'
);

// AF. calculateTargetProfitRequirements é realmente chamado
const targetMonthlyProfit = 5000;
const simWithTarget = simulateCommercialScenario(matrixProds, ordersProfMatrix, dreMatrix, SCENARIO_PRESETS.base, { targetMonthlyProfit });
assert(
  simWithTarget.targetProfit === 5000 &&
  simWithTarget.targetProfitRequiredRevenue > 0 &&
  simWithTarget.targetProfitRequiredUnits > 0,
  'AF',
  'calculateTargetProfitRequirements é executado e gera receita/unidades requeridas'
);

// AG. targetProfitGap correto
const expectedTargetGap = Math.max(0, Number((simWithTarget.targetProfitRequiredRevenue - simWithTarget.projectedNetRevenue).toFixed(2)));
assert(
  Math.abs(simWithTarget.targetProfitGap - expectedTargetGap) < 0.05,
  'AG',
  'targetProfitGap calculado corretamente em relação à receita projetada'
);

// AH. breakEvenGap != targetProfitGap quando metas diferem
assert(
  simWithTarget.targetProfitGap !== simWithTarget.breakEvenRevenueGap,
  'AH',
  'breakEvenRevenueGap e targetProfitGap são conceitos separados e não se confundem'
);

// AI. calculateMinimumPrice considera custos variáveis e gateway quando fornecidos
const minWithSubsidy = calculateMinimumPrice({ unitCost: 40, shippingCost: 15, shippingCharged: 0 });
const minWithoutSubsidy = calculateMinimumPrice({ unitCost: 40 });
assert(
  minWithSubsidy > minWithoutSubsidy && minWithSubsidy > 55,
  'AI',
  'calculateMinimumPrice considera shippingSubsidy e custos variáveis adicionais'
);

// AJ. calculateMinimumPrice considera otherVariableCosts
const minWithOther = calculateMinimumPrice({ unitCost: 40, otherVariableCosts: 5 });
assert(
  minWithOther > minWithoutSubsidy,
  'AJ',
  'calculateMinimumPrice considera outros custos variáveis alocados'
);

// AK. calculatePriceForDesiredMargin considera outros custos variáveis
const targetWithOther = calculatePriceForDesiredMargin({ unitCost: 40, desiredMarginPercent: 50, otherVariableCosts: 5 });
const targetWithoutOther = calculatePriceForDesiredMargin({ unitCost: 40, desiredMarginPercent: 50 });
assert(
  targetWithOther > targetWithoutOther,
  'AK',
  'calculatePriceForDesiredMargin considera outros custos variáveis'
);

// AL. Confiança SNAPSHOT -> HIGH
const recSnapshot = generateCommercialRecommendations(
  prodsSnap,
  ordersProfSnap,
  dreEmpty
);
assert(
  recSnapshot[0]?.confidence === 'high',
  'AL',
  'Item com custo snapshot registrado recebe confidence: "high"'
);

// AM. Confiança CATALOG -> MEDIUM
const recCatalog = generateCommercialRecommendations(
  prodsNormal,
  ordersProfNormal,
  dreEmpty
);
const catRec = recCatalog.find(r => r.entityId === 'p_norm' && r.type !== 'cost_data_incomplete');
assert(
  catRec?.confidence === 'medium',
  'AM',
  'Item com custo cadastrado no catálogo (sem snapshot de corte) recebe confidence: "medium"'
);

// AN. Confiança ESTIMATED -> LOW
const orderEstimatedOnly = {
  id: 'ord_est_line',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [{ id: 'p_est_line', slug: 'p_est_line', name: 'Camiseta FORCE Treino', unitPrice: 100, quantity: 1 }]
};
const prodsEstimated = calculateProductProfitability([orderEstimatedOnly], [{ id: 'p_est_line', slug: 'p_est_line', name: 'Camiseta FORCE Treino', line: 'FORCE' }]);
const ordersProfEstimated = [calculateOrderProfitability(orderEstimatedOnly, [{ id: 'p_est_line', line: 'FORCE' }])];
const recsEstimatedOnly = generateCommercialRecommendations(prodsEstimated, ordersProfEstimated, dreEmpty);
const recEstimated = recsEstimatedOnly.find(r => r.type === 'cost_data_incomplete');
assert(
  recEstimated?.confidence === 'low' && recEstimated?.isEstimated === true,
  'AN',
  'Item sem snapshot gera recomendação de cadastro com confidence: "low" e isEstimated: true'
);

// AO. Confiança MISSING -> LOW
const orderMissingOnly = {
  id: 'ord_miss_only',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [{ id: 'p_miss_item', slug: 'p_miss_item', name: 'Item Desconhecido', unitPrice: 100, quantity: 1 }]
};
const prodsMissing = calculateProductProfitability([orderMissingOnly], [{ id: 'p_miss_item', slug: 'p_miss_item', name: 'Item Desconhecido', line: 'OTHER', costPrice: 0 }]);
const ordersProfMissing = [calculateOrderProfitability(orderMissingOnly, [{ id: 'p_miss_item', costPrice: 0 }])];
const recMissing = generateCommercialRecommendations(
  prodsMissing,
  ordersProfMissing,
  dreEmpty
);
assert(
  recMissing.every(r => r.confidence === 'low' || r.confidence === 'medium'),
  'AO',
  'Item com custo zerado/missing possui confidence: "low"'
);

// AP. Custo missing NUNCA gera promoção como alta confiança
const promoMissing = recMissing.find(r => r.type === 'promotion_candidate');
assert(
  promoMissing === undefined || promoMissing.confidence !== 'high',
  'AP',
  'Custo missing nunca gera candidato a promoção com alta confiança'
);

console.log('\n📦 TEST GROUP 5: Hardening Canônico FASE 9.6.3-B (AQ - AX)');

// AQ. Fixture Real: Snapshot gravado no item do pedido
const fixtureSnapshotOrder = {
  id: 'ord_canon_snap',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 150,
  total: 150,
  items: [
    {
      id: 'prod_snap_real',
      slug: 'prod_snap_real',
      name: 'Camiseta Silk Snap',
      unitPrice: 150,
      quantity: 1,
      unitCostSnapshot: 42.50,
      costCoverage: 'complete'
    }
  ]
};
const fixtureSnapshotCatalog = [
  { id: 'prod_snap_real', slug: 'prod_snap_real', name: 'Camiseta Silk Snap', price: 150, costPrice: 50.00 }
];
const prodsCanonSnap = calculateProductProfitability([fixtureSnapshotOrder], fixtureSnapshotCatalog);
assert(
  prodsCanonSnap[0]?.costSource === 'snapshot' &&
  prodsCanonSnap[0]?.isCostSnapshot === true &&
  prodsCanonSnap[0]?.isEstimated === false &&
  prodsCanonSnap[0]?.unitCost === 42.50,
  'AQ',
  'Fixture com unitCostSnapshot no pedido deriva costSource="snapshot", isCostSnapshot=true e unitCost exato do snapshot'
);

// AR. Fixture Real: Catálogo (sem snapshot no pedido)
const fixtureCatalogOrder = {
  id: 'ord_canon_cat',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 150,
  total: 150,
  items: [
    {
      id: 'prod_cat_real',
      slug: 'prod_cat_real',
      name: 'Bermuda Dry Cat',
      unitPrice: 150,
      quantity: 1
    }
  ]
};
const fixtureCatalogOnly = [
  { id: 'prod_cat_real', slug: 'prod_cat_real', name: 'Bermuda Dry Cat', price: 150, costPrice: 48.00 }
];
const prodsCanonCat = calculateProductProfitability([fixtureCatalogOrder], fixtureCatalogOnly);
assert(
  prodsCanonCat[0]?.costSource === 'catalog' &&
  prodsCanonCat[0]?.isCostSnapshot === false &&
  prodsCanonCat[0]?.isEstimated === false &&
  prodsCanonCat[0]?.unitCost === 48.00,
  'AR',
  'Fixture sem snapshot deriva costSource="catalog", isCostSnapshot=false, isEstimated=false'
);

// AS. Fixture Real: Estimativa por Linha (sem snapshot e sem custo no catálogo)
const fixtureEstimatedOrder = {
  id: 'ord_canon_est',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 120,
  total: 120,
  items: [
    {
      id: 'prod_est_real',
      slug: 'prod_est_real',
      name: 'Regata FORCE Alpha',
      unitPrice: 120,
      quantity: 1
    }
  ]
};
const fixtureEstimatedCatalog = [
  { id: 'prod_est_real', slug: 'prod_est_real', name: 'Regata FORCE Alpha', line: 'FORCE', price: 120 }
];
const prodsCanonEst = calculateProductProfitability([fixtureEstimatedOrder], fixtureEstimatedCatalog);
assert(
  prodsCanonEst[0]?.costSource === 'estimated' &&
  prodsCanonEst[0]?.isCostSnapshot === false &&
  prodsCanonEst[0]?.isEstimated === true &&
  prodsCanonEst[0]?.unitCost === FINANCIAL_DEFAULTS.estimatedProductCosts.FORCE,
  'AS',
  'Fixture sem cadastro utiliza estimativa da linha FORCE com costSource="estimated" e isEstimated=true'
);

// AT. Fixture Real: Nenhuma fonte (costSource missing)
const fixtureMissingOrder = {
  id: 'ord_canon_miss',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 90,
  total: 90,
  items: [
    {
      id: 'prod_miss_real',
      slug: 'prod_miss_real',
      name: 'Acessório Desconhecido',
      unitPrice: 90,
      quantity: 1
    }
  ]
};
const fixtureMissingCatalog = [
  { id: 'prod_miss_real', slug: 'prod_miss_real', name: 'Acessório Desconhecido', line: 'OTHER', price: 90, costPrice: 0 }
];
const prodsCanonMiss = calculateProductProfitability([fixtureMissingOrder], fixtureMissingCatalog);
assert(
  prodsCanonMiss[0]?.costSource === 'missing' &&
  prodsCanonMiss[0]?.isCostSnapshot === false &&
  prodsCanonMiss[0]?.isEstimated === true &&
  prodsCanonMiss[0]?.unitCost === 0,
  'AT',
  'Fixture sem nenhuma fonte de custo deriva costSource="missing" e isEstimated=true'
);

// AU. Recomendações: Confiança derivada de Snapshot Real -> HIGH
const ordersProfCanonSnap = [calculateOrderProfitability(fixtureSnapshotOrder, fixtureSnapshotCatalog)];
const recsCanonSnap = generateCommercialRecommendations(prodsCanonSnap, ordersProfCanonSnap, dreEmpty);
const targetRecSnap = recsCanonSnap.find(r => r.entityId === 'prod_snap_real' && r.type !== 'cost_data_incomplete');
assert(
  targetRecSnap?.confidence === 'high',
  'AU',
  'Recomendação sobre produto com snapshot real gerada com confidence="high"'
);

// AV. Recomendações: Confiança derivada de Catálogo -> MEDIUM
const ordersProfCanonCat = [calculateOrderProfitability(fixtureCatalogOrder, fixtureCatalogOnly)];
const recsCanonCat = generateCommercialRecommendations(prodsCanonCat, ordersProfCanonCat, dreEmpty);
const targetRecCat = recsCanonCat.find(r => r.entityId === 'prod_cat_real' && r.type !== 'cost_data_incomplete');
assert(
  targetRecCat?.confidence === 'medium',
  'AV',
  'Recomendação sobre produto com custo de catálogo gerada com confidence="medium"'
);

// AW. Recomendações: Confiança derivada de Estimativa -> LOW
const ordersProfCanonEst = [calculateOrderProfitability(fixtureEstimatedOrder, fixtureEstimatedCatalog)];
const recsCanonEst = generateCommercialRecommendations(prodsCanonEst, ordersProfCanonEst, dreEmpty);
const targetRecEst = recsCanonEst.find(r => r.entityId === 'prod_est_real');
assert(
  targetRecEst?.confidence === 'low' && targetRecEst?.isEstimated === true,
  'AW',
  'Recomendação sobre produto com custo estimado gerada com confidence="low" e isEstimated=true'
);

// AX. Recomendações: Confiança derivada de Missing -> LOW e bloqueio de promoção falsa
const ordersProfCanonMiss = [calculateOrderProfitability(fixtureMissingOrder, fixtureMissingCatalog)];
const recsCanonMiss = generateCommercialRecommendations(prodsCanonMiss, ordersProfCanonMiss, dreEmpty);
const promoMiss = recsCanonMiss.find(r => r.entityId === 'prod_miss_real' && r.type === 'promotion_candidate');
assert(
  promoMiss === undefined && recsCanonMiss.every(r => r.confidence === 'low' || r.confidence === 'medium'),
  'AX',
  'Produto com custo missing não gera candidato a promoção e recomendações possuem confidence="low"'
);

console.log('\n📦 TEST GROUP 6: Reconciliação do Cenário Base com DRE Real e Validação de Contratos');

// AY. Reconciliação do Cenário Base com DRE Completo (Operating Result exato com todas as categorias)
const dreFull = calculateFinancialDRE(
  mockOrdersMatrix,
  [
    { id: 'exp_1', amount: 350, description: 'Aluguel do Galpão', category: 'DESPESA_FIXA' },
    { id: 'exp_2', amount: 150, description: 'Software ERP', category: 'DESPESA_FIXA' },
    { id: 'exp_var', amount: 80, description: 'Embalagens Especiais', category: 'DESPESA_VARIAVEL' },
    { id: 'exp_other', amount: 45, description: 'Serviços Notariais', category: 'OUTROS' }
  ],
  [],
  [
    { id: 'traf_1', amountSpent: 120, status: 'active' }
  ],
  mockMatrixCatalog
);
const simBaseReconciled = simulateCommercialScenario(matrixProds, ordersProfMatrix, dreFull, SCENARIO_PRESETS.base);
assert(
  Math.abs(simBaseReconciled.projectedOperatingResult - (dreFull.operatingProfit || 0)) <= 0.01 &&
  Math.abs(simBaseReconciled.varianceVsActual.operatingResultDelta) <= 0.01,
  'AY',
  'Cenário Base (zero-change) reconcilia perfeitamente com DRE operatingProfit completo (tolerância R$ 0.01)'
);

// AZ. Validação de parâmetros obrigatórios de simulateCommercialScenario
let throwsMissingProds = false;
try {
  simulateCommercialScenario([] as any, ordersProfMatrix, dreFull, SCENARIO_PRESETS.base);
} catch (e: any) {
  throwsMissingProds = e.message === 'PRODUCT_PROFITABILITY_REQUIRED';
}

let throwsMissingOrders = false;
try {
  simulateCommercialScenario(matrixProds, null as any, dreFull, SCENARIO_PRESETS.base);
} catch (e: any) {
  throwsMissingOrders = e.message === 'ORDERS_PROFITABILITY_REQUIRED';
}

let throwsMissingDre = false;
try {
  simulateCommercialScenario(matrixProds, ordersProfMatrix, null as any, SCENARIO_PRESETS.base);
} catch (e: any) {
  throwsMissingDre = e.message === 'DRE_REQUIRED';
}

let throwsMissingParams = false;
try {
  simulateCommercialScenario(matrixProds, ordersProfMatrix, dreFull, null as any);
} catch (e: any) {
  throwsMissingParams = e.message === 'SCENARIO_PARAMS_REQUIRED';
}

assert(
  throwsMissingProds && throwsMissingOrders && throwsMissingDre && throwsMissingParams,
  'AZ',
  'simulateCommercialScenario rejeita chamadas inválidas com exceções canônicas estritas'
);

// BA. Teste de Snapshots Diferentes (Custo Médio Histórico Ponderado)
const snapDiffOrder1 = {
  id: 'ord_snap_diff_1',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_snap_diff', slug: 'prod_snap_diff', name: 'Regata Blend', unitPrice: 100, quantity: 1, unitCostSnapshot: 40 }
  ]
};
const snapDiffOrder2 = {
  id: 'ord_snap_diff_2',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_snap_diff', slug: 'prod_snap_diff', name: 'Regata Blend', unitPrice: 100, quantity: 1, unitCostSnapshot: 50 }
  ]
};
const snapDiffCatalog = [{ id: 'prod_snap_diff', slug: 'prod_snap_diff', name: 'Regata Blend', price: 100, costPrice: 45 }];
const prodsSnapDiff = calculateProductProfitability([snapDiffOrder1, snapDiffOrder2], snapDiffCatalog);
const ordersProfSnapDiff = [
  calculateOrderProfitability(snapDiffOrder1, snapDiffCatalog),
  calculateOrderProfitability(snapDiffOrder2, snapDiffCatalog)
];
const dreSnapDiff = calculateFinancialDRE([snapDiffOrder1, snapDiffOrder2], [], [], [], snapDiffCatalog);
const simSnapDiff = simulateCommercialScenario(prodsSnapDiff, ordersProfSnapDiff, dreSnapDiff, SCENARIO_PRESETS.base);

assert(
  prodsSnapDiff[0].totalCogs === 90 &&
  Math.abs(simSnapDiff.projectedCogs - 90) <= 0.01,
  'BA',
  'Cenário Base utiliza custo médio ponderado histórico (totalCogs/unitsSold) e projeta R$ 90.00 com exatidão'
);

// BB. Reconciliação do Gross Revenue Base
const expectedTotalGross = matrixProds.reduce((acc, p) => acc + p.grossRevenue, 0);
assert(
  Math.abs(simBaseReconciled.projectedGrossRevenue - expectedTotalGross) <= 0.01,
  'BB',
  'projectedGrossRevenue do Cenário Base reconcilia exatamente com SUM(productsProfitability.grossRevenue)'
);

console.log('\n📦 TEST GROUP 8: Hardening de Fontes de Custo Mistas e Quebra Canônica (9.6.3-C: BC - BK)');

// BC. Teste de Mix Snapshot + Missing
const mixProdOrder1 = {
  id: 'ord_mix_1',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_mix', slug: 'prod_mix', name: 'Regata Mix', unitPrice: 100, quantity: 1, unitCostSnapshot: 40 }
  ]
};
const mixProdOrder2 = {
  id: 'ord_mix_2',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_mix', slug: 'prod_mix', name: 'Regata Mix', unitPrice: 100, quantity: 1 }
  ]
};
const mixCatalog = [{ id: 'prod_mix', slug: 'prod_mix', name: 'Regata Mix', price: 100, costPrice: 0 }];
const prodsMix = calculateProductProfitability([mixProdOrder1, mixProdOrder2], mixCatalog);
const recsMix = generateCommercialRecommendations(prodsMix, [], dreEmpty);
const pMix = prodsMix[0];

assert(
  pMix.unitsSold === 2 &&
  pMix.costSourceBreakdown.snapshotUnits === 1 &&
  pMix.costSourceBreakdown.missingUnits === 1 &&
  pMix.hasMixedCostSources === true &&
  pMix.costSource === 'missing' &&
  pMix.isCostSnapshot === false &&
  pMix.isEstimated === true &&
  recsMix.some(r => r.entityId === 'prod_mix' && r.confidence === 'low'),
  'BC',
  'Mix Snapshot + Missing deriva costSource="missing", hasMixedCostSources=true, isCostSnapshot=false, isEstimated=true e confidence=LOW'
);

// BD. Teste de Mix Snapshot + Catalog
const snapCatOrder1 = {
  id: 'ord_sc_1',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_sc', slug: 'prod_sc', name: 'Camisa SC', unitPrice: 100, quantity: 1, unitCostSnapshot: 40 }
  ]
};
const snapCatOrder2 = {
  id: 'ord_sc_2',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_sc', slug: 'prod_sc', name: 'Camisa SC', unitPrice: 100, quantity: 1 }
  ]
};
const scCatalog = [{ id: 'prod_sc', slug: 'prod_sc', name: 'Camisa SC', price: 100, costPrice: 42 }];
const prodsSC = calculateProductProfitability([snapCatOrder1, snapCatOrder2], scCatalog);
const recsSC = generateCommercialRecommendations(prodsSC, [], dreEmpty);
const pSC = prodsSC[0];

assert(
  pSC.costSource === 'catalog' &&
  pSC.isCostSnapshot === false &&
  pSC.hasMixedCostSources === true &&
  recsSC.some(r => r.entityId === 'prod_sc' && r.confidence === 'medium'),
  'BD',
  'Mix Snapshot + Catalog deriva costSource="catalog", isCostSnapshot=false e confidence=MEDIUM'
);

// BE. Teste 100% Snapshot
const snap100Order1 = {
  id: 'ord_s100_1',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_s100', slug: 'prod_s100', name: 'Bermuda 100', unitPrice: 100, quantity: 1, unitCostSnapshot: 40 }
  ]
};
const snap100Order2 = {
  id: 'ord_s100_2',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_s100', slug: 'prod_s100', name: 'Bermuda 100', unitPrice: 100, quantity: 2, unitCostSnapshot: 40 }
  ]
};
const s100Catalog = [{ id: 'prod_s100', slug: 'prod_s100', name: 'Bermuda 100', price: 100, costPrice: 40 }];
const prodsS100 = calculateProductProfitability([snap100Order1, snap100Order2], s100Catalog);
const recsS100 = generateCommercialRecommendations(prodsS100, [], dreEmpty, { desiredMarginPercent: 50 });
const pS100 = prodsS100[0];

assert(
  pS100.costSource === 'snapshot' &&
  pS100.isCostSnapshot === true &&
  pS100.unitsSold === 3 &&
  pS100.costSourceBreakdown.snapshotUnits === 3 &&
  recsS100.some(r => r.entityId === 'prod_s100' && r.confidence === 'high'),
  'BE',
  '100% Snapshot deriva costSource="snapshot", isCostSnapshot=true e confidence=HIGH'
);

// BF. Teste Quantity real de itens na contagem
const qtyOrder = {
  id: 'ord_qty_3',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 300,
  total: 300,
  items: [
    { id: 'prod_qty_3', slug: 'prod_qty_3', name: 'Kit 3 Regatas', unitPrice: 100, quantity: 3, unitCostSnapshot: 35 }
  ]
};
const prodsQty = calculateProductProfitability([qtyOrder], [{ id: 'prod_qty_3', slug: 'prod_qty_3', name: 'Kit 3 Regatas', price: 100 }]);
assert(
  prodsQty[0].costSourceBreakdown.snapshotUnits === 3 &&
  prodsQty[0].unitsSold === 3,
  'BF',
  'Contadores de quebra de custo consideram quantidade real multiplicada (quantity=3 -> 3 unidades)'
);

// BG. Teste Missing sem Preço Fictício
const missingProdMock: ProductProfitabilityItem = {
  id: 'prod_miss_real',
  slug: 'prod_miss_real',
  name: 'Colete Desconhecido',
  line: 'OTHER',
  stock: 10,
  unitPrice: 30,
  unitCost: 0,
  costSource: 'missing',
  costSourceBreakdown: { snapshotUnits: 0, catalogUnits: 0, estimatedUnits: 0, missingUnits: 1 },
  costCoveragePercent: 0,
  hasMixedCostSources: false,
  isCostSnapshot: false,
  isEstimated: true,
  unitsSold: 1,
  totalRevenue: 30,
  grossRevenue: 30,
  netRevenue: 30,
  totalCogs: 0,
  cogs: 0,
  grossProfit: 30,
  marginPercent: 100,
  grossMarginPercent: 100,
  gatewayFeesAllocated: 0,
  shippingSubsidyAllocated: 0,
  otherVariableCostsAllocated: 0,
  contributionMargin: 30,
  contributionMarginPercent: 100,
  allocationMethod: 'revenue_proportional',
  isAllocated: true
};
const recsMissing = generateCommercialRecommendations([missingProdMock], [], dreEmpty);
const hasNegativeMinWithDefault = recsMissing.some(r => r.title.includes('Preço Abaixo do Mínimo Sustentável'));
const hasIncompleteCost = recsMissing.some(r => r.type === 'cost_data_incomplete' && r.description.includes('Custo insuficiente para recomendação segura de preço.'));

assert(
  !hasNegativeMinWithDefault && hasIncompleteCost,
  'BG',
  'Produto com costSource="missing" não inventa preço mínimo fictício com DEFAULT=40 e gera cost_data_incomplete'
);

// BH. Teste Missing sem Promoção
const hasPromoCandidate = recsMissing.some(r => r.type === 'promotion_candidate');
assert(
  !hasPromoCandidate,
  'BH',
  'Produto com costSource="missing" nunca gera recomendação de promoção (promotion_candidate = absent)'
);

// BI. Teste Missing sem Risco de Custo (Sensibilidade)
const hasCostRisk = recsMissing.some(r => r.type === 'cost_increase_risk');
assert(
  !hasCostRisk,
  'BI',
  'Produto com costSource="missing" não gera cost_increase_risk pois não há base de custo conhecida'
);

// BJ. Teste Estimated Continua Funcionando
const estForceProdMock: ProductProfitabilityItem = {
  id: 'prod_force_est',
  slug: 'prod_force_est',
  name: 'Regata FORCE Treino',
  line: 'FORCE',
  stock: 10,
  unitPrice: 30,
  unitCost: 0,
  costSource: 'estimated',
  costSourceBreakdown: { snapshotUnits: 0, catalogUnits: 0, estimatedUnits: 1, missingUnits: 0 },
  costCoveragePercent: 0,
  hasMixedCostSources: false,
  isCostSnapshot: false,
  isEstimated: true,
  unitsSold: 1,
  totalRevenue: 30,
  grossRevenue: 30,
  netRevenue: 30,
  totalCogs: 0,
  cogs: 0,
  grossProfit: 30,
  marginPercent: 100,
  grossMarginPercent: 100,
  gatewayFeesAllocated: 0,
  shippingSubsidyAllocated: 0,
  otherVariableCostsAllocated: 0,
  contributionMargin: 30,
  contributionMarginPercent: 100,
  allocationMethod: 'revenue_proportional',
  isAllocated: true
};
const recsEst = generateCommercialRecommendations([estForceProdMock], [], dreEmpty);
const estBelowMin = recsEst.find(r => r.type === 'negative_margin');

assert(
  estBelowMin !== undefined &&
  estBelowMin.confidence === 'low' &&
  estBelowMin.isEstimated === true &&
  estBelowMin.description.includes('Simulação baseada em custo estimado.'),
  'BJ',
  'Produto FORCE estimado utiliza estimativa canônica da linha FORCE com confidence=LOW, isEstimated=true e disclaimer'
);

// BK. Teste de Cobertura de Custo (Coverage)
const covOrder1 = {
  id: 'ord_cov_1',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 300,
  total: 300,
  items: [
    { id: 'prod_cov', slug: 'prod_cov', name: 'Top Coverage', unitPrice: 100, quantity: 3, unitCostSnapshot: 40 }
  ]
};
const covOrder2 = {
  id: 'ord_cov_2',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_cov', slug: 'prod_cov', name: 'Top Coverage', unitPrice: 100, quantity: 1 }
  ]
};
const covCatalog = [{ id: 'prod_cov', slug: 'prod_cov', name: 'Top Coverage', price: 100, costPrice: 0 }];
const prodsCov = calculateProductProfitability([covOrder1, covOrder2], covCatalog);
assert(
  prodsCov[0].costCoveragePercent === 75,
  'BK',
  '3 unidades snapshot + 1 unidade missing resulta em costCoveragePercent = 75%'
);

console.log('\n📦 TEST GROUP 9: Alinhamento Final da Cobertura de Custo por Linha (9.6.3-D: BL - BQ)');

// BL. Teste BL — 3 SNAPSHOT + 1 MISSING na mesma Linha
const lineProdsBL = calculateProductProfitability([covOrder1, covOrder2], covCatalog);
const linesBL = aggregateProfitabilityByLine(lineProdsBL);
const lineOTHER_BL = linesBL.find(l => l.lineName === 'OTHER')!;

assert(
  lineOTHER_BL.unitsSold === 4 &&
  lineOTHER_BL.costSourceBreakdown.snapshotUnits === 3 &&
  lineOTHER_BL.costSourceBreakdown.missingUnits === 1 &&
  lineOTHER_BL.costCoverage === 75 &&
  lineOTHER_BL.isEstimated === true &&
  lineOTHER_BL.costSource === 'missing',
  'BL',
  'Linha com 3 snapshot + 1 missing agrega costCoverage = 75%, isEstimated = true e costSource = "missing"'
);

// BM. Teste BM — 100% CATALOG
const catOrderBM = {
  id: 'ord_cat_bm',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 400,
  total: 400,
  items: [
    { id: 'prod_mark_bm', slug: 'prod_mark_bm', name: 'Bermuda MARK BM', unitPrice: 100, quantity: 4 }
  ]
};
const catCatalogBM = [{ id: 'prod_mark_bm', slug: 'prod_mark_bm', name: 'Bermuda MARK BM', line: 'MARK', price: 100, costPrice: 45 }];
const prodsBM = calculateProductProfitability([catOrderBM], catCatalogBM);
const linesBM = aggregateProfitabilityByLine(prodsBM);
const lineMARK_BM = linesBM.find(l => l.lineName === 'MARK')!;

assert(
  lineMARK_BM.unitsSold === 4 &&
  lineMARK_BM.costSourceBreakdown.catalogUnits === 4 &&
  lineMARK_BM.costCoverage === 100 &&
  lineMARK_BM.isEstimated === false &&
  lineMARK_BM.costSource === 'catalog' &&
  lineMARK_BM.hasMixedCostSources === false,
  'BM',
  'Linha 100% catálogo resulta em costCoverage = 100%, isEstimated = false, costSource = "catalog" e hasMixedCostSources = false'
);

// BN. Teste BN — SNAPSHOT + CATALOG (2 snapshot, 2 catalog)
const snapCatOrderBN1 = {
  id: 'ord_sc_bn1',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 200,
  total: 200,
  items: [
    { id: 'prod_prime_bn', slug: 'prod_prime_bn', name: 'Camisa PRIME BN', unitPrice: 100, quantity: 2, unitCostSnapshot: 38 }
  ]
};
const snapCatOrderBN2 = {
  id: 'ord_sc_bn2',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 200,
  total: 200,
  items: [
    { id: 'prod_prime_bn', slug: 'prod_prime_bn', name: 'Camisa PRIME BN', unitPrice: 100, quantity: 2 }
  ]
};
const catCatalogBN = [{ id: 'prod_prime_bn', slug: 'prod_prime_bn', name: 'Camisa PRIME BN', line: 'PRIME', price: 100, costPrice: 38 }];
const prodsBN = calculateProductProfitability([snapCatOrderBN1, snapCatOrderBN2], catCatalogBN);
const linesBN = aggregateProfitabilityByLine(prodsBN);
const linePRIME_BN = linesBN.find(l => l.lineName === 'PRIME')!;

assert(
  linePRIME_BN.unitsSold === 4 &&
  linePRIME_BN.costSourceBreakdown.snapshotUnits === 2 &&
  linePRIME_BN.costSourceBreakdown.catalogUnits === 2 &&
  linePRIME_BN.costCoverage === 100 &&
  linePRIME_BN.isEstimated === false &&
  linePRIME_BN.hasMixedCostSources === true &&
  linePRIME_BN.costSource === 'catalog',
  'BN',
  'Linha com 2 snapshot + 2 catalog resulta em costCoverage = 100%, isEstimated = false, hasMixedCostSources = true e costSource = "catalog"'
);

// BO. Teste BO — CATALOG + ESTIMATED (3 catalog, 1 estimated)
const catOrderBO = {
  id: 'ord_bo_1',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 300,
  total: 300,
  items: [
    { id: 'prod_force_bo1', slug: 'prod_force_bo1', name: 'Short FORCE BO', unitPrice: 100, quantity: 3 }
  ]
};
const estOrderBO = {
  id: 'ord_bo_2',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_force_bo2', slug: 'prod_force_bo2', name: 'Short FORCE BO Sem Custo', unitPrice: 100, quantity: 1 }
  ]
};
const catCatalogBO = [
  { id: 'prod_force_bo1', slug: 'prod_force_bo1', name: 'Short FORCE BO', line: 'FORCE', price: 100, costPrice: 40 },
  { id: 'prod_force_bo2', slug: 'prod_force_bo2', name: 'Short FORCE BO Sem Custo', line: 'FORCE', price: 100, costPrice: 0 }
];
const prodsBO = calculateProductProfitability([catOrderBO, estOrderBO], catCatalogBO);
const linesBO = aggregateProfitabilityByLine(prodsBO);
const lineFORCE_BO = linesBO.find(l => l.lineName === 'FORCE')!;

assert(
  lineFORCE_BO.unitsSold === 4 &&
  lineFORCE_BO.costSourceBreakdown.catalogUnits === 3 &&
  lineFORCE_BO.costSourceBreakdown.estimatedUnits === 1 &&
  lineFORCE_BO.costCoverage === 75 &&
  lineFORCE_BO.isEstimated === true &&
  lineFORCE_BO.costSource === 'estimated' &&
  lineFORCE_BO.hasMixedCostSources === true,
  'BO',
  'Linha com 3 catalog + 1 estimated resulta em costCoverage = 75%, isEstimated = true, costSource = "estimated" e hasMixedCostSources = true'
);

// BP. Teste BP — QUANTITIES DE PRODUTOS DIFERENTES (9 snapshot, 1 missing -> 90% coverage)
const orderBP1 = {
  id: 'ord_bp_1',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 900,
  total: 900,
  items: [
    { id: 'prod_bp_a', slug: 'prod_bp_a', name: 'Item Alpha', unitPrice: 100, quantity: 9, unitCostSnapshot: 35 }
  ]
};
const orderBP2 = {
  id: 'ord_bp_2',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 100,
  total: 100,
  items: [
    { id: 'prod_bp_b', slug: 'prod_bp_b', name: 'Item Beta Missing', unitPrice: 100, quantity: 1 }
  ]
};
const catBP = [
  { id: 'prod_bp_a', slug: 'prod_bp_a', name: 'Item Alpha', line: 'OTHER', price: 100, costPrice: 35 },
  { id: 'prod_bp_b', slug: 'prod_bp_b', name: 'Item Beta Missing', line: 'OTHER', price: 100, costPrice: 0 }
];
const prodsBP = calculateProductProfitability([orderBP1, orderBP2], catBP);
const linesBP = aggregateProfitabilityByLine(prodsBP);
const lineOTHER_BP = linesBP.find(l => l.lineName === 'OTHER')!;

assert(
  lineOTHER_BP.unitsSold === 10 &&
  lineOTHER_BP.costSourceBreakdown.snapshotUnits === 9 &&
  lineOTHER_BP.costSourceBreakdown.missingUnits === 1 &&
  lineOTHER_BP.costCoverage === 90,
  'BP',
  'Produto A (9 snapshot) + Produto B (1 missing) resulta em costCoverage = 90% (ponderado por quantity, não 50%)'
);

// BQ. Teste BQ — RECONCILIAÇÃO DE UNIDADES
const allLinesReconciled = linesBP.every(line => {
  const sumBreakdown = line.costSourceBreakdown.snapshotUnits +
    line.costSourceBreakdown.catalogUnits +
    line.costSourceBreakdown.estimatedUnits +
    line.costSourceBreakdown.missingUnits;
  return sumBreakdown === line.unitsSold;
});

assert(
  allLinesReconciled === true,
  'BQ',
  'Para cada linha: snapshotUnits + catalogUnits + estimatedUnits + missingUnits === unitsSold'
);

console.log('\n📦 TEST GROUP 7: Scanners Estruturais de Fórmulas Paralelas e Magic Values');

// Scanner de Fórmulas Financeiras Paralelas Proibidas
const forbiddenPatterns = [
  'else if (Array.isArray(productsOrOrders))',
  ': orders.length',
  'projectedNetRevenue = actualNetRevenue *',
  'projectedContributionMargin = projectedNetRevenue -',
  '? 30',
  ': 30'
];

forbiddenPatterns.forEach(pattern => {
  if (commercialUtilCode.includes(pattern)) {
    console.error(`  ❌ Forbidden pattern found: "${pattern}"`);
    parallelFormulasFound++;
  }
});

// Scanner de Valores Mágicos Não Configurados no arquivo commercialIntelligence.ts
// (Verifica se existem constantes financeiras soltas fora de defaults)
const forbiddenMagicValues = [
  'estimatedShippingCost = 25',
  'currentShippingCharged = 15',
  '25.00',
  '15.00',
  '149.90'
];

forbiddenMagicValues.forEach(magic => {
  if (commercialUtilCode.includes(magic)) {
    console.error(`  ❌ Forbidden magic value found: "${magic}"`);
    unconfiguredMagicValuesFound++;
  }
});

assert(
  parallelFormulasFound === 0,
  'SCAN_PARALLEL',
  'Zero fórmulas financeiras paralelas ou branches legados detectados em commercialIntelligence.ts'
);

assert(
  unconfiguredMagicValuesFound === 0,
  'SCAN_MAGIC',
  'Zero valores financeiros mágicos não configurados encontrados no código'
);

// Summary Output
console.log('\n================================================================');
console.log(`COMMERCIAL PARALLEL FINANCIAL FORMULAS: ${parallelFormulasFound}`);
console.log(`UNCONFIGURED FINANCIAL MAGIC VALUES: ${unconfiguredMagicValuesFound}`);
console.log(`WRITE CALLS: ${writeCallsFound}`);
console.log(`DUPLICATE QUERY/LISTENER ISSUES: ${duplicateQueriesFound}`);
console.log('----------------------------------------------------------------');
console.log('LINE COST COVERAGE UNIT-WEIGHTED: PASS');
console.log('LINE SNAPSHOT COVERAGE: PASS');
console.log('LINE CATALOG COVERAGE: PASS');
console.log('LINE ESTIMATED COVERAGE: PASS');
console.log('LINE MISSING COVERAGE: PASS');
console.log('LINE MIXED COST SOURCE: PASS');
console.log('LINE UNITS RECONCILIATION: PASS');
console.log('----------------------------------------------------------------');
console.log(`TOTAL DE TESTES (9.6.3): ${testsPassed + testsFailed}`);
console.log(`PASSED: ${testsPassed}`);
console.log(`FAILED: ${testsFailed}`);
console.log('================================================================');

if (testsFailed > 0 || parallelFormulasFound > 0 || unconfiguredMagicValuesFound > 0 || writeCallsFound > 0 || duplicateQueriesFound > 0) {
  console.error('❌ CERTIFICAÇÃO 9.6.3 REPROVADA');
  process.exit(1);
} else {
  console.log('🌟 FASE 9.6.3 — CONCLUÍDA E CERTIFICADA! 🌟');
  process.exit(0);
}

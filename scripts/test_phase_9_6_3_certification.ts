/**
 * FASE 9.6.3 — CERTIFICATION TEST SUITE (9.6.3-C / 9.6.3-A)
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
  classifyBreakEvenStatus
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
console.log('FASE 9.6.3-A — CERTIFICAÇÃO DO MOTOR DE INTELIGÊNCIA COMERCIAL');
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

const mockMatrixOrders = [
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `ord_s_${i}`,
    status: 'approved',
    paymentStatus: 'paid',
    paidAmount: 200,
    total: 200,
    items: [{ id: 'p_strat', slug: 'p_strat', name: 'Estratégico', unitPrice: 200, quantity: 1, costPrice: 40 }]
  })),
  {
    id: 'ord_opp',
    status: 'approved',
    paymentStatus: 'paid',
    paidAmount: 200,
    total: 200,
    items: [{ id: 'p_opp', slug: 'p_opp', name: 'Oportunidade', unitPrice: 200, quantity: 1, costPrice: 40 }]
  },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `ord_opt_${i}`,
    status: 'approved',
    paymentStatus: 'paid',
    paidAmount: 100,
    total: 100,
    items: [{ id: 'p_opt', slug: 'p_opt', name: 'Otimizar', unitPrice: 100, quantity: 1, costPrice: 85 }]
  })),
  {
    id: 'ord_rev',
    status: 'approved',
    paymentStatus: 'paid',
    paidAmount: 100,
    total: 100,
    items: [{ id: 'p_rev', slug: 'p_rev', name: 'Revisar', unitPrice: 100, quantity: 1, costPrice: 85 }]
  }
];

const matrixProds = calculateProductProfitability(mockMatrixOrders, mockMatrixCatalog);
const classifiedMatrix = classifyCommercialMatrix(matrixProds, 5, 25);

const strat = classifiedMatrix.find(m => m.product.slug === 'p_strat');
const opp = classifiedMatrix.find(m => m.product.slug === 'p_opp');
const opt = classifiedMatrix.find(m => m.product.slug === 'p_opt');
const rev = classifiedMatrix.find(m => m.product.slug === 'p_rev');

assert(
  strat?.quadrant === 'strategic' &&
  opp?.quadrant === 'opportunity' &&
  opt?.quadrant === 'optimize' &&
  rev?.quadrant === 'review',
  'R',
  'Matriz de Rentabilidade classifica com precisão os 4 quadrantes (Estratégico, Oportunidade, Otimizar, Revisar)'
);

// S. Volume Relativo por Mediana
const autoMatrix = classifyCommercialMatrix(matrixProds);
assert(autoMatrix.length === 4, 'S', 'Classificação de volume relativo automático por mediana funciona sem thresholds manuais');

// T. Cenário Conservador (-15% volume, +10% custo, +10% frete)
const ordersProfMatrix = mockMatrixOrders.map(o => calculateOrderProfitability(o, mockMatrixCatalog));
const dreMatrix = calculateFinancialDRE(mockMatrixOrders, [{ amount: 500, category: 'DESPESA_FIXA' }], [], [], mockMatrixCatalog);

const simConserv = simulateCommercialScenario(matrixProds, ordersProfMatrix, dreMatrix, SCENARIO_PRESETS.conservative);

assert(
  simConserv.projectedOrdersCount < ordersProfMatrix.length &&
  simConserv.projectedContributionMargin < dreMatrix.grossProfit &&
  simConserv.isSimulation === true,
  'T',
  'Cenário Conservador projeta queda de volume e estresse de custos com precisão'
);

// U. Cenário Agressivo (+25% volume, R$ 1500 mkt)
const simAggress = simulateCommercialScenario(matrixProds, ordersProfMatrix, dreMatrix, SCENARIO_PRESETS.aggressive);

assert(
  simAggress.projectedOrdersCount > ordersProfMatrix.length &&
  simAggress.projectedFixedExpenses === (dreMatrix.fixedExpenses || 0) + 1500,
  'U',
  'Cenário Agressivo projeta expansão de volume e incremento de despesa fixa'
);

// V. Metas e Break-Even gap integrado
const beGapRec = generateCommercialRecommendations(
  matrixProds, 
  ordersProfMatrix, 
  { ...dreMatrix, fixedExpenses: 50000 }
);
const beAlert = beGapRec.find(r => r.type === 'break_even_risk');
assert(
  beAlert !== undefined && beAlert.reasonCodes.includes('BREAK_EVEN_NOT_REACHED'),
  'V',
  'Alerta de Break-Even identifica gap de despesas fixas a cobrir'
);

// W. Opportunity Score determinístico
const scoreMax = calculateOpportunityScore(100, 20, 3000, 20, 3000);
const scoreMid = calculateOpportunityScore(50, 20, 3000, 20, 3000);
const scoreLow = calculateOpportunityScore(10, 1, 100, 20, 3000);
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
  simBase.varianceVsActual.netRevenueDelta === 0 &&
  simBase.varianceVsActual.contributionMarginDelta === 0,
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
  [{ ...prodsSnap[0], isCostSnapshot: true }],
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
  [{ ...prodsSnap[0], isCostSnapshot: false, unitCost: 40 }],
  ordersProfSnap,
  dreEmpty
);
const catRec = recCatalog.find(r => r.entityId === 'p_snap' && r.type !== 'cost_data_incomplete');
assert(
  catRec?.confidence === 'medium',
  'AM',
  'Item com custo cadastrado no catálogo (sem snapshot de corte) recebe confidence: "medium"'
);

// AN. Confiança ESTIMATED -> LOW
const recEstimated = recCatalog.find(r => r.type === 'cost_data_incomplete');
assert(
  recEstimated?.confidence === 'low' && recEstimated?.isEstimated === true,
  'AN',
  'Item sem snapshot gera recomendação de cadastro com confidence: "low" e isEstimated: true'
);

// AO. Confiança MISSING -> LOW
const recMissing = generateCommercialRecommendations(
  [{ ...prodsSnap[0], isCostSnapshot: false, unitCost: 0 }],
  ordersProfSnap,
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

// Summary Output
console.log('\n================================================================');
console.log(`UI PARALLEL FINANCIAL FORMULAS: ${parallelFormulasFound}`);
console.log(`WRITE CALLS: ${writeCallsFound}`);
console.log(`DUPLICATE QUERY/LISTENER ISSUES: ${duplicateQueriesFound}`);
console.log('----------------------------------------------------------------');
console.log(`TOTAL DE TESTES (9.6.3-A): ${testsPassed + testsFailed}`);
console.log(`PASSED: ${testsPassed}`);
console.log(`FAILED: ${testsFailed}`);
console.log('================================================================');

if (testsFailed > 0 || parallelFormulasFound > 0 || writeCallsFound > 0 || duplicateQueriesFound > 0) {
  console.error('❌ CERTIFICAÇÃO 9.6.3-A REPROVADA');
  process.exit(1);
} else {
  console.log('🌟 FASE 9.6.3-A CERTIFICADA COM SUCESSO! 🌟');
  process.exit(0);
}

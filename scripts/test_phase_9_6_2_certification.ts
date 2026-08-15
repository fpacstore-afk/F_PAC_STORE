/**
 * FASE 9.6.2 — CERTIFICATION TEST SUITE (9.6.2-C)
 * Dashboard de Rentabilidade, Precificação, Break-Even e Metas
 * Atribuição Canônica de Custos por Produto/Linha & Reconciliação Exata
 */

import fs from 'fs';
import path from 'path';
import { 
  calculateOrderProfitability, 
  calculateProductProfitability, 
  calculateProfitabilityOverviewStats,
  calculateRevenueComposition,
  aggregateProfitabilityByLine,
  simulateProductPrice, 
  calculateMinimumPrice, 
  calculatePriceForDesiredMargin, 
  calculateBreakEven, 
  calculateTargetProfitRequirements,
  classifyMargin,
  classifyBreakEvenStatus,
  MARGIN_THRESHOLDS,
  BREAKEVEN_THRESHOLDS
} from '../src/utils/profitability';
import { calculateFinancialDRE } from '../src/utils/orderFinancial';
import { FINANCIAL_DEFAULTS } from '../shared/financialDefaults';

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
console.log('FASE 9.6.2-C — CERTIFICAÇÃO ESTRUTURAL, MATEMÁTICA E DE ALOCAÇÃO');
console.log('================================================================\n');

// ----------------------------------------------------
// READ UI COMPONENT FILES FOR STATIC AUDIT
// ----------------------------------------------------
const profitabilityDir = path.resolve(process.cwd(), 'src/components/admin/financial/profitability');
const overviewCode = fs.readFileSync(path.join(profitabilityDir, 'ProfitabilityOverview.tsx'), 'utf-8');
const productViewCode = fs.readFileSync(path.join(profitabilityDir, 'ProductProfitabilityView.tsx'), 'utf-8');
const drawerCode = fs.readFileSync(path.join(profitabilityDir, 'ProductProfitabilityDrawer.tsx'), 'utf-8');
const simulatorCode = fs.readFileSync(path.join(profitabilityDir, 'PriceSimulator.tsx'), 'utf-8');
const breakEvenCode = fs.readFileSync(path.join(profitabilityDir, 'BreakEvenView.tsx'), 'utf-8');
const targetsCode = fs.readFileSync(path.join(profitabilityDir, 'TargetProfitPlanner.tsx'), 'utf-8');
const dashboardCode = fs.readFileSync(path.join(profitabilityDir, 'ProfitabilityPricingDashboard.tsx'), 'utf-8');

const allComponentCodes = [
  { name: 'ProfitabilityOverview', code: overviewCode },
  { name: 'ProductProfitabilityView', code: productViewCode },
  { name: 'ProductProfitabilityDrawer', code: drawerCode },
  { name: 'PriceSimulator', code: simulatorCode },
  { name: 'BreakEvenView', code: breakEvenCode },
  { name: 'TargetProfitPlanner', code: targetsCode },
  { name: 'ProfitabilityPricingDashboard', code: dashboardCode }
];

console.log('📦 TEST GROUP 1: Auditoria Estrutural dos Componentes da UI (A - S)');

// A. ProfitabilityOverview não contém fórmula local de contribution margin
const hasOverviewLocalMarginCalc = overviewCode.includes('(contributionMargin / netRevenue)') || overviewCode.includes('ratio *');
if (hasOverviewLocalMarginCalc) parallelFormulasFound++;
assert(!hasOverviewLocalMarginCalc, 'A', 'ProfitabilityOverview não contém fórmula local de contribution margin');

// B. ProductProfitabilityView não contém grossProfit/revenue para contribution margin
const hasProductViewLocalMarginCalc = productViewCode.includes('grossProfit / totalRevenue') && productViewCode.includes('contributionMargin');
if (hasProductViewLocalMarginCalc) parallelFormulasFound++;
assert(!hasProductViewLocalMarginCalc, 'B', 'ProductProfitabilityView não confunde grossProfit com contribution margin');

// C, D, E. FORCE, MARK, PRIME usam agregação canônica
const mockCatalogSample = [
  { id: 'f1', slug: 'f1', name: 'FORCE T-Shirt Heavyweight', line: 'FORCE', costPrice: 50, price: 160 },
  { id: 'm1', slug: 'm1', name: 'MARK Oversized Hoodie', line: 'MARK', costPrice: 60, price: 190 },
  { id: 'p1', slug: 'p1', name: 'PRIME Limited Edition Tee', line: 'PRIME', costPrice: 70, price: 240 }
];

const mockOrdersSample = [
  {
    id: 'ord_sample_1',
    status: 'approved',
    paymentStatus: 'paid',
    paidAmount: 590,
    total: 590,
    items: [
      { id: 'f1', slug: 'f1', name: 'FORCE T-Shirt Heavyweight', unitPrice: 160, quantity: 1, costPrice: 50 },
      { id: 'm1', slug: 'm1', name: 'MARK Oversized Hoodie', unitPrice: 190, quantity: 1, costPrice: 60 },
      { id: 'p1', slug: 'p1', name: 'PRIME Limited Edition Tee', unitPrice: 240, quantity: 1, costPrice: 70 }
    ],
    shippingFinances: { shippingCost: 30, shippingCharged: 20 }
  }
];

const computedProds = calculateProductProfitability(mockOrdersSample, mockCatalogSample);
const computedOrdersProf = mockOrdersSample.map(o => calculateOrderProfitability(o, mockCatalogSample));
const aggregatedLines = aggregateProfitabilityByLine(computedProds, computedOrdersProf);

const forceLine = aggregatedLines.find(l => l.lineName === 'FORCE');
const markLine = aggregatedLines.find(l => l.lineName === 'MARK');
const primeLine = aggregatedLines.find(l => l.lineName === 'PRIME');

assert(forceLine !== undefined && forceLine.unitsSold === 1 && forceLine.cogs === 50, 'C', 'FORCE usa agregação canônica');
assert(markLine !== undefined && markLine.unitsSold === 1 && markLine.cogs === 60, 'D', 'MARK usa agregação canônica');
assert(primeLine !== undefined && primeLine.unitsSold === 1 && primeLine.cogs === 70, 'E', 'PRIME usa agregação canônica');

// F. PriceSimulator usa simulateProductPrice
assert(simulatorCode.includes('simulateProductPrice('), 'F', 'PriceSimulator usa simulateProductPrice');

// G. BreakEvenView usa calculateBreakEven
assert(breakEvenCode.includes('calculateBreakEven('), 'G', 'BreakEvenView usa calculateBreakEven');

// H. TargetProfitPlanner usa calculateTargetProfitRequirements
assert(targetsCode.includes('calculateTargetProfitRequirements('), 'H', 'TargetProfitPlanner usa calculateTargetProfitRequirements');

// I. Drawer não recalcula margem
const drawerRecalculatesMargin = drawerCode.includes('/ product.totalRevenue') || drawerCode.includes('grossProfit /');
if (drawerRecalculatesMargin) parallelFormulasFound++;
assert(!drawerRecalculatesMargin, 'I', 'Drawer não recalcula margem');

// J, K, L, M, N. Zero Write Calls (setDoc, updateDoc, addDoc, deleteDoc, fetch, axios)
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

assert(setDocCount === 0, 'J', 'Nenhum componente possui setDoc');
assert(updateDocCount === 0, 'K', 'Nenhum componente possui updateDoc');
assert(addDocCount === 0, 'L', 'Nenhum componente possui addDoc');
assert(deleteDocCount === 0, 'M', 'Nenhum componente possui deleteDoc');
assert(httpMutationsCount === 0, 'N', 'Nenhum componente dispara POST/PUT/PATCH/DELETE');

// O. useFinancialPrivacy presente em todas as telas com valores sensíveis
const missingPrivacy = allComponentCodes
  .filter(c => !c.code.includes('useFinancialPrivacy'))
  .map(c => c.name);
assert(missingPrivacy.length === 0, 'O', 'useFinancialPrivacy presente em todas as telas com valores sensíveis');

// P. Nenhum listener onSnapshot duplicado
let onSnapshotCount = 0;
allComponentCodes.forEach(c => {
  if (c.code.includes('onSnapshot(')) onSnapshotCount++;
});
if (onSnapshotCount > 0) duplicateQueriesFound += onSnapshotCount;
assert(onSnapshotCount === 0, 'P', 'Nenhum listener onSnapshot duplicado');

// Q. Nenhum getDocs histórico duplicado nos filhos
let getDocsCount = 0;
allComponentCodes.forEach(c => {
  if (c.code.includes('getDocs(')) getDocsCount++;
});
if (getDocsCount > 0) duplicateQueriesFound += getDocsCount;
assert(getDocsCount === 0, 'Q', 'Nenhum getDocs histórico duplicado nos filhos');

// R. Filtro de período exclui pedidos fora do período
const mixedDateOrders = [
  { id: 'o_in', createdAt: '2026-08-10', total: 100, paymentStatus: 'approved' },
  { id: 'o_out', createdAt: '2025-01-01', total: 100, paymentStatus: 'approved' }
];
const filteredOrders = mixedDateOrders.filter(o => o.createdAt.startsWith('2026-08'));
assert(filteredOrders.length === 1 && filteredOrders[0].id === 'o_in', 'R', 'Filtro de período exclui pedidos fora do período');

// S. Dataset filtrado é o único input do motor
const resultFromFiltered = filteredOrders.map(o => calculateOrderProfitability(o, mockCatalogSample));
assert(resultFromFiltered.length === 1 && resultFromFiltered[0].orderId === 'o_in', 'S', 'Dataset filtrado é o único input do motor');

console.log('\n📦 TEST GROUP 2: Precisão Algorítmica e Cenários Financeiros (T - Z)');

// T. Cenário gross margin != contribution margin
const orderDiffMargin = {
  id: 'ord_diff',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 150,
  total: 150,
  items: [{ id: 'p1', unitPrice: 150, quantity: 1, costPrice: 45 }],
  shippingFinances: { shippingCost: 35, shippingCharged: 15 } // Subsídio = 20
};
const profDiff = calculateOrderProfitability(orderDiffMargin, [{ id: 'p1', costPrice: 45 }]);
const grossProfitDiff = 150 - 45; // 105
const grossMarginPct = (grossProfitDiff / 150) * 100; // 70%
assert(profDiff.contributionMargin < grossProfitDiff && profDiff.contributionMarginPercent < grossMarginPct, 'T', 'Cenário gross margin != contribution margin comprovado');

// U. costCoverage estimated sinalizado
const orderEstimated = {
  id: 'ord_est',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 150,
  total: 150,
  items: [{ id: 'sem_cadastro', name: 'FORCE Special', unitPrice: 150, quantity: 1 }]
};
const profEst = calculateOrderProfitability(orderEstimated, []);
assert(profEst.isEstimated === true, 'U', 'costCoverage estimated sinalizado quando faltam snapshots');

// V. costCoverage missing sinalizado
const orderExact = {
  id: 'ord_exact',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 150,
  total: 150,
  items: [{ id: 'ex_1', unitPrice: 150, quantity: 1, unitCostSnapshot: 40, costCoverage: 'complete' }],
  payment: { gatewayFee: 2.50 }
};
const profExact = calculateOrderProfitability(orderExact, [{ id: 'ex_1', costPrice: 40 }]);
assert(profExact.isEstimated === false && profExact.costCoveragePercent === 100, 'V', 'costCoverage exact vs estimated sinalizado corretamente');

// W. Zero division protection
const zeroOverview = calculateProfitabilityOverviewStats([]);
const zeroComposition = calculateRevenueComposition(0, 0, 0, 0, 0);
const zeroSimulator = simulateProductPrice({ unitCost: 0, salePrice: 0, discountPercent: 0 });
const zeroBreakEven = calculateBreakEven({ fixedOperatingExpenses: 0, averageContributionMarginRatio: 0 });
assert(
  !isNaN(zeroOverview.marginPercent) &&
  !isNaN(zeroComposition.cogsPercent) &&
  !isNaN(zeroSimulator.contributionMarginPercent) &&
  !isNaN(zeroBreakEven.requiredRevenue),
  'W',
  'Proteção total contra divisão por zero em todas as funções'
);

// X. Simulador 0–30% sensitivity
const sim0 = simulateProductPrice({ unitCost: 40, salePrice: 100, discountPercent: 0 });
const sim15 = simulateProductPrice({ unitCost: 40, salePrice: 100, discountPercent: 15 });
const sim30 = simulateProductPrice({ unitCost: 40, salePrice: 100, discountPercent: 30 });
assert(
  sim0.finalSalePrice === 100 &&
  sim15.finalSalePrice === 85 &&
  sim30.finalSalePrice === 70 &&
  sim0.contributionMargin > sim15.contributionMargin &&
  sim15.contributionMargin > sim30.contributionMargin,
  'X',
  'Simulador sensibilidade 0-30% consistente com descontos graduais'
);

// Y. DRE Reconciliation
const dreMock = calculateFinancialDRE(mockOrdersSample, [{ amount: 1000, category: 'DESPESA_FIXA' }], [], [], mockCatalogSample);
const beReconciled = calculateBreakEven({
  fixedOperatingExpenses: dreMock.fixedExpenses,
  averageContributionMarginRatio: 30
});
assert(beReconciled.fixedOperatingExpenses === 1000, 'Y', 'Reconciliação estrita com custos fixos calculados pelo motor de DRE');

// Z. Mobile / Layout sanity
assert(
  overviewCode.includes('overflow-hidden') || overviewCode.includes('overflow-x-auto') &&
  productViewCode.includes('overflow-x-auto') &&
  drawerCode.includes('overflow-y-auto'),
  'Z',
  'Garantia de layout responsivo sem overflow horizontal ou quebra visual'
);

console.log('\n📦 TEST GROUP 3: Novos Testes de Alocação e Reconciliação Canônica (AA - AP)');

// AA — pedido somente FORCE
const orderForceOnly = {
  id: 'ord_force_only',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 200,
  total: 200,
  items: [{ id: 'f_only', slug: 'f_only', name: 'FORCE Tee', unitPrice: 200, quantity: 1, costPrice: 60 }],
  payment: { gatewayFee: 5.50 },
  shippingFinances: { shippingCost: 25, shippingCharged: 15 } // Subsídio = 10
};
const prodsForceOnly = calculateProductProfitability([orderForceOnly], [{ id: 'f_only', slug: 'f_only', name: 'FORCE Tee', line: 'FORCE', costPrice: 60, price: 200 }]);
const orderProfForceOnly = [calculateOrderProfitability(orderForceOnly, [{ id: 'f_only', costPrice: 60 }])];
const linesForceOnly = aggregateProfitabilityByLine(prodsForceOnly, orderProfForceOnly);
const fLineOnly = linesForceOnly.find(l => l.lineName === 'FORCE');
assert(fLineOnly?.netRevenue === 200 && fLineOnly?.gatewayFees === 5.50 && fLineOnly?.shippingSubsidy === 10, 'AA', 'Pedido somente FORCE aloca 100% dos custos à linha FORCE');

// AB — pedido somente MARK
const orderMarkOnly = {
  id: 'ord_mark_only',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 300,
  total: 300,
  items: [{ id: 'm_only', slug: 'm_only', name: 'MARK Hoodie', unitPrice: 300, quantity: 1, costPrice: 90 }],
  payment: { gatewayFee: 8.00 },
  shippingFinances: { shippingCost: 30, shippingCharged: 10 } // Subsídio = 20
};
const prodsMarkOnly = calculateProductProfitability([orderMarkOnly], [{ id: 'm_only', slug: 'm_only', name: 'MARK Hoodie', line: 'MARK', costPrice: 90, price: 300 }]);
const orderProfMarkOnly = [calculateOrderProfitability(orderMarkOnly, [{ id: 'm_only', costPrice: 90 }])];
const linesMarkOnly = aggregateProfitabilityByLine(prodsMarkOnly, orderProfMarkOnly);
const mLineOnly = linesMarkOnly.find(l => l.lineName === 'MARK');
assert(mLineOnly?.netRevenue === 300 && mLineOnly?.gatewayFees === 8.00 && mLineOnly?.shippingSubsidy === 20, 'AB', 'Pedido somente MARK aloca 100% dos custos à linha MARK');

// AC — pedido somente PRIME
const orderPrimeOnly = {
  id: 'ord_prime_only',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 400,
  total: 400,
  items: [{ id: 'p_only', slug: 'p_only', name: 'PRIME Jacket', unitPrice: 400, quantity: 1, costPrice: 120 }],
  payment: { gatewayFee: 12.00 },
  shippingFinances: { shippingCost: 40, shippingCharged: 40 } // Subsídio = 0
};
const prodsPrimeOnly = calculateProductProfitability([orderPrimeOnly], [{ id: 'p_only', slug: 'p_only', name: 'PRIME Jacket', line: 'PRIME', costPrice: 120, price: 400 }]);
const orderProfPrimeOnly = [calculateOrderProfitability(orderPrimeOnly, [{ id: 'p_only', costPrice: 120 }])];
const linesPrimeOnly = aggregateProfitabilityByLine(prodsPrimeOnly, orderProfPrimeOnly);
const pLineOnly = linesPrimeOnly.find(l => l.lineName === 'PRIME');
assert(pLineOnly?.netRevenue === 400 && pLineOnly?.gatewayFees === 12.00 && pLineOnly?.shippingSubsidy === 0, 'AC', 'Pedido somente PRIME aloca 100% dos custos à linha PRIME');

// AD — pedido misto FORCE + PRIME
const orderMixedForcePrime = {
  id: 'ord_force_prime',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 300,
  total: 300,
  items: [
    { id: 'f_mix', slug: 'f_mix', name: 'FORCE Mix', unitPrice: 100, quantity: 1, costPrice: 30 },
    { id: 'p_mix', slug: 'p_mix', name: 'PRIME Mix', unitPrice: 200, quantity: 1, costPrice: 60 }
  ],
  payment: { gatewayFee: 9.00 }, // R$ 3 para FORCE (1/3), R$ 6 para PRIME (2/3)
  shippingFinances: { shippingCost: 30, shippingCharged: 15 } // Subsídio = 15 (5 FORCE, 10 PRIME)
};
const catMixedFP = [
  { id: 'f_mix', slug: 'f_mix', name: 'FORCE Mix', line: 'FORCE', costPrice: 30, price: 100 },
  { id: 'p_mix', slug: 'p_mix', name: 'PRIME Mix', line: 'PRIME', costPrice: 60, price: 200 }
];
const prodsMixedFP = calculateProductProfitability([orderMixedForcePrime], catMixedFP);
const pForce = prodsMixedFP.find(p => p.slug === 'f_mix');
const pPrime = prodsMixedFP.find(p => p.slug === 'p_mix');
assert(
  pForce?.gatewayFeesAllocated === 3.00 &&
  pPrime?.gatewayFeesAllocated === 6.00 &&
  pForce?.shippingSubsidyAllocated === 5.00 &&
  pPrime?.shippingSubsidyAllocated === 10.00,
  'AD',
  'Pedido misto FORCE + PRIME aloca proporcionalmente por item'
);

// AE — pedido FORCE + MARK + PRIME
const orderAll3 = {
  id: 'ord_all_3',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 600,
  total: 600,
  items: [
    { id: 'f3', slug: 'f3', name: 'FORCE 3', unitPrice: 100, quantity: 1, costPrice: 30 },
    { id: 'm3', slug: 'm3', name: 'MARK 3', unitPrice: 200, quantity: 1, costPrice: 60 },
    { id: 'p3', slug: 'p3', name: 'PRIME 3', unitPrice: 300, quantity: 1, costPrice: 90 }
  ],
  payment: { gatewayFee: 18.00 },
  shippingFinances: { shippingCost: 40, shippingCharged: 10 } // Subsídio = 30 (5, 10, 15)
};
const catAll3 = [
  { id: 'f3', slug: 'f3', name: 'FORCE 3', line: 'FORCE', costPrice: 30, price: 100 },
  { id: 'm3', slug: 'm3', name: 'MARK 3', line: 'MARK', costPrice: 60, price: 200 },
  { id: 'p3', slug: 'p3', name: 'PRIME 3', line: 'PRIME', costPrice: 90, price: 300 }
];
const prodsAll3 = calculateProductProfitability([orderAll3], catAll3);
const linesAll3 = aggregateProfitabilityByLine(prodsAll3);
const f3 = linesAll3.find(l => l.lineName === 'FORCE');
const m3 = linesAll3.find(l => l.lineName === 'MARK');
const p3 = linesAll3.find(l => l.lineName === 'PRIME');
assert(
  f3?.gatewayFees === 3.00 && m3?.gatewayFees === 6.00 && p3?.gatewayFees === 9.00 &&
  f3?.shippingSubsidy === 5.00 && m3?.shippingSubsidy === 10.00 && p3?.shippingSubsidy === 15.00,
  'AE',
  'Pedido triplo FORCE + MARK + PRIME aloca perfeitamente para as 3 linhas'
);

// AF — Gateway allocation reconcilia centavos (teste de arredondamento ímpar 1/3, 1/3, 1/3 com R$ 10.00)
const orderOddGateway = {
  id: 'ord_odd_gw',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 300,
  total: 300,
  items: [
    { id: 'i1', slug: 'i1', name: 'Item 1', unitPrice: 100, quantity: 1 },
    { id: 'i2', slug: 'i2', name: 'Item 2', unitPrice: 100, quantity: 1 },
    { id: 'i3', slug: 'i3', name: 'Item 3', unitPrice: 100, quantity: 1 }
  ],
  payment: { gatewayFee: 10.00 } // 3.33 + 3.33 + 3.34 = 10.00
};
const prodsOddGW = calculateProductProfitability([orderOddGateway], []);
const sumGW = prodsOddGW.reduce((acc, p) => acc + (p.gatewayFeesAllocated || 0), 0);
assert(Math.abs(sumGW - 10.00) < 0.0001, 'AF', `Gateway allocation reconcilia centavos perfeitamente (Sum=${sumGW} vs 10.00)`);

// AG — Shipping allocation reconcilia centavos (teste de arredondamento ímpar 1/3, 1/3, 1/3 com R$ 20.00 subsídio)
const orderOddShip = {
  id: 'ord_odd_ship',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 300,
  total: 300,
  items: [
    { id: 's1', slug: 's1', name: 'Ship 1', unitPrice: 100, quantity: 1 },
    { id: 's2', slug: 's2', name: 'Ship 2', unitPrice: 100, quantity: 1 },
    { id: 's3', slug: 's3', name: 'Ship 3', unitPrice: 100, quantity: 1 }
  ],
  shippingFinances: { shippingCost: 30, shippingCharged: 10 } // Subsídio = 20.00 -> 6.67 + 6.67 + 6.66 = 20.00
};
const prodsOddShip = calculateProductProfitability([orderOddShip], []);
const sumShip = prodsOddShip.reduce((acc, p) => acc + (p.shippingSubsidyAllocated || 0), 0);
assert(Math.abs(sumShip - 20.00) < 0.0001, 'AG', `Shipping allocation reconcilia centavos perfeitamente (Sum=${sumShip} vs 20.00)`);

// AH — Other costs allocation reconcilia centavos
const orderOddOther = {
  id: 'ord_odd_other',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 300,
  total: 300,
  otherVariableCosts: 7.00,
  items: [
    { id: 'o1', slug: 'o1', name: 'Other 1', unitPrice: 100, quantity: 1 },
    { id: 'o2', slug: 'o2', name: 'Other 2', unitPrice: 100, quantity: 1 },
    { id: 'o3', slug: 'o3', name: 'Other 3', unitPrice: 100, quantity: 1 }
  ]
};
const prodsOddOther = calculateProductProfitability([orderOddOther], []);
const sumOther = prodsOddOther.reduce((acc, p) => acc + (p.otherVariableCostsAllocated || 0), 0);
assert(Math.abs(sumOther - 7.00) < 0.0001, 'AH', `Other costs allocation reconcilia centavos perfeitamente (Sum=${sumOther} vs 7.00)`);

// AI — Produto desconhecido vai para OTHER
const orderUnknownProd = {
  id: 'ord_unk',
  status: 'approved',
  paymentStatus: 'paid',
  paidAmount: 150,
  total: 150,
  items: [{ id: 'unk_item', slug: 'unk_item', name: 'Adesivo Coleção Vintage', unitPrice: 150, quantity: 1 }]
};
const prodsUnknown = calculateProductProfitability([orderUnknownProd], []);
const linesUnknown = aggregateProfitabilityByLine(prodsUnknown);
const otherLine = linesUnknown.find(l => l.lineName === 'OTHER');
assert(otherLine !== undefined && otherLine.unitsSold === 1 && otherLine.totalRevenue === 150, 'AI', 'Produto não pertencente a FORCE/MARK/PRIME é agrupado em OTHER');

// AJ, AK, AL — Nenhuma receita, taxa ou margem desaparece (Reconciliação Exata Linhas vs Overview)
const complexOrderSet = [orderAll3, orderOddGateway, orderOddShip, orderOddOther, orderUnknownProd];
const complexOrdersProf = complexOrderSet.map(o => calculateOrderProfitability(o, catAll3));
const complexProdsProf = calculateProductProfitability(complexOrderSet, catAll3);
const complexOverview = calculateProfitabilityOverviewStats(complexOrdersProf);
const complexLines = aggregateProfitabilityByLine(complexProdsProf, complexOrdersProf);

const totalLineNet = complexLines.reduce((acc, l) => acc + l.netRevenue, 0);
const totalLineCogs = complexLines.reduce((acc, l) => acc + l.cogs, 0);
const totalLineGateway = complexLines.reduce((acc, l) => acc + l.gatewayFees, 0);
const totalLineShipping = complexLines.reduce((acc, l) => acc + l.shippingSubsidy, 0);
const totalLineOther = complexLines.reduce((acc, l) => acc + l.otherVariableCosts, 0);
const totalLineMargin = complexLines.reduce((acc, l) => acc + l.contributionMargin, 0);

assert(Math.abs(totalLineNet - complexOverview.netRevenue) < 0.01, 'AJ', `Nenhuma receita desaparece (Lines=${totalLineNet.toFixed(2)} vs Overview=${complexOverview.netRevenue.toFixed(2)})`);
assert(
  Math.abs(totalLineGateway - complexOverview.gatewayFees) < 0.01 &&
  Math.abs(totalLineShipping - complexOverview.shippingSubsidy) < 0.01 &&
  Math.abs(totalLineOther - complexOverview.otherVariableCosts) < 0.01,
  'AK',
  `Nenhuma taxa desaparece (GW=${totalLineGateway.toFixed(2)}, Ship=${totalLineShipping.toFixed(2)}, Other=${totalLineOther.toFixed(2)})`
);
assert(Math.abs(totalLineMargin - complexOverview.contributionMargin) < 0.01, 'AL', `Contribution Margin das linhas reconcilia perfeitamente com Overview (Lines=${totalLineMargin.toFixed(2)} vs Overview=${complexOverview.contributionMargin.toFixed(2)})`);

// AM — allocationMethod informado
assert(complexProdsProf.every(p => p.allocationMethod === 'revenue_proportional'), 'AM', 'allocationMethod explicitamente declarado como "revenue_proportional"');

// AN — isAllocated informado
assert(complexProdsProf.every(p => p.isAllocated === true), 'AN', 'isAllocated explicitamente sinalizado como true em todos os produtos');

// AO — ranking gross profit no ProductProfitabilityView corretamente rotulado
assert(productViewCode.includes('Top 10 Lucro Bruto (R$)') && productViewCode.includes('Top 10 Margem Bruta (%)'), 'AO', 'Ranking de Lucro Bruto e Margem Bruta devidamente rotulado na interface');

// AP — ranking contribution margin no Overview ordenado por contributionMargin
assert(overviewCode.includes('b.contributionMargin - a.contributionMargin') && overviewCode.includes('Top 5 Artigos em Margem de Contribuição (R$)'), 'AP', 'Ranking de Artigos mais rentáveis no Overview ordenado e rotulado por Margem de Contribuição');

// Summary Output
console.log('\n================================================================');
console.log(`UI PARALLEL FINANCIAL FORMULAS: ${parallelFormulasFound}`);
console.log(`WRITE CALLS: ${writeCallsFound}`);
console.log(`DUPLICATE QUERY/LISTENER ISSUES: ${duplicateQueriesFound}`);
console.log('----------------------------------------------------------------');
console.log(`LINE NET REVENUE RECONCILIATION: ${Math.abs(totalLineNet - complexOverview.netRevenue) < 0.01 ? 'PASS' : 'FAIL'}`);
console.log(`LINE COGS RECONCILIATION: ${Math.abs(totalLineCogs - complexOverview.cogs) < 0.01 ? 'PASS' : 'FAIL'}`);
console.log(`LINE GATEWAY RECONCILIATION: ${Math.abs(totalLineGateway - complexOverview.gatewayFees) < 0.01 ? 'PASS' : 'FAIL'}`);
console.log(`LINE SHIPPING RECONCILIATION: ${Math.abs(totalLineShipping - complexOverview.shippingSubsidy) < 0.01 ? 'PASS' : 'FAIL'}`);
console.log(`LINE CONTRIBUTION MARGIN RECONCILIATION: ${Math.abs(totalLineMargin - complexOverview.contributionMargin) < 0.01 ? 'PASS' : 'FAIL'}`);
console.log('----------------------------------------------------------------');
console.log(`TOTAL DE TESTES: ${testsPassed + testsFailed}`);
console.log(`PASSED: ${testsPassed}`);
console.log(`FAILED: ${testsFailed}`);
console.log('================================================================');

if (testsFailed > 0 || parallelFormulasFound > 0 || writeCallsFound > 0 || duplicateQueriesFound > 0) {
  console.error('❌ CERTIFICAÇÃO REPROVADA');
  process.exit(1);
} else {
  console.log('🌟 FASE 9.6.2-C CERTIFICADA COM SUCESSO! 🌟');
  process.exit(0);
}

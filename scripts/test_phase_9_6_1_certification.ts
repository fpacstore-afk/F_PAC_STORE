/**
 * TEST SUITE DE CERTIFICAÇÃO FASE 9.6.1-A
 * Motor Canônico de Rentabilidade e Precificação Dinâmica
 *
 * Cenários Obrigatórios:
 * A: Pedido Normal (Approved / Paid)
 * B: Partially Paid
 * C: Reembolso Parcial (Partial Refund)
 * D: Reembolso Total (Full Refund)
 * E: COGS Completo (Snapshot Imutável)
 * F: COGS Estimado (Catálogo)
 * G: COGS Ausente (Estimativa por Linha)
 * H: Gateway Exato (Persistido)
 * I: Gateway Estimado (Centralizado)
 * J: Frete Subsidiado (Shipping Subsidy)
 * K: Margem Negativa (Prejuízo Operacional Unitário)
 * L: Margem Zero (Equilíbrio Exato)
 * M: Preço Mínimo (Breakeven Unitário)
 * N: Preço para Margem Desejada (30%)
 * O: Desconto 30% no Simulador
 * P: Frete Grátis / Subsídio Total no Simulador
 * Q: Break-Even Global (Receita e Unidades)
 * R: Meta de Lucro Operacional (Target Profit)
 * S: Unidades Alvo (Arredondamento Ceil)
 * T: Precisão Decimal e Centavos (Zero Floating Point Leak)
 * U: Reconciliação Canônica com DRE
 * V: Pureza Funcional / Read-Only (Zero Efeitos Colaterais)
 */

import fs from 'fs';
import path from 'path';

import {
  calculateOrderProfitability,
  calculateProductProfitability,
  simulateProductPrice,
  calculateMinimumPrice,
  calculatePriceForDesiredMargin,
  calculateBreakEven,
  calculateTargetProfitRequirements,
  type OrderProfitability
} from '../src/utils/profitability';

import {
  calculateFinancialDRE,
  getOrderPaidAmount,
  getOrderRefundedAmount,
  getOrderCogs,
  getOrderGatewayFee,
  getOrderShippingFinances
} from '../src/utils/orderFinancial';

import {
  FINANCIAL_DEFAULTS,
  roundMoney,
  roundPercent,
  toCents,
  fromCents
} from '../src/config/financialDefaults';

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function runTest(code: string, name: string, fn: () => void) {
  try {
    fn();
    results.push({ code, name, passed: true });
    console.log(`\x1b[32m[PASS]\x1b[0m ${code} - ${name}`);
  } catch (err: any) {
    results.push({ code, name, passed: false, error: err?.message || String(err) });
    console.error(`\x1b[31m[FAIL]\x1b[0m ${code} - ${name}: ${err?.message || err}`);
  }
}

function assertEquals(actual: any, expected: any, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg} -> Esperado: ${expected}, Recebido: ${actual}`);
  }
}

function assertClose(actual: number, expected: number, tolerance: number = 0.01, msg: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg} -> Esperado aprox: ${expected}, Recebido: ${actual} (Delta: ${Math.abs(actual - expected)})`);
  }
}

console.log('================================================================');
console.log('INICIANDO BATERIA DE CERTIFICAÇÃO FASE 9.6.1 - MOTOR DE RENTABILIDADE');
console.log('================================================================\n');

// -------------------------------------------------------------------------
// CENÁRIO A: Pedido Normal (Aprovado e Pago Integralmente)
// -------------------------------------------------------------------------
runTest('A', 'Pedido Normal (Approved / Paid)', () => {
  const order = {
    id: 'ord_norm_01',
    pricing: { total: 150.00, shipping: 15.00 },
    payment: {
      status: 'approved',
      paidAmount: 150.00,
      method: 'pix',
      gatewayFee: 1.49
    },
    items: [
      { id: 'prod_1', name: 'Camiseta Mark VII', quantity: 1, unitCostSnapshot: 50.00, totalCostSnapshot: 50.00, costCoverage: 'complete' }
    ]
  };

  const prof = calculateOrderProfitability(order);
  assertEquals(prof.orderId, 'ord_norm_01', 'ID do pedido');
  assertEquals(prof.grossRevenue, 150.00, 'Receita Bruta');
  assertEquals(prof.capturedRevenue, 150.00, 'Receita Capturada');
  assertEquals(prof.refundedAmount, 0, 'Reembolso');
  assertEquals(prof.netRevenue, 150.00, 'Receita Líquida');
  assertEquals(prof.cogs, 50.00, 'COGS');
  assertEquals(prof.gatewayFees, 1.49, 'Taxa de Gateway');
  assertEquals(prof.shippingSubsidy, 0, 'Subsídio de Frete');
  // Margem = 150.00 - 50.00 - 1.49 = 98.51
  assertEquals(prof.contributionMargin, 98.51, 'Margem de Contribuição');
  assertClose(prof.contributionMarginPercent, 65.67, 0.05, 'Margem %');
  assertEquals(prof.isEstimated, false, 'Deve ser exato');
});

// -------------------------------------------------------------------------
// CENÁRIO B: Partially Paid
// -------------------------------------------------------------------------
runTest('B', 'Partially Paid', () => {
  const order = {
    id: 'ord_part_02',
    pricing: { total: 200.00, shipping: 20.00 },
    payment: {
      status: 'partially_paid',
      paidAmount: 80.00,
      pendingAmount: 120.00,
      method: 'pix',
      gatewayFee: 0.79
    },
    items: [
      { id: 'prod_1', name: 'Moletom Prime', quantity: 1, unitCostSnapshot: 60.00, costCoverage: 'complete' }
    ]
  };

  const prof = calculateOrderProfitability(order);
  assertEquals(prof.grossRevenue, 200.00, 'Receita Bruta Total');
  assertEquals(prof.capturedRevenue, 80.00, 'Receita Capturada Parcial');
  assertEquals(prof.netRevenue, 80.00, 'Receita Líquida');
  assertEquals(prof.cogs, 60.00, 'COGS total');
  // Margem = 80.00 - 60.00 - 0.79 = 19.21
  assertEquals(prof.contributionMargin, 19.21, 'Margem sobre receita capturada');
});

// -------------------------------------------------------------------------
// CENÁRIO C: Reembolso Parcial (Partial Refund)
// -------------------------------------------------------------------------
runTest('C', 'Partial Refund', () => {
  const order = {
    id: 'ord_ref_03',
    pricing: { total: 100.00, shipping: 0 },
    payment: {
      status: 'approved',
      paidAmount: 100.00,
      refundedAmount: 30.00,
      method: 'pix',
      gatewayFee: 0.99
    },
    items: [
      { id: 'prod_1', name: 'Camiseta Force', quantity: 1, unitCostSnapshot: 40.00, costCoverage: 'complete' }
    ]
  };

  const prof = calculateOrderProfitability(order);
  assertEquals(prof.capturedRevenue, 100.00, 'Capturado');
  assertEquals(prof.refundedAmount, 30.00, 'Reembolsado');
  assertEquals(prof.netRevenue, 70.00, 'Receita Líquida pós-estorno');
  // Margem = 70.00 - 40.00 - 0.99 = 29.01
  assertEquals(prof.contributionMargin, 29.01, 'Margem de Contribuição recalculada');
});

// -------------------------------------------------------------------------
// CENÁRIO D: Reembolso Total (Full Refund)
// -------------------------------------------------------------------------
runTest('D', 'Full Refund', () => {
  const order = {
    id: 'ord_fullref_04',
    pricing: { total: 100.00 },
    payment: {
      status: 'refunded',
      paidAmount: 100.00,
      refundedAmount: 100.00,
      method: 'pix',
      gatewayFee: 0.99
    },
    items: [
      { id: 'prod_1', name: 'Item', quantity: 1, unitCostSnapshot: 40.00, costCoverage: 'complete' }
    ]
  };

  const prof = calculateOrderProfitability(order);
  assertEquals(prof.netRevenue, 0, 'Receita Líquida deve ser zero');
  // Margem = 0 - 40.00 - 0.99 = -40.99
  assertEquals(prof.contributionMargin, -40.99, 'Margem reflete perda de custos variáveis');
  assertEquals(prof.contributionMarginPercent, 0, 'Margem % é 0 quando netRevenue é 0');
});

// -------------------------------------------------------------------------
// CENÁRIO E: COGS Completo (Snapshot Imutável)
// -------------------------------------------------------------------------
runTest('E', 'COGS Complete Snapshot', () => {
  const order = {
    id: 'ord_snap_05',
    pricing: { total: 120.00 },
    payment: { status: 'approved', paidAmount: 120.00, gatewayFee: 1.19 },
    items: [
      { id: 'item_1', quantity: 2, unitCostSnapshot: 35.00, totalCostSnapshot: 70.00, costCoverage: 'complete' }
    ]
  };

  const prof = calculateOrderProfitability(order);
  assertEquals(prof.cogs, 70.00, 'COGS total por snapshot');
  assertEquals(prof.costCoveragePercent, 100, '100% de cobertura');
  assertEquals(prof.isEstimated, false, 'Não deve ser estimado');
});

// -------------------------------------------------------------------------
// CENÁRIO F: COGS Estimado (Catálogo)
// -------------------------------------------------------------------------
runTest('F', 'COGS Estimated from Catalog', () => {
  const catalog = [
    { id: 'prod_cat_1', slug: 'camiseta-vibe', costPrice: 45.00, price: 110.00 }
  ];
  const order = {
    id: 'ord_cat_06',
    pricing: { total: 110.00 },
    payment: { status: 'approved', paidAmount: 110.00, gatewayFee: 1.09 },
    items: [
      { productId: 'prod_cat_1', quantity: 1 }
    ]
  };

  const prof = calculateOrderProfitability(order, catalog);
  assertEquals(prof.cogs, 45.00, 'COGS herdado do catálogo');
  assertEquals(prof.costCoveragePercent, 100, 'Cobertura completa é 100% (custo conhecido no catálogo)');
  assertEquals(prof.isEstimated, false, 'Não deve ser estimado');
});

// -------------------------------------------------------------------------
// CENÁRIO G: COGS Ausente (Estimativa por Linha Mark/Prime/Force)
// -------------------------------------------------------------------------
runTest('G', 'COGS Missing Line Fallback', () => {
  const order = {
    id: 'ord_fallback_07',
    pricing: { total: 150.00 },
    payment: { status: 'approved', paidAmount: 150.00, gatewayFee: 1.49 },
    items: [
      { name: 'Oversized Mark Limited', quantity: 1 }
    ]
  };

  const prof = calculateOrderProfitability(order, []);
  assertEquals(prof.cogs, FINANCIAL_DEFAULTS.estimatedProductCosts.MARK, 'Fallback MARK centralizado');
  assertEquals(prof.isEstimated, true, 'Estimado');
});

// -------------------------------------------------------------------------
// CENÁRIO H: Gateway Exato
// -------------------------------------------------------------------------
runTest('H', 'Gateway Exact Persisted Fee', () => {
  const order = {
    id: 'ord_gw_08',
    pricing: { total: 100.00 },
    payment: { status: 'approved', paidAmount: 100.00, gatewayFee: 3.50 },
    items: [{ unitCostSnapshot: 30.00, costCoverage: 'complete', quantity: 1 }]
  };

  const prof = calculateOrderProfitability(order);
  assertEquals(prof.gatewayFees, 3.50, 'Taxa informada pela adquirente');
  assertEquals(prof.isEstimated, false, 'Exato');
});

// -------------------------------------------------------------------------
// CENÁRIO I: Gateway Estimado (Defaults)
// -------------------------------------------------------------------------
runTest('I', 'Gateway Estimated Defaults', () => {
  const order = {
    id: 'ord_gw_09',
    pricing: { total: 100.00 },
    payment: { status: 'approved', paidAmount: 100.00, method: 'cartão de crédito' },
    items: [{ unitCostSnapshot: 30.00, costCoverage: 'complete', quantity: 1 }]
  };

  const prof = calculateOrderProfitability(order);
  // Cartão estimado: 100 * 3.99% + 0.40 = 4.39
  assertEquals(prof.gatewayFees, 4.39, 'Taxa estimada de cartão');
  assertEquals(prof.isEstimated, true, 'isEstimated ativado devido à taxa estimada');
});

// -------------------------------------------------------------------------
// CENÁRIO J: Frete Subsidiado (Shipping Subsidy)
// -------------------------------------------------------------------------
runTest('J', 'Shipping Subsidy', () => {
  const order = {
    id: 'ord_ship_10',
    pricing: { total: 130.00, shipping: 10.00, shippingActualCost: 32.50 },
    payment: { status: 'approved', paidAmount: 130.00, gatewayFee: 1.29 },
    items: [{ unitCostSnapshot: 40.00, costCoverage: 'complete', quantity: 1 }]
  };

  const prof = calculateOrderProfitability(order);
  assertEquals(prof.shippingCharged, 10.00, 'Cobrado');
  assertEquals(prof.shippingCost, 32.50, 'Custo Real');
  assertEquals(prof.shippingSubsidy, 22.50, 'Subsídio absorvido pela loja');
  // Margem = 130.00 - 40.00 - 1.29 - 22.50 = 66.21
  assertEquals(prof.contributionMargin, 66.21, 'Margem após subsídio de frete');
});

// -------------------------------------------------------------------------
// CENÁRIO K: Margem Negativa (Prejuízo no Pedido)
// -------------------------------------------------------------------------
runTest('K', 'Negative Contribution Margin', () => {
  const order = {
    id: 'ord_loss_11',
    pricing: { total: 50.00, shipping: 0, shippingActualCost: 35.00 },
    payment: { status: 'approved', paidAmount: 50.00, gatewayFee: 2.00 },
    items: [{ unitCostSnapshot: 45.00, costCoverage: 'complete', quantity: 1 }]
  };

  const prof = calculateOrderProfitability(order);
  // Receita: 50.00, COGS: 45.00, Gateway: 2.00, Subsídio: 35.00. Total custos: 82.00. Margem: -32.00
  assertEquals(prof.contributionMargin, -32.00, 'Margem Negativa');
  assertEquals(prof.contributionMarginPercent, -64.00, 'Margem % Negativa');
});

// -------------------------------------------------------------------------
// CENÁRIO L: Margem Zero (Equilíbrio Exato)
// -------------------------------------------------------------------------
runTest('L', 'Zero Contribution Margin', () => {
  const order = {
    id: 'ord_zero_12',
    pricing: { total: 100.00, shipping: 0 },
    payment: { status: 'approved', paidAmount: 100.00, gatewayFee: 5.00 },
    items: [{ unitCostSnapshot: 95.00, costCoverage: 'complete', quantity: 1 }]
  };

  const prof = calculateOrderProfitability(order);
  assertEquals(prof.contributionMargin, 0.00, 'Margem Zero Exata');
  assertEquals(prof.contributionMarginPercent, 0.00, 'Margem % Zero');
});

// -------------------------------------------------------------------------
// CENÁRIO M: Preço Mínimo (Breakeven Unitário)
// -------------------------------------------------------------------------
runTest('M', 'Minimum Price Calculation', () => {
  // Custo: 40.00, Gateway: 1% (0.01), Fixed fee: 0, Frete subsídio: 10.00
  // P_min = (40 + 10) / (1 - 0.01) = 50 / 0.99 = 50.5050... => 50.51
  const minPrice = calculateMinimumPrice({
    unitCost: 40.00,
    gatewayFeePercent: 1.00,
    gatewayFixedFee: 0.00,
    shippingCost: 20.00,
    shippingCharged: 10.00
  });

  assertEquals(minPrice, 50.51, 'Preço Mínimo');

  // Testar simulação com o preço mínimo calculado
  const sim = simulateProductPrice({
    unitCost: 40.00,
    salePrice: minPrice,
    gatewayFeePercent: 1.00,
    gatewayFixedFee: 0.00,
    shippingCost: 20.00,
    shippingCharged: 10.00
  });

  // A margem deve ser >= 0
  if (sim.contributionMargin < -0.01) {
    throw new Error(`Margem não pode ser negativa no preço mínimo. CM=${sim.contributionMargin}`);
  }
});

// -------------------------------------------------------------------------
// CENÁRIO N: Preço para Margem Desejada (30%)
// -------------------------------------------------------------------------
runTest('N', 'Desired Margin Price (30%)', () => {
  // Custo: 42.00, Gateway: 0.99%, Desired: 30%
  // P = 42 / (1 - 0.0099 - 0.30) = 42 / 0.6901 = 60.8607... => 60.86
  const targetPrice = calculatePriceForDesiredMargin({
    unitCost: 42.00,
    desiredMarginPercent: 30.00,
    gatewayFeePercent: 0.99,
    gatewayFixedFee: 0.00
  });

  assertEquals(targetPrice, 60.86, 'Preço para 30% de margem');

  const sim = simulateProductPrice({
    unitCost: 42.00,
    salePrice: targetPrice,
    gatewayFeePercent: 0.99,
    gatewayFixedFee: 0.00,
    desiredMarginPercent: 30.00
  });

  assertClose(sim.contributionMarginPercent, 30.00, 0.1, 'Margem simulada atinge 30%');
});

// -------------------------------------------------------------------------
// CENÁRIO O: Desconto 30% no Simulador
// -------------------------------------------------------------------------
runTest('O', 'Simulator with 30% Discount', () => {
  const sim = simulateProductPrice({
    unitCost: 40.00,
    salePrice: 100.00,
    discountPercent: 30.00,
    gatewayFeePercent: 1.00,
    gatewayFixedFee: 0.00
  });

  assertEquals(sim.finalSalePrice, 70.00, 'Preço Final de Venda com Desconto');
  assertEquals(sim.gatewayFee, 0.70, 'Taxa sobre preço final');
  assertEquals(sim.totalVariableCost, 40.70, 'Custo Variável Total');
  assertEquals(sim.contributionMargin, 29.30, 'Margem de Contribuição');
  assertClose(sim.contributionMarginPercent, 41.86, 0.05, 'Margem %');
});

// -------------------------------------------------------------------------
// CENÁRIO P: Frete Grátis / Subsídio Total no Simulador
// -------------------------------------------------------------------------
runTest('P', 'Simulator Free Shipping Subsidy', () => {
  const sim = simulateProductPrice({
    unitCost: 45.00,
    salePrice: 120.00,
    shippingCost: 25.00,
    shippingCharged: 0.00,
    gatewayFeePercent: 2.00
  });

  assertEquals(sim.shippingSubsidy, 25.00, 'Subsídio Total de Frete');
  assertEquals(sim.gatewayFee, 2.40, 'Taxa Gateway (120 * 2%)');
  // Custo variável = 45.00 + 25.00 + 2.40 = 72.40
  assertEquals(sim.totalVariableCost, 72.40, 'Custo Variável com Frete Grátis');
  assertEquals(sim.contributionMargin, 47.60, 'Margem restante');
});

// -------------------------------------------------------------------------
// CENÁRIO Q: Break-Even Global
// -------------------------------------------------------------------------
runTest('Q', 'Break-Even Global Calculation', () => {
  // Despesas fixas: R$ 5.000,00 | Margem Média: 40% (0.40) | Margem Unitária: R$ 50,00
  const be = calculateBreakEven({
    fixedOperatingExpenses: 5000.00,
    averageContributionMarginRatio: 0.40,
    averageContributionPerUnit: 50.00
  });

  assertEquals(be.requiredRevenue, 12500.00, 'Receita necessária para Break-Even (5000 / 0.4)');
  assertEquals(be.requiredUnits, 100, 'Unidades necessárias (5000 / 50)');
});

// -------------------------------------------------------------------------
// CENÁRIO R: Meta de Lucro Operacional (Target Profit)
// -------------------------------------------------------------------------
runTest('R', 'Target Profit Requirements', () => {
  // Despesas fixas: R$ 5.000,00 | Meta Lucro: R$ 3.000,00 | Cobertura total = R$ 8.000,00 | Margem: 40%
  const tp = calculateTargetProfitRequirements({
    fixedOperatingExpenses: 5000.00,
    targetProfit: 3000.00,
    averageContributionMarginRatio: 0.40,
    averageContributionPerUnit: 50.00
  });

  assertEquals(tp.totalCoverageRequired, 8000.00, 'Cobertura total');
  assertEquals(tp.requiredRevenueForTargetProfit, 20000.00, 'Receita necessária para atingir lucro');
  assertEquals(tp.requiredUnitsForTargetProfit, 160, 'Unidades necessárias (8000 / 50)');
});

// -------------------------------------------------------------------------
// CENÁRIO S: Unidades Alvo com Arredondamento Ceil
// -------------------------------------------------------------------------
runTest('S', 'Target Units Integer Ceil', () => {
  // Cobertura = 1000, Contribuição Unitária = 33.33 => 1000 / 33.33 = 30.003... => ceil = 31
  const tp = calculateTargetProfitRequirements({
    fixedOperatingExpenses: 1000.00,
    targetProfit: 0.00,
    averageContributionPerUnit: 33.33,
    averageContributionMarginRatio: 0.3333
  });

  assertEquals(tp.requiredUnitsForTargetProfit, 31, 'Arredondamento para cima obrigatório');
});

// -------------------------------------------------------------------------
// CENÁRIO T: Precisão Decimal e Centavos
// -------------------------------------------------------------------------
runTest('T', 'Cents Precision and Float Immunity', () => {
  // 0.1 + 0.2 em JS puro = 0.30000000000000004
  const floatSum = 0.1 + 0.2;
  const rounded = roundMoney(floatSum);
  assertEquals(rounded, 0.30, 'roundMoney elimina anomalia flutuante');

  const cents = toCents(149.99);
  assertEquals(cents, 14999, 'Centavos inteiros');
  assertEquals(fromCents(cents), 149.99, 'Reconversão exata de centavos');
});

// -------------------------------------------------------------------------
// CENÁRIO U: Reconciliação Canônica com DRE
// -------------------------------------------------------------------------
runTest('U', 'Reconciliation with DRE Engine', () => {
  const orders = [
    {
      id: 'ord_u1',
      pricing: { total: 100.00, shipping: 10.00, shippingActualCost: 15.00 },
      payment: { status: 'approved', paidAmount: 100.00, gatewayFee: 1.00 },
      items: [{ unitCostSnapshot: 40.00, quantity: 1, costCoverage: 'complete' }]
    },
    {
      id: 'ord_u2',
      pricing: { total: 200.00, shipping: 0, shippingActualCost: 0 },
      payment: { status: 'approved', paidAmount: 200.00, gatewayFee: 4.00 },
      items: [{ unitCostSnapshot: 60.00, quantity: 2, costCoverage: 'complete' }]
    }
  ];

  // 1. Somatório individual via OrderProfitability
  const prof1 = calculateOrderProfitability(orders[0]);
  const prof2 = calculateOrderProfitability(orders[1]);

  const totalOrderCM = roundMoney(prof1.contributionMargin + prof2.contributionMargin);
  const totalOrderCogs = roundMoney(prof1.cogs + prof2.cogs);
  const totalOrderGw = roundMoney(prof1.gatewayFees + prof2.gatewayFees);
  const totalOrderSubsidy = roundMoney(prof1.shippingSubsidy + prof2.shippingSubsidy);

  // 2. DRE consolidado
  const dre = calculateFinancialDRE(orders, [], [], []);

  assertEquals(totalOrderCogs, dre.cogs, 'COGS deve ser idêntico');
  assertEquals(totalOrderGw, dre.gatewayFees, 'Taxas de Gateway idênticas');
  assertEquals(totalOrderSubsidy, dre.shippingSubsidy, 'Subsídios de Frete idênticos');
  
  // No DRE, Lucro Bruto = netReceived - COGS
  // Custos Variáveis = Gateway + Subsídio
  // Margem de Contribuição Operacional = GrossProfit - Custos Variáveis
  const dreContributionMargin = roundMoney(dre.grossProfit - dre.totalVariableCosts);
  assertEquals(totalOrderCM, dreContributionMargin, 'Margem de Contribuição idêntica à do DRE');
});

// -------------------------------------------------------------------------
// CENÁRIO V: Pureza Funcional / Read-Only
// -------------------------------------------------------------------------
runTest('V', 'Pure Read-Only Functions (Zero Side Effects)', () => {
  const originalOrder = Object.freeze({
    id: 'ord_freeze_v',
    pricing: Object.freeze({ total: 100.00 }),
    payment: Object.freeze({ status: 'approved', paidAmount: 100.00 }),
    items: Object.freeze([Object.freeze({ unitCostSnapshot: 30.00, quantity: 1, costCoverage: 'complete' })])
  });

  const res1 = calculateOrderProfitability(originalOrder as any);
  const res2 = calculateOrderProfitability(originalOrder as any);

  assertEquals(res1.contributionMargin, res2.contributionMargin, 'Idempotência e determinismo absoluto');
});

// -------------------------------------------------------------------------
// CENÁRIO W: Backend Pricing usa FINANCIAL_DEFAULTS Compartilhado
// -------------------------------------------------------------------------
runTest('W', 'Backend Pricing uses shared FINANCIAL_DEFAULTS', () => {
  const pricingServicePath = path.resolve(process.cwd(), 'server/services/pricing.service.ts');
  const content = fs.readFileSync(pricingServicePath, 'utf8');

  // Verifica que importa da configuração compartilhada
  if (!content.includes('shared/financialDefaults')) {
    throw new Error('server/services/pricing.service.ts deve importar de shared/financialDefaults');
  }

  // Verifica que não possui mais as regras hardcoded locais
  if (content.includes('unitCost = 51.00') || content.includes('unitCost = 42.00') || content.includes('unitPrice = 149.90;')) {
    throw new Error('server/services/pricing.service.ts ainda possui números mágicos hardcoded de custo');
  }

  if (!content.includes('FINANCIAL_DEFAULTS.estimatedProductCosts.MARK') ||
      !content.includes('FINANCIAL_DEFAULTS.estimatedProductCosts.PRIME') ||
      !content.includes('FINANCIAL_DEFAULTS.estimatedProductCosts.FORCE')) {
    throw new Error('server/services/pricing.service.ts deve referenciar FINANCIAL_DEFAULTS.estimatedProductCosts');
  }
});

// -------------------------------------------------------------------------
// CENÁRIO X: Backend orderFinancial usa FINANCIAL_DEFAULTS Compartilhado
// -------------------------------------------------------------------------
runTest('X', 'Backend orderFinancial uses shared FINANCIAL_DEFAULTS', () => {
  const serverOrderFinPath = path.resolve(process.cwd(), 'server/utils/orderFinancial.ts');
  const content = fs.readFileSync(serverOrderFinPath, 'utf8');

  if (!content.includes('shared/financialDefaults')) {
    throw new Error('server/utils/orderFinancial.ts deve importar de shared/financialDefaults');
  }

  if (content.includes('let estimatedUnit = 40.00;') || content.includes('estimatedUnit = 51.00;') || content.includes('paidAmount * 0.99) / 100')) {
    throw new Error('server/utils/orderFinancial.ts ainda possui fórmulas locais paralelas ou custos hardcoded');
  }

  if (!content.includes('FINANCIAL_DEFAULTS.estimatedProductCosts') ||
      !content.includes('FINANCIAL_DEFAULTS.gateway')) {
    throw new Error('server/utils/orderFinancial.ts deve referenciar FINANCIAL_DEFAULTS para custos e gateways');
  }
});

// -------------------------------------------------------------------------
// CENÁRIO Y: AdminOrders não possui Gateway Fee Hardcoded
// -------------------------------------------------------------------------
runTest('Y', 'AdminOrders has zero hardcoded gateway fees', () => {
  const adminOrdersPath = path.resolve(process.cwd(), 'src/pages/AdminOrders.tsx');
  const content = fs.readFileSync(adminOrdersPath, 'utf8');

  if (content.includes('revenue * 0.05') || content.includes('totalRevenue * 0.05')) {
    throw new Error('AdminOrders.tsx ainda contém cálculo paralelo de taxas de gateway (* 0.05)');
  }

  if (!content.includes('getOrderGatewayFee') || !content.includes('getOrderCogs')) {
    throw new Error('AdminOrders.tsx deve invocar getOrderGatewayFee e getOrderCogs canônicos');
  }
});

// -------------------------------------------------------------------------
// CENÁRIO Z: Busca Global de Custos Fora da Configuração Compartilhada
// -------------------------------------------------------------------------
runTest('Z', 'Global search finds zero hardcoded product costs outside config/fixtures', () => {
  const srcFiles = [
    'src/utils/orderFinancial.ts',
    'src/utils/profitability.ts',
    'src/pages/AdminOrders.tsx',
    'server/services/pricing.service.ts',
    'server/utils/orderFinancial.ts'
  ];

  for (const relativePath of srcFiles) {
    const fullPath = path.resolve(process.cwd(), relativePath);
    if (!fs.existsSync(fullPath)) continue;
    const code = fs.readFileSync(fullPath, 'utf8');

    // Nenhuma atribuição ou verificação direta de custo com 51, 42, 40 soltos
    const forbiddenPatterns = [
      /unitCost\s*=\s*51/i,
      /unitCost\s*=\s*42/i,
      /estimatedUnit\s*=\s*51/i,
      /estimatedUnit\s*=\s*42/i,
      /estimatedUnit\s*=\s*40\.00/i,
      /revenue\s*\*\s*0\.05/i,
      /totalRevenue\s*\*\s*0\.05/i
    ];

    for (const pat of forbiddenPatterns) {
      if (pat.test(code)) {
        throw new Error(`Padrão proibido detectado em ${relativePath}: ${pat}`);
      }
    }
  }
});

// -------------------------------------------------------------------------
// CENÁRIO AA: AdminOrders financialStats usa motor canônico
// -------------------------------------------------------------------------
runTest('AA', 'AdminOrders financialStats uses canonical engine', () => {
  const adminOrdersPath = path.resolve(process.cwd(), 'src/pages/AdminOrders.tsx');
  const content = fs.readFileSync(adminOrdersPath, 'utf8');

  if (!content.includes('calculateOrderProfitability(order, currentProducts)')) {
    throw new Error('AdminOrders.tsx deve mapear pedidos via calculateOrderProfitability');
  }

  // Verifica que não calcula lucro líquido com fórmulas paralelas
  if (content.includes('grossProfit - gatewayFees - shippingCosts') || content.includes('revenue - cogs - gatewayFees - shipping')) {
    throw new Error('AdminOrders.tsx contém fórmulas locais de lucro líquido');
  }
});

// -------------------------------------------------------------------------
// CENÁRIO AB: AdminOrders não subtrai shippingCharged como custo
// -------------------------------------------------------------------------
runTest('AB', 'AdminOrders does not treat shippingCharged as cost', () => {
  const adminOrdersPath = path.resolve(process.cwd(), 'src/pages/AdminOrders.tsx');
  const content = fs.readFileSync(adminOrdersPath, 'utf8');

  if (content.includes('shippingCharged') && (content.includes('totalShippingCosts += shipInfo.shippingCharged') || content.includes('cogs + shippingCharged'))) {
    throw new Error('AdminOrders.tsx ainda usa shippingCharged como custo da loja');
  }

  // Busca se há qualquer menção a shippingCharged como despesa
  const forbiddenShippingCharged = /shippingCosts\s*\+=\s*.*shippingCharged/i;
  if (forbiddenShippingCharged.test(content)) {
    throw new Error('Detectado uso indevido de shippingCharged como custo');
  }
});

// -------------------------------------------------------------------------
// CENÁRIO AC: AdminOrders usa shippingSubsidy para margem de contribuição
// -------------------------------------------------------------------------
runTest('AC', 'AdminOrders uses shippingSubsidy for contribution margin', () => {
  const adminOrdersPath = path.resolve(process.cwd(), 'src/pages/AdminOrders.tsx');
  const content = fs.readFileSync(adminOrdersPath, 'utf8');

  if (!content.includes('shippingSubsidy') || !content.includes('totalShippingSubsidy')) {
    throw new Error('AdminOrders.tsx deve referenciar shippingSubsidy para custos suportados pela loja');
  }

  if (!content.includes('totalContributionMargin') || !content.includes('contributionMargin')) {
    throw new Error('AdminOrders.tsx deve consolidar contributionMargin canônica');
  }
});

// -------------------------------------------------------------------------
// CENÁRIO AD: Ranking de produto usa calculateProductProfitability
// -------------------------------------------------------------------------
runTest('AD', 'Product ranking uses calculateProductProfitability and canonical gross profit', () => {
  const adminOrdersPath = path.resolve(process.cwd(), 'src/pages/AdminOrders.tsx');
  const content = fs.readFileSync(adminOrdersPath, 'utf8');

  if (!content.includes('calculateProductProfitability(paidFilteredOrders, currentProducts)')) {
    throw new Error('AdminOrders.tsx deve usar calculateProductProfitability para ranking de produtos');
  }

  if (content.includes('const profit = s.revenue - s.cogs;') || content.includes('const margin = s.revenue > 0 ? (profit / s.revenue) * 100 : 0;')) {
    throw new Error('AdminOrders.tsx ainda possui cálculo manual de lucro no ranking de produtos');
  }
});

// -------------------------------------------------------------------------
// CENÁRIO AE: Reconciliação Total entre AdminOrders, profitability.ts e DRE
// -------------------------------------------------------------------------
runTest('AE', 'Reconcile AdminOrders dataset metrics with profitability.ts and DRE', () => {
  const testCatalog = [
    { id: 'p1', slug: 'camiseta-mark-1', name: 'Camiseta MARK Oversized', costPrice: 51.00, price: 149.90 },
    { id: 'p2', slug: 'camiseta-prime-1', name: 'Camiseta PRIME Slim', costPrice: 42.00, price: 129.90 }
  ];

  const testOrders = [
    {
      id: 'ord_rec_1',
      status: 'payment_approved',
      paymentStatus: 'approved',
      total: 149.90,
      payment: { status: 'approved', paidAmount: 149.90 },
      paymentMethod: 'pix',
      paymentGateway: { name: 'paghiper', fee: 2.50 },
      shippingRealCost: 28.50,
      shipping: 15.00,
      items: [{ id: 'p1', slug: 'camiseta-mark-1', name: 'Camiseta MARK Oversized', price: 149.90, quantity: 1, costPrice: 51.00 }]
    },
    {
      id: 'ord_rec_2',
      status: 'shipped',
      paymentStatus: 'approved',
      total: 259.80,
      payment: { status: 'approved', paidAmount: 259.80 },
      paymentMethod: 'credit_card',
      paymentGateway: { name: 'mercadopago', fee: 12.96 },
      shippingRealCost: 35.00,
      shipping: 20.00,
      items: [{ id: 'p2', slug: 'camiseta-prime-1', name: 'Camiseta PRIME Slim', price: 129.90, quantity: 2, costPrice: 42.00 }]
    }
  ];

  // 1. Order profitability
  const orderProfitabilities = testOrders.map(o => calculateOrderProfitability(o, testCatalog));
  const sumNetRevenue = roundMoney(orderProfitabilities.reduce((acc, p) => acc + p.netRevenue, 0));
  const sumCogs = roundMoney(orderProfitabilities.reduce((acc, p) => acc + p.cogs, 0));
  const sumGateway = roundMoney(orderProfitabilities.reduce((acc, p) => acc + p.gatewayFees, 0));
  const sumShipSubsidy = roundMoney(orderProfitabilities.reduce((acc, p) => acc + p.shippingSubsidy, 0));
  const sumContribMargin = roundMoney(orderProfitabilities.reduce((acc, p) => acc + p.contributionMargin, 0));

  // 2. Product profitability
  const prodProfitabilities = calculateProductProfitability(testOrders, testCatalog);
  const sumProdRevenue = roundMoney(prodProfitabilities.reduce((acc, p) => acc + p.totalRevenue, 0));
  const sumProdCogs = roundMoney(prodProfitabilities.reduce((acc, p) => acc + p.totalCogs, 0));
  const sumProdGrossProfit = roundMoney(prodProfitabilities.reduce((acc, p) => acc + p.grossProfit, 0));

  // 3. DRE Engine
  const dre = calculateFinancialDRE(testOrders, [], [], [], testCatalog);

  // Assertions
  if (Math.abs(sumNetRevenue - dre.netReceived) > 0.001) {
    throw new Error(`Net Revenue mismatch: ${sumNetRevenue} vs ${dre.netReceived}`);
  }
  if (Math.abs(sumCogs - dre.cogs) > 0.001) {
    throw new Error(`COGS mismatch: ${sumCogs} vs ${dre.cogs}`);
  }
  if (Math.abs(sumGateway - dre.gatewayFees) > 0.001) {
    throw new Error(`Gateway fees mismatch: ${sumGateway} vs ${dre.gatewayFees}`);
  }
  if (Math.abs(sumShipSubsidy - dre.shippingSubsidy) > 0.001) {
    throw new Error(`Shipping subsidy mismatch: ${sumShipSubsidy} vs ${dre.shippingSubsidy}`);
  }
  
  const dreContributionMargin = roundMoney(dre.grossProfit - dre.totalVariableCosts);
  if (Math.abs(sumContribMargin - dreContributionMargin) > 0.001) {
    throw new Error(`Contribution Margin mismatch: ${sumContribMargin} vs ${dreContributionMargin}`);
  }

  // Product profitability vs Order totals
  if (Math.abs(sumProdRevenue - sumNetRevenue) > 0.001) {
    throw new Error(`Product revenue should equal net revenue: ${sumProdRevenue} vs ${sumNetRevenue}`);
  }
  if (Math.abs(sumProdCogs - sumCogs) > 0.001) {
    throw new Error(`Product cogs should equal total cogs: ${sumProdCogs} vs ${sumCogs}`);
  }
  if (Math.abs(sumProdGrossProfit - roundMoney(sumNetRevenue - sumCogs)) > 0.001) {
    throw new Error(`Gross profit should equal revenue - cogs: ${sumProdGrossProfit} vs ${roundMoney(sumNetRevenue - sumCogs)}`);
  }
});
console.log('\n================================================================');
const total = results.length;
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

console.log(`TOTAL: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('================================================================\n');

if (failed > 0) {
  console.error(`Falha em ${failed} testes! Verifique o log acima.`);
  process.exit(1);
} else {
  console.log('TODOS OS TESTES DO MOTOR DE RENTABILIDADE FORAM APROVADOS COM SUCESSO.');
  process.exit(0);
}

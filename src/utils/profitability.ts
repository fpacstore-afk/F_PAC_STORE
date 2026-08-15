/**
 * MOTOR CANÔNICO DE RENTABILIDADE & PRECIFICAÇÃO DINÂMICA
 * FASE 9.6.1 - FPAC Store
 *
 * Módulo puro e centralizado para apuração de:
 * 1. Rentabilidade e Margem de Contribuição por Pedido (OrderProfitability)
 * 2. Rentabilidade e Performance por Produto (ProductProfitability)
 * 3. Simulador de Preço e Margens (simulateProductPrice)
 * 4. Cálculo Matemático de Preço Mínimo (Breakeven Unitário)
 * 5. Cálculo de Preço para Margem Desejada
 * 6. Ponto de Equilíbrio Operacional (Break-Even Global)
 * 7. Planejamento de Metas de Lucro (Target Profit Requirements)
 */

import {
  FINANCIAL_DEFAULTS,
  MARGIN_THRESHOLDS,
  BREAKEVEN_THRESHOLDS,
  classifyMargin,
  classifyBreakEvenStatus,
  type MarginClassification,
  type MarginClassificationResult,
  type BreakEvenStatus,
  type BreakEvenStatusResult,
  roundMoney,
  roundPercent
} from '../config/financialDefaults';

export {
  MARGIN_THRESHOLDS,
  BREAKEVEN_THRESHOLDS,
  classifyMargin,
  classifyBreakEvenStatus,
  type MarginClassification,
  type MarginClassificationResult,
  type BreakEvenStatus,
  type BreakEvenStatusResult
};

import {
  getOrderPaidAmount,
  getOrderRefundedAmount,
  getOrderTotal,
  getOrderCogs,
  getOrderGatewayFee,
  getOrderShippingFinances,
  getOrderPaymentStatus
} from './orderFinancial';

export interface OrderProfitability {
  orderId: string;
  grossRevenue: number;
  capturedRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  cogs: number;
  gatewayFees: number;
  shippingCost: number;
  shippingCharged: number;
  shippingSubsidy: number;
  otherVariableCosts?: number;
  contributionMargin: number;
  contributionMarginPercent: number;
  costCoveragePercent: number;
  isEstimated: boolean;
}

export type FinancialAllocationMethod = 'revenue_proportional' | 'direct_exact';

export interface ProductProfitabilityItem {
  id: string;
  slug: string;
  name: string;
  line: string;
  stock: number;
  unitPrice: number;
  unitCost: number;
  isCostSnapshot: boolean;
  unitsSold: number;
  totalRevenue: number; // Gross Revenue
  grossRevenue: number;
  netRevenue: number;
  totalCogs: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number; // Gross margin %
  grossMarginPercent: number;
  gatewayFeesAllocated: number;
  shippingSubsidyAllocated: number;
  otherVariableCostsAllocated: number;
  contributionMargin: number;
  contributionMarginPercent: number;
  allocationMethod: FinancialAllocationMethod;
  isAllocated: boolean;
}

export interface PriceSimulationParams {
  unitCost: number;
  salePrice: number;
  discountPercent?: number;
  gatewayFeePercent?: number;
  gatewayFixedFee?: number;
  shippingCost?: number;
  shippingCharged?: number;
  otherVariableCosts?: number;
  desiredMarginPercent?: number;
}

export interface PriceSimulationResult {
  finalSalePrice: number;
  gatewayFee: number;
  shippingSubsidy: number;
  totalVariableCost: number;
  contributionMargin: number;
  contributionMarginPercent: number;
  minimumPrice: number;
  recommendedPrice: number;
}

export interface MinimumPriceParams {
  unitCost: number;
  gatewayFeePercent?: number;
  gatewayFixedFee?: number;
  shippingCost?: number;
  shippingCharged?: number;
  otherVariableCosts?: number;
}

export interface DesiredMarginParams {
  unitCost: number;
  desiredMarginPercent: number;
  gatewayFeePercent?: number;
  gatewayFixedFee?: number;
  shippingCost?: number;
  shippingCharged?: number;
  otherVariableCosts?: number;
}

export interface BreakEvenParams {
  fixedOperatingExpenses: number;
  averageContributionMarginRatio?: number; // Fração 0..1 ou % 0..100
  averageContributionPerUnit?: number;
  averageSalePrice?: number;
}

export interface BreakEvenResult {
  requiredRevenue: number;
  requiredUnits: number;
  fixedOperatingExpenses: number;
  averageContributionMarginRatio: number;
  averageContributionPerUnit: number;
}

export interface TargetProfitParams {
  fixedOperatingExpenses: number;
  targetProfit: number;
  averageContributionMarginRatio?: number;
  averageContributionPerUnit?: number;
  averageSalePrice?: number;
}

export interface TargetProfitResult {
  requiredRevenueForTargetProfit: number;
  requiredUnitsForTargetProfit: number;
  targetProfit: number;
  totalCoverageRequired: number;
  averageContributionMarginRatio: number;
  averageContributionPerUnit: number;
}

export interface RevenueComposition {
  cogsPercent: number;
  gatewayPercent: number;
  shippingSubsidyPercent: number;
  marginPercent: number;
  cogsBarWidth: number;
  gatewayBarWidth: number;
  shippingBarWidth: number;
  marginBarWidth: number;
}

export interface ProfitabilityOverviewStats {
  netRevenue: number;
  grossRevenue: number;
  capturedRevenue: number;
  refundedAmount: number;
  cogs: number;
  gatewayFees: number;
  shippingSubsidy: number;
  otherVariableCosts: number;
  totalVariableCosts: number;
  contributionMargin: number;
  marginPercent: number;
  negativeMarginOrdersCount: number;
  costCoveragePercent: number;
  isCostEstimated: boolean;
  totalOrders: number;
  completeCogsOrders: number;
  estimatedCogsOrders: number;
  classification: MarginClassificationResult;
  revenueComposition: RevenueComposition;
}

export interface LineProfitabilityItem {
  lineName: 'FORCE' | 'MARK' | 'PRIME' | 'OTHER' | string;
  productCount: number;
  unitsSold: number;
  totalRevenue: number;
  grossRevenue: number;
  netRevenue: number;
  totalCogs: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  gatewayFees: number;
  shippingSubsidy: number;
  otherVariableCosts: number;
  contributionMargin: number;
  contributionMarginPercent: number;
  costCoverage: number;
  isEstimated: boolean;
  allocationMethod: FinancialAllocationMethod;
  isAllocated: boolean;
  classification: MarginClassificationResult;
  grossClassification: MarginClassificationResult;
}

/**
 * Calcula a rentabilidade canônica e margem de contribuição de um pedido individual.
 * Reutiliza estritamente as funções base de orderFinancial.
 * NÃO rateia custos fixos por pedido (regra de Margem de Contribuição Direta).
 */
export function calculateOrderProfitability(
  order: any,
  productCatalog: any[] = [],
  options?: { otherVariableCosts?: number }
): OrderProfitability {
  if (!order) {
    return {
      orderId: 'unknown',
      grossRevenue: 0,
      capturedRevenue: 0,
      refundedAmount: 0,
      netRevenue: 0,
      cogs: 0,
      gatewayFees: 0,
      shippingCost: 0,
      shippingCharged: 0,
      shippingSubsidy: 0,
      otherVariableCosts: 0,
      contributionMargin: 0,
      contributionMarginPercent: 0,
      costCoveragePercent: 100,
      isEstimated: false
    };
  }

  const orderId = String(order.id || order.orderId || order._id || 'unknown');
  const grossRevenue = roundMoney(getOrderTotal(order));
  const capturedRevenue = roundMoney(getOrderPaidAmount(order));
  const refundedAmount = roundMoney(getOrderRefundedAmount(order));
  const netRevenue = roundMoney(Math.max(0, capturedRevenue - refundedAmount));

  const cogsInfo = getOrderCogs(order, productCatalog);
  const gatewayInfo = getOrderGatewayFee(order);
  const shippingInfo = getOrderShippingFinances(order);
  const otherVariableCosts = roundMoney(Number(options?.otherVariableCosts || order.otherVariableCosts || 0));

  // Custo variável total atribuível diretamente ao pedido
  const totalVariableCosts = roundMoney(
    cogsInfo.cogs +
    gatewayInfo.fee +
    shippingInfo.shippingSubsidy +
    otherVariableCosts
  );

  // Margem de Contribuição = Receita Líquida - Custos Variáveis
  const contributionMargin = roundMoney(netRevenue - totalVariableCosts);

  // Margem de Contribuição Percentual sobre a receita líquida
  const contributionMarginPercent = netRevenue > 0
    ? roundPercent((contributionMargin / netRevenue) * 100)
    : 0;

  const isEstimated = cogsInfo.isEstimated || !gatewayInfo.isExact;

  return {
    orderId,
    grossRevenue,
    capturedRevenue,
    refundedAmount,
    netRevenue,
    cogs: cogsInfo.cogs,
    gatewayFees: gatewayInfo.fee,
    shippingCost: shippingInfo.shippingActualCost,
    shippingCharged: shippingInfo.shippingCharged,
    shippingSubsidy: shippingInfo.shippingSubsidy,
    otherVariableCosts,
    contributionMargin,
    contributionMarginPercent,
    costCoveragePercent: cogsInfo.costCoveragePercent,
    isEstimated
  };
}

/**
 * Calcula a rentabilidade agregada por produto e agrupamentos de catálogo.
 * Aplica a política canônica 'revenue_proportional' para custos de nível do pedido (Gateway, Frete subsidiado, Outros custos),
 * garantindo reconciliação exata de centavos em cada pedido.
 */
export function calculateProductProfitability(
  orders: any[],
  productCatalog: any[] = []
): ProductProfitabilityItem[] {
  const prodMap: Record<string, {
    id: string;
    slug: string;
    name: string;
    line: string;
    stock: number;
    unitPrice: number;
    unitCost: number;
    isCostSnapshot: boolean;
    unitsSold: number;
    grossRevenue: number;
    netRevenue: number;
    totalCogs: number;
    gatewayFeesAllocated: number;
    shippingSubsidyAllocated: number;
    otherVariableCostsAllocated: number;
  }> = {};

  // 1. Inicializar produtos cadastrados no catálogo
  productCatalog.forEach(p => {
    const slug = String(p.slug || p.id || 'sem-slug');
    const name = String(p.name || 'Produto');
    const upperName = name.toUpperCase();
    const line = upperName.includes('MARK') ? 'MARK' : (upperName.includes('PRIME') ? 'PRIME' : (upperName.includes('FORCE') ? 'FORCE' : 'OTHER'));
    
    let defaultCost: number = FINANCIAL_DEFAULTS.estimatedProductCosts.DEFAULT;
    if (line === 'MARK') defaultCost = FINANCIAL_DEFAULTS.estimatedProductCosts.MARK;
    else if (line === 'PRIME') defaultCost = FINANCIAL_DEFAULTS.estimatedProductCosts.PRIME;
    else if (line === 'FORCE') defaultCost = FINANCIAL_DEFAULTS.estimatedProductCosts.FORCE;

    const cost = Number(p.costPrice || p.cost || defaultCost);
    const price = Number(p.price || FINANCIAL_DEFAULTS.defaultSalePrice);

    prodMap[slug] = {
      id: p.id || slug,
      slug,
      name,
      line,
      stock: Number(p.stock || 0),
      unitPrice: roundMoney(price),
      unitCost: roundMoney(cost),
      isCostSnapshot: typeof p.costPrice === 'number' && p.costPrice > 0,
      unitsSold: 0,
      grossRevenue: 0,
      netRevenue: 0,
      totalCogs: 0,
      gatewayFeesAllocated: 0,
      shippingSubsidyAllocated: 0,
      otherVariableCostsAllocated: 0
    };
  });

  // 2. Processar vendas em pedidos válidos com política 'revenue_proportional' e reconciliação de centavos
  orders.forEach(order => {
    const s = getOrderPaymentStatus(order);
    if (['cancelled', 'rejected'].includes(s)) return;

    const orderProf = calculateOrderProfitability(order, productCatalog);
    const items = order.items && Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) return;

    // Calcular receita bruta de itens do pedido
    const itemDataList = items.map((item: any) => {
      const slug = String(item.slug || item.productId || item.id || 'outros');
      const qty = Math.max(1, Number(item.quantity) || 1);
      const itemPrice = Number(item.price || item.unitPrice || FINANCIAL_DEFAULTS.defaultSalePrice);
      const itemGross = roundMoney(itemPrice * qty);
      const costInfo = getOrderCogs({ items: [item] }, productCatalog);

      return {
        slug,
        item,
        qty,
        itemPrice,
        itemGross,
        costInfo
      };
    });

    const orderItemsGrossSum = itemDataList.reduce((acc, curr) => acc + curr.itemGross, 0);

    let runningGatewayAllocated = 0;
    let runningShippingAllocated = 0;
    let runningOtherAllocated = 0;
    let runningNetRevenueAllocated = 0;

    itemDataList.forEach((itemData, index) => {
      const isLastItem = index === itemDataList.length - 1;
      const ratio = orderItemsGrossSum > 0 ? itemData.itemGross / orderItemsGrossSum : 1 / itemDataList.length;

      // Rateio da receita líquida do pedido
      let itemNetRevenue = roundMoney(orderProf.netRevenue * ratio);
      // Rateio do Gateway
      let itemGateway = roundMoney(orderProf.gatewayFees * ratio);
      // Rateio do Frete Subsidiado
      let itemShippingSubsidy = roundMoney(orderProf.shippingSubsidy * ratio);
      // Rateio de Outros Custos
      let itemOtherCosts = roundMoney((orderProf.otherVariableCosts || 0) * ratio);

      if (isLastItem) {
        // Reconciliação exata de centavos com o pedido original
        itemNetRevenue = roundMoney(orderProf.netRevenue - runningNetRevenueAllocated);
        itemGateway = roundMoney(orderProf.gatewayFees - runningGatewayAllocated);
        itemShippingSubsidy = roundMoney(orderProf.shippingSubsidy - runningShippingAllocated);
        itemOtherCosts = roundMoney((orderProf.otherVariableCosts || 0) - runningOtherAllocated);
      } else {
        runningNetRevenueAllocated = roundMoney(runningNetRevenueAllocated + itemNetRevenue);
        runningGatewayAllocated = roundMoney(runningGatewayAllocated + itemGateway);
        runningShippingAllocated = roundMoney(runningShippingAllocated + itemShippingSubsidy);
        runningOtherAllocated = roundMoney(runningOtherAllocated + itemOtherCosts);
      }

      const slug = itemData.slug;
      if (!prodMap[slug]) {
        const name = String(itemData.item.name || 'Produto');
        const upperName = name.toUpperCase();
        const line = upperName.includes('MARK') ? 'MARK' : (upperName.includes('PRIME') ? 'PRIME' : (upperName.includes('FORCE') ? 'FORCE' : 'OTHER'));
        prodMap[slug] = {
          id: slug,
          slug,
          name,
          line,
          stock: 0,
          unitPrice: roundMoney(itemData.itemPrice),
          unitCost: roundMoney(itemData.costInfo.cogs / itemData.qty),
          isCostSnapshot: !itemData.costInfo.isEstimated,
          unitsSold: 0,
          grossRevenue: 0,
          netRevenue: 0,
          totalCogs: 0,
          gatewayFeesAllocated: 0,
          shippingSubsidyAllocated: 0,
          otherVariableCostsAllocated: 0
        };
      }

      prodMap[slug].unitsSold += itemData.qty;
      prodMap[slug].grossRevenue = roundMoney(prodMap[slug].grossRevenue + itemData.itemGross);
      prodMap[slug].netRevenue = roundMoney(prodMap[slug].netRevenue + itemNetRevenue);
      prodMap[slug].totalCogs = roundMoney(prodMap[slug].totalCogs + itemData.costInfo.cogs);
      prodMap[slug].gatewayFeesAllocated = roundMoney(prodMap[slug].gatewayFeesAllocated + itemGateway);
      prodMap[slug].shippingSubsidyAllocated = roundMoney(prodMap[slug].shippingSubsidyAllocated + itemShippingSubsidy);
      prodMap[slug].otherVariableCostsAllocated = roundMoney(prodMap[slug].otherVariableCostsAllocated + itemOtherCosts);
    });
  });

  // 3. Consolidar lucros brutos, margem de contribuição e margens percentuais
  const list: ProductProfitabilityItem[] = Object.values(prodMap).map(p => {
    const grossProfit = roundMoney(p.grossRevenue - p.totalCogs);
    const grossMarginPercent = p.grossRevenue > 0
      ? roundPercent((grossProfit / p.grossRevenue) * 100)
      : (p.unitPrice > 0 ? roundPercent(((p.unitPrice - p.unitCost) / p.unitPrice) * 100) : 0);

    const totalVariableAllocated = roundMoney(
      p.totalCogs +
      p.gatewayFeesAllocated +
      p.shippingSubsidyAllocated +
      p.otherVariableCostsAllocated
    );

    const contributionMargin = roundMoney(p.netRevenue - totalVariableAllocated);
    const contributionMarginPercent = p.netRevenue > 0
      ? roundPercent((contributionMargin / p.netRevenue) * 100)
      : 0;

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      line: p.line,
      stock: p.stock,
      unitPrice: p.unitPrice,
      unitCost: p.unitCost,
      isCostSnapshot: p.isCostSnapshot,
      unitsSold: p.unitsSold,
      totalRevenue: p.grossRevenue, // compatibilidade retroativa
      grossRevenue: p.grossRevenue,
      netRevenue: p.netRevenue,
      totalCogs: p.totalCogs,
      cogs: p.totalCogs,
      grossProfit,
      marginPercent: grossMarginPercent, // compatibilidade retroativa
      grossMarginPercent,
      gatewayFeesAllocated: p.gatewayFeesAllocated,
      shippingSubsidyAllocated: p.shippingSubsidyAllocated,
      otherVariableCostsAllocated: p.otherVariableCostsAllocated,
      contributionMargin,
      contributionMarginPercent,
      allocationMethod: 'revenue_proportional',
      isAllocated: true
    };
  });

  return list.sort((a, b) => b.grossRevenue - a.grossRevenue);
}

/**
 * Calcula matematicamente o Preço Mínimo de Equilíbrio (Margem de Contribuição = 0).
 *
 * Fórmula canônica:
 * P_min * (1 - feeRate) = unitCost + shippingSubsidy + otherVariableCosts + gatewayFixedFee
 * P_min = (unitCost + shippingSubsidy + otherVariableCosts + gatewayFixedFee) / (1 - feeRate)
 */
export function calculateMinimumPrice(params: MinimumPriceParams): number {
  const unitCost = Number(params.unitCost || 0);
  const feePercent = params.gatewayFeePercent !== undefined ? params.gatewayFeePercent : FINANCIAL_DEFAULTS.gateway.defaultFeePercent;
  const feeFixed = Number(params.gatewayFixedFee || 0);
  
  const shipCost = Number(params.shippingCost || 0);
  const shipCharged = Number(params.shippingCharged || 0);
  const shippingSubsidy = Math.max(0, shipCost - shipCharged);
  
  const otherCosts = Number(params.otherVariableCosts || 0);

  const feeRate = feePercent / 100;
  if (feeRate >= 1) return 0; // Taxa de gateway absurda >= 100%

  const fixedVariableLoad = unitCost + shippingSubsidy + otherCosts + feeFixed;
  const minPrice = fixedVariableLoad / (1 - feeRate);

  return roundMoney(Math.max(0, minPrice));
}

/**
 * Calcula matematicamente o Preço Recomendado para atingir a Margem de Contribuição Desejada.
 *
 * Fórmula canônica:
 * CM = P * (1 - feeRate) - fixedVariableLoad
 * Margem% = CM / P = desiredMarginRate
 * P * (1 - feeRate - desiredMarginRate) = fixedVariableLoad
 * P = fixedVariableLoad / (1 - feeRate - desiredMarginRate)
 */
export function calculatePriceForDesiredMargin(params: DesiredMarginParams): number {
  const unitCost = Number(params.unitCost || 0);
  const marginPercent = Number(params.desiredMarginPercent ?? FINANCIAL_DEFAULTS.defaultDesiredMarginPercent);
  const feePercent = params.gatewayFeePercent !== undefined ? params.gatewayFeePercent : FINANCIAL_DEFAULTS.gateway.defaultFeePercent;
  const feeFixed = Number(params.gatewayFixedFee || 0);

  const shipCost = Number(params.shippingCost || 0);
  const shipCharged = Number(params.shippingCharged || 0);
  const shippingSubsidy = Math.max(0, shipCost - shipCharged);

  const otherCosts = Number(params.otherVariableCosts || 0);

  const marginRate = marginPercent / 100;
  const feeRate = feePercent / 100;

  const denominator = 1 - feeRate - marginRate;
  if (denominator <= 0) {
    // Margem desejada + taxas é >= 100%, matematicamente inatingível
    return 0;
  }

  const fixedVariableLoad = unitCost + shippingSubsidy + otherCosts + feeFixed;
  const recommendedPrice = fixedVariableLoad / denominator;

  return roundMoney(Math.max(0, recommendedPrice));
}

/**
 * Simulador de Preço e Lucratividade do Produto (Função Pura).
 */
export function simulateProductPrice(params: PriceSimulationParams): PriceSimulationResult {
  const unitCost = Number(params.unitCost || 0);
  const baseSalePrice = Number(params.salePrice || 0);
  const discountPercent = Number(params.discountPercent || 0);

  // 1. Preço final de venda considerando eventual cupom/desconto
  const finalSalePrice = roundMoney(baseSalePrice * (1 - (discountPercent / 100)));

  // 2. Parâmetros de gateway
  const feePercent = params.gatewayFeePercent !== undefined ? params.gatewayFeePercent : FINANCIAL_DEFAULTS.gateway.defaultFeePercent;
  const feeFixed = Number(params.gatewayFixedFee || 0);
  const gatewayFee = roundMoney((finalSalePrice * (feePercent / 100)) + (finalSalePrice > 0 ? feeFixed : 0));

  // 3. Frete subsidiado
  const shipCost = Number(params.shippingCost || 0);
  const shipCharged = Number(params.shippingCharged || 0);
  const shippingSubsidy = roundMoney(Math.max(0, shipCost - shipCharged));

  // 4. Outros custos variáveis
  const otherCosts = roundMoney(Number(params.otherVariableCosts || 0));

  // 5. Custo variável total
  const totalVariableCost = roundMoney(unitCost + shippingSubsidy + otherCosts + gatewayFee);

  // 6. Margem de contribuição em R$ e %
  const contributionMargin = roundMoney(finalSalePrice - totalVariableCost);
  const contributionMarginPercent = finalSalePrice > 0
    ? roundPercent((contributionMargin / finalSalePrice) * 100)
    : 0;

  // 7. Preço mínimo de equilíbrio (0% de margem de contribuição)
  const minimumPrice = calculateMinimumPrice({
    unitCost,
    gatewayFeePercent: feePercent,
    gatewayFixedFee: feeFixed,
    shippingCost: shipCost,
    shippingCharged: shipCharged,
    otherVariableCosts: otherCosts
  });

  // 8. Preço recomendado para margem alvo
  const desiredMargin = params.desiredMarginPercent !== undefined ? params.desiredMarginPercent : FINANCIAL_DEFAULTS.defaultDesiredMarginPercent;
  const recommendedPrice = calculatePriceForDesiredMargin({
    unitCost,
    desiredMarginPercent: desiredMargin,
    gatewayFeePercent: feePercent,
    gatewayFixedFee: feeFixed,
    shippingCost: shipCost,
    shippingCharged: shipCharged,
    otherVariableCosts: otherCosts
  });

  return {
    finalSalePrice,
    gatewayFee,
    shippingSubsidy,
    totalVariableCost,
    contributionMargin,
    contributionMarginPercent,
    minimumPrice,
    recommendedPrice
  };
}

/**
 * Calcula o Ponto de Equilíbrio (Break-Even) Global da Operação.
 * Quantidade de receita e unidades necessárias para cobrir despesas fixas operacionais.
 */
export function calculateBreakEven(params: BreakEvenParams): BreakEvenResult {
  const fixedOperatingExpenses = roundMoney(Math.max(0, Number(params.fixedOperatingExpenses || 0)));
  
  // Normalização do índice de margem (0..1)
  let ratio = 0;
  if (params.averageContributionMarginRatio !== undefined && params.averageContributionMarginRatio > 0) {
    ratio = params.averageContributionMarginRatio > 1
      ? params.averageContributionMarginRatio / 100
      : params.averageContributionMarginRatio;
  } else if (params.averageContributionPerUnit && params.averageSalePrice && params.averageSalePrice > 0) {
    ratio = params.averageContributionPerUnit / params.averageSalePrice;
  }

  // Margem de contribuição unitária em R$
  let contribPerUnit = 0;
  if (params.averageContributionPerUnit !== undefined && params.averageContributionPerUnit > 0) {
    contribPerUnit = roundMoney(params.averageContributionPerUnit);
  } else if (params.averageSalePrice && ratio > 0) {
    contribPerUnit = roundMoney(params.averageSalePrice * ratio);
  }

  const requiredRevenue = ratio > 0 ? roundMoney(fixedOperatingExpenses / ratio) : 0;
  const requiredUnits = contribPerUnit > 0 ? Math.ceil(fixedOperatingExpenses / contribPerUnit) : 0;

  return {
    requiredRevenue,
    requiredUnits,
    fixedOperatingExpenses,
    averageContributionMarginRatio: roundPercent(ratio * 100),
    averageContributionPerUnit: contribPerUnit
  };
}

/**
 * Calcula os Requisitos de Faturamento e Vendas para atingir uma Meta de Lucro Operacional.
 */
export function calculateTargetProfitRequirements(params: TargetProfitParams): TargetProfitResult {
  const fixedExpenses = roundMoney(Math.max(0, Number(params.fixedOperatingExpenses || 0)));
  const targetProfit = roundMoney(Math.max(0, Number(params.targetProfit || 0)));
  const totalCoverageRequired = roundMoney(fixedExpenses + targetProfit);

  let ratio = 0;
  if (params.averageContributionMarginRatio !== undefined && params.averageContributionMarginRatio > 0) {
    ratio = params.averageContributionMarginRatio > 1
      ? params.averageContributionMarginRatio / 100
      : params.averageContributionMarginRatio;
  } else if (params.averageContributionPerUnit && params.averageSalePrice && params.averageSalePrice > 0) {
    ratio = params.averageContributionPerUnit / params.averageSalePrice;
  }

  let contribPerUnit = 0;
  if (params.averageContributionPerUnit !== undefined && params.averageContributionPerUnit > 0) {
    contribPerUnit = roundMoney(params.averageContributionPerUnit);
  } else if (params.averageSalePrice && ratio > 0) {
    contribPerUnit = roundMoney(params.averageSalePrice * ratio);
  }

  const requiredRevenueForTargetProfit = ratio > 0 ? roundMoney(totalCoverageRequired / ratio) : 0;
  const requiredUnitsForTargetProfit = contribPerUnit > 0 ? Math.ceil(totalCoverageRequired / contribPerUnit) : 0;

  return {
    requiredRevenueForTargetProfit,
    requiredUnitsForTargetProfit,
    targetProfit,
    totalCoverageRequired,
    averageContributionMarginRatio: roundPercent(ratio * 100),
    averageContributionPerUnit: contribPerUnit
  };
}

/**
 * Calcula a composição percentual da receita líquida para visualizações analíticas (barras de progresso/composição).
 */
export function calculateRevenueComposition(
  netRevenue: number,
  cogs: number,
  gatewayFees: number,
  shippingSubsidy: number,
  contributionMargin: number
): RevenueComposition {
  if (netRevenue <= 0) {
    return {
      cogsPercent: 0,
      gatewayPercent: 0,
      shippingSubsidyPercent: 0,
      marginPercent: 0,
      cogsBarWidth: 0,
      gatewayBarWidth: 0,
      shippingBarWidth: 0,
      marginBarWidth: 0
    };
  }

  const cogsPercent = roundPercent((cogs / netRevenue) * 100);
  const gatewayPercent = roundPercent((gatewayFees / netRevenue) * 100);
  const shippingSubsidyPercent = roundPercent((shippingSubsidy / netRevenue) * 100);
  const marginPercent = roundPercent((contributionMargin / netRevenue) * 100);

  return {
    cogsPercent,
    gatewayPercent,
    shippingSubsidyPercent,
    marginPercent,
    cogsBarWidth: Math.min(100, Math.max(0, cogsPercent)),
    gatewayBarWidth: Math.min(100, Math.max(0, gatewayPercent)),
    shippingBarWidth: Math.min(100, Math.max(0, shippingSubsidyPercent)),
    marginBarWidth: Math.min(100, Math.max(0, marginPercent))
  };
}

/**
 * Agrega métricas de alto nível do Overview de rentabilidade exclusivamente através de itens canônicos.
 */
export function calculateProfitabilityOverviewStats(
  ordersProfitability: OrderProfitability[]
): ProfitabilityOverviewStats {
  let grossRevenue = 0;
  let capturedRevenue = 0;
  let refundedAmount = 0;
  let netRevenue = 0;
  let cogs = 0;
  let gatewayFees = 0;
  let shippingSubsidy = 0;
  let otherVariableCosts = 0;
  let contributionMargin = 0;
  let negativeMarginOrdersCount = 0;
  let completeCogsOrders = 0;

  ordersProfitability.forEach(op => {
    grossRevenue = roundMoney(grossRevenue + (op.grossRevenue || 0));
    capturedRevenue = roundMoney(capturedRevenue + (op.capturedRevenue || 0));
    refundedAmount = roundMoney(refundedAmount + (op.refundedAmount || 0));
    netRevenue = roundMoney(netRevenue + (op.netRevenue || 0));
    cogs = roundMoney(cogs + (op.cogs || 0));
    gatewayFees = roundMoney(gatewayFees + (op.gatewayFees || 0));
    shippingSubsidy = roundMoney(shippingSubsidy + (op.shippingSubsidy || 0));
    otherVariableCosts = roundMoney(otherVariableCosts + (op.otherVariableCosts || 0));
    contributionMargin = roundMoney(contributionMargin + (op.contributionMargin || 0));

    if (op.contributionMargin < 0) {
      negativeMarginOrdersCount++;
    }
    if (op.costCoveragePercent >= 100 && !op.isEstimated) {
      completeCogsOrders++;
    }
  });

  const totalOrders = ordersProfitability.length;
  const costCoveragePercent = totalOrders > 0 
    ? Math.round((completeCogsOrders / totalOrders) * 100)
    : 100;
  
  const isCostEstimated = costCoveragePercent < 100 || ordersProfitability.some(o => o.isEstimated);

  const marginPercent = netRevenue > 0
    ? roundPercent((contributionMargin / netRevenue) * 100)
    : 0;

  const totalVariableCosts = roundMoney(cogs + gatewayFees + shippingSubsidy + otherVariableCosts);
  const classification = classifyMargin(marginPercent);
  const revenueComposition = calculateRevenueComposition(
    netRevenue,
    cogs,
    gatewayFees,
    shippingSubsidy,
    contributionMargin
  );

  return {
    netRevenue,
    grossRevenue,
    capturedRevenue,
    refundedAmount,
    cogs,
    gatewayFees,
    shippingSubsidy,
    otherVariableCosts,
    totalVariableCosts,
    contributionMargin,
    marginPercent,
    negativeMarginOrdersCount,
    costCoveragePercent,
    isCostEstimated,
    totalOrders,
    completeCogsOrders,
    estimatedCogsOrders: totalOrders - completeCogsOrders,
    classification,
    revenueComposition
  };
}

/**
 * Agrega a rentabilidade canônica agrupada por linha de produto (FORCE / MARK / PRIME / OTHER).
 * Agrega diretamente dos itens calculados por calculateProductProfitability(), que já possuem
 * as alocações exatas e reconciliadas de netRevenue, gatewayFees, shippingSubsidy e otherVariableCosts.
 * NÃO realiza rateio secundário silencioso.
 */
export function aggregateProfitabilityByLine(
  productsProfitability: ProductProfitabilityItem[],
  _ordersProfitability: OrderProfitability[] = []
): LineProfitabilityItem[] {
  // Identificar todas as linhas presentes ou usar as padrão da marca + OTHER
  const standardLines: Array<'FORCE' | 'MARK' | 'PRIME'> = ['FORCE', 'MARK', 'PRIME'];
  const presentLines = Array.from(new Set(productsProfitability.map(p => p.line || 'OTHER')));
  
  // Garantir que FORCE, MARK, PRIME apareçam sempre, e adicionar OTHER ou linhas customizadas se houver produtos
  const allLines: string[] = [...standardLines];
  presentLines.forEach(l => {
    if (!allLines.includes(l)) {
      allLines.push(l);
    }
  });

  return allLines.map(lineName => {
    const lineProds = productsProfitability.filter(p => (p.line || 'OTHER') === lineName);
    const unitsSold = lineProds.reduce((acc, p) => acc + p.unitsSold, 0);
    const totalRevenue = roundMoney(lineProds.reduce((acc, p) => acc + (p.grossRevenue !== undefined ? p.grossRevenue : p.totalRevenue), 0));
    const grossRevenue = totalRevenue;
    const netRevenue = roundMoney(lineProds.reduce((acc, p) => acc + (p.netRevenue !== undefined ? p.netRevenue : p.totalRevenue), 0));
    const totalCogs = roundMoney(lineProds.reduce((acc, p) => acc + (p.cogs !== undefined ? p.cogs : p.totalCogs), 0));
    const cogs = totalCogs;
    const grossProfit = roundMoney(lineProds.reduce((acc, p) => acc + p.grossProfit, 0));
    const grossMarginPercent = grossRevenue > 0
      ? roundPercent((grossProfit / grossRevenue) * 100)
      : 0;

    const gatewayFees = roundMoney(lineProds.reduce((acc, p) => acc + (p.gatewayFeesAllocated || 0), 0));
    const shippingSubsidy = roundMoney(lineProds.reduce((acc, p) => acc + (p.shippingSubsidyAllocated || 0), 0));
    const otherVariableCosts = roundMoney(lineProds.reduce((acc, p) => acc + (p.otherVariableCostsAllocated || 0), 0));

    const totalVariableCosts = roundMoney(cogs + gatewayFees + shippingSubsidy + otherVariableCosts);
    const contributionMargin = roundMoney(netRevenue - totalVariableCosts);
    const contributionMarginPercent = netRevenue > 0
      ? roundPercent((contributionMargin / netRevenue) * 100)
      : 0;

    const exactSnapshotCount = lineProds.filter(p => p.isCostSnapshot && p.unitsSold > 0).length;
    const soldProductCount = lineProds.filter(p => p.unitsSold > 0).length;
    const costCoverage = soldProductCount > 0
      ? Math.round((exactSnapshotCount / soldProductCount) * 100)
      : (lineProds.length > 0 ? Math.round((lineProds.filter(p => p.isCostSnapshot).length / lineProds.length) * 100) : 100);

    const classification = classifyMargin(contributionMarginPercent);
    const grossClassification = classifyMargin(grossMarginPercent);

    return {
      lineName,
      productCount: lineProds.length,
      unitsSold,
      totalRevenue,
      grossRevenue,
      netRevenue,
      totalCogs,
      cogs,
      grossProfit,
      grossMarginPercent,
      gatewayFees,
      shippingSubsidy,
      otherVariableCosts,
      contributionMargin,
      contributionMarginPercent,
      costCoverage,
      isEstimated: costCoverage < 100,
      allocationMethod: 'revenue_proportional',
      isAllocated: true,
      classification,
      grossClassification
    };
  });
}

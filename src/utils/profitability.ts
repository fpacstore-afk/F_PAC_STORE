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

export type CostSource = 'snapshot' | 'catalog' | 'estimated' | 'missing';

export interface CostSourceBreakdown {
  snapshotUnits: number;
  catalogUnits: number;
  estimatedUnits: number;
  missingUnits: number;
}

export interface ProductProfitabilityItem {
  id: string;
  slug: string;
  name: string;
  line: string;
  stock: number;
  unitPrice: number;
  unitCost: number;
  costSource: CostSource;
  costSourceBreakdown: CostSourceBreakdown;
  costCoveragePercent: number;
  hasMixedCostSources: boolean;
  isCostSnapshot: boolean;
  isEstimated: boolean;
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
  costSource: CostSource;
  costSourceBreakdown: CostSourceBreakdown;
  hasMixedCostSources: boolean;
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

  const paymentStatus = getOrderPaymentStatus(order);
  const isCancelled = ['cancelled', 'rejected'].includes(paymentStatus);

  const cogsInfo = isCancelled ? { cogs: 0, isComplete: true, isEstimated: false, costCoveragePercent: 100, itemsCount: 0 } : getOrderCogs(order, productCatalog);
  const gatewayInfo = isCancelled ? { fee: 0, isExact: true, netSettlement: 0 } : getOrderGatewayFee(order);
  const shippingInfo = isCancelled ? { shippingActualCost: 0, shippingCharged: 0, shippingSubsidy: 0, hasSubsidy: false, isExact: true } : getOrderShippingFinances(order);
  const otherVariableCosts = isCancelled ? 0 : roundMoney(Number(options?.otherVariableCosts || order.otherVariableCosts || 0));

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
    initialCostSource: CostSource;
    costSourceBreakdown: CostSourceBreakdown;
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
    const line: string = p.line || (upperName.includes('MARK') ? 'MARK' : (upperName.includes('PRIME') ? 'PRIME' : (upperName.includes('FORCE') ? 'FORCE' : 'OTHER')));
    
    const hasCatalogCost = (typeof p.costPrice === 'number' && p.costPrice > 0) || (typeof p.cost === 'number' && p.cost > 0);
    const isExplicitlyZero = p.costPrice === 0 || p.cost === 0;

    let defaultCost: number = 0;
    if (line === 'MARK') defaultCost = FINANCIAL_DEFAULTS.estimatedProductCosts.MARK;
    else if (line === 'PRIME') defaultCost = FINANCIAL_DEFAULTS.estimatedProductCosts.PRIME;
    else if (line === 'FORCE') defaultCost = FINANCIAL_DEFAULTS.estimatedProductCosts.FORCE;

    let costSource: CostSource = 'missing';
    let cost = 0;

    if (hasCatalogCost) {
      costSource = 'catalog';
      cost = Number(p.costPrice || p.cost);
    } else if (!isExplicitlyZero && defaultCost > 0) {
      costSource = 'estimated';
      cost = defaultCost;
    } else {
      costSource = 'missing';
      cost = 0;
    }

    const price = Number(p.price || FINANCIAL_DEFAULTS.defaultSalePrice);

    prodMap[slug] = {
      id: p.id || slug,
      slug,
      name,
      line,
      stock: Number(p.stock || 0),
      unitPrice: roundMoney(price),
      unitCost: roundMoney(cost),
      initialCostSource: costSource,
      costSourceBreakdown: {
        snapshotUnits: 0,
        catalogUnits: 0,
        estimatedUnits: 0,
        missingUnits: 0
      },
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
      
      const hasSnapshot = item.unitCostSnapshot !== undefined && 
                          item.unitCostSnapshot !== null && 
                          !isNaN(Number(item.unitCostSnapshot)) && 
                          Number(item.unitCostSnapshot) > 0;
      
      const searchKeys = [item.productId, item.slug, item.id, item.parentSlug].filter(Boolean);
      const foundCatalog = Array.isArray(productCatalog) ? productCatalog.find(p => searchKeys.includes(p.id) || searchKeys.includes(p.slug)) : undefined;
      const hasExplicitCatalogCost = foundCatalog && ((typeof foundCatalog.costPrice === 'number' && foundCatalog.costPrice > 0) || (typeof foundCatalog.cost === 'number' && foundCatalog.cost > 0));
      const hasItemCostPrice = item.costPrice !== undefined && item.costPrice !== null && Number(item.costPrice) > 0;

      let itemCostSource: CostSource = 'missing';
      let itemUnitCost = 0;
      let itemTotalCogs = 0;

      if (hasSnapshot) {
        itemCostSource = 'snapshot';
        itemUnitCost = Number(item.unitCostSnapshot);
        itemTotalCogs = item.totalCostSnapshot !== undefined ? Number(item.totalCostSnapshot) : roundMoney(itemUnitCost * qty);
      } else if (hasExplicitCatalogCost || hasItemCostPrice) {
        itemCostSource = 'catalog';
        itemUnitCost = hasExplicitCatalogCost ? Number(foundCatalog.costPrice || foundCatalog.cost) : Number(item.costPrice);
        itemTotalCogs = roundMoney(itemUnitCost * qty);
      } else {
        const itemName = String(item.name || item.slug || '').toLowerCase();
        let estimatedUnit = 0;
        if (itemName.includes('mark')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.MARK;
        else if (itemName.includes('prime')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.PRIME;
        else if (itemName.includes('force')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.FORCE;
        else if (foundCatalog && foundCatalog.line && FINANCIAL_DEFAULTS.estimatedProductCosts[foundCatalog.line]) {
          estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts[foundCatalog.line];
        }

        if (estimatedUnit > 0) {
          itemCostSource = 'estimated';
          itemUnitCost = estimatedUnit;
          itemTotalCogs = roundMoney(itemUnitCost * qty);
        } else {
          itemCostSource = 'missing';
          itemUnitCost = 0;
          itemTotalCogs = 0;
        }
      }

      return {
        slug,
        item,
        foundCatalog,
        qty,
        itemPrice,
        itemGross,
        itemCostSource,
        itemUnitCost,
        itemTotalCogs
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
        const name = String(itemData.item.name || (itemData.foundCatalog && itemData.foundCatalog.name) || 'Produto');
        const upperName = name.toUpperCase();
        const line: string = (itemData.foundCatalog && itemData.foundCatalog.line) || itemData.item.line || itemData.item.productLine || (upperName.includes('MARK') ? 'MARK' : (upperName.includes('PRIME') ? 'PRIME' : (upperName.includes('FORCE') ? 'FORCE' : 'OTHER')));
        prodMap[slug] = {
          id: (itemData.foundCatalog && itemData.foundCatalog.id) || slug,
          slug,
          name,
          line,
          stock: 0,
          unitPrice: roundMoney(itemData.itemPrice),
          unitCost: roundMoney(itemData.itemUnitCost),
          initialCostSource: itemData.itemCostSource,
          costSourceBreakdown: {
            snapshotUnits: 0,
            catalogUnits: 0,
            estimatedUnits: 0,
            missingUnits: 0
          },
          unitsSold: 0,
          grossRevenue: 0,
          netRevenue: 0,
          totalCogs: 0,
          gatewayFeesAllocated: 0,
          shippingSubsidyAllocated: 0,
          otherVariableCostsAllocated: 0
        };
      }

      // Contabilização de unidades por fonte de custo (considerando quantity real)
      if (itemData.itemCostSource === 'snapshot') {
        prodMap[slug].costSourceBreakdown.snapshotUnits += itemData.qty;
      } else if (itemData.itemCostSource === 'catalog') {
        prodMap[slug].costSourceBreakdown.catalogUnits += itemData.qty;
      } else if (itemData.itemCostSource === 'estimated') {
        prodMap[slug].costSourceBreakdown.estimatedUnits += itemData.qty;
      } else {
        prodMap[slug].costSourceBreakdown.missingUnits += itemData.qty;
      }

      prodMap[slug].unitsSold += itemData.qty;
      prodMap[slug].grossRevenue = roundMoney(prodMap[slug].grossRevenue + itemData.itemGross);
      prodMap[slug].netRevenue = roundMoney(prodMap[slug].netRevenue + itemNetRevenue);
      prodMap[slug].totalCogs = roundMoney(prodMap[slug].totalCogs + itemData.itemTotalCogs);
      prodMap[slug].gatewayFeesAllocated = roundMoney(prodMap[slug].gatewayFeesAllocated + itemGateway);
      prodMap[slug].shippingSubsidyAllocated = roundMoney(prodMap[slug].shippingSubsidyAllocated + itemShippingSubsidy);
      prodMap[slug].otherVariableCostsAllocated = roundMoney(prodMap[slug].otherVariableCostsAllocated + itemOtherCosts);
    });
  });

  // 3. Consolidar lucros brutos, margem de contribuição e margens percentuais
  const list: ProductProfitabilityItem[] = Object.values(prodMap).map(p => {
    const breakdown = p.costSourceBreakdown;
    let costSource: CostSource = 'missing';

    if (p.unitsSold > 0) {
      if (breakdown.missingUnits > 0) {
        costSource = 'missing';
      } else if (breakdown.estimatedUnits > 0) {
        costSource = 'estimated';
      } else if (breakdown.catalogUnits > 0) {
        costSource = 'catalog';
      } else if (breakdown.snapshotUnits > 0) {
        costSource = 'snapshot';
      } else {
        costSource = p.initialCostSource;
      }
    } else {
      costSource = p.initialCostSource;
    }

    const isCostSnapshot = p.unitsSold > 0 && breakdown.snapshotUnits === p.unitsSold;
    const isEstimated = breakdown.estimatedUnits > 0 || breakdown.missingUnits > 0 || (p.unitsSold === 0 && (costSource === 'estimated' || costSource === 'missing'));

    const distinctSourcesCount = [
      breakdown.snapshotUnits > 0,
      breakdown.catalogUnits > 0,
      breakdown.estimatedUnits > 0,
      breakdown.missingUnits > 0
    ].filter(Boolean).length;
    const hasMixedCostSources = distinctSourcesCount > 1;

    const costCoveragePercent = p.unitsSold > 0
      ? roundPercent(((breakdown.snapshotUnits + breakdown.catalogUnits) / p.unitsSold) * 100)
      : (costSource === 'snapshot' || costSource === 'catalog' ? 100 : 0);

    const unitCost = p.unitsSold > 0 && p.totalCogs > 0
      ? roundMoney(p.totalCogs / p.unitsSold)
      : (p.unitsSold > 0 && costSource === 'missing' ? 0 : p.unitCost);

    const grossProfit = roundMoney(p.grossRevenue - p.totalCogs);
    const grossMarginPercent = p.grossRevenue > 0
      ? roundPercent((grossProfit / p.grossRevenue) * 100)
      : (p.unitPrice > 0 ? roundPercent(((p.unitPrice - unitCost) / p.unitPrice) * 100) : 0);

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
      unitCost,
      costSource,
      costSourceBreakdown: breakdown,
      costCoveragePercent,
      hasMixedCostSources,
      isCostSnapshot,
      isEstimated,
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

    // Agregar quebra de fontes de custo por unidade vendida real
    const breakdown: CostSourceBreakdown = {
      snapshotUnits: 0,
      catalogUnits: 0,
      estimatedUnits: 0,
      missingUnits: 0
    };

    lineProds.forEach(p => {
      if (p.costSourceBreakdown) {
        breakdown.snapshotUnits += p.costSourceBreakdown.snapshotUnits;
        breakdown.catalogUnits += p.costSourceBreakdown.catalogUnits;
        breakdown.estimatedUnits += p.costSourceBreakdown.estimatedUnits;
        breakdown.missingUnits += p.costSourceBreakdown.missingUnits;
      } else {
        if (p.isCostSnapshot) breakdown.snapshotUnits += p.unitsSold;
        else if (p.costSource === 'catalog') breakdown.catalogUnits += p.unitsSold;
        else if (p.costSource === 'estimated') breakdown.estimatedUnits += p.unitsSold;
        else breakdown.missingUnits += p.unitsSold;
      }
    });

    const coveredUnits = breakdown.snapshotUnits + breakdown.catalogUnits;
    const totalUnits = breakdown.snapshotUnits + breakdown.catalogUnits + breakdown.estimatedUnits + breakdown.missingUnits;

    const costCoverage = totalUnits > 0
      ? roundPercent((coveredUnits / totalUnits) * 100)
      : 100;

    const isEstimated = breakdown.estimatedUnits > 0 || breakdown.missingUnits > 0;

    let costSource: CostSource = 'snapshot';
    if (totalUnits > 0) {
      if (breakdown.missingUnits > 0) {
        costSource = 'missing';
      } else if (breakdown.estimatedUnits > 0) {
        costSource = 'estimated';
      } else if (breakdown.catalogUnits > 0) {
        costSource = 'catalog';
      } else {
        costSource = 'snapshot';
      }
    } else {
      const anyMissing = lineProds.some(p => p.costSource === 'missing');
      const anyEst = lineProds.some(p => p.costSource === 'estimated');
      const anyCat = lineProds.some(p => p.costSource === 'catalog');
      if (anyMissing) costSource = 'missing';
      else if (anyEst) costSource = 'estimated';
      else if (anyCat) costSource = 'catalog';
      else costSource = 'snapshot';
    }

    const distinctSourcesCount = [
      breakdown.snapshotUnits > 0,
      breakdown.catalogUnits > 0,
      breakdown.estimatedUnits > 0,
      breakdown.missingUnits > 0
    ].filter(Boolean).length;
    const hasMixedCostSources = distinctSourcesCount > 1;

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
      costSource,
      costSourceBreakdown: breakdown,
      hasMixedCostSources,
      isEstimated,
      allocationMethod: 'revenue_proportional',
      isAllocated: true,
      classification,
      grossClassification
    };
  });
}

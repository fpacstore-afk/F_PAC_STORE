import { calculateRecordedCashFlow, isActiveFinancialRecord, getRecordedOrderDueDate, financialDateKey } from '../../shared/cashFlow';
import { getOrderTotal, getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderNetReceived, getOrderPaymentStatus, getOrderShippingFinances, getOrderGatewayFee } from '../../shared/orderFinancialCore.js';
export { normalizePaymentStatus, getOrderTotal, getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderNetReceived, getOrderPaymentStatus, getOrderShippingFinances, getOrderGatewayFee } from '../../shared/orderFinancialCore.js';
import { FINANCIAL_DEFAULTS, roundMoney } from '../../shared/financialDefaults.js';

/** Earliest recorded open due date; missing dates stay unknown. */
export function getOrderPaymentDueDate(order: any): Date | null {
  return getRecordedOrderDueDate(order);
}

export function isOrderPaymentOverdue(order: any): boolean {
  const pending = getOrderPendingAmount(order);
  if (pending <= 0) return false;

  const status = getOrderPaymentStatus(order);
  if (['cancelled', 'rejected', 'refunded'].includes(status)) return false;

  const dueDate = getOrderPaymentDueDate(order);
  if (!dueDate) return false;

  return financialDateKey(dueDate)! < financialDateKey(new Date())!;
}

/**
 * Retorna o custo unitário e total de um item de pedido.
 * Prioriza snapshot histórico imutável (unitCostSnapshot).
 */
export function getOrderItemCost(item: any, productCatalog?: any[]): {
  unitCost: number;
  totalCost: number;
  isSnapshot: boolean;
  isEstimated: boolean;
  costCoverage: 'complete' | 'estimated' | 'unavailable';
} {
  const qty = Math.max(1, Number(item.quantity) || 1);

  // 1. Snapshot histórico gravado na criação do pedido
  if (item.unitCostSnapshot !== undefined && item.unitCostSnapshot !== null && !isNaN(Number(item.unitCostSnapshot))) {
    const unitCost = Number(item.unitCostSnapshot);
    const totalCost = item.totalCostSnapshot !== undefined ? Number(item.totalCostSnapshot) : Number((unitCost * qty).toFixed(2));
    const coverage = item.costCoverage === 'complete' ? 'complete' : 'estimated';
    return {
      unitCost,
      totalCost,
      isSnapshot: true,
      isEstimated: coverage === 'estimated',
      costCoverage: coverage
    };
  }

  // 2. Item com custo explícito legado
  if (item.costPrice !== undefined && item.costPrice !== null && Number(item.costPrice) > 0) {
    const unitCost = Number(item.costPrice);
    return {
      unitCost,
      totalCost: Number((unitCost * qty).toFixed(2)),
      isSnapshot: false,
      isEstimated: false,
      costCoverage: 'complete'
    };
  }

  // 3. Consulta ao catálogo de produtos
  if (Array.isArray(productCatalog) && productCatalog.length > 0) {
    const searchKeys = [item.productId, item.slug, item.id, item.parentSlug].filter(Boolean);
    const foundProd = productCatalog.find(p => searchKeys.includes(p.id) || searchKeys.includes(p.slug));
    if (foundProd) {
      const prodCost = Number(foundProd.costPrice || foundProd.cost || 0);
      if (prodCost > 0) {
        const isPartial = foundProd.costCalculation?.coverage === 'partial';
        return {
          unitCost: prodCost,
          totalCost: Number((prodCost * qty).toFixed(2)),
          isSnapshot: false,
          isEstimated: isPartial,
          costCoverage: isPartial ? 'estimated' : 'complete'
        };
      }
    }
  }

  // 4. Estimativa canônica por linha de produto
  const name = String(item.name || item.slug || '').toLowerCase();
  let estimatedUnit: number = FINANCIAL_DEFAULTS.estimatedProductCosts.DEFAULT;
  if (name.includes('mark')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.MARK;
  else if (name.includes('prime')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.PRIME;
  else if (name.includes('force')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.FORCE;

  return {
    unitCost: estimatedUnit,
    totalCost: roundMoney(estimatedUnit * qty),
    isSnapshot: false,
    isEstimated: true,
    costCoverage: 'estimated'
  };
}

/**
 * Retorna o COGS (Custo das Mercadorias Vendidas) total do pedido e métricas de cobertura de custo.
 */
export function getOrderCogs(order: any, productCatalog?: any[]): {
  cogs: number;
  isComplete: boolean;
  isEstimated: boolean;
  costCoveragePercent: number;
  itemsCount: number;
} {
  const items = order.items && Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) {
    return { cogs: 0, isComplete: true, isEstimated: false, costCoveragePercent: 100, itemsCount: 0 };
  }

  let totalCogs = 0;
  let completeItemsCount = 0;

  items.forEach(item => {
    const costInfo = getOrderItemCost(item, productCatalog);
    totalCogs += costInfo.totalCost;
    if (costInfo.isSnapshot && !costInfo.isEstimated) {
      completeItemsCount++;
    }
  });

  const costCoveragePercent = Math.round((completeItemsCount / items.length) * 100);

  return {
    cogs: Number(totalCogs.toFixed(2)),
    isComplete: costCoveragePercent === 100,
    isEstimated: costCoveragePercent < 100,
    costCoveragePercent,
    itemsCount: items.length
  };
}

/**
 * Retorna a taxa de gateway do pedido (Mercado Pago, PIX, Cartão).
 */

/**
 * Retorna as finanças de frete do pedido:
 */

/**
 * Calcula o demonstrativo financeiro individual de um pedido.
 */
export function calculateOrderFinancials(order: any, productCatalog?: any[]) {
  const total = getOrderTotal(order);
  const paid = getOrderPaidAmount(order);
  const refunded = getOrderRefundedAmount(order);
  const netReceived = getOrderNetReceived(order);
  const pending = getOrderPendingAmount(order);
  const status = getOrderPaymentStatus(order);

  const cogsInfo = getOrderCogs(order, productCatalog);
  const gatewayInfo = getOrderGatewayFee(order);
  const shippingInfo = getOrderShippingFinances(order);

  const grossProfit = Number((netReceived - cogsInfo.cogs).toFixed(2));
  const netProfit = Number((grossProfit - gatewayInfo.fee - shippingInfo.shippingSubsidy).toFixed(2));
  const marginPercent = netReceived > 0 ? Number(((netProfit / netReceived) * 100).toFixed(1)) : 0;

  return {
    grossTotal: total,
    paidAmount: paid,
    refundedAmount: refunded,
    netReceived,
    pendingAmount: pending,
    paymentStatus: status,
    cogs: cogsInfo.cogs,
    isCostEstimated: cogsInfo.isEstimated,
    costCoveragePercent: cogsInfo.costCoveragePercent,
    gatewayFee: gatewayInfo.fee,
    isGatewayFeeExact: gatewayInfo.isExact,
    shippingCharged: shippingInfo.shippingCharged,
    shippingActualCost: shippingInfo.shippingActualCost,
    shippingSubsidy: shippingInfo.shippingSubsidy,
    grossProfit,
    netProfit,
    marginPercent
  };
}

/**
 * Calcula o DRE Canônico Completo e Fluxo de Caixa para um conjunto de pedidos e lançamentos operacionais.
 */
export function calculateFinancialDRE(
  orders: any[], 
  expenses: any[] = [], 
  investments: any[] = [], 
  traffic: any[] = [],
  productCatalog?: any[]
) {
  const validOrders = orders.filter(o => {
    const s = getOrderPaymentStatus(o);
    const paid = getOrderPaidAmount(o);
    if (['cancelled', 'rejected'].includes(s) && paid === 0) return false;
    return true;
  });

  let grossRevenue = 0;
  let totalPaid = 0;
  let totalRefunded = 0;
  let totalPending = 0;
  let totalCogs = 0;
  let completeCogsOrders = 0;
  let totalGatewayFees = 0;
  let totalShippingCharged = 0;
  let totalShippingActual = 0;
  let totalShippingSubsidy = 0;

  validOrders.forEach(o => {
    const fin = calculateOrderFinancials(o, productCatalog);
    grossRevenue += fin.grossTotal;
    totalPaid += fin.paidAmount;
    totalRefunded += fin.refundedAmount;
    totalPending += fin.pendingAmount;
    totalCogs += fin.cogs;
    if (!fin.isCostEstimated) completeCogsOrders++;
    totalGatewayFees += fin.gatewayFee;
    totalShippingCharged += fin.shippingCharged;
    totalShippingActual += fin.shippingActualCost;
    totalShippingSubsidy += fin.shippingSubsidy;
  });

  const netReceived = Math.max(0, totalPaid - totalRefunded);
  const costCoveragePercent = validOrders.length > 0 
    ? Math.round((completeCogsOrders / validOrders.length) * 100) 
    : 100;
  const isCostEstimated = costCoveragePercent < 100;

  const grossProfit = Number((netReceived - totalCogs).toFixed(2));
  const grossMarginPercent = netReceived > 0 ? Number(((grossProfit / netReceived) * 100).toFixed(1)) : 0;

  const activeExpenses = expenses.filter(e => isActiveFinancialRecord(e) && String(e.type || 'out').toLowerCase() !== 'in');
  
  let fixedExpenses = 0;
  let variableExpenses = 0;
  let otherExpenses = 0;

  activeExpenses.forEach(e => {
    const amt = Number(e.amount || 0);
    const cat = String(e.category || '').toUpperCase();
    if (cat === 'DESPESA_FIXA') {
      fixedExpenses += amt;
    } else if (cat === 'DESPESA_VARIAVEL') {
      variableExpenses += amt;
    } else {
      otherExpenses += amt;
    }
  });

  const activeTraffic = traffic.filter(isActiveFinancialRecord);
  const marketingExpenses = activeTraffic.reduce((acc, t) => acc + Number(t.amountSpent ?? t.amount ?? 0), 0);

  const totalVariableCosts = Number((totalGatewayFees + totalShippingSubsidy + variableExpenses).toFixed(2));
  const operatingProfit = Number((grossProfit - totalVariableCosts - fixedExpenses - marketingExpenses - otherExpenses).toFixed(2));
  const operatingMarginPercent = netReceived > 0 ? Number(((operatingProfit / netReceived) * 100).toFixed(1)) : 0;

  const activeInvestments = investments.filter(isActiveFinancialRecord);
  const capexInvestments = activeInvestments.reduce((acc, i) => acc + Number(i.amount || 0), 0);

  const { cashIn, cashOut, netCashFlow } = calculateRecordedCashFlow(orders, expenses, traffic);


  return {
    grossRevenue: Number(grossRevenue.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    totalRefunded: Number(totalRefunded.toFixed(2)),
    netReceived: Number(netReceived.toFixed(2)),
    pendingReceivables: Number(totalPending.toFixed(2)),
    cogs: Number(totalCogs.toFixed(2)),
    cogsCompleteOrders: completeCogsOrders,
    cogsEstimatedOrders: validOrders.length - completeCogsOrders,
    costCoveragePercent,
    isCostEstimated,
    grossProfit,
    grossMarginPercent,
    gatewayFees: Number(totalGatewayFees.toFixed(2)),
    shippingCharged: Number(totalShippingCharged.toFixed(2)),
    shippingActualCost: Number(totalShippingActual.toFixed(2)),
    shippingSubsidy: Number(totalShippingSubsidy.toFixed(2)),
    variableExpenses: Number(variableExpenses.toFixed(2)),
    totalVariableCosts,
    fixedExpenses: Number(fixedExpenses.toFixed(2)),
    marketingExpenses: Number(marketingExpenses.toFixed(2)),
    operatingProfit,
    operatingMarginPercent,
    cashIn,
    cashOut,
    netCashFlow,
    capexInvestments: Number(capexInvestments.toFixed(2)),
    totalValidOrders: validOrders.length
  };
}

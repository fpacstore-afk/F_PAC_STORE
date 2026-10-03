import { companyMovements, isStructureMovement } from '../../shared/companyMovements';
import { getOrderItemCost, getOrderCogs } from '../../shared/orderCostCoverage';
export { getOrderItemCost, getOrderCogs } from '../../shared/orderCostCoverage';
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
    isCostEstimated: cogsInfo.isEstimated || !Array.isArray(order?.items) || order.items.length === 0 || !order.items.every((item: any) => (item.unitCostSnapshot !== undefined && item.unitCostSnapshot !== null) || (item.costPrice !== undefined && item.costPrice !== null) || (item.cost !== undefined && item.cost !== null)),
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
  const giftOrders = orders.filter(o => o?.isGift === true || o?.orderKind === 'gift')
    .filter(o => !['cancelled', 'canceled', 'cancelado'].includes(String(o?.status || o?.paymentStatus || '').toLowerCase()));
  const validOrders = orders.filter(o => {
    if (o?.isGift === true || o?.orderKind === 'gift') return false;
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

  let giftCosts = 0;
  let giftUnknownUnits = 0;
  giftOrders.forEach(o => {
    const storedCost = Number(o?.giftCost?.knownCost);
    giftCosts += o?.giftCost && Number.isFinite(storedCost) && storedCost >= 0
      ? storedCost : getOrderCogs(o, productCatalog).cogs;
    giftUnknownUnits += Math.max(0, Number(o?.giftCost?.unknownUnits) || 0);
  });
  totalCogs += giftCosts;
  const netReceived = Math.max(0, totalPaid - totalRefunded);
  const costBearingRecords = validOrders.length + giftOrders.length;
  const completeCostRecords = completeCogsOrders + giftOrders.filter(o => Number(o?.giftCost?.unknownUnits) === 0).length;
  const costCoveragePercent = costBearingRecords > 0
    ? Math.round((completeCostRecords / costBearingRecords) * 100)
    : 100;
  const isCostEstimated = costCoveragePercent < 100;

  const grossProfit = Number((netReceived - totalCogs).toFixed(2));
  const grossMarginPercent = netReceived > 0 ? Number(((grossProfit / netReceived) * 100).toFixed(1)) : 0;

  const movements = companyMovements(expenses, investments);
  const activeExpenses = movements.filter(e => isActiveFinancialRecord(e) && !isStructureMovement(e) && String(e.type || 'out').toLowerCase() !== 'in');
  
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

  const activeInvestments = movements.filter(e => isActiveFinancialRecord(e) && isStructureMovement(e) && e.type !== 'in');
  const capexInvestments = activeInvestments.reduce((acc, i) => acc + Number(i.amount || 0), 0);

  const { cashIn, cashOut, netCashFlow } = calculateRecordedCashFlow(orders, movements, traffic);


  return {
    grossRevenue: Number(grossRevenue.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    totalRefunded: Number(totalRefunded.toFixed(2)),
    netReceived: Number(netReceived.toFixed(2)),
    pendingReceivables: Number(totalPending.toFixed(2)),
    cogs: Number(totalCogs.toFixed(2)),
    giftCosts: Number(giftCosts.toFixed(2)),
    giftOrdersCount: giftOrders.length,
    giftUnknownUnits,
    cogsCompleteOrders: completeCostRecords,
    cogsEstimatedOrders: costBearingRecords - completeCostRecords,
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

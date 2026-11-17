import { hasRecordedShippingCost, getOrderTotal, getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderNetReceived, getOrderPaymentStatus, getOrderShippingFinances, getOrderGatewayFee } from './orderFinancialCore';
import { companyMovements, isStructureMovement } from './companyMovements';
import { isOwnerWithdrawal } from './ownerWithdrawals';
import { getOrderCogs } from './orderCostCoverage';
import { calculateRecordedCashFlow, isActiveFinancialRecord } from './cashFlow';
import { INVENTORY_PURCHASE } from './cashFlowOptions';
import { roundMoney, roundPercent } from './financialDefaults';

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

  // Lucro Bruto do pedido = Receita Líquida - COGS
  const grossProfit = Number((netReceived - cogsInfo.cogs).toFixed(2));

  // Lucro Líquido do pedido = Lucro Bruto - Taxa Gateway - Subsídio Frete
  const netProfit = Number((grossProfit - gatewayInfo.fee - shippingInfo.shippingSubsidy).toFixed(2));

  const marginPercent = netReceived > 0 ? Number(((netProfit / netReceived) * 100).toFixed(1)) : 0;

  const items = Array.isArray(order?.items) ? order.items : [];
  const hasHistoricalSnapshot = items.length > 0 && items.every((i: any) => 
    (i.unitCostSnapshot !== undefined && i.unitCostSnapshot !== null) ||
    (i.costPrice !== undefined && i.costPrice !== null) ||
    (i.cost !== undefined && i.cost !== null)
  );
  const isCostEstimated = !hasHistoricalSnapshot || cogsInfo.isEstimated;

  return {
    grossTotal: total,
    paidAmount: paid,
    refundedAmount: refunded,
    netReceived,
    pendingAmount: pending,
    paymentStatus: status,
    cogs: cogsInfo.cogs,
    isCostEstimated,
    costCoveragePercent: cogsInfo.costCoveragePercent,
    gatewayFee: gatewayInfo.fee,
    isGatewayFeeExact: gatewayInfo.isExact,
    isShippingCostExact: hasRecordedShippingCost(order),
    isResultProvisional: isCostEstimated || !gatewayInfo.isExact || !hasRecordedShippingCost(order),
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
  // 1. Filtrar pedidos válidos (exclui cancelados e rejeitados sem nenhum pagamento)
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
  let ordersWithEstimatedFees = 0;
  let ordersWithoutShippingCost = 0;
  let totalGatewayFees = 0;
  let totalShippingCharged = 0;
  let totalShippingActual = 0;
  let totalShippingSubsidy = 0;
  let totalOrdersOtherVariableCosts = 0;
  let giftCosts = 0;
  let giftUnknownUnits = 0;

  validOrders.forEach(o => {
    const fin = calculateOrderFinancials(o, productCatalog);
    grossRevenue += fin.grossTotal;
    totalPaid += fin.paidAmount;
    totalRefunded += fin.refundedAmount;
    totalPending += fin.pendingAmount;
    totalCogs += fin.cogs;
    if (!fin.isCostEstimated) completeCogsOrders++;
    if (!fin.isGatewayFeeExact) ordersWithEstimatedFees++;
    if (!fin.isShippingCostExact && fin.shippingCharged > 0) ordersWithoutShippingCost++;
    totalGatewayFees += fin.gatewayFee;
    totalShippingCharged += fin.shippingCharged;
    totalShippingActual += fin.shippingActualCost;
    totalShippingSubsidy += fin.shippingSubsidy;
    totalOrdersOtherVariableCosts += Number(o.otherVariableCosts || 0);
  });

  giftOrders.forEach(o => {
    const storedCost = Number(o?.giftCost?.knownCost);
    if (o?.giftCost && Number.isFinite(storedCost) && storedCost >= 0) {
      giftCosts += storedCost;
    } else {
      // Fallback only for gifts created before this field existed. New gifts
      // always keep their immutable snapshot in giftCost.
      giftCosts += getOrderCogs(o, productCatalog).cogs;
    }
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

  // 2. Despesas Operacionais Lançadas (filtrar status != voided)
  const movements = companyMovements(expenses, investments);
  const activeExpenses = movements.filter(e => isActiveFinancialRecord(e) && !isStructureMovement(e) && !isOwnerWithdrawal(e) && String(e.type || 'out').toLowerCase() !== 'in');
  
  let fixedExpenses = 0;
  let variableExpenses = 0;
  let otherExpenses = 0;
  let cashflowMarketing = 0;
  let inventoryPurchases = 0;

  activeExpenses.forEach(e => {
    const amt = Number(e.amount || 0);
    const cat = String(e.category || '').toUpperCase();
    const normalizedCategory = cat.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const type = String(e.type || e.expenseType || '').toLowerCase();
    if (cat.trim() === INVENTORY_PURCHASE) {
      inventoryPurchases += amt;
    } else if (normalizedCategory === 'MARKETING' || normalizedCategory === 'TRAFEGO PAGO') {
      cashflowMarketing += amt;
    } else if (cat === 'DESPESA_FIXA' || cat.includes('FIX') || type === 'fixed') {
      fixedExpenses += amt;
    } else if (cat === 'DESPESA_VARIAVEL' || cat.includes('VAR') || type === 'variable') {
      variableExpenses += amt;
    } else {
      otherExpenses += amt;
    }
  });

  // 3. Tráfego Pago / Marketing
  const activeTraffic = traffic.filter(isActiveFinancialRecord);
  const representedTraffic = new Set(movements.filter(e => e.sourceType === 'traffic' && e.sourceReferenceId).map(e => String(e.sourceReferenceId)));
  const marketingExpenses = cashflowMarketing + activeTraffic.filter(t => !representedTraffic.has(String(t.id)))
    .reduce((acc, t) => acc + Number(t.amountSpent ?? t.amount ?? 0), 0);

  // 4. Total de Custos Variáveis
  const totalVariableCosts = Number((totalGatewayFees + totalShippingSubsidy + totalOrdersOtherVariableCosts + variableExpenses).toFixed(2));

  // Margem de Contribuição dos Pedidos (Motor 9.6.1 canônico - 0 centavos de divergência com profitability)
  const orderContributionMargin = roundMoney(grossProfit - (totalGatewayFees + totalShippingSubsidy + totalOrdersOtherVariableCosts));
  const orderContributionMarginPercent = netReceived > 0 ? roundPercent((orderContributionMargin / netReceived) * 100) : 0;

  // Margem de Contribuição Canônica (Motor 9.6.1 canônico)
  const contributionMargin = orderContributionMargin;
  const contributionMarginPercent = orderContributionMarginPercent;

  // Margem de Contribuição Operacional (após Despesas Variáveis Administrativas não alocadas do Cashflow)
  const operationalContributionMargin = roundMoney(grossProfit - totalVariableCosts);
  const contributionAfterUnallocatedVariableExpenses = operationalContributionMargin;

  // 5. Lucro Operacional
  const operatingProfit = Number((grossProfit - totalVariableCosts - fixedExpenses - marketingExpenses - otherExpenses).toFixed(2));
  const operatingMarginPercent = netReceived > 0 ? Number(((operatingProfit / netReceived) * 100).toFixed(1)) : 0;

  // 6. Investimentos (CAPEX)
  const activeInvestments = movements.filter(e => isActiveFinancialRecord(e) && isStructureMovement(e) && e.type !== 'in');
  const capexInvestments = activeInvestments.reduce((acc, i) => acc + Number(i.amount || 0), 0);

  // 7. Fluxo de Caixa (Cash Flow)
  // Entradas = Receita efetivamente capturada + aportes de entrada
  const { cashIn, cashOut, netCashFlow } = calculateRecordedCashFlow(orders, movements, traffic);


  // 8. Ticket Médio Canônico
  const paidOrders = validOrders.filter(o => getOrderPaidAmount(o) > 0);
  const paidOrdersCount = paidOrders.length;
  const averageTicket = paidOrdersCount > 0 ? roundMoney(netReceived / paidOrdersCount) : 0;

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
    ordersWithEstimatedFees,
    ordersWithoutShippingCost,
    inventoryPurchases: roundMoney(inventoryPurchases),
    grossProfit,
    grossMarginPercent,
    gatewayFees: Number(totalGatewayFees.toFixed(2)),
    shippingCharged: Number(totalShippingCharged.toFixed(2)),
    shippingActualCost: Number(totalShippingActual.toFixed(2)),
    shippingSubsidy: Number(totalShippingSubsidy.toFixed(2)),
    variableExpenses: Number(variableExpenses.toFixed(2)),
    otherExpenses: Number(otherExpenses.toFixed(2)),
    totalVariableCosts,
    orderContributionMargin,
    orderContributionMarginPercent,
    operationalContributionMargin,
    contributionAfterUnallocatedVariableExpenses,
    contributionMargin,
    contributionMarginPercent,
    fixedExpenses: Number(fixedExpenses.toFixed(2)),
    marketingExpenses: Number(marketingExpenses.toFixed(2)),
    operatingProfit,
    operatingMarginPercent,
    cashIn,
    cashOut,
    netCashFlow,
    capexInvestments: Number(capexInvestments.toFixed(2)),
    totalValidOrders: validOrders.length,
    paidOrdersCount,
    averageTicket,
    summary: {
      averageTicket,
      paidOrdersCount,
      totalValidOrders: validOrders.length,
      netReceived: Number(netReceived.toFixed(2)),
      grossProfit,
      orderContributionMargin,
      operationalContributionMargin,
      contributionMargin,
      operatingProfit
    }
  };
}

export type FinancialDREResult = ReturnType<typeof calculateFinancialDRE>;

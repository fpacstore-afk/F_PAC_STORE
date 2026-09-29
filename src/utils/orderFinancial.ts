import { getOrderItemCost, getOrderCogs } from '../../shared/orderCostCoverage';
export { getOrderItemCost, getOrderCogs } from '../../shared/orderCostCoverage';
import { calculateRecordedCashFlow, isActiveFinancialRecord, getRecordedOrderDueDate, financialDateKey } from '../../shared/cashFlow';
import { getOrderTotal, getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderNetReceived, getOrderPaymentStatus, getOrderShippingFinances, getOrderGatewayFee } from '../../shared/orderFinancialCore';
export { normalizePaymentStatus, getOrderTotal, getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderNetReceived, getOrderPaymentStatus, getOrderShippingFinances, getOrderGatewayFee } from '../../shared/orderFinancialCore';
import { FINANCIAL_DEFAULTS, roundMoney, roundPercent } from '../config/financialDefaults';

/** Earliest recorded open due date; missing dates stay unknown. */
export function getOrderPaymentDueDate(order: any): Date | null {
  return getRecordedOrderDueDate(order);
}

/**
 * Deriva se o pagamento do pedido está atrasado (Inadimplência).
 * Regra canônica: pendingAmount > 0 AND dueDate < now AND status não cancelado/rejeitado.
 */
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
 * Retorna o tipo de badge de vencimento/status financeiro.
 */
export function getPaymentBadgeType(order: any): 'overdue' | 'due_today' | 'upcoming' | 'partial' | 'paid' | 'refunded' | 'pending' {
  const status = getOrderPaymentStatus(order);
  if (status === 'refunded' || status === 'partially_refunded') return 'refunded';
  if (status === 'approved') return 'paid';
  if (['cancelled', 'rejected'].includes(status)) return 'pending';

  const pending = getOrderPendingAmount(order);
  if (pending <= 0) return 'paid';

  if (isOrderPaymentOverdue(order)) return 'overdue';

  const dueDate = getOrderPaymentDueDate(order);
  if (dueDate) {
    const today = new Date();
    const isSameDay = dueDate.getDate() === today.getDate() &&
                      dueDate.getMonth() === today.getMonth() &&
                      dueDate.getFullYear() === today.getFullYear();
    if (isSameDay) return 'due_today';
  }

  if (status === 'partially_paid') return 'partial';
  if (dueDate && dueDate.getTime() > Date.now()) return 'upcoming';

  return 'pending';
}

/**
 * Retorna a taxa de gateway do pedido (Mercado Pago, PIX, Cartão).
 * Se houver taxa real persistida (payment.gatewayFee), usa o valor real; caso contrário calcula a taxa estimada.
 */

/**
 * Retorna as finanças de frete do pedido:
 * - shippingCharged: valor cobrado do cliente
 * - shippingActualCost: custo real pago pela loja
 * - shippingSubsidy: subsídio de frete (max(0, shippingActualCost - shippingCharged))
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
  let totalOrdersOtherVariableCosts = 0;

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
    totalOrdersOtherVariableCosts += Number(o.otherVariableCosts || 0);
  });

  const netReceived = Math.max(0, totalPaid - totalRefunded);
  const costCoveragePercent = validOrders.length > 0 
    ? Math.round((completeCogsOrders / validOrders.length) * 100) 
    : 100;
  const isCostEstimated = costCoveragePercent < 100;

  const grossProfit = Number((netReceived - totalCogs).toFixed(2));
  const grossMarginPercent = netReceived > 0 ? Number(((grossProfit / netReceived) * 100).toFixed(1)) : 0;

  // 2. Despesas Operacionais Lançadas (filtrar status != voided)
  const activeExpenses = expenses.filter(e => isActiveFinancialRecord(e) && String(e.type || 'out').toLowerCase() !== 'in');
  
  let fixedExpenses = 0;
  let variableExpenses = 0;
  let otherExpenses = 0;

  activeExpenses.forEach(e => {
    const amt = Number(e.amount || 0);
    const cat = String(e.category || '').toUpperCase();
    const type = String(e.type || e.expenseType || '').toLowerCase();
    if (cat === 'DESPESA_FIXA' || cat.includes('FIX') || type === 'fixed') {
      fixedExpenses += amt;
    } else if (cat === 'DESPESA_VARIAVEL' || cat.includes('VAR') || type === 'variable') {
      variableExpenses += amt;
    } else {
      otherExpenses += amt;
    }
  });

  // 3. Tráfego Pago / Marketing
  const activeTraffic = traffic.filter(isActiveFinancialRecord);
  const marketingExpenses = activeTraffic.reduce((acc, t) => acc + Number(t.amountSpent ?? t.amount ?? 0), 0);

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
  const activeInvestments = investments.filter(isActiveFinancialRecord);
  const capexInvestments = activeInvestments.reduce((acc, i) => acc + Number(i.amount || 0), 0);

  // 7. Fluxo de Caixa (Cash Flow)
  // Entradas = Receita efetivamente capturada + aportes de entrada
  const { cashIn, cashOut, netCashFlow } = calculateRecordedCashFlow(orders, expenses, traffic);


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

/**
 * Calcula o Resultado / Lucro Operacional canônico a partir da margem de contribuição e despesas operacionais.
 * Suporta assinatura por objeto de parâmetros ou parâmetros posicionais.
 * Fórmula: Lucro Operacional = CM - Despesas Variáveis Administrativas - Despesas Fixas - Marketing (Tráfego) - Outras Despesas
 */
export function calculateOperatingResult(params: {
  contributionMargin: number;
  administrativeVariableExpenses?: number;
  fixedExpenses?: number;
  marketingExpenses?: number;
  otherExpenses?: number;
}): number;
export function calculateOperatingResult(
  contributionMargin: number,
  fixedExpenses: number,
  marketingExpenses?: number,
  otherExpenses?: number,
  variableExpenses?: number
): number;
export function calculateOperatingResult(
  arg1: number | {
    contributionMargin: number;
    administrativeVariableExpenses?: number;
    fixedExpenses?: number;
    marketingExpenses?: number;
    otherExpenses?: number;
  },
  arg2?: number,
  arg3: number = 0,
  arg4: number = 0,
  arg5: number = 0
): number {
  if (typeof arg1 === 'object' && arg1 !== null) {
    const cm = roundMoney(arg1.contributionMargin || 0);
    const adminVar = roundMoney(arg1.administrativeVariableExpenses || 0);
    const fixed = roundMoney(arg1.fixedExpenses || 0);
    const marketing = roundMoney(arg1.marketingExpenses || 0);
    const other = roundMoney(arg1.otherExpenses || 0);
    return roundMoney(cm - adminVar - fixed - marketing - other);
  }
  return roundMoney(
    Number(arg1 || 0) -
    Number(arg2 || 0) -
    Number(arg3 || 0) -
    Number(arg4 || 0) -
    Number(arg5 || 0)
  );
}

// Re-exportação canônica do motor de rentabilidade para unificação de API
export {
  calculateProductProfitability,
  calculateOrderProfitability,
  calculateProfitabilityOverviewStats,
  calculateRevenueComposition,
  aggregateProfitabilityByLine,
  simulateProductPrice,
  calculateMinimumPrice,
  calculatePriceForDesiredMargin,
  calculateBreakEven,
  calculateTargetProfitRequirements,
  MARGIN_THRESHOLDS,
  BREAKEVEN_THRESHOLDS,
  classifyMargin,
  classifyBreakEvenStatus,
  type MarginClassification,
  type MarginClassificationResult,
  type BreakEvenStatus,
  type BreakEvenStatusResult,
  type OrderProfitability,
  type ProductProfitabilityItem,
  type RevenueComposition,
  type ProfitabilityOverviewStats,
  type LineProfitabilityItem,
  type PriceSimulationParams,
  type PriceSimulationResult,
  type MinimumPriceParams,
  type DesiredMarginParams,
  type BreakEvenParams,
  type BreakEvenResult,
  type TargetProfitParams,
  type TargetProfitResult
} from './profitability';

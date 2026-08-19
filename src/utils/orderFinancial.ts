import { PaymentStatus } from '../types/order';
import { FINANCIAL_DEFAULTS, roundMoney, roundPercent } from '../config/financialDefaults';

/**
 * Normaliza qualquer string de status de pagamento para o PaymentStatus canônico.
 */
export function normalizePaymentStatus(status: any): PaymentStatus {
  if (!status) return 'pending';
  const str = String(status).trim().toLowerCase();

  if (['approved', 'aprovado', 'pago', 'pagamento aprovado', 'paid', 'completed', 'concluido', 'concluído'].includes(str)) {
    return 'approved';
  }
  if (['partially_paid', 'parcial', 'parcialmente pago', 'pagamento parcial'].includes(str)) {
    return 'partially_paid';
  }
  if (['refunded', 'reembolsado', 'estornado', 'devolvido'].includes(str)) {
    return 'refunded';
  }
  if (['partially_refunded', 'reembolso parcial', 'parcialmente reembolsado', 'estornado parcialmente'].includes(str)) {
    return 'partially_refunded';
  }
  if (['cancelled', 'cancelado', 'pagamento cancelado'].includes(str)) {
    return 'cancelled';
  }
  if (['rejected', 'recusado', 'rejeitado', 'pagamento recusado', 'pagamento não realizado'].includes(str)) {
    return 'rejected';
  }
  if (['processing', 'in_process', 'em_analise', 'em análise', 'analisando'].includes(str)) {
    return 'processing';
  }
  return 'pending';
}

/**
 * Retorna o valor total histórico do pedido (Snapshot de precificação).
 */
export function getOrderTotal(order: any): number {
  if (!order) return 0;
  return Number(order.pricing?.total ?? order.total ?? order.totalAmount ?? 0);
}

/**
 * Retorna o montante financeiro efetivamente capturado/pago.
 */
export function getOrderPaidAmount(order: any): number {
  if (!order) return 0;
  if (order.payment?.paidAmount !== undefined && order.payment?.paidAmount !== null) {
    return Number(order.payment.paidAmount);
  }
  if (order.paidAmount !== undefined && order.paidAmount !== null) {
    return Number(order.paidAmount);
  }
  if (order.amountPaid !== undefined && order.amountPaid !== null) {
    return Number(order.amountPaid);
  }
  const status = normalizePaymentStatus(order.payment?.status || order.paymentStatus || order.status);
  if (status === 'approved') {
    return getOrderTotal(order);
  }
  return 0;
}

/**
 * Retorna o saldo devedor restante do pedido.
 */
export function getOrderPendingAmount(order: any): number {
  if (!order) return 0;
  if (order.payment?.pendingAmount !== undefined && order.payment?.pendingAmount !== null) {
    return Number(order.payment.pendingAmount);
  }
  if (order.balanceDue !== undefined && order.balanceDue !== null) {
    return Number(order.balanceDue);
  }
  const status = normalizePaymentStatus(order.payment?.status || order.paymentStatus || order.status);
  if (status === 'approved') return 0;
  if (['cancelled', 'rejected'].includes(status)) return 0;
  
  const total = getOrderTotal(order);
  const paid = getOrderPaidAmount(order);
  return Math.max(0, total - paid);
}

/**
 * Retorna o montante total estornado/reembolsado do pedido.
 */
export function getOrderRefundedAmount(order: any): number {
  if (!order) return 0;
  if (order.payment?.refundedAmount !== undefined && order.payment?.refundedAmount !== null) {
    return Number(order.payment.refundedAmount);
  }
  if (order.refundedAmount !== undefined && order.refundedAmount !== null) {
    return Number(order.refundedAmount);
  }
  return 0;
}

/**
 * Retorna a receita líquida recebida (paidAmount - refundedAmount).
 */
export function getOrderNetReceived(order: any): number {
  const paid = getOrderPaidAmount(order);
  const refunded = getOrderRefundedAmount(order);
  return Math.max(0, paid - refunded);
}

/**
 * Retorna o status canônico de pagamento do pedido.
 */
export function getOrderPaymentStatus(order: any): PaymentStatus {
  if (!order) return 'pending';
  return normalizePaymentStatus(order.payment?.status || order.paymentStatus || order.status);
}

/**
 * Retorna a data de vencimento financeiro formatada ou calculada.
 */
export function getOrderPaymentDueDate(order: any): Date | null {
  if (!order) return null;
  const rawDue = order.payment?.dueDate || order.dueDate;
  if (rawDue) {
    const d = rawDue.toDate ? rawDue.toDate() : new Date(rawDue);
    if (!isNaN(d.getTime())) return d;
  }
  // Default: se PIX ou boleto sem vencimento explícito, 24 horas após criação
  const createdDate = order.createdAt?.toDate ? order.createdAt.toDate() : (order.createdAt ? new Date(order.createdAt) : null);
  if (createdDate && !isNaN(createdDate.getTime())) {
    return new Date(createdDate.getTime() + 24 * 60 * 60 * 1000);
  }
  return null;
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

  return dueDate.getTime() < Date.now();
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

  // 0. Caso explícito de custo indisponível / não cadastrado
  if (item.costCoverage === 'unavailable' || item.costCoverage === 'missing') {
    return {
      unitCost: 0,
      totalCost: 0,
      isSnapshot: false,
      isEstimated: false,
      costCoverage: 'unavailable'
    };
  }

  // 1. Snapshot histórico gravado na criação do pedido
  if (item.unitCostSnapshot !== undefined && item.unitCostSnapshot !== null && !isNaN(Number(item.unitCostSnapshot))) {
    const unitCost = Number(item.unitCostSnapshot);
    const totalCost = item.totalCostSnapshot !== undefined ? Number(item.totalCostSnapshot) : Number((unitCost * qty).toFixed(2));
    const coverage = item.costCoverage === 'complete' || item.costCoverage === undefined ? 'complete' : 'estimated';
    return {
      unitCost,
      totalCost,
      isSnapshot: true,
      isEstimated: coverage === 'estimated',
      costCoverage: coverage
    };
  }

  // 2. Item com custo explícito legado / direto no item
  const directItemCost = Number(item.costPrice ?? item.cost ?? item.manufacturingCost ?? 0);
  if (directItemCost > 0) {
    return {
      unitCost: directItemCost,
      totalCost: Number((directItemCost * qty).toFixed(2)),
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
      if (foundProd.costCoverage === 'unavailable' || foundProd.costCoverage === 'missing' || foundProd.costPrice === 0 || foundProd.cost === 0) {
        return {
          unitCost: 0,
          totalCost: 0,
          isSnapshot: false,
          isEstimated: false,
          costCoverage: 'unavailable'
        };
      }
      const prodCost = Number(foundProd.costPrice ?? foundProd.cost ?? foundProd.manufacturingCost ?? 0);
      if (prodCost > 0) {
        return {
          unitCost: prodCost,
          totalCost: Number((prodCost * qty).toFixed(2)),
          isSnapshot: false,
          isEstimated: false,
          costCoverage: 'complete'
        };
      }
    }
  }

  // 4. Estimativa canônica por linha de produto
  const name = String(item.name || item.slug || '').toLowerCase();
  let estimatedUnit: number = 0;
  if (name.includes('mark')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.MARK;
  else if (name.includes('prime')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.PRIME;
  else if (name.includes('force')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.FORCE;
  else if (Array.isArray(productCatalog) && productCatalog.length > 0) {
    const searchKeys = [item.productId, item.slug, item.id, item.parentSlug].filter(Boolean);
    const foundProd = productCatalog.find(p => searchKeys.includes(p.id) || searchKeys.includes(p.slug));
    if (foundProd?.line && FINANCIAL_DEFAULTS.estimatedProductCosts[foundProd.line]) {
      estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts[foundProd.line];
    }
  }

  if (estimatedUnit > 0) {
    return {
      unitCost: estimatedUnit,
      totalCost: roundMoney(estimatedUnit * qty),
      isSnapshot: false,
      isEstimated: true,
      costCoverage: 'estimated'
    };
  }

  return {
    unitCost: 0,
    totalCost: 0,
    isSnapshot: false,
    isEstimated: false,
    costCoverage: 'unavailable'
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
    if (!costInfo.isEstimated) {
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
 * Se houver taxa real persistida (payment.gatewayFee), usa o valor real; caso contrário calcula a taxa estimada.
 */
export function getOrderGatewayFee(order: any): {
  fee: number;
  isExact: boolean;
  netSettlement: number;
} {
  const paidAmount = getOrderPaidAmount(order);
  if (paidAmount <= 0) {
    return { fee: 0, isExact: true, netSettlement: 0 };
  }

  // 1. Taxa real informada pelo provider
  if (order.payment?.gatewayFee !== undefined && order.payment?.gatewayFee !== null && !isNaN(Number(order.payment.gatewayFee))) {
    const fee = Number(Number(order.payment.gatewayFee).toFixed(2));
    return {
      fee,
      isExact: true,
      netSettlement: Number(Math.max(0, paidAmount - fee).toFixed(2))
    };
  }

  // 2. Cálculo estimado padrão centralizado
  const method = String(order.payment?.method || order.paymentMethod || '').toLowerCase();
  const methodId = String(order.payment?.methodId || '').toLowerCase();

  let fee = 0;
  if (method.includes('pix') || methodId === 'pix') {
    fee = roundMoney((paidAmount * (FINANCIAL_DEFAULTS.gateway.pixFeePercent / 100)) + FINANCIAL_DEFAULTS.gateway.pixFixedFee);
  } else if (method.includes('cartão') || method.includes('cartao') || method.includes('credit') || methodId.includes('card')) {
    fee = roundMoney((paidAmount * (FINANCIAL_DEFAULTS.gateway.cardFeePercent / 100)) + FINANCIAL_DEFAULTS.gateway.cardFixedFee);
  } else if (method.includes('dinheiro') || method.includes('transferência') || method.includes('manual')) {
    // Dinheiro em espécie / Transferência direta sem taxa de gateway
    fee = 0;
  } else {
    // Default fallback
    fee = roundMoney((paidAmount * (FINANCIAL_DEFAULTS.gateway.defaultFeePercent / 100)) + FINANCIAL_DEFAULTS.gateway.defaultFixedFee);
  }

  return {
    fee,
    isExact: false,
    netSettlement: roundMoney(Math.max(0, paidAmount - fee))
  };
}

/**
 * Retorna as finanças de frete do pedido:
 * - shippingCharged: valor cobrado do cliente
 * - shippingActualCost: custo real pago pela loja
 * - shippingSubsidy: subsídio de frete (max(0, shippingActualCost - shippingCharged))
 */
export function getOrderShippingFinances(order: any): {
  shippingCharged: number;
  shippingActualCost: number;
  shippingSubsidy: number;
} {
  const charged = Number(
    order.shippingFinances?.shippingCharged ??
    order.pricing?.shipping ?? 
    order.shipping ?? 
    order.frete ?? 
    0
  );
  const actual = Number(
    order.shippingFinances?.shippingCost ??
    order.shippingFinances?.shippingActualCost ??
    order.pricing?.shippingActualCost ?? 
    order.shippingDetails?.actualCost ?? 
    order.shippingCost ?? 
    charged
  );

  const subsidy = Math.max(0, Number((actual - charged).toFixed(2)));

  return {
    shippingCharged: Number(charged.toFixed(2)),
    shippingActualCost: Number(actual.toFixed(2)),
    shippingSubsidy: subsidy
  };
}

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
  const activeExpenses = expenses.filter(e => e.status !== 'voided' && e.status !== 'cancelled');
  
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
  const activeTraffic = traffic.filter(t => (t as any).status !== 'voided');
  const marketingExpenses = activeTraffic.reduce((acc, t) => acc + Number(t.amountSpent || t.amount || 0), 0);

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
  const activeInvestments = investments.filter(i => i.status !== 'voided');
  const capexInvestments = activeInvestments.reduce((acc, i) => acc + Number(i.amount || 0), 0);

  // 7. Fluxo de Caixa (Cash Flow)
  // Entradas = Receita efetivamente capturada + aportes de entrada
  const manualCashIn = expenses.filter(e => e.type === 'in' && e.status !== 'voided').reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const cashIn = Number((totalPaid + manualCashIn).toFixed(2));

  // Saídas = Reembolsos pagos + Despesas pagas + Fretes/taxas + CAPEX
  const manualCashOut = expenses.filter(e => e.type === 'out' && e.status !== 'voided').reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const cashOut = Number((totalRefunded + totalGatewayFees + totalShippingActual + manualCashOut + marketingExpenses + capexInvestments).toFixed(2));
  const netCashFlow = Number((cashIn - cashOut).toFixed(2));

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



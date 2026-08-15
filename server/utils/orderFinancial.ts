import { PaymentStatus } from '../types/order.types.js';
import { FINANCIAL_DEFAULTS, roundMoney } from '../../shared/financialDefaults.js';

export function normalizePaymentStatus(status: any): PaymentStatus {
  if (!status) return 'pending';
  const str = String(status).trim().toLowerCase();

  if (['approved', 'aprovado', 'pago', 'pagamento aprovado', 'paid'].includes(str)) {
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

export function getOrderTotal(order: any): number {
  if (!order) return 0;
  return Number(order.pricing?.total ?? order.total ?? 0);
}

export function getOrderPaidAmount(order: any): number {
  if (!order) return 0;
  if (order.payment?.paidAmount !== undefined && order.payment?.paidAmount !== null) {
    return Number(order.payment.paidAmount);
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

export function getOrderNetReceived(order: any): number {
  const paid = getOrderPaidAmount(order);
  const refunded = getOrderRefundedAmount(order);
  return Math.max(0, paid - refunded);
}

export function getOrderPaymentStatus(order: any): PaymentStatus {
  if (!order) return 'pending';
  return normalizePaymentStatus(order.payment?.status || order.paymentStatus || order.status);
}

export function getOrderPaymentDueDate(order: any): Date | null {
  if (!order) return null;
  const rawDue = order.payment?.dueDate || order.dueDate;
  if (rawDue) {
    const d = rawDue.toDate ? rawDue.toDate() : new Date(rawDue);
    if (!isNaN(d.getTime())) return d;
  }
  const createdDate = order.createdAt?.toDate ? order.createdAt.toDate() : (order.createdAt ? new Date(order.createdAt) : null);
  if (createdDate && !isNaN(createdDate.getTime())) {
    return new Date(createdDate.getTime() + 24 * 60 * 60 * 1000);
  }
  return null;
}

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
        return {
          unitCost: prodCost,
          totalCost: Number((prodCost * qty).toFixed(2)),
          isSnapshot: false,
          isEstimated: true,
          costCoverage: 'estimated'
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
export function getOrderGatewayFee(order: any): {
  fee: number;
  isExact: boolean;
  netSettlement: number;
} {
  const paidAmount = getOrderPaidAmount(order);
  if (paidAmount <= 0) {
    return { fee: 0, isExact: true, netSettlement: 0 };
  }

  if (order.payment?.gatewayFee !== undefined && order.payment?.gatewayFee !== null && !isNaN(Number(order.payment.gatewayFee))) {
    const fee = Number(Number(order.payment.gatewayFee).toFixed(2));
    return {
      fee,
      isExact: true,
      netSettlement: Number(Math.max(0, paidAmount - fee).toFixed(2))
    };
  }

  const method = String(order.payment?.method || order.paymentMethod || '').toLowerCase();
  const methodId = String(order.payment?.methodId || '').toLowerCase();

  let fee = 0;
  if (method.includes('pix') || methodId === 'pix') {
    fee = roundMoney((paidAmount * (FINANCIAL_DEFAULTS.gateway.pixFeePercent / 100)) + FINANCIAL_DEFAULTS.gateway.pixFixedFee);
  } else if (method.includes('cartão') || method.includes('cartao') || method.includes('credit') || methodId.includes('card')) {
    fee = roundMoney((paidAmount * (FINANCIAL_DEFAULTS.gateway.cardFeePercent / 100)) + FINANCIAL_DEFAULTS.gateway.cardFixedFee);
  } else if (method.includes('dinheiro') || method.includes('transferência') || method.includes('manual')) {
    fee = 0;
  } else {
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
 */
export function getOrderShippingFinances(order: any): {
  shippingCharged: number;
  shippingActualCost: number;
  shippingSubsidy: number;
} {
  const charged = Number(order.pricing?.shipping ?? order.shipping ?? order.frete ?? 0);
  const actual = Number(
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

  const activeExpenses = expenses.filter(e => e.status !== 'voided' && e.status !== 'cancelled');
  
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

  const activeTraffic = traffic.filter(t => (t as any).status !== 'voided');
  const marketingExpenses = activeTraffic.reduce((acc, t) => acc + Number(t.amountSpent || t.amount || 0), 0);

  const totalVariableCosts = Number((totalGatewayFees + totalShippingSubsidy + variableExpenses).toFixed(2));
  const operatingProfit = Number((grossProfit - totalVariableCosts - fixedExpenses - marketingExpenses - otherExpenses).toFixed(2));
  const operatingMarginPercent = netReceived > 0 ? Number(((operatingProfit / netReceived) * 100).toFixed(1)) : 0;

  const activeInvestments = investments.filter(i => i.status !== 'voided');
  const capexInvestments = activeInvestments.reduce((acc, i) => acc + Number(i.amount || 0), 0);

  const manualCashIn = expenses.filter(e => e.type === 'in' && e.status !== 'voided').reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const cashIn = Number((totalPaid + manualCashIn).toFixed(2));

  const manualCashOut = expenses.filter(e => e.type === 'out' && e.status !== 'voided').reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const cashOut = Number((totalRefunded + totalGatewayFees + totalShippingActual + manualCashOut + marketingExpenses + capexInvestments).toFixed(2));
  const netCashFlow = Number((cashIn - cashOut).toFixed(2));

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


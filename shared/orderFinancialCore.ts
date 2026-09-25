import { FINANCIAL_DEFAULTS, roundMoney } from './financialDefaults';
// Shared monetary readers: browser and server must interpret the same order identically.
import type { PaymentStatus } from '../src/types/order';

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
  const status = storedPaymentStatus(order);
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
  const status = storedPaymentStatus(order);
  if (['cancelled', 'canceled', 'cancelado'].includes(String(order.status || '').toLowerCase())) return 0;
  if (['cancelled', 'rejected', 'refunded'].includes(status)) return 0;
  // Subtract integer cents: 250.90 - 250.80 must be exactly 0.10 in every form.
  const calculatedPending = Math.max(0, Math.round(getOrderTotal(order) * 100) - Math.round(getOrderPaidAmount(order) * 100)) / 100;
  // Captured amounts take precedence over stale status/balance mirrors.
  if (hasPaidAmount(order) || status === 'approved') {
    return calculatedPending;
  }
  if (order.payment?.pendingAmount !== undefined && order.payment?.pendingAmount !== null) {
    return Math.max(0, Math.round(Number(order.payment.pendingAmount) * 100)) / 100;
  }
  if (order.balanceDue !== undefined && order.balanceDue !== null) return Math.max(0, Math.round(Number(order.balanceDue) * 100)) / 100;
  return calculatedPending;
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
function storedPaymentStatus(order: any): PaymentStatus {
  const explicit = order?.payment?.status || order?.paymentStatus;
  if (explicit) return normalizePaymentStatus(explicit);
  // Legacy operational completion is not proof of payment.
  const legacy = String(order?.status || '').trim().toLowerCase();
  if (['completed', 'concluido', 'concluído', 'delivered', 'entregue'].includes(legacy)) return 'pending';
  return normalizePaymentStatus(legacy);
}

function hasPaidAmount(order: any): boolean {
  return [order?.payment?.paidAmount, order?.paidAmount, order?.amountPaid]
    .some(value => value !== undefined && value !== null);
}

export function getOrderPaymentStatus(order: any): PaymentStatus {
  const stored = storedPaymentStatus(order);
  if (['cancelled', 'rejected', 'refunded', 'partially_refunded'].includes(stored)) return stored;
  if (!hasPaidAmount(order)) return stored;
  const paid = getOrderPaidAmount(order);
  const total = getOrderTotal(order);
  if (paid > 0 && Math.round(paid * 100) >= Math.round(total * 100)) return 'approved';
  if (paid > 0) return 'partially_paid';
  return stored === 'processing' ? 'processing' : 'pending';
}

export function getOrderShippingFinances(order: any): {
  shippingCharged: number;
  shippingActualCost: number;
  shippingSubsidy: number;
} {
  const charged = Number(
    order.shippingFinances?.shippingCharged ??
    order.pricing?.shipping ?? 
    (typeof order.shipping === 'number' || typeof order.shipping === 'string' ? order.shipping : undefined) ?? 
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

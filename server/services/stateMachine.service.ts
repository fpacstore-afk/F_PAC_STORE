import { OrderStatus, PaymentStatus, ProductionStatus, ShippingStatus } from '../types/order.types.js';

const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  received: ['processing', 'production', 'cancelled'],
  processing: ['production', 'cancelled'],
  production: ['ready', 'shipped', 'cancelled'],
  ready: ['shipped', 'delivered', 'completed', 'cancelled'],
  shipped: ['delivered', 'completed', 'returned', 'cancelled'],
  delivered: ['completed', 'returned'],
  completed: [],
  returned: [],
  cancelled: []
};

export const CANONICAL_PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'processing',
  'approved',
  'rejected',
  'cancelled',
  'refunded',
  'partially_paid',
  'partially_refunded'
];

export function isPaymentStatus(val: any): val is PaymentStatus {
  return typeof val === 'string' && CANONICAL_PAYMENT_STATUSES.includes(val as PaymentStatus);
}

export function normalizePaymentStatus(status: string): PaymentStatus {
  if (!status) return 'pending';
  const cleaned = status.trim().toLowerCase();
  if (isPaymentStatus(cleaned)) return cleaned;
  if (['pendente', 'aguardando', 'waiting', 'payment_pending', 'aguardando pagamento pix'].includes(cleaned)) return 'pending';
  if (['em_analise', 'em análise', 'analise', 'processing'].includes(cleaned)) return 'processing';
  if (['aprovado', 'pago', 'paid', 'payment_approved', 'approved', 'pagamento aprovado'].includes(cleaned)) return 'approved';
  if (['recusado', 'refused', 'rejected', 'payment_failed', 'pagamento não realizado'].includes(cleaned)) return 'rejected';
  if (['cancelado', 'cancelled', 'canceled'].includes(cleaned)) return 'cancelled';
  if (['estornado', 'reembolsado', 'refunded'].includes(cleaned)) return 'refunded';
  if (['parcial', 'parcialmente_pago', 'partially_paid'].includes(cleaned)) return 'partially_paid';
  if (['reembolso_parcial', 'partially_refunded'].includes(cleaned)) return 'partially_refunded';
  return 'pending';
}

const VALID_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['processing', 'approved', 'partially_paid', 'rejected', 'cancelled'],
  processing: ['approved', 'partially_paid', 'rejected', 'cancelled'],
  partially_paid: ['approved', 'partially_paid', 'refunded', 'partially_refunded'],
  approved: ['partially_refunded', 'refunded'],
  rejected: ['pending', 'cancelled'],
  cancelled: [],
  refunded: [],
  partially_refunded: ['refunded']
};

export const CANONICAL_PRODUCTION_STATUSES: ProductionStatus[] = [
  'waiting',
  'separacao_corte',
  'estamparia',
  'costura',
  'embalagem',
  'ready',
  'completed'
];

export function isProductionStatus(val: any): val is ProductionStatus {
  return typeof val === 'string' && CANONICAL_PRODUCTION_STATUSES.includes(val as ProductionStatus);
}

export function normalizeProductionStatus(status: string): ProductionStatus {
  if (!status) return 'waiting';
  const cleaned = status.trim().toLowerCase();
  if (isProductionStatus(cleaned)) return cleaned;
  if (['recebido', 'received', 'pedido recebido', 'aguardando'].includes(cleaned)) return 'waiting';
  if (['separacao', 'corte', 'separation', 'cutting', 'separa', 'separacao_corte'].includes(cleaned)) return 'separacao_corte';
  if (['printing', 'estamparia', 'estampa'].includes(cleaned)) return 'estamparia';
  if (['sewing', 'costura'].includes(cleaned)) return 'costura';
  if (['packaging', 'embalagem', 'controle_qualidade', 'cq'].includes(cleaned)) return 'embalagem';
  if (['ready', 'pronto_envio', 'pronto para envio', 'pronto'].includes(cleaned)) return 'ready';
  if (['completed', 'finalizado', 'concluido', 'concluído'].includes(cleaned)) return 'completed';
  return 'waiting';
}

const VALID_PRODUCTION_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  waiting: ['separacao_corte'],
  separacao_corte: ['estamparia'],
  estamparia: ['costura'],
  costura: ['embalagem'],
  embalagem: ['ready'],
  ready: ['completed'],
  completed: []
};

export interface ProductionEligibilityResult {
  eligible: boolean;
  error?: string;
  message?: string;
}

/**
  * Central Eligibility Guard for Production Operations.
  * Ensures order is approved, not cancelled/rejected, and not yet shipped.
  */
export function assertProductionOrderEligible(orderData: any): ProductionEligibilityResult {
  if (!orderData) {
    return { eligible: false, error: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' };
  }

  const orderStatusStr = String(orderData.status || '').toLowerCase();
  const paymentStatusStr = normalizePaymentStatus(
    orderData.payment?.status || orderData.paymentStatus || 'pending'
  );
  const shippingStatusStr = String(
    orderData.shipping?.status || orderData.shippingStatus || 'pending'
  ).toLowerCase();

  // 1. Order Status Check: cancelled or rejected orders
  if (['cancelled', 'cancelado', 'rejected', 'rejeitado'].includes(orderStatusStr)) {
    return {
      eligible: false,
      error: 'PRODUCTION_BLOCKED_CANCELLED',
      message: `Pedido cancelado ou rejeitado (${orderStatusStr}) não pode sofrer mutações operacionais de produção.`
    };
  }

  // 2. Payment Status Check: ONLY 'approved' is allowed for active production
  if (paymentStatusStr !== 'approved') {
    return {
      eligible: false,
      error: 'PRODUCTION_BLOCKED_PAYMENT',
      message: `Produção bloqueada. Status de pagamento '${paymentStatusStr}' não autorizado. Somente pedidos com pagamento aprovado podem avançar/sofrer mutações de produção.`
    };
  }

  // 3. Shipping Status Check: shipped, in_transit, or delivered orders have left factory
  if (['shipped', 'in_transit', 'delivered', 'despachado', 'entregue'].includes(shippingStatusStr)) {
    return {
      eligible: false,
      error: 'PRODUCTION_BLOCKED_SHIPPING',
      message: `Produção bloqueada. O pedido já foi despachado ou entregue (status de envio: '${shippingStatusStr}').`
    };
  }

  return { eligible: true };
}

const VALID_SHIPPING_TRANSITIONS: Record<ShippingStatus, ShippingStatus[]> = {
  pending: ['label_created', 'shipped', 'returned'],
  label_created: ['shipped', 'in_transit', 'returned'],
  shipped: ['in_transit', 'delivered', 'returned'],
  in_transit: ['delivered', 'returned'],
  delivered: [],
  returned: []
};

/**
 * Checks if transitioning from current OrderStatus to next OrderStatus is allowed.
 */
export function canTransitionOrderStatus(current: OrderStatus, next: OrderStatus, forceAdmin = false): boolean {
  if (current === next) return true;
  if (forceAdmin) return true;
  const allowed = VALID_ORDER_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

/**
 * Checks if transitioning PaymentStatus is allowed.
 */
export function canTransitionPaymentStatus(currentStr: string, nextStr: string, forceAdmin = false): boolean {
  if (!isPaymentStatus(nextStr)) return false;
  const next = nextStr as PaymentStatus;
  const current = normalizePaymentStatus(currentStr);

  if (current === next) return true;
  // Terminal states cannot transition back to approved
  if (['refunded', 'cancelled'].includes(current) && next === 'approved') return false;
  // Captured money states (approved, partially_paid, refunded, partially_refunded) cannot be transitioned to cancelled
  if (['approved', 'partially_paid', 'refunded', 'partially_refunded'].includes(current) && next === 'cancelled') return false;

  if (forceAdmin) return true;
  const allowed = VALID_PAYMENT_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

/**
 * Checks if transitioning ProductionStatus is allowed.
 * Strictly enforces 1-step consecutive forward transitions.
 * Forward jumps (e.g. waiting -> completed) are NEVER allowed, even with forceAdmin=true.
 * Backward transitions (e.g. embalagem -> estamparia) are allowed for admins (controller checks mandatory reason/note).
 */
export function canTransitionProductionStatus(currentStr: string, nextStr: string, forceAdmin = false): boolean {
  if (!isProductionStatus(nextStr)) return false;
  const next = nextStr as ProductionStatus;
  const current = normalizeProductionStatus(currentStr);

  if (current === next) return true;

  const currentIndex = CANONICAL_PRODUCTION_STATUSES.indexOf(current);
  const nextIndex = CANONICAL_PRODUCTION_STATUSES.indexOf(next);

  if (currentIndex === -1 || nextIndex === -1) return false;

  // Forward transition: ONLY allowed to the exact next consecutive stage (nextIndex === currentIndex + 1)
  // Jumps (e.g., waiting -> completed, waiting -> estamparia) are NEVER allowed, even with forceAdmin=true.
  if (nextIndex > currentIndex) {
    return nextIndex === currentIndex + 1;
  }

  // Backward transition: allowed for admins (controller checks mandatory reason/note)
  if (nextIndex < currentIndex) {
    return true;
  }

  return false;
}

/**
 * Checks if transitioning ShippingStatus is allowed.
 */
export function canTransitionShippingStatus(current: ShippingStatus, next: ShippingStatus, forceAdmin = false): boolean {
  if (current === next) return true;
  // Terminal state protection: delivered shipping cannot transition back to shipped or pending
  if (current === 'delivered' && ['shipped', 'pending', 'label_created'].includes(next)) return false;
  if (forceAdmin) return true;
  const allowed = VALID_SHIPPING_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

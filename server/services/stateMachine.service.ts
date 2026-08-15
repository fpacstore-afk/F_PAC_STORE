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

export const CANONICAL_SHIPPING_STATUSES: ShippingStatus[] = [
  'pending',
  'label_created',
  'shipped',
  'in_transit',
  'delivered',
  'returned'
];

export function isShippingStatus(val: any): val is ShippingStatus {
  return typeof val === 'string' && CANONICAL_SHIPPING_STATUSES.includes(val as ShippingStatus);
}

export function normalizeShippingStatus(status: string): ShippingStatus {
  if (!status) return 'pending';
  const cleaned = status.trim().toLowerCase();
  if (isShippingStatus(cleaned)) return cleaned;
  if (['pending', 'aguardando_envio', 'aguardando envio', 'pronto_envio', 'aguardando', 'waiting'].includes(cleaned)) return 'pending';
  if (['label_created', 'etiqueta_gerada', 'etiqueta gerada', 'label_generated'].includes(cleaned)) return 'label_created';
  if (['shipped', 'enviado', 'despachado', 'postado'].includes(cleaned)) return 'shipped';
  if (['in_transit', 'em_transporte', 'em_transito', 'em trânsito', 'transito', 'trânsito'].includes(cleaned)) return 'in_transit';
  if (['delivered', 'entregue', 'concluido', 'concluído'].includes(cleaned)) return 'delivered';
  if (['returned', 'devolvido', 'devolução'].includes(cleaned)) return 'returned';
  return 'pending';
}

export type DeliveryMethod = 'melhor_envio' | 'entrega_propria' | 'retirada_local';

/**
 * Normalizes delivery method value or order object into canonical DeliveryMethod.
 */
export function normalizeDeliveryMethod(val: any): DeliveryMethod {
  if (!val) return 'melhor_envio';

  if (typeof val === 'object') {
    // Read canonical service ID first if present
    const serviceId = val.shippingServiceId !== undefined 
      ? val.shippingServiceId 
      : (val.shipping?.serviceId !== undefined ? val.shipping.serviceId : undefined);

    const methodStr = String(
      val.deliveryMethod || 
      val.shippingMethod || 
      val.shipping?.method || 
      val.shippingMethodName || 
      val.shipping?.methodName || 
      ''
    ).toLowerCase();

    if (serviceId === 0 || serviceId === '0') {
      if (methodStr.includes('retirada') || methodStr.includes('loja')) {
        return 'retirada_local';
      }
      return 'entrega_propria';
    }

    if (serviceId !== undefined && serviceId !== null && serviceId !== '' && Number(serviceId) > 0) {
      return 'melhor_envio';
    }

    if (methodStr) {
      return normalizeDeliveryMethod(methodStr);
    }

    return 'melhor_envio';
  }

  const str = String(val).trim().toLowerCase();
  if (!str) return 'melhor_envio';

  if (['0', 'retirada_local', 'retirada', 'retirada na loja', 'retirada_loja', 'pickup'].includes(str) || str.includes('retirada')) {
    return 'retirada_local';
  }

  if (
    ['entrega_propria', 'entrega propria', 'entrega local', 'entrega_local', 'joinville', 'motoboy', 'propria', 'própria', 'local'].some(k => str.includes(k))
  ) {
    return 'entrega_propria';
  }

  return 'melhor_envio';
}

export const MELHOR_ENVIO_SHIPPING_TRANSITIONS: Record<ShippingStatus, ShippingStatus[]> = {
  pending: ['label_created', 'returned'],
  label_created: ['shipped', 'returned'],
  shipped: ['in_transit', 'returned'],
  in_transit: ['delivered', 'returned'],
  delivered: ['returned'],
  returned: []
};

export const LOCAL_DELIVERY_SHIPPING_TRANSITIONS: Record<ShippingStatus, ShippingStatus[]> = {
  pending: ['shipped', 'returned'],
  label_created: [],
  shipped: ['delivered', 'returned'],
  in_transit: [],
  delivered: ['returned'],
  returned: []
};

export interface TrackingValidationResult {
  valid: boolean;
  error?: string;
  message?: string;
  sanitizedTrackingCode?: string;
  sanitizedCarrier?: string;
  sanitizedTrackingUrl?: string;
}

/**
 * Validates trackingCode, carrier, and trackingUrl formats.
 * Rejects objects, arrays, numbers, nulls, empty strings, and malformed URLs.
 */
export function validateTrackingInfo(data: { trackingCode?: any; carrier?: any; trackingUrl?: any }): TrackingValidationResult {
  let sanitizedTrackingCode: string | undefined = undefined;
  let sanitizedCarrier: string | undefined = undefined;
  let sanitizedTrackingUrl: string | undefined = undefined;

  if (data.trackingCode !== undefined && data.trackingCode !== null) {
    if (typeof data.trackingCode !== 'string') {
      return {
        valid: false,
        error: 'INVALID_TRACKING_CODE',
        message: 'Código de rastreio deve ser uma string de texto válida.'
      };
    }
    const trimmed = data.trackingCode.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === '[object Object]') {
      return {
        valid: false,
        error: 'INVALID_TRACKING_CODE',
        message: 'Código de rastreio não pode ser vazio ou inválido.'
      };
    }
    if (trimmed.length < 2) {
      return {
        valid: false,
        error: 'INVALID_TRACKING_CODE',
        message: 'Código de rastreio deve ter no mínimo 2 caracteres.'
      };
    }
    sanitizedTrackingCode = trimmed.replace(/\s+/g, '');
  }

  if (data.carrier !== undefined && data.carrier !== null) {
    if (typeof data.carrier !== 'string') {
      return {
        valid: false,
        error: 'INVALID_CARRIER',
        message: 'Nome da transportadora deve ser uma string de texto válida.'
      };
    }
    const trimmed = data.carrier.trim();
    if (trimmed) {
      sanitizedCarrier = trimmed;
    }
  }

  if (data.trackingUrl !== undefined && data.trackingUrl !== null) {
    if (typeof data.trackingUrl !== 'string') {
      return {
        valid: false,
        error: 'INVALID_TRACKING_URL',
        message: 'URL de rastreio deve ser uma string de texto válida.'
      };
    }
    const trimmed = data.trackingUrl.trim();
    if (trimmed) {
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        return {
          valid: false,
          error: 'INVALID_TRACKING_URL',
          message: 'URL de rastreio deve ser uma URL válida com protocolo http:// ou https://.'
        };
      }
      sanitizedTrackingUrl = trimmed;
    }
  }

  return {
    valid: true,
    sanitizedTrackingCode,
    sanitizedCarrier,
    sanitizedTrackingUrl
  };
}

export interface ShippingEligibilityResult {
  eligible: boolean;
  error?: string;
  message?: string;
}

export interface ShippingEligibilityOptions {
  forMelhorEnvioLabel?: boolean;
}

/**
 * Checks if order is for local delivery / pickup in Joinville (Entrega Própria)
 */
export function isLocalDeliveryOrder(orderData: any): boolean {
  if (!orderData) return false;
  const method = normalizeDeliveryMethod(orderData);
  return method === 'entrega_propria' || method === 'retirada_local';
}

/**
 * Central Eligibility Guard for Shipping Operations.
 * Ensures order is approved, not cancelled/rejected, and production is ready or completed.
 */
export function assertShippingOrderEligible(
  orderData: any,
  options: ShippingEligibilityOptions = {}
): ShippingEligibilityResult {
  if (!orderData) {
    return { eligible: false, error: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' };
  }

  const orderStatusStr = String(orderData.status || '').toLowerCase();
  const paymentStatusStr = normalizePaymentStatus(
    orderData.payment?.status || orderData.paymentStatus || 'pending'
  );
  const productionStatusStr = normalizeProductionStatus(
    orderData.production?.status || orderData.productionStatus || 'waiting'
  );

  // 1. Order Status Check: cancelled or rejected orders
  if (['cancelled', 'cancelado', 'rejected', 'rejeitado'].includes(orderStatusStr)) {
    return {
      eligible: false,
      error: 'SHIPPING_BLOCKED_CANCELLED',
      message: `Pedido cancelado ou rejeitado (${orderStatusStr}) não pode ser despachado ou sofrer mutações de envio.`
    };
  }

  // 2. Payment Status Check: ONLY 'approved' is allowed for active shipping
  if (paymentStatusStr !== 'approved') {
    return {
      eligible: false,
      error: 'SHIPPING_BLOCKED_PAYMENT',
      message: `Envio bloqueado. Status de pagamento '${paymentStatusStr}' não autorizado. Somente pedidos com pagamento aprovado podem ser despachados.`
    };
  }

  // 3. Production Status Check: MUST be 'ready' or 'completed'
  if (!['ready', 'completed'].includes(productionStatusStr)) {
    return {
      eligible: false,
      error: 'SHIPPING_BLOCKED_PRODUCTION',
      message: `Envio bloqueado. Produção ainda não concluída (status de produção: '${productionStatusStr}'). O pedido deve estar no mínimo como 'ready' (pronto para envio).`
    };
  }

  // 4. Local Delivery Check for Melhor Envio Label Generation
  if (options.forMelhorEnvioLabel && isLocalDeliveryOrder(orderData)) {
    return {
      eligible: false,
      error: 'SHIPPING_LOCAL_DELIVERY_NO_LABEL',
      message: 'Pedidos com Entrega Própria ou Retirada Local não utilizam e não necessitam de etiquetas do Melhor Envio.'
    };
  }

  return { eligible: true };
}

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

  // Terminal state protection for production: 'completed' cannot transition backward or forward
  if (current === 'completed') {
    return false;
  }

  // Backward transition: allowed for admins except from terminal completed
  if (nextIndex < currentIndex) {
    return true;
  }

  return false;
}

/**
 * Checks if transitioning ShippingStatus is allowed.
 * - For Melhor Envio: pending -> label_created -> shipped -> in_transit -> delivered.
 *   Disallows jumps like pending -> shipped or shipped -> delivered.
 * - For Local Delivery / Retirada Local: pending -> shipped -> delivered (no label_created required/allowed).
 * Enforces terminal state protection (delivered/returned).
 */
export function canTransitionShippingStatus(
  currentStr: string,
  nextStr: string,
  deliveryMethodOrOrder: any = 'melhor_envio',
  forceAdmin = false
): boolean {
  if (!isShippingStatus(nextStr)) return false;
  const next = nextStr as ShippingStatus;
  const current = normalizeShippingStatus(currentStr);

  if (current === next) return true;

  // Terminal state protection: delivered cannot transition back to active shipping states (shipped, in_transit, label_created, pending)
  if (current === 'delivered' && next !== 'returned' && next !== 'delivered') return false;
  if (current === 'returned' && next !== 'returned') return false;

  let method: DeliveryMethod = 'melhor_envio';
  if (typeof deliveryMethodOrOrder === 'boolean') {
    method = 'melhor_envio';
  } else {
    method = normalizeDeliveryMethod(deliveryMethodOrOrder);
  }

  const table = (method === 'melhor_envio')
    ? MELHOR_ENVIO_SHIPPING_TRANSITIONS
    : LOCAL_DELIVERY_SHIPPING_TRANSITIONS;

  const allowed = table[current] || [];
  return allowed.includes(next);
}

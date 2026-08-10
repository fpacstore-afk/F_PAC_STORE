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

const VALID_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['refunded', 'partially_refunded'],
  rejected: ['pending', 'cancelled'],
  cancelled: [],
  refunded: [],
  partially_refunded: ['refunded']
};

const VALID_PRODUCTION_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  waiting: ['separation', 'cutting', 'printing', 'sewing', 'packaging', 'ready', 'completed'],
  separation: ['cutting', 'printing', 'sewing', 'packaging', 'ready', 'completed'],
  cutting: ['printing', 'sewing', 'packaging', 'ready', 'completed'],
  printing: ['sewing', 'packaging', 'ready', 'completed'],
  sewing: ['packaging', 'ready', 'completed'],
  packaging: ['ready', 'completed'],
  ready: ['completed'],
  completed: []
};

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
export function canTransitionPaymentStatus(current: PaymentStatus, next: PaymentStatus, forceAdmin = false): boolean {
  if (current === next) return true;
  if (forceAdmin) return true;
  const allowed = VALID_PAYMENT_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

/**
 * Checks if transitioning ProductionStatus is allowed.
 */
export function canTransitionProductionStatus(current: ProductionStatus, next: ProductionStatus, forceAdmin = false): boolean {
  if (current === next) return true;
  if (forceAdmin) return true;
  const allowed = VALID_PRODUCTION_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

/**
 * Checks if transitioning ShippingStatus is allowed.
 */
export function canTransitionShippingStatus(current: ShippingStatus, next: ShippingStatus, forceAdmin = false): boolean {
  if (current === next) return true;
  if (forceAdmin) return true;
  const allowed = VALID_SHIPPING_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

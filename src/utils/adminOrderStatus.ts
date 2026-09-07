import { getOrderPaidAmount, getOrderPaymentStatus, getOrderPendingAmount } from './orderFinancial';
import { getStageFromStatus } from '../constants/productionStages';

export type AdminShippingStatus = 'pending' | 'label_created' | 'shipped' | 'in_transit' | 'delivered' | 'returned' | 'cancelled';

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

export function getAdminPaymentStatus(order: any) {
  return getOrderPaymentStatus(order);
}

export function getAdminProductionStage(order: any) {
  return getStageFromStatus(
    order?.production?.status ||
    order?.productionStatus ||
    order?.status ||
    'waiting'
  );
}

export function getAdminShippingStatus(order: any): AdminShippingStatus {
  const raw = normalize(
    order?.shipping?.status ||
    order?.shippingStatus ||
    order?.deliveryStatus ||
    order?.status
  );

  if (['label_created', 'etiqueta_criada', 'etiqueta criada'].includes(raw)) return 'label_created';
  if (['shipped', 'enviado', 'despachado'].includes(raw)) return 'shipped';
  if (['in_transit', 'em_transito', 'em trânsito'].includes(raw)) return 'in_transit';
  if (['delivered', 'entregue'].includes(raw)) return 'delivered';
  if (['returned', 'devolvido', 'retornado'].includes(raw)) return 'returned';
  if (['cancelled', 'canceled', 'cancelado'].includes(raw)) return 'cancelled';
  return 'pending';
}

export function isAdminOrderCancelled(order: any): boolean {
  const legacy = normalize(order?.status);
  const payment = getAdminPaymentStatus(order);
  const shipping = getAdminShippingStatus(order);
  return shipping === 'cancelled' ||
    ['cancelled', 'rejected'].includes(payment) ||
    ['cancelled', 'canceled', 'cancelado', 'payment_failed', 'pagamento não realizado'].includes(legacy);
}

export function isAdminOrderPaid(order: any): boolean {
  return getOrderPaidAmount(order) > 0;
}

export function isAdminPaymentPending(order: any): boolean {
  if (isAdminOrderCancelled(order)) return false;
  return getOrderPendingAmount(order) > 0;
}

export function isAdminOrderShipped(order: any): boolean {
  return ['shipped', 'in_transit'].includes(getAdminShippingStatus(order));
}

export function isAdminOrderDelivered(order: any): boolean {
  return getAdminShippingStatus(order) === 'delivered';
}

export function isAdminOrderInProduction(order: any): boolean {
  if (!isAdminOrderPaid(order) || isAdminOrderCancelled(order)) return false;
  const shipping = getAdminShippingStatus(order);
  if (['shipped', 'in_transit', 'delivered', 'returned'].includes(shipping)) return false;
  const stage = getAdminProductionStage(order);
  return stage.id !== 'completed';
}

export function matchesAdminStatusFilter(order: any, filter: string): boolean {
  if (!filter || filter === 'all') return true;

  if (filter === 'payment_pending') return isAdminPaymentPending(order);
  if (filter === 'payment_approved') return isAdminOrderInProduction(order);
  if (filter === 'shipped') return isAdminOrderShipped(order) || isAdminOrderDelivered(order);
  if (filter === 'delivered') return isAdminOrderDelivered(order);
  if (filter === 'cancelled') return isAdminOrderCancelled(order);

  return getAdminProductionStage(order).id === filter;
}

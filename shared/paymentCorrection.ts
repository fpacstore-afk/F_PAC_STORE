import { getOrderPaidAmount, getOrderRefundedAmount, getOrderTotal } from './orderFinancialCore';

export function isManualReceiptOrder(order: any): boolean {
  const provider = String(order?.payment?.provider || order?.payment?.gateway || order?.paymentProvider || order?.gateway || '').trim().toLowerCase();
  const externalId = order?.payment?.providerPaymentId || order?.payment?.paymentId || order?.payment?.id || order?.providerPaymentId || order?.paymentId || order?.mercadoPagoId;
  return !!order && !externalId && !order.paymentCreationUncertain &&
    (!provider || ['manual', 'offline'].includes(provider)) &&
    !!(order.isManual === true || ['manual', 'offline'].includes(provider) || order.paymentLogs?.some((log: any) => log.recordedBy));
}

export function canCorrectRecordedPayment(order: any): boolean {
  return isManualReceiptOrder(order) &&
    !['cancelled', 'canceled', 'cancelado'].includes(String(order.status || '').toLowerCase()) &&
    getOrderTotal(order) > 0 && getOrderPaidAmount(order) > 0 && getOrderRefundedAmount(order) === 0;
}

/** A concurrency check, never a substitute for administrator authorization. */
export function paymentCorrectionRevision(order: any): string {
  return JSON.stringify([getOrderTotal(order), getOrderPaidAmount(order), getOrderRefundedAmount(order),
    order?.paymentLogs?.length || 0, order?.refundLogs?.length || 0,
    order?.paymentCorrections?.length || 0, order?.payment?.status || order?.paymentStatus || '',
    order?.paymentReceiptBasis?.eventId || '', order?.paymentCreationUncertain === true]);
}

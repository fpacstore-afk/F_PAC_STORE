import { getRecordedOrderDueDate, financialDateKey } from '../../shared/cashFlow';
import { getOrderPendingAmount, getOrderPaymentStatus } from '../../shared/orderFinancialCore.js';
export { getOrderItemCost, getOrderCogs } from '../../shared/orderCostCoverage';
export { normalizePaymentStatus, getOrderTotal, getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderNetReceived, getOrderPaymentStatus, getOrderShippingFinances, getOrderGatewayFee } from '../../shared/orderFinancialCore.js';
export { calculateOrderFinancials, calculateFinancialDRE } from '../../shared/orderResult';
/** Earliest recorded open due date; missing dates stay unknown. */
export function getOrderPaymentDueDate(order: any): Date | null {
  return getRecordedOrderDueDate(order);
}

export function isOrderPaymentOverdue(order: any): boolean {
  const pending = getOrderPendingAmount(order);
  if (pending <= 0) return false;

  const status = getOrderPaymentStatus(order);
  if (['cancelled', 'rejected', 'refunded'].includes(status)) return false;

  const dueDate = getOrderPaymentDueDate(order);
  if (!dueDate) return false;

  return financialDateKey(dueDate)! < financialDateKey(new Date())!;
}

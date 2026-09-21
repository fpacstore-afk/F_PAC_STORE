import { getDb } from "../firebase.js";
import admin from "firebase-admin";
import * as storeService from "./store.service.js";
import { sendStatusEmail } from "./email.service.js";
import { logger } from "../utils/logger.js";
import { PaymentStatus } from "../types/order.types.js";
import {
  getOrderPaidAmount,
  getOrderPaymentStatus,
  getOrderRefundedAmount,
  getOrderTotal
} from "../utils/orderFinancial.js";

/**
 * Maps Mercado Pago status to internal application status strings as requested by user.
 */
function mapMPStatusToInternal(mpStatus: string, mpDetail?: string): string {
  switch (mpStatus) {
    case 'approved':
      return 'Pagamento Aprovado';
    case 'pending':
    case 'in_process':
    case 'authorized':
      return 'Aguardando Pagamento PIX';
    case 'rejected':
    case 'cancelled':
    case 'expired':
    case 'refunded':
    case 'charged_back':
      return 'Pagamento Não Realizado';
    default:
      return 'Status do Pagamento: ' + mpStatus;
  }
}

function mapMPStatusToCanonicalPaymentStatus(mpStatus: string): PaymentStatus {
  switch (mpStatus) {
    case 'approved':
      return 'approved';
    case 'pending':
    case 'in_process':
    case 'authorized':
      return 'pending';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
    case 'expired':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    case 'charged_back':
      return 'refunded';
    default:
      return 'pending';
  }
}

const money = (value: number) => Number(value.toFixed(2));

/**
 * Converts the cumulative Mercado Pago payment resource into the canonical financial
 * snapshot stored on the order. Operational order/production/shipping fields are not
 * part of this state and must never be changed by a provider payment notification.
 */
export function deriveMercadoPagoFinancialState(order: any, paymentData: any) {
  const rawStatus = String(paymentData?.status || '').trim().toLowerCase();
  const total = getOrderTotal(order);
  const currentPaid = getOrderPaidAmount(order);
  const currentRefunded = getOrderRefundedAmount(order);
  const transactionAmount = Number(paymentData?.transaction_amount);
  const reportedRefund = Number(paymentData?.transaction_amount_refunded);
  const capturedStatus = ['approved', 'refunded', 'charged_back'].includes(rawStatus);

  let paidAmount = currentPaid;
  if (capturedStatus && Number.isFinite(transactionAmount) && transactionAmount > 0) {
    paidAmount = Math.max(currentPaid, transactionAmount);
  }

  let refundedAmount = currentRefunded;
  if (Number.isFinite(reportedRefund) && reportedRefund >= 0) {
    refundedAmount = Math.max(currentRefunded, reportedRefund);
  } else if (['refunded', 'charged_back'].includes(rawStatus) && paidAmount > 0) {
    // A terminal provider refund is authoritative even when an older API payload omits
    // transaction_amount_refunded. Preserve the capture and mark it fully refunded.
    refundedAmount = paidAmount;
  }

  if (![total, paidAmount, refundedAmount].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error('Invalid monetary values in Mercado Pago payment update');
  }
  if (refundedAmount > paidAmount + 0.005) {
    throw new Error(`Mercado Pago refund exceeds captured amount for order ${order?.id || ''}`.trim());
  }

  paidAmount = money(paidAmount);
  refundedAmount = money(refundedAmount);
  let canonicalStatus = mapMPStatusToCanonicalPaymentStatus(rawStatus);
  if (refundedAmount > 0) {
    canonicalStatus = refundedAmount + 0.005 >= paidAmount ? 'refunded' : 'partially_refunded';
  } else if (paidAmount > 0 && ['pending', 'processing', 'rejected', 'cancelled'].includes(canonicalStatus)) {
    // Never erase or contradict an existing capture because of a late/out-of-order
    // non-refund notification. Keep financial truth and flag the record for review.
    canonicalStatus = getOrderPaymentStatus(order) === 'approved' || paidAmount + 0.005 >= total
      ? 'approved'
      : 'partially_paid';
  }

  const pendingAmount = ['refunded', 'partially_refunded'].includes(canonicalStatus)
    ? 0
    : money(Math.max(0, total - paidAmount));
  const paidDelta = money(Math.max(0, paidAmount - currentPaid));
  const refundedDelta = money(Math.max(0, refundedAmount - currentRefunded));

  return {
    rawStatus,
    canonicalStatus,
    total,
    paidAmount,
    pendingAmount,
    refundedAmount,
    paidDelta,
    refundedDelta,
    paidAt: paymentData?.date_approved || order?.payment?.paidAt || order?.paidAt || null,
    refundedAt: refundedDelta > 0
      ? (paymentData?.date_last_updated || new Date().toISOString())
      : (order?.payment?.refundedAt || order?.refundedAt || null),
    requiresReview: paidAmount > 0 && ['rejected', 'cancelled'].includes(mapMPStatusToCanonicalPaymentStatus(rawStatus)),
    providerPaymentId: String(paymentData?.id || order?.payment?.providerPaymentId || '')
  };
}

function getShippingStatus(order: any): string {
  return String(order?.shipping?.status || order?.shippingStatus || '').toLowerCase();
}

function shouldReleaseReservationForPaymentStatus(order: any, canonicalStatus: PaymentStatus): boolean {
  const terminalWithoutSale = ['rejected', 'cancelled', 'refunded'].includes(canonicalStatus);
  const shippingStatus = getShippingStatus(order);
  const physicalStockAlreadyConsumed = ['shipped', 'in_transit', 'delivered'].includes(shippingStatus);
  return terminalWithoutSale && !physicalStockAlreadyConsumed;
}

/**
 * A failed/cancelled/expired/refunded payment may already have updated the order before the
 * reservation release executes. Keep the acknowledgement separate so a webhook retry
 * can safely retry only the missing inventory side effect.
 */
async function ensurePendingStockReversion(orderId: string) {
  const db = getDb();
  const orderRef = db.collection('orders').doc(orderId);
  const finalOrderSnap = await orderRef.get();
  if (!finalOrderSnap.exists) return null;
  const finalOrder = finalOrderSnap.data()!;

  if (finalOrder.stockReverted && !finalOrder.stockRevertedAcknowledged) {
    await storeService.releaseStockReservation(
      orderId,
      finalOrder.items || [],
      `payment_pipe_${orderId}_release`
    );
    await orderRef.update({
      stockRevertedAcknowledged: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  return finalOrder;
}

/**
 * Unified pipeline to process payment updates for both Card and PIX.
 * Ensures idempotency and consistent side-effects.
 */
export async function processPaymentUpdate(orderId: string, paymentData: any) {
  const db = getDb();
  const orderRef = db.collection('orders').doc(orderId);

  try {
    // 1. Transaction context for consistency
    const wasUpdated = await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) {
        throw new Error(`Order ${orderId} not found`);
      }

      const order = orderDoc.data()!;
      const mpStatus = paymentData.status;
      const mpStatusDetail = paymentData.status_detail;
      const newStatusSlug = mapMPStatusToInternal(mpStatus, mpStatusDetail);
      const financial = deriveMercadoPagoFinancialState(order, paymentData);
      const canonicalPaymentStatus = financial.canonicalStatus;
      const shouldReleaseHeldReservation = shouldReleaseReservationForPaymentStatus(order, canonicalPaymentStatus);

      // Financial integrity: an approved payment must match the order total.
      if (mpStatus === 'approved') {
        const expectedAmount = financial.total;
        const receivedAmount = Number(paymentData.transaction_amount);

        if (
          !Number.isFinite(expectedAmount) ||
          expectedAmount <= 0 ||
          !Number.isFinite(receivedAmount) ||
          receivedAmount <= 0 ||
          Math.round(expectedAmount * 100) !== Math.round(receivedAmount * 100)
        ) {
          throw new Error(`Payment amount mismatch for order ${orderId}`);
        }
      }

      // Payment identity integrity: once approved, the order is bound to that provider payment.
      const currentProviderPaymentId = String(order.payment?.providerPaymentId || '');
      const incomingProviderPaymentId = String(paymentData.id || '');

      if (
        getOrderPaymentStatus(order) === 'approved' &&
        currentProviderPaymentId &&
        incomingProviderPaymentId !== currentProviderPaymentId
      ) {
        throw new Error(`Payment identity mismatch for order ${orderId}`);
      }

      // 2. Idempotency and Skip No-Op Updates. Pending stock reversion is handled
      // after the transaction even for a no-op payment replay. A legacy/refund replay
      // may also repair a missing stock-reversion acknowledgement.
      const sameFinancialSnapshot =
        getOrderPaymentStatus(order) === canonicalPaymentStatus &&
        Math.abs(getOrderPaidAmount(order) - financial.paidAmount) < 0.005 &&
        Math.abs(getOrderRefundedAmount(order) - financial.refundedAmount) < 0.005 &&
        String(order.payment?.providerPaymentId || '') === financial.providerPaymentId &&
        String(order.status_pagamento || '') === String(mpStatus || '');
      if (sameFinancialSnapshot) {
        if (shouldReleaseHeldReservation && (!order.stockReverted || !order.stockRevertedAcknowledged)) {
          transaction.update(orderRef, {
            stockReverted: true,
            stockRevertedAcknowledged: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          logger.info(`📦 [PAYMENT-PIPE] Repairing pending stock reversion for ${orderId} (${mpStatus})`);
          return true;
        }
        logger.info(`⏹️ [PAYMENT-PIPE] Skipping redundant update for ${orderId} (${mpStatus})`);
        return false;
      }

      logger.info(`✨ [PAYMENT-PIPE] Updating financial state for ${orderId}: ${getOrderPaymentStatus(order)} -> ${canonicalPaymentStatus} (${mpStatus})`);

      // 3. Status History Entry
      const timestamp = paymentData.date_last_updated || new Date().toISOString();
      const historyEntries: any[] = [{
        type: 'provider_payment_update',
        status: canonicalPaymentStatus,
        legacyLabel: newStatusSlug,
        mpStatus: mpStatus,
        mpDetail: mpStatusDetail,
        timestamp,
        message: `Atualização via Mercado Pago: ${mpStatus}`
      }];
      if (financial.paidDelta > 0) historyEntries.push({
        type: 'payment_provider_capture', financialType: 'payment_approved',
        eventId: `mp_capture_${financial.providerPaymentId}_${financial.paidAmount}`,
        amount: financial.paidDelta, status: canonicalPaymentStatus,
        timestamp: financial.paidAt || timestamp, message: 'Valor capturado pelo Mercado Pago'
      });
      if (financial.refundedDelta > 0) historyEntries.push({
        type: 'payment_provider_refund', financialType: canonicalPaymentStatus === 'refunded' ? 'refund' : 'partial_refund',
        eventId: `mp_refund_${financial.providerPaymentId}_${financial.refundedAmount}`,
        amount: financial.refundedDelta, status: canonicalPaymentStatus,
        timestamp: financial.refundedAt || timestamp, message: 'Estorno registrado pelo Mercado Pago'
      });

      const updatePayload: any = {
        paymentStatus: canonicalPaymentStatus,
        paymentDetail: mpStatusDetail,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastPaymentUpdate: admin.firestore.FieldValue.serverTimestamp(),
        status_pagamento: mpStatus,
        history: admin.firestore.FieldValue.arrayUnion(...historyEntries),

        // Canonical Payment Sub-Object updates
        'payment.status': canonicalPaymentStatus,
        'payment.providerStatus': mpStatus,
        'payment.providerPaymentId': financial.providerPaymentId,
        'payment.paidAmount': financial.paidAmount,
        'payment.pendingAmount': financial.pendingAmount,
        'payment.refundedAmount': financial.refundedAmount,
        'payment.paidAt': financial.paidAt,
        amountPaid: financial.paidAmount,
        balanceDue: financial.pendingAmount,
        refundedAmount: financial.refundedAmount,
        financialReviewRequired: financial.requiresReview
      };

      if (financial.refundedAt) updatePayload['payment.refundedAt'] = financial.refundedAt;
      if (financial.paidDelta > 0) {
        updatePayload.paymentLogs = admin.firestore.FieldValue.arrayUnion({
          id: `mp_capture_${financial.providerPaymentId}_${financial.paidAmount}`,
          amount: financial.paidDelta,
          date: financial.paidAt || timestamp,
          status: canonicalPaymentStatus,
          method: paymentData.payment_type_id || paymentData.payment_method_id || 'Mercado Pago'
        });
      }
      if (financial.refundedDelta > 0) {
        updatePayload.refundLogs = admin.firestore.FieldValue.arrayUnion({
          id: `mp_refund_${financial.providerPaymentId}_${financial.refundedAmount}`,
          amount: financial.refundedDelta,
          date: financial.refundedAt || timestamp,
          status: canonicalPaymentStatus,
          provider: 'mercado_pago'
        });
      }

      if (paymentData.id) {
        updatePayload.mercadoPagoId = String(paymentData.id);
        updatePayload.payment_id = String(paymentData.id);
      }
      if (paymentData.payment_type_id) {
        updatePayload.payment_type_id = paymentData.payment_type_id;
      }
      if (paymentData.external_reference) {
        updatePayload.external_reference = paymentData.external_reference;
      }

      if (paymentData.date_approved) {
        updatePayload.paidAt = new Date(paymentData.date_approved);
        updatePayload.data_pagamento = paymentData.date_approved;
      }
      if (paymentData.transaction_amount) {
        updatePayload.transaction_amount = paymentData.transaction_amount;
      }
      if (paymentData.point_of_interaction) updatePayload.point_of_interaction = paymentData.point_of_interaction;

      // Release an active reservation for terminal payment states only while the order
      // has not physically shipped. After shipment, physical returns control restocking.
      if (shouldReleaseHeldReservation && !order.stockRevertedAcknowledged) {
        logger.info(`📦 [PAYMENT-PIPE] Scheduling stock reversion for ${orderId} due to ${mpStatus}`);
        updatePayload.stockReverted = true;
        updatePayload.stockRevertedAcknowledged = false;
      }

      transaction.update(orderRef, updatePayload);
      return true;
    });

    // 5. Inventory side-effect is mandatory. If it fails, propagate the error so the
    // Mercado Pago webhook returns 500 and retries. A replay also reaches this path,
    // allowing an unacknowledged release to recover after a transient Firestore error.
    const finalOrder = await ensurePendingStockReversion(orderId);

    if (!wasUpdated) {
      return { success: true, status: 'unchanged', idempotent: true };
    }

    // 6. Notification side-effects are intentionally non-critical to stock/payment truth.
    if (finalOrder?.paymentStatus === 'approved') {
      await sendStatusEmail(orderId, 'payment_approved').catch(e => logger.warn(`[EMAIL-ERR] ${e.message}`));

      try {
        const { handleRecoveredCheckout, sendWhatsAppMessage } = await import('./automation.service.js');
        await handleRecoveredCheckout(finalOrder.customerEmail || '', finalOrder.checkout_session_id || undefined);
        if (finalOrder.customerPhone) {
          await sendWhatsAppMessage(finalOrder.customerPhone, 'payment_approved', finalOrder);
        }
      } catch (autoErr: any) {
        logger.warn(`⚠️ [AUTOMATION-TRIGGER-ERR] Failed payment_approved automations: ${autoErr.message}`);
      }
    } else if (finalOrder && ['rejected', 'cancelled', 'refunded'].includes(finalOrder.paymentStatus)) {
      await sendStatusEmail(orderId, 'cancelled').catch(e => logger.warn(`[EMAIL-ERR] ${e.message}`));
    }

    return { success: true, status: mapMPStatusToInternal(paymentData.status, paymentData.status_detail) };

  } catch (error: any) {
    logger.error(`❌ [PAYMENT-PIPE] Error processing update for ${orderId}`, error);
    throw error;
  }
}

export async function autoCancelUnpaidOrders() {
  const db = getDb();
  const loggerPrefix = "🕒 [AUTO-CANCEL-24H]";
  logger.info(`${loggerPrefix} Iniciando varredura de pedidos pendentes com mais de 24h...`);

  try {
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    const pendingStatuses = ['received', 'Aguardando Pagamento PIX', 'payment_pending'];

    const snapshot = await db.collection('orders')
      .where('status', 'in', pendingStatuses)
      .limit(50)
      .get();

    if (snapshot.empty) {
      logger.info(`${loggerPrefix} Nenhum pedido pendente encontrado.`);
      return;
    }

    for (const doc of snapshot.docs) {
      const order = doc.data();
      const orderId = doc.id;

      let createdAtMs = 0;
      if (order.createdAt) {
        if (typeof order.createdAt.toMillis === 'function') {
          createdAtMs = order.createdAt.toMillis();
        } else if (order.createdAt.seconds) {
          createdAtMs = order.createdAt.seconds * 1000;
        } else {
          createdAtMs = new Date(order.createdAt).getTime();
        }
      }

      if (createdAtMs > 0 && createdAtMs < twentyFourHoursAgo) {
        logger.info(`${loggerPrefix} Cancelando pedido expirado ${orderId}`);
        if (Array.isArray(order.items) && order.items.length > 0) {
          await storeService.releaseStockReservation(orderId, order.items, `autocancel_${orderId}`);
        }
        await storeService.updateOrderPaymentSnapshot(orderId, 'cancelled', {
          stockReverted: true,
          stockRevertedAcknowledged: true
        });
      }
    }
  } catch (err: any) {
    if (err?.code === 8 || err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('Quota limit exceeded')) {
      logger.warn(`${loggerPrefix} ⚠️ Limite de cota do Firestore atingido. Varredura suspensa temporariamente até a renovação da cota.`);
    } else {
      logger.error(`${loggerPrefix} Erro ao cancelar pedidos pendentes: ${err.message}`);
    }
  }
}

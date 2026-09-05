import { getDb } from "../firebase.js";
import admin from "firebase-admin";
import * as storeService from "./store.service.js";
import { sendStatusEmail } from "./email.service.js";
import { logger } from "../utils/logger.js";
import { PaymentStatus } from "../types/order.types.js";

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

/**
 * A failed/cancelled/expired payment may already have updated the order before the
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
      const canonicalPaymentStatus = mapMPStatusToCanonicalPaymentStatus(mpStatus);

      // Financial integrity: an approved payment must match the order total.
      if (mpStatus === 'approved') {
        const expectedAmount = Number(order.total);
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
        order.paymentStatus === 'approved' &&
        currentProviderPaymentId &&
        incomingProviderPaymentId !== currentProviderPaymentId
      ) {
        throw new Error(`Payment identity mismatch for order ${orderId}`);
      }

      // 2. Idempotency and Skip No-Op Updates. Pending stock reversion is handled
      // after the transaction even for a no-op payment replay.
      if (order.paymentStatus === mpStatus && order.status === newStatusSlug) {
        logger.info(`⏹️ [PAYMENT-PIPE] Skipping redundant update for ${orderId} (${mpStatus})`);
        return false;
      }

      logger.info(`✨ [PAYMENT-PIPE] Updating ${orderId}: ${order.status} -> ${newStatusSlug} (${mpStatus})`);

      // 3. Status History Entry
      const historyEntry = {
        status: newStatusSlug,
        mpStatus: mpStatus,
        mpDetail: mpStatusDetail,
        timestamp: new Date().toISOString(),
        message: `Atualização via Mercado Pago: ${mpStatus}`
      };

      const paidAmount = mpStatus === 'approved' ? (paymentData.transaction_amount || order.total || 0) : 0;
      const pendingAmount = mpStatus === 'approved' ? 0 : (order.total || 0);

      const updatePayload: any = {
        status: newStatusSlug,
        paymentStatus: mpStatus,
        paymentDetail: mpStatusDetail,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastPaymentUpdate: admin.firestore.FieldValue.serverTimestamp(),
        status_pedido: mpStatus === 'approved' ? 'pago' : order.status_pedido || 'aguardando',
        status_pagamento: mpStatus,
        history: admin.firestore.FieldValue.arrayUnion(historyEntry),

        // Canonical Payment Sub-Object updates
        'payment.status': canonicalPaymentStatus,
        'payment.providerPaymentId': String(paymentData.id || ''),
        'payment.paidAmount': paidAmount,
        'payment.pendingAmount': pendingAmount,
        'payment.paidAt': paymentData.date_approved || null
      };

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

      // 4. Side Effects Logic
      if (mpStatus === 'approved' && order.status !== 'Pagamento Aprovado') {
        logger.info(`✅ [PAYMENT-PIPE] Order ${orderId} APPROVED - Auto-advancing workflow`);
        updatePayload.status = 'Pagamento Aprovado';
      }

      // Release reservation later if a payment that held stock failed before shipment.
      const isFailed = ['rejected', 'cancelled', 'expired'].includes(mpStatus);
      const wasNotAlreadyCancelled = order.status !== 'Pagamento Não Realizado';

      if (isFailed && wasNotAlreadyCancelled) {
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
    } else if (finalOrder && ['rejected', 'cancelled', 'expired'].includes(finalOrder.paymentStatus)) {
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
        await storeService.updateOrderStatus(orderId, 'Pagamento Não Realizado', {
          paymentStatus: 'cancelled',
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

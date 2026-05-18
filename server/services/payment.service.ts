
import { getDb } from "../firebase.js";
import admin from "firebase-admin";
import * as storeService from "./store.service.js";
import { sendStatusEmail } from "./email.service.js";
import { logger } from "../utils/logger.js";

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

/**
 * Unified pipeline to process payment updates for both Card and PIX.
 * Ensures idempotency and consistent side-effects.
 */
export async function processPaymentUpdate(orderId: string, paymentData: any) {
  const db = getDb();
  const orderRef = db.collection('orders').doc(orderId);

  try {
    // 1. Transaction context for consistency
    await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) {
        throw new Error(`Order ${orderId} not found`);
      }

      const order = orderDoc.data()!;
      const mpStatus = paymentData.status;
      const mpStatusDetail = paymentData.status_detail;
      const newStatusSlug = mapMPStatusToInternal(mpStatus, mpStatusDetail);

      // 2. Idempotency and Skip No-Op Updates
      if (order.paymentStatus === mpStatus && order.status === newStatusSlug) {
        logger.info(`⏹️ [PAYMENT-PIPE] Skipping redundant update for ${orderId} (${mpStatus})`);
        return;
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

      const updatePayload: any = {
        status: newStatusSlug,
        paymentStatus: mpStatus,
        paymentDetail: mpStatusDetail,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastPaymentUpdate: admin.firestore.FieldValue.serverTimestamp(),
        // Support for requested field names
        status_pedido: mpStatus === 'approved' ? 'pago' : order.status_pedido || 'aguardando',
        status_pagamento: mpStatus,
        history: admin.firestore.FieldValue.arrayUnion(historyEntry)
      };

      // Add specific fields if available
      if (paymentData.id) updatePayload.mercadoPagoId = String(paymentData.id);
      if (paymentData.date_approved) {
        updatePayload.paidAt = new Date(paymentData.date_approved);
        updatePayload.data_pagamento = paymentData.date_approved; // Human friendly copy if needed
      }
      if (paymentData.transaction_amount) {
        updatePayload.transaction_amount = paymentData.transaction_amount;
      }
      if (paymentData.point_of_interaction) updatePayload.point_of_interaction = paymentData.point_of_interaction;

      // 4. Side Effects Logic
      
      // Approved: Ensure it was not already approved
      if (mpStatus === 'approved' && order.status !== 'Pagamento Aprovado') {
        logger.info(`✅ [PAYMENT-PIPE] Order ${orderId} APPROVED - Auto-advancing workflow`);
        // Force the display status to the expected one in management panel
        updatePayload.status = 'Pagamento Aprovado';
      }

      // Revert Stock: If order was previously subtracted and now is cancelled/expired/rejected
      const isFailed = ['rejected', 'cancelled', 'expired'].includes(mpStatus);
      const wasNotAlreadyCancelled = order.status !== 'Pagamento Não Realizado';

      if (isFailed && wasNotAlreadyCancelled) {
        logger.info(`📦 [PAYMENT-PIPE] Reverting stock for ${orderId} due to ${mpStatus}`);
        // We can't call adjustStock inside runTransaction because it uses batches/it's async.
        // We'll mark a flag to run it after the transaction.
        updatePayload.stockReverted = true;
      }

      transaction.update(orderRef, updatePayload);
    });

    // 5. Post-transaction async side-effects (Stock Reversion & Emails)
    const finalOrderSnap = await orderRef.get();
    const finalOrder = finalOrderSnap.data()!;

    if (finalOrder.stockReverted && !finalOrder.stockRevertedAcknowledged) {
      await storeService.adjustStock(finalOrder.items || [], 'add');
      await orderRef.update({ stockRevertedAcknowledged: true });
    }

    // Send Emails based on status change
    if (finalOrder.paymentStatus === 'approved') {
      await sendStatusEmail(orderId, 'payment_approved');
    } else if (['rejected', 'cancelled', 'expired'].includes(finalOrder.paymentStatus)) {
      await sendStatusEmail(orderId, 'cancelled');
    }

    return { success: true, status: finalOrder.status };

  } catch (error: any) {
    logger.error(`❌ [PAYMENT-PIPE] Error processing update for ${orderId}`, error);
    throw error;
  }
}

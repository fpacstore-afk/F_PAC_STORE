
import { Request, Response } from 'express';
import crypto from 'crypto';
import { mpService } from '../services/mp.service';
import * as storeService from '../services/store.service';
import { sendStatusEmail } from '../services/email.service';
import { logger } from '../utils/logger';

export async function handleWebhook(req: Request, res: Response) {
  const paymentId = req.query.id || req.body.data?.id;
  const type = req.query.topic || req.body.type;

  logger.info(`🔔 [WEBHOOK] Received notification: ${type} for ID: ${paymentId}`);

  // 1. Signature Validation (PCI & Protection)
  const xSignature = req.headers['x-signature'] as string;
  const xRequestId = req.headers['x-request-id'] as string;
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  if (secret && xSignature && xRequestId && paymentId) {
    try {
      const parts = xSignature.split(',');
      const tsPart = parts.find(p => p.startsWith('ts='));
      const v1Part = parts.find(p => p.startsWith('v1='));
      
      if (tsPart && v1Part) {
        const ts = tsPart.split('=')[1];
        const v1 = v1Part.split('=')[1];
        const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts};`;
        const calculatedHash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
        
        if (calculatedHash !== v1) {
          logger.warn(`⚠️ [WEBHOOK] INVALID SIGNATURE ATTEMPT for payment ${paymentId}`);
          return res.status(401).send("Unauthorized");
        }
        logger.info(`✅ [WEBHOOK] Signature verified for payment ${paymentId}`);
      }
    } catch (err) {
      logger.error("Webhook signature verification exception", err);
    }
  }

  // 2. Process relevant updates
  if (type === 'payment' && paymentId) {
    try {
      const mpPayment = await mpService.getPayment(String(paymentId));
      const orderId = mpPayment.external_reference;

      if (orderId) {
        // Fetch current order state from DB
        const db = require('../firebase').getDb();
        const orderSnap = await db.collection('orders').doc(orderId).get();
        
        if (orderSnap.exists) {
          const currentOrder = orderSnap.data();
          const mpStatus = mpPayment.status;
          
          logger.info(`🔄 [WEBHOOK] Order ${orderId} (DB status: ${currentOrder.status}) -> MP status: ${mpStatus}`);

          // Transition Logic
          if (mpStatus === 'approved' && currentOrder.status !== 'payment_approved') {
            await storeService.updateOrderStatus(orderId, 'payment_approved', {
              paymentStatus: 'approved',
              paidAt: new Date()
            });
            await sendStatusEmail(orderId, 'payment_approved');
          } 
          else if (['rejected', 'cancelled'].includes(mpStatus || '') && currentOrder.status !== 'cancelled') {
            await storeService.updateOrderStatus(orderId, 'cancelled', {
              paymentStatus: mpStatus,
              cancelledAt: new Date(),
              rejectionReason: mpPayment.status_detail
            });
            // Revert stock
            await storeService.adjustStock(currentOrder.items || [], 'add');
            await sendStatusEmail(orderId, 'cancelled');
          }
        } else {
          logger.warn(`⚠️ [WEBHOOK] Order ID ${orderId} from MP not found in database`);
        }
      }
    } catch (err: any) {
      logger.error("Error processing webhook payment info", { message: err.message });
      // Return 500 so MP retries
      return res.status(500).send("Internal processing error");
    }
  }

  // Always return 200 for notifications we acknowledge
  return res.status(200).send("OK");
}

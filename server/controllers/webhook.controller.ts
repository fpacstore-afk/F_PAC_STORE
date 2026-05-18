
import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../firebase.js';
import { mpService } from '../services/mp.service.js';
import * as storeService from '../services/store.service.js';
import { sendStatusEmail } from '../services/email.service.js';
import { logger } from '../utils/logger.js';

export async function handleWebhook(req: Request, res: Response) {
  const paymentId = req.query.id || req.body.data?.id;
  const type = req.query.topic || req.body.type || req.body.action;

  logger.info(`🔔 [WEBHOOK] START - Type: ${type}, ID: ${paymentId}`);
  logger.info(`📦 [WEBHOOK] RAW BODY: ${JSON.stringify(req.body).substring(0, 500)}`);

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
  const isPaymentUpdate = 
    type === 'payment' || 
    type === 'payment.updated' || 
    type === 'payment.created' || 
    (typeof req.body.action === 'string' && req.body.action.startsWith('payment'));

  if (isPaymentUpdate && paymentId) {
    logger.info(`🎯 [WEBHOOK] Processing payment update - ID: ${paymentId}, Type: ${type}`);
    try {
      const mpPayment = await mpService.getPayment(String(paymentId));
      const orderId = mpPayment.external_reference;
      const status = mpPayment?.status;

      logger.info(`📊 [WEBHOOK] Mercado Pago Status for Payment ${paymentId}: ${status}`);

      if (orderId) {
        logger.info(`🔄 [WEBHOOK] Associating Payment ${paymentId} with Order ${orderId}`);
        
        const { processPaymentUpdate } = await import('../services/payment.service.js');
        await processPaymentUpdate(orderId, mpPayment);
        
        logger.info(`✅ [WEBHOOK] Pedido ${orderId} atualizado com sucesso via webhook`);
      } else {
        logger.warn(`⚠️ [WEBHOOK] MP Payment ${paymentId} has no external_reference`);
      }
    } catch (err: any) {
      logger.error("❌ [WEBHOOK_ERROR] Error processing payment info", { 
        id: paymentId,
        message: err.message 
      });
      // Return 500 so MP retries if it's a transient failure
      return res.status(500).send("Internal processing error");
    }
  }

  // Always return 200 for notifications we acknowledge
  return res.status(200).send("OK");
}

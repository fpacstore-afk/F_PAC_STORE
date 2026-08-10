import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../firebase.js';
import { mpService } from '../services/mp.service.js';
import { logger } from '../utils/logger.js';

export async function handleWebhook(req: Request, res: Response) {
  const paymentId = req.query.id || req.body.data?.id;
  const type = req.query.topic || req.body.type || req.body.action;

  logger.info(`🔔 [WEBHOOK] START - Type: ${type}, ID: ${paymentId}`);

  if (!paymentId) {
    return res.status(200).send("OK (Ignored - No ID)");
  }

  // 1. Signature Validation (PCI & Mandatory Security Rule)
  const xSignature = req.headers['x-signature'] as string;
  const xRequestId = req.headers['x-request-id'] as string;
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  if (!secret) {
    logger.error(`❌ [WEBHOOK-BLOCKED] MERCADO_PAGO_WEBHOOK_SECRET não configurado nas variáveis de ambiente do servidor.`);
    return res.status(500).send("Server Configuration Error - Webhook secret not configured");
  }

  if (!xSignature || !xRequestId) {
    logger.warn(`⚠️ [WEBHOOK-BLOCKED] Webhook sem cabeçalhos de assinatura obrigatórios (x-signature/x-request-id) para o pagamento ${paymentId}`);
    return res.status(401).send("Unauthorized - Signature headers missing");
  }

  try {
    const parts = xSignature.split(',');
    const tsPart = parts.find(p => p.startsWith('ts='));
    const v1Part = parts.find(p => p.startsWith('v1='));
    
    if (!tsPart || !v1Part) {
      logger.warn(`⚠️ [WEBHOOK-BLOCKED] Formato de assinatura inválido para pagamento ${paymentId}`);
      return res.status(401).send("Unauthorized - Invalid signature format");
    }

    const ts = tsPart.split('=')[1];
    const v1 = v1Part.split('=')[1];

    // Proteção contra Replay Attack (valida janela máxima de 10 minutos)
    const reqTimestamp = parseInt(ts, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (isNaN(reqTimestamp) || Math.abs(currentTimestamp - reqTimestamp) > 600) {
      logger.warn(`⚠️ [WEBHOOK-BLOCKED] Replay attack detectado. Assinatura antiga expirada (${ts}) para pagamento ${paymentId}`);
      return res.status(401).send("Unauthorized - Stale timestamp");
    }

    const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts};`;
    const calculatedHash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    
    if (calculatedHash !== v1) {
      logger.warn(`⚠️ [WEBHOOK-BLOCKED] ASSINATURA INVÁLIDA para pagamento ${paymentId}`);
      return res.status(401).send("Unauthorized - Signature mismatch");
    }

    logger.info(`✅ [WEBHOOK] Assinatura HMAC verificada com sucesso para pagamento ${paymentId}`);
  } catch (err: any) {
    logger.error("❌ [WEBHOOK-SIGNATURE-ERR] Exceção durante verificação de assinatura:", err.message);
    return res.status(401).send("Unauthorized - Verification error");
  }

  // 2. Proteção contra Idempotência (Evita reprocessamento duplicado do mesmo evento)
  const db = getDb();
  const webhookEventRef = db.collection('webhook_events').doc(String(paymentId));
  
  try {
    const eventSnap = await webhookEventRef.get();
    if (eventSnap.exists) {
      const eventData = eventSnap.data();
      if (eventData?.status === 'completed') {
        logger.info(`🔁 [WEBHOOK-IDEMPOTENCY] Evento ${paymentId} já foi processado anteriormente. Retornando 200 OK.`);
        return res.status(200).send("OK (Already Processed)");
      }
    }
  } catch (idempErr: any) {
    logger.warn(`⚠️ [WEBHOOK-IDEMPOTENCY-WARN] Erro ao checar idempotência no Firestore: ${idempErr.message}`);
  }

  // 3. Processamento do evento de pagamento
  const isPaymentUpdate = 
    type === 'payment' || 
    type === 'payment.updated' || 
    type === 'payment.created' || 
    (typeof req.body.action === 'string' && req.body.action.startsWith('payment'));

  if (isPaymentUpdate) {
    logger.info(`🎯 [WEBHOOK] Processando atualização de pagamento - ID: ${paymentId}, Type: ${type}`);
    try {
      const mpPayment = await mpService.getPayment(String(paymentId));
      const orderId = mpPayment?.external_reference;
      const status = mpPayment?.status;

      logger.info(`📊 [WEBHOOK] Status no Mercado Pago para Pagamento ${paymentId}: ${status}`);

      if (orderId) {
        logger.info(`🔄 [WEBHOOK] Associando Pagamento ${paymentId} ao Pedido ${orderId}`);
        
        const { processPaymentUpdate } = await import('../services/payment.service.js');
        await processPaymentUpdate(orderId, mpPayment);
        
        // Marca evento como processado com sucesso para garantir idempotência
        await webhookEventRef.set({
          paymentId: String(paymentId),
          orderId,
          status,
          processedAt: new Date().toISOString(),
          status_detail: mpPayment?.status_detail || null
        }, { merge: true });

        logger.info(`✅ [WEBHOOK] Pedido ${orderId} atualizado com sucesso via webhook`);
      } else {
        logger.warn(`⚠️ [WEBHOOK] MP Payment ${paymentId} não possui external_reference de pedido.`);
      }
    } catch (err: any) {
      logger.error("❌ [WEBHOOK_ERROR] Erro ao processar informações do pagamento", { 
        id: paymentId,
        message: err.message 
      });
      // Retorna 500 para o Mercado Pago tentar reenviar no futuro caso seja erro transitório
      return res.status(500).send("Internal processing error");
    }
  }

  return res.status(200).send("OK");
}

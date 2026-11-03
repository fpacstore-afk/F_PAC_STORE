import { WebhookSignatureValidator } from 'mercadopago';
import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../firebase.js';
import { mpService } from '../services/mp.service.js';
import { logger } from '../utils/logger.js';

export async function handleWebhook(req: Request, res: Response) {
  const rawId = req.query['data.id'] ?? req.query.id ?? req.body?.data?.id;
  const paymentId = typeof rawId === 'number' && Number.isSafeInteger(rawId) ? String(rawId) : rawId;
  if (paymentId != null && (typeof paymentId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(paymentId))) {
    return res.status(400).send('Invalid notification identifier');
  }
  const type = req.query.topic || req.query.type || req.body?.type || req.body?.action;

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

  if (typeof xSignature !== 'string' || typeof xRequestId !== 'string' || !xSignature || !xRequestId) {
    logger.warn(`⚠️ [WEBHOOK-BLOCKED] Webhook sem cabeçalhos de assinatura obrigatórios (x-signature/x-request-id) para o pagamento ${paymentId}`);
    return res.status(401).send("Unauthorized - Signature headers missing");
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature, xRequestId, dataId: paymentId, secret,
      toleranceSeconds: 600,
    });
    logger.info(`✅ [WEBHOOK] Assinatura HMAC verificada com sucesso para pagamento ${paymentId}`);
  } catch (err: any) {
    logger.error("❌ [WEBHOOK-SIGNATURE-ERR] Exceção durante verificação de assinatura:", err.message);
    return res.status(401).send("Unauthorized - Verification error");
  }

  // 2. Idempotência por EVENTO, não por pagamento.
  // O mesmo paymentId pode receber vários eventos legítimos ao longo do ciclo de vida
  // (pending -> approved, approved -> refunded). O x-request-id identifica a entrega
  // específica; um hash evita caracteres inválidos em IDs de documento Firestore.
  const db = getDb();
  const webhookEventId = crypto
    .createHash('sha256')
    .update(`${String(paymentId)}:${xRequestId}`)
    .digest('hex');
  const webhookEventRef = db.collection('webhook_events').doc(webhookEventId);
  
  try {
    const eventSnap = await webhookEventRef.get();
    if (eventSnap.exists) {
      const eventData = eventSnap.data();
      if (eventData?.processingStatus === 'completed') {
        logger.info(`🔁 [WEBHOOK-IDEMPOTENCY] Evento ${webhookEventId} do pagamento ${paymentId} já foi processado. Retornando 200 OK.`);
        return res.status(200).send("OK (Already Processed)");
      }
    }
  } catch (idempErr: any) {
    // Falha ao consultar idempotência não pode ser tratada como sucesso silencioso.
    // Retornar 500 força retry do provedor em vez de arriscar perda de atualização financeira.
    logger.error(`❌ [WEBHOOK-IDEMPOTENCY] Erro ao checar idempotência no Firestore: ${idempErr.message}`);
    return res.status(500).send("Idempotency check failed");
  }

  // 3. Processamento do evento de pagamento
  const isPaymentUpdate = 
    type === 'payment' || 
    type === 'payment.updated' || 
    type === 'payment.created' || 
    (typeof req.body?.action === 'string' && req.body.action.startsWith('payment'));

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
        
        // Marca esta ENTREGA específica como concluída. paymentStatus é armazenado
        // separadamente para não conflitar com o marcador operacional de idempotência.
        await webhookEventRef.set({
          eventId: webhookEventId,
          requestId: xRequestId,
          paymentId: String(paymentId),
          orderId,
          processingStatus: 'completed',
          paymentStatus: status || null,
          eventType: String(type || ''),
          processedAt: new Date().toISOString(),
          status_detail: mpPayment?.status_detail || null
        }, { merge: true });

        logger.info(`✅ [WEBHOOK] Pedido ${orderId} atualizado com sucesso via webhook`);
      } else {
        logger.warn(`⚠️ [WEBHOOK] MP Payment ${paymentId} não possui external_reference de pedido.`);
        // Sem vínculo com pedido, não marcamos como concluído para permitir investigação/retry.
        return res.status(500).send("Payment without external_reference");
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

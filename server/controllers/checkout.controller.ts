
import { Request, Response } from 'express';
import { mpService } from '../services/mp.service.js';
import * as storeService from '../services/store.service.js';
import { sendStatusEmail, sendOrderReceivedEmail } from '../services/email.service.js';
import { logger } from '../utils/logger.js';

/**
 * Controller to handle professional transparent checkout using Mercado Pago.
 * Supports PIX and Credit Card payments with robust environment checking.
 */
export async function processPayment(req: Request, res: Response) {
  const body = req.body;
  
  // 1. Data Normalization
  const transaction_amount = Number(body.amount || body.transaction_amount || 0);
  const payment_method_id = body.payment_method_id;
  const token = body.cardToken || body.token || body.id;
  const installments = Number(body.installments || 1);
  const issuer_id = body.issuer_id;
  const customerInfo = body.customerInfo;
  const items = body.items || [];

  // 2. Strict Environment Parity Check
  const pk = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY || '';
  const at = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
  
  const getMode = (val: string) => {
    if (!val) return 'EMPTY';
    const s = String(val).toUpperCase();
    if (s.startsWith('TEST-')) return 'SANDBOX';
    if (s.startsWith('APP_USR-')) return 'PRODUCTION';
    return 'UNKNOWN';
  };

  const pkMode = getMode(pk);
  const atMode = getMode(at);

  if (pkMode !== atMode && pkMode !== 'EMPTY' && atMode !== 'EMPTY') {
    logger.error("🛑 [ENV_CONFLICT] Mismatch between Public Key and Access Token", { pkMode, atMode });
    return res.status(400).json({ 
      error: "Mismatched Environment", 
      message: `Critico: Conflito de ambiente detectado. PK(${pkMode}) vs AT(${atMode}). Verifique os Secrets.`
    });
  }

  try {
    // 3. Payload Validation
    if (!transaction_amount || transaction_amount <= 0) {
      return res.status(400).json({ error: "Valor de transação inválido." });
    }

    if (!payment_method_id) {
      return res.status(400).json({ error: "Método de pagamento não especificado." });
    }

    if (payment_method_id !== 'pix' && !token) {
      return res.status(400).json({ error: "Token do cartão não encontrado para esta transação." });
    }

    const email = customerInfo?.email;
    if (!email) {
      return res.status(400).json({ error: "Email do pagador é obrigatório." });
    }

    // 4. Create Order Internal Record
    const orderId = `FPAC-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    const orderPayload = {
      id: orderId,
      userId: body.userId || null,
      customerName: customerInfo.name || 'Cliente',
      customerEmail: email,
      customerPhone: customerInfo.phone || '',
      customerCpf: customerInfo.cpf || '',
      total: transaction_amount,
      status: 'received',
      paymentStatus: 'pending',
      paymentMethodId: payment_method_id,
      paymentMethod: payment_method_id === 'pix' ? 'PIX' : 'CARTÃO DE CRÉDITO',
      items,
      address: customerInfo.address || '',
      number: customerInfo.number || '',
      complement: customerInfo.complement || '',
      neighborhood: customerInfo.neighborhood || '',
      city: customerInfo.city || '',
      state: customerInfo.state || '',
      cep: customerInfo.cep || '',
      shippingMethod: (() => {
        const cleanCep = String(customerInfo.cep || '').replace(/\D/g, '');
        if (cleanCep.length !== 8) return "Melhor Envio";
        const num = parseInt(cleanCep, 10);
        return (num >= 89200000 && num <= 89239999) ? "Entrega Local F PAC" : "Melhor Envio";
      })(),
      checkout_session_id: body.checkout_session_id || null,
      shippingAddress: customerInfo.address 
        ? `${customerInfo.address}, ${customerInfo.number || ''} ${customerInfo.complement || ''} - ${customerInfo.neighborhood || ''}, ${customerInfo.city || ''}/${customerInfo.state || ''} (CEP: ${customerInfo.cep || ''})`
        : 'Endereço não informado',
    };

    await storeService.createOrder(orderId, orderPayload);
    await storeService.adjustStock(items, 'subtract');

    // 5. Execute Charge
    const firstName = String(customerInfo.name || 'Cliente').split(' ')[0];
    const lastName = String(customerInfo.name || 'F PAC').split(' ').slice(1).join(' ') || 'F PAC';

    // Determine webhook URL dynamically if not configured
    let notificationUrl = process.env.MERCADO_PAGO_WEBHOOK_URL;
    if (!notificationUrl || notificationUrl === "") {
       const protocol = req.headers['x-forwarded-proto'] || req.protocol;
       let host = req.headers['host'] || '';
       
       // AI Studio specific: replace 'dev' with 'pre' to get the public URL for webhooks
       if (host.includes('ais-dev-')) {
         host = host.replace('ais-dev-', 'ais-pre-');
       }
       
       notificationUrl = `${protocol}://${host}/api/webhook/mercadopago`;
       logger.info(`🔗 [MP-PAY] Dynamic Public Notification URL: ${notificationUrl}`);
    }

    const mpBody: any = {
      transaction_amount: transaction_amount,
      description: `Pedido ${orderId} - FPAC Store`,
      payment_method_id,
      external_reference: orderId,
      statement_descriptor: "FPAC STORE",
      notification_url: notificationUrl,
      payer: {
        email: String(email).trim(),
        first_name: firstName.substring(0, 40),
        last_name: lastName.substring(0, 40),
        identification: {
          type: 'CPF',
          number: String(customerInfo.cpf || '').replace(/\D/g, '')
        }
      },
      additional_info: {
        items: items.map((i: any) => ({
          id: i.id || i.productId,
          title: i.name,
          quantity: Number(i.quantity),
          unit_price: Number(i.price)
        }))
      }
    };

    if (token) mpBody.token = token;
    if (installments > 0) mpBody.installments = installments;
    if (issuer_id) mpBody.issuer_id = String(issuer_id);

    // 6. Execute Charge
    logger.info(`🛰️ [MP-PAY] Iniciando cobrança ${payment_method_id}`, { orderId, amount: transaction_amount });
    const mpResult = await mpService.createPayment(mpBody, `IDEMP-${orderId}`);
    
    // 7. Sync back to DB using unified pipeline
    const { processPaymentUpdate } = await import('../services/payment.service.js');
    await processPaymentUpdate(orderId, mpResult);

    // Enviar e-mail de "Pedido Recebido" agora que temos os dados do PIX (se houver)
    sendOrderReceivedEmail(orderId).catch(err => logger.error(`[EMAIL_ERROR] Failed to send received email for ${orderId}:`, err));

    // 8. Result
    return res.status(201).json({
      id: mpResult.id,
      status: mpResult.status,
      payment_method_id: mpResult.payment_method_id,
      payment_type_id: mpResult.payment_type_id,
      external_reference: orderId,
      point_of_interaction: mpResult.point_of_interaction,
      email: email
    });

  } catch (err: any) {
    const detail = err.response?.data || err;
    logger.error("❌ [CHECKOUT_FATAL] Falha no processamento", { message: err.message, detail });
    
    return res.status(500).json({ 
      error: "Payment process failed", 
      message: err.message || "Erro inesperado no servidor."
    });
  }
}

import { Request, Response } from 'express';
import { mpService } from '../services/mp.service.js';
import * as storeService from '../services/store.service.js';
import { calculateOrderPricing } from '../services/pricing.service.js';
import { sendOrderReceivedEmail } from '../services/email.service.js';
import { logger } from '../utils/logger.js';
import { OrderCanonical } from '../types/order.types.js';
import { hashTrackingToken } from '../services/tracking.service.js';
import { checkoutAttempts, checkoutTrackingToken, validCheckoutKey } from '../services/checkoutAttempts.service.js';

export function createCheckoutControllers(deps = { mpService, storeService, calculateOrderPricing, sendOrderReceivedEmail, checkoutAttempts }) {
const { mpService, storeService, calculateOrderPricing, sendOrderReceivedEmail, checkoutAttempts } = deps;

/**
 * Controller to handle professional transparent checkout using Mercado Pago.
 * Supports PIX and Credit Card payments with robust environment checking.
 * Server-authoritative price calculation, atomic stock deduction, and canonical order structure.
 */
async function processPayment(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  const body = req.body || {};
  const key = req.headers['idempotency-key'];
  if (!validCheckoutKey(key)) return res.status(400).json({ error: 'CHECKOUT_KEY_REQUIRED', message: 'Atualize a página antes de iniciar o pagamento.' });
  const userId = res.locals.checkoutUserId || null;
  let attempt: any;
  let reservedItems: any[] = [];
  let providerSubmitted = false;
  
  // 1. Inputs Normalization
  const payment_method_id = body.payment_method_id;
  const token = body.cardToken || body.token || body.id;
  const installments = Number(body.installments || 1);
  const issuer_id = body.issuer_id;
  const customerInfo = body.customerInfo || {};
  const rawItems = body.items || [];
  const couponCode = body.couponCode || body.coupon;

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
    attempt = await checkoutAttempts.claim(key, userId);
    if (!attempt.fresh) {
      const result = await checkoutAttempts.resume(key, userId);
      return res.status('pendingConfirmation' in result && result.pendingConfirmation ? 202 : 200).json(result);
    }
    // 3. Payload Validation
    if (!payment_method_id) {
      throw new Error('Método de pagamento não especificado.');
    }

    if (payment_method_id !== 'pix' && !token) {
      throw new Error('Token do cartão não encontrado para esta transação.');
    }

    const email = customerInfo?.email;
    if (!email) {
      throw new Error('Email do pagador é obrigatório.');
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new Error('A sacola de compras está vazia.');
    }

    // 4. SERVER-AUTHORITATIVE PRICING CALCULATION
    // Completely ignores client-sent 'amount' or 'total' to prevent price manipulation
    const { pricing, verifiedItems } = await calculateOrderPricing({
      items: rawItems,
      customerInfo: {
        cep: customerInfo.cep,
        city: customerInfo.city,
        state: customerInfo.state,
        shippingServiceId: customerInfo.shippingServiceId
      },
      couponCode,
      paymentMethodId: payment_method_id
    });

    const finalTransactionAmount = pricing.total;

    if (finalTransactionAmount <= 0) {
      throw new Error('Valor total do pedido calculado é inválido.');
    }

    // 5. ATOMIC STOCK CHECK AND DEDUCTION
    const stockCheck = await storeService.checkStock(verifiedItems);
    if (!stockCheck.isAvailable) {
      throw new Error('Um dos produtos não possui estoque disponível para esta compra.');
    }

    // 6. CREATE CANONICAL ORDER STRUCTURE
    const orderId = attempt.orderId;
    
    const shippingMethodName = (() => {
      const cleanCep = String(customerInfo.cep || '').replace(/\D/g, '');
      const city = String(customerInfo.city || '').toLowerCase().trim();
      if (city === 'joinville' || (cleanCep.length === 8 && parseInt(cleanCep, 10) >= 89200000 && parseInt(cleanCep, 10) <= 89239999)) {
        return "Pedido Local";
      }
      return "Melhor Envio";
    })();

    const canonicalOrder: OrderCanonical = {
      id: orderId,
      userId: res.locals.checkoutUserId || null,
      customer: {
        name: customerInfo.name || 'Cliente',
        email,
        phone: customerInfo.phone || '',
        phone2: customerInfo.phone2 || '',
        cpf: customerInfo.cpf || '',
        address: customerInfo.address || '',
        number: customerInfo.number || '',
        complement: customerInfo.complement || '',
        neighborhood: customerInfo.neighborhood || '',
        city: customerInfo.city || '',
        state: customerInfo.state || '',
        cep: customerInfo.cep || ''
      },
      items: verifiedItems,
      pricing,
      payment: {
        status: 'pending',
        method: payment_method_id === 'pix' ? 'PIX' : 'CARTÃO DE CRÉDITO',
        methodId: payment_method_id,
        provider: 'mercadopago',
        paidAmount: 0,
        pendingAmount: finalTransactionAmount
      },
      production: {
        status: 'waiting',
        currentStage: 'Aguardando Aprovação de Pagamento'
      },
      shipping: {
        status: 'pending',
        method: shippingMethodName,
        methodName: customerInfo.shippingMethodName || shippingMethodName,
        serviceId: customerInfo.shippingServiceId !== undefined ? Number(customerInfo.shippingServiceId) : undefined
      },
      status: 'received',

      // Backward compatibility top-level fields for existing management components
      customerName: customerInfo.name || 'Cliente',
      customerEmail: email,
      customerPhone: customerInfo.phone || '',
      customerCpf: customerInfo.cpf || '',
      total: finalTransactionAmount,
      subtotal: pricing.subtotal,
      couponDiscount: pricing.couponDiscount,
      shippingFee: pricing.shipping,
      paymentStatus: 'pending',
      productionStatus: 'waiting',
      shippingStatus: 'pending',

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const trackingAccessToken = checkoutTrackingToken(key);
    const trackingAccessTokenHash = hashTrackingToken(trackingAccessToken);
    (canonicalOrder as any).trackingAccessTokenHash = trackingAccessTokenHash;

    // Save the order record and reserve stock in the SAME Firestore transaction.
    // If inventory validation fails, neither the order nor any reservation is persisted.
    await storeService.reserveStock(
      orderId,
      verifiedItems,
      `checkout_${orderId}_reserve`,
      canonicalOrder
    );
    reservedItems = verifiedItems;

    // 7. CHARGE MERCADO PAGO WITH SERVER-CALCULATED TOTAL
    const firstName = String(customerInfo.name || 'Cliente').split(' ')[0];
    const lastName = String(customerInfo.name || 'F PAC').split(' ').slice(1).join(' ') || 'F PAC';

    let notificationUrl = process.env.MERCADO_PAGO_WEBHOOK_URL;
    if (!notificationUrl || notificationUrl === "") {
       const protocol = req.headers['x-forwarded-proto'] || req.protocol;
       let host = req.headers['host'] || '';
       if (host.includes('ais-dev-')) {
         host = host.replace('ais-dev-', 'ais-pre-');
       }
       notificationUrl = `${protocol}://${host}/api/webhook/mercadopago`;
       logger.info(`🔗 [MP-PAY] Dynamic Public Notification URL: ${notificationUrl}`);
    }

    const mpBody: any = {
      transaction_amount: finalTransactionAmount,
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
        items: verifiedItems.map((i) => ({
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

    let mpResult;
    try {
      await checkoutAttempts.submitted(key, orderId);
      providerSubmitted = true;
      logger.info(`🛰️ [MP-PAY] Executando cobrança segura de R$ ${finalTransactionAmount} (${payment_method_id})`, { orderId });
      mpResult = await mpService.createPayment(mpBody, `IDEMP-${orderId}`);
    } catch (paymentErr: any) {
      // A timeout/transport error does not prove that the provider rejected the
      // payment. Keep the order and reservation; recovery only queries the provider.
      logger.warn('[CHECKOUT] Payment confirmation unresolved', { orderId });
      throw paymentErr;
    }
    
    // 8. Sync back result to DB via payment pipeline
    const response = await checkoutAttempts.complete(key, mpResult);

    sendOrderReceivedEmail(orderId).catch(err => logger.error(`[EMAIL_ERROR] Failed to send received email for ${orderId}:`, err));

    return res.status(201).json(response);

  } catch (err: any) {
    if (err.status === 403) return res.status(403).json({ error: 'FORBIDDEN', message: 'Tentativa não autorizada.' });
    if (attempt?.fresh && !providerSubmitted) {
      try {
        if (reservedItems.length) {
          const orderId = attempt.orderId, verifiedItems = reservedItems;
          await storeService.updateOrderPaymentSnapshot(orderId, 'rejected', { stockReverted: true, stockRevertedAcknowledged: false });
          await storeService.releaseStockReservation(orderId, verifiedItems, `checkout_${orderId}_release_fail`);
          await storeService.updateOrderPaymentSnapshot(orderId, 'rejected', { stockReverted: true, stockRevertedAcknowledged: true });
        }
        await checkoutAttempts.failBeforeSubmission(key);
        return res.status(400).json({ safeToRetry: true, message: 'Não foi possível iniciar o pagamento. Confira os dados e a disponibilidade dos produtos.' });
      } catch { /* An unresolved cleanup must not authorize another charge. */ }
    }
    logger.warn('[CHECKOUT] Attempt requires confirmation', { orderId: attempt?.orderId });
    return res.status(202).json({ pendingConfirmation: true, status: 'pending', message: 'Não foi possível confirmar o resultado. Consulte esta tentativa antes de pagar novamente.' });
  }
}

async function resumePayment(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  const key = req.headers['idempotency-key'];
  if (!validCheckoutKey(key)) return res.status(400).json({ error: 'INVALID_KEY' });
  try {
    const result = await checkoutAttempts.resume(key, res.locals.checkoutUserId || null);
    return res.status('pendingConfirmation' in result && result.pendingConfirmation ? 202 : 200).json(result);
  } catch (error: any) {
    if (error.status === 403) return res.status(403).json({ error: 'FORBIDDEN' });
    return res.status(202).json({ pendingConfirmation: true, status: 'pending', message: 'A confirmação ainda está indisponível. Consulte novamente em instantes.' });
  }
}
return { processPayment, resumePayment };
}
export const { processPayment, resumePayment } = createCheckoutControllers();

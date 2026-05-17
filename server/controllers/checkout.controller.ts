
import { Request, Response } from 'express';
import { mpService } from '../services/mp.service';
import * as storeService from '../services/store.service';
import { sendStatusEmail } from '../services/email.service';
import { logger } from '../utils/logger';

export async function processPayment(req: Request, res: Response) {
  const body = req.body;
  
  // Normalize fields that might come in different formats
  const transaction_amount = body.transaction_amount || body.transactionAmount;
  const payment_method_id = body.payment_method_id || body.paymentMethodId;
  const token = body.token || body.cardTokenId;
  const installments = body.installments;
  const issuer_id = body.issuer_id || body.issuerId;
  const customerInfo = body.customerInfo;
  const items = body.items;

  // 0. Environment Consistency Guardian
  const pk = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY || '';
  const at = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
  
  const getPrefix = (str: string) => str ? str.substring(0, 10).toUpperCase() : 'EMPTY';
  const getMode = (str: string) => {
    if (!str) return 'EMPTY';
    const s = String(str).toUpperCase();
    if (s.startsWith('TEST-')) return 'SANDBOX';
    if (s.startsWith('APP_USR-')) return 'PRODUCTION';
    return 'UNKNOWN';
  };

  const pkMode = getMode(pk);
  const atMode = getMode(at);

  if (pk && at && pkMode !== atMode && pkMode !== 'UNKNOWN' && atMode !== 'UNKNOWN') {
    logger.warn("⚠️ [SECURITY] Mercado Pago Credentials Mismatch detected", { 
      pkPrefix: getPrefix(pk),
      atPrefix: getPrefix(at),
      pkMode,
      atMode
    });
    // We continue but log explicitly. Blocking here might be too aggressive if env vars are messy.
  }

  // 1. Audit Request Payload
  logger.audit("New payment request received", { 
    email: customerInfo?.email || body.payer?.email, 
    amount: transaction_amount, 
    method: payment_method_id,
    hasToken: !!token
  });

  try {
    // 2. Strict Validations
    if (transaction_amount === undefined || transaction_amount === null || !payment_method_id) {
      logger.warn("Validation failed: Missing amount or method", { 
        transaction_amount, 
        payment_method_id,
        receivedPayload: body 
      });
      return res.status(400).json({ 
        error: "Missing transaction amount or payment method",
        details: {
          amountPresent: transaction_amount !== undefined,
          methodPresent: !!payment_method_id
        }
      });
    }

    if (transaction_amount <= 0) {
       logger.warn("Validation failed: Amount must be greater than zero", { transaction_amount });
       return res.status(400).json({ error: "O valor total deve ser maior que zero." });
    }

    if (payment_method_id !== 'pix' && !token) {
      logger.error("CRITICAL: Card Token missing for credit card payment", { 
        method: payment_method_id,
        bodyKeys: Object.keys(body),
        receivedBody: {
          ...body,
          token: !!body.token,
          cardTokenId: !!body.cardTokenId
        }
      });
      return res.status(400).json({ 
        error: "Card Token not found",
        message: "O token de segurança do cartão não foi enviado pelo navegador. Tente novamente ou verifique se as credenciais do Mercado Pago estão corretas."
      });
    }

    const email = customerInfo?.email || body.payer?.email;
    if (!email) {
      return res.status(400).json({ error: "Payer email is required" });
    }

    // 3. Generate Unique Order ID
    const nanoId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const orderId = `FPAC-${Date.now()}-${nanoId}`;

    // 4. Prepare Order Payload for DB
    const orderPayload = {
      id: orderId,
      userId: body.userId || null,
      customerName: customerInfo?.name || body.payer?.name || 'Cliente',
      customerEmail: email,
      customerPhone: customerInfo?.phone || '',
      customerCpf: customerInfo?.cpf || body.payer?.identification?.number || '',
      shippingAddress: customerInfo ? {
        street: customerInfo.address,
        number: customerInfo.number,
        complement: customerInfo.complement || '',
        neighborhood: customerInfo.neighborhood || '',
        city: customerInfo.city,
        state: customerInfo.state,
        zipCode: customerInfo.cep
      } : null,
      items: items || [],
      total: Number(transaction_amount),
      status: 'received',
      paymentStatus: 'pending',
      paymentMethodId: payment_method_id
    };

    // 5. Atomic database operations
    await storeService.createOrder(orderId, orderPayload);
    if (items) await storeService.adjustStock(items, 'subtract');

    // 6. Mercado Pago Payment Body Creation
    const firstName = (customerInfo?.name || body.payer?.name || 'Cliente').split(' ')[0];
    const lastName = (customerInfo?.name || body.payer?.name || 'F PAC').split(' ').slice(1).join(' ') || 'F PAC';

    const mpPaymentBody: any = {
      transaction_amount: Number(transaction_amount),
      description: `Pedido ${orderId} - FPAC Store`,
      payment_method_id: payment_method_id,
      external_reference: orderId,
      statement_descriptor: "FPAC STORE",
      notification_url: process.env.MERCADO_PAGO_WEBHOOK_URL || undefined,
      payer: {
        email: String(email).trim(),
        first_name: firstName.substring(0, 40),
        last_name: lastName.substring(0, 40),
        identification: body.payer?.identification || {
          type: 'CPF',
          number: String(customerInfo?.cpf || '').replace(/\D/g, '')
        }
      }
    };

    if (token) mpPaymentBody.token = token;
    if (installments) mpPaymentBody.installments = Number(installments);
    if (issuer_id) mpPaymentBody.issuer_id = String(issuer_id);

    // Add additional info for antifraud
    if (items) {
      mpPaymentBody.additional_info = {
        items: items.map((item: any) => ({
          id: item.id || item.productId,
          title: item.name,
          quantity: Number(item.quantity),
          unit_price: Number(item.price),
          category_id: "fashion"
        })),
        payer: {
          first_name: firstName,
          last_name: lastName,
          phone: {
            area_code: (customerInfo?.phone || '').substring(0, 2),
            number: (customerInfo?.phone || '').replace(/\D/g, '').substring(2)
          },
          address: customerInfo ? {
            zip_code: customerInfo.cep,
            street_name: customerInfo.address,
            street_number: Number(customerInfo.number) || 0
          } : undefined
        }
      };
    }

    // 7. Execute Payment with Idempotency
    const idempotencyKey = `IDEMP-${orderId}`;
    logger.info("Executing Mercado Pago charge", { orderId, idempotencyKey });
    
    const mpResult = await mpService.createPayment(mpPaymentBody, idempotencyKey);
    
    logger.info("Mercado Pago response received", { 
      status: mpResult.status, 
      paymentId: mpResult.id,
      orderId 
    });

    // 8. Update Order with final results
    const isApproved = mpResult.status === 'approved';
    await storeService.updateOrderStatus(orderId, isApproved ? 'payment_approved' : 'received', {
      mercadoPagoId: String(mpResult.id),
      paymentStatus: mpResult.status,
      point_of_interaction: mpResult.point_of_interaction || null,
      paymentMethodDetail: mpResult.payment_method || null
    });

    if (isApproved) {
      await sendStatusEmail(orderId, 'payment_approved');
    }

    // 9. Respond to client
    return res.status(201).json({
      id: mpResult.id,
      status: mpResult.status,
      external_reference: orderId,
      point_of_interaction: mpResult.point_of_interaction
    });

  } catch (err: any) {
    const errorDetails = err.response?.data || err.cause || err.errors || err.details || null;
    
    logger.error("Critical failure during payment processing", { 
      message: err.message, 
      details: errorDetails
    });
    
    return res.status(err.status || 500).json({ 
      error: "Payment process failed", 
      message: err.message || "An unexpected error occurred",
      details: errorDetails
    });
  }
}

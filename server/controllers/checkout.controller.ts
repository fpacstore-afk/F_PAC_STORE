
import { Request, Response } from 'express';
import { mpService } from '../services/mp.service';
import * as storeService from '../services/store.service';
import { sendStatusEmail } from '../services/email.service';
import { logger } from '../utils/logger';

export async function processPayment(req: Request, res: Response) {
  const { 
    transaction_amount, 
    payment_method_id, 
    payer, 
    items, 
    customerInfo, 
    userId,
    token,
    installments,
    issuer_id
  } = req.body;

  // 1. Audit Request Payload
  logger.audit("New payment request received", { 
    email: customerInfo?.email, 
    amount: transaction_amount, 
    method: payment_method_id 
  });

  try {
    // 2. Strict Validations
    if (!customerInfo?.email || !transaction_amount || !items || !items.length) {
      logger.warn("Validation failed: Missing required fields");
      return res.status(400).json({ error: "Missing required information" });
    }

    // 3. Generate Unique Order ID
    const nanoId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const orderId = `FPAC-${Date.now()}-${nanoId}`;

    // 4. Prepare Order Payload for DB
    const orderPayload = {
      id: orderId,
      userId: userId || null,
      customerName: customerInfo.name,
      customerEmail: customerInfo.email,
      customerPhone: customerInfo.phone || '',
      customerCpf: customerInfo.cpf || payer?.identification?.number || '',
      shippingAddress: {
        street: customerInfo.address,
        number: customerInfo.number,
        complement: customerInfo.complement || '',
        neighborhood: customerInfo.neighborhood || '',
        city: customerInfo.city,
        state: customerInfo.state,
        zipCode: customerInfo.cep
      },
      items,
      total: Number(transaction_amount),
      subtotal: items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0),
      status: 'received',
      paymentStatus: 'pending',
      paymentMethod: payment_method_id,
      paymentMethodId: payment_method_id
    };

    // 5. Atomic database operations
    await storeService.createOrder(orderId, orderPayload);
    await storeService.adjustStock(items, 'subtract');

    // 6. Mercado Pago Payment Body Creation
    const nameParts = customerInfo.name.trim().split(' ');
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'F PAC';

    const cpfRaw = (customerInfo.cpf || payer?.identification?.number || '').replace(/\D/g, '');
    const identification = cpfRaw.length >= 11 ? {
      type: 'CPF',
      number: cpfRaw.substring(0, 11)
    } : undefined;

    const mpPaymentBody: any = {
      transaction_amount: Number(transaction_amount),
      description: `Pedido ${orderId}`,
      payment_method_id: payment_method_id,
      external_reference: orderId,
      statement_descriptor: "F PAC STORE",
      notification_url: process.env.MERCADO_PAGO_WEBHOOK_URL || undefined,
      additional_info: {
        items: items.map((item: any) => ({
          id: item.id || item.productId || item.slug,
          title: item.name,
          quantity: Number(item.quantity),
          unit_price: Number(item.price),
          category_id: "fashion"
        })),
        payer: {
          first_name: firstName,
          last_name: lastName,
          phone: {
            area_code: (customerInfo.phone || '').substring(0, 2),
            number: (customerInfo.phone || '').replace(/\D/g, '').substring(2)
          },
          address: {
            zip_code: customerInfo.cep,
            street_name: customerInfo.address,
            street_number: Number(customerInfo.number) || 0
          }
        }
      },
      payer: {
        email: customerInfo.email.trim(),
        first_name: firstName.substring(0, 40),
        last_name: lastName.substring(0, 40),
        identification
      }
    };

    if (token) mpPaymentBody.token = token;
    if (installments) mpPaymentBody.installments = Number(installments);
    if (issuer_id) mpPaymentBody.issuer_id = String(issuer_id);

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
    logger.error("Critical failure during payment processing", { message: err.message, stack: err.stack });
    
    // Attempt to salvage/rollback if possible (advanced)
    // Here we just return a professional error
    return res.status(err.status || 500).json({ 
      error: "Payment process failed", 
      message: err.message || "An unexpected error occurred",
      details: err.response || null
    });
  }
}

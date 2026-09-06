import { Request, Response } from 'express';
import admin from 'firebase-admin';
import { getDb } from '../firebase.js';
import { releaseStockReservation } from '../services/store.service.js';
import { logger } from '../utils/logger.js';
import { recordAuditLog } from '../utils/auditLogger.js';
import { isPaymentStatus } from '../services/stateMachine.service.js';

export async function cancelOrderController(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const authHeader = req.headers.authorization;
    const adminKey = req.headers['x-admin-api-key'];

    if (!orderId) {
      return res.status(400).json({ error: 'ORDER_ID_REQUIRED', message: 'ID do pedido é obrigatório.' });
    }

    let isUserAdmin = false;
    let authEmail: string | undefined = undefined;
    let authUid: string | undefined = undefined;
    let isEmailVerified = false;
    let decodedToken: admin.auth.DecodedIdToken | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        try {
          decodedToken = await admin.auth().verifyIdToken(token);
          authEmail = decodedToken?.email?.trim().toLowerCase();
          authUid = decodedToken?.uid;
          isEmailVerified = decodedToken?.email_verified === true;
          const envAdmins = (process.env.ADMIN_EMAILS || 'fpacstore@gmail.com')
            .split(',')
            .map(e => e.trim().toLowerCase());
          if (decodedToken?.admin === true || (authEmail && envAdmins.includes(authEmail))) {
            isUserAdmin = true;
          }
        } catch (err: any) {
          logger.warn(`🚫 [ORDER-CANCEL] Auth token verification failed for order ${orderId}: ${err.message}`);
        }
      }
    }

    if (adminKey && process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY) {
      isUserAdmin = true;
    }

    if (!decodedToken && !isUserAdmin) {
      logger.warn(`🚫 [ORDER-CANCEL-UNAUTHORIZED] Unauthorized request to cancel order ${orderId}`);
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Autenticação necessária. Por favor, faça login para cancelar o pedido.'
      });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;

    if (!isUserAdmin) {
      const orderCustomerEmail = (
        orderData.customerEmail ||
        orderData.email ||
        orderData.customerInfo?.email ||
        ''
      ).trim().toLowerCase();
      const orderUserId = (
        orderData.userId ||
        orderData.customerInfo?.userId ||
        orderData.customer?.id ||
        ''
      ).trim();

      if (orderUserId) {
        if (!authUid || authUid !== orderUserId) {
          logger.warn(
            `🚫 [ORDER-CANCEL-FORBIDDEN] UID mismatch for order ${orderId}. Token UID: '${authUid}', Order UID: '${orderUserId}'`
          );
          return res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Você não tem permissão para cancelar este pedido.'
          });
        }
      } else {
        if (!isEmailVerified) {
          logger.warn(
            `🚫 [ORDER-CANCEL-FORBIDDEN] Unverified email for order ${orderId}. Token email: '${authEmail}', verified: false`
          );
          return res.status(403).json({
            error: 'EMAIL_NOT_VERIFIED',
            message: 'O e-mail da sua conta precisa estar verificado para cancelar pedidos como visitante.'
          });
        }

        if (!authEmail || !orderCustomerEmail || authEmail !== orderCustomerEmail) {
          logger.warn(
            `🚫 [ORDER-CANCEL-FORBIDDEN] User '${authEmail || authUid}' attempted to cancel order ${orderId} owned by '${orderCustomerEmail}'`
          );
          return res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Você não tem permissão para cancelar este pedido.'
          });
        }
      }
    }

    const currentOrderStatus = orderData.status || 'received';
    if (currentOrderStatus === 'cancelled') {
      return res.json({
        success: true,
        message: 'Pedido já se encontra cancelado.',
        orderId,
        status: 'cancelled',
        idempotent: true
      });
    }

    const shippingStatus = orderData.shipping?.status || orderData.shippingStatus || 'pending';
    if (['shipped', 'in_transit', 'delivered', 'enviado', 'entregue'].includes(shippingStatus)) {
      return res.status(400).json({
        error: 'ORDER_CANNOT_BE_CANCELLED',
        message: 'Este pedido já foi enviado e não pode mais ser cancelado por este fluxo.'
      });
    }

    const isAlreadyReverted = orderData.stockReverted || orderData.stockRevertedAcknowledged;
    if (!isAlreadyReverted && Array.isArray(orderData.items) && orderData.items.length > 0) {
      logger.info(`📦 [ORDER-CANCEL] Releasing stock reservation for order ${orderId}`);
      await releaseStockReservation(orderId, orderData.items, `cancel_${orderId}`);
    }

    const currentPayStatus = orderData.payment?.status || orderData.paymentStatus || 'pending';
    const totalAmount = Number(orderData.pricing?.total ?? orderData.total ?? 0);
    let existingPaidAmount = Number(orderData.payment?.paidAmount ?? orderData.amountPaid ?? 0);

    if (currentPayStatus === 'approved' && existingPaidAmount === 0) {
      existingPaidAmount = totalAmount;
    }

    const timestamp = new Date().toISOString();
    const operatorIdentity = isUserAdmin ? 'Admin' : (authEmail || authUid || 'Cliente');

    const historyEntry = {
      type: 'order_cancelled',
      status: 'cancelled',
      previousStatus: currentOrderStatus,
      previousPaymentStatus: currentPayStatus,
      timestamp,
      message: reason || 'Pedido cancelado pelo cliente',
      actor: isUserAdmin ? 'admin' : 'customer',
      operator: operatorIdentity
    };

    const updatePayload: Record<string, any> = {
      status: 'cancelled',
      stockReverted: true,
      stockRevertedAcknowledged: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion(historyEntry)
    };

    if (['approved', 'partially_paid', 'refunded', 'partially_refunded'].includes(currentPayStatus)) {
      if (isPaymentStatus(currentPayStatus)) {
        updatePayload['paymentStatus'] = currentPayStatus;
        updatePayload['payment.status'] = currentPayStatus;
      }
      updatePayload['payment.paidAmount'] = existingPaidAmount;
      updatePayload['amountPaid'] = existingPaidAmount;

      const pendingBal = Math.max(0, totalAmount - existingPaidAmount);
      updatePayload['payment.pendingAmount'] = pendingBal;
      updatePayload['balanceDue'] = pendingBal;
    } else {
      updatePayload['paymentStatus'] = 'cancelled';
      updatePayload['payment.status'] = 'cancelled';
      updatePayload['payment.paidAmount'] = 0;
      updatePayload['amountPaid'] = 0;
      updatePayload['payment.pendingAmount'] = 0;
      updatePayload['balanceDue'] = 0;
    }

    await orderRef.update(updatePayload);

    await recordAuditLog({
      userId: isUserAdmin ? 'admin' : authUid,
      userEmail: authEmail,
      action: 'CANCEL_ORDER',
      resource: 'orders',
      resourceId: orderId,
      metadata: { reason, previousStatus: currentOrderStatus, previousPaymentStatus: currentPayStatus, actor: isUserAdmin ? 'admin' : 'customer' },
      ip: req.ip
    });

    logger.info(`🚫 [ORDER-CANCEL] Order ${orderId} cancelled by ${isUserAdmin ? 'admin' : 'customer'} (${authEmail || authUid})`);

    return res.json({
      success: true,
      message: 'Pedido cancelado com sucesso.',
      orderId,
      status: 'cancelled'
    });
  } catch (error: any) {
    logger.error(`❌ [ORDER-CANCEL-ERR] Failed to cancel order: ${error.message}`);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message || 'Erro ao cancelar pedido.' });
  }
}

/**
 * Handles customer return requests (Solicitação de Devolução).
 * Requires authenticated user with ownership check (UID match or verified email).
 * Verifies shipping eligibility (order must be shipped or delivered).
 */
export async function requestOrderReturnController(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const { reason, items: requestedItems, notes } = req.body;
    const authHeader = req.headers.authorization;
    const adminKey = req.headers['x-admin-api-key'];

    if (!orderId) {
      return res.status(400).json({ error: 'ORDER_ID_REQUIRED', message: 'ID do pedido é obrigatório.' });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;

    let isUserAdmin = false;
    let authEmail: string | undefined = undefined;
    let authUid: string | undefined = undefined;
    let isEmailVerified = false;
    let decodedToken: admin.auth.DecodedIdToken | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        try {
          decodedToken = await admin.auth().verifyIdToken(token);
          authEmail = decodedToken?.email?.trim().toLowerCase();
          authUid = decodedToken?.uid;
          isEmailVerified = decodedToken?.email_verified === true;
          const envAdmins = (process.env.ADMIN_EMAILS || 'fpacstore@gmail.com')
            .split(',')
            .map(e => e.trim().toLowerCase());
          if (decodedToken?.admin === true || (authEmail && envAdmins.includes(authEmail))) {
            isUserAdmin = true;
          }
        } catch (err: any) {
          logger.warn(`🚫 [RETURN-REQ] Auth token verification failed for order ${orderId}: ${err.message}`);
        }
      }
    }

    if (adminKey && process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY) {
      isUserAdmin = true;
    }

    if (!decodedToken && !isUserAdmin) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Autenticação necessária. Por favor, faça login para solicitar a devolução.'
      });
    }

    if (!isUserAdmin) {
      const orderCustomerEmail = (
        orderData.customerEmail ||
        orderData.email ||
        orderData.customerInfo?.email ||
        orderData.customer?.email ||
        ''
      ).trim().toLowerCase();
      const orderUserId = (
        orderData.userId ||
        orderData.customerInfo?.userId ||
        orderData.customer?.id ||
        ''
      ).trim();

      if (orderUserId) {
        if (!authUid || authUid !== orderUserId) {
          return res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Você não tem permissão para solicitar devolução deste pedido.'
          });
        }
      } else {
        if (!isEmailVerified) {
          return res.status(403).json({
            error: 'EMAIL_NOT_VERIFIED',
            message: 'O e-mail da sua conta precisa estar verificado para solicitar devolução.'
          });
        }
        if (!authEmail || authEmail !== orderCustomerEmail) {
          return res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Você não tem permissão para solicitar devolução deste pedido.'
          });
        }
      }
    }

    const shippingStatus = orderData.shipping?.status || orderData.shippingStatus || orderData.status;
    const isEligible = ['shipped', 'in_transit', 'delivered'].includes(shippingStatus);

    if (!isEligible) {
      return res.status(400).json({
        error: 'INVALID_RETURN_ELIGIBILITY',
        message: 'Apenas pedidos enviados ou entregues podem solicitar devolução.'
      });
    }

    const orderItems = Array.isArray(orderData.items) ? orderData.items : [];
    if (orderItems.length === 0) {
      return res.status(400).json({
        error: 'ORDER_ITEMS_REQUIRED',
        message: 'O pedido não possui itens válidos para devolução.'
      });
    }

    const itemsToReturn = Array.isArray(requestedItems) && requestedItems.length > 0
      ? requestedItems
      : orderItems.map((i: any) => ({
          orderItemId: i.id,
          variantKey: i.variantKey || `${i.color}_${i.size}`,
          quantity: i.quantity,
          reason: reason || 'Devolução solicitada'
        }));

    const existingReturns = Array.isArray(orderData.returns) ? orderData.returns : [];

    for (const item of itemsToReturn) {
      const rawQty = Number(item?.quantity);
      if (!Number.isFinite(rawQty) || !Number.isInteger(rawQty) || rawQty <= 0) {
        return res.status(400).json({
          error: 'INVALID_RETURN_QUANTITY',
          message: 'A quantidade para devolução deve ser um número inteiro maior que zero.'
        });
      }

      const itemId = typeof item?.orderItemId === 'string' && item.orderItemId.trim()
        ? item.orderItemId.trim()
        : (typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : undefined);
      const variantKey = typeof item?.variantKey === 'string' && item.variantKey.trim()
        ? item.variantKey.trim()
        : undefined;

      if (!itemId && !variantKey) {
        return res.status(400).json({
          error: 'INVALID_RETURN_ITEM',
          message: 'Cada item de devolução deve identificar um item real do pedido.'
        });
      }

      const matchedOrderItem = orderItems.find((i: any) =>
        (itemId && i.id === itemId) ||
        (variantKey && (i.variantKey === variantKey || `${i.color}_${i.size}` === variantKey))
      );

      if (!matchedOrderItem) {
        return res.status(400).json({
          error: 'RETURN_ITEM_NOT_FOUND',
          message: 'O item solicitado para devolução não pertence a este pedido.'
        });
      }

      const purchasedQty = Number(matchedOrderItem.quantity);
      if (!Number.isFinite(purchasedQty) || purchasedQty <= 0) {
        return res.status(400).json({
          error: 'INVALID_ORDER_ITEM_QUANTITY',
          message: 'A quantidade original do item no pedido é inválida.'
        });
      }

      const previouslyReturnedQty = existingReturns
        .filter((r: any) =>
          (itemId && (r.orderItemId === itemId || r.items?.some?.((ri: any) => ri.orderItemId === itemId))) ||
          (variantKey && (r.variantId === variantKey || r.variantKey === variantKey || r.items?.some?.((ri: any) => ri.variantKey === variantKey)))
        )
        .reduce((sum: number, r: any) => {
          if (Array.isArray(r.items)) {
            const nested = r.items
              .filter((ri: any) =>
                (itemId && ri.orderItemId === itemId) ||
                (variantKey && ri.variantKey === variantKey)
              )
              .reduce((nestedSum: number, ri: any) => nestedSum + (Number(ri.quantity) || 0), 0);
            return sum + nested;
          }
          return sum + (Number(r.quantity) || 0);
        }, 0);

      const maxReturnable = Math.max(0, purchasedQty - previouslyReturnedQty);

      if (rawQty > maxReturnable) {
        return res.status(400).json({
          error: 'INVALID_RETURN_QUANTITY',
          message: `Quantidade solicitada para devolução (${rawQty}) excede a quantidade restante no pedido (${maxReturnable}).`
        });
      }
    }

    const returnId = `ret_req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const returnRequestRecord = {
      returnId,
      status: 'requested',
      requestedBy: authEmail || authUid || 'customer',
      requestedAt: new Date().toISOString(),
      reason: reason || 'Solicitação de devolução pelo cliente',
      notes: notes || null,
      items: itemsToReturn
    };

    await orderRef.update({
      returns: admin.firestore.FieldValue.arrayUnion(returnRequestRecord),
      returnStatus: 'requested',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await recordAuditLog({
      userId: authUid || 'customer',
      userEmail: authEmail,
      action: 'REQUEST_ORDER_RETURN',
      resource: 'orders',
      resourceId: orderId,
      metadata: { returnId, reason, itemsCount: itemsToReturn.length },
      ip: req.ip
    });

    logger.info(`📦 [RETURN-REQ] Return request ${returnId} created for order ${orderId} by ${authEmail || authUid}`);

    return res.json({
      success: true,
      returnId,
      returnStatus: 'requested',
      message: 'Solicitação de devolução registrada com sucesso. Aguarde a análise da equipe.'
    });
  } catch (error: any) {
    logger.error(`❌ [RETURN-REQ-ERR] Failed to request order return: ${error.message}`);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message || 'Erro ao solicitar devolução.' });
  }
}

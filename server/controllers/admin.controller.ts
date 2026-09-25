import { calculateCashForecast } from '../../shared/cashForecast';
import { roundMoney } from '../../shared/financialDefaults';
import { Request, Response } from 'express';
import { getDb } from '../firebase.js';
import admin from 'firebase-admin';
import { CANONICAL_PRODUCTION_STATUSES, canTransitionProductionStatus, canTransitionPaymentStatus, canTransitionShippingStatus, getProductionTransitionDirection, isProductionStatus, normalizeProductionStatus, isPaymentStatus, assertProductionOrderEligible, assertShippingOrderEligible, isShippingStatus, normalizeShippingStatus, CANONICAL_SHIPPING_STATUSES, validateTrackingInfo, isLocalDeliveryOrder } from '../services/stateMachine.service.js';
import { adjustStock, OutOfStockError, getVariantStats, reserveStock, releaseStockReservation, consumeStockReservation, consumeStockReservationInTransaction, processPhysicalReturn } from '../services/store.service.js';
import { applyOrderStampStockInTransaction } from '../services/stampStock.service.js';
import { recordAuditLog } from '../utils/auditLogger.js';
import { logger } from '../utils/logger.js';
import { PaymentStatus, ProductionStatus } from '../types/order.types.js';
import { recordFinancialEvent, getFinancialEventsForOrder, getFinancialLedger, deriveLedgerEventId, FinancialEvent } from '../services/financialLedger.service.js';
import { getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderTotal, normalizePaymentStatus, getOrderPaymentStatus, getOrderPaymentDueDate } from '../utils/orderFinancial.js';
import {
  executeOrderMaintenance,
  previewOrderMaintenance
} from '../services/orderMaintenance.service.js';
import { dispatchStageNotification } from '../services/productionNotification.service.js';

/**
 * Admin Controller for Phase 7 Operational Production Features:
 * - Independent Production Status Management with History & Audit
 * - Payment Authorization Enforcement
 * - Backward Step Reason Enforcement
 * - Production Priority, Assignment, Due Date & Operational Notes
 */

export async function updateOrderProductionStatus(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { newStatus, currentStage, note, priority, assignedTo, productionDueDate } = req.body;
    const user = (req as any).user;

    if (!orderId || !newStatus) {
      return res.status(400).json({ error: 'INVALID_PRODUCTION_STATUS', message: 'orderId e newStatus são obrigatórios.' });
    }

    if (!isProductionStatus(newStatus)) {
      return res.status(400).json({
        error: 'INVALID_PRODUCTION_STATUS',
        message: `Status '${newStatus}' não pertence ao domínio de produção.`
      });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);

    // PRODUCTION 2.0: the authoritative read, transition validation and write
    // must happen in the SAME Firestore transaction. Firestore retries the
    // callback if the order changes concurrently, so a stale stage can never
    // be used to authorize a second transition.
    const transitionResult = await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        const err: any = new Error('Pedido não encontrado.');
        err.code = 'ORDER_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      const orderData = orderSnap.data()!;

      const eligibility = assertProductionOrderEligible(orderData);
      if (!eligibility.eligible) {
        const err: any = new Error(eligibility.message || 'Pedido não elegível para produção.');
        err.code = eligibility.error || 'PRODUCTION_ORDER_NOT_ELIGIBLE';
        err.status = 400;
        throw err;
      }

      const currentProdStatus: ProductionStatus = normalizeProductionStatus(
        orderData.production?.status || orderData.productionStatus || 'waiting'
      );

      if (!canTransitionProductionStatus(currentProdStatus, newStatus)) {
        const err: any = new Error(
          `Não é permitido alterar o estágio de produção de '${currentProdStatus}' para '${newStatus}'.`
        );
        err.code = 'INVALID_PRODUCTION_TRANSITION';
        err.status = 400;
        throw err;
      }

      const direction = getProductionTransitionDirection(currentProdStatus, newStatus);
      if (direction === 'backward') {
        if (!note || typeof note !== 'string' || note.trim().length === 0) {
          const err: any = new Error('Para retornar uma etapa de produção é obrigatório fornecer o motivo/observação.');
          err.code = 'PRODUCTION_REGRESSION_REASON_REQUIRED';
          err.status = 400;
          throw err;
        }
      }

      const timestamp = new Date().toISOString();
      const stageName = typeof currentStage === 'string' && currentStage.trim()
        ? currentStage.trim()
        : newStatus;

      const historyEntry = {
        type: 'production_update',
        status: newStatus,
        currentStage: stageName,
        previousStatus: currentProdStatus,
        timestamp,
        message: note || `Estágio de produção alterado para ${stageName}`,
        operator: user?.email || user?.uid || 'Admin'
      };

      const updatePayload: any = {
        'production.status': newStatus,
        'production.currentStage': stageName,
        'production.enteredAt': timestamp,
        'production.updatedAt': timestamp,
        'production.progress': [20, 45, 70, 95, 100][CANONICAL_PRODUCTION_STATUSES.indexOf(newStatus as ProductionStatus)],
        productionStatus: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: admin.firestore.FieldValue.arrayUnion(historyEntry)
      };

      if (newStatus === 'completed') {
        updatePayload['production.completedAt'] = timestamp;
      } else if (direction === 'backward' && currentProdStatus === 'completed') {
        updatePayload['production.completedAt'] = admin.firestore.FieldValue.delete();
      }

      if (priority) {
        updatePayload['production.priority'] = priority;
        updatePayload.priority = priority;
      }
      if (assignedTo) {
        updatePayload['production.assignedTo'] = assignedTo;
        updatePayload.assignedTo = assignedTo;
      }
      if (productionDueDate) {
        updatePayload['production.dueDate'] = productionDueDate;
        updatePayload.productionDueDate = productionDueDate;
      }

      transaction.update(orderRef, updatePayload);

      return { currentProdStatus, timestamp, stageName };
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'UPDATE_PRODUCTION_STATUS',
      resource: 'orders',
      resourceId: orderId,
      metadata: {
        previousStatus: transitionResult.currentProdStatus,
        newStatus,
        currentStage: transitionResult.stageName,
        note,
        priority,
        assignedTo,
        productionDueDate
      },
      ip: req.ip
    });

    logger.info(
      `🏭 [ADMIN-PROD] Order ${orderId} production status updated: ${transitionResult.currentProdStatus} -> ${newStatus} by ${user?.email}`
    );

    return res.json({
      success: true,
      orderId,
      productionStatus: newStatus,
      currentStage: transitionResult.stageName,
      enteredAt: transitionResult.timestamp
    });
  } catch (error: any) {
    logger.error(`❌ [ADMIN-PROD-ERR] ${error.message}`, error);

    if (error?.status === 404 || error?.code === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ error: error.code || 'ORDER_NOT_FOUND', message: error.message });
    }

    if (error?.status === 400) {
      return res.status(400).json({ error: error.code || 'INVALID_PRODUCTION_TRANSITION', message: error.message });
    }

    return res.status(500).json({ error: error.code || 'INTERNAL_ERROR', message: error.message || 'Erro ao atualizar estágio de produção.' });
  }
}

export async function createManualOrderController(req: Request, res: Response) {
  try {
    const order = req.body?.order;
    const orderId = String(order?.id || '').trim();
    if (!orderId.startsWith('MANUAL-') || !Array.isArray(order?.items) || order.items.length === 0) {
      return res.status(400).json({
        error: 'INVALID_MANUAL_ORDER',
        message: 'Pedido manual inválido: informe identificador MANUAL-* e ao menos um item.'
      });
    }

    const db = getDb();
    const orderPayload = {
      ...order,
      id: orderId,
      isManual: true,
      inventoryLifecycle: order.stockControl === 'move' ? 'reserved' : 'unmanaged',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const existingOrder = await db.collection('orders').doc(orderId).get();
    if (order.stockControl === 'move') {
      if (!existingOrder.exists) {
        await reserveStock(orderId, order.items, `reserve_order_${orderId}`, orderPayload);
      } else if (existingOrder.data()?.isManual !== true) {
        const conflict: any = new Error('Já existe um pedido não manual com este identificador.');
        conflict.code = 'MANUAL_ORDER_ALREADY_EXISTS';
        throw conflict;
      }
      if (['shipped', 'delivered'].includes(String(order.shippingStatus || '').toLowerCase())) {
        await consumeStockReservation(orderId, order.items, `shipping_shipped_${orderId}`);
      }
      if (String(order.shippingStatus || '').toLowerCase() === 'delivered') {
        await db.runTransaction(async transaction => {
          await applyOrderStampStockInTransaction(transaction, db, orderId, order.items, 'delivery_reconcile');
        });
      }
    } else {
      if (!existingOrder.exists) await db.runTransaction(async transaction => {
        const ref = db.collection('orders').doc(orderId);
        const existing = await transaction.get(ref);
        if (existing.exists) {
          const err: any = new Error('Já existe um pedido com este identificador.');
          err.code = 'MANUAL_ORDER_ALREADY_EXISTS';
          throw err;
        }
        await applyOrderStampStockInTransaction(transaction, db, orderId, order.items, 'order_debit');
        transaction.set(ref, orderPayload);
      });
    }

    if (order.stockControl !== 'move' && String(order.shippingStatus || '').toLowerCase() === 'delivered') {
      await db.runTransaction(async transaction => {
        await applyOrderStampStockInTransaction(transaction, db, orderId, order.items, 'delivery_reconcile');
      });
    }

    return res.status(201).json({ success: true, orderId, inventoryLifecycle: orderPayload.inventoryLifecycle });
  } catch (error: any) {
    logger.error(`❌ [MANUAL-ORDER-CREATE] ${error.message}`, error);
    const status = error instanceof OutOfStockError ? 409 : (error?.code === 'MANUAL_ORDER_ALREADY_EXISTS' ? 409 : 500);
    return res.status(status).json({
      error: error?.code || (error instanceof OutOfStockError ? 'OUT_OF_STOCK' : 'MANUAL_ORDER_CREATE_FAILED'),
      message: error?.message || 'Não foi possível criar o pedido manual.'
    });
  }
}

export async function previewHistoricalOrderCloseout(req: Request, res: Response) {
  try {
    const preview = await previewOrderMaintenance();
    return res.json({ success: true, preview });
  } catch (error: any) {
    logger.error(`❌ [ORDER-MAINTENANCE-PREVIEW] ${error.message}`, error);
    return res.status(500).json({
      error: 'ORDER_MAINTENANCE_PREVIEW_FAILED',
      message: error.message || 'Não foi possível conferir os pedidos.'
    });
  }
}

export async function executeHistoricalOrderCloseout(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { previewHash, confirmation } = req.body || {};
    const operator = user?.email || user?.uid || 'Admin';
    const result = await executeOrderMaintenance(previewHash, confirmation, operator);

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'HISTORICAL_ORDER_CLOSEOUT',
      resource: 'orders',
      metadata: {
        finalizedOrders: result.realOrdersToFinalize,
        deletedTestOrders: result.testOrders,
        deletedTestFinancialEvents: result.linkedTestFinancialEvents,
        paymentShippingAndStockPreserved: true
      },
      ip: req.ip
    });

    logger.info(
      `✅ [ORDER-MAINTENANCE] ${result.realOrdersToFinalize} pedidos finalizados e ${result.testOrders} testes excluídos por ${operator}`
    );
    return res.json({ success: true, result });
  } catch (error: any) {
    logger.error(`❌ [ORDER-MAINTENANCE-EXECUTE] ${error.message}`, error);
    const status = error?.status === 409 ? 409 : (error?.status === 400 ? 400 : 500);
    return res.status(status).json({
      error: error?.code || 'ORDER_MAINTENANCE_FAILED',
      message: error.message || 'Não foi possível executar o encerramento.'
    });
  }
}

export async function updateOrderProductionPriority(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const { priority, note } = req.body;
    const user = (req as any).user;

    if (!orderId || !priority || !['normal', 'alta', 'urgente'].includes(priority)) {
      return res.status(400).json({ error: 'INVALID_PRIORITY', message: 'orderId e prioridade válida (normal, alta, urgente) são obrigatórios.' });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;

    // Central Eligibility Guard Check
    const eligibility = assertProductionOrderEligible(orderData);
    if (!eligibility.eligible) {
      return res.status(400).json({
        error: eligibility.error,
        message: eligibility.message
      });
    }

    const timestamp = new Date().toISOString();
    const historyEntry = {
      type: 'production_priority_update',
      priority,
      timestamp,
      message: note || `Prioridade de produção alterada para ${priority.toUpperCase()}`,
      operator: user?.email || user?.uid || 'Admin'
    };

    await orderRef.update({
      'production.priority': priority,
      priority,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion(historyEntry)
    });

    res.json({ success: true, orderId, priority });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao atualizar prioridade.' });
  }
}

export async function updateOrderProductionAssignment(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const { assignedTo, note } = req.body;
    const user = (req as any).user;

    if (!orderId || typeof assignedTo !== 'string') {
      return res.status(400).json({ error: 'INVALID_ASSIGNMENT', message: 'orderId e assignedTo são obrigatórios.' });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;

    // Central Eligibility Guard Check
    const eligibility = assertProductionOrderEligible(orderData);
    if (!eligibility.eligible) {
      return res.status(400).json({
        error: eligibility.error,
        message: eligibility.message
      });
    }

    const timestamp = new Date().toISOString();
    const historyEntry = {
      type: 'production_assignment_update',
      assignedTo,
      timestamp,
      message: note || `Responsável da produção definido como ${assignedTo || 'Nenhum'}`,
      operator: user?.email || user?.uid || 'Admin'
    };

    await orderRef.update({
      'production.assignedTo': assignedTo,
      assignedTo,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion(historyEntry)
    });

    res.json({ success: true, orderId, assignedTo });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao atribuir responsável.' });
  }
}

export async function updateOrderProductionDueDate(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const { productionDueDate, note } = req.body;
    const user = (req as any).user;

    if (!orderId || !productionDueDate) {
      return res.status(400).json({ error: 'INVALID_DUE_DATE', message: 'orderId e productionDueDate são obrigatórios.' });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;

    // Central Eligibility Guard Check
    const eligibility = assertProductionOrderEligible(orderData);
    if (!eligibility.eligible) {
      return res.status(400).json({
        error: eligibility.error,
        message: eligibility.message
      });
    }

    const timestamp = new Date().toISOString();
    const historyEntry = {
      type: 'production_due_date_update',
      productionDueDate,
      timestamp,
      message: note || `Prazo de produção definido para ${productionDueDate}`,
      operator: user?.email || user?.uid || 'Admin'
    };

    await orderRef.update({
      'production.dueDate': productionDueDate,
      productionDueDate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion(historyEntry)
    });

    res.json({ success: true, orderId, productionDueDate });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao atualizar prazo de produção.' });
  }
}

export async function addOrderProductionNote(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const { note } = req.body;
    const user = (req as any).user;

    if (!orderId || !note || typeof note !== 'string' || note.trim().length === 0) {
      return res.status(400).json({ error: 'INVALID_NOTE', message: 'orderId e observação válida são obrigatórios.' });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;

    // Central Eligibility Guard Check
    const eligibility = assertProductionOrderEligible(orderData);
    if (!eligibility.eligible) {
      return res.status(400).json({
        error: eligibility.error,
        message: eligibility.message
      });
    }

    const timestamp = new Date().toISOString();
    const noteObj = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      note,
      author: user?.email || user?.uid || 'Admin',
      timestamp
    };

    const historyEntry = {
      type: 'production_note_added',
      timestamp,
      message: `Observação de produção: ${note}`,
      operator: user?.email || user?.uid || 'Admin'
    };

    await orderRef.update({
      'production.notes': admin.firestore.FieldValue.arrayUnion(noteObj),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion(historyEntry)
    });

    res.json({ success: true, orderId, note: noteObj });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao adicionar observação.' });
  }
}

export async function addOrderShippingNote(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const { note, assignedTo } = req.body;
    const user = (req as any).user;
    const cleanNote = typeof note === 'string' ? note.trim() : '';

    if (!orderId || !cleanNote || cleanNote.length > 2000) {
      return res.status(400).json({
        error: 'INVALID_NOTE',
        message: 'Informe uma observação válida de até 2.000 caracteres.'
      });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' });
    }

    const timestamp = new Date().toISOString();
    const noteObj = {
      id: `shipping_note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      note: cleanNote,
      assignedTo: typeof assignedTo === 'string' ? assignedTo.trim().slice(0, 200) : '',
      author: user?.email || user?.uid || 'Admin',
      timestamp,
      type: 'shipping_note'
    };
    const historyEntry = {
      type: 'shipping_note_added',
      timestamp,
      message: cleanNote,
      operator: noteObj.author,
      assignedTo: noteObj.assignedTo
    };

    await orderRef.update({
      'shipping.notes': admin.firestore.FieldValue.arrayUnion(noteObj),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion(historyEntry)
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'ADD_SHIPPING_NOTE',
      resource: 'orders',
      resourceId: orderId,
      metadata: { noteId: noteObj.id, assignedTo: noteObj.assignedTo },
      ip: req.ip
    });

    return res.json({ success: true, orderId, note: noteObj });
  } catch (error: any) {
    return res.status(500).json({ error: 'SHIPPING_NOTE_ERROR', message: error.message || 'Erro ao adicionar observação de expedição.' });
  }
}

export async function updateOrderPaymentStatus(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const { newStatus, reason } = req.body;
    const user = (req as any).user;

    if (!orderId || !newStatus) {
      return res.status(400).json({ error: 'orderId e newStatus são obrigatórios.' });
    }

    if (!isPaymentStatus(newStatus)) {
      return res.status(400).json({ error: 'INVALID_PAYMENT_STATUS', message: 'Status de pagamento inválido.' });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const timestamp = new Date().toISOString();
    const requestedIdempotencyKey = typeof req.body.idempotencyKey === 'string' && req.body.idempotencyKey.trim()
      ? req.body.idempotencyKey.trim()
      : `admin_pay_stat_${orderId}_${newStatus}_${timestamp}`;

    const result = await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        const err: any = new Error('Pedido não encontrado.');
        err.status = 404;
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }

      const orderData = orderSnap.data()!;
      const priorEvent = await transaction.get(db.collection('financial_events').doc(deriveLedgerEventId(requestedIdempotencyKey)));
      if (priorEvent.exists) {
        const prior = priorEvent.data()!;
        if (prior.orderId !== orderId || prior.newStatus !== newStatus ||
          (newStatus === 'partially_refunded' && Number(req.body.refundAmount ?? req.body.amount) !== prior.amount)) {
          throw Object.assign(new Error('Esta chave já foi usada em outra alteração financeira.'), { status: 400, code: 'IDEMPOTENCY_CONFLICT' });
        }
        return { idempotentReplay: true, orderData, currentPayStatus: prior.newStatus, existingPaidAmount: getOrderPaidAmount(orderData), shouldReleaseStock: false };
      }
      if (orderData.paymentCreationUncertain) throw Object.assign(new Error('Confirme o resultado no provedor antes de alterar o pagamento ou liberar o estoque.'), { status: 409, code: 'PAYMENT_CONFIRMATION_PENDING' });
      const currentPayStatus: PaymentStatus = orderData.payment?.status || orderData.paymentStatus || 'pending';
      const isValid = canTransitionPaymentStatus(currentPayStatus, newStatus as PaymentStatus, true);
      if (!isValid) {
        const err: any = new Error(`Não é permitido alterar o status de pagamento de '${currentPayStatus}' para '${newStatus}'.`);
        err.status = 400;
        err.code = 'INVALID_PAYMENT_TRANSITION';
        throw err;
      }

      const existingPaidAmount = getOrderPaidAmount(orderData);
      if (existingPaidAmount > 0 && ['cancelled', 'rejected', 'expired'].includes(newStatus)) {
        const err: any = new Error(`Não é possível alterar o status de pagamento para '${newStatus}' pois já existe valor pago registrado (R$ ${existingPaidAmount}). Para devoluções, utilize o fluxo de estorno/reembolso (refund).`);
        err.status = 400;
        err.code = 'INVALID_PAYMENT_TRANSITION';
        throw err;
      }

      const historyEntry = {
        type: 'payment_update',
        status: newStatus,
        previousStatus: currentPayStatus,
        timestamp,
        message: reason || `Status de pagamento alterado manualmente para ${newStatus}`,
        operator: user?.email || user?.uid || 'Admin'
      };

      const totalAmount = getOrderTotal(orderData);
      if (![totalAmount, existingPaidAmount, getOrderRefundedAmount(orderData)].every(value => Number.isFinite(value) && value >= 0)) {
        throw Object.assign(new Error('Os valores financeiros deste pedido precisam de conferência.'), { status: 400, code: 'INVALID_FINANCIAL_AMOUNTS' });
      }
      const updatePayload: any = {
        'payment.status': newStatus,
        paymentStatus: newStatus === 'approved' ? 'approved' : newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: admin.firestore.FieldValue.arrayUnion(historyEntry)
      };

      if (newStatus === 'approved') {
        updatePayload['payment.paidAmount'] = totalAmount;
        updatePayload.amountPaid = totalAmount;
        updatePayload['payment.pendingAmount'] = 0;
        updatePayload.balanceDue = 0;
        if (totalAmount > existingPaidAmount) updatePayload['payment.paidAt'] = timestamp;
      } else if (newStatus === 'refunded' || newStatus === 'partially_refunded') {
        const inputRefundAmt = Number(req.body.refundAmount ?? req.body.amount);
        const prevRefunded = getOrderRefundedAmount(orderData);
        const effectivePaid = existingPaidAmount;
        const available = effectivePaid - prevRefunded;
        if (!(available > 0) || (newStatus === 'partially_refunded' && (!Number.isFinite(inputRefundAmt) || inputRefundAmt <= 0 || inputRefundAmt > available))) {
          throw Object.assign(new Error('Informe um estorno positivo, limitado ao valor recebido ainda disponível para devolução.'), { status: 400, code: 'INVALID_REFUND_AMOUNT' });
        }
        const calcRefunded = newStatus === 'refunded'
          ? effectivePaid
          : prevRefunded + inputRefundAmt;

        updatePayload['payment.paidAmount'] = effectivePaid;
        updatePayload.amountPaid = effectivePaid;
        updatePayload['payment.refundedAmount'] = calcRefunded;
        updatePayload.refundedAmount = calcRefunded;
        updatePayload['payment.pendingAmount'] = 0;
        updatePayload.balanceDue = 0;
        updatePayload['payment.refundedAt'] = timestamp;
      } else if (['rejected', 'cancelled', 'expired'].includes(newStatus)) {
        if (existingPaidAmount > 0) {
          updatePayload['payment.paidAmount'] = existingPaidAmount;
          updatePayload.amountPaid = existingPaidAmount;
          updatePayload['payment.pendingAmount'] = Math.max(0, totalAmount - existingPaidAmount);
          updatePayload.balanceDue = Math.max(0, totalAmount - existingPaidAmount);
        } else {
          updatePayload['payment.paidAmount'] = 0;
          updatePayload.amountPaid = 0;
          updatePayload['payment.pendingAmount'] = totalAmount;
          updatePayload.balanceDue = totalAmount;
        }
      }

      let eventType: any = 'manual_adjustment';
      let deltaAmount = 0;
      if (newStatus === 'approved') {
        eventType = 'payment_approved';
        deltaAmount = Math.max(0, Number(updatePayload['payment.paidAmount'] ?? totalAmount) - existingPaidAmount);
      } else if (newStatus === 'refunded') {
        eventType = 'refund';
        deltaAmount = Math.max(0, Number(updatePayload['payment.refundedAmount'] ?? totalAmount) - getOrderRefundedAmount(orderData));
      } else if (newStatus === 'partially_refunded') {
        eventType = 'partial_refund';
        deltaAmount = Math.max(0, Number(updatePayload['payment.refundedAmount'] ?? 0) - getOrderRefundedAmount(orderData));
      } else if (newStatus === 'cancelled') {
        eventType = 'payment_cancelled';
      } else if (newStatus === 'rejected') {
        eventType = 'payment_rejected';
      }

      if (deltaAmount > 0) {
        const movement = { ...historyEntry, financialType: eventType, amount: deltaAmount, eventId: deriveLedgerEventId(requestedIdempotencyKey) };
        updatePayload.history = admin.firestore.FieldValue.arrayUnion(movement);
        if (eventType === 'payment_approved') {
          updatePayload.paymentLogs = admin.firestore.FieldValue.arrayUnion({ id: movement.eventId, amount: deltaAmount, date: timestamp, method: orderData.payment?.method || 'MANUAL' });
        } else if (eventType === 'refund' || eventType === 'partial_refund') {
          updatePayload.refundLogs = admin.firestore.FieldValue.arrayUnion({ id: movement.eventId, amount: deltaAmount, date: timestamp, status: newStatus, provider: 'manual' });
        }
      }

      // FINANCEIRO 2.0: ledger and order mutation are committed together.
      // recordFinancialEvent performs its idempotency read on the same transaction
      // before any writes, eliminating partial financial truth and stale concurrent transitions.
      await recordFinancialEvent({
        orderId,
        type: eventType,
        amount: deltaAmount,
        previousStatus: currentPayStatus,
        newStatus,
        previousPaidAmount: existingPaidAmount,
        newPaidAmount: Number(updatePayload['payment.paidAmount'] ?? existingPaidAmount),
        previousPendingAmount: Number(orderData.payment?.pendingAmount ?? (totalAmount - existingPaidAmount)),
        newPendingAmount: Number(updatePayload['payment.pendingAmount'] ?? 0),
        previousRefundedAmount: Number(orderData.payment?.refundedAmount ?? 0),
        newRefundedAmount: Number(updatePayload['payment.refundedAmount'] ?? 0),
        paymentMethod: orderData.payment?.method || 'MANUAL',
        provider: 'manual',
        actorId: user?.uid,
        actorEmail: user?.email,
        reason: reason || `Alteração manual de status para ${newStatus}`,
        idempotencyKey: requestedIdempotencyKey,
        createdAt: timestamp
      }, db, transaction);

      transaction.update(orderRef, updatePayload);

      return {
        idempotentReplay: false,
        orderData,
        currentPayStatus,
        existingPaidAmount,
        shouldReleaseStock: ['rejected', 'cancelled', 'expired'].includes(newStatus)
          && !orderData.stockReverted
          && !orderData.stockRevertedAcknowledged
          && Array.isArray(orderData.items)
          && orderData.items.length > 0
      };
    });

    if (result.idempotentReplay) return res.json({ success: true, orderId, paymentStatus: result.currentPayStatus, idempotentReplay: true });

    if (result.shouldReleaseStock) {
      logger.info(`📦 [ADMIN-PAY] Releasing stock reservation for cancelled/failed order ${orderId}`);
      await releaseStockReservation(orderId, result.orderData.items, `admin_pay_${orderId}_release`);
      await orderRef.update({
        stockReverted: true,
        stockRevertedAcknowledged: true
      });
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'UPDATE_PAYMENT_STATUS',
      resource: 'orders',
      resourceId: orderId,
      metadata: { previousStatus: result.currentPayStatus, newStatus, reason },
      ip: req.ip
    });

    logger.info(`💳 [ADMIN-PAY] Order ${orderId} payment status updated: ${result.currentPayStatus} -> ${newStatus} by ${user?.email}`);

    const paymentNotificationStage = newStatus === 'approved'
      ? 'payment_approved'
      : (['pending', 'processing'].includes(newStatus) ? 'payment_pending' : null);
    if (paymentNotificationStage) {
      await dispatchStageNotification({
        orderId,
        newStageId: paymentNotificationStage,
        previousStageId: result.currentPayStatus,
        changedBy: user?.email || user?.uid || 'Admin'
      }).catch((notificationError: any) => {
        logger.warn(`⚠️ [ADMIN-PAY-NOTIF] Pedido ${orderId}: ${notificationError.message}`);
      });
    }

    return res.json({ success: true, orderId, paymentStatus: newStatus });
  } catch (error: any) {
    logger.error(`❌ [ADMIN-PAY-ERR] ${error.message}`, error);
    if (error?.status === 404 || error?.code === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ error: error.code || 'ORDER_NOT_FOUND', message: error.message });
    }
    if (error?.status === 400) {
      return res.status(400).json({ error: error.code || 'INVALID_PAYMENT_TRANSITION', message: error.message });
    }
    return res.status(500).json({ error: error.message || 'Erro ao atualizar status de pagamento.' });
  }
}

export async function recordStockMovement(req: Request, res: Response) {
  try {
    const { productSlug, variantKey, type, quantity, reason, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!productSlug || !variantKey || !type || typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ error: 'productSlug, variantKey, type e quantidade são obrigatórios e válidos.' });
    }

    const db = getDb();
    let resultMovement: any = null;

    await db.runTransaction(async (transaction) => {
      const invRef = db.collection('inventory').doc(productSlug);
      const invSnap = await transaction.get(invRef);

      const invData = invSnap.exists ? invSnap.data()! : {};
      const variants = invData.variants || {};
      const currentVariant = variants[variantKey] || {};
      const stats = getVariantStats(currentVariant, productSlug, variantKey);

      let newPhysicalQuantity = stats.physicalQuantity;
      let newReservedQuantity = stats.reservedQuantity;

      const isAdditive = ['add', 'purchase_entry', 'manual_entry', 'adjustment_increase', 'return'].includes(type);
      const isSubtractions = ['subtract', 'sale', 'production_consumption', 'loss', 'damage', 'adjustment_decrease'].includes(type);

      if (isAdditive) {
        newPhysicalQuantity = stats.physicalQuantity + quantity;
      } else if (isSubtractions) {
        if (stats.availableQuantity < quantity) {
          throw new OutOfStockError(
            `Estoque disponível insuficiente para saída manual. Disponível: ${stats.availableQuantity}, Solicitado: ${quantity}`,
            { item: `${productSlug} (${variantKey})`, requested: quantity, available: stats.availableQuantity }
          );
        }
        newPhysicalQuantity = stats.physicalQuantity - quantity;
      } else if (type === 'adjust') {
        if (quantity < stats.reservedQuantity) {
          throw new OutOfStockError(
            `Ajuste de estoque físico inválido: O novo estoque físico (${quantity}) não pode ser menor do que a quantidade reservada por pedidos ativos (${stats.reservedQuantity}).`,
            { item: `${productSlug} (${variantKey})`, requested: quantity, available: stats.reservedQuantity }
          );
        }
        newPhysicalQuantity = Math.max(0, quantity);
      }

      const newAvailableQuantity = Math.max(0, newPhysicalQuantity - newReservedQuantity);

      const updatedVariant = {
        ...currentVariant,
        id: `${productSlug}_${variantKey}`,
        productId: productSlug,
        productSlug,
        variantId: variantKey,
        sku: stats.sku,
        color: stats.color,
        size: stats.size,
        physicalQuantity: newPhysicalQuantity,
        reservedQuantity: newReservedQuantity,
        availableQuantity: newAvailableQuantity,
        stock: newPhysicalQuantity,
        available: newAvailableQuantity > 0,
        updatedAt: new Date().toISOString()
      };

      variants[variantKey] = updatedVariant;

      const totalPhysical: number = Object.values(variants).reduce<number>((sum, v: any) => {
        const qty = Number(v.physicalQuantity !== undefined ? v.physicalQuantity : (v.stock ?? 0)) || 0;
        return sum + qty;
      }, 0);
      const totalReserved: number = Object.values(variants).reduce<number>((sum, v: any) => {
        const qty = Number(v.reservedQuantity !== undefined ? v.reservedQuantity : (v.reserved ?? 0)) || 0;
        return sum + qty;
      }, 0);
      const totalAvailable = Math.max(0, totalPhysical - totalReserved);

      transaction.set(invRef, {
        ...invData,
        stock: totalPhysical,
        totalPhysicalStock: totalPhysical,
        totalReservedStock: totalReserved,
        totalAvailableStock: totalAvailable,
        variants,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      const movementRef = db.collection('stock_movements').doc();
      resultMovement = {
        id: movementRef.id,
        productId: productSlug,
        productSlug,
        variantKey,
        sku: stats.sku,
        type,
        quantity,
        previousPhysicalQuantity: stats.physicalQuantity,
        newPhysicalQuantity,
        previousReservedQuantity: stats.reservedQuantity,
        newReservedQuantity,
        previousAvailableQuantity: stats.availableQuantity,
        newAvailableQuantity,
        previousStock: stats.physicalQuantity,
        newStock: newPhysicalQuantity,
        reason: reason || 'Ajuste manual de estoque',
        operator: user?.email || user?.uid || 'Admin',
        performedBy: user?.email || user?.uid || 'Admin',
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        idempotencyKey
      };

      transaction.set(movementRef, resultMovement);
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'STOCK_MOVEMENT',
      resource: 'inventory',
      resourceId: productSlug,
      metadata: resultMovement,
      ip: req.ip
    });

    logger.info(`📦 [STOCK-MOVEMENT] ${productSlug} (${variantKey}): ${resultMovement.previousPhysicalQuantity} -> ${resultMovement.newPhysicalQuantity} (${type}) by ${user?.email}`);

    res.json({ success: true, movement: resultMovement });
  } catch (error: any) {
    if (error instanceof OutOfStockError) {
      return res.status(400).json({ error: 'INSUFFICIENT_STOCK', message: error.message, details: error.details });
    }
    logger.error(`❌ [STOCK-MOVEMENT-ERR] ${error.message}`, error);
    res.status(500).json({ error: error.message || 'Erro ao registrar movimentação de estoque.' });
  }
}

/**
 * Ajusta uma grade inteira de produto em uma única transação. A tela de
 * cadastro trabalha com várias cores e tamanhos de uma vez; gravá-los um a um
 * permitia que um timeout deixasse o produto salvo com apenas parte do saldo.
 */
export async function recordBulkStockMovement(req: Request, res: Response) {
  try {
    const productSlug = typeof req.body?.productSlug === 'string' ? req.body.productSlug.trim() : '';
    const rawUpdates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    const defaultReason = typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim().slice(0, 500)
      : 'Ajuste manual de estoque';
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    const user = (req as any).user;

    if (!productSlug || productSlug.length > 160 || rawUpdates.length === 0 || rawUpdates.length > 100) {
      return res.status(400).json({ error: 'Informe um produto e entre 1 e 100 variações válidas para confirmar o estoque.' });
    }
    if (idempotencyKey && !/^[A-Za-z0-9_-]{8,160}$/.test(idempotencyKey)) {
      return res.status(400).json({ error: 'A identificação desta confirmação de estoque é inválida.' });
    }

    const seenVariants = new Set<string>();
    const updates: Array<{ variantKey: string; quantity: number; reason: string }> = [];
    for (const raw of rawUpdates) {
      const variantKey = typeof raw?.variantKey === 'string' ? raw.variantKey.trim() : '';
      const quantity = raw?.quantity;
      const reason = typeof raw?.reason === 'string' && raw.reason.trim()
        ? raw.reason.trim().slice(0, 500)
        : defaultReason;

      if (
        !variantKey || variantKey.length > 160 ||
        variantKey === '__proto__' || variantKey === 'constructor' || variantKey === 'prototype' ||
        !Number.isSafeInteger(quantity) || quantity < 0 || seenVariants.has(variantKey)
      ) {
        return res.status(400).json({ error: 'Cada variação deve ser única e ter uma quantidade inteira maior ou igual a zero.' });
      }
      seenVariants.add(variantKey);
      updates.push({ variantKey, quantity, reason });
    }
    const requestSignature = updates
      .map((update) => `${update.variantKey}:${update.quantity}`)
      .sort()
      .join('|');

    const db = getDb();
    let resultMovements: any[] = [];
    let replayed = false;

    await db.runTransaction(async (transaction) => {
      const invRef = db.collection('inventory').doc(productSlug);
      const idempotencyRef = idempotencyKey ? db.collection('stock_bulk_idempotency').doc(idempotencyKey) : null;
      const [invSnap, idempotencySnap] = await Promise.all([
        transaction.get(invRef),
        idempotencyRef ? transaction.get(idempotencyRef) : Promise.resolve(null)
      ]);
      if (idempotencySnap?.exists) {
        const previous = idempotencySnap.data() || {};
        if (previous.productSlug !== productSlug || previous.requestSignature !== requestSignature || !Array.isArray(previous.movements)) {
          const conflict: any = new Error('Esta confirmação de estoque já foi usada para uma grade diferente.');
          conflict.status = 409;
          conflict.code = 'IDEMPOTENCY_CONFLICT';
          throw conflict;
        }
        resultMovements = previous.movements;
        replayed = true;
        return;
      }
      replayed = false;
      const invData = invSnap.exists ? invSnap.data()! : {};
      const variants: Record<string, any> = { ...(invData.variants || {}) };
      const now = new Date().toISOString();
      const movements: any[] = [];

      for (const update of updates) {
        const currentVariant = variants[update.variantKey] || {};
        const stats = getVariantStats(currentVariant, productSlug, update.variantKey);

        if (update.quantity < stats.reservedQuantity) {
          throw new OutOfStockError(
            `Ajuste de estoque físico inválido: O novo estoque físico (${update.quantity}) não pode ser menor do que a quantidade reservada por pedidos ativos (${stats.reservedQuantity}).`,
            { item: `${productSlug} (${update.variantKey})`, requested: update.quantity, available: stats.reservedQuantity }
          );
        }

        const newPhysicalQuantity = update.quantity;
        const newReservedQuantity = stats.reservedQuantity;
        const newAvailableQuantity = Math.max(0, newPhysicalQuantity - newReservedQuantity);

        variants[update.variantKey] = {
          ...currentVariant,
          id: `${productSlug}_${update.variantKey}`,
          productId: productSlug,
          productSlug,
          variantId: update.variantKey,
          sku: stats.sku,
          color: stats.color,
          size: stats.size,
          physicalQuantity: newPhysicalQuantity,
          reservedQuantity: newReservedQuantity,
          availableQuantity: newAvailableQuantity,
          stock: newPhysicalQuantity,
          available: newAvailableQuantity > 0,
          updatedAt: now
        };

        const movementRef = db.collection('stock_movements').doc();
        const movement = {
          id: movementRef.id,
          productId: productSlug,
          productSlug,
          variantKey: update.variantKey,
          sku: stats.sku,
          type: 'adjust',
          quantity: update.quantity,
          previousPhysicalQuantity: stats.physicalQuantity,
          newPhysicalQuantity,
          previousReservedQuantity: stats.reservedQuantity,
          newReservedQuantity,
          previousAvailableQuantity: stats.availableQuantity,
          newAvailableQuantity,
          previousStock: stats.physicalQuantity,
          newStock: newPhysicalQuantity,
          reason: update.reason,
          operator: user?.email || user?.uid || 'Admin',
          performedBy: user?.email || user?.uid || 'Admin',
          timestamp: now,
          createdAt: now,
          ...(idempotencyKey ? { idempotencyKey } : {})
        };
        transaction.set(movementRef, movement);
        movements.push(movement);
      }

      const totalPhysical = Object.values(variants).reduce<number>((sum, variant: any) => {
        const quantity = Number(variant.physicalQuantity !== undefined ? variant.physicalQuantity : (variant.stock ?? 0)) || 0;
        return sum + quantity;
      }, 0);
      const totalReserved = Object.values(variants).reduce<number>((sum, variant: any) => {
        const quantity = Number(variant.reservedQuantity !== undefined ? variant.reservedQuantity : (variant.reserved ?? 0)) || 0;
        return sum + quantity;
      }, 0);

      transaction.set(invRef, {
        ...invData,
        stock: totalPhysical,
        totalPhysicalStock: totalPhysical,
        totalReservedStock: totalReserved,
        totalAvailableStock: Math.max(0, totalPhysical - totalReserved),
        variants,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: now
      }, { merge: true });
      if (idempotencyRef) {
        transaction.set(idempotencyRef, {
          productSlug,
          requestSignature,
          movements,
          createdAt: now
        });
      }

      resultMovements = movements;
    });

    if (!replayed) {
      await recordAuditLog({
        userId: user?.uid,
        userEmail: user?.email,
        action: 'STOCK_BULK_ADJUSTMENT',
        resource: 'inventory',
        resourceId: productSlug,
        metadata: {
          count: resultMovements.length,
          movements: resultMovements.map(({ variantKey, previousPhysicalQuantity, newPhysicalQuantity, reason }) => ({
            variantKey,
            previousPhysicalQuantity,
            newPhysicalQuantity,
            reason
          }))
        },
        ip: req.ip
      });
    }

    logger.info(`📦 [STOCK-BULK-ADJUST] ${productSlug}: ${resultMovements.length} variações ${replayed ? 'reconfirmadas' : 'confirmadas'} por ${user?.email}`);
    return res.json({ success: true, movements: resultMovements, replayed });
  } catch (error: any) {
    if (error instanceof OutOfStockError) {
      return res.status(400).json({ error: 'INSUFFICIENT_STOCK', message: error.message, details: error.details });
    }
    if (error?.status === 409 || error?.code === 'IDEMPOTENCY_CONFLICT') {
      return res.status(409).json({ error: error.code || 'IDEMPOTENCY_CONFLICT', message: error.message });
    }
    logger.error(`❌ [STOCK-BULK-ADJUST-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao confirmar a grade de estoque.' });
  }
}

export async function exportOrdersCsv(req: Request, res: Response) {
  try {
    const db = getDb();
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').limit(1000).get();

    let csv = 'ID,Data,Cliente,Email,Telefone,CPF,Subtotal,Desconto,Frete,Total,Pagamento,Producao,Envio\n';

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;
      const date = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || '');
      const name = `"${(data.customer?.name || data.customerName || '').replace(/"/g, '""')}"`;
      const email = data.customer?.email || data.customerEmail || '';
      const phone = data.customer?.phone || data.customerPhone || '';
      const cpf = data.customer?.cpf || data.customerCpf || '';
      const subtotal = data.pricing?.subtotal || data.subtotal || 0;
      const discount = data.pricing?.couponDiscount || data.couponDiscount || 0;
      const shipping = data.pricing?.shipping || data.shippingFee || 0;
      const total = data.pricing?.total || data.total || 0;
      const paymentStatus = data.payment?.status || data.paymentStatus || 'pending';
      const productionStatus = data.production?.status || data.productionStatus || 'waiting';
      const shippingStatus = data.shipping?.status || data.shippingStatus || 'pending';

      csv += `${id},${date},${name},${email},${phone},${cpf},${subtotal},${discount},${shipping},${total},${paymentStatus},${productionStatus},${shippingStatus}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="pedidos-fpac.csv"');
    res.status(200).send(csv);
  } catch (error: any) {
    logger.error(`❌ [EXPORT-ORDERS-ERR] ${error.message}`, error);
    res.status(500).json({ error: error.message || 'Erro ao exportar pedidos.' });
  }
}

export async function exportFinancialCsv(req: Request, res: Response) {
  try {
    const db = getDb();
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').limit(1000).get();

    let csv = 'Data,ID Pedido,Cliente,Metodo,Valor Total,Status Pagamento,Aprovado\n';

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;
      const date = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || '');
      const name = `"${(data.customer?.name || data.customerName || '').replace(/"/g, '""')}"`;
      const method = data.payment?.method || data.payment_method_id || 'PIX';
      const total = data.pricing?.total || data.total || 0;
      const paymentStatus = data.payment?.status || data.paymentStatus || 'pending';
      const isApproved = paymentStatus === 'approved' ? 'SIM' : 'NAO';

      csv += `${date},${id},${name},${method},${total},${paymentStatus},${isApproved}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="financeiro-fpac.csv"');
    res.status(200).send(csv);
  } catch (error: any) {
    logger.error(`❌ [EXPORT-FINANCIAL-ERR] ${error.message}`, error);
    res.status(500).json({ error: error.message || 'Erro ao exportar relatório financeiro.' });
  }
}

export async function updateOrderShippingStatus(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { newStatus, trackingCode, carrier, trackingUrl, note, forceLifecycleCompletion } = req.body;
    const user = (req as any).user;

    if (!orderId || !newStatus) {
      return res.status(400).json({ error: 'INVALID_SHIPPING_STATUS', message: 'orderId e newStatus são obrigatórios.' });
    }

    if (!isShippingStatus(newStatus)) {
      return res.status(400).json({
        error: 'INVALID_SHIPPING_STATUS',
        message: `Status '${newStatus}' não pertence ao domínio de envio.`
      });
    }

    const trackingVal = validateTrackingInfo({ trackingCode, carrier, trackingUrl });
    if (!trackingVal.valid) {
      return res.status(400).json({ error: trackingVal.error, message: trackingVal.message });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);

    // SHIPPING 2.0: order transition + physical stock consumption are committed
    // by the SAME Firestore transaction. Concurrent requests are automatically
    // retried against the latest order state, and a failed order update can no
    // longer leave inventory consumed with an unshipped order.
    const transitionResult = await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        const err: any = new Error('Pedido não encontrado.');
        err.code = 'ORDER_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      const orderData = orderSnap.data()!;
      const isForcedLifecycleCompletion = forceLifecycleCompletion === true;
      const eligibility = assertShippingOrderEligible(orderData);
      const canRepairLegacyProduction = isForcedLifecycleCompletion && eligibility.error === 'SHIPPING_BLOCKED_PRODUCTION';
      if (!eligibility.eligible && !canRepairLegacyProduction) {
        const err: any = new Error(eligibility.message || 'Pedido não elegível para envio.');
        err.code = eligibility.error || 'SHIPPING_ORDER_NOT_ELIGIBLE';
        err.status = 400;
        throw err;
      }

      const currentShippingStatus = normalizeShippingStatus(
        orderData.shipping?.status || orderData.shippingStatus || 'pending'
      );
      const currentProductionStatus = normalizeProductionStatus(
        orderData.production?.status || orderData.productionStatus || 'waiting'
      );

      const shippingTransitionAllowed = isForcedLifecycleCompletion
        ? canTransitionShippingStatus(currentShippingStatus, newStatus, orderData, true)
        : canTransitionShippingStatus(currentShippingStatus, newStatus, orderData);
      if (!shippingTransitionAllowed) {
        const err: any = new Error(
          `Não é permitido alterar o status de envio de '${currentShippingStatus}' para '${newStatus}'.`
        );
        err.code = 'INVALID_SHIPPING_TRANSITION';
        err.status = 400;
        throw err;
      }

      const timestamp = new Date().toISOString();
      const sanitizedCode = trackingVal.sanitizedTrackingCode || orderData.shipping?.trackingCode || orderData.trackingCode || null;
      const defaultCarrier = isLocalDeliveryOrder(orderData)
        ? (orderData.shippingMethod || orderData.shipping?.method || 'Entrega Própria (Joinville)')
        : 'Correios';
      const sanitizedCarrierName = trackingVal.sanitizedCarrier || orderData.shipping?.carrier || orderData.carrier || defaultCarrier;
      const sanitizedUrl = trackingVal.sanitizedTrackingUrl || orderData.shipping?.trackingUrl || orderData.trackingUrl || null;

      const historyEntry = {
        type: 'shipping_update',
        status: newStatus,
        previousStatus: currentShippingStatus,
        timestamp,
        message: note || `Status de envio alterado para ${newStatus}`,
        operator: user?.email || user?.uid || 'Admin'
      };

      const trackingEvent = {
        eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        status: newStatus,
        timestamp,
        eventAt: timestamp,
        source: 'admin',
        carrier: sanitizedCarrierName,
        trackingCode: sanitizedCode,
        trackingUrl: sanitizedUrl,
        description: String(note || `Status de envio alterado para ${newStatus}`).replace(/<[^>]*>?/gm, '').trim()
      };

      const updatePayload: any = {
        'shipping.status': newStatus,
        shippingStatus: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: admin.firestore.FieldValue.arrayUnion(historyEntry),
        'shipping.trackingEvents': admin.firestore.FieldValue.arrayUnion(trackingEvent)
      };

      if (isForcedLifecycleCompletion && !['ready', 'completed'].includes(currentProductionStatus)) {
        const productionHistoryEntry = {
          type: 'production_update',
          status: 'completed',
          previousStatus: currentProductionStatus,
          timestamp,
          message: 'Produção concluída automaticamente pela correção administrativa do ciclo de expedição.',
          operator: user?.email || user?.uid || 'Admin'
        };
        updatePayload['production.status'] = 'completed';
        updatePayload['production.currentStage'] = 'completed';
        updatePayload.productionStatus = 'completed';
        updatePayload.history = admin.firestore.FieldValue.arrayUnion(productionHistoryEntry, historyEntry);
      }

      if (trackingVal.sanitizedTrackingCode) {
        updatePayload['shipping.trackingCode'] = trackingVal.sanitizedTrackingCode;
        updatePayload.trackingCode = trackingVal.sanitizedTrackingCode;
      }
      if (sanitizedCarrierName) updatePayload['shipping.carrier'] = sanitizedCarrierName;
      if (trackingVal.sanitizedTrackingUrl) {
        updatePayload['shipping.trackingUrl'] = trackingVal.sanitizedTrackingUrl;
        updatePayload.trackingUrl = trackingVal.sanitizedTrackingUrl;
      }
      if (newStatus === 'in_transit') {
        updatePayload['shipping.inTransitAt'] = timestamp;
        updatePayload.inTransitAt = timestamp;
      }
      if (newStatus === 'delivered') {
        updatePayload['shipping.deliveredAt'] = timestamp;
        updatePayload.deliveredAt = timestamp;
        await applyOrderStampStockInTransaction(transaction, db, orderId, orderData.items || [], 'delivery_reconcile');
      }

      if (
        newStatus === 'shipped'
        && currentShippingStatus !== 'shipped'
        && Array.isArray(orderData.items)
        && orderData.items.length > 0
      ) {
        await consumeStockReservationInTransaction(
          transaction,
          db,
          orderId,
          orderData.items,
          `shipping_shipped_${orderId}`,
          orderData
        );
      }

      transaction.update(orderRef, updatePayload);
      return { currentShippingStatus, timestamp };
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'UPDATE_SHIPPING_STATUS',
      resource: 'orders',
      resourceId: orderId,
      metadata: {
        previousStatus: transitionResult.currentShippingStatus,
        newStatus,
        trackingCode,
        carrier,
        note
      },
      ip: req.ip
    });

    logger.info(`🚚 [ADMIN-SHIP] Order ${orderId} shipping status updated: ${transitionResult.currentShippingStatus} -> ${newStatus} by ${user?.email}`);

    const shippingNotificationStage = ['shipped', 'in_transit'].includes(newStatus)
      ? 'shipped'
      : (newStatus === 'delivered' ? 'delivered' : null);
    if (shippingNotificationStage) {
      await dispatchStageNotification({
        orderId,
        newStageId: shippingNotificationStage,
        previousStageId: transitionResult.currentShippingStatus,
        changedBy: user?.email || user?.uid || 'Admin'
      }).catch((notificationError: any) => {
        logger.warn(`⚠️ [ADMIN-SHIP-NOTIF] Pedido ${orderId}: ${notificationError.message}`);
      });
    }

    return res.json({ success: true, orderId, shippingStatus: newStatus });
  } catch (error: any) {
    logger.error(`❌ [ADMIN-SHIP-ERR] ${error.message}`, error);
    if (error?.status === 404 || error?.code === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ error: error.code || 'ORDER_NOT_FOUND', message: error.message });
    }
    if (error?.status === 400) {
      return res.status(400).json({ error: error.code || 'INVALID_SHIPPING_TRANSITION', message: error.message });
    }
    return res.status(500).json({ error: error.code || 'INTERNAL_ERROR', message: error.message || 'Erro ao atualizar status de envio.' });
  }
}

/**
 * Authorizes a return request from a customer (Devolução Autorizada).
 */
export async function authorizeOrderReturnController(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { returnId, reverseShippingCode, notes } = req.body;
    const user = (req as any).user;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório.' });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const updatePayload: Record<string, any> = {
      returnStatus: 'authorized',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (reverseShippingCode) {
      updatePayload['shipping.reverseShippingCode'] = reverseShippingCode;
    }

    const historyEntry = {
      type: 'return_authorization',
      returnId: returnId || null,
      status: 'authorized',
      reverseShippingCode: reverseShippingCode || null,
      notes: notes || 'Devolução autorizada pelo administrador',
      timestamp: new Date().toISOString(),
      operator: user?.email || user?.uid || 'Admin'
    };

    updatePayload.history = admin.firestore.FieldValue.arrayUnion(historyEntry);

    await orderRef.update(updatePayload);

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'AUTHORIZE_ORDER_RETURN',
      resource: 'orders',
      resourceId: orderId,
      metadata: { returnId, reverseShippingCode },
      ip: req.ip
    });

    return res.json({ success: true, orderId, returnStatus: 'authorized' });
  } catch (error: any) {
    logger.error(`❌ [ADMIN-AUTHORIZE-RETURN-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao autorizar devolução.' });
  }
}

/**
 * Handles physical package reception and item conference in warehouse (Recebimento Físico e Conferência).
 * Calls processPhysicalReturn which validates condition, resellability, and quantity limits.
 */
export async function processPhysicalReceiveController(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { items, reason, returnId, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório.' });
    }

    if (!returnId || typeof returnId !== 'string' || !returnId.trim()) {
      return res.status(400).json({
        error: 'MISSING_RETURN_ID',
        message: 'O ID de devolução (returnId) é obrigatório e deve ser estável para garantir idempotência.'
      });
    }

    const cleanReturnId = returnId.trim();

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;
    const itemsToProcess = Array.isArray(items) && items.length > 0 ? items : (orderData.items || []);

    const effectiveKey = `phys_receive_${orderId}_${cleanReturnId}`;

    const result = await processPhysicalReturn(orderId, itemsToProcess, effectiveKey, {
      reason: reason || 'Recebimento e conferência física do retorno',
      operator: user?.email || user?.uid || 'Admin',
      returnId: cleanReturnId
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'PROCESS_PHYSICAL_RECEIVE',
      resource: 'orders',
      resourceId: orderId,
      metadata: { returnId: cleanReturnId, itemsCount: itemsToProcess.length, result },
      ip: req.ip
    });

    return res.json({
      success: true,
      orderId,
      returnStatus: 'inspected',
      result
    });
  } catch (error: any) {
    logger.error(`❌ [ADMIN-PHYSICAL-RECEIVE-ERR] ${error.message}`, error);
    if (error.message?.includes('INVALID_RETURN_QUANTITY')) {
      return res.status(400).json({ error: 'INVALID_RETURN_QUANTITY', message: error.message });
    }
    return res.status(500).json({ error: error.message || 'Erro ao processar recebimento físico.' });
  }
}

/**
 * Registra pagamento manual / quitação parcial ou total de um pedido.
 * Executa em transação atômica única com chave de idempotência obrigatória.
 */
export async function registerManualPaymentController(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { amount, method, reason, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A chave de idempotência (idempotencyKey) é obrigatória para registrar pagamentos.'
      });
    }

    const rawAmount = Number(amount);
    const parsedAmount = roundMoney(rawAmount);
    if (!orderId || !Number.isFinite(rawAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        error: 'INVALID_PAYMENT_AMOUNT',
        message: 'Valor de pagamento deve ser um número positivo maior que zero.'
      });
    }

    const db = getDb();
    const eventId = deriveLedgerEventId(idempotencyKey.trim());
    const eventRef = db.collection('financial_events').doc(eventId);
    const orderRef = db.collection('orders').doc(orderId);

    const transactionResult = await db.runTransaction(async (transaction) => {
      // 1. Verificar idempotência no ledger
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists) {
        const existingEvent = eventSnap.data() as FinancialEvent;
        const orderSnap = await transaction.get(orderRef);
        const orderData = orderSnap.exists ? orderSnap.data()! : {};
        return {
          idempotentReplay: true,
          success: true,
          orderId,
          paymentStatus: existingEvent.newStatus || getOrderPaymentStatus(orderData),
          paidAmount: existingEvent.newPaidAmount ?? getOrderPaidAmount(orderData),
          pendingAmount: existingEvent.newPendingAmount ?? getOrderPendingAmount(orderData),
          amountPaid: existingEvent.newPaidAmount ?? getOrderPaidAmount(orderData),
          balanceDue: existingEvent.newPendingAmount ?? getOrderPendingAmount(orderData),
          eventId: eventRef.id
        };
      }

      // 2. Ler pedido
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        const notFoundErr: any = new Error('Pedido não encontrado.');
        notFoundErr.code = 'ORDER_NOT_FOUND';
        notFoundErr.status = 404;
        throw notFoundErr;
      }

      const orderData = orderSnap.data()!;
      const currentPaid = getOrderPaidAmount(orderData);
      const currentPending = getOrderPendingAmount(orderData);
      const currentStatus = getOrderPaymentStatus(orderData);

      // 3. Validar se o valor informado não excede o saldo devedor
      if (parsedAmount > currentPending) {
        const excessErr: any = new Error(`Valor informado (R$ ${parsedAmount.toFixed(2)}) é superior ao saldo devedor restante (R$ ${currentPending.toFixed(2)}).`);
        excessErr.code = 'EXCESS_PAYMENT_AMOUNT';
        excessErr.status = 400;
        throw excessErr;
      }

      // 4. Calcular novos saldos e status
      const newPaidAmount = roundMoney(currentPaid + parsedAmount);
      const newPendingAmount = roundMoney(Math.max(0, currentPending - parsedAmount));
      const newStatus: PaymentStatus = newPendingAmount === 0 ? 'approved' : 'partially_paid';

      const timestamp = new Date().toISOString();
      const paymentMethodUsed = method ? String(method).trim().toUpperCase() : 'MANUAL';
      const effectiveReason = reason ? String(reason).trim() : `Pagamento manual de R$ ${parsedAmount.toFixed(2)} via ${paymentMethodUsed}`;

      const paymentLogEntry = {
        id: eventId,
        amount: parsedAmount,
        method: paymentMethodUsed,
        notes: effectiveReason,
        date: timestamp,
        recordedBy: user?.email || user?.uid || 'Admin'
      };

      const historyEntry = {
        type: 'manual_payment',
        amount: parsedAmount,
        status: newStatus,
        timestamp,
        message: effectiveReason,
        operator: user?.email || user?.uid || 'Admin'
      };

      const updatePayload: any = {
        'payment.paidAmount': newPaidAmount,
        'payment.pendingAmount': newPendingAmount,
        'payment.status': newStatus,
        'payment.method': paymentMethodUsed,
        amountPaid: newPaidAmount,
        balanceDue: newPendingAmount,
        paymentStatus: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentLogs: admin.firestore.FieldValue.arrayUnion(paymentLogEntry),
        history: admin.firestore.FieldValue.arrayUnion(historyEntry)
      };

      const installments = Array.isArray(orderData.payment?.installments)
        ? orderData.payment.installments
        : (Array.isArray(orderData.installments) ? orderData.installments : []);
      if (installments.length > 0) {
        let amountToAllocate = parsedAmount;
        const updatedInstallments = installments.map((installment: any) => {
          if (amountToAllocate <= 0 || String(installment.status).toLowerCase() === 'paid') return installment;
          const installmentAmount = roundMoney(Math.max(0, Number(installment.amount || 0)));
          const alreadyPaid = roundMoney(Math.max(0, Number(installment.paidAmount || 0)));
          const remaining = roundMoney(Math.max(0, installmentAmount - alreadyPaid));
          const allocated = Math.min(remaining, amountToAllocate);
          amountToAllocate = roundMoney(amountToAllocate - allocated);
          const installmentPaid = roundMoney(alreadyPaid + allocated);
          return {
            ...installment,
            paidAmount: installmentPaid,
            status: installmentPaid + 0.001 >= installmentAmount ? 'paid' : 'pending',
            ...(installmentPaid + 0.001 >= installmentAmount ? { paidAt: timestamp } : {})
          };
        });
        updatePayload['payment.installments'] = updatedInstallments;
        updatePayload.installments = updatedInstallments;
      }

      if (newStatus === 'approved') {
        updatePayload['payment.paidAt'] = timestamp;
      }

      // 5. Atualizar pedido na transação
      transaction.update(orderRef, updatePayload);

      // 6. Criar evento no ledger financeiro de forma atômica
      const eventData = {
        id: eventRef.id,
        orderId,
        type: newStatus === 'approved' ? 'payment_approved' : 'partial_payment',
        amount: parsedAmount,
        previousStatus: currentStatus,
        newStatus,
        previousPaidAmount: currentPaid,
        newPaidAmount,
        previousPendingAmount: currentPending,
        newPendingAmount,
        previousRefundedAmount: getOrderRefundedAmount(orderData),
        newRefundedAmount: getOrderRefundedAmount(orderData),
        paymentMethod: paymentMethodUsed,
        provider: 'manual',
        actorId: user?.uid,
        actorEmail: user?.email,
        reason: effectiveReason,
        idempotencyKey: idempotencyKey.trim(),
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(eventRef, eventData);

      return {
        idempotentReplay: false,
        success: true,
        orderId,
        paymentStatus: newStatus,
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
        amountPaid: newPaidAmount,
        balanceDue: newPendingAmount,
        eventId: eventRef.id,
        paymentMethodUsed,
        effectiveReason
      };
    });

    if (transactionResult.idempotentReplay) {
      logger.info(`⏹️ [MANUAL-PAY-REPLAY] Idempotent replay for key '${idempotencyKey}' on order ${orderId}`);
      return res.json(transactionResult);
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'REGISTER_MANUAL_PAYMENT',
      resource: 'orders',
      resourceId: orderId,
      metadata: { 
        amount: parsedAmount, 
        method: transactionResult.paymentMethodUsed, 
        newStatus: transactionResult.paymentStatus, 
        newPaidAmount: transactionResult.paidAmount, 
        newPendingAmount: transactionResult.pendingAmount,
        idempotencyKey: idempotencyKey.trim()
      },
      ip: req.ip
    });

    logger.info(`💰 [MANUAL-PAY] Order ${orderId} received R$ ${parsedAmount} via ${transactionResult.paymentMethodUsed} (New Status: ${transactionResult.paymentStatus})`);

    if (transactionResult.paymentStatus === 'approved') {
      await dispatchStageNotification({
        orderId,
        newStageId: 'payment_approved',
        previousStageId: 'payment_pending',
        changedBy: user?.email || user?.uid || 'Admin'
      }).catch((notificationError: any) => {
        logger.warn(`⚠️ [MANUAL-PAY-NOTIF] Pedido ${orderId}: ${notificationError.message}`);
      });
    }

    return res.json(transactionResult);
  } catch (error: any) {
    if (error.code === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: error.message });
    }
    if (error.code === 'EXCESS_PAYMENT_AMOUNT') {
      return res.status(400).json({ error: 'EXCESS_PAYMENT_AMOUNT', message: error.message });
    }
    logger.error(`❌ [MANUAL-PAY-ERR] ${error.message}`, error);
    return res.status(error.status || 500).json({ error: error.code || 'INTERNAL_ERROR', message: error.message || 'Erro ao registrar pagamento manual.' });
  }
}

/**
 * Processa estorno / reembolso parcial ou total de um pedido.
 * Executa em transação atômica única com chave de idempotência obrigatória.
 * ORDER CANCELLED != PAYMENT REFUNDED
 */
export async function processOrderRefundController(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { amount, refundAmount, reason, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A chave de idempotência (idempotencyKey) é obrigatória para processar estornos.'
      });
    }

    const parsedRefundAmount = Number(refundAmount ?? amount);
    if (!orderId || isNaN(parsedRefundAmount) || parsedRefundAmount <= 0) {
      return res.status(400).json({
        error: 'INVALID_REFUND_AMOUNT',
        message: 'Valor de reembolso deve ser um número positivo maior que zero.'
      });
    }

    const db = getDb();
    const eventId = deriveLedgerEventId(idempotencyKey.trim());
    const eventRef = db.collection('financial_events').doc(eventId);
    const orderRef = db.collection('orders').doc(orderId);

    const transactionResult = await db.runTransaction(async (transaction) => {
      // 1. Verificar idempotência no ledger
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists) {
        const existingEvent = eventSnap.data() as FinancialEvent;
        const orderSnap = await transaction.get(orderRef);
        const orderData = orderSnap.exists ? orderSnap.data()! : {};
        return {
          idempotentReplay: true,
          success: true,
          orderId,
          paymentStatus: existingEvent.newStatus || getOrderPaymentStatus(orderData),
          refundedAmount: existingEvent.newRefundedAmount ?? getOrderRefundedAmount(orderData),
          eventId: eventRef.id
        };
      }

      // 2. Ler pedido
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        const notFoundErr: any = new Error('Pedido não encontrado.');
        notFoundErr.code = 'ORDER_NOT_FOUND';
        notFoundErr.status = 404;
        throw notFoundErr;
      }

      const orderData = orderSnap.data()!;
      const totalPaid = getOrderPaidAmount(orderData);
      const currentRefunded = getOrderRefundedAmount(orderData);
      const availableToRefund = Math.max(0, totalPaid - currentRefunded);
      const currentStatus = getOrderPaymentStatus(orderData);

      if (availableToRefund <= 0) {
        const cannotRefundErr: any = new Error('Este pedido não possui valores disponíveis para estorno/reembolso.');
        cannotRefundErr.code = 'CANNOT_REFUND';
        cannotRefundErr.status = 400;
        throw cannotRefundErr;
      }

      if (parsedRefundAmount > availableToRefund + 0.001) {
        const exceedErr: any = new Error(`Valor do estorno (R$ ${parsedRefundAmount.toFixed(2)}) é maior que o saldo disponível para reembolso (R$ ${availableToRefund.toFixed(2)}).`);
        exceedErr.code = 'REFUND_EXCEEDS_PAID';
        exceedErr.status = 400;
        throw exceedErr;
      }

      // 3. Calcular novos valores
      const newRefundedAmount = currentRefunded + parsedRefundAmount;
      const isTotalRefund = newRefundedAmount >= totalPaid - 0.001;
      const newStatus: PaymentStatus = isTotalRefund ? 'refunded' : 'partially_refunded';

      const timestamp = new Date().toISOString();
      const effectiveReason = reason ? String(reason).trim() : `Estorno/reembolso de R$ ${parsedRefundAmount.toFixed(2)}`;

      const historyEntry = {
        eventId,
        type: 'refund',
        amount: parsedRefundAmount,
        status: newStatus,
        timestamp,
        message: effectiveReason,
        operator: user?.email || user?.uid || 'Admin'
      };

      const updatePayload: any = {
        'payment.refundedAmount': newRefundedAmount,
        'payment.status': newStatus,
        refundedAmount: newRefundedAmount,
        paymentStatus: newStatus,
        'payment.refundedAt': timestamp,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundLogs: admin.firestore.FieldValue.arrayUnion({
          id: eventId,
          amount: parsedRefundAmount,
          date: timestamp,
          status: newStatus,
          provider: 'manual'
        }),
        history: admin.firestore.FieldValue.arrayUnion(historyEntry)
      };

      // 4. Atualizar pedido na transação
      transaction.update(orderRef, updatePayload);

      // 5. Criar evento no ledger financeiro de forma atômica
      const eventData = {
        id: eventRef.id,
        orderId,
        type: isTotalRefund ? 'refund' : 'partial_refund',
        amount: parsedRefundAmount,
        previousStatus: currentStatus,
        newStatus,
        previousPaidAmount: totalPaid,
        newPaidAmount: totalPaid,
        previousPendingAmount: getOrderPendingAmount(orderData),
        newPendingAmount: getOrderPendingAmount(orderData),
        previousRefundedAmount: currentRefunded,
        newRefundedAmount,
        paymentMethod: orderData.payment?.method || 'MANUAL',
        provider: 'manual',
        actorId: user?.uid,
        actorEmail: user?.email,
        reason: effectiveReason,
        idempotencyKey: idempotencyKey.trim(),
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(eventRef, eventData);

      return {
        idempotentReplay: false,
        success: true,
        orderId,
        paymentStatus: newStatus,
        refundedAmount: newRefundedAmount,
        eventId: eventRef.id,
        effectiveReason
      };
    });

    if (transactionResult.idempotentReplay) {
      logger.info(`⏹️ [REFUND-REPLAY] Idempotent replay for key '${idempotencyKey}' on order ${orderId}`);
      return res.json(transactionResult);
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'PROCESS_REFUND',
      resource: 'orders',
      resourceId: orderId,
      metadata: { 
        refundAmount: parsedRefundAmount, 
        newStatus: transactionResult.paymentStatus, 
        newRefundedAmount: transactionResult.refundedAmount,
        idempotencyKey: idempotencyKey.trim()
      },
      ip: req.ip
    });

    logger.info(`💸 [REFUND] Order ${orderId} refunded R$ ${parsedRefundAmount} (New Status: ${transactionResult.paymentStatus})`);

    return res.json(transactionResult);
  } catch (error: any) {
    if (error.code === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: error.message });
    }
    if (error.code === 'CANNOT_REFUND' || error.code === 'REFUND_EXCEEDS_PAID') {
      return res.status(400).json({ error: error.code, message: error.message });
    }
    logger.error(`❌ [REFUND-ERR] ${error.message}`, error);
    return res.status(error.status || 500).json({ error: error.code || 'INTERNAL_ERROR', message: error.message || 'Erro ao processar reembolso.' });
  }
}

/**
 * Reverte um estorno lançado por engano sem apagar o histórico financeiro.
 * O pagamento original continua válido e o ledger recebe um evento corretivo
 * imutável, idempotente e atômico.
 */
export async function reverseOrderRefundController(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { reason, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED', message: 'ID do pedido é obrigatório.' });
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A chave de idempotência é obrigatória para reverter estornos.' });
    }

    const db = getDb();
    const eventId = deriveLedgerEventId(idempotencyKey.trim());
    const eventRef = db.collection('financial_events').doc(eventId);
    const orderRef = db.collection('orders').doc(orderId);

    const result = await db.runTransaction(async (transaction) => {
      const existingEvent = await transaction.get(eventRef);
      if (existingEvent.exists) {
        const existing = existingEvent.data() as FinancialEvent;
        return { idempotentReplay: true, success: true, orderId, paymentStatus: existing.newStatus, refundedAmount: existing.newRefundedAmount, eventId: eventRef.id };
      }

      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        const err: any = new Error('Pedido não encontrado.'); err.code = 'ORDER_NOT_FOUND'; err.status = 404; throw err;
      }
      const order = orderSnap.data()!;
      const paidAmount = getOrderPaidAmount(order);
      const refundedAmount = getOrderRefundedAmount(order);
      if (refundedAmount <= 0) {
        const err: any = new Error('Este pedido não possui estorno pendente de reversão.'); err.code = 'NO_REFUND_TO_REVERSE'; err.status = 400; throw err;
      }
      if (refundedAmount > paidAmount + 0.001) {
        const err: any = new Error('O valor estornado é inconsistente com o total pago e requer revisão manual.'); err.code = 'REFUND_AMOUNT_INCONSISTENT'; err.status = 409; throw err;
      }

      const timestamp = new Date().toISOString();
      const currentStatus = getOrderPaymentStatus(order);
      const pendingAmount = getOrderPendingAmount(order);
      const effectiveReason = String(reason || '').trim() || `Correção de estorno lançado por engano — pedido #${orderId}`;
      const paymentMethod = order.payment?.method || order.paymentMethod || 'MANUAL';
      const historyEntry = { eventId, type: 'refund_reversal', amount: refundedAmount, status: 'approved', timestamp, message: effectiveReason, operator: user?.email || user?.uid || 'Admin' };

      transaction.update(orderRef, {
        'payment.refundedAmount': 0,
        'payment.status': 'approved',
        'payment.pendingAmount': 0,
        'payment.refundReversedAt': timestamp,
        'payment.refundReversalReason': effectiveReason,
        refundedAmount: 0,
        paymentStatus: 'approved',
        amountPaid: paidAmount,
        balanceDue: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: admin.firestore.FieldValue.arrayUnion(historyEntry)
      });
      transaction.set(eventRef, {
        id: eventRef.id, orderId, type: 'refund_reversal', amount: refundedAmount,
        previousStatus: currentStatus, newStatus: 'approved',
        previousPaidAmount: paidAmount, newPaidAmount: paidAmount,
        previousPendingAmount: pendingAmount, newPendingAmount: 0,
        previousRefundedAmount: refundedAmount, newRefundedAmount: 0,
        paymentMethod, provider: 'manual', actorId: user?.uid, actorEmail: user?.email,
        reason: effectiveReason, idempotencyKey: idempotencyKey.trim(), createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { idempotentReplay: false, success: true, orderId, paymentStatus: 'approved', paidAmount, refundedAmount: 0, eventId: eventRef.id, reversalAmount: refundedAmount, effectiveReason };
    });

    if (!result.idempotentReplay) {
      await recordAuditLog({ userId: user?.uid, userEmail: user?.email, action: 'REVERSE_ORDER_REFUND', resource: 'orders', resourceId: orderId, metadata: { reversalAmount: result.reversalAmount, paidAmount: result.paidAmount, idempotencyKey: idempotencyKey.trim() }, ip: req.ip });
      logger.info(`↩️ [REFUND-REVERSAL] Order ${orderId} restored R$ ${result.reversalAmount} as paid.`);
    }
    return res.json(result);
  } catch (error: any) {
    if (error.code === 'ORDER_NOT_FOUND') return res.status(404).json({ error: error.code, message: error.message });
    if (['NO_REFUND_TO_REVERSE', 'REFUND_AMOUNT_INCONSISTENT'].includes(error.code)) return res.status(error.status || 400).json({ error: error.code, message: error.message });
    logger.error(`❌ [REFUND-REVERSAL-ERR] ${error.message}`, error);
    return res.status(error.status || 500).json({ error: error.code || 'INTERNAL_ERROR', message: error.message || 'Erro ao reverter estorno.' });
  }
}

/** Corrige um saldo residual de uma reversão já registrada, sem nova movimentação financeira. */
export async function repairRefundReversalBalanceController(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { idempotencyKey } = req.body;
    const user = (req as any).user;
    if (!orderId || !idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Pedido e chave de idempotência são obrigatórios.' });
    }
    const db = getDb(), eventId = deriveLedgerEventId(idempotencyKey.trim());
    const eventRef = db.collection('financial_events').doc(eventId), orderRef = db.collection('orders').doc(orderId);
    const result = await db.runTransaction(async transaction => {
      const existing = await transaction.get(eventRef);
      if (existing.exists) return { idempotentReplay: true, success: true, orderId, eventId };
      const snap = await transaction.get(orderRef);
      if (!snap.exists) { const err: any = new Error('Pedido não encontrado.'); err.code = 'ORDER_NOT_FOUND'; err.status = 404; throw err; }
      const order = snap.data()!;
      const pendingAmount = getOrderPendingAmount(order), paidAmount = getOrderPaidAmount(order), refundedAmount = getOrderRefundedAmount(order);
      if (!order.payment?.refundReversedAt || pendingAmount <= 0 || paidAmount <= 0 || refundedAmount > 0) {
        const err: any = new Error('O pedido não possui saldo residual elegível para correção de reversão.'); err.code = 'NO_REFUND_REVERSAL_RESIDUAL'; err.status = 400; throw err;
      }
      const timestamp = new Date().toISOString();
      const reason = `Reconciliação de saldo residual após reversão de estorno — pedido #${orderId}`;
      transaction.update(orderRef, {
        'payment.pendingAmount': 0, 'payment.status': 'approved', paymentStatus: 'approved', balanceDue: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: admin.firestore.FieldValue.arrayUnion({ eventId, type: 'refund_reversal_balance_repair', amount: 0, status: 'approved', timestamp, message: reason, operator: user?.email || user?.uid || 'Admin' })
      });
      transaction.set(eventRef, { id: eventId, orderId, type: 'manual_adjustment', amount: 0, previousStatus: getOrderPaymentStatus(order), newStatus: 'approved', previousPaidAmount: paidAmount, newPaidAmount: paidAmount, previousPendingAmount: pendingAmount, newPendingAmount: 0, previousRefundedAmount: 0, newRefundedAmount: 0, provider: 'manual', actorId: user?.uid, actorEmail: user?.email, reason, idempotencyKey: idempotencyKey.trim(), createdAt: timestamp, recordedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { idempotentReplay: false, success: true, orderId, eventId, paymentStatus: 'approved', paidAmount, pendingAmount: 0 };
    });
    if (!result.idempotentReplay) await recordAuditLog({ userId: user?.uid, userEmail: user?.email, action: 'REPAIR_REFUND_REVERSAL_BALANCE', resource: 'orders', resourceId: orderId, metadata: { eventId, idempotencyKey: idempotencyKey.trim() }, ip: req.ip });
    return res.json(result);
  } catch (error: any) {
    if (error.code === 'ORDER_NOT_FOUND') return res.status(404).json({ error: error.code, message: error.message });
    if (error.code === 'NO_REFUND_REVERSAL_RESIDUAL') return res.status(400).json({ error: error.code, message: error.message });
    logger.error(`❌ [REFUND-REVERSAL-REPAIR-ERR] ${error.message}`, error);
    return res.status(error.status || 500).json({ error: error.code || 'INTERNAL_ERROR', message: error.message || 'Erro ao reconciliar saldo.' });
  }
}

/** Corrige o total cadastrado de um pedido cuja reversão confirmou o valor efetivamente pago. */
export async function correctRefundReversalOrderTotalController(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { correctedTotal, idempotencyKey } = req.body;
    const user = (req as any).user;
    const amount = Number(correctedTotal);
    if (!orderId || !idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'INVALID_TOTAL_CORRECTION', message: 'Pedido, valor positivo e chave de idempotência são obrigatórios.' });
    }
    const db = getDb(), eventId = deriveLedgerEventId(idempotencyKey.trim());
    const eventRef = db.collection('financial_events').doc(eventId), orderRef = db.collection('orders').doc(orderId);
    const result = await db.runTransaction(async transaction => {
      const existing = await transaction.get(eventRef);
      if (existing.exists) return { idempotentReplay: true, success: true, orderId, eventId };
      const snap = await transaction.get(orderRef);
      if (!snap.exists) { const err: any = new Error('Pedido não encontrado.'); err.code = 'ORDER_NOT_FOUND'; err.status = 404; throw err; }
      const order = snap.data()!;
      const paidAmount = getOrderPaidAmount(order), refundedAmount = getOrderRefundedAmount(order);
      if (!order.payment?.refundReversedAt || refundedAmount > 0 || Math.abs(amount - paidAmount) > 0.005) {
        const err: any = new Error('A correção deve corresponder exatamente ao valor pago após a reversão de estorno.'); err.code = 'INVALID_REFUND_REVERSAL_TOTAL'; err.status = 400; throw err;
      }
      const timestamp = new Date().toISOString();
      const reason = `Correção do total para o valor efetivamente pago após reversão de estorno — pedido #${orderId}`;
      transaction.update(orderRef, {
        total: amount, totalAmount: amount, 'pricing.total': amount,
        'payment.paidAmount': paidAmount, 'payment.pendingAmount': 0, 'payment.status': 'approved',
        amountPaid: paidAmount, balanceDue: 0, paymentStatus: 'approved',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: admin.firestore.FieldValue.arrayUnion({ eventId, type: 'refund_reversal_total_correction', amount, status: 'approved', timestamp, message: reason, operator: user?.email || user?.uid || 'Admin' })
      });
      transaction.set(eventRef, { id: eventId, orderId, type: 'manual_adjustment', amount: 0, previousStatus: getOrderPaymentStatus(order), newStatus: 'approved', previousPaidAmount: paidAmount, newPaidAmount: paidAmount, previousPendingAmount: getOrderPendingAmount(order), newPendingAmount: 0, previousRefundedAmount: 0, newRefundedAmount: 0, provider: 'manual', actorId: user?.uid, actorEmail: user?.email, reason, idempotencyKey: idempotencyKey.trim(), createdAt: timestamp, recordedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { idempotentReplay: false, success: true, orderId, eventId, correctedTotal: amount, paymentStatus: 'approved' };
    });
    if (!result.idempotentReplay) await recordAuditLog({ userId: user?.uid, userEmail: user?.email, action: 'CORRECT_REFUND_REVERSAL_ORDER_TOTAL', resource: 'orders', resourceId: orderId, metadata: { correctedTotal: amount, idempotencyKey: idempotencyKey.trim() }, ip: req.ip });
    return res.json(result);
  } catch (error: any) {
    if (error.code === 'ORDER_NOT_FOUND') return res.status(404).json({ error: error.code, message: error.message });
    if (error.code === 'INVALID_REFUND_REVERSAL_TOTAL') return res.status(400).json({ error: error.code, message: error.message });
    logger.error(`❌ [REFUND-REVERSAL-TOTAL-ERR] ${error.message}`, error);
    return res.status(error.status || 500).json({ error: error.code || 'INTERNAL_ERROR', message: error.message || 'Erro ao corrigir total do pedido.' });
  }
}

/**
 * Retorna o histórico de eventos financeiros (Ledger) de um pedido.
 */
export async function getOrderFinancialEventsController(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório.' });
    }

    const events = await getFinancialEventsForOrder(orderId);
    return res.json({ success: true, orderId, events });
  } catch (error: any) {
    logger.error(`❌ [ORDER-FINANCIAL-EVENTS-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao buscar eventos financeiros.' });
  }
}

/**
 * Retorna o Ledger global de eventos financeiros da loja.
 */
export async function getFinancialLedgerController(req: Request, res: Response) {
  try {
    const limitCount = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const events = await getFinancialLedger(limitCount);
    return res.json({ success: true, events, count: events.length });
  } catch (error: any) {
    logger.error(`❌ [FINANCIAL-LEDGER-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao buscar ledger financeiro.' });
  }
}

/**
 * Cria um lançamento de Despesa/Receita operacional no Fluxo de Caixa de forma idempotente e auditável.
 */
export async function createFinancialExpenseController(req: Request, res: Response) {
  try {
    const { category, subcategory, description, amount, date, type, paymentMethod, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Chave de idempotência é obrigatória.' });
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'O valor da despesa/lançamento deve ser um número positivo maior que zero.' });
    }

    const validCategories = ['RECEITA', 'COGS', 'DESPESA_VARIAVEL', 'DESPESA_FIXA', 'MARKETING', 'FRETE', 'TAXA_GATEWAY', 'INVESTIMENTO', 'AJUSTE'];
    const rawCategory = String(category || 'DESPESA_FIXA').trim().toUpperCase();
    const normalizedCategory = validCategories.includes(rawCategory) ? rawCategory : 'DESPESA_FIXA';

    const entryType: 'in' | 'out' = type === 'in' || normalizedCategory === 'RECEITA' ? 'in' : 'out';
    const entryDate = date && !isNaN(new Date(date).getTime()) ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const effectiveDesc = String(description || '').trim() || 'Lançamento financeiro manual';
    const effectiveKey = idempotencyKey.trim();

    const db = getDb();
    const docId = deriveLedgerEventId(effectiveKey);
    const docRef = db.collection('financial_cashflow').doc(docId);

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (snap.exists) {
        return { idempotentReplay: true, id: docId, data: snap.data() };
      }

      const timestamp = new Date().toISOString();
      const payload = {
        id: docId,
        type: entryType,
        category: normalizedCategory,
        subcategory: subcategory ? String(subcategory).trim() : '',
        description: effectiveDesc,
        amount: Number(parsedAmount.toFixed(2)),
        date: entryDate,
        paymentMethod: paymentMethod ? String(paymentMethod).trim() : 'Manual',
        status: 'paid',
        idempotencyKey: effectiveKey,
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        createdAt: timestamp,
        updatedAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(docRef, payload);

      // Ledger event
      const eventRef = db.collection('financial_events').doc(docId);
      transaction.set(eventRef, {
        id: docId,
        orderId: 'CASHFLOW_EXPENSE',
        type: 'expense_created',
        amount: Number(parsedAmount.toFixed(2)),
        category: normalizedCategory,
        actorId: user?.uid || 'admin',
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        reason: effectiveDesc,
        idempotencyKey: effectiveKey,
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { idempotentReplay: false, id: docId, data: payload };
    });

    if (result.idempotentReplay) {
      logger.info(`⏹️ [CASHFLOW-REPLAY] Idempotent replay for key '${effectiveKey}'`);
      return res.json({ success: true, idempotentReplay: true, entry: result.data });
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'CREATE_FINANCIAL_EXPENSE',
      resource: 'financial_cashflow',
      resourceId: docId,
      metadata: { amount: parsedAmount, category: normalizedCategory, type: entryType, idempotencyKey: effectiveKey },
      ip: req.ip
    });

    logger.info(`💰 [CASHFLOW] Created financial entry R$ ${parsedAmount} [${normalizedCategory}] (${docId})`);
    return res.status(200).json({ success: true, entry: result.data });
  } catch (error: any) {
    logger.error(`❌ [CREATE-EXPENSE-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao criar despesa/lançamento financeiro.' });
  }
}

/**
 * Cancela/anula (void) um investimento de forma não-destrutiva e auditada.
 */
export async function voidFinancialInvestmentController(req: Request, res: Response) {
  try {
    const { investmentId, reason, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!investmentId || typeof investmentId !== 'string') {
      return res.status(400).json({ error: 'INVESTMENT_ID_REQUIRED', message: 'investmentId é obrigatório.' });
    }
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'idempotencyKey é obrigatório.' });
    }

    const effectiveReason = String(reason || '').trim() || 'Estorno/cancelamento de investimento';
    const effectiveKey = idempotencyKey.trim();

    const db = getDb();
    const docRef = db.collection('financial_investments').doc(investmentId.trim());

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw { code: 'INVESTMENT_NOT_FOUND', message: 'Investimento não encontrado.' };
      }

      const current = snap.data() || {};
      if (current.status === 'voided') {
        return { alreadyVoided: true, id: investmentId, entry: current };
      }

      const timestamp = new Date().toISOString();
      const updated = {
        ...current,
        status: 'voided',
        voidedAt: timestamp,
        voidReason: effectiveReason,
        voidedBy: user?.email,
        updatedAt: timestamp
      };

      transaction.update(docRef, updated);

      const eventId = deriveLedgerEventId(effectiveKey);
      const eventRef = db.collection('financial_events').doc(eventId);
      transaction.set(eventRef, {
        id: eventId,
        orderId: investmentId,
        type: 'investment_voided',
        amount: current.amount || 0,
        category: 'INVESTIMENTO',
        actorId: user?.uid,
        actorEmail: user?.email,
        reason: effectiveReason,
        idempotencyKey: effectiveKey,
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { alreadyVoided: false, id: investmentId, entry: updated };
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'VOID_FINANCIAL_INVESTMENT',
      resource: 'financial_investments',
      resourceId: investmentId,
      metadata: { reason: effectiveReason, idempotencyKey: effectiveKey },
      ip: req.ip
    });

    logger.info(`🚫 [INVESTMENT-VOID] Voided investment entry ${investmentId}`);
    return res.json({ success: true, entry: result.entry });
  } catch (error: any) {
    if (error.code === 'INVESTMENT_NOT_FOUND') {
      return res.status(404).json({ error: error.code, message: error.message });
    }
    logger.error(`❌ [VOID-INVESTMENT-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao anular investimento.' });
  }
}

/**
 * Cancela/anula (void) um registro de tráfego pago de forma não-destrutiva e auditada.
 */
export async function voidFinancialTrafficController(req: Request, res: Response) {
  try {
    const { trafficId, reason, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!trafficId || typeof trafficId !== 'string') {
      return res.status(400).json({ error: 'TRAFFIC_ID_REQUIRED', message: 'trafficId é obrigatório.' });
    }
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'idempotencyKey é obrigatório.' });
    }

    const effectiveReason = String(reason || '').trim() || 'Estorno/cancelamento de tráfego pago';
    const effectiveKey = idempotencyKey.trim();

    const db = getDb();
    const docRef = db.collection('financial_traffic').doc(trafficId.trim());

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw { code: 'TRAFFIC_NOT_FOUND', message: 'Registro de tráfego não encontrado.' };
      }

      const current = snap.data() || {};
      if (current.status === 'voided') {
        return { alreadyVoided: true, id: trafficId, entry: current };
      }

      const timestamp = new Date().toISOString();
      const updated = {
        ...current,
        status: 'voided',
        voidedAt: timestamp,
        voidReason: effectiveReason,
        voidedBy: user?.email,
        updatedAt: timestamp
      };

      transaction.update(docRef, updated);

      const eventId = deriveLedgerEventId(effectiveKey);
      const eventRef = db.collection('financial_events').doc(eventId);
      transaction.set(eventRef, {
        id: eventId,
        orderId: trafficId,
        type: 'traffic_voided',
        amount: current.amountSpent || 0,
        category: 'MARKETING',
        actorId: user?.uid,
        actorEmail: user?.email,
        reason: effectiveReason,
        idempotencyKey: effectiveKey,
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { alreadyVoided: false, id: trafficId, entry: updated };
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'VOID_FINANCIAL_TRAFFIC',
      resource: 'financial_traffic',
      resourceId: trafficId,
      metadata: { reason: effectiveReason, idempotencyKey: effectiveKey },
      ip: req.ip
    });

    logger.info(`🚫 [TRAFFIC-VOID] Voided traffic entry ${trafficId}`);
    return res.json({ success: true, entry: result.entry });
  } catch (error: any) {
    if (error.code === 'TRAFFIC_NOT_FOUND') {
      return res.status(404).json({ error: error.code, message: error.message });
    }
    logger.error(`❌ [VOID-TRAFFIC-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao anular tráfego pago.' });
  }
}
export async function voidFinancialExpenseController(req: Request, res: Response) {
  try {
    const { expenseId, reason, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!expenseId || typeof expenseId !== 'string') {
      return res.status(400).json({ error: 'EXPENSE_ID_REQUIRED', message: 'expenseId é obrigatório.' });
    }
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'idempotencyKey é obrigatório.' });
    }

    const effectiveReason = String(reason || '').trim() || 'Estorno/cancelamento de despesa';
    const effectiveKey = idempotencyKey.trim();

    const db = getDb();
    const docRef = db.collection('financial_cashflow').doc(expenseId.trim());

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw { code: 'EXPENSE_NOT_FOUND', message: 'Lançamento financeiro não encontrado.' };
      }

      const current = snap.data() || {};
      if (current.status === 'voided') {
        return { alreadyVoided: true, id: expenseId, entry: current };
      }

      const timestamp = new Date().toISOString();
      const updated = {
        ...current,
        status: 'voided',
        voidedAt: timestamp,
        voidReason: effectiveReason,
        voidedBy: user?.email,
        updatedAt: timestamp
      };

      transaction.update(docRef, updated);

      const eventId = deriveLedgerEventId(effectiveKey);
      const eventRef = db.collection('financial_events').doc(eventId);
      transaction.set(eventRef, {
        id: eventId,
        orderId: expenseId,
        type: 'expense_voided',
        amount: current.amount || 0,
        category: current.category || 'DESPESA',
        actorId: user?.uid,
        actorEmail: user?.email,
        reason: effectiveReason,
        idempotencyKey: effectiveKey,
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { alreadyVoided: false, id: expenseId, entry: updated };
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'VOID_FINANCIAL_EXPENSE',
      resource: 'financial_cashflow',
      resourceId: expenseId,
      metadata: { reason: effectiveReason, idempotencyKey: effectiveKey },
      ip: req.ip
    });

    logger.info(`🚫 [CASHFLOW-VOID] Voided financial entry ${expenseId}`);
    return res.json({ success: true, entry: result.entry });
  } catch (error: any) {
    if (error.code === 'EXPENSE_NOT_FOUND') {
      return res.status(404).json({ error: error.code, message: error.message });
    }
    logger.error(`❌ [VOID-EXPENSE-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao anular despesa.' });
  }
}

/**
 * Registra um investimento (CAPEX) em maquinário ou infraestrutura de forma separada de despesas operacionais.
 */
export async function createFinancialInvestmentController(req: Request, res: Response) {
  try {
    const { title, amount, date, category, supplier, assetType, description, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Chave de idempotência é obrigatória.' });
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'O valor do investimento deve ser um número positivo maior que zero.' });
    }

    const effectiveTitle = String(title || '').trim();
    if (!effectiveTitle) {
      return res.status(400).json({ error: 'TITLE_REQUIRED', message: 'Título do investimento é obrigatório.' });
    }

    const effectiveKey = idempotencyKey.trim();
    const entryDate = date && !isNaN(new Date(date).getTime()) ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    const db = getDb();
    const docId = deriveLedgerEventId(effectiveKey);
    const docRef = db.collection('financial_investments').doc(docId);

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (snap.exists) {
        return { idempotentReplay: true, id: docId, data: snap.data() };
      }

      const timestamp = new Date().toISOString();
      const payload = {
        id: docId,
        title: effectiveTitle,
        category: category ? String(category).trim() : 'equipamentos',
        amount: Number(parsedAmount.toFixed(2)),
        date: entryDate,
        supplier: supplier ? String(supplier).trim() : '',
        assetType: assetType ? String(assetType).trim() : 'equipamentos',
        description: description ? String(description).trim() : effectiveTitle,
        status: 'active',
        idempotencyKey: effectiveKey,
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        createdAt: timestamp,
        updatedAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(docRef, payload);

      const eventRef = db.collection('financial_events').doc(docId);
      transaction.set(eventRef, {
        id: docId,
        orderId: 'CAPEX_INVESTMENT',
        type: 'investment_created',
        amount: Number(parsedAmount.toFixed(2)),
        category: 'INVESTIMENTO',
        actorId: user?.uid || 'admin',
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        reason: effectiveTitle,
        idempotencyKey: effectiveKey,
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { idempotentReplay: false, id: docId, data: payload };
    });

    if (result.idempotentReplay) {
      return res.json({ success: true, idempotentReplay: true, entry: result.data, investment: result.data });
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'CREATE_FINANCIAL_INVESTMENT',
      resource: 'financial_investments',
      resourceId: docId,
      metadata: { amount: parsedAmount, title: effectiveTitle, idempotencyKey: effectiveKey },
      ip: req.ip
    });

    logger.info(`🏭 [CAPEX] Created investment R$ ${parsedAmount} [${effectiveTitle}] (${docId})`);
    return res.status(200).json({ success: true, entry: result.data, investment: result.data });
  } catch (error: any) {
    logger.error(`❌ [CREATE-INVESTMENT-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao registrar investimento.' });
  }
}

/**
 * Registra o custo real do frete para um pedido e calcula o subsídio de frete da loja.
 */
export async function recordOrderActualShippingCostController(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { actualCost, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!orderId) {
      return res.status(400).json({ error: 'ORDER_ID_REQUIRED', message: 'orderId é obrigatório.' });
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'idempotencyKey é obrigatório.' });
    }

    const parsedActualCost = Number(actualCost);
    if (isNaN(parsedActualCost) || !isFinite(parsedActualCost) || parsedActualCost < 0) {
      return res.status(400).json({ error: 'INVALID_COST', message: 'O custo de frete deve ser um valor numérico válido não negativo.' });
    }

    const effectiveKey = idempotencyKey.trim();
    const eventId = deriveLedgerEventId(effectiveKey);

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId.trim());
    const eventRef = db.collection('financial_events').doc(eventId);

    const result = await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists) {
        const orderSnap = await transaction.get(orderRef);
        const orderData = orderSnap.exists ? orderSnap.data() || {} : {};
        const charged = Number(orderData.pricing?.shipping ?? orderData.shipping ?? 0);
        const currentActual = Number(orderData.pricing?.shippingActualCost ?? orderData.shippingDetails?.actualCost ?? parsedActualCost);
        const subsidy = Math.max(0, Number((currentActual - charged).toFixed(2)));
        return {
          idempotentReplay: true,
          orderId,
          shippingCharged: charged,
          shippingActualCost: currentActual,
          shippingSubsidy: subsidy
        };
      }

      const snap = await transaction.get(orderRef);
      if (!snap.exists) {
        throw { code: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' };
      }

      const orderData = snap.data() || {};
      const charged = Number(orderData.pricing?.shipping ?? orderData.shipping ?? 0);
      const subsidy = Math.max(0, Number((parsedActualCost - charged).toFixed(2)));

      const updatePayload: Record<string, any> = {
        'shippingDetails.actualCost': parsedActualCost,
        'pricing.shippingActualCost': parsedActualCost,
        'pricing.shippingSubsidy': subsidy,
        updatedAt: new Date().toISOString()
      };

      transaction.update(orderRef, updatePayload);

      transaction.set(eventRef, {
        id: eventId,
        orderId,
        type: 'shipping_cost_recorded',
        amount: parsedActualCost,
        category: 'FRETE',
        actorId: user?.uid,
        actorEmail: user?.email,
        reason: `Frete real registrado: R$ ${parsedActualCost} (Cobrado: R$ ${charged} | Subsídio: R$ ${subsidy})`,
        idempotencyKey: effectiveKey,
        createdAt: new Date().toISOString(),
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        idempotentReplay: false,
        orderId,
        shippingCharged: charged,
        shippingActualCost: parsedActualCost,
        shippingSubsidy: subsidy
      };
    });

    if (result.idempotentReplay) {
      return res.json({ success: true, idempotentReplay: true, ...result });
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'RECORD_ORDER_SHIPPING_COST',
      resource: 'orders',
      resourceId: orderId,
      metadata: result,
      ip: req.ip
    });

    logger.info(`📦 [SHIPPING-COST] Order ${orderId} shipping cost updated: Real R$ ${result.shippingActualCost} (Subsidy: R$ ${result.shippingSubsidy})`);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    if (error.code === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ error: error.code, message: error.message });
    }
    logger.error(`❌ [SHIPPING-COST-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao registrar custo de frete.' });
  }
}

/**
 * Registra ou ajusta a taxa real de gateway de pagamento para um pedido.
 */
export async function recordOrderGatewayFeeController(req: Request, res: Response) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { gatewayFee, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!orderId) {
      return res.status(400).json({ error: 'ORDER_ID_REQUIRED', message: 'orderId é obrigatório.' });
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'idempotencyKey é obrigatório.' });
    }

    const parsedFee = Number(gatewayFee);
    if (isNaN(parsedFee) || !isFinite(parsedFee) || parsedFee < 0) {
      return res.status(400).json({ error: 'INVALID_FEE', message: 'A taxa de gateway deve ser um valor numérico válido não negativo.' });
    }

    const effectiveKey = idempotencyKey.trim();
    const eventId = deriveLedgerEventId(effectiveKey);

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId.trim());
    const eventRef = db.collection('financial_events').doc(eventId);

    const result = await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists) {
        const orderSnap = await transaction.get(orderRef);
        const orderData = orderSnap.exists ? orderSnap.data() || {} : {};
        const paidAmount = Number(orderData.payment?.paidAmount ?? orderData.amountPaid ?? 0);
        const currentFee = Number(orderData.payment?.gatewayFee ?? parsedFee);
        const netReceived = Math.max(0, Number((paidAmount - currentFee).toFixed(2)));
        return {
          idempotentReplay: true,
          orderId,
          paidAmount,
          gatewayFee: currentFee,
          netReceived
        };
      }

      const snap = await transaction.get(orderRef);
      if (!snap.exists) {
        throw { code: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' };
      }

      const orderData = snap.data() || {};
      const paidAmount = Number(orderData.payment?.paidAmount ?? orderData.amountPaid ?? 0);
      const netReceived = Math.max(0, Number((paidAmount - parsedFee).toFixed(2)));

      const updatePayload: Record<string, any> = {
        'payment.gatewayFee': parsedFee,
        'payment.netReceived': netReceived,
        updatedAt: new Date().toISOString()
      };

      transaction.update(orderRef, updatePayload);

      transaction.set(eventRef, {
        id: eventId,
        orderId,
        type: 'gateway_fee_adjusted',
        amount: parsedFee,
        category: 'TAXA_GATEWAY',
        actorId: user?.uid,
        actorEmail: user?.email,
        reason: `Taxa gateway ajustada: R$ ${parsedFee} (Receita Líquida: R$ ${netReceived})`,
        idempotencyKey: effectiveKey,
        createdAt: new Date().toISOString(),
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        idempotentReplay: false,
        orderId,
        paidAmount,
        gatewayFee: parsedFee,
        netReceived
      };
    });

    if (result.idempotentReplay) {
      return res.json({ success: true, idempotentReplay: true, ...result });
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'RECORD_ORDER_GATEWAY_FEE',
      resource: 'orders',
      resourceId: orderId,
      metadata: result,
      ip: req.ip
    });

    logger.info(`💳 [GATEWAY-FEE] Order ${orderId} gateway fee updated: R$ ${result.gatewayFee} (Net: R$ ${result.netReceived})`);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    if (error.code === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ error: error.code, message: error.message });
    }
    logger.error(`❌ [GATEWAY-FEE-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao registrar taxa de gateway.' });
  }
}

/**
 * Registra investimento em tráfego pago (Ads) de forma segura, auditada e idempotente.
 */
export async function createFinancialTrafficController(req: Request, res: Response) {
  try {
    const { campaignName, amountSpent, clicks, conversions, date, platform, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Chave de idempotência é obrigatória.' });
    }

    const parsedAmount = Number(amountSpent);
    if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'O valor investido deve ser um número positivo maior que zero.' });
    }

    const effectiveName = String(campaignName || '').trim();
    if (!effectiveName) {
      return res.status(400).json({ error: 'CAMPAIGN_NAME_REQUIRED', message: 'Nome da campanha é obrigatório.' });
    }

    const effectiveKey = idempotencyKey.trim();
    const entryDate = date && !isNaN(new Date(date).getTime()) ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    const db = getDb();
    const docId = deriveLedgerEventId(effectiveKey);
    const docRef = db.collection('financial_traffic').doc(docId);

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (snap.exists) {
        return { idempotentReplay: true, id: docId, data: snap.data() };
      }

      const timestamp = new Date().toISOString();
      const payload = {
        id: docId,
        campaignName: effectiveName,
        amountSpent: Number(parsedAmount.toFixed(2)),
        clicks: Math.max(0, parseInt(clicks) || 0),
        conversions: Math.max(0, parseInt(conversions) || 0),
        platform: platform ? String(platform).trim() : 'meta_ads',
        date: entryDate,
        status: 'active',
        idempotencyKey: effectiveKey,
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        createdAt: timestamp,
        updatedAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(docRef, payload);

      const eventRef = db.collection('financial_events').doc(docId);
      transaction.set(eventRef, {
        id: docId,
        orderId: 'TRAFFIC_ADS',
        type: 'traffic_expense_created',
        amount: Number(parsedAmount.toFixed(2)),
        category: 'MARKETING',
        actorId: user?.uid || 'admin',
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        reason: effectiveName,
        idempotencyKey: effectiveKey,
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { idempotentReplay: false, id: docId, data: payload };
    });

    if (result.idempotentReplay) {
      return res.json({ success: true, idempotentReplay: true, entry: result.data, traffic: result.data });
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'CREATE_FINANCIAL_TRAFFIC',
      resource: 'financial_traffic',
      resourceId: docId,
      metadata: { amount: parsedAmount, campaignName: effectiveName, idempotencyKey: effectiveKey },
      ip: req.ip
    });

    logger.info(`📢 [TRAFFIC] Created traffic entry R$ ${parsedAmount} [${effectiveName}] (${docId})`);
    return res.status(200).json({ success: true, entry: result.data, traffic: result.data });
  } catch (error: any) {
    logger.error(`❌ [CREATE-TRAFFIC-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao registrar tráfego pago.' });
  }
}

/**
 * ============================================================================
 * FASE 9.5 — CONTAS A PAGAR, FORNECEDORES E PREVISÃO DE CAIXA
 * ============================================================================
 */

export async function createAccountsPayableController(req: Request, res: Response) {
  try {
    const {
      description,
      amount,
      dueDate,
      category,
      supplierId,
      supplierName,
      competencyDate,
      recurrence,
      priority,
      sourceType,
      sourceReferenceId,
      notes,
      installmentCount,
      idempotencyKey
    } = req.body;
    const user = (req as any).user;

    const effectiveKey = idempotencyKey || req.headers['idempotency-key'] as string;
    if (!effectiveKey || typeof effectiveKey !== 'string' || !effectiveKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'idempotencyKey é obrigatório para cadastrar contas a pagar.' });
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'DESCRIPTION_REQUIRED', message: 'Descrição é obrigatória.' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Valor deve ser um número positivo maior que zero.' });
    }

    if (!dueDate || typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
      return res.status(400).json({ error: 'INVALID_DUE_DATE', message: 'Data de vencimento inválida (formato YYYY-MM-DD).' });
    }

    const db = getDb();
    const docId = deriveLedgerEventId(effectiveKey);
    const docRef = db.collection('financial_payables').doc(docId);

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (snap.exists) {
        return { idempotentReplay: true, id: docId, data: snap.data() };
      }

      const timestamp = new Date().toISOString();
      const installmentsTotal = Math.max(1, Math.min(60, Number(installmentCount) || 1));
      const installmentBase = Math.floor((parsedAmount / installmentsTotal) * 100) / 100;
      const firstDue = new Date(`${dueDate.trim()}T12:00:00Z`);
      const installments = Array.from({ length: installmentsTotal }, (_, index) => {
        const installmentDue = new Date(firstDue);
        installmentDue.setUTCMonth(installmentDue.getUTCMonth() + index);
        return {
          number: index + 1,
          amount: index === installmentsTotal - 1
            ? Number((parsedAmount - (installmentBase * (installmentsTotal - 1))).toFixed(2))
            : installmentBase,
          paidAmount: 0,
          dueDate: installmentDue.toISOString().split('T')[0],
          status: 'pending'
        };
      });
      const payload: any = {
        id: docId,
        description: description.trim(),
        amount: Number(parsedAmount.toFixed(2)),
        amountPaid: 0,
        amountOpen: Number(parsedAmount.toFixed(2)),
        status: 'pending',
        dueDate: dueDate.trim(),
        competencyDate: (competencyDate && typeof competencyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(competencyDate.trim())) ? competencyDate.trim() : dueDate.trim(),
        category: category && typeof category === 'string' ? category.trim() : 'OUTROS',
        supplierId: supplierId ? String(supplierId).trim() : null,
        supplierName: supplierName ? String(supplierName).trim() : null,
        recurrence: recurrence || 'none',
        priority: priority || 'normal',
        sourceType: sourceType || 'manual',
        sourceReferenceId: sourceReferenceId ? String(sourceReferenceId).trim() : null,
        notes: notes ? String(notes).trim() : '',
        installments,
        installmentCount: installmentsTotal,
        idempotencyKey: effectiveKey,
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        createdBy: user?.email || 'admin@fpacstore.com.br',
        createdAt: timestamp,
        updatedAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(docRef, payload);

      const eventRef = db.collection('financial_events').doc(docId);
      transaction.set(eventRef, {
        id: docId,
        orderId: docId,
        type: 'payable_created',
        amount: Number(parsedAmount.toFixed(2)),
        previousPaidAmount: 0,
        newPaidAmount: 0,
        previousPendingAmount: 0,
        newPendingAmount: Number(parsedAmount.toFixed(2)),
        category: payload.category,
        actorId: user?.uid || 'admin',
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        reason: `Criação de obrigação a pagar: ${description.trim()}`,
        idempotencyKey: effectiveKey,
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { idempotentReplay: false, id: docId, data: payload };
    });

    if (result.idempotentReplay) {
      return res.json({ success: true, idempotentReplay: true, payable: result.data });
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'CREATE_ACCOUNTS_PAYABLE',
      resource: 'financial_payables',
      resourceId: docId,
      metadata: { amount: parsedAmount, description, dueDate, idempotencyKey: effectiveKey },
      ip: req.ip
    });

    logger.info(`💳 [ACCOUNTS-PAYABLE] Created payable R$ ${parsedAmount} [${description}] (${docId})`);
    return res.status(200).json({ success: true, payable: result.data });
  } catch (error: any) {
    logger.error(`❌ [CREATE-PAYABLE-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao criar conta a pagar.' });
  }
}

export async function payAccountsPayableController(req: Request, res: Response) {
  try {
    const payableId = req.params.id || req.body.payableId;
    const { amount, paymentMethod, paymentDate, reason, idempotencyKey } = req.body;
    const user = (req as any).user;

    const effectiveKey = idempotencyKey || req.headers['idempotency-key'] as string;
    if (!effectiveKey || typeof effectiveKey !== 'string' || !effectiveKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'idempotencyKey é obrigatório para registrar pagamento.' });
    }

    if (!payableId || typeof payableId !== 'string') {
      return res.status(400).json({ error: 'PAYABLE_ID_REQUIRED', message: 'payableId é obrigatório.' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Valor deve ser um número positivo maior que zero.' });
    }

    const db = getDb();
    const eventId = deriveLedgerEventId(effectiveKey);
    const eventRef = db.collection('financial_events').doc(eventId);
    const payableRef = db.collection('financial_payables').doc(payableId);

    const result = await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);
      const payableSnap = await transaction.get(payableRef);

      if (!payableSnap.exists) {
        throw { code: 'PAYABLE_NOT_FOUND', message: `Conta a pagar #${payableId} não encontrada.` };
      }

      const payableData = payableSnap.data()!;

      if (eventSnap.exists) {
        return { idempotentReplay: true, payable: payableData };
      }

      if (payableData.status === 'voided' || payableData.status === 'cancelled') {
        throw { code: 'CANNOT_PAY_VOIDED_PAYABLE', message: 'Não é possível liquidar uma conta anulada ou cancelada.' };
      }

      const currentPaid = Number(payableData.amountPaid) || 0;
      const totalAmount = Number(payableData.amount) || 0;
      const currentOpen = Math.max(0, Number((totalAmount - currentPaid).toFixed(2)));

      if (parsedAmount > currentOpen + 0.001) {
        throw {
          code: 'EXCEEDS_OPEN_AMOUNT',
          message: `Valor informado (R$ ${parsedAmount.toFixed(2)}) é superior ao saldo em aberto da conta (R$ ${currentOpen.toFixed(2)}).`
        };
      }

      const newPaidAmount = Number((currentPaid + parsedAmount).toFixed(2));
      const newOpenAmount = Math.max(0, Number((totalAmount - newPaidAmount).toFixed(2)));
      const newStatus = newOpenAmount <= 0.001 ? 'paid' : 'partially_paid';
      const eventType = newStatus === 'paid' ? 'payable_paid' : 'payable_partial_payment';
      const timestamp = new Date().toISOString();
      const effectivePaymentDate = (paymentDate && typeof paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim())) ? paymentDate.trim() : timestamp.split('T')[0];
      let amountToAllocate = parsedAmount;
      const updatedInstallments = (Array.isArray(payableData.installments) ? payableData.installments : []).map((installment: any) => {
        if (amountToAllocate <= 0 || installment.status === 'paid') return installment;
        const remaining = Math.max(0, Number(installment.amount || 0) - Number(installment.paidAmount || 0));
        const allocated = Math.min(remaining, amountToAllocate);
        amountToAllocate -= allocated;
        const paidAmount = Number(installment.paidAmount || 0) + allocated;
        const paid = paidAmount + 0.001 >= Number(installment.amount || 0);
        return { ...installment, paidAmount, status: paid ? 'paid' : 'pending', ...(paid ? { paidAt: effectivePaymentDate } : {}) };
      });
      const nextOpenInstallment = updatedInstallments.find((installment: any) => installment.status !== 'paid');
      const paymentHistory = [
        ...(Array.isArray(payableData.paymentHistory) ? payableData.paymentHistory : []),
        {
          amount: Number(parsedAmount.toFixed(2)),
          paymentDate: effectivePaymentDate,
          paymentMethod: paymentMethod || payableData.paymentMethod || 'PIX',
          ledgerEventId: eventId,
          recordedAt: timestamp
        }
      ];

      const updatedPayable = {
        ...payableData,
        amountPaid: newPaidAmount,
        amountOpen: newOpenAmount,
        status: newStatus,
        paymentDate: effectivePaymentDate,
        paymentMethod: paymentMethod || payableData.paymentMethod || 'PIX',
        installments: updatedInstallments,
        paymentHistory,
        dueDate: nextOpenInstallment?.dueDate || payableData.dueDate,
        updatedAt: timestamp
      };

      transaction.update(payableRef, {
        amountPaid: newPaidAmount,
        amountOpen: newOpenAmount,
        status: newStatus,
        paymentDate: effectivePaymentDate,
        paymentMethod: paymentMethod || payableData.paymentMethod || 'PIX',
        installments: updatedInstallments,
        paymentHistory,
        dueDate: nextOpenInstallment?.dueDate || payableData.dueDate,
        updatedAt: timestamp
      });

      transaction.set(eventRef, {
        id: eventId,
        orderId: payableId,
        type: eventType,
        amount: parsedAmount,
        previousPaidAmount: currentPaid,
        newPaidAmount: newPaidAmount,
        previousPendingAmount: currentOpen,
        newPendingAmount: newOpenAmount,
        paymentMethod: paymentMethod || 'PIX',
        category: payableData.category || 'OUTROS',
        actorId: user?.uid || 'admin',
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        reason: reason || `Pagamento de conta a pagar: ${payableData.description}`,
        idempotencyKey: effectiveKey,
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      transaction.set(db.collection('financial_cashflow').doc(eventId), {
        id: eventId,
        description: `Pagamento: ${payableData.description}`,
        amount: parsedAmount,
        type: 'out',
        category: payableData.category || 'OUTROS',
        date: effectivePaymentDate,
        status: 'active',
        sourceType: 'accounts_payable',
        sourceReferenceId: payableId,
        ledgerEventId: eventId,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      return { idempotentReplay: false, payable: updatedPayable };
    });

    if (result.idempotentReplay) {
      return res.json({ success: true, idempotentReplay: true, payable: result.payable });
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'PAY_ACCOUNTS_PAYABLE',
      resource: 'financial_payables',
      resourceId: payableId,
      metadata: { amount: parsedAmount, paymentMethod, idempotencyKey: effectiveKey },
      ip: req.ip
    });

    logger.info(`💵 [ACCOUNTS-PAYABLE] Paid R$ ${parsedAmount} for payable #${payableId} (New status: ${result.payable.status})`);
    return res.json({ success: true, payable: result.payable });
  } catch (error: any) {
    if (error.code === 'PAYABLE_NOT_FOUND') {
      return res.status(404).json({ error: error.code, message: error.message });
    }
    if (error.code === 'CANNOT_PAY_VOIDED_PAYABLE' || error.code === 'EXCEEDS_OPEN_AMOUNT') {
      return res.status(400).json({ error: error.code, message: error.message });
    }
    logger.error(`❌ [PAY-PAYABLE-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao registrar pagamento de conta a pagar.' });
  }
}

export async function voidAccountsPayableController(req: Request, res: Response) {
  try {
    const payableId = req.params.id || req.body.payableId;
    const { reason, idempotencyKey } = req.body;
    const user = (req as any).user;

    const effectiveKey = idempotencyKey || req.headers['idempotency-key'] as string;
    if (!effectiveKey || typeof effectiveKey !== 'string' || !effectiveKey.trim()) {
      return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'idempotencyKey é obrigatório para anular conta a pagar.' });
    }

    if (!payableId || typeof payableId !== 'string') {
      return res.status(400).json({ error: 'PAYABLE_ID_REQUIRED', message: 'payableId é obrigatório.' });
    }

    const effectiveReason = reason && typeof reason === 'string' && reason.trim()
      ? reason.trim()
      : 'Anulação administrativa de conta a pagar';

    const db = getDb();
    const docRef = db.collection('financial_payables').doc(payableId);

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw { code: 'PAYABLE_NOT_FOUND', message: `Conta a pagar #${payableId} não encontrada.` };
      }

      const current = snap.data()!;
      if (current.status === 'voided') {
        return { alreadyVoided: true, id: payableId, entry: current };
      }

      const timestamp = new Date().toISOString();
      const updated = {
        ...current,
        status: 'voided',
        voidedAt: timestamp,
        voidReason: effectiveReason,
        voidedBy: user?.email || 'admin@fpacstore.com.br',
        updatedAt: timestamp
      };

      transaction.update(docRef, updated);

      const eventId = deriveLedgerEventId(effectiveKey);
      const eventRef = db.collection('financial_events').doc(eventId);
      transaction.set(eventRef, {
        id: eventId,
        orderId: payableId,
        type: 'payable_voided',
        amount: current.amount || 0,
        category: current.category || 'OUTROS',
        actorId: user?.uid || 'admin',
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        reason: effectiveReason,
        idempotencyKey: effectiveKey,
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { alreadyVoided: false, id: payableId, entry: updated };
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'VOID_ACCOUNTS_PAYABLE',
      resource: 'financial_payables',
      resourceId: payableId,
      metadata: { reason: effectiveReason, idempotencyKey: effectiveKey },
      ip: req.ip
    });

    logger.info(`🚫 [PAYABLE-VOID] Voided payable entry ${payableId}`);
    return res.json({ success: true, entry: result.entry, payable: result.entry });
  } catch (error: any) {
    if (error.code === 'PAYABLE_NOT_FOUND') {
      return res.status(404).json({ error: error.code, message: error.message });
    }
    logger.error(`❌ [VOID-PAYABLE-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao anular conta a pagar.' });
  }
}

export async function getAccountsPayablesController(req: Request, res: Response) {
  try {
    const db = getDb();
    const snap = await db.collection('financial_payables').get();
    const list: any[] = [];
    snap.forEach((doc) => {
      list.push(doc.data());
    });
    list.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    return res.json({ success: true, payables: list });
  } catch (error: any) {
    logger.error(`❌ [GET-PAYABLES-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao consultar contas a pagar.' });
  }
}

export async function createSupplierController(req: Request, res: Response) {
  try {
    const { name, legalName, document, contactName, email, phone, pixKey, bankInfo, category, notes, idempotencyKey } = req.body;
    const user = (req as any).user;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'SUPPLIER_NAME_REQUIRED', message: 'Nome do fornecedor é obrigatório.' });
    }

    const db = getDb();
    const docId = idempotencyKey ? deriveLedgerEventId(idempotencyKey) : db.collection('suppliers').doc().id;
    const docRef = db.collection('suppliers').doc(docId);

    const timestamp = new Date().toISOString();
    const payload = {
      id: docId,
      name: name.trim(),
      legalName: legalName ? String(legalName).trim() : '',
      document: document ? String(document).trim() : '',
      contactName: contactName ? String(contactName).trim() : '',
      email: email ? String(email).trim().toLowerCase() : '',
      phone: phone ? String(phone).trim() : '',
      pixKey: pixKey ? String(pixKey).trim() : '',
      bankInfo: bankInfo ? String(bankInfo).trim() : '',
      category: category ? String(category).trim() : 'Geral',
      notes: notes ? String(notes).trim() : '',
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await docRef.set(payload, { merge: true });

    if (idempotencyKey) {
      const eventRef = db.collection('financial_events').doc(docId);
      await eventRef.set({
        id: docId,
        orderId: docId,
        type: 'supplier_created',
        amount: 0,
        category: 'FORNECEDOR',
        actorId: user?.uid || 'admin',
        actorEmail: user?.email || 'admin@fpacstore.com.br',
        reason: `Cadastro de fornecedor: ${name.trim()}`,
        idempotencyKey,
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'CREATE_SUPPLIER',
      resource: 'suppliers',
      resourceId: docId,
      metadata: { name: name.trim(), document },
      ip: req.ip
    });

    logger.info(`🏭 [SUPPLIER] Created supplier ${name.trim()} (${docId})`);
    return res.status(200).json({ success: true, supplier: payload });
  } catch (error: any) {
    logger.error(`❌ [CREATE-SUPPLIER-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao cadastrar fornecedor.' });
  }
}

export async function updateSupplierController(req: Request, res: Response) {
  try {
    const supplierId = req.params.id || req.body.id;
    const { name, legalName, document, contactName, email, phone, pixKey, bankInfo, category, notes, active } = req.body;
    const user = (req as any).user;

    if (!supplierId || typeof supplierId !== 'string') {
      return res.status(400).json({ error: 'SUPPLIER_ID_REQUIRED', message: 'ID do fornecedor é obrigatório.' });
    }

    const db = getDb();
    const docRef = db.collection('suppliers').doc(supplierId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'SUPPLIER_NOT_FOUND', message: 'Fornecedor não encontrado.' });
    }

    const current = snap.data()!;
    const timestamp = new Date().toISOString();
    const updated = {
      ...current,
      name: name !== undefined ? String(name).trim() : current.name,
      legalName: legalName !== undefined ? String(legalName).trim() : current.legalName,
      document: document !== undefined ? String(document).trim() : current.document,
      contactName: contactName !== undefined ? String(contactName).trim() : current.contactName,
      email: email !== undefined ? String(email).trim().toLowerCase() : current.email,
      phone: phone !== undefined ? String(phone).trim() : current.phone,
      pixKey: pixKey !== undefined ? String(pixKey).trim() : current.pixKey,
      bankInfo: bankInfo !== undefined ? String(bankInfo).trim() : current.bankInfo,
      category: category !== undefined ? String(category).trim() : current.category,
      notes: notes !== undefined ? String(notes).trim() : current.notes,
      active: active !== undefined ? Boolean(active) : current.active,
      updatedAt: timestamp
    };

    await docRef.set(updated);

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'UPDATE_SUPPLIER',
      resource: 'suppliers',
      resourceId: supplierId,
      metadata: { name: updated.name },
      ip: req.ip
    });

    logger.info(`🏭 [SUPPLIER] Updated supplier ${updated.name} (${supplierId})`);
    return res.json({ success: true, supplier: updated });
  } catch (error: any) {
    logger.error(`❌ [UPDATE-SUPPLIER-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao atualizar fornecedor.' });
  }
}

export async function deactivateSupplierController(req: Request, res: Response) {
  try {
    const supplierId = req.params.id || req.body.id;
    const user = (req as any).user;

    if (!supplierId || typeof supplierId !== 'string') {
      return res.status(400).json({ error: 'SUPPLIER_ID_REQUIRED', message: 'ID do fornecedor é obrigatório.' });
    }

    const db = getDb();
    const docRef = db.collection('suppliers').doc(supplierId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'SUPPLIER_NOT_FOUND', message: 'Fornecedor não encontrado.' });
    }

    const timestamp = new Date().toISOString();
    await docRef.update({
      active: false,
      updatedAt: timestamp
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'DEACTIVATE_SUPPLIER',
      resource: 'suppliers',
      resourceId: supplierId,
      ip: req.ip
    });

    logger.info(`🏭 [SUPPLIER] Deactivated supplier ${supplierId}`);
    return res.json({ success: true, id: supplierId, active: false });
  } catch (error: any) {
    logger.error(`❌ [DEACTIVATE-SUPPLIER-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao inativar fornecedor.' });
  }
}

export async function getSuppliersController(req: Request, res: Response) {
  try {
    const db = getDb();
    const snap = await db.collection('suppliers').get();
    const list: any[] = [];
    snap.forEach((doc) => {
      list.push(doc.data());
    });
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return res.json({ success: true, suppliers: list });
  } catch (error: any) {
    logger.error(`❌ [GET-SUPPLIERS-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao consultar fornecedores.' });
  }
}

export async function getCashForecastController(req: Request, res: Response) {
  try {
    const db = getDb();

    const [ordersSnap, payablesSnap, cashflowSnap, trafficSnap] = await Promise.all([
      db.collection('orders').get(),
      db.collection('financial_payables').get(),
      db.collection('financial_cashflow').get(),
      db.collection('financial_traffic').get()
    ]);

    const records = (snapshot: any) => snapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
    const payables = records(payablesSnap);
    const summary = calculateCashForecast(records(ordersSnap), payables, records(cashflowSnap), records(trafficSnap));

    return res.json({ success: true, summary, payablesCount: payables.length });
  } catch (error: any) {
    logger.error(`❌ [GET-FORECAST-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao calcular previsão de fluxo de caixa.' });
  }
}

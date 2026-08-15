import { Request, Response } from 'express';
import { getDb } from '../firebase.js';
import admin from 'firebase-admin';
import { CANONICAL_PRODUCTION_STATUSES, canTransitionProductionStatus, canTransitionPaymentStatus, canTransitionShippingStatus, isProductionStatus, normalizeProductionStatus, isPaymentStatus, assertProductionOrderEligible, assertShippingOrderEligible, isShippingStatus, normalizeShippingStatus, CANONICAL_SHIPPING_STATUSES, validateTrackingInfo, isLocalDeliveryOrder } from '../services/stateMachine.service.js';
import { adjustStock, OutOfStockError, getVariantStats, releaseStockReservation, consumeStockReservation, processPhysicalReturn } from '../services/store.service.js';
import { recordAuditLog } from '../utils/auditLogger.js';
import { logger } from '../utils/logger.js';
import { PaymentStatus, ProductionStatus } from '../types/order.types.js';
import { recordFinancialEvent, getFinancialEventsForOrder, getFinancialLedger, deriveLedgerEventId, FinancialEvent } from '../services/financialLedger.service.js';
import { getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderTotal, normalizePaymentStatus, getOrderPaymentStatus } from '../utils/orderFinancial.js';

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

    const currentProdStatus: ProductionStatus = normalizeProductionStatus(orderData.production?.status || orderData.productionStatus || 'waiting');

    const isValid = canTransitionProductionStatus(currentProdStatus, newStatus);
    if (!isValid) {
      return res.status(400).json({ 
        error: 'INVALID_PRODUCTION_TRANSITION', 
        message: `Não é permitido alterar o estágio de produção de '${currentProdStatus}' para '${newStatus}'.` 
      });
    }

    // Check step backward transition requirement (mandatory reason)
    const currentIndex = CANONICAL_PRODUCTION_STATUSES.indexOf(currentProdStatus);
    const newIndex = CANONICAL_PRODUCTION_STATUSES.indexOf(newStatus as ProductionStatus);

    if (newIndex < currentIndex && currentProdStatus !== newStatus) {
      if (!note || typeof note !== 'string' || note.trim().length === 0) {
        return res.status(400).json({
          error: 'PRODUCTION_REGRESSION_REASON_REQUIRED',
          message: 'Para retornar uma etapa de produção é obrigatório fornecer o motivo/observação.'
        });
      }
    }

    const timestamp = new Date().toISOString();
    const stageName = currentStage || newStatus;

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
      productionStatus: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion(historyEntry)
    };

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

    await orderRef.update(updatePayload);

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'UPDATE_PRODUCTION_STATUS',
      resource: 'orders',
      resourceId: orderId,
      metadata: { previousStatus: currentProdStatus, newStatus, currentStage: stageName, note, priority, assignedTo, productionDueDate },
      ip: req.ip
    });

    logger.info(`🏭 [ADMIN-PROD] Order ${orderId} production status updated: ${currentProdStatus} -> ${newStatus} by ${user?.email}`);

    res.json({ success: true, orderId, productionStatus: newStatus, currentStage: stageName, enteredAt: timestamp });
  } catch (error: any) {
    logger.error(`❌ [ADMIN-PROD-ERR] ${error.message}`, error);
    res.status(500).json({ error: error.message || 'Erro ao atualizar estágio de produção.' });
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
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;
    const currentPayStatus: PaymentStatus = orderData.payment?.status || orderData.paymentStatus || 'pending';

    const isValid = canTransitionPaymentStatus(currentPayStatus, newStatus as PaymentStatus, true);
    if (!isValid) {
      return res.status(400).json({
        error: 'INVALID_PAYMENT_TRANSITION',
        message: `Não é permitido alterar o status de pagamento de '${currentPayStatus}' para '${newStatus}'.`
      });
    }

    const existingPaidAmount = Number(orderData.payment?.paidAmount ?? orderData.amountPaid ?? 0);

    if (existingPaidAmount > 0 && ['cancelled', 'rejected', 'expired'].includes(newStatus)) {
      return res.status(400).json({
        error: 'INVALID_PAYMENT_TRANSITION',
        message: `Não é possível alterar o status de pagamento para '${newStatus}' pois já existe valor pago registrado (R$ ${existingPaidAmount}). Para devoluções, utilize o fluxo de estorno/reembolso (refund).`
      });
    }

    const timestamp = new Date().toISOString();
    const historyEntry = {
      type: 'payment_update',
      status: newStatus,
      previousStatus: currentPayStatus,
      timestamp,
      message: reason || `Status de pagamento alterado manualmente para ${newStatus}`,
      operator: user?.email || user?.uid || 'Admin'
    };

    const totalAmount = Number(orderData.pricing?.total || orderData.total || 0);

    const updatePayload: any = {
      'payment.status': newStatus,
      paymentStatus: newStatus === 'approved' ? 'approved' : newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion(historyEntry)
    };

    if (newStatus === 'approved') {
      updatePayload['payment.paidAmount'] = totalAmount;
      updatePayload['amountPaid'] = totalAmount;
      updatePayload['payment.pendingAmount'] = 0;
      updatePayload['balanceDue'] = 0;
      updatePayload['payment.paidAt'] = timestamp;
      updatePayload.status = 'Pagamento Aprovado';
      updatePayload.status_pedido = 'pago';
    } else if (newStatus === 'refunded' || newStatus === 'partially_refunded') {
      const inputRefundAmt = Number(req.body.refundAmount || req.body.amount || 0);
      const prevRefunded = Number(orderData.payment?.refundedAmount || orderData.refundedAmount || 0);
      const effectivePaid = existingPaidAmount > 0 ? existingPaidAmount : totalAmount;
      const calcRefunded = newStatus === 'refunded' 
        ? effectivePaid 
        : Math.min(effectivePaid, prevRefunded + (inputRefundAmt > 0 ? inputRefundAmt : effectivePaid));

      updatePayload['payment.paidAmount'] = effectivePaid;
      updatePayload['amountPaid'] = effectivePaid;
      updatePayload['payment.refundedAmount'] = calcRefunded;
      updatePayload['refundedAmount'] = calcRefunded;
      updatePayload['payment.pendingAmount'] = 0;
      updatePayload['balanceDue'] = 0;
      updatePayload.status = newStatus === 'refunded' ? 'Reembolsado' : 'Reembolsado Parcialmente';
    } else if (['rejected', 'cancelled', 'expired'].includes(newStatus)) {
      if (existingPaidAmount > 0) {
        updatePayload['payment.paidAmount'] = existingPaidAmount;
        updatePayload['amountPaid'] = existingPaidAmount;
        updatePayload['payment.pendingAmount'] = Math.max(0, totalAmount - existingPaidAmount);
        updatePayload['balanceDue'] = Math.max(0, totalAmount - existingPaidAmount);
      } else {
        updatePayload['payment.paidAmount'] = 0;
        updatePayload['amountPaid'] = 0;
        updatePayload['payment.pendingAmount'] = totalAmount;
        updatePayload['balanceDue'] = totalAmount;
        updatePayload.status = 'Pagamento Não Realizado';
      }
    }

    await orderRef.update(updatePayload);

    // Stock Reversion for failed or cancelled orders if not already done
    const isFailed = ['rejected', 'cancelled', 'expired'].includes(newStatus);
    const wasNotAlreadyReverted = !orderData.stockReverted && !orderData.stockRevertedAcknowledged;

    if (isFailed && wasNotAlreadyReverted && Array.isArray(orderData.items) && orderData.items.length > 0) {
      logger.info(`📦 [ADMIN-PAY] Releasing stock reservation for cancelled/failed order ${orderId}`);
      await releaseStockReservation(orderId, orderData.items, `admin_pay_${orderId}_release`);
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
      metadata: { previousStatus: currentPayStatus, newStatus, reason },
      ip: req.ip
    });

    // Append to immutable financial ledger
    try {
      let eventType: any = 'manual_adjustment';
      let deltaAmount = 0;
      if (newStatus === 'approved') {
        eventType = 'payment_approved';
        deltaAmount = Number(updatePayload['payment.paidAmount'] ?? totalAmount);
      } else if (newStatus === 'refunded') {
        eventType = 'refund';
        deltaAmount = Number(updatePayload['payment.refundedAmount'] ?? totalAmount);
      } else if (newStatus === 'partially_refunded') {
        eventType = 'partial_refund';
        deltaAmount = Number(req.body.refundAmount || req.body.amount || 0);
      } else if (newStatus === 'cancelled') {
        eventType = 'payment_cancelled';
      } else if (newStatus === 'rejected') {
        eventType = 'payment_rejected';
      }

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
        idempotencyKey: req.body.idempotencyKey || `admin_pay_stat_${orderId}_${newStatus}_${Date.now()}`,
        createdAt: timestamp
      });
    } catch (ledgerErr: any) {
      logger.warn(`⚠️ [LEDGER-ERR] Failed recording financial event for ${orderId}: ${ledgerErr.message}`);
    }

    logger.info(`💳 [ADMIN-PAY] Order ${orderId} payment status updated: ${currentPayStatus} -> ${newStatus} by ${user?.email}`);

    res.json({ success: true, orderId, paymentStatus: newStatus });
  } catch (error: any) {
    logger.error(`❌ [ADMIN-PAY-ERR] ${error.message}`, error);
    res.status(500).json({ error: error.message || 'Erro ao atualizar status de pagamento.' });
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
    const { newStatus, trackingCode, carrier, trackingUrl, note } = req.body;
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

    // Validate Tracking Info format if provided
    const trackingVal = validateTrackingInfo({ trackingCode, carrier, trackingUrl });
    if (!trackingVal.valid) {
      return res.status(400).json({
        error: trackingVal.error,
        message: trackingVal.message
      });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;

    // Central Eligibility Guard Check
    const eligibility = assertShippingOrderEligible(orderData);
    if (!eligibility.eligible) {
      return res.status(400).json({
        error: eligibility.error,
        message: eligibility.message
      });
    }

    const currentShippingStatus = normalizeShippingStatus(
      orderData.shipping?.status || orderData.shippingStatus || 'pending'
    );

    const isValid = canTransitionShippingStatus(currentShippingStatus, newStatus, orderData);
    if (!isValid) {
      return res.status(400).json({
        error: 'INVALID_SHIPPING_TRANSITION',
        message: `Não é permitido alterar o status de envio de '${currentShippingStatus}' para '${newStatus}'.`
      });
    }

    const timestamp = new Date().toISOString();
    const sanitizedCode = trackingVal.sanitizedTrackingCode || orderData.shipping?.trackingCode || orderData.trackingCode || null;
    const defaultCarrier = isLocalDeliveryOrder(orderData) ? (orderData.shippingMethod || orderData.shipping?.method || 'Entrega Própria (Joinville)') : 'Correios';
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

    if (trackingVal.sanitizedTrackingCode) {
      updatePayload['shipping.trackingCode'] = trackingVal.sanitizedTrackingCode;
      updatePayload.trackingCode = trackingVal.sanitizedTrackingCode;
    }
    if (sanitizedCarrierName) {
      updatePayload['shipping.carrier'] = sanitizedCarrierName;
    }
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
    }

    // Single Official Physical Stock Consumption Event: 'shipped' (despachado)
    // ONLY consume if transition to 'shipped' is happening for the first time
    if (newStatus === 'shipped' && currentShippingStatus !== 'shipped' && Array.isArray(orderData.items) && orderData.items.length > 0) {
      logger.info(`🚚 [ADMIN-SHIP] Single Official Consumption Event: Consuming stock reservation for order ${orderId}`);
      await consumeStockReservation(orderId, orderData.items, `shipping_shipped_${orderId}`);
    }

    await orderRef.update(updatePayload);

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'UPDATE_SHIPPING_STATUS',
      resource: 'orders',
      resourceId: orderId,
      metadata: { previousStatus: currentShippingStatus, newStatus, trackingCode, carrier, note },
      ip: req.ip
    });

    logger.info(`🚚 [ADMIN-SHIP] Order ${orderId} shipping status updated: ${currentShippingStatus} -> ${newStatus} by ${user?.email}`);

    res.json({ success: true, orderId, shippingStatus: newStatus });
  } catch (error: any) {
    logger.error(`❌ [ADMIN-SHIP-ERR] ${error.message}`, error);
    res.status(500).json({ error: error.message || 'Erro ao atualizar status de envio.' });
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

    const parsedAmount = Number(amount);
    if (!orderId || isNaN(parsedAmount) || parsedAmount <= 0) {
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
      if (parsedAmount > currentPending + 0.001) {
        const excessErr: any = new Error(`Valor informado (R$ ${parsedAmount.toFixed(2)}) é superior ao saldo devedor restante (R$ ${currentPending.toFixed(2)}).`);
        excessErr.code = 'EXCESS_PAYMENT_AMOUNT';
        excessErr.status = 400;
        throw excessErr;
      }

      // 4. Calcular novos saldos e status
      const newPaidAmount = currentPaid + parsedAmount;
      const newPendingAmount = Math.max(0, currentPending - parsedAmount);
      const newStatus: PaymentStatus = newPendingAmount === 0 ? 'approved' : 'partially_paid';

      const timestamp = new Date().toISOString();
      const paymentMethodUsed = method ? String(method).trim().toUpperCase() : 'MANUAL';
      const effectiveReason = reason ? String(reason).trim() : `Pagamento manual de R$ ${parsedAmount.toFixed(2)} via ${paymentMethodUsed}`;

      const paymentLogEntry = {
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

      if (newStatus === 'approved') {
        updatePayload['payment.paidAt'] = timestamp;
        updatePayload.status = 'Pagamento Aprovado';
        updatePayload.status_pedido = 'pago';
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: admin.firestore.FieldValue.arrayUnion(historyEntry)
      };

      if (newStatus === 'refunded') {
        updatePayload.status = 'Reembolsado';
      } else {
        updatePayload.status = 'Reembolsado Parcialmente';
      }

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

      const updatedPayable = {
        ...payableData,
        amountPaid: newPaidAmount,
        amountOpen: newOpenAmount,
        status: newStatus,
        paymentDate: effectivePaymentDate,
        paymentMethod: paymentMethod || payableData.paymentMethod || 'PIX',
        updatedAt: timestamp
      };

      transaction.update(payableRef, {
        amountPaid: newPaidAmount,
        amountOpen: newOpenAmount,
        status: newStatus,
        paymentDate: effectivePaymentDate,
        paymentMethod: paymentMethod || payableData.paymentMethod || 'PIX',
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

    const [ordersSnap, payablesSnap, cashflowSnap, investmentsSnap, trafficSnap] = await Promise.all([
      db.collection('orders').get(),
      db.collection('financial_payables').get(),
      db.collection('financial_cashflow').get(),
      db.collection('financial_investments').get(),
      db.collection('financial_traffic').get()
    ]);

    let totalRealizedIn = 0;
    let totalRealizedOut = 0;
    let totalReceivablesOpen = 0;

    ordersSnap.forEach((doc) => {
      const order = doc.data();
      const status = order.status || '';
      const pStatus = getOrderPaymentStatus(order);
      const isCancelled = status === 'Cancelado' || pStatus === 'cancelled';

      if (!isCancelled) {
        const paid = getOrderPaidAmount(order);
        const refunded = getOrderRefundedAmount(order);
        const pending = getOrderPendingAmount(order);

        totalRealizedIn += Math.max(0, paid - refunded);

        if (pending > 0 && pStatus !== 'rejected') {
          totalReceivablesOpen += pending;
        }
      }
    });

    cashflowSnap.forEach((doc) => {
      const cf = doc.data();
      if (cf.status !== 'voided') {
        const amt = Number(cf.amount) || 0;
        if (cf.type === 'in') {
          totalRealizedIn += amt;
        } else {
          totalRealizedOut += amt;
        }
      }
    });

    investmentsSnap.forEach((doc) => {
      const inv = doc.data();
      if (inv.status !== 'voided') {
        totalRealizedOut += Number(inv.amount) || 0;
      }
    });

    trafficSnap.forEach((doc) => {
      const tr = doc.data();
      if (tr.status !== 'voided') {
        totalRealizedOut += Number(tr.amountSpent) || 0;
      }
    });

    const payables: any[] = [];
    payablesSnap.forEach((doc) => {
      const p = doc.data();
      payables.push(p);
      if (p.status !== 'voided' && p.status !== 'cancelled') {
        totalRealizedOut += Number(p.amountPaid) || 0;
      }
    });

    const currentCashBalance = Number((totalRealizedIn - totalRealizedOut).toFixed(2));

    const today = new Date().toISOString().split('T')[0];
    const todayDate = new Date(today);

    function addDays(d: Date, days: number): string {
      const copy = new Date(d);
      copy.setDate(copy.getDate() + days);
      return copy.toISOString().split('T')[0];
    }

    const date7 = addDays(todayDate, 7);
    const date15 = addDays(todayDate, 15);
    const date30 = addDays(todayDate, 30);
    const date60 = addDays(todayDate, 60);
    const date90 = addDays(todayDate, 90);
    const date3 = addDays(todayDate, 3);

    let overduePayablesCount = 0;
    let overduePayablesAmount = 0;
    let dueTodayPayablesCount = 0;
    let dueTodayPayablesAmount = 0;
    let due3DaysPayablesCount = 0;
    let due3DaysPayablesAmount = 0;

    let expectedPayables7Days = 0;
    let expectedPayables15Days = 0;
    let expectedPayables30Days = 0;
    let expectedPayables60Days = 0;
    let expectedPayables90Days = 0;

    payables.forEach((p) => {
      if (p.status === 'pending' || p.status === 'partially_paid') {
        const openAmt = Number(p.amountOpen || (Number(p.amount || 0) - Number(p.amountPaid || 0))) || 0;
        const due = p.dueDate || '';

        if (due < today) {
          overduePayablesCount++;
          overduePayablesAmount += openAmt;
        } else if (due === today) {
          dueTodayPayablesCount++;
          dueTodayPayablesAmount += openAmt;
        }

        if (due >= today && due <= date3) {
          due3DaysPayablesCount++;
          due3DaysPayablesAmount += openAmt;
        }

        if (due <= date7) {
          expectedPayables7Days += openAmt;
        }
        if (due <= date15) {
          expectedPayables15Days += openAmt;
        }
        if (due <= date30) {
          expectedPayables30Days += openAmt;
        }
        if (due <= date60) {
          expectedPayables60Days += openAmt;
        }
        if (due <= date90) {
          expectedPayables90Days += openAmt;
        }
      }
    });

    const expectedReceivables7Days = totalReceivablesOpen;
    const expectedReceivables15Days = totalReceivablesOpen;
    const expectedReceivables30Days = totalReceivablesOpen;
    const expectedReceivables60Days = totalReceivablesOpen;
    const expectedReceivables90Days = totalReceivablesOpen;

    const summary = {
      currentCashBalance,
      expectedReceivables7Days: Number(expectedReceivables7Days.toFixed(2)),
      expectedReceivables15Days: Number(expectedReceivables15Days.toFixed(2)),
      expectedReceivables30Days: Number(expectedReceivables30Days.toFixed(2)),
      expectedReceivables60Days: Number(expectedReceivables60Days.toFixed(2)),
      expectedReceivables90Days: Number(expectedReceivables90Days.toFixed(2)),
      expectedPayables7Days: Number(expectedPayables7Days.toFixed(2)),
      expectedPayables15Days: Number(expectedPayables15Days.toFixed(2)),
      expectedPayables30Days: Number(expectedPayables30Days.toFixed(2)),
      expectedPayables60Days: Number(expectedPayables60Days.toFixed(2)),
      expectedPayables90Days: Number(expectedPayables90Days.toFixed(2)),
      projectedBalance7Days: Number((currentCashBalance + expectedReceivables7Days - expectedPayables7Days).toFixed(2)),
      projectedBalance15Days: Number((currentCashBalance + expectedReceivables15Days - expectedPayables15Days).toFixed(2)),
      projectedBalance30Days: Number((currentCashBalance + expectedReceivables30Days - expectedPayables30Days).toFixed(2)),
      projectedBalance60Days: Number((currentCashBalance + expectedReceivables60Days - expectedPayables60Days).toFixed(2)),
      projectedBalance90Days: Number((currentCashBalance + expectedReceivables90Days - expectedPayables90Days).toFixed(2)),
      overduePayablesCount,
      overduePayablesAmount: Number(overduePayablesAmount.toFixed(2)),
      dueTodayPayablesCount,
      dueTodayPayablesAmount: Number(dueTodayPayablesAmount.toFixed(2)),
      due3DaysPayablesCount,
      due3DaysPayablesAmount: Number(due3DaysPayablesAmount.toFixed(2))
    };

    return res.json({ success: true, summary, payablesCount: payables.length });
  } catch (error: any) {
    logger.error(`❌ [GET-FORECAST-ERR] ${error.message}`, error);
    return res.status(500).json({ error: error.message || 'Erro ao calcular previsão de fluxo de caixa.' });
  }
}




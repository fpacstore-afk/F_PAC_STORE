import { Request, Response } from 'express';
import { getDb } from '../firebase.js';
import admin from 'firebase-admin';
import { CANONICAL_PRODUCTION_STATUSES, canTransitionProductionStatus, canTransitionPaymentStatus, canTransitionShippingStatus, isProductionStatus, normalizeProductionStatus, isPaymentStatus, assertProductionOrderEligible, assertShippingOrderEligible, isShippingStatus, normalizeShippingStatus, CANONICAL_SHIPPING_STATUSES, validateTrackingInfo, isLocalDeliveryOrder } from '../services/stateMachine.service.js';
import { adjustStock, OutOfStockError, getVariantStats, releaseStockReservation, consumeStockReservation, processPhysicalReturn } from '../services/store.service.js';
import { recordAuditLog } from '../utils/auditLogger.js';
import { logger } from '../utils/logger.js';
import { PaymentStatus, ProductionStatus } from '../types/order.types.js';

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

    const isValid = canTransitionShippingStatus(currentShippingStatus, newStatus, false);
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

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;
    const itemsToProcess = Array.isArray(items) && items.length > 0 ? items : (orderData.items || []);

    const effectiveKey = idempotencyKey || `phys_receive_${orderId}_${returnId || Date.now()}`;

    const result = await processPhysicalReturn(orderId, itemsToProcess, effectiveKey, {
      reason: reason || 'Recebimento e conferência física do retorno',
      operator: user?.email || user?.uid || 'Admin',
      returnId
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'PROCESS_PHYSICAL_RECEIVE',
      resource: 'orders',
      resourceId: orderId,
      metadata: { returnId, itemsCount: itemsToProcess.length, result },
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

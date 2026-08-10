import { Request, Response } from 'express';
import { getDb } from '../firebase.js';
import admin from 'firebase-admin';
import { canTransitionProductionStatus, canTransitionPaymentStatus } from '../services/stateMachine.service.js';
import { adjustStock } from '../services/store.service.js';
import { recordAuditLog } from '../utils/auditLogger.js';
import { logger } from '../utils/logger.js';
import { PaymentStatus, ProductionStatus } from '../types/order.types.js';

/**
 * Admin Controller for Phase 4 Operational Features:
 * - Independent Production Status Management with History & Audit
 * - Independent Payment Status Management with Stock Reversion & Audit
 * - Stock Adjustment with Stock Movements Logging & Audit
 * - CSV Exports for Orders & Financial Data
 */

export async function updateOrderProductionStatus(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const { newStatus, currentStage, note } = req.body;
    const user = (req as any).user;

    if (!orderId || !newStatus) {
      return res.status(400).json({ error: 'orderId e newStatus são obrigatórios.' });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;
    const currentProdStatus: ProductionStatus = orderData.production?.status || orderData.productionStatus || 'waiting';

    const isValid = canTransitionProductionStatus(currentProdStatus, newStatus as ProductionStatus, true);
    if (!isValid) {
      return res.status(400).json({ 
        error: 'Transição Inválida', 
        message: `Não é permitido alterar o estágio de produção de '${currentProdStatus}' para '${newStatus}'.` 
      });
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

    await orderRef.update({
      'production.status': newStatus,
      'production.currentStage': stageName,
      productionStatus: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion(historyEntry)
    });

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'UPDATE_PRODUCTION_STATUS',
      resource: 'orders',
      resourceId: orderId,
      metadata: { previousStatus: currentProdStatus, newStatus, currentStage: stageName, note },
      ip: req.ip
    });

    logger.info(`🏭 [ADMIN-PROD] Order ${orderId} production status updated: ${currentProdStatus} -> ${newStatus} by ${user?.email}`);

    res.json({ success: true, orderId, productionStatus: newStatus, currentStage: stageName });
  } catch (error: any) {
    logger.error(`❌ [ADMIN-PROD-ERR] ${error.message}`, error);
    res.status(500).json({ error: error.message || 'Erro ao atualizar estágio de produção.' });
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
        error: 'Transição Inválida',
        message: `Não é permitido alterar o status de pagamento de '${currentPayStatus}' para '${newStatus}'.`
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
      updatePayload['payment.pendingAmount'] = 0;
      updatePayload['payment.paidAt'] = timestamp;
      updatePayload.status = 'Pagamento Aprovado';
      updatePayload.status_pedido = 'pago';
    } else if (['rejected', 'cancelled', 'expired'].includes(newStatus)) {
      updatePayload['payment.paidAmount'] = 0;
      updatePayload['payment.pendingAmount'] = totalAmount;
      updatePayload.status = 'Pagamento Não Realizado';
    }

    await orderRef.update(updatePayload);

    // Stock Reversion for failed or cancelled orders if not already done
    const isFailed = ['rejected', 'cancelled', 'expired'].includes(newStatus);
    const wasNotAlreadyReverted = !orderData.stockReverted && !orderData.stockRevertedAcknowledged;

    if (isFailed && wasNotAlreadyReverted && Array.isArray(orderData.items) && orderData.items.length > 0) {
      logger.info(`📦 [ADMIN-PAY] Reverting stock for cancelled/failed order ${orderId}`);
      await adjustStock(orderData.items, 'add');
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
    const { productSlug, variantKey, type, quantity, reason } = req.body;
    const user = (req as any).user;

    if (!productSlug || !variantKey || !type || typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({ error: 'productSlug, variantKey, type e quantidade são obrigatórios e válidos.' });
    }

    const db = getDb();
    const invRef = db.collection('inventory').doc(productSlug);
    const invSnap = await invRef.get();

    const invData = invSnap.exists ? invSnap.data()! : {};
    const variants = invData.variants || {};
    const currentVariant = variants[variantKey] || { stock: 0 };
    const previousStock = Number(currentVariant.stock || 0);

    let newStock = previousStock;
    if (type === 'add') newStock = previousStock + quantity;
    else if (type === 'subtract') newStock = Math.max(0, previousStock - quantity);
    else if (type === 'adjust') newStock = Math.max(0, quantity);

    variants[variantKey] = {
      ...currentVariant,
      stock: newStock
    };

    await invRef.set({
      ...invData,
      variants,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    // Save stock movement record
    const movementRef = db.collection('stock_movements').doc();
    const movementData = {
      id: movementRef.id,
      productSlug,
      variantKey,
      type,
      quantity,
      previousStock,
      newStock,
      reason: reason || 'Ajuste manual de estoque',
      operator: user?.email || user?.uid || 'Admin',
      timestamp: new Date().toISOString()
    };
    await movementRef.set(movementData);

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'STOCK_MOVEMENT',
      resource: 'inventory',
      resourceId: productSlug,
      metadata: movementData,
      ip: req.ip
    });

    logger.info(`📦 [STOCK-MOVEMENT] ${productSlug} (${variantKey}): ${previousStock} -> ${newStock} (${type}) by ${user?.email}`);

    res.json({ success: true, movement: movementData });
  } catch (error: any) {
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

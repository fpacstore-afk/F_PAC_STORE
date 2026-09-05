from pathlib import Path

path = Path('server/controllers/admin.controller.ts')
text = path.read_text()
start = text.index('export async function updateOrderPaymentStatus')
end = text.index('\nexport async function recordStockMovement', start)

replacement = r'''export async function updateOrderPaymentStatus(req: Request, res: Response) {
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
      const currentPayStatus: PaymentStatus = orderData.payment?.status || orderData.paymentStatus || 'pending';
      const isValid = canTransitionPaymentStatus(currentPayStatus, newStatus as PaymentStatus, true);
      if (!isValid) {
        const err: any = new Error(`Não é permitido alterar o status de pagamento de '${currentPayStatus}' para '${newStatus}'.`);
        err.status = 400;
        err.code = 'INVALID_PAYMENT_TRANSITION';
        throw err;
      }

      const existingPaidAmount = Number(orderData.payment?.paidAmount ?? orderData.amountPaid ?? 0);
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

      const totalAmount = Number(orderData.pricing?.total || orderData.total || 0);
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
        updatePayload.amountPaid = effectivePaid;
        updatePayload['payment.refundedAmount'] = calcRefunded;
        updatePayload.refundedAmount = calcRefunded;
        updatePayload['payment.pendingAmount'] = 0;
        updatePayload.balanceDue = 0;
        updatePayload.status = newStatus === 'refunded' ? 'Reembolsado' : 'Reembolsado Parcialmente';
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
          updatePayload.status = 'Pagamento Não Realizado';
        }
      }

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
'''

path.write_text(text[:start] + replacement + text[end:])
print('patched', path)

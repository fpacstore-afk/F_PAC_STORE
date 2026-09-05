from pathlib import Path

path = Path("server/controllers/admin.controller.ts")
source = path.read_text(encoding="utf-8")

start_marker = "export async function updateOrderProductionStatus(req: Request, res: Response) {"
end_marker = "\nexport async function updateOrderProductionPriority(req: Request, res: Response) {"

start = source.find(start_marker)
end = source.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("Production status controller boundaries not found")

replacement = r'''export async function updateOrderProductionStatus(req: Request, res: Response) {
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

      const currentIndex = CANONICAL_PRODUCTION_STATUSES.indexOf(currentProdStatus);
      const newIndex = CANONICAL_PRODUCTION_STATUSES.indexOf(newStatus as ProductionStatus);

      if (newIndex < currentIndex && currentProdStatus !== newStatus) {
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
'''

updated = source[:start] + replacement + source[end:]
if updated == source:
    print("No changes needed")
else:
    path.write_text(updated, encoding="utf-8")
    print("Applied PRODUCTION 2.0 transactional transition fix")

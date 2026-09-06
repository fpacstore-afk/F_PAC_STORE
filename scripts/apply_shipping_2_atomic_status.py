from pathlib import Path

admin_path = Path('server/controllers/admin.controller.ts')
store_path = Path('server/services/store.service.ts')

admin_text = admin_path.read_text()
store_text = store_path.read_text()

# 1) Expose a transaction-aware reservation consumption primitive while preserving
# the existing public wrapper for all current callers.
consume_start = store_text.index('export async function consumeStockReservation(')
consume_end = store_text.index('\n/**\n * Processes a physical return.', consume_start)

consume_replacement = r'''export async function consumeStockReservationInTransaction(
  transaction: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  orderId: string,
  items: any[],
  idempotencyKey?: string
) {
  const effectiveIdempotencyKey = idempotencyKey || `consume_order_${orderId}`;
  const normalizedItems = aggregateInventoryItems(items);

  if (await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey)) {
    return { success: true, idempotent: true };
  }

  const itemReads: any[] = [];
  for (const item of normalizedItems) {
    const physicalSlug = getPhysicalSlug(item);
    const variantKey = getVariantKey(item);
    const reservation = await readReservationCompat(transaction, db, orderId, physicalSlug, variantKey);
    if (!reservation.resSnap.exists) {
      throw new Error(`INVENTORY_INCONSISTENCY: Reserva não encontrada para #${orderId}/${physicalSlug}/${variantKey}.`);
    }
    const resData = reservation.resSnap.data() || {};
    if (resData.status === 'consumed') continue;
    if (resData.status !== 'active') {
      throw new Error(`INVENTORY_INCONSISTENCY: Reserva ${orderId}/${physicalSlug}/${variantKey} não está ativa (status: ${resData.status}).`);
    }
    const invRef = db.collection('inventory').doc(physicalSlug);
    const invDoc = await transaction.get(invRef);
    if (!invDoc.exists) {
      throw new Error(`INVENTORY_INCONSISTENCY: Documento de inventário para "${physicalSlug}" não existe.`);
    }
    itemReads.push({ item, physicalSlug, variantKey, ...reservation, resData, invRef, invDoc });
  }

  // All reads above complete before the first write, satisfying Firestore transaction rules.
  recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, undefined, { orderId, type: 'consume' });

  for (const entry of itemReads) {
    const { item, physicalSlug, variantKey, resRef, legacyRef, resData, invRef, invDoc } = entry;
    const requestedQty = Math.max(1, Number(resData.quantity ?? item.quantity) || 1);
    const data = invDoc.data() || {};
    const variantData = (data.variants || {})[variantKey] || {};
    const stats = getVariantStats(variantData, physicalSlug, variantKey);

    if (stats.physicalQuantity < requestedQty) {
      throw new Error(`INVENTORY_INCONSISTENCY: Estoque físico insuficiente (${stats.physicalQuantity}) para consumo de ${requestedQty} unidades na variante ${variantKey}.`);
    }
    if (stats.reservedQuantity < requestedQty) {
      throw new Error(`INVENTORY_INCONSISTENCY: Estoque reservado insuficiente (${stats.reservedQuantity}) para consumo de ${requestedQty} unidades na variante ${variantKey}.`);
    }

    const newPhysicalQuantity = stats.physicalQuantity - requestedQty;
    const newReservedQuantity = stats.reservedQuantity - requestedQty;
    const newAvailableQuantity = newPhysicalQuantity - newReservedQuantity;
    if (newPhysicalQuantity < 0 || newReservedQuantity < 0 || newAvailableQuantity < 0) {
      throw new Error(`INVENTORY_INCONSISTENCY: Consumo da reserva resultaria em valores negativos (Físico: ${newPhysicalQuantity}, Reservado: ${newReservedQuantity}, Disponível: ${newAvailableQuantity}).`);
    }

    const updatedVariant = {
      ...variantData,
      physicalQuantity: newPhysicalQuantity,
      reservedQuantity: newReservedQuantity,
      availableQuantity: newAvailableQuantity,
      stock: newPhysicalQuantity,
      available: newAvailableQuantity > 0,
      updatedAt: new Date().toISOString()
    };
    const totals = buildUpdatedInventory(data, physicalSlug, variantKey, updatedVariant);
    transaction.update(invRef, {
      stock: totals.totalPhysical,
      totalPhysicalStock: totals.totalPhysical,
      totalReservedStock: totals.totalReserved,
      totalAvailableStock: totals.totalAvailable,
      variants: totals.updatedVariants,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, physicalSlug, variantKey, { orderId, type: 'consume' });
    const movementRef = db.collection('stock_movements').doc();
    transaction.set(movementRef, {
      id: movementRef.id,
      orderId,
      orderItemId: item.id || null,
      variantId: item.variantId || `${physicalSlug}_${variantKey}`,
      productSlug: physicalSlug,
      variantKey,
      sku: stats.sku,
      type: 'reservation_consumption',
      quantity: requestedQty,
      previousPhysicalQuantity: stats.physicalQuantity,
      newPhysicalQuantity,
      previousReservedQuantity: stats.reservedQuantity,
      newReservedQuantity,
      previousAvailableQuantity: stats.availableQuantity,
      newAvailableQuantity,
      referenceType: 'order',
      referenceId: orderId,
      reservationId: reservationDocumentId(orderId, physicalSlug, variantKey),
      reason: `Baixa física (consumo de reserva) do pedido #${orderId}`,
      performedBy: 'system',
      createdAt: new Date().toISOString(),
      idempotencyKey: effectiveIdempotencyKey,
      variantIdempotencyKey: itemIdempotencyKey(effectiveIdempotencyKey, physicalSlug, variantKey)
    });
    transaction.set(resRef, {
      ...resData,
      id: resRef.id,
      productSlug: physicalSlug,
      variantKey,
      status: 'consumed',
      consumedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    if (legacyRef && legacyRef.path !== resRef.path) {
      transaction.set(legacyRef, {
        status: 'consumed',
        migratedReservationId: resRef.id,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  }

  return { success: true };
}

/** Consume an active reservation exactly once when the order is physically shipped. */
export async function consumeStockReservation(orderId: string, items: any[], idempotencyKey?: string) {
  const db = getDb();
  return db.runTransaction(async (transaction) => {
    return consumeStockReservationInTransaction(transaction, db, orderId, items, idempotencyKey);
  });
}
'''

store_text = store_text[:consume_start] + consume_replacement + store_text[consume_end:]

# 2) Import transaction-aware primitive in admin controller.
old_import = "import { adjustStock, OutOfStockError, getVariantStats, releaseStockReservation, consumeStockReservation, processPhysicalReturn } from '../services/store.service.js';"
new_import = "import { adjustStock, OutOfStockError, getVariantStats, releaseStockReservation, consumeStockReservation, consumeStockReservationInTransaction, processPhysicalReturn } from '../services/store.service.js';"
if old_import not in admin_text and new_import not in admin_text:
    raise RuntimeError('store.service import anchor not found')
admin_text = admin_text.replace(old_import, new_import)

# 3) Replace shipping status mutation with one end-to-end Firestore transaction.
ship_start = admin_text.index('export async function updateOrderShippingStatus')
ship_end = admin_text.index('\n/**\n * Authorizes a return request', ship_start)

ship_replacement = r'''export async function updateOrderShippingStatus(req: Request, res: Response) {
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
      const eligibility = assertShippingOrderEligible(orderData);
      if (!eligibility.eligible) {
        const err: any = new Error(eligibility.message || 'Pedido não elegível para envio.');
        err.code = eligibility.error || 'SHIPPING_ORDER_NOT_ELIGIBLE';
        err.status = 400;
        throw err;
      }

      const currentShippingStatus = normalizeShippingStatus(
        orderData.shipping?.status || orderData.shippingStatus || 'pending'
      );

      if (!canTransitionShippingStatus(currentShippingStatus, newStatus, orderData)) {
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
          `shipping_shipped_${orderId}`
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
'''

admin_text = admin_text[:ship_start] + ship_replacement + admin_text[ship_end:]

store_path.write_text(store_text)
admin_path.write_text(admin_text)
print('patched', store_path)
print('patched', admin_path)

import { getDb } from "../firebase.js";
import admin from "firebase-admin";
import { generateTrackingToken, hashTrackingToken } from './tracking.service.js';

export class OutOfStockError extends Error {
  public details: { item: string; requested: number; available: number };
  constructor(message: string, details: { item: string; requested: number; available: number }) {
    super(message);
    this.name = "OutOfStockError";
    this.details = details;
  }
}

/**
 * Extracts normalized Stock 2.0 variant stats from variant data.
 */
export function getVariantStats(variantData: any = {}, productSlug: string = '', variantKey: string = '') {
  const physicalQuantity = Number(
    variantData.physicalQuantity !== undefined ? variantData.physicalQuantity : (variantData.stock ?? 0)
  ) || 0;

  const reservedQuantity = Number(
    variantData.reservedQuantity !== undefined ? variantData.reservedQuantity : (variantData.reserved ?? 0)
  ) || 0;

  const availableQuantity = Math.max(0, physicalQuantity - reservedQuantity);

  const parts = variantKey.split('_');
  const color = variantData.color || parts[0] || 'STD';
  const size = variantData.size || parts[1] || 'UNI';

  const sku = variantData.sku || `FP-${productSlug.toUpperCase()}-${color.substring(0, 2).toUpperCase()}-${size.toUpperCase()}`;

  return {
    physicalQuantity,
    reservedQuantity,
    availableQuantity,
    sku,
    color,
    size,
    minimumStock: Number(variantData.minimumStock ?? variantData.minStock ?? 0),
    maximumStock: variantData.maximumStock !== undefined ? Number(variantData.maximumStock) : undefined,
    active: variantData.active ?? true
  };
}

function getPhysicalSlug(item: any): string {
  return String(item?.parentSlug || item?.slug || item?.productId || item?.id || '').trim();
}

function getVariantKey(item: any): string {
  return String(item?.variantKey || `${item?.color}_${item?.size}`);
}

/**
 * Aggregates duplicate physical variants before transactional reads/writes.
 * This prevents two cart/order lines that resolve to the same physical variant from
 * independently validating the same snapshot and then overwriting one another.
 */
export function aggregateInventoryItems(items: any[] = []): any[] {
  const grouped = new Map<string, any>();

  for (const raw of items || []) {
    const physicalSlug = getPhysicalSlug(raw);
    if (!physicalSlug) continue;
    const variantKey = getVariantKey(raw);
    const quantity = Math.max(1, Number(raw?.quantity) || 1);
    const key = `${physicalSlug}::${variantKey}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.quantity += quantity;
      existing.sourceItems.push(raw);
    } else {
      grouped.set(key, {
        ...raw,
        parentSlug: raw.parentSlug || physicalSlug,
        physicalSlug,
        variantKey,
        quantity,
        sourceItems: [raw]
      });
    }
  }

  return Array.from(grouped.values());
}

function reservationDocumentId(orderId: string, physicalSlug: string, variantKey: string) {
  return `${orderId}_${physicalSlug}_${variantKey}`;
}

function itemIdempotencyKey(baseKey: string, physicalSlug?: string, variantKey?: string) {
  return [baseKey, physicalSlug, variantKey].filter(Boolean).join('_');
}

/**
 * Checks stock availability based on AVAILABLE stock (physical - reserved).
 */
export async function checkStock(items: any[]): Promise<{ isAvailable: boolean; message?: string }> {
  const db = getDb();
  for (const item of aggregateInventoryItems(items)) {
    const targetSlug = getPhysicalSlug(item);
    if (!targetSlug) continue;

    const invRef = db.collection('inventory').doc(targetSlug);
    const invDoc = await invRef.get();

    const variantKey = getVariantKey(item);
    const requestedQty = Math.max(1, Number(item.quantity) || 1);

    if (!invDoc.exists) {
      return {
        isAvailable: false,
        message: `O produto "${item.name || targetSlug}" não possui estoque cadastrado.`
      };
    }

    const data = invDoc.data() || {};
    const currentVariants = data.variants || {};
    const variantData = currentVariants[variantKey] || {};
    const stats = getVariantStats(variantData, targetSlug, variantKey);

    if (stats.availableQuantity < requestedQty) {
      return {
        isAvailable: false,
        message: `O produto "${item.name || targetSlug}" (${stats.color} - ${stats.size}) possui estoque disponível insuficiente (Disponível: ${stats.availableQuantity}, Solicitado: ${requestedQty}).`
      };
    }
  }
  return { isAvailable: true };
}

/**
 * Helper to check and record stock idempotency atomically within a transaction.
 * Legacy idempotency_records is read-only here so operations created before the
 * Stock 2.0 migration remain protected from duplicate side effects.
 */
async function isIdempotentDuplicate(
  transaction: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  effectiveIdempotencyKey: string,
  physicalSlug?: string,
  variantKey?: string
): Promise<boolean> {
  if (!effectiveIdempotencyKey) return false;

  const canonicalRef = db.collection('stock_idempotency').doc(effectiveIdempotencyKey);
  const canonicalSnap = await transaction.get(canonicalRef);
  if (canonicalSnap.exists) return true;

  const legacyRef = db.collection('idempotency_records').doc(effectiveIdempotencyKey);
  const legacySnap = await transaction.get(legacyRef);
  if (legacySnap.exists) return true;

  if (physicalSlug && variantKey) {
    const itemKey = itemIdempotencyKey(effectiveIdempotencyKey, physicalSlug, variantKey);
    const itemRef = db.collection('stock_idempotency').doc(itemKey);
    const itemSnap = await transaction.get(itemRef);
    if (itemSnap.exists) return true;

    const legacyItemRef = db.collection('idempotency_records').doc(`${effectiveIdempotencyKey}_${variantKey}`);
    const legacyItemSnap = await transaction.get(legacyItemRef);
    if (legacyItemSnap.exists) return true;
  }

  const movementQuery = db.collection('stock_movements')
    .where('idempotencyKey', '==', effectiveIdempotencyKey)
    .limit(1);
  const movementSnap = await transaction.get(movementQuery);
  return !movementSnap.empty;
}

function recordIdempotencyKey(
  transaction: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  effectiveIdempotencyKey: string,
  physicalSlug?: string,
  variantKey?: string,
  details: any = {}
) {
  if (!effectiveIdempotencyKey) return;

  const idempRef = db.collection('stock_idempotency').doc(effectiveIdempotencyKey);
  transaction.set(idempRef, {
    id: effectiveIdempotencyKey,
    createdAt: new Date().toISOString(),
    ...details
  }, { merge: true });

  if (physicalSlug && variantKey) {
    const itemKey = itemIdempotencyKey(effectiveIdempotencyKey, physicalSlug, variantKey);
    const itemRef = db.collection('stock_idempotency').doc(itemKey);
    transaction.set(itemRef, {
      id: itemKey,
      baseKey: effectiveIdempotencyKey,
      productSlug: physicalSlug,
      variantKey,
      createdAt: new Date().toISOString(),
      ...details
    }, { merge: true });
  }
}

function buildUpdatedInventory(data: any, physicalSlug: string, variantKey: string, updatedVariant: any) {
  const currentVariants = data.variants || {};
  const updatedVariants = { ...currentVariants, [variantKey]: updatedVariant };
  const totalPhysical = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
    return sum + (Number(v.physicalQuantity !== undefined ? v.physicalQuantity : (v.stock ?? 0)) || 0);
  }, 0);
  const totalReserved = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
    return sum + (Number(v.reservedQuantity !== undefined ? v.reservedQuantity : (v.reserved ?? 0)) || 0);
  }, 0);
  const totalAvailable = Math.max(0, totalPhysical - totalReserved);
  return { updatedVariants, totalPhysical, totalReserved, totalAvailable };
}

/**
 * Reserves stock for pending / newly created order.
 */
export async function reserveStock(orderId: string, items: any[], idempotencyKey?: string, orderData?: any) {
  const db = getDb();
  const effectiveIdempotencyKey = idempotencyKey || `reserve_order_${orderId}`;
  const normalizedItems = aggregateInventoryItems(items);

  return db.runTransaction(async (transaction) => {
    const duplicate = await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey);
    if (duplicate) return { success: true, idempotent: true };

    const orderRef = db.collection('orders').doc(orderId);
    if (orderData) {
      const existingOrder = await transaction.get(orderRef);
      if (existingOrder.exists) {
        throw new Error(`Order ${orderId} already exists before checkout reservation`);
      }
    }

    const itemReads: any[] = [];
    for (const item of normalizedItems) {
      const physicalSlug = getPhysicalSlug(item);
      const variantKey = getVariantKey(item);
      const requestedQty = Math.max(1, Number(item.quantity) || 1);
      const invRef = db.collection('inventory').doc(physicalSlug);
      const invDoc = await transaction.get(invRef);

      if (!invDoc.exists) {
        throw new OutOfStockError(`Estoque não cadastrado para "${item.name || physicalSlug}".`, {
          item: `${item.name || physicalSlug} (${variantKey})`, requested: requestedQty, available: 0
        });
      }

      const data = invDoc.data() || {};
      const variantData = (data.variants || {})[variantKey] || {};
      const stats = getVariantStats(variantData, physicalSlug, variantKey);
      if (stats.availableQuantity < requestedQty) {
        throw new OutOfStockError(
          `Estoque disponível insuficiente para "${item.name || physicalSlug}" (${stats.color} - ${stats.size}). Disponível: ${stats.availableQuantity}, Solicitado: ${requestedQty}`,
          { item: `${item.name || physicalSlug} (${stats.color} - ${stats.size})`, requested: requestedQty, available: stats.availableQuantity }
        );
      }
      itemReads.push({ item, physicalSlug, variantKey, requestedQty, invRef, invDoc, stats });
    }

    if (orderData) {
      transaction.set(orderRef, {
        ...orderData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, undefined, { orderId, type: 'reserve' });

    for (const { item, physicalSlug, variantKey, requestedQty, invRef, invDoc, stats } of itemReads) {
      recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, physicalSlug, variantKey, { orderId, type: 'reserve' });
      const data = invDoc.data() || {};
      const variantData = (data.variants || {})[variantKey] || {};
      const newReservedQuantity = stats.reservedQuantity + requestedQty;
      const newAvailableQuantity = stats.physicalQuantity - newReservedQuantity;
      if (newAvailableQuantity < 0) {
        throw new OutOfStockError(`Reserva resultaria em estoque disponível negativo para ${physicalSlug}/${variantKey}.`, {
          item: `${physicalSlug} (${variantKey})`, requested: requestedQty, available: stats.availableQuantity
        });
      }

      const updatedVariant = {
        ...variantData,
        id: `${physicalSlug}_${variantKey}`,
        productId: physicalSlug,
        productSlug: physicalSlug,
        variantId: variantKey,
        sku: stats.sku,
        color: stats.color,
        size: stats.size,
        physicalQuantity: stats.physicalQuantity,
        reservedQuantity: newReservedQuantity,
        availableQuantity: newAvailableQuantity,
        stock: stats.physicalQuantity,
        available: newAvailableQuantity > 0,
        active: stats.active,
        minimumStock: stats.minimumStock,
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

      const reservationId = reservationDocumentId(orderId, physicalSlug, variantKey);
      const movementRef = db.collection('stock_movements').doc();
      transaction.set(movementRef, {
        id: movementRef.id,
        orderId,
        orderItemId: item.id || null,
        variantId: item.variantId || `${physicalSlug}_${variantKey}`,
        productSlug: physicalSlug,
        variantKey,
        sku: stats.sku,
        type: 'reservation_create',
        quantity: requestedQty,
        previousPhysicalQuantity: stats.physicalQuantity,
        newPhysicalQuantity: stats.physicalQuantity,
        previousReservedQuantity: stats.reservedQuantity,
        newReservedQuantity,
        previousAvailableQuantity: stats.availableQuantity,
        newAvailableQuantity,
        referenceType: 'order',
        referenceId: orderId,
        reservationId,
        reason: `Reserva para pedido #${orderId}`,
        performedBy: 'system',
        createdAt: new Date().toISOString(),
        idempotencyKey: effectiveIdempotencyKey,
        variantIdempotencyKey: itemIdempotencyKey(effectiveIdempotencyKey, physicalSlug, variantKey)
      });

      const resRef = db.collection('stock_reservations').doc(`${orderId}_${physicalSlug}_${variantKey}`);
      transaction.set(resRef, {
        id: resRef.id,
        orderId,
        orderItemId: item.id || null,
        variantId: item.variantId || `${physicalSlug}_${variantKey}`,
        productSlug: physicalSlug,
        variantKey,
        sku: stats.sku,
        quantity: requestedQty,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    return { success: true };
  });
}

async function readReservationCompat(
  transaction: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  orderId: string,
  physicalSlug: string,
  variantKey: string
) {
  const canonicalRef = db.collection('stock_reservations').doc(`${orderId}_${physicalSlug}_${variantKey}`);
  const canonicalSnap = await transaction.get(canonicalRef);
  if (canonicalSnap.exists) return { resRef: canonicalRef, resSnap: canonicalSnap };
  const legacyRef = db.collection('stock_reservations').doc(`${orderId}_${variantKey}`);
  const legacySnap = await transaction.get(legacyRef);
  return { resRef: canonicalRef, resSnap: legacySnap, legacyRef };
}

/** Release an active reservation without touching physical stock. */
export async function releaseStockReservation(orderId: string, items: any[], idempotencyKey?: string) {
  const db = getDb();
  const effectiveIdempotencyKey = idempotencyKey || `release_order_${orderId}`;
  const normalizedItems = aggregateInventoryItems(items);

  return db.runTransaction(async (transaction) => {
    if (await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey)) return { success: true, idempotent: true };

    const itemReads: any[] = [];
    for (const item of normalizedItems) {
      const physicalSlug = getPhysicalSlug(item);
      const variantKey = getVariantKey(item);
      const reservation = await readReservationCompat(transaction, db, orderId, physicalSlug, variantKey);
      const invRef = db.collection('inventory').doc(physicalSlug);
      const invDoc = await transaction.get(invRef);
      itemReads.push({ item, physicalSlug, variantKey, ...reservation, invRef, invDoc });
    }

    recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, undefined, { orderId, type: 'release' });

    for (const entry of itemReads) {
      const { item, physicalSlug, variantKey, resRef, resSnap, legacyRef, invRef, invDoc } = entry;
      if (!resSnap.exists) {
        throw new Error(`INVENTORY_INCONSISTENCY: Reserva não encontrada para o pedido #${orderId}, produto ${physicalSlug}, variante ${variantKey}.`);
      }
      const resData = resSnap.data() || {};
      if (resData.status === 'released') continue;
      if (resData.status === 'consumed') {
        throw new Error(`INVENTORY_INCONSISTENCY: Não é possível liberar reserva já consumida (${orderId}/${physicalSlug}/${variantKey}).`);
      }
      if (!invDoc.exists) throw new Error(`INVENTORY_INCONSISTENCY: Inventário ${physicalSlug} não encontrado ao liberar reserva.`);

      const requestedQty = Math.max(1, Number(resData.quantity ?? item.quantity) || 1);
      const data = invDoc.data() || {};
      const variantData = (data.variants || {})[variantKey] || {};
      const stats = getVariantStats(variantData, physicalSlug, variantKey);
      if (stats.reservedQuantity < requestedQty) {
        throw new Error(`INVENTORY_INCONSISTENCY: Reserva registrada (${requestedQty}) excede estoque reservado (${stats.reservedQuantity}) em ${physicalSlug}/${variantKey}.`);
      }

      const newReservedQuantity = stats.reservedQuantity - requestedQty;
      const newAvailableQuantity = stats.physicalQuantity - newReservedQuantity;
      const updatedVariant = { ...variantData, physicalQuantity: stats.physicalQuantity, reservedQuantity: newReservedQuantity, availableQuantity: newAvailableQuantity, stock: stats.physicalQuantity, available: newAvailableQuantity > 0, updatedAt: new Date().toISOString() };
      const totals = buildUpdatedInventory(data, physicalSlug, variantKey, updatedVariant);
      transaction.update(invRef, { stock: totals.totalPhysical, totalPhysicalStock: totals.totalPhysical, totalReservedStock: totals.totalReserved, totalAvailableStock: totals.totalAvailable, variants: totals.updatedVariants, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, physicalSlug, variantKey, { orderId, type: 'release' });
      const movementRef = db.collection('stock_movements').doc();
      transaction.set(movementRef, {
        id: movementRef.id, orderId, orderItemId: item.id || null, variantId: item.variantId || `${physicalSlug}_${variantKey}`, productSlug: physicalSlug, variantKey, sku: stats.sku,
        type: 'reservation_release', quantity: requestedQty,
        previousPhysicalQuantity: stats.physicalQuantity, newPhysicalQuantity: stats.physicalQuantity,
        previousReservedQuantity: stats.reservedQuantity, newReservedQuantity,
        previousAvailableQuantity: stats.availableQuantity, newAvailableQuantity,
        referenceType: 'order', referenceId: orderId, reservationId: reservationDocumentId(orderId, physicalSlug, variantKey),
        reason: `Liberação de reserva para pedido #${orderId}`, performedBy: 'system', createdAt: new Date().toISOString(), idempotencyKey: effectiveIdempotencyKey,
        variantIdempotencyKey: itemIdempotencyKey(effectiveIdempotencyKey, physicalSlug, variantKey)
      });
      transaction.set(resRef, { ...resData, id: resRef.id, productSlug: physicalSlug, variantKey, status: 'released', releasedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
      if (legacyRef && legacyRef.path !== resRef.path) transaction.set(legacyRef, { status: 'released', migratedReservationId: resRef.id, updatedAt: new Date().toISOString() }, { merge: true });
    }
    return { success: true };
  });
}

/** Consume an active reservation exactly once when the order is physically shipped. */
export async function consumeStockReservationInTransaction(
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

/**
 * Processes a physical return. Only resellable, non-customized items re-enter sellable stock.
 */
export async function processPhysicalReturn(
  orderId: string,
  items: any[],
  idempotencyKey?: string,
  options: { reason?: string; operator?: string; returnId?: string; notes?: string } = {}
) {
  const db = getDb();
  const effectiveIdempotencyKey = idempotencyKey || `return_order_${orderId}_${options.returnId || 'default'}`;

  return db.runTransaction(async (transaction) => {
    if (await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey)) return { success: true, idempotent: true };

    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await transaction.get(orderRef);
    const orderData = orderSnap.exists ? orderSnap.data()! : null;

    if (orderData && Array.isArray(orderData.items)) {
      const existingReturns = Array.isArray(orderData.returns) ? orderData.returns : [];
      for (const item of items) {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const variantKey = getVariantKey(item);
        const itemId = item.id || item.orderItemId;
        const orderItem = orderData.items.find((i: any) => (itemId && i.id === itemId) || (i.variantKey === variantKey || `${i.color}_${i.size}` === variantKey));
        if (!orderItem) throw new Error(`INVALID_RETURN_ITEM: Item devolvido não pertence ao pedido #${orderId}.`);
        const originalPurchasedQty = Number(orderItem.quantity || 0);
        const previouslyReturnedQty = existingReturns
          .filter((r: any) => (r.orderItemId && itemId && r.orderItemId === itemId) || (r.variantId && r.variantId === variantKey))
          .reduce((sum: number, r: any) => sum + (Number(r.quantity) || 0), 0);
        const maxReturnableQty = Math.max(0, originalPurchasedQty - previouslyReturnedQty);
        if (qty > maxReturnableQty) throw new Error(`INVALID_RETURN_QUANTITY: Quantidade solicitada para devolução (${qty}) excede o limite disponível (${maxReturnableQty}).`);
      }
    }

    const itemReads: any[] = [];
    for (const item of items) {
      const physicalSlug = getPhysicalSlug(item);
      if (!physicalSlug) continue;
      const variantKey = getVariantKey(item);
      const invRef = db.collection('inventory').doc(physicalSlug);
      const invDoc = await transaction.get(invRef);
      itemReads.push({ item, physicalSlug, variantKey, invRef, invDoc });
    }

    recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, undefined, { orderId, type: 'return' });
    const returnLedgerEntries: any[] = [];

    for (const { item, physicalSlug, variantKey, invRef, invDoc } of itemReads) {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const condition = item.condition || 'resellable';
      const matchingOrderItem = orderData?.items?.find((i: any) => (item.id && i.id === item.id) || (i.variantKey === variantKey || `${i.color}_${i.size}` === variantKey));
      const isCustomized = Boolean(item.isCustomized || item.isPersonalized || item.customText || matchingOrderItem?.isCustomized || matchingOrderItem?.isPersonalized || matchingOrderItem?.customText || matchingOrderItem?.stampName);
      const isResellable = item.resellable !== false && condition === 'resellable' && !isCustomized;

      if (!invDoc.exists) throw new Error(`INVENTORY_INCONSISTENCY: Inventário ${physicalSlug} não encontrado para devolução física.`);
      const data = invDoc.data() || {};
      const variantData = (data.variants || {})[variantKey] || {};
      const stats = getVariantStats(variantData, physicalSlug, variantKey);
      let newPhysicalQuantity = stats.physicalQuantity;
      const newReservedQuantity = stats.reservedQuantity;
      let newAvailableQuantity = stats.availableQuantity;

      if (isResellable) {
        newPhysicalQuantity += qty;
        newAvailableQuantity = newPhysicalQuantity - newReservedQuantity;
        const updatedVariant = { ...variantData, physicalQuantity: newPhysicalQuantity, reservedQuantity: newReservedQuantity, availableQuantity: newAvailableQuantity, stock: newPhysicalQuantity, available: newAvailableQuantity > 0, updatedAt: new Date().toISOString() };
        const totals = buildUpdatedInventory(data, physicalSlug, variantKey, updatedVariant);
        transaction.update(invRef, { stock: totals.totalPhysical, totalPhysicalStock: totals.totalPhysical, totalReservedStock: totals.totalReserved, totalAvailableStock: totals.totalAvailable, variants: totals.updatedVariants, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }

      recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, physicalSlug, variantKey, { orderId, type: 'return' });
      const movementRef = db.collection('stock_movements').doc();
      transaction.set(movementRef, {
        id: movementRef.id, orderId, orderItemId: item.id || null, variantId: item.variantId || `${physicalSlug}_${variantKey}`, productSlug: physicalSlug, variantKey, sku: stats.sku,
        type: isResellable ? 'return' : 'non_sellable_return', resellable: isResellable, condition, quantity: qty,
        previousPhysicalQuantity: stats.physicalQuantity, newPhysicalQuantity,
        previousReservedQuantity: stats.reservedQuantity, newReservedQuantity,
        previousAvailableQuantity: stats.availableQuantity, newAvailableQuantity,
        referenceType: 'order', referenceId: orderId,
        reason: options.reason || `Devolução física referente ao pedido #${orderId} (${isResellable ? 'Apto para revenda' : 'NÃO revendável/danificado/personalizado'})`,
        performedBy: options.operator || 'system', createdAt: new Date().toISOString(), idempotencyKey: effectiveIdempotencyKey,
        variantIdempotencyKey: itemIdempotencyKey(effectiveIdempotencyKey, physicalSlug, variantKey)
      });

      returnLedgerEntries.push({
        returnId: options.returnId || `ret_phys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        orderItemId: item.id || null, productSlug: physicalSlug, variantId: `${physicalSlug}_${variantKey}`, variantKey, quantity: qty,
        resellable: isResellable, condition, operator: options.operator || 'system', reason: options.reason || `Devolução física conferida (${isResellable ? 'Apto para revenda' : 'Impróprio para revenda/personalizado'})`,
        notes: item.notes || options.notes || null, createdAt: new Date().toISOString()
      });
    }

    if (orderSnap.exists && returnLedgerEntries.length > 0) {
      transaction.update(orderRef, { returns: admin.firestore.FieldValue.arrayUnion(...returnLedgerEntries), returnStatus: 'inspected', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    return { success: true, processedItems: returnLedgerEntries };
  });
}

/** Transactional manual inventory adjustment. */
export async function adjustStock(
  items: any[],
  mode: 'subtract' | 'add',
  options: { referenceId?: string; reason?: string; operator?: string; idempotencyKey?: string; isReservationFulfillment?: boolean } = {}
) {
  const db = getDb();
  const effectiveIdempotencyKey = options.idempotencyKey;
  const normalizedItems = aggregateInventoryItems(items);

  await db.runTransaction(async (transaction) => {
    if (effectiveIdempotencyKey && await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey)) return;

    const itemReads: any[] = [];
    for (const item of normalizedItems) {
      const physicalSlug = getPhysicalSlug(item);
      const variantKey = getVariantKey(item);
      const invRef = db.collection('inventory').doc(physicalSlug);
      const invDoc = await transaction.get(invRef);
      itemReads.push({ item, physicalSlug, variantKey, invRef, invDoc });
    }

    if (effectiveIdempotencyKey) recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, undefined, { type: 'adjust', mode });

    for (const { item, physicalSlug, variantKey, invRef, invDoc } of itemReads) {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      if (effectiveIdempotencyKey) recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, physicalSlug, variantKey, { type: 'adjust', mode });

      if (!invDoc.exists) {
        if (mode === 'subtract') throw new OutOfStockError(`Estoque não cadastrado para "${item.name || physicalSlug}" (${variantKey}).`, { item: `${item.name || physicalSlug} (${variantKey})`, requested: quantity, available: 0 });
        const stats = getVariantStats({}, physicalSlug, variantKey);
        const updatedVariant = { id: `${physicalSlug}_${variantKey}`, productId: physicalSlug, productSlug: physicalSlug, variantId: variantKey, sku: stats.sku, color: stats.color, size: stats.size, physicalQuantity: quantity, reservedQuantity: 0, availableQuantity: quantity, stock: quantity, available: quantity > 0, active: true, minimumStock: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        transaction.set(invRef, { stock: quantity, totalPhysicalStock: quantity, totalReservedStock: 0, totalAvailableStock: quantity, available: quantity > 0, variants: { [variantKey]: updatedVariant }, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        const movementRef = db.collection('stock_movements').doc();
        transaction.set(movementRef, { id: movementRef.id, productSlug: physicalSlug, variantKey, sku: stats.sku, type: 'add', quantity, previousPhysicalQuantity: 0, newPhysicalQuantity: quantity, previousReservedQuantity: 0, newReservedQuantity: 0, previousAvailableQuantity: 0, newAvailableQuantity: quantity, referenceType: options.referenceId ? 'order' : 'manual', referenceId: options.referenceId, reason: options.reason || 'Entrada inicial de estoque', performedBy: options.operator || 'system', createdAt: new Date().toISOString(), idempotencyKey: effectiveIdempotencyKey || undefined, variantIdempotencyKey: effectiveIdempotencyKey ? itemIdempotencyKey(effectiveIdempotencyKey, physicalSlug, variantKey) : undefined });
        continue;
      }

      const data = invDoc.data() || {};
      const variantData = (data.variants || {})[variantKey] || {};
      const stats = getVariantStats(variantData, physicalSlug, variantKey);
      let newPhysicalQuantity = stats.physicalQuantity;
      let newReservedQuantity = stats.reservedQuantity;

      if (mode === 'subtract') {
        if (options.isReservationFulfillment) {
          if (stats.physicalQuantity < quantity || stats.reservedQuantity < quantity) throw new OutOfStockError(`Estoque reservado/físico insuficiente para baixa de reserva "${item.name || physicalSlug}".`, { item: `${item.name || physicalSlug} (${variantKey})`, requested: quantity, available: Math.min(stats.physicalQuantity, stats.reservedQuantity) });
          newPhysicalQuantity -= quantity;
          newReservedQuantity -= quantity;
        } else {
          // Manual outbound check: MUST NOT consume reserved stock!
          if (stats.availableQuantity < quantity) throw new OutOfStockError(`Estoque disponível insuficiente para saída manual de "${item.name || physicalSlug}" (${stats.color} - ${stats.size}). Disponível: ${stats.availableQuantity}, Solicitado: ${quantity}`, { item: `${item.name || physicalSlug} (${stats.color} - ${stats.size})`, requested: quantity, available: stats.availableQuantity });
          newPhysicalQuantity -= quantity;
        }
      } else {
        newPhysicalQuantity += quantity;
      }

      if (newPhysicalQuantity < newReservedQuantity || newPhysicalQuantity < 0 || newReservedQuantity < 0) throw new OutOfStockError(`Ajuste inválido para "${item.name || physicalSlug}": físico ${newPhysicalQuantity}, reservado ${newReservedQuantity}.`, { item: `${item.name || physicalSlug} (${variantKey})`, requested: newPhysicalQuantity, available: newReservedQuantity });
      const newAvailableQuantity = newPhysicalQuantity - newReservedQuantity;
      const updatedVariant = { ...variantData, id: `${physicalSlug}_${variantKey}`, productId: physicalSlug, productSlug: physicalSlug, variantId: variantKey, sku: stats.sku, color: stats.color, size: stats.size, physicalQuantity: newPhysicalQuantity, reservedQuantity: newReservedQuantity, availableQuantity: newAvailableQuantity, stock: newPhysicalQuantity, available: newAvailableQuantity > 0, updatedAt: new Date().toISOString() };
      const totals = buildUpdatedInventory(data, physicalSlug, variantKey, updatedVariant);
      transaction.update(invRef, { stock: totals.totalPhysical, totalPhysicalStock: totals.totalPhysical, totalReservedStock: totals.totalReserved, totalAvailableStock: totals.totalAvailable, variants: totals.updatedVariants, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      const movementRef = db.collection('stock_movements').doc();
      transaction.set(movementRef, { id: movementRef.id, productSlug: physicalSlug, variantKey, sku: stats.sku, type: mode === 'subtract' ? (options.isReservationFulfillment ? 'sale' : 'subtract') : 'add', quantity, previousPhysicalQuantity: stats.physicalQuantity, newPhysicalQuantity, previousReservedQuantity: stats.reservedQuantity, newReservedQuantity, previousAvailableQuantity: stats.availableQuantity, newAvailableQuantity, referenceType: options.referenceId ? 'order' : 'manual', referenceId: options.referenceId, reason: options.reason || (mode === 'subtract' ? 'Baixa de estoque' : 'Acréscimo de estoque'), performedBy: options.operator || 'system', createdAt: new Date().toISOString(), idempotencyKey: effectiveIdempotencyKey || undefined, variantIdempotencyKey: effectiveIdempotencyKey ? itemIdempotencyKey(effectiveIdempotencyKey, physicalSlug, variantKey) : undefined });
    }
  });
}

export async function createOrder(orderId: string, orderData: any) {
  const db = getDb();
  const finalOrderData = { ...orderData };
  if (finalOrderData.trackingAccessToken) {
    const rawToken = finalOrderData.trackingAccessToken;
    delete finalOrderData.trackingAccessToken;
    finalOrderData.trackingAccessTokenHash = hashTrackingToken(rawToken);
  } else if (!finalOrderData.trackingAccessTokenHash) {
    const { hash } = generateTrackingToken();
    finalOrderData.trackingAccessTokenHash = hash;
  }
  await db.collection('orders').doc(orderId).set({ ...finalOrderData, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
}

export async function updateOrderStatus(orderId: string, status: string, extra: any = {}) {
  const db = getDb();
  await db.collection('orders').doc(orderId).update({ status, ...extra, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
}

export async function reserveOrderStock(order: { id: string; items: any[] }, idempotencyKey?: string) {
  return reserveStock(order.id, order.items || [], idempotencyKey || `reserve_order_${order.id}`);
}

export async function releaseOrderStock(order: { id: string; items: any[] }, idempotencyKey?: string) {
  return releaseStockReservation(order.id, order.items || [], idempotencyKey || `release_order_${order.id}`);
}

export async function consumeOrderStock(order: { id: string; items: any[] }, idempotencyKey?: string) {
  return consumeStockReservation(order.id, order.items || [], idempotencyKey || `consume_order_${order.id}`);
}

export async function processOrderReturn(order: { id: string; items: any[] }, idempotencyKey?: string, options?: { reason?: string; operator?: string }) {
  return processPhysicalReturn(order.id, order.items || [], idempotencyKey || `return_order_${order.id}`, options);
}

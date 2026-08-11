import { getDb } from "../firebase.js";
import admin from "firebase-admin";

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

/**
 * Checks stock availability based on AVAILABLE stock (physical - reserved).
 */
export async function checkStock(items: any[]): Promise<{ isAvailable: boolean; message?: string }> {
  const db = getDb();
  for (const item of items) {
    const targetSlug = item.parentSlug || item.slug || item.productId || item.id;
    if (!targetSlug) continue;

    const invRef = db.collection('inventory').doc(targetSlug);
    const invDoc = await invRef.get();

    const variantKey = item.variantKey || `${item.color}_${item.size}`;
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
 * Helper to check and record idempotency atomically within a transaction.
 */
async function isIdempotentDuplicate(
  transaction: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  effectiveIdempotencyKey: string,
  variantKey?: string
): Promise<boolean> {
  if (!effectiveIdempotencyKey) return false;

  const idempRef = db.collection('idempotency_records').doc(effectiveIdempotencyKey);
  const idempSnap = await transaction.get(idempRef);
  if (idempSnap.exists) {
    return true;
  }

  if (variantKey) {
    const itemKey = `${effectiveIdempotencyKey}_${variantKey}`;
    const itemRef = db.collection('idempotency_records').doc(itemKey);
    const itemSnap = await transaction.get(itemRef);
    if (itemSnap.exists) {
      return true;
    }
  }

  const movementQuery = db.collection('stock_movements')
    .where('idempotencyKey', '==', effectiveIdempotencyKey)
    .limit(1);
  const movementSnap = await transaction.get(movementQuery);
  if (!movementSnap.empty) {
    return true;
  }

  return false;
}

function recordIdempotencyKey(
  transaction: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  effectiveIdempotencyKey: string,
  variantKey?: string,
  details: any = {}
) {
  if (!effectiveIdempotencyKey) return;
  
  const idempRef = db.collection('idempotency_records').doc(effectiveIdempotencyKey);
  transaction.set(idempRef, {
    id: effectiveIdempotencyKey,
    createdAt: new Date().toISOString(),
    ...details
  }, { merge: true });

  if (variantKey) {
    const itemKey = `${effectiveIdempotencyKey}_${variantKey}`;
    const itemRef = db.collection('idempotency_records').doc(itemKey);
    transaction.set(itemRef, {
      id: itemKey,
      baseKey: effectiveIdempotencyKey,
      createdAt: new Date().toISOString(),
      ...details
    }, { merge: true });
  }
}

/**
 * Reserves stock for pending / newly created order.
 * Increases reservedQuantity, availableQuantity decreases, physicalQuantity remains unchanged.
 */
export async function reserveStock(orderId: string, items: any[], idempotencyKey?: string) {
  const db = getDb();
  const effectiveIdempotencyKey = idempotencyKey || `reserve_order_${orderId}`;

  return db.runTransaction(async (transaction) => {
    // 1. READ PASS: Check idempotency
    const duplicate = await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey);
    if (duplicate) {
      console.log(`📦 [STOCK] Reserve stock skipped for key ${effectiveIdempotencyKey} (idempotent duplicate)`);
      return { success: true, idempotent: true };
    }

    // READ PASS 2: Perform all transaction.get calls for all items
    const itemReads: Array<{
      item: any;
      physicalSlug: string;
      variantKey: string;
      invRef: FirebaseFirestore.DocumentReference;
      invDoc: FirebaseFirestore.DocumentSnapshot;
      requestedQty: number;
      stats: any;
    }> = [];

    for (const item of items) {
      const physicalSlug = item.parentSlug || item.slug || item.productId || item.id;
      if (!physicalSlug) continue;

      const variantKey = item.variantKey || `${item.color}_${item.size}`;
      const requestedQty = Math.max(1, Number(item.quantity) || 1);

      const invRef = db.collection('inventory').doc(physicalSlug);
      const invDoc = await transaction.get(invRef);

      if (!invDoc.exists) {
        throw new OutOfStockError(
          `Estoque não cadastrado para "${item.name || physicalSlug}".`,
          { item: `${item.name || physicalSlug} (${variantKey})`, requested: requestedQty, available: 0 }
        );
      }

      const data = invDoc.data() || {};
      const currentVariants = data.variants || {};
      const variantData = currentVariants[variantKey] || {};
      const stats = getVariantStats(variantData, physicalSlug, variantKey);

      if (stats.availableQuantity < requestedQty) {
        throw new OutOfStockError(
          `Estoque disponível insuficiente para "${item.name || physicalSlug}" (${stats.color} - ${stats.size}). Disponível: ${stats.availableQuantity}, Solicitado: ${requestedQty}`,
          { item: `${item.name || physicalSlug} (${stats.color} - ${stats.size})`, requested: requestedQty, available: stats.availableQuantity }
        );
      }

      itemReads.push({ item, physicalSlug, variantKey, invRef, invDoc, requestedQty, stats });
    }

    // 2. WRITE PASS: Record idempotency and perform all updates
    recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, { orderId, type: 'reserve' });

    for (const { item, physicalSlug, variantKey, invRef, invDoc, requestedQty, stats } of itemReads) {
      recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, variantKey, { orderId, type: 'reserve' });

      const data = invDoc.data() || {};
      const currentVariants = data.variants || {};
      const variantData = currentVariants[variantKey] || {};

      const newReservedQuantity = stats.reservedQuantity + requestedQty;
      const newAvailableQuantity = Math.max(0, stats.physicalQuantity - newReservedQuantity);

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

      const updatedVariants = {
        ...currentVariants,
        [variantKey]: updatedVariant
      };

      const totalPhysical: number = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
        const qty = Number(v.physicalQuantity !== undefined ? v.physicalQuantity : (v.stock ?? 0)) || 0;
        return sum + qty;
      }, 0);

      const totalReserved: number = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
        const qty = Number(v.reservedQuantity !== undefined ? v.reservedQuantity : (v.reserved ?? 0)) || 0;
        return sum + qty;
      }, 0);

      const totalAvailable = Math.max(0, totalPhysical - totalReserved);

      transaction.update(invRef, {
        stock: totalPhysical,
        totalPhysicalStock: totalPhysical,
        totalReservedStock: totalReserved,
        totalAvailableStock: totalAvailable,
        variants: updatedVariants,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Record reservation movement
      const movementRef = db.collection('stock_movements').doc();
      transaction.set(movementRef, {
        id: movementRef.id,
        orderId,
        orderItemId: item.id || null,
        variantId: item.variantId || `${physicalSlug}_${variantKey}`,
        productSlug: physicalSlug,
        variantKey,
        sku: stats.sku,
        type: 'reservation',
        quantity: requestedQty,
        previousPhysicalQuantity: stats.physicalQuantity,
        newPhysicalQuantity: stats.physicalQuantity,
        previousReservedQuantity: stats.reservedQuantity,
        newReservedQuantity,
        previousAvailableQuantity: stats.availableQuantity,
        newAvailableQuantity,
        referenceType: 'order',
        referenceId: orderId,
        reservationId: `${orderId}_${variantKey}`,
        reason: `Reserva para pedido #${orderId}`,
        performedBy: 'system',
        createdAt: new Date().toISOString(),
        idempotencyKey: effectiveIdempotencyKey,
        variantIdempotencyKey: `${effectiveIdempotencyKey}_${variantKey}`
      });

      // Record reservation tracking document
      const resRef = db.collection('stock_reservations').doc(`${orderId}_${variantKey}`);
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

/**
 * Releases reserved stock (e.g. order cancelled or expired).
 * Transitions reservation status: active -> released.
 * Decreases reservedQuantity, availableQuantity increases, physicalQuantity remains unchanged.
 */
export async function releaseStockReservation(orderId: string, items: any[], idempotencyKey?: string) {
  const db = getDb();
  const effectiveIdempotencyKey = idempotencyKey || `release_order_${orderId}`;

  return db.runTransaction(async (transaction) => {
    // 1. READ PASS
    const duplicate = await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey);
    if (duplicate) {
      console.log(`📦 [STOCK] Release reservation skipped for key ${effectiveIdempotencyKey} (idempotent duplicate)`);
      return { success: true, idempotent: true };
    }

    const itemReads: Array<{
      item: any;
      physicalSlug: string;
      variantKey: string;
      resRef: FirebaseFirestore.DocumentReference;
      resSnap: FirebaseFirestore.DocumentSnapshot;
      invRef: FirebaseFirestore.DocumentReference;
      invDoc: FirebaseFirestore.DocumentSnapshot;
    }> = [];

    for (const item of items) {
      const physicalSlug = item.parentSlug || item.slug || item.productId || item.id;
      if (!physicalSlug) continue;

      const variantKey = item.variantKey || `${item.color}_${item.size}`;
      const resRef = db.collection('stock_reservations').doc(`${orderId}_${variantKey}`);
      const resSnap = await transaction.get(resRef);

      const invRef = db.collection('inventory').doc(physicalSlug);
      const invDoc = await transaction.get(invRef);

      itemReads.push({ item, physicalSlug, variantKey, resRef, resSnap, invRef, invDoc });
    }

    // 2. WRITE PASS
    recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, { orderId, type: 'release' });

    for (const { item, physicalSlug, variantKey, resRef, resSnap, invRef, invDoc } of itemReads) {
      recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, variantKey, { orderId, type: 'release' });

      if (resSnap.exists) {
        const resData = resSnap.data() || {};
        if (resData.status === 'released') {
          console.log(`📦 [STOCK] Reservation ${orderId}_${variantKey} already released.`);
          continue;
        }
        if (resData.status === 'consumed') {
          console.log(`⚠️ [STOCK] Cannot release consumed reservation ${orderId}_${variantKey}`);
          continue;
        }
      }

      if (!invDoc.exists) continue;

      const requestedQty = Math.max(1, Number(item.quantity) || 1);
      const data = invDoc.data() || {};
      const currentVariants = data.variants || {};
      const variantData = currentVariants[variantKey] || {};
      const stats = getVariantStats(variantData, physicalSlug, variantKey);

      const newReservedQuantity = Math.max(0, stats.reservedQuantity - requestedQty);
      const newAvailableQuantity = Math.max(0, stats.physicalQuantity - newReservedQuantity);

      const updatedVariant = {
        ...variantData,
        physicalQuantity: stats.physicalQuantity,
        reservedQuantity: newReservedQuantity,
        availableQuantity: newAvailableQuantity,
        stock: stats.physicalQuantity,
        available: newAvailableQuantity > 0,
        updatedAt: new Date().toISOString()
      };

      const updatedVariants = {
        ...currentVariants,
        [variantKey]: updatedVariant
      };

      const totalPhysical: number = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
        const qty = Number(v.physicalQuantity !== undefined ? v.physicalQuantity : (v.stock ?? 0)) || 0;
        return sum + qty;
      }, 0);

      const totalReserved: number = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
        const qty = Number(v.reservedQuantity !== undefined ? v.reservedQuantity : (v.reserved ?? 0)) || 0;
        return sum + qty;
      }, 0);

      const totalAvailable = Math.max(0, totalPhysical - totalReserved);

      transaction.update(invRef, {
        stock: totalPhysical,
        totalPhysicalStock: totalPhysical,
        totalReservedStock: totalReserved,
        totalAvailableStock: totalAvailable,
        variants: updatedVariants,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const movementRef = db.collection('stock_movements').doc();
      transaction.set(movementRef, {
        id: movementRef.id,
        orderId,
        orderItemId: item.id || null,
        variantId: item.variantId || `${physicalSlug}_${variantKey}`,
        productSlug: physicalSlug,
        variantKey,
        sku: stats.sku,
        type: 'reservation_release',
        quantity: requestedQty,
        previousPhysicalQuantity: stats.physicalQuantity,
        newPhysicalQuantity: stats.physicalQuantity,
        previousReservedQuantity: stats.reservedQuantity,
        newReservedQuantity,
        previousAvailableQuantity: stats.availableQuantity,
        newAvailableQuantity,
        referenceType: 'order',
        referenceId: orderId,
        reservationId: `${orderId}_${variantKey}`,
        reason: `Liberação de reserva para pedido #${orderId}`,
        performedBy: 'system',
        createdAt: new Date().toISOString(),
        idempotencyKey: effectiveIdempotencyKey,
        variantIdempotencyKey: `${effectiveIdempotencyKey}_${variantKey}`
      });

      transaction.set(resRef, {
        status: 'released',
        releasedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    return { success: true };
  });
}

/**
 * Consumes reserved stock upon physical dispatch/fulfillment.
 * Transitions reservation status: active -> consumed.
 * Decreases physicalQuantity AND reservedQuantity, keeping availableQuantity consistent.
 */
export async function consumeStockReservation(orderId: string, items: any[], idempotencyKey?: string) {
  const db = getDb();
  const effectiveIdempotencyKey = idempotencyKey || `consume_order_${orderId}`;

  return db.runTransaction(async (transaction) => {
    const duplicate = await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey);
    if (duplicate) {
      console.log(`📦 [STOCK] Consume reservation skipped for key ${effectiveIdempotencyKey} (idempotent duplicate)`);
      return { success: true, idempotent: true };
    }

    // 1. READ PASS: Perform all transaction.get calls before any transaction.set/update
    const itemReads: Array<{
      item: any;
      physicalSlug: string;
      variantKey: string;
      resRef: FirebaseFirestore.DocumentReference;
      resData: any;
      invRef: FirebaseFirestore.DocumentReference;
      invDoc: FirebaseFirestore.DocumentSnapshot;
    }> = [];

    for (const item of items) {
      const physicalSlug = item.parentSlug || item.slug || item.productId || item.id;
      if (!physicalSlug) continue;

      const variantKey = item.variantKey || `${item.color}_${item.size}`;
      const resRef = db.collection('stock_reservations').doc(`${orderId}_${variantKey}`);
      const resSnap = await transaction.get(resRef);

      if (!resSnap.exists) {
        throw new Error(`INVENTORY_INCONSISTENCY: Reserva não encontrada em stock_reservations para o pedido #${orderId} e variante ${variantKey}.`);
      }

      const resData = resSnap.data() || {};
      if (resData.status === 'consumed') {
        console.log(`📦 [STOCK] Reservation ${orderId}_${variantKey} already consumed.`);
        continue;
      }
      if (resData.status === 'released') {
        throw new Error(`INVENTORY_INCONSISTENCY: Não é possível consumir a reserva ${orderId}_${variantKey} porque ela já foi liberada.`);
      }
      if (resData.status !== 'active') {
        throw new Error(`INVENTORY_INCONSISTENCY: Reserva ${orderId}_${variantKey} não está com status ativo (status atual: ${resData.status}).`);
      }

      const invRef = db.collection('inventory').doc(physicalSlug);
      const invDoc = await transaction.get(invRef);

      if (!invDoc.exists) {
        throw new Error(`INVENTORY_INCONSISTENCY: Documento de inventário para "${physicalSlug}" não existe.`);
      }

      itemReads.push({ item, physicalSlug, variantKey, resRef, resData, invRef, invDoc });
    }

    // 2. WRITE PASS: Record idempotency and perform all updates
    recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, { orderId, type: 'consume' });

    for (const { item, physicalSlug, variantKey, resRef, invRef, invDoc } of itemReads) {
      recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, variantKey, { orderId, type: 'consume' });

      const requestedQty = Math.max(1, Number(item.quantity) || 1);
      const data = invDoc.data() || {};
      const currentVariants = data.variants || {};
      const variantData = currentVariants[variantKey] || {};
      const stats = getVariantStats(variantData, physicalSlug, variantKey);

      // Strict validation of stock quantities before consumption
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

      const updatedVariants = {
        ...currentVariants,
        [variantKey]: updatedVariant
      };

      const totalPhysical: number = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
        const qty = Number(v.physicalQuantity !== undefined ? v.physicalQuantity : (v.stock ?? 0)) || 0;
        return sum + qty;
      }, 0);

      const totalReserved: number = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
        const qty = Number(v.reservedQuantity !== undefined ? v.reservedQuantity : (v.reserved ?? 0)) || 0;
        return sum + qty;
      }, 0);

      const totalAvailable = Math.max(0, totalPhysical - totalReserved);

      transaction.update(invRef, {
        stock: totalPhysical,
        totalPhysicalStock: totalPhysical,
        totalReservedStock: totalReserved,
        totalAvailableStock: totalAvailable,
        variants: updatedVariants,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

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
        reservationId: `${orderId}_${variantKey}`,
        reason: `Baixa física (consumo de reserva) do pedido #${orderId}`,
        performedBy: 'system',
        createdAt: new Date().toISOString(),
        idempotencyKey: effectiveIdempotencyKey,
        variantIdempotencyKey: `${effectiveIdempotencyKey}_${variantKey}`
      });

      transaction.set(resRef, {
        status: 'consumed',
        consumedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    return { success: true };
  });
}

/**
 * Processes a physical return of items back to physical inventory.
 * Increases physicalQuantity ONLY for sellable (resellable) non-customized items.
 * Keeps reservedQuantity unchanged, increases availableQuantity for sellable items.
 * Validates return quantity against purchased quantity minus prior returns.
 * Independent from financial refunds.
 */
export async function processPhysicalReturn(
  orderId: string, 
  items: any[], 
  idempotencyKey?: string, 
  options: { 
    reason?: string; 
    operator?: string;
    returnId?: string;
    notes?: string;
  } = {}
) {
  const db = getDb();
  const effectiveIdempotencyKey = idempotencyKey || `return_order_${orderId}_${options.returnId || 'default'}`;

  return db.runTransaction(async (transaction) => {
    // 1. READ PASS
    const duplicate = await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey);
    if (duplicate) {
      console.log(`📦 [STOCK] Physical return skipped for key ${effectiveIdempotencyKey} (idempotent duplicate)`);
      return { success: true, idempotent: true };
    }

    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await transaction.get(orderRef);
    const orderData = orderSnap.exists ? orderSnap.data()! : null;

    // Validate return quantity limits if order data exists
    if (orderData && Array.isArray(orderData.items)) {
      const existingReturns = Array.isArray(orderData.returns) ? orderData.returns : [];
      
      for (const item of items) {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const variantKey = item.variantKey || `${item.color}_${item.size}`;
        const itemId = item.id || item.orderItemId;

        const orderItem = orderData.items.find((i: any) => 
          (itemId && i.id === itemId) || 
          (i.variantKey === variantKey || `${i.color}_${i.size}` === variantKey)
        );

        const originalPurchasedQty = Number(orderItem?.quantity || qty);

        const previouslyReturnedQty = existingReturns
          .filter((r: any) => 
            (r.orderItemId && itemId && r.orderItemId === itemId) || 
            (r.variantId && r.variantId === variantKey)
          )
          .reduce((sum: number, r: any) => sum + (Number(r.quantity) || 0), 0);

        const maxReturnableQty = Math.max(0, originalPurchasedQty - previouslyReturnedQty);

        if (qty > maxReturnableQty) {
          throw new Error(
            `INVALID_RETURN_QUANTITY: Quantidade solicitada para devolução (${qty}) excede o limite disponível (${maxReturnableQty}). Total comprado: ${originalPurchasedQty}, já devolvido: ${previouslyReturnedQty}.`
          );
        }
      }
    }

    const itemReads: Array<{
      item: any;
      physicalSlug: string;
      variantKey: string;
      invRef: FirebaseFirestore.DocumentReference;
      invDoc: FirebaseFirestore.DocumentSnapshot;
    }> = [];

    for (const item of items) {
      const physicalSlug = item.parentSlug || item.slug || item.productId || item.id;
      if (!physicalSlug) continue;

      const variantKey = item.variantKey || `${item.color}_${item.size}`;
      const invRef = db.collection('inventory').doc(physicalSlug);
      const invDoc = await transaction.get(invRef);

      itemReads.push({ item, physicalSlug, variantKey, invRef, invDoc });
    }

    // 2. WRITE PASS
    recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, { orderId, type: 'return' });

    const returnLedgerEntries: any[] = [];

    for (const { item, physicalSlug, variantKey, invRef, invDoc } of itemReads) {
      recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, variantKey, { orderId, type: 'return' });

      const qty = Math.max(1, Number(item.quantity) || 1);
      const condition = item.condition || 'resellable';

      // Customization / Resellability Check
      const matchingOrderItem = orderData?.items?.find((i: any) => 
        (item.id && i.id === item.id) || (i.variantKey === variantKey || `${i.color}_${i.size}` === variantKey)
      );
      const isCustomized = Boolean(
        item.isCustomized || item.isPersonalized || item.customText ||
        matchingOrderItem?.isCustomized || matchingOrderItem?.isPersonalized || matchingOrderItem?.customText || matchingOrderItem?.stampName
      );

      const isResellable = item.resellable !== false && condition === 'resellable' && !isCustomized;

      let newPhysicalQuantity = 0;
      let newReservedQuantity = 0;
      let newAvailableQuantity = 0;
      let stats = { physicalQuantity: 0, reservedQuantity: 0, availableQuantity: 0, sku: `${physicalSlug}_${variantKey}` };

      if (invDoc.exists) {
        const data = invDoc.data() || {};
        const currentVariants = data.variants || {};
        const variantData = currentVariants[variantKey] || {};
        stats = getVariantStats(variantData, physicalSlug, variantKey);

        if (isResellable) {
          // Increment physical and available stock ONLY if sellable and not customized
          newPhysicalQuantity = stats.physicalQuantity + qty;
          newReservedQuantity = stats.reservedQuantity;
          newAvailableQuantity = Math.max(0, newPhysicalQuantity - newReservedQuantity);

          const updatedVariant = {
            ...variantData,
            physicalQuantity: newPhysicalQuantity,
            reservedQuantity: newReservedQuantity,
            availableQuantity: newAvailableQuantity,
            stock: newPhysicalQuantity,
            available: true,
            updatedAt: new Date().toISOString()
          };

          const updatedVariants = {
            ...currentVariants,
            [variantKey]: updatedVariant
          };

          const totalPhysical: number = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
            const q = Number(v.physicalQuantity !== undefined ? v.physicalQuantity : (v.stock ?? 0)) || 0;
            return sum + q;
          }, 0);

          const totalReserved: number = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
            const q = Number(v.reservedQuantity !== undefined ? v.reservedQuantity : (v.reserved ?? 0)) || 0;
            return sum + q;
          }, 0);

          const totalAvailable = Math.max(0, totalPhysical - totalReserved);

          transaction.update(invRef, {
            stock: totalPhysical,
            totalPhysicalStock: totalPhysical,
            totalReservedStock: totalReserved,
            totalAvailableStock: totalAvailable,
            variants: updatedVariants,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          // Unsellable / damaged / customized: stock remains unchanged
          newPhysicalQuantity = stats.physicalQuantity;
          newReservedQuantity = stats.reservedQuantity;
          newAvailableQuantity = stats.availableQuantity;
        }

        const movementRef = db.collection('stock_movements').doc();
        transaction.set(movementRef, {
          id: movementRef.id,
          orderId,
          orderItemId: item.id || null,
          variantId: item.variantId || `${physicalSlug}_${variantKey}`,
          productSlug: physicalSlug,
          variantKey,
          sku: stats.sku,
          type: isResellable ? 'return' : 'non_sellable_return',
          resellable: isResellable,
          condition,
          quantity: qty,
          previousPhysicalQuantity: stats.physicalQuantity,
          newPhysicalQuantity,
          previousReservedQuantity: stats.reservedQuantity,
          newReservedQuantity,
          previousAvailableQuantity: stats.availableQuantity,
          newAvailableQuantity,
          referenceType: 'order',
          referenceId: orderId,
          reason: options.reason || `Devolução física referente ao pedido #${orderId} (${isResellable ? 'Apto para revenda' : 'NÃO revendável/danificado/personalizado'})`,
          performedBy: options.operator || 'system',
          createdAt: new Date().toISOString(),
          idempotencyKey: effectiveIdempotencyKey,
          variantIdempotencyKey: `${effectiveIdempotencyKey}_${variantKey}`
        });
      }

      returnLedgerEntries.push({
        returnId: options.returnId || `ret_phys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        orderItemId: item.id || null,
        variantId: `${physicalSlug}_${variantKey}`,
        variantKey,
        quantity: qty,
        resellable: isResellable,
        condition,
        operator: options.operator || 'system',
        reason: options.reason || `Devolução física conferida (${isResellable ? 'Apto para revenda' : 'Impróprio para revenda/personalizado'})`,
        notes: item.notes || options.notes || null,
        createdAt: new Date().toISOString()
      });
    }

    if (orderSnap.exists && returnLedgerEntries.length > 0) {
      transaction.update(orderRef, {
        returns: admin.firestore.FieldValue.arrayUnion(...returnLedgerEntries),
        returnStatus: 'inspected',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return { success: true, processedItems: returnLedgerEntries };
  });
}

/**
 * Adjusts inventory stock (physical deduction or addition) atomically inside a Firestore transaction.
 * Respects availableQuantity for manual subtractions, and reservedQuantity limits for physical count changes.
 */
export async function adjustStock(
  items: any[], 
  mode: 'subtract' | 'add', 
  options: {
    referenceId?: string;
    reason?: string;
    operator?: string;
    idempotencyKey?: string;
    isReservationFulfillment?: boolean;
  } = {}
) {
  const db = getDb();
  const effectiveIdempotencyKey = options.idempotencyKey;

  console.log(`📦 [STOCK] ${mode === 'subtract' ? 'Decreasing' : 'Increasing'} physical stock for ${items.length} items`);

  await db.runTransaction(async (transaction) => {
    // 1. READ PASS
    if (effectiveIdempotencyKey) {
      const duplicate = await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey);
      if (duplicate) {
        console.log(`📦 [STOCK] adjustStock skipped for key ${effectiveIdempotencyKey} (idempotent duplicate)`);
        return;
      }
    }

    const itemReads: Array<{
      item: any;
      physicalSlug: string;
      variantKey: string;
      invRef: FirebaseFirestore.DocumentReference;
      invDoc: FirebaseFirestore.DocumentSnapshot;
    }> = [];

    for (const item of items) {
      const physicalSlug = item.parentSlug || item.slug || item.productId || item.id;
      if (!physicalSlug) continue;

      const variantKey = item.variantKey || `${item.color}_${item.size}`;
      const invRef = db.collection('inventory').doc(physicalSlug);
      const invDoc = await transaction.get(invRef);

      itemReads.push({ item, physicalSlug, variantKey, invRef, invDoc });
    }

    // 2. WRITE PASS
    if (effectiveIdempotencyKey) {
      recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, { type: 'adjust', mode });
    }

    for (const { item, physicalSlug, variantKey, invRef, invDoc } of itemReads) {
      if (effectiveIdempotencyKey) {
        recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, variantKey, { type: 'adjust', mode });
      }

      const quantity = Math.max(1, Number(item.quantity) || 1);

      if (invDoc.exists) {
        const data = invDoc.data() || {};
        const currentVariants = data.variants || {};
        const variantData = currentVariants[variantKey] || {};
        const stats = getVariantStats(variantData, physicalSlug, variantKey);

        let newPhysicalQuantity = stats.physicalQuantity;
        let newReservedQuantity = stats.reservedQuantity;

        if (mode === 'subtract') {
          if (options.isReservationFulfillment) {
            if (stats.physicalQuantity < quantity) {
              throw new OutOfStockError(
                `Estoque físico insuficiente para baixa de reserva "${item.name || physicalSlug}" (${stats.color} - ${stats.size}). Físico atual: ${stats.physicalQuantity}, Solicitado: ${quantity}`,
                { item: `${item.name || physicalSlug} (${stats.color} - ${stats.size})`, requested: quantity, available: stats.physicalQuantity }
              );
            }
            newPhysicalQuantity = stats.physicalQuantity - quantity;
            newReservedQuantity = Math.max(0, stats.reservedQuantity - quantity);
          } else {
            // Manual outbound check: MUST NOT consume reserved stock!
            if (stats.availableQuantity < quantity) {
              throw new OutOfStockError(
                `Estoque disponível insuficiente para saída manual de "${item.name || physicalSlug}" (${stats.color} - ${stats.size}). Disponível: ${stats.availableQuantity}, Solicitado: ${quantity}`,
                { item: `${item.name || physicalSlug} (${stats.color} - ${stats.size})`, requested: quantity, available: stats.availableQuantity }
              );
            }
            newPhysicalQuantity = stats.physicalQuantity - quantity;
          }
        } else {
          newPhysicalQuantity = stats.physicalQuantity + quantity;
        }

        if (newPhysicalQuantity < newReservedQuantity) {
          throw new OutOfStockError(
            `Ajuste de estoque físico inválido para "${item.name || physicalSlug}": O novo estoque físico (${newPhysicalQuantity}) não pode ser menor do que a quantidade reservada por pedidos ativos (${newReservedQuantity}).`,
            { item: `${item.name || physicalSlug} (${variantKey})`, requested: newPhysicalQuantity, available: newReservedQuantity }
          );
        }

        const newAvailableQuantity = Math.max(0, newPhysicalQuantity - newReservedQuantity);

        const updatedVariant = {
          ...variantData,
          id: `${physicalSlug}_${variantKey}`,
          productId: physicalSlug,
          productSlug: physicalSlug,
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

        const updatedVariants = {
          ...currentVariants,
          [variantKey]: updatedVariant
        };

        const totalPhysical: number = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
          const qty = Number(v.physicalQuantity !== undefined ? v.physicalQuantity : (v.stock ?? 0)) || 0;
          return sum + qty;
        }, 0);

        const totalReserved: number = Object.values(updatedVariants).reduce<number>((sum, v: any) => {
          const qty = Number(v.reservedQuantity !== undefined ? v.reservedQuantity : (v.reserved ?? 0)) || 0;
          return sum + qty;
        }, 0);

        const totalAvailable = Math.max(0, totalPhysical - totalReserved);

        transaction.update(invRef, {
          stock: totalPhysical,
          totalPhysicalStock: totalPhysical,
          totalReservedStock: totalReserved,
          totalAvailableStock: totalAvailable,
          variants: updatedVariants,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Record movement
        const movementRef = db.collection('stock_movements').doc();
        transaction.set(movementRef, {
          id: movementRef.id,
          productSlug: physicalSlug,
          variantKey,
          sku: stats.sku,
          type: mode === 'subtract' ? (options.isReservationFulfillment ? 'sale' : 'subtract') : 'add',
          quantity,
          previousPhysicalQuantity: stats.physicalQuantity,
          newPhysicalQuantity,
          previousReservedQuantity: stats.reservedQuantity,
          newReservedQuantity,
          previousAvailableQuantity: stats.availableQuantity,
          newAvailableQuantity,
          referenceType: options.referenceId ? 'order' : 'manual',
          referenceId: options.referenceId,
          reason: options.reason || (mode === 'subtract' ? 'Baixa de estoque' : 'Acréscimo de estoque'),
          performedBy: options.operator || 'system',
          createdAt: new Date().toISOString(),
          idempotencyKey: effectiveIdempotencyKey || undefined,
          variantIdempotencyKey: effectiveIdempotencyKey ? `${effectiveIdempotencyKey}_${variantKey}` : undefined
        });
      } else {
        if (mode === 'subtract') {
          throw new OutOfStockError(
            `Estoque não cadastrado para "${item.name || physicalSlug}" (${variantKey}).`,
            { item: `${item.name || physicalSlug} (${variantKey})`, requested: quantity, available: 0 }
          );
        }

        const stats = getVariantStats({}, physicalSlug, variantKey);
        const newPhysicalQuantity = quantity;
        const newReservedQuantity = 0;
        const newAvailableQuantity = quantity;

        const updatedVariant = {
          id: `${physicalSlug}_${variantKey}`,
          productId: physicalSlug,
          productSlug: physicalSlug,
          variantId: variantKey,
          sku: stats.sku,
          color: stats.color,
          size: stats.size,
          physicalQuantity: newPhysicalQuantity,
          reservedQuantity: newReservedQuantity,
          availableQuantity: newAvailableQuantity,
          stock: newPhysicalQuantity,
          available: true,
          active: true,
          minimumStock: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const updatedVariants = {
          [variantKey]: updatedVariant
        };

        transaction.set(invRef, {
          stock: quantity,
          totalPhysicalStock: quantity,
          totalReservedStock: 0,
          totalAvailableStock: quantity,
          available: true,
          variants: updatedVariants,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const movementRef = db.collection('stock_movements').doc();
        transaction.set(movementRef, {
          id: movementRef.id,
          productSlug: physicalSlug,
          variantKey,
          sku: stats.sku,
          type: 'add',
          quantity,
          previousPhysicalQuantity: 0,
          newPhysicalQuantity,
          previousReservedQuantity: 0,
          newReservedQuantity,
          previousAvailableQuantity: 0,
          newAvailableQuantity,
          referenceType: options.referenceId ? 'order' : 'manual',
          referenceId: options.referenceId,
          reason: options.reason || 'Entrada inicial de estoque',
          performedBy: options.operator || 'system',
          createdAt: new Date().toISOString(),
          idempotencyKey: effectiveIdempotencyKey || undefined,
          variantIdempotencyKey: effectiveIdempotencyKey ? `${effectiveIdempotencyKey}_${variantKey}` : undefined
        });
      }
    }
  });
}

export async function createOrder(orderId: string, orderData: any) {
  const db = getDb();
  await db.collection('orders').doc(orderId).set({
    ...orderData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

export async function updateOrderStatus(orderId: string, status: string, extra: any = {}) {
  const db = getDb();
  console.log(`📝 [ORDER] Updating ${orderId} to status: ${status}`);
  await db.collection('orders').doc(orderId).update({
    status,
    ...extra,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
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

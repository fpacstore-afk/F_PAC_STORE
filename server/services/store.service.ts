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
 * Checks stock availability for all items in an order.
 */
export async function checkStock(items: any[]): Promise<{ isAvailable: boolean; message?: string }> {
  const db = getDb();
  for (const item of items) {
    const targetSlug = item.parentSlug || item.slug || item.productId || item.id;
    if (!targetSlug) continue;

    const invRef = db.collection('inventory').doc(targetSlug);
    const invDoc = await invRef.get();

    const variantKey = `${item.color}_${item.size}`;
    const requestedQty = Math.max(1, Number(item.quantity) || 1);

    if (!invDoc.exists) {
      return { 
        isAvailable: false, 
        message: `O produto "${item.name}" não possui estoque cadastrado.` 
      };
    }

    const data = invDoc.data() || {};
    const currentVariants = data.variants || {};
    const variantData = currentVariants[variantKey] || { stock: 0, available: true };
    const currentStock = Number(variantData.stock) || 0;

    if (currentStock < requestedQty) {
      return { 
        isAvailable: false, 
        message: `O produto "${item.name}" (${item.color} - ${item.size}) possui estoque insuficiente (Disponível: ${currentStock}, Solicitado: ${requestedQty}).` 
      };
    }
  }
  return { isAvailable: true };
}

/**
 * Adjusts inventory stock atomically inside a Firestore transaction.
 * Deducts ONLY from the physical base item (1 physical item = 1 deduction).
 * Throws OutOfStockError if stock is insufficient during subtraction.
 */
export async function adjustStock(items: any[], mode: 'subtract' | 'add') {
  const db = getDb();
  console.log(`📦 [STOCK] ${mode === 'subtract' ? 'Decreasing' : 'Increasing'} stock for ${items.length} items`);

  await db.runTransaction(async (transaction) => {
    for (const item of items) {
      // 1. Identify single physical inventory slug
      const physicalSlug = item.parentSlug || item.slug || item.productId || item.id;
      if (!physicalSlug) continue;

      const invRef = db.collection('inventory').doc(physicalSlug);
      const invDoc = await transaction.get(invRef);

      const quantity = Math.max(1, Number(item.quantity) || 1);
      const variantKey = `${item.color}_${item.size}`;

      if (invDoc.exists) {
        const data = invDoc.data() || {};
        const currentVariants = data.variants || {};
        const variantData = currentVariants[variantKey] || { stock: 0, available: true };
        const oldStock = Number(variantData.stock) || 0;

        if (mode === 'subtract' && oldStock < quantity) {
          throw new OutOfStockError(
            `Estoque insuficiente para "${item.name}" (${item.color} - ${item.size}). Estoque atual: ${oldStock}, Solicitado: ${quantity}`,
            { item: `${item.name} (${item.color} - ${item.size})`, requested: quantity, available: oldStock }
          );
        }

        const newStock = mode === 'subtract' ? oldStock - quantity : oldStock + quantity;

        const updatedVariants = {
          ...currentVariants,
          [variantKey]: {
            ...variantData,
            stock: newStock,
            available: newStock > 0
          }
        };

        const totalStock = Object.values(updatedVariants).reduce((sum: number, v: any) => {
          if (v.available === false) return sum;
          return sum + (Number(v.stock) || 0);
        }, 0);

        transaction.update(invRef, {
          stock: totalStock,
          variants: updatedVariants,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        if (mode === 'subtract') {
          throw new OutOfStockError(
            `Estoque não cadastrado para "${item.name}" (${item.color} - ${item.size}).`,
            { item: `${item.name} (${item.color} - ${item.size})`, requested: quantity, available: 0 }
          );
        }

        const updatedVariants = {
          [variantKey]: {
            stock: quantity,
            available: true
          }
        };

        transaction.set(invRef, {
          stock: quantity,
          available: true,
          variants: updatedVariants,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
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

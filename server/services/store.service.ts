
import { getDb } from "../firebase.js";
import admin from "firebase-admin";

export async function adjustStock(items: any[], mode: 'subtract' | 'add') {
  const db = getDb();
  console.log(`📦 [STOCK] ${mode === 'subtract' ? 'Decreasing' : 'Increasing'} stock for ${items.length} items`);

  await db.runTransaction(async (transaction) => {
    for (const item of items) {
      // 1. Process Shirt Inventory
      const SHIRT_SLUGS = ['force', 'mark', 'prime'];
      const primarySlug = item.slug || item.productId || item.id;
      let slugsToAdjust: string[] = [];

      const isShirt = SHIRT_SLUGS.includes(primarySlug) || (item.parentSlug && SHIRT_SLUGS.includes(item.parentSlug));

      if (isShirt) {
        slugsToAdjust = [...SHIRT_SLUGS];
      } else {
        if (primarySlug) {
          slugsToAdjust.push(primarySlug);
        }
        if (item.parentSlug && item.parentSlug !== primarySlug) {
          slugsToAdjust.push(item.parentSlug);
        }
      }

      for (const slug of slugsToAdjust) {
        const invRef = db.collection('inventory').doc(slug);
        const invDoc = await transaction.get(invRef);

        const quantity = Number(item.quantity) || 1;
        const change = mode === 'subtract' ? -quantity : quantity;

        if (invDoc.exists) {
          const data = invDoc.data() || {};
          const currentVariants = data.variants || {};
          const variantKey = `${item.color}_${item.size}`;

          const variantData = currentVariants[variantKey] || { stock: 0, available: true };
          const oldStock = Number(variantData.stock) || 0;
          const newStock = Math.max(0, oldStock + change);

          const tempVariants = {
            ...currentVariants,
            [variantKey]: {
              ...variantData,
              stock: newStock,
              available: newStock > 0
            }
          };

          const totalStock = Object.values(tempVariants).reduce((sum: number, v: any) => {
            if (v.available === false) return sum;
            return sum + (Number(v.stock) || 0);
          }, 0);

          transaction.update(invRef, {
            stock: totalStock,
            variants: tempVariants,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          const variantKey = `${item.color}_${item.size}`;
          const initialStock = Math.max(0, change);
          const tempVariants = {
            [variantKey]: {
              stock: initialStock,
              available: initialStock > 0
            }
          };

          transaction.set(invRef, {
            stock: initialStock,
            available: true,
            variants: tempVariants,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
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

export async function checkStock(items: any[]): Promise<{ isAvailable: boolean; message?: string }> {
  const db = getDb();
  for (const item of items) {
    const primarySlug = item.slug || item.productId || item.id;
    const slugsToCheck: { slug: string; type: 'estampa' | 'linha_mae' }[] = [];
    if (primarySlug) {
      slugsToCheck.push({ slug: primarySlug, type: 'estampa' });
    }
    if (item.parentSlug && item.parentSlug !== primarySlug) {
      slugsToCheck.push({ slug: item.parentSlug, type: 'linha_mae' });
    }

    for (const check of slugsToCheck) {
      const invRef = db.collection('inventory').doc(check.slug);
      const invDoc = await invRef.get();
      if (!invDoc.exists) {
        return { 
          isAvailable: false, 
          message: `O produto "${item.name}" não possui estoque cadastrado.` 
        };
      }
      const data = invDoc.data() || {};
      const currentVariants = data.variants || {};
      const variantKey = `${item.color}_${item.size}`;
      const variantData = currentVariants[variantKey] || { stock: 0, available: true };
      const currentStock = Number(variantData.stock) || 0;
      const requestedQty = Number(item.quantity) || 1;

      if (currentStock < requestedQty) {
        if (check.type === 'linha_mae') {
          return {
            isAvailable: false,
            message: `O estoque físico de camisetas para o produto "${item.name}" (${item.color} - ${item.size}) é insuficiente. (Disponível: ${currentStock}).`
          };
        } else {
          return { 
            isAvailable: false, 
            message: `O produto "${item.name}" (${item.color} - ${item.size}) está indisponível ou possui estoque insuficiente (Estoque disponível: ${currentStock}).` 
          };
        }
      }
    }
  }
  return { isAvailable: true };
}

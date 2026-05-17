
import { getDb } from "../firebase";
import admin from "firebase-admin";

export async function adjustStock(items: any[], mode: 'subtract' | 'add') {
  const db = getDb();
  const batch = db.batch();
  
  console.log(`📦 [STOCK] ${mode === 'subtract' ? 'Decreasing' : 'Increasing'} stock for ${items.length} items`);
  
  for (const item of items) {
    // Unique ID for inventory: productId + size
    const invId = `${item.productId || item.id}_${item.size}`;
    const invRef = db.collection('inventory').doc(invId);
    
    batch.set(invRef, {
      stock: admin.firestore.FieldValue.increment(mode === 'subtract' ? -item.quantity : item.quantity),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      productId: item.productId || item.id,
      size: item.size
    }, { merge: true });
  }
  
  await batch.commit();
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

import { doc, getDoc, updateDoc, arrayUnion, Timestamp, collection, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { updateProductionStatus, registerPartialPayment } from '../orderService';

export { updateProductionStatus, registerPartialPayment };

export async function fetchOrdersList(): Promise<any[]> {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToOrders(callback: (orders: any[]) => void) {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const ordersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(ordersData);
  });
}

export async function updateOrderStatusInDb(orderId: string, newStatus: string, extraFields: Record<string, any> = {}) {
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    status: newStatus,
    updatedAt: Timestamp.now(),
    ...extraFields
  });
}

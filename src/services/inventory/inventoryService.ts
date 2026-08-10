import { doc, getDoc, updateDoc, setDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { InventoryItem, StockMovement } from '../../types/inventory';

export function subscribeToInventory(callback: (inventoryMap: Record<string, any>) => void) {
  const colRef = collection(db, 'inventory');
  return onSnapshot(colRef, (snapshot) => {
    const invMap: Record<string, any> = {};
    snapshot.docs.forEach((doc) => {
      invMap[doc.id] = doc.data();
    });
    callback(invMap);
  });
}

export async function updateVariantStockInDb(
  productSlug: string,
  variantKey: string,
  newStock: number,
  operator: string = 'Admin'
) {
  const invRef = doc(db, 'inventory', productSlug);
  const snap = await getDoc(invRef);
  const data = snap.exists() ? snap.data() : {};
  const variants = data.variants || {};

  variants[variantKey] = {
    ...variants[variantKey],
    stock: Math.max(0, newStock)
  };

  await setDoc(invRef, {
    ...data,
    variants,
    lastUpdated: new Date().toISOString()
  }, { merge: true });
}

import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

export interface InventoryState {
  [itemId: string]: {
    available: boolean;
    stock: number;
  };
}

export function useInventory() {
  const [inventory, setInventory] = useState<InventoryState>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      const newState: InventoryState = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        newState[doc.id] = {
          available: data.available ?? true,
          stock: data.stock ?? 0
        };
      });
      setInventory(newState);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching inventory:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updateStock = async (id: string, newStock: number) => {
    try {
      await setDoc(doc(db, 'inventory', id), {
        stock: Math.max(0, newStock),
        available: newStock > 0,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error("Error updating stock:", error);
    }
  };

  const toggleAvailability = async (id: string, currentStatus: boolean = true) => {
    try {
      await setDoc(doc(db, 'inventory', id), {
        available: !currentStatus,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error("Error toggling availability:", error);
    }
  };

  const isAvailable = (id: string) => {
    const item = inventory[id];
    if (!item) return true; // Default to available if not set
    return item.available && item.stock > 0;
  };

  const getStock = (id: string) => {
    return inventory[id]?.stock ?? 0;
  };

  return { inventory, loading, toggleAvailability, updateStock, isAvailable, getStock };
}

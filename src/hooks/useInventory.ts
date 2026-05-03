import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

export interface InventoryState {
  [itemId: string]: boolean;
}

export function useInventory() {
  const [inventory, setInventory] = useState<InventoryState>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      const newState: InventoryState = {};
      snapshot.forEach((doc) => {
        newState[doc.id] = doc.data().available;
      });
      setInventory(newState);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching inventory:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
    // If it's not in the database, we assume it's available by default
    return inventory[id] !== false;
  };

  return { inventory, loading, toggleAvailability, isAvailable };
}

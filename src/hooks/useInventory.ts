import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

export interface InventoryState {
  [itemId: string]: {
    available: boolean;
    stock: number;
    variants?: {
      [variantKey: string]: {
        available: boolean;
        stock: number;
      };
    };
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
          stock: data.stock ?? 0,
          variants: data.variants || {}
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
        // If manually updating global stock, only make it unavailable if explicitly hidden, 
        // but typically keep it available if stock > 0
        available: newStock > 0 ? true : (inventory[id]?.available ?? true),
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error("Error updating stock:", error);
    }
  };

  const updateVariantStock = async (id: string, variantKey: string, newStock: number) => {
    try {
      const item = inventory[id];
      const currentVariants = item?.variants || {};
      
      // Calculate new total stock
      const newVariants = {
        ...currentVariants,
        [variantKey]: {
          ...currentVariants[variantKey],
          stock: Math.max(0, newStock),
          available: newStock > 0
        }
      };

      const totalStock = Object.values(newVariants).reduce((sum: number, v: any) => sum + (v.stock || 0), 0);

      await setDoc(doc(db, 'inventory', id), {
        stock: totalStock,
        available: (totalStock as number) > 0 || (item?.available ?? true), // Keep available if it was manually enabled or if has stock
        variants: newVariants,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error("Error updating variant stock:", error);
    }
  };

  const toggleVariantAvailability = async (id: string, variantKey: string, currentStatus: boolean = true) => {
    try {
      await setDoc(doc(db, 'inventory', id), {
        variants: {
          [variantKey]: {
            available: !currentStatus
          }
        },
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error("Error toggling variant availability:", error);
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

  const isAvailable = (id: string, variantKey?: string) => {
    const item = inventory[id];
    if (!item) return true; 
    
    // If manually hidden by admin, it's NOT available regardless of stock
    if (item.available === false) return false;

    // If checking a specific variant, it must have stock and not be manually disabled
    if (variantKey && item.variants && item.variants[variantKey]) {
      const v = item.variants[variantKey];
      return v.available && v.stock > 0;
    }

    // Default: just return if it's not hidden. 
    // The Buy button handles the stock check per variant.
    return item.available;
  };

  const getStock = (id: string, variantKey?: string) => {
    const item = inventory[id];
    if (!item) return 0;

    if (variantKey && item.variants && item.variants[variantKey]) {
      return item.variants[variantKey].stock;
    }

    return item.stock;
  };

  return { 
    inventory, 
    loading, 
    toggleAvailability, 
    updateStock, 
    updateVariantStock,
    toggleVariantAvailability,
    isAvailable, 
    getStock 
  };
}

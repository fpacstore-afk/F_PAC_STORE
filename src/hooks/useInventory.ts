import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';

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
      
      // Calculate total stock and update it. 
      // Sum only variants that are available (or will be available if stock > 0)
      const tempVariants = { 
        ...currentVariants, 
        [variantKey]: { 
          ...currentVariants[variantKey], 
          stock: newStock,
          available: newStock > 0 
        } 
      };
      
      const totalStock = Object.values(tempVariants).reduce((sum: number, v: any) => {
        // If available is explicitly false, don't count
        if (v.available === false) return sum;
        return sum + (Number(v.stock) || 0);
      }, 0) as number;
      
      // Using setDoc with merge: true instead of updateDoc to handle non-existent documents
      await setDoc(doc(db, 'inventory', id), {
        stock: totalStock,
        available: (totalStock as number) > 0 || (item?.available ?? true),
        variants: tempVariants,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error("Error updating variant stock:", error);
    }
  };

  const toggleVariantAvailability = async (id: string, variantKey: string, currentStatus: boolean = true) => {
    try {
      const item = inventory[id];
      const currentVariants = item?.variants || {};
      const newStatus = !currentStatus;
      
      // Recalculate total stock considering the new availability status
      const tempVariants = { 
        ...currentVariants, 
        [variantKey]: { 
          ...currentVariants[variantKey], 
          available: newStatus 
        } 
      };
      
      const totalStock = Object.values(tempVariants).reduce((sum: number, v: any) => {
        if (v.available === false) return sum;
        return sum + (v.stock || 0);
      }, 0);

      await setDoc(doc(db, 'inventory', id), {
        stock: totalStock,
        variants: tempVariants,
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

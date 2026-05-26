import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { products as staticProducts } from '../data/products';

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
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const merged = staticProducts.map(staticP => {
        const dynamicP = dynamicData.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        return dynamicP ? { ...staticP, ...dynamicP } : staticP;
      });
      dynamicData.forEach((dynamicP: any) => {
        if (!staticProducts.some(sp => sp.id === dynamicP.id || sp.slug === dynamicP.slug)) {
          merged.push(dynamicP);
        }
      });
      setProducts(merged);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return () => unsubscribe();
  }, []);

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
      handleFirestoreError(error, OperationType.LIST, 'inventory');
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
      const docRef = doc(db, 'inventory', id);
      const docSnap = await getDoc(docRef);
      
      let currentVariants: any = {};
      let currentAvailable = true;
      if (docSnap.exists()) {
        const data = docSnap.data();
        currentVariants = data.variants || {};
        currentAvailable = data.available ?? true;
      }

      // Calculate total stock and update it. 
      const tempVariants = { 
        ...currentVariants, 
        [variantKey]: { 
          ...currentVariants[variantKey] as any, 
          stock: Math.max(0, newStock),
          available: Math.max(0, newStock) > 0 
        } 
      };
      
      const totalStock = Object.values(tempVariants).reduce((sum: number, v: any) => {
        // If available is explicitly false, don't count
        if (v.available === false) return sum;
        return sum + (Number(v.stock) || 0);
      }, 0) as number;
      
      await setDoc(docRef, {
        stock: totalStock,
        available: (totalStock as number) > 0 || currentAvailable,
        variants: tempVariants,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error("Error updating variant stock:", error);
    }
  };

  const updateMultipleVariantStocks = async (id: string, updates: { [variantKey: string]: number }) => {
    try {
      const docRef = doc(db, 'inventory', id);
      const docSnap = await getDoc(docRef);
      
      let currentVariants: any = {};
      let currentAvailable = true;
      if (docSnap.exists()) {
        const data = docSnap.data();
        currentVariants = data.variants || {};
        currentAvailable = data.available ?? true;
      }

      const tempVariants = { ...currentVariants } as any;
      Object.entries(updates).forEach(([vKey, newStock]) => {
        tempVariants[vKey] = {
          ...tempVariants[vKey],
          stock: Math.max(0, newStock),
          available: Math.max(0, newStock) > 0
        };
      });
      
      const totalStock = Object.values(tempVariants).reduce((sum: number, v: any) => {
        if (v.available === false) return sum;
        return sum + (Number(v.stock) || 0);
      }, 0) as number;
      
      await setDoc(docRef, {
        stock: totalStock,
        available: (totalStock as number) > 0 || currentAvailable,
        variants: tempVariants,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error("Error updating multiple variant stocks:", error);
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

  const toggleColorAvailability = async (id: string, colorName: string, currentStatus: boolean = true) => {
    try {
      const item = inventory[id];
      const currentVariants = { ...(item?.variants || {}) };
      const newStatus = !currentStatus;
      
      // Update all variants starting with colorName_
      Object.keys(currentVariants).forEach(vKey => {
        if (vKey.startsWith(`${colorName}_`)) {
          currentVariants[vKey] = {
            ...currentVariants[vKey],
            available: newStatus
          };
        }
      });
      
      const totalStock = Object.values(currentVariants).reduce((sum: number, v: any) => {
        if (v.available === false) return sum;
        return sum + (v.stock || 0);
      }, 0);

      await setDoc(doc(db, 'inventory', id), {
        stock: totalStock,
        variants: currentVariants,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error("Error toggling color availability:", error);
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

  const isAvailable = (id: string, variantKey?: string, parentSlug?: string, visited: Set<string> = new Set()): boolean => {
    if (visited.has(id)) {
      return false;
    }
    visited.add(id);

    // 1. If checking collection parent
    if (id === 'force' || id === 'mark') {
      const children = products.filter(p => p.parentSlug === id && p.slug !== id);
      if (children.length === 0) return false;
      
      const parentItem = inventory[id];
      if (parentItem && parentItem.available === false) {
        return false;
      }

      if (variantKey) {
        return children.some(child => isAvailable(child.slug, variantKey, undefined, new Set(visited)));
      }
      return children.some(child => isAvailable(child.slug, undefined, undefined, new Set(visited)));
    }

    // 2. Regular product / stamps
    const item = inventory[id];
    if (!item) return true; 
    
    // If manually hidden by admin, it's NOT available regardless of stock
    if (item.available === false) return false;

    let available = true;

    // If checking a specific variant, it must have stock and not be manually disabled
    if (variantKey && item.variants && item.variants[variantKey]) {
      const v = item.variants[variantKey];
      available = v.available && v.stock > 0;
    }

    // Cap child's general availability to parent's overall availability
    if (parentSlug) {
      const parentItem = inventory[parentSlug];
      if (parentItem && parentItem.available === false) {
        return false;
      }
    }

    return available;
  };

  const getStock = (id: string, variantKey?: string, parentSlug?: string, visited: Set<string> = new Set()): number => {
    if (visited.has(id)) {
      return 0;
    }
    visited.add(id);

    // 1. If checking collection parent
    if (id === 'force' || id === 'mark') {
      const children = products.filter(p => p.parentSlug === id && p.slug !== id);
      if (variantKey) {
        return children.reduce((acc, child) => acc + getStock(child.slug, variantKey, undefined, new Set(visited)), 0);
      }
      return children.reduce((acc, child) => acc + getStock(child.slug, undefined, undefined, new Set(visited)), 0);
    }

    // 2. Regular product / stamp
    const item = inventory[id];
    if (!item) return 0;

    let stock = item.stock;

    if (variantKey && item.variants && item.variants[variantKey]) {
      stock = item.variants[variantKey].stock;
    }

    return stock;
  };

  return { 
    inventory, 
    loading, 
    toggleAvailability, 
    updateStock, 
    updateVariantStock,
    updateMultipleVariantStocks,
    toggleVariantAvailability,
    toggleColorAvailability,
    isAvailable, 
    getStock 
  };
}

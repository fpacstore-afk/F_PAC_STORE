import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { products as staticProducts } from '../data/products';
import { updateVariantStockInDb } from '../services/inventory/inventoryService';

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

  const getBestInventoryItem = (id: string) => {
    const matchingProduct = products.find(p => p.slug === id || p.id === id);
    const candidates: any[] = [];
    if (inventory[id]) candidates.push(inventory[id]);
    if (matchingProduct?.id && inventory[matchingProduct.id]) candidates.push(inventory[matchingProduct.id]);
    if (matchingProduct?.slug && inventory[matchingProduct.slug]) candidates.push(inventory[matchingProduct.slug]);

    if (candidates.length === 0) return null;

    return candidates.reduce((best, curr) => {
      if (!best) return curr;
      const getSeconds = (item: any) => {
        if (!item.updatedAt) return 0;
        if (typeof item.updatedAt.seconds === 'number') return item.updatedAt.seconds;
        if (item.updatedAt instanceof Date) return Math.floor(item.updatedAt.getTime() / 1000);
        if (typeof item.updatedAt === 'string') return Math.floor(new Date(item.updatedAt).getTime() / 1000);
        return 0;
      };
      const bestTime = getSeconds(best);
      const currTime = getSeconds(curr);
      if (currTime > bestTime) return curr;
      if (currTime === bestTime) {
        const bestVarCount = Object.keys(best.variants || {}).length;
        const currVarCount = Object.keys(curr.variants || {}).length;
        if (currVarCount > bestVarCount) return curr;
      }
      return best;
    }, null);
  };

  const updateStock = async (id: string, newStock: number) => {
    try {
      await updateVariantStockInDb(id, 'default', newStock);
    } catch (error) {
      console.error("Error updating stock via API:", error);
    }
  };

  const updateVariantStock = async (id: string, variantKey: string, newStock: number) => {
    try {
      await updateVariantStockInDb(id, variantKey, newStock);
    } catch (error) {
      console.error("Error updating variant stock via API:", error);
    }
  };

  const updateMultipleVariantStocks = async (id: string, updates: { [variantKey: string]: number }) => {
    try {
      for (const [variantKey, newStock] of Object.entries(updates)) {
        await updateVariantStockInDb(id, variantKey, newStock);
      }
    } catch (error) {
      console.error("Error updating multiple variant stocks via API:", error);
    }
  };

  const toggleVariantAvailability = async (id: string, variantKey: string, currentStatus: boolean = true) => {
    try {
      const item = getBestInventoryItem(id);
      const currentStock = item?.variants?.[variantKey]?.stock ?? 0;
      // If toggling off, set stock to 0; if toggling on, set stock to 1 if 0
      const targetStock = currentStatus ? 0 : Math.max(1, currentStock);
      await updateVariantStockInDb(id, variantKey, targetStock);
    } catch (error) {
      console.error("Error toggling variant availability via API:", error);
    }
  };

  const toggleColorAvailability = async (id: string, colorName: string, currentStatus: boolean = true) => {
    try {
      const item = getBestInventoryItem(id);
      const variants = item?.variants || {};
      for (const [vKey, vData] of Object.entries(variants)) {
        if (vKey.startsWith(`${colorName}_`)) {
          const currentStock = (vData as any)?.stock ?? 0;
          const targetStock = currentStatus ? 0 : Math.max(1, currentStock);
          await updateVariantStockInDb(id, vKey, targetStock);
        }
      }
    } catch (error) {
      console.error("Error toggling color availability via API:", error);
    }
  };

  const toggleAvailability = async (id: string, currentStatus: boolean = true) => {
    try {
      const item = getBestInventoryItem(id);
      const variants = item?.variants || {};
      for (const [vKey, vData] of Object.entries(variants)) {
        const currentStock = (vData as any)?.stock ?? 0;
        const targetStock = currentStatus ? 0 : Math.max(1, currentStock);
        await updateVariantStockInDb(id, vKey, targetStock);
      }
    } catch (error) {
      console.error("Error toggling availability via API:", error);
    }
  };

  const isAvailable = (id: string, variantKey?: string, parentSlug?: string, visited: Set<string> = new Set()): boolean => {
    if (visited.has(id)) {
      return false;
    }
    visited.add(id);

    if (id === 'force' || id === 'mark' || id === 'prime') {
      const children = products.filter(p => p.parentSlug === id && p.slug !== id);
      if (children.length === 0) return false;
      
      const parentItem = getBestInventoryItem(id);
      if (parentItem && parentItem.available === false) {
        return false;
      }

      if (variantKey) {
        return children.some(child => isAvailable(child.slug, variantKey, undefined, new Set(visited)));
      }
      return children.some(child => isAvailable(child.slug, undefined, undefined, new Set(visited)));
    }

    const item = getBestInventoryItem(id);
    if (!item) {
      const matchingProduct = products.find(p => p.slug === id || p.id === id);
      if (!matchingProduct) return false;
      if (variantKey) {
        return (Number(matchingProduct.variantsStock?.[variantKey]) || 0) > 0;
      }
      return (Number(matchingProduct.stock) || 0) > 0;
    }
    
    if (item.available === false) return false;

    let available = true;

    if (variantKey) {
      if (item.variants && item.variants[variantKey]) {
        const v = item.variants[variantKey];
        available = v.available !== false && (Number(v.stock) || 0) > 0;
      } else {
        available = false;
      }
    } else {
      if (item.variants && Object.keys(item.variants).length > 0) {
        available = Object.values(item.variants).some((v: any) => v.available !== false && (Number(v.stock) || 0) > 0);
      } else {
        available = (Number(item.stock) || 0) > 0;
      }
    }

    if (parentSlug) {
      const parentItem = getBestInventoryItem(parentSlug);
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

    if (id === 'force' || id === 'mark' || id === 'prime') {
      const children = products.filter(p => p.parentSlug === id && p.slug !== id);
      if (variantKey) {
        return children.reduce((acc, child) => acc + getStock(child.slug, variantKey, undefined, new Set(visited)), 0);
      }
      return children.reduce((acc, child) => acc + getStock(child.slug, undefined, undefined, new Set(visited)), 0);
    }

    const item = getBestInventoryItem(id);
    const matchingProduct = products.find(p => p.slug === id || p.id === id);

    if (!item) {
      if (!matchingProduct) return 0;
      if (variantKey) {
        return Number(matchingProduct.variantsStock?.[variantKey]) || 0;
      }
      if (matchingProduct.variantsStock && Object.keys(matchingProduct.variantsStock).length > 0) {
        return Object.values(matchingProduct.variantsStock).reduce<number>((sum, v: any) => sum + (Number(v) || 0), 0);
      }
      return Number(matchingProduct.stock) || 0;
    }

    let stock = 0;

    if (variantKey) {
      if (item.variants && item.variants[variantKey] !== undefined) {
        stock = Number((item.variants as any)[variantKey].stock) || 0;
      } else if (matchingProduct?.variantsStock?.[variantKey] !== undefined) {
        stock = Number(matchingProduct.variantsStock[variantKey]) || 0;
      } else {
        stock = 0;
      }
    } else {
      if (item.variants && Object.keys(item.variants).length > 0) {
        stock = Object.values(item.variants as Record<string, any>).reduce<number>((sum, v: any) => {
          const val = Number(v?.stock);
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
      } else if (matchingProduct?.variantsStock && Object.keys(matchingProduct.variantsStock).length > 0) {
        stock = Object.values(matchingProduct.variantsStock).reduce<number>((sum, v: any) => sum + (Number(v) || 0), 0);
      } else {
        stock = Number(item.stock !== undefined ? item.stock : matchingProduct?.stock) || 0;
      }
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

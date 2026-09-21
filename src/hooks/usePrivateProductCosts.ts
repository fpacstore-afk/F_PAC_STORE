import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface PrivateProductCostRecord {
  productId: string;
  slug?: string;
  costPrice?: number | null;
  cost?: number | null;
  costCalculation?: Record<string, any> | null;
  updatedAt?: any;
}

export type PrivateProductCostsMap = Record<string, PrivateProductCostRecord>;

export function mergeProductsWithPrivateCosts<T extends Record<string, any>>(
  products: T[],
  costsByProductId: PrivateProductCostsMap
): T[] {
  return (products || []).map((product) => {
    const privateCost = costsByProductId[product.id];
    if (!privateCost) return product;
    return {
      ...product,
      costPrice: privateCost.costPrice ?? undefined,
      cost: privateCost.cost ?? privateCost.costPrice ?? undefined,
      costCalculation: privateCost.costCalculation ?? undefined
    };
  });
}

/** Admin-only subscription. Public storefronts never import this hook. */
export function usePrivateProductCosts() {
  const [costsByProductId, setCostsByProductId] = useState<PrivateProductCostsMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'product_costs'),
      (snapshot) => {
        const next: PrivateProductCostsMap = {};
        snapshot.docs.forEach((costDoc) => {
          next[costDoc.id] = {
            productId: costDoc.id,
            ...costDoc.data()
          } as PrivateProductCostRecord;
        });
        setCostsByProductId(next);
        setLoading(false);
      },
      () => {
        setCostsByProductId({});
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return useMemo(() => ({ costsByProductId, loading }), [costsByProductId, loading]);
}

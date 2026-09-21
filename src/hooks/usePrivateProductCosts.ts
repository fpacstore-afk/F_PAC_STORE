import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listPrivateProductCosts,
  PrivateProductCostRecord
} from '../services/productCostService';

export type { PrivateProductCostRecord } from '../services/productCostService';

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

/** Admin-only API reader. Cost documents are never exposed through Firestore rules. */
export function usePrivateProductCosts() {
  const [costsByProductId, setCostsByProductId] = useState<PrivateProductCostsMap>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const costs = await listPrivateProductCosts();
      const next: PrivateProductCostsMap = {};
      costs.forEach((cost) => {
        if (cost.productId) next[cost.productId] = cost;
      });
      setCostsByProductId(next);
    } catch {
      setCostsByProductId({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener('fpac:product-costs-changed', refresh);
    return () => window.removeEventListener('fpac:product-costs-changed', refresh);
  }, [refresh]);

  return useMemo(() => ({ costsByProductId, loading, refresh }), [costsByProductId, loading, refresh]);
}

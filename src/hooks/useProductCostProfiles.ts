import { garmentProfiles, requiresGarmentClassification } from '../../shared/garmentModels';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useOrderCostCatalog } from './useOrderCostCatalog';
import { catalogProductCost } from '../../shared/catalogProductCost';
import {
  AUDITED_FALLBACK_COST_PROFILES,
  ProductCostProfile,
  ProductCostSelector,
  resolveProductCostProfile
} from '../../shared/productCostProfiles';

export function useProductCostProfiles() {
  const costCatalog = useOrderCostCatalog();
  const [remoteProfiles, setRemoteProfiles] = useState<ProductCostProfile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'product_costs'),
      (snapshot) => {
        const data = snapshot.data();
        const profiles = Array.isArray(data?.profiles) ? data.profiles as ProductCostProfile[] : [];
        setRemoteProfiles(snapshot.exists() ? profiles : null);
        setSyncError(false);
        setLoading(false);
      },
      () => {
        setSyncError(true);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const profiles = useMemo(
    () => remoteProfiles ?? AUDITED_FALLBACK_COST_PROFILES,
    [remoteProfiles]
  );

  const resolveForProduct = useCallback((selector: ProductCostSelector & Record<string, any>) => requiresGarmentClassification(selector) ? null : selector.garmentModelId ? catalogProductCost(costCatalog.catalog, selector) : remoteProfiles
    ? resolveProductCostProfile(profiles, selector) || catalogProductCost(costCatalog.catalog, selector)
    : catalogProductCost(costCatalog.catalog, selector) || resolveProductCostProfile(profiles, selector), [costCatalog.catalog, profiles, remoteProfiles]);

  return {
    profiles,
    garmentModels: garmentProfiles(costCatalog.catalog),
    loading: loading || costCatalog.loading,
    syncError: syncError || Boolean(costCatalog.error),
    isUsingFallback: remoteProfiles === null,
    resolveForProduct
  };
}

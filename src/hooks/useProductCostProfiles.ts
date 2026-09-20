import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  AUDITED_FALLBACK_COST_PROFILES,
  ProductCostProfile,
  ProductCostSelector,
  resolveProductCostProfile
} from '../../shared/productCostProfiles';

export function useProductCostProfiles() {
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

  return {
    profiles,
    loading,
    syncError,
    isUsingFallback: remoteProfiles === null,
    resolveForProduct: (selector: ProductCostSelector) => resolveProductCostProfile(profiles, selector)
  };
}

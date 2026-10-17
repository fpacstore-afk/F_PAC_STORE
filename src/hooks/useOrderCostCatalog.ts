import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch, parseApiJson } from '../lib/api';
import { emptyCatalog, type Catalog } from '../../shared/pricingWorkbench';

export function useOrderCostCatalog(enabled = true) {
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await authenticatedFetch('/api/admin/pricing-workbench/catalog');
      if (!response.ok) throw new Error('Não foi possível carregar os custos. Tente novamente.');
      const data = await parseApiJson<{ catalog: Catalog; version: number }>(response);
      setCatalog(data.catalog); setVersion(data.version);
    } catch (error) { setError(error instanceof Error ? error.message : 'Falha ao consultar custos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]);
  return { catalog, version, loading, error, refresh };
}

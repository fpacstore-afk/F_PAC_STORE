import { useEffect, useState } from 'react';
import { getPublicApiUrl } from '../lib/api';

export type SiteFeatures = { clubEnabled: boolean; signupBonusEnabled: boolean };
const fallback: SiteFeatures = { clubEnabled: false, signupBonusEnabled: false };
let cached: SiteFeatures | null = null;
let cachedAt = 0;
let pending: Promise<SiteFeatures> | null = null;

export function invalidateSiteFeatures() { cached = null; pending = null; window.dispatchEvent(new Event('fpac:site-features-changed')); }
export function useSiteFeatures() {
  const [features, setFeatures] = useState<SiteFeatures>(cached || fallback);
  const [loading, setLoading] = useState(!cached);
  useEffect(() => {
    let mounted = true;
    const load = () => {
      if (cached && Date.now() - cachedAt < 30_000) { setFeatures(cached); setLoading(false); return; }
      setLoading(true);
      if (!pending) pending = fetch(getPublicApiUrl('/api/site-features'))
        .then(async response => { if (!response.ok) throw new Error('Configuração indisponível'); return response.json(); })
        .then(value => { cachedAt = Date.now(); return cached = { clubEnabled: value.clubEnabled === true, signupBonusEnabled: value.signupBonusEnabled === true }; })
        .finally(() => { pending = null; });
      pending.then(value => { if (mounted) { setFeatures(value); setLoading(false); } }).catch(() => { if (mounted) { setFeatures(fallback); setLoading(false); } });
    };
    load(); window.addEventListener('fpac:site-features-changed', load);
    return () => { mounted = false; window.removeEventListener('fpac:site-features-changed', load); };
  }, []);
  return { ...features, loading };
}

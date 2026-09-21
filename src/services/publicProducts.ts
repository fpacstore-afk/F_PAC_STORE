import { getPublicApiUrl } from '../lib/api';

let pendingRequest: Promise<any[]> | null = null;

export function fetchPublicProducts(): Promise<any[]> {
  if (!pendingRequest) {
    pendingRequest = fetch(getPublicApiUrl('/api/products'), { headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error(`Catálogo público indisponível (${response.status})`);
        const payload = await response.json();
        return Array.isArray(payload?.products) ? payload.products : [];
      })
      .catch(() => [])
      .finally(() => {
        window.setTimeout(() => { pendingRequest = null; }, 30_000);
      });
  }
  return pendingRequest;
}

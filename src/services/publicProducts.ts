import { getPublicApiUrl } from '../lib/api';

type Catalog = { products: any[]; availability: Record<string, any> };
type Subscriber = { next: (catalog: Catalog) => void; error?: (error: Error) => void };
const subscribers = new Set<Subscriber>();
let pendingRequest: Promise<Catalog> | null = null;
let cached: Catalog | null = null;
let expires = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function fetchPublicCatalog(): Promise<Catalog> {
  if (cached && Date.now() < expires) return Promise.resolve(cached);
  if (!pendingRequest) {
    pendingRequest = fetch(getPublicApiUrl('/api/products'), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
      .then(async response => {
        if (!response.ok) throw new Error('Não foi possível atualizar o catálogo. Tente novamente em instantes.');
        const payload = await response.json();
        if (!Array.isArray(payload?.products) || !payload.availability || typeof payload.availability !== 'object') throw new Error('Resposta de catálogo incompleta.');
        cached = { products: payload.products, availability: payload.availability };
        expires = Date.now() + 30_000;
        return cached;
      }).finally(() => { pendingRequest = null; });
  }
  return pendingRequest;
}

export const fetchPublicProducts = () => fetchPublicCatalog().then(data => data.products).catch(() => []);

async function refresh() {
  if (document.visibilityState === 'hidden') return;
  try { const catalog = await fetchPublicCatalog(); subscribers.forEach(s => s.next(catalog)); }
  catch (error) { subscribers.forEach(s => s.error?.(error instanceof Error ? error : new Error('Catálogo indisponível.'))); }
}

export function subscribePublicCatalog(next: Subscriber['next'], error?: Subscriber['error']) {
  const subscription = { next, error };
  subscribers.add(subscription);
  let active = true;
  void fetchPublicCatalog().then(data => { if (active) next(data); }).catch(err => { if (active) error?.(err); });
  if (!timer) {
    timer = setInterval(() => void refresh(), 35_000);
    document.addEventListener('visibilitychange', refresh);
  }
  return () => {
    active = false; subscribers.delete(subscription);
    if (subscribers.size === 0 && timer) {
      clearInterval(timer); timer = null;
      document.removeEventListener('visibilitychange', refresh);
    }
  };
}

/** Snapshot-shaped adapter for existing storefront renderers; no database subscription. */
export function subscribePublicProductSnapshot(next: (snapshot: { docs: Array<{ id: string; data: () => any }>; empty: boolean }) => void, error?: Subscriber['error'], filter: (product: any) => boolean = () => true) {
  return subscribePublicCatalog(catalog => {
    const products = catalog.products.filter(filter);
    next({ docs: products.map(product => ({ id: product.id, data: () => product })), empty: products.length === 0 });
  }, error);
}

import { getPublicApiUrl } from '../lib/api';
import { createCachedRequest } from '../../shared/cachedRequest';

type StampCatalog = { stamps: any[] };

export const fetchPublicStamps = createCachedRequest<StampCatalog>(async () => {
  const response = await fetch(getPublicApiUrl('/api/stamps'), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Não foi possível atualizar o catálogo de estampas.');
  const payload = await response.json();
  if (!Array.isArray(payload?.stamps)) throw new Error('Resposta do catálogo de estampas incompleta.');
  return { stamps: payload.stamps };
});

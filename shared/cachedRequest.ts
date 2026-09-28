/** Share in-flight reads and pause retries after an outage. Never serve expired data. */
export function createCachedRequest<T>(
  load: () => Promise<T>,
  { ttlMs = 120_000, retryMs = 30_000, now = () => Date.now() } = {},
): () => Promise<T> {
  let pending: Promise<T> | null = null;
  let cached: T;
  let expires = 0;
  let hasCached = false;
  let lastError: unknown;
  let retryAt = 0;

  return () => {
    if (pending) return pending;
    if (hasCached && now() < expires) return Promise.resolve(cached);
    if (now() < retryAt) return Promise.reject(lastError);
    pending = Promise.resolve().then(load).then(value => {
      cached = value;
      hasCached = true;
      expires = now() + ttlMs;
      retryAt = 0;
      return value;
    }, error => {
      lastError = error;
      retryAt = now() + retryMs;
      throw error;
    }).finally(() => { pending = null; });
    return pending;
  };
}

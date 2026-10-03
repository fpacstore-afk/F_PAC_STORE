export function isFirestoreQuotaExhausted(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { code?: unknown; message?: unknown };
  return failure.code === 8
    || failure.code === 'RESOURCE_EXHAUSTED'
    || /RESOURCE_EXHAUSTED|Quota limit exceeded|Free daily read units/i.test(String(failure.message || ''));
}

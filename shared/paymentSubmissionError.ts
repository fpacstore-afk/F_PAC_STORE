/** Only an explicit provider 4xx refusal can close an already-submitted attempt.
 * Timeouts, conflicts, rate limits and transport failures remain uncertain. */
export function isDefinitivePaymentRefusal(error: any) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  if (![400, 401, 403, 404, 422].includes(status)) return false;
  const details = `${error?.message || ''} ${JSON.stringify(error?.cause || error?.response?.data || '')}`.toLowerCase();
  return !/idempoten|duplicate|already|in.process|timeout|timed.out|temporar|internal|unavailable/.test(details);
}

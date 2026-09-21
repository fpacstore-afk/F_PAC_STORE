/** Financial state only: delivered/production-completed never imply paid. */
export function paymentOutcome(value: unknown): 'approved' | 'pending' | 'failed' | 'refunded' {
  const status = String(value || '').trim().toLowerCase();
  if (['approved', 'payment_approved', 'pagamento aprovado'].includes(status)) return 'approved';
  if (['rejected', 'cancelled', 'canceled', 'expired'].includes(status)) return 'failed';
  if (['refunded', 'partially_refunded', 'charged_back'].includes(status)) return 'refunded';
  return 'pending';
}

/** Strip query/hash secrets and redact private route identifiers before telemetry. */
export function publicAnalyticsPath(raw: string): string | null {
  try {
    const path = new URL(raw, 'https://fpacstore.com.br').pathname;
    if (/^\/(api|gestao|admin|account|order|order-status|tracking|checkout|success|privacy)(\/|$)/i.test(path)) return null;
    return path.slice(0, 240);
  } catch { return null; }
}

/** Customer details are never part of the persistent, cross-tab cart. */
export function persistentCart(data: Record<string, any>) {
  return { items: Array.isArray(data.items) ? data.items : [], coupon: typeof data.coupon === 'string' ? data.coupon : null, paymentMethod: ['PIX', 'CREDIT_CARD', 'DEBIT_CARD'].includes(data.paymentMethod) ? data.paymentMethod : 'CREDIT_CARD' };
}

export const CHECKOUT_SESSION_TTL = 4 * 60 * 60 * 1000;
export function validCheckoutSession(value: any, now = Date.now()) {
  return Boolean(value && typeof value.expiresAt === 'number' && value.expiresAt > now && value.expiresAt <= now + CHECKOUT_SESSION_TTL && value.customerInfo && typeof value.customerInfo === 'object');
}

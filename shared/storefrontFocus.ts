/** Keep payment, order tracking and administration clear of floating promotions. */
export function isFocusedStoreRoute(pathname: string) {
  return /^\/(?:checkout|bag|success|gestao|admin|order|order-status|tracking)(?:\/|$)/.test(pathname);
}

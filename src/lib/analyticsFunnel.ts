export interface FunnelEvent {
  type: string;
}

export interface FunnelSession {
  viewedProducts?: string[];
  cartStarted?: boolean;
  cartProducts?: string[];
  checkoutStarted?: boolean;
  purchaseCompleted?: boolean;
  events?: FunnelEvent[];
}

export interface FunnelStep {
  name: string;
  count: number;
  rate: number;
  color: string;
}

/** Counts distinct sessions at each storefront step; selected option values are never needed. */
export function buildConversionFunnel(sessions: readonly FunnelSession[]): FunnelStep[] {
  const total = sessions.length;
  const countWhere = (predicate: (session: FunnelSession) => boolean) => sessions.filter(predicate).length;
  const rate = (count: number) => total > 0 ? Math.round((count / total) * 100) : 0;
  const selected = (session: FunnelSession, type: string) => session.events?.some(event => event.type === type) === true;

  const steps = [
    { name: '1. Acessou o site', count: total, color: '#ffffff' },
    { name: '2. Viu um produto', count: countWhere(session => (session.viewedProducts?.length || 0) > 0), color: '#d1d5db' },
    { name: '3. Escolheu uma cor', count: countWhere(session => selected(session, 'product_color_select')), color: '#a1a1aa' },
    { name: '4. Escolheu um tamanho', count: countWhere(session => selected(session, 'product_size_select')), color: '#a1a1aa' },
    { name: '5. Adicionou à sacola', count: countWhere(session => session.cartStarted === true || (session.cartProducts?.length || 0) > 0), color: '#a1a1aa' },
    { name: '6. Iniciou o checkout', count: countWhere(session => session.checkoutStarted === true), color: '#f7c600' },
    { name: '7. Compra aprovada', count: countWhere(session => session.purchaseCompleted === true), color: '#10b981' },
  ];

  return steps.map(step => ({ ...step, rate: rate(step.count) }));
}

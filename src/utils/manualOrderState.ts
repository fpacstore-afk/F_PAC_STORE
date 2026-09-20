export type ManualOrderOperationalStage = 'received' | 'production' | 'shipped' | 'delivered' | 'cancelled';

export interface ManualOrderOperationalState {
  status: 'received' | 'cancelled';
  productionStatus: 'waiting' | 'separacao_corte' | 'completed';
  shippingStatus: 'pending' | 'shipped' | 'delivered';
}

export function deriveManualOrderOperationalState(stage: ManualOrderOperationalStage): ManualOrderOperationalState {
  switch (stage) {
    case 'production':
      return { status: 'received', productionStatus: 'separacao_corte', shippingStatus: 'pending' };
    case 'shipped':
      return { status: 'received', productionStatus: 'completed', shippingStatus: 'shipped' };
    case 'delivered':
      return { status: 'received', productionStatus: 'completed', shippingStatus: 'delivered' };
    case 'cancelled':
      return { status: 'cancelled', productionStatus: 'waiting', shippingStatus: 'pending' };
    default:
      return { status: 'received', productionStatus: 'waiting', shippingStatus: 'pending' };
  }
}

export function getManualOrderInitialPayment(
  total: number,
  stage: ManualOrderOperationalStage,
  paidInFull: boolean,
  paidAmount: number
): number {
  if (stage === 'cancelled') return 0;
  const safeTotal = Math.max(0, Number(total) || 0);
  if (paidInFull) return safeTotal;
  return Math.min(safeTotal, Math.max(0, Number(paidAmount) || 0));
}

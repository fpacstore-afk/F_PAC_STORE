import { getRecordedOrderDueDate, financialDateKey } from '../../shared/cashFlow';
import { getOrderPendingAmount, getOrderPaymentStatus } from '../../shared/orderFinancialCore';
import { roundMoney } from '../config/financialDefaults';
export { getOrderItemCost, getOrderCogs } from '../../shared/orderCostCoverage';
export { normalizePaymentStatus, getOrderTotal, getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderNetReceived, getOrderPaymentStatus, getOrderShippingFinances, getOrderGatewayFee } from '../../shared/orderFinancialCore';
export { calculateOrderFinancials, calculateFinancialDRE, type FinancialDREResult } from '../../shared/orderResult';
/** Earliest recorded open due date; missing dates stay unknown. */
export function getOrderPaymentDueDate(order: any): Date | null {
  return getRecordedOrderDueDate(order);
}

/**
 * Deriva se o pagamento do pedido está atrasado (Inadimplência).
 * Regra canônica: pendingAmount > 0 AND dueDate < now AND status não cancelado/rejeitado.
 */
export function isOrderPaymentOverdue(order: any): boolean {
  const pending = getOrderPendingAmount(order);
  if (pending <= 0) return false;

  const status = getOrderPaymentStatus(order);
  if (['cancelled', 'rejected', 'refunded'].includes(status)) return false;

  const dueDate = getOrderPaymentDueDate(order);
  if (!dueDate) return false;

  return financialDateKey(dueDate)! < financialDateKey(new Date())!;
}

/**
 * Retorna o tipo de badge de vencimento/status financeiro.
 */
export function getPaymentBadgeType(order: any): 'overdue' | 'due_today' | 'upcoming' | 'partial' | 'paid' | 'refunded' | 'pending' {
  const status = getOrderPaymentStatus(order);
  if (status === 'refunded' || status === 'partially_refunded') return 'refunded';
  if (status === 'approved') return 'paid';
  if (['cancelled', 'rejected'].includes(status)) return 'pending';

  const pending = getOrderPendingAmount(order);
  if (pending <= 0) return 'paid';

  if (isOrderPaymentOverdue(order)) return 'overdue';

  const dueDate = getOrderPaymentDueDate(order);
  if (dueDate) {
    const today = new Date();
    const isSameDay = dueDate.getDate() === today.getDate() &&
                      dueDate.getMonth() === today.getMonth() &&
                      dueDate.getFullYear() === today.getFullYear();
    if (isSameDay) return 'due_today';
  }

  if (status === 'partially_paid') return 'partial';
  if (dueDate && dueDate.getTime() > Date.now()) return 'upcoming';

  return 'pending';
}



/**
 * Calcula o Resultado / Lucro Operacional canônico a partir da margem de contribuição e despesas operacionais.
 * Suporta assinatura por objeto de parâmetros ou parâmetros posicionais.
 * Fórmula: Lucro Operacional = CM - Despesas Variáveis Administrativas - Despesas Fixas - Marketing (Tráfego) - Outras Despesas
 */
export function calculateOperatingResult(params: {
  contributionMargin: number;
  administrativeVariableExpenses?: number;
  fixedExpenses?: number;
  marketingExpenses?: number;
  otherExpenses?: number;
}): number;
export function calculateOperatingResult(
  contributionMargin: number,
  fixedExpenses: number,
  marketingExpenses?: number,
  otherExpenses?: number,
  variableExpenses?: number
): number;
export function calculateOperatingResult(
  arg1: number | {
    contributionMargin: number;
    administrativeVariableExpenses?: number;
    fixedExpenses?: number;
    marketingExpenses?: number;
    otherExpenses?: number;
  },
  arg2?: number,
  arg3: number = 0,
  arg4: number = 0,
  arg5: number = 0
): number {
  if (typeof arg1 === 'object' && arg1 !== null) {
    const cm = roundMoney(arg1.contributionMargin || 0);
    const adminVar = roundMoney(arg1.administrativeVariableExpenses || 0);
    const fixed = roundMoney(arg1.fixedExpenses || 0);
    const marketing = roundMoney(arg1.marketingExpenses || 0);
    const other = roundMoney(arg1.otherExpenses || 0);
    return roundMoney(cm - adminVar - fixed - marketing - other);
  }
  return roundMoney(
    Number(arg1 || 0) -
    Number(arg2 || 0) -
    Number(arg3 || 0) -
    Number(arg4 || 0) -
    Number(arg5 || 0)
  );
}

// Re-exportação canônica do motor de rentabilidade para unificação de API
export {
  calculateProductProfitability,
  calculateOrderProfitability,
  calculateProfitabilityOverviewStats,
  calculateRevenueComposition,
  aggregateProfitabilityByLine,
  simulateProductPrice,
  calculateMinimumPrice,
  calculatePriceForDesiredMargin,
  calculateBreakEven,
  calculateTargetProfitRequirements,
  MARGIN_THRESHOLDS,
  BREAKEVEN_THRESHOLDS,
  classifyMargin,
  classifyBreakEvenStatus,
  type MarginClassification,
  type MarginClassificationResult,
  type BreakEvenStatus,
  type BreakEvenStatusResult,
  type OrderProfitability,
  type ProductProfitabilityItem,
  type RevenueComposition,
  type ProfitabilityOverviewStats,
  type LineProfitabilityItem,
  type PriceSimulationParams,
  type PriceSimulationResult,
  type MinimumPriceParams,
  type DesiredMarginParams,
  type BreakEvenParams,
  type BreakEvenResult,
  type TargetProfitParams,
  type TargetProfitResult
} from './profitability';

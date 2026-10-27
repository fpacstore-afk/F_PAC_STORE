import { financialDateKey } from './cashFlow';
import { getOrderPaidAmount, getOrderPaymentStatus, getOrderRefundedAmount, getOrderTotal } from './orderFinancialCore';

/** A working-paper preview, NOT an official tax return or electronic invoice. */
export type MeiRowStatus = 'candidate' | 'review' | 'before_registration';
export interface MeiRevenueRow {
  id: string;
  date: string;
  amount: number;
  received: number;
  refunded: number;
  status: MeiRowStatus;
  reason: string;
  channel: string;
}
export interface MeiMonthlyPreview {
  month: string;
  candidates: MeiRevenueRow[];
  review: MeiRevenueRow[];
  beforeRegistration: MeiRevenueRow[];
  candidateGross: number;
  reviewGross: number;
  preRegistrationGross: number;
  missingDateCount: number;
}
const cents = (number: number) => Math.round(number * 100);
const money = (number: number) => Number((number / 100).toFixed(2));
const numberValue = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : NaN;
};
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();

/**
 * Uses order creation date as a provisional sale date (never a payment date).
 * Requires review for refunds, partial payments, cancelled orders and unclear records.
 * Marketplaces not present in the site's orders are not included.
 */
export function buildMeiMonthlyPreview(orders: any[], month: string, registrationDate = ''): MeiMonthlyPreview {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido');
  const all: MeiRevenueRow[] = [];
  let missingDateCount = 0;
  const seen = new Set<string>();
  for (const order of orders) {
    const id = String(order?.id || '').trim();
    if (!id || seen.has(id) || /^test_/i.test(id) || order?.isTest === true || order?.testOrder === true) continue;
    seen.add(id);
    const date = financialDateKey(order.createdAt || order.createdAtDate || order.created_at || order.date);
    if (!date) { missingDateCount++; continue; }
    if (!date.startsWith(month)) continue;
    const amount = numberValue(getOrderTotal(order));
    const received = numberValue(getOrderPaidAmount(order));
    const refunded = numberValue(getOrderRefundedAmount(order));
    const paymentStatus = getOrderPaymentStatus(order);
    const status = normalized(order.status);
    const kind = normalized(order.orderType || order.type || order.kind);
    if (kind === 'brinde' || kind === 'gift' || paymentStatus === 'not_applicable') continue;

    const reviewReasons: string[] = [];
    if (!Number.isFinite(amount) || !Number.isFinite(received) || !Number.isFinite(refunded)) reviewReasons.push('Valor financeiro inválido');
    if (!Number.isFinite(amount) || amount <= 0) reviewReasons.push('Venda sem valor positivo');
    if (['cancelled', 'canceled', 'cancelado', 'returned', 'devolvido'].includes(status)) reviewReasons.push('Pedido cancelado/devolvido');
    if (['cancelled', 'rejected', 'refunded', 'partially_refunded'].includes(paymentStatus)) reviewReasons.push('Pagamento cancelado/reembolsado');
    if (Number.isFinite(refunded) && refunded > 0) reviewReasons.push('Estorno: conferir documentação e competência');
    if (!Number.isFinite(received) || !Number.isFinite(amount) || cents(received) < cents(amount)) reviewReasons.push('Pagamento ausente ou parcial: verificar venda e competência');
    if (Number.isFinite(received) && Number.isFinite(amount) && cents(received) > cents(amount)) reviewReasons.push('Recebimento superior ao pedido');

    const beforeRegistration = !!registrationDate && /^\d{4}-\d{2}-\d{2}$/.test(registrationDate) && date < registrationDate;
    const reason = beforeRegistration ? 'Anterior à data informada de abertura do MEI' : reviewReasons.join('; ');
    all.push({
      id, date,
      amount: Number.isFinite(amount) ? money(cents(amount)) : 0,
      received: Number.isFinite(received) ? money(cents(received)) : 0,
      refunded: Number.isFinite(refunded) ? money(cents(refunded)) : 0,
      status: beforeRegistration ? 'before_registration' : reviewReasons.length ? 'review' : 'candidate',
      reason: reason || 'Candidato à receita bruta — validar notas e competência',
      channel: String(order.salesChannel || order.channel || order.source || (order.isManual ? 'Manual' : 'Site/sem identificação'))
    });
  }
  const candidates = all.filter(r => r.status === 'candidate');
  const review = all.filter(r => r.status === 'review');
  const beforeRegistration = all.filter(r => r.status === 'before_registration');
  const sum = (rows: MeiRevenueRow[]) => money(rows.reduce((acc, row) => acc + cents(row.amount), 0));
  return {
    month, candidates, review, beforeRegistration,
    candidateGross: sum(candidates),
    reviewGross: sum(review),
    preRegistrationGross: sum(beforeRegistration),
    missingDateCount
  };
}

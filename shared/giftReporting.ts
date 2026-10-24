import { financialDateKey } from './cashFlow';
import { getOrderItemCost } from './orderCostCoverage';
import { getOrderShippingFinances, hasRecordedShippingCost } from './orderFinancialCore';
import { isGiftOrder, loyaltyPaidValue, orderDate, readCustomerName, uniqueOrders } from './customerPurchases';
import type { ReceiptRange } from './financialReceipts';

const money = (value: number) => Math.round(value * 100) / 100;
const finiteCost = (value: unknown) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();
export type GiftState = 'delivered' | 'open' | 'cancelled';
export const GIFT_STATE_LABELS: Record<GiftState, string> = { delivered: 'Entregue', open: 'Em aberto', cancelled: 'Cancelado' };

export interface GiftReportRow {
  id: string;
  name: string;
  date: string | null;
  state: GiftState;
  units: number;
  merchandiseCost: number;
  shippingCost: number;
  knownCost: number;
  estimatedCost: number;
  pendingUnits: number;
  shippingMissing: boolean;
  costConflict: boolean;
  missingItems: boolean;
  reason: string;
  items: { name: string; color: string; size: string; units: number }[];
}

function giftState(order: any): GiftState {
  const states = [order.status, order.shippingStatus, order.shipping?.status, order.paymentStatus].map(normalized);
  if (states.some(s => ['cancelled', 'canceled', 'cancelado', 'voided'].includes(s))) return 'cancelled';
  if (states.some(s => ['delivered', 'entregue'].includes(s)) || order.deliveredAt || order.shipping?.deliveredAt) return 'delivered';
  return 'open';
}

export function giftReportRows(orders: any[], catalog: any[] = []): GiftReportRow[] {
  return uniqueOrders(orders).filter(isGiftOrder).map((order, index) => {
    let merchandiseCost = 0, estimatedCost = 0, pendingUnits = 0, units = 0;
    const items = (Array.isArray(order.items) ? order.items : []).map((item: any) => {
      const qty = Number(item.quantity ?? item.qty ?? 1), quantity = Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
      units += quantity;
      const missing = ['unavailable', 'missing'].includes(item.costCoverage);
      const explicit = finiteCost(item.totalCostSnapshot) ? Number(item.totalCostSnapshot)
        : finiteCost(item.unitCostSnapshot) ? Number(item.unitCostSnapshot) * quantity : null;
      const costItem = { ...item, quantity };
      const saved = getOrderItemCost(costItem);
      if (quantity === 0) {
        // An invalid/zero quantity must not acquire the cost reader's legacy default of one.
      } else if (!missing && explicit !== null) {
        if (item.costCoverage === 'estimated') { estimatedCost += explicit; pendingUnits += quantity; }
        else merchandiseCost += explicit;
      } else if (!missing && saved.costCoverage === 'complete' && finiteCost(saved.totalCost)) merchandiseCost += saved.totalCost;
      else {
        pendingUnits += quantity;
        const current = getOrderItemCost(costItem, catalog);
        if (finiteCost(current.totalCost)) estimatedCost += current.totalCost;
      }
      return { name: String(item.name || item.title || 'Produto'), color: String(item.color || '—'), size: String(item.size || '—'), units: quantity };
    });
    const stored = order.giftCost;
    const costConflict = Boolean(stored && finiteCost(stored.knownCost) && pendingUnits === 0 && merchandiseCost > 0 && Math.abs(Number(stored.knownCost) - merchandiseCost - estimatedCost) > .01);
    // A complete historical order snapshot takes precedence over today's catalog.
    if (stored && finiteCost(stored.knownCost) && stored.coverage === 'complete' && Number(stored.unknownUnits) === 0) {
      merchandiseCost = Number(stored.knownCost); estimatedCost = 0; pendingUnits = 0;
    } else if (stored && finiteCost(stored.knownCost) && merchandiseCost + estimatedCost === 0 && Number(stored.knownCost) > 0) {
      estimatedCost = Number(stored.knownCost); pendingUnits = Math.max(units, Number(stored.unknownUnits) || 0);
    }
    if (!items.length) pendingUnits = Math.max(0, Number(stored?.unknownUnits) || 0);
    const shippingMissing = !hasRecordedShippingCost(order);
    const actualShipping = shippingMissing ? 0 : getOrderShippingFinances(order).shippingActualCost;
    const shippingCost = finiteCost(actualShipping) ? actualShipping : 0;
    const date = orderDate(order);
    return { id: String(order.id || `sem-identificador-${index}`), name: readCustomerName(order), date: date ? financialDateKey(date) : null, state: giftState(order), units,
      merchandiseCost: money(merchandiseCost), shippingCost: money(shippingCost), knownCost: money(merchandiseCost + shippingCost), estimatedCost: money(estimatedCost), pendingUnits,
      shippingMissing, costConflict, missingItems: !items.length || units === 0, reason: String(order.giftReason || order.observations || order.notes || ''), items };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
}

export function summarizeGiftRows(rows: GiftReportRow[]) {
  const active = rows.filter(row => row.state !== 'cancelled'), delivered = active.filter(row => row.state === 'delivered'), open = active.filter(row => row.state === 'open');
  const totals = (records: GiftReportRow[]) => ({ orders: records.length, units: records.reduce((sum, row) => sum + row.units, 0), knownCost: money(records.reduce((sum, row) => sum + row.knownCost, 0)), estimatedCost: money(records.reduce((sum, row) => sum + row.estimatedCost, 0)), pendingUnits: records.reduce((sum, row) => sum + row.pendingUnits, 0) });
  return { active: totals(active), delivered: totals(delivered), open: totals(open), cancelledOrders: rows.length - active.length,
    shippingMissing: active.filter(row => row.shippingMissing).length, missingItems: active.filter(row => row.missingItems).length, conflicts: active.filter(row => row.costConflict).length, undated: active.filter(row => !row.date).length };
}

export function giftsInRange(rows: GiftReportRow[], range: ReceiptRange) {
  return range ? rows.filter(row => row.date && row.date >= range.start && row.date <= range.end) : rows;
}

export function giftSalesRatio(orders: any[], giftCost: number, range: ReceiptRange) {
  const received = uniqueOrders(orders).reduce((sum, order) => {
    const date = orderDate(order), key = date ? financialDateKey(date) : null;
    return sum + (!range || key && key >= range.start && key <= range.end ? loyaltyPaidValue(order) : 0);
  }, 0);
  return received > 0 ? giftCost / received * 100 : null;
}

export function giftMonthlyTrend(rows: GiftReportRow[], now = new Date()) {
  const today = financialDateKey(now)!, year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 11 + index, 1)), key = date.toISOString().slice(0, 7);
    const delivered = rows.filter(row => row.state === 'delivered' && row.date?.startsWith(key));
    return { month: key, units: delivered.reduce((sum, row) => sum + row.units, 0), cost: money(delivered.reduce((sum, row) => sum + row.knownCost, 0)) };
  });
}

export function giftReportCsv(rows: GiftReportRow[]) {
  const escape = (value: unknown) => { const s = String(value ?? ''); return '"' + (/^[=+@\-]/.test(s.trimStart()) || /^[\t\r\n]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'; };
  const lines: unknown[][] = [['Pedido', 'Data do cadastro', 'Destinatário', 'Situação', 'Itens (produto / cor / tamanho / quantidade)', 'Unidades', 'Custo dos produtos registrado', 'Frete registrado', 'Custo total registrado', 'Estimativa de produtos', 'Unidades a conferir', 'Conferir itens', 'Divergência de custo histórico', 'Observação']];
  rows.forEach(row => lines.push([row.id, row.date || 'Sem data', row.name, GIFT_STATE_LABELS[row.state], row.items.map(item => `${item.name} / ${item.color} / ${item.size} / ${item.units}`).join(' | '), row.units, row.merchandiseCost.toFixed(2).replace('.', ','), row.shippingMissing ? 'Não informado' : row.shippingCost.toFixed(2).replace('.', ','), row.knownCost.toFixed(2).replace('.', ','), row.estimatedCost.toFixed(2).replace('.', ','), row.pendingUnits, row.missingItems ? 'Sim' : 'Não', row.costConflict ? 'Sim' : 'Não', row.reason]));
  return '\ufeff' + lines.map(line => line.map(escape).join(';')).join('\r\n');
}

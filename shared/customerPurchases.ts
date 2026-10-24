import { getOrderNetReceived, getOrderPaymentStatus } from './orderFinancialCore';

const text = (value: unknown) => String(value ?? '').trim();
const normalized = (value: unknown) => text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const excludedStatuses = new Set(['cancelled', 'canceled', 'cancelado', 'refused', 'rejected', 'recusado', 'rejeitado', 'returned', 'devolvido', 'refunded', 'estornado']);

/** An explicit gift classification wins over stale sale/payment mirrors. */
export function isGiftOrder(order: any): boolean {
  return order?.isGift === true || ['gift', 'brinde'].includes(normalized(order?.orderKind))
    || ['brinde', 'gift'].includes(normalized(order?.paymentMethod))
    || ['brinde', 'gift'].includes(normalized(order?.payment?.method))
    || /^MANUAL-BRINDE-/i.test(text(order?.id));
}

export function normalizeCustomerPhone(value: unknown): string {
  let digits = text(value).replace(/\D/g, '');
  if (digits.startsWith('0055')) digits = digits.slice(2);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  // Brazilian legacy mobile numbers omitted the ninth digit. Landlines keep 8 digits.
  if (digits.length === 10 && /^[6-9]/.test(digits.slice(2))) digits = digits.slice(0, 2) + '9' + digits.slice(2);
  if (!/^[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(digits) || /^(\d)\1+$/.test(digits.slice(2))) return '';
  return digits;
}

export function readCustomerAliases(order: any): string[] {
  const customer = order?.customer || {}, info = order?.customerInfo || {}, aliases = new Set<string>();
  const ids = [order?.userId, order?.customerId, customer.id, customer.uid, customer.userId, info.userId, info.uid];
  for (const value of ids) {
    const id = text(value);
    if (id && !['manual', 'guest', 'anonymous', 'null', 'undefined', 'none', 'n/a'].includes(id.toLowerCase())) aliases.add(`user:${id}`);
  }
  for (const value of [order?.customerEmail, customer.email, info.email, order?.email]) {
    const email = text(value).toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) aliases.add(`email:${email}`);
  }
  for (const value of [order?.customerPhone, order?.customerPhone2, customer.phone, customer.phone2, customer.whatsapp, info.phone, info.phone2, info.whatsapp, order?.phone, order?.phone2]) {
    const phone = normalizeCustomerPhone(value);
    if (phone) aliases.add(`phone:${phone}`);
  }
  for (const value of [order?.customerCpf, customer.cpf, info.cpf, order?.cpf, customer.document]) {
    const cpf = text(value).replace(/\D/g, '');
    if (cpf.length === 11 && !/^(\d)\1+$/.test(cpf)) aliases.add(`cpf:${cpf}`);
  }
  return [...aliases];
}

export function readCustomerName(order: any): string {
  return text(order?.customerName || order?.customer?.name || order?.customerInfo?.name || order?.name) || 'Cliente F PAC';
}

export function orderDate(order: any): Date | null {
  const value = order?.createdAt ?? order?.createdAtDate ?? order?.created_at ?? order?.date;
  if (!value) return null;
  try {
    const date = typeof value.toDate === 'function' ? value.toDate()
      : typeof value.toMillis === 'function' ? new Date(value.toMillis())
      : typeof (value.seconds ?? value._seconds) === 'number' ? new Date((value.seconds ?? value._seconds) * 1000)
      : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch { return null; }
}

export function uniqueOrders(orders: any[]): any[] {
  const seen = new Set<string>();
  return orders.filter(order => {
    if (!order || typeof order !== 'object') return false;
    const id = text(order.id);
    if (id && seen.has(id)) return false;
    if (id) seen.add(id);
    return true;
  });
}

export function loyaltyPaidValue(order: any): number {
  if (isGiftOrder(order)) return 0;
  if ([order?.status, order?.paymentStatus, order?.payment?.status].some(value => excludedStatuses.has(normalized(value)))) return 0;
  if (getOrderPaymentStatus(order) === 'not_applicable') return 0;
  const paid = getOrderNetReceived(order);
  return Number.isFinite(paid) && paid > 0 ? Math.round(paid * 100) / 100 : 0;
}

export function purchasedQuantity(item: any): number {
  if (item?.isGift === true || ['gift', 'brinde'].includes(normalized(item?.itemKind))) return 0;
  const quantity = Number(item?.quantity ?? item?.qty ?? 1);
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
}

export interface CustomerIdentity {
  key: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  aliases: Set<string>;
  names: Set<string>;
  allOrders: any[];
}

/** Resolve identifiers before filtering purchases: unpaid/gift records may bridge contacts. Names alone never link customers. */
export function buildCustomerIdentities(orders: any[]): CustomerIdentity[] {
  const groups = new Set<CustomerIdentity>(), byAlias = new Map<string, CustomerIdentity>();
  const preferName = (a: string, b: string) => a === 'Cliente F PAC' || (b !== 'Cliente F PAC' && b.length > a.length) ? b : a;
  for (const [index, order] of uniqueOrders(orders).entries()) {
    const aliases = readCustomerAliases(order);
    const matches = [...new Set(aliases.map(alias => byAlias.get(alias)).filter((group): group is CustomerIdentity => Boolean(group)))];
    const city = order.address?.city || order.city || order.customer?.city || '';
    const state = order.address?.state || order.state || '';
    const group = matches[0] || { key: `order:${text(order.id) || index}`, name: 'Cliente F PAC', email: '', phone: '', city: '', aliases: new Set<string>(), names: new Set<string>(), allOrders: [] };
    if (!matches.length) groups.add(group);
    for (const duplicate of matches.slice(1)) {
      group.allOrders.push(...duplicate.allOrders);
      group.name = preferName(group.name, duplicate.name);
      group.email ||= duplicate.email; group.phone ||= duplicate.phone; group.city ||= duplicate.city;
      duplicate.names.forEach(name => group.names.add(name));
      duplicate.aliases.forEach(alias => { group.aliases.add(alias); byAlias.set(alias, group); });
      groups.delete(duplicate);
    }
    group.allOrders.push(order);
    const name = readCustomerName(order);group.names.add(name);group.name = preferName(group.name, name);
    group.email ||= aliases.find(alias => alias.startsWith('email:'))?.slice(6) || '';
    const nationalPhone = aliases.find(alias => alias.startsWith('phone:'))?.slice(6);
    group.phone ||= nationalPhone ? '55' + nationalPhone : '';
    group.city ||= city ? [city, state].filter(Boolean).join('/') : '';
    aliases.forEach(alias => { group.aliases.add(alias); byAlias.set(alias, group); });
    if (group.aliases.size) group.key = [...group.aliases].sort()[0];
  }
  return [...groups];
}

export function aggregateCustomerPurchases(orders: any[]) {
  return buildCustomerIdentities(orders).map(group => {
    const purchases = group.allOrders.filter(order => loyaltyPaidValue(order) > 0);
    const dates = purchases.map(orderDate).filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime());
    return { ...group, orders: purchases, netPaid: purchases.reduce((cents, order) => cents + Math.round(loyaltyPaidValue(order) * 100), 0) / 100,
      firstPurchaseDate: dates[0] || null, lastPurchaseDate: dates.at(-1) || null };
  }).filter(group => group.orders.length > 0);
}

/** Both ranking surfaces break equal totals by the first real purchase, then identity. */
export function comparePurchaseTotals(
  a: { netPaid: number; firstPurchaseDate: Date | null; key: string },
  b: { netPaid: number; firstPurchaseDate: Date | null; key: string },
) {
  return b.netPaid - a.netPaid
    || (a.firstPurchaseDate?.getTime() ?? Infinity) - (b.firstPurchaseDate?.getTime() ?? Infinity)
    || a.key.localeCompare(b.key);
}

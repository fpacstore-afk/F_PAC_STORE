import { DEFAULT_TIERS, getTierByAmount, sanitizePublicName } from '../../src/constants/loyaltyConfig.js';
import { getOrderNetReceived } from '../utils/orderFinancial.js';
import { getDb } from '../firebase.js';

export interface PublicClubRankingEntry {
  position: number;
  publicName: string;
  tier: {
    id: 'bronze' | 'prata' | 'ouro' | 'diamante';
    name: string;
    badge: string;
  };
}

export interface PublicClubRankingPayload {
  ranking: PublicClubRankingEntry[];
  topBuyer: PublicClubRankingEntry | null;
  updatedAt: string;
}

const CACHE_TTL_MS = 60 * 1000;
const MAX_PUBLIC_RANKING_SIZE = 10;
const EXCLUDED_ORDER_STATUSES = new Set([
  'cancelled',
  'canceled',
  'cancelado',
  'refused',
  'rejected',
  'returned',
  'devolvido',
]);

let cachedPayload: PublicClubRankingPayload | null = null;
let cacheExpiresAt = 0;

interface CustomerAggregate {
  name: string;
  netPaid: number;
  firstPurchaseAt: number;
  aliases: Set<string>;
}

function readTextValues(...values: any[]): string[] {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function normalizePhone(value: any): string | null {
  let digits = String(value || '').replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  return digits.length >= 10 && digits.length <= 11 ? digits : null;
}

function normalizeCpf(value: any): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

function readCustomerAliases(order: any): string[] {
  const customer = order?.customer || {};
  const customerInfo = order?.customerInfo || {};
  const aliases = new Set<string>();

  readTextValues(order?.userId, customer?.id, customerInfo?.userId)
    .forEach(value => aliases.add(`user:${value}`));

  readTextValues(order?.customerEmail, customer?.email, customerInfo?.email, order?.email)
    .map(value => value.toLowerCase())
    .forEach(value => aliases.add(`email:${value}`));

  readTextValues(
    order?.customerPhone,
    order?.customerPhone2,
    customer?.phone,
    customer?.phone2,
    customerInfo?.phone,
    order?.phone,
    order?.phone2,
  )
    .map(normalizePhone)
    .filter((value): value is string => Boolean(value))
    .forEach(value => aliases.add(`phone:${value}`));

  readTextValues(order?.customerCpf, customer?.cpf, customerInfo?.cpf, order?.cpf, customer?.document)
    .map(normalizeCpf)
    .filter((value): value is string => Boolean(value))
    .forEach(value => aliases.add(`cpf:${value}`));

  return [...aliases];
}

function readCustomerName(order: any): string {
  return String(order?.customerName || order?.customer?.name || order?.customerInfo?.name || order?.name || 'Cliente F PAC').trim() || 'Cliente F PAC';
}

function preferCustomerName(current: string, candidate: string): string {
  if (current === 'Cliente F PAC') return candidate;
  if (candidate === 'Cliente F PAC') return current;
  return candidate.length > current.length ? candidate : current;
}

function readOrderDate(order: any): number {
  const rawDate = order?.createdAt;
  if (rawDate?.toMillis) return rawDate.toMillis();
  if (rawDate?.toDate) return rawDate.toDate().getTime();
  if (rawDate?._seconds) return Number(rawDate._seconds) * 1000;
  const parsed = rawDate ? new Date(rawDate).getTime() : Number.MAX_SAFE_INTEGER;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function isExcludedOrder(order: any): boolean {
  const statuses = [order?.status, order?.paymentStatus, order?.payment?.status]
    .map(value => String(value || '').trim().toLowerCase());
  return statuses.some(status => EXCLUDED_ORDER_STATUSES.has(status));
}

export function buildPublicClubRanking(orders: any[], limit = MAX_PUBLIC_RANKING_SIZE): PublicClubRankingEntry[] {
  const customers = new Set<CustomerAggregate>();
  const customerByAlias = new Map<string, CustomerAggregate>();

  for (const order of orders) {
    if (isExcludedOrder(order)) continue;

    const netPaid = getOrderNetReceived(order);
    if (!Number.isFinite(netPaid) || netPaid <= 0) continue;

    const aliases = readCustomerAliases(order);
    if (aliases.length === 0) continue;

    const orderDate = readOrderDate(order);
    const matchedCustomers = [...new Set(
      aliases.map(alias => customerByAlias.get(alias)).filter((customer): customer is CustomerAggregate => Boolean(customer)),
    )];
    const current = matchedCustomers[0] || {
      name: 'Cliente F PAC',
      netPaid: 0,
      firstPurchaseAt: orderDate,
      aliases: new Set<string>(),
    };

    if (matchedCustomers.length === 0) customers.add(current);

    for (const duplicate of matchedCustomers.slice(1)) {
      current.netPaid += duplicate.netPaid;
      current.firstPurchaseAt = Math.min(current.firstPurchaseAt, duplicate.firstPurchaseAt);
      current.name = preferCustomerName(current.name, duplicate.name);
      duplicate.aliases.forEach(alias => {
        current.aliases.add(alias);
        customerByAlias.set(alias, current);
      });
      customers.delete(duplicate);
    }

    current.netPaid += netPaid;
    current.firstPurchaseAt = Math.min(current.firstPurchaseAt, orderDate);
    current.name = preferCustomerName(current.name, readCustomerName(order));
    aliases.forEach(alias => {
      current.aliases.add(alias);
      customerByAlias.set(alias, current);
    });
  }

  const safeLimit = Math.max(1, Math.min(MAX_PUBLIC_RANKING_SIZE, Math.floor(limit) || MAX_PUBLIC_RANKING_SIZE));

  return [...customers]
    .sort((a, b) => b.netPaid - a.netPaid || a.firstPurchaseAt - b.firstPurchaseAt)
    .slice(0, safeLimit)
    .map((customer, index) => {
      const tier = getTierByAmount(customer.netPaid, DEFAULT_TIERS);
      return {
        position: index + 1,
        publicName: sanitizePublicName(customer.name),
        tier: {
          id: tier.id,
          name: tier.name,
          badge: tier.badge,
        },
      };
    });
}

export async function getPublicClubRanking(limit = MAX_PUBLIC_RANKING_SIZE): Promise<PublicClubRankingPayload> {
  const now = Date.now();
  if (cachedPayload && now < cacheExpiresAt) {
    const ranking = cachedPayload.ranking.slice(0, limit);
    return { ...cachedPayload, ranking, topBuyer: ranking[0] || null };
  }

  const database = getDb();
  const snapshot = await database.collection('orders').get();
  const orders = snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() }));
  const ranking = buildPublicClubRanking(orders, MAX_PUBLIC_RANKING_SIZE);

  cachedPayload = {
    ranking,
    topBuyer: ranking[0] || null,
    updatedAt: new Date().toISOString(),
  };
  cacheExpiresAt = now + CACHE_TTL_MS;

  const slicedRanking = ranking.slice(0, limit);
  return { ...cachedPayload, ranking: slicedRanking, topBuyer: slicedRanking[0] || null };
}

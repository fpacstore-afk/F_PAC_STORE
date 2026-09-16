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

const CACHE_TTL_MS = 5 * 60 * 1000;
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

function normalizeCustomerIdentity(order: any): string | null {
  const customer = order?.customer || {};
  const userId = String(order?.userId || customer?.id || '').trim();
  if (userId) return `user:${userId}`;

  const email = String(order?.customerEmail || customer?.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;

  const phone = String(order?.customerPhone || customer?.phone || '').replace(/\D/g, '');
  if (phone.length >= 8) return `phone:${phone}`;

  return null;
}

function readCustomerName(order: any): string {
  return String(order?.customerName || order?.customer?.name || 'Cliente F PAC').trim() || 'Cliente F PAC';
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
  const customers = new Map<string, { name: string; netPaid: number; firstPurchaseAt: number }>();

  for (const order of orders) {
    if (isExcludedOrder(order)) continue;

    const netPaid = getOrderNetReceived(order);
    if (!Number.isFinite(netPaid) || netPaid <= 0) continue;

    const identity = normalizeCustomerIdentity(order);
    if (!identity) continue;

    const orderDate = readOrderDate(order);
    const current = customers.get(identity) || {
      name: readCustomerName(order),
      netPaid: 0,
      firstPurchaseAt: orderDate,
    };

    current.netPaid += netPaid;
    current.firstPurchaseAt = Math.min(current.firstPurchaseAt, orderDate);
    if (current.name === 'Cliente F PAC') current.name = readCustomerName(order);
    customers.set(identity, current);
  }

  const safeLimit = Math.max(1, Math.min(MAX_PUBLIC_RANKING_SIZE, Math.floor(limit) || MAX_PUBLIC_RANKING_SIZE));

  return [...customers.values()]
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


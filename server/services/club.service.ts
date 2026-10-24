import { DEFAULT_TIERS, getTierByAmount, sanitizePublicName } from '../../src/constants/loyaltyConfig.js';
import { aggregateCustomerPurchases, comparePurchaseTotals } from '../../shared/customerPurchases.js';
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
let cachedPayload: PublicClubRankingPayload | null = null;
let cacheExpiresAt = 0;

export function buildPublicClubRanking(orders: any[], limit = MAX_PUBLIC_RANKING_SIZE): PublicClubRankingEntry[] {
  const safeLimit = Math.max(1, Math.min(MAX_PUBLIC_RANKING_SIZE, Math.floor(limit) || MAX_PUBLIC_RANKING_SIZE));
  return aggregateCustomerPurchases(orders)
    .filter(customer => customer.aliases.size > 0)
    .sort(comparePurchaseTotals)
    .slice(0, safeLimit)
    .map((customer, index) => {
      const tier = getTierByAmount(customer.netPaid, DEFAULT_TIERS);
      return {
        position: index + 1,
        publicName: sanitizePublicName(customer.name),
        tier: { id: tier.id, name: tier.name, badge: tier.badge },
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

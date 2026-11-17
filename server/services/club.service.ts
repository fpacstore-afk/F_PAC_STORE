import { DEFAULT_TIERS, getTierByAmount, sanitizePublicName } from '../../src/constants/loyaltyConfig.js';
import { aggregateCustomerPurchases, comparePurchaseTotals } from '../../shared/customerPurchases.js';
import { createCachedRequest } from '../../shared/cachedRequest.js';
import { getDb } from '../firebase.js';
import { Timestamp } from 'firebase-admin/firestore';

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
const RECONCILE_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_PUBLIC_RANKING_SIZE = 10;

type SavedRanking = {
  version: 1;
  orderCount: number;
  sourceReadAt: Timestamp;
  payload: PublicClubRankingPayload;
};

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

function readSavedRanking(value: FirebaseFirestore.DocumentData | undefined): SavedRanking | undefined {
  return value?.version === 1 && Array.isArray(value.payload?.ranking)
    && Number.isSafeInteger(value.orderCount) && value.sourceReadAt?.toMillis
    ? value as SavedRanking : undefined;
}

export async function refreshPublicClubRanking(database: FirebaseFirestore.Firestore, now = Date.now()): Promise<PublicClubRankingPayload> {
  // Store only the already-public projection. Firestore clients have no
  // access to this server-owned collection under the existing rules.
  const ref = database.collection('club_ranking_snapshots').doc('current');
  const orders = database.collection('orders');
  const saved = readSavedRanking((await ref.get()).data());
  if (saved && now - saved.sourceReadAt.toMillis() < RECONCILE_AFTER_MS) {
    const through = Timestamp.fromMillis(Math.max(now, saved.sourceReadAt.toMillis()) + 60_000);
    const previousIso = saved.sourceReadAt.toDate().toISOString();
    // Orders use both server timestamps and ISO text. The separate upper
    // bounds keep the queries in their respective Firestore types.
    const dateHolder = ['updatedAt', 'createdAt'];
    const [count, ...changes] = await Promise.all([
      orders.count().get(),
      ...dateHolder.flatMap(field => [
        orders.where(field, '>', saved.sourceReadAt).where(field, '<=', through).limit(1).get(),
        orders.where(field, '>', previousIso).where(field, '<=', through.toDate().toISOString()).limit(1).get(),
      ]),
    ]);
    if (count.data().count === saved.orderCount && changes.every(change => change.empty)) return saved.payload;
  }

  const snapshot = await orders.get();
  const ranking = buildPublicClubRanking(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
  const sourceReadAt = snapshot.readTime;
  const payload = { ranking, topBuyer: ranking[0] || null, updatedAt: sourceReadAt.toDate().toISOString() };
  const projection: SavedRanking = { version: 1, orderCount: snapshot.size, sourceReadAt, payload };
  return database.runTransaction(async tx => {
    // A slower calculation must never replace a newer projection.
    const current = readSavedRanking((await tx.get(ref)).data());
    if (current && current.sourceReadAt.toMillis() >= sourceReadAt.toMillis()) return current.payload;
    tx.set(ref, projection);
    return payload;
  });
}

const loadPublicClubRanking = createCachedRequest(() => refreshPublicClubRanking(getDb()), { ttlMs: CACHE_TTL_MS });

export async function getPublicClubRanking(limit = MAX_PUBLIC_RANKING_SIZE): Promise<PublicClubRankingPayload> {
  const payload = await loadPublicClubRanking();
  const ranking = payload.ranking.slice(0, limit);
  return { ...payload, ranking, topBuyer: ranking[0] || null };
}

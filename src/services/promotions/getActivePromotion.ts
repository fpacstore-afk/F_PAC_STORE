import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { WeeklyPromotion } from '../../types/promotions';
import { createCachedRequest } from '../../../shared/cachedRequest';

// Cache candidates, including empty results, and share pending reads.
// Date boundaries are evaluated per call, even during the 30-second cache.
const loadPromotions = createCachedRequest(async (): Promise<WeeklyPromotion[]> => {
  try {
    const snapshot = await getDocs(query(collection(db, 'weekly_promotions'), where('active', '==', true)));
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WeeklyPromotion));
  } catch (error) {
    console.warn('[GET_ACTIVE_PROMO_ERROR] Failed to fetch active promotion:', error);
    throw error;
  }
}, { ttlMs: 30_000, retryMs: 30_000 });

export async function getActivePromotion(): Promise<WeeklyPromotion | null> {
  try {
    const promotions = await loadPromotions();
    const now = Date.now();
    return promotions.filter(promo => {
      const start = promo.start_date ? new Date(promo.start_date).getTime() : 0;
      const end = promo.end_date ? new Date(promo.end_date).getTime() : Infinity;
      return promo.active && now >= start && now <= end;
    }).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.id.localeCompare(a.id))[0] ?? null;
  } catch {
    return null;
  }
}

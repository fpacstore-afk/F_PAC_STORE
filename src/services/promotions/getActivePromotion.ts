import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { WeeklyPromotion } from '../../types/promotions';
import { createCachedRequest } from '../../../shared/cachedRequest';
import { selectActivePromotion } from '../../../shared/storefrontTotals';

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
    return selectActivePromotion(promotions, now);
  } catch {
    return null;
  }
}

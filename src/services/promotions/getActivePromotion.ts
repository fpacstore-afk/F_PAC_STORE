import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { WeeklyPromotion } from '../../types/promotions';

let cachedActivePromo: WeeklyPromotion | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds cache

export async function getActivePromotion(): Promise<WeeklyPromotion | null> {
  const now = Date.now();
  if (cachedActivePromo && (now - lastFetchTime) < CACHE_TTL) {
    // Validate that the cached promotion is still within its active date range
    const start = new Date(cachedActivePromo.start_date).getTime();
    const end = new Date(cachedActivePromo.end_date).getTime();
    if (now >= start && now <= end && cachedActivePromo.active) {
      return cachedActivePromo;
    }
  }

  try {
    const q = query(
      collection(db, 'weekly_promotions'),
      where('active', '==', true)
    );
    const snapshot = await getDocs(q);
    const promotions: WeeklyPromotion[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      promotions.push({
        id: doc.id,
        ...data
      } as WeeklyPromotion);
    });

    // Filter by date range (since Firestore compound index with inequalities requires custom index config)
    const validPromos = promotions.filter((promo) => {
      const start = promo.start_date ? new Date(promo.start_date).getTime() : 0;
      const end = promo.end_date ? new Date(promo.end_date).getTime() : Infinity;
      return now >= start && now <= end;
    });

    // Sort valid active promotions by priority descending, then by created_at or title
    validPromos.sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      if (priorityB !== priorityA) {
        return priorityB - priorityA;
      }
      return b.id.localeCompare(a.id); // fallback deterministic sort
    });

    // In case multiple active ones exist, get the highest priority active one
    if (validPromos.length > 0) {
      cachedActivePromo = validPromos[0];
      lastFetchTime = now;
      return cachedActivePromo;
    }

    cachedActivePromo = null;
    return null;
  } catch (error) {
    console.warn('[GET_ACTIVE_PROMO_ERROR] Failed to fetch active promotion:', error);
    return null;
  }
}

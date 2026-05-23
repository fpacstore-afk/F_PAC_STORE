import { collection, doc, getDocs, query, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { WeeklyPromotion } from '../../types/promotions';

/**
 * Checks scheduled promotions and activates/deactivates them based on current date.
 * Relies on timezone-insensitive comparisons or UTC.
 */
export async function checkAndSchedulePromotions(): Promise<void> {
  try {
    const now = new Date();
    const promotionsQuery = query(collection(db, 'weekly_promotions'));
    const snapshot = await getDocs(promotionsQuery);
    
    const promotions: WeeklyPromotion[] = [];
    snapshot.forEach((doc) => {
      promotions.push({ id: doc.id, ...doc.data() } as WeeklyPromotion);
    });

    const batch = writeBatch(db);
    let changed = false;

    for (const promo of promotions) {
      const start = new Date(promo.start_date);
      const end = new Date(promo.end_date);
      
      const shouldBeActive = now >= start && now <= end;

      // If active field is desynced with current date, correct it
      if (shouldBeActive && !promo.active) {
        batch.update(doc(db, 'weekly_promotions', promo.id), { active: true });
        changed = true;
      } else if (!shouldBeActive && promo.active) {
        batch.update(doc(db, 'weekly_promotions', promo.id), { active: false });
        changed = true;
      }
    }

    if (changed) {
      await batch.commit();
      console.log('ℹ️ [PROMO_SCHEDULER] Successfully auto-rotated weekly promotions based on schedule.');
    }
  } catch (error) {
    console.error('[PROMO_SCHEDULER_ERROR]', error);
  }
}

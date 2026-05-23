import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PromotionAnalyticsEntry, PromotionSummaryAnalytics } from '../../types/promotions';

export async function logPromotionEvent(
  promoId: string,
  eventType: 'view' | 'click' | 'purchase',
  productId?: string,
  value?: number
): Promise<void> {
  try {
    const entry: Omit<PromotionAnalyticsEntry, 'id'> = {
      promo_id: promoId,
      event_type: eventType,
      product_id: productId || '',
      value: value || 0,
      created_at: new Date().toISOString()
    };
    await addDoc(collection(db, 'promotion_analytics'), entry);
  } catch (error) {
    console.error('⚠️ [PROMO_ANALYTICS] Error logging promo event:', error);
  }
}

export async function getPromotionAnalytics(promoId: string): Promise<PromotionSummaryAnalytics> {
  try {
    const q = query(
      collection(db, 'promotion_analytics'),
      where('promo_id', '==', promoId)
    );
    const snapshot = await getDocs(q);
    
    let clicks = 0;
    let views = 0;
    let sales_count = 0;
    let revenue = 0;
    const top_products: { [productId: string]: number } = {};

    snapshot.forEach((doc) => {
      const data = doc.data() as PromotionAnalyticsEntry;
      if (data.event_type === 'click') {
        clicks++;
        if (data.product_id) {
          top_products[data.product_id] = (top_products[data.product_id] || 0) + 1;
        }
      } else if (data.event_type === 'view') {
        views++;
      } else if (data.event_type === 'purchase') {
        sales_count++;
        revenue += data.value || 0;
      }
    });

    return {
      clicks,
      views,
      sales_count,
      revenue: Number(revenue.toFixed(2)),
      top_products
    };
  } catch (error) {
    console.error('⚠️ [PROMO_ANALYTICS] Error getting promo analytics:', error);
    return {
      clicks: 0,
      views: 0,
      sales_count: 0,
      revenue: 0,
      top_products: {}
    };
  }
}

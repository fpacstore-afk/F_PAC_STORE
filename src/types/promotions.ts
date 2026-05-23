export interface WeeklyPromotion {
  id: string;
  title: string;
  description: string;
  banner_image: string;
  active: boolean;
  discount_type: 'percentage' | 'fixed_amount' | 'free_shipping' | 'combo' | 'progressive';
  discount_value: number; // e.g., 20 for 20% or 20 for R$20 OFF
  start_date: string; // ISO string
  end_date: string; // ISO string
  colors?: string[]; // e.g. ["#eab308", "#000000"]
  countdown_enabled: boolean;
  product_ids: string[]; // List of product IDs included in this promotion
  created_at?: string;
  banner_text?: string;
  button_text?: string;
  
  // Custom configs to support all 5 types perfectly
  free_shipping_threshold?: number; // e.g. 199 for gratis over 199
  free_shipping_city?: string; // e.g. "Joinville"
  
  combo_qty?: number; // e.g. 2 pieces
  combo_discount_percent?: number; // e.g. 15 for 15% OFF
  
  progressive_rules?: { qty: number; discount_percent: number }[]; // [{qty: 1, discount_percent: 10}, {qty: 2, discount_percent: 20}]
}

export interface PromotionAnalyticsEntry {
  id?: string;
  promo_id: string;
  event_type: 'view' | 'click' | 'purchase';
  product_id?: string;
  value?: number; // revenue or discount amount
  created_at: string;
}

export interface PromotionSummaryAnalytics {
  clicks: number;
  views: number;
  sales_count: number;
  revenue: number;
  top_products: { [productId: string]: number };
}

import React from 'react';
import { Tag } from 'lucide-react';
import { WeeklyPromotion } from '../../types/promotions';

interface PromotionBadgeProps {
  promotion: WeeklyPromotion | null;
  productId: string;
  className?: string;
  size?: 'sm' | 'md';
}

export const PromotionBadge: React.FC<PromotionBadgeProps> = ({
  promotion,
  productId,
  className = '',
  size = 'md',
}) => {
  if (!promotion || !promotion.active) return null;
  
  // Check if this product is part of the promotion
  const isEligible = promotion.product_ids?.includes(productId);
  if (!isEligible && promotion.discount_type !== 'free_shipping') {
    return null;
  }

  let text = '';
  switch (promotion.discount_type) {
    case 'percentage':
      text = `-${promotion.discount_value}%`;
      break;
    case 'fixed_amount':
      text = `-${promotion.discount_value} REAIS`;
      break;
    case 'free_shipping':
      text = promotion.free_shipping_city ? `FRETE GRÁTIS ${promotion.free_shipping_city.toUpperCase()}` : 'FRETE GRÁTIS';
      break;
    case 'combo':
      text = `COMBO: ${promotion.combo_discount_percent ?? promotion.discount_value}% OFF`;
      break;
    case 'progressive':
      text = 'PROGRESSIVO';
      break;
    default:
      text = 'PROMOÇÃO';
  }

  const isSm = size === 'sm';

  return (
    <div
      className={`bg-[#eab308] text-black font-black uppercase tracking-widest flex items-center justify-center gap-1 shadow-sm select-none z-20 ${
        isSm ? 'text-[8px] px-1.5 py-0.5 rounded-sm' : 'text-[9px] md:text-[10px] px-2.5 py-1 rounded'
      } ${className}`}
    >
      <Tag size={isSm ? 8 : 10} className="stroke-[3]" />
      <span>{text}</span>
    </div>
  );
};

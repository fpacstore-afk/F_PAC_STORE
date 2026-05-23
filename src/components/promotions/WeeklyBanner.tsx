import React, { useEffect } from 'react';
import { WeeklyPromotion } from '../../types/promotions';
import { PromotionCountdown } from './PromotionCountdown';
import { logPromotionEvent } from '../../services/promotions/promotionAnalytics';
import { Sparkles, ArrowRight } from 'lucide-react';

interface WeeklyBannerProps {
  promotion: WeeklyPromotion | null;
  onNavigateToProducts?: () => void;
}

export const WeeklyBanner: React.FC<WeeklyBannerProps> = ({
  promotion,
  onNavigateToProducts,
}) => {
  useEffect(() => {
    if (promotion && promotion.active) {
      // Log banner View
      logPromotionEvent(promotion.id, 'view');
    }
  }, [promotion]);

  if (!promotion || !promotion.active) {
    return null;
  }

  const handleBannerClick = () => {
    logPromotionEvent(promotion.id, 'click');
    if (onNavigateToProducts) {
      onNavigateToProducts();
    }
  };

  const hasBannerImage = !!promotion.banner_image;

  return (
    <div 
      onClick={handleBannerClick}
      className="relative w-full bg-black text-white py-12 md:py-16 px-6 cursor-pointer border-y border-white/5 select-none overflow-hidden transition-all duration-300 md:hover:border-[#eab308]/40"
    >
      {/* Background Decorative Gradient Or Image */}
      {hasBannerImage ? (
        <div className="absolute inset-0 z-0">
          <img 
            src={promotion.banner_image} 
            alt="Promotion Banner" 
            className="w-full h-full object-cover opacity-35"
            loading="lazy" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
        </div>
      ) : (
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-neutral-900 via-black to-neutral-950 opacity-90" />
      )}

      {/* Grid Pattern overlay */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center text-center">
        {/* Active Badge */}
        <div className="inline-flex items-center gap-1.5 bg-[#eab308]/10 border border-[#eab308]/30 px-3 py-1 rounded-full text-xs font-black uppercase text-[#eab308] tracking-widest mb-6">
          <Sparkles size={12} className="animate-pulse" />
          <span>PROMOÇÃO ATIVA DA SEMANA</span>
        </div>

        {/* Title & Description */}
        <h2 className="text-2xl md:text-5xl font-black uppercase tracking-widest italic text-yellow-400 mb-4 max-w-2xl drop-shadow">
          {promotion.title}
        </h2>
        
        <p className="text-gray-300 text-xs md:text-sm font-medium tracking-wider max-w-lg mb-8 uppercase">
          {promotion.description}
        </p>

        {/* Countdown timer */}
        {promotion.countdown_enabled && (
          <div className="w-full max-w-md mx-auto mb-8 bg-neutral-900/40 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-center text-white/50 mb-3 block">A PROMOÇÃO TERMINA EM:</p>
            <PromotionCountdown endDate={promotion.end_date} />
          </div>
        )}

        {/* Button Overlay CTA */}
        <div className="flex items-center justify-center gap-2 group-hover:translate-x-1 transition-transform">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white group-hover:text-[#eab308] transition-colors">Aproveitar ofertas</span>
          <span className="text-[#eab308] font-bold">→</span>
        </div>
      </div>
    </div>
  );
};

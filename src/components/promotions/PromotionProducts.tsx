import React from 'react';
import { WeeklyPromotion } from '../../types/promotions';
import { motion } from 'framer-motion';
import { Tag, ArrowUpRight, Flame } from 'lucide-react';

interface PromotionProductsProps {
  promotion: WeeklyPromotion | null;
  products: any[];
  onProductClick: (slug: string) => void;
}

export const PromotionProducts: React.FC<PromotionProductsProps> = ({
  promotion,
  products,
  onProductClick,
}) => {
  if (!promotion || !promotion.active) return null;

  const promoProducts = promotion.product_ids && promotion.product_ids.length > 0
    ? products.filter(p => promotion.product_ids.includes(p.id))
    : products.slice(0, 8); // If empty, display top active products automatically as featured under the campaign

  if (promoProducts.length === 0) return null;

  return (
    <div className="w-full bg-black/5 py-12 px-6 border-y border-black/5">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Flame size={16} className="text-red-500 animate-bounce" />
              <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Últimas Horas</span>
            </div>
            <h3 className="text-xl md:text-2xl font-black uppercase tracking-widest italic flex items-center gap-2">
              PRODUTOS DA CAMPANHA
            </h3>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {promoProducts.length} itens inclusos nesta campanha
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {promoProducts.map((p, idx) => {
            // Calculate promotional price example
            let originalPrice = p.price;
            let promoPrice = p.price;
            
            if (promotion.discount_type === 'percentage') {
              promoPrice = originalPrice * (1 - promotion.discount_value / 100);
            } else if (promotion.discount_type === 'fixed_amount') {
              promoPrice = Math.max(originalPrice - promotion.discount_value, 0.10);
            }

            const hasPriceCut = originalPrice !== promoPrice;

            // Generate contextual promotional badge text
            let badgeText = '';
            if (promotion.discount_type === 'percentage') {
              badgeText = `-${promotion.discount_value}% OFF`;
            } else if (promotion.discount_type === 'fixed_amount') {
              badgeText = `R$ ${promotion.discount_value} OFF`;
            } else if (promotion.discount_type === '2x1') {
              badgeText = '2x1';
            } else if (promotion.discount_type === 'buy3get2') {
              badgeText = 'Leve 3 Pague 2';
            } else if (promotion.discount_type === 'combo') {
              badgeText = 'Combo Peças';
            } else if (promotion.discount_type === 'progressive') {
              badgeText = 'Progressivo';
            } else if (promotion.discount_type === 'cashback') {
              badgeText = 'Cashback';
            } else if (promotion.discount_type === 'brinde') {
              badgeText = '+ Brinde';
            } else if (promotion.discount_type === 'pix_discount') {
              badgeText = 'Pix OFF';
            } else {
              badgeText = 'OFERTA';
            }

            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                onClick={() => onProductClick(p.slug)}
                className="group relative bg-white border border-black/[0.06] p-3 flex flex-col justify-between cursor-pointer select-none transition-shadow hover:shadow-lg"
              >
                {/* Promo Badge overlay */}
                <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                  <div className="bg-[#eab308] text-black text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm">
                    {badgeText}
                  </div>
                </div>

                <div className="aspect-[3/4] w-full bg-neutral-50 border border-black/5 overflow-hidden mb-4 relative">
                  <img
                    src={p.images?.[0] || 'https://via.placeholder.com/300x400'}
                    alt={p.name}
                    loading="lazy"
                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                  />
                  
                  {/* Hover Quick view */}
                  <div className="absolute inset-x-0 bottom-0 bg-black/90 p-2.5 transform translate-y-full group-hover:translate-y-0 transition-transform flex items-center justify-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white">Ver Estampas & Detalhes</span>
                    <ArrowUpRight size={10} className="text-[#eab308]" />
                  </div>
                </div>

                {/* Info and price */}
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-1">
                    {p.tag || 'Lançamento'}
                  </h4>
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#000000] mb-2 line-clamp-1">
                    {p.name}
                  </h3>

                  <div className="flex items-baseline gap-2">
                    {hasPriceCut ? (
                      <>
                        <span className="text-xs font-black text-[#000] font-mono">
                          R$ {promoPrice.toFixed(2)}
                        </span>
                        <span className="text-[10px] font-bold text-neutral-400 font-mono line-through">
                          R$ {originalPrice.toFixed(2)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-black text-[#000] font-mono">
                        R$ {originalPrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { WeeklyPromotion } from '../../types/promotions';
import { Check, X, Sparkles, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PromotionPopupProps {
  promotion: WeeklyPromotion | null;
}

export const PromotionPopup: React.FC<PromotionPopupProps> = ({ promotion }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!promotion || !promotion.active) return;

    // Show popup 1.5 seconds after page load if they haven't closed it in this session
    const closed = sessionStorage.getItem(`promo_closed_${promotion.id}`);
    if (!closed) {
      const timer = setTimeout(() => {
        setVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [promotion]);

  if (!promotion || !promotion.active || !visible) return null;

  const handleClose = () => {
    sessionStorage.setItem(`promo_closed_${promotion.id}`, 'true');
    setVisible(false);
  };

  let offerDescription = '';
  switch (promotion.discount_type) {
    case 'percentage':
      offerDescription = `Ganhe ${promotion.discount_value}% de desconto automático nos produtos selecionados!`;
      break;
    case 'fixed_amount':
      offerDescription = `Ganhe R$ ${promotion.discount_value} OFF de desconto automático nos produtos selecionados!`;
      break;
    case 'free_shipping':
      offerDescription = promotion.free_shipping_threshold 
        ? `Frete grátis em todas as compras acima de R$ ${promotion.free_shipping_threshold}!`
        : `Frete grátis liberado para você! Aproveite por tempo limitado!`;
      break;
    case 'combo':
      offerDescription = `Combo Especial: Compre ${promotion.combo_qty ?? 2} peças e ganhe ${promotion.combo_discount_percent ?? promotion.discount_value}% de desconto automático!`;
      break;
    case 'progressive':
      offerDescription = 'Desconto Progressivo Ativo! Quanto mais itens você compra, maior o desconto direto no carrinho!';
      break;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.9 }}
        className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white border border-neutral-900 shadow-2xl p-4 select-none"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#eab308]/10 text-[#eab308] flex items-center justify-center">
            <Sparkles size={16} />
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-[#eab308] tracking-widest">
                CAMPANHA ATIVA
              </span>
              <button 
                onClick={handleClose}
                className="text-neutral-400 hover:text-black transition-colors"
                aria-label="Close promotion notice"
              >
                <X size={14} className="stroke-[3]" />
              </button>
            </div>

            <h4 className="text-xs font-black uppercase tracking-widest text-[#000] mt-1 mb-1.5 balance">
              {promotion.title}
            </h4>

            <p className="text-[10px] font-bold text-neutral-500 leading-normal uppercase">
              {offerDescription}
            </p>

            <div className="mt-3.5 flex items-center gap-1.5 text-[8px] font-black text-emerald-600 uppercase tracking-widest">
              <Check size={10} className="stroke-[3]" />
              <span>Aplicado automaticamente no Checkout</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

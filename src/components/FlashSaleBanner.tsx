import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Clock, X } from 'lucide-react';
import { getFlashSaleInfo, FlashSaleInfo } from '../lib/flashSale';

export const FlashSaleBanner: React.FC = () => {
  const [info, setInfo] = useState<FlashSaleInfo | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const update = () => {
      const newInfo = getFlashSaleInfo();
      setInfo(newInfo);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!info || !info.isActive || !isVisible) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 right-6 z-[60] max-w-[280px]"
      >
        <div className="bg-black text-white p-4 border border-[#eab308] shadow-[0_0_20px_rgba(234,179,8,0.2)] relative overflow-hidden group">
          <button 
            onClick={() => setIsVisible(false)}
            className="absolute top-2 right-2 text-white/40 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>

          {/* Background decoration */}
          <div className="absolute -right-4 -bottom-4 text-[#eab308]/10 group-hover:scale-110 transition-transform duration-700">
            <Zap size={120} />
          </div>

          <div className="flex items-center gap-3 mb-2">
            <div className="bg-[#eab308] p-2 rounded-full text-black">
              <Zap size={16} fill="currentColor" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#eab308]">Drop Relâmpago Ativo</p>
              <h3 className="text-lg font-black italic uppercase italic tracking-tighter">
                R$ {info.discountValue} OFF
              </h3>
            </div>
          </div>

          <p className="text-[9px] text-gray-400 uppercase leading-relaxed mb-4">
            Desconto automático aplicado à sua sacola. Válido apenas para produtos.
          </p>

          <div className="flex items-center justify-between pt-3 border-t border-white/10">
            <div className="flex items-center gap-2">
              <Clock size={12} className="text-[#eab308]" />
              <span className="text-xs font-mono font-bold">{formatTime(info.timeLeft)}</span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-tighter bg-[#eab308] text-black px-2 py-1">
              Limitado
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

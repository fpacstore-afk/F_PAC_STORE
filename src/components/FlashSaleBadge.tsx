import React, { useState, useEffect } from 'react';
import { getFlashSaleInfo, FlashSaleInfo } from '../lib/flashSale';
import { Timer, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { useCart } from '../hooks/useCart';

export function FlashSaleBadge() {
  const [info, setInfo] = useState<FlashSaleInfo>(getFlashSaleInfo());
  const [isVisible, setIsVisible] = useState(true);
  const { items } = useCart();

  useEffect(() => {
    const interval = setInterval(() => {
      setInfo(getFlashSaleInfo());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!info.isActive || !isVisible) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0, scale: 0.8 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 100, opacity: 0, scale: 0.8 }}
        className="fixed bottom-6 right-6 z-[100] group"
      >
        <div className="relative">
          <button 
            onClick={() => setIsVisible(false)}
            className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg"
          >
            <X size={12} />
          </button>

          <div className="bg-[#eab308] text-black p-4 pr-6 shadow-2xl flex items-center gap-4 border-2 border-black animate-blink-accent-bar">
            <div className="bg-black text-[#eab308] p-2 animate-pulse">
              <Zap size={20} fill="currentColor" />
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] italic">Drop Relâmpago Ativo</span>
                <div className="flex items-center gap-1 bg-black/10 px-1.5 py-0.5 rounded text-[9px] font-black">
                  <Timer size={10} />
                  {formatTime(info.timeLeft)}
                </div>
              </div>
              <h4 className="text-xl font-black uppercase tracking-tighter leading-none mt-1">
                R$ {Math.floor(info.discountValue)} OFF
              </h4>
              <p className="text-[8px] font-bold uppercase tracking-widest mt-1 opacity-60">Automático na sacola • Aproveite agora</p>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

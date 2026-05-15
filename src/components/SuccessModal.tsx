import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, ArrowRight, ShoppingBag, Timer, X } from 'lucide-react';

interface SuccessModalProps {
  isOpen: boolean;
  orderId: string;
  totalAmount?: number;
  onClose: () => void;
}

export const SuccessModal = ({ 
  isOpen,
  orderId, 
  totalAmount, 
  onClose
}: SuccessModalProps) => {
  const [seconds, setSeconds] = useState(15);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white max-w-md w-full p-10 shadow-3xl border border-white/10 text-center relative overflow-hidden"
          >
            {/* Close button */}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 text-black/20 hover:text-black transition-colors"
            >
              <X size={20} />
            </button>

            {/* Decorative Brand Element */}
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none select-none">
              <h1 className="text-8xl font-black italic tracking-tighter leading-none">F PAC</h1>
            </div>

            <div className="relative z-10 font-sans">
              <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/20">
                <CheckCircle size={40} />
              </div>
              
              <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none mb-4 text-black">
                Pedido<br/>Registrado!
              </h2>
              
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#eab308] mb-8">Ref: #{orderId}</p>
              
              <p className="text-sm text-gray-500 mb-8 font-medium leading-relaxed">
                Sucesso! Recebemos seu pedido. <br/>Acompanhe seu e-mail para atualizações.
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={onClose}
                  className="w-full bg-black text-white py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#eab308] hover:text-black transition-all flex items-center justify-center gap-2 group"
                >
                  <Timer size={14} className="opacity-40" />
                  <span>Voltar ao Home ({seconds}s)</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>

                <button 
                  onClick={() => window.location.href = `https://fpacstore.com.br`}
                  className="w-full bg-white border border-black/10 text-black py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-gray-50 transition-all flex items-center justify-center gap-2 group"
                >
                  <ShoppingBag size={14} className="opacity-40" />
                  <span>Ver Todos os Produtos</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle, ArrowRight } from 'lucide-react';

interface SuccessModalProps {
  orderId: string;
  totalAmount?: number;
  onAction: () => void;
  actionText?: string;
  title?: string;
  subtitle?: string;
}

export const SuccessModal = ({ 
  orderId, 
  totalAmount, 
  onAction, 
  actionText = "Acompanhar Pedido",
  title = "Pedido Processado!",
  subtitle = "Seu pagamento está sendo processado. Você receberá uma confirmação por e-mail em instantes."
}: SuccessModalProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white max-w-md w-full p-10 shadow-2xl border border-black/5 text-center relative overflow-hidden"
    >
      {/* Decorative Brand Element */}
      <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none select-none">
        <h1 className="text-8xl font-black italic tracking-tighter leading-none">F PAC</h1>
      </div>

      <div className="relative z-10">
        <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/20">
          <CheckCircle size={40} />
        </div>
        
        <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none mb-4 text-black">
          {title.split(' ').map((word, i) => (
            <React.Fragment key={i}>
              {word}
              {i === 0 && <br />}
            </React.Fragment>
          ))}
        </h2>
        
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308] mb-8">Ref: #{orderId}</p>
        
        <p className="text-sm text-gray-500 mb-10 font-medium leading-relaxed">
          {subtitle}
        </p>
        
        {totalAmount !== undefined && (
           <div className="mb-8 p-4 bg-gray-50 border border-black/5">
              <span className="text-[9px] font-black uppercase tracking-widest text-black/30 block mb-1">Total do Pedido</span>
              <span className="text-xl font-black text-black">R$ {totalAmount.toFixed(2)}</span>
           </div>
        )}
        
        <button 
          onClick={onAction}
          className="w-full bg-black text-white py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#eab308] hover:text-black transition-all flex items-center justify-center gap-2 group"
        >
          <span>{actionText}</span>
          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </motion.div>
  );
};

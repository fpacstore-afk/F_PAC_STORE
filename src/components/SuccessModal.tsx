import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ArrowRight, ShoppingBag, Timer, X, Copy, QrCode } from 'lucide-react';
import { cn } from '../lib/utils';

interface SuccessModalProps {
  isOpen: boolean;
  orderId: string;
  totalAmount?: number;
  paymentResult?: any;
  onClose: () => void;
}

export const SuccessModal = ({ 
  isOpen,
  orderId, 
  totalAmount, 
  paymentResult,
  onClose
}: SuccessModalProps) => {
  const [seconds, setSeconds] = useState(60);
  const [copied, setCopied] = useState(false);

  const pixData = paymentResult?.point_of_interaction?.transaction_data;
  const isPix = !!pixData;

  useEffect(() => {
    if (!isOpen) return;
    if (isPix) setSeconds(300); // Give more time if Pix

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
  }, [isOpen, onClose, isPix]);

  const copyPixCode = () => {
    if (pixData?.qr_code) {
      navigator.clipboard.writeText(pixData.qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/95 backdrop-blur-md"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white max-w-lg w-full p-8 md:p-12 shadow-3xl text-center relative overflow-hidden"
          >
            {/* Close button */}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 text-black/20 hover:text-black transition-colors"
            >
              <X size={20} />
            </button>

            <div className="relative z-10 font-sans">
              <div className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/20">
                <CheckCircle size={32} />
              </div>
              
              <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none mb-2 text-black">
                Pedido Registrado!
              </h2>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#eab308] mb-6">Ref: #{orderId}</p>
              
              {isPix ? (
                <div className="mb-8 space-y-6">
                  <div className="bg-gray-50 p-6 rounded-xl border border-dashed border-gray-200">
                    <p className="text-[10px] font-black uppercase tracking-widest text-black/40 mb-4">Pague agora com PIX</p>
                    
                    <div className="flex flex-col items-center gap-6">
                      {pixData.qr_code_base64 && (
                        <div className="bg-white p-4 shadow-sm border border-gray-100 rounded-lg">
                          <img 
                            src={`data:image/png;base64,${pixData.qr_code_base64}`} 
                            alt="Pix QR Code" 
                            className="w-48 h-48"
                          />
                        </div>
                      )}
                      
                      <div className="w-full">
                        <p className="text-[9px] font-bold uppercase text-gray-400 mb-2">Código Copia e Cola</p>
                        <div className="flex gap-2">
                          <input 
                            readOnly 
                            value={pixData.qr_code} 
                            className="flex-1 bg-white border border-gray-200 px-4 py-3 text-xs font-mono rounded overflow-hidden text-ellipsis"
                          />
                          <button 
                            onClick={copyPixCode}
                            className={cn(
                              "px-4 rounded transition-all flex items-center justify-center gap-2",
                              copied ? "bg-green-500 text-white" : "bg-black text-white hover:bg-[#f7c600] hover:text-black"
                            )}
                          >
                            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                            <span className="text-[9px] font-black uppercase">{copied ? 'Copiado' : 'Copiar'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase leading-relaxed">
                    A aprovação acontece em segundos após o pagamento.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-8 font-medium leading-relaxed">
                  Sucesso! Recebemos seu pedido. <br/>Acompanhe seu e-mail para as próximas atualizações.
                </p>
              )}
              
              <div className="space-y-3">
                <button 
                  onClick={onClose}
                  className="w-full bg-black text-white py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#eab308] hover:text-black transition-all flex items-center justify-center gap-2 group"
                >
                  <Timer size={14} className="opacity-40" />
                  <span>Voltar ao Início ({seconds}s)</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

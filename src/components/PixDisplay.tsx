
import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { getApiUrl } from '../lib/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';

interface PixDisplayProps {
  pixResult: any;
}

export function PixDisplay({ pixResult }: PixDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(pixResult.status || 'pending');
  const navigate = useNavigate();
  const { clearCart } = useCart();

  const qrCode = pixResult.point_of_interaction?.transaction_data?.qr_code;
  const qrCodeBase64 = pixResult.point_of_interaction?.transaction_data?.qr_code_base64;

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(getApiUrl(`/api/checkout/verify/${pixResult.external_reference}`));
        const data = await response.json();
        
        const isApproved = 
          data.paymentStatus === 'approved' || 
          data.status === 'Pagamento Aprovado' || 
          data.status === 'approved' ||
          data.status === 'payment_approved';
        
        if (isApproved) {
          setStatus('approved');
          toast.success("Pagamento confirmado!");
          clearCart();
          setTimeout(() => {
            navigate(`/order/${pixResult.external_reference}`);
          }, 1000);
          return true;
        }
      } catch (error) {
        console.error("Erro ao verificar PIX:", error);
      }
      return false;
    };

    // Check immediately
    checkStatus();

    // Then start polling
    const pollInterval = setInterval(async () => {
      const alreadyApproved = await checkStatus();
      if (alreadyApproved) {
        clearInterval(pollInterval);
      }
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [pixResult.external_reference, navigate, clearCart]);

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="bg-[#f7c600] p-1 rounded-sm">
        <div className="bg-black p-8 text-center space-y-6">
          <div className="flex flex-col items-center gap-2">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">
              {status === 'approved' ? 'Pagamento Aprovado!' : 'Pague agora com PIX'}
            </h4>
            <p className="text-[18px] font-black italic uppercase tracking-tighter text-white">
              {status === 'approved' ? 'Seu pedido entrou em produção' : 'Aprovação Imediata'}
            </p>
          </div>

          {status === 'approved' ? (
            <div className="py-12 flex flex-col items-center gap-4">
              <CheckCircle2 className="w-20 h-20 text-green-500 animate-bounce" />
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60">
                Redirecionando em instantes...
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white p-4 inline-block rounded-lg shadow-2xl mx-auto">
                <img 
                  src={qrCodeBase64 
                    ? `data:image/png;base64,${qrCodeBase64}`
                    : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode || '')}`} 
                  alt="Pix QR Code" 
                  className="w-48 h-48"
                />
              </div>

              <div className="space-y-4">
                <div className="text-left bg-white/[0.02] border border-white/5 p-6 rounded-lg">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-4 text-center">PIX Copia e Cola</p>
                  <div className="flex flex-col gap-4">
                    <div className="bg-white/5 border border-white/10 px-4 py-4 rounded text-[14px] font-mono text-white text-center break-all">
                      fpacstore@gmail.com
                    </div>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText("fpacstore@gmail.com");
                        setCopied(true);
                        toast.success("Chave PIX copiada!");
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className={cn(
                        "w-full py-4 rounded font-black uppercase text-[12px] tracking-[0.2em] transition-all",
                        copied ? "bg-green-500 text-white" : "bg-[#f7c600] text-black hover:bg-white"
                      )}
                    >
                      {copied ? "CHAVE COPIADA!" : "COPIAR CHAVE PIX"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-[#f7c600]">
                  <Loader2 className="animate-spin" size={14} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Aguardando Pagamento...</span>
                </div>
                <button 
                  onClick={() => navigate(`/order/${pixResult.external_reference}`)}
                  className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors"
                >
                  [ Ver Status do Pedido ]
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 p-6 rounded-lg text-center space-y-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 leading-relaxed">
          Enviamos uma cópia do código Pix para <span className="text-white">{pixResult.email || 'seu e-mail'}</span>. 
          O pagamento é validado automaticamente pelo sistema.
        </p>
      </div>
    </div>
  );
}

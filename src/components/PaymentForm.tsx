
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Zap, CreditCard, Loader2, Lock, ShieldCheck, AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getApiUrl } from '../lib/api';
import toast from 'react-hot-toast';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';

import { useCart } from '../hooks/useCart';

interface PaymentFormProps {
  total: number;
  items: any[];
  customerInfo: any;
  onSuccess: (result: any) => void;
  userId?: string;
  initialPaymentMethod?: 'credit_card' | 'pix';
}

export function PaymentForm({ total, items, customerInfo, onSuccess, userId, initialPaymentMethod }: PaymentFormProps) {
  const navigate = useNavigate();
  const { clearCart, checkout_session_id } = useCart();
  const cardInfoRef = useRef<any>(null);
  const sdkInitializedRef = useRef(false);
  
  const [pk, setPk] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'pix'>(initialPaymentMethod || 'credit_card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);

  // Update paymentMethod if prop changes (though it shouldn't often)
  useEffect(() => {
    if (initialPaymentMethod) {
      setPaymentMethod(initialPaymentMethod);
    }
  }, [initialPaymentMethod]);

  // 1. Fetch Configuration & Initialize SDK
  useEffect(() => {
    let mounted = true;

    const fetchConfig = async () => {
      try {
        setInitLoading(true);
        console.log("🛠️ [PaymentForm] Buscando configuração...");
        
        const response = await fetch(getApiUrl('/api/checkout/config'));
        if (!response.ok) throw new Error("Erro de comunicação com o servidor.");
        
        const data = await response.json();
        const publicKey = data.mercadopago?.publicKey;
        const pkMode = data.mercadopago?.mode;
        const atMode = data.mercadopago?.atMode;
        const compatible = data.mercadopago?.compatible;

        if (!publicKey) throw new Error("Credenciais de pagamento não configuradas.");

        if (!compatible && pkMode !== 'EMPTY' && atMode !== 'EMPTY') {
          const mismatchError = (
            <div className="text-left space-y-4">
              <p className="font-bold text-red-500">🛑 CONFLITO DE AMBIENTE DETECTADO</p>
              <div className="bg-black/20 p-4 rounded text-xs space-y-3 font-mono border border-white/10 uppercase tracking-tighter">
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/40">Frontend (PK):</span>
                  <span className="text-white">{pkMode} ({pk?.substring(0, 8)}...)</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/40">Backend (AT):</span>
                  <span className="text-white">{atMode} ({data.mercadopago?.atPrefix}...)</span>
                </div>
              </div>
              <div className="bg-[#f7c600]/10 p-4 rounded text-[10px] space-y-2 border border-[#f7c600]/20">
                <p className="font-bold text-[#f7c600]">Ação Necessária:</p>
                <p className="text-white/80 leading-relaxed uppercase">Vá no menu Settings do AI Studio &gt; Secrets e garanta que o MERCADO_PAGO_ACCESS_TOKEN seja do mesmo ambiente que sua Public Key (ambos começando com APP_USR ou ambos com TEST).</p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-white text-black py-3 rounded text-[10px] font-black uppercase tracking-widest hover:bg-[#f7c600] transition-colors"
              >
                Recarregar e Verificar Novamente
              </button>
            </div>
          );
          
          if (mounted) {
             setError(mismatchError);
             setInitLoading(false);
          }
          return;
        }

        if (mounted) {
          if (!sdkInitializedRef.current) {
            console.log(`✅ [PaymentForm] Inicializando SDK Mercado Pago (${pkMode})`);
            initMercadoPago(publicKey, { locale: 'pt-BR' });
            sdkInitializedRef.current = true;
          }
          setPk(publicKey);
          setInitLoading(false);
        }
      } catch (err: any) {
        console.error("❌ [PaymentForm] Falha na inicialização:", err);
        if (mounted) {
          setError(err.message || "Erro ao carregar gateway.");
          setInitLoading(false);
        }
      }
    };

    fetchConfig();
    return () => { mounted = false; };
  }, []);

  // 2. Optimized Handlers
  const processBackendPayment = useCallback(async (cardToken: string) => {
    setIsProcessing(true);
    setError(null);

    const extras = cardInfoRef.current || {};
    const amount = Number(total.toFixed(2));

    try {
      const payload = {
        cardToken,
        amount,
        items,
        userId: userId || null,
        payment_method_id: extras.payment_method_id,
        installments: extras.installments,
        issuer_id: extras.issuer_id,
        checkout_session_id,
        customerInfo: {
          ...customerInfo,
          identification: {
            type: 'CPF',
            number: customerInfo.cpf?.replace(/\D/g, '')
          }
        }
      };

      const response = await fetch(getApiUrl('/api/checkout/process-payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'O pagamento foi recusado.');
      }

      onSuccess(data);
    } catch (err: any) {
      console.error("❌ [PaymentForm] Erro no Backend:", err);
      const msg = err.message || "Não foi possível processar seu pagamento agora.";
      toast.error(msg);
      setError(<p className="text-red-500 font-bold uppercase text-[10px] tracking-widest">{msg}</p>);
    } finally {
      setIsProcessing(false);
    }
  }, [total, items, customerInfo, userId, onSuccess]);

  const handleCardSubmit = useCallback(async (param: any) => {
    const formData = param.formData || param;
    const token = formData?.token || formData?.id;

    if (!token) {
      toast.error("Erro ao gerar token do cartão.");
      return;
    }

    cardInfoRef.current = {
      payment_method_id: formData.payment_method_id,
      installments: formData.installments,
      issuer_id: formData.issuer_id
    };

    await processBackendPayment(token);
  }, [processBackendPayment]);

  const handlePixSubmit = async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const response = await fetch(getApiUrl('/api/checkout/process-payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(total.toFixed(2)),
          items,
          payment_method_id: 'pix',
          userId: userId || null,
          checkout_session_id,
          customerInfo: {
            ...customerInfo,
            identification: {
              type: 'CPF',
              number: customerInfo.cpf?.replace(/\D/g, '')
            }
          }
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao gerar Pix');
      
      onSuccess(data);
    } catch (err: any) {
      toast.error(err.message);
      setError(<p className="text-red-500 font-bold uppercase text-[10px] tracking-widest">{err.message}</p>);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. UI Helper Constants
  const isProduction = useMemo(() => pk?.startsWith('APP_USR'), [pk]);
  const minCCAmount = isProduction ? 5.00 : 1.00;
  const isAmountTooLowForCC = paymentMethod === 'credit_card' && total < minCCAmount;

  const brickInitialization = useMemo(() => ({
    amount: Number(total.toFixed(2)),
    payer: { email: customerInfo?.email || '' },
  }), [total, customerInfo?.email]);

  const brickCustomization = useMemo(() => ({
    visual: {
      style: {
        theme: 'dark' as const,
        customVariables: {
          formBackgroundColor: 'transparent',
          baseColor: '#ffffff',
          inputBackgroundColor: '#111111',
          inputFocusedBorderColor: '#f7c600',
        }
      }
    },
    paymentMethods: {
      minInstallments: 1,
      maxInstallments: 12
    }
  }), []);

  // 4. Render States
  if (initLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#f7c600]" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Iniciando Gateway Seguro...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Payment Selection - Hidden if initially set */}
      {!initialPaymentMethod && (
        <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-lg border border-white/10">
          <button
            onClick={() => setPaymentMethod('credit_card')}
            className={cn(
              "flex items-center justify-center gap-3 py-4 px-4 rounded-md transition-all text-[10px] font-black uppercase tracking-widest",
              paymentMethod === 'credit_card' ? "bg-white text-black" : "text-white/40 hover:text-white"
            )}
          >
            <CreditCard size={16} />
            Cartão
          </button>
          <button
            onClick={() => setPaymentMethod('pix')}
            className={cn(
              "flex items-center justify-center gap-3 py-4 px-4 rounded-md transition-all text-[10px] font-black uppercase tracking-widest",
              paymentMethod === 'pix' ? "bg-white text-black" : "text-white/40 hover:text-white"
            )}
          >
            <Zap size={16} />
            Pix
          </button>
        </div>
      )}

      {initialPaymentMethod && (
        <div className="flex items-center gap-3 px-6 py-4 bg-white/5 border border-white/10 rounded-lg">
          <div className="w-10 h-10 rounded-full bg-[#f7c600]/10 flex items-center justify-center text-[#f7c600]">
            {paymentMethod === 'pix' ? <Zap size={20} /> : <CreditCard size={20} />}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Método Selecionado</p>
            <p className="text-xs font-black uppercase tracking-tighter text-white">
              {paymentMethod === 'pix' ? 'Pagamento via PIX' : 'Cartão de Crédito'}
            </p>
          </div>
        </div>
      )}

      {error ? (
        <div className="p-8 bg-red-500/5 border border-red-500/20 rounded-lg text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <div className="text-white/80">{error}</div>
        </div>
      ) : (
        <>
          {paymentMethod === 'credit_card' ? (
            <div className="card-payment-container border border-white/5 rounded-lg">
              {isAmountTooLowForCC ? (
                <div className="p-10 text-center space-y-6">
                   <AlertCircle className="w-12 h-12 text-[#f7c600] mx-auto opacity-50" />
                   <p className="text-[10px] font-black uppercase tracking-widest text-white leading-relaxed">
                     O valor mínimo para Cartão em PRODUÇÃO é R$ {minCCAmount.toFixed(2)}.<br/>
                     Seu total atual é R$ {total.toFixed(2)}.
                   </p>
                   <button 
                     onClick={() => setPaymentMethod('pix')}
                     className="w-full py-4 bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-[#f7c600] transition-colors"
                   >
                     Mudar para Pix
                   </button>
                </div>
              ) : (
                <CardPayment
                  initialization={brickInitialization}
                  customization={brickCustomization}
                  onSubmit={handleCardSubmit}
                  onReady={() => console.log("✅ Card Brick Ready")}
                  onError={(err) => console.error("❌ Brick Error:", err)}
                />
              )}
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="p-8 bg-white/5 border border-white/10 rounded-lg text-center space-y-6">
                  <div className="w-16 h-16 bg-[#f7c600]/10 rounded-full flex items-center justify-center mx-auto border border-[#f7c600]/20">
                     <Zap className="text-[#f7c600]" size={32} />
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f7c600]">Pagamento Instantâneo via PIX</h4>
                    <p className="text-[11px] text-white/40 uppercase tracking-widest leading-relaxed">
                      Ao clicar no botão abaixo, geraremos um QR Code exclusivo para o seu pedido.
                      O pagamento é confirmado na hora e seu pedido entra em produção imediatamente.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                    <div className="text-left space-y-1">
                      <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Vantagem 01</p>
                      <p className="text-[9px] font-bold text-white/60 uppercase">Aprovação Instantânea</p>
                    </div>
                    <div className="text-left space-y-1">
                      <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Vantagem 02</p>
                      <p className="text-[9px] font-bold text-white/60 uppercase">Reserva Imediata</p>
                    </div>
                  </div>
               </div>
               
               <button
                  onClick={handlePixSubmit}
                  disabled={isProcessing}
                  className="w-full py-5 bg-[#f7c600] text-black text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 hover:bg-white transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(247,198,0,0.2)]"
               >
                  {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={16} />}
                  {isProcessing ? "Gerando QR Code..." : `Finalizar Pedido R$ ${total.toFixed(2)}`}
               </button>
            </div>
          )}
        </>
      )}

    {/* Trust Badges */}
      <div className="pt-8 border-t border-white/10 flex flex-col items-center gap-6">
        <div className="flex items-center gap-2 text-white/20">
          <ShieldCheck size={14} className="text-[#f7c600]" />
          <span className="text-[8px] font-black uppercase tracking-[0.15em]">Checkout Seguro Mercado Pago</span>
        </div>
        <div className="flex items-center gap-6 opacity-30 invert">
          <img src="https://static.mlstatic.com/org-img/checkout/custom/cards-logos/visa.svg" className="h-3" alt="Visa" />
          <img src="https://static.mlstatic.com/org-img/checkout/custom/cards-logos/mastercard.svg" className="h-3" alt="Master" />
          <img src="https://static.mlstatic.com/org-img/checkout/custom/cards-logos/pix.svg" className="h-3" alt="Pix" />
        </div>
      </div>
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import { 
  Zap, CreditCard, Loader2, Lock, ShieldCheck, AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getApiUrl } from '../lib/api';
import toast from 'react-hot-toast';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';

interface PaymentFormProps {
  total: number;
  items: any[];
  customerInfo: any;
  onSuccess: (result: any) => void;
  userId?: string;
}

export function PaymentForm({ total, items, customerInfo, onSuccess, userId }: PaymentFormProps) {
  const [pk, setPk] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'pix'>('credit_card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Initialize SDK with Public Key from Server
  useEffect(() => {
    let mounted = true;
    const fetchConfig = async () => {
      try {
        console.log("🛠️ [MP] Fetching configuration...");
        const response = await fetch(getApiUrl('/api/checkout/config'));
        if (!response.ok) throw new Error("Falha ao carregar configuração de pagamento.");
        
        const data = await response.json();
        const publicKey = data.mercadopago?.publicKey;
        
        if (!publicKey) throw new Error("Chave pública não encontrada.");
        
        if (mounted) {
          console.log("✅ [MP] SDK Initializing with PK:", publicKey.substring(0, 12) + "...");
          initMercadoPago(publicKey, { locale: 'pt-BR' });
          setPk(publicKey);
          setInitLoading(false);
        }
      } catch (err: any) {
        console.error("❌ [MP] Initialization failed:", err);
        if (mounted) {
          setError(err.message || "Erro ao inicializar gateway de pagamento.");
          setInitLoading(false);
        }
      }
    };

    fetchConfig();
    return () => { mounted = false; };
  }, []);

  // 2. Handle Backend Submission
  const processBackendPayment = async (checkoutPayload: any) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      console.log("🛰️ [Checkout] Submitting to backend...", {
        hasToken: !!checkoutPayload.token,
        tokenLength: checkoutPayload.token?.length,
        method: checkoutPayload.payment_method_id,
        allKeys: Object.keys(checkoutPayload)
      });
      const response = await fetch(getApiUrl('/api/checkout/process-payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...checkoutPayload,
          items,
          customerInfo,
          userId: userId || null
        }),
        signal: AbortSignal.timeout(45000)
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.diagnosis?.mismatch) {
          throw new Error(`Conflito de Credenciais: A Public Key é ${result.diagnosis.pkMode} mas o Access Token é ${result.diagnosis.atMode}. Ambas devem ser do mesmo tipo (Sandbox vs Produção).`);
        }
        throw new Error(result.message || result.error || "Erro ao processar pagamento.");
      }

      console.log("🎉 [Checkout] Process completed successfully");
      onSuccess(result);
    } catch (err: any) {
      console.error("❌ [Checkout] Backend Error:", err);
      const msg = err.message || "Ocorreu um erro inesperado no processamento.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Card Brick Handlers
  const handleCardSubmit = async (param: any) => {
    // The Brick might return the data directly or wrapped in a formData object
    const cardFormData = param.formData || param;
    
    console.log("🔐 [MP-BRICK] onSubmit data received:", {
      paramKeys: Object.keys(param),
      hasFormData: !!param.formData,
      token: cardFormData?.token ? '***' + String(cardFormData.token).slice(-4) : 'MISSING',
      method: cardFormData?.payment_method_id,
      amount: cardFormData?.transaction_amount
    });

    if (!cardFormData || !cardFormData.token) {
      console.error("❌ [MP-BRICK] Critical Error: Token is missing in brick response.", cardFormData);
      setError("Erro de segurança: Token do cartão não foi gerado. Por favor, revise os dados do cartão.");
      return;
    }

    const payload = {
      token: cardFormData.token,
      issuer_id: String(cardFormData.issuer_id || ''),
      payment_method_id: cardFormData.payment_method_id,
      transaction_amount: Number(cardFormData.transaction_amount || total),
      installments: Number(cardFormData.installments || 1),
      payer: {
        email: cardFormData.payer?.email || customerInfo.email,
        identification: cardFormData.payer?.identification || {
          type: 'CPF',
          number: customerInfo.cpf?.replace(/\D/g, '')
        }
      }
    };

    console.log("🛰️ [MP-BRICK] Sending to backend:", {
      ...payload,
      token: '***' + String(payload.token).slice(-4)
    });

    await processBackendPayment(payload);
  };

  const handlePixSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      transaction_amount: Number(total.toFixed(2)),
      payment_method_id: 'pix',
      payer: {
        email: customerInfo.email,
        identification: {
          type: 'CPF',
          number: customerInfo.cpf?.replace(/\D/g, '')
        }
      }
    };
    await processBackendPayment(payload);
  };

  if (initLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#f7c600]" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Iniciando Checkout Seguro...</p>
      </div>
    );
  }

  if (error && !pk) {
    return (
      <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-lg text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
        <h3 className="text-white font-bold">Erro de Configuração</h3>
        <p className="text-white/60 text-sm">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-white text-black text-xs font-bold uppercase rounded-full"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Payment Method Selector */}
      <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-lg border border-white/10">
        <button
          onClick={() => setPaymentMethod('credit_card')}
          className={cn(
            "flex items-center justify-center gap-3 py-3 px-4 rounded-md transition-all text-[10px] font-black uppercase tracking-widest",
            paymentMethod === 'credit_card' ? "bg-white text-black" : "text-white/40 hover:text-white"
          )}
        >
          <CreditCard size={16} />
          Cartão
        </button>
        <button
          onClick={() => setPaymentMethod('pix')}
          className={cn(
            "flex items-center justify-center gap-3 py-3 px-4 rounded-md transition-all text-[10px] font-black uppercase tracking-widest",
            paymentMethod === 'pix' ? "bg-white text-black" : "text-white/40 hover:text-white"
          )}
        >
          <Zap size={16} />
          Pix
        </button>
      </div>

      {paymentMethod === 'credit_card' ? (
        <div className="card-payment-container bg-transparent rounded-lg overflow-hidden border border-white/5">
          <CardPayment
            initialization={{
              amount: Number(total.toFixed(2)),
              payer: {
                email: customerInfo.email,
              }
            }}
            customization={{
              visual: {
                style: {
                  theme: 'dark',
                  customVariables: {
                    formBackgroundColor: 'transparent',
                    baseColor: '#ffffff',
                    formInputsTextSize: '14px',
                    inputBackgroundColor: '#111111',
                    inputBorderWidth: '1px',
                    inputVerticalPadding: '14px',
                    inputHorizontalPadding: '14px',
                    inputFocusedBorderColor: '#f7c600',
                  }
                }
              },
              paymentMethods: {
                minInstallments: 1,
                maxInstallments: 12
              }
            }}
            onSubmit={handleCardSubmit}
            onReady={() => console.log("✅ [MP-Brick] Card Brick is ready")}
            onError={(err) => {
              console.error("❌ [MP-Brick] Error:", err);
              toast.error("Erro no módulo de pagamentos. Verifique os dados.");
            }}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="p-8 bg-white/5 border border-white/10 text-center space-y-4 rounded-lg">
             <div className="w-16 h-16 bg-[#00bfa5]/10 rounded-full flex items-center justify-center mx-auto">
               <Zap className="text-[#00bfa5]" size={32} />
             </div>
             <div>
               <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Pagamento via Pix</h4>
               <p className="text-[9px] text-white/40 uppercase tracking-widest mt-1">Liberação imediata após o pagamento</p>
             </div>
             <p className="text-[9px] text-white/60 max-w-[240px] mx-auto leading-relaxed">O QR Code será gerado no próximo passo e você poderá pagar usando qualquer aplicativo de banco.</p>
          </div>

          <button
            onClick={handlePixSubmit}
            disabled={isProcessing}
            className="w-full py-5 bg-[#f7c600] text-black text-[12px] font-black uppercase tracking-[0.4em] flex items-center justify-center gap-3 hover:bg-white transition-all disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Gerando Pix...
              </>
            ) : (
              <>
                <Lock size={16} />
                Gerar QR Code Pix • R$ {total.toFixed(2)}
              </>
            )}
          </button>
        </div>
      )}

      {/* Security Badges */}
      <div className="flex flex-col items-center gap-6 pt-4 border-t border-white/10">
        <div className="flex items-center gap-3 text-white/40">
           <ShieldCheck size={14} className="text-[#f7c600]" />
           <span className="text-[9px] font-black uppercase tracking-widest">Ambiente 100% Seguro & Criptografado</span>
        </div>
        <div className="flex items-center justify-center gap-8 opacity-20 filter grayscale">
           <img src="https://static.mlstatic.com/org-img/checkout/custom/cards-logos/visa.svg" className="h-4" alt="Visa" />
           <img src="https://static.mlstatic.com/org-img/checkout/custom/cards-logos/mastercard.svg" className="h-4" alt="Mastercard" />
           <img src="https://static.mlstatic.com/org-img/checkout/custom/cards-logos/elo.svg" className="h-4" alt="Elo" />
           <img src="https://static.mlstatic.com/org-img/checkout/custom/cards-logos/pix.svg" className="h-4" alt="Pix" />
        </div>
      </div>
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const cardInfoRef = React.useRef<any>(null);
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

  // 2. Handle Backend Submission (Strictly following user requested structure)
  const processBackendPayment = async (cardToken: string) => {
    if (!cardToken || cardToken === 'undefined') {
      throw new Error('Card Token not found');
    }

    setIsProcessing(true);
    setError(null);

    try {
      const amount = Number(total.toFixed(2));
      const customer = {
        ...customerInfo,
        identification: {
          type: 'CPF',
          number: customerInfo.cpf?.replace(/\D/g, '')
        }
      };

      // Get extras from ref
      const extras = cardInfoRef.current || {};

      console.log("🛰️ [Checkout] Submitting to backend...", {
        cardToken: '***' + String(cardToken).slice(-4),
        amount,
        method: extras.payment_method_id,
        customerEmail: customer.email
      });

      const response = await fetch(getApiUrl('/api/checkout/process-payment'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardToken, // Matching user requested field
          amount,
          customer,
          // Mandatory extras for functional payment
          payment_method_id: extras.payment_method_id,
          installments: extras.installments,
          issuer_id: extras.issuer_id,
          items,
          userId: userId || null
        }),
      });

      const data = await response.json();
      console.log('PAYMENT RESPONSE:', data);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || 'Payment failed');
      }

      onSuccess(data);
      return data;
    } catch (err: any) {
      console.error("❌ [Checkout] Backend Error:", err);
      const msg = err.message || "Ocorreu um erro inesperado no processamento.";
      setError(msg);
      toast.error(msg);
      throw err; 
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Card Brick Handlers (Following user structure logic)
  const handleCardSubmit = async (param: any) => {
    try {
      setIsProcessing(true);
      setError(null);

      console.log('🔐 [Checkout] Iniciando processamento do cartão...');

      // In Bricks, the token is already in the param (formData)
      // We label it "tokenResponse" to match user's conceptual flow
      const tokenResponse = param.formData || param;
      
      console.log('TOKEN RESPONSE:', {
        ...tokenResponse,
        token: tokenResponse?.token ? '***' + String(tokenResponse.token).slice(-4) : 'MISSING'
      });

      const cardToken = 
        tokenResponse?.id || 
        tokenResponse?.token || 
        tokenResponse?.cardToken;

      console.log('CARD TOKEN OBTAINED:', cardToken ? 'SUCCESS' : 'FAILURE');

      if (!cardToken || String(cardToken) === 'undefined' || String(cardToken) === 'null') {
        throw new Error('Não foi possível gerar o token do cartão. Por favor, revise os dados.');
      }

      // Store extras in ref to be combined in processBackendPayment
      cardInfoRef.current = {
        payment_method_id: tokenResponse?.payment_method_id,
        installments: tokenResponse?.installments,
        issuer_id: tokenResponse?.issuer_id
      };

      await processBackendPayment(cardToken);
    } catch (error: any) {
      console.error('CHECKOUT ERROR:', error);
      // Toast and error state handled in processBackendPayment
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePixSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);
    
    try {
      const amount = Number(total.toFixed(2));
      const customer = {
        ...customerInfo,
        identification: {
          type: 'CPF',
          number: customerInfo.cpf?.replace(/\D/g, '')
        }
      };

      const response = await fetch(getApiUrl('/api/checkout/process-payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          customer,
          items,
          payment_method_id: 'pix',
          userId: userId || null
        }),
        signal: AbortSignal.timeout(45000)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Erro ao gerar Pix');

      onSuccess(data);
    } catch (err: any) {
      console.error("❌ [Pix] Error:", err);
      toast.error(err.message || "Erro ao gerar pagamento Pix.");
    } finally {
      setIsProcessing(false);
    }
  };

  const isProduction = pk?.startsWith('APP_USR');
  const minCCAmount = isProduction ? 5.00 : 1.00;
  const isAmountTooLowForCC = paymentMethod === 'credit_card' && total < minCCAmount;

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
          {isAmountTooLowForCC ? (
            <div className="p-8 bg-[#f7c600]/5 border border-[#f7c600]/20 rounded-lg text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-[#f7c600] mx-auto" />
              <div className="space-y-2">
                <h3 className="text-white text-xs font-black uppercase tracking-widest">Valor Mínimo via Cartão</h3>
                <p className="text-white/60 text-[10px] uppercase tracking-wider leading-relaxed">
                  Para pagamentos com Cartão em modo real, o valor mínimo é de <span className="text-[#f7c600]">R$ {minCCAmount.toFixed(2)}</span>.
                </p>
                <p className="text-white/40 text-[9px] uppercase tracking-widest">
                  Valor atual: R$ {total.toFixed(2)}
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={() => setPaymentMethod('pix')}
                  className="w-full py-4 bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-[#f7c600] transition-colors"
                >
                  Usar Pix (Mínimo R$ 1.00)
                </button>
                <button 
                  onClick={() => navigate('/bag')}
                  className="w-full py-4 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-colors"
                >
                  Adicionar mais itens
                </button>
              </div>
            </div>
          ) : (
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
                const msg = err?.message || "";
                if (msg.includes("amount")) {
                  toast.error("Valor abaixo do mínimo permitido pelo Mercado Pago.");
                } else {
                  toast.error("Erro no módulo de pagamentos. Verifique as credenciais.");
                }
              }}
            />
          )}
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

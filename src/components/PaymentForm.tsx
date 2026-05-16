import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, Loader2, Lock, Check, Zap, CreditCard as CardIcon, RefreshCcw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getApiUrl } from '../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// Mercado Pago SDK loaded via script in index.html
declare const MercadoPago: any;

interface PaymentFormProps {
  total: number;
  items: any[];
  customerInfo: any;
  shipping: number;
  discounts: number;
  onSuccess: (orderId: string) => void;
  userId?: string;
  paymentMethod?: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD';
}

export function PaymentForm({ total, items, customerInfo, shipping, discounts, onSuccess, paymentMethod }: PaymentFormProps) {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const brickInstance = useRef<any>(null);
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const [mpInitialized, setMpInitialized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const initializationAttempted = useRef(false);

  // 1. Carregar Configuração do Backend
  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("📡 [PAYMENT] Carregando configurações...");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); 

      const resp = await fetch(getApiUrl('/api/checkout/config'), { 
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      clearTimeout(timeoutId);

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(`Falha no servidor: ${resp.status}${data.details ? ` - ${data.details}` : ''}`);
      }
      
      if (!data.mercadopago?.publicKey) {
        throw new Error("Chave pública do Mercado Pago não configurada.");
      }
      
      setConfig(data);
    } catch (e: any) {
      console.error("❌ [PAYMENT] Erro ao carregar config:", e);
      setError(e.name === 'AbortError' ? "Tempo esgotado." : (e.message || "Erro de conexão."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    return () => {
      if (brickInstance.current) {
        console.log("🧹 [MP] Unmounting Brick...");
        brickInstance.current.unmount();
      }
    };
  }, []);

    // 2. Inicializar Bricks do Mercado Pago
  useEffect(() => {
    if (!config?.mercadopago?.publicKey || loading || !brickContainerRef.current) {
      return;
    }

    const initMP = async () => {
      // Cleanup previous instance if exists before starting new one
      if (brickInstance.current) {
        console.log("🧹 [MP] Unmounting previous instance before re-init...");
        try {
          // Force cleanup of the ref and state to allow fresh start
          initializationAttempted.current = false;
          await brickInstance.current.unmount();
        } catch (e) {
          console.warn("⚠️ [MP] Cleanup warning:", e);
        }
        brickInstance.current = null;
        setMpInitialized(false);
      }
      
      if (initializationAttempted.current) {
        console.log("⏳ [MP] Initialization already in progress, skipping...");
        return;
      }
      
      initializationAttempted.current = true;

      try {
        if (typeof MercadoPago === 'undefined') {
          console.warn("⚠️ [MP] SDK not found in window, retrying...");
          initializationAttempted.current = false;
          return;
        }

        console.log(`🛠️ [MP] Initializing Brick... Amount: ${total}, Method: ${paymentMethod}`);
        const mp = new MercadoPago(config.mercadopago.publicKey, { 
          locale: 'pt-BR',
          trackingId: 'fpac_store'
        });
        const bricksBuilder = mp.bricks();

        const amount = Number(total.toFixed(2));
        if (isNaN(amount) || amount <= 0) {
          throw new Error("Valor total inválido para pagamento.");
        }

        const settings = {
          initialization: {
            amount: amount,
            paymentMethodId: paymentMethod === 'PIX' ? 'pix' : undefined,
            payer: {
              firstName: customerInfo.name.split(' ')[0] || 'Cliente',
              lastName: customerInfo.name.split(' ').slice(1).join(' ') || 'F PAC',
              email: (customerInfo.email || 'atendimento@fpacstore.com.br').toLowerCase(),
              identification: (customerInfo.cpf && customerInfo.cpf.replace(/\D/g, '').length === 11) ? {
                type: 'CPF',
                number: customerInfo.cpf.replace(/\D/g, '')
              } : undefined
            },
          },
          customization: {
            visual: {
              hideStatusScreen: true,
              preserveStack: true,
              style: { 
                theme: 'dark',
                customVariables: {
                  colorPrimary: '#f7c600',
                }
              },
            },
            paymentMethods: {
              bankTransfer: paymentMethod === 'PIX' ? ['pix'] : undefined,
              creditCard: paymentMethod === 'CREDIT_CARD' ? 'all' : undefined,
              ticket: undefined,
              debitCard: undefined,
              mercadoPago: undefined,
              maxInstallments: paymentMethod === 'PIX' ? 1 : 12
            },
          },
          callbacks: {
            onReady: () => {
              console.log("✅ [MP] Brick Ready.");
              setMpInitialized(true);
              initializationAttempted.current = false;
              setError(null);
            },
            onSubmit: async (brickData: any) => {
              if (isProcessing) {
                console.log("⏳ [MP] Já processando uma transação, ignorando clique duplo.");
                return;
              }

              const { formData } = brickData;
              console.log("📤 [MP] onSubmit triggered. Method:", paymentMethod);
              console.log("PIX FORM DATA:", formData);
              
              setIsProcessing(true);
              
              try {
                // Determine the correct amount to send
                const finalAmount = Number(formData?.transaction_amount || total.toFixed(2));
                
                // Sanitize issuer_id and other fields
                const issuerId = (formData?.issuer_id === 'undefined' || formData?.issuer_id === 'null' || !formData?.issuer_id) ? null : formData.issuer_id;
                
                // Construct robust payer object
                const nameParts = (customerInfo.name || "Cliente F PAC").trim().split(/\s+/);
                const firstName = nameParts[0] || "Cliente";
                const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "F PAC";

                const cleanCpf = (formData?.payer?.identification?.number || customerInfo.cpf || "").replace(/\D/g, "");
                
                const payer = {
                  email: (formData?.payer?.email || customerInfo.email || "atendimento@fpacstore.com.br").trim().toLowerCase(),
                  first_name: formData?.payer?.first_name || firstName,
                  last_name: formData?.payer?.last_name || lastName,
                  identification: cleanCpf.length >= 11 ? {
                    type: cleanCpf.length === 14 ? "CNPJ" : "CPF",
                    number: cleanCpf
                  } : undefined
                };

                console.log("PIX PAYER:", payer);

                const payload: any = { 
                  ...formData,
                  issuer_id: issuerId,
                  transaction_amount: finalAmount,
                  payment_method_id: paymentMethod === 'PIX' ? 'pix' : (formData?.payment_method_id || 'pix'),
                  payer, 
                  items, 
                  customerInfo: {
                    ...customerInfo,
                    cpf: customerInfo.cpf?.replace(/\D/g, '')
                  },
                  shipping, 
                  discounts, 
                  userId: user?.uid 
                };

                // Remove token if it's PIX as it can sometimes cause unintended behavior in some API versions
                if (paymentMethod === 'PIX') {
                  delete payload.token;
                }
                
                console.log("PIX REQUEST (REDACTED):", { 
                   ...payload, 
                   token: payload.token ? '***' : null,
                   point_of_interaction: undefined 
                });
                
                const response = await fetch(getApiUrl('/api/checkout/mercadopago/process-payment'), {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                  },
                  body: JSON.stringify(payload),
                });
                
                const result = await response.json().catch(() => ({ error: 'Resposta inválida do servidor' }));
                
                console.log("MP RESULT:", result);

                if (!response.ok || result.error) {
                  console.error("❌ [MP] Server error response:", result);
                  
                  // Extract detailed message if available
                  let errorMsg = result.message || result.error || "Erro ao processar pagamento.";
                  if (result.mp_error && Array.isArray(result.mp_error)) {
                    const firstErr = result.mp_error[0];
                    if (firstErr?.description) {
                       errorMsg = `Gateway: ${firstErr.description}`;
                    }
                  } else if (result.mp_error?.message) {
                     errorMsg = `Gateway: ${result.mp_error.message}`;
                  }
                  
                  toast.error(errorMsg, { duration: 6000 });
                  setIsProcessing(false);
                } else if (result.status === 'rejected' && (!result.point_of_interaction?.transaction_data)) {
                  console.warn("⚠️ [MP] Payment rejected by gateway:", result);
                  toast.error("Pagamento recusado. Verifique os dados ou tente outro cartão.", { duration: 5000 });
                  setIsProcessing(false);
                } else {
                  console.log("🎉 [MP] Success!", result.id);
                  onSuccess(result);
                }
              } catch (err: any) {
                console.error("❌ [MP] Runtime error in onSubmit:", err);
                toast.error(`Falha técnica: ${err.message || 'Erro desconhecido'}`);
                setIsProcessing(false);
              }
            },
            onError: (err: any) => {
              console.error("❌ [MP] Brick Fatal Error:", JSON.stringify(err, null, 2));
              // Check for specific communication errors
              let msg = "Erro de comunicação com Mercado Pago.";
              if (err?.message?.includes('communication_error')) {
                msg = "Falha na comunicação com o servidor de pagamentos (400). Verifique se os dados do cliente estão corretos.";
              } else if (err?.message) {
                msg = `Erro no módulo: ${err.message}`;
              }
              setError(msg);
              initializationAttempted.current = false;
            },
          },
        };

        if (brickContainerRef.current) {
          brickContainerRef.current.innerHTML = '';
          brickInstance.current = await bricksBuilder.create('payment', 'paymentBrick_container', settings);
        }
      } catch (err: any) {
        console.error("❌ [MP] Init Crash:", err);
        setError(`Falha ao iniciar: ${err.message}`);
        initializationAttempted.current = false;
      }
    };

    const timer = setTimeout(initMP, 800);
    return () => {
      clearTimeout(timer);
      initializationAttempted.current = false;
    };
  }, [config, total, loading, paymentMethod]);

  // Se estiver carregando a configuração inicial
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-[#f7c600]" size={40} />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 animate-pulse text-center">
          Iniciando ambiente de pagamento seguro...
        </p>
      </div>
    );
  }

  // Se houver um erro de conexão ou configuração
  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 p-8 rounded text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
             <RefreshCcw className="text-red-500" size={24} />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">Ops! Algo deu errado</p>
          <p className="text-white/60 text-xs font-medium">{error}</p>
        </div>
        <button 
          onClick={() => { initializationAttempted.current = false; loadConfig(); }}
          className="px-6 py-3 bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-[#f7c600] transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Status Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">Pagamento Seguro</h3>
            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-1">
              Método: <span className="text-white">{paymentMethod === 'PIX' ? 'PIX (5% OFF Aplicado)' : 'Cartão de Crédito'}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded">
            <ShieldCheck size={10} className="text-green-500" />
            <span className="text-[8px] font-black uppercase tracking-widest text-green-500">Checkout Travado</span>
          </div>
        </div>
      </div>

      {/* Main Payment Area */}
      <div className="p-1 rounded-lg border-2 border-[#f7c600] bg-black/40 shadow-[0_0_50px_-20px_rgba(247,198,0,0.3)] relative min-h-[500px]">
        {/* Branding Overlay */}
        <div className="absolute -top-3 left-6 px-4 py-1 flex items-center gap-2 bg-[#f7c600] border border-[#d4a800] text-black rounded-full shadow-lg z-20">
          <Zap size={10} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Mercado Pago Transparent</span>
        </div>

        {/* MP Container */}
        <div id="paymentBrick_container" ref={brickContainerRef} className="p-2 md:p-4" />

        {!mpInitialized && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center py-24 gap-4 bg-black/40 backdrop-blur-sm z-10 transition-opacity">
            <Loader2 className="animate-spin text-[#f7c600]" size={32} />
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#f7c600] animate-pulse">
              Sincronizando com Mercado Pago...
            </p>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-6">
            <Loader2 className="animate-spin text-[#f7c600]" size={48} />
            <div className="text-center space-y-2">
              <p className="text-sm font-black uppercase tracking-[0.3em] text-white">Processando Transação</p>
              <p className="text-[9px] font-medium text-white/40 uppercase tracking-widest">Aguarde, não feche esta página...</p>
            </div>
          </div>
        )}
      </div>

      {/* Security Features Wrapper */}
      <div className="space-y-6 pt-4 border-t border-white/5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col items-center gap-2 group cursor-help">
            <div className="p-2 bg-white/5 rounded-lg border border-white/5 group-hover:border-[#f7c600]/30 transition-colors">
              <Lock size={14} className="text-[#f7c600]" />
            </div>
            <span className="text-[7px] font-black uppercase tracking-widest text-white/40 text-center">SSL 256 BITS</span>
          </div>
          <div className="flex flex-col items-center gap-2 group cursor-help">
            <div className="p-2 bg-white/5 rounded-lg border border-white/5 group-hover:border-[#f7c600]/30 transition-colors">
              <ShieldCheck size={14} className="text-[#f7c600]" />
            </div>
            <span className="text-[7px] font-black uppercase tracking-widest text-white/40 text-center">ANTI-FRAUDE</span>
          </div>
          <div className="flex flex-col items-center gap-2 group cursor-help">
            <div className="p-2 bg-white/5 rounded-lg border border-white/5 group-hover:border-[#f7c600]/30 transition-colors">
              <CardIcon size={14} className="text-[#f7c600]" />
            </div>
            <span className="text-[7px] font-black uppercase tracking-widest text-white/40 text-center">DADOS PROTEGIDOS</span>
          </div>
          <div className="flex flex-col items-center gap-2 group cursor-help">
            <div className="p-2 bg-white/5 rounded-lg border border-white/5 group-hover:border-[#f7c600]/30 transition-colors">
              <Check size={14} className="text-[#f7c600]" />
            </div>
            <span className="text-[7px] font-black uppercase tracking-widest text-white/40 text-center">COMPRA GARANTIDA</span>
          </div>
        </div>

        {/* Mercado Pago Trust Logo */}
        <div className="flex items-center justify-center gap-3 pt-4 opacity-40 hover:opacity-100 transition-opacity duration-300">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/60">Powered by</span>
          <img 
            src="https://logodownload.org/wp-content/uploads/2019/06/mercado-pago-logo.png" 
            alt="Mercado Pago" 
            className="h-3 md:h-4 w-auto grayscale brightness-200"
          />
        </div>
      </div>
    </div>
  );
}

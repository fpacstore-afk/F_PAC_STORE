import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, Loader2, Lock, Check, Zap, CreditCard as CardIcon, RefreshCcw, 
  Smartphone, Shield
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
  onSuccess: (result: any) => void;
  userId?: string;
  paymentMethod?: string;
}

export function PaymentForm({ total, items, customerInfo, onSuccess, userId }: PaymentFormProps) {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const isMounting = useRef(false);
  const brickInstance = useRef<any>(null);
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mpReady, setMpReady] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const brickContainerId = "mercadopago_brick_container";

  useEffect(() => {
    console.log("📍 [PaymentForm] Total Updated:", total);
  }, [total]);

  // 1. Fetch config from server with retry
  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 2;

    const fetchConfig = async () => {
      try {
        if (!mounted) return;
        setLoading(true);
        setError(null);
        
        // 1. Check if MercadoPago script is loaded
        if (typeof MercadoPago === 'undefined') {
          console.warn("⚠️ [PAYMENT] MercadoPago SDK not found. Retrying in 1s...");
          await new Promise(r => setTimeout(r, 1000));
          if (typeof MercadoPago === 'undefined') {
            throw new Error("SDK do Mercado Pago não carregou. Verifique se há bloqueadores de anúncios ativos.");
          }
        }

        console.log(`📡 [PAYMENT] Fetching configuration (Attempt ${retryCount + 1})...`);
        const apiUrl = getApiUrl('/api/checkout/config');
        
        const response = await fetch(apiUrl, {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`Servidor retornou erro ${response.status}`);
        }
        
        const data = await response.json();
        const pk = data?.mercadopago?.publicKey;
        
        if (pk) {
          if (mounted) setConfig(data.mercadopago);
          console.log("✅ [PAYMENT] Config loaded successfully");
        } else {
          throw new Error("Chave pública não encontrada na resposta do servidor.");
        }
      } catch (err: any) {
        console.error(`❌ [PAYMENT] Config error (Attempt ${retryCount + 1}):`, err);
        
        if (retryCount < maxRetries && mounted) {
          retryCount++;
          setTimeout(fetchConfig, 1000);
        } else if (mounted) {
          setError(`Falha ao carregar configurações de pagamento: ${err.message}. Verifique sua conexão e tente novamente.`);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchConfig();
    return () => { mounted = false; };
  }, []);

  // 2. Initialize Payment Brick
  useEffect(() => {
    if (!config || !brickContainerRef.current || typeof MercadoPago === 'undefined') return;

    let mounted = true;

    const initBrick = async () => {
      if (isMounting.current) return;
      isMounting.current = true;
      setMpReady(false);
      setError(null);

      try {
        console.log("🛠️ [MP] Initializing Payment Brick...");
        
        // Strict cleanup
        const container = document.getElementById(brickContainerId);
        if (container) {
          container.innerHTML = '';
        }

        const mp = new MercadoPago(config.publicKey, { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        const settings = {
          initialization: {
            amount: Number(total),
            payer: {
              firstName: customerInfo.name.split(' ')[0],
              lastName: customerInfo.name.split(' ').slice(1).join(' ') || 'F PAC',
              email: customerInfo.email,
              identification: customerInfo.cpf ? {
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
              }
            },
            paymentMethods: {
              creditCard: 'all',
              bankTransfer: ['pix'],
              maxInstallments: 12
            }
          },
          callbacks: {
            onReady: () => {
              console.log("✅ [MP] Brick callback: onReady");
              if (mounted) {
                setMpReady(true);
                isMounting.current = false;
              }
            },
            onPaymentMethodSelected: (paymentMethod: any) => {
              console.log("📍 [MP] Method Selected:", paymentMethod);
              setSelectedMethod(paymentMethod);
            },
            onSubmit: async ({ selectedPaymentMethod, formData }: any) => {
              console.log("📤 [MP] Submit triggered. Method:", selectedPaymentMethod);
              console.log("📦 [MP] FormData Payload:", JSON.stringify(formData));
              
              if (!mounted) return;
              setIsProcessing(true);
              
              try {
                const payload = {
                  ...formData,
                  transaction_amount: total,
                  items,
                  customerInfo,
                  userId: userId || user?.uid,
                  payment_method_id: formData.payment_method_id || selectedPaymentMethod
                };

                const response = await fetch(getApiUrl('/api/checkout/process-payment'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (!response.ok) {
                  const errorMsg = result.message || result.error || "Erro no processamento.";
                  console.error("❌ [MP] Backend error:", result);
                  throw new Error(errorMsg);
                }

                console.log("🎉 [MP] Payment successful");
                onSuccess(result);
              } catch (err: any) {
                  console.error("❌ [MP] Process catch:", err);
                  toast.error(err.message || "Erro ao processar pagamento. Verifique os dados e tente novamente.");
                  setIsProcessing(false);
              }
            },
            onError: (error: any) => {
              console.error("❌ [MP] Brick callback: onError", error);
              if (mounted) {
                setError("Ocorreu um erro no módulo do Mercado Pago. Recarregue a página.");
                isMounting.current = false;
              }
            }
          }
        };

        if (mounted) {
          brickInstance.current = await bricksBuilder.create('payment', brickContainerId, settings);
          console.log("✨ [MP] Brick Instance created");
        }
        
      } catch (err) {
        console.error("❌ [MP] Init exception:", err);
        if (mounted) {
          setError("Falha ao inicializar o checkout.");
          isMounting.current = false;
        }
      }
    };

    const timer = setTimeout(initBrick, 150);

    return () => {
      console.log("🧹 [MP] Effect cleanup");
      mounted = false;
      clearTimeout(timer);
      isMounting.current = false;
      
      const doCleanup = async () => {
        if (brickInstance.current) {
          try {
            console.log("🔌 [MP] Attempting unmount...");
            await brickInstance.current.unmount();
            brickInstance.current = null;
            console.log("✅ [MP] Unmount done");
          } catch (e) {
            console.warn("⚠️ [MP] Unmount failed (may already be unmounted):", e);
          }
        }
      };
      doCleanup();
    };
  }, [config, total, customerInfo.email]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-[#f7c600]" size={40} />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Iniciando ambiente seguro...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 border-2 border-red-500/20 bg-red-500/5 rounded-lg text-center space-y-4">
        <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-[#f7c600]"
        >
          Recarregar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">Pagamento Seguro</h3>
          <div className="flex items-center gap-2 mt-1">
            <Zap size={10} className="text-[#f7c600]" />
            <p className="text-[8px] text-white font-black uppercase tracking-widest">Pix com 5% OFF automático</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded">
           <Shield size={10} className="text-green-500" />
           <span className="text-[8px] font-black uppercase tracking-widest text-green-500">SSL ATIVO</span>
        </div>
      </div>

      <div className="relative border border-white/5 bg-black/40 p-1">
        <div id={brickContainerId} ref={brickContainerRef} />
        
        {!mpReady && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 transition-opacity">
              <Loader2 className="animate-spin text-[#f7c600]" size={32} />
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#f7c600] mt-4">Sincronizando...</p>
           </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-6">
            <Loader2 className="animate-spin text-[#f7c600]" size={48} />
            <div className="text-center space-y-2">
              <p className="text-sm font-black uppercase tracking-[0.3em] text-white">Processando Pedido</p>
              <p className="text-[9px] font-medium text-white/40 uppercase tracking-widest">Aguarde, não feche esta página...</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-6 opacity-40">
        <div className="flex flex-col items-center gap-2">
           <Lock size={14} className="text-white" />
           <span className="text-[7px] font-black uppercase tracking-widest">Dados Criptografados</span>
        </div>
        <div className="flex flex-col items-center gap-2">
           <Smartphone size={14} className="text-white" />
           <span className="text-[7px] font-black uppercase tracking-widest">Mobile Friendly</span>
        </div>
        <div className="flex flex-col items-center gap-2">
           <ShieldCheck size={14} className="text-white" />
           <span className="text-[7px] font-black uppercase tracking-widest">Checkout Seguro</span>
        </div>
      </div>
    </div>
  );
}

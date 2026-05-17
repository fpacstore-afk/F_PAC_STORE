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
  const brickInstance = useRef<any>(null);
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mpReady, setMpReady] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  // 1. Fetch config from server
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(getApiUrl('/api/checkout/config'));
        const data = await response.json();
        if (data.mercadopago?.publicKey) {
          setConfig(data.mercadopago);
        } else {
          throw new Error("Public key not found");
        }
      } catch (err: any) {
        console.error("❌ [PAYMENT] Config error:", err);
        setError("Não foi possível carregar as configurações de pagamento.");
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  // 2. Initialize Payment Brick
  useEffect(() => {
    if (!config || !brickContainerRef.current || typeof MercadoPago === 'undefined') return;

    const initBrick = async () => {
      try {
        const mp = new MercadoPago(config.publicKey, { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        const renderPaymentBrick = async (bricksBuilder: any) => {
          const settings = {
            initialization: {
              amount: total,
              payer: {
                firstName: customerInfo.name.split(' ')[0],
                lastName: customerInfo.name.split(' ').slice(1).join(' ') || 'F PAC',
                email: customerInfo.email,
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
                console.log("✅ [MP] Brick Ready");
                setMpReady(true);
              },
              onPaymentMethodSelected: (paymentMethod: any) => {
                console.log("📍 [MP] Method Selected:", paymentMethod);
                setSelectedMethod(paymentMethod);
              },
              onSubmit: async ({ selectedPaymentMethod, formData }: any) => {
                console.log("📤 [MP] Submit triggered:", selectedPaymentMethod);
                setIsProcessing(true);
                
                try {
                  const payload = {
                    ...formData,
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
                    throw new Error(result.message || result.error || "Erro no processamento.");
                  }

                  onSuccess(result);
                } catch (err: any) {
                    console.error("❌ [MP] Process error:", err);
                    toast.error(err.message || "Erro ao processar pagamento. Tente novamente.");
                    setIsProcessing(false);
                }
              },
              onError: (error: any) => {
                console.error("❌ [MP] Brick error:", error);
                setError("Erro no módulo de pagamento.");
              }
            }
          };

          brickInstance.current = await bricksBuilder.create('payment', 'paymentBrick_container', settings);
        };

        renderPaymentBrick(bricksBuilder);
      } catch (err) {
        console.error("❌ [MP] Init error:", err);
        setError("Erro ao inicializar checkout.");
      }
    };

    initBrick();

    return () => {
      if (brickInstance.current) {
        brickInstance.current.unmount();
      }
    };
  }, [config, total]);

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
        <div id="paymentBrick_container" ref={brickContainerRef} />
        
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

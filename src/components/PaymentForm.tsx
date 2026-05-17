
import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, Loader2, Lock, Check, Zap, CreditCard as CardIcon, RefreshCcw, 
  Smartphone, Shield, AlertTriangle
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
}

export function PaymentForm({ total, items, customerInfo, onSuccess, userId }: PaymentFormProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mpReady, setMpReady] = useState(false);
  
  const brickInstance = useRef<any>(null);
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const isMounting = useRef(false);
  const brickContainerId = "mercadopago_payment_brick_v2";

  // 1. Audit Check & Config Fetching
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      try {
        console.log("🛠️ [CHECKOUT AUDIT] Initializing Payment Environment...");
        
        // Ensure SDK is available
        if (typeof MercadoPago === 'undefined') {
          console.warn("⚠️ [CHECKOUT] MP SDK not found, waiting...");
          await new Promise(r => setTimeout(r, 2000));
          if (typeof MercadoPago === 'undefined') throw new Error("SDK do Mercado Pago não encontrado. Verifique sua conexão.");
        }

        // Fetch Public Key
        const response = await fetch(getApiUrl('/api/checkout/config'), { cache: 'no-store' });
        if (!response.ok) throw new Error("Falha ao obter chaves de segurança do servidor.");
        
        const { mercadopago } = await response.json();
        if (!mercadopago?.publicKey) throw new Error("Chave pública não configurada.");

        if (mounted) {
          renderBrick(mercadopago.publicKey);
        }
      } catch (err: any) {
        console.error("❌ [CHECKOUT ERROR]:", err);
        if (mounted) {
          setError(err.message || "Erro ao carregar o checkout seguro.");
          setLoading(false);
        }
      }
    };

    const renderBrick = async (publicKey: string) => {
      if (isMounting.current) return;
      isMounting.current = true;

      try {
        const mp = new MercadoPago(publicKey, { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        const settings = {
          initialization: {
            amount: Number(total),
            payer: {
              firstName: customerInfo.name.split(' ')[0],
              lastName: customerInfo.name.split(' ').slice(1).join(' ') || 'F PAC',
              email: customerInfo.email,
              identification: {
                type: 'CPF',
                number: customerInfo.cpf?.replace(/\D/g, '') || ''
              }
            },
          },
          customization: {
            visual: {
              hideStatusScreen: true, // We handle our own status screen for UX
              preserveStack: true,
              style: {
                theme: 'dark',
                customVariables: {
                  colorPrimary: '#f7c600',
                  colorBackground: '#000000',
                  formBackgroundColor: '#121212',
                  baseColor: '#ffffff'
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
                console.log("✅ [MP BRICK] Ready");
                setMpReady(true);
                setLoading(false);
                isMounting.current = false;
            },
            onSubmit: async ({ selectedPaymentMethod, formData }: any) => {
              console.log("📤 [MP BRICK] Submit detected:", selectedPaymentMethod);
              setIsProcessing(true);
              
              try {
                // Professional payload construction
                const response = await fetch(getApiUrl('/api/checkout/process-payment'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...formData,
                    transaction_amount: total,
                    items,
                    customerInfo,
                    userId
                  })
                });

                const result = await response.json();

                if (!response.ok) {
                   throw new Error(result.message || result.error || "Erro ao processar pagamento.");
                }

                console.log("🎉 [CHECKOUT SUCCESS] Redirecting to status...");
                onSuccess(result);
              } catch (err: any) {
                console.error("❌ [PROCESS ERROR]:", err);
                toast.error(err.message || "Erro na conexão com o Mercado Pago.");
                setIsProcessing(false);
              }
            },
            onError: (error: any) => {
              console.error("❌ [MP BRICK ERROR]:", error);
              toast.error("Erro no módulo de pagamento. Tente recarregar.");
              setError("Ocorreu um problema ao carregar o formulário de pagamento.");
              setLoading(false);
            }
          }
        };

        brickInstance.current = await bricksBuilder.create('payment', brickContainerId, settings);
      } catch (err) {
        console.error("❌ [BRICK RENDER ERROR]:", err);
        setError("Erro crítico ao renderizar checkout.");
        setLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
      if (brickInstance.current) {
        brickInstance.current.unmount().catch(() => {});
        brickInstance.current = null;
      }
      isMounting.current = false;
    };
  }, [total]);

  return (
    <div className="space-y-6">
      {/* Visual Header */}
      <div className="bg-white/5 border border-white/10 p-6 flex items-center justify-between">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-[#f7c600]">Ambiente de Pagamento</h3>
          <p className="text-[8px] text-white/40 uppercase font-bold tracking-widest mt-1">Sua transação é protegida por SSL de 256 bits</p>
        </div>
        <ShieldCheck className="text-[#f7c600]" size={24} />
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-[#f7c600]" size={40} />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 animate-pulse">Estabelecendo conexão segura...</p>
        </div>
      )}

      {error && (
        <div className="p-8 border-2 border-red-500/20 bg-red-500/5 text-center space-y-4">
          <AlertTriangle size={32} className="mx-auto text-red-500" />
          <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-[#f7c600] transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      <div className={cn(
        "relative transition-all duration-500",
        (loading || error) ? "opacity-0 invisible" : "opacity-100 visible"
      )}>
        <div id={brickContainerId} ref={brickContainerRef} className="min-h-[400px]" />
        
        {!mpReady && !loading && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10">
              <Loader2 className="animate-spin text-[#f7c600]" size={32} />
              <p className="text-[9px] font-black uppercase tracking-widest text-[#f7c600] mt-4">Sincronizando Módulos...</p>
           </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <Loader2 className="animate-spin text-[#f7c600]" size={64} />
              <div className="absolute inset-0 flex items-center justify-center">
                 <Shield size={24} className="text-white/20" />
              </div>
            </div>
            <div className="text-center space-y-3">
              <p className="text-lg font-black uppercase tracking-[0.4em] text-white italic">AUTORIZANDO</p>
              <p className="text-[9px] font-medium text-white/40 uppercase tracking-[0.2em]">Verificando integridade da transação junto ao banco...</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-8 opacity-40">
        <div className="flex items-center gap-3">
           <Lock size={14} className="text-white" />
           <span className="text-[8px] font-bold uppercase tracking-widest leading-tight">Criptografia de Ponta a Ponta</span>
        </div>
        <div className="flex items-center gap-3">
           <Shield size={14} className="text-white" />
           <span className="text-[8px] font-bold uppercase tracking-widest leading-tight">Certificação PCI DSS Level 1</span>
        </div>
      </div>
    </div>
  );
}

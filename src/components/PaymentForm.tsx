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
}

export function PaymentForm({ total, items, customerInfo, shipping, discounts, onSuccess }: PaymentFormProps) {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
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
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const resp = await fetch(getApiUrl('/api/checkout/config'), { 
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      clearTimeout(timeoutId);

      if (!resp.ok) throw new Error(`Falha no servidor: ${resp.status}`);
      
      const data = await resp.json();
      console.log("✅ [PAYMENT] Config recebida:", !!data.mercadopago?.publicKey);
      
      if (!data.mercadopago?.publicKey) {
        throw new Error("Chave pública do Mercado Pago não configurada no servidor.");
      }
      
      setConfig(data);
    } catch (e: any) {
      console.error("❌ [PAYMENT] Erro ao carregar config:", e);
      setError(e.name === 'AbortError' ? "Tempo de conexão esgotado." : (e.message || "Erro ao conectar com o serviço de pagamentos."));
      toast.error("Erro ao inicializar checkout.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // 2. Inicializar Bricks do Mercado Pago
  useEffect(() => {
    // Só prossegue se tiver config, não estiver carregando, tiver o container e não tiver inicializado ainda
    if (!config?.mercadopago?.publicKey || loading || !brickContainerRef.current || mpInitialized || initializationAttempted.current) {
      return;
    }

    const initMP = async () => {
      initializationAttempted.current = true;
      try {
        if (typeof MercadoPago === 'undefined') {
          throw new Error("SDK do Mercado Pago não encontrado. Verifique sua conexão.");
        }

        console.log("🛠️ [MP] Inicializando Mercado Pago Bricks...");
        const mp = new MercadoPago(config.mercadopago.publicKey, {
          locale: 'pt-BR'
        });
        
        const bricksBuilder = mp.bricks();

        const renderPaymentBrick = async (builder: any) => {
          const settings = {
            initialization: {
              amount: total,
              payer: {
                firstName: customerInfo.name.split(' ')[0],
                lastName: customerInfo.name.split(' ').slice(1).join(' ') || 'Cliente',
                email: customerInfo.email,
              },
            },
            customization: {
              visual: {
                hideStatusScreen: true,
                style: {
                  theme: 'dark', // Corresponde à identidade visual F PAC
                },
              },
              paymentMethods: {
                creditCard: 'all',
                pix: 'all',
                maxInstallments: 12
              },
            },
            callbacks: {
              onReady: () => {
                console.log("✅ [MP] Brick Pronto para uso.");
                setMpInitialized(true);
              },
              onSubmit: async ({ formData }: any) => {
                return new Promise((resolve, reject) => {
                  setIsProcessing(true);
                  console.log("🚀 [MP] Processando transação via Backend...");
                  
                  const payload = {
                    ...formData,
                    items,
                    customerInfo,
                    shipping,
                    discounts,
                    userId: user?.uid,
                  };

                  fetch(getApiUrl('/api/checkout/mercadopago/process-payment'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  })
                  .then(response => response.json())
                  .then((result) => {
                    if (result.error || (result.status === 'rejected' && !result.point_of_interaction)) {
                      console.error("❌ [MP] Pagamento recusado:", result);
                      toast.error(result.error || "Pagamento Recusado. Verifique os dados ou tente outro método.");
                      reject();
                    } else {
                      console.log("🎉 [MP] Sucesso/Pendente:", result.status);
                      onSuccess(result.external_reference);
                      resolve(null);
                    }
                  })
                  .catch((err) => {
                    console.error("❌ [MP] Erro na requisição de pagamento:", err);
                    toast.error("Falha na comunicação com o servidor de pagamentos.");
                    reject();
                  })
                  .finally(() => {
                    setIsProcessing(false);
                  });
                });
              },
              onError: (err: any) => {
                console.error("❌ [MP] Erro interno do Brick:", err);
                setError("Ocorreu um erro técnico no módulo do Mercado Pago.");
                toast.error("Erro no módulo de pagamento.");
              },
            },
          };

          if (brickContainerRef.current) {
            brickContainerRef.current.innerHTML = ''; // Limpeza preventiva
            await builder.create('payment', 'paymentBrick_container', settings);
          }
        };

        await renderPaymentBrick(bricksBuilder);
      } catch (err: any) {
        console.error("❌ [MP] Erro crítico na inicialização do SDK:", err);
        setError(err.message || "Erro ao carregar SDK de pagamentos.");
        initializationAttempted.current = false; // Permite tentar de novo se falhar
      }
    };

    // Pequeno delay para garantir que o render do React finalizou o containerRef
    const timer = setTimeout(initMP, 300);
    return () => clearTimeout(timer);
  }, [config, total, mpInitialized, loading]);

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
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">Pagamento Seguro</h3>
          <div className="flex items-center gap-2 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded">
            <ShieldCheck size={10} className="text-green-500" />
            <span className="text-[8px] font-black uppercase tracking-widest text-green-500">Gateway Verificado</span>
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
        <div id="paymentBrick_container" ref={brickContainerRef} className="p-2 md:p-4">
          {!mpInitialized && !error && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="animate-spin text-[#f7c600]" size={32} />
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">
                Sincronizando com Mercado Pago...
              </p>
            </div>
          )}
        </div>

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

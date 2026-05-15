import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Smartphone, CheckCircle2, AlertCircle, 
  Loader2, Lock, ShieldCheck, ArrowRight, Copy, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Elements, 
  PaymentElement,
  LinkAuthenticationElement,
  useStripe, 
  useElements 
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { cn } from '../lib/utils';
import { getApiUrl } from '../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// Declarar SDK do PagBank (veio via script no index.html)
declare const PagSeguro: any;

interface PaymentFormProps {
  total: number;
  items: any[];
  customerInfo: any;
  shipping: number;
  discounts: number;
  onSuccess: (orderId: string) => void;
  paymentMethod?: 'CREDIT_CARD' | 'PIX' | 'DEBIT_CARD';
  userId?: string;
}

// Inicializar Stripe (fora do componente para evitar re-instanciação)
let stripePromise: Promise<any> | null = null;

const getStripePromise = async () => {
  if (!stripePromise) {
    const resp = await fetch(getApiUrl('/api/checkout/config'));
    const data = await resp.json();
    if (data.stripe?.publicKey) {
      stripePromise = loadStripe(data.stripe.publicKey);
    }
  }
  return stripePromise;
};

export function PaymentForm({ total, items, customerInfo, shipping, discounts, onSuccess, paymentMethod }: PaymentFormProps) {
  const [gateway, setGateway] = useState<'stripe' | 'pagbank'>('pagbank');
  const [method, setMethod] = useState<'credit_card' | 'pix'>(
    paymentMethod === 'PIX' ? 'pix' : 'credit_card'
  );
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const resp = await fetch(getApiUrl('/api/checkout/config'));
        const data = await resp.json();
        setConfig(data);
        
        // Se o cliente escolheu PIX, PagBank é a melhor/única opção (Stripe PIX removido)
        if (paymentMethod === 'PIX' && data.pagbank?.enabled) {
          setGateway('pagbank');
          setMethod('pix');
        } else if (!data.stripe?.publicKey && data.pagbank?.enabled) {
          setGateway('pagbank');
        }
      } catch (e) {
        console.error("Erro ao carregar config de pagamento", e);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, [paymentMethod]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="animate-spin text-[#f7c600]" size={32} />
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Iniciando ambiente de pagamento...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Gateway Selection */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">Escolha o Gateway</h3>
        <div className="grid grid-cols-2 gap-4">
          <button
            disabled={!config?.pagbank?.enabled || (paymentMethod === 'PIX' && gateway !== 'pagbank')}
            onClick={() => setGateway('pagbank')}
            className={cn(
              "p-4 border transition-all flex flex-col items-center gap-1 group relative overflow-hidden",
              gateway === 'pagbank' 
                ? "bg-[#f7c600] border-[#f7c600] text-black shadow-lg shadow-[#f7c600]/20" 
                : "bg-black/20 border-white/5 text-white/40 hover:border-white/20 disabled:opacity-20"
            )}
          >
            {gateway === 'pagbank' && (
              <motion.div layoutId="gateway-highlight" className="absolute inset-0 bg-white/10" />
            )}
            <span className="text-[11px] font-black uppercase tracking-widest z-10">PagBank</span>
            <span className={cn("text-[7px] font-bold uppercase tracking-tight z-10", gateway === 'pagbank' ? "text-black/60" : "opacity-50")}>
              Nacional & Rápido
            </span>
            {gateway === 'pagbank' && <CheckCircle2 size={12} className="absolute top-2 right-2 text-black" />}
          </button>

          <button
            disabled={paymentMethod === 'PIX'} // Stripe não terá mais PIX
            onClick={() => setGateway('stripe')}
            className={cn(
              "p-4 border transition-all flex flex-col items-center gap-1 group relative overflow-hidden",
              gateway === 'stripe' 
                ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                : "bg-black/20 border-white/5 text-white/40 hover:border-white/20 disabled:opacity-20"
            )}
          >
            {gateway === 'stripe' && (
              <motion.div layoutId="gateway-highlight" className="absolute inset-0 bg-white/10" />
            )}
            <span className="text-[11px] font-black uppercase tracking-widest z-10">Stripe</span>
            <span className={cn("text-[7px] font-bold uppercase tracking-tight z-10", gateway === 'stripe' ? "text-white/60" : "opacity-50")}>
              Global & Seguro
            </span>
            {gateway === 'stripe' && <CheckCircle2 size={12} className="absolute top-2 right-2 text-white" />}
          </button>
        </div>
        {paymentMethod === 'PIX' && (
          <p className="text-[8px] font-bold uppercase tracking-widest text-[#f7c600]/60 text-center italic">
            * PIX disponível exclusivamente via PagBank para este pedido.
          </p>
        )}
      </div>

      {/* Payment Method Selection */}
      {!paymentMethod || paymentMethod === 'CREDIT_CARD' || paymentMethod === 'PIX' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">Forma de Pagamento</h3>
            {paymentMethod && (
              <span className="text-[8px] font-bold uppercase tracking-widest text-white/30 border border-white/10 px-2 py-0.5 rounded">
                Bloqueado na Sacola
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button
              disabled={!!paymentMethod && paymentMethod !== 'CREDIT_CARD'}
              onClick={() => setMethod('credit_card')}
              className={cn(
                "p-4 border transition-all flex items-center justify-center gap-3",
                method === 'credit_card' 
                  ? "bg-white border-[#f7c600] text-black" 
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 disabled:opacity-10"
              )}
            >
              <CreditCard size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Cartão</span>
            </button>
            
            <button
              disabled={(!!paymentMethod && paymentMethod !== 'PIX') || gateway === 'stripe'}
              onClick={() => setMethod('pix')}
              className={cn(
                "p-4 border transition-all flex items-center justify-center gap-3",
                method === 'pix' 
                  ? "bg-white border-[#f7c600] text-black" 
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 disabled:opacity-10"
              )}
            >
              <Smartphone size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">PIX</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Actual Form Render */}
      <div className={cn(
        "p-6 rounded-lg border-2 transition-all duration-500 relative mt-4",
        gateway === 'stripe' 
          ? "bg-indigo-600/5 border-indigo-600 shadow-[0_0_40px_-15px_rgba(79,70,229,0.3)]" 
          : "bg-[#f7c600]/5 border-[#f7c600] shadow-[0_0_40px_-15px_rgba(247,198,0,0.3)]"
      )}>
        {/* Gateway Badge */}
        <div className={cn(
          "absolute -top-3 left-6 px-4 py-1 flex items-center gap-2 rounded-full border shadow-lg z-20",
          gateway === 'stripe' ? "bg-indigo-600 border-indigo-400 text-white" : "bg-[#f7c600] border-[#d4a800] text-black"
        )}>
          {gateway === 'stripe' ? <Lock size={12} /> : <ShieldCheck size={12} />}
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">
            Ambiente {gateway === 'stripe' ? 'STRIPE' : 'PAGBANK'} SEGURO
          </span>
        </div>

        {gateway === 'stripe' ? (
          <StripePaymentFlow 
            total={total} 
            items={items} 
            customerInfo={customerInfo} 
            shipping={shipping} 
            discounts={discounts}
            onSuccess={onSuccess}
            userId={user?.uid}
            method={method}
          />
        ) : (
          <PagBankPaymentFlow 
            config={config}
            method={method} 
            total={total} 
            items={items} 
            customerInfo={customerInfo} 
            shipping={shipping} 
            discounts={discounts}
            onSuccess={onSuccess}
            userId={user?.uid}
          />
        )}
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-center gap-6 opacity-30 pt-4 grayscale pointer-events-none">
        <div className="flex items-center gap-2">
           <Lock size={12} />
           <span className="text-[8px] font-black uppercase tracking-widest">Criptografia Ponta-a-Ponta</span>
        </div>
        <div className="flex items-center gap-2">
           <ShieldCheck size={12} />
           <span className="text-[8px] font-black uppercase tracking-widest">Antifraude Integrado</span>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// STRIPE FLOW
// -----------------------------------------------------------------------------
function StripePaymentFlow({ total, items, customerInfo, shipping, discounts, onSuccess, method, userId }: any) {
  const [stripeReady, setStripeReady] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);

  useEffect(() => {
    getStripePromise().then(p => {
      if (p) setStripeReady(true);
    });
  }, []);

  useEffect(() => {
    if (stripeReady && !clientSecret && !loadingIntent) {
      const createIntent = async () => {
        setLoadingIntent(true);
        try {
          const resp = await fetch(getApiUrl('/api/checkout/stripe/create-intent'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, customerInfo, shipping, discounts, userId })
          });
          const data = await resp.json();
          if (data.clientSecret && data.orderId) {
            setClientSecret(data.clientSecret);
            setOrderId(data.orderId);
          } else {
            console.error("Erro ao criar intent:", data.error);
            toast.error("Erro ao iniciar o checkout Stripe.");
          }
        } catch (e) {
          console.error("Catastrophic error creating intent:", e);
        } finally {
          setLoadingIntent(false);
        }
      };
      createIntent();
    }
  }, [stripeReady, clientSecret, items, customerInfo, shipping, discounts]);

  if (!stripeReady || !clientSecret || !orderId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="animate-spin text-[#f7c600]" size={32} />
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Sincronizando com Stripe...</p>
      </div>
    );
  }

  const appearance = {
    theme: 'night' as const,
    variables: {
      colorPrimary: '#f7c600',
      colorBackground: 'transparent',
      colorText: '#ffffff',
      colorDanger: '#df1b41',
      fontFamily: 'Inter, system-ui, sans-serif',
      spacingUnit: '4px',
      borderRadius: '0px',
    },
    rules: {
      '.Input': {
        border: '1px solid rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: '12px',
        transition: 'border-color 0.2s ease',
      },
      '.Input:focus': {
        borderColor: '#f7c600',
        outline: 'none',
      },
      '.Label': {
        fontSize: '10px',
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        marginBottom: '8px',
        color: 'rgba(255,255,255,0.4)',
      }
    }
  };

  return (
    <Elements stripe={getStripePromise()} options={{ clientSecret, appearance }}>
      <StripeInternalForm 
        clientSecret={clientSecret}
        onSuccess={onSuccess}
        total={total}
        customerInfo={customerInfo}
        orderId={orderId}
      />
    </Elements>
  );
}

function StripeInternalForm({ clientSecret, total, customerInfo, onSuccess, orderId }: any) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order/${orderId}?payment_intent_client_secret=${clientSecret}`,
        payment_method_data: {
          billing_details: {
            name: customerInfo.name,
            email: customerInfo.email
          }
        }
      },
      redirect: 'if_required'
    });

    if (error) {
      setErrorMessage(error.message || "Erro desconhecido.");
      setIsProcessing(false);
    } else {
      // Se não houve erro e não houve redirect, significa que o pagamento foi processado com sucesso imediato (ou Pix gerado)
      // O OrderStatus cuidará da confirmação via webhook ou polling
      toast.success("Pagamento processado!");
      
      // Precisamos do OrderId. O Intent contém no metadata.
      // Como estamos no checkout, vamos extrair o OrderId do metadata do intent se possível
      const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);
      if (paymentIntent && (paymentIntent as any).metadata?.orderId) {
        onSuccess((paymentIntent as any).metadata.orderId);
      } else {
        // Fallback
        onSuccess('PENDING');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-6">
        <LinkAuthenticationElement />
        <PaymentElement options={{
          layout: 'accordion',
          paymentMethodOrder: ['card', 'link'],
          defaultValues: {
            billingDetails: {
              name: customerInfo.name,
              email: customerInfo.email,
              phone: customerInfo.phone
            }
          },
          business: {
            name: 'F PAC STORE'
          }
        }} />
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
          <AlertCircle size={14} />
          {errorMessage}
        </div>
      )}

      <button 
        disabled={isProcessing || !stripe || !elements}
        className="w-full bg-[#f7c600] text-black py-4 font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all flex items-center justify-center gap-2"
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" />
        ) : (
          <>PAGAR R$ {total.toFixed(2)} COM SEGURANÇA <Lock size={12} /></>
        )}
      </button>

      <div className="flex items-center justify-center gap-2 opacity-30 pt-2 grayscale pointer-events-none">
        <img src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg" className="h-4" alt="Stripe" />
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// PAGBANK FLOW
// -----------------------------------------------------------------------------
function PagBankPaymentFlow({ config, method, total, items, customerInfo, shipping, discounts, onSuccess, userId }: any) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [pixData, setPixData] = useState<any>(null);
  const [cardData, setCardData] = useState({
    number: '',
    name: '',
    expiry: '',
    cvv: '',
    installments: '1'
  });

  const handleCopyPix = () => {
    if (pixData?.text) {
      navigator.clipboard.writeText(pixData.text);
      toast.success("Código copiado!");
    }
  };

  const handlePagBankSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsProcessing(true);

    try {
      // Check for SDK availability
      if (typeof PagSeguro === 'undefined') {
        throw new Error("O SDK do PagBank não pôde ser carregado. Por favor, recarregue a página.");
      }

      let cardToken = null;

      if (method === 'credit_card') {
        // Obter chave pública do config carregado no useEffect
        const publicKey = config?.pagbank?.publicKey;
        
        if (!publicKey) {
          throw new Error("Chave pública do PagBank não encontrada. Verifique se o TOKEN está correto nas configurações.");
        }

        // Validação básica dos campos antes de enviar para encriptação
        if (!cardData.name || !cardData.number || !cardData.expiry || !cardData.cvv) {
          throw new Error("Por favor, preencha todos os campos do cartão.");
        }

        const [expMonth, expYear] = cardData.expiry.split('/');
        if (!expMonth || !expYear) {
          throw new Error("Data de expiração inválida. Use MM/AA.");
        }

        // Encriptar cartão (PagBank SDK v2)
        try {
          const encrypted = PagSeguro.encryptCard({
            publicKey: publicKey,
            holder: cardData.name.trim(),
            number: cardData.number.replace(/\D/g, ''),
            expMonth: expMonth.trim(),
            expYear: '20' + expYear.trim(),
            securityCode: cardData.cvv.trim()
          });

          if (!encrypted || !encrypted.encryptedCard) {
            console.error("Encrypt result:", encrypted);
            const errMsg = encrypted?.errors?.map((err: any) => err.message).join(', ') || "Falha na encriptação.";
            throw new Error(`Erro PagBank: ${errMsg}`);
          }

          cardToken = encrypted.encryptedCard;
        } catch (encErr: any) {
          console.error("Erro na encriptação:", encErr);
          throw new Error(encErr.message || "Erro de segurança ao processar cartão.");
        }
      }

      const resp = await fetch(getApiUrl('/api/checkout/pagbank/create-order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items, customerInfo, shipping, discounts,
          paymentMethod: method,
          cardToken,
          installments: Number(cardData.installments),
          cvv: cardData.cvv,
          userId
        })
      });

      const result = await resp.json();
      if (result.error) {
        console.error("PagBank API Error Details:", result.details);
        let errorMsg = result.error;
        if (result.details?.error_messages && Array.isArray(result.details.error_messages)) {
          const detailMsgs = result.details.error_messages.map((m: any) => {
            const param = m.parameter ? `[${m.parameter.split('.').pop()}] ` : '';
            return `${param}${m.description}`;
          }).join(', ');
          errorMsg = `PagBank: ${detailMsgs}`;
        } else if (result.details?.message) {
          errorMsg = `PagBank: ${result.details.message}`;
        }
        throw new Error(errorMsg);
      }

      if (method === 'pix') {
        setPixData(result.pix);
      } else {
        if (result.status === 'PAID' || result.status === 'AUTHORIZED') {
          toast.success("Pagamento autorizado via PagBank!");
          onSuccess(result.orderId);
        } else if (result.status === 'DECLINED') {
          toast.error("Cartão recusado pelo PagBank.");
        } else {
          onSuccess(result.orderId); // Pendente
        }
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro no processamento PagBank.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (method === 'pix') {
    if (pixData) {
      return (
        <div className="text-center space-y-6">
          <div className="bg-white p-4 inline-block rounded-lg shadow-xl">
             <img src={pixData.qrcode} alt="PIX QR Code" className="w-48 h-48" />
          </div>
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Copia e Cola</p>
            <div className="flex gap-2">
              <input 
                readOnly 
                value={pixData.text} 
                className="bg-white/5 border border-white/10 p-3 rounded flex-1 text-[10px] font-mono text-white/50 truncate"
              />
              <button 
                onClick={handleCopyPix}
                className="bg-[#f7c600] text-black px-4 rounded hover:bg-white transition-colors"
                title="Copiar"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
          <button 
             onClick={() => onSuccess(pixData.orderId || 'PENDING')}
             className="text-[10px] font-black uppercase tracking-widest text-[#f7c600] hover:underline"
          >
            Já realizei o pagamento
          </button>
        </div>
      );
    }

    return (
      <div className="text-center space-y-4">
        <Smartphone className="mx-auto text-[#f7c600]" size={48} />
        <p className="text-xs text-white/60 leading-relaxed font-medium">
          Ao clicar em Confirmar, um QR Code PIX será gerado pelo PagBank.
        </p>
        <button 
           onClick={() => handlePagBankSubmit()}
           disabled={isProcessing}
           className="w-full bg-[#f7c600] text-black py-4 font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all flex items-center justify-center gap-2"
        >
          {isProcessing ? <Loader2 className="animate-spin" /> : <>FINALIZAR E GERAR PIX <ArrowRight size={14} /></>}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handlePagBankSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <input 
          placeholder="NOME IGUAL NO CARTÃO"
          required
          value={cardData.name}
          onChange={e => setCardData({...cardData, name: e.target.value.toUpperCase()})}
          className="bg-white/5 border border-white/10 p-4 w-full text-xs font-black tracking-widest text-white focus:border-[#f7c600] outline-none placeholder:text-white/20"
        />
        <input 
          placeholder="NÚMERO DO CARTÃO"
          required
          maxLength={19}
          value={cardData.number}
          onChange={e => {
             const v = e.target.value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
             setCardData({...cardData, number: v});
          }}
          className="bg-white/5 border border-white/10 p-4 w-full text-xs font-black tracking-widest text-white focus:border-[#f7c600] outline-none placeholder:text-white/20"
        />
        <div className="grid grid-cols-2 gap-4">
          <input 
            placeholder="MM/AA"
            required
            maxLength={5}
            value={cardData.expiry}
            onChange={e => {
               const v = e.target.value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2');
               setCardData({...cardData, expiry: v});
            }}
            className="bg-white/5 border border-white/10 p-4 w-full text-xs font-black tracking-widest text-white focus:border-[#f7c600] outline-none placeholder:text-white/20"
          />
          <input 
            placeholder="CVV"
            required
            maxLength={4}
            value={cardData.cvv}
            onChange={e => setCardData({...cardData, cvv: e.target.value.replace(/\D/g, '')})}
            className="bg-white/5 border border-white/10 p-4 w-full text-xs font-black tracking-widest text-white focus:border-[#f7c600] outline-none placeholder:text-white/20"
          />
        </div>
        <select 
          value={cardData.installments}
          onChange={e => setCardData({...cardData, installments: e.target.value})}
          className="bg-white/5 border border-white/10 p-4 w-full text-[10px] font-black uppercase tracking-widest text-white focus:border-[#f7c600] outline-none appearance-none"
        >
          {[...Array(12)].map((_, i) => {
            const count = i + 1;
            const installmentValue = total / count;
            return (
              <option key={count} value={count} className="bg-[#121212] text-white">
                {count}x de R$ {installmentValue.toFixed(2)} {count <= 3 ? 'SEM JUROS' : ''}
              </option>
            );
          })}
        </select>
      </div>
      
      <p className="text-[8px] text-white/30 uppercase font-bold tracking-widest text-center mt-2">
        * Parcelamento em até 3x sem juros. Acima de 4x pode haver juros do emissor.
      </p>
      <button 
        disabled={isProcessing}
        className="w-full bg-[#f7c600] text-black py-4 font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all flex items-center justify-center gap-2"
      >
        {isProcessing ? <Loader2 className="animate-spin" /> : <>PAGAR COM PAGBANK <Lock size={12} /></>}
      </button>
    </form>
  );
}

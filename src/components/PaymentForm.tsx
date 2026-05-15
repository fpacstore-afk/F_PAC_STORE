import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Smartphone, CheckCircle2, AlertCircle, 
  Loader2, Lock, ShieldCheck, ArrowRight, Copy, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Elements, 
  CardElement, 
  useStripe, 
  useElements 
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { cn } from '../lib/utils';
import { getApiUrl } from '../lib/api';
import toast from 'react-hot-toast';

// Declarar SDK do PagBank (veio via script no index.html)
declare const PagSeguro: any;

interface PaymentFormProps {
  total: number;
  items: any[];
  customerInfo: any;
  shipping: number;
  discounts: number;
  onSuccess: (orderId: string) => void;
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

export function PaymentForm({ total, items, customerInfo, shipping, discounts, onSuccess }: PaymentFormProps) {
  const [gateway, setGateway] = useState<'stripe' | 'pagbank'>('stripe');
  const [method, setMethod] = useState<'credit_card' | 'pix'>('credit_card');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const resp = await fetch(getApiUrl('/api/checkout/config'));
        const data = await resp.json();
        setConfig(data);
        if (!data.stripe?.publicKey && data.pagbank?.enabled) {
          setGateway('pagbank');
        }
      } catch (e) {
        console.error("Erro ao carregar config de pagamento", e);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

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
            onClick={() => setGateway('stripe')}
            className={cn(
              "p-4 border transition-all flex flex-col items-center gap-2",
              gateway === 'stripe' 
                ? "bg-white/10 border-[#f7c600] text-white" 
                : "bg-black/20 border-white/5 text-white/40 hover:border-white/20"
            )}
          >
            <span className="text-[11px] font-black uppercase tracking-widest">Stripe</span>
            <span className="text-[8px] font-medium opacity-50">Global & Seguro</span>
          </button>
          
          <button
            disabled={!config?.pagbank?.enabled}
            onClick={() => setGateway('pagbank')}
            className={cn(
              "p-4 border transition-all flex flex-col items-center gap-2",
              gateway === 'pagbank' 
                ? "bg-white/10 border-[#f7c600] text-white" 
                : "bg-black/20 border-white/5 text-white/40 hover:border-white/20 disabled:opacity-20"
            )}
          >
            <span className="text-[11px] font-black uppercase tracking-widest">PagBank</span>
            <span className="text-[8px] font-medium opacity-50">Nacional & Rápido</span>
          </button>
        </div>
      </div>

      {/* Payment Method Selection */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">Forma de Pagamento</h3>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setMethod('credit_card')}
            className={cn(
              "p-4 border transition-all flex items-center justify-center gap-3",
              method === 'credit_card' 
                ? "bg-white border-[#f7c600] text-black" 
                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
            )}
          >
            <CreditCard size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Cartão</span>
          </button>
          
          <button
            onClick={() => setMethod('pix')}
            className={cn(
              "p-4 border transition-all flex items-center justify-center gap-3",
              method === 'pix' 
                ? "bg-white border-[#f7c600] text-black" 
                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
            )}
          >
            <Smartphone size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">PIX</span>
          </button>
        </div>
      </div>

      {/* Actual Form Render */}
      <div className="bg-black/20 border border-white/5 p-6 rounded-lg">
        {gateway === 'stripe' ? (
          <StripePaymentFlow 
            method={method} 
            total={total} 
            items={items} 
            customerInfo={customerInfo} 
            shipping={shipping} 
            discounts={discounts}
            onSuccess={onSuccess}
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
function StripePaymentFlow(props: any) {
  const [stripeReady, setStripeReady] = useState(false);

  useEffect(() => {
    getStripePromise().then(p => {
      if (p) setStripeReady(true);
    });
  }, []);

  if (!stripeReady) return <Loader2 className="animate-spin mx-auto text-[#f7c600]" />;

  return (
    <Elements stripe={getStripePromise()}>
      <StripeInternalForm {...props} />
    </Elements>
  );
}

function StripeInternalForm({ method, total, items, customerInfo, shipping, discounts, onSuccess }: any) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    try {
      // 1. Criar Intent no Backend
      const resp = await fetch(getApiUrl('/api/checkout/stripe/create-intent'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, customerInfo, shipping, discounts })
      });
      const { clientSecret, orderId, error } = await resp.json();
      
      if (error) throw new Error(error);

      // 2. Confirmar Pagamento no Frontend
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
          billing_details: {
            name: customerInfo.name,
            email: customerInfo.email
          }
        }
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      if (result.paymentIntent?.status === 'succeeded') {
        toast.success("Pagamento aprovado!");
        onSuccess(orderId);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro no processamento.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (method === 'pix') {
    return (
      <div className="text-center space-y-4">
        <Smartphone className="mx-auto text-[#f7c600]" size={48} />
        <p className="text-xs text-white/60 leading-relaxed font-medium">
          Ao clicar em Confirmar, um QR Code PIX será gerado pelo Stripe.
        </p>
        <button 
           onClick={handleSubmit}
           disabled={isProcessing}
           className="w-full bg-[#f7c600] text-black py-4 font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all flex items-center justify-center gap-2"
        >
          {isProcessing ? <Loader2 className="animate-spin" /> : <>GERAR QR CODE PIX <ArrowRight size={14} /></>}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-4 bg-white/5 border border-white/10 rounded">
        <CardElement options={{
          style: {
            base: {
              fontSize: '16px',
              color: '#fff',
              '::placeholder': { color: '#ffffff40' },
            },
            invalid: { color: '#f87171' },
          },
        }} />
      </div>
      <button 
        disabled={isProcessing || !stripe}
        className="w-full bg-[#f7c600] text-black py-4 font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all flex items-center justify-center gap-2"
      >
        {isProcessing ? <Loader2 className="animate-spin" /> : <>PAGAR R$ {total.toFixed(2)} COM CARTÃO <Lock size={12} /></>}
      </button>
    </form>
  );
}

// -----------------------------------------------------------------------------
// PAGBANK FLOW
// -----------------------------------------------------------------------------
function PagBankPaymentFlow({ config, method, total, items, customerInfo, shipping, discounts, onSuccess }: any) {
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
      let cardToken = null;

      if (method === 'credit_card') {
        // Obter chave pública do config carregado no useEffect
        const publicKey = config?.pagbank?.publicKey;
        
        if (!publicKey) {
          throw new Error("Chave pública do PagBank não encontrada. Verifique se o TOKEN está correto nas configurações.");
        }

        // Encriptar cartão (PagBank SDK v2)
        try {
          const encrypted = PagSeguro.encryptCard({
            publicKey: publicKey,
            holder: cardData.name,
            number: cardData.number.replace(/\D/g, ''),
            expMonth: cardData.expiry.split('/')[0],
            expYear: '20' + cardData.expiry.split('/')[1],
            securityCode: cardData.cvv
          });

          if (!encrypted || !encrypted.encryptedCard) {
            throw new Error("Erro ao encriptar dados do cartão.");
          }

          cardToken = encrypted.encryptedCard;
        } catch (encErr: any) {
          console.error("Erro na encriptação:", encErr);
          throw new Error("Erro de segurança ao processar cartão.");
        }
      }

      const resp = await fetch(getApiUrl('/api/checkout/pagbank/create-order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items, customerInfo, shipping, discounts,
          paymentMethod: method,
          cardToken,
          installments: cardData.installments,
          cvv: cardData.cvv
        })
      });

      const result = await resp.json();
      if (result.error) throw new Error(result.error);

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

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowRight, Loader2, ArrowLeft, 
  CreditCard, Lock, Shield, MapPin, Smartphone, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { doc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db, sanitizeFirestoreData } from '../lib/firebase';
import toast from 'react-hot-toast';
import { getApiUrl } from '../lib/api';

export function Checkout() {
  const navigate = useNavigate();
  const { 
    items, subtotal, total, shipping, couponDiscount, pixDiscount, flashSaleDiscount, coupon, observations, paymentMethod,
    customerInfo 
  } = useCart();
  const { user } = useAuth();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [stripeUrl, setStripeUrl] = useState<string | null>(null);
  const [pendingOrderId] = useState(() => `PAC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`);
  const [orderSummary, setOrderSummary] = useState<{
    items: any[];
    subtotal: number;
    total: number;
    shipping: number;
    couponDiscount: number;
    pixDiscount: number;
    flashSaleDiscount: number;
    customerInfo: any;
    paymentMethod: string;
  } | null>(null);

  // Validation before allowing view
  useEffect(() => {
    if (!createdOrderId && !isSubmitting) {
      if (items.length === 0) {
        navigate('/bag');
      } else if (!customerInfo.name) {
        navigate('/bag');
      }
    }
  }, [items.length, customerInfo.name, navigate, createdOrderId, isSubmitting]);

  const handleCreateOrder = async () => {
    if (!customerInfo.name) {
      toast.error("Dados do cliente ausentes.");
      navigate('/bag');
      return;
    }
    
    setIsSubmitting(true);
    const orderId = pendingOrderId;

    try {
      const summary = {
        items: [...items],
        subtotal,
        total,
        shipping,
        couponDiscount,
        pixDiscount,
        flashSaleDiscount,
        customerInfo: { ...customerInfo },
        paymentMethod
      };
      setOrderSummary(summary);

      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', orderId);
        
        const rawOrderData = {
          userId: user?.uid || null,
          customerName: String(customerInfo.name || "Cliente").trim(),
          customerEmail: String(customerInfo.email || "").trim().toLowerCase(),
          customerPhone: String(customerInfo.phone || "").replace(/\D/g, ''),
          cpf: String(customerInfo.cpf || "").replace(/\D/g, ''),
          address: {
            cep: String(customerInfo.cep || "").replace(/\D/g, ''),
            street: String(customerInfo.address || "").trim(),
            number: String(customerInfo.number || "").trim(),
            neighborhood: String(customerInfo.neighborhood || "").trim(),
            city: String(customerInfo.city || "").trim(),
            state: String(customerInfo.state || "").trim()
          },
          items: items.map(item => ({
            id: String(item.id || "unkn"),
            name: String(item.name || "Produto"),
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 1),
            size: String(item.size || "N/A"),
            color: String(item.color || "N/A"),
            image: String(item.image || ""), 
            printConfigs: (item.printConfigs || []).map(p => ({
              id: p.id || Math.random().toString(36).substring(7),
              stamp: String(p.stamp || ""),
              location: String(p.location || ""),
              printSize: String(p.printSize || ""),
              image: String(p.image || ""),
              background: String(p.background || "Com Fundo")
            }))
          })),
          subtotal: Number(Number(subtotal || 0).toFixed(2)),
          shipping: Number(Number(shipping || 0).toFixed(2)),
          couponDiscount: Number(Number(couponDiscount || 0).toFixed(2)),
          pixDiscount: Number(Number(pixDiscount || 0).toFixed(2)),
          flashSaleDiscount: Number(Number(flashSaleDiscount || 0).toFixed(2)),
          total: Number(Number(total || 0).toFixed(2)),
          coupon: coupon || null,
          observations: String(observations || "").trim(),
          paymentMethod: 'STRIPE',
          status: 'pending',
          createdAt: serverTimestamp()
        };

        const cleanedOrderData = sanitizeFirestoreData(rawOrderData);
        transaction.set(orderRef, cleanedOrderData);
      });

      setCreatedOrderId(orderId);
      
      const stripeRes = await fetch(getApiUrl('/api/create-checkout-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          customerEmail: customerInfo.email,
          customerName: customerInfo.name,
          shipping: shipping,
          discounts: (couponDiscount || 0) + (pixDiscount || 0) + (flashSaleDiscount || 0),
          items: items.map(item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image
          }))
        })
      });

      const responseText = await stripeRes.text();
      let stripeSession;
      
      try {
        stripeSession = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error("Erro na comunicação com Stripe.");
      }

      if (stripeSession.url) {
        setStripeUrl(stripeSession.url);
        const inIframe = window.self !== window.top;
        if (!inIframe) {
          window.location.href = stripeSession.url;
        } else {
          toast.success("Pagamento preparado!");
        }
      } else {
        throw new Error(stripeSession.error || "Erro ao gerar checkout.");
      }
      
    } catch (error: any) {
      console.error("❌ Checkout failure:", error);
      toast.error(error.message || "Erro no checkout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayCustomerInfo = orderSummary?.customerInfo || customerInfo;

  if (!displayCustomerInfo.name && !createdOrderId && !isSubmitting) return null;

  return (
    <div className="min-h-screen pt-24 pb-24 bg-[#0A0A0A] text-white selection:bg-[#f7c600] selection:text-black font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        
        {/* Navigation */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-12"
        >
          <button 
            onClick={() => navigate('/bag')} 
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors group px-4 py-2 bg-white/5 rounded-full border border-white/10"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Voltar</span>
          </button>
          
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#f7c600] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Ambiente Seguro</span>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Details */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-12 xl:col-span-7 space-y-8"
          >
            <div className="space-y-2">
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none italic">
                Finalizar <span className="text-[#f7c600]">Pedido</span>
              </h1>
              <p className="text-white/40 text-xs font-medium uppercase tracking-[0.2em]">Revise seus dados antes de prosseguir</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Delivery info */}
              <div className="bg-[#121212] border border-white/5 p-8 space-y-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <MapPin size={80} />
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">01. Entrega</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xl font-black uppercase tracking-tighter">{displayCustomerInfo.name}</p>
                    <p className="text-sm text-white/60 font-medium leading-relaxed mt-2">
                      {typeof displayCustomerInfo.address === 'object' 
                        ? (displayCustomerInfo.address as any).street 
                        : displayCustomerInfo.address}, {displayCustomerInfo.number}
                      <br />
                      {displayCustomerInfo.neighborhood}, {displayCustomerInfo.city} - {displayCustomerInfo.state}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-4 pt-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-[10px] font-bold uppercase tracking-widest">
                       <MapPin size={12} className="text-[#f7c600]" /> {displayCustomerInfo.cep}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-[10px] font-bold uppercase tracking-widest">
                       <Smartphone size={12} className="text-[#f7c600]" /> {displayCustomerInfo.phone}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-[#121212] border border-white/5 p-8 space-y-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <CreditCard size={80} />
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">02. Pagamento</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 bg-white/5 p-4 border border-white/10 shadow-inner">
                    <CreditCard className="text-[#f7c600]" size={24} />
                    <div className="flex flex-col">
                      <span className="font-black uppercase tracking-widest text-[12px]">Stripe Checkout</span>
                      <span className="text-[9px] text-white/30 uppercase font-black tracking-widest mt-0.5">Seguro & Criptografado</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-white/40 leading-relaxed uppercase tracking-widest">
                    Você será redirecionado para o Stripe para concluir o pagamento com segurança.
                  </p>
                </div>
              </div>
            </div>

            {/* Product items review */}
            <div className="bg-[#121212] border border-white/5 p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">03. Itens do Pedido</h3>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/30">
                  { (orderSummary?.items || items).length } {(orderSummary?.items || items).length === 1 ? 'Item' : 'Itens'}
                </span>
              </div>
              <div className="space-y-6">
                {(orderSummary?.items || items).map((item, i) => (
                  <div key={i} className="flex gap-6 items-center group">
                    <div className="relative w-20 h-24 bg-white/[0.03] flex-shrink-0 flex items-center justify-center p-2">
                       <img 
                        src={item.image || undefined} 
                        alt={item.name} 
                        className="w-full h-full object-contain filter drop-shadow(0 10px 15px rgba(0,0,0,0.5)) group-hover:scale-110 transition-transform duration-500" 
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black uppercase tracking-tight">{item.name}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white/5 border border-white/10 text-white/60">{item.size}</span>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white/5 border border-white/10 text-white/60">{item.color}</span>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white/5 border border-white/10 text-white/60">QTD: {item.quantity}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black tracking-tighter">R$ {(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right Column: Checkout Action */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-12 xl:col-span-5"
          >
            <div className="bg-[#121212] border border-white/10 shadow-2xl sticky top-32">
              <div className="p-8 space-y-8">
                <div className="flex justify-between items-center">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">Resumo Financeiro</h3>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded border border-white/10">
                    <Lock size={10} className="text-[#f7c600]" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/50">SSL 256-BIT</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between text-xs font-black uppercase tracking-widest text-white/40">
                    <span>Subtotal</span>
                    <span className="text-white">R$ {(orderSummary?.subtotal || subtotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-black uppercase tracking-widest text-white/40">
                    <span>Entrega</span>
                    <span className={cn((orderSummary?.shipping || shipping) === 0 ? "text-[#f7c600]" : "text-white")}>
                      {(orderSummary?.shipping || shipping) === 0 ? 'GRÁTIS' : `R$ ${(orderSummary?.shipping || shipping).toFixed(2)}`}
                    </span>
                  </div>
                  {(orderSummary?.couponDiscount || couponDiscount) > 0 && (
                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-green-500">
                      <span>Desconto Cupom</span>
                      <span>- R$ {(orderSummary?.couponDiscount || couponDiscount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-8 border-t border-white/5">
                    <div className="flex items-end justify-between">
                      <div>
                         <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Total Final</p>
                         <h2 className="text-5xl font-black italic tracking-tighter leading-none">
                            R$ {(orderSummary?.total || total).toFixed(2)}
                         </h2>
                      </div>
                      <Shield size={32} className="text-[#f7c600] opacity-20" />
                    </div>
                  </div>
                </div>

                <div className="pt-8 space-y-4">
                  <button 
                    onClick={() => {
                      if (stripeUrl) {
                        window.open(stripeUrl, '_blank', 'noopener,noreferrer');
                      } else {
                        handleCreateOrder();
                      }
                    }}
                    disabled={isSubmitting}
                    className={cn(
                      "w-full py-6 font-black uppercase tracking-[0.4em] text-sm transition-all flex items-center justify-center gap-3 shadow-2xl active:scale-95 disabled:opacity-50 relative overflow-hidden group",
                      stripeUrl 
                        ? "bg-green-600 text-white hover:bg-green-500" 
                        : "bg-[#f7c600] text-black hover:bg-white"
                    )}
                  >
                    <AnimatePresence mode="wait">
                      {isSubmitting ? (
                        <motion.div 
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-3"
                        >
                          <Loader2 className="animate-spin" size={20} />
                          <span>Processando...</span>
                        </motion.div>
                      ) : (
                        <motion.div 
                          key="idle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-3"
                        >
                          <span>{stripeUrl ? "Confirmar Pagamento" : "Pagar Agora"}</span>
                          <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </button>

                  <AnimatePresence>
                    {stripeUrl && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 pt-4"
                      >
                        <div className="bg-green-600/10 border border-green-600/20 p-6 text-center space-y-4 rounded-lg">
                          <div className="w-12 h-12 bg-green-600/20 rounded-full flex items-center justify-center mx-auto mb-2">
                             <CreditCard className="text-green-500" size={24} />
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-green-500">
                             Checkout Pronto!
                          </p>
                          <p className="text-[10px] text-white/50 font-bold uppercase tracking-tight leading-relaxed">
                             Se o checkout não abriu automaticamente, clique no botão acima para pagar com total segurança em uma nova aba.
                          </p>
                          <a 
                            href={stripeUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-green-600 text-white px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-green-500 transition-all shadow-lg hover:shadow-green-600/20 active:scale-95"
                          >
                             PAGAR EM NOVA ABA <ExternalLink size={14} />
                          </a>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex flex-col items-center gap-4 pt-6 opacity-30 select-none grayscale">
                    <div className="flex items-center gap-6">
                       <Shield size={24} />
                       <Lock size={22} />
                       <CreditCard size={24} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Background decoration */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#f7c600]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-[#f7c600]/3 blur-[100px] rounded-full" />
      </div>
    </div>
  );
}

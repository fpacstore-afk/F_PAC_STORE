import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowRight, Loader2, ArrowLeft, 
  CreditCard, Lock, Shield, CheckCircle, MapPin, Smartphone
} from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { doc, setDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeFirestoreData } from '../lib/firebase';
import toast from 'react-hot-toast';
import { getApiUrl } from '../lib/api';

export function Checkout() {
  const navigate = useNavigate();
  const { 
    items, subtotal, total, shipping, couponDiscount, pixDiscount, flashSaleDiscount, coupon, observations, paymentMethod,
    customerInfo, clear 
  } = useCart();
  const { user } = useAuth();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [checkoutStarted, setCheckoutStarted] = useState(false);
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
    if (!createdOrderId) {
      if (items.length === 0) {
        console.warn("⚠️ [Checkout] Sacola vazia, redirecionando...");
        navigate('/bag');
      } else if (!customerInfo.name) {
        console.warn("⚠️ [Checkout] Nome do cliente ausente, redirecionando...");
        navigate('/bag');
      }
    }
  }, [items.length, customerInfo.name, navigate, createdOrderId]);

  const handleCreateOrder = async () => {
    if (!customerInfo.name) return;
    setIsSubmitting(true);
    
    const orderId = pendingOrderId;

    try {
      // 1. Snapshot the current cart state
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

      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', orderId);
        
        // Objeto de pedido estruturado e tipado
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
            complement: String(customerInfo.complement || "").trim(), 
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
        
        console.log("📝 [Order] Salvando no Firestore:", orderId, cleanedOrderData);
        transaction.set(orderRef, cleanedOrderData);
      });

      setOrderSummary(summary);
      setCreatedOrderId(orderId);
      setCheckoutStarted(true);
      toast.success("Pedido registrado! Redirecionando para o pagamento...");

      // Criar Sessão Stripe Checkout
      console.log("🚀 [Checkout] Solicitando sessão Stripe...");
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

      console.log(`📡 [Checkout] Status da Resposta API: ${stripeRes.status}`);

      let stripeSession;
      const responseText = await stripeRes.text();
      
      try {
        stripeSession = JSON.parse(responseText);
        console.log("📦 [Checkout] Resposta da API parseada com sucesso:", stripeSession);
      } catch (parseError) {
        console.error("❌ [Checkout] Falha ao parsear JSON da API. Recebido:", responseText);
        throw new Error("O servidor retornou uma resposta inválida (não JSON). Verifique os logs do servidor.");
      }

      if (stripeSession.url) {
        console.log(`✅ [Checkout] Sessão Stripe criada com sucesso: ${stripeSession.url}`);
        setStripeUrl(stripeSession.url);
        
        // Tentar o redirecionamento automático
        const inIframe = window.self !== window.top;
        if (inIframe) {
          console.warn("⚠️ [Checkout] Detectada execução em iFrame. Stripe pode bloquear o redirecionamento automático.");
          toast.success("Pagamento preparado! Clique no botão abaixo para concluir com segurança.");
        } else {
          // Se não for iframe, tenta navegar direto
          window.location.href = stripeSession.url;
        }
      } else {
        const errorMsg = stripeSession.detail || stripeSession.error || "Erro desconhecido ao criar sessão.";
        console.error(`❌ [Checkout] Erro na sessão Stripe: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Erro ao processar checkout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayCustomerInfo = orderSummary?.customerInfo || customerInfo;

  if (!displayCustomerInfo.name && !createdOrderId) return null;

  return (
    <div className="min-h-screen pt-32 pb-24 bg-[#fafafa]">
      <div className="max-w-4xl mx-auto px-4 md:px-0">
        
        {/* Step Header */}
        <div className="flex items-center gap-4 mb-10">
          <button onClick={() => navigate('/bag')} className="p-2 hover:bg-black/5 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Finalizar Pedido</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main Content (Review & Payment) */}
          <div className="lg:col-span-12 space-y-8">
            <div className="bg-white border border-black/5 shadow-2xl overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2">
                
                {/* Left: Review Details */}
                <div className="p-8 md:p-10 border-b md:border-b-0 md:border-r border-black/5 bg-[#fafafa]/50">
                  <div className="space-y-10">
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#eab308] mb-4">01. Entrega Estimada</h3>
                      <div className="space-y-1 text-sm font-medium italic text-gray-600" id="delivery-details-summary">
                        <p className="text-black font-black not-italic text-lg mb-2">{displayCustomerInfo.name}</p>
                        <p>
                          {typeof displayCustomerInfo.address === 'object' 
                            ? (displayCustomerInfo.address as any).street 
                            : displayCustomerInfo.address}, {displayCustomerInfo.number}
                        </p>
                        {displayCustomerInfo.complement && <p>Complemento: {displayCustomerInfo.complement}</p>}
                        <p>{displayCustomerInfo.neighborhood}, {displayCustomerInfo.city} - {displayCustomerInfo.state}</p>
                        <p className="text-black font-black not-italic pt-4 flex items-center gap-2">
                          <MapPin size={14} className="text-[#eab308]" /> CEP {displayCustomerInfo.cep}
                        </p>
                        <p className="pt-2 flex items-center gap-2" id="customer-phone-display"><Smartphone size={14} className="text-[#eab308]" /> {displayCustomerInfo.phone}</p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#eab308] mb-4">02. Pagamento Escolhido</h3>
                      <div className="flex items-center gap-4 bg-black text-white p-5 border border-white/10 shadow-xl">
                        <CreditCard className="text-[#eab308]" size={24} />
                        <div className="flex flex-col">
                          <span className="font-black uppercase tracking-widest text-[11px]">
                            Stripe Checkout
                          </span>
                          <span className="text-[9px] text-white/40 uppercase font-bold">
                            Ambiente Seguro & Criptografado
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Items & Totals */}
                <div className="p-8 md:p-10 flex flex-col">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#eab308]">03. Resumo da Sacola</h3>
                    <span className="bg-black text-[#eab308] text-[9px] font-black px-3 py-1 uppercase tracking-widest italic">
                      ID: {createdOrderId || pendingOrderId}
                    </span>
                  </div>

                  <div className="space-y-6 flex-1 max-h-[350px] overflow-y-auto pr-4 scrollbar-hide mb-8">
                    {(orderSummary?.items || items).map((item, i) => (
                      <div key={i} className="flex gap-4 items-center group">
                        <div className="relative w-16 h-20 bg-black/5 flex-shrink-0">
                          <img src={item.image || undefined} alt={item.name} className="w-full h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black uppercase truncate">{item.name}</p>
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight mb-2">
                            {item.quantity}x • {item.size} • {item.color}
                          </p>
                        </div>
                        <span className="text-xs font-black">R$ {(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3 pt-6 border-t border-black/5">
                    <div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                      <span>Subtotal</span>
                      <span className="text-black">R$ {(orderSummary?.subtotal || subtotal).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                       <span>Entrega</span>
                       <span className={cn((orderSummary?.shipping || shipping) === 0 ? "text-[#eab308] font-black italic" : "text-black")}>
                        {(orderSummary?.shipping || shipping) === 0 ? 'GRÁTIS' : `R$ ${(orderSummary?.shipping || shipping).toFixed(2)}`}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-end pt-6 border-t-2 border-black mt-4">
                      <span className="text-xs font-black uppercase tracking-[0.3em]">Total Final</span>
                      <span className="text-4xl font-black leading-none tracking-tighter">R$ {(orderSummary?.total || total).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Area */}
              <div className="p-8 md:p-12 bg-black text-white flex flex-col items-center">
                <div className="w-full max-w-md mx-auto space-y-6">
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
                      "w-full py-6 font-black uppercase tracking-[0.4em] text-sm transition-all flex items-center justify-center gap-3 shadow-2xl active:scale-95 disabled:opacity-50",
                      stripeUrl 
                        ? "bg-green-500 text-white hover:bg-green-600 animate-bounce shadow-green-500/20" 
                        : "bg-[#eab308] text-black hover:bg-white"
                    )}
                  >
                    {isSubmitting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      stripeUrl ? "Confirmar e Pagar Agora" : "Ir para o Pagamento"
                    )}
                    {!isSubmitting && <ArrowRight size={20} />}
                  </button>

                  {stripeUrl && (
                    <div className="bg-green-500/10 border border-green-500/20 p-4 text-center space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-green-400">
                        Pronto para o Checkout!
                      </p>
                      <p className="text-[9px] text-white/60 font-bold uppercase tracking-tighter">
                        Como você está em um ambiente integrado, recomendamos abrir o pagamento em uma nova aba segura.
                      </p>
                      <a 
                        href={stripeUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-block bg-green-500 text-white px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-green-600 transition-colors shadow-lg"
                      >
                        PAGAR EM NOVA ABA
                      </a>
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-6 text-[9px] text-white/30 font-black uppercase tracking-[0.3em]">
                    <span className="flex items-center gap-1.5"><Shield size={12} className="text-[#eab308]" /> Compra Segura via Stripe</span>
                    <span className="flex items-center gap-1.5"><Lock size={12} className="text-[#eab308]" /> SSL 256-BIT</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ShieldCheck, ArrowRight, Loader2, ArrowLeft, 
  CreditCard, QrCode, Lock, Shield, CheckCircle, MapPin, Smartphone
} from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { doc, setDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import toast from 'react-hot-toast';
import { getApiUrl } from '../lib/api';
import { TransparentCheckout } from '../components/TransparentCheckout';

export function Checkout() {
  const navigate = useNavigate();
  const { 
    items, subtotal, total, shipping, couponDiscount, pixDiscount, flashSaleDiscount, coupon, observations, paymentMethod,
    customerInfo, clear 
  } = useCart();
  const { user } = useAuth();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [mpPublicKey, setMpPublicKey] = useState<string | null>(null);
  const [mpConfigError, setMpConfigError] = useState<string | null>(null);
  const [checkoutStarted, setCheckoutStarted] = useState(false);
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

  // Fetch MP Config with timeout
    const fetchConfig = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        // Use window.location.origin explicitly or relative path to ensure hitting the same host
        const res = await fetch(getApiUrl('/api/payment-config'), { 
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);
        
        const contentType = res.headers.get("content-type");
        if (!res.ok || !contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          console.error("❌ [Checkout] Expected JSON but received:", contentType, "Status:", res.status, text.substring(0, 100));
          throw new Error(`Erro na API (${res.status}): Retorno não é JSON. Verifique se o backend está ativo.`);
        }

        const data = await res.json();
        if (data.publicKey) {
          setMpPublicKey(data.publicKey);
        } else {
          console.warn("⚠️ MP Public Key is null in server response");
          setMpConfigError("Chave do Mercado Pago não configurada no servidor.");
        }
      } catch (err) {
        console.error("Error fetching MP config:", err);
        setMpConfigError("Erro ao conectar com as configurações de pagamento.");
      }
    };

    fetchConfig();
  }, [items.length, customerInfo.name, navigate, createdOrderId]);

  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const [isCreatingPreference, setIsCreatingPreference] = useState(false);

  const handleCreateOrder = async () => {
    if (!customerInfo.name) return;
    setIsSubmitting(true);
    setPreferenceId(null); // Reset preference before creating a new one
    
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

      // Limpeza profunda de dados para evitar "Unsupported field value: undefined" no Firestore
      const sanitize = (val: any): any => {
        if (val === undefined) return null;
        if (val === null) return null;
        if (Array.isArray(val)) return val.map(sanitize);
        if (typeof val === 'object') {
          const cleaned: any = {};
          for (const key in val) {
            const sanitizedVal = sanitize(val[key]);
            if (sanitizedVal !== undefined) {
              cleaned[key] = sanitizedVal;
            }
          }
          return cleaned;
        }
        return val;
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
          paymentMethod: String(paymentMethod || "CREDIT_CARD").toUpperCase(),
          status: 'pending',
          createdAt: serverTimestamp()
        };

        const cleanedOrderData = sanitize(rawOrderData);
        
        console.log("📝 [Order] Salvando no Firestore:", orderId, cleanedOrderData);
        transaction.set(orderRef, cleanedOrderData);
      });

      setOrderSummary(summary);
      setCreatedOrderId(orderId);
      setCheckoutStarted(true);
      toast.success("Pedido registrado com sucesso!");

      // Notificar servidor para enviar e-mail de recebimento (Assíncrono)
      fetch(getApiUrl('/api/notify-order'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ orderId })
      }).then(async r => {
        if (!r.ok) {
          const text = await r.text();
          console.error(`❌ [API] Falha ao notificar e-mail (${r.status}):`, text.substring(0, 100));
        } else {
          console.log(`✅ [API] E-mail de recebimento solicitado para #${orderId}`);
        }
      }).catch(err => console.error("Erro ao notificar e-mail:", err));
      
    } catch (error) {
      console.error("Checkout error:", error);
      handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = (paymentId: string) => {
    if (createdOrderId) {
      navigate(`/order/${createdOrderId}?paymentId=${paymentId}`);
    }
  };

  const handlePaymentFailure = (error: any) => {
    console.error("Payment failed UI:", error);
  };

  const displayCustomerInfo = orderSummary?.customerInfo || customerInfo;

  // Memoize data for the payment brick to prevent unnecessary re-renders
  const mpCustomerData = React.useMemo(() => ({
    email: displayCustomerInfo.email,
    name: displayCustomerInfo.name,
    cpf: displayCustomerInfo.cpf
  }), [displayCustomerInfo.email, displayCustomerInfo.name, displayCustomerInfo.cpf]);

  if (!displayCustomerInfo.name && !createdOrderId) return null;

  return (
    <div className="min-h-screen pt-32 pb-24 bg-[#fafafa]">
      <div className="max-w-4xl mx-auto px-4 md:px-0">
        
        {/* Step Header */}
        <div className="flex items-center gap-4 mb-10">
          {!createdOrderId ? (
            <>
              <button onClick={() => navigate('/bag')} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                <ArrowLeft size={24} />
              </button>
              <h1 className="text-3xl font-black uppercase tracking-tighter">Finalizar Pedido</h1>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[#eab308]">
                <CheckCircle size={24} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Pedido #{createdOrderId} Recebido</span>
              </div>
              <h1 className="text-3xl font-black uppercase tracking-tighter italic">Pague Agora e Estilize Seu Mundo</h1>
            </div>
          )}
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
                        {(orderSummary?.paymentMethod || paymentMethod) === 'PIX' ? <QrCode className="text-[#eab308]" size={24} /> : <CreditCard className="text-[#eab308]" size={24} />}
                        <div className="flex flex-col">
                          <span className="font-black uppercase tracking-widest text-[11px]">
                            {(orderSummary?.paymentMethod || paymentMethod) === 'PIX' ? 'Pagamento via PIX' : 'Cartão de Crédito'}
                          </span>
                          <span className="text-[9px] text-white/40 uppercase font-bold">
                            {(orderSummary?.paymentMethod || paymentMethod) === 'PIX' ? '5% de desconto automático' : 'Até 12x sem juros'}
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
                          {item.printConfigs && item.printConfigs.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.printConfigs.map((cfg: any, idx: number) => (
                                <span key={idx} className="text-[7px] font-black uppercase bg-black/5 px-1.5 py-0.5 rounded-none text-black/50">
                                  {cfg.location} ({cfg.printSize})
                                </span>
                              ))}
                            </div>
                          )}
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
                      <div className="flex flex-col">
                        <span>Entrega</span>
                        <p className="text-[9px] text-black font-black tracking-widest uppercase bg-[#eab308] px-2 py-1 rounded-none mt-1 shadow-sm">
                          FRETE GRÁTIS [ +2 PEÇAS ]
                        </p>
                      </div>
                      <span className={cn((orderSummary?.shipping || shipping) === 0 ? "text-[#eab308] font-black text-lg italic" : "text-black")}>
                        {(orderSummary?.shipping || shipping) === 0 ? 'GRÁTIS' : `R$ ${(orderSummary?.shipping || shipping).toFixed(2)}`}
                      </span>
                    </div>
                    {((orderSummary?.flashSaleDiscount || flashSaleDiscount) > 0 || (orderSummary?.couponDiscount || couponDiscount) > 0 || (orderSummary?.pixDiscount || pixDiscount) > 0) && (
                      <div className="py-2 space-y-2">
                        {(orderSummary?.flashSaleDiscount || flashSaleDiscount) > 0 && (
                          <div className="flex justify-between text-[11px] font-black text-[#eab308] uppercase italic tracking-tighter">
                            <span>Drop Relâmpago</span>
                            <span>- R$ {(orderSummary?.flashSaleDiscount || flashSaleDiscount).toFixed(2)}</span>
                          </div>
                        )}
                        {(orderSummary?.couponDiscount || couponDiscount) > 0 && (
                          <div className="flex justify-between text-[11px] font-black text-[#eab308] uppercase tracking-widest">
                            <span>Cupom Desconto</span>
                            <span>- R$ {(orderSummary?.couponDiscount || couponDiscount).toFixed(2)}</span>
                          </div>
                        )}
                        {(orderSummary?.pixDiscount || pixDiscount) > 0 && (
                          <div className="flex justify-between text-[11px] font-black text-[#eab308] uppercase tracking-widest">
                            <span>Desconto PIX (5%)</span>
                            <span>- R$ {(orderSummary?.pixDiscount || pixDiscount).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-between items-end pt-6 border-t-2 border-black mt-4">
                      <span className="text-xs font-black uppercase tracking-[0.3em]">Total Final</span>
                      <span className="text-4xl font-black leading-none tracking-tighter">R$ {(orderSummary?.total || total).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Area */}
              <div className="p-8 md:p-12 bg-black text-white flex flex-col items-center">
                {!createdOrderId ? (
                  <div className="w-full max-w-md mx-auto space-y-6">
                    <button 
                      onClick={handleCreateOrder}
                      disabled={isSubmitting}
                      className="w-full bg-[#eab308] text-black py-6 font-black uppercase tracking-[0.4em] text-sm hover:bg-white transition-all flex items-center justify-center gap-3 shadow-2xl active:scale-95 disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" /> : "Confirmar e Pagamento"}
                      {!isSubmitting && <ArrowRight size={20} />}
                    </button>
                    <div className="flex items-center justify-center gap-6 text-[9px] text-white/30 font-black uppercase tracking-[0.3em]">
                      <span className="flex items-center gap-1.5"><Shield size={12} className="text-[#eab308]" /> Compra Segura</span>
                      <span className="flex items-center gap-1.5"><Lock size={12} className="text-[#eab308]" /> SSL 256-BIT</span>
                    </div>
                  </div>
                ) : (mpPublicKey) ? (
                  <div className="w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="mb-10 text-center">
                      <h3 className="text-2xl font-black uppercase tracking-tighter italic mb-2">
                        Complete sua Atitude
                      </h3>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]/60 italic">
                        Processado em ambiente de segurança máxima via Mercado Pago
                      </p>
                    </div>
                    <div className="bg-white p-1 md:p-4 rounded-none overflow-hidden">
                      <TransparentCheckout 
                        publicKey={mpPublicKey}
                        preferenceId={null}
                        orderId={createdOrderId}
                        amount={orderSummary?.total || total}
                        paymentMethod={orderSummary?.paymentMethod || paymentMethod}
                        customerInfo={mpCustomerData}
                        onSuccess={handlePaymentSuccess}
                        onFailure={handlePaymentFailure}
                      />
                    </div>
                  </div>
                ) : mpConfigError ? (
                  <div className="text-center py-12 bg-red-950/20 border border-red-500/20 p-8 max-w-md mx-auto">
                    <ShieldCheck className="text-red-500 mx-auto mb-4 opacity-50" size={40} />
                    <h2 className="text-xl font-black uppercase tracking-tighter text-red-500 mb-2">Erro de Conexão</h2>
                    <p className="text-[10px] font-bold text-red-500/60 uppercase tracking-widest mb-6">{mpConfigError}</p>
                    <button 
                      onClick={() => window.location.reload()}
                      className="bg-red-600 text-white px-8 py-3 font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all"
                    >
                      Tentar Novamente
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Loader2 className="animate-spin text-[#eab308] mx-auto mb-4" size={40} strokeWidth={3} />
                    <h2 className="text-xl font-black uppercase tracking-tighter italic mb-1">Iniciando Checkout...</h2>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Aguarde a conexão segura</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

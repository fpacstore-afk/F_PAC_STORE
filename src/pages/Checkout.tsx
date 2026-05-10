import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ShieldCheck, ArrowRight, Loader2, ArrowLeft, 
  CreditCard, QrCode, Lock, Shield, CheckCircle
} from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { doc, setDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';
import { getApiUrl } from '../lib/api';

export function Checkout() {
  const navigate = useNavigate();
  const { 
    items, subtotal, total, shipping, couponDiscount, pixDiscount, coupon, observations, paymentMethod,
    customerInfo, clear 
  } = useCart();
  const { user } = useAuth();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [pendingOrderId] = useState(() => `PAC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`);
  const [orderSummary, setOrderSummary] = useState<{
    items: any[];
    subtotal: number;
    total: number;
    shipping: number;
    couponDiscount: number;
    pixDiscount: number;
    customerInfo: any;
    paymentMethod: string;
  } | null>(null);

  // Validation before allowing view
  useEffect(() => {
    if (!createdOrderId && (items.length === 0 || !customerInfo.name)) {
      navigate('/bag');
    }
  }, [items.length, customerInfo.name, navigate, createdOrderId]);

  const handleCreateOrder = async () => {
    if (!customerInfo.name) return;
    setIsSubmitting(true);
    
    const orderId = pendingOrderId;

    try {
      // 1. Snapshot the current cart state before clearing
      const summary = {
        items: [...items],
        subtotal,
        total,
        shipping,
        couponDiscount,
        pixDiscount,
        customerInfo: { ...customerInfo },
        paymentMethod
      };

      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', orderId);
        transaction.set(orderRef, {
          userId: user?.uid || null,
          customerName: customerInfo.name,
          customerEmail: customerInfo.email,
          customerPhone: customerInfo.phone,
          cpf: customerInfo.cpf,
          address: {
            cep: customerInfo.cep,
            street: customerInfo.address,
            number: customerInfo.number,
            complement: customerInfo.complement,
            neighborhood: customerInfo.neighborhood,
            city: customerInfo.city,
            state: customerInfo.state
          },
          items: items.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            size: item.size,
            color: item.color,
            image: item.image,
            printConfigs: item.printConfigs || []
          })),
          subtotal,
          shipping,
          couponDiscount,
          pixDiscount,
          total,
          coupon,
          observations,
          paymentMethod,
          status: 'pending',
          createdAt: serverTimestamp()
        });
      });

      setOrderSummary(summary);
      setCreatedOrderId(orderId);
      
      // 2. Criar Preferência no Mercado Pago (Checkout Pro)
      const mpResponse = await fetch(getApiUrl('/api/create_preference'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: summary.items,
          orderId,
          customerEmail: summary.customerInfo.email,
          customerName: summary.customerInfo.name,
          total: summary.total
        })
      });

      const mpData = await mpResponse.json();
      
      // Limpa o carrinho
      clear();

      if (mpData.init_point) {
        toast.success("Redirecionando para o pagamento...");
        // Pequeno delay para o toast ser lido
        setTimeout(() => {
          window.location.href = mpData.init_point;
        }, 1500);
      } else {
        toast.success("Pedido registrado! Você será redirecionado.");
        setTimeout(() => navigate(`/order/${orderId}`), 2000);
      }
      
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Erro ao processar pedido. Tente novamente.");
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Summary & Confirmation */}
          <div className="lg:col-span-12 space-y-8">
            
            <div className="bg-white border border-black/5 p-8 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                
                {/* Review Details */}
                <div className="space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-widest border-b border-black/5 pb-3">Resumo da Entrega</h3>
                  <div className="text-sm space-y-1 text-gray-600 font-medium italic">
                    <p className="text-black font-bold not-italic">{displayCustomerInfo.name}</p>
                    <p>
                      {typeof displayCustomerInfo.address === 'object' 
                        ? (displayCustomerInfo.address as any).street 
                        : displayCustomerInfo.address}, {displayCustomerInfo.number}
                    </p>
                    {displayCustomerInfo.complement && <p>{displayCustomerInfo.complement}</p>}
                    <p>{displayCustomerInfo.neighborhood}, {displayCustomerInfo.city} - {displayCustomerInfo.state}</p>
                    <p className="text-black font-bold not-italic pt-2">CEP {displayCustomerInfo.cep}</p>
                    <p className="pt-2">{displayCustomerInfo.phone}</p>
                  </div>


                  <div className="pt-6">
                    <h3 className="text-sm font-black uppercase tracking-widest border-b border-black/5 pb-3 mb-4">Pagamento Escolhido</h3>
                    <div className="flex items-center gap-3 bg-black/5 p-4 border border-black/5">
                      {(orderSummary?.paymentMethod || paymentMethod) === 'PIX' ? <QrCode className="text-[#eab308]" /> : <CreditCard className="text-[#eab308]" />}
                      <span className="font-black uppercase tracking-widest text-xs">
                        {(orderSummary?.paymentMethod || paymentMethod) === 'PIX' ? 'Pagamento via PIX (5% OFF)' : 'Cartão de Crédito / Débito'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items & Totals */}
                <div className="space-y-6">
                  <div className="flex justify-between items-center border-b border-black/5 pb-3">
                    <h3 className="text-sm font-black uppercase tracking-widest">Seu Pedido</h3>
                    <span className="text-[10px] font-black text-[#eab308] uppercase tracking-widest">
                      ID: {createdOrderId || pendingOrderId}
                    </span>
                  </div>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                    {(orderSummary?.items || items).map((item, i) => (
                      <div key={i} className="flex gap-4 items-center">
                        <img src={item.image || undefined} alt={item.name} className="w-12 h-16 object-contain bg-black/5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold uppercase truncate">{item.name}</p>
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-tight mb-2">{item.quantity}x • {item.size} • {item.color}</p>
                          {item.printConfigs && item.printConfigs.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1 border-t border-black/5 pt-2">
                              {item.printConfigs.map((cfg: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-1.5 bg-black/5 p-1 pr-2 rounded-sm" title={`${cfg.stamp} em ${cfg.location}`}>
                                   {cfg.image && <img src={cfg.image} className="w-4 h-4 object-contain" alt="" />}
                                   <span className="text-[8px] font-black uppercase tracking-tighter text-black/60 truncate max-w-[60px]">{cfg.location}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-black">R$ {(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 space-y-2 border-t border-black/5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-gray-400 uppercase tracking-widest">Subtotal</span>
                      <span>R$ {(orderSummary?.subtotal || subtotal).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-gray-400 uppercase tracking-widest">Entrega</span>
                      <span className={cn((orderSummary?.shipping || shipping) === 0 ? "text-[#eab308]" : "")}>
                        {(orderSummary?.shipping || shipping) === 0 ? 'GRÁTIS' : `R$ ${(orderSummary?.shipping || shipping).toFixed(2)}`}
                      </span>
                    </div>
                    {(orderSummary?.couponDiscount || couponDiscount) > 0 && (
                      <div className="flex justify-between text-xs font-black text-[#eab308]">
                        <span className="uppercase tracking-widest">Desconto Cupom</span>
                        <span>- R$ {(orderSummary?.couponDiscount || couponDiscount).toFixed(2)}</span>
                      </div>
                    )}
                    {(orderSummary?.pixDiscount || pixDiscount) > 0 && (
                      <div className="flex justify-between text-xs font-black text-[#eab308]">
                        <span className="uppercase tracking-widest">Desconto PIX</span>
                        <span>- R$ {(orderSummary?.pixDiscount || pixDiscount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-end pt-4">
                      <span className="text-xs font-black uppercase tracking-[0.2em]">Total</span>
                      <span className="text-3xl font-black leading-none">R$ {(orderSummary?.total || total).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button (Before Order Created) */}
              {!createdOrderId && (
                <div className="mt-12 flex flex-col items-center gap-6">
                  <button 
                    onClick={handleCreateOrder}
                    disabled={isSubmitting}
                    className="w-full bg-[#eab308] text-black py-6 font-black uppercase tracking-[0.3em] text-sm hover:bg-black hover:text-[#eab308] transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : "Confirmar e Finalizar Pedido"}
                    {!isSubmitting && <ArrowRight size={20} />}
                  </button>
                  
                  <div className="flex items-center gap-6 text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">
                    <span className="flex items-center gap-1.5"><Shield size={12} className="text-[#eab308]" /> Compra Segura</span>
                    <span className="flex items-center gap-1.5"><Lock size={12} className="text-[#eab308]" /> Dados Criptografados</span>
                  </div>
                </div>
              )}

              {/* Feedback de Redirecionamento (Após Order Created) */}
              {createdOrderId && (
                <div className="mt-12 animate-in fade-in slide-in-from-top-4 duration-500 text-center py-12">
                   <Loader2 className="animate-spin text-[#eab308] mx-auto mb-4" size={40} />
                   <h2 className="text-2xl font-black uppercase tracking-tighter italic mb-2">Processando Identidade...</h2>
                   <p className="text-sm text-gray-500 font-medium italic">Você será redirecionado para o pagamento seguro em instantes.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

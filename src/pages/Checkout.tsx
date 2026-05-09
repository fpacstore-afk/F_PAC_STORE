import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ShieldCheck, ArrowRight, Loader2, ArrowLeft, 
  CreditCard, QrCode, Lock, Shield, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { doc, setDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { Payment } from '@mercadopago/sdk-react';
import { initMercadoPago } from '@mercadopago/sdk-react';
import toast from 'react-hot-toast';
import { getApiUrl, getBaseUrl } from '../lib/api';

// Initialize MP
const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY || 'APP_USR-75896684-2973-4560-9946-b2585c57502b';
initMercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });

export function Checkout() {
  const navigate = useNavigate();
  const { 
    items, subtotal, total, shipping, couponDiscount, pixDiscount, coupon, observations, paymentMethod,
    customerInfo, clear 
  } = useCart();
  const { user } = useAuth();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [orderSummary, setOrderSummary] = useState<{
    items: any[];
    subtotal: number;
    total: number;
    shipping: number;
    couponDiscount: number;
    pixDiscount: number;
    customerInfo: any;
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
    
    const orderId = `PAC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    try {
      // 1. Snapshot the current cart state before clearing
      const summary = {
        items: [...items],
        subtotal,
        total,
        shipping,
        couponDiscount,
        pixDiscount,
        customerInfo: { ...customerInfo }
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
      
      // Trigger confirmation email
      try {
        await fetch(getApiUrl('/api/send-confirmation'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: summary.customerInfo.email,
            customerName: summary.customerInfo.name,
            orderId,
            items: summary.items,
            totals: { 
              subtotal: summary.subtotal, 
              frete: summary.shipping, 
              couponDiscount: summary.couponDiscount, 
              pixDiscount: summary.pixDiscount, 
              finalTotal: summary.total 
            },
            status: 'pending',
            address: summary.customerInfo,
            paymentMethod,
            paymentLink: `${getBaseUrl()}/#/order/${orderId}`
          })
        });
      } catch (e) {
        console.error("Email fail:", e);
      }

      // Clear cart from global state, but we kept a local snapshot in orderSummary
      clear();
      toast.success("Pedido registrado com sucesso!");
      
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Erro ao processar pedido. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSubmit = async ({ formData: mpFormData }: any) => {
    if (!createdOrderId) return;
    setIsSubmitting(true);
    
    try {
      const response = await fetch(getApiUrl('/api/process_payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: {
            ...mpFormData,
            external_reference: createdOrderId,
            description: `Pedido F PAC STORE #${createdOrderId}`
          }
        }),
      });

      const result = await response.json();
      
      if (response.ok) {
        if (result.status === 'approved') {
          toast.success("Pagamento aprovado!");
          setTimeout(() => navigate(`/order/${createdOrderId}`), 2000);
        } else if (result.status === 'in_process') {
          toast.success("Pagamento em processamento.");
          setTimeout(() => navigate(`/order/${createdOrderId}`), 2000);
        } else {
          toast.error("Pagamento recusado ou pendente.");
        }
      } else {
        toast.error("Falha ao processar pagamento.");
      }
    } catch (error) {
      toast.error("Erro de conexão com o meio de pagamento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayCustomerInfo = orderSummary?.customerInfo || customerInfo;

  const paymentInitialization = useMemo(() => {
    if (!createdOrderId) return undefined;
    return {
      amount: Number((orderSummary?.total || total).toFixed(2)),
      payer: {
        email: displayCustomerInfo.email,
      }
    };
  }, [createdOrderId, orderSummary?.total, total, displayCustomerInfo.email]);

  const paymentCustomization = useMemo(() => ({
    visual: {
      style: {
        theme: 'flat' as const,
      }
    },
    paymentMethods: {
      creditCard: 'all' as const,
      debitCard: 'all' as const,
    }
  }), []);

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
                    <p>{displayCustomerInfo.address}, {displayCustomerInfo.number}</p>
                    {displayCustomerInfo.complement && <p>{displayCustomerInfo.complement}</p>}
                    <p>{displayCustomerInfo.neighborhood}, {displayCustomerInfo.city} - {displayCustomerInfo.state}</p>
                    <p className="text-black font-bold not-italic pt-2">CEP {displayCustomerInfo.cep}</p>
                    <p className="pt-2">{displayCustomerInfo.phone}</p>
                  </div>


                  <div className="pt-6">
                    <h3 className="text-sm font-black uppercase tracking-widest border-b border-black/5 pb-3 mb-4">Pagamento Escolhido</h3>
                    <div className="flex items-center gap-3 bg-black/5 p-4 border border-black/5">
                      {paymentMethod === 'PIX' ? <QrCode className="text-[#eab308]" /> : <CreditCard className="text-[#eab308]" />}
                      <span className="font-black uppercase tracking-widest text-xs">
                        {paymentMethod === 'PIX' ? 'Pagamento via PIX (5% OFF)' : 'Cartão de Crédito / Débito'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items & Totals */}
                <div className="space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-widest border-b border-black/5 pb-3">Seu Pedido</h3>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                    {(orderSummary?.items || items).map((item, i) => (
                      <div key={i} className="flex gap-4 items-center">
                        <img src={item.image} alt={item.name} className="w-12 h-16 object-cover bg-black/5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold uppercase truncate">{item.name}</p>
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-tight">{item.quantity}x • {item.size} • {item.color}</p>
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

              {/* Action Button */}
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

              {/* Mercado Pago Brick */}
              {createdOrderId && paymentMethod !== 'PIX' && (
                <div className="mt-12 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="mb-8 text-center bg-gray-50 border border-black/5 p-6">
                    <div className="inline-flex items-center gap-2 bg-[#fffcf0] border border-[#eab308]/20 px-6 py-2 rounded-full mb-4">
                      <CreditCard size={14} className="text-[#eab308]" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#854d0e]">Pagamento via Mercado Pago</span>
                    </div>
                    <p className="text-sm text-black font-bold uppercase tracking-widest mb-1 italic">Realize o Pagamento Agora</p>
                    <p className="text-[10px] text-gray-500 font-medium italic">Seu pedido já foi enviado ao seu email {customerInfo.email}.</p>
                  </div>
                  
                  <div key={`mp-brick-${createdOrderId}`}>
                    <Payment
                      initialization={paymentInitialization!}
                      customization={paymentCustomization}
                      onSubmit={handlePaymentSubmit}
                    />
                  </div>
                </div>
              )}

              {createdOrderId && paymentMethod === 'PIX' && (
                <div className="mt-12 animate-in fade-in slide-in-from-top-4 duration-500 bg-white border-2 border-black p-10 text-center">
                   <div className="w-20 h-20 bg-black text-[#eab308] rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
                     <QrCode size={40} />
                   </div>
                   <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">QUASE LÁ!</h2>
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308] mb-6">Pedido Confirmado</p>
                   
                   <div className="max-w-sm mx-auto space-y-6 text-center">
                     <p className="text-sm text-gray-500 italic leading-relaxed">
                       Seu pedido foi registrado! Enviamos os detalhes para seu e-mail. Para agilizar, pague via PIX usando os dados abaixo:
                     </p>

                     <div className="bg-black/5 p-6 border border-black/5 rounded-xl space-y-4">
                       <div>
                         <span className="text-[9px] font-black uppercase tracking-widest text-black/40 block mb-2">Chave PIX (E-mail)</span>
                         <span className="text-sm font-black break-all block px-4 py-2 bg-white border border-black/5 select-all">fpacstore@gmail.com</span>
                       </div>
                       <button 
                         onClick={() => {
                           navigator.clipboard.writeText('fpacstore@gmail.com');
                           toast.success('Chave PIX copiada!');
                         }}
                         className="w-full bg-black text-white py-3 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#eab308] hover:text-black transition-all"
                       >
                         Copiar Chave
                       </button>
                     </div>

                     <div className="pt-4 border-t border-black/5 space-y-4">
                       <p className="text-[10px] text-gray-400 font-bold uppercase italic">
                         Após o pagamento, não é necessário enviar o comprovante. Nosso sistema identifica automaticamente.
                       </p>
                       <button 
                         onClick={() => navigate(`/order/${createdOrderId}`)}
                         className="w-full bg-white border border-black text-black py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all flex items-center justify-center gap-2"
                       >
                         Acompanhar Meu Pedido <ArrowRight size={14} />
                       </button>
                     </div>
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

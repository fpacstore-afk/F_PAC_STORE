import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, MapPin, Smartphone
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useCart } from '../hooks/useCart';
import { isJoinvilleCEP, JOINVILLE_DELIVERY_TIME, JOINVILLE_SHIPPING_NAME } from '../lib/shipping';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { PaymentForm } from '../components/PaymentForm';
import { PixDisplay } from '../components/PixDisplay';
import { SuccessModal } from '../components/SuccessModal';
import { analyticsTracker } from '../services/analyticsTracker';

export default function Checkout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    items, subtotal, total, shipping, couponDiscount, pixDiscount, flashSaleDiscount, weeklyPromotionDiscount, weeklyPromotionLabel, customerInfo, clearCart, paymentMethod 
  } = useCart();
  
  const [paymentResult, setPaymentResult] = useState<any | null>(null);

  // Track checkout starting and identify the user
  useEffect(() => {
    if (items.length > 0) {
      analyticsTracker.trackCheckoutStart();
      
      // Identify customer
      if (customerInfo && customerInfo.email) {
        analyticsTracker.identify(
          user?.uid || '',
          customerInfo.email,
          customerInfo.name,
          customerInfo.phone
        );
      }
    }
  }, [items.length, customerInfo, user]);

  // Validation before allowing view
  useEffect(() => {
    if (items.length === 0 && !paymentResult) {
      navigate('/bag');
    } else if (!customerInfo.name && !paymentResult) {
      navigate('/bag');
    }
  }, [items.length, customerInfo.name, navigate, paymentResult]);

  const handlePaymentSuccess = (result: any) => {
    setPaymentResult(result);
    
    // Log purchase event in our analytics
    try {
      const orderId = result.external_reference || `ord_${Date.now()}`;
      analyticsTracker.trackPurchase(orderId, total, items);
      
      // Update identity again in case it changed during checkout
      if (customerInfo && customerInfo.email) {
        analyticsTracker.identify(
          user?.uid || '',
          customerInfo.email,
          customerInfo.name,
          customerInfo.phone
        );
      }
    } catch (e) {
      console.warn('Analytics purchase track fail:', e);
    }
    
    // Se for Cartão, vamos direto para a página de sucesso (pois já foi aprovado)
    if (result.payment_method_id !== 'pix') {
      clearCart();
      navigate('/success', { 
        state: { 
          orderId: result.external_reference,
          trackingAccessToken: result.trackingAccessToken
        } 
      });
    }
    // Se for PIX, o PaymentForm gerencia a exibição do QR Code. 
    // NÃO limpamos o carrinho aqui para não quebrar o resumo lateral, 
    // limparemos no redirecionamento final após confirmação do pagamento.
  };

  if (!customerInfo.name && !paymentResult) return null;

  return (
    <div className="min-h-screen pt-20 pb-16 bg-[#0A0A0A] text-white selection:bg-[#f7c600] selection:text-black font-sans">
      {/* Modal de Sucesso (apenas para Cartão se necessário, mas Pix agora é in-place) */}
      {/* Removemos o modal para Pix para evitar duplicidade com a sidebar */}

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        
        {/* Navigation */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <button 
            onClick={() => navigate('/bag')} 
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors group px-4 py-2 bg-white/5 rounded-full border border-white/10"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Revisar Sacola</span>
          </button>
          
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#f7c600] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Pagamento Transparent</span>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Revision */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-12 xl:col-span-7 space-y-8"
          >
              <div className="space-y-2">
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-none italic">
                  FECHAR <span className="text-[#f7c600]">PEDIDO</span>
                </h1>
                <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em]">Ambiente criptografado e revisado</p>
              </div>

            <div className="bg-[#121212] border border-white/5 p-6 space-y-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <MapPin size={60} />
              </div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">01. Entrega</h3>
              <div>
                <p className="text-xl font-black uppercase tracking-tighter text-white">{customerInfo.name}</p>
                <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mt-1">
                  {customerInfo.email} | {customerInfo.phone}{customerInfo.phone2 ? ` / ${customerInfo.phone2}` : ''}
                </p>
                <p className="text-sm text-white/60 font-medium leading-relaxed mt-4 max-w-sm">
                  {customerInfo.address}, {customerInfo.number}
                  <br />
                  {customerInfo.neighborhood}, {customerInfo.city} - {customerInfo.state}
                  <br />
                  {customerInfo.cep}
                </p>
              </div>
            </div>

            <div className="bg-[#121212] border border-white/5 p-6 space-y-5">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">02. Revisão de Itens</h3>
              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-4 items-center border-b border-white/5 pb-4 last:border-0">
                    <div className="w-12 h-16 bg-white/5 flex-shrink-0 flex items-center justify-center">
                       <img src={item.image || undefined} alt={item.name} className="w-full h-full object-contain p-1" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-tight text-white mb-1">{item.name}</p>
                      <p className="text-[8px] text-white/40 font-bold uppercase tracking-widest">{item.size} | {item.color} | x{item.quantity}</p>
                    </div>
                    <p className="text-xs font-black">R$ {(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right Column: Payment */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-12 xl:col-span-5"
          >
            <div className="sticky top-20 bg-[#121212] border border-white/10 shadow-2xl p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                  <span>Subtotal</span>
                  <span className="text-white">R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                  <span>
                    {customerInfo.cep && isJoinvilleCEP(customerInfo.cep) && (!customerInfo.shippingServiceId || customerInfo.shippingServiceId === 0) ? JOINVILLE_SHIPPING_NAME : (customerInfo.shippingMethodName || "Entrega")}
                  </span>
                  <span className={cn(shipping === 0 ? "text-[#f7c600]" : "text-white")}>
                    {shipping === 0 ? 'GRÁTIS' : `R$ ${shipping.toFixed(2)}`}
                  </span>
                </div>
                {customerInfo.cep && (!isJoinvilleCEP(customerInfo.cep) || (customerInfo.shippingServiceId && customerInfo.shippingServiceId !== 0)) && customerInfo.shippingMethodName && (
                  <div className="flex justify-between text-[8px] font-mono font-bold text-white/40 uppercase tracking-widest">
                    <span>Modalidade</span>
                    <span>{customerInfo.shippingMethodName}</span>
                  </div>
                )}
                {customerInfo.cep && isJoinvilleCEP(customerInfo.cep) && (!customerInfo.shippingServiceId || customerInfo.shippingServiceId === 0) && (
                  <div className="flex justify-between text-[8px] font-mono font-bold text-white/40 uppercase tracking-widest">
                    <span>Prazo Estimado</span>
                    <span>{JOINVILLE_DELIVERY_TIME}</span>
                  </div>
                )}
                {(couponDiscount + pixDiscount + flashSaleDiscount) > 0 && (
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-green-500">
                    <span>Descontos Aplicados</span>
                    <span>- R$ {(couponDiscount + pixDiscount + flashSaleDiscount).toFixed(2)}</span>
                  </div>
                )}
                {weeklyPromotionDiscount !== undefined && weeklyPromotionDiscount > 0 && (
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-[#eab308]">
                    <span>{weeklyPromotionLabel || 'Oferta Ativa'}</span>
                    <span>- R$ {weeklyPromotionDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-6 border-t border-white/5">
                  <div className="flex items-end justify-between">
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">Total a Pagar</p>
                        <h2 className="text-3xl font-black italic tracking-tighter leading-none text-white">
                          R$ {total.toFixed(2)}
                        </h2>
                    </div>
                  </div>
                </div>
              </div>

              {/* PAYMENT FORM INTEGRATION */}
              <div className="pt-4">
                {paymentResult && paymentResult.payment_method_id === 'pix' ? (
                  <PixDisplay pixResult={paymentResult} />
                ) : (
                  <PaymentForm 
                    total={total}
                    items={items}
                    customerInfo={customerInfo}
                    initialPaymentMethod={paymentMethod === 'PIX' ? 'pix' : 'credit_card'}
                    onSuccess={(result) => {
                      handlePaymentSuccess(result);
                    }}
                    userId={user?.uid}
                  />
                )}
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

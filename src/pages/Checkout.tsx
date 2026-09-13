import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, LockKeyhole, MapPin, ShieldCheck
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useCart } from '../hooks/useCart';
import { isJoinvilleCEP, JOINVILLE_DELIVERY_TIME, JOINVILLE_SHIPPING_NAME } from '../lib/shipping';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { PaymentForm } from '../components/PaymentForm';
import { PixDisplay } from '../components/PixDisplay';
import { analyticsTracker } from '../services/analyticsTracker';

export default function Checkout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    items, subtotal, total, shipping, couponDiscount, pixDiscount, flashSaleDiscount, weeklyPromotionDiscount, weeklyPromotionLabel, customerInfo, clearCart, paymentMethod
  } = useCart();

  const [paymentResult, setPaymentResult] = useState<any | null>(null);

  useEffect(() => {
    if (items.length > 0) {
      analyticsTracker.trackCheckoutStart();

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

  useEffect(() => {
    if (items.length === 0 && !paymentResult) {
      navigate('/bag');
    } else if (!customerInfo.name && !paymentResult) {
      navigate('/bag');
    }
  }, [items.length, customerInfo.name, navigate, paymentResult]);

  const handlePaymentSuccess = (result: any) => {
    setPaymentResult(result);

    try {
      const orderId = result.external_reference || `ord_${Date.now()}`;
      analyticsTracker.trackPurchase(orderId, total, items);

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

    if (result.payment_method_id !== 'pix') {
      clearCart();
      navigate('/success', {
        state: {
          orderId: result.external_reference,
          trackingAccessToken: result.trackingAccessToken
        }
      });
    }
  };

  if (!customerInfo.name && !paymentResult) return null;

  const totalDiscount = couponDiscount + pixDiscount + flashSaleDiscount;

  return (
    <div className="min-h-screen pt-20 pb-24 bg-[#090909] text-white selection:bg-[#f7c600] selection:text-black font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7 md:mb-10"
        >
          <button
            onClick={() => navigate('/bag')}
            className="self-start flex min-h-11 items-center gap-2 text-white/55 hover:text-white transition-colors group px-4 py-2.5 bg-white/5 rounded-full border border-white/10"
          >
            <ArrowLeft size={17} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-[9px] font-black uppercase tracking-[0.18em]">Revisar sacola</span>
          </button>

          <div className="flex items-center gap-3 text-white/45">
            <LockKeyhole size={16} className="text-[#f7c600]" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/70">Checkout seguro</p>
              <p className="text-[9px]">Revise os dados antes de concluir o pagamento.</p>
            </div>
          </div>
        </motion.div>

        <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-7">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <p className="text-[#f7c600] text-[9px] md:text-[10px] font-black uppercase tracking-[0.28em]">Última etapa</p>
              <h1 className="mt-2 text-3xl md:text-5xl font-black uppercase tracking-tighter leading-[0.92] italic">
                CONFIRME E <span className="text-[#f7c600]">FINALIZE</span>
              </h1>
              <p className="mt-3 text-white/50 text-sm max-w-xl">Confira entrega, itens e valor final. O método de pagamento continua sendo processado pelo fluxo seguro da loja.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 md:min-w-[330px]">
              <div className="rounded-xl border border-[#f7c600]/40 bg-[#f7c600]/5 p-3 text-center"><CheckCircle2 size={16} className="mx-auto text-[#f7c600]" /><span className="block mt-1 text-[8px] font-black uppercase tracking-wide">Sacola</span></div>
              <div className="rounded-xl border border-[#f7c600]/40 bg-[#f7c600]/5 p-3 text-center"><CheckCircle2 size={16} className="mx-auto text-[#f7c600]" /><span className="block mt-1 text-[8px] font-black uppercase tracking-wide">Entrega</span></div>
              <div className="rounded-xl border border-white/15 p-3 text-center"><LockKeyhole size={16} className="mx-auto text-white/60" /><span className="block mt-1 text-[8px] font-black uppercase tracking-wide">Pagamento</span></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8">
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
            className="xl:col-span-7 space-y-5"
          >
            <div className="bg-[#121212] border border-white/10 rounded-2xl p-5 md:p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-[0.04]"><MapPin size={72} /></div>
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#f7c600]">01. Entrega</p>
                  <h2 className="mt-1 text-xl font-black uppercase tracking-tight">Destino do pedido</h2>
                </div>
                <button onClick={() => navigate('/bag')} className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45 hover:text-[#f7c600] transition-colors">Editar</button>
              </div>
              <p className="text-lg font-black text-white">{customerInfo.name}</p>
              <p className="text-xs text-white/40 mt-1 break-all">{customerInfo.email} • {customerInfo.phone}{customerInfo.phone2 ? ` / ${customerInfo.phone2}` : ''}</p>
              <div className="mt-4 rounded-xl bg-white/[0.03] border border-white/5 p-4 text-sm text-white/65 leading-relaxed">
                {customerInfo.address}, {customerInfo.number}<br />
                {customerInfo.neighborhood}, {customerInfo.city} - {customerInfo.state}<br />
                CEP {customerInfo.cep}
              </div>
            </div>

            <div className="bg-[#121212] border border-white/10 rounded-2xl p-5 md:p-6">
              <div className="flex items-end justify-between gap-3 mb-5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#f7c600]">02. Itens</p>
                  <h2 className="mt-1 text-xl font-black uppercase tracking-tight">Sua seleção</h2>
                </div>
                <span className="text-[9px] uppercase tracking-[0.16em] font-black text-white/35">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
              </div>
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-3 sm:gap-4 items-center rounded-xl bg-white/[0.025] border border-white/5 p-3">
                    <div className="w-14 h-16 sm:w-16 sm:h-20 bg-white/5 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
                      <img src={item.image || undefined} alt={item.name} className="w-full h-full object-contain p-1" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-black uppercase tracking-tight text-white truncate">{item.name}</p>
                      <p className="mt-1 text-[9px] text-white/40 font-bold uppercase tracking-wider">{item.size} • {item.color} • Qtd. {item.quantity}</p>
                    </div>
                    <p className="text-xs sm:text-sm font-black whitespace-nowrap">R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 flex gap-3"><ShieldCheck size={20} className="text-[#f7c600] shrink-0" /><div><b className="text-[10px] uppercase tracking-[0.14em]">Revise antes de pagar</b><p className="text-xs text-white/40 mt-1">Confira principalmente tamanho, cor e endereço de entrega.</p></div></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 flex gap-3"><LockKeyhole size={20} className="text-[#f7c600] shrink-0" /><div><b className="text-[10px] uppercase tracking-[0.14em]">Pagamento protegido</b><p className="text-xs text-white/40 mt-1">A confirmação acontece no fluxo de pagamento já integrado à loja.</p></div></div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="xl:col-span-5"
          >
            <div className="xl:sticky xl:top-20 bg-[#121212] border border-white/10 rounded-2xl shadow-2xl p-5 md:p-6 space-y-6">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#f7c600]">03. Pagamento</p>
                <h2 className="mt-1 text-xl font-black uppercase tracking-tight">Resumo final</h2>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                  <span>Subtotal</span>
                  <span className="text-white">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between gap-4 text-[10px] font-black uppercase tracking-widest text-white/40">
                  <span className="min-w-0">
                    {customerInfo.cep && isJoinvilleCEP(customerInfo.cep) && (!customerInfo.shippingServiceId || customerInfo.shippingServiceId === 0) ? JOINVILLE_SHIPPING_NAME : (customerInfo.shippingMethodName || 'Entrega')}
                  </span>
                  <span className={cn('shrink-0', shipping === 0 ? 'text-[#f7c600]' : 'text-white')}>
                    {shipping === 0 ? 'GRÁTIS' : `R$ ${shipping.toFixed(2).replace('.', ',')}`}
                  </span>
                </div>
                {customerInfo.cep && (!isJoinvilleCEP(customerInfo.cep) || (customerInfo.shippingServiceId && customerInfo.shippingServiceId !== 0)) && customerInfo.shippingMethodName && (
                  <div className="flex justify-between gap-4 text-[8px] font-mono font-bold text-white/35 uppercase tracking-widest">
                    <span>Modalidade</span><span className="text-right">{customerInfo.shippingMethodName}</span>
                  </div>
                )}
                {customerInfo.cep && isJoinvilleCEP(customerInfo.cep) && (!customerInfo.shippingServiceId || customerInfo.shippingServiceId === 0) && (
                  <div className="flex justify-between text-[8px] font-mono font-bold text-white/35 uppercase tracking-widest">
                    <span>Prazo estimado</span><span>{JOINVILLE_DELIVERY_TIME}</span>
                  </div>
                )}
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-green-500">
                    <span>Descontos aplicados</span><span>- R$ {totalDiscount.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
                {weeklyPromotionDiscount !== undefined && weeklyPromotionDiscount > 0 && (
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-[#eab308]">
                    <span>{weeklyPromotionLabel || 'Oferta ativa'}</span><span>- R$ {weeklyPromotionDiscount.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
                <div className="pt-5 border-t border-white/10">
                  <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/30 mb-1">Total a pagar</p>
                  <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter leading-none text-white">R$ {total.toFixed(2).replace('.', ',')}</h2>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
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

      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#f7c600]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-[#f7c600]/3 blur-[100px] rounded-full" />
      </div>
    </div>
  );
}

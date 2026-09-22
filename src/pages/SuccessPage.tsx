import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ShoppingBag, Home, ArrowRight, Package, Clock } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { fetchPaymentStatus } from '../services/paymentStatus';
import { paymentOutcome } from '../../shared/paymentOutcome';
import { Helmet } from 'react-helmet-async';
import { analyticsTracker } from '../services/analyticsTracker';

export default function SuccessPage() {
  const location = useLocation();
  const orderId = location.state?.orderId;
  const trackingAccessToken = location.state?.trackingAccessToken;
  const [paymentState, setPaymentState] = useState<ReturnType<typeof paymentOutcome> | 'loading' | 'unavailable'>(orderId ? 'loading' : 'unavailable');
  useEffect(() => {
    if (!orderId) return;
    const controller = new AbortController();
    let active = true;
    setPaymentState('loading');
    fetchPaymentStatus(orderId, trackingAccessToken, controller.signal)
      .then(data => { if (active) setPaymentState(paymentOutcome(data.paymentStatus)); })
      .catch(() => { if (active) setPaymentState('unavailable'); });
    return () => { active = false; controller.abort(); };
  }, [orderId, trackingAccessToken]);
  const confirmed = paymentState === 'approved';
  useEffect(() => {
    if (confirmed && orderId && trackingAccessToken) void analyticsTracker.trackPurchase(orderId, 0, [], trackingAccessToken);
  }, [confirmed, orderId, trackingAccessToken]);
  const heading = confirmed ? 'Pagamento confirmado' : paymentState === 'loading' ? 'Consultando pagamento' : paymentState === 'pending' ? 'Pagamento em análise' : paymentState === 'failed' ? 'Pagamento não aprovado' : paymentState === 'refunded' ? 'Pagamento estornado' : 'Consulte seu pedido';

  const trackingLink = trackingAccessToken 
    ? `/order/${orderId}?token=${encodeURIComponent(trackingAccessToken)}`
    : `/order/${orderId}`;

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4 py-20 text-white selection:bg-[#f7c600] selection:text-black">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full text-center"
      >
        <div className="flex justify-center mb-10">
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
            className="w-28 h-28 bg-[#f7c600]/10 rounded-full flex items-center justify-center border border-[#f7c600]/20 relative"
          >
            <motion.div 
              animate={{ 
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 bg-[#f7c600] rounded-full blur-2xl"
            />
            {confirmed ? <CheckCircle2 className="w-14 h-14 text-[#f7c600] relative z-10" /> : <Clock className="w-14 h-14 text-[#f7c600] relative z-10" />}
          </motion.div>
        </div>

        <div className="space-y-4 mb-12">
          <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter leading-none text-white uppercase translate-y-[-10px]">
            <span aria-live="polite">{heading}</span>
          </h1>
          
          {orderId && (
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-[#f7c600]">
              <span className="text-white/40">PEDIDO:</span> #{orderId}
            </div>
          )}

          <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] max-w-xs mx-auto leading-loose">
            {confirmed ? 'Seu pagamento foi confirmado. Acompanhe a preparação e a entrega pelo pedido.' : 'A confirmação depende do status informado pelo pagamento. Consulte o acompanhamento antes de realizar outra tentativa.'}
          </p>
        </div>

        <div className="grid gap-3">
          {orderId && (
            <Link 
              to={trackingLink}
              className="flex items-center justify-center gap-3 bg-[#f7c600] text-black py-5 px-6 rounded-none font-black uppercase tracking-[0.2em] text-[10px] hover:bg-white transition-all transform hover:scale-[1.02] active:scale-[0.98] group"
            >
              <Package className="w-4 h-4" />
              ACOMPANHAR PEDIDO
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </Link>
          )}

          <Link 
            to="/catalog"
            className="flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white py-5 px-6 rounded-none font-black uppercase tracking-[0.2em] text-[10px] hover:bg-white/10 transition-all group"
          >
            <ShoppingBag className="w-4 h-4" />
            CONTINUAR COMPRANDO
          </Link>
          
          <Link 
            to="/"
            className="flex items-center justify-center gap-3 text-white/40 py-4 px-6 rounded-none font-black uppercase tracking-[0.2em] text-[10px] hover:text-white transition-all"
          >
            <Home className="w-4 h-4" />
            VOLTAR PARA HOME
          </Link>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 italic text-[8px] font-black uppercase tracking-[0.4em] text-white/20">
          Sua autenticidade é nossa identidade. FPAC.
        </div>
      </motion.div>

      {/* Decorative background effects */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[60%] h-[60%] bg-[#f7c600]/5 blur-[150px] rounded-full" />
      </div>
    </div>
  );
}

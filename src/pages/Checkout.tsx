import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, MapPin, Smartphone
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCart } from '../hooks/useCart';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { PaymentForm } from '../components/PaymentForm';
import { SuccessModal } from '../components/SuccessModal';

export function Checkout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    items, subtotal, total, shipping, couponDiscount, pixDiscount, flashSaleDiscount, customerInfo, clearCart, paymentMethod 
  } = useCart();
  
  const [paymentResult, setPaymentResult] = useState<any | null>(null);

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
    clearCart();
  };

  if (!customerInfo.name && !paymentResult) return null;

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
            <span className="text-[10px] font-black uppercase tracking-widest">Revisar Sacola</span>
          </button>
          
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#f7c600] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Pagamento Transparent</span>
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
                <p className="text-white/40 text-xs font-medium uppercase tracking-[0.2em]">Pague com segurança via Mercado Pago</p>
              </div>

            <div className="bg-[#121212] border border-white/5 p-8 space-y-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <MapPin size={80} />
              </div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">01. Entrega e Dados do Cliente</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <p className="text-xl font-black uppercase tracking-tighter">{customerInfo.name}</p>
                  <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mt-1">{customerInfo.email}</p>
                  <p className="text-sm text-white/60 font-medium leading-relaxed mt-4">
                    {customerInfo.address}, {customerInfo.number}
                    <br />
                    {customerInfo.neighborhood}, {customerInfo.city} - {customerInfo.state}
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded text-[10px] font-bold uppercase tracking-widest">
                     <MapPin size={14} className="text-[#f7c600]" /> {customerInfo.cep}
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded text-[10px] font-bold uppercase tracking-widest">
                     <Smartphone size={14} className="text-[#f7c600]" /> {customerInfo.phone}
                  </div>
                </div>
              </div>
            </div>

            {/* Product items review */}
            <div className="bg-[#121212] border border-white/5 p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7c600]">02. Itens Review</h3>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/30">
                  { items.length } {items.length === 1 ? 'Item' : 'Itens'}
                </span>
              </div>
              <div className="space-y-6">
                {items.map((item, i) => (
                  <div key={i} className="flex gap-6 items-center group">
                    <div className="relative w-16 h-20 bg-white/[0.03] flex-shrink-0 flex items-center justify-center p-2">
                       <img 
                        src={item.image || undefined} 
                        alt={item.name} 
                        className="w-full h-full object-contain filter drop-shadow(0 10px 15px rgba(0,0,0,0.5)) group-hover:scale-110 transition-transform duration-500" 
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black uppercase tracking-tight">{item.name}</p>
                      <div className="flex gap-2 mt-2">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white/5 border border-white/10 text-white/40">{item.size}</span>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white/5 border border-white/10 text-white/40">{item.color}</span>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white/5 border border-white/10 text-white/40">x{item.quantity}</span>
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
            <div className="bg-[#121212] border border-white/10 shadow-2xl p-8 space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                  <span>Subtotal</span>
                  <span className="text-white">R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                  <span>Entrega</span>
                  <span className={cn(shipping === 0 ? "text-[#f7c600]" : "text-white")}>
                    {shipping === 0 ? 'GRÁTIS' : `R$ ${shipping.toFixed(2)}`}
                  </span>
                </div>
                {(couponDiscount + pixDiscount + flashSaleDiscount) > 0 && (
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-green-500">
                    <span>Descontos</span>
                    <span>- R$ {(couponDiscount + pixDiscount + flashSaleDiscount).toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-6 border-t border-white/5">
                  <div className="flex items-end justify-between">
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">Total a Pagar</p>
                        <h2 className="text-4xl font-black italic tracking-tighter leading-none">
                          R$ {total.toFixed(2)}
                        </h2>
                    </div>
                  </div>
                </div>
              </div>

              {/* PAYMENT FORM INTEGRATION */}
              <div className="pt-4">
                <PaymentForm 
                  total={total}
                  items={items}
                  customerInfo={customerInfo}
                  shipping={shipping}
                  discounts={(couponDiscount + pixDiscount + flashSaleDiscount)}
                  onSuccess={handlePaymentSuccess}
                  userId={user?.uid}
                  paymentMethod={paymentMethod}
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <SuccessModal 
        isOpen={!!paymentResult} 
        orderId={paymentResult?.external_reference || ''} 
        paymentResult={paymentResult}
        onClose={() => navigate('/')} 
      />

      {/* Background decoration */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#f7c600]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-[#f7c600]/3 blur-[100px] rounded-full" />
      </div>
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Package, CheckCircle, Clock, XCircle, ArrowLeft, Loader2, MapPin, CreditCard, Truck, ShieldCheck, AlertTriangle, Home, ExternalLink, Timer, AlertCircle, QrCode, Lock, Shield, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { getApiUrl, getBaseUrl } from '../lib/api';
import { useCart } from '../hooks/useCart';
import { SuccessModal } from '../components/SuccessModal';

const NotificationBox = ({ order }: { order: any }) => (
  <div className="bg-black text-white p-6 md:p-8 space-y-4 shadow-2xl border border-white/10 relative overflow-hidden mb-8">
    <div className="absolute top-0 right-0 p-2 opacity-10">
      <Timer size={100} strokeWidth={1} />
    </div>
    <div className="relative z-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-[#eab308] text-black">
          <AlertCircle size={20} />
        </div>
        <h3 className="font-black uppercase tracking-tighter text-xl italic">Aguardando Pagamento</h3>
      </div>
      <p className="text-[11px] text-gray-400 uppercase font-black leading-relaxed tracking-widest max-w-sm">
        O seu pedido foi recebido e está reservado. <br />
        Após a confirmação do pagamento, seu pedido será processado e enviado no próximo dia útil.
      </p>
    </div>
  </div>
);

const SuccessModalContent = ({ orderId, onHome }: { orderId: string, onHome: () => void }) => (
  <SuccessModal 
    orderId={orderId}
    onGoToOrder={onHome}
    onBackToShopping={onHome}
  />
);

export function OrderStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { clear } = useCart();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isStripeSuccess, setIsStripeSuccess] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (params.get('status') === 'success' || sessionId) {
      setIsStripeSuccess(true);
    }

    const verifyStripeSession = async () => {
      if (!sessionId || !orderId || order?.status !== 'payment_pending') return;
      
      console.log(`🔌 [OrderStatus] Verificando sessão ${sessionId} via API...`);
      try {
        const response = await fetch(getApiUrl('/checkout/verify-session'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, orderId })
        });
        
        if (!response.ok) throw new Error('Falha ao verificar pagamento.');
        const result = await response.json();
        console.log(`🔌 [OrderStatus] Resultado da verificação:`, result);
      } catch (err: any) {
        console.error("Erro na verificação manual:", err);
        setVerificationError(err.message);
      }
    };

    if (sessionId && orderId && order?.status === 'payment_pending' && !isSubmittingPayment) {
      verifyStripeSession();
    }
  }, [orderId, order?.status, isSubmittingPayment]);

  useEffect(() => {
    if (order && (order.status === 'payment_approved' || order.status === 'processing' || order.status === 'shipped' || order.status === 'delivered')) {
      const storageKey = `f_pac_cart_cleared_${orderId}`;
      const alreadyCleared = localStorage.getItem(storageKey);
      
      if (!alreadyCleared) {
        clear();
        localStorage.setItem(storageKey, 'true');
        console.log(`🛒 [Carrinho] Carrinho esvaziado para o pedido: ${orderId}`);
      }
    }
  }, [order, orderId, clear]);

  useEffect(() => {
    // Check for success URL patterns if needed or just rely on Firestore reactive update
  }, [orderId]);

  const handleCancelOrder = async () => {
    if (!orderId) return;
    setCancelling(true);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'cancelled',
        updatedAt: new Date()
      });
      setShowCancelConfirm(false);
    } catch (error) {
      console.error("Erro ao cancelar pedido:", error);
      alert("Erro ao cancelar o pedido. Por favor, tente novamente ou entre em contato com o suporte.");
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = onSnapshot(doc(db, 'orders', orderId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const prevStatus = order?.status;
        const newStatus = data.status;

        // If status just became validated, or if it is validated and we haven't acknowledged it
        const hasSeenSuccess = localStorage.getItem(`f_pac_success_seen_${orderId}`);
        
        if (newStatus === 'payment_approved' && !hasSeenSuccess) {
          setShowSuccessModal(true);
          localStorage.setItem(`f_pac_success_seen_${orderId}`, 'true');
        }

        setOrder({ id: docSnap.id, ...data });
      } else {
        setOrder(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#eab308]" size={48} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen pt-32 pb-24 flex flex-col items-center justify-center max-w-xl mx-auto px-4 text-center">
        <XCircle size={64} className="text-red-500 mb-6" />
        <h1 className="text-3xl font-heading font-black uppercase mb-4">Pedido não encontrado</h1>
        <p className="text-gray-600 mb-8">Não conseguimos localizar as informações deste pedido. Verifique o código ou entre em contato com o suporte.</p>
        <Link to="/" className="bg-black text-white px-8 py-3 uppercase font-bold text-sm flex items-center gap-2">
          <ArrowLeft size={18} /> Voltar para Loja
        </Link>
      </div>
    );
  }

  const getTrackingSteps = () => {
    const steps = [
      { id: 'payment_pending', label: 'Recebido', icon: <Clock size={20} /> },
      { id: 'payment_approved', label: 'Confirmado', icon: <CheckCircle size={20} /> },
      { id: 'processing', label: 'Produção', icon: <Package size={20} /> },
      { id: 'shipped', label: 'Enviado', icon: <Truck size={20} /> },
      { id: 'delivered', label: 'Entregue', icon: <ShieldCheck size={20} /> }
    ];

    if (order.status === 'cancelled') {
       return [{ id: 'cancelled', label: 'Cancelado', icon: <XCircle size={20} />, active: true, color: 'bg-red-500' }];
    }

    const currentStatus = order.status || 'pending';
    const statusIndex = steps.findIndex(s => s.id === currentStatus);
    
    return steps.map((step, idx) => ({
      ...step,
      active: idx <= statusIndex,
      isCurrent: idx === statusIndex,
      color: idx <= statusIndex ? 'bg-[#eab308]' : 'bg-black/10'
    }));
  };

  const getStatusDisplay = () => {
    switch (order.status) {
      case 'payment_approved':
        return {
          icon: <CheckCircle size={48} className="text-green-500" />,
          title: 'Pagamento Confirmado',
          description: 'Seu pagamento foi confirmado! Suas peças já entraram em produção.',
          color: 'text-green-500'
        };
      case 'processing':
        return {
          icon: <Package size={48} className="text-[#eab308]" />,
          title: 'Em Produção',
          description: 'Sua peça exclusiva está sendo produzida com o máximo cuidado.',
          color: 'text-[#eab308]'
        };
      case 'shipped':
        return {
          icon: <Truck size={48} className="text-blue-500" />,
          title: 'Pedido Enviado',
          description: 'Suas peças já saíram para entrega! Fique atento(a) ao seu endereço.',
          color: 'text-blue-500'
        };
      case 'delivered':
        return {
          icon: <ShieldCheck size={48} className="text-green-600" />,
          title: 'Pedido Entregue',
          description: 'Seu pedido foi finalizado com sucesso. Aproveite sua F PAC STORE!',
          color: 'text-green-600'
        };
      case 'cancelled':
        return {
          icon: <XCircle size={48} className="text-red-500" />,
          title: 'Pedido Cancelado',
          description: 'Este pedido foi cancelado ou ocorreu um problema na validação.',
          color: 'text-red-500'
        };
      default:
        return {
          icon: <Clock size={48} className="text-yellow-500" />,
          title: 'Aguardando Pagamento',
          description: 'Recebemos seu pedido. Por favor, envie o comprovante via WhatsApp para validação.',
          color: 'text-yellow-500'
        };
    }
  };

  const status = getStatusDisplay();
  const trackingSteps = getTrackingSteps();

  // Override status display if Stripe redirect just happened
  const currentStatusDisplay = (isStripeSuccess && order.status === 'payment_pending') ? {
    icon: <Loader2 size={48} className="text-green-500 animate-spin" />,
    title: 'Processando Pagamento',
    description: 'Recebemos o sinal de sucesso do Stripe! Aguarde a confirmação final do sistema.',
    color: 'text-green-500'
  } : status;

  return (
    <div className="min-h-[100dvh] pt-32 md:pt-48 pb-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
            <SuccessModalContent 
              orderId={orderId!} 
              onHome={() => {
                setShowSuccessModal(false);
                navigate('/');
              }} 
            />
          </div>
        )}
      </AnimatePresence>

      <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-black transition-colors mb-8 text-xs uppercase font-bold tracking-[0.2em]">
        <ArrowLeft size={16} /> Voltar para Loja
      </Link>

      {order.status === 'payment_pending' && <NotificationBox order={order} />}

      <div className="bg-white border border-black/10 rounded-none shadow-2xl overflow-hidden mb-12">
        {/* Status Header */}
        <div className="bg-black/5 p-8 md:p-12 text-center border-b border-black/10">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex justify-center mb-6"
          >
            {currentStatusDisplay.icon}
          </motion.div>
          <span className="text-[10px] font-black text-[#eab308] uppercase tracking-[0.4em] mb-3 block">ID DO PEDIDO: {order.id}</span>
          {order?.createdAt && typeof order.createdAt.toDate === 'function' && (
            <p className="text-[10px] text-black/40 font-bold uppercase tracking-widest mb-6">
              REALIZADO EM: {order.createdAt.toDate().toLocaleString('pt-BR')}
            </p>
          )}
          <h1 className="text-3xl md:text-4xl font-heading font-black uppercase mb-4 tracking-tighter">{currentStatusDisplay.title}</h1>
          <p className="text-gray-600 text-sm max-w-md mx-auto leading-relaxed mb-6">{currentStatusDisplay.description}</p>

          {/* Cancel Order Option (Only if pending) */}
          {order.status === 'payment_pending' && (
            <div className="mt-8 border-t border-black/5 pt-8">
              {!showCancelConfirm ? (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700 transition-colors flex items-center gap-2 mx-auto"
                >
                  <XCircle size={14} /> Cancelar este pedido
                </button>
              ) : (
                <div className="bg-red-50 p-6 border border-red-200">
                  <p className="text-red-700 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 mb-4">
                    <AlertTriangle size={16} /> Tem certeza que deseja cancelar?
                  </p>
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={cancelling}
                      className="px-6 py-2 bg-white border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest hover:bg-white/50 transition-colors disabled:opacity-50"
                    >
                      Não, manter
                    </button>
                    <button
                      onClick={handleCancelOrder}
                      disabled={cancelling}
                      className="px-6 py-2 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {cancelling ? <Loader2 size={12} className="animate-spin" /> : 'Sim, cancelar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tracking Timeline */}
        <div className="p-4 md:p-12 bg-white border-b border-black/10 overflow-x-auto">
           <div className="flex justify-between relative mt-4 min-w-[400px] md:min-w-0 px-2">
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-black/5 z-0" />
              <div 
                className="absolute top-5 left-0 h-0.5 bg-[#eab308] z-0 transition-all duration-1000" 
                style={{ 
                  width: trackingSteps.length === 1 ? '100%' : `${(trackingSteps.filter(s => s.active).length - 1) / (trackingSteps.length - 1) * 100}%` 
                }} 
              />
              
              {trackingSteps.map((step, idx) => (
                <div key={idx} className="relative z-10 flex flex-col items-center">
                  <div className={cn(
                    "w-10 h-10 rounded-none flex items-center justify-center transition-all",
                    step.active ? "bg-[#eab308] text-black shadow-lg shadow-[#eab308]/20" : "bg-white border border-black/10 text-black/20"
                  )}>
                    {step.icon}
                  </div>
                  <span className={cn(
                    "mt-3 text-[9px] font-black uppercase tracking-widest",
                    step.active ? "text-black" : "text-black/20"
                  )}>
                    {step.label}
                  </span>
                </div>
              ))}
           </div>
        </div>

        <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Details */}
          <div>
            <h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-black/40 mb-8 flex items-center gap-2 border-b border-black/5 pb-2">
              <Package size={14} /> Resumo dos Itens
            </h3>
            <div className="space-y-6">
              {order.items && Array.isArray(order.items) && order.items.map((itemValue: any, idx: number) => (
                <div key={idx} className="flex gap-4 items-start pb-6 border-b border-black/5 last:border-0">
                  {itemValue.image && (
                    <img src={itemValue.image || undefined} alt={itemValue.name} className="w-16 h-20 object-contain bg-black/5 rounded-none" />
                  )}
                  <div className="flex-1">
                    <p className="font-bold text-xs uppercase tracking-wider">{itemValue.name}</p>
                    <p className="text-[10px] text-black/40 uppercase tracking-widest mt-1">
                       Qtd: {itemValue.quantity} | Cor: {itemValue.color} | Tam: {itemValue.size}
                    </p>
                    {itemValue.printConfigs && itemValue.printConfigs.length > 0 && (
                      <div className="mt-2 text-[9px] text-[#eab308] uppercase tracking-widest font-black space-y-1">
                        {itemValue.printConfigs.map((cfg: any, cidx: number) => (
                          <div key={cidx}>· {cfg.stamp} ({cfg.location})</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="font-bold text-xs">R$ {((itemValue.price || 0) * (itemValue.quantity || 1)).toFixed(2)}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 space-y-3 pt-6 border-t border-black/10">
              <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-black/40">
                <span>Subtotal</span>
                <span>R$ {(order.subtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-black/40">
                <span>Frete</span>
                <span>R$ {(order.shipping || order.frete || 0).toFixed(2)}</span>
              </div>
              {((order.couponDiscount || 0) + (order.pixDiscount || 0) + (order.discount || 0)) > 0 && (
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-black text-[#eab308]">
                  <span>Descontos</span>
                  <span>- R$ {((order.couponDiscount || 0) + (order.pixDiscount || 0) + (order.discount || 0)).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-2xl pt-4 border-t-2 border-black mt-4 uppercase tracking-tighter">
                <span>Total Final</span>
                <span>R$ {(order.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Delivery & Payment */}
          <div className="space-y-12">
            <div>
              <h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-black/40 mb-6 flex items-center gap-2 border-b border-black/5 pb-2">
                <MapPin size={14} /> Endereço de Entrega
              </h3>
              <div className="bg-black/[0.03] p-6 text-[11px] uppercase tracking-[0.1em] leading-relaxed border-l-4 border-[#eab308]">
                <p className="font-black mb-2 text-sm">{order.customerName}</p>
                {typeof order.address === 'object' ? (
                  <>
                    <p className="font-bold">{(order.address.street || '').toString()}, {order.address.number || ''}</p>
                    {order.address.complement && <p className="font-bold">COMPL: {order.address.complement}</p>}
                    <p className="font-bold">{order.address.neighborhood}</p>
                    <p className="font-bold">{order.address.city} - {order.address.state}</p>
                    <p className="font-black text-[#eab308] mt-3">CEP: {order.address.cep}</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold">{order.address}, {order.number}</p>
                    {order.complement && <p className="font-bold">COMPL: {order.complement}</p>}
                    <p className="font-bold">{order.neighborhood}</p>
                    <p className="font-bold">{order.city} - {order.state}</p>
                    <p className="font-black text-[#eab308] mt-3">CEP: {order.cep}</p>
                  </>
                )}
              </div>
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-black/40 mb-6 flex items-center gap-2 border-b border-black/5 pb-2">
                <CreditCard size={14} /> Pagamento e Finalização
              </h3>
              <div className="space-y-6">
                {order.status === 'payment_pending' ? (
                  <div className="bg-black text-white p-8 space-y-6 shadow-2xl relative overflow-hidden">
                    <div className="flex items-center gap-4 mb-2">
                       <div className="p-2 bg-[#eab308] text-black">
                         <Clock size={24} />
                       </div>
                       <h4 className="text-xl font-black uppercase tracking-tighter italic">Pagamento em Processamento</h4>
                    </div>
                    <p className="text-xs text-gray-400 font-bold uppercase leading-relaxed tracking-wider">
                      Estamos aguardando a confirmação do pagamento pelo Stripe. Isso geralmente leva alguns segundos.
                    </p>
                    <div className="flex flex-col gap-4">
                      <button 
                        onClick={() => window.location.reload()}
                        className="w-full bg-[#eab308] text-black py-4 font-black uppercase tracking-[0.2em] text-[10px] hover:bg-white transition-all flex items-center justify-center gap-2"
                      >
                        <ExternalLink size={14} /> Atualizar Status
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-black/5 p-8 border border-black/10 relative overflow-hidden group">
                     {/* Dynamic Background */}
                     <div className="absolute -right-4 -bottom-4 opacity-[0.03] rotate-12 group-hover:rotate-0 transition-transform duration-700">
                        <CheckCircle size={140} />
                     </div>

                     <p className="text-[10px] text-black/40 uppercase font-black mb-2 tracking-widest">Informações de Pagamento</p>
                     <div className="flex items-end gap-3 mb-6">
                        <p className="font-black uppercase tracking-tighter text-2xl italic">STRIPE SECURE</p>
                        <span className="text-[9px] font-black text-[#eab308] bg-black px-2 py-0.5 rounded-sm mb-1 uppercase tracking-widest">Ativo</span>
                     </div>
                     
                     {order.status === 'payment_approved' && (
                       <div className="flex items-center gap-3 text-green-600 bg-green-50 p-4 border border-green-100">
                         <div className="bg-green-600 text-white p-1 rounded-full">
                           <ShieldCheck size={16} />
                         </div>
                         <div className="flex flex-col">
                           <p className="text-[11px] font-black uppercase tracking-tighter leading-none">Pagamento Confirmado</p>
                           <p className="text-[8px] font-bold uppercase text-green-600/60 mt-1">Transação Identificada e Processada</p>
                         </div>
                       </div>
                     )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 border-2 border-[#eab308] p-6 text-center">
              <h4 className="text-sm font-black uppercase tracking-tighter mb-2">Dúvidas sobre seu pedido?</h4>
              <p className="text-[10px] text-black/50 uppercase tracking-widest font-bold mb-4">Estamos à sua disposição no nosso chat oficial.</p>
              <a 
                href={`https://wa.me/5547997465602?text=Olá, tenho uma dúvida sobre meu pedido #${order.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-black text-white text-[10px] font-black uppercase px-8 py-3 tracking-widest hover:bg-[#eab308] hover:text-black transition-colors"
              >
                Suporte via WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Package, CheckCircle, Clock, XCircle, ArrowLeft, Loader2, MapPin, CreditCard, Truck, ShieldCheck, AlertTriangle, Home, ExternalLink, Timer, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import toast from 'react-hot-toast';

// Initialize MP with Public Key
const getMPPublicKey = () => {
  const env = import.meta.env;
  
  // 1. Try explicit names
  const prioritizedKey = env.VITE_MP_PUBLIC_KEY || 
                        env.VITE_MP_PUBLIC_K || 
                        env.VITE_MP_CHAVE_P ||
                        env.VITE_MP_PUBLIC_KEY_ ||
                        env.VITE_PUBLIC_MP_K ||
                        env.VITE_MP_PUBLIC_KEY_TEST ||
                        env.MP_PUBLIC_KEY;
  
  if (prioritizedKey && prioritizedKey.length > 10) return prioritizedKey;

  // 2. Try to find ANY VITE_MP key by searching the object (if Vite allows)
  try {
    const foundKeyName = Object.keys(env).find(k => k.includes('MP_PUBLIC') || (k.startsWith('VITE_MP') && env[k]?.length > 10));
    if (foundKeyName) return env[foundKeyName];
  } catch (e) {
    // Some environments block Object.keys(import.meta.env)
  }

  return null;
};

const mpPublicKey = getMPPublicKey();

import { getApiUrl, getBaseUrl } from '../lib/api';

const NotificationBox = ({ order }: { order: any }) => (
  <div className="bg-black text-white p-6 md:p-8 space-y-4 shadow-2xl border border-white/10 relative overflow-hidden">
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
  <motion.div 
    initial={{ scale: 0.9, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    className="bg-white p-8 max-w-md w-full text-center shadow-2xl border border-black/5"
  >
    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
      <CheckCircle size={40} className="text-green-600" />
    </div>
    <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Pagamento Confirmado!</h2>
    <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-8">
      Parabéns! Seu pedido #{orderId} foi validado e logo entrará em separação.
    </p>
    <button 
      onClick={onHome}
      className="w-full bg-black text-white py-4 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all"
    >
      Ir para o Início
    </button>
  </motion.div>
);

export function OrderStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const [activePublicKey, setActivePublicKey] = useState(mpPublicKey);
  const [updatingMethod, setUpdatingMethod] = useState(false);

  // Recalculate discount if method changes
  const handleMethodChange = async (newMethod: string) => {
    if (!order || order.status !== 'pending' || updatingMethod) return;
    
    setUpdatingMethod(true);
    try {
      const isPix = newMethod === 'PIX';
      // Apply 5% Pix discount automatically
      const subtotal = Number(order.subtotal || 0);
      const pixDiscount = isPix ? subtotal * 0.05 : 0;
      const autoDiscount = Number(order.autoDiscount || 0);
      const newDiscount = pixDiscount + autoDiscount;
      const frete = Number(order.frete || 0);
      const newTotal = Math.max(0, subtotal - newDiscount + frete);

      await updateDoc(doc(db, 'orders', orderId!), {
        paymentMethod: newMethod,
        discount: newDiscount,
        total: newTotal,
        updatedAt: serverTimestamp()
      });
      
      toast.success(`Método alterado para ${newMethod === 'PIX' ? 'Pix' : 'Cartão'}`);
    } catch (err) {
      console.error("Erro ao alterar método:", err);
      toast.error("Erro ao atualizar forma de pagamento.");
    } finally {
      setUpdatingMethod(false);
    }
  };

  const mpInitialization = useMemo(() => {
    if (!order) return null;
    return { 
      amount: Number(order.total.toFixed(2)),
      payer: {
        email: order.customerEmail || 'atendimento@fpacstore.com.br',
      }
    };
  }, [order?.total, order?.customerEmail]);

  const mpCustomization = useMemo(() => ({
    paymentMethods: {
      bankTransfer: ['pix' as const],
      creditCard: 'all' as const,
    },
  }), []);

  // Email Notification Flow
  const triggerEmailNotification = async (currentOrder: any, status: string, paymentUrl?: string) => {
    try {
      // Determine the base URL for links
      const baseUrl = getBaseUrl();

      const orderPageLink = `${baseUrl}/#/order/${currentOrder.id}`;
      const finalPaymentLink = paymentUrl || orderPageLink;

      await fetch(getApiUrl('/api/send-confirmation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentOrder.customerEmail,
          customerName: currentOrder.customerName.toUpperCase(),
          orderId: currentOrder.id,
          items: currentOrder.items,
          totals: {
            subtotal: currentOrder.subtotal,
            frete: currentOrder.frete,
            discount: currentOrder.discount,
            finalTotal: currentOrder.total
          },
          status: status,
          address: {
            street: currentOrder.address,
            number: currentOrder.number,
            complement: currentOrder.complement,
            neighborhood: currentOrder.neighborhood,
            city: currentOrder.city,
            state: currentOrder.state,
            cep: currentOrder.cep
          },
          paymentMethod: currentOrder.paymentMethod,
          paymentLink: finalPaymentLink
        })
      });
      console.log("✅ [E-MAIL] Notificação de atualização enviada.");
    } catch (err) {
      console.error("❌ [E-MAIL] Erro ao enviar notificação de status:", err);
    }
  };

  useEffect(() => {
    if (!activePublicKey) {
      console.log("🔍 [MP] Buscando configuração no servidor (Status)...");
      fetch(getApiUrl('/api/payment-config'))
        .then(res => res.json())
        .then(data => {
          if (data && data.publicKey) {
            console.log("✅ [MP] Chave encontrada no servidor (Status):", data.publicKey.substring(0, 8) + "...");
            setActivePublicKey(data.publicKey);
            try {
              initMercadoPago(data.publicKey, { locale: 'pt-BR' });
            } catch (err) {
              console.error("❌ [MP] Erro ao inicializar MP (Status):", err);
            }
          }
        })
        .catch(err => console.error("❌ [MP] Erro rede config (Status):", err));
    } else {
       console.log("✅ [MP] Chave encontrada localmente (Status):", activePublicKey.substring(0, 8) + "...");
       try {
         initMercadoPago(activePublicKey, { locale: 'pt-BR' });
       } catch (err) {
         console.error("❌ [MP] Erro init local (Status):", err);
       }
    }
  }, []);

  const isMpConfigured = !!(activePublicKey && activePublicKey.length > 5);

  const handlePaymentSubmit = async ({ formData: mpFormData }: any) => {
    setIsSubmittingPayment(true);
    try {
      const response = await fetch(getApiUrl('/api/process_payment'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formData: {
            ...mpFormData,
            external_reference: orderId,
            description: `Pagamento Restante Pedido F PAC STORE - ${orderId}`,
          }
        }),
      });

      let result;
      const text = await response.text();
      try {
        result = JSON.parse(text);
      } catch (e) {
        console.error("Erro ao analisar resposta do servidor:", text);
        toast.error("O servidor enviou uma resposta do servidor inválida.");
        return;
      }

      if (response.ok) {
        // Detect actual payment method from MP
        const mpMethodId = mpFormData.payment_method_id;
        const actualMethod = mpMethodId === 'pix' ? 'PIX' : 'Cartão de Crédito';

        // Update order with new status
        await updateDoc(doc(db, 'orders', orderId!), {
          paymentStatus: result.status,
          paymentId: result.id,
          paymentMethod: actualMethod,
          paymentLink: result.point_of_interaction?.transaction_data?.ticket_url || 
                       result.transaction_details?.external_resource_url || null,
          status: result.status === 'approved' ? 'validated' : 'pending',
          updatedAt: new Date()
        });
        
        // Reload will happen via onSnapshot
        if (result.status === 'approved') {
          toast.success("Pagamento aprovado!");
          // Trigger confirmation email
          triggerEmailNotification(order, result.status, result.point_of_interaction?.transaction_data?.ticket_url);
        } else {
          toast.success("Pagamento processado. Aguardando compensação.");
          // If PIX, we might want to show the ticket_url or similar
          const ticketUrl = result.point_of_interaction?.transaction_data?.ticket_url;
          if (ticketUrl) {
            window.open(ticketUrl, '_blank');
          }
        }
      } else {
        toast.error("Pagamento não processado. Confira os dados do cartão.");
      }
    } catch (error) {
      console.error("Erro no checkout MP:", error);
      toast.error("Erro ao conectar com o processador de pagamentos.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

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
        
        if (newStatus === 'validated' && !hasSeenSuccess) {
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
      { id: 'pending', label: 'Recebido', icon: <Clock size={20} /> },
      { id: 'validated', label: 'Validado', icon: <CheckCircle size={20} /> },
      { id: 'preparing', label: 'Preparando', icon: <Package size={20} /> },
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
      case 'validated':
        return {
          icon: <CheckCircle size={48} className="text-green-500" />,
          title: 'Pedido Validado',
          description: 'Seu pagamento foi confirmado! Já estamos preparando suas peças.',
          color: 'text-green-500'
        };
      case 'preparing':
        return {
          icon: <Package size={48} className="text-[#eab308]" />,
          title: 'Em Preparação',
          description: 'Suas peças estão sendo separadas e personalizadas conforme solicitado.',
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

      <div className="bg-white border border-black/10 rounded-none shadow-2xl overflow-hidden mb-12">
        {/* Status Header */}
        <div className="bg-black/5 p-8 md:p-12 text-center border-b border-black/10">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex justify-center mb-6"
          >
            {status.icon}
          </motion.div>
          <span className="text-[10px] font-black text-[#eab308] uppercase tracking-[0.4em] mb-3 block">ID DO PEDIDO: {order.id}</span>
          {order.createdAt && (
            <p className="text-[10px] text-black/40 font-bold uppercase tracking-widest mb-6">
              REALIZADO EM: {order.createdAt.toDate().toLocaleString('pt-BR')}
            </p>
          )}
          <h1 className="text-3xl md:text-4xl font-heading font-black uppercase mb-4 tracking-tighter">{status.title}</h1>
          <p className="text-gray-600 text-sm max-w-md mx-auto leading-relaxed mb-6">{status.description}</p>

          {/* Cancel Order Option (Only if pending) */}
          {order.status === 'pending' && (
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
              {order.items.map((itemValue: any, idx: number) => (
                <div key={idx} className="flex gap-4 items-start pb-6 border-b border-black/5 last:border-0">
                  {itemValue.image && (
                    <img src={itemValue.image} alt={itemValue.name} className="w-16 h-20 object-cover bg-black/5 rounded-none" />
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
                  <p className="font-bold text-xs">R$ {(itemValue.price * itemValue.quantity).toFixed(2)}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 space-y-3 pt-6 border-t border-black/10">
              <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-black/40">
                <span>Subtotal</span>
                <span>R$ {order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-black/40">
                <span>Frete</span>
                <span>R$ {order.frete.toFixed(2)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-black text-[#eab308]">
                  <span>Descontos</span>
                  <span>- R$ {order.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-2xl pt-4 border-t-2 border-black mt-4 uppercase tracking-tighter">
                <span>Total Final</span>
                <span>R$ {order.total.toFixed(2)}</span>
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
                <p className="font-bold">{order.address}, {order.number}</p>
                {order.complement && <p className="font-bold">COMPL: {order.complement}</p>}
                <p className="font-bold">{order.neighborhood}</p>
                <p className="font-bold">{order.city} - {order.state}</p>
                <p className="font-black text-[#eab308] mt-3">CEP: {order.cep}</p>
              </div>
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-black/40 mb-6 flex items-center gap-2 border-b border-black/5 pb-2">
                <CreditCard size={14} /> Método de Pagamento
              </h3>
              <div className="bg-black/[0.03] p-6 border-l-4 border-black">
                {order.status === 'pending' ? (
                  <div className="space-y-3 mb-6">
                    <label className={cn(
                      "flex items-start md:items-center gap-3 p-4 border-2 cursor-pointer transition-all",
                      order.paymentMethod === 'CREDIT_CARD' ? "border-[#eab308] bg-[#eab308]/5" : "border-black/5 bg-white opacity-60"
                    )}>
                      <input 
                        type="radio" 
                        name="paymentMethod" 
                        value="CREDIT_CARD" 
                        checked={order.paymentMethod === 'CREDIT_CARD'}
                        onChange={() => handleMethodChange('CREDIT_CARD')}
                        className="hidden"
                      />
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors mt-0.5 md:mt-0",
                        order.paymentMethod === 'CREDIT_CARD' ? "border-[#eab308]" : "border-gray-300"
                      )}>
                        {order.paymentMethod === 'CREDIT_CARD' && <div className="w-2.5 h-2.5 rounded-full bg-[#eab308]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-[11px] md:text-xs uppercase tracking-widest truncate">Cartão de Crédito</p>
                        <p className="text-[9px] md:text-[10px] text-gray-500 uppercase font-black opacity-60">Parcelamento em até 12x</p>
                      </div>
                    </label>

                    <label className={cn(
                      "flex items-start md:items-center gap-3 p-4 border-2 cursor-pointer transition-all",
                      order.paymentMethod === 'PIX' ? "border-[#eab308] bg-[#eab308]/5" : "border-black/5 bg-white opacity-60"
                    )}>
                      <input 
                        type="radio" 
                        name="paymentMethod" 
                        value="PIX" 
                        checked={order.paymentMethod === 'PIX'}
                        onChange={() => handleMethodChange('PIX')}
                        className="hidden"
                      />
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors mt-0.5 md:mt-0",
                        order.paymentMethod === 'PIX' ? "border-[#eab308]" : "border-gray-300"
                      )}>
                        {order.paymentMethod === 'PIX' && <div className="w-2.5 h-2.5 rounded-full bg-[#eab308]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-1">
                          <p className="font-black text-[11px] md:text-xs uppercase tracking-widest truncate">Pix</p>
                          <span className="bg-green-100 text-green-700 text-[8px] md:text-[9px] font-black px-1.5 py-0.5 uppercase tracking-tighter self-start md:self-center">5% OFF EXCLUSIVO</span>
                        </div>
                        <p className="text-[9px] md:text-[10px] text-gray-500 uppercase font-black opacity-60">Aprovação imediata</p>
                      </div>
                    </label>
                  </div>
                ) : (
                  <p className="font-black uppercase tracking-widest text-xs mb-6">{order.paymentMethod || 'MERCADO PAGO'}</p>
                )}
                
                {order.status === 'pending' && (
                  <div className="p-4 bg-white border border-[#eab308] border-dashed">
                    <p className="text-[11px] font-black uppercase text-black mb-4 flex items-center gap-2">
                       <CreditCard size={14} className="text-[#eab308]" /> 
                       Concluir Pagamento
                    </p>
                    
                    {!isMpConfigured ? (
                      <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-lg">
                        <p className="text-[10px] font-black uppercase text-center mb-1">Pagamento Automático Indisponível</p>
                        <p className="text-[9px] text-center opacity-70">Aguardando configuração final das chaves do Mercado Pago.</p>
                      </div>
                    ) : mpInitialization ? (
                        <div key={`${order.paymentMethod}-${order.total}`} className="min-h-[350px] overflow-hidden">
                          <Payment
                            initialization={mpInitialization}
                            customization={mpCustomization}
                            onSubmit={handlePaymentSubmit}
                          />
                        </div>
                    ) : (
                      <div className="flex justify-center py-4">
                        <Loader2 className="animate-spin text-[#eab308]" />
                      </div>
                    )}
                  </div>
                )}

                {order.paymentLink && order.status === 'pending' && (
                  <div className="mt-4">
                    <a 
                      href={order.paymentLink} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-black text-white text-[10px] font-black py-4 uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all"
                    >
                      <ExternalLink size={14} /> Abrir Link de Pagamento Original
                    </a>
                  </div>
                )}
                
                {order.status === 'validated' && (
                  <div className="flex items-center gap-2 text-green-500 mt-4">
                    <ShieldCheck size={16} />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Pedido validado pelo sistema de gestão</p>
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

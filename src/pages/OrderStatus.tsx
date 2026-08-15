import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Package, CheckCircle, Clock, XCircle, ArrowLeft, Loader2, MapPin, CreditCard, Truck, ShieldCheck, AlertTriangle, Timer, AlertCircle, RefreshCcw, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { safeStorage } from '../lib/storage';
import toast from 'react-hot-toast';
import { getApiUrl } from '../lib/api';
import { useCart } from '../hooks/useCart';
import { isJoinvilleCEP, JOINVILLE_DELIVERY_TIME, JOINVILLE_SHIPPING_NAME } from '../lib/shipping';
import { SuccessModal } from '../components/SuccessModal';
import { cancelOrder } from '../services/orders/orderService';

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

export default function OrderStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || searchParams.get('trackingAccessToken') || '';
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const { user } = useAuth();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const fetchTracking = useCallback(async (isInitial = false) => {
    if (!orderId) return;
    if (isInitial) setLoading(true);

    try {
      let idToken: string | null = null;
      if (auth.currentUser) {
        try {
          idToken = await auth.currentUser.getIdToken();
        } catch (e) {
          // Token fetch failed
        }
      }

      const qParams = new URLSearchParams();
      if (token) qParams.set('token', token);
      qParams.set('t', Date.now().toString());

      const url = getApiUrl(`/api/orders/${encodeURIComponent(orderId)}/tracking?${qParams.toString()}`);
      const headers: Record<string, string> = {};
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const resp = await fetch(url, { headers });

      if (resp.ok) {
        const data = await resp.json();
        const newStatus = data.status || data.shippingStatus;

        const hasSeenSuccess = safeStorage.getItem(`f_pac_success_seen_${orderId}`);
        const approvedStatuses = ['payment_approved', 'approved', 'Pagamento Aprovado'];
        if (approvedStatuses.includes(newStatus) && !hasSeenSuccess) {
          setShowSuccessModal(true);
          safeStorage.setItem(`f_pac_success_seen_${orderId}`, 'true');
        }

        setOrder(data);
        setVerificationError(null);
      } else {
        setOrder(null);
        if (resp.status === 403) {
          setVerificationError('Link de rastreamento incompleto ou não autorizado. Por favor, utilize o link seguro enviado ou faça login na sua conta.');
        } else {
          setVerificationError('Pedido não encontrado.');
        }
      }
    } catch (err: any) {
      console.error('Erro ao buscar rastreamento:', err);
      setVerificationError('Falha na conexão com o servidor de rastreamento.');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [orderId, token]);

  const refreshOrder = async () => {
    if (!orderId) return;
    setIsRefreshing(true);
    await fetchTracking(false);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  useEffect(() => {
    fetchTracking(true);
  }, [fetchTracking, user]);

  useEffect(() => {
    const approvedStatuses = ['payment_approved', 'approved', 'Pagamento Aprovado', 'processing', 'shipped', 'delivered'];
    if (order && approvedStatuses.includes(order.status)) {
      const storageKey = `f_pac_cart_cleared_${orderId}`;
      const alreadyCleared = safeStorage.getItem(storageKey);
      
      if (!alreadyCleared) {
        clearCart();
        safeStorage.setItem(storageKey, 'true');
      }
    }
  }, [order, orderId, clearCart]);

  useEffect(() => {
    let interval: any;
    const pendingStatuses = ['payment_pending', 'received', 'pending', 'Aguardando Pagamento PIX'];
    if (order && pendingStatuses.includes(order.status)) {
      interval = setInterval(() => {
        fetchTracking(false);
      }, 5000); 
    }
    return () => clearInterval(interval);
  }, [order?.status, fetchTracking]);

  const handleCancelOrder = async () => {
    if (!orderId) return;
    setCancelling(true);
    try {
      await cancelOrder(orderId, 'Cancelado pelo cliente na página de acompanhamento');
      setShowCancelConfirm(false);
      toast.success('Pedido cancelado com sucesso.');
      await fetchTracking(false);
    } catch (error: any) {
      console.error("Erro ao cancelar pedido:", error);
      toast.error(error.message || "Erro ao cancelar o pedido.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-[#eab308]" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-black/40">Carregando rastreamento seguro...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen pt-32 pb-24 flex flex-col items-center justify-center max-w-xl mx-auto px-4 text-center">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
          <Lock size={32} />
        </div>
        <h1 className="text-2xl font-heading font-black uppercase mb-3 tracking-tighter">Acesso Restrito ao Rastreamento</h1>
        <p className="text-gray-600 text-xs uppercase font-bold tracking-wider leading-relaxed mb-8 max-w-md">
          {verificationError || "Para acompanhar este pedido, utilize o link seguro enviado no momento da compra ou faça login com sua conta."}
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link to="/tracking" className="bg-black text-white px-8 py-4 uppercase font-black text-[10px] tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-[#eab308] hover:text-black transition-all">
            <ArrowLeft size={16} /> Consultar Rastreamento
          </Link>
          <Link to="/" className="bg-gray-100 text-black px-8 py-4 uppercase font-black text-[10px] tracking-[0.2em] flex items-center justify-center hover:bg-black hover:text-white transition-all">
            Voltar para Loja
          </Link>
        </div>
      </div>
    );
  }

  const getTrackingSteps = () => {
    const steps = [
      { id: 'pending', label: 'Recebido', icon: <Clock size={20} /> },
      { id: 'approved', label: 'Confirmado', icon: <CheckCircle size={20} /> },
      { id: 'processing', label: 'Produção', icon: <Package size={20} /> },
      { id: 'shipped', label: 'Enviado', icon: <Truck size={20} /> },
      { id: 'delivered', label: 'Entregue', icon: <ShieldCheck size={20} /> }
    ];

    const currentStatus = order.status || order.shippingStatus;
    
    let activeIndex = 0;
    if (['Pagamento Aprovado', 'approved', 'payment_approved'].includes(currentStatus)) activeIndex = 1;
    if (['processing'].includes(currentStatus)) activeIndex = 2;
    if (['shipped'].includes(currentStatus)) activeIndex = 3;
    if (['delivered'].includes(currentStatus)) activeIndex = 4;
    if (['cancelled', 'Pagamento Não Realizado', 'rejected'].includes(currentStatus)) {
       return [{ id: 'cancelled', label: 'Cancelado', icon: <XCircle size={20} />, active: true, color: 'bg-red-500' }];
    }

    return steps.map((step, idx) => ({
      ...step,
      active: idx <= activeIndex,
      isCurrent: idx === activeIndex,
      color: idx <= activeIndex ? 'bg-[#eab308]' : 'bg-black/10'
    }));
  };

  const getStatusDisplay = () => {
    const statusVal = order.status || order.shippingStatus;
    switch (statusVal) {
      case 'Pagamento Aprovado':
      case 'payment_approved':
      case 'approved':
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
      case 'Pagamento Não Realizado':
      case 'cancelled':
      case 'rejected':
      case 'expired':
        return {
          icon: <XCircle size={48} className="text-red-500" />,
          title: 'Pagamento Não Realizado',
          description: 'Ocorreu um problema com o seu pagamento ou o tempo expirou.',
          color: 'text-red-500'
        };
      case 'Aguardando Pagamento PIX':
      case 'received':
      case 'payment_pending':
      case 'pending':
      default:
        return {
          icon: <Clock size={48} className="text-[#eab308]" />,
          title: 'Aguardando Pagamento',
          description: 'Recebemos seu pedido e estamos aguardando a confirmação do pagamento.',
          color: 'text-[#eab308]'
        };
    }
  };

  const statusDisplay = getStatusDisplay();
  const trackingSteps = getTrackingSteps();

  const formattedDate = order.createdAt 
    ? new Date(order.createdAt).toLocaleString('pt-BR') 
    : null;

  return (
    <div className="min-h-[100dvh] pt-24 md:pt-32 pb-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Success Modal */}
      <SuccessModal 
        isOpen={showSuccessModal} 
        orderId={orderId!} 
        onClose={() => {
          setShowSuccessModal(false);
          navigate('/');
        }} 
      />

      <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-black transition-colors mb-8 text-xs uppercase font-bold tracking-[0.2em]">
        <ArrowLeft size={16} /> Voltar para Loja
      </Link>

      {(order.status === 'payment_pending' || order.status === 'received') && <NotificationBox order={order} />}

      <div className="bg-white border border-black/10 rounded-none shadow-2xl overflow-hidden mb-12">
        {/* Status Header */}
        <div className="bg-black/5 p-8 md:p-12 text-center border-b border-black/10">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex justify-center mb-6"
          >
            {statusDisplay.icon}
          </motion.div>
          <span className="text-[10px] font-black text-[#eab308] uppercase tracking-[0.4em] mb-3 block">ID DO PEDIDO: {order.orderId || orderId}</span>
          {formattedDate && (
            <p className="text-[10px] text-black/40 font-bold uppercase tracking-widest mb-6">
              REALIZADO EM: {formattedDate}
            </p>
          )}
          <h1 className="text-2xl md:text-3xl font-heading font-black uppercase mb-4 tracking-tighter">{statusDisplay.title}</h1>
          <p className="text-gray-600 text-sm max-w-md mx-auto leading-relaxed mb-6">{statusDisplay.description}</p>

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

        {/* Tracking Code Banner if available */}
        {order.trackingCode && (
          <div className="bg-black text-white p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-black/10">
            <div>
              <p className="text-[9px] font-black text-[#eab308] uppercase tracking-[0.3em] mb-1">CÓDIGO DE RASTREIO ({order.carrier || 'Correios'})</p>
              <p className="text-xl font-mono font-black uppercase tracking-widest">{order.trackingCode}</p>
            </div>
            {order.trackingUrl && (
              <a 
                href={order.trackingUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="bg-[#eab308] text-black px-6 py-3 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-white transition-all shrink-0"
              >
                Rastrear na Transportadora
              </a>
            )}
          </div>
        )}

        {/* Tracking Timeline */}
        <div className="p-4 md:p-12 bg-white border-b border-black/10 overflow-x-auto max-w-full">
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

        {/* Tracking Events Log */}
        {order.trackingEvents && Array.isArray(order.trackingEvents) && order.trackingEvents.length > 0 && (
          <div className="p-8 md:p-12 bg-black/5 border-b border-black/10">
            <h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-black/40 mb-6 flex items-center gap-2">
              <Truck size={14} /> Histórico de Movimentação Logística
            </h3>
            <div className="space-y-4">
              {order.trackingEvents.map((evt: any, eidx: number) => (
                <div key={eidx} className="bg-white p-4 border border-black/10 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">{evt.description || evt.status}</p>
                    {evt.location && <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">{evt.location}</p>}
                  </div>
                  {evt.date && (
                    <span className="text-[9px] font-mono text-gray-400 font-bold">
                      {new Date(evt.date).toLocaleString('pt-BR')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
                       Qtd: {itemValue.quantity} {itemValue.color && `| Cor: ${itemValue.color}`} {itemValue.size && `| Tam: ${itemValue.size}`}
                    </p>
                    {itemValue.printConfigs && itemValue.printConfigs.length > 0 && (
                      <div className="mt-2 text-[9px] text-[#eab308] uppercase tracking-widest font-black space-y-1">
                        {itemValue.printConfigs.map((cfg: any, cidx: number) => (
                          <div key={cidx}>· {cfg.stamp} ({cfg.location})</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 space-y-3 pt-6 border-t border-black/10">
              {order.subtotal > 0 && (
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-black/40">
                  <span>Subtotal</span>
                  <span>R$ {(order.subtotal || 0).toFixed(2)}</span>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-black/40">
                  <span>Frete</span>
                  <span>R$ {(order.shippingCost || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Delivery & Payment */}
          <div className="space-y-12">
            {order.address && (
              <div>
                <h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-black/40 mb-6 flex items-center gap-2 border-b border-black/5 pb-2">
                  <MapPin size={14} /> Endereço de Entrega
                </h3>
                <div className="bg-black/[0.03] p-6 text-[11px] uppercase tracking-[0.1em] leading-relaxed border-l-4 border-[#eab308]">
                  {order.customerName && <p className="font-black mb-2 text-sm">{order.customerName}</p>}
                  <p className="font-bold">{(order.address.street || '').toString()}, {order.address.number || ''}</p>
                  {order.address.complement && <p className="font-bold">COMPL: {order.address.complement}</p>}
                  {order.address.neighborhood && <p className="font-bold">{order.address.neighborhood}</p>}
                  <p className="font-bold">{order.address.city} - {order.address.state}</p>
                  {order.address.cep && <p className="font-black text-[#eab308] mt-3">CEP: {order.address.cep}</p>}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-black/40 mb-6 flex items-center gap-2 border-b border-black/5 pb-2">
                <CreditCard size={14} /> Status e Ações
              </h3>
              <div className="space-y-6">
                {(order.status === 'payment_pending' || order.status === 'received') ? (
                  <div className="bg-black text-white p-8 space-y-6 shadow-2xl relative overflow-hidden">
                    <div className="flex items-center gap-4 mb-2">
                       <div className="p-2 bg-[#eab308] text-black">
                         <Clock size={24} />
                       </div>
                       <h4 className="text-xl font-black uppercase tracking-tighter italic">Processando Pagamento</h4>
                    </div>
                    <p className="text-xs text-gray-400 font-bold uppercase leading-relaxed tracking-wider">
                      O seu pagamento está sendo processado. A confirmação geralmente ocorre em poucos segundos.
                    </p>

                    {order.point_of_interaction?.transaction_data && (
                      <div className="bg-white p-6 space-y-6 border border-white/5 shadow-inner">
                        <p className="text-[10px] font-black uppercase tracking-widest text-black/60 mb-2">Escaneie o QR Code abaixo</p>
                        
                        <div className="flex flex-col items-center gap-6">
                          {order.point_of_interaction.transaction_data.qr_code_base64 && (
                            <div className="bg-white p-3 border border-black/5 rounded-none shadow-sm">
                              <img 
                                src={`data:image/png;base64,${order.point_of_interaction.transaction_data.qr_code_base64}`} 
                                alt="Pix QR Code" 
                                className="w-48 h-48"
                              />
                            </div>
                          )}
                          
                          <div className="w-full text-left">
                            <p className="text-[9px] font-bold uppercase text-black/40 mb-2">Código Copia e Cola</p>
                            <div className="flex gap-2">
                              <input 
                                readOnly 
                                value={order.point_of_interaction.transaction_data.qr_code} 
                                className="flex-1 bg-black/5 border border-black/10 px-4 py-3 text-[10px] font-mono rounded-none overflow-hidden text-ellipsis text-black"
                              />
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(order.point_of_interaction.transaction_data.qr_code);
                                  toast.success("Código copiado!");
                                }}
                                className="bg-black text-white px-4 py-3 text-[9px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all"
                              >
                                Copiar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={() => refreshOrder()}
                      disabled={isRefreshing}
                      className="w-full h-14 bg-white text-black font-black uppercase tracking-[0.3em] text-[11px] hover:bg-[#f7c600] transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl shadow-white/5 active:scale-95"
                    >
                      {isRefreshing ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          <span>Atualizando...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCcw size={18} />
                          <span>Verificar Agora</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="bg-black/5 p-8 border border-black/10 relative overflow-hidden group">
                     <p className="text-[10px] text-black/40 uppercase font-black mb-2 tracking-widest">Informações de Segurança</p>
                     <div className="flex items-end gap-3 mb-6">
                        <p className="font-black uppercase tracking-tighter text-2xl italic">TRACKING VERIFICADO</p>
                        <span className="text-[9px] font-black text-[#f7c600] bg-black px-2 py-0.5 rounded-sm mb-1 uppercase tracking-widest">Seguro</span>
                     </div>
                     
                     <div className="flex items-center gap-3 text-green-600 bg-green-50 p-4 border border-green-100">
                       <div className="bg-green-600 text-white p-1 rounded-full">
                         <ShieldCheck size={16} />
                       </div>
                       <div className="flex flex-col">
                         <p className="text-[11px] font-black uppercase tracking-tighter leading-none">Dados Logísticos Protegidos</p>
                         <p className="text-[8px] font-bold uppercase text-green-600/60 mt-1">Acesso autorizado por token individual ou propriedade</p>
                       </div>
                     </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 border-2 border-[#eab308] p-6 text-center">
              <h4 className="text-sm font-black uppercase tracking-tighter mb-2">Dúvidas sobre seu pedido?</h4>
              <p className="text-[10px] text-black/50 uppercase tracking-widest font-bold mb-4">Estamos à sua disposição no nosso chat oficial.</p>
              <a 
                href={`https://wa.me/5547997465602?text=Olá, tenho uma dúvida sobre meu pedido #${order.orderId || orderId}`}
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

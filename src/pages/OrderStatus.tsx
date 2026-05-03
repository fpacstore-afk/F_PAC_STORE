import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Package, CheckCircle, Clock, XCircle, ArrowLeft, Loader2, MapPin, CreditCard, Truck, ShieldCheck, AlertTriangle, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export function OrderStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

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
    <div className="min-h-[100dvh] pt-24 md:pt-32 pb-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-white max-w-md w-full p-8 md:p-12 text-center relative overflow-hidden"
            >
              {/* Decorative background logo or pattern */}
              <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 opacity-[0.03] rotate-12 pointer-events-none">
                <CheckCircle size={300} />
              </div>

              <div className="relative z-10">
                <div className="w-24 h-24 bg-[#eab308] text-black rounded-none flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-[#eab308]/40">
                  <CheckCircle size={48} strokeWidth={3} />
                </div>
                
                <h2 className="text-4xl font-heading font-black uppercase tracking-tighter mb-4 leading-none text-black">
                  PAGAMENTO<br /><span className="text-[#eab308]">CONFIRMADO!</span>
                </h2>
                
                <p className="text-gray-600 text-sm font-bold uppercase tracking-widest mb-8 leading-relaxed">
                  Tudo certo! Suas peças já entraram na nossa linha de produção.
                </p>

                <div className="space-y-4">
                  <button 
                    onClick={() => {
                      setShowSuccessModal(false);
                      navigate('/');
                    }}
                    className="w-full bg-[#eab308] text-black font-black uppercase tracking-[0.2em] py-5 text-xs hover:bg-black hover:text-white transition-all transform active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Home size={16} /> Voltar para o Início
                  </button>
                  <button 
                    onClick={() => setShowSuccessModal(false)}
                    className="w-full bg-transparent text-gray-400 font-bold uppercase tracking-widest py-3 text-[10px] hover:text-black transition-colors"
                  >
                    Ver detalhes do pedido
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
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
                <p className="font-black uppercase tracking-widest text-xs">{order.paymentMethod}</p>
                {order.paymentMethod.includes('PIX') && order.status === 'pending' && (
                   <div className="mt-4 p-4 bg-white border border-black/5">
                      <p className="text-[10px] font-black uppercase text-black/40 mb-2">Chave PIX:</p>
                      <p className="text-xs font-bold text-[#eab308] break-all">fpacstore@gmail.com</p>
                      <p className="text-[9px] uppercase tracking-widest mt-4 text-center text-red-500 font-bold">
                        ⚠️ Enviar comprovante via WhatsApp
                      </p>
                   </div>
                )}
                {order.status === 'validated' && (
                  <p className="text-[10px] font-bold text-green-500 uppercase tracking-widest mt-3">✅ pagamento confirmado e validado</p>
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

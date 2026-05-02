import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Package, CheckCircle, Clock, XCircle, ArrowLeft, Loader2, MapPin, CreditCard } from 'lucide-react';
import { motion } from 'motion/react';

export function OrderStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = onSnapshot(doc(db, 'orders', orderId), (docSnap) => {
      if (docSnap.exists()) {
        setOrder({ id: docSnap.id, ...docSnap.data() });
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

  const getStatusDisplay = () => {
    switch (order.status) {
      case 'validated':
        return {
          icon: <CheckCircle size={48} className="text-green-500" />,
          title: 'Pedido Validado',
          description: 'Suas informações foram conferidas e seu pedido está em processamento.',
          color: 'text-green-500'
        };
      case 'cancelled':
        return {
          icon: <XCircle size={48} className="text-red-500" />,
          title: 'Pedido Cancelado',
          description: 'Este pedido foi cancelado pelo sistema ou por solicitação.',
          color: 'text-red-500'
        };
      default:
        return {
          icon: <Clock size={48} className="text-yellow-500" />,
          title: 'Aguardando Validação',
          description: 'O administrador está revisando seu pedido via WhatsApp.',
          color: 'text-yellow-500'
        };
    }
  };

  const status = getStatusDisplay();

  return (
    <div className="min-h-screen pt-32 pb-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-black transition-colors mb-8 text-sm uppercase font-bold tracking-widest">
        <ArrowLeft size={16} /> Voltar para Loja
      </Link>

      <div className="bg-white border border-black/10 rounded-none shadow-2xl overflow-hidden">
        {/* Status Header */}
        <div className="bg-black/5 p-8 text-center border-b border-black/10">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex justify-center mb-4"
          >
            {status.icon}
          </motion.div>
          <span className="text-[10px] font-black text-[#eab308] uppercase tracking-[0.3em] mb-2 block">Pedido #{order.id}</span>
          <h1 className="text-3xl font-heading font-black uppercase mb-2">{status.title}</h1>
          <p className="text-gray-600 text-sm max-w-md mx-auto">{status.description}</p>
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Details */}
          <div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-gray-400 mb-6 flex items-center gap-2">
              <Package size={14} /> Itens do Pedido
            </h3>
            <div className="space-y-4">
              {order.items.map((itemValue: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center border-b border-black/5 pb-4">
                  <div className="flex-1">
                    <p className="font-bold text-sm uppercase">{itemValue.name}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                      {itemValue.quantity}x | Cor: {itemValue.color} | Tam: {itemValue.size}
                    </p>
                  </div>
                  <p className="font-bold text-sm">R$ {(itemValue.price * itemValue.quantity).toFixed(2)}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>R$ {order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Frete</span>
                <span>R$ {order.frete.toFixed(2)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-[#eab308] font-bold">
                  <span>Desconto</span>
                  <span>- R$ {order.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xl pt-4 border-t border-black/10 mt-4">
                <span>Total</span>
                <span>R$ {order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Delivery & Payment */}
          <div className="space-y-8">
            <div>
              <h3 className="font-bold uppercase tracking-widest text-xs text-gray-400 mb-4 flex items-center gap-2">
                <MapPin size={14} /> Dados de Entrega
              </h3>
              <div className="bg-black/[0.02] p-4 text-sm border-l-2 border-[#eab308]">
                <p className="font-bold mb-1">{order.customerName}</p>
                <p className="text-gray-600">{order.address}, {order.number}</p>
                {order.complement && <p className="text-gray-600">Compl: {order.complement}</p>}
                <p className="text-gray-600">{order.neighborhood}</p>
                <p className="text-gray-600">{order.city} - {order.state}</p>
                <p className="text-gray-600 font-mono mt-2">CEP: {order.cep}</p>
              </div>
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-widest text-xs text-gray-400 mb-4 flex items-center gap-2">
                <CreditCard size={14} /> Pagamento
              </h3>
              <div className="bg-black/[0.02] p-4 text-sm border-l-2 border-black">
                <p className="font-bold uppercase tracking-widest">{order.paymentMethod}</p>
                {order.paymentMethod === 'PIX' && order.status !== 'validated' && (
                   <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-tight">
                    Chave PIX: fpacstore@gmail.com
                   </p>
                )}
              </div>
            </div>

            <div className="pt-4">
              <p className="text-[9px] text-gray-400 uppercase tracking-widest italic text-center">
                *Este link serve para acompanhamento do seu pedido e validação dos dados financeiros.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

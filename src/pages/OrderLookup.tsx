import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, ArrowRight, ArrowLeft, Package, Clock, Truck, CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, orderBy, onSnapshot, or } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function OrderLookup() {
  const [orderId, setOrderId] = useState('');
  const { user, profile, loading: authLoading } = useAuth();
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      setLoadingOrders(true);
      const ordersRef = collection(db, 'orders');
      
      // Build conditions for matching orders
      const conditions = [where('userId', '==', user.uid)];
      
      const userEmail = user.email ? user.email.toLowerCase() : '';
      if (userEmail) {
        conditions.push(where('customerEmail', '==', userEmail));
      }

      const cpfBase = profile?.cpf || '';
      if (cpfBase) {
        const cleanCpf = String(cpfBase).replace(/\D/g, '');
        // Search in possible fields where CPF might be stored
        conditions.push(where('cpf', '==', cleanCpf));
        conditions.push(where('customerPhone', '==', cleanCpf)); // Just in case it was stored there
      }
      
      const q = query(
        ordersRef, 
        or(...conditions)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const orders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Sort in memory to avoid composite index requirement
        const sortedOrders = [...orders].sort((a: any, b: any) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        });

        setUserOrders(sortedOrders);
        setLoadingOrders(false);
      }, (error) => {
        console.error("Erro ao carregar pedidos:", error);
        setLoadingOrders(false);
      });

      return () => unsubscribe();
    }
  }, [user, profile]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderId.trim()) {
      navigate(`/order/${orderId.trim().toUpperCase()}`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'payment_pending': return <Clock size={16} className="text-yellow-500" />;
      case 'processing': return <Clock size={16} className="text-blue-500" />;
      case 'payment_approved': return <CheckCircle size={16} className="text-green-500" />;
      case 'shipped': return <Truck size={16} className="text-purple-500" />;
      case 'delivered': return <CheckCircle size={16} className="text-green-600" />;
      case 'cancelled': return <XCircle size={16} className="text-red-500" />;
      default: return <Package size={16} className="text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'payment_pending': return 'Aguardando Pagamento';
      case 'processing': return 'Em Produção';
      case 'payment_approved': return 'Pagamento Confirmado';
      case 'shipped': return 'Enviado';
      case 'delivered': return 'Entregue';
      case 'cancelled': return 'Cancelado';
      default: return 'Desconhecido';
    }
  };

  return (
    <div className="min-h-[100dvh] pt-20 md:pt-32 pb-16 flex flex-col items-center px-4 sm:px-6 lg:px-8 bg-white">
      <div className="w-full max-w-4xl">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-black transition-colors mb-8 text-xs uppercase font-bold tracking-[0.2em]">
          <ArrowLeft size={16} /> Voltar para Loja
        </Link>

        {user ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="text-center mb-8">
              <h1 className="text-3xl font-black uppercase tracking-tighter mb-3">Meus Pedidos</h1>
              <p className="text-gray-500 text-sm uppercase tracking-widest font-bold">Histórico de compras vinculadas ao seu CPF</p>
            </div>

            {loadingOrders ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#eab308]"></div>
              </div>
            ) : userOrders.length > 0 ? (
              <div className="grid gap-6">
                {userOrders.map((order) => (
                  <Link 
                    key={order.id} 
                    to={`/order/${order.id}`}
                    className="group bg-black/5 border border-black/10 p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 hover:border-[#eab308] transition-all"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 bg-black text-[#eab308] flex items-center justify-center">
                        <Package size={24} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#eab308] mb-1">ID: {order.id}</p>
                        <p className="text-lg font-black uppercase tracking-tighter">R$ {order.total?.toFixed(2)}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">
                          {order.createdAt?.toDate().toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusIcon(order.status)}
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            {getStatusLabel(order.status)}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest">Status do Pedido</p>
                      </div>
                      <ArrowRight size={20} className="text-gray-300 group-hover:text-[#eab308] transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-black/5 border border-black/10">
                <p className="text-xs uppercase font-bold tracking-widest text-gray-400 mb-6">Nenhum pedido encontrado no seu CPF</p>
                <Link to="/" className="text-[10px] font-black uppercase tracking-[0.2em] bg-black text-white px-8 py-4 hover:bg-[#eab308] hover:text-black transition-all">
                  Começar a Comprar
                </Link>
              </div>
            )}

            <div className="mt-12 pt-12 border-t border-black/5">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest text-center mb-8">Deseja consultar outro pedido manualmente?</p>
              <div className="max-w-md mx-auto">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="ID DO PEDIDO (PAC-XXXXXX)"
                    className="flex-1 bg-black/5 border border-black/10 p-4 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:border-[#eab308] transition-colors"
                  />
                  <button type="submit" className="bg-black text-white px-6 hover:bg-[#eab308] hover:text-black transition-colors">
                    <Search size={18} />
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-black/10 p-8 md:p-12 shadow-2xl mx-auto max-w-md"
          >
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-black text-[#eab308] flex items-center justify-center mx-auto mb-4">
                <Search size={28} />
              </div>
              <h1 className="text-2xl font-black uppercase mb-1 tracking-tighter">Acompanhar Pedido</h1>
              <p className="text-gray-500 text-sm uppercase tracking-widest font-bold">Consulte o status da sua compra</p>
            </div>

            <form onSubmit={handleSearch} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-black/40 mb-2">
                  Código do Pedido
                </label>
                <input
                  type="text"
                  required
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="EX: PAC-XXXXXX"
                  className="w-full bg-black/5 border border-black/10 rounded-none p-4 text-sm font-bold focus:outline-none focus:border-[#eab308] transition-colors placeholder:text-black/10"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-black text-white py-4 font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 hover:bg-[#eab308] hover:text-black transition-all group"
              >
                Consultar Status
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            <div className="mt-12 pt-8 border-t border-black/5 text-center">
              <p className="text-[10px] text-black/30 font-bold uppercase tracking-widest leading-relaxed mb-4">
                O código do pedido foi enviado para o seu WhatsApp no momento da compra.
              </p>
              <Link to="/checkout" className="text-[10px] font-black text-[#eab308] uppercase tracking-widest hover:underline">
                Faça login para ver seu histórico automático
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

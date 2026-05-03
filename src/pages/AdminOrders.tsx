import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { Package, Search, CheckCircle, XCircle, Clock, ExternalLink, LogOut, Loader2, Trash2, Box, Image as ImageIcon, Palette, Maximize2, ToggleLeft, ToggleRight } from 'lucide-react';
import { products } from '../data/products';
import { useInventory } from '../hooks/useInventory';

// Estampas list (same as in Estampas.tsx for now, ideally in a separate data file)
const catalogEstampas = [
  { id: 'peito-1', name: 'Escrita Peito Core' },
  { id: 'cf-001', name: 'Print CF-001' },
  { id: 'cf-002', name: 'Print CF-002' },
];

const allColors = [
  { id: 'color_branco', name: 'Branco' },
  { id: 'color_preto', name: 'Preto' },
  { id: 'color_off_white', name: 'Off White' },
];

const allSizes = [
  { id: 'size_P', name: 'P' },
  { id: 'size_M', name: 'M' },
  { id: 'size_G', name: 'G' },
  { id: 'size_GG', name: 'GG' },
];

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  items: any[];
  subtotal: number;
  frete: number;
  discount: number;
  total: number;
  paymentMethod: string;
  status: 'pending' | 'validated' | 'cancelled';
  createdAt: any;
}

export function AdminOrders() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'validated' | 'cancelled'>('all');
  const [activeTab, setActiveTab] = useState<'orders' | 'inventory'>('orders');
  const { inventory, toggleAvailability, isAvailable } = useInventory();

  const isAdmin = user?.email === 'fpacstore@gmail.com';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(ordersData);
    }, (error) => {
      console.error("Error fetching orders:", error);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      console.log("Iniciando login com popup...");
      await signInWithPopup(auth, provider);
      console.log("Login realizado com sucesso!");
    } catch (error: any) {
      console.error("Login failed:", error);
      alert(`Falha no login: ${error.message}\n\nVerifique se os pop-ups estão permitidos ou se o domínio está autorizado no console do Firebase.`);
    }
  };

  const handleLogout = () => signOut(auth);

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus
      });
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Erro ao atualizar status.");
    }
  };

  const handleValidateOrder = async (order: Order) => {
    try {
      await updateStatus(order.id, 'validated');
      
      // WhatsApp message for customer
      const cleanPhone = order.customerPhone.replace(/\D/g, '');
      let message = `Olá *${order.customerName.toUpperCase()}*!\n\n`;
      message += `✅ *PAGAMENTO CONFIRMADO!*\n\n`;
      message += `Seu pedido *#${order.id}* na *F PAC STORE* foi validado com sucesso e já está em nossa fila de processamento. 🎉\n\n`;
      message += `Muito obrigado por comprar conosco! Já estamos preparando tudo com o maior cuidado. 📦\n\n`;
      const baseUrl = window.location.href.split('#')[0];
      message += `Você pode acompanhar o status atualizado do seu pedido por aqui:\n${baseUrl}#/order/${order.id}`;
      
      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
    } catch (error) {
      console.error("Error validating order:", error);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    const password = prompt("Para excluir este pedido, digite a senha de confirmação:");
    
    if (password === null) return; // User cancelled

    if (password === 'fpacvendas') {
      const confirmed = confirm("Tem certeza que deseja EXCLUIR DEFINITIVAMENTE este pedido? Esta ação não pode ser desfeita.");
      if (confirmed) {
        try {
          await deleteDoc(doc(db, 'orders', orderId));
        } catch (error) {
          console.error("Error deleting order:", error);
          alert("Erro ao excluir pedido. Verifique sua conexão ou permissões.");
        }
      }
    } else {
      alert("Senha incorreta. A exclusão foi cancelada.");
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#eab308]" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-32 pb-24 flex flex-col items-center justify-center max-w-xl mx-auto px-4 text-center">
        <Package size={64} className="text-gray-300 mb-6" />
        <h1 className="text-3xl font-heading font-black uppercase mb-4">Gestão de Pedidos</h1>
        <p className="text-gray-600 mb-8">Acesse para validar as informações dos pedidos recebidos via WhatsApp.</p>
        <button 
          onClick={handleLogin}
          className="bg-black text-white font-bold uppercase px-8 py-3 rounded-none hover:bg-[#eab308] hover:text-black transition-colors flex items-center gap-2"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-32 pb-24 flex flex-col items-center justify-center max-w-xl mx-auto px-4 text-center">
        <XCircle size={64} className="text-red-500 mb-6" />
        <h1 className="text-3xl font-heading font-black uppercase mb-4">Acesso Negado</h1>
        <p className="text-gray-600 mb-8">Você não possui permissões de administrador para acessar esta área.</p>
        <button 
          onClick={handleLogout}
          className="text-gray-500 underline text-sm"
        >
          Sair da conta
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-heading font-black tracking-tighter uppercase">
            Gestão de <span className="text-[#eab308]">Pedidos</span>
          </h1>
          <p className="text-gray-500 mt-2 text-sm">Valide e gerencie os pedidos da <span translate="no">F PAC STORE</span></p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold">{user.displayName}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 bg-black/5 hover:bg-black/10 rounded-full transition-colors"
            title="Sair"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-black/10 mb-8 overflow-x-auto">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${
            activeTab === 'orders' 
              ? 'border-b-2 border-[#eab308] text-black bg-black/[0.02]' 
              : 'text-gray-400 hover:text-black'
          }`}
        >
          <div className="flex items-center gap-2">
            <Package size={14} /> Pedidos Realizados
          </div>
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${
            activeTab === 'inventory' 
              ? 'border-b-2 border-[#eab308] text-black bg-black/[0.02]' 
              : 'text-gray-400 hover:text-black'
          }`}
        >
          <div className="flex items-center gap-2">
            <Box size={14} /> Gestão de Estoque
          </div>
        </button>
      </div>

      {activeTab === 'orders' ? (
        <>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por ID ou Nome..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-black/10 rounded-none focus:outline-none focus:border-[#eab308] text-sm"
              />
            </div>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full py-3 px-4 bg-white border border-black/10 rounded-none focus:outline-none focus:border-[#eab308] text-sm"
            >
              <option value="all">Todos os Status</option>
              <option value="pending">Pendentes</option>
              <option value="validated">Validados</option>
              <option value="cancelled">Cancelados</option>
            </select>
            <div className="flex items-center justify-end">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{filteredOrders.length} pedidos encontrados</p>
            </div>
          </div>

          {/* Orders List */}
          <div className="space-y-6">
            {filteredOrders.length === 0 ? (
              <div className="bg-black/5 border border-dashed border-black/20 p-20 text-center">
                <p className="text-gray-500">Nenhum pedido encontrado com os filtros selecionados.</p>
              </div>
            ) : (
              filteredOrders.map(order => (
                <div key={order.id} className="bg-white border border-black/10 rounded-none overflow-hidden hover:shadow-xl transition-shadow flex flex-col md:flex-row">
                  {/* Order Info */}
                  <div className="flex-1 p-6 border-b md:border-b-0 md:border-r border-black/5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-bold text-[#eab308] uppercase tracking-[0.2em] mb-1 block">#{order.id}</span>
                          {order.createdAt && (
                            <span className="text-[9px] font-bold text-black/30 uppercase">
                              {order.createdAt.toDate().toLocaleString('pt-BR')}
                            </span>
                          )}
                        </div>
                        <h3 className="text-xl font-bold font-heading uppercase">{order.customerName}</h3>
                        <p className="text-xs text-gray-500">{order.customerPhone}</p>
                        {order.customerEmail && <p className="text-xs text-gray-400 lowercase">{order.customerEmail}</p>}
                      </div>
                      <div className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${
                        order.status === 'validated' ? 'bg-green-100 text-green-700' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {order.status === 'validated' ? <CheckCircle size={10} /> :
                         order.status === 'cancelled' ? <XCircle size={10} /> :
                         <Clock size={10} />}
                        {order.status === 'validated' ? 'Validado' :
                         order.status === 'cancelled' ? 'Cancelado' :
                         'Pendente'}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs mb-4">
                      <div>
                        <p className="text-gray-400 font-bold mb-1 uppercase tracking-tighter">Entrega</p>
                        <p>{order.address}, {order.number}</p>
                        <p>{order.neighborhood}, {order.city} - {order.state}</p>
                        <p>CEP: {order.cep}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 font-bold mb-1 uppercase tracking-tighter">Pagamento</p>
                        <p className="font-bold">{order.paymentMethod}</p>
                        <p className="text-gray-500 mt-1">
                          Subtotal: R$ {order.subtotal.toFixed(2)}<br />
                          Frete: R$ {order.frete.toFixed(2)}<br />
                          Desconto: - R$ {order.discount.toFixed(2)}
                        </p>
                        <p className="text-lg font-bold mt-1 text-black">Total: R$ {order.total.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="border-t border-black/5 pt-4">
                      <p className="text-gray-400 font-bold mb-2 uppercase tracking-tighter text-[10px]">Itens do Pedido ({order.items.length})</p>
                      <div className="space-y-3">
                        {order.items.map((item, i) => (
                          <div key={i} className="text-xs">
                            <div className="flex justify-between">
                              <span className="font-medium">{item.quantity}x {item.name} ({item.color} | {item.size})</span>
                              <span className="font-bold">R$ {(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                            {item.printConfigs && item.printConfigs.length > 0 && (
                              <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-[#eab308] pl-2 py-0.5 bg-black/[0.02]">
                                <p className="text-[9px] text-[#eab308] font-bold uppercase tracking-tighter">Personalizações:</p>
                                {item.printConfigs.map((cfg: any, ci: number) => (
                                  <p key={ci} className="text-[9px] text-gray-500 leading-none">
                                    • {cfg.stamp} - {cfg.location} ({cfg.background})
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="w-full md:w-64 bg-black/[0.02] p-6 flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Ações</p>
                      
                      {order.status !== 'validated' && (
                        <button 
                          onClick={() => handleValidateOrder(order)}
                          className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle size={14} /> Validar Pedido
                        </button>
                      )}

                      {order.status !== 'cancelled' && (
                        <button 
                          onClick={() => updateStatus(order.id, 'cancelled')}
                          className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-colors"
                        >
                          <XCircle size={14} /> Cancelar
                        </button>
                      )}

                      {order.status !== 'pending' && (
                        <button 
                          onClick={() => updateStatus(order.id, 'pending')}
                          className="w-full flex items-center justify-center gap-2 bg-yellow-500 text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-yellow-600 transition-colors"
                        >
                          <Clock size={14} /> Marcar como Pendente
                        </button>
                      )}

                      <button 
                        onClick={() => handleDeleteOrder(order.id)}
                        className="w-full flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 py-3 text-xs font-bold uppercase tracking-widest hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} /> Excluir Pedido
                      </button>
                    </div>

                    <div className="space-y-2">
                      <a 
                        href={`https://wa.me/${order.customerPhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full flex items-center justify-center gap-2 bg-black text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-black/80 transition-colors"
                      >
                        Entrar em Contato
                      </a>
                      <a 
                        href={`/#/order/${order.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full flex items-center justify-center gap-2 text-black/50 py-2 text-[10px] font-bold uppercase tracking-widest hover:text-black transition-colors"
                      >
                        Ver Link do Cliente <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="space-y-12">
          {/* Products Management */}
          <section>
            <h2 className="text-xl font-heading font-black uppercase mb-6 flex items-center gap-2">
              <Box size={24} className="text-[#eab308]" /> Modelos de Camisas
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map(product => (
                <div key={product.id} className="bg-white border border-black/10 p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-lg uppercase tracking-tight">{product.name}</h3>
                    <p className="text-xs text-gray-500 mb-4">{product.headline}</p>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-black/5">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isAvailable(product.id) ? 'text-green-600' : 'text-red-600'}`}>
                      {isAvailable(product.id) ? 'Disponível' : 'Indisponível'}
                    </span>
                    <button
                      onClick={() => toggleAvailability(product.id, isAvailable(product.id))}
                      className={`flex items-center gap-2 transition-colors ${isAvailable(product.id) ? 'text-green-600' : 'text-gray-300'}`}
                    >
                      {isAvailable(product.id) ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Prints Management */}
          <section>
            <h2 className="text-xl font-heading font-black uppercase mb-6 flex items-center gap-2">
              <ImageIcon size={24} className="text-[#eab308]" /> Catálogo de Estampas
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {catalogEstampas.map(estampa => (
                <div key={estampa.id} className="bg-white border border-black/10 p-6 flex flex-col justify-between">
                  <h3 className="font-bold text-lg uppercase tracking-tight">{estampa.name}</h3>
                  <div className="flex items-center justify-between pt-4 border-t border-black/5 mt-4">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isAvailable(estampa.id) ? 'text-green-600' : 'text-red-600'}`}>
                      {isAvailable(estampa.id) ? 'Disponível' : 'Indisponível'}
                    </span>
                    <button
                      onClick={() => toggleAvailability(estampa.id, isAvailable(estampa.id))}
                      className={`flex items-center gap-2 transition-colors ${isAvailable(estampa.id) ? 'text-green-600' : 'text-gray-300'}`}
                    >
                      {isAvailable(estampa.id) ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Colors & Sizes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <section>
              <h2 className="text-xl font-heading font-black uppercase mb-6 flex items-center gap-2">
                <Palette size={24} className="text-[#eab308]" /> Cores de Tecido
              </h2>
              <div className="space-y-3">
                {allColors.map(color => (
                  <div key={color.id} className="bg-white border border-black/10 p-4 flex items-center justify-between">
                    <span className="font-bold text-sm uppercase tracking-widest">{color.name}</span>
                    <button
                      onClick={() => toggleAvailability(color.id, isAvailable(color.id))}
                      className={`flex items-center gap-2 transition-colors ${isAvailable(color.id) ? 'text-green-600' : 'text-gray-300'}`}
                    >
                      {isAvailable(color.id) ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-heading font-black uppercase mb-6 flex items-center gap-2">
                <Maximize2 size={24} className="text-[#eab308]" /> Grade de Tamanhos
              </h2>
              <div className="space-y-3">
                {allSizes.map(size => (
                  <div key={size.id} className="bg-white border border-black/10 p-4 flex items-center justify-between">
                    <span className="font-bold text-sm uppercase tracking-widest">Tamanho {size.name}</span>
                    <button
                      onClick={() => toggleAvailability(size.id, isAvailable(size.id))}
                      className={`flex items-center gap-2 transition-colors ${isAvailable(size.id) ? 'text-green-600' : 'text-gray-300'}`}
                    >
                      {isAvailable(size.id) ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

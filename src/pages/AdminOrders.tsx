import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { Package, Search, CheckCircle, XCircle, Clock, ExternalLink, LogOut, Loader2, Trash2, Box, Image as ImageIcon, Palette, Maximize2, ToggleLeft, ToggleRight, Plus } from 'lucide-react';
import { products as staticProducts } from '../data/products';
import { useInventory } from '../hooks/useInventory';
import { cn } from '../lib/utils';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Estampas list
const staticCatalogEstampas = [
  { id: 'peito-1', name: 'Escrita Peito Core', path: '/estampas/F-PAC-ESCRITA-peito C.png' },
  { id: 'logo-premium', name: 'F PAC Full Logo', path: '/estampas/logo-fpac.png' },
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
  const { user, loading: authLoading, loginWithGoogle } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [dynamicProducts, setDynamicProducts] = useState<any[]>([]);
  const [dynamicEstampas, setDynamicEstampas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'validated' | 'cancelled'>('all');
  const [activeTab, setActiveTab] = useState<'orders' | 'inventory'>('orders');
  const { inventory, toggleAvailability, isAvailable } = useInventory();

  const isAdmin = user?.email === 'fpacstore@gmail.com';

  useEffect(() => {
    if (!isAdmin) return;

    // Listen to orders
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(ordersData);
    });

    // Listen to products
    const qProducts = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      const pData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDynamicProducts(pData);
    });

    // Listen to estampas
    const qEstampas = query(collection(db, 'estampas'), orderBy('createdAt', 'desc'));
    const unsubscribeEstampas = onSnapshot(qEstampas, (snapshot) => {
      const eData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDynamicEstampas(eData);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeProducts();
      unsubscribeEstampas();
    };
  }, [isAdmin]);

  const currentProducts = dynamicProducts.length > 0 ? dynamicProducts : staticProducts;
  const currentEstampas = dynamicEstampas.length > 0 ? dynamicEstampas : staticCatalogEstampas;

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error: any) {
      // Errors are handled in AuthContext, but we can log here
      console.error(error);
    }
  };

  const handleLogout = () => signOut(auth);

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
    } catch (error) {
      console.error(error);
    }
  };

  const handleValidateOrder = async (order: Order) => {
    try {
      await updateStatus(order.id, 'validated');
      const cleanPhone = order.customerPhone.replace(/\D/g, '');
      let message = `Olá *${order.customerName.toUpperCase()}*!\n\n✅ *PAGAMENTO CONFIRMADO!*\n\nSeu pedido *#${order.id}* na *F PAC STORE* foi validado.\n\nAcompanhe aqui: ${window.location.origin}/#/order/${order.id}`;
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    } catch (error) { console.error(error); }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (confirm("Excluir este pedido definitivamente?")) {
      await deleteDoc(doc(db, 'orders', orderId));
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.id.toLowerCase().includes(searchTerm.toLowerCase()) || order.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#eab308]" size={48} /></div>;

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen pt-32 flex flex-col items-center justify-center text-center px-4">
        {!user ? (
          <>
            <Package size={64} className="text-gray-300 mb-6" />
            <h1 className="text-3xl font-black uppercase mb-4">Gestão de Pedidos</h1>
            <button onClick={handleLogin} className="bg-black text-white px-8 py-3 font-bold uppercase hover:bg-[#eab308] hover:text-black transition-all">Entrar com Google</button>
          </>
        ) : (
          <>
            <XCircle size={64} className="text-red-500 mb-6" />
            <h1 className="text-3xl font-black uppercase mb-4">Acesso Negado</h1>
            <button onClick={handleLogout} className="text-gray-500 underline">Sair</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter">GESTÃO <span className="text-[#eab308]">F PAC</span></h1>
          <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">Controle total da sua loja</p>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/admin/produtos" className="hidden sm:flex items-center gap-2 bg-black text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all">
            <Plus size={14} /> Cards
          </Link>
          <Link to="/admin/estampas" className="hidden sm:flex items-center gap-2 bg-black text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all">
            <ImageIcon size={14} /> Estampas
          </Link>
          <button onClick={handleLogout} className="p-2 bg-black/5 hover:bg-black/10 rounded-full transition-colors"><LogOut size={20} /></button>
        </div>
      </div>

      <div className="flex border-b border-black/10 mb-8">
        <button onClick={() => setActiveTab('orders')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all", activeTab === 'orders' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Pedidos</button>
        <button onClick={() => setActiveTab('inventory')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all", activeTab === 'inventory' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Estoque</button>
      </div>

      {activeTab === 'orders' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="Buscar pedido..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-black/10 rounded-none text-sm" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="w-full py-3 px-4 border border-black/10 rounded-none text-sm">
              <option value="all">Todos os Status</option>
              <option value="pending">Pendentes</option>
              <option value="validated">Validados</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </div>

          {filteredOrders.map(order => (
            <div key={order.id} className="bg-white border border-black/10 p-6 flex flex-col md:flex-row gap-6 hover:shadow-lg transition-all">
               <div className="flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[10px] font-black text-[#eab308] uppercase tracking-widest">#{order.id}</span>
                    <span className={cn("px-2 py-1 text-[8px] font-black uppercase tracking-widest", order.status === 'validated' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>{order.status}</span>
                  </div>
                  <h3 className="text-xl font-black uppercase">{order.customerName}</h3>
                  <p className="text-xs text-gray-500 mb-4">{order.customerPhone}</p>
                  <div className="grid grid-cols-2 gap-4 text-[10px] uppercase font-bold text-gray-400 border-t pt-4">
                    <div>
                      <p className="text-black mb-1">Itens:</p>
                      {order.items.map((it, idx) => (
                        <p key={idx}>{it.quantity}x {it.name} ({it.size})</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-black mb-1">Total:</p>
                      <p className="text-lg text-black">R$ {order.total?.toFixed(2)}</p>
                    </div>
                  </div>
               </div>
               <div className="md:w-48 flex flex-col gap-2">
                  <button onClick={() => handleValidateOrder(order)} className="w-full bg-green-600 text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition-colors">Validar</button>
                  <button onClick={() => updateStatus(order.id, 'cancelled')} className="w-full bg-red-600 text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors">Cancelar</button>
                  <button onClick={() => handleDeleteOrder(order.id)} className="w-full border border-red-200 text-red-600 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-colors">Excluir</button>
               </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-12">
          {/* Inventory Items Management using Dynamic Products and Estampas */}
          <section>
            <h2 className="text-xl font-black uppercase mb-8 flex items-center gap-2">Disponibilidade de Cards</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentProducts.map(p => {
                const available = isAvailable(p.id);
                return (
                  <div key={p.id} className="bg-white border border-black/10 p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-black/5 flex-shrink-0">
                        <img src={p.images[0]} className={cn("w-full h-full object-cover grayscale", available && "grayscale-0")} />
                      </div>
                      <div>
                        <h4 className="font-black text-xs uppercase truncate w-32">{p.name}</h4>
                        <span className={cn("text-[8px] font-bold uppercase", available ? "text-green-600" : "text-red-500")}>{available ? 'No Site' : 'Oculto'}</span>
                      </div>
                    </div>
                    <button onClick={() => toggleAvailability(p.id, available)} className={cn("transition-colors", available ? "text-green-600" : "text-gray-300")}>
                      {available ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
             <h2 className="text-xl font-black uppercase mb-8 flex items-center gap-2">Disponibilidade de Estampas</h2>
             <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                {currentEstampas.map(e => {
                  const available = isAvailable(e.id);
                  return (
                    <div key={e.id} className="bg-white border border-black/10 p-4 flex flex-col">
                      <div className="aspect-square bg-black/5 mb-4 p-2">
                        <img src={e.image || e.path} className={cn("w-full h-full object-contain grayscale", available && "grayscale-0")} />
                      </div>
                      <div className="flex items-center justify-between border-t pt-4">
                        <span className="text-[10px] font-black uppercase truncate w-24">{e.name}</span>
                        <button onClick={() => toggleAvailability(e.id, available)} className={cn("transition-colors", available ? "text-green-600" : "text-gray-300")}>
                          {available ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
             </div>
          </section>
        </div>
      )}
    </div>
  );
}

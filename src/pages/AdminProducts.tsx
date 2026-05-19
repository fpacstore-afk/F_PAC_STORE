import React, { useState, useEffect, useMemo } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, getDocs, setDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Plus, Trash2, Edit2, Save, X, Loader2, ArrowLeft, 
  Image as ImageIcon, Check, ChevronRight, Upload, Search,
  Box, AlertTriangle, CheckCircle2, TrendingUp, Package,
  BarChart3, Settings2, Eye, EyeOff, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { cn, resizeImage } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useInventory } from '../hooks/useInventory';

interface Product {
  id: string;
  name: string;
  slug: string;
  headline: string;
  description: string;
  price: number;
  images: string[];
  stampGallery?: string[];
  sizes: string[];
  colors: { name: string; hex: string }[];
  specs: string[];
  isNew?: boolean;
  isBestseller?: boolean;
  stock?: number;
  minStock?: number;
  category?: string;
}

const ColorVariantBlock = ({ 
  productId, 
  color, 
  sizes, 
  inventory, 
  onUpdateStock, 
  onToggleVariant, 
  onToggleColor 
}: any) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const variants = sizes.map((size: string) => {
    const key = `${color.name}_${size}`;
    const vData = inventory?.variants?.[key] || { stock: 0, available: true };
    return { key, size, data: vData };
  });

  const allDisabled = variants.every((v: any) => v.data.available === false);

  return (
    <div className="border border-black/5 bg-white mb-2 overflow-hidden transition-all hover:border-black/10">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "p-4 flex items-center justify-between cursor-pointer transition-colors",
          allDisabled ? "bg-red-50/20" : "hover:bg-black/[0.01]"
        )}
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <div 
              className="w-4 h-4 rounded-full border border-black/10 shadow-inner" 
              style={{ backgroundColor: color.hex }} 
            />
            {allDisabled && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-[1px] bg-red-500/50 rotate-45" />
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-tight text-black">{color.name}</span>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-1 h-1 rounded-full", allDisabled ? "bg-red-500" : "bg-green-500")} />
              <span className={cn("text-[7px] font-black uppercase tracking-widest", allDisabled ? "text-red-500" : "text-green-600")}>
                {allDisabled ? 'Inativo' : 'Ativo'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {!isExpanded && (
            <div className="hidden sm:flex gap-4">
              {variants.map((v: any) => (
                 <div key={v.key} className="flex flex-col items-center min-w-[20px]">
                    <span className="text-[6px] text-gray-400 font-black mb-0.5 uppercase">{v.size}</span>
                    <span className={cn("text-[9px] font-black italic", v.data.stock > 0 ? "text-black" : "text-gray-300")}>{v.data.stock}</span>
                 </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onToggleColor(productId, color.name, !allDisabled);
              }}
              className={cn(
                "px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all border",
                allDisabled 
                  ? "bg-green-600 border-green-700 text-white" 
                  : "bg-white border-black/10 text-black hover:bg-red-500 hover:text-white"
              )}
            >
              {allDisabled ? 'Ativar' : 'Desativar'}
            </button>
            <div className={cn("transition-transform duration-300", isExpanded && "rotate-180")}>
              <ChevronDown size={14} className="text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-black/[0.03] bg-black/[0.01]"
          >
            <div className="p-4 grid grid-cols-2 md:flex flex-wrap gap-2">
              {variants.map((v: any) => (
                <div key={v.key} className={cn("flex-1 min-w-[100px] bg-white p-4 border transition-all", v.data.available ? "border-black/5" : "border-red-500/10 opacity-70")}>
                   <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider">{v.size}</span>
                      <button 
                        onClick={() => onToggleVariant(productId, v.key, v.data.available)}
                        className={cn("transition-colors", v.data.available ? "text-green-600" : "text-gray-300")}
                      >
                        {v.data.available ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                   </div>
                   <div className="space-y-0.5">
                      <span className="text-[6px] font-black uppercase text-gray-400">Estoque</span>
                      <input 
                        type="number" 
                        value={v.data.stock ?? 0} 
                        onChange={(e) => onUpdateStock(productId, v.key, parseInt(e.target.value) || 0)}
                        className="w-full bg-transparent border-b border-black/10 py-1 text-[11px] font-black italic focus:outline-none focus:border-[#eab308]"
                      />
                   </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function AdminProducts() {
  const { user, loading: authLoading } = useAuth();
  const { inventory, updateVariantStock, toggleAvailability, toggleVariantAvailability, toggleColorAvailability, loading: inventoryLoading } = useInventory();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  // Filters and Search
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    slug: '',
    headline: '',
    description: '',
    price: 0,
    images: [''],
    stampGallery: ['', '', '', ''],
    sizes: ['P', 'M', 'G', 'GG'],
    colors: [
      { name: 'Branco', hex: '#ffffff' },
      { name: 'Preto', hex: '#000000' },
      { name: 'Off White', hex: '#FAF9F6' },
      { name: 'Azul Marinho', hex: '#1b263b' },
      { name: 'Verde Militar', hex: '#3f4238' }
    ],
    specs: ['90% Algodão e 10 Poliéster'],
    isNew: false,
    isBestseller: false,
    stock: 0,
    minStock: 5,
    category: 'Camisetas'
  });

  useEffect(() => {
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

      // Auto-delete "TESTE" products and inventory if encountered by an admin
      if (isAdmin) {
        allDocs.forEach(async (p) => {
          const itemName = String(p.name || '').toUpperCase();
          const itemSlug = String(p.slug || '').toUpperCase();
          // Aggressive match for anything related to "TESTE CHECKOUT"
          const isTest = 
            (itemName.includes('TESTE') && itemName.includes('CHECKOUT')) || 
            (itemSlug.includes('TESTE') && itemSlug.includes('CHECKOUT')) ||
            (itemSlug === 'teste-checkout') ||
            (itemName === 'TESTE CHECKOUT');
          
          if (isTest) {
            try {
              // 1. Delete from products collection
              await deleteDoc(doc(db, 'products', p.id));
              
              // 2. Delete from inventory collection (slug is used as ID)
              if (p.slug) {
                await deleteDoc(doc(db, 'inventory', p.slug));
              }
              
              // 3. Try to clean up by exact document ID if it matched the test pattern
              console.log("Successfully purged test product:", p.id, p.slug);
            } catch (err) {
              console.error("Purge error:", err);
            }
          }
        });
      }

      // Filter out test items immediately from local state
      const data = allDocs.filter(p => {
        const itemName = String(p.name || '').toUpperCase();
        const itemSlug = String(p.slug || '').toUpperCase();
        const isTest = 
          (itemName.includes('TESTE') && itemName.includes('CHECKOUT')) || 
          (itemSlug.includes('TESTE') && itemSlug.includes('CHECKOUT')) ||
          (itemSlug === 'teste-checkout') ||
          (itemName === 'TESTE CHECKOUT');
        return !isTest;
      });
      
      const sortedData = [...data].sort((a, b) => {
        const dateA = (a as any).createdAt?.seconds || 0;
        const dateB = (b as any).createdAt?.seconds || 0;
        return dateB - dateA;
      });

      setProducts(sortedData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const stats = useMemo(() => {
    let totalItems = 0;
    const itemsByProduct: Record<string, number> = {};
    const itemsByColor: Record<string, number> = {};
    const itemsBySize: Record<string, number> = {};

    Object.entries(inventory).forEach(([slug, data]: [string, any]) => {
      const stockVal = data.stock || 0;
      totalItems += stockVal;
      
      // Find product name to filter itemsByProduct metric
      const p = products.find(prod => prod.slug === slug || prod.id === slug);
      if (!p || !p.name) return;

      const name = p.name.toUpperCase();
      const isTargetProduct = name.includes('FORCE') || name.includes('MARK') || name.includes('PRIME');

      if (isTargetProduct) {
        itemsByProduct[slug] = stockVal;
      }

      if (data.variants) {
        Object.entries(data.variants).forEach(([vKey, vData]: [string, any]) => {
           // Try to parse Color_Size or just Size
           const parts = vKey.split('_');
           if (parts.length > 1) {
             const [color, size] = parts;
             itemsByColor[color] = (itemsByColor[color] || 0) + (vData.stock || 0);
             itemsBySize[size] = (itemsBySize[size] || 0) + (vData.stock || 0);
           } else {
             const size = vKey;
             itemsBySize[size] = (itemsBySize[size] || 0) + (vData.stock || 0);
           }
        });
      }
    });

    const lowStock = products.filter(p => {
      const inv = inventory[p.slug];
      return inv && inv.stock > 0 && inv.stock <= (p.minStock || 5);
    }).length;
    const outOfStock = products.filter(p => !inventory[p.slug] || inventory[p.slug].stock === 0).length;
    
    return {
      totalProducts: products.length,
      totalItems,
      itemsByProduct,
      itemsByColor,
      itemsBySize,
      lowStock,
      outOfStock
    };
  }, [products, inventory]);

  const handleCreateSlug = (name: string) => {
    return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const slug = formData.slug || handleCreateSlug(formData.name || '');
      const finalData = { ...formData, slug, createdAt: serverTimestamp() };
      
      if (isEditing) {
        await updateDoc(doc(db, 'products', isEditing), finalData);
        setIsEditing(null);
      } else {
        await addDoc(collection(db, 'products'), finalData);
      }
      
      resetForm();
      toast.success(isEditing ? "Produto atualizado!" : "Produto publicado!");
      setIsAdding(false);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar produto.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      headline: '',
      description: '',
      price: 0,
      images: [''],
      stampGallery: ['', '', '', ''],
      sizes: ['P', 'M', 'G', 'GG'],
    colors: [
      { name: 'Branco', hex: '#ffffff' },
      { name: 'Preto', hex: '#000000' },
      { name: 'Off White', hex: '#FAF9F6' },
      { name: 'Azul Marinho', hex: '#1b263b' },
      { name: 'Verde Militar', hex: '#3f4238' }
    ],
      specs: ['90% Algodão e 10 Poliéster'],
      isNew: false,
      isBestseller: false,
      stock: 0,
      minStock: 5,
      category: 'Camisetas'
    });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
      toast.success('Produto removido.');
    } catch (err) {
      toast.error('Erro ao remover produto.');
    }
  };

  const handleEdit = (product: Product) => {
    setFormData(product);
    setIsEditing(product.id);
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFileUpload = async (file: File): Promise<string> => {
    setIsUploading(true);
    try {
      const resizedBlob = await resizeImage(file);
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, resizedBlob);
      const url = await getDownloadURL(snapshot.ref);
      return url;
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erro ao enviar imagem.");
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const addImage = () => setFormData({ ...formData, images: [...(formData.images || []), ''] });
  const updateImage = (index: number, val: string) => {
    const newImages = [...(formData.images || [])];
    newImages[index] = val;
    setFormData({ ...formData, images: newImages });
  };
  const removeImage = (index: number) => setFormData({ ...formData, images: (formData.images || []).filter((_, i) => i !== index) });

  const filteredProducts = products.filter(p => {
    if (!p.name || p.name.trim() === '') return false;
    
    // Ocultar permanentemente produtos de teste solicitados pelo usuário
    const itemName = String(p.name || '').toUpperCase();
    const itemSlug = String(p.slug || '').toUpperCase();
    const isTest = 
      (itemName.includes('TESTE') && itemName.includes('CHECKOUT')) || 
      (itemSlug.includes('TESTE') && itemSlug.includes('CHECKOUT')) ||
      (itemSlug === 'teste-checkout') ||
      (itemName === 'TESTE CHECKOUT');
    if (isTest) return false;

    const matchesSearch = String(p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         String(p.headline || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    
    let matchesStock = true;
    const inv = inventory[p.slug];
    const currentStock = inv?.stock || 0;
    
    if (stockFilter === 'low') matchesStock = currentStock <= (p.minStock || 5) && currentStock > 0;
    if (stockFilter === 'out') matchesStock = currentStock === 0;

    return matchesSearch && matchesCategory && matchesStock;
  });

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin text-black" size={48} /></div>;

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-white">
        <h1 className="text-2xl font-black uppercase mb-4 tracking-tighter">Acesso Negado</h1>
        <Link to="/" className="bg-black text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all">Voltar para a Loja</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfcfc] pt-16 md:pt-20 pb-20">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Header Dashboard Style */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 mb-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
               <span className="bg-black text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.3em]">GESTOR FPAC</span>
               <div className="h-[2px] w-12 bg-[#eab308]" />
            </div>
            <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tighter leading-[0.8] italic">
              INVENTÁRIO <br />
              <span className="text-[#eab308]">REAL-TIME</span>
            </h1>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.25em] max-w-md leading-relaxed">
              Sistema centralizado para controle de estoque físico e digital. 
              Mantenha o catálogo sempre atualizado e evite sobressaltos.
            </p>
          </div>

          <div className="flex flex-row gap-4 flex-grow max-w-5xl overflow-x-auto pb-4 scrollbar-thin">
             <div className="shrink-0 w-40">
               <StatCard label="PRODUTOS" value={stats.totalProducts} icon={<Package size={16} />} color="text-black" />
             </div>
             <div className="shrink-0 w-40">
               <StatCard label="TOTAL ESTOQUE" value={stats.totalItems} icon={<TrendingUp size={16} />} color="text-emerald-500" />
             </div>
             <div className="shrink-0 w-40">
               <StatCard label="ESTOQUE BAIXO" value={stats.lowStock} icon={<AlertTriangle size={16} />} color="text-amber-500" />
             </div>
             <div className="shrink-0 w-40">
               <StatCard label="ESGOTADOS" value={stats.outOfStock} icon={<X size={16} />} color="text-rose-500" />
             </div>
          </div>
        </div>

        {/* Detailed Metrics Summary */}
        <div className="flex flex-row gap-8 mb-10 overflow-x-auto pb-6 scrollbar-thin">
           <div className="flex-1 min-w-[300px]">
             <MetricsList label="ESTOQUE POR TAMANHO" items={stats.itemsBySize} />
           </div>
           <div className="flex-1 min-w-[300px]">
             <MetricsList label="ESTOQUE POR COR" items={stats.itemsByColor} />
           </div>
           <div className="flex-1 min-w-[300px]">
             <MetricsList label="ESTOQUE POR PRODUTO" items={Object.fromEntries(
               Object.entries(stats.itemsByProduct).map(([slug, val]) => {
                  const p = products.find(prod => prod.slug === slug);
                  return [p?.name || slug, val];
               })
             )} />
           </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div className="flex-1 max-w-lg relative">
                <Search size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-black/20" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="DIGITE O NOME DO PRODUTO..."
                  className="w-full bg-white border border-black/[0.06] pl-16 pr-6 py-4 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-[#eab308] focus:border-transparent outline-none shadow-sm transition-all"
                />
            </div>
            <div className="flex items-center gap-3">
              <Link to="/gestao" className="bg-white border border-black/[0.08] px-6 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all flex items-center gap-2 shadow-sm">
                <ArrowLeft size={14} /> PAINEL DE PEDIDOS
              </Link>
              <button 
                onClick={() => { setIsAdding(!isAdding); if(isAdding) resetForm(); }}
                className={cn(
                  "px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-2",
                  isAdding ? "bg-white text-black border border-black" : "bg-[#eab308] text-black hover:bg-black hover:text-white"
                )}
              >
                {isAdding ? <><X size={16} /> CANCELAR</> : <><Plus size={16} /> CADASTRAR PRODUTO</>}
              </button>
            </div>
        </div>

        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-12 mb-16 shadow-2xl border border-black/5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#eab308]" />
            <h2 className="text-2xl font-black uppercase tracking-tight mb-12 pb-8 border-b border-black/[0.03] flex items-center gap-4 italic text-black/80">
              {isEditing ? 'EDITAR PRODUTO' : 'NOVO PRODUTO'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-16">
              {/* Seção Básica */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-black text-black/30 uppercase tracking-[0.2em] mb-4">Título do Produto</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-[#f9f9f9] border border-black/[0.03] p-6 text-sm font-black focus:bg-white focus:ring-1 focus:ring-[#eab308] outline-none uppercase" placeholder="EX: CAMISETA OVERSIZED VIBE" />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-black/30 uppercase tracking-[0.2em] mb-4">Categoria</label>
                  <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-[#f9f9f9] border border-black/[0.03] p-6 text-sm font-black focus:bg-white focus:ring-1 focus:ring-[#eab308] outline-none uppercase cursor-pointer">
                    <option value="Camisetas">Camisetas</option>
                    <option value="Moletons">Moletons</option>
                    <option value="Acessórios">Acessórios</option>
                    <option value="Limited">Limited Edition</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-black/30 uppercase tracking-[0.2em] mb-4">Valor (R$)</label>
                  <input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} className="w-full bg-[#f9f9f9] border border-black/[0.03] p-6 text-lg font-black focus:bg-white focus:ring-1 focus:ring-[#eab308] outline-none italic" />
                </div>
              </div>

              {/* Seção de Alerts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10 p-10 bg-black text-white shadow-2xl">
                <div>
                  <label className="block text-[11px] font-black text-[#eab308] uppercase tracking-[0.2em] mb-4 italic">Alerta Estoque Mínimo</label>
                  <input required type="number" value={formData.minStock} onChange={e => setFormData({...formData, minStock: parseInt(e.target.value)})} className="w-full bg-white/10 border border-white/10 p-6 text-2xl font-black focus:bg-white focus:text-black outline-none transition-all" />
                  <p className="text-[10px] font-bold text-white/30 mt-3 uppercase tracking-widest italic">* O sistema avisará quando atingir este número</p>
                </div>
                <div className="flex md:col-span-2 items-center justify-around">
                  <button type="button" onClick={() => setFormData({...formData, isNew: !formData.isNew})} className={cn("flex flex-col items-center gap-4 group transition-all", formData.isNew ? "opacity-100" : "opacity-30")}>
                    <div className={cn("w-14 h-14 rounded-full flex items-center justify-center border-2 border-dashed transition-all", formData.isNew ? "border-[#eab308] bg-[#eab308] text-black" : "border-white/20 group-hover:border-white")}>
                      <Check size={28} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Produto Novo / Lançamento</span>
                  </button>
                  <button type="button" onClick={() => setFormData({...formData, isBestseller: !formData.isBestseller})} className={cn("flex flex-col items-center gap-4 group transition-all", formData.isBestseller ? "opacity-100" : "opacity-30")}>
                    <div className={cn("w-14 h-14 rounded-full flex items-center justify-center border-2 border-dashed transition-all", formData.isBestseller ? "border-[#eab308] bg-[#eab308] text-black" : "border-white/20 group-hover:border-white")}>
                      <TrendingUp size={28} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Produto Bestseller</span>
                  </button>
                </div>
              </div>

              {/* Descrições */}
              <div className="grid grid-cols-1 gap-12">
                <div>
                  <label className="block text-[11px] font-black text-black/30 uppercase tracking-[0.2em] mb-4">Slogan / Headline (Curta)</label>
                  <input required type="text" value={formData.headline} onChange={e => setFormData({...formData, headline: e.target.value})} className="w-full bg-[#f9f9f9] border border-black/[0.03] p-6 text-sm font-black focus:bg-white focus:ring-1 focus:ring-[#eab308] outline-none uppercase" placeholder="EX: STREETWEAR PREMIUM | 100% ALGODÃO" />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-black/30 uppercase tracking-[0.2em] mb-4">Informações Técnicas & Detalhes</label>
                  <textarea rows={5} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-[#f9f9f9] border border-black/[0.03] p-6 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-[#eab308] outline-none leading-relaxed" placeholder="Fale sobre o tecido, caimento, cuidados com a lavagem..." />
                </div>
              </div>

              {/* Imagens */}
              <div className="space-y-10">
                <div className="flex items-center gap-4">
                   <h3 className="text-sm font-black uppercase tracking-[0.3em] text-black italic">Mídia & Visual</h3>
                   <div className="h-px flex-grow bg-black/5" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
                  {(formData.images || []).map((url, idx) => (
                    <div key={idx} className="bg-white border border-black/[0.03] p-4 group/card shadow-sm hover:shadow-xl transition-all relative">
                      <div className="aspect-[3/4] bg-[#f9f9f9] relative overflow-hidden flex items-center justify-center">
                        {url ? (
                          <img src={url} alt={`Img ${idx}`} className="w-full h-full object-contain" />
                        ) : (
                          <ImageIcon size={40} className="text-black/5" />
                        )}
                        <div className="absolute inset-0 bg-black/80 opacity-0 group-hover/card:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4">
                           <label className="cursor-pointer bg-white text-black px-6 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] transition-all transform active:scale-95">
                              UPLOAD
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                disabled={isUploading}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    try {
                                      const uploadedUrl = await handleFileUpload(file);
                                      updateImage(idx, uploadedUrl);
                                    } catch (err) {}
                                  }
                                }}
                              />
                           </label>
                           <button type="button" onClick={() => removeImage(idx)} className="text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-[#eab308] transition-colors">Excluir</button>
                        </div>
                      </div>
                      <div className="mt-4 px-2">
                        <input 
                          type="text" 
                          value={url} 
                          onChange={e => updateImage(idx, e.target.value)} 
                          className="w-full bg-transparent border-none p-0 text-[10px] font-bold text-black/20 focus:text-black outline-none" 
                          placeholder="Link da imagem..." 
                        />
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    type="button" 
                    onClick={addImage}
                    className="aspect-[3/4] border-4 border-dotted border-black/5 flex flex-col items-center justify-center gap-6 hover:border-[#eab308] hover:bg-[#eab308]/5 group transition-all p-8"
                  >
                    <Plus size={48} className="text-black/10 group-hover:text-[#eab308] transition-all" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-center text-black/20 group-hover:text-black">NOVA FOTO</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-6 pt-16 border-t border-black/5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-[3] bg-black text-white font-black py-8 uppercase tracking-[0.4em] text-lg hover:bg-[#eab308] hover:text-black transition-all flex items-center justify-center gap-6 shadow-2xl relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/10 translate-x-full group-hover:translate-x-0 transition-transform duration-700" />
                  {loading ? <Loader2 className="animate-spin" size={32} /> : <><Save size={32} /> {isEditing ? 'SALVAR ALTERAÇÕES' : 'PUBLICAR PRODUTO'}</>}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* List Toolbar Filters */}
        <div className="flex flex-wrap items-center gap-8 mb-12 px-6 py-6 bg-white border border-black/[0.04] shadow-sm rounded-none">
           <div className="flex items-center gap-4 text-black/40">
              <BarChart3 size={18} />
              <span className="text-[11px] font-black uppercase tracking-[0.2em]">Filtros Rápidos:</span>
           </div>
           <div className="flex flex-wrap gap-3">
              {['all', 'Camisetas', 'Moletons', 'Acessórios'].map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    "px-6 py-3 text-[10px] font-black uppercase tracking-widest border transition-all",
                    categoryFilter === cat ? "bg-black text-white border-black" : "bg-transparent border-black/5 hover:border-black text-black/40 hover:text-black"
                  )}
                >
                  {cat === 'all' ? 'TODOS' : cat}
                </button>
              ))}
           </div>
           <div className="h-8 w-px bg-black/5 ml-auto hidden lg:block" />
           <div className="flex gap-3">
              {[
                { id: 'all', label: 'Estoque: Geral', color: 'bg-black' },
                { id: 'low', label: 'Estoque Baixo', color: 'bg-amber-500' },
                { id: 'out', label: 'Sem Estoque', color: 'bg-rose-500' }
              ].map(f => (
                <button 
                  key={f.id} 
                  onClick={() => setStockFilter(f.id as any)}
                  className={cn(
                    "flex items-center gap-3 px-6 py-3 text-[10px] font-black uppercase tracking-widest border transition-all",
                    stockFilter === f.id ? "bg-black text-white border-black" : "bg-transparent border-black/5 hover:border-black text-black/40 hover:text-black"
                  )}
                >
                  <div className={cn("w-2 h-2 rounded-full", f.color)} />
                  {f.label}
                </button>
              ))}
           </div>
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {loading && !isAdding ? (
            <div className="col-span-full flex justify-center py-40">
              <Loader2 className="animate-spin text-[#eab308]" size={64} />
            </div>
          ) : filteredProducts.length > 0 ? (
            filteredProducts.map((product) => (
              <InventoryProductCard 
                key={product.id} 
                product={product} 
                inventory={inventory[product.slug]}
                updateVariantStock={updateVariantStock}
                toggleVariantAvailability={toggleVariantAvailability}
                toggleColorAvailability={toggleColorAvailability}
                toggleAvailability={toggleAvailability}
                handleEdit={handleEdit} 
                handleDelete={handleDelete}
              />
            ))
          ) : (
            <div className="col-span-full py-32 text-center bg-white border-2 border-dashed border-black/[0.08] shadow-inner">
               <Package size={48} className="mx-auto mb-6 text-black/10" />
               <p className="text-xl font-black uppercase tracking-tighter text-black/20 italic mb-4">Nenhum produto em estoque...</p>
               <button 
                 onClick={() => { setSearchTerm(''); setStockFilter('all'); setCategoryFilter('all'); }} 
                 className="text-[11px] font-black uppercase tracking-widest text-[#eab308] hover:underline"
               >
                 Limpar todos os filtros ativos
               </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white border border-black/5 p-6 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-center justify-between mb-3 text-black/30 group-hover:text-[#eab308] transition-colors">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className={cn("text-3xl font-black italic tracking-tighter leading-none", color)}>
        {value}
      </div>
    </div>
  );
}

function MetricsList({ label, items }: { label: string; items: Record<string, number> }) {
  const sortedItems = Object.entries(items).sort((a, b) => b[1] - a[1]);
  
  return (
    <div className="bg-white border border-black/[0.04] p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-1 h-4 bg-[#eab308]" />
        <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-black italic">{label}</h3>
      </div>
      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-4 custom-scrollbar">
        {sortedItems.length > 0 ? sortedItems.map(([key, val]) => (
          <div key={key} className="flex items-center justify-between group">
             <span className="text-[10px] font-black uppercase tracking-widest text-black/40 group-hover:text-black transition-colors truncate pr-4">{key}</span>
             <div className="flex-grow h-px bg-black/[0.03] mx-4" />
             <span className={cn(
               "text-sm font-black italic",
               val === 0 ? "text-rose-500" : val <= 5 ? "text-amber-500" : "text-black"
             )}>{val}</span>
          </div>
        )) : (
          <p className="text-[10px] font-bold text-black/20 uppercase tracking-widest text-center py-10">Sem dados disponíveis</p>
        )}
      </div>
    </div>
  );
}

interface InventoryProductCardProps {
  key?: string | number;
  product: Product;
  inventory: any;
  updateVariantStock: (id: string, variantKey: string, n: number) => Promise<void>;
  toggleVariantAvailability: (id: string, variantKey: string, s: boolean) => Promise<void>;
  toggleColorAvailability: (id: string, color: string, s: boolean) => Promise<void>;
  toggleAvailability: (id: string, s: boolean) => Promise<void>;
  handleEdit: (p: Product) => void;
  handleDelete: (id: string) => void | Promise<void>;
}

function InventoryProductCard({ 
  product, 
  inventory, 
  updateVariantStock, 
  toggleVariantAvailability, 
  toggleColorAvailability, 
  toggleAvailability, 
  handleEdit, 
  handleDelete 
}: InventoryProductCardProps) {
  const totalStock = inventory?.stock || 0;
  const isAvailable = inventory?.available !== false;
  const status = totalStock === 0 ? 'out' : totalStock <= (product.minStock || 5) ? 'low' : 'ok';
  
  const defaultColors = [
    { name: 'Branco', hex: '#ffffff' },
    { name: 'Preto', hex: '#000000' },
    { name: 'Off White', hex: '#FAF9F6' },
    { name: 'Azul Marinho', hex: '#1b263b' },
    { name: 'Verde Militar', hex: '#3f4238' }
  ];

  const colors = useMemo(() => {
    const baseColors = product.colors && product.colors.length > 0 ? product.colors : defaultColors;
    const finalColors = [...baseColors];
    
    // Ensure Azul Marinho and Verde Militar are always present for FORCE, MARK, PRIME
    const isMainProduct = product.slug === 'force' || product.slug === 'mark' || product.slug === 'prime';
    if (isMainProduct) {
      if (!finalColors.find(c => c.name === 'Azul Marinho')) finalColors.push({ name: 'Azul Marinho', hex: '#1b263b' });
      if (!finalColors.find(c => c.name === 'Verde Militar')) finalColors.push({ name: 'Verde Militar', hex: '#3f4238' });
      if (!finalColors.find(c => c.name === 'Off White')) finalColors.push({ name: 'Off White', hex: '#FAF9F6' });
    }
    
    return finalColors;
  }, [product.colors, product.slug]);

  const sizes = product.sizes && product.sizes.length > 0 ? product.sizes : ['P', 'M', 'G', 'GG'];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      className="bg-white border border-black/[0.04] p-6 shadow-sm hover:shadow-2xl transition-all duration-500 flex flex-col md:flex-row gap-8 group"
    >
      {/* Visual Part */}
      <div className="w-full md:w-48 shrink-0 space-y-4">
        <div className="aspect-[3/4] bg-[#f9f9f9] relative overflow-hidden flex items-center justify-center p-4 border border-black/[0.02]">
           <img src={product.images?.[0]} alt={product.name} className="w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-700" />
           <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
              {product.isNew && <span className="bg-[#eab308] text-black text-[8px] font-black px-2 py-0.5 uppercase tracking-widest shadow-lg">Lançamento</span>}
              {product.isBestseller && <span className="bg-black text-[#eab308] text-[8px] font-black px-2 py-0.5 uppercase tracking-widest shadow-lg">Bestseller</span>}
           </div>
           
           {/* Actions Overlay */}
           <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center gap-4">
              <button 
                onClick={() => handleEdit(product)}
                className="bg-white text-black p-4 hover:bg-[#eab308] transition-colors shadow-2xl"
                title="Editar Cadastro"
              >
                <Edit2 size={24} />
              </button>
              <button 
                onClick={() => handleDelete(product.id)}
                className="bg-white text-rose-600 p-4 hover:bg-black transition-colors shadow-2xl"
                title="Deletar Produto"
              >
                <Trash2 size={24} />
              </button>
           </div>
        </div>
        
        <div className="space-y-4">
            <div className="flex flex-col gap-1">
               <span className="text-[11px] font-black text-black/20 uppercase tracking-widest italic leading-none mb-1">Referência / Slug</span>
               <p className="text-[10px] font-black text-black truncate">{product.slug}</p>
            </div>
            <button 
              onClick={() => toggleAvailability(product.slug, isAvailable)}
              className={cn(
                "w-full py-4 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all",
                isAvailable ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white" : "bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white"
              )}
            >
              {isAvailable ? <><Eye size={16} /> Visível na Loja</> : <><EyeOff size={16} /> Oculto na Loja</>}
            </button>
        </div>
      </div>

      {/* Info & Inventory Management */}
      <div className="flex-1 flex flex-col justify-between">
        <div className="pb-8 border-b border-black/[0.04]">
           <div className="flex items-center justify-between gap-4 mb-4">
              <span className="text-[9px] font-black text-[#eab308] uppercase tracking-[0.3em]">{product.category}</span>
              <div className="flex items-center gap-2">
                 <div className={cn("w-2.5 h-2.5 rounded-full shadow-inner", status === 'ok' ? 'bg-emerald-500' : status === 'low' ? 'bg-amber-500' : 'bg-rose-500')} />
                 <span className="text-[9px] font-black uppercase tracking-widest text-black opacity-40">
                   {status === 'ok' ? 'Stock OK' : status === 'low' ? 'Stock Crítico' : 'Esgotado'}
                 </span>
              </div>
           </div>
           <h3 className="text-2xl font-black uppercase tracking-tighter leading-none italic mb-1.5">{product.name}</h3>
           <p className="text-[9px] font-black text-black/30 uppercase tracking-[0.2em] mb-4">{product.headline}</p>
           
           <div className="flex items-end justify-between">
              <p className="text-2xl font-black italic tracking-tighter leading-none">R$ {product.price?.toFixed(2)}</p>
              <div className="text-right">
                 <span className="text-[8px] font-black text-black/20 uppercase tracking-widest block mb-1 italic">Total em Estoque</span>
                 <p className={cn("text-4xl font-black italic tracking-tighter leading-none", status !== 'ok' ? 'text-[#eab308]' : 'text-black')}>
                   {totalStock}
                 </p>
              </div>
           </div>
        </div>

        <div className="pt-8">
           <div className="flex items-center gap-3 mb-6">
              <Settings2 size={16} className="text-[#eab308]" />
              <span className="text-[11px] font-black uppercase tracking-[0.25em] text-black italic">Gerenciar Variantes</span>
           </div>
           <div className="flex flex-col gap-1">
              {colors.map(color => (
                <ColorVariantBlock 
                  key={color.name}
                  productId={product.slug}
                  color={color}
                  sizes={sizes}
                  inventory={inventory}
                  onUpdateStock={updateVariantStock}
                  onToggleVariant={toggleVariantAvailability}
                  onToggleColor={toggleColorAvailability}
                />
              ))}
           </div>
        </div>
      </div>
    </motion.div>
  );
}

function Minus({ size, className }: { size?: number, className?: string }) {
  return <div className={cn("w-3 h-0.5 bg-current", className)} />;
}

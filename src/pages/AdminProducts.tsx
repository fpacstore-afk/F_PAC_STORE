import React, { useState, useEffect } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Plus, Trash2, Edit2, Save, X, Loader2, ArrowLeft, Image as ImageIcon, Check, ChevronRight, Upload, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { cn, resizeImage } from '../lib/utils';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

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

export function AdminProducts() {
  const { user, loading: authLoading } = useAuth();
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
    colors: [{ name: 'Preto', hex: '#000000' }],
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
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      
      // Sort in memory
      const sortedData = [...data].sort((a, b) => {
        const dateA = (a as any).createdAt?.seconds || 0;
        const dateB = (b as any).createdAt?.seconds || 0;
        return dateB - dateA;
      });

      setProducts(sortedData);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

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
        // Sincronizar com inventário se tiver slug
        if (slug) {
          await updateDoc(doc(db, 'inventory', slug), {
            stock: formData.stock || 0,
            available: (formData.stock || 0) > 0,
            updatedAt: serverTimestamp()
          }).catch(async () => {
            // Se falhar (doc não existe), tenta criar
            await addDoc(collection(db, 'inventory'), {
              id: slug,
              stock: formData.stock || 0,
              available: (formData.stock || 0) > 0,
              updatedAt: serverTimestamp()
            }).catch(() => {});
          });
        }
        setIsEditing(null);
      } else {
        const docRef = await addDoc(collection(db, 'products'), finalData);
        // Criar entrada no inventário
        if (slug) {
          await updateDoc(doc(db, 'inventory', slug), {
            stock: formData.stock || 0,
            available: (formData.stock || 0) > 0,
            updatedAt: serverTimestamp()
          }).catch(async () => {
             // Tenta setDoc com o ID fixo (slug) que é o padrão usado pelo checkout em alguns lugares
             const { setDoc } = await import('firebase/firestore');
             await setDoc(doc(db, 'inventory', slug), {
               stock: formData.stock || 0,
               available: (formData.stock || 0) > 0,
               updatedAt: serverTimestamp()
             }, { merge: true }).catch(() => {});
          });
        }
      }
      
      resetForm();
      toast.success(isEditing ? "Produto atualizado!" : "Produto publicado!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar produto.");
    } finally {
      setLoading(false);
      setIsAdding(false);
    }
  };

  const handleQuickStockUpdate = async (productId: string, newStock: number) => {
    if (newStock < 0) return;
    try {
      // 1. Atualiza na coleção 'products'
      await updateDoc(doc(db, 'products', productId), {
        stock: newStock,
        updatedAt: serverTimestamp()
      });

      // 2. Tenta encontrar o produto para pegar o slug e atualizar 'inventory'
      const product = products.find(p => p.id === productId);
      if (product && product.slug) {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'inventory', product.slug), {
          stock: newStock,
          available: newStock > 0,
          updatedAt: serverTimestamp()
        }, { merge: true });
        console.log(`✅ [SYNC] Inventário sincronizado para ${product.slug}: ${newStock}`);
      }

      toast.success('Estoque atualizado');
    } catch (error) {
      console.error("Erro ao sincronizar estoque:", error);
      toast.error('Erro ao atualizar estoque');
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
      colors: [{ name: 'Preto', hex: '#000000' }],
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

  const updateStamp = (index: number, val: string) => {
    const newStamps = [...(formData.stampGallery || ['', '', '', ''])];
    newStamps[index] = val;
    setFormData({ ...formData, stampGallery: newStamps });
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = String(p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         String(p.headline || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    
    let matchesStock = true;
    if (stockFilter === 'low') matchesStock = (p.stock || 0) <= (p.minStock || 5) && (p.stock || 0) > 0;
    if (stockFilter === 'out') matchesStock = (p.stock || 0) === 0;

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
    <div className="min-h-screen bg-[#fafafa] pt-40 pb-32">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-4">
               <span className="bg-black text-white px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em]">ADMIN</span>
               <div className="h-px w-12 bg-black/10" />
            </div>
            <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tighter leading-[0.9]">
              Gestão de <br />
              <span className="text-[#eab308]">PRODUTOS</span>
            </h1>
            <p className="text-gray-400 text-[11px] font-bold uppercase tracking-widest mt-4">
              Controle de estoque, preços e catálogo
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/gestao" className="flex items-center gap-3 bg-white border border-black/10 px-6 py-4 text-[10px] font-black uppercase tracking-widest hover:border-black transition-all group">
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> 
              Pedidos
            </Link>
            <button 
              onClick={() => { setIsAdding(!isAdding); if(isAdding) resetForm(); }}
              className="bg-black text-white px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all shadow-xl flex items-center gap-3"
            >
              {isAdding ? <><X size={16} /> Cancelar</> : <><Plus size={16} /> Novo Produto</>}
            </button>
          </div>
        </div>

        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-10 mb-16 shadow-2xl border border-black/5"
          >
            <h2 className="text-sm font-black uppercase tracking-widest mb-10 pb-6 border-b border-black/5 flex items-center gap-3">
              <ImageIcon size={20} className="text-[#eab308]" /> {isEditing ? 'Editar Produto' : 'Cadastrar Novo Item'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-12">
              {/* Seção Básica */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Nome Comercial</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-[#f9f9f9] border-none p-5 text-sm font-bold focus:ring-1 focus:ring-[#eab308] outline-none uppercase" placeholder="EX: CAMISETA OVERSIZED VIBE" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Categoria</label>
                  <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-[#f9f9f9] border-none p-5 text-sm font-bold focus:ring-1 focus:ring-[#eab308] outline-none uppercase">
                    <option value="Camisetas">Camisetas</option>
                    <option value="Moletons">Moletons</option>
                    <option value="Acessórios">Acessórios</option>
                    <option value="Limited">Limited Edition</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Preço (R$)</label>
                  <input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} className="w-full bg-[#f9f9f9] border-none p-5 text-sm font-bold focus:ring-1 focus:ring-[#eab308] outline-none" />
                </div>
              </div>

              {/* Seção de Estoque */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-8 bg-[#f9f9f9] border border-black/5">
                <div>
                  <label className="block text-[10px] font-black text-gray-800 uppercase tracking-widest mb-3 italic">Estoque Atual</label>
                  <input required type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: parseInt(e.target.value)})} className="w-full bg-white border border-black/10 p-5 text-lg font-black focus:ring-1 focus:ring-[#eab308] outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 italic">Alerta de Estoque Mínimo</label>
                  <input required type="number" value={formData.minStock} onChange={e => setFormData({...formData, minStock: parseInt(e.target.value)})} className="w-full bg-white border border-black/10 p-5 text-lg font-black focus:ring-1 focus:ring-[#eab308] outline-none" />
                </div>
                <div className="flex items-center justify-center gap-8">
                  <label className="flex items-center gap-4 cursor-pointer group">
                    <div onClick={() => setFormData({...formData, isNew: !formData.isNew})} className={cn("w-6 h-6 border-2 border-black/10 flex items-center justify-center transition-colors", formData.isNew && "bg-black border-black")}>
                      {formData.isNew && <Check size={16} className="text-[#eab308]" />}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-black">Lançamento</span>
                  </label>
                  <label className="flex items-center gap-4 cursor-pointer group">
                    <div onClick={() => setFormData({...formData, isBestseller: !formData.isBestseller})} className={cn("w-6 h-6 border-2 border-black/10 flex items-center justify-center transition-colors", formData.isBestseller && "bg-black border-black")}>
                      {formData.isBestseller && <Check size={16} className="text-[#eab308]" />}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-black">Bestseller</span>
                  </label>
                </div>
              </div>

              {/* Descrições */}
              <div className="grid grid-cols-1 gap-8">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Headline Curta</label>
                  <input required type="text" value={formData.headline} onChange={e => setFormData({...formData, headline: e.target.value})} className="w-full bg-[#f9f9f9] border-none p-5 text-sm font-bold focus:ring-1 focus:ring-[#eab308] outline-none uppercase" placeholder="EX: STREETWEAR PREMIUM | 100% ALGODÃO" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Descrição Detalhada</label>
                  <textarea rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-[#f9f9f9] border-none p-5 text-sm font-medium focus:ring-1 focus:ring-[#eab308] outline-none" placeholder="Fale sobre o tecido, caimento e detalhes técnicos..." />
                </div>
              </div>

              {/* Atributos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Cores e Variantes</label>
                  <div className="flex flex-wrap gap-4">
                    {formData.colors?.map((color, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-[#f9f9f9] border border-black/5 p-3">
                        <div className="w-5 h-5 rounded-full shadow-inner" style={{ backgroundColor: color.hex }} />
                        <input 
                          type="text" 
                          value={color.name} 
                          onChange={(e) => {
                            const newColors = [...(formData.colors || [])];
                            newColors[idx].name = e.target.value;
                            setFormData({ ...formData, colors: newColors });
                          }}
                          className="bg-transparent border-none text-[10px] uppercase font-black focus:outline-none w-24"
                        />
                        <input 
                          type="color" 
                          value={color.hex} 
                          onChange={(e) => {
                            const newColors = [...(formData.colors || [])];
                            newColors[idx].hex = e.target.value;
                            setFormData({ ...formData, colors: newColors });
                          }}
                          className="w-5 h-5 bg-transparent border-none cursor-pointer"
                        />
                        <button type="button" onClick={() => setFormData({ ...formData, colors: (formData.colors || []).filter((_, i) => i !== idx) })} className="text-red-500 hover:text-black transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button 
                      type="button" 
                      onClick={() => setFormData({ ...formData, colors: [...(formData.colors || []), { name: 'Nova Cor', hex: '#000000' }] })}
                      className="px-6 py-3 border border-dashed border-black/20 text-[9px] uppercase font-black text-gray-400 hover:border-black hover:text-black transition-all"
                    >
                      + ADICIONAR COR
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Tamanhos Ativos</label>
                  <div className="flex flex-wrap gap-3">
                    {['PP', 'P', 'M', 'G', 'GG', 'XG', 'U'].map((size) => {
                      const isSelected = formData.sizes?.includes(size);
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => {
                            const currentSizes = formData.sizes || [];
                            const newSizes = isSelected 
                              ? currentSizes.filter(s => s !== size)
                              : [...currentSizes, size];
                            setFormData({ ...formData, sizes: newSizes });
                          }}
                          className={cn(
                            "w-12 h-12 border text-[11px] font-black flex items-center justify-center transition-all",
                            isSelected ? "bg-black border-black text-[#eab308]" : "bg-white border-black/10 text-black hover:border-black"
                          )}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Imagens */}
              <div className="space-y-8">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 italic">Galeria de Imagens (3:4 Recomendado)</label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                  {(formData.images || []).map((url, idx) => (
                    <div key={idx} className="bg-white border border-black/5 p-3 space-y-4 shadow-sm group/card">
                      <div className="aspect-[3/4] bg-[#f9f9f9] relative overflow-hidden flex items-center justify-center">
                        {url ? (
                          <img src={url} alt={`Img ${idx}`} className="w-full h-full object-contain" />
                        ) : (
                          <ImageIcon size={32} className="text-black/5" />
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/card:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                           <label className="cursor-pointer bg-white text-black px-4 py-2 text-[9px] font-black uppercase tracking-widest hover:bg-[#eab308] transition-all">
                              Mudar Foto
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
                           <button type="button" onClick={() => removeImage(idx)} className="text-white text-[9px] font-black uppercase tracking-widest hover:text-red-500">Excluir</button>
                        </div>
                      </div>
                      <input 
                        type="text" 
                        value={url} 
                        onChange={e => updateImage(idx, e.target.value)} 
                        className="w-full bg-[#f9f9f9] border-none p-2 text-[8px] focus:ring-1 focus:ring-[#eab308] outline-none" 
                        placeholder="URL Direta..." 
                      />
                    </div>
                  ))}
                  
                  <button 
                    type="button" 
                    onClick={addImage}
                    className="aspect-[3/4] border-2 border-dashed border-black/10 flex flex-col items-center justify-center gap-4 hover:border-black hover:text-black transition-all group p-6"
                  >
                    <Plus size={32} className="text-black/10 group-hover:text-black transition-colors" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-center">FOTO EXTRA</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-12 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="flex-1 bg-white border border-black/10 text-black font-black py-6 uppercase tracking-[0.2em] text-xs hover:border-black transition-all"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-[2] bg-black text-white font-black py-6 uppercase tracking-[0.3em] text-base hover:bg-[#eab308] hover:text-black transition-all flex items-center justify-center gap-4 shadow-2xl"
                >
                  {loading ? <Loader2 className="animate-spin" size={24} /> : <><Save size={24} /> {isEditing ? 'SALVAR ALTERAÇÕES' : 'PUBLICAR PRODUTO NO SITE'}</>}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Toolbar de Busca e Filtros */}
        <div className="bg-white p-8 mb-12 shadow-sm border border-black/5 flex flex-col md:flex-row gap-6 items-center">
            <div className="flex-1 w-full relative">
                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="BUSCAR PELO NOME OU HEADLINE..."
                  className="w-full bg-[#f9f9f9] border-none pl-14 pr-6 py-5 text-xs font-bold uppercase tracking-widest focus:ring-1 focus:ring-[#eab308] outline-none"
                />
            </div>
            <div className="flex gap-4 w-full md:w-auto">
                <select 
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="bg-[#f9f9f9] border-none px-6 py-5 text-[10px] font-black uppercase tracking-widest outline-none focus:ring-1 focus:ring-[#eab308]"
                >
                    <option value="all">TODAS CATEGORIAS</option>
                    {categories.map((c: string) => <option key={c} value={c}>{c?.toUpperCase()}</option>)}
                </select>
                <select 
                  value={stockFilter}
                  onChange={e => setStockFilter(e.target.value as any)}
                  className="bg-[#f9f9f9] border-none px-6 py-5 text-[10px] font-black uppercase tracking-widest outline-none focus:ring-1 focus:ring-[#eab308]"
                >
                    <option value="all">ESTOQUE (TODOS)</option>
                    <option value="low">ESTOQUE BAIXO</option>
                    <option value="out">SEM ESTOQUE</option>
                </select>
            </div>
        </div>

        {/* Listagem Profissional */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 touch-auto">
          {loading && !isAdding ? (
            <div className="col-span-full flex justify-center py-40">
              <Loader2 className="animate-spin text-black" size={48} />
            </div>
          ) : filteredProducts.length > 0 ? (
            filteredProducts.map((product) => (
              <ProductCard 
                key={product.id} 
                product={product} 
                handleEdit={handleEdit} 
                handleDelete={handleDelete}
                handleQuickStockUpdate={handleQuickStockUpdate}
              />
            ))
          ) : (
            <div className="col-span-full text-center py-40 bg-white border border-dashed border-black/10">
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-6">Nenhum produto encontrado com estes filtros.</p>
              <button 
                onClick={() => { setSearchTerm(''); setStockFilter('all'); setCategoryFilter('all'); }} 
                className="text-xs font-black uppercase underline hover:text-[#eab308]"
              >
                Limpar Filtros
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  handleEdit: (p: Product) => void;
  handleDelete: (id: string) => Promise<void> | void;
  handleQuickStockUpdate: (id: string, n: number) => Promise<void> | void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, handleEdit, handleDelete, handleQuickStockUpdate }) => {
  const [localStock, setLocalStock] = useState(product.stock || 0);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Sincronizar com props quando elas mudam externamente (ex: onSnapshot)
  useEffect(() => {
    setLocalStock(product.stock || 0);
  }, [product.stock]);

  const stockStatus = (product.stock || 0) === 0 ? 'out' : (product.stock || 0) <= (product.minStock || 5) ? 'low' : 'ok';
  const statusColor = stockStatus === 'ok' ? 'bg-emerald-500' : stockStatus === 'low' ? 'bg-amber-500' : 'bg-rose-500';
  const statusText = stockStatus === 'ok' ? 'Estoque OK' : stockStatus === 'low' ? 'Estoque Baixo' : 'Esgotado';
  
  const handleUpdate = async () => {
    setIsUpdating(true);
    await handleQuickStockUpdate(product.id, localStock);
    setIsUpdating(false);
  };

  return (
    <motion.div 
      layout
      className="bg-white border border-black/5 flex flex-col group hover:shadow-2xl transition-all duration-500 overflow-hidden relative touch-pan-y"
    >
      {/* Stock Status Ribbon */}
      <div className={cn(
        "absolute top-0 right-0 px-3 py-1 text-[8px] font-black uppercase tracking-widest z-10 text-white shadow-sm",
        statusColor
      )}>
        {statusText}
      </div>

      {/* Imagem e Status */}
      <div className="aspect-[4/5] bg-[#f9f9f9] relative overflow-hidden">
        <img 
          src={product.images?.[0]} 
          alt={product.name} 
          className="w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105 p-4" 
        />
        
        <div className="absolute top-4 left-4 flex flex-col gap-2">
            {product.isNew && <span className="bg-[#eab308] text-black text-[9px] font-black px-2 py-1 uppercase tracking-widest shadow-sm">NOVO</span>}
            {product.isBestseller && <span className="bg-black text-white text-[9px] font-black px-2 py-1 uppercase tracking-widest shadow-sm">BESTSELLER</span>}
        </div>

        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center gap-3">
            <button 
              onClick={() => handleEdit(product)}
              className="bg-white text-black p-4 hover:bg-[#eab308] transition-colors shadow-xl"
              title="Editar"
            >
              <Edit2 size={20} />
            </button>
            <button 
              onClick={() => handleDelete(product.id)}
              className="bg-red-600 text-white p-4 hover:bg-black transition-colors shadow-xl"
              title="Excluir"
            >
              <Trash2 size={20} />
            </button>
        </div>
      </div>

      {/* Info Content */}
      <div className="p-5 flex-1 flex flex-col">
        <div className="mb-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[9px] font-black text-[#eab308] uppercase tracking-[0.2em]">{product.category || 'PRODUTO'}</p>
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest italic">Mín: {product.minStock || 5}</span>
            </div>
            <h3 className="font-black uppercase tracking-tighter text-lg leading-tight truncate">{product.name}</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 truncate">{product.headline}</p>
        </div>

        <div className="mt-auto space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest italic">Preço</span>
                <p className="font-black text-lg italic leading-none">R$ {product.price?.toFixed(2)}</p>
            </div>

            <div className="pt-4 border-t border-black/5">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-2 italic">Estoque Atual</span>
                <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setLocalStock(Math.max(0, localStock - 1))}
                      className="w-10 h-10 border border-black/5 flex items-center justify-center hover:bg-black hover:text-white transition-colors"
                    >
                      <X size={12} className="rotate-45" /> 
                    </button>
                    <input 
                       type="number"
                       value={localStock}
                       onChange={e => setLocalStock(parseInt(e.target.value) || 0)}
                       className={cn(
                           "flex-1 bg-[#f9f9f9] border border-black/5 h-10 text-xs font-black text-center outline-none focus:ring-1 focus:ring-black",
                           stockStatus === 'out' ? 'text-red-500' : stockStatus === 'low' ? 'text-amber-600' : 'text-black'
                       )}
                    />
                    <button 
                      onClick={() => setLocalStock(localStock + 1)}
                      className="w-10 h-10 border border-black/5 flex items-center justify-center hover:bg-black hover:text-white transition-colors"
                    >
                      <Plus size={12} />
                    </button>

                    {localStock !== product.stock && (
                        <button 
                          onClick={handleUpdate}
                          disabled={isUpdating}
                          className="bg-black text-[#eab308] h-10 w-12 flex items-center justify-center hover:bg-[#eab308] hover:text-black transition-all shadow-lg"
                        >
                            {isUpdating ? <Loader2 className="animate-spin" size={14} /> : <Check size={16} />}
                        </button>
                    )}
                </div>
            </div>
        </div>
      </div>
    </motion.div>
  );
};

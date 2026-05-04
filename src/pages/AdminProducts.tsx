import React, { useState, useEffect } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Plus, Trash2, Edit2, Save, X, Loader2, ArrowLeft, Image as ImageIcon, Check, ChevronRight, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface Product {
  id: string;
  name: string;
  slug: string;
  headline: string;
  description: string;
  price: number;
  images: string[];
  sizes: string[];
  colors: { name: string; hex: string }[];
  specs: string[];
  isNew?: boolean;
  isBestseller?: boolean;
}

export function AdminProducts() {
  const { user, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const isAdmin = user?.email === 'fpacstore@gmail.com';
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    slug: '',
    headline: '',
    description: '',
    price: 0,
    images: [''],
    sizes: ['P', 'M', 'G', 'GG'],
    colors: [{ name: 'Preto', hex: '#000000' }],
    specs: ['Algodão 100% Premium'],
    isNew: false,
    isBestseller: false
  });

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(data);
      setLoading(false);

      // Automated cleanup for specific models requested by user
      const toDelete = data.filter((p: Product) => {
        const name = (p.name || '').trim().toUpperCase();
        const slug = (p.slug || '').trim().toLowerCase();
        return ['CHRONO', 'AXIS', 'VIBE'].includes(name) || 
               ['chrono', 'axis', 'vibe'].includes(slug) ||
               p.id.includes('vibe') || p.id.includes('axis') || p.id.includes('chrono');
      });
      
      if (toDelete.length > 0) {
        toDelete.forEach(async (p: Product) => {
          try {
            await deleteDoc(doc(db, 'products', p.id));
            await deleteDoc(doc(db, 'inventory', p.id));
          } catch (err) {
            console.error(`Failed to delete ${p.name}`, err);
          }
        });
      }
    });

    // One-time immediate cleanup
    const runInitialCleanup = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        snap.docs.forEach(async (d) => {
          const p = d.data();
          const name = (p.name || '').trim().toUpperCase();
          const slug = (p.slug || '').trim().toLowerCase();
          if (['CHRONO', 'AXIS', 'VIBE'].includes(name) || ['chrono', 'axis', 'vibe'].includes(slug) || d.id.includes('vibe') || d.id.includes('axis') || d.id.includes('chrono')) {
            await deleteDoc(doc(db, 'products', d.id));
            await deleteDoc(doc(db, 'inventory', d.id));
          }
        });
      } catch (err) {}
    };
    runInitialCleanup();

    return () => unsubscribe();
  }, []);

  const handleCreateSlug = (name: string) => {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
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
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar produto.");
    } finally {
      setLoading(false);
      setIsAdding(false);
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
      sizes: ['P', 'M', 'G', 'GG'],
      colors: [{ name: 'Preto', hex: '#000000' }],
      specs: ['Algodão 100% Premium'],
      isNew: false,
      isBestseller: false
    });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Deseja realmente remover este produto?")) {
      await deleteDoc(doc(db, 'products', id));
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
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      return url;
    } catch (error) {
      console.error("Upload error:", error);
      alert("Erro ao enviar imagem.");
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

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#eab308]" size={48} /></div>;

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-black uppercase mb-4">Acesso Negado</h1>
        <Link to="/" className="text-[#eab308] underline uppercase text-xs font-bold">Voltar para a Loja</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pt-32 pb-20 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">Gestão de <span className="text-[#eab308]">Cards</span></h1>
            <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">Adicione roupas e acessórios ao seu catálogo</p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/gestao" className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:text-[#eab308] transition-colors">
              <ArrowLeft size={14} /> Painel de Pedidos
            </Link>
            <button 
              onClick={() => { setIsAdding(!isAdding); if(isAdding) resetForm(); }}
              className="bg-black text-white px-6 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all flex items-center gap-2"
            >
              {isAdding ? <><X size={14} /> Cancelar</> : <><Plus size={14} /> Novo Produto</>}
            </button>
          </div>
        </div>

        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-black text-white p-8 mb-12 shadow-2xl border-l-4 border-[#eab308]"
          >
            <h2 className="text-sm font-black uppercase tracking-widest mb-8 flex items-center gap-3">
              <ImageIcon size={20} className="text-[#eab308]" /> {isEditing ? 'Editar Produto' : 'Detalhes do Novo Card'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Nome do Produto</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-white/5 border border-white/10 p-4 text-sm focus:outline-none focus:border-[#eab308]" placeholder="EX: FORCE OVERSIZED" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Preço (R$)</label>
                  <input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} className="w-full bg-white/5 border border-white/10 p-4 text-sm focus:outline-none focus:border-[#eab308]" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Headline (Subtítulo Curto)</label>
                  <input required type="text" value={formData.headline} onChange={e => setFormData({...formData, headline: e.target.value})} className="w-full bg-white/5 border border-white/10 p-4 text-sm focus:outline-none focus:border-[#eab308]" placeholder="EX: Camisa Streetwear Premium" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Descrição Completa</label>
                  <textarea rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-white/5 border border-white/10 p-4 text-sm focus:outline-none focus:border-[#eab308]" placeholder="Detalhes sobre tecido, gramatura e estilo..." />
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Cores Disponíveis</label>
                <div className="flex flex-wrap gap-3">
                  {formData.colors?.map((color, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white/5 border border-white/10 p-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color.hex }} />
                      <input 
                        type="text" 
                        value={color.name} 
                        onChange={(e) => {
                          const newColors = [...(formData.colors || [])];
                          newColors[idx].name = e.target.value;
                          setFormData({ ...formData, colors: newColors });
                        }}
                        className="bg-transparent border-none text-[10px] uppercase font-bold focus:outline-none w-20"
                      />
                      <input 
                        type="color" 
                        value={color.hex} 
                        onChange={(e) => {
                          const newColors = [...(formData.colors || [])];
                          newColors[idx].hex = e.target.value;
                          setFormData({ ...formData, colors: newColors });
                        }}
                        className="w-4 h-4 bg-transparent border-none cursor-pointer"
                      />
                      <button type="button" onClick={() => setFormData({ ...formData, colors: (formData.colors || []).filter((_, i) => i !== idx) })} className="text-red-500 hover:text-red-400">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button 
                    type="button" 
                    onClick={() => setFormData({ ...formData, colors: [...(formData.colors || []), { name: 'Nova Cor', hex: '#000000' }] })}
                    className="p-2 border border-dashed border-white/20 text-[10px] uppercase font-bold text-gray-500 hover:border-white hover:text-white"
                  >
                    + Cor
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Tamanhos Disponíveis</label>
                <div className="flex flex-wrap gap-3">
                  {['PP', 'P', 'M', 'G', 'GG', 'XG'].map((size) => {
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
                          "w-10 h-10 border text-[10px] font-black flex items-center justify-center transition-all",
                          isSelected ? "bg-[#eab308] border-[#eab308] text-black" : "bg-white/5 border-white/10 text-white hover:border-white/30"
                        )}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Imagens do Produto (URLs)</label>
                {formData.images?.map((url, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input required type="text" value={url} onChange={e => updateImage(idx, e.target.value)} className="flex-1 bg-white/5 border border-white/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" placeholder="https://..." />
                    <button type="button" onClick={() => removeImage(idx)} className="p-3 text-red-500 hover:bg-red-500/10"><Trash2 size={16} /></button>
                  </div>
                ))}
                <div className="flex gap-4">
                  <button type="button" onClick={addImage} className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-white flex items-center gap-1">
                    <Plus size={14} /> Link Manual
                  </button>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#eab308] hover:underline flex items-center gap-1 cursor-pointer">
                    <Upload size={14} /> {isUploading ? 'Subindo...' : 'Subir do PC'}
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      disabled={isUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = await handleFileUpload(file);
                          setFormData({ ...formData, images: [...(formData.images || []), url] });
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-8">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div onClick={() => setFormData({...formData, isNew: !formData.isNew})} className={cn("w-5 h-5 border border-white/20 flex items-center justify-center transition-colors", formData.isNew && "bg-[#eab308] border-[#eab308]")}>
                    {formData.isNew && <Check size={14} className="text-black" />}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest group-hover:text-[#eab308]">Lançamento</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div onClick={() => setFormData({...formData, isBestseller: !formData.isBestseller})} className={cn("w-5 h-5 border border-white/20 flex items-center justify-center transition-colors", formData.isBestseller && "bg-[#eab308] border-[#eab308]")}>
                    {formData.isBestseller && <Check size={14} className="text-black" />}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest group-hover:text-[#eab308]">Bestseller</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#eab308] text-black font-black py-5 uppercase tracking-[0.2em] text-sm hover:bg-white transition-all flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> {isEditing ? 'Salvar Alterações' : 'Publicar no Site'}</>}
              </button>
            </form>
          </motion.div>
        )}

        {/* Lista de Cards */}
        <div className="grid grid-cols-1 gap-4">
          <div className="flex items-center justify-between px-6 py-4 bg-black/5 border border-black/10 text-[10px] font-black uppercase tracking-widest text-gray-400">
            <span>Produto</span>
            <div className="flex items-center gap-20">
              <span className="hidden md:block">Preço</span>
              <span>Ações</span>
            </div>
          </div>
          
          {loading && !isAdding ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-[#eab308]" size={32} />
            </div>
          ) : products.length > 0 ? (
            products.map((product) => (
              <div key={product.id} className="bg-white border border-black/10 p-4 md:p-6 flex items-center justify-between gap-6 hover:border-[#eab308] transition-all group">
                <div className="flex items-center gap-6 flex-1 min-w-0">
                  <div className="w-16 h-16 bg-black/5 overflow-hidden flex-shrink-0">
                    <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-black uppercase tracking-tighter truncate">{product.name}</h3>
                      {product.isNew && <span className="text-[8px] bg-[#eab308] text-black px-1 font-bold">NEW</span>}
                    </div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest truncate">{product.headline}</p>
                  </div>
                </div>

                <div className="flex items-center gap-8 md:gap-20">
                  <p className="text-sm font-black hidden md:block">R$ {product.price?.toFixed(2)}</p>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleEdit(product)}
                      className="p-3 bg-black/5 hover:bg-black hover:text-white transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(product.id)}
                      className="p-3 bg-red-500/5 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-black/5 border border-black/5">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-4">Nenhum produto cadastrado.</p>
              {!isAdding && (
                <button onClick={() => setIsAdding(true)} className="text-[10px] text-[#eab308] font-black uppercase tracking-widest flex items-center gap-2 mx-auto hover:underline">
                  <Plus size={14} /> Comece Agora
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

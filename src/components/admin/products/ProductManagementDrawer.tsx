import React, { useState, useEffect } from 'react';
import { 
  FileText, Image as ImageIcon, Palette, Film, Box, Tag, Layers, 
  Save, X, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Plus, 
  Sparkles, DollarSign, Percent, ShieldCheck, Clock, TrendingUp, TrendingDown, RefreshCw, Eye
} from 'lucide-react';
import { Product, ProductMockup, SizeStockItem } from '../../../types/product';
import { ProductMockupUploader } from './ProductMockupUploader';
import { ColorCarouselManager, ColorVariant } from './ColorCarouselManager';
import { ProductVideoManager } from './ProductVideoManager';
import { db } from '../../../lib/firebase';
import { doc, setDoc, updateDoc, addDoc, collection, serverTimestamp, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { cleanFirestoreData } from '../../../lib/utils';
import toast from 'react-hot-toast';

interface ProductManagementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSaveSuccess: () => void;
}

const CATEGORIES = ['Camisetas', 'Moletons', 'Calças', 'Acessórios', 'Bonés', 'Edição Limitada'];
const COLLECTIONS = ['FORCE', 'MARK', 'PRIME', 'CORE', 'ESSENTIALS', 'STREETWEAR'];

export const ProductManagementDrawer: React.FC<ProductManagementDrawerProps> = ({
  isOpen,
  onClose,
  product,
  onSaveSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'stock' | 'colors' | 'mockups' | 'videos' | 'history'>('info');
  const [saving, setSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    sku: '',
    slug: '',
    headline: '',
    description: '',
    price: 99.90,
    promotionalPrice: undefined,
    costPrice: undefined,
    category: 'Camisetas',
    collection: 'FORCE',
    brand: 'F PAC STORE',
    status: 'active',
    isNew: false,
    isBestseller: false,
    is_prime: false,
    images: [],
    colorVariants: [
      { name: 'Preto', hex: '#000000', images: [] },
      { name: 'Off White', hex: '#FAF9F6', images: [] }
    ],
    videos: [],
    sizes: ['P', 'M', 'G', 'GG'],
    colors: [
      { name: 'Preto', hex: '#000000' },
      { name: 'Off White', hex: '#FAF9F6' }
    ],
    sizeStock: [
      { size: 'P', quantity: 10, minStock: 2, reserved: 0 },
      { size: 'M', quantity: 15, minStock: 3, reserved: 0 },
      { size: 'G', quantity: 15, minStock: 3, reserved: 0 },
      { size: 'GG', quantity: 10, minStock: 2, reserved: 0 }
    ],
    specs: ['100% Algodão Premium 240GSM', 'Ribana Canelada 3cm', 'Modelagem Oversized'],
    weight: 0.35,
    width: 25,
    height: 3,
    length: 30,
    tags: []
  });

  // Realtime Stock Movement Form
  const [movType, setMovType] = useState<'Entrada' | 'Saída' | 'Ajuste' | 'Reserva' | 'Inventário'>('Entrada');
  const [movQty, setMovQty] = useState<number>(1);
  const [movSize, setMovSize] = useState<string>('M');
  const [movColor, setMovColor] = useState<string>('');
  const [movNotes, setMovNotes] = useState<string>('');
  const [isRegisteringMov, setIsRegisteringMov] = useState(false);

  // Stock Movement History
  const [movements, setMovements] = useState<any[]>([]);

  useEffect(() => {
    if (product) {
      setFormData({
        ...product,
        images: product.images || [],
        colorVariants: product.colorVariants || (product.colors || []).map((c) => ({
          name: c.name,
          hex: c.hex,
          images: product.images || []
        })),
        videos: product.videos || [],
        sizes: product.sizes || ['P', 'M', 'G', 'GG'],
        colors: product.colors || [{ name: 'Preto', hex: '#000000' }],
        sizeStock: product.sizeStock || (product.sizes || ['P', 'M', 'G', 'GG']).map((s) => ({
          size: s,
          quantity: product.stock ? Math.floor(product.stock / (product.sizes?.length || 4)) : 10,
          minStock: product.minStock || 2,
          reserved: 0
        }))
      });

      if (product.colors && product.colors.length > 0) {
        setMovColor(product.colors[0].name);
      }
    } else {
      // Reset form for creation
      setFormData({
        name: '',
        sku: `FPAC-PROD-${Math.floor(1000 + Math.random() * 9000)}`,
        slug: '',
        headline: '',
        description: '',
        price: 99.90,
        promotionalPrice: undefined,
        costPrice: undefined,
        category: 'Camisetas',
        collection: 'FORCE',
        brand: 'F PAC STORE',
        status: 'active',
        isNew: true,
        isBestseller: false,
        is_prime: false,
        images: [],
        colorVariants: [
          { name: 'Preto', hex: '#000000', images: [] },
          { name: 'Off White', hex: '#FAF9F6', images: [] }
        ],
        videos: [],
        sizes: ['P', 'M', 'G', 'GG'],
        colors: [
          { name: 'Preto', hex: '#000000' },
          { name: 'Off White', hex: '#FAF9F6' }
        ],
        sizeStock: [
          { size: 'P', quantity: 10, minStock: 2, reserved: 0 },
          { size: 'M', quantity: 15, minStock: 3, reserved: 0 },
          { size: 'G', quantity: 15, minStock: 3, reserved: 0 },
          { size: 'GG', quantity: 10, minStock: 2, reserved: 0 }
        ],
        specs: ['100% Algodão Premium 240GSM', 'Ribana Canelada 3cm', 'Modelagem Oversized'],
        weight: 0.35,
        width: 25,
        height: 3,
        length: 30,
        tags: []
      });
    }
  }, [product, isOpen]);

  // Subscribe to movements history for this product
  useEffect(() => {
    if (!product?.id) {
      setMovements([]);
      return;
    }

    const q = query(
      collection(db, 'stock_movements'),
      where('productId', '==', product.id),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMovements(list);
    }, (error) => {
      console.warn('Could not load movements query, falling back silently:', error);
    });

    return () => unsubscribe();
  }, [product?.id]);

  if (!isOpen) return null;

  // Auto generate SKU & Slug from Name
  const handleNameChange = (val: string) => {
    const cleanSlug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const generatedSku = `FPAC-${val.substring(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    setFormData((prev) => ({
      ...prev,
      name: val,
      slug: prev.slug || cleanSlug,
      sku: prev.sku || generatedSku
    }));
  };

  const handleColorVariantsChange = (updatedVariants: ColorVariant[]) => {
    const updatedColors = updatedVariants.map((v) => ({ name: v.name, hex: v.hex }));
    const allVariantImages = updatedVariants.flatMap((v) => v.images || []);
    const mergedImages = Array.from(new Set([...(formData.images || []), ...allVariantImages]));

    setFormData((prev) => ({
      ...prev,
      colorVariants: updatedVariants,
      colors: updatedColors,
      images: mergedImages.length > 0 ? mergedImages : prev.images
    }));
  };

  // Real-time Movement Handler
  const handleRegisterMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product?.id) {
      toast.error('Salve o produto primeiro para registrar movimentações.');
      return;
    }

    if (movQty <= 0) {
      toast.error('Informe uma quantidade maior que zero.');
      return;
    }

    setIsRegisteringMov(true);
    const toastId = toast.loading('Registrando movimentação no estoque...');

    try {
      const isDecrease = movType === 'Saída' || movType === 'Reserva';
      const delta = isDecrease ? -movQty : movQty;

      const updatedSizeStock = (formData.sizeStock || []).map((s) => {
        if (s.size === movSize) {
          const currentQty = s.quantity || 0;
          const newQty = Math.max(0, currentQty + delta);
          return { ...s, quantity: newQty };
        }
        return s;
      });

      const totalStock = updatedSizeStock.reduce((acc, curr) => acc + (curr.quantity || 0), 0);

      setFormData((prev) => ({
        ...prev,
        sizeStock: updatedSizeStock,
        stock: totalStock
      }));

      // Update Firestore product
      await updateDoc(doc(db, 'products', product.id), {
        sizeStock: updatedSizeStock,
        stock: totalStock,
        updatedAt: new Date().toISOString()
      });

      // Update Firestore inventory collection
      await setDoc(doc(db, 'inventory', product.id), {
        stock: totalStock,
        available: totalStock > 0,
        updatedAt: new Date()
      }, { merge: true });

      // Add movement log
      await addDoc(collection(db, 'stock_movements'), {
        productId: product.id,
        productSlug: formData.slug || product.slug,
        productName: formData.name || product.name,
        type: movType,
        quantity: movQty,
        size: movSize,
        color: movColor || 'Geral',
        notes: movNotes || 'Movimentação manual pelo ERP',
        operator: 'Admin',
        createdAt: serverTimestamp()
      });

      toast.success('Movimentação registrada com sucesso!', { id: toastId });
      setMovNotes('');
      setMovQty(1);
    } catch (err) {
      console.error('Error registering stock movement:', err);
      toast.error('Erro ao registrar movimentação.', { id: toastId });
    } finally {
      setIsRegisteringMov(false);
    }
  };

  // Main Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      toast.error('Informe o nome do produto.');
      setActiveTab('info');
      return;
    }

    if (!formData.price || formData.price <= 0) {
      toast.error('Informe um preço válido maior que R$ 0,00.');
      setActiveTab('info');
      return;
    }

    setSaving(true);
    const toastId = toast.loading(product ? 'Atualizando produto...' : 'Cadastrando produto...');

    try {
      const totalStock = (formData.sizeStock || []).reduce((acc, curr) => acc + (curr.quantity || 0), 0);
      const minStock = Math.min(...(formData.sizeStock || []).map((s) => s.minStock || 2));

      const rawPayload = {
        ...formData,
        promotionalPrice: formData.promotionalPrice ? Number(formData.promotionalPrice) : null,
        costPrice: formData.costPrice ? Number(formData.costPrice) : null,
        stock: totalStock,
        minStock: isFinite(minStock) ? minStock : 2,
        updatedAt: new Date().toISOString()
      };
      const payload: Partial<Product> = cleanFirestoreData(rawPayload);

      if (product?.id) {
        // Edit existing product
        await updateDoc(doc(db, 'products', product.id), payload);

        // Sync inventory doc
        await setDoc(doc(db, 'inventory', product.id), {
          stock: totalStock,
          available: totalStock > 0,
          updatedAt: new Date()
        }, { merge: true });

        toast.success('Produto atualizado com sucesso!', { id: toastId });
      } else {
        // Create new product
        payload.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'products'), payload);

        // Sync inventory doc
        await setDoc(doc(db, 'inventory', docRef.id), {
          stock: totalStock,
          available: totalStock > 0,
          updatedAt: new Date()
        });

        toast.success('Novo produto cadastrado!', { id: toastId });
      }

      onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving product:', err);
      toast.error('Erro ao salvar produto.', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
        onClick={onClose} 
      />

      {/* Drawer Container */}
      <aside className="fixed inset-y-0 right-0 z-[101] w-full max-w-4xl bg-[#0d0d12] border-l border-white/10 shadow-2xl flex flex-col font-sans text-white animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-black/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#eab308]/10 border border-[#eab308]/30 flex items-center justify-center text-[#eab308]">
              <Box size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#eab308]">
                  {product ? 'EDIÇÃO DE PRODUTO' : 'NOVO CADASTRO DE PRODUTO'}
                </span>
                {formData.sku && (
                  <span className="text-[9px] font-bold bg-white/10 px-2 py-0.5 rounded text-gray-300">
                    SKU: {formData.sku}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-black uppercase tracking-tight text-white">
                {formData.name || 'Produto Sem Nome'}
              </h2>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-black/40 border-b border-white/10 px-6 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'info'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/5'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <FileText size={14} /> 1. Informações
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'stock'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/5'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Box size={14} /> 2. Estoque & Movimentação
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('colors')}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'colors'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/5'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Palette size={14} /> 3. Cores ({formData.colorVariants?.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mockups')}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'mockups'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/5'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ImageIcon size={14} /> 4. Mockups ({formData.images?.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('videos')}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'videos'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/5'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Film size={14} /> 5. Vídeos ({formData.videos?.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'history'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/5'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Clock size={14} /> 6. Histórico
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
          <form onSubmit={handleSubmit} id="drawer-product-form" className="space-y-6">
            {/* TAB 1: INFORMAÇÕES */}
            {activeTab === 'info' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Nome do Produto *
                    </label>
                    <input 
                      type="text"
                      required
                      placeholder="Ex: Camiseta Oversized Heavyweight Black"
                      value={formData.name || ''}
                      onChange={(e) => handleNameChange(e.target.value)}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      SKU (Código Único)
                    </label>
                    <input 
                      type="text"
                      value={formData.sku || ''}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Slug URL
                    </label>
                    <input 
                      type="text"
                      value={formData.slug || ''}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Categoria
                    </label>
                    <select
                      value={formData.category || 'Camisetas'}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308] cursor-pointer"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Coleção
                    </label>
                    <select
                      value={formData.collection || 'FORCE'}
                      onChange={(e) => setFormData({ ...formData, collection: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308] cursor-pointer"
                    >
                      {COLLECTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Preço de Venda (R$) *
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      required
                      value={formData.price ?? ''}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Preço Promocional (R$)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      value={formData.promotionalPrice ?? ''}
                      onChange={(e) => setFormData({ ...formData, promotionalPrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Preço de Custo (R$)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      value={formData.costPrice ?? ''}
                      onChange={(e) => setFormData({ ...formData, costPrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Status no Site
                    </label>
                    <select
                      value={formData.status || 'active'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308] cursor-pointer"
                    >
                      <option value="active">Ativo (Visível no catálogo)</option>
                      <option value="inactive">Inativo (Oculto)</option>
                      <option value="draft">Rascunho</option>
                      <option value="archived">Arquivado</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Headline (Slogan Curto)
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: Coleção Core • Algodão Heavyweight 240GSM"
                      value={formData.headline || ''}
                      onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Descrição Detalhada
                    </label>
                    <textarea 
                      rows={4}
                      placeholder="Descreva o corte, caimento, tecido, acabamentos e instruções..."
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#eab308]"
                    />
                  </div>
                </div>

                {/* Highlights Checkboxes */}
                <div className="bg-black/30 border border-white/10 p-4 rounded-xl flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white">
                    <input 
                      type="checkbox"
                      checked={!!formData.isNew}
                      onChange={(e) => setFormData({ ...formData, isNew: e.target.checked })}
                      className="w-4 h-4 accent-[#eab308] rounded"
                    />
                    Selo NOVO (Lançamento)
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white">
                    <input 
                      type="checkbox"
                      checked={!!formData.isBestseller}
                      onChange={(e) => setFormData({ ...formData, isBestseller: e.target.checked })}
                      className="w-4 h-4 accent-[#eab308] rounded"
                    />
                    Destaque Bestseller
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white">
                    <input 
                      type="checkbox"
                      checked={!!formData.is_prime}
                      onChange={(e) => setFormData({ ...formData, is_prime: e.target.checked })}
                      className="w-4 h-4 accent-[#eab308] rounded"
                    />
                    Personalizável PRIME
                  </label>
                </div>
              </div>
            )}

            {/* TAB 2: ESTOQUE & MOVIMENTAÇÃO */}
            {activeTab === 'stock' && (
              <div className="space-y-6 animate-in fade-in">
                {/* Size Stock Matrix */}
                <div className="bg-black/40 border border-white/10 p-4 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black uppercase text-white tracking-wider">Grade de Estoque por Tamanho</h3>
                      <p className="text-[10px] text-gray-400">Defina a quantidade disponível e o estoque mínimo para alertas.</p>
                    </div>
                    <span className="text-xs font-black bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/30 px-3 py-1 rounded-full">
                      Total: {(formData.sizeStock || []).reduce((sum, item) => sum + (item.quantity || 0), 0)} Unidades
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {(formData.sizeStock || []).map((st, idx) => (
                      <div key={st.size || idx} className="bg-black/60 border border-white/10 p-3 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-[#eab308]">{st.size}</span>
                          <span className="text-[9px] text-gray-500">Mín: {st.minStock || 2}</span>
                        </div>
                        <div>
                          <label className="text-[9px] text-gray-400 uppercase block mb-0.5">Qtd Atual</label>
                          <input 
                            type="number"
                            min="0"
                            value={st.quantity}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              const updated = [...(formData.sizeStock || [])];
                              updated[idx] = { ...st, quantity: val };
                              setFormData({ ...formData, sizeStock: updated });
                            }}
                            className="w-full p-2 bg-black/80 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-[#eab308]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Real-time Movement Logger */}
                <div className="bg-black/40 border border-white/10 p-5 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-[#eab308]" size={18} />
                    <h3 className="text-xs font-black uppercase text-white tracking-wider">Registrar Movimentação de Estoque</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                        Tipo de Operação
                      </label>
                      <select
                        value={movType}
                        onChange={(e) => setMovType(e.target.value as any)}
                        className="w-full p-2.5 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                      >
                        <option value="Entrada">Entrada (Reposição)</option>
                        <option value="Saída">Saída (Venda/Avaria)</option>
                        <option value="Ajuste">Ajuste de Balanço</option>
                        <option value="Reserva">Reserva</option>
                        <option value="Inventário">Inventário Físico</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                        Tamanho
                      </label>
                      <select
                        value={movSize}
                        onChange={(e) => setMovSize(e.target.value)}
                        className="w-full p-2.5 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                      >
                        {(formData.sizes || ['P', 'M', 'G', 'GG']).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                        Quantidade
                      </label>
                      <input 
                        type="number"
                        min="1"
                        value={movQty}
                        onChange={(e) => setMovQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full p-2.5 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                        Observação / Motivo
                      </label>
                      <input 
                        type="text"
                        placeholder="Ex: Recebimento lote #104"
                        value={movNotes}
                        onChange={(e) => setMovNotes(e.target.value)}
                        className="w-full p-2.5 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRegisterMovement}
                    disabled={isRegisteringMov}
                    className="w-full py-2.5 bg-white/10 hover:bg-[#eab308] text-white hover:text-black font-black uppercase text-xs tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save size={14} /> Registrar Lançamento Imediato
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: CORES */}
            {activeTab === 'colors' && (
              <div className="animate-in fade-in">
                <ColorCarouselManager
                  colorVariants={formData.colorVariants || []}
                  onChange={handleColorVariantsChange}
                />
              </div>
            )}

            {/* TAB 4: MOCKUPS */}
            {activeTab === 'mockups' && (
              <div className="animate-in fade-in space-y-4">
                <div className="flex items-center justify-between bg-black/40 p-4 border border-white/10 rounded-2xl">
                  <div>
                    <h3 className="text-xs font-black uppercase text-white tracking-wider">Galeria Principal de Imagens & Mockups</h3>
                    <p className="text-[10px] text-gray-400">Arraste e solte arquivos. Selecione a estrela para a imagem principal.</p>
                  </div>
                  <span className="text-xs font-bold bg-white/10 px-3 py-1 rounded-full text-gray-300">
                    {formData.images?.length || 0} Fotos
                  </span>
                </div>

                <ProductMockupUploader
                  images={formData.images || []}
                  onChange={(updatedImages) => setFormData({ ...formData, images: updatedImages })}
                />
              </div>
            )}

            {/* TAB 5: VÍDEOS */}
            {activeTab === 'videos' && (
              <div className="animate-in fade-in">
                <ProductVideoManager
                  videos={formData.videos || []}
                  onChange={(updatedVideos) => setFormData({ ...formData, videos: updatedVideos })}
                />
              </div>
            )}

            {/* TAB 6: HISTÓRICO */}
            {activeTab === 'history' && (
              <div className="animate-in fade-in space-y-4">
                <div className="bg-black/40 border border-white/10 p-4 rounded-2xl">
                  <h3 className="text-xs font-black uppercase text-white tracking-wider mb-2">Trilha de Movimentações & Auditoria</h3>
                  <p className="text-[10px] text-gray-400">Histórico detalhado de alterações e lançamentos de estoque deste produto.</p>
                </div>

                {movements.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-black/20 border border-white/5 rounded-2xl">
                    <Clock size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-bold">Nenhuma movimentação registrada para este produto ainda.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {movements.map((m) => (
                      <div key={m.id} className="bg-black/40 border border-white/10 p-3 rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${
                            m.type === 'Entrada' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            m.type === 'Saída' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                            'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          }`}>
                            {m.type}
                          </span>
                          <div>
                            <span className="font-bold text-white">{m.quantity}x {m.size || ''} ({m.color || 'Geral'})</span>
                            {m.notes && <p className="text-[10px] text-gray-400">{m.notes}</p>}
                          </div>
                        </div>
                        <span className="text-[9px] text-gray-500">
                          {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString('pt-BR') : 'Recente'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-white/10 bg-black/80 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-xl border border-white/15 text-xs font-bold uppercase text-gray-300 hover:bg-white/5 transition-all cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="submit"
            form="drawer-product-form"
            disabled={saving}
            className="px-8 py-3 rounded-xl bg-[#eab308] text-black font-black uppercase text-xs hover:bg-white transition-all shadow-xl shadow-[#eab308]/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </aside>
    </div>
  );
};

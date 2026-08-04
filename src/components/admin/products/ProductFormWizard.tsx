import React, { useState, useEffect } from 'react';
import { 
  FileText, Image as ImageIcon, Palette, Film, Box, Tag, Layers, 
  Save, X, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Plus, 
  Sparkles, DollarSign, Percent, ShieldCheck, HelpCircle, Eye
} from 'lucide-react';
import { Product, ProductMockup, SizeStockItem } from '../../../types/product';
import { ProductMockupUploader } from './ProductMockupUploader';
import { ColorCarouselManager, ColorVariant } from './ColorCarouselManager';
import { ProductVideoManager } from './ProductVideoManager';
import { db } from '../../../lib/firebase';
import { doc, setDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface ProductFormWizardProps {
  initialProduct?: Product | null;
  onSaveSuccess: () => void;
  onCancel: () => void;
}

const CATEGORIES = ['Camisetas', 'Moletons', 'Calças', 'Acessórios', 'Bonés', 'Edição Limitada'];
const COLLECTIONS = ['FORCE', 'MARK', 'PRIME', 'CORE', 'ESSENTIALS', 'STREETWEAR'];
const SIZES = ['P', 'M', 'G', 'GG', 'XG'];

export const ProductFormWizard: React.FC<ProductFormWizardProps> = ({
  initialProduct,
  onSaveSuccess,
  onCancel
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'mockups' | 'colors' | 'gallery' | 'videos' | 'stock' | 'seo'>('info');
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

  useEffect(() => {
    if (initialProduct) {
      setFormData({
        ...initialProduct,
        images: initialProduct.images || [],
        colorVariants: initialProduct.colorVariants || (initialProduct.colors || []).map((c) => ({
          name: c.name,
          hex: c.hex,
          images: initialProduct.images || []
        })),
        videos: initialProduct.videos || [],
        sizes: initialProduct.sizes || ['P', 'M', 'G', 'GG'],
        colors: initialProduct.colors || [{ name: 'Preto', hex: '#000000' }],
        sizeStock: initialProduct.sizeStock || (initialProduct.sizes || ['P', 'M', 'G', 'GG']).map((s) => ({
          size: s,
          quantity: initialProduct.stock ? Math.floor(initialProduct.stock / (initialProduct.sizes?.length || 4)) : 10,
          minStock: initialProduct.minStock || 2,
          reserved: 0
        }))
      });
    }
  }, [initialProduct]);

  // Sync colors list whenever colorVariants changes
  const handleColorVariantsChange = (updatedVariants: ColorVariant[]) => {
    const updatedColors = updatedVariants.map((v) => ({ name: v.name, hex: v.hex }));

    // Extract all images from variants to keep fallback `images` array populated
    const allVariantImages = updatedVariants.flatMap((v) => v.images || []);
    const mergedImages = Array.from(new Set([...(formData.images || []), ...allVariantImages]));

    setFormData((prev) => ({
      ...prev,
      colorVariants: updatedVariants,
      colors: updatedColors,
      images: mergedImages.length > 0 ? mergedImages : prev.images
    }));
  };

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

  // Submit Handler
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
    const toastId = toast.loading(initialProduct ? 'Atualizando produto...' : 'Cadastrando produto no Firestore...');

    try {
      const cleanSlug = (formData.slug || formData.name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Compute total stock
      const totalStock = (formData.sizeStock || []).reduce((acc, curr) => acc + (curr.quantity || 0), 0);

      // Main image fallback
      const primaryImage = formData.images?.[0] || formData.colorVariants?.[0]?.images?.[0] || '/estampas/logo-fpac.png';

      const payload = {
        name: formData.name.trim(),
        slug: cleanSlug,
        sku: formData.sku?.trim() || `FPAC-${Date.now().toString().substring(6)}`,
        headline: formData.headline?.trim() || '',
        description: formData.description?.trim() || '',
        price: Number(formData.price),
        promotionalPrice: formData.promotionalPrice ? Number(formData.promotionalPrice) : null,
        costPrice: formData.costPrice ? Number(formData.costPrice) : null,
        category: formData.category || 'Camisetas',
        collection: formData.collection || 'FORCE',
        brand: formData.brand || 'F PAC STORE',
        status: formData.status || 'active',
        isNew: !!formData.isNew,
        isBestseller: !!formData.isBestseller,
        is_prime: !!formData.is_prime,

        images: formData.images && formData.images.length > 0 ? formData.images : [primaryImage],
        colorVariants: formData.colorVariants || [],
        videos: formData.videos || [],

        sizes: formData.sizes || ['P', 'M', 'G', 'GG'],
        colors: formData.colors || [{ name: 'Preto', hex: '#000000' }],
        sizeStock: formData.sizeStock || [],
        stock: totalStock,
        minStock: formData.minStock || 5,

        weight: formData.weight || 0.35,
        width: formData.width || 25,
        height: formData.height || 3,
        length: formData.length || 30,
        specs: formData.specs || [],
        tags: formData.tags || [],
        updatedAt: new Date().toISOString()
      };

      if (initialProduct?.id) {
        // Update existing document in Firestore
        const docRef = doc(db, 'products', initialProduct.id);
        await updateDoc(docRef, payload);
        toast.success('Produto atualizado com sucesso!', { id: toastId });
      } else {
        // Create new document in Firestore
        const docRef = await addDoc(collection(db, 'products'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        toast.success('Produto cadastrado com sucesso!', { id: toastId });
      }

      setSaving(false);
      onSaveSuccess();
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Erro ao salvar produto. Verifique sua conexão.', { id: toastId });
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#0f0f17] border border-white/15 rounded-3xl p-6 shadow-2xl font-sans text-white max-w-5xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#eab308] flex items-center gap-1.5">
            <Sparkles size={14} /> CADASTRO RÁPIDO 3-MINUTOS CMS
          </span>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white mt-1">
            {initialProduct ? `Editar Produto: ${initialProduct.name}` : 'Novo Produto'}
          </h2>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-white/15 text-xs font-bold uppercase text-gray-300 hover:bg-white/5 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-[#eab308] text-black font-black uppercase text-xs hover:bg-white transition-all shadow-lg shadow-[#eab308]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Produto'}
          </button>
        </div>
      </div>

      {/* 7-TAB STEP NAVIGATION */}
      <div className="flex items-center gap-1 overflow-x-auto py-4 border-b border-white/10 scrollbar-none">
        {[
          { id: 'info', label: '1. Informações', icon: FileText },
          { id: 'mockups', label: '2. Mockups', icon: ImageIcon, badge: (formData.images || []).length },
          { id: 'colors', label: '3. Cores & Carrossel', icon: Palette, badge: (formData.colorVariants || []).length },
          { id: 'videos', label: '4. Vídeos', icon: Film, badge: (formData.videos || []).length },
          { id: 'stock', label: '5. Tamanhos & Estoque', icon: Box },
          { id: 'seo', label: '6. Categorização & Status', icon: Tag }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0 border ${
                isActive 
                  ? 'border-[#eab308] bg-[#eab308] text-black shadow-lg shadow-[#eab308]/15' 
                  : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/20 hover:text-white'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                  isActive ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENTS */}
      <form onSubmit={handleSubmit} className="pt-6">
        {/* ABA 1: INFORMAÇÕES BÁSICAS */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  Nome do Produto *
                </label>
                <input 
                  type="text"
                  required
                  placeholder="Ex: Camiseta Oversized Minimalist"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full p-3 bg-black/60 border border-white/20 rounded-xl text-sm text-white focus:outline-none focus:border-[#eab308]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  SKU / Código do Produto
                </label>
                <input 
                  type="text"
                  placeholder="Ex: FPAC-CAM-001"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full p-3 bg-black/60 border border-white/20 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-[#eab308]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  Preço de Venda (R$) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xs">R$</span>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    placeholder="99.90"
                    value={formData.price || ''}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-10 pr-3 py-3 bg-black/60 border border-white/20 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-[#eab308]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  Preço Promocional (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xs">R$</span>
                  <input 
                    type="number"
                    step="0.01"
                    placeholder="79.90"
                    value={formData.promotionalPrice || ''}
                    onChange={(e) => setFormData({ ...formData, promotionalPrice: parseFloat(e.target.value) || undefined })}
                    className="w-full pl-10 pr-3 py-3 bg-black/60 border border-white/20 rounded-xl text-sm text-emerald-400 font-mono focus:outline-none focus:border-[#eab308]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  Custo de Produção (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xs">R$</span>
                  <input 
                    type="number"
                    step="0.01"
                    placeholder="42.00"
                    value={formData.costPrice || ''}
                    onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || undefined })}
                    className="w-full pl-10 pr-3 py-3 bg-black/60 border border-white/20 rounded-xl text-sm text-gray-300 font-mono focus:outline-none focus:border-[#eab308]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                Headline / Slogan Curto
              </label>
              <input 
                type="text"
                placeholder="Ex: Malha encorpada 240GSM com caimento imponente"
                value={formData.headline}
                onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                className="w-full p-3 bg-black/60 border border-white/20 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                Descrição Completa
              </label>
              <textarea 
                rows={4}
                placeholder="Descreva o produto, tipo de malha, caimento, dicas de lavagem..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full p-3 bg-black/60 border border-white/20 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
              />
            </div>

            {/* Next Step Action */}
            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveTab('mockups')}
                className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-[#eab308] hover:text-black transition-all text-xs font-black uppercase flex items-center gap-2 cursor-pointer"
              >
                Próximo: Mockups do Produto <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ABA 2: MOCKUPS GERAIS */}
        {activeTab === 'mockups' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black uppercase text-white">Galeria de Mockups Gerais</h3>
                <p className="text-xs text-gray-400">
                  Arraste os arquivos para upload imediato. Defina a foto principal clicando na estrela.
                </p>
              </div>
            </div>

            <ProductMockupUploader
              images={formData.images || []}
              onChange={(updatedImages) => setFormData({ ...formData, images: updatedImages })}
            />

            <div className="pt-4 border-t border-white/10 flex justify-between">
              <button
                type="button"
                onClick={() => setActiveTab('info')}
                className="px-5 py-2.5 rounded-xl border border-white/15 text-xs font-bold uppercase text-gray-300 hover:bg-white/5 flex items-center gap-2"
              >
                <ArrowLeft size={14} /> Voltar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('colors')}
                className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-[#eab308] hover:text-black transition-all text-xs font-black uppercase flex items-center gap-2 cursor-pointer"
              >
                Próximo: Cores & Carrossel <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ABA 3: CORES & CARROSSEL */}
        {activeTab === 'colors' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-black uppercase text-white">Carrossel de Cores da Loja</h3>
              <p className="text-xs text-gray-400">
                Associe um conjunto de mockups específicos para cada cor. Quando o cliente escolher a cor na loja, o carrossel trocará automaticamente para essas fotos!
              </p>
            </div>

            <ColorCarouselManager
              colorVariants={formData.colorVariants || []}
              onChange={handleColorVariantsChange}
            />

            <div className="pt-4 border-t border-white/10 flex justify-between">
              <button
                type="button"
                onClick={() => setActiveTab('mockups')}
                className="px-5 py-2.5 rounded-xl border border-white/15 text-xs font-bold uppercase text-gray-300 hover:bg-white/5 flex items-center gap-2"
              >
                <ArrowLeft size={14} /> Voltar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('videos')}
                className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-[#eab308] hover:text-black transition-all text-xs font-black uppercase flex items-center gap-2 cursor-pointer"
              >
                Próximo: Vídeos <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ABA 4: VÍDEOS DO PRODUTO */}
        {activeTab === 'videos' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-black uppercase text-white">Vídeos do Produto</h3>
              <p className="text-xs text-gray-400">
                Adicione vídeos curtos de caimento, detalhes da malha ou lifestyle. Vídeos nunca geram novos produtos duplicados no banco.
              </p>
            </div>

            <ProductVideoManager
              videos={formData.videos || []}
              onChange={(updatedVideos) => setFormData({ ...formData, videos: updatedVideos })}
            />

            <div className="pt-4 border-t border-white/10 flex justify-between">
              <button
                type="button"
                onClick={() => setActiveTab('colors')}
                className="px-5 py-2.5 rounded-xl border border-white/15 text-xs font-bold uppercase text-gray-300 hover:bg-white/5 flex items-center gap-2"
              >
                <ArrowLeft size={14} /> Voltar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('stock')}
                className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-[#eab308] hover:text-black transition-all text-xs font-black uppercase flex items-center gap-2 cursor-pointer"
              >
                Próximo: Tamanhos & Estoque <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ABA 5: TAMANHOS & ESTOQUE */}
        {activeTab === 'stock' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-black uppercase text-white">Gestão de Tamanhos e Estoque</h3>
              <p className="text-xs text-gray-400">Defina a quantidade em estoque para cada tamanho disponível.</p>
            </div>

            {/* Sizes Selection */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">
                Tamanhos Disponíveis
              </label>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((size) => {
                  const isChecked = (formData.sizes || []).includes(size);

                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        const updatedSizes = isChecked
                          ? (formData.sizes || []).filter((s) => s !== size)
                          : [...(formData.sizes || []), size];

                        const updatedStock = updatedSizes.map((s) => {
                          const existing = (formData.sizeStock || []).find((st) => st.size === s);
                          return existing || { size: s, quantity: 10, minStock: 2, reserved: 0 };
                        });

                        setFormData({ ...formData, sizes: updatedSizes, sizeStock: updatedStock });
                      }}
                      className={`w-12 h-10 rounded-xl text-xs font-black font-mono flex items-center justify-center border transition-all cursor-pointer ${
                        isChecked 
                          ? 'border-[#eab308] bg-[#eab308] text-black shadow-md shadow-[#eab308]/20' 
                          : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stock Quantities Table */}
            <div className="bg-black/30 border border-white/10 rounded-2xl overflow-hidden p-4">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-gray-400">
                    <th className="pb-3">Tamanho</th>
                    <th className="pb-3">Quantidade em Estoque</th>
                    <th className="pb-3">Alerta Mínimo</th>
                    <th className="pb-3">Estoque Reservado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {(formData.sizeStock || []).map((item, idx) => (
                    <tr key={item.size}>
                      <td className="py-3 font-mono font-black text-white text-sm">{item.size}</td>
                      <td className="py-3">
                        <input 
                          type="number"
                          min={0}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const updated = [...(formData.sizeStock || [])];
                            updated[idx] = { ...updated[idx], quantity: val };
                            setFormData({ ...formData, sizeStock: updated });
                          }}
                          className="w-24 p-2 bg-black/60 border border-white/20 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[#eab308]"
                        />
                      </td>
                      <td className="py-3">
                        <input 
                          type="number"
                          min={0}
                          value={item.minStock}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const updated = [...(formData.sizeStock || [])];
                            updated[idx] = { ...updated[idx], minStock: val };
                            setFormData({ ...formData, sizeStock: updated });
                          }}
                          className="w-24 p-2 bg-black/60 border border-white/20 rounded-lg text-xs font-mono text-gray-400 focus:outline-none focus:border-[#eab308]"
                        />
                      </td>
                      <td className="py-3 font-mono text-xs text-gray-500">{item.reserved || 0} un.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-between">
              <button
                type="button"
                onClick={() => setActiveTab('videos')}
                className="px-5 py-2.5 rounded-xl border border-white/15 text-xs font-bold uppercase text-gray-300 hover:bg-white/5 flex items-center gap-2"
              >
                <ArrowLeft size={14} /> Voltar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('seo')}
                className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-[#eab308] hover:text-black transition-all text-xs font-black uppercase flex items-center gap-2 cursor-pointer"
              >
                Próximo: Categorização & Status <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ABA 6: CATEGORIZAÇÃO & STATUS */}
        {activeTab === 'seo' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  Categoria
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full p-3 bg-black/60 border border-white/20 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308] cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  Coleção
                </label>
                <select
                  value={formData.collection}
                  onChange={(e) => setFormData({ ...formData, collection: e.target.value })}
                  className="w-full p-3 bg-black/60 border border-white/20 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308] cursor-pointer"
                >
                  {COLLECTIONS.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  Status de Publicação
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full p-3 bg-black/60 border border-white/20 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308] cursor-pointer"
                >
                  <option value="active">Ativo (Visível na loja)</option>
                  <option value="inactive">Inativo (Oculto)</option>
                  <option value="draft">Rascunho</option>
                  <option value="archived">Arquivado</option>
                </select>
              </div>
            </div>

            {/* Highlights Checkboxes */}
            <div className="bg-black/30 border border-white/10 p-4 rounded-xl flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white">
                <input 
                  type="checkbox"
                  checked={formData.isNew}
                  onChange={(e) => setFormData({ ...formData, isNew: e.target.checked })}
                  className="w-4 h-4 accent-[#eab308] rounded"
                />
                Lançamento (Selo NOVO)
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white">
                <input 
                  type="checkbox"
                  checked={formData.isBestseller}
                  onChange={(e) => setFormData({ ...formData, isBestseller: e.target.checked })}
                  className="w-4 h-4 accent-[#eab308] rounded"
                />
                Bestseller (Mais Vendido)
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white">
                <input 
                  type="checkbox"
                  checked={formData.is_prime}
                  onChange={(e) => setFormData({ ...formData, is_prime: e.target.checked })}
                  className="w-4 h-4 accent-[#eab308] rounded"
                />
                Linha Personalizável PRIME
              </label>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveTab('stock')}
                className="px-5 py-2.5 rounded-xl border border-white/15 text-xs font-bold uppercase text-gray-300 hover:bg-white/5 flex items-center gap-2"
              >
                <ArrowLeft size={14} /> Voltar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3 rounded-xl bg-[#eab308] text-black font-black uppercase text-xs hover:bg-white transition-all shadow-xl shadow-[#eab308]/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save size={16} /> {saving ? 'Finalizando...' : 'Concluir & Salvar Produto'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

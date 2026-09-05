import React, { useState, useEffect } from 'react';
import { 
  FileText, Image as ImageIcon, Palette, Film, Box, Tag, Layers, 
  Save, X, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Plus, 
  Sparkles, DollarSign, Percent, ShieldCheck, Clock, TrendingUp, TrendingDown, RefreshCw, Eye,
  SlidersHorizontal, Minus, Ruler, Settings as SettingsIcon, Check, Trash2, RotateCcw
} from 'lucide-react';
import { Product, SizeStockItem } from '../../../types/product';
import { ProductMockupUploader } from './ProductMockupUploader';
import { ColorCarouselManager, ColorVariant } from './ColorCarouselManager';
import { ProductVideoManager } from './ProductVideoManager';
import { db } from '../../../lib/firebase';
import { doc, setDoc, updateDoc, addDoc, collection, serverTimestamp, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { cleanFirestoreData } from '../../../lib/utils';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import { useInventory } from '../../../hooks/useInventory';
import { recordStockMovementInDb } from '../../../services/inventory/inventoryService';
import toast from 'react-hot-toast';

interface ProductManagementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSaveSuccess: () => void;
}

const CATEGORIES = ['Camisetas', 'Moletons', 'Calças', 'Acessórios', 'Bonés', 'Edição Limitada', 'Polos', 'Regatas'];
const COLLECTIONS = ['FORCE', 'MARK', 'PRIME', 'CORE', 'ESSENTIALS', 'STREETWEAR', 'LIMITED'];
const DEFAULT_SIZES = ['P', 'M', 'G', 'GG', 'XG'];

interface VariantStockRow {
  color: string;
  size: string;
  currentStock: number;
  operationType: 'entrada' | 'saida' | 'ajuste';
  adjustmentQty: number;
  directStockValue: number;
  notes: string;
}

export const ProductManagementDrawer: React.FC<ProductManagementDrawerProps> = ({
  isOpen,
  onClose,
  product,
  onSaveSuccess
}) => {
  const { formatMoney, formatPercent, maskFinancial, showFinancialValues } = useFinancialPrivacy();
  const { inventory } = useInventory();
  const [activeTab, setActiveTab] = useState<
    'info' | 'pricing' | 'variations_stock' | 'media' | 'description' | 'measurements' | 'settings' | 'history'
  >('info');
  const [saving, setSaving] = useState(false);
  const [customColorName, setCustomColorName] = useState('');
  const [customColorHex, setCustomColorHex] = useState('#000000');

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
    seal: '',
    displayOrder: 1,
    images: [],
    colorVariants: [
      { name: 'Preto', hex: '#000000', images: [] },
      { name: 'Off White', hex: '#FAF9F6', images: [] }
    ],
    videos: [],
    sizes: DEFAULT_SIZES,
    colors: [
      { name: 'Preto', hex: '#000000' },
      { name: 'Off White', hex: '#FAF9F6' }
    ],
    sizeStock: DEFAULT_SIZES.map(s => ({ size: s, quantity: 0, minStock: 2, reserved: 0 })),
    specs: ['100% Algodão Premium 240GSM', 'Ribana Canelada 3cm', 'Modelagem Oversized'],
    weight: 0.35,
    width: 25,
    height: 3,
    length: 30,
    tags: [],
    minStock: 2
  });

  const [variantRows, setVariantRows] = useState<VariantStockRow[]>([]);
  const [initialVariantStock, setInitialVariantStock] = useState<Record<string, number>>({});
  const [movements, setMovements] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    if (product) {
      const colors = product.colors && product.colors.length > 0 
        ? product.colors 
        : [{ name: 'Preto', hex: '#000000' }];
      const sizes = product.sizes && product.sizes.length > 0 
        ? product.sizes 
        : DEFAULT_SIZES;
      const colorVariants = product.colorVariants && product.colorVariants.length > 0
        ? product.colorVariants
        : colors.map(c => ({ name: c.name, hex: c.hex, images: product.images || [] }));
      const invEntry = inventory[product.id] || (product.slug ? inventory[product.slug] : null);
      const existingVariantsStock: Record<string, number> = product.variantsStock || {};

      setFormData({
        ...product,
        images: product.images || [],
        colorVariants,
        videos: product.videos || [],
        sizes,
        colors,
        sizeStock: product.sizeStock || sizes.map(s => ({
          size: s,
          quantity: 0,
          minStock: product.minStock || 2,
          reserved: 0
        })),
        minStock: product.minStock || 2,
        seal: product.seal || '',
        displayOrder: product.displayOrder || 1,
        tags: product.tags || []
      });

      const rows: VariantStockRow[] = [];
      const initMap: Record<string, number> = {};

      colors.forEach(c => {
        sizes.forEach(s => {
          const key = `${c.name}_${s}`;
          let stockVal = 0;
          if (invEntry?.variants?.[key]?.stock !== undefined) {
            stockVal = Number(invEntry.variants[key].stock);
          } else if (existingVariantsStock[key] !== undefined) {
            stockVal = Number(existingVariantsStock[key]);
          } else {
            const foundSize = product.sizeStock?.find(st => st.size === s);
            stockVal = foundSize ? Number(foundSize.quantity) || 0 : 0;
          }
          initMap[key] = stockVal;
          rows.push({
            color: c.name,
            size: s,
            currentStock: stockVal,
            operationType: 'ajuste',
            adjustmentQty: 0,
            directStockValue: stockVal,
            notes: ''
          });
        });
      });

      setInitialVariantStock(initMap);
      setVariantRows(rows);
    } else {
      const defaultColors = [
        { name: 'Preto', hex: '#000000' },
        { name: 'Off White', hex: '#FAF9F6' }
      ];
      const defaultSizes = DEFAULT_SIZES;
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
        seal: '',
        displayOrder: 1,
        images: [],
        colorVariants: defaultColors.map(c => ({ name: c.name, hex: c.hex, images: [] })),
        videos: [],
        sizes: defaultSizes,
        colors: defaultColors,
        sizeStock: defaultSizes.map(s => ({ size: s, quantity: 0, minStock: 2, reserved: 0 })),
        specs: ['100% Algodão Premium 240GSM', 'Ribana Canelada 3cm', 'Modelagem Oversized'],
        weight: 0.35,
        width: 25,
        height: 3,
        length: 30,
        tags: [],
        minStock: 2
      });

      const rows: VariantStockRow[] = [];
      const initMap: Record<string, number> = {};
      defaultColors.forEach(c => {
        defaultSizes.forEach(s => {
          const key = `${c.name}_${s}`;
          initMap[key] = 0;
          rows.push({ color: c.name, size: s, currentStock: 0, operationType: 'ajuste', adjustmentQty: 0, directStockValue: 0, notes: '' });
        });
      });
      setInitialVariantStock(initMap);
      setVariantRows(rows);
    }
  }, [product, isOpen]);

  const syncVariantRows = (updatedColors: { name: string; hex: string }[], updatedSizes: string[]) => {
    const newRows: VariantStockRow[] = [];
    const newInitMap: Record<string, number> = { ...initialVariantStock };
    updatedColors.forEach(c => {
      updatedSizes.forEach(s => {
        const key = `${c.name}_${s}`;
        const existingRow = variantRows.find(r => r.color === c.name && r.size === s);
        const currentStock = existingRow ? calculateResultingStock(existingRow) : (newInitMap[key] ?? 0);
        newInitMap[key] = currentStock;
        newRows.push({ color: c.name, size: s, currentStock, operationType: 'ajuste', adjustmentQty: 0, directStockValue: currentStock, notes: existingRow?.notes || '' });
      });
    });
    setInitialVariantStock(newInitMap);
    setVariantRows(newRows);
  };

  useEffect(() => {
    const movementProductSlug = product?.slug || product?.id;
    if (!movementProductSlug) {
      setMovements([]);
      return;
    }
    const q = query(
      collection(db, 'stock_movements'),
      where('productSlug', '==', movementProductSlug),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMovements(list);
    }, (error) => {
      console.warn('Stock movements subscribe fallback:', error);
    });
    return () => unsubscribe();
  }, [product?.id, product?.slug]);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    const cleanSlug = val.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const generatedSku = `FPAC-${val.substring(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    setFormData((prev) => ({ ...prev, name: val, slug: prev.slug || cleanSlug, sku: prev.sku || generatedSku }));
  };

  const COLOR_PRESETS = [
    { name: 'Preto', hex: '#000000' }, { name: 'Off White', hex: '#FAF9F6' }, { name: 'Branco', hex: '#FFFFFF' },
    { name: 'Verde Militar', hex: '#3F4238' }, { name: 'Azul Marinho', hex: '#1B263B' }, { name: 'Marrom Café', hex: '#4A3C31' },
    { name: 'Cinza Mescla', hex: '#CFDBD5' }, { name: 'Bege', hex: '#E3D5CA' }
  ];

  const calculateResultingStock = (row: VariantStockRow): number => {
    if (row.operationType === 'ajuste') return Math.max(0, row.directStockValue);
    if (row.operationType === 'entrada') return Math.max(0, row.currentStock + (row.adjustmentQty || 0));
    return Math.max(0, row.currentStock - (row.adjustmentQty || 0));
  };

  const handleRemoveColorSafely = (colorName: string) => {
    const currentColors = formData.colors || [];
    if (currentColors.length <= 1) { toast.error('O produto deve ter ao menos 1 cor.'); return; }
    const stockForColor = variantRows.filter(r => r.color.toLowerCase() === colorName.toLowerCase()).reduce((sum, r) => sum + calculateResultingStock(r), 0);
    if (stockForColor > 0 && !window.confirm(`Esta cor (${colorName.toUpperCase()}) possui estoque (${stockForColor} peças). Deseja realmente removê-la das variações?`)) return;
    const updatedColors = currentColors.filter(c => c.name.toLowerCase() !== colorName.toLowerCase());
    const updatedVariants = (formData.colorVariants || []).filter(v => v.name.toLowerCase() !== colorName.toLowerCase());
    setFormData(prev => ({ ...prev, colors: updatedColors, colorVariants: updatedVariants }));
    syncVariantRows(updatedColors, formData.sizes || DEFAULT_SIZES);
    toast.success(`Cor ${colorName} removida.`);
  };

  const handleTogglePresetColor = (preset: { name: string; hex: string }) => {
    const currentColors = formData.colors || [];
    const exists = currentColors.find(c => c.name.toLowerCase() === preset.name.toLowerCase());
    if (exists) return handleRemoveColorSafely(preset.name);
    const newColor = { name: preset.name, hex: preset.hex };
    const updatedColors = [...currentColors, newColor];
    const updatedVariants = [...(formData.colorVariants || []), { name: preset.name, hex: preset.hex, images: [] }];
    setFormData(prev => ({ ...prev, colors: updatedColors, colorVariants: updatedVariants }));
    syncVariantRows(updatedColors, formData.sizes || DEFAULT_SIZES);
    toast.success(`Cor ${preset.name} adicionada!`);
  };

  const handleAddCustomColor = (name: string, hex: string) => {
    const cleanName = name.trim();
    if (!cleanName) { toast.error('Informe o nome da cor.'); return; }
    const currentColors = formData.colors || [];
    if (currentColors.some(c => c.name.toLowerCase() === cleanName.toLowerCase())) { toast.error('Esta cor já foi cadastrada.'); return; }
    const newColor = { name: cleanName, hex: hex || '#000000' };
    const updatedColors = [...currentColors, newColor];
    const updatedVariants = [...(formData.colorVariants || []), { name: cleanName, hex: hex || '#000000', images: [] }];
    setFormData(prev => ({ ...prev, colors: updatedColors, colorVariants: updatedVariants }));
    syncVariantRows(updatedColors, formData.sizes || DEFAULT_SIZES);
    toast.success(`Cor ${cleanName} adicionada!`);
  };

  const handleCellStockChange = (colorName: string, sizeName: string, newStock: number) => {
    const cleanStock = Math.max(0, isNaN(newStock) ? 0 : Math.floor(newStock));
    setVariantRows(prev => prev.map(r => r.color === colorName && r.size === sizeName ? { ...r, operationType: 'ajuste', directStockValue: cleanStock, adjustmentQty: 0 } : r));
  };

  const handleCellQuickDelta = (colorName: string, sizeName: string, delta: number) => {
    setVariantRows(prev => prev.map(r => {
      if (r.color !== colorName || r.size !== sizeName) return r;
      const nextVal = Math.max(0, calculateResultingStock(r) + delta);
      return { ...r, operationType: 'ajuste', directStockValue: nextVal, adjustmentQty: 0 };
    }));
  };

  const handleToggleSize = (sizeName: string) => {
    const currentSizes = formData.sizes || DEFAULT_SIZES;
    let newSizes: string[];
    if (currentSizes.includes(sizeName)) {
      if (currentSizes.length <= 1) { toast.error('O produto deve ter ao menos 1 tamanho.'); return; }
      newSizes = currentSizes.filter(s => s !== sizeName);
    } else newSizes = [...currentSizes, sizeName];
    setFormData(prev => ({ ...prev, sizes: newSizes, sizeStock: newSizes.map(s => ({ size: s, quantity: prev.sizeStock?.find(st => st.size === s)?.quantity ?? 0, minStock: prev.minStock || 2, reserved: 0 })) }));
    syncVariantRows(formData.colors || [{ name: 'Preto', hex: '#000000' }], newSizes);
  };

  const handleQuickAdjustRow = (index: number, delta: number) => {
    setVariantRows(prev => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;
      if (target.operationType === 'ajuste') copy[index] = { ...target, directStockValue: Math.max(0, target.directStockValue + delta) };
      else copy[index] = { ...target, adjustmentQty: Math.max(0, target.adjustmentQty + delta) };
      return copy;
    });
  };

  const handleBulkSetStock = (qty: number) => {
    setVariantRows(prev => prev.map(r => ({ ...r, operationType: 'ajuste', directStockValue: Math.max(0, qty), adjustmentQty: 0 })));
    toast.success(`Estoque de todas as variações ajustado para ${qty} unidades.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.price || formData.price <= 0) { toast.error('Informe um preço de venda válido (maior que R$ 0,00).'); setActiveTab('pricing'); return; }
    setSaving(true);
    const toastId = toast.loading(product ? 'Salvando todas as alterações do produto...' : 'Cadastrando novo produto...');

    try {
      const newVariantsStockMap: Record<string, number> = {};
      let calculatedTotalStock = 0;
      const changedMovements: any[] = [];
      variantRows.forEach(r => {
        const key = `${r.color}_${r.size}`;
        const newStock = calculateResultingStock(r);
        newVariantsStockMap[key] = newStock;
        calculatedTotalStock += newStock;
        const initialStock = initialVariantStock[key] ?? r.currentStock;
        const delta = newStock - initialStock;
        if (delta !== 0) changedMovements.push({ variantKey: key, color: r.color, size: r.size, previousStock: initialStock, delta, newStock, type: delta > 0 ? 'Entrada' : 'Saída', notes: r.notes || (r.operationType === 'ajuste' ? 'Ajuste manual ERP' : `Lançamento manual ${delta > 0 ? 'Entrada' : 'Saída'}`) });
      });

      const sizeStockSummary: SizeStockItem[] = (formData.sizes || DEFAULT_SIZES).map(s => ({
        size: s,
        quantity: variantRows.filter(r => r.size === s).reduce((acc, r) => acc + calculateResultingStock(r), 0),
        minStock: formData.minStock || 2,
        reserved: 0
      }));
      const fallbackSku = formData.sku?.trim() || `FPAC-PROD-${Math.floor(1000 + Math.random() * 9000)}`;
      const productName = formData.name?.trim() || fallbackSku;
      const productSlug = formData.slug?.trim() || fallbackSku.toLowerCase();
      const isAvailableGlobal = calculatedTotalStock > 0 && formData.status === 'active';
      const rawPayload = {
        ...formData,
        name: productName,
        sku: fallbackSku,
        slug: productSlug,
        price: Number(formData.price) || 0,
        promotionalPrice: formData.promotionalPrice ? Number(formData.promotionalPrice) : null,
        costPrice: formData.costPrice ? Number(formData.costPrice) : null,
        stock: calculatedTotalStock,
        available: isAvailableGlobal,
        sizeStock: sizeStockSummary,
        variantsStock: newVariantsStockMap,
        minStock: Number(formData.minStock) || 2,
        updatedAt: new Date().toISOString()
      };
      const payload: Partial<Product> = cleanFirestoreData(rawPayload);
      let targetId = product?.id;

      if (targetId) {
        await updateDoc(doc(db, 'products', targetId), payload);
      } else {
        payload.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'products'), payload);
        targetId = docRef.id;
      }

      // Inventory is authoritative. Any mutation failure must abort the admin success flow.
      for (const mov of changedMovements) {
        await recordStockMovementInDb(
          productSlug,
          mov.variantKey,
          'adjust',
          mov.newStock,
          mov.notes || 'Ajuste no cadastro do produto'
        );
      }

      toast.success('✓ Produto e estoque atualizados com sucesso!', { id: toastId });
      onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving product and stock:', err);
      toast.error('Erro ao salvar alterações do produto/estoque. O painel não confirmou a operação.', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const activePrice = formData.promotionalPrice || formData.price || 0;
  const originalPrice = formData.price || 0;
  const costPrice = formData.costPrice || 0;
  const hasDiscount = !!(formData.promotionalPrice && formData.promotionalPrice < originalPrice);
  const discountPercent = hasDiscount ? Math.round(((originalPrice - formData.promotionalPrice!) / originalPrice) * 100) : 0;
  const unitProfit = activePrice > 0 && costPrice > 0 ? activePrice - costPrice : null;
  const profitMarginPercent = activePrice > 0 && costPrice > 0 ? ((activePrice - costPrice) / activePrice) * 100 : null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden select-none">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity duration-300 animate-in fade-in" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-[101] w-full max-w-5xl bg-[#0a0a0f] border-l border-white/10 shadow-2xl flex flex-col font-sans text-white animate-in slide-in-from-right duration-300">
        <div className="p-5 border-b border-white/10 bg-black/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#eab308]/10 border border-[#eab308]/30 flex items-center justify-center text-[#eab308] shrink-0"><SettingsIcon size={22} className="animate-spin-slow" /></div>
            <div>
              <div className="flex items-center gap-2"><span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#eab308]">GERENCIAMENTO CENTRAL DE PRODUTO & ESTOQUE</span>{formData.sku && <span className="text-[9px] font-mono font-bold bg-white/10 px-2 py-0.5 rounded text-gray-300">SKU: {formData.sku}</span>}</div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white font-mono">{formData.name || formData.sku || 'NOVO CADASTRO'}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" form="drawer-product-form" disabled={saving} className="px-5 py-2.5 rounded-xl bg-[#eab308] text-black font-black uppercase text-xs hover:bg-white transition-all shadow-lg shadow-[#eab308]/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"><Save size={16} /> {saving ? 'Salvando...' : '💾 SALVAR ALTERAÇÕES'}</button>
            <button onClick={onClose} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"><X size={20} /></button>
          </div>
        </div>

        <div className="bg-black/60 border-b border-white/10 px-4 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {([
            ['info', '📦 INFORMAÇÕES', Box], ['pricing', '💰 PREÇO', DollarSign], ['variations_stock', `🎨📦 VARIAÇÕES & ESTOQUE (${formData.colors?.length || 0})`, Palette],
            ['media', `🖼️ MÍDIA (${formData.images?.length || 0})`, ImageIcon], ['description', '📝 DESCRIÇÃO', FileText], ['measurements', '📏 MEDIDAS', Ruler], ['settings', '⚙️ CONFIGS', SettingsIcon], ['history', '📜 HISTÓRICO', Clock]
          ] as const).map(([tab, label, Icon]) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`py-3 px-3.5 text-[11px] font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${activeTab === tab ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/10' : 'border-transparent text-gray-400 hover:text-white'}`}><Icon size={14} /> {label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
          <form onSubmit={handleSubmit} id="drawer-product-form" className="space-y-6">
            {activeTab === 'info' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-black/30 border border-white/10 p-4 rounded-xl"><h3 className="text-xs font-black uppercase text-[#eab308] tracking-widest flex items-center gap-2"><Box size={16} /> 📦 Informações Básicas do Produto</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Nome do Produto *</label><input type="text" required value={formData.name || ''} onChange={(e) => handleNameChange(e.target.value)} className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]" /></div>
                  <div><label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Categoria</label><select value={formData.category || 'Camisetas'} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
                  <div><label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Coleção</label><select value={formData.collection || 'FORCE'} onChange={(e) => setFormData({ ...formData, collection: e.target.value })} className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white">{COLLECTIONS.map(c => <option key={c}>{c}</option>)}</select></div>
                  <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Headline / Slogan Curto</label><input type="text" value={formData.headline || ''} onChange={(e) => setFormData({ ...formData, headline: e.target.value })} className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white" /></div>
                </div>
              </div>
            )}

            {activeTab === 'pricing' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Preço Normal *</label><input type="number" step="0.01" required value={formData.price ?? ''} onChange={(e) => setFormData({ ...formData, price: e.target.value === '' ? undefined : parseFloat(e.target.value) })} className="w-full p-3 bg-black/60 border border-white/15 rounded-xl" /></div>
                  <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Preço Promocional</label><input type="number" step="0.01" value={formData.promotionalPrice ?? ''} onChange={(e) => setFormData({ ...formData, promotionalPrice: e.target.value === '' ? undefined : parseFloat(e.target.value) })} className="w-full p-3 bg-black/60 border border-white/15 rounded-xl" /></div>
                  <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Preço de Custo</label><input type="number" step="0.01" value={formData.costPrice ?? ''} onChange={(e) => setFormData({ ...formData, costPrice: e.target.value === '' ? undefined : parseFloat(e.target.value) })} className="w-full p-3 bg-black/60 border border-white/15 rounded-xl" /></div>
                </div>
                <div className="bg-black/60 border border-[#eab308]/30 p-5 rounded-2xl grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                  <div><span className="text-[9px] text-gray-400 block">Tabela</span>{formatMoney(originalPrice, { forceShow: true })}</div>
                  <div><span className="text-[9px] text-[#eab308] block">Venda</span>{formatMoney(activePrice, { forceShow: true })}</div>
                  <div><span className="text-[9px] text-green-400 block">PIX</span>{formatMoney(activePrice * 0.95, { forceShow: true })}</div>
                  <div><span className="text-[9px] text-sky-400 block">Lucro</span>{unitProfit !== null ? formatMoney(unitProfit, { forceShow: true }) : '—'}</div>
                  <div><span className="text-[9px] text-amber-400 block">Margem</span>{profitMarginPercent !== null ? `${profitMarginPercent.toFixed(1)}%` : '—'}</div>
                </div>
              </div>
            )}

            {activeTab === 'variations_stock' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-black/40 border border-white/10 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-black uppercase text-white">Cores do produto</h4>
                  <div className="flex flex-wrap gap-2">{COLOR_PRESETS.map(preset => { const isActive = (formData.colors || []).some(c => c.name.toLowerCase() === preset.name.toLowerCase()); return <button key={preset.name} type="button" onClick={() => handleTogglePresetColor(preset)} className={`px-3 py-2 rounded-lg border text-xs font-bold ${isActive ? 'bg-[#eab308] text-black border-[#eab308]' : 'bg-black/60 text-gray-300 border-white/15'}`}><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: preset.hex }} />{preset.name}</button>; })}</div>
                  <div className="flex gap-2"><input value={customColorName} onChange={e => setCustomColorName(e.target.value)} placeholder="Nova cor" className="flex-1 p-2 bg-black border border-white/20 rounded" /><input type="color" value={customColorHex} onChange={e => setCustomColorHex(e.target.value)} /><button type="button" onClick={() => { handleAddCustomColor(customColorName, customColorHex); setCustomColorName(''); }} className="px-3 py-2 bg-[#eab308] text-black rounded font-bold"><Plus size={14} /></button></div>
                </div>
                <div className="bg-black/40 border border-white/10 p-5 rounded-2xl"><h4 className="text-xs font-black uppercase mb-3">Tamanhos</h4><div className="flex gap-2 flex-wrap">{['P','M','G','GG','XG','XXG','U'].map(s => <button type="button" key={s} onClick={() => handleToggleSize(s)} className={`px-4 py-2 rounded border font-bold ${(formData.sizes || []).includes(s) ? 'bg-[#eab308] text-black border-[#eab308]' : 'bg-black border-white/20'}`}>{s}</button>)}</div></div>
                <div className="flex gap-2"><button type="button" onClick={() => handleBulkSetStock(10)} className="px-3 py-2 bg-white/10 rounded">10 em todas</button><button type="button" onClick={() => handleBulkSetStock(20)} className="px-3 py-2 bg-white/10 rounded">20 em todas</button><button type="button" onClick={() => handleBulkSetStock(0)} className="px-3 py-2 bg-rose-500/20 rounded">Zerar todas</button></div>
                <div className="overflow-x-auto border border-white/10 rounded-xl"><table className="w-full min-w-[600px]"><thead><tr><th className="p-3 text-left">Cor</th>{(formData.sizes || DEFAULT_SIZES).map(s => <th key={s} className="p-3">{s}</th>)}</tr></thead><tbody>{(formData.colors || []).map(color => <tr key={color.name} className="border-t border-white/10"><td className="p-3 font-bold">{color.name}</td>{(formData.sizes || DEFAULT_SIZES).map(s => { const row = variantRows.find(r => r.color === color.name && r.size === s); const stockVal = row ? calculateResultingStock(row) : 0; return <td key={s} className="p-2"><div className="flex items-center justify-center gap-1"><button type="button" onClick={() => handleCellQuickDelta(color.name, s, -1)} className="w-7 h-7 bg-white/10 rounded">-</button><input type="number" min="0" value={stockVal} onChange={e => handleCellStockChange(color.name, s, parseInt(e.target.value,10) || 0)} className="w-14 p-1 bg-black border border-white/15 rounded text-center" /><button type="button" onClick={() => handleCellQuickDelta(color.name, s, 1)} className="w-7 h-7 bg-white/10 rounded">+</button></div></td>; })}</tr>)}</tbody></table></div>
              </div>
            )}

            {activeTab === 'media' && <div className="space-y-6"><ProductMockupUploader images={formData.images || []} onChange={(images) => setFormData({ ...formData, images })} /><ProductVideoManager videos={formData.videos || []} onChange={(videos) => setFormData({ ...formData, videos })} /></div>}
            {activeTab === 'description' && <div className="space-y-4"><textarea rows={6} value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full p-3 bg-black/60 border border-white/15 rounded-xl" /><input value={formData.fabric || ''} onChange={e => setFormData({ ...formData, fabric: e.target.value })} placeholder="Tecido" className="w-full p-3 bg-black/60 border border-white/15 rounded-xl" /><input value={formData.gsm || ''} onChange={e => setFormData({ ...formData, gsm: e.target.value })} placeholder="Gramatura" className="w-full p-3 bg-black/60 border border-white/15 rounded-xl" /></div>}
            {activeTab === 'measurements' && <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{(['weight','width','height','length'] as const).map(key => <input key={key} type="number" value={(formData as any)[key] ?? ''} onChange={e => setFormData({ ...formData, [key]: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder={key} className="p-3 bg-black/60 border border-white/15 rounded-xl" />)}</div>}
            {activeTab === 'settings' && <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><input type="number" value={formData.minStock ?? ''} onChange={e => setFormData({ ...formData, minStock: e.target.value === '' ? undefined : parseInt(e.target.value,10) })} placeholder="Estoque mínimo" className="p-3 bg-black/60 border border-white/15 rounded-xl" /><input value={formData.sku || ''} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="SKU" className="p-3 bg-black/60 border border-white/15 rounded-xl" /></div>}
            {activeTab === 'history' && (
              <div className="space-y-4">
                {movements.length === 0 ? <div className="p-8 text-center text-gray-500">Nenhuma movimentação registrada.</div> : movements.map(m => <div key={m.id} className="bg-black/40 border border-white/10 p-3 rounded-xl flex justify-between"><div><strong>{m.type}</strong> • {m.quantity} un • {m.variantKey || ''}<div className="text-[10px] text-gray-400">{m.reason || m.notes || ''}</div></div><span className="text-[9.5px] text-gray-400">{m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString('pt-BR') : 'Recente'}</span></div>)}
              </div>
            )}
          </form>
        </div>
        <div className="p-5 border-t border-white/10 bg-black/90 flex items-center justify-between gap-4"><button type="button" onClick={onClose} className="px-6 py-3 rounded-xl border border-white/15 text-xs font-bold uppercase text-gray-300">Cancelar</button><button type="submit" form="drawer-product-form" disabled={saving} className="px-8 py-3 rounded-xl bg-[#eab308] text-black font-black uppercase text-xs flex items-center gap-2 disabled:opacity-50"><Save size={16} /> {saving ? 'Salvando...' : '💾 SALVAR ALTERAÇÕES'}</button></div>
      </aside>
    </div>
  );
};

const ColorColorManager: React.FC<{
  colorVariants: ColorVariant[];
  onChange: (updated: ColorVariant[]) => void;
}> = ({ colorVariants, onChange }) => {
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#000000');
  const handleAddColor = () => {
    if (!newColorName.trim()) { toast.error('Informe o nome da cor.'); return; }
    onChange([...colorVariants, { name: newColorName.trim(), hex: newColorHex, images: [] }]);
    setNewColorName('');
    setNewColorHex('#000000');
  };
  const handleRemoveColor = (index: number) => {
    if (colorVariants.length <= 1) { toast.error('O produto precisa ter pelo menos 1 cor.'); return; }
    onChange(colorVariants.filter((_, i) => i !== index));
  };
  return <div className="space-y-4"><div className="flex gap-2"><input value={newColorName} onChange={e => setNewColorName(e.target.value)} className="flex-1 p-2 bg-black border border-white/20 rounded" /><input type="color" value={newColorHex} onChange={e => setNewColorHex(e.target.value)} /><button type="button" onClick={handleAddColor} className="px-3 py-2 bg-[#eab308] text-black rounded"><Plus size={14} /></button></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{colorVariants.map((c, idx) => <div key={idx} className="bg-black/60 border border-white/15 p-2.5 rounded-xl flex items-center justify-between"><span>{c.name}</span><button type="button" onClick={() => handleRemoveColor(idx)}><Trash2 size={13} /></button></div>)}</div></div>;
};

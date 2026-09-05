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
  adjustmentQty: number; // For entrada/saida
  directStockValue: number; // For direct setting
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

  // Variations Matrix State for Stock Table (Color x Size)
  const [variantRows, setVariantRows] = useState<VariantStockRow[]>([]);
  const [initialVariantStock, setInitialVariantStock] = useState<Record<string, number>>({});

  // Stock Movement History for this product
  const [movements, setMovements] = useState<any[]>([]);

  // Initialize data on product load or drawer open
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

      // Load existing variant stock map from product or inventory if present
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

      // Build initial variant rows matrix (Color x Size)
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
            // fallback to sizeStock match
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
      // New product reset
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
          rows.push({
            color: c.name,
            size: s,
            currentStock: 0,
            operationType: 'ajuste',
            adjustmentQty: 0,
            directStockValue: 0,
            notes: ''
          });
        });
      });

      setInitialVariantStock(initMap);
      setVariantRows(rows);
    }
  }, [product, isOpen]);

  // Sync Variant Rows when Colors or Sizes change
  const syncVariantRows = (updatedColors: { name: string; hex: string }[], updatedSizes: string[]) => {
    const newRows: VariantStockRow[] = [];
    const newInitMap: Record<string, number> = { ...initialVariantStock };

    updatedColors.forEach(c => {
      updatedSizes.forEach(s => {
        const key = `${c.name}_${s}`;
        const existingRow = variantRows.find(r => r.color === c.name && r.size === s);
        const currentStock = existingRow ? calculateResultingStock(existingRow) : (newInitMap[key] ?? 0);
        newInitMap[key] = currentStock;

        newRows.push({
          color: c.name,
          size: s,
          currentStock,
          operationType: 'ajuste',
          adjustmentQty: 0,
          directStockValue: currentStock,
          notes: existingRow?.notes || ''
        });
      });
    });

    setInitialVariantStock(newInitMap);
    setVariantRows(newRows);
  };

  // Subscribe to movements history for this product
  useEffect(() => {
    const movementProductSlug = product?.slug?.trim();
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
  }, [product?.slug]);

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

  // Preset color choices
  const COLOR_PRESETS = [
    { name: 'Preto', hex: '#000000' },
    { name: 'Off White', hex: '#FAF9F6' },
    { name: 'Branco', hex: '#FFFFFF' },
    { name: 'Verde Militar', hex: '#3F4238' },
    { name: 'Azul Marinho', hex: '#1B263B' },
    { name: 'Marrom Café', hex: '#4A3C31' },
    { name: 'Cinza Mescla', hex: '#CFDBD5' },
    { name: 'Bege', hex: '#E3D5CA' }
  ];

  // Remove color safely checking stock
  const handleRemoveColorSafely = (colorName: string) => {
    const currentColors = formData.colors || [];
    if (currentColors.length <= 1) {
      toast.error('O produto deve ter ao menos 1 cor.');
      return;
    }

    const stockForColor = variantRows
      .filter(r => r.color.toLowerCase() === colorName.toLowerCase())
      .reduce((sum, r) => sum + calculateResultingStock(r), 0);

    if (stockForColor > 0) {
      const confirmRemove = window.confirm(
        `Esta cor (${colorName.toUpperCase()}) possui estoque (${stockForColor} peças). Deseja realmente removê-la das variações?`
      );
      if (!confirmRemove) return;
    }

    const updatedColors = currentColors.filter(c => c.name.toLowerCase() !== colorName.toLowerCase());
    const updatedVariants = (formData.colorVariants || []).filter(v => v.name.toLowerCase() !== colorName.toLowerCase());

    setFormData(prev => ({
      ...prev,
      colors: updatedColors,
      colorVariants: updatedVariants
    }));

    syncVariantRows(updatedColors, formData.sizes || DEFAULT_SIZES);
    toast.success(`Cor ${colorName} removida.`);
  };

  // Toggle Preset Color
  const handleTogglePresetColor = (preset: { name: string; hex: string }) => {
    const currentColors = formData.colors || [];
    const exists = currentColors.find(c => c.name.toLowerCase() === preset.name.toLowerCase());

    if (exists) {
      handleRemoveColorSafely(preset.name);
    } else {
      const newColor = { name: preset.name, hex: preset.hex };
      const updatedColors = [...currentColors, newColor];
      const updatedVariants = [
        ...(formData.colorVariants || []),
        { name: preset.name, hex: preset.hex, images: [] }
      ];

      setFormData(prev => ({
        ...prev,
        colors: updatedColors,
        colorVariants: updatedVariants
      }));

      syncVariantRows(updatedColors, formData.sizes || DEFAULT_SIZES);
      toast.success(`Cor ${preset.name} adicionada!`);
    }
  };

  // Add Custom Color
  const handleAddCustomColor = (name: string, hex: string) => {
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Informe o nome da cor.');
      return;
    }

    const currentColors = formData.colors || [];
    if (currentColors.some(c => c.name.toLowerCase() === cleanName.toLowerCase())) {
      toast.error('Esta cor já foi cadastrada.');
      return;
    }

    const newColor = { name: cleanName, hex: hex || '#000000' };
    const updatedColors = [...currentColors, newColor];
    const updatedVariants = [
      ...(formData.colorVariants || []),
      { name: cleanName, hex: hex || '#000000', images: [] }
    ];

    setFormData(prev => ({
      ...prev,
      colors: updatedColors,
      colorVariants: updatedVariants
    }));

    syncVariantRows(updatedColors, formData.sizes || DEFAULT_SIZES);
    toast.success(`Cor ${cleanName} adicionada!`);
  };

  // Matrix Cell Direct Stock Change
  const handleCellStockChange = (colorName: string, sizeName: string, newStock: number) => {
    const cleanStock = Math.max(0, isNaN(newStock) ? 0 : Math.floor(newStock));
    setVariantRows(prev => {
      return prev.map(r => {
        if (r.color === colorName && r.size === sizeName) {
          return {
            ...r,
            operationType: 'ajuste',
            directStockValue: cleanStock,
            adjustmentQty: 0
          };
        }
        return r;
      });
    });
  };

  // Matrix Cell Quick Delta (+/- 1)
  const handleCellQuickDelta = (colorName: string, sizeName: string, delta: number) => {
    setVariantRows(prev => {
      return prev.map(r => {
        if (r.color === colorName && r.size === sizeName) {
          const currentRes = calculateResultingStock(r);
          const nextVal = Math.max(0, currentRes + delta);
          return {
            ...r,
            operationType: 'ajuste',
            directStockValue: nextVal,
            adjustmentQty: 0
          };
        }
        return r;
      });
    });
  };

  // Size list toggle handler
  const handleToggleSize = (sizeName: string) => {
    const currentSizes = formData.sizes || DEFAULT_SIZES;
    let newSizes: string[];
    if (currentSizes.includes(sizeName)) {
      if (currentSizes.length <= 1) {
        toast.error('O produto deve ter ao menos 1 tamanho.');
        return;
      }
      newSizes = currentSizes.filter(s => s !== sizeName);
    } else {
      newSizes = [...currentSizes, sizeName];
    }

    setFormData(prev => ({
      ...prev,
      sizes: newSizes,
      sizeStock: newSizes.map(s => ({
        size: s,
        quantity: prev.sizeStock?.find(st => st.size === s)?.quantity ?? 0,
        minStock: prev.minStock || 2,
        reserved: 0
      }))
    }));

    syncVariantRows(formData.colors || [{ name: 'Preto', hex: '#000000' }], newSizes);
  };

  // Variant row row calculation helper
  const calculateResultingStock = (row: VariantStockRow): number => {
    if (row.operationType === 'ajuste') {
      return Math.max(0, row.directStockValue);
    } else if (row.operationType === 'entrada') {
      return Math.max(0, row.currentStock + (row.adjustmentQty || 0));
    } else {
      return Math.max(0, row.currentStock - (row.adjustmentQty || 0));
    }
  };

  // Quick adjustment helper
  const handleQuickAdjustRow = (index: number, delta: number) => {
    setVariantRows(prev => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;

      if (target.operationType === 'ajuste') {
        const newVal = Math.max(0, target.directStockValue + delta);
        copy[index] = { ...target, directStockValue: newVal };
      } else {
        const newAdj = Math.max(0, target.adjustmentQty + delta);
        copy[index] = { ...target, adjustmentQty: newAdj };
      }
      return copy;
    });
  };

  // Bulk Apply Stock to All Variants
  const handleBulkSetStock = (qty: number) => {
    setVariantRows(prev => prev.map(r => ({
      ...r,
      operationType: 'ajuste',
      directStockValue: Math.max(0, qty),
      adjustmentQty: 0
    })));
    toast.success(`Estoque de todas as variações ajustado para ${qty} unidades.`);
  };

  // Main Submit Handler: Saves product info + prices + variations + stock changes + logs
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.price || formData.price <= 0) {
      toast.error('Informe um preço de venda válido (maior que R$ 0,00).');
      setActiveTab('pricing');
      return;
    }

    setSaving(true);
    const toastId = toast.loading(product ? 'Salvando todas as alterações do produto...' : 'Cadastrando novo produto...');

    try {
      // 1. Calculate new variant stock map and total stock
      const newVariantsStockMap: Record<string, number> = {};
      const newInventoryVariantsMap: Record<string, { stock: number; available: boolean }> = {};
      let calculatedTotalStock = 0;
      const changedMovements: any[] = [];

      variantRows.forEach(r => {
        const key = `${r.color}_${r.size}`;
        const newStock = calculateResultingStock(r);
        newVariantsStockMap[key] = newStock;
        newInventoryVariantsMap[key] = {
          stock: newStock,
          available: newStock > 0
        };
        calculatedTotalStock += newStock;

        // Check if stock changed from initial
        const initialStock = initialVariantStock[key] ?? r.currentStock;
        const delta = newStock - initialStock;

        if (delta !== 0) {
          changedMovements.push({
            variantKey: key,
            color: r.color,
            size: r.size,
            previousStock: initialStock,
            delta,
            newStock,
            type: delta > 0 ? 'Entrada' : 'Saída',
            notes: r.notes || (r.operationType === 'ajuste' ? 'Ajuste manual ERP' : `Lançamento manual ${delta > 0 ? 'Entrada' : 'Saída'}`)
          });
        }
      });

      // 2. Build sizeStock summary
      const sizeStockSummary: SizeStockItem[] = (formData.sizes || DEFAULT_SIZES).map(s => {
        const sizeTotal = variantRows
          .filter(r => r.size === s)
          .reduce((acc, r) => acc + calculateResultingStock(r), 0);
        return {
          size: s,
          quantity: sizeTotal,
          minStock: formData.minStock || 2,
          reserved: 0
        };
      });

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
        // Inventory 2.0 is the quantity authority. Quantity mirrors are written
        // only after the official backend mutation succeeds.
        minStock: Number(formData.minStock) || 2,
        updatedAt: new Date().toISOString()
      };

      const payload: Partial<Product> = cleanFirestoreData(rawPayload);

      let targetId = product?.id;

      if (targetId) {
        // Edit existing product
        await updateDoc(doc(db, 'products', targetId), payload);
      } else {
        // Create new product
        payload.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'products'), payload);
        targetId = docRef.id;
      }

      // 3. Register stock movements through the official Inventory 2.0 API.
      // Any failure must abort the success path instead of being silently ignored.
      for (const mov of changedMovements) {
        await recordStockMovementInDb(
          productSlug,
          mov.variantKey,
          'adjust',
          mov.newStock,
          mov.notes || 'Ajuste no cadastro do produto'
        );
      }

      if (!targetId) {
        throw new Error('PRODUCT_ID_MISSING_AFTER_SAVE');
      }

      // Compatibility mirrors for legacy catalog/admin readers are refreshed only
      // after authoritative inventory mutations succeed. They are not stock authority.
      await updateDoc(doc(db, 'products', targetId), {
        stock: calculatedTotalStock,
        available: isAvailableGlobal,
        sizeStock: sizeStockSummary,
        variantsStock: newVariantsStockMap,
        updatedAt: new Date().toISOString()
      });

      toast.success('✓ Produto e estoque atualizados com sucesso!', { id: toastId });
      onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving product and stock:', err);
      toast.error('Erro ao salvar alterações do produto.', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  // Pricing calculations
  const activePrice = formData.promotionalPrice || formData.price || 0;
  const originalPrice = formData.price || 0;
  const costPrice = formData.costPrice || 0;
  const hasDiscount = !!(formData.promotionalPrice && formData.promotionalPrice < originalPrice);
  const discountPercent = hasDiscount ? Math.round(((originalPrice - formData.promotionalPrice!) / originalPrice) * 100) : 0;
  const unitProfit = activePrice > 0 && costPrice > 0 ? activePrice - costPrice : null;
  const profitMarginPercent = activePrice > 0 && costPrice > 0 ? ((activePrice - costPrice) / activePrice) * 100 : null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden select-none">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
        onClick={onClose} 
      />

      {/* Drawer Panel */}
      <aside className="fixed inset-y-0 right-0 z-[101] w-full max-w-5xl bg-[#0a0a0f] border-l border-white/10 shadow-2xl flex flex-col font-sans text-white animate-in slide-in-from-right duration-300">
        
        {/* TOP HEADER */}
        <div className="p-5 border-b border-white/10 bg-black/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#eab308]/10 border border-[#eab308]/30 flex items-center justify-center text-[#eab308] shrink-0">
              <SettingsIcon size={22} className="animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#eab308]">
                  GERENCIAMENTO CENTRAL DE PRODUTO & ESTOQUE
                </span>
                {formData.sku && (
                  <span className="text-[9px] font-mono font-bold bg-white/10 px-2 py-0.5 rounded text-gray-300">
                    SKU: {formData.sku}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white font-mono">
                {formData.name || formData.sku || 'NOVO CADASTRO'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              type="submit"
              form="drawer-product-form"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#eab308] text-black font-black uppercase text-xs hover:bg-white transition-all shadow-lg shadow-[#eab308]/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save size={16} /> {saving ? 'Salvando...' : '💾 SALVAR ALTERAÇÕES'}
            </button>

            <button 
              onClick={onClose}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION BAR */}
        <div className="bg-black/60 border-b border-white/10 px-4 flex items-center gap-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`py-3 px-3.5 text-[11px] font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'info'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Box size={14} /> 📦 INFORMAÇÕES
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pricing')}
            className={`py-3 px-3.5 text-[11px] font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'pricing'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <DollarSign size={14} /> 💰 PREÇO
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('variations_stock')}
            className={`py-3 px-3.5 text-[11px] font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'variations_stock'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Palette size={14} /> 🎨📦 VARIAÇÕES & ESTOQUE ({formData.colors?.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`py-3 px-3.5 text-[11px] font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'media'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ImageIcon size={14} /> 🖼️ MÍDIA ({formData.images?.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('description')}
            className={`py-3 px-3.5 text-[11px] font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'description'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <FileText size={14} /> 📝 DESCRIÇÃO
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('measurements')}
            className={`py-3 px-3.5 text-[11px] font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'measurements'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Ruler size={14} /> 📏 MEDIDAS
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-3.5 text-[11px] font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'settings'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <SettingsIcon size={14} /> ⚙️ CONFIGS
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-3 px-3.5 text-[11px] font-black uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'history'
                ? 'border-[#eab308] text-[#eab308] bg-[#eab308]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Clock size={14} /> 📜 HISTÓRICO
          </button>
        </div>

        {/* MAIN FORM BODY */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
          <form onSubmit={handleSubmit} id="drawer-product-form" className="space-y-6">
            
            {/* 1. 📦 INFORMAÇÕES DO PRODUTO */}
            {activeTab === 'info' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-black/30 border border-white/10 p-4 rounded-xl">
                  <h3 className="text-xs font-black uppercase text-[#eab308] tracking-widest flex items-center gap-2">
                    <Box size={16} /> 📦 Informações Básicas do Produto
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Defina nome, categoria, coleção, modelo e os selos de destaque do catálogo.</p>
                </div>

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

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Headline / Slogan Curto
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: Coleção Core • Algodão Heavyweight 240GSM"
                      value={formData.headline || ''}
                      onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
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
                      Linha / Modelo Base (Vinculação)
                    </label>
                    <select
                      value={formData.parentSlug || 'EXCLUSIVO'}
                      onChange={(e) => setFormData({ ...formData, parentSlug: e.target.value === 'EXCLUSIVO' ? undefined : e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308] cursor-pointer font-mono"
                    >
                      <option value="EXCLUSIVO">Peça Catalogada Exclusiva</option>
                      <option value="force">Modelo FORCE</option>
                      <option value="mark">Modelo MARK</option>
                      <option value="prime">Modelo PRIME</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Status do Produto
                    </label>
                    <select
                      value={formData.status || 'active'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308] cursor-pointer"
                    >
                      <option value="active">Ativo (Visível no catálogo)</option>
                      <option value="inactive">Inativo (Oculto da loja)</option>
                      <option value="draft">Rascunho</option>
                      <option value="archived">Arquivado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Selo do Produto / Badge (Opcional)
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: 5% OFF NO PIX, EDICION LIMITADA, EXCLUSIVE"
                      value={formData.seal || ''}
                      onChange={(e) => setFormData({ ...formData, seal: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Ordem de Exibição no Catálogo
                    </label>
                    <input 
                      type="number"
                      value={formData.displayOrder === undefined || formData.displayOrder === null ? '' : formData.displayOrder}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setFormData({ ...formData, displayOrder: raw === '' ? undefined : parseInt(raw, 10) });
                      }}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>
                </div>

                {/* Highlights Checkboxes */}
                <div className="bg-black/40 border border-white/10 p-5 rounded-2xl space-y-3">
                  <h4 className="text-xs font-black uppercase text-[#eab308] tracking-wider">Destaque & Destaques Especiais</h4>
                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white hover:text-[#eab308] transition-colors">
                      <input 
                        type="checkbox"
                        checked={!!formData.isNew}
                        onChange={(e) => setFormData({ ...formData, isNew: e.target.checked })}
                        className="w-4 h-4 accent-[#eab308] rounded cursor-pointer"
                      />
                      🔥 Selo NOVO (Lançamento Recente)
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white hover:text-[#eab308] transition-colors">
                      <input 
                        type="checkbox"
                        checked={!!formData.isBestseller}
                        onChange={(e) => setFormData({ ...formData, isBestseller: e.target.checked })}
                        className="w-4 h-4 accent-[#eab308] rounded cursor-pointer"
                      />
                      🏆 Destaque Bestseller (Mais Vendido)
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white hover:text-[#eab308] transition-colors">
                      <input 
                        type="checkbox"
                        checked={!!formData.is_prime}
                        onChange={(e) => setFormData({ ...formData, is_prime: e.target.checked })}
                        className="w-4 h-4 accent-[#eab308] rounded cursor-pointer"
                      />
                      ⚡ Personalizável PRIME (Custom Stamp)
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 2. 💰 PREÇO */}
            {activeTab === 'pricing' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-black/30 border border-white/10 p-4 rounded-xl">
                  <h3 className="text-xs font-black uppercase text-[#eab308] tracking-widest flex items-center gap-2">
                    <DollarSign size={16} /> 💰 Configuração de Preço e Ofertas
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Altere preço normal, preço promocional e veja a simulação em tempo real para o cliente.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Preço Normal (De: R$) *
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      required
                      value={formData.price === undefined || formData.price === null ? '' : formData.price}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setFormData({ ...formData, price: raw === '' ? undefined : parseFloat(raw) });
                      }}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Preço Promocional (Por: R$)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      placeholder="Deixe vazio se sem promoção"
                      value={formData.promotionalPrice === undefined || formData.promotionalPrice === null ? '' : formData.promotionalPrice}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setFormData({ ...formData, promotionalPrice: raw === '' ? undefined : parseFloat(raw) });
                      }}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Preço de Custo (R$ - Uso Interno)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      value={formData.costPrice === undefined || formData.costPrice === null ? '' : formData.costPrice}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setFormData({ ...formData, costPrice: raw === '' ? undefined : parseFloat(raw) });
                      }}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>
                </div>

                {/* PREÇO ATUAL VS NOVO PREÇO SIMULATION CARD */}
                <div className="bg-black/60 border border-[#eab308]/30 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-black uppercase text-[#eab308] tracking-widest flex items-center gap-1.5">
                    <Sparkles size={16} /> VISUALIZAÇÃO CLARA: PREÇO ATUAL E CONDIÇÕES
                  </h4>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 bg-black/40 p-4 border border-white/10 rounded-xl text-center">
                    <div>
                      <span className="text-[9px] font-black uppercase text-gray-400 block">Preço de Custo</span>
                      <span className="text-sm font-mono font-bold text-gray-300">
                        {costPrice > 0 ? formatMoney(costPrice, { forceShow: true }) : '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-black uppercase text-gray-400 block">Preço de Tabela</span>
                      <span className="text-sm font-mono font-bold text-gray-400 line-through">
                        {formatMoney(originalPrice, { forceShow: true })}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-black uppercase text-[#eab308] block">Preço Final Venda</span>
                      <span className="text-base font-mono font-black text-white">
                        {formatMoney(activePrice, { forceShow: true })}
                      </span>
                      {hasDiscount && (
                        <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded ml-1 inline-block">
                          -{discountPercent}% OFF
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-[9px] font-black uppercase text-green-400 block">Preço no PIX (-5%)</span>
                      <span className="text-sm font-mono font-black text-green-400">
                        {formatMoney(activePrice * 0.95, { forceShow: true })}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-black uppercase text-sky-400 block">Lucro p/ Unidade</span>
                      <span className="text-sm font-mono font-black text-sky-400">
                        {unitProfit !== null ? formatMoney(unitProfit, { forceShow: true }) : '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-black uppercase text-amber-400 block">Margem de Lucro</span>
                      <span className="text-sm font-mono font-black text-amber-400">
                        {profitMarginPercent !== null ? `${profitMarginPercent.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3 & 4. 🎨📦 VARIAÇÕES & ESTOQUE (Cores, Tamanhos, Combinações e Grade de Estoque) */}
            {activeTab === 'variations_stock' && (
              <div className="space-y-6 animate-in fade-in">
                {/* TOP CARD: ESTOQUE TOTAL DO PRODUTO */}
                <div className="bg-gradient-to-r from-black/80 via-black/60 to-black/80 border border-[#eab308]/40 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#eab308]/15 border border-[#eab308]/40 flex items-center justify-center text-[#eab308]">
                      <Box size={24} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#eab308] block">
                        CENTRAL DE GESTÃO DE ESTOQUE
                      </span>
                      <h3 className="text-lg font-black uppercase text-white font-mono">
                        🎨📦 VARIAÇÕES & ESTOQUE DO PRODUTO
                      </h3>
                    </div>
                  </div>

                  <div className="bg-black/80 border border-[#eab308]/30 px-5 py-3 rounded-xl text-center sm:text-right shrink-0">
                    <span className="text-[9px] font-black uppercase text-gray-400 block tracking-wider">
                      📦 ESTOQUE TOTAL
                    </span>
                    <span className="text-2xl font-mono font-black text-[#eab308]">
                      {variantRows.reduce((sum, r) => sum + calculateResultingStock(r), 0)}{' '}
                      <span className="text-xs text-white font-sans font-bold">peças</span>
                    </span>
                  </div>
                </div>

                {/* CONFIGURAÇÃO DAS CORES E TAMANHOS */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* CORES */}
                  <div className="lg:col-span-7 bg-black/40 border border-white/10 p-5 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-2">
                        <Palette size={16} className="text-[#eab308]" /> CORES DO PRODUTO ({formData.colors?.length || 0})
                      </h4>
                      <span className="text-[9.5px] text-gray-400 font-medium">Cadastre e gerencie as cores disponíveis</span>
                    </div>

                    {/* PRESETS DE CORES RÁPIDAS */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-black uppercase text-gray-400 block tracking-wider">
                        ⚡ Seleção Rápida de Cores (Presets):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {COLOR_PRESETS.map((preset) => {
                          const isActive = (formData.colors || []).some(
                            (c) => c.name.toLowerCase() === preset.name.toLowerCase()
                          );
                          return (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => handleTogglePresetColor(preset)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                                isActive
                                  ? 'bg-[#eab308] text-black border-[#eab308] shadow-md shadow-[#eab308]/20'
                                  : 'bg-black/60 text-gray-300 border-white/15 hover:border-white/40'
                              }`}
                            >
                              <span
                                className="w-3 h-3 rounded-full border border-black/30"
                                style={{ backgroundColor: preset.hex }}
                              />
                              <span>{preset.name}</span>
                              {isActive && <Check size={12} className="stroke-[3]" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* CADASTRAR NOVA COR CUSTOMIZADA */}
                    <div className="pt-3 border-t border-white/10 space-y-2">
                      <span className="text-[9px] font-black uppercase text-gray-400 block tracking-wider">
                        + Adicionar Cor Personalizada:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end bg-black/60 p-3 rounded-xl border border-white/10">
                        <div>
                          <label className="block text-[8.5px] font-black uppercase text-gray-400 mb-1">Nome da Cor</label>
                          <input
                            type="text"
                            placeholder="Ex: Verde Militar"
                            value={customColorName}
                            onChange={(e) => setCustomColorName(e.target.value)}
                            className="w-full p-2 bg-black border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-[#eab308]"
                          />
                        </div>

                        <div>
                          <label className="block text-[8.5px] font-black uppercase text-gray-400 mb-1">Código HEX</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={customColorHex}
                              onChange={(e) => setCustomColorHex(e.target.value)}
                              className="w-8 h-8 rounded bg-transparent border border-white/20 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={customColorHex}
                              onChange={(e) => setCustomColorHex(e.target.value)}
                              className="w-full p-2 bg-black border border-white/20 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[#eab308]"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            handleAddCustomColor(customColorName, customColorHex);
                            setCustomColorName('');
                            setCustomColorHex('#000000');
                          }}
                          className="p-2 bg-[#eab308] text-black font-black text-xs uppercase rounded-lg hover:bg-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Plus size={14} /> Adicionar Cor
                        </button>
                      </div>
                    </div>

                    {/* LISTA DAS CORES ATIVAS */}
                    <div className="pt-2">
                      <span className="text-[9px] font-black uppercase text-gray-400 block tracking-wider mb-2">
                        Cores Ativas neste Produto:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(formData.colors || []).map((c) => {
                          const colorStock = variantRows
                            .filter((r) => r.color.toLowerCase() === c.name.toLowerCase())
                            .reduce((sum, r) => sum + calculateResultingStock(r), 0);

                          return (
                            <div
                              key={c.name}
                              className="bg-black/80 border border-white/15 p-2.5 rounded-xl flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-4 h-4 rounded-full border border-white/30 shrink-0 shadow-sm"
                                  style={{ backgroundColor: c.hex }}
                                />
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-white uppercase truncate block">
                                    {c.name}
                                  </span>
                                  <span className="text-[9px] font-mono text-gray-400 block">
                                    {colorStock} peças em estoque
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveColorSafely(c.name)}
                                title="Excluir Cor"
                                className="text-gray-500 hover:text-rose-400 p-1 rounded hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* TAMANHOS */}
                  <div className="lg:col-span-5 bg-black/40 border border-white/10 p-5 rounded-2xl space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-2">
                          <SlidersHorizontal size={16} className="text-[#eab308]" /> GRADE DE TAMANHOS HABILITADOS
                        </h4>
                      </div>
                      <p className="text-[10px] text-gray-400 mb-3">
                        Ative ou desative os tamanhos. Somente tamanhos ativos geram combinações de estoque.
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {['P', 'M', 'G', 'GG', 'XG', 'XXG', 'U'].map((s) => {
                          const isSelected = (formData.sizes || []).includes(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => handleToggleSize(s)}
                              className={`px-4 py-3 rounded-xl font-black text-xs transition-all cursor-pointer border flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-[#eab308] text-black border-[#eab308] shadow-md shadow-[#eab308]/20'
                                  : 'bg-black/60 text-gray-400 border-white/15 hover:border-white/40'
                              }`}
                            >
                              <span>{s}</span>
                              {isSelected && <Check size={14} className="stroke-[3]" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-black/60 border border-white/10 p-3.5 rounded-xl space-y-1 mt-4">
                      <span className="text-[9px] font-black uppercase text-[#eab308] block tracking-wider">
                        💡 Dica ERP FPAC:
                      </span>
                      <p className="text-[10px] text-gray-300 leading-relaxed">
                        As combinações de estoque (Cor + Tamanho) são atualizadas na grade abaixo sem precisar salvar entre as trocas.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 📦 GRADE DE ESTOQUE (TABELA DE MATRIZ) */}
                <div className="space-y-4">
                  <div className="bg-black/40 border border-white/10 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-black uppercase text-[#eab308] tracking-widest flex items-center gap-2">
                        <Box size={16} /> 📊 MATRIZ DE ESTOQUE POR COMBINAÇÃO
                      </h4>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Edite as quantidades diretamente em cada célula ou use os controles [-] e [+].
                      </p>
                    </div>

                    {/* OPÇÕES RÁPIDAS EM LOTE */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBulkSetStock(10)}
                        className="px-2.5 py-1.5 bg-white/10 hover:bg-[#eab308] hover:text-black text-white text-[9.5px] font-black uppercase rounded-lg transition-all cursor-pointer"
                      >
                        Definir 10 em Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkSetStock(20)}
                        className="px-2.5 py-1.5 bg-white/10 hover:bg-[#eab308] hover:text-black text-white text-[9.5px] font-black uppercase rounded-lg transition-all cursor-pointer"
                      >
                        Definir 20 em Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkSetStock(0)}
                        className="px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white text-[9.5px] font-black uppercase rounded-lg transition-all cursor-pointer border border-rose-500/30"
                      >
                        Zerar Todas (Esgotado)
                      </button>
                    </div>
                  </div>

                  {/* TABELA DA GRADE */}
                  <div className="border border-white/10 rounded-2xl overflow-hidden bg-black/80 shadow-2xl overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-white/10">
                          <th className="p-3.5 pl-5 min-w-[150px]">COR</th>
                          {(formData.sizes || DEFAULT_SIZES).map((s) => (
                            <th key={s} className="p-3.5 text-center min-w-[110px]">
                              {s}
                            </th>
                          ))}
                          <th className="p-3.5 pr-5 text-right min-w-[120px] text-[#eab308]">TOTAL POR COR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {(formData.colors || []).map((color) => {
                          const activeSizes = formData.sizes || DEFAULT_SIZES;
                          const rowTotal = activeSizes.reduce((acc, s) => {
                            const targetRow = variantRows.find(
                              (r) => r.color === color.name && r.size === s
                            );
                            return acc + (targetRow ? calculateResultingStock(targetRow) : 0);
                          }, 0);

                          return (
                            <tr key={color.name} className="hover:bg-white/5 transition-colors">
                              {/* Nome da Cor e Swatch */}
                              <td className="p-3.5 pl-5">
                                <div className="flex items-center gap-2.5">
                                  <span
                                    className="w-4 h-4 rounded-full border border-white/40 shrink-0 shadow-sm"
                                    style={{ backgroundColor: color.hex }}
                                  />
                                  <span className="text-xs font-black text-white uppercase tracking-wider font-mono">
                                    {color.name}
                                  </span>
                                </div>
                              </td>

                              {/* Células de Estoque por Tamanho */}
                              {activeSizes.map((s) => {
                                const targetRow = variantRows.find(
                                  (r) => r.color === color.name && r.size === s
                                );
                                const stockVal = targetRow ? calculateResultingStock(targetRow) : 0;
                                const isOut = stockVal === 0;
                                const isLow = stockVal > 0 && stockVal <= (formData.minStock || 2);

                                return (
                                  <td key={s} className="p-2 text-center">
                                    <div className="inline-flex flex-col items-center gap-1 bg-black/60 border border-white/15 p-1.5 rounded-xl hover:border-[#eab308]/50 transition-all">
                                      {/* Botões [-] [ Value ] [+] */}
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => handleCellQuickDelta(color.name, s, -1)}
                                          className="w-6 h-6 rounded-md bg-white/10 hover:bg-rose-500 hover:text-white text-gray-300 font-black text-xs flex items-center justify-center transition-colors cursor-pointer"
                                        >
                                          -
                                        </button>

                                        <input
                                          type="number"
                                          min="0"
                                          value={stockVal}
                                          onChange={(e) => {
                                            const rawVal = e.target.value.replace(/^0+(?=\d)/, '');
                                            const val = rawVal === '' ? 0 : Math.max(0, parseInt(rawVal, 10) || 0);
                                            handleCellStockChange(color.name, s, val);
                                          }}
                                          onFocus={(e) => e.target.select()}
                                          className="w-14 text-center bg-transparent text-xs font-mono font-black text-white focus:outline-none focus:text-[#eab308]"
                                        />

                                        <button
                                          type="button"
                                          onClick={() => handleCellQuickDelta(color.name, s, 1)}
                                          className="w-6 h-6 rounded-md bg-white/10 hover:bg-emerald-500 hover:text-white text-gray-300 font-black text-xs flex items-center justify-center transition-colors cursor-pointer"
                                        >
                                          +
                                        </button>
                                      </div>

                                      {/* Status Badge */}
                                      <span
                                        className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                          isOut
                                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                            : isLow
                                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                        }`}
                                      >
                                        {isOut ? '🔴 ESGOTADO' : isLow ? '🟠 BAIXO' : '🟢 DISPONÍVEL'}
                                      </span>
                                    </div>
                                  </td>
                                );
                              })}

                              {/* Total por Cor */}
                              <td className="p-3.5 pr-5 text-right font-mono font-black text-sm text-[#eab308]">
                                {rowTotal} un
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>

                      {/* RODAPÉ DA TABELA: TOTAL POR TAMANHO E ESTOQUE TOTAL GERAL */}
                      <tfoot>
                        <tr className="bg-black/90 border-t-2 border-white/20 text-xs font-black font-mono">
                          <td className="p-3.5 pl-5 uppercase text-gray-300 tracking-wider">
                            TOTAL POR TAMANHO
                          </td>
                          {(formData.sizes || DEFAULT_SIZES).map((s) => {
                            const colTotal = (formData.colors || []).reduce((acc, c) => {
                              const targetRow = variantRows.find(
                                (r) => r.color === c.name && r.size === s
                              );
                              return acc + (targetRow ? calculateResultingStock(targetRow) : 0);
                            }, 0);

                            return (
                              <td key={s} className="p-3.5 text-center text-[#eab308]">
                                <span className="text-[10px] text-gray-400 block font-normal">{s}:</span>
                                {colTotal} un
                              </td>
                            );
                          })}
                          <td className="p-3.5 pr-5 text-right text-emerald-400 text-sm">
                            <span className="text-[9px] text-gray-400 block font-normal uppercase font-sans">
                              ESTOQUE TOTAL GERAL
                            </span>
                            {variantRows.reduce((sum, r) => sum + calculateResultingStock(r), 0)} PEÇAS
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 5. 🖼️ MÍDIA */}
            {activeTab === 'media' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-black/30 border border-white/10 p-4 rounded-xl">
                  <h3 className="text-xs font-black uppercase text-[#eab308] tracking-widest flex items-center gap-2">
                    <ImageIcon size={16} /> 🖼️ Fotos & Vídeos de Apresentação
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Envie fotos e mockups do produto. Escolha a foto principal com a estrela.</p>
                </div>

                <div className="space-y-4">
                  <ProductMockupUploader
                    images={formData.images || []}
                    onChange={(updatedImages) => setFormData({ ...formData, images: updatedImages })}
                  />
                </div>

                <div className="border-t border-white/10 pt-4">
                  <h4 className="text-xs font-black uppercase text-white tracking-wider mb-3">Vídeos do Produto</h4>
                  <ProductVideoManager
                    videos={formData.videos || []}
                    onChange={(updatedVideos) => setFormData({ ...formData, videos: updatedVideos })}
                  />
                </div>
              </div>
            )}

            {/* 6. 📝 DESCRIÇÃO & ESPECIFICAÇÕES */}
            {activeTab === 'description' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-black/30 border border-white/10 p-4 rounded-xl">
                  <h3 className="text-xs font-black uppercase text-[#eab308] tracking-widest flex items-center gap-2">
                    <FileText size={16} /> 📝 Descrição Detalhada & Especificações
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Texto do produto e informações sobre o tecido, gola e caimento.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                    Descrição Completa do Produto
                  </label>
                  <textarea 
                    rows={5}
                    placeholder="Escreva a descrição comercial do produto..."
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#eab308]"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Tecido / Composição
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: 100% Algodão Peletizado Premium"
                      value={formData.fabric || ''}
                      onChange={(e) => setFormData({ ...formData, fabric: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Gramatura
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: 240GSM Heavyweight"
                      value={formData.gsm || ''}
                      onChange={(e) => setFormData({ ...formData, gsm: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Modelagem / Caimento
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: Streetwear Oversized Boxy Fit"
                      value={formData.fit || ''}
                      onChange={(e) => setFormData({ ...formData, fit: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Gola
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: Ribana Canelada 3cm com Reforço"
                      value={formData.collar || ''}
                      onChange={(e) => setFormData({ ...formData, collar: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 7. 📏 MEDIDAS & DIMENSÕES */}
            {activeTab === 'measurements' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-black/30 border border-white/10 p-4 rounded-xl">
                  <h3 className="text-xs font-black uppercase text-[#eab308] tracking-widest flex items-center gap-2">
                    <Ruler size={16} /> 📏 Tabela de Medidas e Frete
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Dimensões físicas da embalagem para cálculo do frete e guia de tamanhos.</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-black/40 p-5 rounded-2xl border border-white/10">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Peso (kg)</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={formData.weight === undefined || formData.weight === null ? '' : formData.weight}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setFormData({ ...formData, weight: raw === '' ? undefined : parseFloat(raw) });
                      }}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Largura (cm)</label>
                    <input 
                      type="number"
                      value={formData.width === undefined || formData.width === null ? '' : formData.width}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setFormData({ ...formData, width: raw === '' ? undefined : parseInt(raw, 10) });
                      }}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Altura (cm)</label>
                    <input 
                      type="number"
                      value={formData.height === undefined || formData.height === null ? '' : formData.height}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setFormData({ ...formData, height: raw === '' ? undefined : parseInt(raw, 10) });
                      }}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Comprimento (cm)</label>
                    <input 
                      type="number"
                      value={formData.length === undefined || formData.length === null ? '' : formData.length}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setFormData({ ...formData, length: raw === '' ? undefined : parseInt(raw, 10) });
                      }}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 8. ⚙️ CONFIGURAÇÕES */}
            {activeTab === 'settings' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-black/30 border border-white/10 p-4 rounded-xl">
                  <h3 className="text-xs font-black uppercase text-[#eab308] tracking-widest flex items-center gap-2">
                    <SettingsIcon size={16} /> ⚙️ Configurações Técnicas & Alertas
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Parâmetros de estoque crítico, SKU técnico e integrações.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                      Estoque Mínimo para Alerta
                    </label>
                    <input 
                      type="number"
                      value={formData.minStock === undefined || formData.minStock === null ? '' : formData.minStock}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setFormData({ ...formData, minStock: raw === '' ? undefined : parseInt(raw, 10) });
                      }}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                      SKU Técnico
                    </label>
                    <input 
                      type="text"
                      value={formData.sku || ''}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="w-full p-3 bg-black/60 border border-white/15 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-[#eab308]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 9. 📜 HISTÓRICO DE MOVIMENTAÇÕES DO PRODUTO */}
            {activeTab === 'history' && (
              <div className="space-y-4 animate-in fade-in">
                <div className="bg-black/40 border border-white/10 p-4 rounded-2xl">
                  <h3 className="text-xs font-black uppercase text-white tracking-wider mb-1">
                    Trilha de Auditoria & Histórico de Movimentações
                  </h3>
                  <p className="text-[10px] text-gray-400">Registros automáticos de entradas, saídas e alterações deste produto.</p>
                </div>

                {movements.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-black/20 border border-white/5 rounded-2xl">
                    <Clock size={32} className="mx-auto mb-2 opacity-40 text-[#eab308]" />
                    <p className="text-xs font-bold">Nenhuma movimentação registrada para este produto ainda.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {movements.map((m) => (
                      <div key={m.id} className="bg-black/40 border border-white/10 p-3 rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-1 rounded text-[9px] font-black uppercase ${
                            m.type === 'Entrada' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            m.type === 'Saída' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                            'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {m.type}
                          </span>
                          <div>
                            <span className="font-bold text-white">{m.quantity}x {m.size || ''} ({m.color || 'Geral'})</span>
                            {m.notes && <p className="text-[10px] text-gray-400 mt-0.5">{m.notes}</p>}
                          </div>
                        </div>
                        <span className="text-[9.5px] font-mono text-gray-400">
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

        {/* BOTTOM FOOTER ACTIONS */}
        <div className="p-5 border-t border-white/10 bg-black/90 flex items-center justify-between gap-4">
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
            <Save size={16} /> {saving ? 'Salvando...' : '💾 SALVAR ALTERAÇÕES'}
          </button>
        </div>
      </aside>
    </div>
  );
};

// Helper internal color list component
const ColorColorManager: React.FC<{
  colorVariants: ColorVariant[];
  onChange: (updated: ColorVariant[]) => void;
}> = ({ colorVariants, onChange }) => {
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#000000');

  const handleAddColor = () => {
    if (!newColorName.trim()) {
      toast.error('Informe o nome da cor.');
      return;
    }
    const updated = [...colorVariants, { name: newColorName.trim(), hex: newColorHex, images: [] }];
    onChange(updated);
    setNewColorName('');
    setNewColorHex('#000000');
  };

  const handleRemoveColor = (index: number) => {
    if (colorVariants.length <= 1) {
      toast.error('O produto precisa ter pelo menos 1 cor.');
      return;
    }
    const updated = colorVariants.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-black/60 p-3 rounded-xl border border-white/10 items-end">
        <div>
          <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">Nome da Cor</label>
          <input 
            type="text"
            placeholder="Ex: Verde Militar, Azul Marinho"
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
            className="w-full p-2.5 bg-black border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-[#eab308]"
          />
        </div>

        <div>
          <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">Cor Hex</label>
          <div className="flex items-center gap-2">
            <input 
              type="color"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              className="w-10 h-9 rounded bg-transparent border border-white/20 cursor-pointer"
            />
            <input 
              type="text"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              className="w-full p-2.5 bg-black border border-white/20 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[#eab308]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddColor}
          className="p-2.5 bg-[#eab308] text-black font-black text-xs uppercase rounded-lg hover:bg-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus size={14} /> Adicionar Cor
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {colorVariants.map((c, idx) => (
          <div key={idx} className="bg-black/60 border border-white/15 p-2.5 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: c.hex }} />
              <span className="text-xs font-bold text-white uppercase">{c.name}</span>
            </div>
            <button
              type="button"
              onClick={() => handleRemoveColor(idx)}
              className="text-gray-500 hover:text-rose-400 p-1 cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

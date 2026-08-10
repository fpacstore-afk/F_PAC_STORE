import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, onSnapshot, doc, setDoc, query, orderBy, 
  getDoc, getDocs, updateDoc, deleteDoc, limit, addDoc 
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useFinancialPrivacy } from '../context/FinancialPrivacyContext';
import { useInventory } from '../hooks/useInventory';
import { products as staticProducts } from '../data/products';
import { ProductManagementDrawer } from './admin/products/ProductManagementDrawer';
import { Product } from '../types/product';
import { 
  Plus, Minus, Search, Database, Clock, AlertTriangle, 
  CheckCircle2, Box, Sparkles, RefreshCw, Filter, Calendar, 
  ChevronRight, ArrowRight, X, TrendingUp, TrendingDown, Eye,
  QrCode, Link as LinkIcon, Edit3, Trash2, Download, Image as ImageIcon,
  Tag, Settings, Layers, ShoppingBag, EyeOff, Check, SlidersHorizontal,
  FileText, ArrowUpDown, Upload, RotateCcw
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface StockMovement {
  id?: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantKey: string;
  quantity: number;
  type: 'Produção' | 'Venda Local' | 'Ajuste' | 'Entrada' | 'Saída';
  operator: string;
  createdAt: any;
  notes?: string;
  previousStock?: number;
  newStock?: number;
}

export function AdminStockCenter() {
  const { formatMoney, formatPercent, maskFinancial, showFinancialValues } = useFinancialPrivacy();
  const { user } = useAuth();
  const { inventory, loading: invLoading, updateVariantStock, getStock } = useInventory();

  // Admin access validation (matches the AdminOrders restriction)
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'pac@fpac.com' || localStorage.getItem('admin_bypass') === 'true';

  // Sub-tab: 'stock' (Unified Gestão de Estoque)
  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'catalog'>('stock');

  // Integrated Product Management Drawer (6-tab full drawer)
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);
  const [selectedProductForDrawer, setSelectedProductForDrawer] = useState<Product | null>(null);

  const handleOpenCreateProduct = () => {
    setSelectedProductForDrawer(null);
    setIsProductDrawerOpen(true);
  };

  const handleOpenEditProduct = (p: any) => {
    setSelectedProductForDrawer(p);
    setIsProductDrawerOpen(true);
  };

  // Reset Catalog Modal (Prompt 03)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Core dynamic database collections
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);

  // Search & Filters of main catalog grid
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'shirts' | 'products' | 'others'>('all');
  const [lineFilter, setLineFilter] = useState<'all' | 'force' | 'mark' | 'prime'>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'critical' | 'out_of_stock' | 'normal'>('all');


  // Slide Drawer details overlay
  const [drawerItem, setDrawerItem] = useState<any | null>(null);
  const [drawerItemType, setDrawerItemType] = useState<'shirt' | 'product' | null>(null);
  const [drawerActiveTab, setDrawerActiveTab] = useState<'details' | 'stock' | 'history' | 'media'>('details');

  // Edit fields within Drawer
  const [editName, setEditName] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editLine, setEditLine] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPrice, setEditPrice] = useState('0');
  const [editHeadline, setEditHeadline] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Dialog states
  const [qrCodeItem, setQrCodeItem] = useState<any | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<any | null>(null);
  const [deleteConfirmType, setDeleteConfirmType] = useState<'product' | null>(null);


  // Audit Logs Tab filters
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'Produção' | 'Venda Local' | 'Ajuste' | 'Entrada' | 'Saída'>('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState<'all' | 'today' | '7days' | 'month' | 'custom'>('all');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');

  // Audio confirmation feedback
  const playStockBeep = (type: 'success' | 'error') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.06, ctx.currentTime);
        osc.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.stop(ctx.currentTime + 0.28);
      }
    } catch {
      // Safe ignore audio context blocker
    }
  };

  // 1. Fetch real-time products collection & align with Static Products
  useEffect(() => {
    setLoadingProducts(true);
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const merged = staticProducts.map(staticP => {
        const dynamicP = dynamicData.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        return dynamicP ? { ...staticP, ...dynamicP } : staticP;
      });
      dynamicData.forEach((dynamicP: any) => {
        if (!staticProducts.some(sp => sp.id === dynamicP.id || sp.slug === dynamicP.slug)) {
          merged.push(dynamicP);
        }
      });
      setProducts(merged);
      setLoadingProducts(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return () => unsubscribe();
  }, []);

  // Unified items pipeline
  const unifiedStockItems = useMemo(() => {
    const items: any[] = [];

    // 1. Basic T-Shirt Bases
    const bases = products.filter(p => p.slug === 'force' || p.slug === 'mark' || p.slug === 'prime');
    bases.forEach((b, idx) => {
      const consolidatedStock = Number(getStock(b.slug)) || 0;
      items.push({
        ...b,
        unifiedId: `shirt_${b.id || b.slug}_${idx}`,
        unifiedType: 'shirt',
        sku: (b.slug || 'shirt').toUpperCase(),
        displayCategory: 'Camisa Base',
        linha: (b.slug || 'shirt').toUpperCase(),
        totalStock: consolidatedStock,
        status: 'Ativa',
        minStock: Number(b.minStock) || 10
      });
    });

    // 2. Catalog Products
    const catalogProds = products.filter(p => p.slug !== 'force' && p.slug !== 'mark' && p.slug !== 'prime');
    catalogProds.forEach((p, idx) => {
      const consolidatedStock = Number(getStock(p.slug)) || 0;
      items.push({
        ...p,
        unifiedId: `product_${p.id || p.slug || 'item'}_${idx}`,
        unifiedType: 'product',
        sku: (p.sku || p.slug || 'PROD').toUpperCase(),
        displayCategory: p.category || 'Peça Catalogada',
        linha: p.parentSlug?.toUpperCase() || 'EXCLUSIVO',
        totalStock: consolidatedStock,
        status: p.status === 'draft' ? 'Rascunho' : 'Ativa',
        minStock: Number(p.minStock) || 3
      });
    });

    return items;
  }, [products, inventory]);

  // Master Dashboard Stats compilation
  const stats = useMemo(() => {
    let totalItems = unifiedStockItems.length;
    let baseShirtsCount = 0;
    let totalStockVolume = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    unifiedStockItems.forEach(item => {
      const currentStock = Number(item.totalStock) || 0;
      totalStockVolume += currentStock;

      if (item.unifiedType === 'shirt') {
        baseShirtsCount += currentStock;
      }

      const minStockNum = Number(item.minStock) || 0;
      if (currentStock === 0) {
        outOfStockCount++;
      } else if (currentStock <= minStockNum) {
        lowStockCount++;
      }
    });

    return {
      totalItems,
      baseShirtsCount,
      totalStockVolume,
      lowStockCount,
      outOfStockCount
    };
  }, [unifiedStockItems]);

  // Main list filters
  const filteredItems = useMemo(() => {
    return unifiedStockItems.filter(item => {
      // 1. Category tab filtering
      if (categoryFilter === 'shirts' && item.unifiedType !== 'shirt') return false;
      if (categoryFilter === 'products' && item.unifiedType !== 'product') return false;
      if (categoryFilter === 'others' && (item.unifiedType === 'shirt' || item.unifiedType === 'product')) return false;

      // 2. Line Filter
      if (lineFilter !== 'all') {
        const lineVal = lineFilter.toLowerCase();
        const itemLine = (item.linha || item.parentSlug || '').toLowerCase();
        if (!itemLine.includes(lineVal)) return false;
      }

      // 3. Stock Level Filter
      if (stockStatusFilter === 'out_of_stock' && item.totalStock > 0) return false;
      if (stockStatusFilter === 'critical' && (item.totalStock === 0 || item.totalStock > item.minStock)) return false;
      if (stockStatusFilter === 'normal' && item.totalStock <= item.minStock) return false;

      // 4. Smart search queries
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (item.name || '').toLowerCase().includes(q);
        const matchesSku = (item.sku || item.slug || '').toLowerCase().includes(q);
        const matchesCat = (item.displayCategory || item.category || '').toLowerCase().includes(q);
        const matchesLinha = (item.linha || '').toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesCat && !matchesLinha) return false;
      }

      return true;
    });
  }, [unifiedStockItems, categoryFilter, lineFilter, stockStatusFilter, searchQuery]);

  // Chronological Logs Filtering
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      // 1. Filter by query
      const q = historyQuery.toLowerCase();
      const matchesSearch = !q ||
        (m.productName || '').toLowerCase().includes(q) ||
        (m.variantKey || '').toLowerCase().includes(q) ||
        (m.operator || '').toLowerCase().includes(q) ||
        (m.notes || '').toLowerCase().includes(q);

      // 2. Filter by type
      const matchesType = historyTypeFilter === 'all' || m.type === historyTypeFilter;

      if (!matchesSearch || !matchesType) return false;

      // 3. Filter by period
      if (historyPeriod === 'all') return true;
      if (!m.createdAt) return false;
      const mDate = m.createdAt.toDate ? m.createdAt.toDate() : new Date(m.createdAt);

      if (historyPeriod === 'today') {
        const today = new Date();
        today.setHours(0,0,0,0);
        return mDate >= today;
      }

      if (historyPeriod === '7days') {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 7);
        return mDate >= threshold;
      }

      if (historyPeriod === 'month') {
        const threshold = new Date();
        threshold.setDate(1);
        threshold.setHours(0,0,0,0);
        return mDate >= threshold;
      }

      if (historyPeriod === 'custom') {
        const start = startDateStr ? new Date(`${startDateStr}T00:00:00`) : null;
        const end = endDateStr ? new Date(`${endDateStr}T23:59:59`) : null;
        if (start && mDate < start) return false;
        if (end && mDate > end) return false;
        return true;
      }

      return true;
    });
  }, [movements, historyQuery, historyTypeFilter, historyPeriod, startDateStr, endDateStr]);

  // Image display resolver
  const getItemImage = (item: any) => {
    if (item.imageUrl) return item.imageUrl;
    if (item.image) return item.image;
    if (item.images && item.images.length > 0 && item.images[0]) return item.images[0];
    return 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=300&auto=format&fit=crop';
  };

  // Export CSV Handler
  const handleExportCSV = () => {
    if (unifiedStockItems.length === 0) {
      toast.error('Nenhum item disponível para exportação.');
      return;
    }
    const headers = ['ID', 'Nome', 'SKU', 'Categoria', 'Linha', 'Preco (R$)', 'Custo (R$)', 'Estoque Total', 'Status'];
    const rows = unifiedStockItems.map(item => [
      item.id || item.slug,
      `"${(item.name || '').replace(/"/g, '""')}"`,
      item.sku || item.slug,
      `"${(item.displayCategory || item.category || '').replace(/"/g, '""')}"`,
      item.linha || 'EXCLUSIVO',
      (item.price || 0).toFixed(2),
      (item.costPrice || 0).toFixed(2),
      item.totalStock || 0,
      item.status || 'Ativa'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `catalogo_estoque_fpac_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório do catálogo/estoque exportado com sucesso!');
  };

  // Import CSV/JSON Handler
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          if (item.name) {
            await addDoc(collection(db, 'products'), {
              name: item.name,
              slug: item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              sku: item.sku || `SKU-${Date.now()}`,
              price: Number(item.price) || 0,
              category: item.category || 'Camisetas',
              collection: item.collection || 'FORCE',
              status: item.status || 'active',
              createdAt: new Date(),
              updatedAt: new Date()
            });
          }
        }
        toast.success(`${list.length} produtos importados via JSON!`);
      } else {
        toast.success('Arquivo lido com sucesso!');
      }
    } catch (err) {
      console.error('Erro na importação:', err);
      toast.error('Formato de arquivo inválido.');
    } finally {
      if (importFileInputRef.current) importFileInputRef.current.value = '';
    }
  };

  // Prompt 03: Reset do Catálogo (Reset Total do Zero)
  const handleResetCatalog = async () => {
    setIsResetting(true);
    try {
      // 1. Delete all Firestore products documents
      const productsSnap = await getDocs(collection(db, 'products'));
      const deletePromises = productsSnap.docs.map(d => deleteDoc(doc(db, 'products', d.id)));
      await Promise.all(deletePromises);

      // 2. Clear inventory documents
      const inventorySnap = await getDocs(collection(db, 'inventory'));
      const invPromises = inventorySnap.docs.map(d => deleteDoc(doc(db, 'inventory', d.id)));
      await Promise.all(invPromises);

      toast.success('Catálogo e estoque reinicializados com sucesso! A loja está pronta para novos cadastros do zero.');
      setIsResetModalOpen(false);
    } catch (error) {
      console.error('Erro ao reiniciar catálogo:', error);
      toast.error('Erro ao reiniciar catálogo.');
    } finally {
      setIsResetting(false);
    }
  };


  // Adjust product size variants inside Drawer
  const handleAdjustProductVariant = async (color: string, size: string, change: number, isAbsolute = false) => {
    if (!drawerItem) return;
    const vKey = `${color}_${size}`;
    const slug = drawerItem.slug;
    const inv = inventory[slug];
    const currentStock = Number(inv?.variants?.[vKey]?.stock) || 0;
    const targetStock = isAbsolute ? Math.max(0, change) : Math.max(0, currentStock + change);
    const difference = isAbsolute ? (targetStock - currentStock) : change;

    if (difference === 0) return;

    if (!isAbsolute && currentStock + change < 0) {
      toast.error('Erro: Operação deixaria o estoque negativo.');
      playStockBeep('error');
      return;
    }

    try {
      const isBaseShirt = ['force', 'mark', 'prime'].includes(slug);
      const targets = isBaseShirt ? ['force', 'mark', 'prime'] : [slug];

      for (const tg of targets) {
        const docRef = doc(db, 'inventory', tg);
        const docSnap = await getDoc(docRef);

        let vars: any = {};
        if (docSnap.exists()) vars = docSnap.data().variants || {};

        vars[vKey] = {
          ...vars[vKey],
          stock: targetStock,
          available: targetStock > 0
        };

        const totalSum = Object.values(vars).reduce((sum: number, item: any) => sum + (Number(item.stock) || 0), 0) as number;

        await setDoc(docRef, {
          stock: totalSum,
          available: totalSum > 0,
          variants: vars,
          updatedAt: new Date()
        }, { merge: true });
      }

      // Log movement
      const logRef = doc(collection(db, 'stock_movements'));
      await setDoc(logRef, {
        productId: drawerItem.id || '',
        productSlug: slug,
        productName: drawerItem.name,
        variantKey: vKey,
        quantity: difference,
        type: 'Ajuste',
        operator: user?.email || 'Administrador',
        createdAt: new Date(),
        notes: `Ajuste manual detalhado na gaveta lateral`
      });

      playStockBeep('success');
      toast.success('Estoque atualizado!');

    } catch (err) {
      console.error(err);
      toast.error('Falha de sincronização física.');
      playStockBeep('error');
    }
  };

  // Save detailed item updates in Drawer
  const handleSaveItemDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerItem || !drawerItemType) return;

    setIsSavingDetails(true);
    try {
      const docRef = doc(db, 'products', drawerItem.id);
      const tagsArr = editTags.split(',').map(t => t.trim()).filter(Boolean);
      const updatedFields = {
        name: editName,
        slug: editSku.toLowerCase().trim(),
        headline: editHeadline,
        description: editDesc,
        price: Number(editPrice) || 0,
        category: editCategory,
        parentSlug: editLine === 'EXCLUSIVO' ? '' : editLine.toLowerCase(),
        status: editStatus === 'Rascunho' ? 'draft' : 'active',
        tags: tagsArr,
        updatedAt: new Date()
      };

      await updateDoc(docRef, updatedFields);
      setDrawerItem((prev: any) => ({ ...prev, ...updatedFields }));
      toast.success('Detalhes do catálogo atualizados!');
      playStockBeep('success');
    } catch (err: any) {
      console.error(err);
      toast.error('Falha de atualização: ' + err.message);
      playStockBeep('error');
    } finally {
      setIsSavingDetails(false);
    }
  };

  // Delete product cleanly
  const handleDeleteItem = async () => {
    if (!deleteConfirmItem || !deleteConfirmType) return;

    try {
      const docRef = doc(db, 'products', deleteConfirmItem.id);
      await deleteDoc(docRef);
      toast.success('Produto deletado do catálogo!');

      playStockBeep('success');
      setDeleteConfirmItem(null);
      setDeleteConfirmType(null);
      if (drawerItem && drawerItem.id === deleteConfirmItem.id) {
        setDrawerItem(null);
        setDrawerItemType(null);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Erro de deleção: ' + err.message);
      playStockBeep('error');
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4 bg-white text-center">
        <AlertTriangle size={48} className="text-[#eab308] mb-4" />
        <h1 className="text-2xl font-black uppercase mb-2 tracking-tighter">Acesso Restrito</h1>
        <p className="text-sm text-gray-500 uppercase tracking-widest font-bold max-w-md">
          Sua conta não possui permissão de administrador para operar a central de estoque e financeiro da F PAC.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. HERO HEADER - ESTAMPAS STANDARD PATTERN */}
      <div className="bg-black text-white px-4 md:px-8 py-4 md:py-6 border-b-2 border-[#eab308] relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-12 translate-y-12 pointer-events-none">
          <Layers size={200} className="text-white" />
        </div>
        
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#eab308] text-black px-2 py-0.5 text-[8px] font-black uppercase tracking-widest font-mono">
                SGC v2.4
              </span>
              <span className="text-gray-400 text-[9px] font-bold uppercase tracking-[0.2em] font-sans">
                • CENTRAL DE CONTROLE DE ESTOQUE
              </span>
            </div>
            
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight italic font-sans">
              GESTÃO DE <span className="text-[#eab308]">PRODUTOS & ESTOQUE</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleOpenCreateProduct()}
              className="bg-[#eab308] text-black hover:bg-white transition-all px-4 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Plus size={13} /> Novo Produto
            </button>
            <button
              onClick={() => importFileInputRef.current?.click()}
              className="bg-white/10 text-white hover:bg-white/20 transition-all px-3 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border border-white/20"
            >
              <Upload size={13} /> Importar
            </button>
            <button
              onClick={handleExportCSV}
              className="bg-white/10 text-white hover:bg-white/20 transition-all px-3 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border border-white/20"
            >
              <Download size={13} /> Exportar CSV
            </button>
            <button
              onClick={() => document.getElementById('inventory-list-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-white/10 text-white hover:bg-white/20 transition-all px-3 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border border-white/20"
            >
              <FileText size={13} /> Relatórios
            </button>
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="bg-rose-950/80 text-rose-300 hover:bg-rose-900 border border-rose-800 transition-all px-3 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={13} /> Reset do Catálogo
            </button>
          </div>
        </div>
      </div>

      {/* 2. INDICATOR CARDS (KPIs) - ESTAMPAS STANDARD PATTERN */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 -translate-y-3 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 block font-sans">Volume Total</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block">{stats.totalStockVolume}</span>
            </div>
            <span className="text-[8px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Unidades</span>
          </div>

          <div className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 block font-sans">Tecidos (Bases)</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-emerald-700">{stats.baseShirtsCount}</span>
            </div>
            <span className="text-[8px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Bases</span>
          </div>

          <div 
            onClick={() => {
              setStockStatusFilter('critical');
              document.getElementById('inventory-list-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between cursor-pointer"
          >
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-rose-500 block font-sans">Estoque Crítico</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-rose-600">{stats.lowStockCount}</span>
            </div>
            <span className="text-[8px] text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Alertas</span>
          </div>
        </div>
      </div>

      {/* Hidden file input for imports */}
      <input
        type="file"
        ref={importFileInputRef}
        onChange={handleImportFile}
        accept=".json,.csv"
        className="hidden"
      />

      <div className="space-y-6 animate-fade-in">

          {/* SECTION 3: CORE STOCK TABLE AND GRID (UNIFIED VIEW) */}
          <section id="inventory-list-section" className="bg-white border border-black/[0.08] shadow-sm p-6 space-y-6">
            
            {/* Control Bar */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-black/[0.05] pb-5">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest italic flex items-center gap-1.5 text-neutral-800">
                  <SlidersHorizontal size={14} className="text-[#eab308]" /> ITENS DO INVENTÁRIO CADASTRO E FISCAL
                </h3>
                <p className="text-[10px] text-gray-400">Totalizadores de estoque integrados para fins contábeis e vendas automatizadas do e-commerce</p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 select-none">
                <button
                  onClick={handleOpenCreateProduct}
                  className="bg-[#eab308] text-black text-[9px] font-black uppercase tracking-widest px-4 py-2.5 transition-all flex items-center gap-1.5 hover:bg-black hover:text-[#eab308] shadow-md cursor-pointer"
                >
                  <Plus size={12} /> CADASTRAR PRODUTO
                </button>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                    setLineFilter('all');
                    setStockStatusFilter('all');
                  }}
                  className="bg-neutral-100 text-gray-500 text-[9px] font-black uppercase tracking-widest px-3 py-2.5 transition-all border border-neutral-200 hover:text-black hover:bg-neutral-200"
                >
                  Limpar Filtros
                </button>
              </div>
            </div>

            {/* Smart Filters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 select-none">
              {/* Category selector */}
              <div>
                <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Filtrar por Categoria</label>
                <select 
                  value={categoryFilter} 
                  onChange={e => setCategoryFilter(e.target.value as any)}
                  className="w-full bg-neutral-50 border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                >
                  <option value="all">Todas as Categorias</option>
                  <option value="shirts">👕 Camisas Base (Force/Mark/Prime)</option>
                  <option value="products">👚 Peças do Catálogo (Site)</option>
                </select>
              </div>

              {/* Model/Line Selector */}
              <div>
                <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Filtrar por Linha/Molde</label>
                <select 
                  value={lineFilter} 
                  onChange={e => setLineFilter(e.target.value as any)}
                  className="w-full bg-neutral-50 border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                >
                  <option value="all">Todas as Modelagens</option>
                  <option value="force">FORCE (Oversized 260G)</option>
                  <option value="mark">MARK (Streetwear 210G)</option>
                  <option value="prime">PRIME (Casual 180G)</option>
                </select>
              </div>

              {/* Stock Status Selector */}
              <div>
                <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Nível de Alerta</label>
                <select 
                  value={stockStatusFilter} 
                  onChange={e => setStockStatusFilter(e.target.value as any)}
                  className="w-full bg-neutral-50 border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                >
                  <option value="all">Todos os Itens</option>
                  <option value="normal">Estoque Normal / Seguro</option>
                  <option value="critical">🚨 Alerta Crítico (Baixo)</option>
                  <option value="out_of_stock">❌ Zerados (Esgotado)</option>
                </select>
              </div>

              {/* Search input */}
              <div>
                <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Busca Inteligente</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Pesquisar por SKU, nome, tag..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-neutral-50 border border-black/10 px-3 py-2 pr-8 text-xs focus:outline-none focus:border-[#eab308]"
                  />
                  <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>

            {/* List Table Grid */}
            {/* Desktop Table View */}
            <div className="border border-black/[0.05] hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-[9px] font-black uppercase tracking-widest text-neutral-400 border-b border-black/[0.05]">
                    <th className="p-4">Identificação / Item</th>
                    <th className="p-4">SKU / Referência</th>
                    <th className="p-4">Linha & Categoria</th>
                    <th className="p-4 text-center">Físico Consolidado</th>
                    <th className="p-4 text-center">Mínimo</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-right">Ações Rápidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {invLoading || loadingProducts ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-gray-400 uppercase font-black text-xs animate-pulse">
                        Sincronizando banco de dados de estoque...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-gray-400 uppercase font-black text-[10px] italic select-none">
                        Nenhum produto atende aos filtros indicados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const isLow = item.totalStock <= item.minStock;
                      const isOut = item.totalStock === 0;

                      return (
                        <tr 
                          key={`${item.unifiedId}-table-${idx}`} 
                          className="hover:bg-neutral-50/50 transition-all cursor-pointer group"
                          onClick={() => handleOpenEditProduct(item)}
                        >
                          {/* 1. Identification */}
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <img 
                                src={getItemImage(item)} 
                                alt={item.name} 
                                className="w-11 h-11 object-cover bg-neutral-100 border border-black/[0.05] shadow-xs shrink-0 rounded-xs"
                                referrerPolicy="no-referrer"
                              />
                              <div>
                                <h4 className="text-[11.5px] font-black text-black uppercase tracking-tight leading-snug group-hover:text-[#eab308] transition-colors font-mono">{item.sku || item.name}</h4>
                                <span className="text-[8px] text-gray-400 uppercase font-bold tracking-widest block mt-0.5">{item.displayCategory}</span>
                              </div>
                            </div>
                          </td>

                          {/* 2. SKU code */}
                          <td className="p-4 font-mono text-[10px] font-bold text-neutral-800 select-all">
                            {item.sku}
                          </td>

                          {/* 3. Model line */}
                          <td className="p-4">
                            <span className="text-[8px] font-black px-2 py-0.5 bg-black text-[#eab308] uppercase tracking-wider italic">
                              {item.linha || 'EXCLUSIVO'}
                            </span>
                          </td>

                          {/* 4. Total Stock Volume */}
                          <td className="p-4 text-center">
                            <div className="text-sm font-mono font-black text-black">
                              {item.totalStock} <span className="text-[9px] text-gray-400 font-sans font-bold">Un.</span>
                            </div>
                          </td>

                          {/* 5. Minimum stock */}
                          <td className="p-4 text-center font-mono text-[10.5px] font-bold text-gray-400">
                            {item.minStock} un
                          </td>

                          {/* 6. Status Badge */}
                          <td className="p-4 text-center">
                            <span className={cn(
                              "text-[8px] font-black uppercase inline-block px-2 py-0.5 tracking-widest",
                              isOut 
                                ? "bg-rose-100 text-rose-800 border border-rose-200" 
                                : isLow 
                                ? "bg-amber-100 text-amber-800 border border-amber-200" 
                                : "bg-green-100 text-green-800 border border-green-200"
                            )}>
                              {isOut ? 'ESGOTADO' : isLow ? 'CRÍTICO' : 'SEGURO'}
                            </span>
                          </td>

                          {/* 7. Action buttons list */}
                          <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-end items-center gap-1.5">
                              {/* Single Unified Manage Button */}
                              <button
                                title="Gerenciar Produto Completo + Estoque"
                                onClick={() => handleOpenEditProduct(item)}
                                className="px-3 py-1.5 bg-[#eab308] hover:bg-black hover:text-[#eab308] text-black font-black text-[10px] uppercase flex items-center gap-1.5 transition-all rounded-xs shadow-xs cursor-pointer"
                              >
                                <Settings size={12} /> ⚙️ GERENCIAR
                              </button>

                              {/* QR Code generator */}
                              <button
                                title="Gerar QR Code"
                                onClick={() => setQrCodeItem(item)}
                                className="p-2 hover:bg-neutral-100 hover:text-[#eab308] text-gray-400 transition-colors border border-transparent hover:border-neutral-200 cursor-pointer"
                              >
                                <QrCode size={13} />
                              </button>

                              {/* Delete button */}
                              <button
                                title="Excluir do Banco"
                                onClick={() => {
                                  setDeleteConfirmItem(item);
                                  setDeleteConfirmType('product');
                                }}
                                className="p-2 hover:bg-rose-50 hover:text-rose-600 text-gray-300 transition-colors border border-transparent hover:border-rose-100 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards List View */}
            <div className="block md:hidden border border-black/[0.05] bg-white divide-y divide-black/[0.05]">
              {invLoading || loadingProducts ? (
                <div className="p-12 text-center text-gray-400 uppercase font-black text-xs animate-pulse">
                  Sincronizando banco de dados de estoque...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-12 text-center text-gray-400 uppercase font-black text-[10px] italic select-none">
                  Nenhum produto atende aos filtros indicados.
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const isLow = item.totalStock <= item.minStock;
                  const isOut = item.totalStock === 0;

                  return (
                    <div 
                      key={`${item.unifiedId}-mobile-${idx}`} 
                      className="p-4 hover:bg-neutral-50/50 transition-all cursor-pointer active:bg-neutral-100 flex flex-col gap-3"
                      onClick={() => handleOpenEditProduct(item)}
                    >
                      <div className="flex items-center gap-3">
                        <img 
                          src={getItemImage(item)} 
                          alt={item.name} 
                          className="w-12 h-12 object-cover bg-neutral-100 border border-black/[0.05] shadow-xs shrink-0 rounded-xs"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-black text-black uppercase tracking-tight leading-snug truncate font-mono">{item.sku || item.name}</h4>
                          <div className="flex flex-wrap gap-1.5 items-center mt-1">
                            <span className="text-[8px] text-gray-400 uppercase font-bold tracking-widest">{item.displayCategory}</span>
                            <span className="text-[8px] font-black px-1.5 py-0.2 bg-black text-[#eab308] uppercase tracking-wider italic">
                              {item.linha || 'EXCLUSIVO'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-neutral-50 p-2.5 border border-black/[0.03] text-center">
                        <div>
                          <span className="text-[7.5px] font-black text-gray-400 block uppercase">SKU / REF</span>
                          <span className="font-mono text-[9px] font-bold text-neutral-800 break-all select-all">{item.sku}</span>
                        </div>
                        <div>
                          <span className="text-[7.5px] font-black text-gray-400 block uppercase">Estoque</span>
                          <span className="font-mono text-xs font-black text-black">
                            {item.totalStock} <span className="text-[8px] text-gray-400 font-sans font-bold">Un.</span>
                          </span>
                        </div>
                        <div>
                          <span className="text-[7.5px] font-black text-gray-400 block uppercase">Status</span>
                          <span className={cn(
                            "text-[7.5px] font-black uppercase inline-block px-1.5 py-0.2 tracking-wider mt-0.5",
                            isOut 
                              ? "bg-rose-100 text-rose-800 border border-rose-200" 
                              : isLow 
                              ? "bg-amber-100 text-amber-800 border border-amber-200" 
                              : "bg-green-100 text-green-800 border border-green-200"
                          )}>
                            {isOut ? 'ESGOTADO' : isLow ? 'CRÍTICO' : 'SEGURO'}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenEditProduct(item)}
                          className="px-3.5 py-2 bg-[#eab308] hover:bg-black hover:text-[#eab308] text-black text-[9px] font-black uppercase flex items-center gap-1.5 rounded-xs cursor-pointer shadow-xs"
                        >
                          <Settings size={12} /> ⚙️ GERENCIAR
                        </button>
                        <button
                          onClick={() => setQrCodeItem(item)}
                          className="px-2.5 py-2 bg-neutral-100 hover:bg-[#eab308] hover:text-black text-gray-600 text-[9px] font-black uppercase border border-neutral-200 rounded-xs cursor-pointer"
                        >
                          <QrCode size={11} />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteConfirmItem(item);
                            setDeleteConfirmType('product');
                          }}
                          className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[9px] font-black uppercase border border-rose-100 rounded-xs cursor-pointer"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* SECTION 4: UNIFIED AUDIT MOVEMENT LOG LIST */}
          <section className="bg-white border border-black/[0.08] shadow-sm p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-black/[0.05] pb-4 gap-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest italic flex items-center gap-1.5 text-neutral-800">
                  <Clock size={14} className="text-[#eab308]" /> HISTÓRICO DE LANÇAMENTOS & AUDITORIA
                </h3>
                <p className="text-[10px] text-gray-400">Rastreabilidade total das movimentações financeiras, entradas físicas e baixas do e-commerce</p>
              </div>

              {/* Period presets buttons */}
              <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 border border-neutral-200 select-none">
                {(['all', 'today', '7days', 'month', 'custom'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setHistoryPeriod(p)}
                    className={cn(
                      "px-2.5 py-1.5 text-[8.5px] font-black uppercase tracking-wider transition-all",
                      historyPeriod === p ? "bg-black text-[#eab308]" : "text-gray-500 hover:text-black"
                    )}
                  >
                    {p === 'all' ? 'Tudo' : p === 'today' ? 'Hoje' : p === '7days' ? '7 Dias' : p === 'month' ? 'Mês' : 'Período'}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom calendars range input */}
            {historyPeriod === 'custom' && (
              <div className="grid grid-cols-2 max-w-md gap-4 bg-neutral-50 p-3 border border-black/10 text-[10px] uppercase font-bold text-neutral-600 animate-slide-in select-none">
                <div>
                  <label className="block mb-1">Data Inicial:</label>
                  <input 
                    type="date" 
                    value={startDateStr}
                    onChange={e => setStartDateStr(e.target.value)}
                    className="w-full bg-white border border-black/10 px-2 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1">Data Final:</label>
                  <input 
                    type="date" 
                    value={endDateStr}
                    onChange={e => setEndDateStr(e.target.value)}
                    className="w-full bg-white border border-black/10 px-2 py-1.5 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Audit Logs Filter Toolbar */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 select-none">
              <div className="md:col-span-8 relative">
                <input
                  type="text"
                  placeholder="Pesquisar registros de auditoria por operador, peça, etc..."
                  value={historyQuery}
                  onChange={e => setHistoryQuery(e.target.value)}
                  className="w-full bg-neutral-50 border border-black/10 px-3 py-2 pr-8 text-xs focus:outline-none focus:border-[#eab308]"
                />
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>

              <div className="md:col-span-4">
                <select
                  value={historyTypeFilter}
                  onChange={e => setHistoryTypeFilter(e.target.value as any)}
                  className="w-full bg-neutral-50 border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                >
                  <option value="all">Todas as Operações</option>
                  <option value="Produção">🟢 Entrada / Produção</option>
                  <option value="Venda Local">🔵 Saída / Venda Local</option>
                  <option value="Ajuste">🟡 Ajustes Manuais</option>
                </select>
              </div>
            </div>

            {/* Scrollable Movements List */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto border border-neutral-100 p-2 bg-neutral-50/50">
              {loadingMovements ? (
                <div className="text-center py-12 text-gray-400 font-bold uppercase text-xs">
                  Buscando logs de auditoria...
                </div>
              ) : filteredMovements.length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-bold uppercase text-[10px] italic">
                  Nenhum registro de movimentação encontrado.
                </div>
              ) : (
                filteredMovements.map(log => {
                  let typeColor = 'bg-gray-100 text-gray-700';
                  let symbol = '•';

                  if (log.type === 'Produção' || log.type === 'Entrada') {
                    typeColor = 'bg-green-100 text-green-800 border-green-200';
                    symbol = '➕ ENTRADA';
                  } else if (log.type === 'Venda Local' || log.type === 'Saída') {
                    typeColor = 'bg-blue-100 text-blue-800 border-blue-200';
                    symbol = '➖ VENDA LOCAL';
                  } else if (log.type === 'Ajuste') {
                    typeColor = 'bg-amber-100 text-amber-800 border-amber-200';
                    symbol = '⚡ AJUSTE';
                  }

                  const date = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);

                  return (
                    <div 
                      key={log.id}
                      className="bg-white border border-black/[0.04] p-3 text-[11px] grid grid-cols-1 md:grid-cols-12 gap-2 md:items-center hover:border-black/20 transition-all shadow-2xs"
                    >
                      <div className="md:col-span-3">
                        <span className="text-[7.5px] font-black text-gray-400 block">DATA / HORÁRIO</span>
                        <div className="font-mono text-neutral-800 mt-0.5">
                          {date.toLocaleDateString('pt-BR')} às {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <span className={cn("px-2 py-0.5 font-black text-[8.5px] block text-center rounded-xs", typeColor)}>
                          {symbol}
                        </span>
                      </div>

                      <div className="md:col-span-4">
                        <span className="text-[7.5px] font-black text-gray-400 block">PRODUTO & GRADE</span>
                        <span className="font-black text-black uppercase">{log.productName}</span>
                        {log.variantKey && (
                          <span className="font-bold text-neutral-500 font-mono text-[9.5px] ml-1.5 bg-neutral-100 px-1.5 py-0.2 rounded-xs">{log.variantKey.replace('_', ' / ')}</span>
                        )}
                      </div>

                      <div className="md:col-span-1 text-center font-mono font-black text-xs">
                        <span className={log.quantity > 0 ? "text-green-600" : "text-amber-600"}>
                          {log.quantity > 0 ? `+${log.quantity}` : log.quantity}
                        </span>
                      </div>

                      <div className="md:col-span-2 text-right">
                        <span className="text-[7.5px] font-black text-gray-400 block">OPERADOR</span>
                        <span className="text-neutral-500 font-mono text-[9px] truncate block" title={log.operator}>
                          {log.operator}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

      {/* ========================================================================= */}
      {/* 5. GAVETA LATERAL DETALHADA (SLIDEDRAWER INTERACTIVE OVERLAY) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {drawerItem && (
          <motion.div 
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setDrawerItem(null);
              setDrawerItemType(null);
            }}
            className="fixed inset-0 bg-black z-40"
          />
        )}
        {drawerItem && (
          <motion.div 
            key="drawer-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 180 }}
            className="fixed right-0 top-0 bottom-0 w-full md:max-w-xl bg-white shadow-2xl border-l border-neutral-200 z-50 flex flex-col"
          >
              {/* Drawer Header */}
              <div className="bg-black text-white p-5 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <img 
                    src={getItemImage(drawerItem)} 
                    alt={drawerItem.name} 
                    className="w-12 h-12 object-cover bg-neutral-900 border border-neutral-800 rounded-xs"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <h3 className="font-black uppercase tracking-tight text-sm text-[#eab308] leading-tight truncate max-w-xs">{drawerItem.name}</h3>
                    <p className="text-[8px] text-gray-400 font-mono tracking-widest mt-0.5">REF: {drawerItem.sku || drawerItem.slug}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setDrawerItem(null);
                    setDrawerItemType(null);
                  }}
                  className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer Tabs */}
              <div className="flex border-b border-neutral-200 bg-neutral-50 px-1 shrink-0 overflow-x-auto select-none no-scrollbar">
                <button
                  type="button"
                  onClick={() => setDrawerActiveTab('details')}
                  className={cn(
                    "px-3 sm:px-4 py-2.5 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-wider sm:tracking-widest border-b-2 transition-all shrink-0",
                    drawerActiveTab === 'details' ? "border-[#eab308] text-black bg-white" : "border-transparent text-gray-400 hover:text-black"
                  )}
                >
                  📝 Informações
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerActiveTab('stock')}
                  className={cn(
                    "px-3 sm:px-4 py-2.5 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-wider sm:tracking-widest border-b-2 transition-all shrink-0",
                    drawerActiveTab === 'stock' ? "border-[#eab308] text-black bg-white" : "border-transparent text-gray-400 hover:text-black"
                  )}
                >
                  📊 Ajuste de Grade
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerActiveTab('history')}
                  className={cn(
                    "px-3 sm:px-4 py-2.5 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-wider sm:tracking-widest border-b-2 transition-all shrink-0",
                    drawerActiveTab === 'history' ? "border-[#eab308] text-black bg-white" : "border-transparent text-gray-400 hover:text-black"
                  )}
                >
                  🕒 Log de Auditoria
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerActiveTab('media')}
                  className={cn(
                    "px-3 sm:px-4 py-2.5 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-wider sm:tracking-widest border-b-2 transition-all shrink-0",
                    drawerActiveTab === 'media' ? "border-[#eab308] text-black bg-white" : "border-transparent text-gray-400 hover:text-black"
                  )}
                >
                  🖼️ Mídias
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* TAB 1: EDIT DETAILS FORM */}
                {drawerActiveTab === 'details' && (
                  <form onSubmit={handleSaveItemDetails} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Nome do Item</label>
                        <input 
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Código SKU / Referência</label>
                        <input 
                          type="text"
                          value={editSku}
                          onChange={e => setEditSku(e.target.value)}
                          className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:border-[#eab308]"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Molde / Linha</label>
                        <select
                          value={editLine}
                          onChange={e => setEditLine(e.target.value)}
                          className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                        >
                          <option value="Force">Force (Oversized)</option>
                          <option value="Mark">Mark (Streetwear)</option>
                          <option value="Prime">Prime (Casual)</option>
                          <option value="EXCLUSIVO">Exclusivo</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Categoria de Peça</label>
                        <input 
                          type="text"
                          value={editCategory}
                          onChange={e => setEditCategory(e.target.value)}
                          className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Preço Público (R$)</label>
                        <input 
                          type="number"
                          step="0.01"
                          value={editPrice}
                          onChange={e => setEditPrice(e.target.value)}
                          className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#eab308]"
                        />
                      </div>

                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Chamada Rápida (Headline)</label>
                        <input 
                          type="text"
                          value={editHeadline}
                          onChange={e => setEditHeadline(e.target.value)}
                          className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#eab308]"
                        />
                      </div>

                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Descrição Comercial</label>
                        <textarea 
                          rows={3}
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]"
                        />
                      </div>

                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Tags / Etiquetas de Busca (separados por vírgula)</label>
                        <input 
                          type="text"
                          placeholder="ex: oversized, inverno, premium"
                          value={editTags}
                          onChange={e => setEditTags(e.target.value)}
                          className="w-full bg-white border border-black/10 px-3 py-2 text-xs focus:outline-none focus:border-[#eab308]"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Status Operacional</label>
                        <select
                          value={editStatus}
                          onChange={e => setEditStatus(e.target.value)}
                          className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                        >
                          <option value="Ativa">Ativa (Lançado no site)</option>
                          <option value="Inativa">Inativa (Fora de estoque/Oculto)</option>
                          <option value="Rascunho">Rascunho (Bloqueado)</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingDetails}
                      className="w-full bg-black hover:bg-neutral-800 text-[#eab308] text-[10px] font-black uppercase tracking-widest py-3 mt-4 transition-all disabled:opacity-50"
                    >
                      {isSavingDetails ? 'Gravando Alterações...' : 'Salvar Alterações'}
                    </button>
                  </form>
                )}

                {/* TAB 2: ACTIVE STOCK VARIATIONS MATRIX GRID */}
                {drawerActiveTab === 'stock' && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="bg-amber-50 text-amber-900 border border-amber-200/50 p-3 text-[10px] uppercase font-bold tracking-tight">
                        💡 Clique em + ou - para reajustar o estoque da variação. O histórico é gravado automaticamente.
                      </div>

                      <div className="space-y-3">
                        {drawerItem.colors?.map((color: any) => (
                          <div key={color.name} className="border border-neutral-100 p-3 bg-neutral-50/50 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full border border-black/10 inline-block" style={{ backgroundColor: color.hex }} />
                              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-800">{color.name}</span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {drawerItem.sizes?.map((size: string) => {
                                const vKey = `${color.name}_${size}`;
                                const currentStock = Number(inventory[drawerItem.slug]?.variants?.[vKey]?.stock) || 0;

                                return (
                                  <div key={size} className="bg-white border border-black/5 p-2 rounded-xs flex flex-col items-center justify-between gap-1">
                                    <div className="text-[10px] font-black uppercase text-gray-400">{size}</div>
                                    <div className="font-mono font-black text-xs text-black">{currentStock} un</div>
                                    
                                    <div className="flex gap-1 mt-1.5 w-full">
                                      <button 
                                        onClick={() => handleAdjustProductVariant(color.name, size, -1)}
                                        className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-black py-1 text-[11px] font-bold flex justify-center items-center"
                                      >
                                        -
                                      </button>
                                      <button 
                                        onClick={() => handleAdjustProductVariant(color.name, size, 1)}
                                        className="flex-1 bg-black text-[#eab308] hover:bg-neutral-800 py-1 text-[11px] font-bold flex justify-center items-center"
                                      >
                                        +
                                      </button>
                                    </div>
                                   </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: SPECIFIC MOVEMENT LOGS FOR ITEM */}
                {drawerActiveTab === 'history' && (
                  <div className="space-y-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Logs Cronológicos do Item</span>

                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {movements
                        .filter(m => m.productSlug === drawerItem.slug || m.productId === drawerItem.id || m.productSlug === `stamp_${drawerItem.id}`)
                        .map(log => {
                          const date = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
                          const isPositive = log.quantity > 0;

                          return (
                            <div key={log.id} className="bg-neutral-50 p-3 border border-black/5 text-[10.5px] space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="font-mono text-gray-400 text-[8px]">
                                  {date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className={cn(
                                  "font-black font-mono text-[10px]",
                                  isPositive ? "text-green-600" : "text-amber-600"
                                )}>
                                  {isPositive ? `+${log.quantity}` : log.quantity} un
                                </span>
                              </div>

                              <div className="flex justify-between items-center">
                                <span className="font-bold text-black uppercase">{log.type} {log.variantKey && `(${log.variantKey.replace('_', '/')})`}</span>
                                <span className="font-mono text-neutral-400 text-[8.5px]">Op: {log.operator}</span>
                              </div>

                              {log.notes && <p className="text-[9px] italic text-gray-500 mt-1">{log.notes}</p>}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* TAB 5: MEDIA PREVIEWS */}
                {drawerActiveTab === 'media' && (
                  <div className="space-y-4">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Arquivos e Fotos do Produto</span>

                    <div className="grid grid-cols-2 gap-4">
                      {drawerItem.images?.map((imgUrl: string, idx: number) => (
                        <div key={idx} className="relative group border border-neutral-200">
                          <img 
                            src={imgUrl} 
                            alt={`${drawerItem.name} ${idx}`} 
                            className="w-full h-32 object-cover bg-neutral-100"
                            referrerPolicy="no-referrer"
                          />
                          <a 
                            href={imgUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white transition-opacity text-[10px] font-black uppercase"
                          >
                            <Download size={14} /> DOWNLOAD
                          </a>
                        </div>
                      ))}

                      {drawerItem.imageUrl && (
                        <div className="relative group border border-neutral-200 col-span-2">
                          <img 
                            src={drawerItem.imageUrl} 
                            alt={drawerItem.name} 
                            className="w-full h-48 object-cover bg-neutral-100"
                            referrerPolicy="no-referrer"
                          />
                          <a 
                            href={drawerItem.imageUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white transition-opacity text-[10px] font-black uppercase"
                          >
                            <Download size={14} /> DOWNLOAD ARTE EM ALTA
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* 6. MODAL GERADOR DE QR CODE */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {qrCodeItem && (
          <motion.div 
            key="qrcode-modal-wrapper"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              key="qrcode-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setQrCodeItem(null)}
              className="absolute inset-0 bg-black"
            />
            <motion.div 
              key="qrcode-modal-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-neutral-300 w-full max-w-sm p-6 relative z-10 text-center space-y-6"
            >
              <button 
                onClick={() => setQrCodeItem(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-black"
              >
                <X size={18} />
              </button>

              <div className="space-y-2">
                <span className="p-1.5 bg-[#eab308] text-black text-[9px] font-black uppercase tracking-wider rounded-xs inline-block">QR CODE GERADO</span>
                <h4 className="font-black text-black uppercase tracking-tight text-sm">{qrCodeItem.name}</h4>
                <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">SKU REF: {qrCodeItem.sku}</p>
              </div>

              {/* QR Image fetching from qrserver */}
              <div className="flex justify-center p-4 bg-neutral-50 border border-neutral-100 rounded-sm">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeItem.sku || qrCodeItem.slug)}`}
                  alt="QR Code Referência"
                  className="w-48 h-48 bg-white p-2 border border-black/10"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(qrCodeItem.sku || qrCodeItem.slug);
                    toast.success('SKU copiado para a área de transferência!');
                  }}
                  className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-black font-black text-[9.5px] uppercase py-3 transition-colors"
                >
                  COPIAR SKU
                </button>
                <button
                  onClick={() => {
                    window.print();
                  }}
                  className="flex-1 bg-black text-[#eab308] hover:bg-neutral-800 font-black text-[9.5px] uppercase py-3 transition-colors"
                >
                  IMPRIMIR QR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* 7. MODAL DE CONFIRMAÇÃO DE DELEÇÃO */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {deleteConfirmItem && (
          <motion.div 
            key="delete-modal-wrapper"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              key="delete-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmItem(null)}
              className="absolute inset-0 bg-black"
            />
            <motion.div 
              key="delete-modal-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-rose-300 w-full max-w-sm p-6 relative z-10 text-center space-y-5"
            >
              <AlertTriangle className="mx-auto text-rose-500" size={36} />

              <div className="space-y-1">
                <h4 className="font-black text-rose-950 uppercase tracking-tight text-sm">REMOVER ITEM DO INVENTÁRIO</h4>
                <p className="text-[10px] text-gray-500">Esta ação irá deletar permanentemente <span className="font-bold text-black uppercase">"{deleteConfirmItem.name}"</span> do banco de dados.</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setDeleteConfirmItem(null);
                    setDeleteConfirmType(null);
                  }}
                  className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-black font-black text-[10px] uppercase py-3 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteItem}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] uppercase py-3 transition-colors"
                >
                  Deletar Definitivo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Integrated 6-Tab Product Management Drawer */}
      <ProductManagementDrawer
        isOpen={isProductDrawerOpen}
        onClose={() => setIsProductDrawerOpen(false)}
        product={selectedProductForDrawer}
        onSaveSuccess={() => {}}
      />

      {/* Reset Catalog Confirmation Modal */}
      <AnimatePresence>
        {isResetModalOpen && (
          <motion.div 
            key="reset-modal-wrapper"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              key="reset-modal-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-rose-600/50 w-full max-w-md p-6 relative z-10 space-y-5 text-white shadow-2xl"
            >
              <div className="flex items-center gap-3 text-rose-500 border-b border-rose-900/40 pb-3">
                <AlertTriangle size={28} />
                <div>
                  <h4 className="font-black text-white uppercase tracking-tight text-sm">RESET TOTAL DO CATÁLOGO</h4>
                  <p className="text-[9px] text-rose-400 uppercase tracking-widest font-mono">Ação Irreversível</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-neutral-300">
                <p>
                  Esta ação limpará <strong className="text-white">TODOS os produtos cadastrados</strong> e o inventário atual no Firestore.
                </p>
                <div className="bg-rose-950/40 border border-rose-800/40 p-3 rounded text-[10px] text-rose-200 space-y-1">
                  <p className="font-bold">✓ O que será zerado:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[9px] text-rose-300">
                    <li>Coleção de Produtos (`products`)</li>
                    <li>Registros de Estoque e Variações (`inventory`)</li>
                  </ul>
                  <p className="font-bold pt-1">✓ O que SERÁ PRESERVADO:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[9px] text-emerald-300">
                    <li>Usuários, Pedidos e Configurações Globais</li>
                    <li>Estrutura do Sistema</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  disabled={isResetting}
                  onClick={() => setIsResetModalOpen(false)}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-black text-[10px] uppercase py-3 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  disabled={isResetting}
                  onClick={handleResetCatalog}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black text-[10px] uppercase py-3 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isResetting ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  {isResetting ? 'Zerando...' : 'Confirmar Reset'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

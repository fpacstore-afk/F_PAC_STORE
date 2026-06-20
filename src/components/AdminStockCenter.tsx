import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../hooks/useInventory';
import { products as staticProducts } from '../data/products';
import AdminProducts from '../pages/AdminProducts';
import { 
  Plus, Minus, Search, Database, Clock, AlertTriangle, 
  CheckCircle2, Box, Sparkles, RefreshCw, Filter, Calendar, 
  ChevronRight, ArrowRight, X, TrendingUp, TrendingDown, Eye
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../lib/utils';

interface StockMovement {
  id?: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantKey: string;
  quantity: number;
  type: 'Produção' | 'Venda Local' | 'Ajuste';
  operator: string;
  createdAt: any;
}

export function AdminStockCenter() {
  const { user } = useAuth();
  const { inventory, loading: invLoading, updateVariantStock } = useInventory();

  // Admin access validation (matches the AdminOrders restriction)
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'pac@fpac.com';

  // Sub-tab toggler: 'stock' (Consolidated flow) or 'catalog' (AdminProducts manager)
  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'catalog'>('stock');

  // Core dynamic collections
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);

  // Search & Filtro of main table/grid
  const [searchQuery, setSearchQuery] = useState('');
  const [lineFilter, setLineFilter] = useState<'all' | 'force' | 'mark' | 'prime'>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'critical' | 'out_of_stock' | 'normal'>('all');

  // Seletered item flow state (Controle Rápido)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');

  // Absolute stock manual adjustments
  const [manualStockInput, setManualStockInput] = useState<string>('');

  // Floating confirmation visual state
  const [confirmationFeedback, setConfirmationFeedback] = useState<{
    show: boolean;
    type: 'success' | 'error' | null;
    message: string;
    finalStock?: number;
  }>({ show: false, type: null, message: '' });

  // History Filter variables
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'Produção' | 'Venda Local' | 'Ajuste'>('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState<'all' | 'today' | '7days' | 'month' | 'custom'>('all');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');

  // Web Audio synth for warehouse grade operations feedback
  const playStockBeep = (type: 'success' | 'error') => {
    try {
      const isWebKit = 'webkitAudioContext' in window;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch success
        gainNode.gain.setValueAtTime(0.06, ctx.currentTime);
        osc.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.frequency.setValueAtTime(180, ctx.currentTime); // Low buzz buzz
        gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.stop(ctx.currentTime + 0.28);
      }
    } catch {
      // Audio context block prevention (safe ignore)
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

  // 2. Fetch real-time stock movements
  useEffect(() => {
    setLoadingMovements(true);
    const qMovements = query(collection(db, 'stock_movements'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(qMovements, (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          productId: data.productId || '',
          productSlug: data.productSlug || '',
          productName: data.productName || '',
          variantKey: data.variantKey || '',
          quantity: Number(data.quantity) || 0,
          type: data.type || 'Ajuste',
          operator: data.operator || 'Administrador',
          createdAt: data.createdAt
        } as StockMovement;
      });
      setMovements(list);
      setLoadingMovements(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stock_movements');
    });
    return () => unsubscribe();
  }, []);

  // Filter products excluding groupings: 'force', 'mark', 'prime'
  const validStamps = useMemo(() => {
    return products.filter(p => p.slug !== 'force' && p.slug !== 'mark' && p.slug !== 'prime');
  }, [products]);

  // Set default stamp on load
  useEffect(() => {
    if (validStamps.length > 0 && !selectedProduct) {
      setSelectedProduct(validStamps[0]);
    }
  }, [validStamps, selectedProduct]);

  // Set default color & size whenever product changes
  useEffect(() => {
    if (selectedProduct) {
      if (selectedProduct.colors && selectedProduct.colors.length > 0) {
        setSelectedColor(selectedProduct.colors[0].name);
      } else {
        setSelectedColor('');
      }
      if (selectedProduct.sizes && selectedProduct.sizes.length > 0) {
        setSelectedSize(selectedProduct.sizes[0]);
      } else {
        setSelectedSize('');
      }
      setManualStockInput('');
    }
  }, [selectedProduct]);

  // Telemetry Calculations for "Resumo Geral"
  const summaryMetrics = useMemo(() => {
    let totalStock = 0;
    let criticalStock = 0;
    let outOfStock = 0;

    validStamps.forEach(p => {
      const inv = inventory[p.slug];
      if (inv && inv.variants) {
        Object.values(inv.variants).forEach((v: any) => {
          if (v.available !== false) {
            const qty = Number(v.stock) || 0;
            totalStock += qty;
            if (qty === 0) {
              outOfStock++;
            } else if (qty <= 3) {
              criticalStock++;
            }
          }
        });
      }
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let producedToday = 0;
    let soldToday = 0;

    movements.forEach(m => {
      if (m.createdAt) {
        let mDate: Date;
        if (m.createdAt.toDate) {
          mDate = m.createdAt.toDate();
        } else {
          mDate = new Date(m.createdAt);
        }

        if (mDate >= startOfToday) {
          if (m.type === 'Produção') {
            producedToday += Number(m.quantity) || 0;
          } else if (m.type === 'Venda Local') {
            soldToday += Math.abs(Number(m.quantity)) || 0;
          }
        }
      }
    });

    return {
      totalStock,
      producedToday,
      soldToday,
      criticalStock,
      outOfStock
    };
  }, [validStamps, inventory, movements]);

  // Filtered Stock Movements for history tab
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      // 1. Filter by search query (product name, variant key, or operator)
      const matchesSearch = 
        m.productName.toLowerCase().includes(historyQuery.toLowerCase()) ||
        m.variantKey.toLowerCase().includes(historyQuery.toLowerCase()) ||
        m.operator.toLowerCase().includes(historyQuery.toLowerCase());

      // 2. Filter by movement type
      const matchesType = historyTypeFilter === 'all' || m.type === historyTypeFilter;

      // 3. Filter by date period
      if (!matchesSearch || !matchesType) return false;
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

  // Master product list aligned with search query, line filters, and stock status filters
  const filteredStampCards = useMemo(() => {
    return validStamps.filter(p => {
      // Search: checks name, slug, parentSlug, colors, or SKU format
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        p.name?.toLowerCase().includes(q) ||
        p.slug?.toLowerCase().includes(q) ||
        p.parentSlug?.toLowerCase().includes(q) ||
        p.sizes?.some((s: string) => s.toLowerCase() === q) ||
        p.colors?.some((c: any) => c.name.toLowerCase().includes(q));

      // Line filter (category)
      const matchesLine = lineFilter === 'all' || p.parentSlug === lineFilter || p.category === lineFilter;

      // Stock level filter
      let matchesStock = true;
      const inv = inventory[p.slug];

      if (stockStatusFilter === 'critical') {
        matchesStock = !!(inv?.variants && Object.values(inv.variants).some((v: any) => v.available !== false && v.stock > 0 && v.stock <= 3));
      } else if (stockStatusFilter === 'out_of_stock') {
        // Either totally offline/empty or has zero stock
        matchesStock = !inv || inv.stock === 0 || !!(inv?.variants && Object.values(inv.variants).some((v: any) => v.available !== false && v.stock === 0));
      } else if (stockStatusFilter === 'normal') {
        matchesStock = !!(inv?.variants && Object.values(inv.variants).every((v: any) => v.available === false || v.stock > 3));
      }

      return matchesSearch && matchesLine && matchesStock;
    });
  }, [validStamps, searchQuery, lineFilter, stockStatusFilter, inventory]);

  // Resolved selected product / variant details
  const selectedVariantDetails = useMemo(() => {
    if (!selectedProduct || !selectedColor || !selectedSize) return null;
    const vKey = `${selectedColor}_${selectedSize}`;
    
    // Calculate current stock
    const currentStock = Number(inventory[selectedProduct.slug]?.variants?.[vKey]?.stock) || 0;

    // Calculate last movement
    const lastMov = movements.find(m => m.productSlug === selectedProduct.slug && m.variantKey === vKey);

    // Calculate total sold (only local sales matching this specific key)
    const localSold = movements
      .filter(m => m.productSlug === selectedProduct.slug && m.variantKey === vKey && m.type === 'Venda Local')
      .reduce((sum, m) => sum + Math.abs(m.quantity), 0);

    // Determine status string
    let statusText = 'Normal';
    let statusColor = 'text-green-600 bg-green-50 border-green-200';
    if (currentStock === 0) {
      statusText = 'Esgotado';
      statusColor = 'text-red-600 bg-red-50 border-red-200';
    } else if (currentStock <= 3) {
      statusText = 'Estoque Crítico';
      statusColor = 'text-amber-600 bg-amber-50 border-amber-200';
    }

    return {
      currentStock,
      lastMov,
      localSold,
      statusText,
      statusColor,
      vKey
    };
  }, [selectedProduct, selectedColor, selectedSize, inventory, movements]);

  // CORE LOG OPERATION: Lançar alteração de estoque (Entrada, Saída, ou Ajuste)
  const handleStockAction = async (actionType: 'Produção' | 'Venda Local' | 'Ajuste', deltaOrAbsoluteValue: number, isAbsolute: boolean = false) => {
    if (!selectedProduct || !selectedColor || !selectedSize || !selectedVariantDetails) {
      toast.error('Por favor, selecione a Estampa, Cor e Tamanho completando a grade.');
      playStockBeep('error');
      return;
    }

    const { currentStock, vKey } = selectedVariantDetails;

    // Check if we are doing a deduction and have sufficient units
    if (actionType === 'Venda Local' && !isAbsolute && currentStock + deltaOrAbsoluteValue < 0) {
      toast.error(`Operação cancelada! Estoque indisponível para realizar baixa. Saldo atual: ${currentStock} un.`);
      playStockBeep('error');
      setConfirmationFeedback({
        show: true,
        type: 'error',
        message: 'Falha: Baixa maior que o estoque físico disponível.',
        finalStock: currentStock
      });
      return;
    }

    try {
      const SHIRT_SLUGS = ['force', 'mark', 'prime'];
      const targets = SHIRT_SLUGS.includes(selectedProduct.slug) ? SHIRT_SLUGS : [selectedProduct.slug];

      const newVariantStock = isAbsolute 
        ? Math.max(0, deltaOrAbsoluteValue) 
        : Math.max(0, currentStock + deltaOrAbsoluteValue);

      const changeAmount = isAbsolute ? (newVariantStock - currentStock) : deltaOrAbsoluteValue;

      // Don't create movement if nothing changed
      if (isAbsolute && changeAmount === 0) {
        toast.success('Nenhuma alteração de estoque necessária. Valor idêntico.');
        return;
      }

      for (const targetSlug of targets) {
        const docRef = doc(db, 'inventory', targetSlug);
        const docSnap = await getDoc(docRef);

        let currentVariants: any = {};
        let currentAvailable = true;
        if (docSnap.exists()) {
          const data = docSnap.data();
          currentVariants = data.variants || {};
          currentAvailable = data.available ?? true;
        }

        const tempVariants = {
          ...currentVariants,
          [vKey]: {
            ...currentVariants[vKey],
            stock: newVariantStock,
            available: newVariantStock > 0
          }
        };

        // Sum entire total stock for this stamp
        const totalStockSum = Object.values(tempVariants).reduce((sum: number, v: any) => {
          if (v.available === false) return sum;
          const val = Number(v.stock);
          return sum + (isNaN(val) ? 0 : val);
        }, 0) as number;

        // 1. Write the new inventory payload to Firestore
        await setDoc(docRef, {
          stock: totalStockSum,
          available: totalStockSum > 0 || currentAvailable,
          variants: tempVariants,
          updatedAt: new Date()
        }, { merge: true });
      }

      // 2. Append a tracked record inside /stock_movements
      const logRef = doc(collection(db, 'stock_movements'));
      await setDoc(logRef, {
        productId: selectedProduct.id || '',
        productSlug: selectedProduct.slug,
        productName: selectedProduct.name,
        variantKey: vKey,
        quantity: changeAmount,
        type: actionType,
        operator: user?.email || 'Administrador',
        createdAt: new Date()
      });

      // Beep feedback
      playStockBeep('success');

      // Visual visual feedback states
      setConfirmationFeedback({
        show: true,
        type: 'success',
        message: actionType === 'Produção' 
          ? `Lançado: +${changeAmount} un. (Produção)` 
          : actionType === 'Venda Local' 
          ? `Lançado: ${changeAmount} un. (Baixa Local)` 
          : `Ajuste Salvo! Estoque redefinido de ${currentStock} un. para ${newVariantStock} un.`,
        finalStock: newVariantStock
      });

      toast.success(
        actionType === 'Produção' 
          ? 'Produção de estampa acrescida com sucesso!' 
          : actionType === 'Venda Local' 
          ? 'Baixa registrada e movimentada com sucesso!' 
          : 'Estoque físico atualizado com sucesso!'
      );

      // Clear text fields
      setManualStockInput('');

      // Automate feedback timer
      const timer = setTimeout(() => {
        setConfirmationFeedback(prev => ({ ...prev, show: false }));
      }, 3500);

    } catch (error: any) {
      console.error(error);
      playStockBeep('error');
      toast.error('Houve um erro ao sincronizar as quantidades com o Firestore.');
    }
  };

  // Helper mapping logo image
  const getProductImage = (prod: any) => {
    if (prod?.images && prod.images.length > 0 && prod.images[0]) {
      return prod.images[0];
    }
    // Fallback premium streetwear sketch
    return 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=300&auto=format&fit=crop';
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
    <div className="space-y-8">
      
      {/* Tab bar header nested inside Stock Central */}
      <div className="bg-black text-white p-6 border border-neutral-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-widest italic flex items-center gap-2">
            <span className="text-[#eab308]"><Database size={22} className="inline-block mr-1 align-text-bottom" />CENTRAL</span> DE ESTOQUE
          </h2>
          <p className="text-[9px] text-[#eab308] font-bold uppercase tracking-widest mt-0.5">
            Módulo único consolidado para movimentações instantâneas em 3 segundos • Sem câmeras
          </p>
        </div>

        {/* Sub-tab chooser: Central is fully nested */}
        <div className="flex bg-neutral-900 p-1 border border-neutral-800">
          <button 
            onClick={() => setActiveSubTab('stock')}
            className={cn(
              "px-4 py-2 text-[9px] font-black uppercase tracking-wider transition-all",
              activeSubTab === 'stock' ? "bg-[#eab308] text-black shadow-lg" : "text-gray-400 hover:text-white"
            )}
          >
            📟 Controle e Movimentação
          </button>
          <button 
            onClick={() => setActiveSubTab('catalog')}
            className={cn(
              "px-4 py-2 text-[9px] font-black uppercase tracking-wider transition-all",
              activeSubTab === 'catalog' ? "bg-[#eab308] text-black shadow-lg" : "text-gray-400 hover:text-white"
            )}
          >
            🗂️ Catálogo & Cadastro
          </button>
        </div>
      </div>

      {activeSubTab === 'catalog' ? (
        <div className="border border-neutral-200 p-2 bg-neutral-50 rounded-xs">
          <div className="bg-amber-50 text-amber-800 p-3 text-[10px] uppercase tracking-widest font-black border-l-4 border-amber-500 mb-4 flex justify-between items-center">
            <span>PAINEL COMPLEMENTAR: CADASTRO DE MODELOS E UPLOAD DE ARTES NO CATÁLOGO</span>
            <button 
              onClick={() => setActiveSubTab('stock')} 
              className="underline text-black text-[9px] hover:text-[#eab308]"
            >
              Voltar ao Controle Rápido →
            </button>
          </div>
          <AdminProducts isEmbedded={true} />
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          
          {/* SECÇÃO 1: RESUMO GERAL */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
            
            <div className="bg-white border border-black/[0.08] p-4 flex flex-col justify-between shadow-sm hover:border-black/30 transition-all">
              <div className="flex justify-between items-start text-gray-400">
                <span className="text-[8px] font-mono font-black uppercase tracking-widest">ESTOQUE TOTAL</span>
                <Box size={14} className="text-black" />
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono tracking-tighter text-black">{summaryMetrics.totalStock}</span>
                <span className="text-[9px] font-bold text-gray-400">UN.</span>
              </div>
              <p className="text-[8px] mt-1 text-gray-400 uppercase font-bold">Consolidado em loja</p>
            </div>

            <div className="bg-white border border-black/[0.08] p-4 flex flex-col justify-between shadow-sm hover:border-black/30 transition-all">
              <div className="flex justify-between items-start text-emerald-500">
                <span className="text-[8px] font-mono font-black uppercase tracking-widest">PRODUZIDOS HOJE</span>
                <TrendingUp size={14} />
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono tracking-tighter text-emerald-600">+{summaryMetrics.producedToday}</span>
                <span className="text-[9px] font-bold text-emerald-500">UN.</span>
              </div>
              <p className="text-[8px] mt-1 text-gray-400 uppercase font-bold">Lançados como entrada</p>
            </div>

            <div className="bg-white border border-black/[0.08] p-4 flex flex-col justify-between shadow-sm hover:border-black/30 transition-all">
              <div className="flex justify-between items-start text-neutral-800">
                <span className="text-[8px] font-mono font-black uppercase tracking-widest">VENDIDOS HOJE</span>
                <TrendingDown size={14} className="text-amber-600" />
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono tracking-tighter text-amber-600">-{summaryMetrics.soldToday}</span>
                <span className="text-[9px] font-bold text-amber-500">UN.</span>
              </div>
              <p className="text-[8px] mt-1 text-gray-400 uppercase font-bold">Vendas e baixas locais</p>
            </div>

            {/* Clickable alert cards */}
            <button 
              onClick={() => {
                setStockStatusFilter('critical');
                const listElem = document.getElementById('inventory-list-section');
                if (listElem) listElem.scrollIntoView({ behavior: 'smooth' });
              }}
              className={cn(
                "bg-white border p-4 flex flex-col justify-between shadow-sm hover:border-black transition-all text-left group",
                summaryMetrics.criticalStock > 0 ? "border-amber-200 bg-amber-50/20" : "border-black/[0.08]"
              )}
            >
              <div className="flex justify-between items-start text-amber-600">
                <span className="text-[8px] font-mono font-black uppercase tracking-widest group-hover:underline">ALERTA CRÍTICO</span>
                <AlertTriangle size={14} className={summaryMetrics.criticalStock > 0 ? "animate-bounce" : ""} />
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className={cn("text-2xl font-black font-mono tracking-tighter", summaryMetrics.criticalStock > 0 ? "text-amber-600" : "text-black")}>
                  {summaryMetrics.criticalStock}
                </span>
                <span className="text-[9px] font-bold text-gray-400">VARIAÇÕES</span>
              </div>
              <p className="text-[8px] mt-1 text-amber-700/70 uppercase font-bold flex items-center gap-1">
                Estoque ≤ 3 un. <Eye size={10} className="inline" />
              </p>
            </button>

            <button 
              onClick={() => {
                setStockStatusFilter('out_of_stock');
                const listElem = document.getElementById('inventory-list-section');
                if (listElem) listElem.scrollIntoView({ behavior: 'smooth' });
              }}
              className={cn(
                "bg-white border p-4 flex flex-col justify-between shadow-sm hover:border-black transition-all text-left group",
                summaryMetrics.outOfStock > 0 ? "border-rose-200 bg-rose-50/20" : "border-black/[0.08]"
              )}
            >
              <div className="flex justify-between items-start text-rose-600">
                <span className="text-[8px] font-mono font-black uppercase tracking-widest group-hover:underline">ESGOTADOS</span>
                <X size={14} />
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className={cn("text-2xl font-black font-mono tracking-tighter", summaryMetrics.outOfStock > 0 ? "text-rose-600" : "text-slate-500")}>
                  {summaryMetrics.outOfStock}
                </span>
                <span className="text-[9px] font-bold text-gray-400">VARIAÇÕES</span>
              </div>
              <p className="text-[8px] mt-1 text-rose-700/70 uppercase font-bold flex items-center gap-1">
                Zerados fisicamente <Eye size={10} className="inline" />
              </p>
            </button>

          </section>

          {/* NOVO FLUXO OPERACIONAL EXCELENTE: 1. SELECT PRODUCT, 2. COLOR, 3. SIZE IN ONE COMPACT FAST CARD */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LADO ESQUERDO: CONTROLE RÁPIDO INTERATIVO */}
            <section className="lg:col-span-8 bg-black text-white p-6 md:p-8 shadow-xl space-y-6 border border-neutral-900 relative overflow-hidden">
              
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#eab308]/20 to-transparent rounded-full blur-2xl pointer-events-none" />

              <div className="border-b border-neutral-800 pb-4">
                <span className="text-[#eab308] text-[8px] font-black tracking-widest uppercase block mb-1">CONVENÇÃO TOUCH DE 3 SEGUNDOS</span>
                <h3 className="text-base font-black uppercase tracking-widest italic">PAINEL DE LANÇAMENTO INSTANTÂNEO</h3>
                <p className="text-[10px] text-gray-400">Registre entradas da produção e baixas de vendas locais da grade em poucos cliques.</p>
              </div>

              {/* FLOW SECTION CONTROLLER */}
              <div className="space-y-6">
                
                {/* ETAPA 1: SELECIONAR ESTAMPA */}
                <div className="space-y-2">
                  <label className="text-[9px] font-mono font-black text-gray-400 uppercase tracking-widest flex justify-between">
                    <span>1. SELECIONE A ESTAMPA DA COLEÇÃO</span>
                    {selectedProduct && <span className="text-[#eab308]">Filtro Ativado</span>}
                  </label>
                  
                  <div className="relative">
                    <select 
                      value={selectedProduct?.slug || ''} 
                      onChange={(e) => {
                        const s = validStamps.find(p => p.slug === e.target.value);
                        if (s) setSelectedProduct(s);
                      }}
                      className="w-full bg-neutral-900 text-white font-bold uppercase text-xs border border-neutral-800 p-3 rounded-none focus:outline-none focus:border-[#eab308] pr-8"
                    >
                      {validStamps.map(p => (
                        <option key={p.id} value={p.slug}>
                          {p.name} (Ref: {p.slug.toUpperCase()})
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 font-mono text-xs">▼</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* ETAPA 2: SELECIONAR COR */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-mono font-black text-gray-400 uppercase tracking-widest">
                      2. SELECIONE A COR
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct?.colors?.map((color: any) => {
                        const isColorSelected = selectedColor === color.name;
                        return (
                          <button
                            key={color.name}
                            type="button"
                            onClick={() => setSelectedColor(color.name)}
                            className={cn(
                              "px-3 py-2 border text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2",
                              isColorSelected 
                                ? "bg-white text-black border-white shadow-md font-black scale-105" 
                                : "bg-neutral-900 text-gray-400 border-neutral-800 hover:text-white hover:border-neutral-700"
                            )}
                          >
                            <span 
                              className="w-3 h-3 rounded-full border border-black/10 inline-block shadow-inner" 
                              style={{ backgroundColor: color.hex }}
                            />
                            {color.name}
                          </button>
                        );
                      }) || <div className="text-[10px] text-gray-500 uppercase italic">Nenhuma cor disponível</div>}
                    </div>
                  </div>

                  {/* ETAPA 3: SELECIONAR TAMANHO */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-mono font-black text-gray-400 uppercase tracking-widest">
                      3. SELECIONE O TAMANHO GERAL
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct?.sizes?.map((sz: string) => {
                        const isSizeSelected = selectedSize === sz;
                        return (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setSelectedSize(sz)}
                            className={cn(
                              "w-11 h-11 border text-sm font-mono font-black transition-all flex items-center justify-center",
                              isSizeSelected
                                ? "bg-[#eab308] text-black border-[#eab308] scale-105"
                                : "bg-neutral-900 text-gray-300 border-neutral-800 hover:text-white hover:border-neutral-700"
                            )}
                          >
                            {sz}
                          </button>
                        );
                      }) || <div className="text-[10px] text-gray-500 uppercase italic">Nenhum tamanho disponível</div>}
                    </div>
                  </div>

                </div>

              </div>

              {/* CENTRALIZED INTERACTIVE STOCK DISPLAY CARD FOR RESOLVED VARIANT */}
              {selectedProduct && selectedVariantDetails && (
                <div className="bg-neutral-900 border border-neutral-800 p-5 space-y-4">
                  
                  {/* Visual feedback slide-in notification inside the card */}
                  {confirmationFeedback.show && (
                    <div className={cn(
                      "p-3 text-[10px] font-black uppercase tracking-widest text-center border animate-pulse",
                      confirmationFeedback.type === 'success' 
                        ? "bg-green-950/80 border-green-700 text-green-300" 
                        : "bg-red-950/80 border-red-700 text-red-300"
                    )}>
                      {confirmationFeedback.message}
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <img 
                        src={getProductImage(selectedProduct)} 
                        alt={selectedProduct.name}
                        className="w-16 h-16 object-cover bg-black border border-neutral-800 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-black px-1.5 py-0.5 bg-neutral-800 text-gray-400 uppercase">
                            Linha {selectedProduct.parentSlug?.toUpperCase() || selectedProduct.category?.toUpperCase() || 'COMUM'}
                          </span>
                          <span className={cn("text-[8px] font-black px-1.5 py-0.5 border uppercase", selectedVariantDetails.statusColor)}>
                            {selectedVariantDetails.statusText}
                          </span>
                        </div>
                        <h4 className="text-sm font-black uppercase tracking-tight text-white mt-1">
                          {selectedProduct.name}
                        </h4>
                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                          Variação: <span className="text-[#eab308]">{selectedColor}</span> • Tamanho <span className="text-[#eab308]">{selectedSize}</span>
                        </p>
                      </div>
                    </div>

                    {/* QUANTIDADE ATUAL BIG DISPLAY */}
                    <div className="text-right flex items-center gap-4 md:flex-col md:items-end w-full md:w-auto border-t md:border-t-0 border-neutral-800 pt-3 md:pt-0">
                      <div className="flex justify-between items-center w-full md:w-auto gap-4">
                        <span className="text-[8px] text-gray-400 font-mono font-black uppercase tracking-widest">Estoque Físico Atual</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-mono font-black text-white">{selectedVariantDetails.currentStock}</span>
                          <span className="text-[8px] text-neutral-500 font-bold">UN</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* TELEMETRY STATS & AUDIT BLOCK */}
                  <div className="grid grid-cols-2 gap-4 border-t border-neutral-800/60 pt-3 text-[10px] font-mono">
                    <div>
                      <span className="text-neutral-500 block uppercase text-[8px] tracking-wider">Última Movimentação:</span>
                      <span className="text-gray-300 font-bold block mt-0.5 break-words">
                        {selectedVariantDetails.lastMov ? (
                          <>
                            <span className={selectedVariantDetails.lastMov.quantity > 0 ? "text-emerald-500" : "text-amber-500"}>
                              {selectedVariantDetails.lastMov.quantity > 0 ? '+' : ''}{selectedVariantDetails.lastMov.quantity} un.
                            </span>{' '}
                            ({selectedVariantDetails.lastMov.type}) em{' '}
                            {selectedVariantDetails.lastMov.createdAt?.toDate 
                              ? selectedVariantDetails.lastMov.createdAt.toDate().toLocaleDateString('pt-BR') 
                              : new Date(selectedVariantDetails.lastMov.createdAt).toLocaleDateString('pt-BR')
                            }
                          </>
                        ) : (
                          'Nenhuma registrada'
                        )}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-neutral-500 block uppercase text-[8px] tracking-wider">Total de Baixas Locais:</span>
                      <span className="text-amber-500 font-bold block mt-0.5 font-mono">
                        {selectedVariantDetails.localSold} un. vendidas localmente
                      </span>
                    </div>
                  </div>

                  {/* COMPACT TRIGGER WORKSPACE: 3 OPERATIONAL ACTIONS UNDER 3 SECONDS */}
                  <div className="border-t border-neutral-800/80 pt-4 space-y-4">
                    
                    {/* BUTTON ➕ AND ➖ */}
                    <div className="grid grid-cols-2 gap-4">
                      
                      <button
                        onClick={() => handleStockAction('Produção', 1)}
                        className="p-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 active:scale-95"
                      >
                        <Plus size={16} /> PRODUÇÃO / ENTRADA (+1)
                      </button>

                      <button
                        onClick={() => handleStockAction('Venda Local', -1)}
                        disabled={selectedVariantDetails.currentStock === 0}
                        className="p-4 bg-[#eab308] hover:bg-[#d9a307] disabled:bg-neutral-800 disabled:text-neutral-600 disabled:border-transparent text-black font-black uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 active:scale-95 border border-transparent"
                      >
                        <Minus size={16} /> VENDA LOCAL / BAIXA (-1)
                      </button>

                    </div>

                    {/* BUTTON ➕ ADJUST MANUAL */}
                    <div className="bg-neutral-950 border border-neutral-800 p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[8px] font-mono font-black uppercase tracking-widest text-neutral-400 block">
                          ⚡ AJUSTE MANUAL DE INVENTÁRIO
                        </label>
                        <span className="text-[7.5px] font-bold text-gray-500 uppercase">Sobrescreve o volume atual</span>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Digite o novo estoque real (Ex: 15)"
                          value={manualStockInput}
                          onChange={(e) => setManualStockInput(e.target.value)}
                          className="flex-1 bg-neutral-900 border border-neutral-800 px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#eab308] text-white"
                        />
                        <button
                          onClick={() => {
                            const val = parseInt(manualStockInput);
                            if (isNaN(val) || val < 0) {
                              toast.error('Por favor, informe um número inteiro não-negativo para definir.');
                              return;
                            }
                            handleStockAction('Ajuste', val, true);
                          }}
                          className="bg-white hover:bg-neutral-200 text-black px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all shrink-0"
                        >
                          DEFINIR ESTOQUE
                        </button>
                      </div>

                      {/* QUICK INCREMENT PILLS */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[7.5px] text-gray-500 font-bold uppercase mr-1">Atalhos rápidos:</span>
                        {[+5, +10, -5, -10].map((inc) => {
                          const isNegative = inc < 0;
                          return (
                            <button
                              key={inc}
                              type="button"
                              onClick={() => handleStockAction(inc > 0 ? 'Produção' : 'Venda Local', inc)}
                              className={cn(
                                "px-2 py-0.5 text-[8.5px] font-mono font-black uppercase border transition-all",
                                isNegative 
                                  ? "border-amber-800/40 text-amber-500 bg-amber-950/20 hover:bg-amber-900/10" 
                                  : "border-green-800/40 text-green-500 bg-green-950/20 hover:bg-green-900/10"
                              )}
                            >
                              {inc > 0 ? `+${inc}` : inc}
                            </button>
                          );
                        })}
                      </div>

                    </div>

                  </div>

                </div>
              )}

            </section>

            {/* LADO DIREITO: BUSCA INTELIGENTE E PAINEL DE ATALHO RÁPIDO DO INVENTÁRIO */}
            <aside className="lg:col-span-4 space-y-6">
              
              <div className="bg-white border border-black/[0.08] p-5 shadow-sm space-y-4">
                
                <h3 className="text-xs font-black uppercase tracking-widest italic flex items-center gap-1.5 border-b border-black/[0.05] pb-2">
                  <Search size={14} className="text-[#eab308]" /> BUSCA INTELIGENTE
                </h3>
                  
                <div className="space-y-3">
                  
                  {/* Search input field */}
                  <div className="relative">
                    <input 
                      type="text"
                      className="w-full bg-neutral-50 px-3 py-2 text-xs border border-black/10 focus:outline-none focus:border-[#eab308] pr-8"
                      placeholder="Pesquise: Nome, Cor, SKU..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                    <Search size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>

                  {/* FILTERS DROPDOWNS */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <label className="text-[8px] font-black uppercase text-gray-400 tracking-wider">Linha</label>
                      <select
                        value={lineFilter}
                        onChange={e => setLineFilter(e.target.value as any)}
                        className="w-full bg-neutral-50 border border-black/10 p-1.5 font-bold uppercase focus:outline-none focus:border-[#eab308]"
                      >
                        <option value="all">Todas as Linhas</option>
                        <option value="force">Force</option>
                        <option value="mark">Mark</option>
                        <option value="prime">Prime</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[8px] font-black uppercase text-gray-400 tracking-wider">Nível de Estoque</label>
                      <select
                        value={stockStatusFilter}
                        onChange={e => setStockStatusFilter(e.target.value as any)}
                        className="w-full bg-neutral-50 border border-black/10 p-1.5 font-bold uppercase focus:outline-none focus:border-[#eab308]"
                      >
                        <option value="all">Todos Níveis</option>
                        <option value="critical">🚨 Crítico (≤3)</option>
                        <option value="out_of_stock">❌ Zerados (0)</option>
                        <option value="normal">✅ Saudável (&gt;3)</option>
                      </select>
                    </div>
                  </div>

                  {/* Reset Filters button if any is selected */}
                  {(searchQuery !== '' || lineFilter !== 'all' || stockStatusFilter !== 'all') && (
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setLineFilter('all');
                        setStockStatusFilter('all');
                      }}
                      className="text-[9px] font-black uppercase text-rose-500 hover:underline flex items-center gap-1 block ml-auto"
                    >
                      Limpar Filtros ({filteredStampCards.length} encontrados)
                    </button>
                  )}

                </div>

                {/* RESULTS GRID OF STAMPS (CLICK TO SELECT THE STAMP INSTANTLY) */}
                <div className="space-y-2 max-h-[350px] overflow-y-auto scrollbar-none pr-1">
                  
                  {filteredStampCards.length === 0 ? (
                    <p className="text-[10.5px] uppercase font-bold text-gray-400 text-center py-8">
                      Nenhum produto corresponde aos filtros de busca.
                    </p>
                  ) : (
                    filteredStampCards.slice(0, 8).map((stamp) => {
                      const isProductSelected = selectedProduct?.slug === stamp.slug;
                      const stampStock = inventory[stamp.slug]?.stock ?? 0;
                      return (
                        <button
                          key={stamp.id}
                          onClick={() => setSelectedProduct(stamp)}
                          className={cn(
                            "w-full text-left p-2.5 border transition-all flex items-center justify-between group",
                            isProductSelected 
                              ? "border-black bg-neutral-50" 
                              : "border-black/[0.05] hover:border-black hover:bg-neutral-50/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <img 
                              src={getProductImage(stamp)} 
                              alt={stamp.name} 
                              className="w-10 h-10 object-cover bg-neutral-100 border border-black/[0.05]"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <span className="text-[7.5px] uppercase tracking-wider font-mono font-black text-gray-400">
                                {stamp.parentSlug?.toUpperCase() || stamp.category?.toUpperCase() || 'ESTAMPA'}
                              </span>
                              <h4 className="text-[10px] font-black uppercase tracking-tight text-neutral-800 truncate max-w-[140px]">
                                {stamp.name}
                              </h4>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="text-[9px] font-mono font-black text-neutral-800">
                              {stampStock} <span className="text-gray-400 text-[8px] font-sans">un.</span>
                            </div>
                            <span className={cn(
                              "text-[7px] font-mono font-black uppercase px-1 rounded-xs block mt-0.5",
                              stampStock === 0 
                                ? "text-rose-600 bg-rose-50" 
                                : stampStock <= 8 
                                ? "text-amber-600 bg-amber-50" 
                                : "text-green-600 bg-green-50"
                            )}>
                              {stampStock === 0 ? 'ZERO' : stampStock <= 8 ? 'CRÍTICO' : 'DISP.'}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}

                  {filteredStampCards.length > 8 && (
                    <p className="text-[7.5px] uppercase font-bold text-[#eab308] tracking-widest text-center pt-2">
                      + {filteredStampCards.length - 8} outros itens abaixo listados na tabela completa
                    </p>
                  )}

                </div>

              </div>

            </aside>

          </div>

          {/* SECÇÃO 3: TABELA COMPLETA DE INVENTÁRIO (OPERAÇÃO TOTAL) */}
          <section id="inventory-list-section" className="bg-white border border-black/[0.08] shadow-sm p-6 pr-4">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-black/[0.05] pb-4 mb-6 gap-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest italic flex items-center gap-1.5">
                  <Database size={14} className="text-[#eab308]" /> TABELA DE INVENTÁRIO INTEGRADO
                </h3>
                <p className="text-[10px] text-gray-400">Clique em qualquer variação de estampa para carregá-la no painel superior de controle rápido.</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase text-gray-400">Exibindo</span>
                <span className="text-[10px] font-black text-black border border-black/10 px-2 py-1 bg-neutral-50">
                  {filteredStampCards.length} estampas cadastradas
                </span>
              </div>
            </div>

            {/* TABELA DE GRADE REAL DE ITENS DETALHADOS */}
            <div className="overflow-x-auto scrollbar-none">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-black/10 bg-neutral-50 select-none text-[8.5px] font-black uppercase tracking-widest text-neutral-400">
                    <th className="p-3">Foto / Estampa</th>
                    <th className="p-3">Linha</th>
                    <th className="p-3">Variações / Cores cadastrados</th>
                    <th className="p-3 text-center">Grade por Tamanhos</th>
                    <th className="p-3 text-right">Estoque Consolidado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {filteredStampCards.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-400 font-bold uppercase select-none">
                        Nenhum item do inventário atende aos filtros de busca atuais.
                      </td>
                    </tr>
                  ) : (
                    filteredStampCards.map((p) => {
                      const inv = inventory[p.slug];
                      const totalStockOfStamp = inv?.stock ?? 0;
                      return (
                        <tr key={p.id} className="hover:bg-neutral-50/50 transition-all">
                          
                          {/* STAMP IDENTIFIER */}
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <img 
                                src={getProductImage(p)} 
                                alt={p.name} 
                                className="w-12 h-12 object-cover bg-neutral-100 border border-black/[0.05]"
                                referrerPolicy="no-referrer"
                              />
                              <div>
                                <h4 className="font-black text-black uppercase tracking-tight">{p.name}</h4>
                                <span className="text-[8px] text-gray-400 uppercase font-mono tracking-widest block select-all">REF: {p.slug.toUpperCase()}</span>
                              </div>
                            </div>
                          </td>

                          {/* LINE COLUMN */}
                          <td className="p-3">
                            <span className="text-[8px] font-black px-2 py-0.5 bg-black text-[#eab308] uppercase tracking-wider italic">
                              {p.parentSlug?.toUpperCase() || p.category?.toUpperCase() || 'ESTAMPA'}
                            </span>
                          </td>

                          {/* COLORS REGISTERED */}
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1.5 max-w-xs">
                              {p.colors?.map((clr: any) => (
                                <span 
                                  key={clr.name} 
                                  className="px-2 py-0.5 text-[8px] font-medium bg-neutral-100 uppercase text-gray-600 rounded-sm inline-flex items-center gap-1 border border-neutral-200"
                                >
                                  <span 
                                    className="w-2 h-2 rounded-full border border-black/10 inline-block" 
                                    style={{ backgroundColor: clr.hex }}
                                  />
                                  {clr.name}
                                </span>
                              )) || <span className="text-gray-300 italic text-[9px]">-</span>}
                            </div>
                          </td>

                          {/* SIZES MATRIX */}
                          <td className="p-3">
                            <div className="flex flex-col gap-2">
                              {p.colors?.map((color: any) => (
                                <div key={color.name} className="flex items-center gap-2">
                                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider w-12 truncate">{color.name}:</span>
                                  <div className="flex gap-1.5">
                                    {p.sizes?.map((size: string) => {
                                      const vKey = `${color.name}_${size}`;
                                      const currentQty = Number(inv?.variants?.[vKey]?.stock) || 0;
                                      
                                      const isCurrentSelection = selectedProduct?.slug === p.slug && selectedColor === color.name && selectedSize === size;

                                      return (
                                        <button
                                          key={size}
                                          onClick={() => {
                                            setSelectedProduct(p);
                                            setSelectedColor(color.name);
                                            setSelectedSize(size);
                                            window.scrollTo({ top: 300, behavior: 'smooth' });
                                          }}
                                          title={`Carregar ${p.name} - ${color.name} [Size ${size}]`}
                                          className={cn(
                                            "min-w-10 h-8 text-[9px] font-mono border font-black uppercase text-center flex flex-col justify-center items-center transition-all select-none",
                                            isCurrentSelection 
                                              ? "bg-[#eab308] text-black border-black scale-105 shadow-md"
                                              : currentQty === 0 
                                              ? "bg-rose-50 border-rose-100 text-rose-400 hover:border-black" 
                                              : currentQty <= 3 
                                              ? "bg-amber-50 border-amber-100 text-amber-600 hover:border-black"
                                              : "bg-white border-neutral-200 text-neutral-800 hover:border-black hover:bg-neutral-50"
                                          )}
                                        >
                                          <span className="text-[7.5px] text-gray-400 block -mt-0.5 font-sans leading-none">{size}</span>
                                          <span className="leading-none mt-0.5 font-bold font-mono">{currentQty}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* CONSOLIDATED PHYSICAL STOCK */}
                          <td className="p-3 text-right">
                            <div className="text-sm font-mono font-black text-black">
                              {totalStockOfStamp} <span className="text-[9px] text-gray-400 font-sans font-bold">Un.</span>
                            </div>
                            <span className={cn(
                              "text-[8px] font-black uppercase inline-block px-1.5 py-0.5 tracking-wider italic mt-1",
                              totalStockOfStamp === 0 
                                ? "bg-rose-100 text-rose-700 font-black border border-rose-200" 
                                : totalStockOfStamp <= 10 
                                ? "bg-amber-100 text-amber-700 font-bold border border-amber-200" 
                                : "bg-green-100 text-green-700 font-bold border border-green-200"
                            )}>
                              {totalStockOfStamp === 0 ? 'Zerado' : totalStockOfStamp <= 10 ? 'Atenção' : 'Saudável'}
                            </span>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </section>

          {/* SECÇÃO 4: HISTÓRICO REAL-TIME DE MOVIMENTAÇÃO DE ESTOQUE */}
          <section className="bg-white border border-black/[0.08] shadow-sm p-6 pr-4">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-black/[0.05] pb-4 mb-6 gap-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest italic flex items-center gap-1.5">
                  <Clock size={14} className="text-[#eab308]" /> LOG DE MOVIMENTAÇÃO & HISTÓRICO RASTREÁVEL
                </h3>
                <p className="text-[10px] text-gray-400">Auditoria cronológica em tempo real para controle do site, entradas e baixas físicas.</p>
              </div>

              {/* PERÍODO FILTER SELECTOR */}
              <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 border border-neutral-200">
                {(['all', 'today', '7days', 'month', 'custom'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setHistoryPeriod(p)}
                    className={cn(
                      "px-2.5 py-1.5 text-[8.5px] font-black uppercase tracking-wider transition-all",
                      historyPeriod === p ? "bg-black text-[#eab308]" : "text-gray-500 hover:text-black"
                    )}
                  >
                    {p === 'all' ? 'Tudo' : p === 'today' ? 'Hoje' : p === '7days' ? 'Atalhar 7D' : p === 'month' ? 'Mês' : 'Calendário'}
                  </button>
                ))}
              </div>
            </div>

            {/* EXPANDED CUSTOM DATE RANGE CONTROLLERS */}
            {historyPeriod === 'custom' && (
              <div className="grid grid-cols-2 max-w-md gap-4 bg-neutral-50 p-3 border border-black/10 text-[10px] uppercase font-bold text-neutral-600 mb-4 select-none animate-slide-in">
                <div>
                  <label className="block mb-1">Início da Data:</label>
                  <input 
                    type="date" 
                    value={startDateStr}
                    onChange={e => setStartDateStr(e.target.value)}
                    className="w-full bg-white border border-black/10 px-2 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1">Término da Data:</label>
                  <input 
                    type="date" 
                    value={endDateStr}
                    onChange={e => setEndDateStr(e.target.value)}
                    className="w-full bg-white border border-black/10 px-2 py-1.5 font-mono"
                  />
                </div>
              </div>
            )}

            {/* MOVEMENT QUICK TOOLBAR BAR */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6 select-none">
              
              <div className="md:col-span-8 relative">
                <input
                  type="text"
                  placeholder="Pesquise por produto, variação ou operador..."
                  value={historyQuery}
                  onChange={e => setHistoryQuery(e.target.value)}
                  className="w-full bg-neutral-50 border border-black/10 px-3 py-2 pr-8 text-xs focus:outline-none focus:border-[#eab308]"
                />
                <Search size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>

              <div className="md:col-span-4 select-all">
                <select
                  value={historyTypeFilter}
                  onChange={e => setHistoryTypeFilter(e.target.value as any)}
                  className="w-full bg-neutral-50 border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                >
                  <option value="all">Todas as Movimentações</option>
                  <option value="Produção">🟢 Entrada / Produção</option>
                  <option value="Venda Local">🔵 Saída / Venda Local</option>
                  <option value="Ajuste">🟡 Ajustes Manuais</option>
                </select>
              </div>

            </div>

            {/* MOVEMENT LIST GROUP */}
            <div className="space-y-2 max-h-[450px] overflow-y-auto scrollbar-none pr-1 border border-neutral-100 p-2 bg-neutral-50/50">
              
              {loadingMovements ? (
                <div className="text-center py-12 text-gray-400 font-bold uppercase text-xs">
                  Carregando logs cronológicos...
                </div>
              ) : filteredMovements.length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-bold uppercase text-[10.5px]">
                  Nenhum registro de movimentação encontrado com os filtros indicados.
                </div>
              ) : (
                filteredMovements.map((log) => {
                  let badgeColor = 'bg-gray-100 text-gray-600 border-gray-200';
                  let prefixSymbol = '•';

                  if (log.type === 'Produção') {
                    badgeColor = 'bg-green-50 text-green-700 border-green-200';
                    prefixSymbol = '➕ ENTRADA';
                  } else if (log.type === 'Venda Local') {
                    badgeColor = 'bg-[#eab308]/10 text-neutral-800 border-[#eab308]/20';
                    prefixSymbol = '➖ MOC. BAIXA';
                  } else if (log.type === 'Ajuste') {
                    badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                    prefixSymbol = '⚡ AJUSTE';
                  }

                  const dateFormatted = log.createdAt?.toDate 
                    ? log.createdAt.toDate() 
                    : new Date(log.createdAt);

                  return (
                    <div 
                      key={log.id} 
                      className="bg-white border border-black/[0.05] p-3 text-[11px] grid grid-cols-1 md:grid-cols-12 gap-2 md:items-center hover:border-black/30 transition-all shadow-xs"
                    >
                      <div className="md:col-span-3">
                        <span className="text-[8px] font-bold text-gray-400 font-mono block">DATE & TIME</span>
                        <div className="font-mono text-neutral-800 text-[10.5px] mt-0.5">
                          {dateFormatted.toLocaleDateString('pt-BR')} às {dateFormatted.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      <div className="md:col-span-2 select-all">
                        <span className="text-[8px] font-black uppercase inline-block border py-0.5 px-2 font-mono text-[8px] w-full text-center" style={{ contentVisibility: 'auto' }}>
                          <span className={cn("px-1 py-0.5 rounded-sm block font-black", badgeColor)}>
                            {prefixSymbol}
                          </span>
                        </span>
                      </div>

                      <div className="md:col-span-4">
                        <span className="text-[8px] font-bold text-gray-400 block uppercase">Peça / Grade</span>
                        <span className="font-black text-black uppercase">{log.productName}</span> — <span className="font-bold text-neutral-500 font-mono text-[10px]">{log.variantKey.replace('_', ' / ')}</span>
                      </div>

                      <div className="md:col-span-1 text-right md:text-center">
                        <span className="text-[8px] font-bold text-gray-400 block uppercase md:hidden">Volume</span>
                        <span className={cn(
                          "font-mono font-black text-xs italic",
                          log.quantity > 0 ? "text-green-600" : "text-amber-600"
                        )}>
                          {log.quantity > 0 ? `+${log.quantity}` : log.quantity}
                        </span>
                      </div>

                      <div className="md:col-span-2 text-right">
                        <span className="text-[8px] font-bold text-gray-400 block uppercase">Operador</span>
                        <span className="text-neutral-500 font-mono font-medium text-[9px] truncate block" title={log.operator}>
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
      )}

    </div>
  );
}

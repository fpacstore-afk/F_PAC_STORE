import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, onSnapshot, doc, setDoc, query, orderBy, 
  getDoc, updateDoc, deleteDoc, limit, addDoc 
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../hooks/useInventory';
import { products as staticProducts } from '../data/products';
import AdminProducts from '../pages/AdminProducts';
import { 
  Plus, Minus, Search, Database, Clock, AlertTriangle, 
  CheckCircle2, Box, Sparkles, RefreshCw, Filter, Calendar, 
  ChevronRight, ArrowRight, X, TrendingUp, TrendingDown, Eye,
  QrCode, Link as LinkIcon, Edit3, Trash2, Download, Image as ImageIcon,
  Tag, Settings, Layers, ShoppingBag, EyeOff, Check, SlidersHorizontal,
  FileText, ArrowUpDown
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

interface StampItem {
  id: string;
  name: string;
  sku?: string;
  status?: string;
  image?: string;
  imageUrl?: string;
  slotIndex?: number;
  linha?: string;
  tags?: string[];
  category?: string;
  locationConfigs?: {
    [location: string]: {
      sizes: string[];
      quantities: number[];
    };
  };
  stock?: number;
  updatedAt?: any;
}

export function AdminStockCenter() {
  const { user } = useAuth();
  const { inventory, loading: invLoading, updateVariantStock, getStock } = useInventory();

  // Admin access validation (matches the AdminOrders restriction)
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'pac@fpac.com' || localStorage.getItem('admin_bypass') === 'true';

  // Sub-tab: 'stock' (Unified Gestão de Estoque) or 'catalog' (AdminProducts CRUD manager)
  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'catalog'>('stock');

  // Core dynamic database collections
  const [products, setProducts] = useState<any[]>([]);
  const [stamps, setStamps] = useState<StampItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingStamps, setLoadingStamps] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);

  // Search & Filters of main catalog grid
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'shirts' | 'stamps' | 'products' | 'others'>('all');
  const [lineFilter, setLineFilter] = useState<'all' | 'force' | 'mark' | 'prime'>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'critical' | 'out_of_stock' | 'normal'>('all');

  // Fast Touch Launch Panel state
  const [isFastTouchCollapsed, setIsFastTouchCollapsed] = useState(true);
  const [touchProduct, setTouchProduct] = useState<any | null>(null);
  const [touchColor, setTouchColor] = useState<string>('');
  const [touchSize, setTouchSize] = useState<string>('');
  const [touchQuantity, setTouchQuantity] = useState<string>('');

  // Slide Drawer details overlay
  const [drawerItem, setDrawerItem] = useState<any | null>(null);
  const [drawerItemType, setDrawerItemType] = useState<'shirt' | 'stamp' | 'product' | null>(null);
  const [drawerActiveTab, setDrawerActiveTab] = useState<'details' | 'stock' | 'links' | 'history' | 'media'>('details');

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

  // New stamp creation modal
  const [isCreateStampModalOpen, setIsCreateStampModalOpen] = useState(false);
  const [newStampName, setNewStampName] = useState('');
  const [newStampSku, setNewStampSku] = useState('');
  const [newStampLinha, setNewStampLinha] = useState('Force');
  const [newStampImageUrl, setNewStampImageUrl] = useState('');
  const [newStampTags, setNewStampTags] = useState('');

  // Dialog states
  const [qrCodeItem, setQrCodeItem] = useState<any | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<any | null>(null);
  const [deleteConfirmType, setDeleteConfirmType] = useState<'product' | 'stamp' | null>(null);

  // Floating operation feedback
  const [confirmationFeedback, setConfirmationFeedback] = useState<{
    show: boolean;
    type: 'success' | 'error' | null;
    message: string;
    finalStock?: number;
  }>({ show: false, type: null, message: '' });

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

  // 2. Fetch real-time stamps collection
  useEffect(() => {
    setLoadingStamps(true);
    const unsubscribe = onSnapshot(collection(db, 'estampas'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StampItem));
      setStamps(list);
      setLoadingStamps(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'estampas');
    });
    return () => unsubscribe();
  }, []);

  // 3. Fetch real-time stock movements
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
          createdAt: data.createdAt,
          notes: data.notes || '',
          previousStock: data.previousStock,
          newStock: data.newStock
        } as StockMovement;
      });
      setMovements(list);
      setLoadingMovements(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stock_movements');
    });
    return () => unsubscribe();
  }, []);

  // Sync touch selection defaults when product changes
  useEffect(() => {
    if (touchProduct) {
      if (touchProduct.colors && touchProduct.colors.length > 0) {
        setTouchColor(touchProduct.colors[0].name);
      } else {
        setTouchColor('');
      }
      if (touchProduct.sizes && touchProduct.sizes.length > 0) {
        setTouchSize(touchProduct.sizes[0]);
      } else {
        setTouchSize('');
      }
      setTouchQuantity('');
    }
  }, [touchProduct]);

  // Sync drawer fields when drawer item opens
  useEffect(() => {
    if (drawerItem) {
      setEditName(drawerItem.name || '');
      setEditSku(drawerItem.sku || drawerItem.slug || '');
      setEditLine(drawerItem.linha || drawerItem.parentSlug || 'Force');
      setEditCategory(drawerItem.category || '');
      
      let mappedStatus = drawerItem.status || 'Ativa';
      if (mappedStatus === 'active') mappedStatus = 'Ativa';
      else if (mappedStatus === 'inactive') mappedStatus = 'Inativa';
      else if (mappedStatus === 'archived') mappedStatus = 'Arquivada';
      setEditStatus(mappedStatus);

      setEditPrice(String(drawerItem.price || 0));
      setEditHeadline(drawerItem.headline || '');
      setEditDesc(drawerItem.description || '');
      setEditTags(Array.isArray(drawerItem.tags) ? drawerItem.tags.join(', ') : '');
    }
  }, [drawerItem]);

  // Unified items pipeline
  const unifiedStockItems = useMemo(() => {
    const items: any[] = [];

    // 1. Basic T-Shirt Bases
    const bases = products.filter(p => p.slug === 'force' || p.slug === 'mark' || p.slug === 'prime');
    bases.forEach(b => {
      const consolidatedStock = Number(getStock(b.slug)) || 0;
      items.push({
        ...b,
        unifiedId: `shirt_${b.slug}`,
        unifiedType: 'shirt',
        sku: b.slug.toUpperCase(),
        displayCategory: 'Camisa Base',
        linha: b.slug.toUpperCase(),
        totalStock: consolidatedStock,
        status: 'Ativa',
        minStock: Number(b.minStock) || 10
      });
    });

    // 2. DTF Stamps
    stamps.forEach(st => {
      let consolidatedStock = 0;
      if (st.locationConfigs) {
        Object.values(st.locationConfigs).forEach((cfg: any) => {
          if (cfg.quantities) {
            cfg.quantities.forEach((qty: any) => {
              consolidatedStock += Number(qty) || 0;
            });
          }
        });
      } else {
        consolidatedStock = Number(st.stock) || Number(getStock(st.id)) || 0;
      }

      items.push({
        ...st,
        unifiedId: `stamp_${st.id}`,
        unifiedType: 'stamp',
        displayCategory: 'Película DTF',
        sku: st.sku || `STMP-${st.id.slice(0,6).toUpperCase()}`,
        totalStock: consolidatedStock,
        status: (st.status === 'active' || st.status === 'Ativa')
          ? 'Ativa'
          : (st.status === 'inactive' || st.status === 'Inativa')
          ? 'Inativa'
          : (st.status === 'archived' || st.status === 'Arquivada')
          ? 'Arquivada'
          : 'Ativa',
        minStock: 5
      });
    });

    // 3. Catalog Products
    const catalogProds = products.filter(p => p.slug !== 'force' && p.slug !== 'mark' && p.slug !== 'prime');
    catalogProds.forEach(p => {
      const consolidatedStock = Number(getStock(p.slug)) || 0;
      items.push({
        ...p,
        unifiedId: `product_${p.slug}`,
        unifiedType: 'product',
        sku: p.slug.toUpperCase(),
        displayCategory: p.category || 'Peça Catalogada',
        linha: p.parentSlug?.toUpperCase() || 'EXCLUSIVO',
        totalStock: consolidatedStock,
        status: p.status === 'draft' ? 'Rascunho' : 'Ativa',
        minStock: Number(p.minStock) || 3
      });
    });

    return items;
  }, [products, stamps, inventory]);

  // Master Dashboard Stats compilation
  const stats = useMemo(() => {
    let totalItems = unifiedStockItems.length;
    let baseShirtsCount = 0;
    let dtfStampsCount = 0;
    let totalStockVolume = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    unifiedStockItems.forEach(item => {
      const currentStock = Number(item.totalStock) || 0;
      totalStockVolume += currentStock;

      if (item.unifiedType === 'shirt') {
        baseShirtsCount += currentStock;
      } else if (item.unifiedType === 'stamp') {
        dtfStampsCount += currentStock;
      }

      const minStockNum = Number(item.minStock) || 0;
      if (currentStock === 0) {
        outOfStockCount++;
      } else if (currentStock <= minStockNum) {
        lowStockCount++;
      }
    });

    // Last Update time from recent logs
    let lastUpdateStr = 'Nenhum lançamento';
    if (movements.length > 0 && movements[0].createdAt) {
      const logDate = movements[0].createdAt.toDate 
        ? movements[0].createdAt.toDate() 
        : new Date(movements[0].createdAt);
      lastUpdateStr = logDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' (' + logDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ')';
    }

    return {
      totalItems,
      baseShirtsCount,
      dtfStampsCount,
      totalStockVolume,
      lowStockCount,
      outOfStockCount,
      lastUpdateStr
    };
  }, [unifiedStockItems, movements]);

  // Main list filters
  const filteredItems = useMemo(() => {
    return unifiedStockItems.filter(item => {
      // 1. Category tab filtering
      if (categoryFilter === 'shirts' && item.unifiedType !== 'shirt') return false;
      if (categoryFilter === 'stamps' && item.unifiedType !== 'stamp') return false;
      if (categoryFilter === 'products' && item.unifiedType !== 'product') return false;
      if (categoryFilter === 'others' && (item.unifiedType === 'shirt' || item.unifiedType === 'stamp' || item.unifiedType === 'product')) return false;

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

  // Fast launch action logic (Produção ou Venda Local em 3 segundos)
  const handleFastTouchAction = async (actionType: 'Produção' | 'Venda Local') => {
    if (!touchProduct || !touchColor || !touchSize) {
      toast.error('Selecione o produto, a cor e o tamanho na grade de toque!');
      playStockBeep('error');
      return;
    }

    const qtyVal = Number(touchQuantity) || 1;
    const vKey = `${touchColor}_${touchSize}`;
    const inv = inventory[touchProduct.slug];
    const currentStock = Number(inv?.variants?.[vKey]?.stock) || 0;

    if (actionType === 'Venda Local' && currentStock - qtyVal < 0) {
      toast.error(`Falha: Estoque insuficiente! Estoque físico atual: ${currentStock} un.`);
      playStockBeep('error');
      return;
    }

    try {
      const isBaseShirt = ['force', 'mark', 'prime'].includes(touchProduct.slug);
      const targets = isBaseShirt ? ['force', 'mark', 'prime'] : [touchProduct.slug];
      const delta = actionType === 'Produção' ? qtyVal : -qtyVal;
      const newStock = Math.max(0, currentStock + delta);

      for (const slug of targets) {
        const docRef = doc(db, 'inventory', slug);
        const docSnap = await getDoc(docRef);

        let currentVariants: any = {};
        let currentAvailable = true;
        if (docSnap.exists()) {
          const data = docSnap.data();
          currentVariants = data.variants || {};
          currentAvailable = data.available ?? true;
        }

        const updatedVariants = {
          ...currentVariants,
          [vKey]: {
            ...currentVariants[vKey],
            stock: newStock,
            available: newStock > 0
          }
        };

        const totalSum = Object.values(updatedVariants).reduce((sum: number, val: any) => {
          if (val.available === false) return sum;
          return sum + (Number(val.stock) || 0);
        }, 0) as number;

        await setDoc(docRef, {
          stock: totalSum,
          available: totalSum > 0 || currentAvailable,
          variants: updatedVariants,
          updatedAt: new Date()
        }, { merge: true });
      }

      // Log movement record
      const logRef = doc(collection(db, 'stock_movements'));
      await setDoc(logRef, {
        productId: touchProduct.id || '',
        productSlug: touchProduct.slug,
        productName: touchProduct.name,
        variantKey: vKey,
        quantity: delta,
        type: actionType,
        operator: user?.email || 'Administrador',
        createdAt: new Date(),
        notes: `Lançamento instantâneo via painel de toque`
      });

      playStockBeep('success');
      setConfirmationFeedback({
        show: true,
        type: 'success',
        message: `Lançamento: ${delta > 0 ? '+' : ''}${delta} un. para ${touchProduct.name} (${vKey})`,
        finalStock: newStock
      });

      toast.success('Movimentação rápida gravada com sucesso!');
      setTouchQuantity('');

      // Auto clear alert
      setTimeout(() => {
        setConfirmationFeedback(prev => ({ ...prev, show: false }));
      }, 3000);

    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao registrar alteração de estoque.');
      playStockBeep('error');
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

  // Adjust Stamp inventory locations inside Drawer
  const handleAdjustStampVariant = async (location: string, sizeIndex: number, change: number) => {
    if (!drawerItem || drawerItemType !== 'stamp') return;

    try {
      const locConfigs = { ...(drawerItem.locationConfigs || {}) };
      const cfg = locConfigs[location];
      if (!cfg) return;

      const quants = [...(cfg.quantities || [])];
      const previousValue = Number(quants[sizeIndex]) || 0;
      const targetValue = Math.max(0, previousValue + change);

      quants[sizeIndex] = targetValue;
      locConfigs[location] = {
        ...cfg,
        quantities: quants
      };

      const docRef = doc(db, 'estampas', drawerItem.id);
      await updateDoc(docRef, {
        locationConfigs: locConfigs,
        updatedAt: new Date()
      });

      // Compute total stock of this stamp across all placement configurations
      let totalStockSum = 0;
      Object.values(locConfigs).forEach((c: any) => {
        if (c.quantities) {
          c.quantities.forEach((qty: any) => {
            totalStockSum += Number(qty) || 0;
          });
        }
      });

      // Map status from Ativa/active/Inativa/inactive to standard db 'active'/'inactive'/'archived'
      let dbStatus = drawerItem.status || 'active';
      if (dbStatus === 'Ativa' || dbStatus === 'active') dbStatus = 'active';
      else if (dbStatus === 'Inativa' || dbStatus === 'inactive') dbStatus = 'inactive';
      else if (dbStatus === 'Arquivada' || dbStatus === 'archived') dbStatus = 'archived';

      await setDoc(doc(db, 'inventory', drawerItem.id), {
        stock: totalStockSum,
        available: totalStockSum > 0 && dbStatus === 'active',
        updatedAt: new Date()
      }, { merge: true });

      // Update local state copy to avoid screen lag before Snapshot fires
      setDrawerItem((prev: any) => ({
        ...prev,
        locationConfigs: locConfigs
      }));

      // Log movement to auditing
      const movRef = doc(collection(db, 'stock_movements'));
      await setDoc(movRef, {
        productId: drawerItem.id,
        productSlug: `stamp_${drawerItem.id}`,
        productName: `Estampa: "${drawerItem.name}"`,
        variantKey: `${location}_${cfg.sizes[sizeIndex] || 'U'}`,
        quantity: change,
        previousStock: previousValue,
        newStock: targetValue,
        type: 'Ajuste',
        operator: user?.email || 'Administrador',
        createdAt: new Date(),
        notes: `Ajuste na posição ${location} via gaveta de estoque`
      });

      playStockBeep('success');
      toast.success("Estoque de película alterado!");

    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao alterar estoque da estampa.");
      playStockBeep('error');
    }
  };

  // Link/unlink stamps to product
  const handleLinkStampToProduct = async (stampId: string, link: boolean) => {
    if (!drawerItem || drawerItemType !== 'product') return;

    try {
      const currentLinks: string[] = drawerItem.linkedStamps || [];
      let updatedLinks: string[] = [];

      if (link) {
        if (!currentLinks.includes(stampId)) {
          updatedLinks = [...currentLinks, stampId];
        } else {
          updatedLinks = currentLinks;
        }
      } else {
        updatedLinks = currentLinks.filter(id => id !== stampId);
      }

      const activeStamps = stamps.filter(st => updatedLinks.includes(st.id) && st.status !== 'Inativa');
      const stampWarning = activeStamps.length === 0;

      const docRef = doc(db, 'products', drawerItem.id);
      await updateDoc(docRef, {
        linkedStamps: updatedLinks,
        stampWarning,
        status: stampWarning ? 'draft' : (drawerItem.status || 'active'),
        updatedAt: new Date()
      });

      setDrawerItem((prev: any) => ({
        ...prev,
        linkedStamps: updatedLinks,
        stampWarning,
        status: stampWarning ? 'draft' : (drawerItem.status || 'active')
      }));

      playStockBeep('success');
      toast.success(link ? "Estampa vinculada!" : "Vínculo removido!");

    } catch (err: any) {
      console.error(err);
      toast.error('Erro de vínculo: ' + err.message);
    }
  };

  // Save detailed item updates in Drawer
  const handleSaveItemDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerItem || !drawerItemType) return;

    setIsSavingDetails(true);
    try {
      if (drawerItemType === 'stamp') {
        const docRef = doc(db, 'estampas', drawerItem.id);
        const tagsArr = editTags.split(',').map(t => t.trim()).filter(Boolean);
        
        let mappedDbStatus = 'active';
        if (editStatus === 'Inativa' || editStatus === 'inactive') mappedDbStatus = 'inactive';
        else if (editStatus === 'Arquivada' || editStatus === 'archived') mappedDbStatus = 'archived';

        const updatedFields: any = {
          name: editName,
          sku: editSku,
          linha: editLine,
          status: mappedDbStatus,
          category: editCategory || 'Geral',
          description: editDesc || '',
          tags: tagsArr,
          updatedAt: new Date()
        };

        if (drawerItem.image) updatedFields.image = drawerItem.image;
        if (drawerItem.imageUrl) updatedFields.imageUrl = drawerItem.imageUrl;
        if (drawerItem.image || drawerItem.imageUrl) {
          const img = drawerItem.image || drawerItem.imageUrl;
          updatedFields.image = img;
          updatedFields.imageUrl = img;
        }

        await updateDoc(docRef, updatedFields);

        // Compute total stamp stock across all positions
        let totalStockSum = 0;
        if (drawerItem.locationConfigs) {
          Object.values(drawerItem.locationConfigs).forEach((cfg: any) => {
            if (cfg.quantities) {
              cfg.quantities.forEach((qty: any) => {
                totalStockSum += Number(qty) || 0;
              });
            }
          });
        } else {
          totalStockSum = Number(drawerItem.stock) || 0;
        }

        // Align stock and availability in inventory collection
        await setDoc(doc(db, 'inventory', drawerItem.id), {
          stock: totalStockSum,
          available: totalStockSum > 0 && mappedDbStatus === 'active',
          updatedAt: new Date()
        }, { merge: true });

        setDrawerItem((prev: any) => ({ ...prev, ...updatedFields }));
        toast.success('Detalhes da estampa atualizados!');
      } else {
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
      }
      playStockBeep('success');
    } catch (err: any) {
      console.error(err);
      toast.error('Falha de atualização: ' + err.message);
      playStockBeep('error');
    } finally {
      setIsSavingDetails(false);
    }
  };

  // Delete product or stamp cleanly
  const handleDeleteItem = async () => {
    if (!deleteConfirmItem || !deleteConfirmType) return;

    try {
      if (deleteConfirmType === 'stamp') {
        const docRef = doc(db, 'estampas', deleteConfirmItem.id);
        await deleteDoc(docRef);
        toast.success('Estampa deletada com sucesso!');
      } else {
        const docRef = doc(db, 'products', deleteConfirmItem.id);
        await deleteDoc(docRef);
        toast.success('Produto deletado do catálogo!');
      }

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

  // Create new stamp
  const handleCreateStamp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStampName.trim()) {
      toast.error('Digite o nome da estampa!');
      return;
    }

    try {
      const tagsArr = newStampTags.split(',').map(t => t.trim()).filter(Boolean);
      const skuVal = newStampSku.trim() || `STMP-${newStampName.toUpperCase().slice(0,3)}-${Date.now().toString().slice(-4)}`;

      // Default empty location configs for full size inventory matrix
      const defaultConfigs = {
        "Peito Central": {
          sizes: ["A3", "A4", "A5"],
          quantities: [0, 0, 0]
        },
        "Costas": {
          sizes: ["A3", "A4"],
          quantities: [0, 0]
        },
        "Manga": {
          sizes: ["Logo Small"],
          quantities: [0]
        }
      };

      const nextIndex = stamps.length > 0 ? Math.max(...stamps.map(st => Number(st.slotIndex) || 0)) + 1 : 1;

      const docRef = await addDoc(collection(db, 'estampas'), {
        name: newStampName,
        sku: skuVal,
        linha: newStampLinha,
        image: newStampImageUrl.trim() || '/estampas/logo-fpac.png',
        imageUrl: newStampImageUrl.trim() || '/estampas/logo-fpac.png',
        status: 'active',
        category: 'Geral',
        description: '',
        tags: tagsArr,
        allowedLocations: ["Peito Central", "Costas", "Manga"],
        locationConfigs: defaultConfigs,
        slotIndex: nextIndex,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Set default inventory configuration
      await setDoc(doc(db, 'inventory', docRef.id), {
        stock: 0,
        available: false,
        updatedAt: new Date()
      });

      toast.success('Nova estampa cadastrada!');
      playStockBeep('success');
      setIsCreateStampModalOpen(false);
      setNewStampName('');
      setNewStampSku('');
      setNewStampImageUrl('');
      setNewStampTags('');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao cadastrar estampa: ' + err.message);
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
    <div className="space-y-8">
      {/* Dynamic Header */}
      <div className="bg-black text-white p-6 border border-neutral-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-widest italic flex items-center gap-2">
            <span className="text-[#eab308]"><Database size={22} className="inline-block mr-1 align-text-bottom" />GESTÃO</span> DE ESTOQUE
          </h2>
          <p className="text-[9px] text-[#eab308] font-bold uppercase tracking-widest mt-0.5">
            Módulo Único Integrado • Camisas Base, Películas DTF e Catálogo Unificado
          </p>
        </div>

        {/* Outer view chooser */}
        <div className="flex bg-neutral-900 p-1 border border-neutral-800">
          <button 
            onClick={() => setActiveSubTab('stock')}
            className={cn(
              "px-4 py-2 text-[9px] font-black uppercase tracking-wider transition-all",
              activeSubTab === 'stock' ? "bg-[#eab308] text-black shadow-lg" : "text-gray-400 hover:text-white"
            )}
          >
            📟 Controle de Estoque
          </button>
          <button 
            onClick={() => setActiveSubTab('catalog')}
            className={cn(
              "px-4 py-2 text-[9px] font-black uppercase tracking-wider transition-all",
              activeSubTab === 'catalog' ? "bg-[#eab308] text-black shadow-lg" : "text-gray-400 hover:text-white"
            )}
          >
            🗂️ Cadastro & Catálogo
          </button>
        </div>
      </div>

      {activeSubTab === 'catalog' ? (
        <div className="border border-neutral-200 p-2 bg-neutral-50 rounded-xs">
          <div className="bg-amber-50 text-amber-800 p-3 text-[10px] uppercase tracking-widest font-black border-l-4 border-amber-500 mb-4 flex justify-between items-center">
            <span>ADMINISTRAÇÃO DO CATÁLOGO: CADASTRO DE PEÇAS COMPLETAS E UPLOAD DE FOTOS</span>
            <button 
              onClick={() => setActiveSubTab('stock')} 
              className="underline text-black text-[9px] hover:text-[#eab308]"
            >
              Voltar ao Controle de Estoque →
            </button>
          </div>
          <AdminProducts isEmbedded={true} />
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">

          {/* SECTION 1: CONSOLIDATED SUPERIOR DASHBOARD */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-black/[0.08] p-4 flex flex-col justify-between shadow-sm hover:border-black/30 transition-all">
              <div className="flex justify-between items-start text-gray-400">
                <span className="text-[8px] font-mono font-black uppercase tracking-widest">ESTOQUE GERAL</span>
                <Box size={14} className="text-black" />
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono tracking-tighter text-black">{stats.totalStockVolume}</span>
                <span className="text-[9px] font-bold text-gray-400">UN.</span>
              </div>
              <p className="text-[8px] mt-1 text-gray-400 uppercase font-bold">Volume consolidado total</p>
            </div>

            <div className="bg-white border border-black/[0.08] p-4 flex flex-col justify-between shadow-sm hover:border-black/30 transition-all">
              <div className="flex justify-between items-start text-emerald-600">
                <span className="text-[8px] font-mono font-black uppercase tracking-widest">TECIDOS (BASES)</span>
                <ShoppingBag size={14} />
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono tracking-tighter text-emerald-600">{stats.baseShirtsCount}</span>
                <span className="text-[9px] font-bold text-emerald-500">UN.</span>
              </div>
              <p className="text-[8px] mt-1 text-gray-400 uppercase font-bold">Camisas Force/Mark/Prime</p>
            </div>

            <div className="bg-white border border-black/[0.08] p-4 flex flex-col justify-between shadow-sm hover:border-black/30 transition-all">
              <div className="flex justify-between items-start text-amber-600">
                <span className="text-[8px] font-mono font-black uppercase tracking-widest">PELÍCULAS (DTF)</span>
                <Sparkles size={14} />
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono tracking-tighter text-amber-600">{stats.dtfStampsCount}</span>
                <span className="text-[9px] font-bold text-amber-500">UN.</span>
              </div>
              <p className="text-[8px] mt-1 text-gray-400 uppercase font-bold">Filmes de estampas prontos</p>
            </div>

            <button 
              onClick={() => {
                setStockStatusFilter('critical');
                document.getElementById('inventory-list-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-amber-50 border border-amber-200 p-4 flex flex-col justify-between text-left hover:bg-amber-100/50 transition-all cursor-pointer"
            >
              <div className="flex justify-between items-start text-amber-700">
                <span className="text-[8px] font-mono font-black uppercase tracking-widest">ESTOQUE CRÍTICO</span>
                <AlertTriangle size={14} />
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono tracking-tighter text-amber-700">{stats.lowStockCount}</span>
                <span className="text-[9px] font-bold text-amber-600">ITENS</span>
              </div>
              <p className="text-[8px] mt-1 text-amber-600 uppercase font-bold">Abaixo do estoque mínimo</p>
            </button>

            <button 
              onClick={() => {
                setStockStatusFilter('out_of_stock');
                document.getElementById('inventory-list-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-rose-50 border border-rose-200 p-4 flex flex-col justify-between text-left hover:bg-rose-100/50 transition-all cursor-pointer"
            >
              <div className="flex justify-between items-start text-rose-700">
                <span className="text-[8px] font-mono font-black uppercase tracking-widest">ZERADOS / OUT OF STOCK</span>
                <EyeOff size={14} />
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono tracking-tighter text-rose-700">{stats.outOfStockCount}</span>
                <span className="text-[9px] font-bold text-rose-600">ITENS</span>
              </div>
              <p className="text-[8px] mt-1 text-rose-600 uppercase font-bold">Falta total de unidades</p>
            </button>
          </section>

          {/* LAST UPDATE NOTIFIER */}
          <div className="bg-neutral-50 border border-black/[0.05] p-3 text-[10px] flex items-center justify-between text-neutral-500 uppercase font-bold">
            <span className="flex items-center gap-1.5"><Clock size={12} className="text-gray-400" />ÚLTIMA MOVIMENTAÇÃO DE ESTOQUE REGISTRADA NO SITE: <span className="font-mono text-black">{stats.lastUpdateStr}</span></span>
            <span className="text-[8px] text-emerald-600 font-black">● SISTEMA ATIVO & SINCRONIZADO EM TEMPO REAL</span>
          </div>

          {/* SECTION 2: FAST TOUCH LAUNCH TABLET PANEL */}
          <section className="bg-white border border-black/[0.08] shadow-sm">
            <button 
              onClick={() => setIsFastTouchCollapsed(!isFastTouchCollapsed)}
              className="w-full flex justify-between items-center p-4 bg-neutral-50 hover:bg-neutral-100/50 border-b border-black/[0.05] transition-all select-none"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-[#eab308]" />
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest italic text-neutral-800">PAINEL DE LANÇAMENTO INSTANTÂNEO (TABLET WORKFLOW)</h3>
                  <p className="text-[8.5px] text-gray-400 uppercase font-bold">Movimente entradas ou saídas locais físicas de peças e grades em 3 segundos</p>
                </div>
              </div>
              <div className="px-2 py-1 text-[8px] font-black uppercase border border-neutral-300 rounded-xs bg-white text-gray-500">
                {isFastTouchCollapsed ? 'Expandir Painel ↓' : 'Ocultar Painel ↑'}
              </div>
            </button>

            {!isFastTouchCollapsed && (
              <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 animate-slide-down">
                {/* Product chooser column */}
                <div className="md:col-span-4 space-y-3">
                  <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">1. Selecione o Modelo ou Tecido</label>
                  <div className="max-h-[220px] overflow-y-auto border border-black/10 divide-y divide-black/5">
                    {products.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setTouchProduct(p)}
                        className={cn(
                          "w-full text-left p-2.5 text-[10.5px] uppercase font-bold tracking-tight transition-all flex justify-between items-center",
                          touchProduct?.id === p.id ? "bg-[#eab308] text-black" : "hover:bg-neutral-50 bg-white text-gray-700"
                        )}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="font-mono text-[8px] text-gray-400 shrink-0 ml-1">SKU: {p.slug.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color + Size Grid column */}
                <div className="md:col-span-5 space-y-4">
                  {touchProduct ? (
                    <>
                      {/* Color list */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">2. Escolha a Var/Cor</span>
                        <div className="flex flex-wrap gap-1.5">
                          {touchProduct.colors?.map((c: any) => (
                            <button
                              key={c.name}
                              onClick={() => setTouchColor(c.name)}
                              className={cn(
                                "px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider border rounded-xs transition-all flex items-center gap-1.5",
                                touchColor === c.name ? "bg-black text-[#eab308] border-black scale-105" : "bg-white border-neutral-200 text-neutral-800 hover:border-black"
                              )}
                            >
                              <span className="w-2.5 h-2.5 rounded-full border border-black/10 inline-block shrink-0" style={{ backgroundColor: c.hex }} />
                              {c.name}
                            </button>
                          )) || <span className="text-[10px] text-gray-400 italic">Nenhuma cor cadastrada</span>}
                        </div>
                      </div>

                      {/* Size grid list */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">3. Grade de Tamanho</span>
                        <div className="flex flex-wrap gap-1.5">
                          {touchProduct.sizes?.map((size: string) => {
                            const invKey = `${touchColor}_${size}`;
                            const availableStock = inventory[touchProduct.slug]?.variants?.[invKey]?.stock ?? 0;
                            return (
                              <button
                                key={size}
                                onClick={() => setTouchSize(size)}
                                className={cn(
                                  "min-w-12 h-10 text-[9px] font-mono border rounded-xs transition-all flex flex-col items-center justify-center font-black",
                                  touchSize === size 
                                    ? "bg-[#eab308] text-black border-black scale-105 shadow-md"
                                    : "bg-white border-neutral-200 text-neutral-800 hover:border-black"
                                )}
                              >
                                <span className="text-[7.5px] text-gray-400">{size}</span>
                                <span className="leading-none mt-0.5">{availableStock} un</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center border border-dashed border-neutral-200 text-gray-400 text-[10px] uppercase font-bold text-center p-6">
                      Selecione um produto ao lado para liberar a grade de cor e tamanho
                    </div>
                  )}
                </div>

                {/* Operations & actions column */}
                <div className="md:col-span-3 space-y-4 bg-neutral-50/50 p-4 border border-black/5 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-2">4. Quantidade e Registro</span>
                    <input 
                      type="number" 
                      placeholder="Volume (Padrão: 1)" 
                      value={touchQuantity}
                      onChange={e => setTouchQuantity(e.target.value)}
                      className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-mono mb-4 focus:outline-none focus:border-[#eab308]"
                    />

                    {touchProduct && touchColor && touchSize && (
                      <div className="p-2 border border-black/5 bg-white mb-2 text-[10px] uppercase font-bold space-y-1">
                        <div className="text-gray-400">Selecionado:</div>
                        <div className="text-black truncate">{touchProduct.name}</div>
                        <div className="font-mono text-[#eab308] bg-black px-1.5 py-0.5 inline-block text-[8px] tracking-wider rounded-xs mt-1">
                          {touchColor} — {touchSize}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={() => handleFastTouchAction('Produção')}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase py-3 px-1 transition-all flex flex-col items-center justify-center gap-1 active:scale-95"
                    >
                      <Plus size={14} />
                      + PRODUZIR
                    </button>
                    <button
                      onClick={() => handleFastTouchAction('Venda Local')}
                      className="w-full bg-black hover:bg-neutral-800 text-[#eab308] text-[9px] font-black uppercase py-3 px-1 transition-all flex flex-col items-center justify-center gap-1 active:scale-95"
                    >
                      <Minus size={14} />
                      - BAIXA LOCAL
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* FLOATING SUCCESS MESSAGE BOX */}
          <AnimatePresence>
            {confirmationFeedback.show && (
              <motion.div 
                key="stock-confirmation-feedback"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-black text-white p-4 border border-[#eab308] shadow-2xl flex items-center justify-between select-none"
              >
                <div className="flex items-center gap-3">
                  <span className="p-1 bg-[#eab308] text-black text-xs font-black rounded-xs">ESTOQUE</span>
                  <span className="text-xs uppercase font-bold">{confirmationFeedback.message}</span>
                </div>
                {confirmationFeedback.finalStock !== undefined && (
                  <span className="font-mono text-xs text-[#eab308] font-black uppercase">SALDO ATUAL: {confirmationFeedback.finalStock} UN</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

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
                  onClick={() => setIsCreateStampModalOpen(true)}
                  className="bg-black text-[#eab308] text-[9px] font-black uppercase tracking-widest px-4 py-2.5 transition-all flex items-center gap-1.5 hover:bg-neutral-800"
                >
                  <Plus size={12} /> CADASTRAR PELÍCULA (DTF)
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
                  <option value="stamps">🎞️ Películas de Estampas (DTF)</option>
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
                  {invLoading || loadingProducts || loadingStamps ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-gray-400 uppercase font-black text-xs animate-pulse">
                        Sincronizando banco de dados de estoque...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-gray-400 uppercase font-black text-[10px] italic select-none">
                        Nenhum produto ou película atende aos filtros indicados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(item => {
                      const isLow = item.totalStock <= item.minStock;
                      const isOut = item.totalStock === 0;

                      return (
                        <tr 
                          key={`${item.unifiedId}-table`} 
                          className="hover:bg-neutral-50/50 transition-all cursor-pointer group"
                          onClick={() => {
                            setDrawerItem(item);
                            setDrawerItemType(item.unifiedType);
                            setDrawerActiveTab('details');
                          }}
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
                                <h4 className="text-[11.5px] font-black text-black uppercase tracking-tight leading-snug group-hover:text-[#eab308] transition-colors">{item.name}</h4>
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
                              {/* Stock Adjust button */}
                              <button
                                title="Ajustar Estoque"
                                onClick={() => {
                                  setDrawerItem(item);
                                  setDrawerItemType(item.unifiedType);
                                  setDrawerActiveTab('stock');
                                }}
                                className="p-2 hover:bg-neutral-100 hover:text-black text-gray-400 transition-colors border border-transparent hover:border-neutral-200"
                              >
                                <SlidersHorizontal size={13} />
                              </button>

                              {/* Stamp Link button */}
                              {item.unifiedType === 'product' && (
                                <button
                                  title="Estampas Vinculadas"
                                  onClick={() => {
                                    setDrawerItem(item);
                                    setDrawerItemType(item.unifiedType);
                                    setDrawerActiveTab('links');
                                  }}
                                  className="p-2 hover:bg-neutral-100 hover:text-[#eab308] text-gray-400 transition-colors border border-transparent hover:border-neutral-200"
                                >
                                  <LinkIcon size={13} />
                                </button>
                              )}

                              {/* QR Code generator */}
                              <button
                                title="Gerar QR Code"
                                onClick={() => setQrCodeItem(item)}
                                className="p-2 hover:bg-neutral-100 hover:text-[#eab308] text-gray-400 transition-colors border border-transparent hover:border-neutral-200"
                              >
                                <QrCode size={13} />
                              </button>

                              {/* Delete button */}
                              <button
                                title="Excluir do Banco"
                                onClick={() => {
                                  setDeleteConfirmItem(item);
                                  setDeleteConfirmType(item.unifiedType === 'stamp' ? 'stamp' : 'product');
                                }}
                                className="p-2 hover:bg-rose-50 hover:text-rose-600 text-gray-300 transition-colors border border-transparent hover:border-rose-100"
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
              {invLoading || loadingProducts || loadingStamps ? (
                <div className="p-12 text-center text-gray-400 uppercase font-black text-xs animate-pulse">
                  Sincronizando banco de dados de estoque...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-12 text-center text-gray-400 uppercase font-black text-[10px] italic select-none">
                  Nenhum produto ou película atende aos filtros indicados.
                </div>
              ) : (
                filteredItems.map(item => {
                  const isLow = item.totalStock <= item.minStock;
                  const isOut = item.totalStock === 0;

                  return (
                    <div 
                      key={`${item.unifiedId}-mobile`} 
                      className="p-4 hover:bg-neutral-50/50 transition-all cursor-pointer active:bg-neutral-100 flex flex-col gap-3"
                      onClick={() => {
                        setDrawerItem(item);
                        setDrawerItemType(item.unifiedType);
                        setDrawerActiveTab('details');
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <img 
                          src={getItemImage(item)} 
                          alt={item.name} 
                          className="w-12 h-12 object-cover bg-neutral-100 border border-black/[0.05] shadow-xs shrink-0 rounded-xs"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-black text-black uppercase tracking-tight leading-snug truncate">{item.name}</h4>
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
                          onClick={() => {
                            setDrawerItem(item);
                            setDrawerItemType(item.unifiedType);
                            setDrawerActiveTab('stock');
                          }}
                          className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-black text-[9px] font-black uppercase flex items-center gap-1 border border-neutral-200 rounded-xs"
                        >
                          <SlidersHorizontal size={11} /> Grade
                        </button>
                        {item.unifiedType === 'product' && (
                          <button
                            onClick={() => {
                              setDrawerItem(item);
                              setDrawerItemType(item.unifiedType);
                              setDrawerActiveTab('links');
                            }}
                            className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-black text-[9px] font-black uppercase flex items-center gap-1 border border-neutral-200 rounded-xs"
                          >
                            <LinkIcon size={11} /> Vínculos
                          </button>
                        )}
                        <button
                          onClick={() => setQrCodeItem(item)}
                          className="px-2.5 py-1.5 bg-neutral-100 hover:bg-[#eab308] hover:text-black text-gray-600 text-[9px] font-black uppercase border border-neutral-200 rounded-xs"
                        >
                          <QrCode size={11} />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteConfirmItem(item);
                            setDeleteConfirmType(item.unifiedType === 'stamp' ? 'stamp' : 'product');
                          }}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[9px] font-black uppercase border border-rose-100 rounded-xs"
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
      )}

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
                {drawerItemType === 'product' && (
                  <button
                    type="button"
                    onClick={() => setDrawerActiveTab('links')}
                    className={cn(
                      "px-3 sm:px-4 py-2.5 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-wider sm:tracking-widest border-b-2 transition-all shrink-0",
                      drawerActiveTab === 'links' ? "border-[#eab308] text-black bg-white" : "border-transparent text-gray-400 hover:text-black"
                    )}
                  >
                    🔗 Vínculos DTF
                  </button>
                )}
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

                      {drawerItemType === 'stamp' ? (
                        <>
                          <div>
                            <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Categoria da Estampa</label>
                            <input 
                              type="text"
                              value={editCategory}
                              onChange={e => setEditCategory(e.target.value)}
                              className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                            />
                          </div>

                          <div className="col-span-1 sm:col-span-2">
                            <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Descrição da Estampa</label>
                            <textarea 
                              rows={3}
                              value={editDesc}
                              onChange={e => setEditDesc(e.target.value)}
                              className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]"
                            />
                          </div>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}

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
                          {drawerItemType === 'product' && <option value="Rascunho">Rascunho (Bloqueado)</option>}
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
                    {drawerItemType !== 'stamp' ? (
                      // Products / Shirts variants grid
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
                    ) : (
                      // Stamps locations stock adjustments
                      <div className="space-y-4">
                        <div className="bg-amber-50 text-amber-900 border border-amber-200/50 p-3 text-[10px] uppercase font-bold tracking-tight">
                          📋 Ajuste do estoque físico de películas prontas DTF por tamanho de filme e localização de impressão
                        </div>

                        {drawerItem.locationConfigs && Object.entries(drawerItem.locationConfigs).map(([locName, cfg]: [string, any]) => (
                          <div key={locName} className="border border-neutral-200 p-4 bg-neutral-50/50 space-y-3">
                            <span className="text-[9px] font-black tracking-widest text-black uppercase block border-b border-neutral-200 pb-1.5">
                              {locName}
                            </span>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {cfg.sizes?.map((size: string, sIndex: number) => {
                                const currentQty = Number(cfg.quantities?.[sIndex]) || 0;
                                return (
                                  <div key={size} className="bg-white border border-neutral-200 p-3 flex justify-between items-center rounded-xs">
                                    <div>
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">Tamanho {size}</span>
                                      <div className="font-mono text-xs font-black text-black mt-0.5">{currentQty} Un.</div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <button 
                                        onClick={() => handleAdjustStampVariant(locName, sIndex, -1)}
                                        className="w-8 h-8 bg-neutral-100 hover:bg-neutral-200 text-black text-xs font-bold flex justify-center items-center"
                                      >
                                        -
                                      </button>
                                      <button 
                                        onClick={() => handleAdjustStampVariant(locName, sIndex, 1)}
                                        className="w-8 h-8 bg-black text-[#eab308] hover:bg-neutral-800 text-xs font-bold flex justify-center items-center"
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
                    )}
                  </div>
                )}

                {/* TAB 3: STAMP BINDING PANEL */}
                {drawerActiveTab === 'links' && drawerItemType === 'product' && (
                  <div className="space-y-4">
                    <div className="bg-neutral-50 p-3 border border-black/5 text-[9px] uppercase font-bold text-gray-400">
                      🚨 ATENÇÃO: Peças comercializadas sem estampas vinculadas válidas serão salvas como rascunho por segurança.
                    </div>

                    <div className="space-y-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Pesquise e Vincule Estampas</span>
                      <div className="border border-black/10 divide-y divide-black/5 max-h-[300px] overflow-y-auto bg-white">
                        {stamps.map(st => {
                          const isLinked = (drawerItem.linkedStamps || []).includes(st.id);
                          return (
                            <div key={st.id} className="p-3 flex justify-between items-center hover:bg-neutral-50 transition-all">
                              <div className="flex items-center gap-3">
                                <img 
                                  src={st.imageUrl || '/estampas/logo-fpac.png'} 
                                  alt={st.name} 
                                  className="w-10 h-10 object-cover bg-neutral-100 border border-black/5"
                                  referrerPolicy="no-referrer"
                                />
                                <div>
                                  <span className="text-[11px] font-black uppercase text-black leading-tight block">{st.name}</span>
                                  <span className="text-[8px] text-gray-400 font-mono">SKU: {st.sku}</span>
                                </div>
                              </div>

                              <button
                                onClick={() => handleLinkStampToProduct(st.id, !isLinked)}
                                className={cn(
                                  "px-3 py-1.5 text-[8.5px] font-black uppercase tracking-wider rounded-xs transition-all",
                                  isLinked 
                                    ? "bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100" 
                                    : "bg-black text-[#eab308] hover:bg-neutral-800"
                                )}
                              >
                                {isLinked ? 'Desvincular' : 'Vincular'}
                              </button>
                            </div>
                          );
                        })}
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

      {/* ========================================================================= */}
      {/* 8. MODAL DE CADASTRO DE NOVA ESTAMPA (DTF) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isCreateStampModalOpen && (
          <motion.div 
            key="create-stamp-modal-wrapper"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              key="create-stamp-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateStampModalOpen(false)}
              className="absolute inset-0 bg-black"
            />
            <motion.div 
              key="create-stamp-modal-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-neutral-300 w-full max-w-md p-6 relative z-10 space-y-4"
            >
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="font-black text-black uppercase tracking-widest text-xs flex items-center gap-1.5">
                  <Plus className="text-[#eab308]" size={16} /> NOVO CADASTRO DE PELÍCULA (DTF)
                </h3>
                <button onClick={() => setIsCreateStampModalOpen(false)} className="text-gray-400 hover:text-black">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateStamp} className="space-y-4 text-left">
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Nome Comercial da Estampa</label>
                  <input 
                    type="text"
                    required
                    value={newStampName}
                    onChange={e => setNewStampName(e.target.value)}
                    placeholder="EX: LOGO CLASSIC GLITCH"
                    className="w-full bg-neutral-50 border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Código SKU Personalizado (Opcional)</label>
                    <input 
                      type="text"
                      value={newStampSku}
                      onChange={e => setNewStampSku(e.target.value)}
                      placeholder="EX: STMP-CLASSIC"
                      className="w-full bg-neutral-50 border border-black/10 px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:border-[#eab308]"
                    />
                  </div>

                  <div>
                    <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Linha Recomendada</label>
                    <select
                      value={newStampLinha}
                      onChange={e => setNewStampLinha(e.target.value)}
                      className="w-full bg-neutral-50 border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                    >
                      <option value="Force">Force (Oversized)</option>
                      <option value="Mark">Mark (Streetwear)</option>
                      <option value="Prime">Prime (Casual)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">URL da Imagem da Arte (PNG/JPG)</label>
                  <input 
                    type="text"
                    value={newStampImageUrl}
                    onChange={e => setNewStampImageUrl(e.target.value)}
                    placeholder="EX: https://..."
                    className="w-full bg-neutral-50 border border-black/10 px-3 py-2 text-xs focus:outline-none focus:border-[#eab308]"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1">Tags de Busca (separados por vírgula)</label>
                  <input 
                    type="text"
                    value={newStampTags}
                    onChange={e => setNewStampTags(e.target.value)}
                    placeholder="EX: vintage, rock, f pac original"
                    className="w-full bg-neutral-50 border border-black/10 px-3 py-2 text-xs focus:outline-none focus:border-[#eab308]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-black text-[#eab308] text-[10px] font-black uppercase tracking-widest py-3 mt-2 transition-all hover:bg-neutral-800"
                >
                  CADASTRAR E SINCRONIZAR
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

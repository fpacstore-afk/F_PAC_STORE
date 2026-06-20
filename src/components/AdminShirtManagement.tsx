import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { products as staticProducts } from '../data/products';
import { 
  Plus, Minus, Search, Shield, Clock, AlertTriangle, 
  CheckCircle2, Layers, RefreshCw, Filter, Calendar, 
  ChevronRight, ArrowRight, X, Eye, EyeOff, Layout, ListCollapse,
  Loader2, TrendingUp, Dumbbell, Sparkles, Check, ToggleLeft, ToggleRight, FileText, Settings, Link as LinkIcon
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
  previousStock: number;
  newStock: number;
  type: string; // 'Entrada', 'Saída', 'Ajuste', 'Venda Local'
  operator: string;
  createdAt: any;
  notes?: string;
}

export function AdminShirtManagement() {
  const { user } = useAuth();
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'fpacstore@gmail.com'; // match admin access

  // Pages/Tabs: 'dashboard' | 'shirts' | 'stamps' | 'links' | 'audit'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'shirts' | 'stamps' | 'links' | 'audit'>('dashboard');

  // Database lists
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any>({});
  const [stamps, setStamps] = useState<any[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  
  // Loading indicators
  const [loading, setLoading] = useState(true);

  // Filter/Search variables
  const [shirtSearch, setShirtSearch] = useState('');
  const [shirtModelFilter, setShirtModelFilter] = useState<'all' | 'force' | 'mark' | 'prime'>('all');
  
  const [stampSearch, setStampSearch] = useState('');
  const [stampCategoryFilter, setStampCategoryFilter] = useState('all');

  const [auditSearch, setAuditSearch] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState('all');

  // Detail Modal / Adjust State
  const [adjustingItem, setAdjustingItem] = useState<{
    id: string;
    slug: string;
    name: string;
    color: string;
    size: string;
    variantKey: string;
    stock: number;
  } | null>(null);
  const [adjustAction, setAdjustAction] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustQtyInput, setAdjustQtyInput] = useState<number>(1);
  const [adjustNotes, setAdjustNotes] = useState<string>('');

  // Audio helper for adjustments
  const playBeep = (type: 'success' | 'error') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'success') {
        osc.frequency.setValueAtTime(900, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.09, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // Audio autoplay block bypassed
    }
  };

  // Sync Products & Inventory (Realtime)
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const dbProds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const merged = staticProducts.map(staticP => {
        const dbP = dbProds.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        return dbP ? { ...staticP, ...dbP } : staticP;
      });
      dbProds.forEach((dbP: any) => {
        if (!staticProducts.some(sp => sp.id === dbP.id || sp.slug === dbP.slug)) {
          merged.push(dbP);
        }
      });
      setProducts(merged);
    });

    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      const invMap: any = {};
      snapshot.forEach((doc) => {
        invMap[doc.id] = doc.data();
      });
      setInventory(invMap);
    });

    const unsubStamps = onSnapshot(collection(db, 'estampas'), (snapshot) => {
      const sList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStamps(sList);
    });

    const unsubMovements = onSnapshot(
      query(collection(db, 'stock_movements'), orderBy('createdAt', 'desc'), limit(150)),
      (snapshot) => {
        const mList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockMovement));
        setMovements(mList);
        setLoading(false);
      },
      (error) => {
        console.error("Movements feed errored:", error);
        setLoading(false);
      }
    );

    return () => {
      unsubProducts();
      unsubInventory();
      unsubStamps();
      unsubMovements();
    };
  }, []);

  // Compute stats metrics
  const stats = useMemo(() => {
    let totalShirts = 0;
    let lowShirtsCount = 0;
    let outShirtsCount = 0;

    // We check models (FORCE, MARK, PRIME)
    const shirtModelsList = ['force', 'mark', 'prime'];
    const lowStockItemsList: any[] = [];
    const outStockItemsList: any[] = [];

    shirtModelsList.forEach(slug => {
      const staticItem = staticProducts.find(p => p.slug === slug);
      if (!staticItem) return;

      const colors = staticItem.colors || [];
      const sizes = staticItem.sizes || [];
      const parentInv = inventory[slug] || {};
      const childVariants = parentInv.variants || {};

      colors.forEach(col => {
        sizes.forEach(sz => {
          const vKey = `${col.name}_${sz}`;
          const currentVar = childVariants[vKey];
          const stock = currentVar ? (Number(currentVar.stock) || 0) : 0;
          totalShirts += stock;

          const active = currentVar ? (currentVar.available !== false) : true;
          if (active) {
            if (stock === 0) {
              outShirtsCount++;
              outStockItemsList.push({
                type: 'Camiseta',
                name: `${staticItem.name} (${col.name} - ${sz})`,
                slug,
                variantKey: vKey,
                stock: 0
              });
            } else if (stock <= 3) {
              lowShirtsCount++;
              lowStockItemsList.push({
                type: 'Camiseta',
                name: `${staticItem.name} (${col.name} - ${sz})`,
                slug,
                variantKey: vKey,
                stock
              });
            }
          }
        });
      });
    });

    // Compute Prints stocks
    let totalStampsEst = 0;
    stamps.forEach(st => {
      const locs = st.locationConfigs || {};
      Object.keys(locs).forEach(pos => {
        const config = locs[pos] || {};
        const qts = config.quantities || [];
        const szs = config.sizes || [];
        qts.forEach((qty: number, idx: number) => {
          totalStampsEst += Number(qty) || 0;
          const numQty = Number(qty) || 0;
          const sizeName = szs[idx] || 'U';
          const active = st.status !== 'Inativa';
          if (active) {
            if (numQty === 0) {
              outStockItemsList.push({
                type: 'Estampa',
                name: `"${st.name}" na posição ${pos} (${sizeName})`,
                id: st.id,
                pos,
                sizeIndex: idx,
                stock: 0
              });
            } else if (numQty <= 5) {
              lowStockItemsList.push({
                type: 'Estampa',
                name: `"${st.name}" na posição ${pos} (${sizeName})`,
                id: st.id,
                pos,
                sizeIndex: idx,
                stock: numQty
              });
            }
          }
        });
      });
    });

    return {
      totalShirts,
      totalStampsEst,
      lowStockCount: lowStockItemsList.length,
      outStockCount: outStockItemsList.length,
      lowStockItemsList: lowStockItemsList.slice(0, 10),
      outStockItemsList: outStockItemsList.slice(0, 10)
    };
  }, [inventory, stamps]);

  // Shirt variants formatting
  const shirtVariants = useMemo(() => {
    const list: any[] = [];
    const targets = ['force', 'mark', 'prime'];

    targets.forEach(slug => {
      const prod = products.find(p => p.slug === slug);
      if (!prod) return;

      const colors = prod.colors || [];
      const sizes = prod.sizes || [];
      const invItem = inventory[slug] || {};
      const vars = invItem.variants || {};

      colors.forEach((col: any) => {
        sizes.forEach((sz: string) => {
          const vKey = `${col.name}_${sz}`;
          const currentVar = vars[vKey] || {};
          const rawStock = currentVar.stock;
          const currentStock = (rawStock !== undefined && rawStock !== null && !isNaN(Number(rawStock))) ? Number(rawStock) : 0;
          const available = currentVar.available !== false;

          list.push({
            id: prod.id,
            slug: prod.slug,
            name: prod.name,
            color: col.name,
            colorHex: col.hex,
            size: sz,
            variantKey: vKey,
            stock: currentStock,
            available
          });
        });
      });
    });

    // Filtering
    return list.filter(item => {
      if (shirtModelFilter !== 'all' && item.slug !== shirtModelFilter) return false;
      if (shirtSearch.trim()) {
        const term = shirtSearch.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(term);
        const matchesCol = item.color.toLowerCase().includes(term);
        const matchesSize = item.size.toLowerCase().includes(term);
        if (!matchesName && !matchesCol && !matchesSize) return false;
      }
      return true;
    });
  }, [products, inventory, shirtSearch, shirtModelFilter]);

  // Handle Quick Shirt Adjustment Save
  const saveShirtAdjustment = async () => {
    if (!adjustingItem) return;
    const { slug, variantKey } = adjustingItem;

    if (adjustQtyInput < 1 && adjustAction !== 'set') {
      toast.error("Por favor, informe uma quantidade válida maior que zero.");
      return;
    }

    try {
      const SHIRT_SLUGS = ['force', 'mark', 'prime'];
      const targets = SHIRT_SLUGS.includes(slug) ? SHIRT_SLUGS : [slug];

      const currentStock = Number(adjustingItem.stock) ?? 0;
      let newStock = currentStock;
      let movType = 'Ajuste';

      if (adjustAction === 'add') {
        newStock = currentStock + adjustQtyInput;
        movType = 'Entrada';
      } else if (adjustAction === 'subtract') {
        newStock = Math.max(0, currentStock - adjustQtyInput);
        movType = 'Saída';
      } else {
        newStock = Math.max(0, adjustQtyInput);
        movType = 'Ajuste';
      }

      for (const targetSlug of targets) {
        const targetRef = doc(db, 'inventory', targetSlug);
        const targetSnap = await getDoc(targetRef);
        
        let targetVariants: any = {};
        let targetRootAvailable = true;
        if (targetSnap.exists()) {
          const d = targetSnap.data();
          targetVariants = d.variants || {};
          targetRootAvailable = d.available ?? true;
        }

        const tempVariants = {
          ...targetVariants,
          [variantKey]: {
            stock: newStock,
            available: newStock > 0
          }
        };

        const totalStock: number = (Object.values(tempVariants) as any[]).reduce((sum: number, v: any) => {
          if (v.available === false) return sum;
          const val = Number(v.stock);
          return sum + (isNaN(val) ? 0 : val);
        }, 0);

        await setDoc(targetRef, {
          stock: totalStock,
          available: totalStock > 0 || targetRootAvailable,
          variants: tempVariants,
          updatedAt: new Date()
        }, { merge: true });
      }

      // Log transaction movement
      const movRef = doc(collection(db, 'stock_movements'));
      await setDoc(movRef, {
        productId: adjustingItem.id || '',
        productSlug: slug || '',
        productName: `Camiseta ${adjustingItem.name || ''}`,
        variantKey: variantKey,
        quantity: movType === 'Saída' ? -Math.abs(newStock - currentStock) : (newStock - currentStock),
        previousStock: currentStock,
        newStock,
        type: movType,
        operator: user?.email || 'Admin',
        createdAt: new Date(),
        notes: adjustNotes || 'Ajuste manual administrativo (Sincronizado)'
      });

      playBeep('success');
      toast.success("Estoque ajustado e log auditado com sucesso!");
      setAdjustingItem(null);
      setAdjustQtyInput(1);
      setAdjustNotes('');
    } catch (err: any) {
      playBeep('error');
      console.error(err);
      toast.error(`Erro ao atualizar estoque: ${err.message}`);
    }
  };

  // Stamp Action Handler: Status toggle
  const toggleStampStatus = async (stampId: string, currentStatus: string) => {
    try {
      const stampRef = doc(db, 'estampas', stampId);
      const newStatus = currentStatus === 'Ativa' ? 'Inativa' : 'Ativa';
      await updateDoc(stampRef, {
        status: newStatus,
        updatedAt: new Date()
      });
      playBeep('success');
      toast.success(`Estampa definida como ${newStatus}!`);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao alterar status da estampa.");
    }
  };

  // Stamp Edit Stock Units (Adjust location quantity)
  const adjustStampStock = async (stamp: any, location: string, sizeIndex: number, currentQty: number, change: number) => {
    try {
      const newQty = Math.max(0, currentQty + change);
      const locConfigs = { ...(stamp.locationConfigs || {}) };
      const cfg = locConfigs[location];
      if (!cfg) return;

      const quants = [...(cfg.quantities || [])];
      quants[sizeIndex] = newQty;

      locConfigs[location] = {
        ...cfg,
        quantities: quants
      };

      const stampDocRef = doc(db, 'estampas', stamp.id);
      await updateDoc(stampDocRef, {
        locationConfigs: locConfigs,
        updatedAt: new Date()
      });

      // Log movement to auditing
      const movRef = doc(collection(db, 'stock_movements'));
      await setDoc(movRef, {
        productId: stamp.id,
        productSlug: `stamp_${stamp.id}`,
        productName: `Estampa: "${stamp.name}"`,
        variantKey: `${location}_${cfg.sizes[sizeIndex] || 'U'}`,
        quantity: change,
        previousStock: currentQty,
        newStock: newQty,
        type: change > 0 ? 'Entrada' : 'Saída',
        operator: user?.email || 'Admin',
        createdAt: new Date(),
        notes: `Ajuste manual de estampa na posição ${location}`
      });

      playBeep('success');
      toast.success("Quantidade de estampa alterada!");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao atualizar o estoque da estampa.");
    }
  };

  // Products Stamp Linking logic
  const handleLinkStamp = async (productId: string, stampId: string, link: boolean) => {
    try {
      const prodRef = doc(db, 'products', productId);
      const prodObj = products.find(p => p.id === productId);
      if (!prodObj) return;

      const currentLinks: string[] = prodObj.linkedStamps || [];
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

      // Check whether product has active stamps linked to prevent publication or allow
      const associatedActiveStamps = stamps.filter(st => updatedLinks.includes(st.id) && st.status !== 'Inativa');
      const stampWarning = associatedActiveStamps.length === 0;

      await updateDoc(prodRef, {
        linkedStamps: updatedLinks,
        stampWarning,
        // Enforce drafted or active status based on the linkage existence
        status: stampWarning ? 'draft' : (prodObj.status || 'active'),
        updatedAt: new Date()
      });

      playBeep('success');
      toast.success(link ? "Estampa vinculada ao produto!" : "Vínculo removido!");
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha ao alterar vínculo de estampa: ${err.message}`);
    }
  };

  // Filter audit logs
  const filteredAudits = useMemo(() => {
    return movements.filter(m => {
      if (auditTypeFilter !== 'all' && m.type !== auditTypeFilter) return false;
      if (auditSearch.trim()) {
        const s = auditSearch.toLowerCase();
        const matchesName = (m.productName || '').toLowerCase().includes(s);
        const matchesOp = (m.operator || '').toLowerCase().includes(s);
        const matchesNotes = (m.notes || '').toLowerCase().includes(s);
        const matchesVar = (m.variantKey || '').toLowerCase().includes(s);
        if (!matchesName && !matchesOp && !matchesNotes && !matchesVar) return false;
      }
      return true;
    });
  }, [movements, auditSearch, auditTypeFilter]);

  // Render Loader
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-neutral-100 min-h-[400px]">
        <Loader2 className="animate-spin text-[#eab308] mb-4" size={32} />
        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Carregando painel de camisetas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Visual Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-200 pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 uppercase">Gestão de Camisas & Estampas</h2>
          <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Controle rígido de tecidos básicos, estampas DTF e regras de publicação vinculadas</p>
        </div>
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-md">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={cn("px-4 py-1.5 text-[9px] font-black uppercase tracking-wider rounded transition-all", activeTab === 'dashboard' ? "bg-black text-white" : "text-neutral-500 hover:text-black hover:bg-neutral-200")}>
            <Layout size={10} className="inline mr-1" /> Painel
          </button>
          <button 
            onClick={() => setActiveTab('shirts')} 
            className={cn("px-4 py-1.5 text-[9px] font-black uppercase tracking-wider rounded transition-all", activeTab === 'shirts' ? "bg-black text-white" : "text-neutral-500 hover:text-black hover:bg-neutral-200")}>
            <Layers size={10} className="inline mr-1" /> Camisetas ({stats.totalShirts})
          </button>
          <button 
            onClick={() => setActiveTab('stamps')} 
            className={cn("px-4 py-1.5 text-[9px] font-black uppercase tracking-wider rounded transition-all", activeTab === 'stamps' ? "bg-black text-white" : "text-neutral-500 hover:text-black hover:bg-neutral-200")}>
            <Sparkles size={10} className="inline mr-1" /> Estampas ({stamps.length})
          </button>
          <button 
            onClick={() => setActiveTab('links')} 
            className={cn("px-4 py-1.5 text-[9px] font-black uppercase tracking-wider rounded transition-all", activeTab === 'links' ? "bg-black text-white" : "text-neutral-500 hover:text-black hover:bg-neutral-200")}>
            <LinkIcon size={10} className="inline mr-1" /> Vínculos Obligatórios
          </button>
          <button 
            onClick={() => setActiveTab('audit')} 
            className={cn("px-4 py-1.5 text-[9px] font-black uppercase tracking-wider rounded transition-all", activeTab === 'audit' ? "bg-black text-white" : "text-neutral-500 hover:text-black hover:bg-neutral-200")}>
            <Clock size={10} className="inline mr-1" /> Auditoria Log
          </button>
        </div>
      </div>

      {/* DASHBOARD SUMMARY VIEW */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-lg border border-neutral-200 shadow-sm relative overflow-hidden">
              <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">Teclado Total Camisetas</span>
              <div className="text-3xl font-black tracking-tight text-neutral-950 mt-1 font-mono">{stats.totalShirts}</div>
              <p className="text-[9px] text-neutral-400 mt-1 uppercase font-bold">Unidades físicas em estoque (Force/Mark/Prime)</p>
              <div className="absolute top-4 right-4 text-neutral-100"><Layers size={40} strokeWidth={4} /></div>
            </div>

            <div className="bg-white p-5 rounded-lg border border-neutral-200 shadow-sm relative overflow-hidden">
              <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">Películas de Estampas (Estoque)</span>
              <div className="text-3xl font-black tracking-tight text-neutral-950 mt-1 font-mono">{stats.totalStampsEst}</div>
              <p className="text-[9px] text-neutral-400 mt-1 uppercase font-bold">Reserva de estampas prontas</p>
              <div className="absolute top-4 right-4 text-neutral-100"><Sparkles size={40} strokeWidth={4} /></div>
            </div>

            <div className="bg-amber-50/50 p-5 rounded-lg border border-amber-200/60 shadow-sm relative overflow-hidden">
              <span className="text-[9px] font-black tracking-widest text-amber-600 uppercase">Alerta Estoque Baixo</span>
              <div className="text-3xl font-black tracking-tight text-amber-700 mt-1 font-mono">{stats.lowStockCount}</div>
              <p className="text-[9px] text-amber-500 mt-1 uppercase font-bold">Mapeados necessitando reposição imediata</p>
              <div className="absolute top-4 right-4 text-amber-100/60"><AlertTriangle size={40} strokeWidth={4} /></div>
            </div>

            <div className="bg-red-50/50 p-5 rounded-lg border border-red-200/60 shadow-sm relative overflow-hidden">
              <span className="text-[9px] font-black tracking-widest text-red-600 uppercase">Esgotados Ativos</span>
              <div className="text-3xl font-black tracking-tight text-red-700 mt-1 font-mono">{stats.outStockCount}</div>
              <p className="text-[9px] text-red-500 mt-1 uppercase font-bold">Variantes sem peças e impedindo vendas no site</p>
              <div className="absolute top-4 right-4 text-red-100/60"><X size={40} strokeWidth={4} /></div>
            </div>
          </div>

          {/* Quick Warning Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Low stock indicators list */}
            <div className="bg-white p-5 rounded-lg border border-neutral-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b pb-3">
                <AlertTriangle size={14} className="text-amber-500" />
                <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900">Itens com Estoque Baixo</h3>
              </div>
              {stats.lowStockItemsList.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-400 my-4 uppercase">Nenhuma variante com estoque crítico!</div>
              ) : (
                <div className="space-y-2">
                  {stats.lowStockItemsList.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-2 bg-neutral-50 rounded border border-neutral-100">
                      <div>
                        <span className="bg-amber-100 text-amber-800 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded mr-2 inline-block">
                          {it.type}
                        </span>
                        <span className="font-bold text-neutral-800">{it.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-amber-700 font-mono font-black">{it.stock} un</span>
                        <button 
                          onClick={() => {
                            if (it.type === 'Camiseta') {
                              setActiveTab('shirts');
                              setShirtSearch(it.variantKey);
                            } else {
                              setActiveTab('stamps');
                              setStampSearch(it.id);
                            }
                          }}
                          className="text-[9px] font-bold uppercase tracking-wider bg-black text-white px-2 py-1 rounded hover:bg-neutral-800">
                          Ajustar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Out of stock list */}
            <div className="bg-white p-5 rounded-lg border border-neutral-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b pb-3">
                <X size={14} className="text-red-500 animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900">Itens Atuais Esgotados (Alerta Crítico)</h3>
              </div>
              {stats.outStockItemsList.length === 0 ? (
                <div className="p-4 text-center text-xs text-green-600 my-4 uppercase font-bold">★ Todos os produtos ativos estão abastecidos!</div>
              ) : (
                <div className="space-y-2">
                  {stats.outStockItemsList.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-2 bg-neutral-50 rounded border border-neutral-100">
                      <div>
                        <span className="bg-red-100 text-red-800 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded mr-2 inline-block">
                          {it.type}
                        </span>
                        <span className="font-semibold text-neutral-700">{it.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-red-700 font-mono font-black">{it.stock} un</span>
                        <button 
                          onClick={() => {
                            if (it.type === 'Camiseta') {
                              setActiveTab('shirts');
                              setShirtSearch(it.variantKey);
                            } else {
                              setActiveTab('stamps');
                              setStampSearch(it.id);
                            }
                          }}
                          className="text-[9px] font-bold uppercase tracking-wider bg-black text-white px-2 py-1 rounded hover:bg-neutral-800">
                          Abastecer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Auditing Feed */}
          <div className="bg-white p-5 rounded-lg border border-neutral-200 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <span className="flex items-center gap-2">
                <Layers size={14} className="text-neutral-500" />
                <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900">Movimentações de Estoque Recentes</h3>
              </span>
              <button onClick={() => setActiveTab('audit')} className="text-[9px] text-[#eab308] border border-[#eab308] font-black uppercase tracking-widest px-2 py-0.5 hover:bg-[#eab308]/10 transition-all rounded">Gabinete Completo</button>
            </div>
            {movements.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400 uppercase">Nenhum registro de movimentação foi audito até o momento.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-[9px] uppercase tracking-wider text-neutral-400">
                      <th className="py-2">Data/Hora</th>
                      <th className="py-2">Produto/Peça</th>
                      <th className="py-2">Variação/Posição</th>
                      <th className="py-2">Quantidade</th>
                      <th className="py-2">Responsável</th>
                      <th className="py-2">Nota / Operação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.slice(0, 5).map((m, idx) => {
                      const qtySymbol = m.quantity > 0 ? `+${m.quantity}` : `${m.quantity}`;
                      const dateObj = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50/50">
                          <td className="py-2.5 font-mono text-neutral-500">{dateObj.toLocaleString('pt-BR')}</td>
                          <td className="py-2.5 font-black text-neutral-900">{m.productName}</td>
                          <td className="py-2.5 font-mono text-neutral-600">{m.variantKey}</td>
                          <td className={cn("py-2.5 font-black font-mono", m.quantity > 0 ? "text-green-600" : "text-red-500")}>
                            {qtySymbol} un
                          </td>
                          <td className="py-2.5 text-neutral-500">{m.operator}</td>
                          <td className="py-2.5 text-neutral-600 italic truncate max-w-[200px]">{m.notes || m.type}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SHIRTS STOCK CONTROLS */}
      {activeTab === 'shirts' && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-5 space-y-6">
          <div className="flex flex-col md:flex-row justify-between gap-4 border-b pb-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308]">Filtro & Tabelamento de Tecido Básico</h3>
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                <input 
                  type="text" 
                  value={shirtSearch}
                  onChange={(e) => setShirtSearch(e.target.value)}
                  placeholder="Buscar modelo, cor ou tamanho..."
                  className="pl-8 pr-4 py-2 w-full md:w-64 text-xs bg-neutral-50 border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#eab308] rounded"
                />
                {shirtSearch && <X size={12} className="absolute right-2.5 top-3 cursor-pointer text-neutral-400" onClick={() => setShirtSearch('')} />}
              </div>
              <select 
                value={shirtModelFilter}
                onChange={(e: any) => setShirtModelFilter(e.target.value)}
                className="text-xs bg-neutral-50 border border-neutral-200 px-3 py-2 rounded focus:outline-none">
                <option value="all">Filtro Modelo: Todos</option>
                <option value="force">FORCE (Oversized)</option>
                <option value="mark">MARK (Oversized Desenho)</option>
                <option value="prime">PRIME (Básica Lisa)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b uppercase tracking-wider text-[9px] text-[#eab308]">
                  <th className="py-3 px-2">Modelo</th>
                  <th className="py-3 px-2">Cor</th>
                  <th className="py-3 px-2 text-center">Tamanho</th>
                  <th className="py-3 px-2 text-center">Estoque Atual</th>
                  <th className="py-3 px-2 text-center">Status</th>
                  <th className="py-3 px-2 text-right">Controles Rápidos</th>
                </tr>
              </thead>
              <tbody>
                {shirtVariants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-400 uppercase">Nenhuma variação correspondente localizada.</td>
                  </tr>
                ) : (
                  shirtVariants.map((item, idx) => (
                    <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50/50">
                      <td className="py-3 px-2 font-black text-neutral-900">{item.name}</td>
                      <td className="py-3 px-2 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full border border-neutral-300" style={{ backgroundColor: item.colorHex }} />
                        <span className="font-semibold text-neutral-700">{item.color}</span>
                      </td>
                      <td className="py-3 px-2 text-center font-mono font-bold">{item.size}</td>
                      <td className={cn("py-3 px-2 text-center font-mono font-black text-sm", item.stock === 0 ? "text-red-500 animate-pulse" : item.stock <= 3 ? "text-amber-600" : "text-neutral-900")}>
                        {item.stock} un
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded", item.stock > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                          {item.stock > 0 ? 'Disponível' : 'Esgotado'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button 
                            onClick={() => {
                              setAdjustingItem(item);
                              setAdjustAction('add');
                            }}
                            className="p-1 px-2.5 text-[9px] font-bold uppercase tracking-wider bg-green-50 hover:bg-green-100 text-green-700 rounded-md transition-all flex items-center gap-0.5">
                            <Plus size={9} /> Repor
                          </button>
                          <button 
                            onClick={() => {
                              if (item.stock === 0) {
                                toast.error("Sem estoque disponível para redução!");
                                return;
                              }
                              setAdjustingItem(item);
                              setAdjustAction('subtract');
                            }}
                            className="p-1 px-2.5 text-[9px] font-bold uppercase tracking-wider bg-red-50 hover:bg-red-100 text-red-700 rounded-md transition-all flex items-center gap-0.5">
                            <Minus size={9} /> Deduzir
                          </button>
                          <button 
                            onClick={() => {
                              setAdjustingItem(item);
                              setAdjustAction('set');
                            }}
                            className="p-1 px-2 text-[9px] font-bold uppercase tracking-wider bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-md transition-all flex items-center gap-0.5">
                            Ajuste Fino
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STAMPS CONTROLS VIEW */}
      {activeTab === 'stamps' && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-5 space-y-6">
          <div className="flex flex-col md:flex-row justify-between gap-4 border-b pb-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308]">Catalógo Dinâmico do Estoque de Estampas</h3>
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                <input 
                  type="text" 
                  value={stampSearch}
                  onChange={(e) => setStampSearch(e.target.value)}
                  placeholder="Buscar estampa pelo nome..."
                  className="pl-8 pr-4 py-2 w-full md:w-64 text-xs bg-neutral-50 border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#eab308] rounded"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {stamps.length === 0 ? (
              <div className="p-12 text-center text-xs text-neutral-400 uppercase">Nenhuma película de estampa cadastrada.</div>
            ) : (
              stamps.filter(st => {
                if (!stampSearch) return true;
                return st.name.toLowerCase().includes(stampSearch.toLowerCase()) || st.id.includes(stampSearch);
              }).map((st) => (
                <div key={st.id} className="bg-neutral-50 border border-neutral-200/80 rounded-lg p-4 flex flex-col md:flex-row justify-between gap-4 relative overflow-hidden transition-all hover:shadow-sm">
                  {/* Stamp summary */}
                  <div className="flex gap-4 items-start">
                    <img 
                      src={st.imageUrl || '/estampas/logo-fpac.png'} 
                      alt={st.name} 
                      className="w-16 h-16 object-cover bg-white border border-neutral-200 rounded"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] bg-neutral-200 text-neutral-800 px-1.5 py-0.5 rounded font-black">ID: {st.id.slice(0, 8)}...</span>
                        <span className={cn("text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded", st.status !== 'Inativa' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                          {st.status || 'Ativa'}
                        </span>
                      </div>
                      <h4 className="font-bold text-neutral-900 mt-1">{st.name}</h4>
                      <p className="text-[10px] text-neutral-400 uppercase font-black tracking-wider mt-0.5">Cat: {st.category || 'Música/Texto'}</p>
                    </div>
                  </div>

                  {/* Stamp quantities by location configs */}
                  <div className="flex-1 md:max-w-2xl bg-white border border-neutral-200/60 rounded p-3 space-y-3">
                    <span className="text-[9px] font-black text-[#eab308] uppercase tracking-wider border-b block pb-1 flex items-center justify-between">
                      <span>Quantidades por Local de Aplicação e Tamanho</span>
                    </span>
                    
                    {Object.keys(st.locationConfigs || {}).length === 0 ? (
                      <p className="text-[10px] text-neutral-400 italic">Nenhum local configurado para esta estampa.</p>
                    ) : (
                      <div className="space-y-3 split-cols">
                        {Object.entries(st.locationConfigs).map(([pos, config]: any) => (
                          <div key={pos} className="space-y-1.5 border-b border-dashed pb-2 last:border-0 last:pb-0">
                            <span className="block text-[9px] uppercase font-black text-neutral-700">{pos}</span>
                            <div className="flex flex-wrap gap-2">
                              {config.sizes.map((sz: string, sIdx: number) => {
                                const qty = Number(config.quantities?.[sIdx]) || 12; // fallback
                                return (
                                  <div key={sIdx} className="bg-neutral-50 px-2 py-1 rounded border border-neutral-200 text-xs flex items-center justify-between gap-3 w-40">
                                    <span className="font-mono font-bold text-neutral-600">{sz || 'U'}</span>
                                    <div className="flex items-center gap-1.5">
                                      {/* Adjust counts */}
                                      <button 
                                        onClick={() => adjustStampStock(st, pos, sIdx, qty, -1)}
                                        className="w-4 h-4 rounded bg-neutral-200 text-neutral-700 font-bold flex items-center justify-center hover:bg-neutral-300">
                                        -
                                      </button>
                                      <span className="font-mono font-black text-neutral-950 w-7 text-center">{qty}</span>
                                      <button 
                                        onClick={() => adjustStampStock(st, pos, sIdx, qty, 1)}
                                        className="w-4 h-4 rounded bg-[#eab308]/20 text-neutral-900 font-bold flex items-center justify-center hover:bg-[#eab308]/40">
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

                  {/* Stamp side control button */}
                  <div className="flex flex-col justify-between items-end gap-2 md:w-32">
                    <button 
                      onClick={() => toggleStampStatus(st.id, st.status || 'Ativa')}
                      className={cn("text-[9px] font-black uppercase tracking-wider w-full py-2 rounded border text-center transition-all", 
                        st.status !== 'Inativa' ? "border-red-200 hover:bg-red-50 text-red-600" : "border-green-200 hover:bg-green-50 text-green-600"
                      )}>
                      {st.status !== 'Inativa' ? 'Inativar estampa' : 'Re-ativar'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* REQUIRED LINKS AND WARNINGS VIEW */}
      {activeTab === 'links' && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-5 space-y-6">
          <div className="border-b pb-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308]">Painel de Vínculo Obrigatório com Estampas</h3>
            <p className="text-[10px] text-neutral-400 mt-1 uppercase font-bold">Todo produto comercial da loja precisa estar vinculado a estampas válidas do gerenciador para ser publicado/vendido</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.filter(p => !p.parentSlug).map((prod) => {
              const currentLinks = prod.linkedStamps || [];
              const associatedActiveStamps = stamps.filter(st => currentLinks.includes(st.id) && st.status !== 'Inativa');
              const hasWarning = prod.stampWarning || associatedActiveStamps.length === 0;

              return (
                <div key={prod.id} className={cn("p-4 rounded-lg border transition-all flex flex-col justify-between h-72 relative", 
                  hasWarning ? "border-red-200 bg-red-50/25" : "border-neutral-200 bg-neutral-50/30"
                )}>
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[9px] font-mono text-neutral-400 uppercase font-bold">{prod.slug.toUpperCase()}</span>
                      {hasWarning ? (
                        <span className="bg-red-100 text-red-800 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded animate-pulse">
                          Falta Estampa Ativa (Rascunho)
                        </span>
                      ) : (
                        <span className="bg-green-100 text-green-800 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                          Habilitado (Ativo)
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-neutral-900 mt-2 text-sm">{prod.name}</h4>
                    <p className="text-[10px] text-neutral-400 uppercase font-black truncate">{prod.headline || 'Camiseta Básica'}</p>
                    
                    {/* Active linked lists */}
                    <div className="mt-4">
                      <span className="block text-[9px] font-black text-neutral-400 uppercase tracking-wider mb-1">Estampas Vinculadas ({associatedActiveStamps.length})</span>
                      {associatedActiveStamps.length === 0 ? (
                        <div className="text-[10px] text-red-600/80 italic py-1">Estampas insuficientes vinculadas! Este item está bloqueado contra publicação.</div>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                          {associatedActiveStamps.map((st: any) => (
                            <span key={st.id} className="bg-neutral-100 hover:bg-neutral-200 px-2 py-0.5 border border-neutral-200 text-[10px] text-neutral-800 rounded flex items-center gap-1">
                              {st.name}
                              <X size={10} className="hover:text-red-500 cursor-pointer" onClick={() => handleLinkStamp(prod.id, st.id, false)} />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Association input selector */}
                  <div className="mt-4 pt-3 border-t">
                    <span className="block text-[8px] font-black text-neutral-400 uppercase mb-1">Disparar Vínculo de Estampa</span>
                    <select 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          handleLinkStamp(prod.id, val, true);
                          e.target.value = ''; // Reset selector
                        }
                      }}
                      className="text-[10px] bg-white border border-neutral-200 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-[#eab308]">
                      <option value="">-- Vincular Nova Estampa --</option>
                      {stamps.filter(st => !currentLinks.includes(st.id) && st.status !== 'Inativa').map(st => (
                        <option key={st.id} value={st.id}>{st.name} ({st.category})</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FULL AUDITING GENERAL ARCHIVE LOG tab */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-5 space-y-6">
          <div className="flex flex-col md:flex-row justify-between gap-4 border-b pb-4">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308]">Histórico Geral de Auditoria de Operações</h3>
              <p className="text-[10px] text-neutral-400 uppercase font-black">Histórico durável de entradas, saídas, vendas e calibragem</p>
            </div>
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                <input 
                  type="text" 
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Buscar operador, notas ou produto..."
                  className="pl-8 pr-4 py-2 w-full md:w-64 text-xs bg-neutral-50 border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#eab308] rounded"
                />
              </div>
              <select 
                value={auditTypeFilter}
                onChange={(e: any) => setAuditTypeFilter(e.target.value)}
                className="text-xs bg-neutral-50 border border-neutral-200 px-3 py-2 rounded focus:outline-none">
                <option value="all">Tipo Movimento: Todos</option>
                <option value="Entrada">Entrada (Reposição)</option>
                <option value="Saída">Saída (Subtração)</option>
                <option value="Ajuste">Ajuste Manual</option>
                <option value="Venda Local">Venda Local</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b uppercase tracking-wider text-[9px] text-neutral-400">
                  <th className="py-2.5">Data/Hora</th>
                  <th className="py-2.5">Nome do Item</th>
                  <th className="py-2.5">Variação / Detalhes</th>
                  <th className="py-2.5 text-center">Tamanho</th>
                  <th className="py-2.5 text-center">Qtd Movimento</th>
                  <th className="py-2.5 text-center">Saldo Anterior</th>
                  <th className="py-2.5 text-center">Saldo Novo</th>
                  <th className="py-2.5">Operador</th>
                  <th className="py-2.5">Notas da Auditoria</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudits.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-neutral-400 uppercase">Nenhum registro de auditoria localizado.</td>
                  </tr>
                ) : (
                  filteredAudits.map((item, idx) => {
                    const dateObj = item.createdAt?.toDate ? item.createdAt.toDate() : new Date();
                    return (
                      <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50/40 text-neutral-800">
                        <td className="py-3 font-mono text-neutral-500">{dateObj.toLocaleString('pt-BR')}</td>
                        <td className="py-3 font-bold text-neutral-900">{item.productName}</td>
                        <td className="py-3"><span className="bg-neutral-100 px-1.5 py-0.5 rounded font-mono text-[10px]">{item.variantKey}</span></td>
                        <td className="py-3 text-center text-neutral-500">{item.variantKey.split('_')[1] || 'U'}</td>
                        <td className={cn("py-3 text-center font-black font-mono", item.quantity > 0 ? "text-green-600" : "text-red-500")}>
                          {item.quantity > 0 ? `+${item.quantity}` : `${item.quantity}`}
                        </td>
                        <td className="py-3 text-center font-mono text-neutral-400">{item.previousStock ?? '-'}</td>
                        <td className="py-3 text-center font-mono font-bold text-neutral-800">{item.newStock ?? '-'}</td>
                        <td className="py-3 text-neutral-500 font-mono text-[10px]">{item.operator}</td>
                        <td className="py-3 text-neutral-600 italic font-mono text-[10px] truncate max-w-[200px]">{item.notes || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAILED ADJUSTMENT OVERLAY DRAWER/MODAL */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-lg shadow-xl border border-neutral-200 overflow-hidden text-neutral-900">
            {/* Header */}
            <div className="bg-neutral-950 p-4 text-white flex justify-between items-center">
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-[#eab308]">Gabinete de Ajuste de Estoque</h4>
                <p className="text-[10px] text-neutral-400 mt-0.5 uppercase">Auditando movimentação em tempo real</p>
              </div>
              <button onClick={() => setAdjustingItem(null)} className="text-white hover:text-[#eab308]"><X size={16} /></button>
            </div>

            {/* Content info */}
            <div className="p-5 space-y-4">
              <div className="bg-neutral-50 p-3 rounded border text-xs space-y-1">
                <div><span className="text-neutral-400 font-bold uppercase mr-1">Produto Base:</span> <span className="font-bold">{adjustingItem.name}</span></div>
                <div className="flex gap-4">
                  <div><span className="text-neutral-400 font-bold uppercase mr-1">Cor:</span> {adjustingItem.color}</div>
                  <div><span className="text-neutral-400 font-bold uppercase mr-1">Tamanho:</span> {adjustingItem.size}</div>
                </div>
                <div><span className="text-neutral-400 font-bold uppercase mr-1">Variação de chave:</span> <code className="font-mono text-neutral-600 bg-neutral-200 px-1 rounded">{adjustingItem.variantKey}</code></div>
                <div><span className="text-neutral-400 font-bold uppercase mr-1">Estoque atual:</span> <span className="font-bold text-neutral-900">{adjustingItem.stock} un</span></div>
              </div>

              {/* Adjust Operations type toggles */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Tipo de Ajuste</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button 
                    onClick={() => setAdjustAction('add')}
                    className={cn("py-2 text-[10px] rounded font-black uppercase border transition-all", adjustAction === 'add' ? "bg-green-100 border-green-300 text-green-800" : "bg-neutral-50 border-neutral-200 text-neutral-600")}>
                    Repor (+)
                  </button>
                  <button 
                    onClick={() => setAdjustAction('subtract')}
                    className={cn("py-2 text-[10px] rounded font-black uppercase border transition-all", adjustAction === 'subtract' ? "bg-red-100 border-red-300 text-red-800" : "bg-neutral-50 border-neutral-200 text-neutral-600")}>
                    Baixar (-)
                  </button>
                  <button 
                    onClick={() => setAdjustAction('set')}
                    className={cn("py-2 text-[10px] rounded font-black uppercase border transition-all", adjustAction === 'set' ? "bg-neutral-200 border-neutral-300 text-neutral-800 font-black" : "bg-neutral-50 border-neutral-200 text-neutral-600")}>
                    Definir (=)
                  </button>
                </div>
              </div>

              {/* Counts input */}
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Quantidade da Operação</span>
                <input 
                  type="number" 
                  min={1}
                  value={adjustQtyInput}
                  onChange={(e) => setAdjustQtyInput(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full bg-neutral-50 border border-neutral-200 p-2 text-sm font-mono font-black focus:outline-none focus:ring-1 focus:ring-[#eab308] rounded"
                />
              </div>

              {/* Operator Note */}
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Motivo / Notas da Auditoria</span>
                <textarea 
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Ex: Recebimento de facção, quebra de estoque, correção de digitação..."
                  className="w-full bg-neutral-50 border border-neutral-200 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#eab308] rounded h-16 resize-none"
                />
              </div>
            </div>

            {/* Footer buttons */}
            <div className="bg-neutral-50 p-4 border-t flex justify-end gap-2 text-xs font-bold uppercase">
              <button 
                onClick={() => setAdjustingItem(null)}
                className="bg-neutral-200 text-neutral-700 py-2 px-4 rounded hover:bg-neutral-300">
                Cancelar
              </button>
              <button 
                onClick={saveShirtAdjustment}
                className="bg-black text-white hover:bg-neutral-800 py-2 px-4 rounded tracking-wider">
                Salvar Operação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

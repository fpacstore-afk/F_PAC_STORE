import React, { useState, useEffect, useMemo } from 'react';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, onSnapshot, doc, setDoc, query, orderBy, 
  deleteDoc, serverTimestamp, getDocs, writeBatch 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../hooks/useInventory';
import { products as staticProducts } from '../data/products';
import { 
  Plus, Search, Box, Sparkles, RefreshCw, Upload, Save, 
  Trash2, X, FileText, CheckCircle, AlertTriangle, Eye, 
  EyeOff, HelpCircle, Layers, FolderPlus, Download, 
  CheckCircle2, Copy, History, Link as LinkIcon, Share2, CornerDownRight, Tag
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn, resizeImage, convertDriveUrlToDirect } from '../lib/utils';

// Consts for standard locations
const PRODUCTION_LOCATIONS = ["Peito Central", "Costas", "Manga", "Peito Lateral", "Gola", "Outros"];

const DEFAULT_SIZES = ["Pequena", "Média", "Grande", "Único"];

interface ProductionFile {
  id: string;
  type: 'PNG' | 'SVG' | 'PDF' | 'DTF' | 'Vetor';
  name: string;
  url: string;
  version: number;
  uploadedAt: string;
  uploadedBy: string;
}

interface Estampa {
  id: string;
  name: string;
  description: string;
  image: string;
  slotIndex: number;
  sku?: string;
  linha?: 'Force' | 'Mark' | 'Prime' | 'Todos';
  category?: string;
  tags?: string[];
  status?: 'active' | 'inactive' | 'archived';
  allowedLocations?: string[];
  locationConfigs?: Record<string, { sizes: string[]; quantities: (number | string)[] }>;
  productionFiles?: ProductionFile[];
  fileHistory?: Omit<ProductionFile, 'id'>[];
  salesCount?: number;
}

export function AdminStampsCenter() {
  const { user } = useAuth();
  const { inventory, loading: invLoading } = useInventory();

  // Admin Authorization
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';

  // State Management
  const [estampas, setEstampas] = useState<Estampa[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingStamps, setLoadingStamps] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [lineFilter, setLineFilter] = useState<'all' | 'Force' | 'Mark' | 'Prime'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'archived'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Form Drawer/Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStamp, setEditingStamp] = useState<Estampa | null>(null);
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState<string | null>(null); // holds file type being uploaded
  const [deletingStampId, setDeletingStampId] = useState<string | null>(null);
  const [isConfirmingDeleteDrawer, setIsConfirmingDeleteDrawer] = useState(false);

  // Form inputs (controlled)
  const [formName, setFormName] = useState('');
  const [formSKU, setFormSKU] = useState('');
  const [formImage, setFormImage] = useState('');
  const [formLinha, setFormLinha] = useState<'Force' | 'Mark' | 'Prime' | 'Todos'>('Force');
  const [formCategory, setFormCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive' | 'archived'>('active');
  const [formTags, setFormTags] = useState('');
  const [formAllowedLocations, setFormAllowedLocations] = useState<string[]>([]);
  const [formLocationConfigs, setFormLocationConfigs] = useState<Record<string, { sizes: string[]; quantities: (number | string)[] }>>({});
  const [formProductionFiles, setFormProductionFiles] = useState<ProductionFile[]>([]);
  const [formFileHistory, setFormFileHistory] = useState<Omit<ProductionFile, 'id'>[]>([]);

  // Sound signals 
  const playBeep = (type: 'success' | 'warn') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      if (type === 'success') {
        osc.frequency.setValueAtTime(950, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.04, ctx.currentTime);
        osc.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.stop(ctx.currentTime + 0.12);
      } else {
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.stop(ctx.currentTime + 0.22);
      }
    } catch {
      // Prevents audio block errors
    }
  };

  // 1. Fetch real-time estampas
  useEffect(() => {
    setLoadingStamps(true);
    const q = query(collection(db, 'estampas'), orderBy('slotIndex', 'asc'));
    const unsubscribeStamps = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Estampa));
      setEstampas(data);
      setLoadingStamps(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'estampas');
      setLoadingStamps(false);
    });

    return () => unsubscribeStamps();
  }, []);

  // 2. Fetch products to resolve catalog relationship
  useEffect(() => {
    setLoadingProducts(true);
    const unsubscribeProd = onSnapshot(collection(db, 'products'), (snapshot) => {
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
      console.error("Error fetching products:", error);
      setLoadingProducts(false);
    });

    return () => unsubscribeProd();
  }, []);

  // 3. Fetch orders (to calculate real-time stats and sales counts)
  useEffect(() => {
    setLoadingOrders(true);
    const unsubscribeOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const oData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(oData);
      setLoadingOrders(false);
    }, (error) => {
      console.error("Error loading orders for stamps math:", error);
      setLoadingOrders(false);
    });

    return () => unsubscribeOrders();
  }, []);

  // Real-time sales aggregator from paid/completed orders
  const stampSalesAnalytics = useMemo(() => {
    const salesMap: Record<string, number> = {};
    const productionCountMap: Record<string, number> = {};
    
    orders.forEach(order => {
      const status = order.status || '';
      // Exclude cancelled/unpaid
      const isPaid = !['cancelled', 'payment_pending', 'Pagamento Não Realizado'].includes(status);
      const isPendingProduction = ['received', 'payment_approved', 'separacao', 'embalagem', 'Aguardando Pagamento PIX', 'Pagamento Aprovado'].includes(status);
      
      if (Array.isArray(order.items)) {
        order.items.forEach(item => {
          if (Array.isArray(item.printConfigs)) {
            item.printConfigs.forEach((pc: any) => {
              if (pc.stamp) {
                const qty = Number(item.quantity) || 1;
                if (isPaid) {
                  salesMap[pc.stamp] = (salesMap[pc.stamp] || 0) + qty;
                }
                if (isPendingProduction) {
                  productionCountMap[pc.stamp] = (productionCountMap[pc.stamp] || 0) + qty;
                }
              }
            });
          }
        });
      }
    });

    return { salesMap, productionCountMap };
  }, [orders]);

  // Unique categories list for query filters
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    estampas.forEach(e => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set);
  }, [estampas]);

  // Metrics summary calculations
  const metrics = useMemo(() => {
    const total = estampas.length;
    const active = estampas.filter(e => e.status === 'active' || (!e.status && e.image)).length;
    
    // In production stamps
    const inProduction = estampas.filter(e => (stampSalesAnalytics.productionCountMap[e.name] || 0) > 0).length;
    const archived = estampas.filter(e => e.status === 'archived').length;

    // Get lists of best selling and non-selling
    const stampedList = estampas.map(e => ({
      ...e,
      sales: stampSalesAnalytics.salesMap[e.name] || 0
    }));

    const sortedBySales = [...stampedList].sort((a, b) => b.sales - a.sales);
    const bestSellers = sortedBySales.filter(e => e.sales > 0).slice(0, 3);
    const noSales = stampedList.filter(e => e.sales === 0);

    return {
      total,
      active,
      inProduction,
      archived,
      bestSellers,
      noSalesCount: noSales.length
    };
  }, [estampas, stampSalesAnalytics]);

  // Dynamic search and filter processing
  const filteredEstampas = useMemo(() => {
    return estampas.filter(e => {
      // 1. Text Search matcher
      const matchQuery = searchQuery.trim().toLowerCase();
      const nameMatch = e.name.toLowerCase().includes(matchQuery);
      const descMatch = (e.description || '').toLowerCase().includes(matchQuery);
      const skuMatch = (e.sku || '').toLowerCase().includes(matchQuery);
      const catMatch = (e.category || '').toLowerCase().includes(matchQuery);
      const lineMatch = (e.linha || '').toLowerCase().includes(matchQuery);
      const tagMatch = (e.tags || []).some(t => t.toLowerCase().includes(matchQuery));
      
      const fitsSearch = !searchQuery || nameMatch || descMatch || skuMatch || catMatch || lineMatch || tagMatch;

      // 2. Line Filter matcher
      const fitsLine = lineFilter === 'all' || e.linha === lineFilter;

      // 3. Status Filter matcher
      let fitsStatus = true;
      if (statusFilter === 'active') {
        fitsStatus = e.status === 'active' || (!e.status && e.image !== '');
      } else if (statusFilter === 'inactive') {
        fitsStatus = e.status === 'inactive' || (!e.status && !e.image);
      } else if (statusFilter === 'archived') {
        fitsStatus = e.status === 'archived';
      }

      // 4. Category Filter matcher
      const fitsCategory = categoryFilter === 'all' || e.category === categoryFilter;

      return fitsSearch && fitsLine && fitsStatus && fitsCategory;
    });
  }, [estampas, searchQuery, lineFilter, statusFilter, categoryFilter]);

  // Handle single stamp selection and open form
  const handleOpenForm = (stamp: Estampa | null) => {
    setDeletingStampId(null);
    setIsConfirmingDeleteDrawer(false);
    if (stamp) {
      setEditingStamp(stamp);
      setFormName(stamp.name || '');
      setFormSKU(stamp.sku || '');
      setFormImage(stamp.image || '');
      setFormLinha(stamp.linha || 'Force');
      setFormCategory(stamp.category || '');
      setFormDescription(stamp.description || '');
      setFormStatus(stamp.status || 'active');
      setFormTags(stamp.tags?.join(', ') || '');
      setFormAllowedLocations(stamp.allowedLocations || []);
      setFormLocationConfigs(stamp.locationConfigs || {});
      setFormProductionFiles(stamp.productionFiles || []);
      setFormFileHistory(stamp.fileHistory || []);
    } else {
      // Create mode
      setEditingStamp(null);
      setFormName('');
      setFormSKU('');
      setFormImage('');
      setFormLinha('Force');
      setFormCategory('');
      setFormDescription('');
      setFormStatus('active');
      setFormTags('');
      setFormAllowedLocations(['Peito Central', 'Costas']);
      
      // Auto production structures
      const initialConfigs: Record<string, { sizes: string[]; quantities: (number | string)[] }> = {};
      ['Peito Central', 'Costas'].forEach(loc => {
        initialConfigs[loc] = {
          sizes: ['P', 'M', 'G', 'GG'],
          quantities: [0, 0, 0, 0]
        };
      });
      setFormLocationConfigs(initialConfigs);
      setFormProductionFiles([]);
      setFormFileHistory([]);
    }
    setIsFormOpen(true);
  };

  // Automated SKU Generator based on Line and Counter or Randomizer
  const autoGenerateSKU = (name: string, line: string) => {
    if (!name) return '';
    const linePrefix = line.substring(0, 3).toUpperCase();
    const cleanName = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-zA-Z0-9]/g, "") // remove special chars
      .substring(0, 5)
      .toUpperCase();

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `STMP-${linePrefix}-${cleanName}-${randomSuffix}`;
  };

  // Sync SKU auto-generation when toggling fields on empty SKU states
  useEffect(() => {
    if (!formSKU && formName && formLinha) {
      const generated = autoGenerateSKU(formName, formLinha);
      setFormSKU(generated);
    }
  }, [formName, formLinha]);

  // Handle uploading the preview artwork image
  const handlePreviewUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPreview(true);
    let resized: Blob | null = null;
    try {
      resized = await resizeImage(file, 800, 800);
      const storageRef = ref(storage, `estampas/previews/${Date.now()}_${file.name}`);
      const snap = await uploadBytes(storageRef, resized);
      const url = await getDownloadURL(snap.ref);
      setFormImage(url);
      toast.success('Imagem carregada com sucesso!');
      playBeep('success');
    } catch (err) {
      console.error("Preview storage error:", err);
      // fallback to reader Base64 using the highly optimized resized blob
      const blobToRead = resized || file;
      const reader = new FileReader();
      reader.readAsDataURL(blobToRead);
      reader.onloadend = () => {
        setFormImage(reader.result as string);
        toast('Firebase Storage indisponível. Arte otimizada e salva via Base64.', { icon: '⚠️' });
        playBeep('success');
      };
    } finally {
      setIsUploadingPreview(false);
    }
  };

  // Upload DTF, SVG, PDF, Vetor technical production files with versioning
  const handleProductionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fileType: 'PNG' | 'SVG' | 'PDF' | 'DTF' | 'Vetor') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(fileType);
    try {
      let url = "";
      try {
        const storageRef = ref(storage, `estampas/production_files/${Date.now()}_${file.name}`);
        const snap = await uploadBytes(storageRef, file);
        url = await getDownloadURL(snap.ref);
      } catch (storageError) {
        console.warn("Storage upload failed for production file, falling back to Base64:", storageError);
        // Base64 fallback
        const reader = new FileReader();
        url = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        toast('Firebase Storage indisponível. Arquivo persistido via Base64.', { icon: '⚠️' });
      }

      // Check if file of this type already exist to increment its version
      const existingIdx = formProductionFiles.findIndex(f => f.type === fileType);
      
      let nextVersion = 1;
      let fileHistoryCopy = [...formFileHistory];

      if (existingIdx !== -1) {
        const oldFile = formProductionFiles[existingIdx];
        nextVersion = oldFile.version + 1;
        // archive current file to history
        fileHistoryCopy.push({
          type: oldFile.type,
          name: oldFile.name,
          url: oldFile.url,
          version: oldFile.version,
          uploadedAt: oldFile.uploadedAt,
          uploadedBy: oldFile.uploadedBy
        });
      }

      const newProdFile: ProductionFile = {
        id: `file-${Date.now()}-${fileType}`,
        type: fileType,
        name: file.name,
        url: url,
        version: nextVersion,
        uploadedAt: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
        uploadedBy: user?.email || 'Sistema'
      };

      let updatedFiles = [...formProductionFiles];
      if (existingIdx !== -1) {
        updatedFiles[existingIdx] = newProdFile;
      } else {
        updatedFiles.push(newProdFile);
      }

      setFormProductionFiles(updatedFiles);
      setFormFileHistory(fileHistoryCopy);
      
      toast.success(`Arquivo técnico ${fileType} (v${nextVersion}) anexado!`);
      playBeep('success');
    } catch (err) {
      console.error("Production file saving error:", err);
      toast.error("Erro ao salvar arquivo. Tente novamente ou use formato menor.");
    } finally {
      setIsUploadingFile(null);
    }
  };

  // Remove technical file with archiving option
  const removeProductionFile = (fileId: string) => {
    const target = formProductionFiles.find(f => f.id === fileId);
    if (!target) return;

    // Save removal to history
    const archiveHistory = [...formFileHistory, {
      type: target.type,
      name: `${target.name} (REMOVIDO)`,
      url: target.url,
      version: target.version,
      uploadedAt: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
      uploadedBy: `${user?.email || 'Sistema'} (Deletador)`
    }];

    const remains = formProductionFiles.filter(f => f.id !== fileId);
    setFormProductionFiles(remains);
    setFormFileHistory(archiveHistory);
    toast.success('Arquivo removido da lista ativa.');
    playBeep('warn');
  };

  // Save changes back to Firebase
  const handleSaveStamp = async () => {
    if (!isAdmin) {
      toast.error("Somente administradores podem salvar estampas.");
      return;
    }
    if (!formName.trim()) {
      toast.error("O nome da estampa é obrigatório.");
      return;
    }

    const payloadIndex = editingStamp ? editingStamp.slotIndex : (estampas.length > 0 ? Math.max(...estampas.map(e => e.slotIndex)) + 1 : 1);
    const resolvedId = editingStamp ? editingStamp.id : `slot-${payloadIndex}`;

    // Calculate sum of stock across all active locations configured
    const sum = formAllowedLocations.reduce((accSum: number, loc: string) => {
      const locConfig = formLocationConfigs[loc];
      if (!locConfig) return accSum;
      const quantities = locConfig.quantities || [0, 0, 0, 0];
      const locSum = quantities.reduce((acc: number, qty: any, i: number) => {
        const size = locConfig.sizes?.[i];
        if (!size || size.trim() === '') return acc;
        return acc + (Number(qty) || 0);
      }, 0);
      return accSum + locSum;
    }, 0);

    const cleanTags = formTags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const docPayload: any = {
      name: formName.trim(),
      description: formDescription.trim(),
      image: formImage,
      slotIndex: payloadIndex,
      sku: formSKU || `STMP-${formLinha.toUpperCase()}-${payloadIndex}`,
      linha: formLinha,
      category: formCategory.trim() || 'Geral',
      tags: cleanTags,
      status: formStatus,
      allowedLocations: formAllowedLocations,
      locationConfigs: formLocationConfigs,
      productionFiles: formProductionFiles,
      fileHistory: formFileHistory,
      updatedAt: serverTimestamp() as any
    };

    try {
      // 1. Save to `estampas` collection
      await setDoc(doc(db, 'estampas', resolvedId), docPayload, { merge: true });

      // 2. Align stock inside `inventory` collection
      await setDoc(doc(db, 'inventory', resolvedId), {
        stock: sum,
        available: sum > 0 && formStatus === 'active',
        updatedAt: new Date()
      }, { merge: true });

      toast.success(`Estampa "${formName}" salva com sucesso!`);
      playBeep('success');
      setIsFormOpen(false);
    } catch (err) {
      console.error("Error saving estampa:", err);
      toast.error("Internal save error.");
    }
  };

  // Quick Duplicate automation action
  const handleDuplicateStamp = async (stamp: Estampa) => {
    if (!isAdmin) return;
    try {
      const nextIndex = estampas.length > 0 ? Math.max(...estampas.map(e => e.slotIndex)) + 1 : 1;
      const duplicateId = `slot-${nextIndex}`;
      const duplicatedName = `${stamp.name} (Cópia)`;
      const duplicatedSKU = autoGenerateSKU(duplicatedName, stamp.linha || 'Force');

      const payload: Estampa = {
        ...stamp,
        id: duplicateId,
        name: duplicatedName,
        sku: duplicatedSKU,
        slotIndex: nextIndex,
        status: 'inactive', // Default to inactive for safety
        salesCount: 0
      };

      await setDoc(doc(db, 'estampas', duplicateId), {
        ...payload,
        updatedAt: serverTimestamp()
      });

      toast.success(`Estampa duplicada como "${duplicatedName}"! Novo slot #${nextIndex}`);
      playBeep('success');
    } catch (err) {
      console.error("Duplication error:", err);
      toast.error("Erro ao duplicar estampa.");
    }
  };

  // Archive action
  const handleToggleArchive = async (stamp: Estampa) => {
    if (!isAdmin) return;
    const isArchived = stamp.status === 'archived';
    const nextStatus = isArchived ? 'inactive' : 'archived';
    try {
      await setDoc(doc(db, 'estampas', stamp.id), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      }, { merge: true });

      toast.success(isArchived ? "Estampa desarquivada!" : "Estampa movida para os arquivos.");
      playBeep('success');
    } catch (err) {
      console.error(err);
      toast.error("Erro ao alterar arquivamento");
    }
  };

  // Toggle active/inactive
  const handleToggleActiveStatus = async (stamp: Estampa) => {
    if (!isAdmin) return;
    const nextStatus = stamp.status === 'active' ? 'inactive' : 'active';
    try {
      await setDoc(doc(db, 'estampas', stamp.id), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Align inventory availability
      const currentStock = inventory[stamp.id]?.stock || 0;
      await setDoc(doc(db, 'inventory', stamp.id), {
        available: nextStatus === 'active' && currentStock > 0,
        updatedAt: new Date()
      }, { merge: true });

      toast.success(nextStatus === 'active' ? 'Estampa ativada!' : 'Estampa desativada.');
      playBeep('success');
    } catch (err) {
      console.error(err);
      toast.error("Erro ao alterar status");
    }
  };

  // Hard Delete with safety prompt
  const handleDeleteStamp = async (stampId: string, bypassConfirm: boolean = false) => {
    if (!isAdmin) {
      toast.error("Somente administradores podem excluir estampas.");
      return;
    }
    
    if (bypassConfirm) {
      try {
        await deleteDoc(doc(db, 'estampas', stampId));
        await deleteDoc(doc(db, 'inventory', stampId));
        toast.success("Estampa excluída com sucesso.");
        playBeep('warn');
        setIsFormOpen(false);
        setEditingStamp(null);
        setDeletingStampId(null);
        setIsConfirmingDeleteDrawer(false);
      } catch (err) {
        console.error(err);
        toast.error("Erro ao deletar.");
      }
      return;
    }

    if (window.confirm("Atenção! Esta ação é irreversível e excluirá todo o histórico de arquivos técnicos e configurações de estoque desta estampa. Deseja mesmo prosseguir?")) {
      try {
        await deleteDoc(doc(db, 'estampas', stampId));
        await deleteDoc(doc(db, 'inventory', stampId));
        toast.success("Estampa excluída com sucesso.");
        playBeep('warn');
        setIsFormOpen(false);
        setEditingStamp(null);
        setDeletingStampId(null);
        setIsConfirmingDeleteDrawer(false);
      } catch (err) {
        console.error(err);
        toast.error("Erro ao deletar.");
      }
    }
  };

  // Helper: Find which catalog products are dynamically paired or using this estampa's line base
  const getPairedProducts = (stampLine: string) => {
    if (!stampLine) return [];
    // Product variants whose collection tag or model slug is matching
    return products.filter(p => p.parentSlug === stampLine.toLowerCase());
  };

  return (
    <div className="bg-[#fafafa] min-h-screen text-black">
      
      {/* 1. HERO HEADER */}
      <div className="bg-black text-white px-6 md:px-10 py-10 md:py-14 border-b-4 border-[#eab308] relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-12 translate-y-12 pointer-events-none">
          <Layers size={320} className="text-white" />
        </div>
        
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="bg-[#eab308] text-black px-3 py-1 text-[9px] font-black uppercase tracking-widest font-mono">
                SGC v2.4
              </span>
              <span className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.2em] font-sans">
                • CENTRAL DE ESTAMPAS E ARTES
              </span>
            </div>
            
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-none italic font-sans">
              CENTRAL <br className="md:hidden" />
              DE <span className="text-[#eab308]">ESTAMPAS</span>
            </h1>
            
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest max-w-xl">
              Gerencie artes gráficas, matrizes vetoriais, arquivos de produção DTF e quantitativos físicos em um único local para as linhas Fuerza, Mark e Prime.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleOpenForm(null)}
              className="bg-[#eab308] text-black hover:bg-white transition-all px-6 py-4 text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
            >
              <FolderPlus size={15} /> Cadastrar Nova Estampa
            </button>
          </div>
        </div>
      </div>

      {/* 2. GENERAL PANEL / ANALYTICS METRICS */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 -translate-y-6 relative z-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          <div className="bg-white border border-black/10 p-5 shadow-sm hover:shadow transition-shadow flex flex-col justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-3 font-sans">Cadastradas</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-3xl font-black font-mono tracking-tight">{metrics.total}</span>
              <span className="text-[10px] text-gray-450 uppercase font-bold font-sans">matrizes</span>
            </div>
          </div>

          <div className="bg-white border border-black/10 p-5 shadow-sm hover:shadow transition-shadow flex flex-col justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308] block mb-3 font-sans">Ativas</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-3xl font-black font-mono tracking-tight text-black">{metrics.active}</span>
              <span className="text-[9px] text-emerald-650 bg-emerald-100/45 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Online</span>
            </div>
          </div>

          <div className="bg-white border border-black/10 p-5 shadow-sm hover:shadow transition-shadow flex flex-col justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-450 block mb-3 font-sans">Em Produção</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-3xl font-black font-mono tracking-tight text-blue-600">{metrics.inProduction}</span>
              <span className="text-[10px] text-blue-500 font-bold uppercase font-sans">ordens ativas</span>
            </div>
          </div>

          <div className="bg-white border border-black/10 p-5 shadow-sm hover:shadow transition-shadow flex flex-col justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-3 font-sans">Arquivadas</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-3xl font-black font-mono tracking-tight text-gray-500">{metrics.archived}</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase font-sans">fora de venda</span>
            </div>
          </div>

        </div>
      </div>

      {/* 3. MULTI-FILTER BAR & SMART SEARCH */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-10">
        <div className="bg-white border border-black/[0.08] p-5 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          
          {/* Smart input */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Pesquisar por estampa, SKU, linha, tag, categoria..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-50 px-9 py-3 text-[11px] font-bold uppercase tracking-wider border border-black/10 focus:outline-none focus:border-black placeholder-gray-400 transition-colors"
            />
          </div>

          {/* Filters tools */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Filter by line */}
            <div className="flex bg-neutral-100 p-0.5 border border-black/5">
              {(['all', 'Force', 'Mark', 'Prime'] as const).map(lineOp => (
                <button
                  key={lineOp}
                  onClick={() => setLineFilter(lineOp)}
                  className={cn(
                    "px-3 py-2 text-[9px] font-black uppercase tracking-wider transition-colors",
                    lineFilter === lineOp 
                      ? "bg-black text-white" 
                      : "text-gray-400 hover:text-black"
                  )}
                >
                  {lineOp === 'all' ? 'Linhas' : lineOp}
                </button>
              ))}
            </div>

            {/* Filter by category dropdown */}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-white border border-black/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider focus:outline-none max-w-[140px]"
            >
              <option value="all">Todas Categorias</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat.toUpperCase()}</option>
              ))}
            </select>

            {/* Filter by status dropdown */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-white border border-black/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider focus:outline-none"
            >
              <option value="all">Filtro Status</option>
              <option value="active">Ativas (Venda)</option>
              <option value="inactive">Inativas</option>
              <option value="archived">Arquivadas</option>
            </select>

            {/* Counter Badge */}
            <div className="bg-black text-[#eab308] px-3 py-2 font-mono text-[10px] font-black flex items-center gap-1.5">
              <span>FILTRADAS:</span>
              <span>{filteredEstampas.length}</span>
            </div>

          </div>

        </div>

        {/* 4. MAIN RESPONSIVE GRID LIST */}
        <div className="mt-8">
          {loadingStamps ? (
            <div className="flex flex-col items-center justify-center py-36 gap-3">
              <RefreshCw className="animate-spin text-[#eab308]" size={42} />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Escaneando Estampas...</span>
            </div>
          ) : filteredEstampas.length === 0 ? (
            <div className="text-center py-24 bg-white border border-dashed border-black/10">
              <AlertTriangle className="mx-auto text-gray-300 mb-2" size={42} />
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Nenhuma estampa localizada</h3>
              <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mt-1">Experimente alterar os termos da busca ou os filtros aplicados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEstampas.map(stamp => {
                const isArchived = stamp.status === 'archived';
                const isActive = stamp.status === 'active' || (!stamp.status && stamp.image);
                
                // Inventory lookup totals
                const stampInv = inventory[stamp.id];
                const totalStock = stampInv?.stock ?? 0;
                const isOnlineInStore = stampInv?.available && isActive;

                // Active production order indicators
                const orderCounter = stampSalesAnalytics.productionCountMap[stamp.name] || 0;

                // Connected products counts
                const connectedProds = getPairedProducts(stamp.linha || '');

                return (
                  <div 
                    key={stamp.id}
                    className={cn(
                      "bg-white border rounded-none p-5 flex flex-col justify-between gap-5 relative transition-all duration-300 group",
                      isArchived ? "opacity-60 border-neutral-200" : "border-black/[0.08] hover:border-black/30 hover:shadow-lg"
                    )}
                  >
                    
                    {/* TOP BADGES & ACTIONS HEADER */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {/* LINE TAG */}
                        <span className={cn(
                          "inline-block text-[8px] font-black uppercase px-2 py-0.5 tracking-wider font-mono",
                          stamp.linha === 'Force' && "bg-black text-white",
                          stamp.linha === 'Mark' && "bg-amber-100 text-amber-900 border border-amber-200",
                          stamp.linha === 'Prime' && "bg-blue-100 text-blue-900 border border-blue-200",
                          (!stamp.linha || stamp.linha === 'Todos') && "bg-neutral-100 text-neutral-800"
                        )}>
                          LINHA: {stamp.linha || 'Mãe'}
                        </span>
                        
                        {/* CATEGORY */}
                        <span className="inline-block text-[8px] font-black uppercase tracking-wider bg-zinc-100 text-zinc-500 border border-zinc-200/50 px-2 py-0.5 ml-1.5">
                          {stamp.category || 'Geral'}
                        </span>
                      </div>

                      {/* QUICK STATUS */}
                      <div className="flex items-center gap-1.5">
                        {isArchived ? (
                          <span className="text-[7.5px] font-black bg-neutral-200 text-neutral-600 px-1.5 py-0.5 uppercase tracking-wide">Arquivada</span>
                        ) : isActive ? (
                          <span className="text-[7.5px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.2 uppercase tracking-wide border border-emerald-250">Ativa</span>
                        ) : (
                          <span className="text-[7.5px] font-black bg-rose-150 text-rose-800 px-1.5 py-0.2 uppercase tracking-wide border border-rose-200">Pausada</span>
                        )}
                        
                        {/* SLOT DECORATOR */}
                        <span className="font-mono text-[9px] font-black text-gray-300">#{stamp.slotIndex}</span>
                      </div>
                    </div>

                    {/* IMAGE CONTENT & GENERAL METRICS */}
                    <div className="flex gap-4">
                      {/* PREVIEW CONTAINER */}
                      <div className="w-20 h-20 bg-neutral-50 border border-black/5 flex items-center justify-center p-1.5 shrink-0 relative overflow-hidden group-hover:scale-105 transition-transform duration-350">
                        {stamp.image ? (
                          <img 
                            src={stamp.image} 
                            alt={stamp.name} 
                            className="max-w-full max-h-full object-contain" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Box size={22} className="text-neutral-250" />
                        )}
                      </div>

                      {/* TEXT INFO */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <h4 className="text-sm font-black uppercase tracking-tight text-black line-clamp-1 truncate block font-sans" title={stamp.name}>
                          {stamp.name}
                        </h4>
                        
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider font-mono truncate" title={stamp.sku}>
                          REF: {stamp.sku || 'NÃO DEFINIDO'}
                        </p>

                        <p className="text-[10px] text-neutral-400 line-clamp-2 leading-relaxed uppercase font-semibold">
                          {stamp.description || 'Nenhuma descrição técnica informada.'}
                        </p>
                      </div>
                    </div>

                    {/* PHYSICAL WAREHOUSE STOCK PANEL */}
                    <div className="bg-neutral-55 bg-neutral-50 border border-black/[0.03] p-3 space-y-2">
                      <div className="flex justify-between items-center text-[8.5px] font-black uppercase tracking-wider border-b border-black/[0.04] pb-1.5">
                        <span className="text-gray-400">Total de Estoque Real</span>
                        <span className={cn(
                          "font-mono text-xs font-black",
                          totalStock > 20 ? "text-emerald-700" : totalStock > 5 ? "text-amber-700" : "text-rose-700"
                        )}>
                          {totalStock} Unidades
                        </span>
                      </div>

                      {/* Mini configurations list */}
                      <div className="flex flex-wrap gap-1.5">
                        {stamp.allowedLocations && stamp.allowedLocations.length > 0 ? (
                          stamp.allowedLocations.slice(0, 3).map(loc => {
                            const activeLoc = stamp.locationConfigs?.[loc];
                            const sumQty = activeLoc?.quantities?.reduce((sum: number, q: any) => sum + (Number(q) || 0), 0) || 0;
                            return (
                              <span key={loc} className="text-[7.5px] font-black bg-white border border-black/5 px-2 py-1 text-gray-500 rounded-none italic font-sans flex items-center gap-1">
                                {loc.toUpperCase()}: <strong className="text-black not-italic font-mono">{sumQty}</strong>
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-[7.5px] font-black italic text-gray-400 uppercase">Estoque não estruturado</span>
                        )}
                        {stamp.allowedLocations && stamp.allowedLocations.length > 3 && (
                          <span className="text-[8px] font-black text-gray-400 font-sans">+{stamp.allowedLocations.length - 3}</span>
                        )}
                      </div>
                    </div>

                    {/* TECHNICAL PRODUCTION ATTACHMENTS FILE AND RELATIONSHIP INDICATORS */}
                    <div className="flex items-center justify-between gap-4 border-t border-black/5 pt-3.5">
                      <div className="flex items-center gap-3">
                        {/* Files Counter */}
                        <div className="flex items-center gap-1 text-gray-450" title="Matrizes e arquivos DTF/Vetores anexados">
                          <FileText size={12} />
                          <span className="text-[9px] font-mono font-black">{stamp.productionFiles?.length || 0} Arq.</span>
                        </div>

                        {/* Associated Catalog Products counter */}
                        <div className="flex items-center gap-1 text-gray-450" title="Produtos associados na loja">
                          <Tag size={12} />
                          <span className="text-[9px] font-sans font-black uppercase text-gray-650">{connectedProds.length} Prod.</span>
                        </div>

                        {/* Production orders tracker */}
                        {orderCounter > 0 && (
                          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 flex items-center gap-1 animate-pulse">
                            <span className="text-[7px] font-bold uppercase tracking-wider font-mono">FÁBRICA: {orderCounter} PECAS</span>
                          </div>
                        )}
                      </div>

                      {/* COMPACT HOVER ACTIONS */}
                      <div className="flex gap-1.5">
                        
                        {/* Fast active switcher */}
                        <button
                          onClick={() => handleToggleActiveStatus(stamp)}
                          className={cn(
                            "p-2 border transition-all",
                            isActive 
                              ? "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-600" 
                              : "bg-rose-50 hover:bg-rose-100 border-rose-250 text-rose-500"
                          )}
                          title={isActive ? "Pausar vendas no catálogo" : "Ativar vendas no catálogo"}
                        >
                          {isActive ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>

                        {/* Copy Duplicator */}
                        <button
                          onClick={() => handleDuplicateStamp(stamp)}
                          className="p-2 border border-black/10 hover:border-black bg-white text-black transition-all"
                          title="Duplicar Matriz"
                        >
                          <Copy size={12} />
                        </button>

                        {/* Direct Trash / Clean Delete */}
                        {deletingStampId === stamp.id ? (
                          <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 p-0.5 animate-pulse">
                            <button
                              type="button"
                              onClick={() => handleDeleteStamp(stamp.id, true)}
                              className="bg-rose-600 text-white text-[7.5px] font-black uppercase px-2 py-1.5 hover:bg-rose-700 transition"
                            >
                              Sim
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingStampId(null)}
                              className="bg-black text-white text-[7.5px] font-black uppercase px-2 py-1.5 hover:bg-neutral-800 transition"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeletingStampId(stamp.id)}
                            className="p-2 border border-rose-200 hover:border-rose-500 bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-700 transition-all shrink-0"
                            title="Excluir estampa da base"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}

                        {/* General configure */}
                        <button
                          onClick={() => handleOpenForm(stamp)}
                          className="bg-black text-white hover:bg-[#eab308] hover:text-black transition-all text-[8.5px] font-black uppercase px-3.5 py-2.5 tracking-wider"
                        >
                          Gerenciar
                        </button>

                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 5. UNIFIED CREATIVE FORM DIALOG (MODAL SHEET) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border-2 border-black max-w-4xl w-full my-8 text-black relative flex flex-col justify-between max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-black text-white p-6 flex justify-between items-center border-b-2 border-[#eab308]">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest font-mono">
                  {editingStamp ? `GERENCIAR MATRIZ: ${formName || 'S/N'}` : 'REGISTRAR NOVA MATRIZ DE ESTAMPA'}
                </h3>
                <p className="text-[8.5px] text-[#eab308] font-bold uppercase tracking-widest mt-0.5">
                  Preencha os dados básicos, estoque de posicionamento e anexe os arquivos digitais de fábrica.
                </p>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="text-white hover:text-[#eab308] transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content Pane */}
            <div className="p-6 overflow-y-auto space-y-8 flex-1 scrollbar-thin">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* COLUMN 1: BASIC METADATA CONFIGS */}
                <div className="space-y-5">
                  <div className="flex items-center gap-3 border-b border-black/10 pb-2">
                    <span className="w-1.5 h-3 bg-black"></span>
                    <h4 className="text-[9.5px] font-black uppercase tracking-widest">A. Detalhes de Identidade</h4>
                  </div>

                  <div className="space-y-4">
                    {/* Name input */}
                    <div className="space-y-1">
                      <label className="text-[7.5px] font-black uppercase text-gray-400">Nome da Estampa / Arte <strong className="text-rose-500">*</strong></label>
                      <input 
                        type="text" 
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        className="w-full bg-neutral-50 px-3 py-2 text-xs font-bold uppercase border border-black/10 focus:outline-none focus:border-black"
                        placeholder="Ex: Escrita Peito Core, F PAC Full Logo..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* SKU Reference */}
                      <div className="space-y-1">
                        <label className="text-[7.5px] font-black uppercase text-gray-400 flex items-center justify-between">
                          <span>Código SKU</span>
                          <span className="text-[6.5px] italic text-[#eab308] font-bold">Auto-Gerável</span>
                        </label>
                        <input 
                          type="text" 
                          value={formSKU}
                          onChange={e => setFormSKU(e.target.value)}
                          className="w-full bg-neutral-100 font-mono text-xs font-black px-3 py-2 border border-black/10 focus:outline-none focus:border-black"
                          placeholder="Clique em autogerar..."
                        />
                      </div>

                      {/* Dropdown line */}
                      <div className="space-y-1">
                        <label className="text-[7.5px] font-black uppercase text-gray-400">Linha de Confecção</label>
                        <select
                          value={formLinha}
                          onChange={e => setFormLinha(e.target.value as any)}
                          className="w-full bg-neutral-50 px-3 py-2 text-xs font-bold border border-black/10 focus:outline-none focus:border-black"
                        >
                          <option value="Force">Force (Heavy Weight)</option>
                          <option value="Mark">Mark (Mid Weight)</option>
                          <option value="Prime">Prime (Multiuso)</option>
                          <option value="Todos">Todos (Universal)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Category field */}
                      <div className="space-y-1">
                        <label className="text-[7.5px] font-black uppercase text-gray-400">Categoria Geral</label>
                        <input 
                          type="text" 
                          value={formCategory}
                          onChange={e => setFormCategory(e.target.value)}
                          className="w-full bg-neutral-50 px-3 py-2 text-xs font-bold uppercase border border-black/10 focus:outline-none focus:border-black"
                          placeholder="Ex: Minimalista, Tipográfica..."
                        />
                      </div>

                      {/* Status */}
                      <div className="space-y-1">
                        <label className="text-[7.5px] font-black uppercase text-gray-400">Status Operacional</label>
                        <select
                          value={formStatus}
                          onChange={e => setFormStatus(e.target.value as any)}
                          className="w-full bg-neutral-50 px-3 py-2 text-xs font-bold border border-black/10 focus:outline-none focus:border-black"
                        >
                          <option value="active">Disponível para Compra (Ativa)</option>
                          <option value="inactive">Pausada (Indisponível)</option>
                          <option value="archived">Arquivada (Inativo Histórico)</option>
                        </select>
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="space-y-1">
                      <label className="text-[7.5px] font-black uppercase text-gray-400">Tags de Busca <span className="text-gray-300">(Separados por vírgula)</span></label>
                      <input 
                        type="text" 
                        value={formTags}
                        onChange={e => setFormTags(e.target.value)}
                        className="w-full bg-neutral-50 px-3 py-2 text-xs font-bold border border-black/10 focus:outline-none focus:border-black"
                        placeholder="Ex: dtf, peito, escandalo, oversized"
                      />
                    </div>

                    {/* Image Preview attachment */}
                    <div className="space-y-1.5">
                      <label className="text-[7.5px] font-black uppercase text-gray-400">Imagem de Pré-Visualização (Thumbnail)</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={formImage}
                          onChange={e => setFormImage(convertDriveUrlToDirect(e.target.value))}
                          className="flex-1 bg-neutral-50 text-[10px] font-bold px-3 py-2 border border-black/10 focus:outline-none"
                          placeholder="Link direto https://..."
                        />
                        <label className="bg-black hover:bg-[#eab308] text-white hover:text-black cursor-pointer px-4.5 py-2.5 transition-colors text-[9px] font-black uppercase tracking-wider flex items-center justify-center shrink-0">
                          {isUploadingPreview ? 'Processando...' : 'Fazer Upload'}
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={handlePreviewUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                      
                      {/* Image Preview Box */}
                      {formImage && (
                        <div className="p-3 bg-neutral-50 border border-black/[0.04] flex items-center justify-between gap-3 font-mono text-[9px]">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 border bg-white flex items-center justify-center p-0.5 overflow-hidden">
                              <img src={formImage} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                            </div>
                            <span className="text-green-600 font-bold uppercase">Mídia Vinculada</span>
                          </div>
                          <button 
                            onClick={() => setFormImage('')}
                            className="text-rose-500 hover:underline font-black uppercase text-[8px]"
                          >
                            Remover
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                      <label className="text-[7.5px] font-black uppercase text-gray-400">Descrição Técnica / Notas Adicionais</label>
                      <textarea
                        rows={3}
                        value={formDescription}
                        onChange={e => setFormDescription(e.target.value)}
                        className="w-full bg-neutral-50 px-3 py-2 text-xs font-bold border border-black/10 focus:outline-none focus:border-black"
                        placeholder="Ex: Cuidados na prensa. Aplicar a 150°C por 15 segundos..."
                      />
                    </div>

                  </div>
                </div>

                {/* COLUMN 2: WAREHOUSE STRUCTS AND CONTROL SIZES */}
                <div className="space-y-5">
                  <div className="flex items-center gap-3 border-b border-black/10 pb-2">
                    <span className="w-1.5 h-3 bg-[#eab308]"></span>
                    <h4 className="text-[9.5px] font-black uppercase tracking-widest">B. Posicionamento de Produção & Estoque Físico</h4>
                  </div>

                  <p className="text-[8.5px] uppercase font-bold text-gray-400 tracking-wider">
                    Selecione onde esta arte pode ser aplicada no tecido e configure o saldo físico disponível por variação dimensional (Pequeno, Médio, Grande).
                  </p>

                  <div className="grid grid-cols-1 gap-4">
                    {PRODUCTION_LOCATIONS.map(loc => {
                      const isActive = formAllowedLocations.includes(loc);
                      return (
                        <div 
                          key={loc}
                          className={cn(
                            "border transition-all",
                            isActive ? "bg-[#fafafa] border-black/20" : "bg-white border-black/5 opacity-50"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              let locations = [...formAllowedLocations];
                              let configs = { ...formLocationConfigs };
                              if (isActive) {
                                locations = locations.filter(l => l !== loc);
                              } else {
                                locations.push(loc);
                                if (!configs[loc]) {
                                  configs[loc] = {
                                    sizes: ['Pequeña', 'Média', 'Grande', 'Único'],
                                    quantities: [0, 0, 0, 0]
                                  };
                                }
                              }
                              setFormAllowedLocations(locations);
                              setFormLocationConfigs(configs);
                            }}
                            className="w-full p-3 flex justify-between items-center text-left"
                          >
                            <span className="text-[9px] font-black uppercase tracking-widest">{loc}</span>
                            <div className={cn(
                              "w-2.5 h-2.5 rounded-full",
                              isActive ? "bg-black border-2 border-black" : "bg-neutral-100 border border-neutral-300"
                            )} />
                          </button>

                          {/* Sizes input configs */}
                          {isActive && (
                            <div className="p-3 pt-0 grid grid-cols-4 gap-2">
                              {[0, 1, 2, 3].map(idx => (
                                <div key={idx} className="bg-white border border-black/5 p-2 space-y-1.5">
                                  {/* Size name label */}
                                  <input 
                                    type="text"
                                    placeholder={`TAM ${idx+1}`}
                                    value={formLocationConfigs[loc]?.sizes?.[idx] || ''}
                                    onChange={e => {
                                      const configs = { ...formLocationConfigs };
                                      const locConf = { ...(configs[loc] || { sizes: ['', '', '', ''], quantities: [0, 0, 0, 0] }) };
                                      const sizes = [...(locConf.sizes || ['', '', '', ''])];
                                      sizes[idx] = e.target.value;
                                      locConf.sizes = sizes;
                                      configs[loc] = locConf;
                                      setFormLocationConfigs(configs);
                                    }}
                                    className="w-full bg-neutral-50 px-1 py-1 text-[8.5px] text-center font-bold border border-black/5 focus:outline-none"
                                  />
                                  {/* Qty count input */}
                                  <input 
                                    type="number"
                                    min="0"
                                    placeholder="Qtd"
                                    value={formLocationConfigs[loc]?.quantities?.[idx] === 0 ? '' : (formLocationConfigs[loc]?.quantities?.[idx] ?? '')}
                                    onChange={e => {
                                      const configs = { ...formLocationConfigs };
                                      const locConf = { ...(configs[loc] || { sizes: ['', '', '', ''], quantities: [0, 0, 0, 0] }) };
                                      const quantities = [...(locConf.quantities || [0, 0, 0, 0])];
                                      quantities[idx] = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0);
                                      locConf.quantities = quantities;
                                      configs[loc] = locConf;
                                      setFormLocationConfigs(configs);
                                    }}
                                    className="w-full bg-white px-1 py-1 text-[8.5px] text-center font-black border border-black/10 focus:outline-none focus:border-[#eab308]"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                </div>

              </div>

              {/* SECTION C: PRODUCTION TECHNICAL FILES CENTRAL (PNG, SVG, PDF, DTF, VECTOR MATCH) */}
              <div className="space-y-5 border-t border-black/10 pt-8">
                <div className="flex items-center gap-3">
                  <span className="w-1.5 h-3 bg-blue-600"></span>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-black">C. Central de Arquivos Digitais de Impressão e Vetores</h4>
                </div>

                <p className="text-[8.5px] uppercase font-bold text-gray-400 tracking-wider">
                  Carregue os arquivos oficiais de factory (impressão em alta resolução) e matrizes vetoriais para que a equipe de confecção/sublimação faça o download direto.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {(['PNG', 'SVG', 'PDF', 'DTF', 'Vetor'] as const).map(fType => {
                    const activeFile = formProductionFiles.find(f => f.type === fType);
                    const isUploadingThis = isUploadingFile === fType;

                    return (
                      <div key={fType} className="bg-neutral-50 border border-black/5 p-4 flex flex-col justify-between gap-3 text-center">
                        <div className="space-y-1">
                          <span className="text-[13px] font-mono font-black tracking-widest text-[#eab308] bg-black px-3 py-0.5 leading-none inline-block">{fType}</span>
                          <span className="text-[7px] text-gray-400 uppercase font-bold block mt-1">Formato</span>
                        </div>

                        {activeFile ? (
                          <div className="space-y-2">
                            <p className="text-[8px] font-mono font-black text-emerald-700 truncate block uppercase leading-tight" title={activeFile.name}>
                              {activeFile.name}
                            </p>
                            <span className="text-[6.5px] block font-semibold text-neutral-400 uppercase">
                              v{activeFile.version} • {activeFile.uploadedAt.split(' ')[0]}
                            </span>
                            
                            <div className="flex gap-1 justify-center">
                              <a 
                                href={activeFile.url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="bg-white hover:bg-neutral-100 border border-black/10 p-1.5 flex items-center justify-center shrink-0"
                                title="Fazer Download da Matriz"
                              >
                                <Download size={11} className="text-gray-700" />
                              </a>
                              <button 
                                type="button"
                                onClick={() => removeProductionFile(activeFile.id)}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-200 p-1.5 flex items-center justify-center shrink-0"
                                title="Excluir arquivo ativo"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <span className="text-[7.5px] italic text-neutral-400 uppercase font-black block py-1.5">Sem Arquivo</span>
                            
                            <label className="border border-dashed border-neutral-300 hover:border-black bg-white cursor-pointer px-2 py-1.5 transition-colors text-[7.5px] font-black uppercase tracking-wider block">
                              {isUploadingThis ? 'Enviando...' : 'Anexar'}
                              <input 
                                type="file"
                                disabled={isUploadingThis}
                                onChange={e => handleProductionFileUpload(e, fType)}
                                className="hidden"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* VERSION HISTORY VIEW */}
                {formFileHistory.length > 0 && (
                  <div className="bg-neutral-50/50 border border-black/5 p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-gray-500 text-[8.5px] font-black uppercase tracking-wider">
                      <History size={12} />
                      <span>Histórico de Atualizações de Matrizes e Versões ({formFileHistory.length})</span>
                    </div>

                    <div className="max-h-[140px] overflow-y-auto space-y-1.5 divide-y divide-black/[0.03]">
                      {formFileHistory.slice().reverse().map((hist, hIdx) => {
                        return (
                          <div key={hIdx} className="pt-2 flex justify-between items-center text-[8.5px]">
                            <div className="flex items-center gap-2">
                              <span className="bg-zinc-200 text-zinc-700 font-mono font-black scale-90 px-1 py-0.2">{hist.type}</span>
                              <span className="text-neutral-500 font-semibold truncate max-w-sm" title={hist.name}>{hist.name}</span>
                              <span className="text-[7px] text-gray-400 font-bold uppercase">v{hist.version}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-neutral-400 font-semibold">{hist.uploadedAt} por {hist.uploadedBy}</span>
                              <a href={hist.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-black text-[7.5px] uppercase">Acessar</a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>

              {/* SECTION D: STORE RELATIONSHIP MAPPER */}
              {editingStamp && (
                <div className="space-y-4 border-t border-black/10 pt-8">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-3 bg-neutral-400"></span>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[#666]">D. Relacionamento e Produtos do Catálogo</h4>
                  </div>

                  <p className="text-[8.5px] uppercase font-bold text-gray-400 tracking-wider">
                    Esta estampa está vinculada às seguintes referências de produtos disponíveis no catálogo da loja virtual:
                  </p>

                  <div className="bg-neutral-50 border border-black/5 p-4">
                    {getPairedProducts(formLinha).length === 0 ? (
                      <p className="text-[9px] uppercase font-bold italic text-neutral-400">Nenhum produto cadastrado no catálogo utiliza este alinhamento de linha ({formLinha}).</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {getPairedProducts(formLinha).map(prod => {
                          const isProductAvailable = inventory[prod.slug]?.available !== false;
                          const productStock = inventory[prod.slug]?.stock || 0;
                          return (
                            <div key={prod.id} className="bg-white border p-3 flex justify-between items-center gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 bg-zinc-50 border flex items-center justify-center p-0.5">
                                  <img src={prod.images?.[0] || '/estampas/logo-fpac.png'} className="max-w-full max-h-full object-contain" onError={e => {e.currentTarget.src = '/estampas/logo-fpac.png';}} />
                                </div>
                                <div className="min-w-0">
                                  <span className="text-[9.5px] font-black uppercase text-black block truncate leading-none">{prod.name}</span>
                                  <span className="text-[7.5px] text-gray-400 uppercase font-mono tracking-widest">REF: {prod.slug}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className={cn("text-[10px] font-mono font-black block leading-none", productStock > 0 ? "text-emerald-700" : "text-rose-500")}>
                                  {productStock} Unidades
                                </span>
                                <span className="text-[7px] text-gray-400 uppercase font-bold">{isProductAvailable ? "Ativo" : "Pausado"}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer Controls */}
            <div className="bg-neutral-50 p-6 border-t border-black/10 flex justify-between items-center gap-4 shrink-0">
              {editingStamp ? (
                isConfirmingDeleteDrawer ? (
                  <div className="flex items-center gap-1.5 animate-pulse">
                    <button
                      type="button"
                      onClick={() => handleDeleteStamp(editingStamp.id, true)}
                      className="bg-rose-600 text-white border border-rose-700 hover:bg-rose-700 transition-all font-sans px-4 py-3 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                    >
                      Confirmar Exclusão?
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDeleteDrawer(false)}
                      className="bg-neutral-200 text-neutral-850 hover:bg-neutral-350 transition-all font-sans px-3 py-3 text-[10px] font-black uppercase tracking-wider"
                    >
                      Não
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDeleteDrawer(true)}
                    className="bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white transition-all px-4 py-3 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <Trash2 size={13} /> Deletar Matriz
                  </button>
                )
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="bg-white border border-black/10 text-gray-500 hover:text-black hover:border-black transition-all px-5 py-3 text-[10px] font-black uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveStamp}
                  className="bg-black text-white hover:bg-[#eab308] hover:text-black transition-all px-6 py-3 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Save size={13} /> Gravar Estampa
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

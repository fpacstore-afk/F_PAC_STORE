import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { 
  collection, onSnapshot, doc, setDoc, addDoc, updateDoc, deleteDoc, 
  serverTimestamp, query, orderBy 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { Design, DesignHistoryLog } from '../../types/design';
import { STAMP_CATEGORIES, StampCategory, normalizeStampCategory } from '../../constants/stampCategories';
import { 
  Sparkles, Plus, Search, Filter, Edit3, Trash2, Copy, Archive, 
  Eye, Download, Upload, Check, X, RefreshCw, Grid, List, Tag, 
  Layers, Palette, ShieldCheck, History, ArrowRight, ExternalLink, Wand2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

const DEMO_STAMP_NAMES = [
  'Anarchy & Order',
  'Cyber Skull Alpha',
  'Minimal FORCE Emblem',
  'Noise & Signal Vintage',
  'Underground Manifesto',
  'PRIME Monogram Gold'
];

const DEMO_STAMP_IDS = ['est_001', 'est_002', 'est_003', 'est_004', 'est_005', 'est_006'];

export function AdminStampsManager() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedCollection, setSelectedCollection] = useState<string>('Todas');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Drawer / Modal Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDesign, setEditingDesign] = useState<Partial<Design> | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Input Fields
  const [formData, setFormData] = useState<{
    code: string;
    name: string;
    category: string;
    collection: string;
    theme: string;
    tagsInput: string;
    description: string;
    pngUrl: string;
    svgUrl: string;
    mockupUrl: string;
    thumbnailUrl: string;
    masterFileUrl: string;
    author: string;
    status: 'active' | 'archived' | 'draft';
  }>({
    code: '',
    name: '',
    category: STAMP_CATEGORIES[0],
    collection: 'MARK',
    theme: 'Streetwear',
    tagsInput: '',
    description: '',
    pngUrl: '',
    svgUrl: '',
    mockupUrl: '',
    thumbnailUrl: '',
    masterFileUrl: '',
    author: user?.displayName || user?.email || 'F PAC Creative Lab',
    status: 'active'
  });

  // History Log Modal State
  const [historyModalDesign, setHistoryModalDesign] = useState<Design | null>(null);

  // Delete Confirmation State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Sync real-time Firestore collection 'designs' with automatic purge of legacy demo stamps
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'designs'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Design[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const docId = docSnap.id;
        const name = d.name || '';

        // FASE 3/6: Detect and auto-purge legacy demo/test stamps from database if present
        if (DEMO_STAMP_IDS.includes(docId) || DEMO_STAMP_NAMES.includes(name) || d.isDemo === true) {
          deleteDoc(doc(db, 'designs', docId)).catch(err => {
            console.error(`Erro ao remover estampa demo ${docId}:`, err);
          });
          return;
        }

        const normCat = normalizeStampCategory(d.category, name, d.description || '', d.tags || []);
        docs.push({
          id: docId,
          code: d.code || `EST-${docId.slice(0, 4).toUpperCase()}`,
          name: name || 'Estampa Sem Nome',
          category: normCat,
          collection: d.collection || 'MARK',
          theme: d.theme || 'Streetwear',
          tags: Array.isArray(d.tags) ? d.tags : [],
          description: d.description || '',
          pngUrl: d.pngUrl || d.image || '',
          svgUrl: d.svgUrl || '',
          mockupUrl: d.mockupUrl || d.thumbnailUrl || d.image || '',
          thumbnailUrl: d.thumbnailUrl || d.mockupUrl || d.image || '',
          masterFileUrl: d.masterFileUrl || '',
          dominantColors: Array.isArray(d.dominantColors) ? d.dominantColors : ['#000000', '#EAB308'],
          author: d.author || 'F PAC Creative Lab',
          status: d.status || 'active',
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          history: d.history || []
        });
      });

      setDesigns(docs);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar estampas:", error);
      handleFirestoreError(error, OperationType.GET, 'designs');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Automatic Migration helper to update old categories in Firestore
  const handleBatchMigrateCategories = async () => {
    setMigrating(true);
    let countUpdated = 0;
    try {
      for (const item of designs) {
        const normCat = normalizeStampCategory(item.category, item.name, item.description, item.tags);
        if (item.category !== normCat) {
          await updateDoc(doc(db, 'designs', item.id), {
            category: normCat,
            updatedAt: new Date().toISOString()
          });
          countUpdated++;
        }
      }
      if (countUpdated > 0) {
        toast.success(`Sucesso! ${countUpdated} estampa(s) foram migradas para as novas categorias F PAC.`);
      } else {
        toast.success("Todas as estampas já possuem categorias padronizadas F PAC!");
      }
    } catch (err) {
      console.error("Erro na migração de estampas:", err);
      toast.error("Erro ao realizar migração de categorias.");
    } finally {
      setMigrating(false);
    }
  };

  // Filtered designs
  const filteredDesigns = useMemo(() => {
    return designs.filter((item) => {
      const matchSearch = 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.theme && item.theme.toLowerCase().includes(searchTerm.toLowerCase())) ||
        item.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchCategory = selectedCategory === 'Todos' || item.category === selectedCategory;
      const matchCollection = selectedCollection === 'Todas' || item.collection === selectedCollection;
      const matchStatus = selectedStatus === 'todos' || item.status === selectedStatus;

      return matchSearch && matchCategory && matchCollection && matchStatus;
    });
  }, [designs, searchTerm, selectedCategory, selectedCollection, selectedStatus]);

  // Category counts statistics
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    STAMP_CATEGORIES.forEach(c => { stats[c] = 0; });
    designs.forEach(d => {
      const cat = normalizeStampCategory(d.category, d.name, d.description, d.tags);
      stats[cat] = (stats[cat] || 0) + 1;
    });
    return stats;
  }, [designs]);

  // Unique Filter Lists
  const categoriesList = ['Todos', ...STAMP_CATEGORIES];
  const collectionsList = ['Todas', 'MARK', 'FORCE', 'PRIME', 'ACERVO'];

  // Open Create Modal
  const handleOpenCreate = () => {
    const nextCodeNumber = designs.length + 1;
    const formattedCode = `EST-${String(nextCodeNumber).padStart(3, '0')}`;

    setEditingDesign(null);
    setFormData({
      code: formattedCode,
      name: '',
      category: STAMP_CATEGORIES[0],
      collection: 'MARK',
      theme: 'Streetwear',
      tagsInput: '',
      description: '',
      pngUrl: '',
      svgUrl: '',
      mockupUrl: '',
      thumbnailUrl: '',
      masterFileUrl: '',
      author: user?.displayName || user?.email || 'F PAC Creative Lab',
      status: 'active'
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (design: Design) => {
    setEditingDesign(design);
    setFormData({
      code: design.code,
      name: design.name,
      category: design.category,
      collection: design.collection,
      theme: design.theme || 'Streetwear',
      tagsInput: design.tags.join(', '),
      description: design.description || '',
      pngUrl: design.pngUrl,
      svgUrl: design.svgUrl || '',
      mockupUrl: design.mockupUrl,
      thumbnailUrl: design.thumbnailUrl,
      masterFileUrl: design.masterFileUrl || '',
      author: design.author || user?.email || 'F PAC Creative Lab',
      status: design.status
    });
    setIsModalOpen(true);
  };

  // Save / Update Design
  const handleSaveDesign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim()) {
      toast.error('Informe o código / SKU interno da estampa.');
      return;
    }

    const finalCode = formData.code.trim().toUpperCase();
    const finalName = formData.name.trim() || finalCode;

    setSaving(true);
    try {
      const parsedTags = formData.tagsInput
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);

      const timestamp = new Date().toISOString();
      const currentUserEmail = user?.email || 'admin@fpac.com';

      const newLog: DesignHistoryLog = {
        date: timestamp,
        author: currentUserEmail,
        action: editingDesign ? 'Edição de campos da estampa' : 'Criação inicial no acervo',
        details: `Status: ${formData.status} • Categoria: ${formData.category}`
      };

      if (editingDesign && editingDesign.id) {
        // Update document
        const existingHistory = editingDesign.history || [];
        const updatedHistory = [newLog, ...existingHistory];

        await updateDoc(doc(db, 'designs', editingDesign.id), {
          code: finalCode,
          name: finalName,
          category: formData.category,
          collection: formData.collection,
          theme: formData.theme,
          tags: parsedTags,
          description: formData.description,
          pngUrl: formData.pngUrl,
          svgUrl: formData.svgUrl,
          mockupUrl: formData.mockupUrl || formData.pngUrl,
          thumbnailUrl: formData.thumbnailUrl || formData.mockupUrl || formData.pngUrl,
          masterFileUrl: formData.masterFileUrl,
          author: formData.author,
          status: formData.status,
          updatedAt: timestamp,
          history: updatedHistory
        });
        toast.success(`Estampa SKU "${finalCode}" atualizada com sucesso!`);
      } else {
        // Create new document
        const newDocRef = doc(collection(db, 'designs'));
        await setDoc(newDocRef, {
          id: newDocRef.id,
          code: finalCode,
          name: finalName,
          category: formData.category,
          collection: formData.collection,
          theme: formData.theme,
          tags: parsedTags,
          description: formData.description,
          pngUrl: formData.pngUrl,
          svgUrl: formData.svgUrl,
          mockupUrl: formData.mockupUrl || formData.pngUrl,
          thumbnailUrl: formData.thumbnailUrl || formData.mockupUrl || formData.pngUrl,
          masterFileUrl: formData.masterFileUrl,
          author: formData.author,
          status: formData.status,
          createdAt: timestamp,
          updatedAt: timestamp,
          history: [newLog]
        });
        toast.success(`Estampa SKU "${finalCode}" cadastrada no acervo!`);
      }

      setIsModalOpen(false);
    } catch (error) {
      console.error("Erro ao salvar estampa:", error);
      handleFirestoreError(error, OperationType.WRITE, 'designs');
      toast.error('Erro ao salvar alteração.');
    } finally {
      setSaving(false);
    }
  };

  // Action: Duplicate Design
  const handleDuplicateDesign = async (design: Design) => {
    try {
      const nextCode = `${design.code}-COPY`;
      const timestamp = new Date().toISOString();
      const newDocRef = doc(collection(db, 'designs'));

      const copyLog: DesignHistoryLog = {
        date: timestamp,
        author: user?.email || 'admin@fpac.com',
        action: `Duplicado a partir de ${design.code} (${design.name})`
      };

      await setDoc(newDocRef, {
        ...design,
        id: newDocRef.id,
        code: nextCode,
        name: `${design.name} (Cópia)`,
        createdAt: timestamp,
        updatedAt: timestamp,
        history: [copyLog]
      });

      toast.success(`Estampa duplicada como "${design.name} (Cópia)"!`);
    } catch (error) {
      console.error("Erro ao duplicar estampa:", error);
      handleFirestoreError(error, OperationType.WRITE, 'designs');
    }
  };

  // Action: Archive / Toggle Status
  const handleToggleArchive = async (design: Design) => {
    try {
      const newStatus = design.status === 'archived' ? 'active' : 'archived';
      const timestamp = new Date().toISOString();

      const log: DesignHistoryLog = {
        date: timestamp,
        author: user?.email || 'admin@fpac.com',
        action: newStatus === 'archived' ? 'Estampa arquivada' : 'Estampa reativada'
      };

      const history = [log, ...(design.history || [])];

      await updateDoc(doc(db, 'designs', design.id), {
        status: newStatus,
        updatedAt: timestamp,
        history
      });

      toast.success(`Estampa "${design.name}" ${newStatus === 'archived' ? 'arquivada' : 'reativada'}!`);
    } catch (error) {
      console.error("Erro ao alterar status:", error);
      handleFirestoreError(error, OperationType.UPDATE, `designs/${design.id}`);
    }
  };

  // Action: Delete Design
  const handleDeleteDesign = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'designs', id));
      toast.success('Estampa removida do acervo.');
      setDeleteConfirmId(null);
    } catch (error) {
      console.error("Erro ao excluir estampa:", error);
      handleFirestoreError(error, OperationType.DELETE, `designs/${id}`);
    }
  };

  // Action: Send to PRIME Customizer
  const handleSendToPrime = (design: Design) => {
    navigate(`/prime?design=${encodeURIComponent(design.id)}&name=${encodeURIComponent(design.name)}&png=${encodeURIComponent(design.pngUrl || '')}`);
  };

  return (
    <div className="space-y-4 text-black">
      {/* HERO HEADER - ESTAMPAS STANDARD PATTERN */}
      <div className="bg-black text-white px-4 md:px-8 py-4 md:py-6 border-b-2 border-[#eab308] relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-12 translate-y-12 pointer-events-none">
          <Palette size={200} className="text-white" />
        </div>

        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#eab308] text-black px-2 py-0.5 text-[8px] font-black uppercase tracking-widest font-mono">
                SGC v2.4
              </span>
              <span className="text-gray-400 text-[9px] font-bold uppercase tracking-[0.2em] font-sans">
                • ACERVO DE ESTAMPAS & ARTES
              </span>
            </div>

            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight italic font-sans">
              GESTÃO DE <span className="text-[#eab308]">ESTAMPAS & ARTES</span>
            </h1>
            <p className="text-xs text-gray-400 font-mono tracking-wider">
              Biblioteca autônoma de estampas e ilustrações conceituais. Sem vincular estoque ou preço físico.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBatchMigrateCategories}
              disabled={migrating}
              className="bg-black text-[#eab308] border border-[#eab308] hover:bg-[#eab308] hover:text-black font-black text-[9px] uppercase tracking-wider px-3 py-2 flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
              title="Migrar estampas antigas para as 6 categorias padrão F PAC"
            >
              <Wand2 size={13} className={cn("text-[#eab308]", migrating && "animate-spin")} />
              {migrating ? 'Migrando...' : 'Padronizar Categorias'}
            </button>
            <button
              onClick={handleOpenCreate}
              className="bg-[#eab308] text-black hover:bg-white transition-all px-4 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={13} /> Nova Estampa
            </button>
          </div>
        </div>
      </div>

      {/* CATEGORIES STATS DASHBOARD - STANDARD PATTERN */}
      <div className="max-w-7xl mx-auto px-2 md:px-4 -translate-y-3 relative z-20">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {STAMP_CATEGORIES.map((cat) => {
            const count = categoryStats[cat] || 0;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(isSelected ? 'Todos' : cat)}
                className={cn(
                  "p-3 border transition-all text-left flex flex-col justify-between cursor-pointer shadow-xs hover:shadow-md",
                  isSelected 
                    ? "bg-[#eab308] text-black border-black font-black" 
                    : "bg-white border-black/10 text-black hover:border-black"
                )}
              >
                <div className="text-[9px] font-black uppercase tracking-wider truncate mb-1 font-sans">
                  {cat}
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black font-mono">{count}</span>
                  <span className="text-[8px] opacity-70 font-mono uppercase">artes</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* FILTER AND SEARCH CONTROLS */}
      <div className="max-w-7xl mx-auto px-2 md:px-4 space-y-4">
        <div className="bg-white border border-black/10 p-3 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por nome, código, tag..."
              className="w-full bg-white border border-gray-300 text-xs text-black pl-9 pr-3 py-2 placeholder-gray-400 focus:outline-none focus:border-black"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Select Filters & View Mode */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-2 text-xs text-gray-600 font-bold">
              <span>Coleção:</span>
              <select
                value={selectedCollection}
                onChange={(e) => setSelectedCollection(e.target.value)}
                className="bg-white border border-gray-300 text-black text-xs px-2.5 py-1.5 focus:outline-none focus:border-black"
              >
                {collectionsList.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-600 font-bold">
              <span>Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-white border border-gray-300 text-black text-xs px-2.5 py-1.5 focus:outline-none focus:border-black"
              >
                <option value="todos">Todos</option>
                <option value="active">Ativas</option>
                <option value="draft">Rascunhos</option>
                <option value="archived">Arquivadas</option>
              </select>
            </div>

            <div className="flex border border-neutral-800 bg-neutral-950 p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={cn("p-1.5 transition-colors cursor-pointer", viewMode === 'grid' ? "bg-[#eab308] text-black" : "text-neutral-400 hover:text-white")}
              >
                <Grid size={15} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn("p-1.5 transition-colors cursor-pointer", viewMode === 'list' ? "bg-[#eab308] text-black" : "text-neutral-400 hover:text-white")}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-t border-neutral-800 pt-3">
          <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider shrink-0">Categorias:</span>
          {categoriesList.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer border",
                selectedCategory === cat
                  ? "bg-[#eab308] text-black border-[#eab308]"
                  : "bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT LIST / GRID */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <RefreshCw className="animate-spin mx-auto text-[#eab308]" size={28} />
          <p className="text-xs text-neutral-400 uppercase font-mono tracking-widest">Carregando acervo de estampas...</p>
        </div>
      ) : filteredDesigns.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center space-y-4 my-4">
          <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto text-[#eab308]">
            <Sparkles size={28} />
          </div>
          <h3 className="text-white font-black text-sm uppercase tracking-wider">
            Nenhuma estampa cadastrada
          </h3>
          <p className="text-neutral-400 text-xs max-w-md mx-auto leading-relaxed">
            {designs.length === 0 
              ? 'O acervo de estampas está totalmente limpo e pronto para receber artes oficiais da F PAC STORE.'
              : 'Nenhuma estampa encontrada para os filtros aplicados.'}
          </p>
          <button
            onClick={handleOpenCreate}
            className="bg-[#eab308] hover:bg-white text-black font-black text-xs uppercase tracking-wider px-6 py-3 cursor-pointer inline-flex items-center gap-2 transition-all shadow-md"
          >
            <Plus size={16} /> Nova Estampa
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredDesigns.map((design) => (
            <div
              key={design.id}
              className="bg-neutral-900 border border-neutral-800 hover:border-neutral-600 transition-all flex flex-col justify-between overflow-hidden relative group"
            >
              {/* Image & Badges */}
              <div className="relative aspect-square bg-neutral-950 overflow-hidden flex items-center justify-center p-2">
                <img
                  src={design.mockupUrl || design.pngUrl || design.thumbnailUrl}
                  alt={design.name}
                  className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                />

                <div className="absolute top-2 left-2 bg-black/80 text-[#eab308] text-[9px] font-mono font-bold px-2 py-0.5 border border-[#eab308]/30">
                  {design.code}
                </div>

                <div className={cn(
                  "absolute top-2 right-2 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 border",
                  design.status === 'active' ? "bg-emerald-950/80 text-emerald-400 border-emerald-800" :
                  design.status === 'draft' ? "bg-amber-950/80 text-amber-400 border-amber-800" :
                  "bg-rose-950/80 text-rose-400 border-rose-800"
                )}>
                  {design.status}
                </div>
              </div>

              {/* Information */}
              <div className="p-3 space-y-2">
                <div>
                  <span className="text-[9px] text-[#eab308] font-mono uppercase tracking-widest block">
                    {design.collection} • {design.category}
                  </span>
                  <h4 className="font-black text-xs uppercase text-white line-clamp-1 font-mono">
                    SKU: {design.code}
                  </h4>
                  {design.name && design.name !== design.code && (
                    <span className="text-[10px] text-neutral-400 block line-clamp-1">{design.name}</span>
                  )}
                </div>

                <p className="text-[10px] text-neutral-400 line-clamp-2 leading-relaxed">
                  {design.description || 'Sem descrição.'}
                </p>

                {design.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {design.tags.slice(0, 3).map(t => (
                      <span key={t} className="bg-neutral-950 text-neutral-500 text-[8px] px-1 py-0.5 border border-neutral-800">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="p-2 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between gap-1">
                <button
                  onClick={() => handleSendToPrime(design)}
                  className="bg-[#eab308]/10 hover:bg-[#eab308] text-[#eab308] hover:text-black transition-colors p-1.5 text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer border border-[#eab308]/30"
                  title="Testar na Coleção PRIME"
                >
                  <Sparkles size={11} /> PRIME
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setHistoryModalDesign(design)}
                    className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Histórico de Alterações"
                  >
                    <History size={13} />
                  </button>
                  <button
                    onClick={() => handleDuplicateDesign(design)}
                    className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Duplicar Estampa"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    onClick={() => handleToggleArchive(design)}
                    className="p-1.5 text-neutral-400 hover:text-amber-400 hover:bg-neutral-800 transition-colors cursor-pointer"
                    title={design.status === 'archived' ? 'Reativar Estampa' : 'Arquivar Estampa'}
                  >
                    <Archive size={13} />
                  </button>
                  <button
                    onClick={() => handleOpenEdit(design)}
                    className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Editar Estampa"
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(design.id)}
                    className="p-1.5 text-rose-500 hover:text-rose-300 hover:bg-rose-950/40 transition-colors cursor-pointer"
                    title="Excluir Estampa"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="space-y-2">
          {filteredDesigns.map((design) => (
            <div
              key={design.id}
              className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <img
                  src={design.thumbnailUrl || design.mockupUrl || design.pngUrl}
                  alt={design.name}
                  className="w-12 h-12 object-contain bg-neutral-950 border border-neutral-800 shrink-0 p-1"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold text-[#eab308]">SKU: {design.code}</span>
                    <span className="text-[9px] text-neutral-400 uppercase">• {design.collection} • {design.category}</span>
                  </div>
                  <h4 className="font-black text-xs text-white uppercase font-mono">{design.code}</h4>
                  <p className="text-[10px] text-neutral-400 line-clamp-1">{design.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <button
                  onClick={() => handleSendToPrime(design)}
                  className="bg-[#eab308] text-black hover:bg-white font-black text-[9px] uppercase px-3 py-1.5 flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles size={11} /> Testar PRIME
                </button>
                <button
                  onClick={() => setHistoryModalDesign(design)}
                  className="p-1.5 bg-neutral-950 text-neutral-300 hover:text-white border border-neutral-800 cursor-pointer"
                  title="Histórico"
                >
                  <History size={13} />
                </button>
                <button
                  onClick={() => handleDuplicateDesign(design)}
                  className="p-1.5 bg-neutral-950 text-neutral-300 hover:text-white border border-neutral-800 cursor-pointer"
                  title="Duplicar"
                >
                  <Copy size={13} />
                </button>
                <button
                  onClick={() => handleOpenEdit(design)}
                  className="p-1.5 bg-neutral-950 text-neutral-300 hover:text-white border border-neutral-800 cursor-pointer"
                  title="Editar"
                >
                  <Edit3 size={13} />
                </button>
                <button
                  onClick={() => setDeleteConfirmId(design.id)}
                  className="p-1.5 bg-rose-950/40 text-rose-400 hover:text-rose-200 border border-rose-800 cursor-pointer"
                  title="Excluir"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL / DRAWER FORM FOR CREATING & EDITING ESTAMPA */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            key="estampa-form-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              key="estampa-form-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-neutral-700 w-full max-w-2xl p-6 relative shadow-2xl text-white space-y-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-[#eab308]" />
                  <h3 className="font-black text-sm uppercase text-white tracking-wider">
                    {editingDesign ? `Editar Estampa (${editingDesign.code})` : 'Nova Estampa no Acervo'}
                  </h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveDesign} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Code */}
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-400 uppercase mb-1">Código Interno *</label>
                    <input
                      type="text"
                      required
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="Ex: EST-001"
                      className="w-full bg-neutral-950 border border-neutral-800 text-xs px-3 py-2 text-white font-mono focus:border-[#eab308] focus:outline-none"
                    />
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-400 uppercase mb-1">Nome da Estampa (Opcional - Usa SKU se vazio)</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Anarchy & Order (ou deixe em branco)"
                      className="w-full bg-neutral-950 border border-neutral-800 text-xs px-3 py-2 text-white focus:border-[#eab308] focus:outline-none"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-400 uppercase mb-1">Categoria Oficial F PAC *</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-800 text-xs px-3 py-2 text-white focus:border-[#eab308] focus:outline-none"
                    >
                      {STAMP_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Collection */}
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-400 uppercase mb-1">Coleção *</label>
                    <select
                      value={formData.collection}
                      onChange={(e) => setFormData({ ...formData, collection: e.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-800 text-xs px-3 py-2 text-white focus:border-[#eab308] focus:outline-none"
                    >
                      <option value="MARK">MARK (Artes Exclusivas)</option>
                      <option value="FORCE">FORCE (Minimalista)</option>
                      <option value="PRIME">PRIME (Customizável)</option>
                      <option value="ACERVO">ACERVO (Edição Especial)</option>
                    </select>
                  </div>

                  {/* Theme */}
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-400 uppercase mb-1">Tema / Estilo</label>
                    <input
                      type="text"
                      value={formData.theme}
                      onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                      placeholder="Ex: Underground, Cyber, Retro Sound"
                      className="w-full bg-neutral-950 border border-neutral-800 text-xs px-3 py-2 text-white focus:border-[#eab308] focus:outline-none"
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-400 uppercase mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full bg-neutral-950 border border-neutral-800 text-xs px-3 py-2 text-white focus:border-[#eab308] focus:outline-none"
                    >
                      <option value="active">Ativa</option>
                      <option value="draft">Rascunho</option>
                      <option value="archived">Arquivada</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] font-mono text-neutral-400 uppercase mb-1">Descrição Conceitual</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Explicação sobre o conceito da arte, referências visuais e mensagem da marca..."
                    className="w-full bg-neutral-950 border border-neutral-800 text-xs px-3 py-2 text-white focus:border-[#eab308] focus:outline-none"
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-[10px] font-mono text-neutral-400 uppercase mb-1">Tags (separadas por vírgula)</label>
                  <input
                    type="text"
                    value={formData.tagsInput}
                    onChange={(e) => setFormData({ ...formData, tagsInput: e.target.value })}
                    placeholder="Ex: typography, black, streetwear, heavy"
                    className="w-full bg-neutral-950 border border-neutral-800 text-xs px-3 py-2 text-white focus:border-[#eab308] focus:outline-none"
                  />
                </div>

                {/* File URLs */}
                <div className="bg-neutral-950 border border-neutral-800 p-4 space-y-3">
                  <span className="text-[10px] font-mono uppercase text-[#eab308] font-bold block">Arquivos da Estampa</span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-mono text-neutral-400 uppercase mb-1">PNG Transparente URL (Customizador)</label>
                      <input
                        type="text"
                        value={formData.pngUrl}
                        onChange={(e) => setFormData({ ...formData, pngUrl: e.target.value })}
                        placeholder="URL da imagem PNG transparente"
                        className="w-full bg-neutral-900 border border-neutral-800 text-xs px-2.5 py-1.5 text-white focus:border-[#eab308] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono text-neutral-400 uppercase mb-1">Mockup em Camiseta URL</label>
                      <input
                        type="text"
                        value={formData.mockupUrl}
                        onChange={(e) => setFormData({ ...formData, mockupUrl: e.target.value })}
                        placeholder="URL da foto do mockup"
                        className="w-full bg-neutral-900 border border-neutral-800 text-xs px-2.5 py-1.5 text-white focus:border-[#eab308] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono text-neutral-400 uppercase mb-1">Vetor SVG URL (Opcional)</label>
                      <input
                        type="text"
                        value={formData.svgUrl}
                        onChange={(e) => setFormData({ ...formData, svgUrl: e.target.value })}
                        placeholder="URL do arquivo SVG"
                        className="w-full bg-neutral-900 border border-neutral-800 text-xs px-2.5 py-1.5 text-white focus:border-[#eab308] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono text-neutral-400 uppercase mb-1">Arquivo Mestre / Impressão URL (Opcional)</label>
                      <input
                        type="text"
                        value={formData.masterFileUrl}
                        onChange={(e) => setFormData({ ...formData, masterFileUrl: e.target.value })}
                        placeholder="Link drive/cloud para arquivo HD de produção"
                        className="w-full bg-neutral-900 border border-neutral-800 text-xs px-2.5 py-1.5 text-white focus:border-[#eab308] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Actions */}
                <div className="flex justify-end gap-3 pt-3 border-t border-neutral-800">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setIsModalOpen(false)}
                    className="bg-neutral-800 hover:bg-neutral-700 text-white font-black text-xs uppercase px-4 py-2.5 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-[#eab308] hover:bg-white text-black font-black text-xs uppercase px-6 py-2.5 flex items-center gap-2 transition-colors cursor-pointer shadow-md"
                  >
                    {saving && <RefreshCw size={14} className="animate-spin" />}
                    {saving ? 'Salvando...' : 'Salvar Estampa'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HISTORY MODAL */}
      <AnimatePresence>
        {historyModalDesign && (
          <motion.div
            key="history-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
            onClick={() => setHistoryModalDesign(null)}
          >
            <motion.div
              key="history-modal-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-neutral-700 w-full max-w-lg p-6 relative shadow-2xl text-white space-y-4"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2 text-[#eab308]">
                  <History size={18} />
                  <h3 className="font-black text-sm uppercase text-white tracking-wider">
                    Histórico de Alterações • {historyModalDesign.code}
                  </h3>
                </div>
                <button onClick={() => setHistoryModalDesign(null)} className="text-neutral-400 hover:text-white cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {(!historyModalDesign.history || historyModalDesign.history.length === 0) ? (
                  <p className="text-xs text-neutral-500 italic text-center py-4">Nenhum registro no histórico.</p>
                ) : (
                  historyModalDesign.history.map((h, index) => (
                    <div key={index} className="bg-neutral-950 border border-neutral-800 p-3 text-xs space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-neutral-400 font-mono">
                        <span>{new Date(h.date).toLocaleString('pt-BR')}</span>
                        <span className="text-[#eab308] font-bold">{h.author}</span>
                      </div>
                      <p className="font-bold text-white text-xs">{h.action}</p>
                      {h.details && <p className="text-[10px] text-neutral-400 font-mono">{h.details}</p>}
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => setHistoryModalDesign(null)}
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-black text-xs uppercase py-2 cursor-pointer"
              >
                Fechar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            key="delete-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
            onClick={() => setDeleteConfirmId(null)}
          >
            <motion.div
              key="delete-modal-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-rose-800 w-full max-w-md p-6 relative shadow-2xl text-white space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-500">
                <Trash2 size={24} />
                <h3 className="font-black text-sm uppercase tracking-wider text-white">Excluir Estampa do Acervo?</h3>
              </div>
              <p className="text-xs text-neutral-300">
                Esta ação removerá a estampa permanentemente da biblioteca de artes. Tem certeza?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white font-black text-xs uppercase px-4 py-2 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeleteDesign(deleteConfirmId)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase px-4 py-2 cursor-pointer"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

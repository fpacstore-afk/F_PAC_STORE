import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Design } from '../types/design';
import { STAMP_CATEGORIES, StampCategory, normalizeStampCategory } from '../constants/stampCategories';
import { 
  Search, Filter, Sparkles, ArrowRight, Eye, Tag, Layers, 
  Palette, Info, X, Check, ShieldCheck, RefreshCw, Grid, List
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { cn } from '../lib/utils';

export default function StampsGallery() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedCollection, setSelectedCollection] = useState<string>('Todas');
  const [selectedTheme, setSelectedTheme] = useState<string>('Todos');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Detail Modal
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [activeColorVariant, setActiveColorVariant] = useState<number>(0);

  // Sync with Firestore collection 'designs'
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'designs'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Design[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.status !== 'archived') {
          const normCat = normalizeStampCategory(d.category, d.name || '', d.description || '', d.tags || []);
          fetched.push({
            id: docSnap.id,
            code: d.code || `EST-${docSnap.id.slice(0, 4).toUpperCase()}`,
            name: d.name || 'Estampa Sem Nome',
            category: normCat,
            collection: d.collection || 'MARK',
            theme: d.theme || 'Streetwear',
            tags: Array.isArray(d.tags) ? d.tags : [],
            description: d.description || '',
            pngUrl: d.pngUrl || d.image || '',
            svgUrl: d.svgUrl || '',
            mockupUrl: d.mockupUrl || d.image || '',
            thumbnailUrl: d.thumbnailUrl || d.mockupUrl || d.image || '',
            masterFileUrl: d.masterFileUrl || '',
            dominantColors: Array.isArray(d.dominantColors) ? d.dominantColors : ['#000000', '#EAB308'],
            colorVariants: Array.isArray(d.colorVariants) ? d.colorVariants : [
              { name: 'Preto Carbono', hex: '#111111' },
              { name: 'Off White', hex: '#F4F4F0' }
            ],
            author: d.author || 'F PAC Creative Lab',
            status: d.status || 'active',
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            history: d.history || []
          });
        }
      });
      setDesigns(fetched);
      setLoading(false);
    }, (error) => {
      console.warn("Erro ao buscar estampas do banco:", error);
      setDesigns([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filtered designs logic
  const filteredDesigns = useMemo(() => {
    return designs.filter((item) => {
      const matchSearch = 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.theme && item.theme.toLowerCase().includes(searchTerm.toLowerCase())) ||
        item.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchCategory = selectedCategory === 'Todos' || item.category === selectedCategory;
      const matchCollection = selectedCollection === 'Todas' || item.collection.toLowerCase() === selectedCollection.toLowerCase();
      const matchTheme = selectedTheme === 'Todos' || (item.theme && item.theme.toLowerCase() === selectedTheme.toLowerCase());

      return matchSearch && matchCategory && matchCollection && matchTheme;
    });
  }, [designs, searchTerm, selectedCategory, selectedCollection, selectedTheme]);

  // Unique categories, collections, themes
  const categoriesList = ['Todos', ...STAMP_CATEGORIES];

  const collectionsList = useMemo(() => {
    const cols = Array.from(new Set(designs.map(d => d.collection)));
    return ['Todas', ...cols];
  }, [designs]);

  // Action: Launch PRIME Configurator with chosen design
  const handleOpenInPrime = (design: Design) => {
    navigate(`/prime?design=${encodeURIComponent(design.id)}&name=${encodeURIComponent(design.name)}&png=${encodeURIComponent(design.pngUrl || '')}`);
  };

  return (
    <div className="min-h-screen bg-white text-black pt-6 pb-20 font-sans">
      <Helmet>
        <title>Galeria de Estampas Exclusivas | F PAC STORE</title>
        <meta name="description" content="Explore o acervo de artes e estampas conceituais da F PAC STORE. Escolha sua arte e personalize sua camiseta na Coleção PRIME." />
      </Helmet>

      {/* HEADER HERO */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10 text-center space-y-4">
        <div className="inline-flex items-center gap-2 bg-[#eab308]/10 border border-[#eab308]/40 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black">
          <Sparkles size={12} className="text-[#eab308]" />
          BIBLIOTECA DE ARTES & CONCEPT DESIGNS
        </div>

        <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight font-sans text-black">
          CATÁLOGO DE <span className="text-[#eab308]">ESTAMPAS</span>
        </h1>

        <p className="max-w-2xl mx-auto text-xs md:text-sm text-neutral-600 font-medium leading-relaxed">
          Nossas estampas são artes conceituais exclusivas e não são vendidas separadamente. 
          Escolha qualquer estampa deste acervo para criar sua peça personalizada na <strong className="text-black font-bold">Coleção PRIME</strong>.
        </p>

        {/* STATS STRIP */}
        <div className="pt-4 flex flex-wrap justify-center gap-6 text-[11px] font-mono text-neutral-500 border-t border-neutral-200 max-w-xl mx-auto">
          <div><strong className="text-black">{designs.length}</strong> ARTES ATIVAS</div>
          <div>•</div>
          <div><strong className="text-black">ALTA FIDELIDADE</strong> DTF HD</div>
          <div>•</div>
          <div><strong className="text-[#ca8a04] font-bold">COLEÇÃO PRIME</strong> COMPATÍVEL</div>
        </div>
      </section>

      {/* FILTERS & SEARCH BAR */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 space-y-4">
        <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-xs shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar estampa por nome, código (EST-001), tag..."
                className="w-full bg-white border border-neutral-300 text-xs py-2.5 pl-9 pr-3 text-black placeholder-neutral-400 focus:outline-none focus:border-[#eab308] transition-colors"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Collection Dropdown & View Mode */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
              <div className="flex items-center gap-2 text-xs text-neutral-600 font-medium">
                <span>Coleção:</span>
                <select
                  value={selectedCollection}
                  onChange={(e) => setSelectedCollection(e.target.value)}
                  className="bg-white border border-neutral-300 text-black text-xs px-3 py-2 focus:outline-none focus:border-[#eab308]"
                >
                  {collectionsList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Grid / List Mode */}
              <div className="flex border border-neutral-300 bg-white p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn("p-1.5 transition-colors cursor-pointer", viewMode === 'grid' ? "bg-[#eab308] text-black" : "text-neutral-500 hover:text-black")}
                  title="Visualização em Grade"
                >
                  <Grid size={15} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn("p-1.5 transition-colors cursor-pointer", viewMode === 'list' ? "bg-[#eab308] text-black" : "text-neutral-500 hover:text-black")}
                  title="Visualização em Lista"
                >
                  <List size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Category Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-t border-neutral-200 pt-3">
            <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider shrink-0 mr-1">Categoria:</span>
            {categoriesList.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer border",
                  selectedCategory === cat
                    ? "bg-[#eab308] text-black border-[#eab308]"
                    : "bg-neutral-100 text-neutral-700 border-neutral-200 hover:border-neutral-300"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* DESIGNS GRID / LIST */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="animate-spin mx-auto text-[#ca8a04]" size={32} />
            <p className="text-xs text-neutral-500 uppercase font-mono tracking-widest">Carregando acervo de artes...</p>
          </div>
        ) : filteredDesigns.length === 0 ? (
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-12 text-center space-y-4 my-8 max-w-xl mx-auto shadow-sm">
            <div className="w-16 h-16 bg-neutral-200 rounded-full flex items-center justify-center mx-auto text-black">
              <Palette size={28} />
            </div>
            <h3 className="text-lg font-black uppercase text-black tracking-tight">
              {designs.length === 0 ? 'Nenhuma estampa cadastrada no acervo' : 'Nenhuma estampa encontrada'}
            </h3>
            <p className="text-xs text-neutral-600 max-w-md mx-auto leading-relaxed">
              {designs.length === 0 
                ? 'Novas estampas e artes exclusivas F PAC serão exibidas aqui assim que forem cadastradas pelo administrador.'
                : 'Não encontramos estampas para os filtros selecionados. Tente buscar por outro termo ou limpar os filtros.'}
            </p>
            {designs.length > 0 ? (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('Todos');
                  setSelectedCollection('Todas');
                }}
                className="bg-[#eab308] text-black font-black text-xs uppercase px-5 py-2.5 hover:bg-black hover:text-white transition-colors cursor-pointer"
              >
                Limpar Filtros
              </button>
            ) : (
              <div className="flex justify-center gap-3 pt-2">
                <Link
                  to="/prime"
                  className="bg-[#eab308] hover:bg-black hover:text-white text-black font-black text-xs uppercase tracking-wider px-6 py-3 transition-all inline-flex items-center gap-2"
                >
                  <Sparkles size={14} /> Personalizar Camiseta PRIME
                </Link>
              </div>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-6">
            {filteredDesigns.map((design) => (
              <motion.div
                key={design.id}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-neutral-200 hover:border-[#eab308] transition-all group flex flex-col justify-between overflow-hidden relative shadow-sm hover:shadow-md"
              >
                {/* Image & Badges Container */}
                <div>
                  <div className="relative aspect-square bg-neutral-100 overflow-hidden cursor-pointer" onClick={() => setSelectedDesign(design)}>
                    <img
                      src={design.mockupUrl || design.thumbnailUrl || design.pngUrl}
                      alt={design.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />

                    {/* Code Badge */}
                    <div className="absolute top-3 left-3 bg-black/90 text-[#eab308] text-[9px] font-mono font-bold px-2 py-1 border border-[#eab308]/30">
                      {design.code}
                    </div>

                    {/* Collection Tag */}
                    <div className="absolute top-3 right-3 bg-black/90 text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 border border-neutral-800">
                      {design.collection}
                    </div>

                    {/* Quick Eye Button */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="bg-black text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 border border-white/20 flex items-center gap-1.5 shadow-xl">
                        <Eye size={13} /> Detalhes da Arte
                      </span>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[9px] text-[#ca8a04] font-bold uppercase tracking-widest font-mono block">
                          {design.category} • {design.theme || 'Streetwear'}
                        </span>
                        <h3 className="font-black text-sm uppercase text-black font-mono tracking-tight group-hover:text-[#ca8a04] transition-colors">
                          SKU: {design.code}
                        </h3>
                      </div>
                    </div>

                    <p className="text-[11px] text-neutral-600 line-clamp-2 leading-relaxed">
                      {design.description || 'Estampa exclusiva para aplicação em peças da Coleção PRIME.'}
                    </p>

                    {/* Tags */}
                    {design.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {design.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="bg-neutral-100 text-neutral-600 text-[9px] px-1.5 py-0.5 border border-neutral-200">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action */}
                <div className="p-4 pt-0">
                  <button
                    onClick={() => handleOpenInPrime(design)}
                    className="w-full bg-[#eab308] hover:bg-black hover:text-white text-black font-black text-[10px] uppercase tracking-wider py-2.5 px-3 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                  >
                    <Sparkles size={13} /> Personalizar na Coleção PRIME
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="space-y-3">
            {filteredDesigns.map((design) => (
              <div
                key={design.id}
                className="bg-white border border-neutral-200 hover:border-[#eab308] transition-all p-3 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs"
              >
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <img
                    src={design.thumbnailUrl || design.mockupUrl || design.pngUrl}
                    alt={design.name}
                    className="w-16 h-16 object-cover bg-neutral-100 shrink-0 cursor-pointer border border-neutral-200"
                    onClick={() => setSelectedDesign(design)}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono font-bold text-[#ca8a04]">SKU: {design.code}</span>
                      <span className="text-[9px] text-neutral-500 uppercase">• {design.collection} • {design.category}</span>
                    </div>
                    <h3 className="font-black text-sm uppercase text-black font-mono hover:text-[#ca8a04] cursor-pointer" onClick={() => setSelectedDesign(design)}>
                      {design.code}
                    </h3>
                    <p className="text-[10px] text-neutral-500 line-clamp-1">{design.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => setSelectedDesign(design)}
                    className="bg-neutral-100 border border-neutral-300 hover:bg-neutral-200 text-black font-black text-[9px] uppercase px-3 py-2 cursor-pointer"
                  >
                    Ver Detalhes
                  </button>
                  <button
                    onClick={() => handleOpenInPrime(design)}
                    className="bg-[#eab308] hover:bg-black hover:text-white text-black font-black text-[9px] uppercase px-4 py-2 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles size={12} /> Usar na PRIME
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ESTAMPA DETAIL MODAL */}
      <AnimatePresence>
        {selectedDesign && (
          <motion.div
            key="estampa-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            onClick={() => setSelectedDesign(null)}
          >
            <motion.div
              key="estampa-modal-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-neutral-300 w-full max-w-3xl overflow-hidden relative shadow-2xl text-black max-h-[90vh] flex flex-col md:flex-row"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedDesign(null)}
                className="absolute top-3 right-3 z-10 bg-black hover:bg-neutral-800 text-white p-1.5 cursor-pointer"
              >
                <X size={16} />
              </button>

              {/* Left Column: Image Preview */}
              <div className="md:w-1/2 bg-neutral-100 p-6 flex items-center justify-center relative border-b md:border-b-0 md:border-r border-neutral-200">
                <img
                  src={selectedDesign.mockupUrl || selectedDesign.pngUrl}
                  alt={selectedDesign.name}
                  className="max-h-[350px] w-auto object-contain"
                />
                <div className="absolute bottom-3 left-3 bg-black/90 text-[9px] font-mono text-[#eab308] px-2 py-1 border border-[#eab308]/30">
                  {selectedDesign.code}
                </div>
              </div>

              {/* Right Column: Details & Prime Action */}
              <div className="md:w-1/2 p-6 flex flex-col justify-between space-y-4 overflow-y-auto">
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] text-[#ca8a04] font-mono font-bold uppercase tracking-widest block">
                      {selectedDesign.collection} • {selectedDesign.category}
                    </span>
                    <h2 className="text-xl font-black uppercase tracking-tight text-black font-mono">
                      SKU: {selectedDesign.code}
                    </h2>
                  </div>

                  <p className="text-xs text-neutral-700 leading-relaxed">
                    {selectedDesign.description || 'Arte gráfica autoral F PAC STORE pronta para gravação em DTF HD de alta durabilidade.'}
                  </p>

                  {/* Visual Metadata */}
                  <div className="bg-neutral-50 border border-neutral-200 p-3 text-[10px] space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Autor:</span>
                      <span className="text-neutral-900 font-bold">{selectedDesign.author}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Tema:</span>
                      <span className="text-neutral-900 font-bold">{selectedDesign.theme || 'Streetwear'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Formato HD:</span>
                      <span className="text-emerald-700 font-bold">Vetor / PNG Transparente</span>
                    </div>
                  </div>

                  {/* Tags */}
                  {selectedDesign.tags.length > 0 && (
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-mono block mb-1">Tags:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedDesign.tags.map(t => (
                          <span key={t} className="bg-neutral-100 text-neutral-700 text-[9px] px-2 py-0.5 border border-neutral-200">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Section */}
                <div className="pt-4 border-t border-neutral-200 space-y-2">
                  <p className="text-[10px] text-neutral-500 text-center italic">
                    Estampa pronta para personalização livre no configurador PRIME.
                  </p>
                  <button
                    onClick={() => {
                      const d = selectedDesign;
                      setSelectedDesign(null);
                      handleOpenInPrime(d);
                    }}
                    className="w-full bg-[#eab308] hover:bg-black hover:text-white text-black font-black text-xs uppercase tracking-wider py-3 px-4 flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg"
                  >
                    <Sparkles size={15} /> Personalizar na Coleção PRIME
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Design } from '../types/design';
import { STAMP_CATEGORIES } from '../constants/stampCategories';
import { Search, Sparkles, Eye, Palette, X, RefreshCw, Grid, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { cn } from '../lib/utils';
import { isDesignPublic, normalizeDesignDocument, sortDesignCatalog } from '../lib/stampCatalog';
import { StampMedia } from '../components/StampMedia';

export default function StampsGallery() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
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
        const design = normalizeDesignDocument(docSnap.id, d);
        if (isDesignPublic(design)) fetched.push(design);
      });
      setDesigns(sortDesignCatalog(fetched));
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
        (item.compatibleProducts || []).some(product => product.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchCategory = selectedCategory === 'Todos' || item.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [designs, searchTerm, selectedCategory]);

  const categoriesList = ['Todos', ...STAMP_CATEGORIES];

  // Action: Launch PRIME Configurator with chosen design
  const handleOpenInPrime = (design: Design) => {
    navigate(`/prime?design=${encodeURIComponent(design.id)}&name=${encodeURIComponent(design.name)}&png=${encodeURIComponent(design.pngUrl || '')}`);
  };

  return (
    <div className="min-h-screen bg-white text-black pt-6 pb-20 font-sans">
      <Helmet>
        <title>Galeria de Estampas Exclusivas | F PAC STORE</title>
        <meta name="description" content="Explore as estampas disponíveis da F PAC STORE e escolha uma arte para personalizar produtos compatíveis da linha PRIME." />
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
          Consulte as artes disponíveis, os produtos compatíveis e as opções de pronta entrega.
          Nas peças PRIME, você escolhe a estampa e personaliza o produto.
        </p>

        {/* STATS STRIP */}
        <div className="pt-4 flex flex-wrap justify-center gap-6 text-[11px] font-mono text-neutral-500 border-t border-neutral-200 max-w-xl mx-auto">
          <div><strong className="text-black">{designs.length}</strong> ESTAMPAS DISPONÍVEIS</div>
          <div>•</div>
          <div><strong className="text-black">ALTA FIDELIDADE</strong> DTF HD</div>
          <div>•</div>
          <div><strong className="text-[#ca8a04] font-bold">PRODUTOS PRIME</strong> PERSONALIZÁVEIS</div>
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
                placeholder="Buscar por nome, código, categoria ou produto..."
                className="w-full bg-white border border-neutral-300 text-xs py-2.5 pl-9 pr-3 text-black placeholder-neutral-400 focus:outline-none focus:border-[#eab308] transition-colors"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* View Mode */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
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
                  <Sparkles size={14} /> Personalizar produto PRIME
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
                  <div className="relative aspect-square bg-neutral-100 overflow-hidden">
                    <StampMedia design={design} className="h-full w-full" imageClassName="object-cover group-hover:scale-105 transition-transform duration-500" />

                    {/* Code Badge */}
                    <div className="absolute top-3 left-3 bg-black/90 text-[#eab308] text-[9px] font-mono font-bold px-2 py-1 border border-[#eab308]/30">
                      {design.code}
                    </div>

                    {/* Compatibility Tag */}
                    <div className="absolute top-3 right-3 bg-black/90 text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 border border-neutral-800">
                      {(design.compatibleProducts || ['Todos os produtos'])[0]}
                    </div>

                    {design.readyToShip && (
                      <div className="absolute bottom-3 left-3 bg-[#eab308] text-black text-[8px] font-black uppercase tracking-wider px-2 py-1">
                        Pronta entrega
                      </div>
                    )}

                  </div>

                  {/* Card Content */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[9px] text-[#ca8a04] font-bold uppercase tracking-widest font-mono block">
                          {design.category}
                        </span>
                        <h3 className="font-black text-sm uppercase text-black font-mono tracking-tight group-hover:text-[#ca8a04] transition-colors">
                          SKU: {design.code}
                        </h3>
                      </div>
                    </div>

                    <p className="text-[11px] text-neutral-600 line-clamp-2 leading-relaxed">
                      Compatível com {(design.compatibleProducts || ['Todos os produtos']).join(', ')}
                    </p>
                  </div>
                </div>

                {/* Card Action */}
                <div className="grid grid-cols-[auto_1fr] gap-2 p-4 pt-0">
                  <button
                    type="button"
                    onClick={() => setSelectedDesign(design)}
                    className="border border-black/15 px-3 text-black hover:border-black"
                    aria-label={`Ver detalhes de ${design.name}`}
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    onClick={() => design.availableForCustomization ? handleOpenInPrime(design) : navigate('/catalog/all')}
                    className="w-full bg-[#eab308] hover:bg-black hover:text-white text-black font-black text-[10px] uppercase tracking-wider py-2.5 px-3 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                  >
                    <Sparkles size={13} /> {design.availableForCustomization ? 'Personalizar produto PRIME' : 'Ver peças à pronta entrega'}
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
                      <span className="text-[9px] text-neutral-500 uppercase">• {design.category}</span>
                    </div>
                    <h3 className="font-black text-sm uppercase text-black font-mono hover:text-[#ca8a04] cursor-pointer" onClick={() => setSelectedDesign(design)}>
                      {design.code}
                    </h3>
                    <p className="text-[10px] text-neutral-500 line-clamp-1">Compatível com {(design.compatibleProducts || ['Todos os produtos']).join(', ')}</p>
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
                    onClick={() => design.availableForCustomization ? handleOpenInPrime(design) : navigate('/catalog/all')}
                    className="bg-[#eab308] hover:bg-black hover:text-white text-black font-black text-[9px] uppercase px-4 py-2 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles size={12} /> {design.availableForCustomization ? 'Usar na PRIME' : 'Ver pronta entrega'}
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
                <StampMedia design={selectedDesign} className="h-[350px] w-full" />
                <div className="absolute bottom-3 left-3 bg-black/90 text-[9px] font-mono text-[#eab308] px-2 py-1 border border-[#eab308]/30">
                  {selectedDesign.code}
                </div>
              </div>

              {/* Right Column: Details & Prime Action */}
              <div className="md:w-1/2 p-6 flex flex-col justify-between space-y-4 overflow-y-auto">
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] text-[#ca8a04] font-mono font-bold uppercase tracking-widest block">
                      {selectedDesign.category}
                    </span>
                    <h2 className="text-xl font-black uppercase tracking-tight text-black font-mono">
                      SKU: {selectedDesign.code}
                    </h2>
                  </div>

                  {/* Visual Metadata */}
                  <div className="bg-neutral-50 border border-neutral-200 p-3 text-[10px] space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Autor:</span>
                      <span className="text-neutral-900 font-bold">{selectedDesign.author}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-neutral-500">Produtos:</span>
                      <span className="text-right text-neutral-900 font-bold">{(selectedDesign.compatibleProducts || ['Todos os produtos']).join(', ')}</span>
                    </div>
                    {selectedDesign.availableSizes?.length ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-neutral-500">Tamanhos:</span>
                        <span className="text-right text-neutral-900 font-bold">{selectedDesign.availableSizes.join(', ')}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Formato HD:</span>
                      <span className="text-emerald-700 font-bold">Vetor / PNG Transparente</span>
                    </div>
                  </div>

                </div>

                {/* Action Section */}
                <div className="pt-4 border-t border-neutral-200 space-y-2">
                  <p className="text-[10px] text-neutral-500 text-center italic">
                    Estampa pronta para personalização nos produtos PRIME compatíveis.
                  </p>
                  <button
                    onClick={() => {
                      const d = selectedDesign;
                      setSelectedDesign(null);
                      if (d.availableForCustomization) handleOpenInPrime(d);
                      else navigate('/catalog/all');
                    }}
                    className="w-full bg-[#eab308] hover:bg-black hover:text-white text-black font-black text-xs uppercase tracking-wider py-3 px-4 flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg"
                  >
                    <Sparkles size={15} /> {selectedDesign.availableForCustomization ? 'Personalizar produto PRIME' : 'Ver peças à pronta entrega'}
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

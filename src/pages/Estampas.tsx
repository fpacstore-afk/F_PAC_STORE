import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInventory } from '../hooks/useInventory';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Loader2, Search, ChevronRight, HelpCircle } from 'lucide-react';
import { SizeChart } from '../components/SizeChart';

interface Estampa {
  id: string;
  name: string;
  description: string;
  path?: string;
  image?: string;
  slotIndex?: number;
  position?: string;
  width?: string;
  height?: string;
}

export default function Estampas() {
  const [estampas, setEstampas] = useState<Estampa[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Interactive Filter and Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, destaques, catalogo
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  useEffect(() => {
    // Busca do Firebase
    const q = query(collection(db, 'estampas'), orderBy('slotIndex', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Estampa));
      
      // Se não houver nada no banco, mostramos as estampas padrão
      if (data.length === 0) {
        setEstampas([
          { id: 'peito-1', name: 'Escrita Peito Core', path: '/estampas/F-PAC-ESCRITA-peito C.png', image: '/estampas/F-PAC-ESCRITA-peito C.png', description: 'Logo F PAC STORE minimalista para aplicação no peito.', slotIndex: 1 },
          { id: 'logo-premium', name: 'F PAC Full Logo', path: '/estampas/logo-fpac.png', image: '/estampas/logo-fpac.png', description: 'Nossa assinatura completa para estampas grandes.', slotIndex: 2 }
        ]);
      } else {
        setEstampas(data);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Filter logic matching the catalog
  const filteredEstampas = estampas.filter(e => {
    // Search Filter
    const searchLower = searchTerm.trim().toLowerCase();
    if (searchLower !== '') {
      const nameMatch = (e.name || '').toLowerCase().includes(searchLower);
      const descMatch = (e.description || '').toLowerCase().includes(searchLower);
      if (!nameMatch && !descMatch) return false;
    }

    // Category / Position Filter
    const slotIdx = e.slotIndex || 0;
    if (filterType === 'destaques') {
      return slotIdx === 1 || slotIdx === 2;
    }
    if (filterType === 'catalogo') {
      return slotIdx >= 3;
    }

    return true;
  });

  const faqs = [
    {
      question: "Como funciona a aplicação de estampas?",
      answer: "Você pode escolher um modelo de camiseta (Série FORCE, MARK ou PRIME) e, na página de personalização, selecionar em quais locais deseja aplicar suas estampas favoritas (no peito, nas costas ou mangas)."
    },
    {
      question: "Quantas estampas posso adicionar por produto?",
      answer: "No modo PRIME, você pode selecionar até 3 áreas de estampa livremente ajustáveis já inclusas no valor promocional da peça."
    },
    {
      question: "Qual é a técnica de estamparia utilizada?",
      answer: "Utilizamos silk screen digital de alta definição (DTG), garantindo cores vivas, toque imperceptível e máxima durabilidade, sem rachar ou desbotar após as lavagens."
    },
    {
      question: "Posso enviar minha própria arte?",
      answer: "Sim! Se você deseja uma produção 100% personalizada com sua própria marca ou arte exclusiva corporativa, basta entrar em contato diretamente com o nosso suporte via WhatsApp."
    }
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] pt-4 md:pt-8 pb-16 md:pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Breadcrumbs */}
        <div className="hidden md:flex items-center gap-2 text-[8px] md:text-[9px] text-neutral-400 font-extrabold uppercase tracking-[0.25em] mb-6">
           <Link to="/" className="hover:text-black transition-colors">INÍCIO</Link>
           <ChevronRight size={10} className="text-gray-300" />
           <span className="text-[#eab308] font-black">ESTAMPAS</span>
        </div>

        {/* PAGE HERO HEADER */}
        <div className="mb-8 md:mb-12 flex flex-col items-center text-center border-b border-black/5 pb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-3 px-3 py-1 bg-black text-[#eab308] text-[8px] md:text-[9px] font-black uppercase tracking-[0.3em] rounded-full"
          >
            👑 DESIGNS EXCLUSIVOS STREETWEAR
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-5xl lg:text-6xl font-black uppercase tracking-tighter italic mb-3 text-neutral-900"
          >
            CATÁLOGO DE <span className="text-[#eab308]">ESTAMPAS</span>
          </motion.h1>
          <p className="text-gray-400 font-extrabold uppercase tracking-widest text-[9px] max-w-xl leading-relaxed">
            Nossos designs autorais desenvolvidos para transmitir força e stance. 
            Selecione a sua arte favorita para personalizar suas camisetas premium.
          </p>
        </div>

        {/* STREETWEAR TRUST BANNER / STATS CARD */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-black text-white p-4 md:p-6 rounded-[1.5rem] border border-white/10 shadow-xl mb-10 max-w-5xl mx-auto">
          <div className="flex flex-col items-center justify-center text-center p-1.5 md:p-2 border-r border-white/5 last:border-0">
            <span className="text-[#eab308] font-black text-base md:text-xl font-mono">100%</span>
            <span className="text-[8px] md:text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Algodão Premium</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center p-1.5 md:p-2 border-r border-white/5 last:border-0 md:border-r">
            <span className="text-white font-black text-base md:text-xl font-mono">High Def</span>
            <span className="text-[8px] md:text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Impressão Digital</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center p-1.5 md:p-2 border-r border-white/5 last:border-0">
            <span className="text-[#eab308] font-black text-base md:text-xl font-mono">Antipilling</span>
            <span className="text-[8px] md:text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Estampas Robustas</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center p-1.5 md:p-2 last:border-0">
            <span className="text-white font-black text-base md:text-xl font-mono">PRIME</span>
            <span className="text-[8px] md:text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Multi Customizações</span>
          </div>
        </div>

        {/* INTERACTIVE SEARCH & FILTERS MODULE */}
        <div className="mb-10 bg-white p-4 sm:p-6 rounded-[2rem] border border-black/5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-5 max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 group">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#eab308] transition-colors" />
              <input 
                id="search-input"
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar estampa por nome ou descrição..."
                className="w-full bg-neutral-50 border border-neutral-200 focus:border-[#eab308] focus:bg-white text-xs font-bold uppercase tracking-wider pl-11 pr-16 py-3.5 rounded-[1.2rem] outline-none transition-all placeholder:text-gray-400 text-black text-left"
              />
              {searchTerm && (
                <button 
                  id="clear-search"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-gray-400 hover:text-black tracking-widest cursor-pointer"
                >
                  X Limpar
                </button>
              )}
            </div>

            {/* Position Pills */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-[0.2em] mr-1">TIPO/SEÇÃO:</span>
              {[
                { id: 'all', label: 'Ver Todas' },
                { id: 'destaques', label: 'Destaques' },
                { id: 'catalogo', label: 'Lista Adicional' },
              ].map((pill) => (
                <button
                  id={`pill-filter-${pill.id}`}
                  key={pill.id}
                  type="button"
                  onClick={() => setFilterType(pill.id)}
                  className={cn(
                    "px-3.5 py-2 text-[8.5px] font-black uppercase tracking-widest rounded-full transition-all border cursor-pointer",
                    filterType === pill.id
                      ? "bg-black text-[#eab308] border-black shadow-md"
                      : "bg-white text-gray-500 border-neutral-200 hover:text-black hover:border-black/30 hover:bg-neutral-50"
                  )}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-40">
            <Loader2 className="animate-spin text-[#eab308]" size={40} />
          </div>
        ) : filteredEstampas.length === 0 ? (
          <div className="text-center py-24 bg-white border border-neutral-200 rounded-[2rem] max-w-lg mx-auto p-8 shadow-xs">
            <p className="text-3xl">🏜️</p>
            <h3 className="text-lg font-black uppercase tracking-wider mt-4">Nenhuma estampa encontrada</h3>
            <p className="text-gray-400 text-xs mt-2 uppercase tracking-wide">Tente buscar por termos mais genéricos ou resetar os filtros acima.</p>
            <button
              id="btn-all-reset"
              onClick={() => {
                setSearchTerm('');
                setFilterType('all');
              }}
              className="mt-6 bg-black hover:bg-[#eab308] text-white hover:text-black transition-all px-5 py-3 text-[9px] font-black uppercase tracking-widest rounded-full cursor-pointer shadow-md"
            >
              Limpar Todos os Filtros
            </button>
          </div>
        ) : (
          <div className="space-y-16">
            
            {/* Highlights Section */}
            {filteredEstampas.some(e => e.slotIndex === 1 || e.slotIndex === 2) && (
              <div className="space-y-4">
                <span className="text-[10px] text-neutral-400 font-extrabold uppercase tracking-[0.25em] pl-1 block">ESTAMPAS DE DESTAQUE</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 pb-8 border-b border-black/5">
                  {[1, 2].map((slotIndex) => {
                    const estampaArr = filteredEstampas.filter(e => e.slotIndex === slotIndex);
                    if (estampaArr.length === 0) return null;
                    const estampa = estampaArr[0];
                    const imgUrl = estampa.image || estampa.path || '/estampas/logo-fpac.png';

                    return (
                      <motion.div 
                        key={slotIndex}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className={cn(
                          "flex flex-col group transition-all duration-500 overflow-hidden relative cursor-pointer rounded-2xl md:rounded-3xl bg-white border border-neutral-100",
                          "ring-1 ring-[#eab308]/20 shadow-[0_4px_30px_rgba(234,179,8,0.06)] md:scale-[1.01] hover:scale-[1.03] z-10 hover:ring-[#eab308]/60 hover:border-amber-500/30"
                        )}
                        onClick={() => setSelectedImage(imgUrl)}
                      >
                        <div className="aspect-[16/10] sm:aspect-[16/9] md:aspect-[4/3] lg:aspect-[16/9] bg-[#fdfdfd] flex items-center justify-center p-6 sm:p-8 md:p-12 overflow-hidden relative">
                          <img 
                            src={imgUrl}
                            alt={estampa.name}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-1000 opacity-100 block"
                          />
                          <div className="absolute inset-0 border-[6px] border-[#eab308]/0 group-hover:border-[#eab308]/5 transition-all duration-700 pointer-events-none" />
                        </div>
                        <div className="p-5 border-t border-neutral-100 bg-white">
                          <h3 className="text-base font-black uppercase tracking-tight italic text-zinc-950 group-hover:text-[#eab308] transition-colors leading-none mb-1.5">{estampa.name}</h3>
                          <p className="text-[10px] text-gray-500 leading-relaxed uppercase tracking-wider line-clamp-2">{estampa.description}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Catalog Stamps sections (Slots 3+) */}
            {(() => {
              const catalogStamps = filteredEstampas.filter(e => (e.slotIndex || 0) >= 3);
              if (catalogStamps.length === 0) return null;

              return (
                <div className="space-y-6">
                  <span className="text-[10px] text-neutral-400 font-extrabold uppercase tracking-[0.25em] pl-1 block">GALERIA DE CRIAÇÕES ADICIONAIS</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                    {catalogStamps.map((estampa, index) => {
                      const imgUrl = estampa.image || estampa.path || '/estampas/logo-fpac.png';
                      return (
                        <motion.div 
                          key={estampa.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: index * 0.03 }}
                          className={cn(
                            "flex flex-col group transition-all duration-500 overflow-hidden relative cursor-pointer border border-neutral-150 hover:border-black/20 rounded-2xl md:rounded-3xl bg-white hover:shadow-lg"
                          )}
                          onClick={() => setSelectedImage(imgUrl)}
                        >
                          <div className="aspect-square bg-[#fdfdfd] flex items-center justify-center p-4 sm:p-5 md:p-6 overflow-hidden relative">
                            <img 
                              src={imgUrl}
                              alt={estampa.name}
                              className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700 opacity-100 block"
                            />
                            <div className="absolute inset-2 border border-white/0 group-hover:border-[#eab308]/20 transition-all duration-500 pointer-events-none" />
                          </div>
                          <div className="p-3 border-t border-neutral-100 bg-white">
                            <h4 className="text-[11px] font-black uppercase tracking-tight text-neutral-900 group-hover:text-[#eab308] transition-colors leading-tight line-clamp-1">{estampa.name}</h4>
                            <p className="text-[8.5px] text-neutral-400 uppercase tracking-widest line-clamp-1 mt-0.5">{estampa.description}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* STREETWEAR INTERACTIVE FAQ SECTION */}
        <section className="mt-20 md:mt-28 max-w-4xl mx-auto bg-white p-6 md:p-8 rounded-[2.5rem] border border-neutral-200/65 shadow-2.5xl">
          <div className="text-center mb-8">
            <span className="text-[9px] text-[#eab308] font-black uppercase tracking-[0.34em]">QUER SABER MAIS?</span>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight italic mt-1.5 text-black">FAQ • DÚVIDAS DE ESTAMPARIA</h2>
            <p className="text-gray-400 font-extrabold uppercase tracking-wide text-[9px] mt-1">Dúvidas rápidas sobre estampas, customização e técnicas de impressão.</p>
          </div>

          <div className="space-y-3.5">
            {faqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div 
                  id={`faq-item-${index}`}
                  key={index}
                  className="border border-neutral-150 rounded-[1.2rem] overflow-hidden transition-all duration-300 bg-neutral-50/50 hover:bg-neutral-50"
                >
                  <button
                    id={`faq-btn-${index}`}
                    type="button"
                    onClick={() => setActiveFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between p-4 md:p-5 text-left text-xs text-neutral-900 font-black uppercase tracking-widest select-none cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <HelpCircle size={13} className="text-[#eab308] shrink-0" />
                      {faq.question}
                    </span>
                    <ChevronRight size={14} className={cn("text-gray-400 transition-transform duration-300 shrink-0", isOpen && "rotate-90 text-[#eab308]")} />
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        id={`faq-answer-${index}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <p className="p-4 md:p-5 pt-0 text-gray-500 text-xs tracking-wide leading-relaxed border-t border-neutral-150">
                          {faq.answer}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        {/* CUSTOM MEASUREMENT AND SIZE CHART SECTION */}
        <section className="py-12 md:py-20 mt-16 md:mt-24 bg-white rounded-[2.5rem] border border-neutral-200 shadow-xs">
          <SizeChart />
        </section>

      </div>

      {/* Image Zoom Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 md:p-10"
          onClick={() => setSelectedImage(null)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative max-w-5xl w-full h-full flex items-center justify-center"
          >
             <img 
               src={selectedImage || undefined} 
               className="max-w-full max-h-full object-contain" 
               alt="Stamp Zoom"
             />
             <button 
               className="absolute top-0 right-0 md:-top-10 md:-right-10 text-white hover:text-[#eab308] transition-colors p-2"
               onClick={(e) => {
                 e.stopPropagation();
                 setSelectedImage(null);
               }}
             >
                <span className="text-xs font-black uppercase tracking-widest">Fechar [X]</span>
             </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { products as staticProducts } from '../data/products';
import { COLLECTIONS_CONFIG, getCollectionBySlug } from '../data/collectionsConfig';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { 
  Loader2, 
  ArrowRight, 
  Zap, 
  Mail, 
  Send, 
  ChevronRight, 
  Search, 
  SlidersHorizontal, 
  Info, 
  HelpCircle, 
  Check, 
  CheckCircle, 
  Sparkles, 
  TrendingUp, 
  X, 
  Filter,
  ArrowLeft,
  Shield
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { useInventory } from '../hooks/useInventory';
import { MiniSizeChart, SizeChart } from '../components/SizeChart';
import { PromotionBadge } from '../components/promotions/PromotionBadge';
import { getActivePromotion } from '../services/promotions/getActivePromotion';
import { WeeklyPromotion } from '../types/promotions';
import { cn, getProductUrl, getEffectivePrice, getDisplayPrices } from '../lib/utils';
import { safeStorage } from '../lib/storage';

export default function ModelStamps() {
  const { modelSlug } = useParams<{ modelSlug: string }>();
  const navigate = useNavigate();
  const { isAvailable, getStock } = useInventory();
  
  const [products, setProducts] = useState<any[]>(staticProducts);
  const [loading, setLoading] = useState(true);
  const [userStyle, setUserStyle] = useState<string | null>(null);
  const [activePromo, setActivePromo] = useState<WeeklyPromotion | null>(null);
  const [brandConfig, setBrandConfig] = useState<any>(null);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const isCampaignOnly = searchParams.get('promo') === 'active';

  // Filter & Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [sortBy, setSortBy] = useState<'bestseller' | 'price-asc' | 'price-desc' | 'newest'>('bestseller');
  
  // Interactive Comparison Drawer State
  const [compareOpen, setCompareOpen] = useState(false);
  
  // FAQ Active Item State
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Load user quiz profile style
  useEffect(() => {
    setUserStyle(safeStorage.getItem('fpac_user_style'));
  }, []);

  // Load Brand Dynamic Settings
  useEffect(() => {
    const unsubscribeBrand = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (snapshot.exists()) {
        setBrandConfig(snapshot.data());
      }
    });
    return () => unsubscribeBrand();
  }, []);

  // Load Promotions
  useEffect(() => {
    getActivePromotion().then((promo) => {
      setActivePromo(promo);
    });
  }, []);

  // Real-time product snapshot syncing
  useEffect(() => {
    const sanitizeProduct = (data: any) => {
      if (!data) return data;
      const sanitized = { ...data };
      
      if (sanitized.colors) {
        const isMainProduct = sanitized.slug === 'force' || sanitized.slug === 'mark' || sanitized.slug === 'prime';
        if (isMainProduct) {
          sanitized.status = 'active'; 
          sanitized.parentSlug = '';
        }
      }

      if (data.slug === 'force' && (data.description || '').includes('100% algodão premium de alta gramatura (220gsm)')) {
        sanitized.description = "A camiseta FORCE combina estética minimalista com atitude marcante. Confeccionada em malha premium de alta gramatura (240gsm), entrega estrutura, conforto e caimento robusto no corpo. Excelente escolha para vestir as nossas estampas exclusivas.";
      }
      return sanitized;
    };

    setLoading(true);
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const merged = staticProducts.map(staticP => {
        const dynamicP = dynamicData.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        return dynamicP ? sanitizeProduct({ ...staticP, ...dynamicP }) : sanitizeProduct(staticP);
      });

      dynamicData.forEach((dynamicP: any) => {
        if (!staticProducts.some(sp => sp.id === dynamicP.id || sp.slug === dynamicP.slug)) {
          merged.push(dynamicP);
        }
      });

      // Handle stamp fallback images
      merged.forEach(p => {
        if (p.parentSlug && (!p.images || p.images.length === 0)) {
          const parentModel = merged.find(parent => parent.slug === p.parentSlug);
          if (parentModel && parentModel.images && parentModel.images.length > 0) {
            p.images = [...parentModel.images];
          } else {
            p.images = ['/estampas/logo-fpac.png'];
          }
        }
      });

      setProducts(merged);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar catálogo:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return () => unsubscribe();
  }, []);

  const parentProduct = products.find(p => String(p.slug || '').toLowerCase().trim() === String(modelSlug || '').toLowerCase().trim());
  const stamps = products.filter(p => {
    const parent = String(p.parentSlug || '').toLowerCase().trim();
    const currentSlug = String(p.slug || '').toLowerCase().trim();
    const targetModel = String(modelSlug || '').toLowerCase().trim();
    return parent === targetModel && currentSlug !== targetModel && p.status !== 'hidden';
  });

  // Filter and Search displayed products
  const displayedProducts = stamps.filter(p => {
    if (!p.images || p.images.length === 0) return false;

    // Search filter (name, headline, description, slug)
    const searchLower = searchTerm.trim().toLowerCase();
    if (searchLower !== '') {
      const nameMatch = (p.name || '').toLowerCase().includes(searchLower);
      const headlineMatch = (p.headline || '').toLowerCase().includes(searchLower);
      const descMatch = (p.description || '').toLowerCase().includes(searchLower);
      const parentMatch = (p.parentSlug || '').toLowerCase().includes(searchLower);
      if (!nameMatch && !headlineMatch && !descMatch && !parentMatch) return false;
    }

    // Campaign filter (promotions)
    if (isCampaignOnly && activePromo && activePromo.active) {
      const isEligible = activePromo.product_ids?.includes(p.id) || activePromo.discount_type === 'free_shipping';
      if (activePromo.product_ids && activePromo.product_ids.length > 0 && !isEligible) {
        return false;
      }
    }

    // Check if out of stock
    const outOfStock = !isAvailable(p.slug, undefined, p.parentSlug) || getStock(p.slug, undefined, p.parentSlug) <= 0;

    // If global hideOutOfStock or local toggle is selected AND product is out of stock, hide it
    if ((brandConfig?.hideOutOfStock || hideOutOfStock) && outOfStock) {
      return false;
    }

    return true;
  });

  // Sort function
  const sortedProducts = [...displayedProducts].sort((a, b) => {
    if (sortBy === 'price-asc') {
      return getEffectivePrice(a) - getEffectivePrice(b);
    }
    if (sortBy === 'price-desc') {
      return getEffectivePrice(b) - getEffectivePrice(a);
    }
    if (sortBy === 'newest') {
      const dateA = a.createdAt?.toDate?.() || a.createdAt || 0;
      const dateB = b.createdAt?.toDate?.() || b.createdAt || 0;
      return dateB - dateA;
    }
    // Default (bestselllers first, then creation date)
    if (a.isBestseller && !b.isBestseller) return -1;
    if (!a.isBestseller && b.isBestseller) return 1;

    const dateA = a.createdAt?.toDate?.() || a.createdAt || 0;
    const dateB = b.createdAt?.toDate?.() || b.createdAt || 0;
    return dateB - dateA;
  });

  // Dynamic Badge Detector (Mais vendido, Edição limitada, Copa 2026, Premium)
  const getProductBadge = (product: any): { text: string; style: string } | null => {
    const nameLower = (product.name || '').toLowerCase();
    const isPrime = product.slug === 'prime' || product.parentSlug === 'prime' || product.is_prime;

    if (nameLower.includes('copa') || nameLower.includes('brazil') || nameLower.includes('brasil')) {
      return { 
        text: '⚽ COPA 2026', 
        style: 'bg-emerald-600 border-emerald-500 text-white animate-pulse' 
      };
    }
    if (product.isBestseller || product.slug === 'mark' || product.parentSlug === 'mark') {
      return { 
        text: '🔥 MAIS VENDIDO', 
        style: 'bg-[#eab308] border-yellow-400 text-black font-black' 
      };
    }
    if (isPrime) {
      return { 
        text: '💎 CUSTOM PRIME', 
        style: 'bg-zinc-950 border-amber-500/50 text-amber-500 shadow-md ring-1 ring-amber-400/20' 
      };
    }
    if (product.isNew || nameLower.includes('limited') || nameLower.includes('limitada')) {
      return { 
        text: '⚡ ED. LIMITADA', 
        style: 'bg-black border-neutral-700 text-white' 
      };
    }
    return null;
  };

  // Dynamic Specifications resolver based on parent collection
  const getProductSpecs = (product: any) => {
    const parent = String(product.parentSlug || '').toLowerCase();
    if (parent === 'force' || product.slug === 'force') {
      return { gsm: '240GSM', fit: 'Oversized', material: '90% Algodão 10% Poliéster' };
    }
    if (parent === 'mark' || product.slug === 'mark') {
      return { gsm: '240GSM', fit: 'Oversized', material: '90% Algodão Premium' };
    }
    return { gsm: '220GSM', fit: 'Oversized Confort', material: '100% Algodão Penteado' };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center py-28 space-y-3 bg-[#fafafa]">
        <Loader2 className="animate-spin text-[#eab308]" size={40} />
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">CARREGANDO MODELO...</span>
      </div>
    );
  }

  if (!parentProduct) {
    return (
      <div className="min-h-screen pt-40 px-6 max-w-7xl mx-auto flex flex-col items-center justify-center text-center bg-[#fafafa]">
        <h1 className="text-2xl font-black uppercase mb-4 text-black">Modelo não encontrado</h1>
        <Link to="/catalog" className="bg-black text-white px-8 py-3 font-bold uppercase hover:bg-[#eab308] hover:text-black transition-all">
          Voltar ao Catálogo
        </Link>
      </div>
    );
  }

  const handlePillClick = (id: string) => {
    if (id === 'all') {
      navigate('/catalog');
    } else {
      navigate(`/model/${id}`);
    }
  };

  const collectionConfig = getCollectionBySlug(modelSlug);
  const uppercaseModel = collectionConfig ? collectionConfig.name : String(modelSlug || '').toUpperCase();

  return (
    <>
      <Helmet>
        <title>{collectionConfig?.seo.title || `Coleção ${uppercaseModel} | F PAC STORE`}</title>
        <meta name="description" content={collectionConfig?.seo.description || `Explore todas as estampas exclusivas da coleção ${uppercaseModel}.`} />
        <meta name="keywords" content={collectionConfig?.seo.keywords.join(', ') || ''} />
        <link rel="canonical" href={`https://www.fpacstore.com.br/model/${modelSlug}`} />
      </Helmet>

      <div className="min-h-screen bg-[#fafafa] pt-4 md:pt-8 pb-16 md:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Breadcrumbs - Desktop Only */}
          <div className="hidden md:flex items-center gap-2 text-[8px] md:text-[9px] text-gray-400 uppercase tracking-[0.2em] mb-4">
             <Link to="/" className="hover:text-black transition-colors">INÍCIO</Link>
             <ChevronRight size={10} className="text-gray-300" />
             <Link to="/catalog" className="hover:text-black transition-colors">PRODUTOS</Link>
             <ChevronRight size={10} className="text-gray-300" />
             <span className="text-[#eab308] font-black">{collectionConfig?.name || parentProduct?.name || uppercaseModel}</span>
          </div>

          {/* Back button */}
          <div className="mb-6">
            <Link 
              to="/catalog"
              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#000000]/50 hover:text-black transition-colors"
            >
              <ArrowLeft size={12} /> Voltar ao Catálogo
            </Link>
          </div>

          {/* PAGE HERO HEADER */}
          <div className="mb-8 md:mb-12 flex flex-col items-center text-center border-b border-black/5 pb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="mb-3 px-3 py-1 bg-black text-[#eab308] text-[8px] md:text-[9px] font-black uppercase tracking-[0.3em] rounded-full"
            >
              👑 {collectionConfig?.tagline || "MODELO EXCLUSIVO STREETWEAR"}
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl md:text-5xl lg:text-6xl font-black uppercase tracking-tighter italic mb-3 text-neutral-900"
            >
              COLEÇÃO <span className="text-[#eab308]">{collectionConfig?.name || parentProduct?.name || uppercaseModel}</span>
            </motion.h1>

            {collectionConfig?.slogan && (
              <p className="text-sm md:text-base font-black italic tracking-wide text-neutral-800 mb-4 bg-yellow-500/10 px-4 py-1.5 rounded-full border border-yellow-500/20">
                "{collectionConfig.slogan}"
              </p>
            )}

            {userStyle && userStyle.toLowerCase().trim() === (modelSlug || '').toLowerCase().trim() && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 max-w-2xl bg-[#eab308]/15 border border-[#eab308]/40 px-4 py-3 rounded-[12px] flex items-start gap-3 text-left shadow-xs"
              >
                <span className="text-xl shrink-0 mt-0.5">
                  {userStyle === 'force' ? '💪' : userStyle === 'mark' ? '🔥' : '✨'}
                </span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Seu Perfil de Estilo Recomendado</p>
                  <p className="text-xs font-semibold text-amber-950 font-sans leading-tight">
                    {userStyle === 'force' && `Você tem o perfil ${COLLECTIONS_CONFIG.force.name} recomendado! ${COLLECTIONS_CONFIG.force.marketingPitch}`}
                    {userStyle === 'mark' && `Você tem o perfil ${COLLECTIONS_CONFIG.mark.name} recomendado! ${COLLECTIONS_CONFIG.mark.marketingPitch}`}
                    {userStyle === 'prime' && `Você tem o perfil ${COLLECTIONS_CONFIG.prime.name} recomendado! ${COLLECTIONS_CONFIG.prime.marketingPitch}`}
                  </p>
                </div>
              </motion.div>
            )}

            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-neutral-500 font-extrabold uppercase tracking-[0.3em] text-[10px] md:text-xs max-w-2xl leading-relaxed"
            >
              {collectionConfig?.marketingPitch || parentProduct?.description || "Modelagem oversized autêntica • Malha encorpada 240g/m² • Estampas analógicas de altíssima fidelidade."}
            </motion.p>
          </div>

          {/* STREETWEAR TRUST BANNER / STATS CARD */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-black text-white p-4 md:p-6 rounded-[1.5rem] border border-white/10 shadow-xl mb-10 max-w-5xl mx-auto">
            <div className="flex flex-col items-center justify-center text-center p-2 border-r border-white/5 last:border-0">
              <span className="text-[#eab308] font-black text-lg md:text-xl font-mono">240g/m²</span>
              <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-1">Malha Ultra Encorpada</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center p-2 border-r border-white/5 last:border-0 md:border-r">
              <span className="text-white font-black text-lg md:text-xl font-mono">
                Logo {collectionConfig?.sleeveLogo || 'FPAC'}
              </span>
              <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-1">Manga (Obrigatória)</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center p-2 border-r border-white/5 last:border-0">
              <span className="text-[#eab308] font-black text-lg md:text-xl font-mono">100%</span>
              <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-1">Algodão Selecionado</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center p-2 last:border-0">
              <span className="text-white font-black text-lg md:text-xl font-mono">
                {collectionConfig?.name || uppercaseModel}
              </span>
              <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-1">
                {collectionConfig ? collectionConfig.rules[0] : 'Qualidade Garantida'}
              </span>
            </div>
          </div>

          {/* EXPERT SEARCH & ADVANCED FILTERS MODULE */}
          <div className="mb-10 bg-white p-4 sm:p-6 rounded-[2rem] border border-black/5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-5 max-w-5xl mx-auto">
            
            {/* Active Campanha notification */}
            {isCampaignOnly && activePromo && activePromo.active && (
              <div id="promo-banner" className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#eab308]/15 border border-[#eab308]/40 p-4 rounded-[1.2rem] text-xs font-black uppercase tracking-wider">
                <div className="flex flex-col sm:flex-row items-center gap-3.5 text-center sm:text-left">
                  <span className="bg-[#eab308] text-black px-2.5 py-1 rounded-sm font-black text-[9px] tracking-widest uppercase animate-pulse shrink-0">
                    CAMPANHA ATIVA
                  </span>
                  <div className="flex flex-col">
                    <span className="text-black text-[11px] sm:text-xs tracking-widest">{activePromo.title}</span>
                    <span className="text-[9px] text-gray-500 tracking-wider lowercase">Estampas e itens selecionados com descontos exclusivos no carrinho</span>
                  </div>
                </div>
                <button
                  id="btn-all-products"
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.delete('promo');
                    setSearchParams(params);
                  }}
                  className="bg-black hover:bg-[#eab308] text-white hover:text-black transition-all px-4 py-2.5 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] shrink-0 cursor-pointer shadow-md rounded-[10px]"
                >
                  Ver Catálogo Geral
                </button>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
              
              {/* Sleek Text search */}
              <div className="relative flex-1 group">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#eab308] transition-colors" />
                <input 
                  id="search-input"
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`Buscar estampa em ${uppercaseModel}...`}
                  className="w-full bg-neutral-50 border border-neutral-200 focus:border-[#eab308] focus:bg-white text-xs font-bold uppercase tracking-wider pl-11 pr-16 py-3.5 rounded-[1.2rem] outline-none transition-all placeholder:text-gray-400 text-black placeholder:font-normal placeholder:capitalize"
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

              {/* Sorting & Availability Panel */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 shrink-0">
                
                {/* Dropdown for Sort */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ordenar:</span>
                  <select
                    id="sort-select"
                    value={sortBy}
                    onChange={(e: any) => setSortBy(e.target.value)}
                    className="bg-neutral-50 px-3 py-2.5 border border-neutral-200 rounded-[10px] text-[10px] font-black uppercase tracking-wider outline-none focus:border-[#eab308]"
                  >
                    <option value="bestseller">🔥 Mais Vendidos</option>
                    <option value="newest">✨ Lançamentos</option>
                    <option value="price-asc">💵 Menor Preço</option>
                    <option value="price-desc">💵 Maior Preço</option>
                  </select>
                </div>

                {/* Hide out of stock toggle */}
                <div className="flex items-center gap-2 select-none shrink-0 border-l border-neutral-200 pl-4">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      id="toggle-stock"
                      type="checkbox" 
                      checked={hideOutOfStock}
                      onChange={(e) => setHideOutOfStock(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-black"></div>
                    <span className="ms-2 text-[9px] font-black uppercase tracking-widest text-[#a3a3a3] peer-checked:text-black transition-colors">
                      Esconder esgotados
                    </span>
                  </label>
                </div>

              </div>
            </div>

            {/* Collection category pills & Action button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-neutral-100 pt-4">
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-[0.2em] mr-1 shrink-0">TROCAR DE SÉRIE:</span>
                {[
                  { id: 'all', label: 'Ver Todos (Geral)' },
                  { id: 'force', label: `${COLLECTIONS_CONFIG.force.name} (${COLLECTIONS_CONFIG.force.badgeText})` },
                  { id: 'mark', label: `${COLLECTIONS_CONFIG.mark.name} (${COLLECTIONS_CONFIG.mark.badgeText})` },
                  { id: 'prime', label: `${COLLECTIONS_CONFIG.prime.name} (${COLLECTIONS_CONFIG.prime.badgeText})` },
                ].map((pill) => (
                  <button
                    id={`pill-filter-${pill.id}`}
                    key={pill.id}
                    type="button"
                    onClick={() => handlePillClick(pill.id)}
                    className={cn(
                      "px-3.5 py-2 text-[8.5px] font-black uppercase tracking-widest rounded-full transition-all border cursor-pointer",
                      modelSlug === pill.id
                        ? "bg-black text-[#eab308] border-black shadow-md"
                        : "bg-white text-gray-500 border-neutral-200 hover:text-black hover:border-black/30 hover:bg-neutral-50"
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Dynamic Interactive Comparison button */}
              <button
                id="btn-compare-lines"
                onClick={() => setCompareOpen(!compareOpen)}
                className="inline-flex self-start sm:self-auto items-center gap-1.5 bg-yellow-50 hover:bg-yellow-100 border border-[#eab308]/40 hover:border-[#eab308]/80 text-[9px] text-[#854d0e] font-black uppercase tracking-widest px-4 py-2.5 rounded-full cursor-pointer transition-all shadow-xs"
              >
                <SlidersHorizontal size={11} className="text-[#a16207]" />
                {compareOpen ? "Fechar Comparativo" : "Guia Comparar Diferenças"}
              </button>
            </div>

            {/* COMPARATIVE SPECIFICATION DRAWER */}
            <AnimatePresence>
              {compareOpen && (
                <motion.div
                  id="comparison-matrix"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden bg-[#fafafa] border border-neutral-200 rounded-[1.5rem] p-4 md:p-6"
                >
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-[#eab308]" />
                      <h4 className="text-xs font-black uppercase tracking-widest text-[#171717]">Guia de Modelos & Caimento F PAC</h4>
                    </div>
                    <button onClick={() => setCompareOpen(false)} className="text-gray-400 hover:text-black">
                      <X size={14} />
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[10px] tracking-wider uppercase font-bold border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-black/5 text-[9px] text-gray-500">
                          <th className="py-2.5 px-3">Característica</th>
                          <th className="py-2.5 px-3 border-l border-neutral-200">{COLLECTIONS_CONFIG.force.name}</th>
                          <th className="py-2.5 px-3 border-l border-neutral-200 text-[#d97706]">{COLLECTIONS_CONFIG.mark.name}</th>
                          <th className="py-3 px-3 border-l border-neutral-200 text-[#a1625d] bg-yellow-500/5">{COLLECTIONS_CONFIG.prime.name}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-neutral-150">
                          <td className="py-3 px-3 font-black text-gray-500 text-[9px]">Mensagem / Slogan</td>
                          <td className="py-3 px-3 border-l border-neutral-200 text-black font-bold">"{COLLECTIONS_CONFIG.force.slogan}"</td>
                          <td className="py-3 px-3 border-l border-neutral-200 text-black font-bold">"{COLLECTIONS_CONFIG.mark.slogan}"</td>
                          <td className="py-3 px-3 bg-yellow-500/5 border-l border-neutral-200 text-black font-bold">"{COLLECTIONS_CONFIG.prime.slogan}"</td>
                        </tr>
                        <tr className="border-b border-neutral-150 bg-[#fbfbfb]">
                          <td className="py-3 px-3 font-black text-gray-500 text-[9px]">Logo na Manga (Obrigatória)</td>
                          <td className="py-3 px-3 border-l border-neutral-200 font-black text-black">Logo {COLLECTIONS_CONFIG.force.sleeveLogo}</td>
                          <td className="py-3 px-3 border-l border-neutral-200 font-black text-black">Logo {COLLECTIONS_CONFIG.mark.sleeveLogo}</td>
                          <td className="py-3 px-3 bg-yellow-500/5 border-l border-neutral-200 font-black text-amber-700">Logo {COLLECTIONS_CONFIG.prime.sleeveLogo}</td>
                        </tr>
                        <tr className="border-b border-neutral-150">
                          <td className="py-3 px-3 font-black text-gray-500 text-[9px]">Estilo & Regras</td>
                          <td className="py-3 px-3 border-l border-neutral-200">{COLLECTIONS_CONFIG.force.rules.join(' • ')}</td>
                          <td className="py-3 px-3 border-l border-neutral-200">{COLLECTIONS_CONFIG.mark.rules.join(' • ')}</td>
                          <td className="py-3 px-3 bg-yellow-500/5 border-l border-neutral-200 text-amber-800">{COLLECTIONS_CONFIG.prime.rules.join(' • ')}</td>
                        </tr>
                        <tr className="border-b border-neutral-150 bg-[#fbfbfb]">
                          <td className="py-3 px-3 font-black text-gray-500 text-[9px]">Gramatura & Caimento</td>
                          <td className="py-3 px-3 border-l border-neutral-200">Heavy Weight (240GSM) Oversized</td>
                          <td className="py-3 px-3 border-l border-neutral-200">Heavy Weight (240GSM) Oversized</td>
                          <td className="py-3 px-3 bg-yellow-500/5 border-l border-neutral-200">Heavy Weight (240GSM) Custom</td>
                        </tr>
                        <tr className="bg-[#fcf8e3]/40">
                          <td className="py-3.5 px-3 font-black text-gray-500 text-[9px]">Público Alvo</td>
                          <td className="py-3.5 px-3 border-l border-neutral-200 text-zinc-700">{COLLECTIONS_CONFIG.force.audience}</td>
                          <td className="py-3.5 px-3 border-l border-neutral-200 text-zinc-700">{COLLECTIONS_CONFIG.mark.audience}</td>
                          <td className="py-3.5 px-3 bg-yellow-500/10 border-l border-neutral-200 text-black font-black">{COLLECTIONS_CONFIG.prime.audience}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 p-3.5 bg-yellow-50 border border-yellow-200 rounded-[12px] text-[10px] text-yellow-800 tracking-wide font-medium leading-relaxed uppercase">
                    <Info size={14} className="shrink-0 text-yellow-600" />
                    <span>Todas as camisetas contam com reforço de costura de ombro a ombro e acabamento antipilling (antifrizz de lavagem).</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
          </div>

          {/* DYNAMIC PRODUCTS FEED OR EMPTY STATE */}
          {sortedProducts.length === 0 ? (
            <div className="text-center py-24 bg-white border border-neutral-200 rounded-[2rem] max-w-lg mx-auto p-8 shadow-xs">
              <p className="text-3xl">🏜️</p>
              <h3 className="text-lg font-black uppercase tracking-wider mt-4">Nenhum produto encontrado</h3>
              <p className="text-gray-400 text-xs mt-2 uppercase tracking-wide">Tente redefinir seu termo de pesquisa ou limpar os filtros de coleção selecionados.</p>
              <button
                id="btn-all-reset"
                onClick={() => {
                  setSearchTerm('');
                  setHideOutOfStock(false);
                }}
                className="mt-6 bg-black hover:bg-[#eab308] text-white hover:text-black transition-all px-5 py-3 text-[9px] font-black uppercase tracking-widest rounded-full cursor-pointer shadow-md"
              >
                Limpar Todos os Filtros
              </button>
            </div>
          ) : (
            
            /* STREETWEAR PRODUCTS CARD GRID */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-x-6 gap-y-12 max-w-7xl mx-auto">
              {sortedProducts.map((product, i) => {
                const isPrime = product.slug === 'prime' || product.parentSlug === 'prime' || product.is_prime;
                const badge = getProductBadge(product);
                const specs = getProductSpecs(product);
                const isOOS = !isAvailable(product.slug, undefined, product.parentSlug) || getStock(product.slug, undefined, product.parentSlug) <= 0;

                return (
                  <motion.div 
                    id={`product-card-${product.id}`}
                    key={product.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: Math.min(i * 0.08, 0.4) }}
                    className={cn(
                      "group flex flex-col relative w-full bg-white rounded-[2rem] border border-neutral-100 hover:border-black/10 transition-all duration-300 overflow-hidden shadow-[0_4px_20px_rgb(0,0,0,0.01)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.04)]",
                      isPrime && "border-amber-500/30 hover:border-amber-500/80 bg-zinc-950/2"
                    )}
                  >
                    <Link 
                      id={`link-image-${product.id}`}
                      to={getProductUrl(product)} 
                      className="block w-full relative"
                    >
                      {/* Image Frame with Aspect Ratio */}
                      <div className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-950">
                        {/* Dynamic custom badges tags */}
                        {badge && (
                          <div className={cn(
                            "absolute top-4 left-4 z-30 px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest border shadow-xl flex items-center gap-1.5",
                            badge.style
                          )}>
                            {badge.text}
                          </div>
                        )}

                        {/* Out of Stock Overlay */}
                        {isOOS && (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-25 pointer-events-none">
                            <span className="bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.3em] px-4 py-2 border border-white select-none italic transform -rotate-12 shadow-2xl">
                               ESGOTADO
                            </span>
                          </div>
                        )}

                        {/* Animated Thumbnail Image */}
                        <motion.div
                          animate={{ 
                            scale: [1, 1.015, 1],
                          }}
                          transition={{ 
                            duration: 10, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                          className="w-full h-full"
                        >
                          <img 
                            src={product.images?.[0] || parentProduct.images?.[0] || '/estampas/logo-fpac.png'} 
                            alt={product.name}
                            className="w-full h-full object-cover object-center transition-all duration-700 group-hover:scale-105 block"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/estampas/logo-fpac.png'; }}
                            loading="lazy"
                          />
                        </motion.div>

                        {/* Active Promotion overlay if eligible */}
                        <PromotionBadge promotion={activePromo} productId={product.id} className="absolute top-4 right-4 z-30 shadow-md" />
                        
                      </div>
                    </Link>

                    {/* Bottom detail text cards */}
                    <div className="p-5 sm:p-6 flex flex-col flex-1 text-left space-y-3 bg-white relative z-20">
                      
                      {/* Technical Monospace Specs Row */}
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 font-mono text-[8px] font-black uppercase tracking-wider text-gray-400">
                        <span className="bg-neutral-100 px-2 py-0.5 rounded text-neutral-600 font-bold">{specs.gsm}</span>
                        <span>•</span>
                        <span className="text-neutral-500">{specs.fit}</span>
                        <span>•</span>
                        <span className="truncate max-w-[130px]">{specs.material}</span>
                      </div>

                      {/* Title & Headline lines */}
                      <div className="flex-1 space-y-1.5 min-h-[50px] flex flex-col justify-start">
                        <Link 
                          id={`link-text-${product.id}`}
                          to={getProductUrl(product)}
                          className="block"
                        >
                          <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight italic text-zinc-950 transition-colors group-hover:text-[#eab308] leading-tight">
                            {product.headline || product.collection || product.category || "F PAC STORE"}
                          </h3>
                        </Link>
                        <p className="text-[9px] text-[#eab308] font-extrabold uppercase tracking-[0.25em] line-clamp-1">
                          {product.headline || "COLEÇÃO EXCLUSIVA F PAC"}
                        </p>
                      </div>

                      {/* Display Size Pills in mini preview */}
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[8px] text-gray-400 uppercase font-bold mr-1 tracking-wider font-mono">TAM:</span>
                        {product.sizes?.map((size: string) => (
                          <span key={size} className="text-[8px] sm:text-[9px] font-mono font-black border border-neutral-150 px-1.5 py-0.5 rounded bg-neutral-50 text-neutral-700">
                            {size}
                          </span>
                        ))}
                      </div>

                      {/* Display Color visual circles overlay */}
                      {product.colors && product.colors.length > 0 && (
                        <div className="flex items-center gap-1.5 select-none pt-1">
                          <span className="text-[8px] text-gray-400 uppercase font-bold mr-1 tracking-wider font-mono">CORES:</span>
                          <div className="flex items-center gap-1">
                            {product.colors.slice(0, 5).map((color: any, idx: number) => (
                              <div
                                key={idx}
                                title={color.name}
                                className="w-2.5 h-2.5 rounded-full border border-black/15 shadow-xs"
                                style={{ backgroundColor: color.hex }}
                              />
                            ))}
                            {product.colors.length > 5 && (
                              <span className="text-[8px] font-mono font-black text-gray-400 leading-none pl-0.5">
                                +{product.colors.length - 5}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Price tag & Shopping button footer */}
                      <div className="pt-4 border-t border-neutral-100 flex items-center justify-between">
                        {(() => {
                          const prices = getDisplayPrices(product);
                          return (
                            <div className="flex flex-col">
                              <span className="text-[8px] text-neutral-400 font-bold uppercase tracking-wider font-mono">VALOR UNITÁRIO</span>
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                {prices.hasDiscount && (
                                  <span className="text-xs text-gray-400 line-through font-bold font-mono">
                                    R$ {prices.originalPrice.toFixed(2).replace('.', ',')}
                                  </span>
                                )}
                                <span className="text-base sm:text-lg font-black text-zinc-950">
                                  R$ {prices.effectivePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                        <Link 
                          id={`btn-details-${product.id}`}
                          to={getProductUrl(product)}
                          className={cn(
                            "inline-flex items-center gap-1.5 py-2.5 px-4 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all duration-300",
                            isPrime 
                              ? "bg-amber-500 hover:bg-amber-600 text-zinc-950" 
                              : "bg-black hover:bg-[#eab308] text-white hover:text-black"
                          )}
                        >
                          {isPrime ? "CUSTOMIZAR" : "VER DETALHES"}
                          <ArrowRight size={11} />
                        </Link>
                      </div>

                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* STREETWEAR INTERACTIVE FAQ SECTION */}
          <section className="mt-20 md:mt-28 max-w-4xl mx-auto bg-white p-6 md:p-8 rounded-[2.5rem] border border-neutral-200/65 shadow-2.5xl">
            <div className="text-center mb-8">
              <span className="text-[9px] text-[#eab308] font-black uppercase tracking-[0.34em]">QUER CONHECER MAIS?</span>
              <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight italic mt-1.5 text-black">FAQ • CENTRAL DE AJUDA</h2>
              <p className="text-gray-400 font-extrabold uppercase tracking-wide text-[9px] mt-1">Dúvidas rápidas sobre estampas, medidas e prazos para acelerar o seu pedido.</p>
            </div>

            <div className="space-y-3.5">
              {[
                {
                  question: "Qual o caimento / modelagem das camisetas?",
                  answer: "Nossas camisetas seguem a modelagem Oversized Streetwear tradicional Americana. Cavas deslocadas, mangas mais amplas e gola de 3cm canelada encorpada. O caimento é amplo e estruturado no corpo. Para um caimento oversized clássico, compre o seu tamanho habitual. Se preferir algo mais rente ao corpo, opte por um tamanho menor."
                },
                {
                  question: "O que é o tecido de 'Alta Gramatura' (240GSM)?",
                  answer: "GSM (Gramas por Metro Quadrado) de 240g representa uma malha extremamente encorpada, pesada e resistente. Ao contrário das camisetas comuns de 150g das lojas tradicionais, o tecido 240GSM proporciona um caimento impecável que não marca, possui máxima durabilidade a dezenas de lavagens e transmite robustez de verdade (estilo streetwear internacional)."
                },
                {
                  question: `Como funciona a personalização da coleção ${COLLECTIONS_CONFIG.prime.name}?`,
                  answer: `A coleção ${COLLECTIONS_CONFIG.prime.name} é o ápice da exclusividade F PAC ("${COLLECTIONS_CONFIG.prime.slogan}"). Você escolhe o tamanho e a cor da camiseta base e pode aplicar até 3 estampas exclusivas com a marca obrigatória ${COLLECTIONS_CONFIG.prime.sleeveLogo} na manga. A customização é interativa na página do produto.`
                },
                {
                  question: `Qual a diferença entre a coleção ${COLLECTIONS_CONFIG.force.name} e a coleção ${COLLECTIONS_CONFIG.mark.name}?`,
                  answer: `A ${COLLECTIONS_CONFIG.force.name} ("${COLLECTIONS_CONFIG.force.slogan}") foca em ${COLLECTIONS_CONFIG.force.rules.join(', ')}. A ${COLLECTIONS_CONFIG.mark.name} ("${COLLECTIONS_CONFIG.mark.slogan}") traz ${COLLECTIONS_CONFIG.mark.rules.join(', ')}. Ambas possuem malha encorpada de alta qualidade (${COLLECTIONS_CONFIG.force.specs.join(' • ')}).`
                }
              ].map((faq, index) => {
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
      </div>
    </>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, ArrowRight, ChevronDown, Loader2, PackageSearch, Search, SlidersHorizontal, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { products as staticProducts } from '../data/products';
import { buildSellableCatalog, productMatchesCommercialLine } from '../lib/catalogProducts';
import { getDisplayPrices, getEffectivePrice, getProductUrl } from '../lib/utils';
import { useInventory } from '../hooks/useInventory';
import { getActivePromotion } from '../services/promotions/getActivePromotion';
import { PromotionBadge } from '../components/promotions/PromotionBadge';
import type { WeeklyPromotion } from '../types/promotions';
import { fetchPublicProducts, subscribePublicProductSnapshot } from '../services/publicProducts';

type SortMode = 'recommended' | 'newest' | 'price-asc' | 'price-desc';
type CollectionFilter = 'all' | 'force' | 'mark' | 'prime';

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function CatalogStorefront() {
  const navigate = useNavigate();
  const { isAvailable, getStock } = useInventory();
  const [products, setProducts] = useState<any[]>(() => buildSellableCatalog(staticProducts, []));
  const [loading, setLoading] = useState(true);
  const [brandConfig, setBrandConfig] = useState<any>(null);
  const [activePromo, setActivePromo] = useState<WeeklyPromotion | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>(() => {
    const requested = normalize(searchParams.get('line'));
    return requested === 'force' || requested === 'mark' || requested === 'prime' ? requested : 'all';
  });
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>('recommended');
  const [showFilters, setShowFilters] = useState(false);

  const isCampaignOnly = searchParams.get('promo') === 'active';

  useEffect(() => {
    const loadPublicFallback = () => fetchPublicProducts().then(dynamic => {
      setProducts(buildSellableCatalog(staticProducts, dynamic));
      setLoading(false);
    });
    const unsubscribeProducts = subscribePublicProductSnapshot(
      snapshot => {
        const dynamic = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        if (dynamic.length > 0) {
          setProducts(buildSellableCatalog(staticProducts, dynamic));
          setLoading(false);
        } else void loadPublicFallback();
      },
      () => void loadPublicFallback(),
    );

    const unsubscribeBrand = onSnapshot(doc(db, 'config', 'brand'), snapshot => {
      setBrandConfig(snapshot.exists() ? snapshot.data() : null);
    });

    getActivePromotion().then(setActivePromo).catch(() => setActivePromo(null));

    return () => {
      unsubscribeProducts();
      unsubscribeBrand();
    };
  }, []);

  useEffect(() => {
    const requested = normalize(searchParams.get('line'));
    if (requested === 'prime') {
      navigate('/prime', { replace: true });
      return;
    }
    setCollectionFilter(requested === 'force' || requested === 'mark' || requested === 'prime' ? requested : 'all');
  }, [navigate, searchParams]);

  const visibleProducts = useMemo(() => {
    const term = normalize(search.trim());

    const filtered = products.filter(product => {
      if (!Array.isArray(product.images) || product.images.length === 0) return false;

      if (term) {
        const haystack = [
          product.name,
          product.headline,
          product.description,
          product.slug,
          product.parentSlug,
          product.collection,
          product.baseModel,
          product.productType,
          product.category,
          ...(Array.isArray(product.tags) ? product.tags : []),
        ].map(normalize).join(' ');
        if (!haystack.includes(term)) return false;
      }

      if (collectionFilter !== 'all') {
        if (!productMatchesCommercialLine(product, collectionFilter)) return false;
      }

      if (isCampaignOnly && activePromo?.active) {
        const ids = activePromo.product_ids || [];
        const eligible = ids.length === 0 || ids.includes(product.id) || activePromo.discount_type === 'free_shipping';
        if (!eligible) return false;
      }

      const available = isAvailable(product.slug, undefined, product.parentSlug) && getStock(product.slug, undefined, product.parentSlug) > 0;
      if ((brandConfig?.hideOutOfStock || hideOutOfStock) && !available) return false;

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'price-asc') return getEffectivePrice(a) - getEffectivePrice(b);
      if (sortBy === 'price-desc') return getEffectivePrice(b) - getEffectivePrice(a);
      if (sortBy === 'newest') {
        const aDate = a.createdAt?.toDate?.() || a.createdAt || 0;
        const bDate = b.createdAt?.toDate?.() || b.createdAt || 0;
        return Number(bDate) - Number(aDate);
      }
      if (Boolean(a.isBestseller) !== Boolean(b.isBestseller)) return a.isBestseller ? -1 : 1;
      const aDate = a.createdAt?.toDate?.() || a.createdAt || 0;
      const bDate = b.createdAt?.toDate?.() || b.createdAt || 0;
      return Number(bDate) - Number(aDate);
    });
  }, [products, search, collectionFilter, hideOutOfStock, sortBy, brandConfig, isCampaignOnly, activePromo, isAvailable, getStock]);

  const clearFilters = () => {
    setSearch('');
    setCollectionFilter('all');
    setHideOutOfStock(false);
    setSortBy('recommended');
    if (isCampaignOnly) {
      const params = new URLSearchParams(searchParams);
      params.delete('promo');
      setSearchParams(params);
    }
  };

  const selectCollection = (value: CollectionFilter) => {
    if (value === 'prime') {
      navigate('/prime');
      return;
    }
    setCollectionFilter(value);
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('line');
    else params.set('line', value);
    setSearchParams(params, { replace: true });
  };

  const pageCopy: Record<CollectionFilter, { eyebrow: string; title: string; accent: string; description: string }> = {
    all: { eyebrow: 'Todos os produtos', title: 'Catálogo', accent: 'completo', description: 'Escolha a peça, a linha e encontre o produto certo.' },
    force: { eyebrow: 'Linha FORCE', title: 'Minimalista.', accent: 'Marcante.', description: 'Estampas pequenas, acabamento limpo e diferentes tipos de produto.' },
    mark: { eyebrow: 'Linha MARK', title: 'Presença.', accent: 'Atitude.', description: 'Estampas grandes ou até duas aplicações em diferentes produtos.' },
    prime: { eyebrow: 'Linha PRIME', title: 'Sua ideia.', accent: 'Sua peça.', description: 'Produtos personalizáveis com escolha de arte, posição e tamanho.' },
  };
  const copy = pageCopy[collectionFilter];

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-24">
      <Helmet>
        <title>Catálogo Completo | F PAC STORE</title>
        <meta name="description" content="Explore o catálogo completo F PAC STORE com busca, filtros e preços atualizados pelas fontes atuais da loja." />
        <link rel="canonical" href="https://www.fpacstore.com.br/catalog/all" />
      </Helmet>

      <section className="bg-black text-white px-4 sm:px-8 py-5 md:py-10">
        <div className="max-w-7xl mx-auto">
          <Link to="/produtos" className="inline-flex min-h-8 items-center gap-2 text-[8px] md:text-[10px] font-black uppercase tracking-[0.18em] text-white/55 hover:text-[#eab308] transition-colors">
            <ArrowLeft size={15} /> Navegar por categorias
          </Link>
          <div className="mt-2 md:mt-4">
            <p className="text-[#eab308] text-[9px] md:text-xs font-black uppercase tracking-[0.28em]">{copy.eyebrow}</p>
            <h1 className="mt-1 text-3xl sm:text-5xl font-black uppercase italic leading-[0.92] tracking-tight">{copy.title} <span className="text-[#eab308]">{copy.accent}</span></h1>
            <p className="mt-2 max-w-2xl text-xs md:text-sm text-white/60">{copy.description}</p>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 md:py-5 relative z-10">
        <section className="bg-white border border-black/10 rounded-2xl shadow-sm p-2.5 md:p-5">
          {isCampaignOnly && activePromo?.active && (
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl bg-[#eab308]/10 border border-[#eab308]/30 p-4">
              <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#8a6600]">Campanha ativa</p><p className="mt-1 font-black text-black">{activePromo.title}</p>{activePromo.description && <p className="mt-1 text-xs text-black/55">{activePromo.description}</p>}</div>
              <button type="button" onClick={() => { const params = new URLSearchParams(searchParams); params.delete('promo'); setSearchParams(params); }} className="min-h-10 px-4 rounded-lg bg-black text-white text-[9px] font-black uppercase tracking-[0.16em]">Ver todos</button>
            </div>
          )}

          <div className="grid lg:grid-cols-[1fr_auto] gap-2.5 md:gap-4 items-center">
            <label className="relative block">
              <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto..." className="w-full min-h-11 rounded-xl bg-[#f7f7f5] border border-black/10 pl-11 pr-11 text-sm font-semibold outline-none focus:border-[#eab308]" />
              {search && <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center" aria-label="Limpar busca"><X size={16} /></button>}
            </label>

            <button type="button" onClick={() => setShowFilters(value => !value)} className="lg:hidden min-h-10 rounded-xl border border-black/10 px-4 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.16em]">
              <SlidersHorizontal size={14} /> Filtros <ChevronDown size={14} className={showFilters ? 'rotate-180' : ''} />
            </button>
            <div className={`${showFilters ? 'flex' : 'hidden'} lg:flex flex-col sm:flex-row gap-3`}>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortMode)} className="min-h-12 rounded-xl border border-black/10 bg-white px-4 text-xs font-black uppercase tracking-wide outline-none focus:border-[#eab308]">
                <option value="recommended">Recomendados</option>
                <option value="newest">Mais recentes</option>
                <option value="price-asc">Menor preço</option>
                <option value="price-desc">Maior preço</option>
              </select>
              <label className="min-h-12 rounded-xl border border-black/10 px-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-wide cursor-pointer select-none">
                <input type="checkbox" checked={hideOutOfStock} onChange={e => setHideOutOfStock(e.target.checked)} className="accent-black" /> Ocultar esgotados
              </label>
            </div>
          </div>

          <div className="mt-2.5 pt-2.5 md:mt-4 md:pt-4 border-t border-black/5 flex items-center justify-between gap-3">
            <div className="flex min-w-0 gap-1.5 overflow-x-auto scrollbar-none">
              {([
                ['all', 'Todos'],
                ['force', 'FORCE'],
                ['mark', 'MARK'],
                ['prime', 'PRIME'],
              ] as Array<[CollectionFilter, string]>).map(([value, label]) => (
                <button key={value} type="button" onClick={() => selectCollection(value)} className={`shrink-0 min-h-9 px-3.5 rounded-full border text-[8px] md:text-[9px] font-black uppercase tracking-[0.14em] transition-colors ${collectionFilter === value ? 'bg-black text-[#eab308] border-black' : 'bg-white text-black/55 border-black/10 hover:border-black/30'}`}>{label}</button>
              ))}
            </div>
            <div className="shrink-0 text-[9px] text-black/45 font-bold">{visibleProducts.length} {visibleProducts.length === 1 ? 'produto' : 'produtos'}</div>
          </div>
        </section>

        <section className="py-3 md:py-8">
          {loading ? (
            <div className="min-h-[360px] grid place-items-center"><div className="flex flex-col items-center gap-3"><Loader2 className="animate-spin text-[#eab308]" size={34} /><span className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Carregando catálogo...</span></div></div>
          ) : visibleProducts.length === 0 ? (
            <div className="max-w-xl mx-auto bg-white border border-black/10 rounded-2xl p-8 md:p-12 text-center shadow-sm">
              <PackageSearch size={34} className="mx-auto text-[#b88700]" />
              <h2 className="mt-4 text-2xl font-black uppercase italic">Nenhum produto encontrado</h2>
              <p className="mt-3 text-sm text-black/50">Tente outra busca ou remova os filtros atuais.</p>
              <button type="button" onClick={clearFilters} className="mt-6 min-h-11 px-6 rounded-xl bg-black text-white text-[10px] font-black uppercase tracking-[0.18em]">Limpar filtros</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-7">
              {visibleProducts.map(product => {
                const prices = getDisplayPrices(product);
                const available = isAvailable(product.slug, undefined, product.parentSlug) && getStock(product.slug, undefined, product.parentSlug) > 0;
                const isPrime = productMatchesCommercialLine(product, 'prime') || Boolean(product.is_prime);
                const productTarget = isPrime ? `/prime?product=${encodeURIComponent(product.id || product.slug)}` : getProductUrl(product);

                return (
                  <article key={product.id || product.slug} className="group flex flex-col overflow-hidden rounded-xl md:rounded-2xl bg-white border border-black/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
                    <Link to={productTarget} className="relative block aspect-square md:aspect-[4/5] bg-black overflow-hidden">
                      <img src={product.images?.[0] || '/estampas/logo-fpac.png'} alt={product.name || 'Produto F PAC STORE'} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" loading="lazy" onError={e => { e.currentTarget.src = '/estampas/logo-fpac.png'; }} />
                      {!available && <span className="absolute top-3 left-3 bg-black/85 text-white border border-white/10 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-[0.16em]">Esgotado</span>}
                      {available && product.isBestseller && <span className="absolute top-3 left-3 bg-[#eab308] text-black px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-[0.16em]">Mais vendido</span>}
                      {available && !product.isBestseller && product.isNew && <span className="absolute top-3 left-3 bg-white text-black px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-[0.16em]">Novidade</span>}
                      <PromotionBadge promotion={activePromo} productId={product.id} className="absolute top-3 right-3 z-10" />
                    </Link>

                    <div className="p-3 md:p-4 flex flex-col flex-1">
                      <p className="text-[7px] md:text-[8px] font-black uppercase tracking-[0.16em] text-[#9a7100]">{isPrime ? 'PRIME' : normalize(product.collection || product.category || product.baseModel || 'F PAC').toUpperCase()}</p>
                      <Link to={productTarget} className="mt-1"><h2 className="text-xs md:text-lg font-black uppercase leading-tight text-black group-hover:text-[#9a7100] transition-colors line-clamp-2">{product.name || product.headline || 'F PAC STORE'}</h2></Link>
                      <div className="mt-auto pt-3 flex items-end justify-between gap-2">
                        <div>
                          {prices.hasDiscount && <p className="mt-1 text-xs text-black/35 line-through">R$ {prices.originalPrice.toFixed(2).replace('.', ',')}</p>}
                          <p className="text-sm md:text-lg font-black text-black">R$ {prices.effectivePrice.toFixed(2).replace('.', ',')}</p>
                        </div>
                        <Link to={productTarget} aria-label={isPrime ? 'Personalizar produto' : 'Ver produto'} className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${isPrime ? 'bg-[#eab308] text-black' : 'bg-black text-white hover:bg-[#eab308] hover:text-black'}`}><ArrowRight size={14} /></Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

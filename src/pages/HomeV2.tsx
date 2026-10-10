import { HomeHeroCarousel, type HomeHeroSlide } from '../components/HomeHeroCarousel';
import { resolveBrandMedia } from '../lib/brandMedia';
import type { MediaSlotConfig } from '../types/mediaSlot';
import { subscribePublicProductSnapshot } from '../services/publicProducts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  Crown,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Instagram,
  Layers3,
  PackageCheck,
  PackageSearch,
  Play,
  Scissors,
  ShieldCheck,
  Shirt,
  Sparkles,
  Truck,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { products as staticProducts } from '../data/products';
import { getPublicApiUrl } from '../lib/api';
import { productMatchesStorefrontCategory, productMatchesCommercialLine, buildSellableCatalog } from '../lib/catalogProducts';
import { getDisplayPrices, getProductUrl } from '../lib/utils';

const INSTAGRAM_URL = 'https://www.instagram.com/f_pac_store';

type InstagramFeedItem = {
  id: string;
  caption: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  mediaUrl: string;
  permalink: string;
  timestamp: string;
};

const PRODUCT_CATEGORIES = [
  { slug: 'oversized', title: 'Camisetas Oversized', eyebrow: 'Streetwear', icon: Shirt },
  { slug: 'tradicional', title: 'Camisetas Tradicionais', eyebrow: 'Suedine', icon: Shirt },
  { slug: 'croppeds', title: 'Croppeds Oversized', eyebrow: 'Feminino Oversized', icon: Scissors },
  { slug: 'casacos', title: 'Casacos & Moletons', eyebrow: 'Camadas', icon: Layers3 },
  { slug: 'bermudas', title: 'Bermudas', eyebrow: 'Cargo & Lifestyle', icon: PackageSearch },
  { slug: 'bones', title: 'Bonés', eyebrow: 'Acessórios', icon: Crown },
  { slug: 'chinelos', title: 'Chinelos & Slides', eyebrow: 'Lifestyle', icon: Footprints },
  { slug: 'kits', title: 'Kits F PAC', eyebrow: 'Combinações', icon: Boxes },
  { slug: 'acessorios', title: 'Acessórios', eyebrow: 'Complementos', icon: Sparkles },
] as const;

export default function HomeV2() {
  const [hero, setHero] = useState<MediaSlotConfig | null>(null);
  const [heroMobile, setHeroMobile] = useState<MediaSlotConfig | null>(null);
  const [heroSlides, setHeroSlides] = useState<HomeHeroSlide[]>([]);
  const [brandImage, setBrandImage] = useState<string>('');
  const [aboutImage, setAboutImage] = useState<string>('');
  const [catalogImages, setCatalogImages] = useState<string[]>([]);
  const [carouselProducts, setCarouselProducts] = useState<any[]>([]);
  const [activeProduct, setActiveProduct] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [instagramItems, setInstagramItems] = useState<InstagramFeedItem[]>([]);
  const [instagramLoading, setInstagramLoading] = useState(true);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const unsubProducts = subscribePublicProductSnapshot((snapshot) => {
      const dynamic = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() })) as any[];
      const products = buildSellableCatalog(staticProducts, dynamic)
        .sort((a: any, b: any) => Number(a.displayOrder || 9999) - Number(b.displayOrder || 9999));
      setCarouselProducts(products);
      setActiveProduct((current) => current % PRODUCT_CATEGORIES.length);
    });

    const unsubBrand = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setHero(resolveBrandMedia(data, 'heroMedia', 'heroUrl'));
      setHeroMobile(resolveBrandMedia(data, 'heroMobileMedia', 'heroMobileUrl'));
      setBrandImage(resolveBrandMedia(data, 'logoMedia', 'imageUrl')?.url || '/estampas/logo-fpac.png');
      setAboutImage(data.aboutUrl || data.aboutMedia?.url || '');
      setCatalogImages([
        data.catalogImage1 || data.catalogSlot1?.url || '',
        data.catalogImage2 || data.catalogSlot2?.url || '',
      ].filter(Boolean));
    });

    const instagramAbort = new AbortController();
    fetch(getPublicApiUrl('/api/instagram/feed?limit=5'), { signal: instagramAbort.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Instagram feed unavailable')))
      .then((payload) => setInstagramItems(Array.isArray(payload?.items) ? payload.items : []))
      .catch((error) => {
        if (error?.name !== 'AbortError') setInstagramItems([]);
      })
      .finally(() => setInstagramLoading(false));

    return () => {
      unsubProducts();
      unsubBrand();
      instagramAbort.abort();
    };
  }, []);

  useEffect(() => {
    const usedImages = new Set<string>();
    const productImage = (product: any) => String(product?.images?.[0] || '');
    const imageProducts = carouselProducts.filter((product: any) => productImage(product));
    const campaignMedia = hero || heroMobile;
    const campaignImage = campaignMedia?.url || catalogImages[0] || productImage(imageProducts[0]) || '/product-visuals/fpac-products-front-v1.webp';
    const slides: HomeHeroSlide[] = [
      {
        id: 'identity',
        eyebrow: 'F PAC STORE',
        title: 'NÃO É SÓ ROUPA. É IDENTIDADE.',
        href: '/produtos',
        image: campaignImage,
        alt: 'Coleção F PAC STORE',
        media: campaignMedia || undefined,
        mobileMedia: heroMobile || undefined,
      },
    ];
    if (campaignMedia?.url) usedImages.add(campaignMedia.url);

    const lines = [
      { id: 'force', line: 'force', eyebrow: 'FORCE', title: 'O ESSENCIAL, COM PRESENÇA.', href: '/catalog/all?line=force' },
      { id: 'mark', line: 'mark', eyebrow: 'MARK', title: 'PRESENÇA QUE FALA POR VOCÊ.', href: '/catalog/all?line=mark' },
      { id: 'prime', line: 'prime', eyebrow: 'PRIME', title: 'SUA IDEIA. SUA PEÇA.', href: '/prime' },
    ] as const;
    lines.forEach((line, index) => {
      const product = imageProducts.find((candidate: any) =>
        productMatchesCommercialLine(candidate, line.line) && !usedImages.has(productImage(candidate)),
      );
      const fallback = catalogImages[index % Math.max(catalogImages.length, 1)] || campaignImage;
      const image = productImage(product) || fallback;
      usedImages.add(image);
      slides.push({
        id: line.id,
        eyebrow: line.eyebrow,
        title: line.title,
        href: product ? getProductUrl(product) : line.href,
        image,
        alt: product?.name || `Coleção ${line.eyebrow} F PAC STORE`,
      });
    });
    setHeroSlides(slides);
  }, [carouselProducts, hero, heroMobile, catalogImages]);

  const categoryProducts = useMemo(() => PRODUCT_CATEGORIES.map(category => ({
    ...category,
    products: carouselProducts.filter(product => productMatchesStorefrontCategory(product, category.slug)),
  })), [carouselProducts]);
  const bestSellingProducts = useMemo(
    () => carouselProducts.filter((product: any) => product.isBestseller === true).slice(0, 4),
    [carouselProducts],
  );
  const newProducts = useMemo(
    () => carouselProducts.filter((product: any) => product.isNew === true).slice(0, 4),
    [carouselProducts],
  );
  const renderProductCards = (items: any[]) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-5">
      {items.map((product: any) => {
        const price = getDisplayPrices(product);
        const isPrimeProduct = productMatchesCommercialLine(product, 'prime') || Boolean(product.is_prime);
        const target = isPrimeProduct ? `/prime?product=${encodeURIComponent(product.id || product.slug)}` : getProductUrl(product);
        return (
          <article key={product.id || product.slug} className="group overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl">
            <Link to={target} className="relative block aspect-[4/5] overflow-hidden bg-black">
              <img src={product.images?.[0] || '/estampas/logo-fpac.png'} alt={product.name || 'Produto F PAC STORE'} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={event => { event.currentTarget.src = '/estampas/logo-fpac.png'; }} />
              {product.isBestseller === true && <span className="absolute left-3 top-3 rounded-full bg-[#eab308] px-3 py-1.5 text-[8px] font-black uppercase tracking-wider text-black">Mais vendido</span>}
              {product.isNew === true && <span className="absolute right-3 top-3 rounded-full bg-white px-3 py-1.5 text-[8px] font-black uppercase tracking-wider text-black">Lançamento</span>}
            </Link>
            <div className="p-3 md:p-4">
              <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#9a7100]">{isPrimeProduct ? 'PRIME' : String(product.collection || product.category || 'F PAC').toUpperCase()}</p>
              <Link to={target} className="mt-1 block min-h-10 text-xs font-black uppercase leading-tight text-black line-clamp-2 md:text-sm">{product.name || product.headline || 'Produto F PAC'}</Link>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  {price.hasDiscount && <p className="text-[10px] text-black/40 line-through">R$ {price.originalPrice.toFixed(2).replace('.', ',')}</p>}
                  <p className="text-base font-black text-black md:text-lg">R$ {price.effectivePrice.toFixed(2).replace('.', ',')}</p>
                  <p className="text-[8px] text-black/45">Preço atualizado pela loja</p>
                </div>
                <Link to={target} aria-label={isPrimeProduct ? 'Personalizar produto' : 'Ver produto'} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black text-[#eab308] transition-colors hover:bg-[#eab308] hover:text-black"><ArrowRight size={16} /></Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );

  const next = () => setActiveProduct((prev) => (prev + 1) % PRODUCT_CATEGORIES.length);
  const prev = () => setActiveProduct((prev) => (prev - 1 + PRODUCT_CATEGORIES.length) % PRODUCT_CATEGORIES.length);
  const carouselSlots = [-1, 0, 1].map(offset => ({
    offset,
    index: (activeProduct + offset + categoryProducts.length) % categoryProducts.length,
    category: categoryProducts[(activeProduct + offset + categoryProducts.length) % categoryProducts.length],
  }));

  useEffect(() => {
    if (carouselPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setActiveProduct(current => (current + 1) % PRODUCT_CATEGORIES.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [carouselPaused]);

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    setCarouselPaused(false);
    if (touchStartX.current === null) return;
    const movement = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(movement) < 45) return;
    if (movement < 0) next();
    else prev();
  };

  const values = useMemo(
    () => [
      { icon: PackageCheck, title: 'Seleção de qualidade', desc: 'Conforto, acabamento e presença.' },
      { icon: Layers3, title: 'Estilo com propósito', desc: 'Coleções para identidades diferentes.' },
      { icon: ShieldCheck, title: 'Padrão F PAC', desc: 'Experiência coerente do produto ao pós-venda.' },
      { icon: Truck, title: 'Entrega nacional', desc: 'Envio para todo o Brasil com acompanhamento.' },
    ],
    [],
  );

  return (
    <div className="w-full bg-white" data-home-version="canonical-v6">
      <Helmet>
        <title>F PAC STORE | Não é só roupa. É identidade!</title>
        <meta
          name="description"
          content="Streetwear F PAC STORE para quem transforma estilo em identidade. Conheça os produtos atuais da marca e escolha sua linha FORCE, MARK ou PRIME."
        />
      </Helmet>

      <HomeHeroCarousel slides={heroSlides} />
 
      <section id="collections" data-home-collections className="border-b border-black/5 bg-[#f7f7f5] py-5 md:py-7">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#9a7100]">Encontre seu estilo</p><h2 className="text-lg font-black uppercase text-black md:text-2xl">Acesse uma linha</h2></div>
            <Link to="/catalog/all" className="inline-flex min-h-10 items-center gap-2 text-[8px] font-black uppercase tracking-wider text-black md:text-[10px]">Ver catálogo <ArrowRight size={14} /></Link>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
            {[
              { label: 'FORCE', detail: 'Visual limpo e discreto', to: '/catalog/all?line=force' },
              { label: 'MARK', detail: 'Estampas de presença', to: '/catalog/all?line=mark' },
              { label: 'PRIME', detail: 'Personalize sua peça', to: '/prime' },
            ].map(item => (
              <Link key={item.label} to={item.to} className="flex min-h-[76px] flex-col justify-center rounded-xl border border-black/10 bg-white px-4 py-3 transition-colors hover:border-[#eab308]">
                <span className="text-xs font-black uppercase tracking-[0.14em]">{item.label}</span><span className="mt-1 text-[9px] text-black/50">{item.detail}</span>
              </Link>
            ))}
            <a href="https://wa.me/5547997465602?text=Ol%C3%A1%2C%20quero%20um%20or%C3%A7amento%20para%20uniformes%20personalizados." target="_blank" rel="noreferrer" className="flex min-h-[76px] flex-col justify-center rounded-xl border border-black bg-black px-4 py-3 text-white transition-colors hover:border-[#eab308]">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#eab308]">Empresas / Uniformes</span><span className="mt-1 text-[9px] text-white/65">Solicitar orçamento no WhatsApp</span>
            </a>
          </div>
        </div>
      </section>

      <section className="overflow-hidden border-b border-black/5 py-7 md:py-10" data-home-values>
        <div className="fpac-benefits-viewport mx-auto max-w-7xl px-5" role="region" aria-roledescription="carrossel" aria-label="Benefícios F PAC STORE" tabIndex={0}>
          <div className="fpac-benefits-marquee" aria-live="off">
            <div className="fpac-benefits-group">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex w-[min(84vw,360px)] shrink-0 items-center gap-4 rounded-2xl border border-black/5 bg-[#fafafa] p-4 md:w-[min(38vw,420px)] md:p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black text-[#eab308]"><Icon size={20} /></div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black uppercase leading-tight text-black md:text-base">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
            <div className="fpac-benefits-group" aria-hidden="true">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex w-[min(84vw,360px)] shrink-0 items-center gap-4 rounded-2xl border border-black/5 bg-[#fafafa] p-4 md:w-[min(38vw,420px)] md:p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black text-[#eab308]"><Icon size={20} /></div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black uppercase leading-tight text-black md:text-base">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      </section>

      <section data-home-products id="products" className="py-12 md:py-16 bg-white overflow-hidden">
        <div className="max-w-[980px] mx-auto px-5">
          <div className="text-center mb-7 md:mb-9">
            <p className="text-[#eab308] text-[10px] md:text-xs font-black uppercase tracking-[0.32em]">Escolha seu produto</p>
            <h2 className="mt-3 text-4xl md:text-6xl font-black uppercase italic leading-none text-black">Encontre sua próxima <span className="text-[#eab308]">peça.</span></h2>
            <p className="mt-3 text-gray-500 text-sm md:text-base max-w-2xl mx-auto">Produtos cadastrados na loja, com preço e disponibilidade atualizados pelo catálogo.</p>
          </div>

          <div
            className="relative -mx-5 select-none px-2 sm:mx-0 sm:px-8 md:px-12"
            role="region"
            aria-roledescription="carrossel"
            aria-label="Categorias de produtos"
            onMouseEnter={() => setCarouselPaused(true)}
            onMouseLeave={() => setCarouselPaused(false)}
            onFocus={() => setCarouselPaused(true)}
            onBlur={() => setCarouselPaused(false)}
            onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; setCarouselPaused(true); }}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={() => { touchStartX.current = null; setCarouselPaused(false); }}
          >
            <div className="pointer-events-none absolute inset-y-8 left-0 z-20 w-10 bg-gradient-to-r from-white to-transparent sm:hidden" />
            <div className="pointer-events-none absolute inset-y-8 right-0 z-20 w-10 bg-gradient-to-l from-white to-transparent sm:hidden" />

            <div className="grid grid-cols-[20%_60%_20%] items-center gap-1 sm:grid-cols-[24%_52%_24%] sm:gap-3 md:grid-cols-[1fr_1.45fr_1fr] md:gap-5" aria-live="polite">
              {carouselSlots.map(({ category, offset, index }) => {
                const isActive = offset === 0;
                const product = category.products[0];
                const image = product?.images?.[0] || '';
                const Icon = category.icon;
                const card = (
                  <div className={`relative aspect-[4/5] overflow-hidden bg-black transition-all duration-500 ease-out ${isActive ? 'rounded-[1.75rem] border-2 border-[#eab308] shadow-[0_24px_70px_rgba(0,0,0,0.28)] sm:rounded-[2.25rem]' : 'rounded-2xl border border-black/10 shadow-lg'}`}>
                    {image ? (
                      <img src={image} alt={category.title} className={`absolute inset-0 h-full w-full object-cover transition-transform duration-700 ${isActive ? 'scale-100' : 'scale-110'}`} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_38%,rgba(234,179,8,0.18),transparent_48%)] text-[#eab308]">
                        <Icon size={isActive ? 112 : 68} strokeWidth={1} className="transition-all duration-500" />
                      </div>
                    )}
                    <div className={`absolute inset-0 transition-colors duration-500 ${isActive ? 'bg-gradient-to-t from-black via-black/25 to-transparent' : 'bg-black/45'}`} />
                    <div className={`absolute inset-x-0 bottom-0 text-left text-white transition-all duration-500 ${isActive ? 'p-5 sm:p-7 md:p-8' : 'p-2 sm:p-4'}`}>
                      <span className={`font-black uppercase text-[#eab308] ${isActive ? 'text-[8px] tracking-[0.26em] sm:text-[10px]' : 'hidden text-[7px] tracking-[0.18em] sm:block'}`}>{category.eyebrow}</span>
                      <h3 className={`font-black uppercase italic tracking-tight ${isActive ? 'mt-2 text-2xl leading-[0.95] sm:text-4xl md:text-5xl' : 'text-[10px] leading-tight sm:mt-2 sm:text-lg md:text-xl'}`}>{category.title}</h3>
                      {isActive && (
                        <>
                          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#eab308] px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.16em] text-black sm:text-[10px]">Conhecer linha <ArrowRight size={14} /></span>
                        </>
                      )}
                    </div>
                  </div>
                );

                return isActive ? (
                  <Link key={`${category.slug}-${offset}`} to={`/produtos/${category.slug}`} className="relative z-10 block scale-100 transition-all duration-500" aria-label={`Abrir ${category.title}`}>
                    {card}
                  </Link>
                ) : (
                  <button key={`${category.slug}-${offset}`} type="button" onClick={() => setActiveProduct(index)} className="block scale-[0.86] opacity-45 transition-all duration-500 hover:opacity-75 focus:opacity-75" aria-label={`Destacar ${category.title}`}>
                    {card}
                  </button>
                );
              })}
            </div>

            <button type="button" onClick={prev} aria-label="Produto anterior" className="absolute left-5 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/90 text-white shadow-xl transition-all hover:scale-110 hover:bg-[#eab308] hover:text-black sm:left-10 md:h-12 md:w-12"><ChevronLeft size={20} /></button>
            <button type="button" onClick={next} aria-label="Próximo produto" className="absolute right-5 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/90 text-white shadow-xl transition-all hover:scale-110 hover:bg-[#eab308] hover:text-black sm:right-10 md:h-12 md:w-12"><ChevronRight size={20} /></button>

            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2" aria-label={`${activeProduct + 1} de ${categoryProducts.length}`}>
                {categoryProducts.map((category, index) => (
                  <button key={category.slug} type="button" onClick={() => setActiveProduct(index)} className={`h-2 rounded-full transition-all duration-300 ${index === activeProduct ? 'w-10 bg-[#eab308]' : 'w-2 bg-black/15 hover:bg-black/35'}`} aria-label={`Destacar ${category.title}`} aria-current={index === activeProduct ? 'true' : undefined} />
                ))}
              </div>
              <div className="flex items-center gap-3 text-[8px] font-black uppercase tracking-[0.18em] text-black/45 sm:text-[9px]">
                <span>{String(activeProduct + 1).padStart(2, '0')} / {String(categoryProducts.length).padStart(2, '0')}</span>
                <span className="h-1 w-1 rounded-full bg-[#eab308]" />
                <span>Deslize ou use as setas</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {bestSellingProducts.length > 0 && (
        <section className="bg-white py-10 md:py-14" data-home-bestsellers>
          <div className="mx-auto max-w-7xl px-5">
            <div className="mb-6 flex items-end justify-between gap-3">
              <div><p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#9a7100]">Destaques da loja</p><h2 className="mt-1 text-2xl font-black uppercase italic md:text-4xl">Mais vendidos</h2><p className="mt-1 text-xs text-black/50">Produtos marcados como mais vendidos no catálogo.</p></div>
              <Link to="/catalog/all" className="inline-flex min-h-10 items-center gap-1 text-[8px] font-black uppercase tracking-wider text-black md:text-[10px]">Ver todos <ArrowRight size={14} /></Link>
            </div>
            {renderProductCards(bestSellingProducts)}
          </div>
        </section>
      )}

      {newProducts.length > 0 && (
        <section className="bg-[#f7f7f5] py-10 md:py-14" data-home-launches>
          <div className="mx-auto max-w-7xl px-5">
            <div className="mb-6"><p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#9a7100]">Novidades cadastradas</p><h2 className="mt-1 text-2xl font-black uppercase italic md:text-4xl">Lançamentos</h2></div>
            {renderProductCards(newProducts)}
          </div>
        </section>
      )}

      <section data-home-prime className="bg-black py-10 text-white md:py-14">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-5 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#eab308]">Sua ideia vira peça</p>
            <h2 className="mt-2 text-3xl font-black uppercase italic md:text-5xl">Crie sua <span className="text-[#eab308]">PRIME</span></h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">Escolha modelo, cor, arte, posição e tamanho. Confira a prévia antes de adicionar à sacola.</p>
          </div>
          <Link to="/prime" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#eab308] px-6 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition-colors hover:bg-white">Começar agora <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section data-home-stamp-categories className="bg-white py-10 md:py-14">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#9a7100]">Escolha uma temática</p><h2 className="mt-1 text-2xl font-black uppercase italic md:text-4xl">Estampas por categoria</h2></div>
            <Link to="/estampas" className="inline-flex min-h-10 items-center gap-2 text-[9px] font-black uppercase tracking-wider">Ver todas <ArrowRight size={14} /></Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {['Frases', 'Animais', 'Urbanas', 'Minimalistas', 'Natureza'].map(category => (
              <Link key={category} to={`/estampas?q=${encodeURIComponent(category)}`} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-black/10 bg-[#f7f7f5] px-4 py-3 text-[9px] font-black uppercase tracking-wider transition-colors hover:border-[#eab308] hover:bg-black hover:text-white">
                {category}<ArrowRight size={13} className="shrink-0 text-[#9a7100]" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {catalogImages.length > 0 && (
        <section className="py-12 md:py-14 bg-[#f7f7f5]" data-home-catalog>
          <div className="max-w-6xl mx-auto px-5">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
              <div>
                <p className="text-[#b88700] text-[10px] md:text-xs font-black uppercase tracking-[0.3em]">Inspiração F PAC</p>
                <h2 className="mt-2 text-3xl md:text-5xl font-black uppercase italic text-black">Catálogo de <span className="text-[#eab308]">estampas</span></h2>
                <p className="mt-2 text-gray-500 text-sm max-w-xl">Toque em uma arte para abrir o catálogo e escolher a sua próxima estampa.</p>
              </div>
              <Link to="/estampas" className="inline-flex items-center gap-2 font-black uppercase tracking-[0.2em] text-[10px] text-black">Ver catálogo completo <ArrowRight size={15} /></Link>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {catalogImages.map((src, index) => (
                <Link key={index} to="/estampas" aria-label="Abrir catálogo de estampas" className="group relative aspect-video bg-black overflow-hidden rounded-2xl border border-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eab308]">
                  <img src={src} alt="Catálogo F PAC STORE" className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
                  <span className="absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-full bg-black/85 text-white px-4 py-2 text-[9px] font-black uppercase tracking-[0.16em] backdrop-blur-sm">Abrir catálogo <ArrowRight size={13} /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section data-home-uniforms className="bg-[#f7f7f5] py-10 md:py-14">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 md:grid-cols-[1fr_auto] md:items-center">
          <div><p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#9a7100]">Para sua equipe</p><h2 className="mt-2 text-2xl font-black uppercase italic md:text-4xl">Uniformes com a identidade da sua empresa</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-black/55">Conte para a F PAC como você imagina as peças e receba um orçamento personalizado.</p></div>
          <a href="https://wa.me/5547997465602?text=Ol%C3%A1%2C%20quero%20um%20or%C3%A7amento%20para%20uniformes%20personalizados." target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-black px-6 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#eab308] transition-colors hover:bg-[#eab308] hover:text-black"><span>Orçar uniformes</span><ArrowRight size={16} /></a>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-black text-white" data-home-brand>
        <div className="max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-8 md:gap-10 items-center">
          <div>
            <p className="text-[#eab308] text-[10px] md:text-xs font-black uppercase tracking-[0.3em]">Mais que vestir</p>
            <h2 className="mt-3 text-4xl md:text-6xl font-black uppercase italic leading-none">Estilo que fala<br />antes de <span className="text-[#eab308]">você.</span></h2>
            <p className="mt-5 text-white/65 leading-relaxed max-w-xl text-sm md:text-base">Qualidade, presença e liberdade para construir um visual com a sua assinatura.</p>
            <Link to="/produtos" className="mt-6 inline-flex items-center gap-2 text-[#eab308] font-black uppercase tracking-[0.2em] text-[10px]">Encontrar minha peça <ArrowRight size={15} /></Link>
          </div>
          {aboutImage && <div className="aspect-square bg-neutral-900 overflow-hidden border border-white/10 rounded-2xl"><img src={aboutImage} alt="F PAC STORE" className="w-full h-full object-cover" /></div>}
        </div>
      </section>

      <section className="py-12 md:py-14 bg-white" data-home-instagram>
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-7">
            <div>
              <p className="text-[#b88700] text-[10px] md:text-xs font-black uppercase tracking-[0.3em]">F PAC no Instagram</p>
              <h2 className="mt-2 text-4xl md:text-5xl font-black uppercase italic text-black">Vista. Marque. <span className="text-[#eab308]">Apareça.</span></h2>
              <p className="mt-2 text-gray-500 text-sm max-w-2xl">Bastidores, lançamentos e conteúdo real da marca. Acompanhe @f_pac_store e marque a F PAC no seu look.</p>
            </div>
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 py-3 text-white text-[10px] font-black uppercase tracking-[0.16em] shadow-lg" style={{ background: 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 52%, #fcb045 100%)' }}>
              <Instagram size={18} /> Seguir @f_pac_store
            </a>
          </div>

          {instagramLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5" aria-label="Carregando publicações do Instagram">
              {Array.from({ length: 5 }).map((_, index) => <div key={index} className="aspect-square animate-pulse rounded-2xl bg-black/5" />)}
            </div>
          ) : instagramItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {instagramItems.map((item) => (
                <a
                  key={item.id}
                  href={item.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir publicação da F PAC no Instagram${item.caption ? `: ${item.caption.slice(0, 80)}` : ''}`}
                  className="group relative aspect-square overflow-hidden rounded-2xl bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eab308] focus-visible:ring-offset-2"
                >
                  <img src={item.mediaUrl} alt="Publicação real da F PAC STORE no Instagram" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/10 opacity-80 transition-opacity group-hover:opacity-100" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 text-white">
                    <span className="text-[9px] font-black uppercase tracking-[0.16em]">Ver no Instagram</span>
                    {item.mediaType === 'VIDEO' && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black"><Play size={13} fill="currentColor" /></span>}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="group max-w-3xl mx-auto flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-[#fafafa] p-5 md:p-6 hover:border-[#eab308] transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 52%, #fcb045 100%)' }}><Instagram size={23} /></div>
                <div className="min-w-0"><p className="font-black uppercase text-black text-sm">Acompanhe a F PAC no Instagram</p><p className="text-gray-500 text-xs md:text-sm mt-1">Lançamentos, bastidores e novidades em @f_pac_store.</p></div>
              </div>
              <ArrowRight className="shrink-0 group-hover:translate-x-1 transition-transform" size={18} />
            </a>
          )}
        </div>
      </section>
    </div>
  );
}

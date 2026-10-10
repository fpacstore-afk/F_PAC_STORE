import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Crown,
  Footprints,
  Layers3,
  PackageSearch,
  Scissors,
  Shirt,
  Sparkles,
} from 'lucide-react';
import { productMatchesStorefrontCategory } from '../lib/catalogProducts';

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

type CatalogProduct = {
  images?: string[];
  [key: string]: unknown;
};

export function HomeCategoryCarousel({ products }: { products: CatalogProduct[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const categories = useMemo(() => PRODUCT_CATEGORIES.map(category => ({
    ...category,
    products: products.filter(product => productMatchesStorefrontCategory(product, category.slug)),
  })).filter(category => category.products.some(product => product.images?.[0])), [products]);

  const updatePosition = () => {
    const track = trackRef.current;
    const card = track?.querySelector<HTMLElement>('[data-category-card]');
    if (!track || !card) return;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    setCanScrollPrev(track.scrollLeft > 2);
    setCanScrollNext(track.scrollLeft < maxScroll - 2);
    setActiveIndex(Math.min(categories.length - 1, Math.round(track.scrollLeft / (card.offsetWidth + 12))));
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
    };
  }, [categories.length]);

  const scrollTo = (index: number) => {
    const track = trackRef.current;
    const card = track?.querySelector<HTMLElement>('[data-category-card]');
    if (!track || !card) return;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const next = Math.max(0, Math.min(index * (card.offsetWidth + 12), maxScroll));
    track.scrollTo({ left: next, behavior: 'smooth' });
  };

  if (categories.length === 0) return null;
  const desktopWidth = categories.length >= 5
    ? 'lg:basis-[19%]'
    : categories.length === 4
      ? 'lg:basis-[24%]'
      : categories.length === 3
        ? 'lg:basis-[32%]'
        : 'lg:basis-[49%]';

  return (
    <section data-home-products id="products" className="overflow-hidden bg-white py-12 md:py-16">
      <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5 md:mb-9">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#a97800]">Escolha seu produto</p>
            <h2 className="mt-3 max-w-4xl text-3xl font-black uppercase italic leading-[0.95] text-black sm:text-4xl lg:text-5xl">
              Encontre sua próxima <span className="text-[#c69500]">peça.</span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-black/55">Explore as categorias com produtos disponíveis no catálogo.</p>
          </div>
          {(canScrollNext || canScrollPrev) && (
            <div className="flex items-center gap-3">
              <span className="mr-2 text-[10px] font-black uppercase tracking-[0.18em] text-black/50" aria-live="polite">
                {String(activeIndex + 1).padStart(2, '0')} / {String(categories.length).padStart(2, '0')}
              </span>
              <button type="button" onClick={() => scrollTo(activeIndex - 1)} disabled={!canScrollPrev} aria-label="Categoria anterior" className="grid h-11 w-11 place-items-center rounded-full border border-black/20 text-black transition-colors hover:border-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
                <ChevronLeft size={20} />
              </button>
              <button type="button" onClick={() => scrollTo(activeIndex + 1)} disabled={!canScrollNext} aria-label="Próxima categoria" className="grid h-11 w-11 place-items-center rounded-full border border-black/20 text-black transition-colors hover:border-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
        <div
          ref={trackRef}
          onScroll={updatePosition}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden motion-reduce:scroll-auto"
          role="region"
          aria-roledescription="carrossel"
          aria-label="Categorias de produtos"
          tabIndex={0}
        >
          {categories.map(category => {
            const image = category.products.find(product => product.images?.[0])?.images?.[0] || '';
            const Icon = category.icon;
            return (
              <Link
                key={category.slug}
                to={`/produtos/${category.slug}`}
                data-category-card
                className={`group relative block aspect-[4/5] basis-[78%] shrink-0 snap-start overflow-hidden rounded-xl bg-[#151515] text-white shadow-sm outline-none transition-shadow duration-300 hover:shadow-2xl focus-visible:ring-4 focus-visible:ring-[#eab308] sm:basis-[43%] ${desktopWidth}`}
                aria-label={`Conhecer ${category.title}`}
              >
                <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_32%,rgba(234,179,8,0.28),#141414_70%)] text-[#eab308]">
                  <Icon size={80} strokeWidth={1} aria-hidden="true" />
                </div>
                <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-105" onError={event => { event.currentTarget.style.display = 'none'; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent transition-opacity duration-300 group-hover:opacity-90" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 sm:p-6">
                  <div className="min-w-0">
                    <p className="mb-2 text-[9px] font-black uppercase tracking-[0.24em] text-[#f1c40f]">{category.eyebrow}</p>
                    <h3 className="text-xl font-black uppercase italic leading-[0.98] tracking-tight sm:text-2xl xl:text-3xl">{category.title}</h3>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/75">{category.products.length} {category.products.length === 1 ? 'produto' : 'produtos'}</p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/50 bg-white/10 backdrop-blur-sm transition-colors group-hover:border-[#eab308] group-hover:bg-[#eab308] group-hover:text-black" aria-hidden="true">
                    <ArrowRight size={18} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
        {categories.length > 1 && <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.18em] text-black/45 sm:hidden">Deslize para explorar</p>}
      </div>
    </section>
  );
}

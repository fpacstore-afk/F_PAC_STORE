import React, { useEffect, useMemo, useState } from 'react';
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
import { buildSellableCatalog } from '../lib/catalogProducts';

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

const normalizeCategoryValue = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const productBelongsToCategory = (product: any, category: string) => {
  const haystack = normalizeCategoryValue([
    product?.name,
    product?.headline,
    product?.category,
    product?.productType,
    product?.baseModel,
    product?.fit,
  ].filter(Boolean).join(' '));
  if (category === 'oversized') return haystack.includes('oversized');
  if (category === 'tradicional') return /tradicional|suedine/.test(haystack);
  if (category === 'casacos') return /jacket|casaco|moletom|jaqueta/.test(haystack);
  if (category === 'bones') return /cap|bone|chapeu/.test(haystack);
  if (category === 'chinelos') return /chinelo|slide|sandalia/.test(haystack);
  if (category === 'croppeds') return /cropped|feminino/.test(haystack);
  if (category === 'bermudas') return /shorts|bermuda|short|cargo/.test(haystack);
  if (category === 'kits') return /kit f ?pac|\bkit\b/.test(haystack);
  if (category === 'acessorios') return /accessory|acessorio/.test(haystack);
  return false;
};

export default function HomeV2() {
  const [heroImage, setHeroImage] = useState<string>('');
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [brandImage, setBrandImage] = useState<string>('');
  const [aboutImage, setAboutImage] = useState<string>('');
  const [catalogImages, setCatalogImages] = useState<string[]>([]);
  const [carouselProducts, setCarouselProducts] = useState<any[]>([]);
  const [activeProduct, setActiveProduct] = useState(0);
  const [instagramItems, setInstagramItems] = useState<InstagramFeedItem[]>([]);
  const [instagramLoading, setInstagramLoading] = useState(true);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const dynamic = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() })) as any[];
      const products = buildSellableCatalog(staticProducts, dynamic)
        .sort((a: any, b: any) => Number(a.displayOrder || 9999) - Number(b.displayOrder || 9999));
      setCarouselProducts(products);
      setActiveProduct((current) => products.length ? Math.min(current, products.length - 1) : 0);
    });

    const unsubBrand = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setHeroImageFailed(false);
      setHeroImage(data.heroMobileUrl || data.heroUrl || data.heroMedia?.url || '');
      setBrandImage(data.imageUrl || '');
      setAboutImage(data.aboutUrl || data.aboutMedia?.url || '');
      setCatalogImages([
        data.catalogImage1 || data.catalogSlot1?.url || '',
        data.catalogImage2 || data.catalogSlot2?.url || '',
      ].filter(Boolean));
    });

    const instagramAbort = new AbortController();
    fetch(getPublicApiUrl('/api/instagram/feed?limit=6'), { signal: instagramAbort.signal })
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

  const categoryProducts = useMemo(() => PRODUCT_CATEGORIES.map(category => ({
    ...category,
    products: carouselProducts.filter(product => productBelongsToCategory(product, category.slug)),
  })), [carouselProducts]);
  const selected = categoryProducts[activeProduct] || categoryProducts[0];
  const selectedProduct = selected?.products?.[0];
  const selectedImage = selectedProduct?.images?.[0] || '';
  const next = () => setActiveProduct((prev) => (prev + 1) % PRODUCT_CATEGORIES.length);
  const prev = () => setActiveProduct((prev) => (prev - 1 + PRODUCT_CATEGORIES.length) % PRODUCT_CATEGORIES.length);

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

      <section className="bg-black pt-[118px] md:pt-[146px]" data-home-hero>
        <div className="relative overflow-hidden border-t border-white/10 bg-black">
          <div className={`mx-auto grid max-w-7xl items-stretch ${heroImage && !heroImageFailed ? 'lg:grid-cols-[0.92fr_1.08fr]' : ''}`}>
            <div className="relative z-10 flex flex-col justify-center px-5 py-12 text-center sm:px-8 md:py-16 lg:items-start lg:px-12 lg:py-20 lg:text-left">
              {brandImage ? (
                <img src={brandImage} alt="F PAC STORE" className="mx-auto mb-5 h-14 w-auto object-contain md:h-20 lg:mx-0" />
              ) : (
                <p className="mb-4 text-2xl font-black tracking-tight text-white md:text-4xl">F PAC STORE</p>
              )}

              <span className="inline-flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.32em] text-[#eab308] md:text-xs lg:justify-start">
                <Sparkles size={14} /> Streetwear com identidade
              </span>
              <h1 className="mt-4 max-w-3xl text-4xl font-black uppercase italic leading-[0.95] tracking-tight text-white sm:text-5xl md:text-6xl">
                Não é só roupa.<br />É <span className="text-[#eab308]">identidade!</span>
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/65 md:text-base">
                Peças, coleções e personalização para quem usa o estilo como extensão da própria atitude.
              </p>

              <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link to="/produtos" className="min-h-12 inline-flex items-center justify-center gap-3 bg-[#eab308] text-black px-7 py-4 font-black uppercase tracking-[0.2em] text-[10px] md:text-xs shadow-xl">
                  Explorar produtos <ArrowRight size={17} />
                </Link>
                <Link to="/prime" className="min-h-12 inline-flex items-center justify-center border border-white/20 text-white px-7 py-4 font-black uppercase tracking-[0.2em] text-[10px] md:text-xs hover:border-[#eab308] hover:text-[#eab308] transition-colors">
                  Criar minha PRIME
                </Link>
              </div>
            </div>

            {heroImage && !heroImageFailed && (
              <div className="relative min-h-[320px] overflow-hidden border-t border-white/10 sm:min-h-[430px] lg:min-h-[570px] lg:border-l lg:border-t-0">
                <img
                  src={heroImage}
                  alt="Coleção F PAC STORE"
                  className="absolute inset-0 h-full w-full bg-black object-cover object-center"
                  onError={() => setHeroImageFailed(true)}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent lg:bg-gradient-to-r lg:from-black/35 lg:via-transparent lg:to-transparent" />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="py-7 md:py-10 border-b border-black/5" data-home-values>
        <div className="max-w-7xl mx-auto px-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {values.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 rounded-2xl border border-black/5 bg-[#fafafa] p-4 md:p-4">
              <div className="w-11 h-11 bg-black text-[#eab308] flex items-center justify-center shrink-0 rounded-xl"><Icon size={20} /></div>
              <div>
                <h3 className="font-black uppercase text-sm md:text-base leading-tight text-black">{title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed mt-1">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="products" className="py-12 md:py-16 bg-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-7 md:mb-9">
            <p className="text-[#eab308] text-[10px] md:text-xs font-black uppercase tracking-[0.32em]">Escolha seu produto</p>
            <h2 className="mt-3 text-4xl md:text-6xl font-black uppercase italic leading-none text-black">Encontre sua próxima <span className="text-[#eab308]">peça.</span></h2>
            <p className="mt-3 text-gray-500 text-sm md:text-base max-w-2xl mx-auto">Produtos cadastrados na loja, com preço e disponibilidade atualizados pelo catálogo.</p>
          </div>

          <>
            <div className="md:hidden -mx-5 px-5 overflow-x-auto snap-x snap-mandatory flex gap-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categoryProducts.map((category) => {
              const product = category.products[0];
              const image = product?.images?.[0] || '';
              const Icon = category.icon;
              return (
                <Link key={category.slug} to={`/produtos/${category.slug}`} className="snap-center shrink-0 w-[82vw] max-w-[360px] relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-black shadow-xl">
                  {image ? <img src={image} alt={category.title} className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <div className="absolute inset-0 flex items-center justify-center text-[#eab308]"><Icon size={92} strokeWidth={1.1} /></div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/5" />
                  <div className="absolute inset-x-0 bottom-0 p-7 text-left text-white">
                    <span className="text-[#eab308] text-[9px] font-black uppercase tracking-[0.3em]">{category.eyebrow}</span>
                    <h3 className="text-3xl font-black uppercase italic tracking-tight mt-2">{category.title}</h3>
                    <p className="mt-2 text-white/75 text-xs leading-relaxed">{category.products.length > 0 ? `${category.products.length} ${category.products.length === 1 ? 'produto disponível' : 'produtos disponíveis'}` : 'Página preparada para os próximos produtos.'}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] font-black">Abrir categoria <ArrowRight size={14} /></span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="hidden md:block relative max-w-[540px] mx-auto">
            <button onClick={prev} aria-label="Coleção anterior" className="absolute -left-16 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black text-white flex items-center justify-center hover:bg-[#eab308] hover:text-black transition-colors"><ChevronLeft /></button>
            <Link to={selected ? `/produtos/${selected.slug}` : '/produtos'} className="block relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-black border border-black/10 shadow-2xl">
              {selectedImage ? <img src={selectedImage} alt={selected?.title || 'Produto F PAC STORE'} className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : selected && <div className="absolute inset-0 flex items-center justify-center text-[#eab308]"><selected.icon size={132} strokeWidth={1} /></div>}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/5" />
              <div className="absolute inset-x-0 bottom-0 p-8 text-left text-white">
                <span className="text-[#eab308] text-[10px] font-black uppercase tracking-[0.3em]">{selected?.eyebrow || 'Produto F PAC'}</span>
                <h3 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight mt-2">{selected?.title || 'F PAC STORE'}</h3>
                <p className="mt-3 text-white/75 text-sm max-w-md leading-relaxed">{selected?.products?.length ? `${selected.products.length} ${selected.products.length === 1 ? 'produto disponível' : 'produtos disponíveis'} nesta categoria.` : 'Página pronta. Os produtos cadastrados aparecerão aqui automaticamente.'}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-black">Abrir categoria <ArrowRight size={15} /></span>
              </div>
            </Link>
            <button onClick={next} aria-label="Próxima coleção" className="absolute -right-16 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black text-white flex items-center justify-center hover:bg-[#eab308] hover:text-black transition-colors"><ChevronRight /></button>
            <div className="flex justify-center gap-3 mt-5">
              {categoryProducts.map((category, index) => (
                <button key={category.slug} onClick={() => setActiveProduct(index)} className={`h-1.5 rounded-full transition-all ${index === activeProduct ? 'w-12 bg-[#eab308]' : 'w-4 bg-black/15'}`} aria-label={`Abrir ${category.title}`} />
              ))}
            </div>
          </div>
          </>
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" aria-label="Carregando publicações do Instagram">
              {Array.from({ length: 6 }).map((_, index) => <div key={index} className="aspect-square animate-pulse rounded-2xl bg-black/5" />)}
            </div>
          ) : instagramItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
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

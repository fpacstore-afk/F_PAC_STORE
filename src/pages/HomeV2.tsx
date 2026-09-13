import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Layers3, PackageCheck, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { products as staticProducts } from '../data/products';
import { StoryCard } from '../components/StoryCard';
import type { StoryCardData } from '../types/history';
import { getProductUrl } from '../lib/utils';

const COLLECTION_ORDER = ['force', 'mark', 'prime'] as const;

const COLLECTION_COPY: Record<(typeof COLLECTION_ORDER)[number], { eyebrow: string; description: string }> = {
  force: {
    eyebrow: 'Essencial',
    description: 'Visual limpo, presença discreta e identidade no detalhe.',
  },
  mark: {
    eyebrow: 'Expressão',
    description: 'Artes com mais impacto para quem quer ser visto sem perder autenticidade.',
  },
  prime: {
    eyebrow: 'Personalização',
    description: 'Sua ideia aplicada em uma peça F PAC com composição feita por você.',
  },
};

export default function HomeV2() {
  const [heroImage, setHeroImage] = useState<string>('');
  const [brandImage, setBrandImage] = useState<string>('');
  const [aboutImage, setAboutImage] = useState<string>('');
  const [catalogImages, setCatalogImages] = useState<string[]>([]);
  const [collectionProducts, setCollectionProducts] = useState<any[]>(staticProducts);
  const [activeCollection, setActiveCollection] = useState(0);
  const [storyCards, setStoryCards] = useState<StoryCardData[]>([]);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const dynamic = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() })) as any[];
      const ordered = COLLECTION_ORDER.map((slug) => {
        const fallback = staticProducts.find((p) => p.slug === slug);
        const live = dynamic.find((p) => p.slug === slug || p.id === slug);
        const merged = { ...(fallback || {}), ...(live || {}) };
        const child = dynamic.find((p) => p.parentSlug === slug && Array.isArray(p.images) && p.images.length > 0);

        if (!Array.isArray(merged.images) || merged.images.length === 0) {
          merged.images = child?.images?.length ? child.images : ['/estampas/logo-fpac.png'];
        }

        merged.slug = slug;
        merged.name = (merged.name || slug).toUpperCase();
        merged.headline = (merged.headline || merged.collection || slug).toUpperCase();
        return merged;
      });
      setCollectionProducts(ordered);
    });

    const unsubBrand = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setHeroImage(data.heroMobileUrl || data.heroUrl || data.heroMedia?.url || '');
      setBrandImage(data.imageUrl || '');
      setAboutImage(data.aboutUrl || data.aboutMedia?.url || '');
      setCatalogImages([
        data.catalogImage1 || data.catalogSlot1?.url || '',
        data.catalogImage2 || data.catalogSlot2?.url || '',
      ].filter(Boolean));
    });

    const storiesQuery = query(collection(db, 'history_cards'), orderBy('order', 'asc'));
    const unsubStories = onSnapshot(
      storiesQuery,
      (snapshot) => {
        const cards = snapshot.docs
          .map((snap) => ({ id: snap.id, ...snap.data() } as any))
          .filter((card) => card.active !== false)
          .slice(0, 5)
          .map((card, index) => ({
            id: card.id,
            title: card.title || '',
            description: card.description || '',
            videoUrl: card.videoUrl || '',
            imageUrl: card.imageUrl || '',
            instagramUrl: card.instagramUrl || 'https://instagram.com/f_pac_store',
            author: card.author || '@f_pac_store',
            order: typeof card.order === 'number' ? card.order : index + 1,
            active: true,
            featured: card.featured === true,
          }));
        setStoryCards(cards);
      },
      () => setStoryCards([]),
    );

    return () => {
      unsubProducts();
      unsubBrand();
      unsubStories();
    };
  }, []);

  const selected = collectionProducts[activeCollection] || collectionProducts[0];
  const selectedSlug = (COLLECTION_ORDER[activeCollection] || 'force') as (typeof COLLECTION_ORDER)[number];
  const selectedCopy = COLLECTION_COPY[selectedSlug];
  const selectedImage = selected?.images?.[0] || '/estampas/logo-fpac.png';
  const next = () => setActiveCollection((prev) => (prev + 1) % COLLECTION_ORDER.length);
  const prev = () => setActiveCollection((prev) => (prev - 1 + COLLECTION_ORDER.length) % COLLECTION_ORDER.length);

  const values = useMemo(
    () => [
      { icon: PackageCheck, title: 'Seleção de qualidade', desc: 'Peças escolhidas com foco em conforto, acabamento e presença.' },
      { icon: Layers3, title: 'Estilo com propósito', desc: 'Coleções diferentes para identidades e momentos diferentes.' },
      { icon: ShieldCheck, title: 'Padrão F PAC', desc: 'Uma experiência de marca coerente do produto ao pós-venda.' },
      { icon: Truck, title: 'Entrega nacional', desc: 'Envio para todo o Brasil com acompanhamento do pedido.' },
    ],
    [],
  );

  return (
    <div className="w-full bg-white" data-home-version="canonical-v5">
      <Helmet>
        <title>F PAC STORE | Não é só roupa. É identidade!</title>
        <meta
          name="description"
          content="Streetwear F PAC STORE para quem transforma estilo em identidade. Conheça as coleções FORCE, MARK e PRIME CUSTOM."
        />
      </Helmet>

      <section className="bg-black pt-[118px] md:pt-[146px]">
        <div className="relative w-full bg-black">
          <div className="relative w-full aspect-video md:aspect-[16/8] bg-black overflow-hidden">
            {heroImage ? (
              <img
                src={heroImage}
                alt="F PAC STORE"
                className="absolute inset-0 w-full h-full object-contain object-center bg-black"
              />
            ) : (
              <div className="absolute inset-0 bg-black" />
            )}
          </div>

          <div className="border-t border-white/10 bg-black px-5 py-8 md:py-12">
            <div className="max-w-5xl mx-auto flex flex-col items-center text-center">
              {brandImage ? (
                <img src={brandImage} alt="F PAC STORE" className="h-14 md:h-20 w-auto object-contain mb-4" />
              ) : (
                <h1 className="text-white text-4xl md:text-7xl font-black tracking-tight mb-3">F PAC STORE</h1>
              )}

              <span className="inline-flex items-center gap-2 text-[#eab308] text-[10px] md:text-xs uppercase tracking-[0.32em] font-black">
                <Sparkles size={14} /> Streetwear com identidade
              </span>
              <h1 className="mt-4 text-white text-3xl sm:text-4xl md:text-6xl font-black uppercase italic leading-[0.95] tracking-tight max-w-4xl">
                Não é só roupa.<br />É <span className="text-[#eab308]">identidade!</span>
              </h1>
              <p className="mt-5 max-w-2xl text-white/65 text-sm md:text-base leading-relaxed">
                Peças, coleções e personalização para quem usa o estilo como extensão da própria atitude.
              </p>

              <div className="mt-7 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Link
                  to="/produtos"
                  className="min-h-12 inline-flex items-center justify-center gap-3 bg-[#eab308] text-black px-7 py-4 font-black uppercase tracking-[0.2em] text-[10px] md:text-xs shadow-xl"
                >
                  Explorar produtos <ArrowRight size={17} />
                </Link>
                <Link
                  to="/prime"
                  className="min-h-12 inline-flex items-center justify-center border border-white/20 text-white px-7 py-4 font-black uppercase tracking-[0.2em] text-[10px] md:text-xs hover:border-[#eab308] hover:text-[#eab308] transition-colors"
                >
                  Criar minha PRIME
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-9 md:py-14 border-b border-black/5">
        <div className="max-w-7xl mx-auto px-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-7">
          {values.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4 rounded-2xl border border-black/5 bg-[#fafafa] p-5 md:bg-white md:border-0 md:p-0">
              <div className="w-12 h-12 bg-black text-[#eab308] flex items-center justify-center shrink-0 rounded-xl">
                <Icon size={21} />
              </div>
              <div>
                <h3 className="font-black uppercase text-base md:text-lg leading-tight text-black">{title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed mt-1">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="collections" className="py-14 md:py-24 bg-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-8 md:mb-12">
            <p className="text-[#eab308] text-[10px] md:text-xs font-black uppercase tracking-[0.32em]">Escolha sua expressão</p>
            <h2 className="mt-3 text-4xl md:text-6xl font-black uppercase italic leading-none text-black">
              FORCE. MARK. <span className="text-[#eab308]">PRIME.</span>
            </h2>
            <p className="mt-4 text-gray-500 text-sm md:text-base max-w-2xl mx-auto">
              Três caminhos para vestir a F PAC. Do essencial à personalização, cada linha entrega uma proposta própria.
            </p>
          </div>

          <div className="md:hidden -mx-5 px-5 overflow-x-auto snap-x snap-mandatory flex gap-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {COLLECTION_ORDER.map((slug, index) => {
              const product = collectionProducts[index] || staticProducts.find((p) => p.slug === slug);
              const image = product?.images?.[0] || '/estampas/logo-fpac.png';
              const copy = COLLECTION_COPY[slug];
              return (
                <Link
                  key={slug}
                  to={product ? getProductUrl(product) : `/model/${slug}`}
                  className="snap-center shrink-0 w-[82vw] max-w-[360px] relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-black shadow-xl"
                >
                  <img
                    src={image}
                    alt={slug.toUpperCase()}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = '/estampas/logo-fpac.png';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/5" />
                  <div className="absolute inset-x-0 bottom-0 p-7 text-left text-white">
                    <span className="text-[#eab308] text-[9px] font-black uppercase tracking-[0.3em]">{copy.eyebrow}</span>
                    <h3 className="text-5xl font-black uppercase italic tracking-tight mt-2">{slug.toUpperCase()}</h3>
                    <p className="mt-2 text-white/75 text-xs leading-relaxed">{copy.description}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] font-black">
                      Conhecer coleção <ArrowRight size={14} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="hidden md:block relative max-w-[610px] mx-auto">
            <button
              onClick={prev}
              aria-label="Coleção anterior"
              className="absolute -left-20 top-1/2 -translate-y-1/2 z-20 w-14 h-14 rounded-full bg-black text-white flex items-center justify-center hover:bg-[#eab308] hover:text-black transition-colors"
            >
              <ChevronLeft />
            </button>
            <Link
              to={selected ? getProductUrl(selected) : '/catalog'}
              className="block relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-black border border-black/10 shadow-2xl"
            >
              <img
                src={selectedImage}
                alt={selected?.name || 'Coleção F PAC STORE'}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = '/estampas/logo-fpac.png';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/5" />
              <div className="absolute inset-x-0 bottom-0 p-9 text-left text-white">
                <span className="text-[#eab308] text-[10px] font-black uppercase tracking-[0.3em]">{selectedCopy.eyebrow}</span>
                <h3 className="text-6xl font-black uppercase italic tracking-tight mt-2">{selected?.name || 'F PAC'}</h3>
                <p className="mt-3 text-white/75 text-sm max-w-md leading-relaxed">{selectedCopy.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-black">
                  Conhecer coleção <ArrowRight size={15} />
                </span>
              </div>
            </Link>
            <button
              onClick={next}
              aria-label="Próxima coleção"
              className="absolute -right-20 top-1/2 -translate-y-1/2 z-20 w-14 h-14 rounded-full bg-black text-white flex items-center justify-center hover:bg-[#eab308] hover:text-black transition-colors"
            >
              <ChevronRight />
            </button>
            <div className="flex justify-center gap-3 mt-6">
              {COLLECTION_ORDER.map((slug, index) => (
                <button
                  key={slug}
                  onClick={() => setActiveCollection(index)}
                  className={`h-1.5 rounded-full transition-all ${index === activeCollection ? 'w-12 bg-[#eab308]' : 'w-4 bg-black/15'}`}
                  aria-label={`Abrir ${slug.toUpperCase()}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {catalogImages.length > 0 && (
        <section className="py-14 md:py-20 bg-[#f7f7f5]">
          <div className="max-w-6xl mx-auto px-5">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-8">
              <div>
                <p className="text-[#b88700] text-[10px] md:text-xs font-black uppercase tracking-[0.3em]">Inspiração F PAC</p>
                <h2 className="mt-2 text-3xl md:text-5xl font-black uppercase italic text-black">Catálogo de <span className="text-[#eab308]">estampas</span></h2>
                <p className="mt-3 text-gray-500 text-sm max-w-xl">Explore artes disponíveis e use o catálogo como ponto de partida para encontrar a sua identidade.</p>
              </div>
              <Link to="/estampas" className="inline-flex items-center gap-2 font-black uppercase tracking-[0.2em] text-[10px] text-black">
                Ver catálogo completo <ArrowRight size={15} />
              </Link>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {catalogImages.map((src, index) => (
                <div key={index} className="aspect-video bg-black overflow-hidden rounded-2xl border border-black/10">
                  <img src={src} alt="Catálogo F PAC STORE" className="w-full h-full object-contain" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-16 md:py-24 bg-black text-white">
        <div className="max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-10 md:gap-14 items-center">
          <div>
            <p className="text-[#eab308] text-[10px] md:text-xs font-black uppercase tracking-[0.3em]">Mais que vestir</p>
            <h2 className="mt-3 text-4xl md:text-6xl font-black uppercase italic leading-none">
              Estilo que fala<br />antes de <span className="text-[#eab308]">você.</span>
            </h2>
            <p className="mt-6 text-white/65 leading-relaxed max-w-xl text-sm md:text-base">
              A F PAC nasce para transformar roupa em linguagem. A proposta é simples: qualidade, presença e liberdade para você construir um visual que tenha a sua assinatura.
            </p>
            <Link to="/produtos" className="mt-7 inline-flex items-center gap-2 text-[#eab308] font-black uppercase tracking-[0.2em] text-[10px]">
              Encontrar minha peça <ArrowRight size={15} />
            </Link>
          </div>
          {aboutImage && (
            <div className="aspect-square bg-neutral-900 overflow-hidden border border-white/10 rounded-2xl">
              <img src={aboutImage} alt="F PAC STORE" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-10">
            <p className="text-[#b88700] text-[10px] md:text-xs font-black uppercase tracking-[0.3em]">Comunidade F PAC</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-black uppercase italic text-black">Faça parte da <span className="text-[#eab308]">história</span></h2>
            <p className="mt-3 text-gray-500 text-sm">Conteúdo real da comunidade, bastidores e identidade em movimento.</p>
          </div>
          {storyCards.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-5">
              {storyCards.slice(0, 5).map((card, index) => (
                <StoryCard key={card.id || index} card={card} index={index} priority={index < 2} />
              ))}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto border border-black/10 rounded-2xl p-8 text-center bg-[#fafafa]">
              <p className="font-black uppercase text-black">Conteúdo da comunidade em atualização</p>
              <p className="text-gray-500 text-sm mt-2">Acompanhe os bastidores e novidades diretamente no Instagram da F PAC.</p>
            </div>
          )}
          <div className="text-center mt-10">
            <a
              href="https://instagram.com/f_pac_store"
              target="_blank"
              rel="noreferrer"
              className="inline-flex bg-black text-white px-8 py-4 font-black uppercase tracking-[0.2em] text-[10px] hover:bg-[#eab308] hover:text-black transition-colors"
            >
              @F_PAC_STORE
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

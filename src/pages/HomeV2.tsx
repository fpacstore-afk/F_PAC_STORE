import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Droplets, ShieldCheck, Truck, Zap } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { products as staticProducts } from '../data/products';
import { MediaSlot } from '../components/MediaSlot';
import { StoryCard } from '../components/StoryCard';
import type { StoryCardData } from '../types/history';
import { getProductUrl } from '../lib/utils';

const COLLECTION_ORDER = ['force', 'mark', 'prime'] as const;

export default function HomeV2() {
  const [brandConfig, setBrandConfig] = useState<any>(null);
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
      setBrandConfig(data);
      setHeroImage(data.heroUrl || data.heroMedia?.url || '');
      setBrandImage(data.imageUrl || '');
      setAboutImage(data.aboutUrl || data.aboutMedia?.url || '');
      setCatalogImages([data.catalogImage1 || data.catalogSlot1?.url || '', data.catalogImage2 || data.catalogSlot2?.url || ''].filter(Boolean));
    });

    const q = query(collection(db, 'history_cards'), orderBy('order', 'asc'));
    const unsubStories = onSnapshot(q, (snapshot) => {
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
          featured: card.featured === true
        }));
      setStoryCards(cards);
    }, () => setStoryCards([]));

    return () => {
      unsubProducts();
      unsubBrand();
      unsubStories();
    };
  }, []);

  const selected = collectionProducts[activeCollection] || collectionProducts[0];
  const heroSource = heroImage || brandConfig?.heroMedia?.url || '';
  const selectedImage = selected?.images?.[0] || '/estampas/logo-fpac.png';

  const next = () => setActiveCollection((prev) => (prev + 1) % COLLECTION_ORDER.length);
  const prev = () => setActiveCollection((prev) => (prev - 1 + COLLECTION_ORDER.length) % COLLECTION_ORDER.length);

  const values = useMemo(() => [
    { icon: Droplets, title: 'Malha Reforçada', desc: '90% Algodão 10% Poliéster (240gsm)' },
    { icon: Zap, title: 'Oversized', desc: 'Estrutura imponente e caimento impecável' },
    { icon: ShieldCheck, title: 'Qualidade Premium', desc: 'Ribana de 3cm e costuras reforçadas' },
    { icon: Truck, title: 'Envio Expresso', desc: 'Logística ágil para todo o Brasil' }
  ], []);

  return (
    <div className="w-full bg-white">
      <Helmet>
        <title>F PAC STORE | Estúdio de Identidade e Atitude Streetwear</title>
        <meta name="description" content="Streetwear premium, camisetas oversized e identidade F PAC STORE." />
      </Helmet>

      <section className="relative bg-black pt-[118px] md:pt-[146px] overflow-hidden">
        <div className="relative h-[66dvh] min-h-[430px] md:h-[82vh] md:min-h-[620px] bg-black">
          {heroSource ? (
            <MediaSlot
              src={heroSource}
              type={brandConfig?.heroMedia?.type}
              objectFit="contain"
              priority
              className="absolute inset-0 w-full h-full bg-black"
            />
          ) : (
            <div className="absolute inset-0 bg-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/10 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-8 md:pb-14 flex flex-col items-center text-center">
            {brandImage ? (
              <img src={brandImage} alt="F PAC STORE" className="h-16 md:h-24 w-auto object-contain mb-3 drop-shadow-xl" />
            ) : (
              <h1 className="text-white text-4xl md:text-7xl font-black tracking-tight mb-2">F PAC STORE</h1>
            )}
            <p className="text-white/70 text-[10px] md:text-sm uppercase tracking-[0.4em] font-black mb-5">Estúdio de identidade</p>
            <Link to="/catalog" className="bg-[#eab308] text-black px-8 py-4 font-black uppercase tracking-[0.25em] text-xs flex items-center gap-3 shadow-xl">
              Comprar agora <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-10 md:py-16">
        <div className="max-w-7xl mx-auto px-5 grid grid-cols-1 md:grid-cols-4 gap-8">
          {values.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-center md:items-start gap-4 md:flex-col">
              <div className="w-14 h-14 bg-black text-[#eab308] flex items-center justify-center shrink-0"><Icon size={24} /></div>
              <div><h3 className="font-black uppercase text-xl leading-none">{title}</h3><p className="text-gray-400 text-[11px] uppercase tracking-widest font-bold mt-1">{desc}</p></div>
            </div>
          ))}
        </div>
      </section>

      {catalogImages.length > 0 && (
        <section className="py-12 bg-neutral-50">
          <div className="max-w-6xl mx-auto px-5">
            <div className="text-center mb-8"><h2 className="text-3xl md:text-5xl font-black uppercase italic">Nosso <span className="text-[#eab308]">Catálogo</span></h2></div>
            <div className="grid md:grid-cols-2 gap-4">
              {catalogImages.map((src, index) => <div key={index} className="aspect-video bg-black overflow-hidden"><img src={src} alt="Catálogo F PAC STORE" className="w-full h-full object-contain" /></div>)}
            </div>
            <div className="text-center mt-8"><Link to="/estampas" className="inline-flex bg-black text-white px-8 py-4 font-black uppercase tracking-[0.25em] text-xs">Catálogo completo</Link></div>
          </div>
        </section>
      )}

      <section id="collections" className="py-14 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-6xl font-black uppercase italic leading-none">Estilo & <span className="text-[#eab308]">Autenticidade</span></h2>
            <p className="mt-4 text-gray-400 text-[10px] md:text-xs font-bold uppercase tracking-[0.35em]">FORCE • MARK • PRIME</p>
          </div>

          <div className="relative max-w-[460px] md:max-w-[560px] mx-auto">
            <button onClick={prev} aria-label="Coleção anterior" className="absolute left-2 md:-left-20 top-1/2 -translate-y-1/2 z-20 w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/80 text-white flex items-center justify-center"><ChevronLeft /></button>
            <Link to={selected ? getProductUrl(selected) : '/catalog'} className="block relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-black border border-black/10 shadow-2xl">
              <img src={selectedImage} alt={selected?.name || 'Coleção F PAC STORE'} className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.src = '/estampas/logo-fpac.png'; }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-8 text-center text-white">
                <span className="text-[#eab308] text-[10px] font-black uppercase tracking-[0.35em]">Coleção</span>
                <h3 className="text-5xl md:text-6xl font-black uppercase italic tracking-tight mt-2">{selected?.name || 'F PAC'}</h3>
                <p className="mt-3 text-white/70 text-xs uppercase tracking-widest font-bold">Toque para conhecer</p>
              </div>
            </Link>
            <button onClick={next} aria-label="Próxima coleção" className="absolute right-2 md:-right-20 top-1/2 -translate-y-1/2 z-20 w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/80 text-white flex items-center justify-center"><ChevronRight /></button>
          </div>

          <div className="flex justify-center gap-3 mt-6">
            {COLLECTION_ORDER.map((slug, index) => <button key={slug} onClick={() => setActiveCollection(index)} className={`h-1.5 rounded-full transition-all ${index === activeCollection ? 'w-12 bg-[#eab308]' : 'w-4 bg-black/15'}`} aria-label={`Abrir ${slug.toUpperCase()}`} />)}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-black text-white">
        <div className="max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-10 items-center">
          <div><h2 className="text-4xl md:text-6xl font-black uppercase italic leading-none">Não é só roupa.<br/>É <span className="text-[#eab308]">identidade!</span></h2><p className="mt-6 text-white/60 leading-relaxed max-w-xl">Streetwear com presença, construção premium e peças pensadas para quem usa roupa como extensão da própria identidade.</p></div>
          {aboutImage && <div className="aspect-square bg-neutral-900 overflow-hidden border border-white/10"><img src={aboutImage} alt="F PAC STORE" className="w-full h-full object-cover" /></div>}
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-10"><h2 className="text-4xl md:text-5xl font-black uppercase italic">Faça parte da <span className="text-[#eab308]">história</span></h2><p className="mt-3 text-gray-400 text-[10px] font-bold uppercase tracking-[0.35em]">Conteúdos da comunidade F PAC</p></div>
          {storyCards.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-5">{storyCards.slice(0, 5).map((card, index) => <StoryCard key={card.id || index} card={card} index={index} priority={index < 2} />)}</div>
          ) : (
            <div className="max-w-2xl mx-auto border border-black/10 p-8 text-center"><p className="font-black uppercase">Instagram ainda não conectado ao feed automático</p><p className="text-gray-500 text-sm mt-2">Enquanto a conexão oficial com a Meta não estiver autorizada, esta área não vai simular posts falsos.</p></div>
          )}
          <div className="text-center mt-10"><a href="https://instagram.com/f_pac_store" target="_blank" rel="noreferrer" className="inline-flex bg-black text-white px-8 py-4 font-black uppercase tracking-[0.25em] text-xs">@F_PAC_STORE</a></div>
        </div>
      </section>
    </div>
  );
}

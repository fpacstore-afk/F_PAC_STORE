import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Truck, Droplets, Zap, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { cn } from '../lib/utils';
import { products as staticProducts } from '../data/products';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit, doc } from 'firebase/firestore';
import { SizeChart } from '../components/SizeChart';
import { getActivePromotion } from '../services/promotions/getActivePromotion';
import { WeeklyBanner } from '../components/promotions/WeeklyBanner';
import { PromotionProducts } from '../components/promotions/PromotionProducts';
import { PromotionPopup } from '../components/promotions/PromotionPopup';
import { WeeklyPromotion } from '../types/promotions';

export default function Home() {
  const navigate = useNavigate();
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [brandImage, setBrandImage] = useState<string | null>(null);
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [catalogImage1, setCatalogImage1] = useState<string | null>(null);
  const [catalogImage2, setCatalogImage2] = useState<string | null>(null);
  const [aboutImage, setAboutImage] = useState<string | null>(null);
  const [communityImages, setCommunityImages] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePromo, setActivePromo] = useState<WeeklyPromotion | null>(null);

  useEffect(() => {
    getActivePromotion().then((promo) => {
      setActivePromo(promo);
    });
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Fetch Products
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const merged = staticProducts.map(staticP => {
        const dynamicP = dynamicData.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        const mergedP = dynamicP ? { ...staticP, ...dynamicP } : staticP;
        
        const mandatoryColors = [
          { name: "Azul Marinho", hex: "#1b263b" },
          { name: "Verde Militar", hex: "#3f4238" },
          { name: "Off White", hex: "#FAF9F6" }
        ];
        
        if (mergedP.slug === 'force' || mergedP.slug === 'mark' || mergedP.slug === 'prime') {
          if (mergedP.colors) {
            mandatoryColors.forEach(mc => {
              if (!mergedP.colors.find((c: any) => c.name === mc.name)) {
                mergedP.colors.push(mc);
              }
            });
          }
        }
        
        return mergedP;
      });

      const filtered = merged.filter(p => {
        const name = (p.name || '').toUpperCase();
        const slug = (p.slug || '').toLowerCase();
        
        const isTest = 
          slug.includes('teste') || 
          slug.includes('test') || 
          name.includes('TESTE') || 
          name.includes('TEST') ||
          name.includes('PRODUTO TESTE PAGAMENTO');

        return !isTest && p.status !== 'hidden' && p.images && p.images.length > 0;
      });

      // Prefer Mark, Prime, Force for the center feel
      const preferred = ['mark', 'prime', 'force'];
      const topProducts = filtered.sort((a,b) => {
        const idxA = preferred.indexOf(a.slug);
        const idxB = preferred.indexOf(b.slug);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      }).slice(0, 5);

      setFeaturedProducts(topProducts);
    });

    const unsubscribeBrand = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setBrandImage(data.imageUrl || null);
        setHeroImage(data.heroUrl || null);
        setCatalogImage1(data.catalogImage1 || null);
        setCatalogImage2(data.catalogImage2 || null);
        setAboutImage(data.aboutUrl || null);
        setCommunityImages(data.communityUrls || []);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeBrand();
    };
  }, []);

  // For Infinite Loop
  const extendedProducts = [...featuredProducts, ...featuredProducts, ...featuredProducts];
  const totalItems = featuredProducts.length;
  // Starting at the middle set of items
  const [internalIndex, setInternalIndex] = useState(totalItems);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const nextSlide = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setInternalIndex((prev) => prev + 1);
  };

  const prevSlide = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setInternalIndex((prev) => prev - 1);
  };

  // Correction for infinite loop after animation completes
  const handleAnimationComplete = () => {
    setIsTransitioning(false);
    if (featuredProducts.length === 0) return;
    
    if (internalIndex >= totalItems * 2) {
      setInternalIndex(totalItems);
    } else if (internalIndex < totalItems) {
      setInternalIndex(totalItems * 2 - 1);
    }
  };

  useEffect(() => {
    if (featuredProducts.length === 0) return;
    // UI index for indicators
    setCurrentIndex(internalIndex % totalItems);
  }, [internalIndex, totalItems]);

  return (
    <div className="w-full">
      <Helmet>
        <title>F PAC STORE | Estúdio de Identidade e Atitude Streetwear</title>
        <meta name="description" content="Estúdio de moda independente focado em streetwear de alta gramatura (240gsm). Camisetas oversized, estampas exclusivas e atitude urbana. Envio para todo o Brasil." />
        <meta property="og:title" content="F PAC STORE | Streetwear Identity" />
        <meta property="og:description" content="Oversized premium com conforto, presença e qualidade. Conheça nossa coleção." />
        <link rel="canonical" href="https://www.fpacstore.com.br/" />
      </Helmet>

      {/* 1. Hero Section */}
      <section className="relative h-[100dvh] md:h-screen min-h-[450px] md:min-h-[600px] flex items-center justify-center overflow-hidden bg-black">
        <div className="absolute inset-0 z-0">
              {heroImage && (
                <img 
                  src={heroImage} 
                  alt="F PAC STORE" 
                  className="w-full h-full object-contain md:object-cover object-center opacity-60 transition-all duration-1000"
                  loading="eager"
                />
              )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 md:via-black/20 to-transparent"></div>
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex flex-col items-center w-full"
          >
            {/* Dynamic Hero Logo */}
            <div className="mb-1 md:mb-2 flex justify-center w-full">
              {brandImage ? (
              <img 
                src={brandImage || undefined} 
                alt="F PAC STORE Logo" 
                className="h-16 sm:h-24 md:h-40 lg:h-52 h-auto object-contain drop-shadow-[0_20px_50px_rgba(234,179,8,0.4)]"
              />
              ) : (
                <h1 translate="no" className="text-[10vw] sm:text-[10vw] md:text-[9vw] lg:text-[100px] font-heading font-black uppercase tracking-tighter leading-[0.8] text-transparent whitespace-nowrap" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.4)', wordSpacing: '0.1em' }}>
                  F PAC STORE
                </h1>
              )}
            </div>

            <p className="text-[9px] sm:text-[11px] md:text-[1.8vw] lg:text-[18px] text-white/50 mb-7 md:mb-12 uppercase w-full flex justify-between font-black select-none px-6 md:px-6 mt-3 md:mt-6 tracking-[0.05em] md:tracking-widest max-w-[280px] sm:max-w-none">
              {"ESTÚDIO DE IDENTIDADE".split('').map((char, i) => (
                <span key={i}>{char === ' ' ? '\u00A0' : char}</span>
              ))}
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 px-4 w-full">
              <Link 
                to="/catalog"
                className="w-full sm:w-auto bg-[#eab308] text-black font-black uppercase tracking-[0.25em] text-[9px] md:text-sm lg:text-base px-6 py-3 md:px-10 md:py-4.5 rounded-none flex items-center justify-center gap-3 hover:bg-white transition-all transform active:scale-95 whitespace-nowrap shadow-[0_20px_40px_rgba(234,179,8,0.2)]"
              >
                Comprar Agora <ArrowRight size={18} className="md:w-5 md:h-5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. Brand Values (Luxury Minimalist) */}
      <section className="py-8 md:py-16 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-16">
            {[
              { icon: Droplets, title: "Malha Reforçada", desc: "90% Algodão 10% Poliéster (240gsm)" },
              { icon: Zap, title: "Oversized", desc: "Estrutura imponente e caimento impecável" },
              { icon: ShieldCheck, title: "Qualidade Premium", desc: "Ribana de 3cm e costuras reforçadas" },
              { icon: Truck, title: "Envio Expresso", desc: "Logística ágil para todo o Brasil" }
            ].map((value, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="flex flex-row md:flex-col gap-5 md:gap-4 items-center md:items-start"
              >
                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-black text-[#eab308]">
                  <value.icon size={22} className="md:w-6 md:h-6" />
                </div>
                <div className="flex flex-col space-y-0.5 md:space-y-1">
                  <h3 className="font-black uppercase tracking-tighter text-lg md:text-xl leading-none">{value.title}</h3>
                  <p className="text-gray-400 text-[10px] md:text-xs font-bold uppercase tracking-widest leading-tight md:leading-relaxed">{value.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Catalog Highlight */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col items-center text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter italic mb-2">
              NOSSO <span className="text-[#eab308]">CATÁLOGO</span>
            </h2>
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-gray-400 font-bold uppercase tracking-[0.4em] text-[8px] md:text-xs max-w-xl"
            >
              Explore a curadoria exclusiva de estampas que definem nossa identidade urbana e autêntica.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10 max-w-4xl mx-auto">
            {[1, 2].map((i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="group relative"
              >
                <div className="relative aspect-video bg-black overflow-hidden rounded-[1.5rem] border-2 border-white/5 shadow-2xl transition-all duration-700 group-hover:border-[#eab308]/50 group-hover:shadow-[0_30px_60px_-20px_rgba(234,179,8,0.2)]">
                  <motion.div
                    animate={{ 
                      scale: [1, 1.02, 1],
                    }}
                    transition={{ 
                      duration: 10, 
                      repeat: Infinity, 
                      ease: "easeInOut" 
                    }}
                    className="w-full h-full"
                  >
                    {(i === 1 ? catalogImage1 : catalogImage2) && (
                      <img 
                        src={(i === 1 ? catalogImage1 : catalogImage2) || undefined} 
                        alt="Catálogo" 
                        className="w-full h-full object-contain transition-all duration-1000 group-hover:scale-110"
                      />
                    )}
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="flex justify-center">
            <Link 
              to="/estampas" 
              className="bg-black text-white font-black uppercase tracking-[0.3em] text-[10px] md:text-xs px-12 py-5 hover:bg-[#eab308] hover:text-black transition-all flex items-center gap-3 shadow-xl"
            >
              Catálogo Completo <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* CAMPANHA DINÂMICA DA SEMANA */}
      {activePromo && activePromo.active && (
        <>
          <WeeklyBanner 
            promotion={activePromo} 
            onNavigateToProducts={() => {
              const element = document.getElementById('promo-collections');
              if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
              } else {
                navigate('/estampas');
              }
            }} 
          />
          <div id="promo-collections">
            <PromotionProducts 
              promotion={activePromo} 
              products={featuredProducts} 
              onProductClick={(slug) => navigate(`/product/${slug}`)} 
            />
          </div>
          <PromotionPopup promotion={activePromo} />
        </>
      )}

      {/* 4. Destaques / Essentials (Carousel) */}
      <section id="collections" className="py-12 md:py-24 bg-white overflow-hidden w-full">
        <div className="max-w-[1600px] mx-auto px-4 md:px-10 mb-4 md:mb-12">
          <div className="flex flex-col items-center text-center">
            <motion.h2 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic mb-4 leading-none"
            >
              ESTILO & <span className="text-[#eab308]">AUTENTICIDADE</span>
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-gray-400 font-bold uppercase tracking-[0.5em] text-[10px] md:text-sm max-w-2xl"
            >
              AS PEÇAS MAIS DESEJADAS DO NOSSO ESTÚDIO, AGORA EM FORMATO PREMIUM.
            </motion.p>
          </div>
        </div>

        <div className="relative group/carousel h-[70dvh] md:h-[85vh] overflow-hidden w-full" style={{ perspective: '1500px' }}>
          {/* Navigation Arrows - Simplified and visible on mobile */}
          <div className="absolute top-1/2 left-2 md:left-12 -translate-y-1/2 z-40 md:opacity-0 md:group-hover/carousel:opacity-100 transition-all duration-500 block">
            <button 
              onClick={prevSlide}
              className="w-12 h-12 md:w-16 md:h-16 bg-black/40 backdrop-blur-xl text-white hover:bg-[#eab308] hover:text-black transition-all flex items-center justify-center rounded-full border border-white/10 shadow-2xl"
            >
              <ChevronLeft size={isMobile ? 24 : 32} />
            </button>
          </div>
          <div className="absolute top-1/2 right-2 md:right-12 -translate-y-1/2 z-40 md:opacity-0 md:group-hover/carousel:opacity-100 transition-all duration-500 block">
            <button 
              onClick={nextSlide}
              className="w-12 h-12 md:w-16 md:h-16 bg-black/40 backdrop-blur-xl text-white hover:bg-[#eab308] hover:text-black transition-all flex items-center justify-center rounded-full border border-white/10 shadow-2xl"
            >
              <ChevronRight size={isMobile ? 24 : 32} />
            </button>
          </div>

          {/* Slider Container */}
          <div className="relative h-full flex items-center w-full">
            <motion.div 
              className="flex items-center cursor-grab active:cursor-grabbing select-none"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => {
                const threshold = isMobile ? 50 : 100;
                if (info.offset.x < -threshold) nextSlide();
                else if (info.offset.x > threshold) prevSlide();
              }}
              animate={{ 
                x: isMobile 
                  ? `calc(-${internalIndex} * (80vw + 16px))` 
                  : `calc(-${internalIndex} * (500px + 48px))` 
              }}
              transition={isTransitioning ? { type: "spring", stiffness: 150, damping: 25, mass: 0.8 } : { duration: 0 }}
              onAnimationComplete={handleAnimationComplete}
            >
              <div className="flex gap-4 md:gap-12 pl-[10vw] md:pl-[calc(50vw-250px)]">
                {extendedProducts.map((product, i) => {
                  const isActive = i === internalIndex;
                  return (
                    <motion.div 
                      key={`${product.id}-${i}`}
                      initial={false}
                      animate={{ 
                        scale: isActive ? 1 : 0.82,
                        opacity: isActive ? 1 : 0.3,
                        rotateY: isActive ? 0 : (i < internalIndex ? 12 : -12),
                        z: isActive ? 100 : 0,
                        filter: isActive ? "blur(0px)" : "blur(2px)"
                      }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      className={cn(
                        "shrink-0 transition-shadow duration-700 rounded-[3rem] md:rounded-[4.5rem] overflow-hidden bg-[#111] border border-white/5 relative",
                        "w-[80vw] sm:w-[400px] md:w-[480px] lg:w-[500px]",
                        "h-[55dvh] md:h-[75vh]",
                        isActive ? "shadow-[0_50px_100px_-20px_rgba(234,179,8,0.3)] z-30" : "shadow-none z-10"
                      )}
                    >
                      <Link to={`/product/${product.slug}`} className="block h-full relative group">
                        {/* Full Image Background */}
                        <div className="absolute inset-0">
                          <img 
                            src={product.images?.[0] || undefined} 
                            alt={product.name}
                            className={cn(
                              "w-full h-full object-cover transition-all duration-1000",
                              isActive ? "grayscale-0 scale-100" : "grayscale scale-110"
                            )}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/estampas/logo-fpac.png'; }}
                          />
                        <div className={cn(
                            "absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent transition-opacity duration-700",
                            isActive ? "opacity-90" : "opacity-95"
                          )}></div>
                        </div>

                        {/* Content Overlay */}
                        <div className={cn(
                          "relative h-full flex flex-col justify-end p-10 md:p-16 transition-all duration-700 text-center items-center",
                          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                        )}>
                          <div className="space-y-3 md:space-y-5">
                            <span className="text-[#eab308] text-[9px] md:text-[10px] font-black uppercase tracking-[0.4em] block mb-1">{product.headline || "COLLECTION"}</span>
                            
                            <h3 className="text-3xl md:text-5xl lg:text-6xl font-black uppercase tracking-tighter italic leading-none text-white drop-shadow-2xl">
                              {product.name}
                            </h3>
                            
                            <div className="flex items-baseline justify-center gap-1 mt-4 md:mt-6">
                              <span className="text-xs md:text-sm font-black uppercase text-[#eab308]">R$</span>
                              <span className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tighter italic text-white">
                                {product.price?.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>

          {/* Pagination Indicators */}
          <div className="flex justify-center gap-4 mt-8 md:mt-12">
            {featuredProducts.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  if (isTransitioning) return;
                  setIsTransitioning(true);
                  setInternalIndex(totalItems + i);
                }}
                className={cn(
                  "h-1 md:h-1.5 transition-all duration-700 rounded-full",
                  currentIndex === i ? "w-16 md:w-24 bg-[#eab308]" : "w-2 md:w-4 bg-black/10 hover:bg-black/30"
                )}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 4. Sobre a Marca */}
      <section className="py-16 md:py-24 bg-black text-white overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tighter mb-6 leading-[0.9]">
                NÃO É SÓ ROUPA.<br/>
                É <span className="text-[#eab308]">IDENTIDADE!</span>
              </h2>
              <div className="space-y-4 text-gray-400 text-base leading-relaxed font-medium">
                <p>
                  A <span className="text-white font-bold">F PAC STORE</span> nasceu do desejo de traduzir a força do streetwear em peças que carregam propósito. Não seguimos tendências passageiras, criamos armaduras para quem sabe onde quer chegar.
                </p>
                <p>
                  Valorizamos qualidade em todos os processos: das modelagens oversized ao toque encorpado das malhas <span className="text-white font-bold">240gsm</span>. As ribanas de 3cm, os acabamentos reforçados e o caimento preciso fazem parte de uma construção pensada para durar e acompanhar sua rotina sem perder identidade.
                </p>
                <p>
                  Aqui, cada coleção carrega conceito, atitude e essência. Porque vestir bem não é chamar atenção, é deixar claro quem você é sem precisar dizer uma palavra.
                </p>
              </div>
              
              <div className="mt-12 flex flex-col sm:flex-row flex-wrap gap-8 sm:gap-12">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-[#eab308]/30 flex items-center justify-center text-[#eab308] shrink-0">
                    <ShieldCheck size={28} />
                  </div>
                  <span className="text-xs md:text-sm font-black uppercase tracking-widest leading-tight">Qualidade<br/>Inquestionável</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-[#eab308]/30 flex items-center justify-center text-[#eab308] shrink-0">
                    <Zap size={28} />
                  </div>
                  <span className="text-xs md:text-sm font-black uppercase tracking-widest leading-tight">Identidade<br/>Marcante</span>
                </div>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="relative aspect-square md:mt-0 mt-8"
            >
              <div className="absolute inset-0 border-2 border-[#eab308] translate-x-3 translate-y-3 md:translate-x-6 md:translate-y-6 -z-10"></div>
                <img 
                  src={aboutImage || undefined} 
                  alt="Streetwear Culture" 
                  className="w-full h-full object-contain grayscale-0 md:grayscale md:hover:grayscale-0 transition-all duration-700 relative z-10"
                />
              <div className="absolute -bottom-6 -right-6 md:-bottom-10 md:-right-10 bg-[#eab308] text-black p-4 md:p-8 z-20">
                <p className="text-2xl md:text-4xl font-black italic tracking-tighter leading-none">EST. 2026</p>
                <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] mt-1 md:mt-2">Joinville - SC</p>
              </div>
            </motion.div>
          </div>
        </div>
        
        {/* Background Decorative Text */}
        <div className="absolute top-1/2 left-0 w-full whitespace-nowrap opacity-[0.03] select-none pointer-events-none transform -translate-y-1/2">
          <p className="text-[300px] font-black uppercase tracking-tighter italic">
            F PAC STORE F PAC STORE F PAC STORE
          </p>
        </div>
      </section>

      {/* 5. Instagram / Comunidade */}
      <section className="pt-20 pb-8 md:pt-32 md:pb-16 lg:pb-12 bg-white relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16 md:mb-24">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-6 leading-none italic"
            >
              FAÇA PARTE DA <br />
              <span className="text-[#eab308]">HISTÓRIA</span>
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-gray-400 font-bold uppercase tracking-[0.4em] text-[8px] md:text-xs"
            >
              USE #F_PAC_STORE E APAREÇA EM NOSSO FEED
            </motion.p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-10">
            {(communityImages.length > 0 ? communityImages : [null, null, null, null, null, null, null, null]).map((img, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -10 }}
                className="aspect-[4/5] bg-[#fafafa] border border-black/5 rounded-2xl md:rounded-3xl overflow-hidden relative group"
              >
                {img ? (
                  <img 
                    src={img} 
                    alt="Community" 
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-black/5 italic font-black text-black/10 text-4xl">
                    F PAC
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <span className="text-white font-black uppercase tracking-[0.3em] text-[10px] border border-white/20 px-4 py-2">Ver no Instagram</span>
                </div>
              </motion.div>
            ))}
          </div>
          
          <div className="mt-12 md:mt-24 text-center">
            <motion.a 
              href="https://instagram.com/f_pac_store" 
              target="_blank" 
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-4 bg-black text-white px-12 py-6 rounded-none font-black uppercase tracking-[0.3em] text-xs hover:bg-[#eab308] hover:text-black transition-all shadow-2xl group"
            >
              @F_PAC_STORE <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
            </motion.a>
          </div>
        </div>
      </section>

      {/* 6. Tabela de Medidas */}
      <section className="pt-8 pb-20 md:pt-16 md:pb-32 lg:pt-12 bg-[#fafafa]">
        <SizeChart />
      </section>
      
      {/* footer remains same via app shell or rest of code if any */}
    </div>
  );
}

function CheckIcon() {
   return (
      <div className="w-5 h-5 rounded-full bg-[#eab308]/20 text-[#eab308] flex items-center justify-center flex-shrink-0">
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
         </svg>
      </div>
   )
}

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Truck, Droplets, Zap, ArrowRight } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { cn } from '../lib/utils';
import { products as staticProducts } from '../data/products';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit, doc } from 'firebase/firestore';
import { SizeChart } from '../components/SizeChart';

export function Home() {
  const [featuredProducts, setFeaturedProducts] = useState<any[]>(staticProducts.slice(0, 3));
  const [loading, setLoading] = useState(false);
  const [brandImage, setBrandImage] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [catalogImage1, setCatalogImage1] = useState<string | null>(null);
  const [catalogImage2, setCatalogImage2] = useState<string | null>(null);
  const [aboutImage, setAboutImage] = useState<string | null>(null);
  const [communityImages, setCommunityImages] = useState<string[]>([]);

  useEffect(() => {
  // Fetch Products
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Merge static products with dynamic overrides
      const merged = staticProducts.map(staticP => {
        const dynamicP = dynamicData.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        const mergedP = dynamicP ? { ...staticP, ...dynamicP } : staticP;
        
        if (mergedP.slug === 'force') {
          mergedP.description = "A camiseta FORCE é a combinação estética minimalista com atitude marcante. Entrega estrutura, conforto e um caimento firme no corpo com estampas em DTF de alta definição que garante cores intensas, mantendo a peça sofisticada e confortável em qualquer ocasião.";
        }
        
        return mergedP;
      });

      // Add any purely dynamic products
      dynamicData.forEach((dynamicP: any) => {
        if (!staticProducts.find(sp => sp.id === dynamicP.id || sp.slug === dynamicP.slug)) {
          merged.push(dynamicP);
        }
      });

      // Filter: Explicitly remove test products and any products without images
      const filtered = merged.filter(p => 
        p.slug !== 'mark-prime-test' && 
        p.name !== 'PRODUTO TESTE PAGAMENTO' &&
        p.images && 
        p.images.length > 0
      );

      // Sort by preferred order and take limit 4 for home
      const preferredOrder = ['mark', 'prime', 'force'];
      const sorted = filtered.sort((a, b) => {
        const indexA = preferredOrder.indexOf(a.slug);
        const indexB = preferredOrder.indexOf(b.slug);
        
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        
        const dateA = (a as any).createdAt?.toDate?.() || (a as any).createdAt || 0;
        const dateB = (b as any).createdAt?.toDate?.() || (b as any).createdAt || 0;
        return dateB - dateA;
      });

      setFeaturedProducts(sorted.slice(0, 4));
    }, (error) => {
      console.error("Erro ao carregar destaques:", error);
    });

    // Fetch Brand Config
    const unsubscribeBrand = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setBrandImage(data.imageUrl || null);
        setLogoUrl(data.logoUrl || null);
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
      <section className="relative h-[85dvh] min-h-[450px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0 bg-black">
              {heroImage && (
                <img 
                  src={heroImage} 
                  alt="F PAC STORE" 
                  className="w-full h-full object-contain opacity-50"
                  loading="eager"
                />
              )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80"></div>
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-4 md:mt-6">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="inline-flex flex-col items-center"
          >
            {/* Dynamic Hero Logo */}
            <div className="mb-0 flex justify-center w-full">
              {brandImage ? (
              <img 
                src={brandImage || undefined} 
                alt="F PAC STORE Logo" 
                className="h-28 md:h-40 lg:h-52 h-auto object-contain drop-shadow-[0_20px_50px_rgba(234,179,8,0.3)]"
              />
              ) : (
                <h1 translate="no" className="text-[13vw] sm:text-[11vw] md:text-[10vw] lg:text-[110px] font-heading font-black uppercase tracking-tighter leading-[0.8] text-transparent whitespace-nowrap" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.4)', wordSpacing: '0.1em' }}>
                  F PAC STORE
                </h1>
              )}
            </div>

            <p className="text-[3vw] min-[400px]:text-[2.5vw] md:text-[1.8vw] lg:text-[20px] text-white/40 mb-10 md:mb-12 uppercase w-full flex justify-between font-black select-none px-2 md:px-4 mt-4 md:mt-6 tracking-[0.1em] md:tracking-widest">
              {"ESTÚDIO DE IDENTIDADE".split('').map((char, i) => (
                <span key={i}>{char === ' ' ? '\u00A0' : char}</span>
              ))}
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4 w-full">
              <Link 
                to="/catalog"
                className="w-full sm:w-auto bg-[#eab308] text-black font-black uppercase tracking-[0.2em] text-[10px] md:text-sm lg:text-lg px-8 py-3 md:px-6 md:py-3 lg:px-10 lg:py-4 rounded-none flex items-center justify-center gap-2 hover:bg-white transition-all transform active:scale-95 whitespace-nowrap shadow-2xl"
              >
                Comprar Agora <ArrowRight size={18} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. Brand Values (Luxury Minimalist) */}
      <section className="py-20 md:py-32 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-16">
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
                className="flex flex-col gap-4"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-black text-[#eab308]">
                  <value.icon size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-black uppercase tracking-tighter text-xl">{value.title}</h3>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest leading-relaxed">{value.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Catalog Highlight */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col items-center text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic mb-4">
              NOSSO <span className="text-[#eab308]">CATÁLOGO</span>
            </h2>
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-gray-400 font-bold uppercase tracking-[0.5em] text-[9px] md:text-xs max-w-xl"
            >
              Explore a curadoria exclusiva de estampas que definem nossa identidade urbana e autêntica.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 max-w-5xl mx-auto">
            {[1, 2].map((i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="group relative"
              >
                <div className="relative aspect-video bg-black overflow-hidden rounded-[2.5rem] border-2 border-white/5 shadow-2xl transition-all duration-700 group-hover:border-[#eab308]/50 group-hover:shadow-[0_30px_60px_-20px_rgba(234,179,8,0.2)]">
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

      {/* 4. Destaques / Essentials */}
      <section id="collections" className="py-16 md:py-24 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="mb-16 flex flex-col items-center text-center border-b border-black/5 pb-12">
            <motion.h2 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-black uppercase tracking-tighter italic mb-4"
            >
              ESTILO & <span className="text-[#eab308]">AUTENTICIDADE</span>
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-gray-400 font-bold uppercase tracking-[0.5em] text-[10px] md:text-xs max-w-xl"
            >
              Curadoria premium com conforto, presença e a qualidade que define nossa essência urbana.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 md:gap-x-10 gap-y-16 items-start">
            {featuredProducts.map((product) => {
              const isPrime = product.slug === 'prime' || product.is_prime;
              
              return (
                <motion.div 
                  key={product.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  className={cn(
                    "group flex flex-col relative",
                    isPrime && "lg:-mt-8 lg:scale-[1.02] z-10"
                  )}
                >
                  <Link to={`/product/${product.slug}`} className={cn(
                    "block relative aspect-[4/5] bg-black overflow-hidden mb-8 transition-all duration-700 rounded-[2rem] border-2",
                    isPrime 
                      ? "border-[#eab308] shadow-[0_30px_70px_-15px_rgba(234,179,8,0.3)] ring-[12px] ring-[#eab308]/5" 
                      : "border-white/10 shadow-xl group-hover:border-[#eab308]/50 group-hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)]"
                  )}>
                    {/* Image Container with Animation */}
                    <motion.div
                      animate={{ 
                        scale: [1, 1.02, 1],
                      }}
                      transition={{ 
                        duration: 8, 
                        repeat: Infinity, 
                        ease: "easeInOut" 
                      }}
                      className="w-full h-full"
                    >
                      <img 
                        src={product.images?.[0] || undefined} 
                        alt={product.name}
                        className="w-full h-full object-contain transition-all duration-1000 group-hover:scale-110"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/estampas/logo-fpac.png'; }}
                      />
                    </motion.div>

                    {/* Discreet Price Overlay */}
                    <div className="absolute bottom-6 left-6 lg:bottom-4 lg:left-4 z-20 group-hover:bottom-8 lg:group-hover:bottom-5 transition-all duration-500 whitespace-nowrap">
                      <div className="bg-black/60 backdrop-blur-md text-white px-5 py-2 lg:px-3 lg:py-1 rounded-full border border-[#eab308]/20 shadow-2xl">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[8px] lg:text-[7px] font-black uppercase tracking-tighter text-[#eab308]">R$</span>
                          <span className="text-xl lg:text-sm font-black tracking-tighter italic">
                            {product.price?.toFixed(2).split('.')[0]}
                            <span className="text-[10px] lg:text-[8px] opacity-60 not-italic ml-0.5">,{product.price?.toFixed(2).split('.')[1]}</span>
                          </span>
                        </div>
                      </div>
                    </div>


                  </Link>

                  <div className={cn(
                    "px-4 text-center space-y-2",
                    isPrime && "bg-white p-6 rounded-[2rem] border-2 border-[#eab308] -mt-8 z-20 relative shadow-2xl"
                  )}>
                    <p className="text-[9px] text-[#eab308] font-black uppercase tracking-[0.6em]">{product.headline || "LIMITED EDITION"}</p>
                    <h3 className="text-2xl md:text-3xl lg:text-4xl font-black uppercase tracking-tighter italic leading-none group-hover:text-[#eab308] transition-colors drop-shadow-sm">
                      {product.name}
                    </h3>
                    <div className="pt-4 flex justify-center">
                      <Link 
                        to={`/product/${product.slug}`}
                        className={cn(
                          "inline-flex items-center gap-2 font-black uppercase tracking-widest text-[10px] transition-all duration-300",
                          isPrime ? "text-black hover:text-[#eab308]" : "text-gray-400 hover:text-black"
                        )}
                      >
                        {product.slug === 'mark' ? 'MAIS VENDIDO' : 
                         product.slug === 'prime' ? 'LANÇAMENTO' : 
                         product.slug === 'force' ? 'LITE' : 'VER DETALHES'} <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>


      {/* 4. Sobre a Marca */}
      <section className="py-20 md:py-32 bg-black text-white overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-4xl md:text-6xl font-heading font-black uppercase tracking-tighter mb-8 leading-[0.9]">
                NÃO É SÓ ROUPA.<br/>
                É <span className="text-[#eab308]">IDENTIDADE!</span>
              </h2>
              <div className="space-y-6 text-gray-400 text-lg leading-relaxed font-medium">
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
      <section className="py-32 md:py-48 bg-white relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-24 md:mb-32">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-7xl font-black uppercase tracking-tighter mb-8 leading-none italic"
            >
              FAÇA PARTE DA <br />
              <span className="text-[#eab308]">HISTÓRIA</span>
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-gray-400 font-bold uppercase tracking-[0.5em] text-[9px] md:text-xs"
            >
              USE #F_PAC_STORE E APAREÇA EM NOSSO FEED
            </motion.p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
            {(communityImages.length > 0 ? communityImages : [null, null, null, null]).map((img, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -10 }}
                className="aspect-square bg-[#fafafa] border border-black/5 rounded-none overflow-hidden relative group"
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
          
          <div className="mt-20 md:mt-24 text-center">
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
      <section className="py-20 bg-[#fafafa]">
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

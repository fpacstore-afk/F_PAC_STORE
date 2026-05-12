import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, Truck, Droplets, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { products as staticProducts } from '../data/products';
import { Logo } from '../components/Logo';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit, doc } from 'firebase/firestore';

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

      // Sort by createdAt and take limit 4 for home
      // But ensure 'force' is included if it exists in merged
      const preferredOrder = ['mark-prime-test', 'prime', 'mark', 'force'];
      const sorted = merged.sort((a, b) => {
        const indexA = preferredOrder.indexOf(a.slug);
        const indexB = preferredOrder.indexOf(b.slug);
        
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        
        const dateA = (a as any).createdAt?.toDate?.() || (a as any).createdAt || 0;
        const dateB = (b as any).createdAt?.toDate?.() || (b as any).createdAt || 0;
        return dateB - dateA;
      });

      // Filter: Only show products that have at least one image
      const onlyWithImages = sorted.filter(p => p.images && p.images.length > 0);
      setFeaturedProducts(onlyWithImages.slice(0, 4));
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
      {/* 1. Hero Section */}
      <section className="relative h-[90dvh] min-h-[500px] flex items-center justify-center overflow-hidden">
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

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-12 md:mt-20">
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
                className="h-32 md:h-48 lg:h-64 h-auto object-contain drop-shadow-[0_20px_50px_rgba(234,179,8,0.3)]"
              />
              ) : (
                <h1 translate="no" className="text-[13vw] sm:text-[11vw] md:text-[10vw] lg:text-[110px] font-heading font-black uppercase tracking-tighter leading-[0.8] text-transparent whitespace-nowrap" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.4)', wordSpacing: '0.1em' }}>
                  F PAC STORE
                </h1>
              )}
            </div>

            <p className="text-[2.2vw] min-[400px]:text-[2.5vw] md:text-[1.8vw] lg:text-[20px] text-white/40 mb-10 md:mb-12 uppercase w-full flex justify-between font-black select-none px-1 md:px-4 mt-4 md:mt-6 tracking-widest">
              {"ESTÚDIO DE IDENTIDADE".split('').map((char, i) => (
                <span key={i}>{char === ' ' ? '\u00A0' : char}</span>
              ))}
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 px-4 w-full">
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
            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs md:text-sm max-w-xl">
              Explore a curadoria exclusiva de estampas que definem nossa identidade urbana e autêntica.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {[1, 2].map((i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="relative aspect-[16/9] border-2 border-[#eab308] overflow-hidden group bg-black"
              >
              {(i === 1 ? catalogImage1 : catalogImage2) && (
                <img 
                  src={(i === 1 ? catalogImage1 : catalogImage2) || undefined} 
                  alt="Catálogo" 
                  className="w-full h-full object-contain opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                />
              )}
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
      <section id="collections" className="py-24 md:py-40 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="mb-24 flex flex-col md:flex-row md:items-end justify-center text-center gap-8 border-b border-black/5 pb-12">
            <div className="max-w-2xl">
              <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-[0.9] italic mb-6">
                ESTILO & <br />
                <span className="text-black">AUTENTICIDADE</span>
              </h2>
              <p className="text-gray-400 text-sm md:text-base font-medium italic">
                Oversized premium com conforto, presença e qualidade para o seu dia a dia.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-24">
            {featuredProducts.map((product) => (
              <motion.div 
                key={product.id}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                className="group flex flex-col"
              >
                <Link to={`/product/${product.slug}`} className="block relative aspect-[4/5] bg-gray-100 overflow-hidden mb-8">
                  <img 
                    src={product.images?.[0] || undefined} 
                    alt={product.name}
                    className="w-full h-full object-contain transition-all duration-1000 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-6 translate-y-full group-hover:translate-y-0 transition-transform duration-500 bg-white/90 backdrop-blur-sm border-t border-black/5 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#eab308]">Premium Quality</span>
                    <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">Detalhes <ArrowRight size={14} /></span>
                  </div>
                </Link>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em]">{product.headline}</p>
                    <h3 className="text-4xl font-black uppercase tracking-tighter italic group-hover:text-[#eab308] transition-colors">
                      {product.name}
                    </h3>
                  </div>
                  <div className="flex items-end justify-between pt-4 border-t border-black/5">
                    <div className="flex flex-col">
                      <span className="text-2xl font-black tracking-tighter">R$ {product.price?.toFixed(2)}</span>
                      <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Até 12x s/ juros</span>
                    </div>
                    <Link to={`/product/${product.slug}`} className="w-12 h-12 bg-black text-white flex items-center justify-center hover:bg-[#eab308] transition-colors">
                      <ArrowRight size={20} />
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
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
              
              <div className="mt-12 flex flex-wrap gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full border border-[#eab308]/30 flex items-center justify-center text-[#eab308]">
                    <ShieldCheck size={24} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest leading-none">Qualidade<br/>Inquestionável</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full border border-[#eab308]/30 flex items-center justify-center text-[#eab308]">
                    <Zap size={24} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest leading-none">Identidade<br/>Marcante</span>
                </div>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="relative aspect-square"
            >
              <div className="absolute inset-0 border-2 border-[#eab308] translate-x-6 translate-y-6"></div>
                <img 
                  src={aboutImage || undefined} 
                  alt="Streetwear Culture" 
                  className="w-full h-full object-contain grayscale hover:grayscale-0 transition-all duration-700"
                />
              <div className="absolute -bottom-10 -right-10 bg-[#eab308] text-black p-8 hidden md:block">
                <p className="text-4xl font-black italic tracking-tighter leading-none">EST. 2026</p>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mt-2">Joinville - SC</p>
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
      <section className="py-20 md:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tight mb-4">
              Faça parte da <span className="text-[#eab308]">HISTÓRIA</span>
            </h2>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs md:text-sm">
              Use #F_PAC_STORE e apareça aqui
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {(communityImages.length > 0 ? communityImages : []).map((img, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -10 }}
                className="aspect-square bg-gray-100 rounded-2xl overflow-hidden relative group"
              >
                <img src={img || undefined} alt="Community" className="w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-500" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white font-black uppercase tracking-widest text-[10px]">Ver no Instagram</span>
                </div>
              </motion.div>
            ))}
          </div>
          
          <div className="mt-16 text-center">
            <a 
              href="https://instagram.com/f_pac_store" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-black text-white px-10 py-5 rounded-none font-black uppercase tracking-[0.2em] text-sm hover:bg-[#eab308] hover:text-black transition-all shadow-2xl"
            >
              @f_pac_store <ArrowRight size={20} />
            </a>
          </div>
        </div>
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

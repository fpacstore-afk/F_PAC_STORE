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

  // Promo Timer Logic
  const [promoActive, setPromoActive] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(5);

  useEffect(() => {
    const sanitizeProduct = (data: any) => {
      if (!data) return data;
      const sanitized = { ...data };
      if (data.slug === 'force' && (data.description || '').includes('100% algodão premium de alta gramatura (220gsm)')) {
        sanitized.description = "A camiseta FORCE combina estética minimalista com atitude marcante. Confeccionada em malha premium 90% algodão e 10% poliéster de alta gramatura (240gsm), entrega estrutura, conforto e um caimento firme no corpo. A estampa em DTF de alta definição garante cores intensas, mantendo a peça sofisticada e confortável em qualquer ocasião.";
      }
      return sanitized;
    };

    // Fetch Products
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Merge static products with dynamic overrides
      const merged = staticProducts.map(staticP => {
        const dynamicP = dynamicData.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        const mergedP = dynamicP ? sanitizeProduct({ ...staticP, ...dynamicP }) : sanitizeProduct(staticP);
        
        // Explicitly remove bestseller from Force if requested
        if (mergedP.slug === 'force') {
          mergedP.isBestseller = false;
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
      const sorted = merged.sort((a, b) => {
         // Prioritize Force
         if (a.slug === 'force') return -1;
         if (b.slug === 'force') return 1;
         
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
      }
    });

    const checkPromo = () => {
      const now = Date.now();
      const thirtyMinutesInMs = 30 * 60 * 1000;
      const twoHoursInMs = 2 * 60 * 60 * 1000;

      let lastActivation = Number(localStorage.getItem('f_pac_promo_last_activation') || 0);
      let endTime = Number(localStorage.getItem('f_pac_promo_end') || 0);
      let storedDiscount = Number(localStorage.getItem('f_pac_promo_value') || 5);

      if (now - lastActivation >= twoHoursInMs) {
        const rand = Math.random() * 100;
        let newValue = 5;
        if (rand < 15) newValue = 9;
        else if (rand < 50) newValue = 7;
        else newValue = 5;
        
        lastActivation = now;
        endTime = now + thirtyMinutesInMs;
        storedDiscount = newValue;
        
        localStorage.setItem('f_pac_promo_last_activation', lastActivation.toString());
        localStorage.setItem('f_pac_promo_end', endTime.toString());
        localStorage.setItem('f_pac_promo_value', storedDiscount.toString());
      }

      const active = endTime > now;
      setPromoActive(active);
      setPromoDiscount(storedDiscount);
    };

    checkPromo();
    const interval = setInterval(checkPromo, 1000);
    return () => {
      unsubscribe();
      unsubscribeBrand();
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="w-full">
      {/* 1. Hero Section */}
      <section className="relative h-[90dvh] min-h-[500px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[#0a0a0f]">
          <img 
            src="/bg-capa.jpg" 
            alt="F PAC STORE Capa" 
            className="w-full h-full object-cover opacity-60"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#ffffff] via-transparent to-transparent"></div>
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
                  src={brandImage} 
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
              {"Não é só roupa É identidade".split('').map((char, i) => (
                <span key={i}>{char === ' ' ? '\u00A0' : char}</span>
              ))}
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 px-4 w-full">
              <Link 
                to="/catalog"
                className="w-full sm:w-auto bg-[#eab308] text-black font-black uppercase tracking-[0.2em] text-[10px] md:text-sm lg:text-lg px-8 py-3 md:px-6 md:py-3 lg:px-10 lg:py-4 rounded-none flex items-center justify-center gap-2 hover:bg-white transition-all transform active:scale-95 whitespace-nowrap shadow-2xl"
              >
                Comprar Agora
              </Link>
              <Link 
                to="/estampas"
                className="w-full sm:w-auto bg-transparent border-2 border-[#eab308] text-black font-black uppercase tracking-[0.2em] text-[10px] md:text-sm lg:text-lg px-8 py-3 md:px-6 md:py-3 lg:px-10 lg:py-4 rounded-none flex items-center justify-center hover:bg-[#eab308] hover:text-black transition-all transform active:scale-95 whitespace-nowrap shadow-2xl"
              >
                Ver Coleção
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. Prova rápida (Features) */}
      <section className="py-12 md:py-16 bg-[#f9fafb] border-y border-black/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mb-4 text-[#eab308]">
                    <Droplets size={28} />
                 </div>
                 <h3 className="font-bold mb-1">90% Algodão e 10% Poliéster</h3>
                 <p className="text-sm text-gray-600">240gsm. Peso e estrutura.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mb-4 text-[#eab308]">
                    <Zap size={28} />
                 </div>
                 <h3 className="font-bold mb-1">Caimento Oversized</h3>
                 <p className="text-sm text-gray-600">Estrutura e Ribana 3cm.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mb-4 text-[#eab308]">
                    <ShieldCheck size={28} />
                 </div>
                 <h3 className="font-bold mb-1">Malha Premium</h3>
                 <p className="text-sm text-gray-600">Tecido Macio e Durável.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mb-4 text-[#eab308]">
                    <Truck size={28} />
                 </div>
                 <h3 className="font-bold mb-1">Troca Garantida</h3>
                 <p className="text-sm text-gray-600">7 dias sem burocracia.</p>
              </div>
           </div>
        </div>
      </section>

      {/* 3. Produtos (Destaques) */}
      <section id="collections" className="py-12 md:py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="flex justify-between items-end mb-8 md:mb-10">
            <div>
               <h2 className="text-3xl md:text-4xl font-heading font-black uppercase tracking-tighter">
                  PRODUTOS
               </h2>
            </div>
         </div>

         {loading ? (
            <div className="flex justify-center py-20">
               <Loader2 className="animate-spin text-[#eab308]" size={32} />
            </div>
         ) : (
           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
              {featuredProducts.map((product) => (
                 <motion.div 
                   key={product.id}
                   initial={{ opacity: 0, y: 20 }}
                   whileInView={{ opacity: 1, y: 0 }}
                   viewport={{ once: true }}
                   transition={{ duration: 0.5 }}
                   className="group relative flex flex-col"
                 >
                    <Link to={`/product/${product.slug}`} className="block relative aspect-[3/4] overflow-hidden rounded-2xl bg-black/5 mb-4">
                       {product.isNew && (
                          <span className="absolute top-4 left-4 z-10 bg-[#eab308] text-black text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-sm">
                             Novo
                          </span>
                       )}
                       {product.isBestseller && (
                          <span className="absolute top-4 left-4 z-10 bg-white text-black text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-sm">
                             + Vendido
                          </span>
                       )}
                       {/* PIX Badge */}
                       <span className="absolute top-4 right-4 z-10 bg-black text-[#eab308] text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-sm flex items-center gap-1 shadow-lg border border-[#eab308]/30">
                          <Zap size={10} fill="currentColor" /> 5% OFF NO PIX
                       </span>
                       <img 
                          src={product.images[0]} 
                          alt={product.name}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          loading="lazy"
                       />
                       <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </Link>

                    <div>
                       <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                             <h3 className={cn(
                                "font-black text-3xl md:text-4xl uppercase tracking-tighter italic transition-all group-hover:text-[#eab308]",
                                product.slug === 'prime' ? "animate-pulse-glow text-[#eab308]" : "text-black"
                             )}>
                                {product.name}
                             </h3>
                             <p className="text-gray-500 text-xs md:text-sm uppercase tracking-[0.15em] font-bold mt-0.5">
                                {product.headline}
                             </p>
                          </div>
                       </div>
 
                       <div className="flex items-center justify-between mt-4">
                          <div className="flex flex-col">
                             <div className="flex items-baseline gap-2">
                                <span className="font-black text-3xl md:text-4xl tracking-tighter">
                                   R$ {(promoActive && ['force', 'mark', 'prime'].includes(product.slug) ? product.price - promoDiscount : product.price)?.toFixed(2)}
                                </span>
                                <span className="hidden md:inline-block text-[7px] font-black uppercase tracking-widest text-[#eab308] px-1 py-0.5 bg-black">PIX</span>
                             </div>
                             <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">ou até 12x no cartão</span>
                          </div>
                          <Link 
                            to={`/product/${product.slug}`}
                            className="w-10 h-10 bg-black text-white flex items-center justify-center hover:bg-[#eab308] hover:text-black transition-all transform active:scale-90 shadow-lg"
                          >
                             <ArrowRight size={18} />
                          </Link>
                       </div>
                    </div>
                 </motion.div>
              ))}
           </div>
         )}
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
                Não é sobre moda.<br/>
                É sobre <span className="text-[#eab308]">Identidade</span>.
              </h2>
              <div className="space-y-6 text-gray-400 text-lg leading-relaxed font-medium">
                <p>
                  A <span className="text-white font-bold">F PAC STORE</span> nasceu do desejo de traduzir a força do streetwear em peças que carregam propósito. Não seguimos tendências passageiras, criamos armaduras para quem sabe quem é e onde quer chegar.
                </p>
                <p>
                  Cada costura, cada gramatura de tecido e cada estampa é pensada para durar. Utilizamos malhas de <span className="text-white font-bold">240gsm (Heavyweight)</span>, ribanas de 3cm e modelagens oversized que garantem o caimento perfeito.
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
                src="https://images.unsplash.com/photo-1558769132-cb1aea458c5e?q=80&w=1000&auto=format&fit=crop" 
                alt="Streetwear Culture" 
                className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
              />
              <div className="absolute -bottom-10 -right-10 bg-[#eab308] text-black p-8 hidden md:block">
                <p className="text-4xl font-black italic tracking-tighter leading-none">EST. 2024</p>
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
            <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tighter mb-4">
              Faça parte da <span className="text-[#eab308]">Matilha</span>
            </h2>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs md:text-sm">
              Use #FPACSTORE e apareça aqui
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {[
              "https://images.unsplash.com/photo-1523398002811-999ca8dec234?q=80&w=600&auto=format&fit=crop",
              "https://images.unsplash.com/photo-1544642899-f0d6e5f6ed6a?q=80&w=600&auto=format&fit=crop",
              "https://images.unsplash.com/photo-1516762689617-e1cffcef479d?q=80&w=600&auto=format&fit=crop",
              "https://images.unsplash.com/photo-1550995694-3f5f4a7b1bd2?q=80&w=600&auto=format&fit=crop"
            ].map((img, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -10 }}
                className="aspect-square bg-gray-100 rounded-2xl overflow-hidden relative group"
              >
                <img src={img} alt="Community" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white font-black uppercase tracking-widest text-[10px]">Ver no Instagram</span>
                </div>
              </motion.div>
            ))}
          </div>
          
          <div className="mt-16 text-center">
            <a 
              href="https://instagram.com/fpacstore" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-black text-white px-10 py-5 rounded-none font-black uppercase tracking-[0.2em] text-sm hover:bg-[#eab308] hover:text-black transition-all shadow-2xl"
            >
              @FPACSTORE <ArrowRight size={20} />
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

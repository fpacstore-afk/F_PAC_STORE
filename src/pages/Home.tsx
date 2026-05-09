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

    return () => {
      unsubscribe();
      unsubscribeBrand();
    };
  }, []);

  return (
    <div className="w-full">
      {/* 1. Hero Section */}
      <section className="relative h-[90dvh] min-h-[500px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[#0a0a0f]">
          <img 
            src="https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?q=80&w=2000&auto=format&fit=crop" 
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
            <div className="mb-4 flex flex-col items-center w-full">
              {brandImage ? (
                <img 
                  src={brandImage} 
                  alt="F PAC STORE Logo" 
                  className="h-28 md:h-44 lg:h-56 object-contain drop-shadow-[0_20px_50px_rgba(234,179,8,0.2)]"
                />
              ) : (
                <h1 translate="no" className="text-[14vw] sm:text-[12vw] md:text-[11vw] lg:text-[130px] font-heading font-black uppercase tracking-[-0.05em] leading-[0.75] text-white whitespace-nowrap select-none drop-shadow-2xl">
                  F PAC STORE
                </h1>
              )}
              <div className="h-1 w-24 bg-[#eab308] mt-6 md:mt-8 mb-4"></div>
            </div>

            <p className="text-[2.5vw] md:text-[1.5vw] lg:text-[18px] text-white/60 mb-12 md:mb-16 uppercase w-full flex justify-between font-black select-none px-2 md:px-8 tracking-[0.4em] md:tracking-[0.6em]">
              {"ESTÚDIO DE IDENTIDADE".split('').map((char, i) => (
                <span key={i}>{char === ' ' ? '\u00A0' : char}</span>
              ))}
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4 w-full">
              <Link 
                to="/catalog"
                className="w-full sm:w-auto bg-white text-black font-black uppercase tracking-[0.25em] text-xs md:text-sm px-10 py-5 hover:bg-[#eab308] transition-all transform active:scale-95 shadow-2xl flex items-center justify-center gap-3"
              >
                Explorar Coleção <ArrowRight size={18} />
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
              { icon: Droplets, title: "Malha Heavyweight", desc: "90% Algodão 10% Poliéster (240gsm)" },
              { icon: Zap, title: "Oversized Fit", desc: "Estrutura imponente e caimento impecável" },
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

      {/* 3. Destaques / Essentials */}
      <section className="py-24 md:py-40 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="mb-24 flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-black/5 pb-12">
            <div className="max-w-2xl">
              <span className="text-[#eab308] text-xs font-black uppercase tracking-[0.5em] mb-4 block">Essentials Collection</span>
              <h2 className="text-6xl md:text-9xl font-black uppercase tracking-[-0.08em] leading-[0.8] italic mb-6">
                DEFINA SUA <br />
                <span className="text-black">ASSINATURA</span>
              </h2>
              <p className="text-gray-400 text-sm md:text-base font-medium italic">
                Peças baseadas em estrutura e minimalismo, desenhadas para quem valoriza a estética bruta e o conforto absoluto.
              </p>
            </div>
            <Link 
              to="/catalog" 
              className="group flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.4em] border-2 border-black px-8 py-4 hover:bg-black hover:text-white transition-all"
            >
              Ver Catálogo
              <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" />
            </Link>
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
                    src={product.images[0]} 
                    alt={product.name}
                    className="w-full h-full object-cover grayscale transition-all duration-1000 group-hover:scale-105 group-hover:grayscale-0"
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
              Use #F_PAC_STORE e apareça aqui
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

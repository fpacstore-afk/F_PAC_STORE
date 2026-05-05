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

  // Promo Timer Logic
  const [promoActive, setPromoActive] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(5);

  useEffect(() => {
    // Fetch Products
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Merge static products with dynamic overrides
      const merged = staticProducts.map(staticP => {
        const dynamicP = dynamicData.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        const mergedP = dynamicP ? { ...staticP, ...dynamicP } : staticP;
        
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

      // Sort by createdAt and take limit 3 for home
      const sorted = merged.sort((a, b) => {
        const dateA = (a as any).createdAt?.toDate?.() || (a as any).createdAt || 0;
        const dateB = (b as any).createdAt?.toDate?.() || (b as any).createdAt || 0;
        return dateB - dateA;
      });

      setFeaturedProducts(sorted.slice(0, 3));
    }, (error) => {
      console.error("Erro ao carregar destaques:", error);
    });

    // Fetch Brand Config
    const unsubscribeBrand = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (snapshot.exists()) {
        setBrandImage(snapshot.data().imageUrl || null);
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

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-20">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="inline-flex flex-col items-center"
          >
            <h1 translate="no" className="text-4xl min-[400px]:text-5xl md:text-7xl lg:text-[89px] font-heading font-black uppercase tracking-tight mb-0 leading-[0.85] text-transparent" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.3)', wordSpacing: '0.4em' }}>
              F PAC STORE
            </h1>
            <p className="text-[6px] min-[320px]:text-[8px] min-[400px]:text-[10px] md:text-[13px] lg:text-[16px] text-white/30 mb-10 uppercase w-full flex justify-between font-bold select-none px-2">
              {"Não é só roupa É identidade".split('').map((char, i) => (
                <span key={i}>{char === ' ' ? '\u00A0' : char}</span>
              ))}
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                to="/catalog"
                className="w-full sm:w-auto bg-[#eab308] text-black font-black uppercase tracking-[0.2em] px-8 py-4 rounded-none flex items-center justify-center gap-2 hover:bg-white transition-all transform active:scale-95"
              >
                Comprar Agora
              </Link>
              <Link 
                to="/estampas"
                className="w-full sm:w-auto bg-transparent border border-black/20 text-black font-black uppercase tracking-[0.2em] px-8 py-4 rounded-none flex items-center justify-center hover:bg-black/5 transition-colors"
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
                 <h3 className="font-bold mb-1">Algodão Premium</h3>
                 <p className="text-sm text-gray-600">220gsm. Peso e estrutura.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mb-4 text-[#eab308]">
                    <Zap size={28} />
                 </div>
                 <h3 className="font-bold mb-1">Caimento Oversized</h3>
                 <p className="text-sm text-gray-600">Modelagem real, sem ajustes.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mb-4 text-[#eab308]">
                    <ShieldCheck size={28} />
                 </div>
                 <h3 className="font-bold mb-1">Estampa Durável</h3>
                 <p className="text-sm text-gray-600">DTF premium.</p>
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
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                       <img 
                          src={product.images[0]} 
                          alt={product.name}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                       />
                       <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </Link>

                    <div>
                       <h3 className={cn(
                          "font-black text-2xl uppercase tracking-tighter italic transition-all group-hover:text-[#eab308]",
                          product.slug === 'prime' && "animate-pulse-glow text-[#eab308]"
                       )}>
                          {product.name}
                       </h3>
                       <p className="text-gray-600 text-sm mb-4 uppercase tracking-wide font-medium leading-tight">
                          {product.headline}
                       </p>
                       <div className="flex justify-between items-end border-t border-black/5 pt-4">
                          <div className="flex flex-col">
                             <div className="flex items-baseline gap-1">
                                <span className="font-black text-3xl tracking-tighter">
                                   R$ {(promoActive && ['force', 'mark', 'prime'].includes(product.slug) ? product.price - promoDiscount : product.price)?.toFixed(2)}
                                </span>
                             </div>
                             <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">ou até 12x no cartão</span>
                          </div>
                          <Link 
                            to={`/product/${product.slug}`}
                            className="w-12 h-12 rounded-none bg-black text-white flex items-center justify-center hover:bg-[#eab308] hover:text-black transition-all transform hover:scale-110 active:scale-95 shadow-xl"
                          >
                             <ArrowRight size={20} />
                          </Link>
                       </div>
                    </div>
                 </motion.div>
              ))}
           </div>
         )}
      </section>

      {/* 4. Marca (Sobre) */}
      <section className="py-12 md:py-16 bg-[#ffffff] border-t border-black/5 relative overflow-hidden">
         <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#eab308]/5 blur-[120px] rounded-full pointer-events-none"></div>
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-14 items-center">
               <div className="aspect-square bg-[#0a0a0f] rounded-2xl border-2 border-[#eab308] overflow-hidden relative flex items-center justify-center p-8 md:p-10">
                   {brandImage ? (
                      <img src={brandImage} className="w-full h-full object-cover" alt="F PAC Identidade" referrerPolicy="no-referrer" />
                   ) : (
                      <Logo className="w-full h-auto max-w-[200px] md:max-w-[250px]" />
                   )}
                   <div className="absolute inset-0 bg-gradient-to-tr from-[#eab308]/10 via-transparent to-transparent pointer-events-none"></div>
               </div>
               <div>
                  <h2 className="text-3xl md:text-4xl font-heading font-black uppercase tracking-tighter mb-4 md:mb-5">
                     Identidade.<br/>Não é só roupa.
                  </h2>
                  <p className="text-base md:text-md text-gray-700 mb-4 md:mb-5 leading-relaxed">
                     A <span translate="no">F PAC STORE</span> é para quem rejeita o comum. Peças oversized estampadas com identidade, feitas para marcar presença sem precisar dizer nada.
                  </p>
                  <p className="text-gray-600 mb-8 leading-relaxed">
                     Sem linguagem corporativa. Foco total em qualidade absurda, conforto inegável e um visual que fala por si só. Utilizamos tecidos premium que mantém a forma, lavagem após lavagem.
                  </p>
                  <ul className="space-y-4 mb-8">
                     <li className="flex items-center gap-3">
                        <CheckIcon /> <span className="font-medium">100% Algodão Alta Gramatura</span>
                     </li>
                     <li className="flex items-center gap-3">
                        <CheckIcon /> <span className="font-medium">Estampas Exclusivas limitadas</span>
                     </li>
                     <li className="flex items-center gap-3">
                        <CheckIcon /> <span className="font-medium">Design focado no caimento</span>
                     </li>
                  </ul>
               </div>
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

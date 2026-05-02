import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, Truck, Droplets, Zap, ArrowRight, Instagram } from 'lucide-react';
import { products } from '../data/products';
import { Logo } from '../components/Logo';

export function Home() {
  const featuredProducts = products.slice(0, 3);

  // Promo Timer Logic (Consistent with ProductDetail)
  const [promoActive, setPromoActive] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(5);

  useEffect(() => {
    const checkPromo = () => {
      const now = Date.now();
      const thirtyMinutesInMs = 30 * 60 * 1000;
      const twoHoursInMs = 2 * 60 * 60 * 1000;

      let lastActivation = Number(localStorage.getItem('f_pac_promo_last_activation') || 0);
      let endTime = Number(localStorage.getItem('f_pac_promo_end') || 0);
      let storedDiscount = Number(localStorage.getItem('f_pac_promo_value') || 5);

      // If more than 2 hours passed since last activation, start a NEW session (sync initialization)
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
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full">
      {/* ... (rest of the component) */}
      {/* 1. Hero Section */}
      <section className="relative h-screen min-h-[600px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[#0a0a0f]">
          <img 
            src="/bg-capa.jpg" 
            alt="F PAC STORE Capa" 
            className="w-full h-full object-cover opacity-60"
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
            <h1 translate="no" className="text-5xl md:text-7xl lg:text-[89px] font-heading font-black uppercase tracking-tight mb-0 leading-[0.85] text-transparent" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.3)', wordSpacing: '0.4em' }}>
              F PAC STORE
            </h1>
            <p className="text-[10px] md:text-[13px] lg:text-[17px] text-white/30 mb-10 uppercase tracking-[0.5em] md:tracking-[0.88em] lg:tracking-[1.32em] text-center w-full whitespace-nowrap pl-[0.55em] md:pl-[0.88em] lg:pl-[1.32em] font-bold">
              Não é só roupa É identidade
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
      <section className="py-20 bg-[#f9fafb] border-y border-black/5">
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
      <section id="collections" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="flex justify-between items-end mb-12">
            <div>
               <h2 className="text-4xl md:text-5xl font-heading font-black uppercase tracking-tighter">
                  PRODUTOS
               </h2>
            </div>
         </div>

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
                     />
                     <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </Link>

                  <div>
                     <h3 className="font-bold text-lg">{product.name}</h3>
                     <p className="text-gray-600 text-sm mb-2">{product.headline}</p>
                     <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                           {promoActive && ['force', 'mark', 'prime'].includes(product.slug) && (
                              <span className="text-xs text-gray-400 line-through">R$ {product.price.toFixed(2)}</span>
                           )}
                           <span className="font-bold">
                              R$ {(promoActive && ['force', 'mark', 'prime'].includes(product.slug) ? product.price - promoDiscount : product.price).toFixed(2)}
                           </span>
                        </div>
                        <Link 
                          to={`/product/${product.slug}`}
                          className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center hover:bg-[#eab308] hover:text-black transition-colors"
                        >
                           <ArrowRight size={18} />
                        </Link>
                     </div>
                  </div>
               </motion.div>
            ))}
         </div>
      </section>

      {/* 4. Marca (Sobre) */}
      <section className="py-24 bg-[#ffffff] border-t border-black/5 relative overflow-hidden">
         <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#eab308]/5 blur-[120px] rounded-full pointer-events-none"></div>
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
               <div className="aspect-square bg-[#0a0a0f] rounded-2xl border-2 border-[#eab308] overflow-hidden relative flex items-center justify-center p-12">
                   <Logo className="w-full h-auto max-w-[300px]" />
                   <div className="absolute inset-0 bg-gradient-to-tr from-[#eab308]/10 via-transparent to-transparent pointer-events-none"></div>
               </div>
               <div>
                  <h2 className="text-4xl md:text-5xl font-heading font-black uppercase tracking-tighter mb-6">
                     Identidade.<br/>Não é só roupa.
                  </h2>
                  <p className="text-lg text-gray-700 mb-6 leading-relaxed">
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

      {/* 5. Conversão */}
      <section className="py-24 bg-[#f9fafb] text-center border-t border-black/5 relative">
         <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#eab308]/10 blur-[100px] rounded-t-full pointer-events-none"></div>
         <div className="max-w-3xl mx-auto px-4 relative z-10">
            <h2 className="text-4xl md:text-5xl font-heading font-black uppercase tracking-tighter mb-6">
               Pronto para elevar seu estilo?
            </h2>
            <p className="text-xl text-gray-600 mb-10">
               Edições limitadas. Garanta sua peça antes do próximo sold out.
            </p>
            <a 
               href="#collections"
               className="inline-flex bg-[#eab308] text-black font-bold uppercase tracking-wider px-10 py-5 rounded-none items-center justify-center hover:bg-white transition-colors duration-300 "
            >
               Acessar Coleção
            </a>
         </div>
      </section>
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

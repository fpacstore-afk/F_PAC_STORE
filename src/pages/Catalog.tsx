import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { products as staticProducts } from '../data/products';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { useInventory } from '../hooks/useInventory';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Loader2, ArrowRight, Zap, Mail, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MiniSizeChart, SizeChart } from '../components/SizeChart';

import { getApiUrl } from '../lib/api';

import { Helmet } from 'react-helmet-async';
import { getActivePromotion } from '../services/promotions/getActivePromotion';
import { PromotionBadge } from '../components/promotions/PromotionBadge';
import { WeeklyPromotion } from '../types/promotions';

export default function Catalog() {
  const { isAvailable } = useInventory();
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>(staticProducts);
  const [loading, setLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [activePromo, setActivePromo] = useState<WeeklyPromotion | null>(null);

  useEffect(() => {
    getActivePromotion().then((promo) => {
      setActivePromo(promo);
    });
  }, []);

  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';

  useEffect(() => {
    const sanitizeProduct = (data: any) => {
      if (!data) return data;
      const sanitized = { ...data };
    
      // Ensure mandatory colors for main products
      const mandatoryColors = [
        { name: "Azul Marinho", hex: "#1b263b" },
        { name: "Verde Militar", hex: "#3f4238" },
        { name: "Off White", hex: "#FAF9F6" }
      ];
      
      if (sanitized.colors) {
        const isMainProduct = sanitized.slug === 'force' || sanitized.slug === 'mark' || sanitized.slug === 'prime';
        if (isMainProduct) {
          mandatoryColors.forEach(mc => {
            if (!sanitized.colors.find((c: any) => c.name === mc.name)) {
              sanitized.colors.push(mc);
            }
          });
        }
      }

      if (data.slug === 'force' && (data.description || '').includes('100% algodão premium de alta gramatura (220gsm)')) {
        sanitized.description = "A camiseta FORCE combina estética minimalista com atitude marcante. Confeccionada em malha premium 90% algodão e 10% poliéster de alta gramatura (240gsm), entrega estrutura, conforto e um caimento firme no corpo. A estampa em DTF de alta definição garante cores intensas, mantendo a peça sofisticada e confortável em qualquer ocasião.";
      }
      return sanitized;
    };

    setLoading(true);
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const merged = staticProducts.map(staticP => {
        const dynamicP = dynamicData.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        const mergedP = dynamicP ? sanitizeProduct({ ...staticP, ...dynamicP }) : sanitizeProduct(staticP);
        
        if (mergedP.slug === 'force') {
          mergedP.isBestseller = false;
        }
        
        return mergedP;
      });

      dynamicData.forEach((dynamicP: any) => {
        if (!staticProducts.find(sp => sp.id === dynamicP.id || sp.slug === dynamicP.slug)) {
          merged.push(dynamicP);
        }
      });

      const filtered = merged.filter(p => {
        const name = (p.name || '').toUpperCase();
        const slug = (p.slug || '').toLowerCase();
        
        const isTest = 
          slug.includes('teste') || 
          slug.includes('test') || 
          name.includes('TESTE') || 
          name.includes('TEST');

        return !isTest && p.status !== 'hidden' && p.images && p.images.length > 0;
      });

      const preferredOrder = ['mark', 'prime', 'force'];
      filtered.sort((a, b) => {
        const indexA = preferredOrder.indexOf(a.slug);
        const indexB = preferredOrder.indexOf(b.slug);
        
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        const dateA = (a as any).createdAt?.toDate?.() || (a as any).createdAt || 0;
        const dateB = (b as any).createdAt?.toDate?.() || (b as any).createdAt || 0;
        return dateB - dateA;
      });

      setProducts(filtered);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar catálogo:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Do not filter by isAvailable here to allow users to see "Sold Out" items if needed, 
  // or simply to ensure they appear if inventory info is missing.
  // Home.tsx doesn't filter by isAvailable at this level.
  const displayedProducts = products.filter(p => p.images && p.images.length > 0);

  return (
    <>
      <Helmet>
        <title>Catálogo | F PAC STORE - Estilo e Atitude</title>
        <meta name="description" content="Confira nossa coleção completa de camisetas premium. Force, Prime e muito mais. Estilo minimalista com qualidade máxima." />
        <link rel="canonical" href="https://www.fpacstore.com.br/catalog" />
      </Helmet>
      <div className="min-h-screen pt-20 md:pt-28 pb-10 md:pb-14">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="mb-10 flex flex-col items-center text-center border-b border-black/5 pb-6">
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl md:text-4xl font-black uppercase tracking-tighter italic mb-2"
            >
              NOSSOS <span className="text-[#eab308]">PRODUTOS</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-gray-400 font-bold uppercase tracking-[0.4em] text-[9px] md:text-xs max-w-xl"
            >
              Curadoria premium com conforto, presença e a qualidade que define nossa essência urbana.
            </motion.p>
          </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="animate-spin text-[#eab308]" size={36} />
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-x-6 md:gap-x-10 gap-y-12 items-start max-w-7xl mx-auto">
          {displayedProducts.map((product, i) => {
            const isPrime = product.slug === 'prime' || product.is_prime;
            
            return (
              <motion.div 
                key={product.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={cn(
                  "group flex flex-col relative w-full sm:w-[calc(50%-1rem)] lg:w-[calc(33.33%-2rem)] max-w-[280px]",
                  isPrime && "lg:-mt-5 lg:scale-[1.02] z-10"
                )}
              >
                <Link to={`/product/${product.slug}`} className="block w-full">
                  <div className={cn(
                    "block relative aspect-[4/5] bg-black overflow-hidden mb-5 transition-all duration-700 rounded-[2rem] border-2",
                    isPrime 
                      ? "border-[#eab308] shadow-[0_30px_60px_-15px_rgba(234,179,8,0.3)] ring-[12px] ring-[#eab308]/5" 
                      : "border-white/10 shadow-lg group-hover:border-[#eab308]/50 group-hover:shadow-[0_25px_50px_-10px_rgba(0,0,0,0.3)]"
                  )}>
                    {/* Promotion Badge Overlay */}
                    <PromotionBadge promotion={activePromo} productId={product.id} className="absolute top-4 left-4 z-30" />

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
                        loading="lazy"
                      />
                    </motion.div>
  
                    {/* Discreet Price Overlay */}
                    <div className="absolute bottom-6 left-6 lg:bottom-5 lg:left-5 z-20 group-hover:bottom-8 lg:group-hover:bottom-7 transition-all duration-500 whitespace-nowrap pointer-events-none">
                      <div className="bg-black/60 backdrop-blur-md text-white px-5 py-2 lg:px-4 lg:py-1.5 rounded-full border border-[#eab308]/30 shadow-2xl">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[8px] lg:text-[7px] font-black uppercase tracking-tighter text-[#eab308]">R$</span>
                          <span className="text-xl lg:text-base font-black tracking-tighter italic">
                            {product.price?.toFixed(2).split('.')[0]}
                            <span className="text-[10px] lg:text-[9px] opacity-60 not-italic ml-0.5">,{product.price?.toFixed(2).split('.')[1]}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
  
                <div className={cn(
                  "px-4 text-center space-y-1",
                  isPrime && "bg-white p-5 rounded-[2rem] border-2 border-[#eab308] -mt-8 z-20 relative shadow-xl"
                )}>
                  <p className="text-[8px] text-[#eab308] font-black uppercase tracking-[0.5em]">{product.headline || "LIMITED EDITION"}</p>
                  <Link to={`/product/${product.slug}`}>
                    <h3 className="text-xl md:text-2xl lg:text-3xl font-black uppercase tracking-tighter italic leading-none group-hover:text-[#eab308] transition-colors drop-shadow-sm">
                      {product.name}
                    </h3>
                  </Link>
                  
                  <div className="pt-3 flex justify-center">
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
      )}

      {/* Tabela de Medidas */}
      <section className="py-20 bg-[#fafafa] border-t border-black/5 mt-16 md:mt-24">
        <SizeChart />
      </section>
    </div>
  </div>
</>
  );
}

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
import { MiniSizeChart } from '../components/SizeChart';

import { getApiUrl } from '../lib/api';

import { Helmet } from 'react-helmet-async';

export function Catalog() {
  const { isAvailable } = useInventory();
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>(staticProducts);
  const [loading, setLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';

  useEffect(() => {
    const sanitizeProduct = (data: any) => {
      if (!data) return data;
      const sanitized = { ...data };
      if (data.slug === 'force' && (data.description || '').includes('100% algodão premium de alta gramatura (220gsm)')) {
        sanitized.description = "A camiseta FORCE combina estética minimalista com atitude marcante. Confeccionada em malha premium 90% algodão e 10% poliéster de alta gramatura (240gsm), entrega estrutura, conforto e um caimento firme no corpo. A estampa em DTF de alta definição garante cores intensas, mantendo a peça sofisticada e confortável em qualquer ocasião.";
      }
      return sanitized;
    };

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

      // Filter: Only show products that have at least one image and are not legacy test products
      const filtered = merged.filter(p => 
        p.images && 
        p.images.length > 0 &&
        p.slug !== 'mark-prime-test' &&
        p.name !== 'PRODUTO TESTE PAGAMENTO' &&
        p.status !== 'hidden'
      );

      // Sort by createdAt, but put test product first
      filtered.sort((a, b) => {
        if (a.slug === 'teste-checkout-real') return -1;
        if (b.slug === 'teste-checkout-real') return 1;
        const dateA = (a as any).createdAt?.toDate?.() || (a as any).createdAt || 0;
        const dateB = (b as any).createdAt?.toDate?.() || (b as any).createdAt || 0;
        return dateB - dateA;
      });

      setProducts(filtered);
    }, (error) => {
      console.error("Erro ao carregar catálogo:", error);
    });
    return () => unsubscribe();
  }, []);

  const availableProducts = products.filter(p => isAvailable(p.id) && p.images && p.images.length > 0);

  return (
    <>
      <Helmet>
        <title>Catálogo | F PAC STORE - Estilo e Atitude</title>
        <meta name="description" content="Confira nossa coleção completa de camisetas premium. Force, Prime e muito mais. Estilo minimalista com qualidade máxima." />
        <link rel="canonical" href="https://www.fpacstore.com.br/catalog" />
      </Helmet>
      <div className="min-h-screen pt-32 md:pt-48 pb-16 md:pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8 md:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-heading font-black uppercase tracking-tighter mb-2 md:mb-3">
            PRODUTOS
          </h1>
          <p className="text-gray-600 text-sm md:text-base">A coleção completa. Escolha sua armadura diária.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-40">
          <Loader2 className="animate-spin text-[#eab308]" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 md:gap-x-10 gap-y-16 items-start">
          {availableProducts.map((product, i) => {
            const isPrime = product.slug === 'prime' || product.is_prime;
            
            return (
              <motion.div 
                key={product.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={cn(
                  "group flex flex-col relative",
                  isPrime && "lg:scale-[1.02] z-10"
                )}
              >
                <Link to={`/product/${product.slug}`} className={cn(
                  "block relative aspect-[4/5] bg-black overflow-hidden mb-8 transition-all duration-700 rounded-[2rem] border-2",
                  isPrime 
                    ? "border-[#eab308] shadow-[0_30px_70px_-15px_rgba(234,179,8,0.3)] ring-[12px] ring-[#eab308]/5" 
                    : "border-white/10 shadow-xl group-hover:border-[#eab308]/50 group-hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)]"
                )}>
                  {product.slug === 'teste-checkout-real' && (
                    <span className="absolute top-4 left-4 z-30 bg-red-600 text-white text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-xl animate-pulse">
                      TESTE REAL
                    </span>
                  )}

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
      )}
    </div>
    </>
  );
}

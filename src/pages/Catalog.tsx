import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { products as staticProducts } from '../data/products';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { useInventory } from '../hooks/useInventory';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Loader2, ArrowRight, Zap, Mail, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

import { getApiUrl } from '../lib/api';

export function Catalog() {
  const { isAvailable } = useInventory();
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>(staticProducts);
  const [loading, setLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const isAdmin = user?.email === 'fpacstore@gmail.com';

  const handleSendTestEmail = async () => {
    setIsSendingTest(true);
    try {
      const response = await fetch(getApiUrl('/api/send-confirmation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'fpacstore@gmail.com',
          customerName: 'SISTEMA TESTE',
          orderId: 'TEST-WEB-'+Math.floor(Math.random()*100),
          items: [{ name: 'TESTE CATALOGO', quantity: 1, price: 0, color: 'N/A', size: 'G' }],
          totals: { frete: 0, discount: 0, finalTotal: 0 },
          status: 'pending'
        })
      });
      const res = await response.json();
      if(res.success) alert('✅ E-mail enviado com sucesso!');
      else alert('❌ Erro: ' + res.error);
    } catch(e) {
      alert('❌ Erro de conexão');
    } finally {
      setIsSendingTest(false);
    }
  };

  useEffect(() => {
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

      // Sort by createdAt
      merged.sort((a, b) => {
        const dateA = (a as any).createdAt?.toDate?.() || (a as any).createdAt || 0;
        const dateB = (b as any).createdAt?.toDate?.() || (b as any).createdAt || 0;
        return dateB - dateA;
      });

      setProducts(merged);
    }, (error) => {
      console.error("Erro ao carregar catálogo:", error);
    });
    return () => unsubscribe();
  }, []);

  const availableProducts = products.filter(p => isAvailable(p.id));

  return (
    <div className="min-h-screen pt-28 md:pt-44 pb-16 md:pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8 md:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-heading font-black uppercase tracking-tighter mb-2 md:mb-3">
            PRODUTOS
          </h1>
          <p className="text-gray-600 text-sm md:text-base">A coleção completa. Escolha sua armadura diária.</p>
        </div>

        {isAdmin && (
          <button 
            onClick={handleSendTestEmail}
            disabled={isSendingTest}
            className={cn(
              "flex items-center gap-2 px-6 py-3 text-[10px] font-black uppercase tracking-widest border-2 transition-all shadow-xl",
              isSendingTest 
                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" 
                : "bg-[#eab308] text-black border-[#eab308] hover:bg-black hover:text-[#eab308]"
            )}
          >
            {isSendingTest ? <Loader2 className="animate-spin" size={14} /> : <Mail size={14} />}
            {isSendingTest ? 'Enviando...' : 'Testar E-mail Resend'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-40">
          <Loader2 className="animate-spin text-[#eab308]" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {availableProducts.map((product, i) => (
            <motion.div 
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group relative flex flex-col"
            >
              <Link to={`/product/${product.slug}`} className="block relative aspect-[3/4] overflow-hidden rounded-none bg-black/5 mb-4">
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
                    <p className="text-gray-500 text-[11px] md:text-xs uppercase tracking-[0.15em] font-bold mt-0.5">
                      {product.headline}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                      <span className="font-black text-3xl md:text-4xl tracking-tighter">
                         R$ {product.price?.toFixed(2)}
                      </span>
                      <span className="hidden md:inline-block text-[7px] font-black uppercase tracking-widest text-[#eab308] px-1 py-0.5 bg-black">PIX</span>
                    </div>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">ou até 12x no cartão</span>
                  </div>
                  
                  <Link 
                    to={`/product/${product.slug}`}
                    className="w-10 h-10 bg-black text-white flex items-center justify-center hover:bg-[#eab308] hover:text-black transition-all transform active:scale-90"
                  >
                    <ArrowRight size={18} />
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

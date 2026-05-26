import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { products as staticProducts } from '../data/products';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, Loader2, Sparkles, Shield, ChevronRight } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useInventory } from '../hooks/useInventory';

export default function ModelStamps() {
  const { modelSlug } = useParams<{ modelSlug: string }>();
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAvailable, getStock } = useInventory();

  useEffect(() => {
    // Escuta em tempo real para sincronização de preços, fotos e descrições do Firestore
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const merged = staticProducts.map(sp => {
        const dbP = dbProducts.find((p: any) => p.id === sp.id || p.slug === sp.slug);
        return dbP ? { ...sp, ...dbP } : sp;
      });

      dbProducts.forEach((dbP: any) => {
        if (!staticProducts.some(sp => sp.id === dbP.id || sp.slug === dbP.slug)) {
          merged.push(dbP);
        }
      });
      
      setProducts(merged);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar produtos:", error);
      setProducts(staticProducts);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    return () => unsubscribe();
  }, []);

  const parentProduct = products.find(p => p.slug === modelSlug);
  const stamps = products.filter(p => p.parentSlug === modelSlug);

  if (loading) {
    return (
      <div className="min-h-screen pt-40 flex items-center justify-center">
        <Loader2 className="animate-spin text-[#eab308]" size={40} />
      </div>
    );
  }

  if (!parentProduct) {
    return (
      <div className="min-h-screen pt-40 px-6 max-w-7xl mx-auto flex flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-black uppercase mb-4">Modelo não encontrado.</h1>
        <Link to="/catalog" className="text-sm font-bold uppercase tracking-widest text-[#eab308] hover:underline">Voltar ao Catálogo</Link>
      </div>
    );
  }

  const uppercaseModel = (modelSlug || '').toUpperCase();

  return (
    <>
      <Helmet>
        <title>Coleção {uppercaseModel} | F PAC STORE</title>
        <meta name="description" content={`Explore todas as estampas exclusivas do modelo ${uppercaseModel}. Tecido de alta qualidade, modelagem streetwear autêntica.`} />
        <link rel="canonical" href={`https://www.fpacstore.com.br/model/${modelSlug}`} />
      </Helmet>

      <div className="min-h-screen pt-20 md:pt-28 pb-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          
          {/* Voltar link */}
          <div className="mb-6 md:mb-10">
            <Link 
              to="/catalog"
              className="inline-flex items-center gap-2 text-[10px] md:text-xs font-black uppercase tracking-widest text-black/50 hover:text-black transition-colors"
            >
              <ArrowLeft size={14} /> Voltar ao Catálogo
            </Link>
          </div>

          {/* Cabeçalho do Modelo */}
          <div className="mb-10 md:mb-16 border-b border-black/5 pb-8 md:pb-12">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
              <div className="md:col-span-8">
                <div className="flex items-center gap-2 mb-2 md:mb-3">
                  <span className="bg-black text-[8px] font-black uppercase tracking-widest text-white px-2.5 py-1">MODELO EXCLUSIVO</span>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{stamps.length} estampas disponíveis</span>
                </div>
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black uppercase tracking-tighter italic leading-none mb-4">
                  COLEÇÃO <span className="text-[#eab308]">{parentProduct.name}</span>
                </h1>
                <p className="text-gray-500 font-medium text-xs md:text-sm max-w-xl leading-relaxed">
                  {parentProduct.description}
                </p>
              </div>
              
              <div className="md:col-span-4 flex md:justify-end gap-6 text-left">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-md shadow-xs border border-black/5 text-[#eab308]">
                    <Shield size={18} />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-black">Tecido Premium</h4>
                    <p className="text-[9px] text-gray-400 uppercase font-bold">240gsm Encorpado</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-md shadow-xs border border-black/5 text-[#eab308]">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-black">Estampa HD</h4>
                    <p className="text-[9px] text-gray-400 uppercase font-bold">DTF Alta Resolução</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Grid de Estampas */}
          {stamps.length === 0 ? (
            <div className="bg-white p-12 text-center border border-black/5">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">Nenhuma estampa cadastrada para este modelo ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-8 md:gap-y-12">
              {stamps.map((stampProduct) => {
                // Se a estampa não tiver fotos personalizadas dadas pelo admin, herdar as fotos do modelo principal como fallback
                const imageUrl = stampProduct.images?.[0] || parentProduct.images?.[0] || '/estampas/logo-fpac.png';
                
                return (
                  <motion.div 
                    key={stampProduct.id}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.5 }}
                    className="group flex flex-col justify-between"
                  >
                    <div>
                      {/* Container da Imagem */}
                      <Link to={`/product/${stampProduct.slug}`} className="block relative w-full aspect-[4/5] bg-black overflow-hidden mb-4 border border-black/5 shadow-sm transition-all duration-500 hover:border-[#eab308]/40 hover:shadow-md">
                        {(!isAvailable(stampProduct.slug, undefined, stampProduct.parentSlug) || getStock(stampProduct.slug, undefined, stampProduct.parentSlug) <= 0) && (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-10 pointer-events-none">
                            <span className="bg-red-600 text-white text-[9px] md:text-[10px] font-black uppercase tracking-[0.25em] px-3 py-1.5 border-2 border-white select-none italic transform -rotate-12 shadow-2xl">
                              ESGOTADO
                            </span>
                          </div>
                        )}
                        <img 
                          src={imageUrl} 
                          alt={stampProduct.name}
                          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/estampas/logo-fpac.png'; }}
                        />
                        
                        {/* Overlay Gradiente Streetwear */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 md:p-5 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                          <span className="text-[9px] font-black tracking-widest uppercase text-[#eab308]">VER DETALHES DA ESTAMPA</span>
                        </div>
                      </Link>

                      {/* Informações da Estampa */}
                      <div className="px-1">
                        {/* Tamanho/Localização da Estampa */}
                        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-[#eab308] block mb-1">
                          {stampProduct.stampSize || stampProduct.headline || "Estampa Localizada"}
                        </span>
                        
                        {/* Nome do Produto */}
                        <Link to={`/product/${stampProduct.slug}`}>
                          <h3 className="text-sm md:text-lg font-black uppercase tracking-tight text-black group-hover:text-[#eab308] transition-colors leading-tight">
                            {stampProduct.name}
                          </h3>
                        </Link>

                        {/* Descrição Opcional Curta */}
                        {stampProduct.description && (
                          <p className="text-[10px] md:text-xs text-gray-400 font-medium line-clamp-2 mt-1 leading-relaxed">
                            {stampProduct.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Preço e Botão */}
                    <div className="px-1 mt-3 pt-3 border-t border-black/5 flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-400 font-black uppercase tracking-wider">A partir de</span>
                        <span className="text-xs md:text-sm font-black italic text-black">
                          R$ {stampProduct.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      
                      <Link 
                        to={`/product/${stampProduct.slug}`}
                        className="bg-black hover:bg-[#eab308] hover:text-black transition-colors text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest px-3 py-2 shrink-0 flex items-center gap-1.5"
                      >
                        VER PRODUTO <ChevronRight size={10} className="stroke-[3]" />
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </>
  );
}

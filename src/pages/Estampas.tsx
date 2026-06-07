import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useInventory } from '../hooks/useInventory';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Loader2, Image as ImageIcon, ChevronRight } from 'lucide-react';

interface Estampa {
  id: string;
  name: string;
  description: string;
  path?: string;
  image?: string;
  slotIndex?: number;
  position?: string;
  width?: string;
  height?: string;
}

export default function Estampas() {
  const { isAvailable, getStock } = useInventory(); // Mantendo compatibilidade com seu hook
  const [estampas, setEstampas] = useState<Estampa[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    // Busca do Firebase
    const q = query(collection(db, 'estampas'), orderBy('slotIndex', 'asc')); // Changed to order by slotIndex
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Estampa));
      
      // Se não houver nada no banco, podemos mostrar as iniciais (opcional)
      if (data.length === 0) {
        setEstampas([
          { id: 'peito-1', name: 'Escrita Peito Core', path: '/estampas/F-PAC-ESCRITA-peito C.png', description: 'Logo F PAC STORE minimalista para aplicação no peito.', slotIndex: 1 },
          { id: 'logo-premium', name: 'F PAC Full Logo', path: '/estampas/logo-fpac.png', description: 'Nossa assinatura completa para estampas grandes.', slotIndex: 2 }
        ]);
      } else {
        setEstampas(data);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="pt-4 md:pt-6 pb-16 px-6 md:px-12 max-w-7xl mx-auto min-h-screen">
      {/* Breadcrumbs - Desktop Only */}
      <div className="hidden md:flex items-center gap-2 text-[8px] md:text-[9px] text-gray-500 uppercase tracking-widest mb-6">
         <Link to="/" className="hover:text-black">INÍCIO</Link>
         <ChevronRight size={10} />
         <span className="text-[#eab308]">ESTAMPAS</span>
      </div>
      <div className="mb-12">
        <h1 className="text-3xl md:text-5xl font-heading font-black tracking-tighter uppercase mb-4 leading-none">
          Catálogo de <span className="text-[#eab308]">Estampas</span>
        </h1>
        <p className="text-gray-600 max-w-xl text-sm md:text-base leading-relaxed uppercase tracking-widest font-medium">
          Nossas estampas são desenvolvidas para transmitir força e identidade. 
          Escolha a sua favorita para personalizar os seus produtos PRIME.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-40">
          <Loader2 className="animate-spin text-[#eab308]" size={40} />
        </div>
      ) : (
        <div className="space-y-16 md:space-y-24">
          {/* Destaques Section (Slots 1 & 2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 pb-8 border-b border-white/5">
            {[1, 2].map((slotIndex) => {
              const estampaArr = estampas.filter(e => e.slotIndex === slotIndex);
              const estampa = estampaArr.length > 0 ? estampaArr[0] : null;
              const isStampAvailable = estampa ? (isAvailable(estampa.id || `slot-${slotIndex}`) && getStock(estampa.id || `slot-${slotIndex}`) > 0) : false;
              const hasImage = !!estampa?.image && isStampAvailable;

              return (
                <motion.div 
                  key={slotIndex}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                  className={cn(
                    "flex flex-col group transition-all duration-500 overflow-hidden relative cursor-pointer rounded-2xl md:rounded-3xl",
                    "ring-1 ring-[#eab308]/30 shadow-[0_0_30px_rgba(234,179,8,0.1)] md:scale-[1.01] hover:scale-[1.03] z-10 hover:ring-[#eab308]/60",
                    !hasImage && "border border-dashed border-black/10 opacity-50 shadow-none bg-black/5"
                  )}
                  onClick={() => hasImage && estampa && estampa.image && setSelectedImage(estampa.image)}
                >
                  <div className="aspect-[16/10] sm:aspect-[16/9] md:aspect-[4/3] lg:aspect-[16/9] bg-[#f5f5f5] flex items-center justify-center p-6 sm:p-8 md:p-12 overflow-hidden">
                     { hasImage && estampa ? (
                      <>
                        <img 
                          src={estampa.image || undefined}
                          alt={estampa.name}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-1000 opacity-100 block"
                        />
                      </>
                     ) : (
                        <div className="flex flex-col items-center">
                           <span className="text-3xl md:text-6xl font-black text-black uppercase tracking-tighter leading-none opacity-100">ESGOTADO</span>
                        </div>
                     )}
                     
                     <div className="absolute inset-0 border-[6px] border-[#eab308]/0 group-hover:border-[#eab308]/5 transition-all duration-700 pointer-events-none"></div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Catalog Stamps sections (Slots 3+) */}
          {(() => {
            const catalogStamps = estampas.filter(e => {
              const slotIdx = e.slotIndex || 0;
              if (slotIdx < 3) return false;
              const keyId = e.id || `slot-${slotIdx}`;
              return isAvailable(keyId) && getStock(keyId) > 0;
            });
            
            if (catalogStamps.length === 0) return null;

            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                {catalogStamps.map((estampa, index) => {
                  const hasImage = !!estampa.image;
                  return (
                    <motion.div 
                      key={estampa.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: index * 0.03 }}
                      className={cn(
                        "flex flex-col group transition-all duration-500 overflow-hidden relative cursor-pointer border border-black/5 md:hover:border-black/20 rounded-2xl md:rounded-3xl",
                        !hasImage && "opacity-70 grayscale bg-black/5"
                      )}
                      onClick={() => hasImage && estampa.image && setSelectedImage(estampa.image)}
                    >
                      <div className="aspect-square bg-[#f5f5f5] flex items-center justify-center p-4 sm:p-5 md:p-6 overflow-hidden">
                         { hasImage ? (
                           <img 
                             src={estampa.image || undefined}
                             alt={estampa.name}
                             className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700 opacity-100 block"
                           />
                         ) : (
                            <div className="flex flex-col items-center">
                               <span className="text-xl md:text-3xl font-black text-black uppercase tracking-tighter leading-none opacity-20">PENDENTE</span>
                            </div>
                          )}
                         
                         <div className="absolute inset-2 border border-white/0 group-hover:border-[#eab308]/20 transition-all duration-500 pointer-events-none"></div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Image Zoom Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 md:p-10"
          onClick={() => setSelectedImage(null)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative max-w-5xl w-full h-full flex items-center justify-center"
          >
             <img 
               src={selectedImage || undefined} 
               className="max-w-full max-h-full object-contain" 
               alt="Stamp Zoom"
             />
             <button 
               className="absolute top-0 right-0 md:-top-10 md:-right-10 text-white hover:text-[#eab308] transition-colors p-2"
               onClick={(e) => {
                 e.stopPropagation();
                 setSelectedImage(null);
               }}
             >
                <span className="text-xs font-black uppercase tracking-widest">Fechar [X]</span>
             </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

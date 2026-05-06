import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useInventory } from '../hooks/useInventory';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Loader2, Image as ImageIcon } from 'lucide-react';

interface Estampa {
  id: string;
  name: string;
  description: string;
  path?: string;
  image?: string;
  slotIndex?: number;
}

export function Estampas() {
  const { isAvailable } = useInventory(); // Mantendo compatibilidade com seu hook
  const [estampas, setEstampas] = useState<Estampa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Busca do Firebase
    const q = query(collection(db, 'estampas'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Estampa));
      
      // Se não houver nada no banco, podemos mostrar as iniciais (opcional)
      if (data.length === 0) {
        setEstampas([
          { id: 'peito-1', name: 'Escrita Peito Core', path: '/estampas/F-PAC-ESCRITA-peito C.png', description: 'Logo F PAC STORE minimalista para aplicação no peito.' },
          { id: 'logo-premium', name: 'F PAC Full Logo', path: '/estampas/logo-fpac.png', description: 'Nossa assinatura completa para estampas grandes.' }
        ]);
      } else {
        setEstampas(data);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Prepare slots (1 to 15)
  const slots = Array.from({ length: 15 }, (_, i) => i + 1);

  return (
    <div className="pt-28 md:pt-44 pb-24 px-6 md:px-12 max-w-7xl mx-auto min-h-screen">
      <div className="mb-16">
        <h1 className="text-4xl md:text-6xl font-heading font-black tracking-tighter uppercase mb-6 leading-none">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-6">
          {slots.map((slotIndex, index) => {
            const estampaArr = estampas.filter(e => e.slotIndex === slotIndex);
            const estampa = estampaArr.length > 0 ? estampaArr[0] : null;
            const hasImage = !!estampa?.image;

            return (
              <motion.div 
                key={slotIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className={cn(
                  "flex flex-col group bg-black transition-all duration-500 overflow-hidden relative",
                  !hasImage && "border border-white/5 opacity-40 grayscale"
                )}
              >
                <div className="aspect-[4/5] bg-black flex items-center justify-center relative overflow-hidden">
                   { hasImage ? (
                    <>
                      <img 
                        src={estampa.image}
                        alt={estampa.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-70 group-hover:opacity-100"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80"></div>
                      <div className="absolute bottom-4 left-4 right-4 z-10 transition-transform duration-500 group-hover:-translate-y-1">
                         <span className="text-[7px] text-[#eab308] font-black uppercase tracking-[0.3em] mb-1 block">F PAC STORE / EXCLUSIVE</span>
                         <h3 className="font-heading font-black text-lg md:text-xl tracking-tight uppercase text-white leading-tight">{estampa.name}</h3>
                      </div>
                    </>
                   ) : (
                      <div className="flex flex-col items-center gap-3">
                         <span className="text-3xl font-black text-white/5 uppercase tracking-tighter leading-none">F PAC</span>
                         <span className="text-2xl font-black text-[#eab308] uppercase tracking-tighter text-center leading-none">ESGOTADO</span>
                         <span className="text-[7px] font-bold text-white/20 uppercase tracking-[0.3em]">Slot {slotIndex}</span>
                      </div>
                   )}
                   
                   {/* Decorative border on hover */}
                   <div className="absolute inset-2 border border-white/0 group-hover:border-[#eab308]/20 transition-all duration-500 pointer-events-none"></div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

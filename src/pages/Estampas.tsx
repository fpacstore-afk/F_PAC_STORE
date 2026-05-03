import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useInventory } from '../hooks/useInventory';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Loader2, Image as ImageIcon } from 'lucide-react';

interface Estampa {
  id: string;
  name: string;
  description: string;
  path?: string;
  image?: string;
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

  // Filtra apenas as que estão marcadas como disponíveis no inventário (se houver controle de estoque nelas)
  const availableEstampas = estampas.filter(e => isAvailable(e.id));

  return (
    <div className="pt-40 pb-24 px-6 md:px-12 max-w-7xl mx-auto min-h-screen">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-heading font-black tracking-tighter uppercase mb-4">
          Catálogo de <span className="text-[#eab308]">Estampas</span>
        </h1>
        <p className="text-gray-600 max-w-xl leading-relaxed">
          Nossas estampas são desenvolvidas para transmitir força e identidade. 
          Escolha a sua favorita para personalizar os seus produtos.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-40">
          <Loader2 className="animate-spin text-[#eab308]" size={40} />
        </div>
      ) : availableEstampas.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {availableEstampas.map((estampa, index) => (
            <motion.div 
              key={estampa.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="flex flex-col group bg-white/5 border border-black/5 p-4"
            >
              <div className="aspect-[4/3] bg-black flex items-center justify-center relative overflow-hidden">
                 { (estampa.image || estampa.path) ? (
                   <img 
                    src={estampa.image || estampa.path}
                    alt={estampa.name}
                    className="w-full h-full object-contain p-8 group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                 ) : (
                    <ImageIcon size={48} className="text-white/20" />
                 )}
                 <div className="absolute inset-0 bg-[#eab308]/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              </div>
              <div className="mt-6 flex flex-col gap-2">
                 <span className="text-[10px] text-[#eab308] font-bold uppercase tracking-[0.2em]">Exclusivo F PAC STORE</span>
                 <h3 className="font-heading font-black text-2xl tracking-tight uppercase group-hover:text-[#eab308] transition-colors">{estampa.name}</h3>
                 <p className="text-sm text-gray-500">{estampa.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-40 bg-black/5 border border-black/5">
           <p className="text-xs uppercase font-bold tracking-widest text-gray-400">Nenhuma estampa disponível no momento.</p>
        </div>
      )}
    </div>
  );
}

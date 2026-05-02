import { motion } from 'framer-motion';

export function Estampas() {
  const cards = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="pt-32 pb-24 px-6 md:px-12 max-w-7xl mx-auto">
      <h1 className="text-4xl md:text-5xl font-heading font-black tracking-tighter uppercase mb-2">
        Estampas <span className="text-[#eab308]">Disponíveis</span>
      </h1>
      <p className="text-gray-600 mb-12 max-w-xl">
        Conheça as nossas opções de estampas exclusivas para personalizar a sua armadura na linha PRIME.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">
        {cards.map((card, index) => (
          <motion.div 
            key={card}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.05 }}
            className="flex flex-col group cursor-pointer"
          >
            <div className="aspect-square bg-black/5 border border-black/10 flex items-center justify-center relative overflow-hidden">
               <span className="text-black/30 font-bold uppercase tracking-widest text-xs">Imagem {card}</span>
               {/* Place img tag here when ready */}
            </div>
            <div className="mt-4 flex flex-col md:flex-row justify-between md:items-center gap-2">
               <div>
                 <h3 className="font-bold text-sm tracking-wide uppercase">Estampa {card}</h3>
               </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

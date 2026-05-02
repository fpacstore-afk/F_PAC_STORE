import { motion } from 'framer-motion';

const catalogEstampas = [
  { id: 'costas-1', name: 'Design Costas Classic', path: '/src/estampas/F-PAC- costas.png' },
  { id: 'costas-2', name: 'Design Costas Varsity', path: '/src/estampas/F-PAC-costas (2).png' },
  { id: 'peito-1', name: 'Escrita Peito Core', path: '/src/estampas/F-PAC-ESCRITA-peito C.png' },
  { id: 'peito-2', name: 'Escrita Peito Modern', path: '/src/estampas/F-PAC-ESCRITA-peito C (2).png' },
  { id: 'peito-3', name: 'Escrita Peito Dynamic', path: '/src/estampas/F-PAC-ESCRITA-peito C (3).png' },
];

export function Estampas() {
  return (
    <div className="pt-32 pb-24 px-6 md:px-12 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-heading font-black tracking-tighter uppercase mb-4">
          Catálogo de <span className="text-[#eab308]">Estampas</span>
        </h1>
        <p className="text-gray-600 max-w-xl leading-relaxed">
          Nossas estampas são desenvolvidas para transmitir força e identidade. 
          Escolha a sua favorita para personalizar os seus produtos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {catalogEstampas.map((estampa, index) => (
          <motion.div 
            key={estampa.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            className="flex flex-col group bg-white/5 border border-black/5 p-4"
          >
            <div className="aspect-[4/3] bg-black flex items-center justify-center relative overflow-hidden">
               <img 
                 src={estampa.path}
                 alt={estampa.name}
                 className="w-full h-full object-contain p-8"
                 onError={(e) => {
                   // Fallback visual if image not uploaded yet
                   e.currentTarget.style.display = 'none';
                   const parent = e.currentTarget.parentElement;
                   if (parent && !parent.querySelector('.fallback-msg')) {
                     const msg = document.createElement('div');
                     msg.className = 'fallback-msg text-center p-8';
                     msg.innerHTML = `
                       <div class="text-[#eab308] font-bold mb-2">AGUARDANDO UPLOAD</div>
                       <div class="text-[10px] text-white/50 uppercase tracking-widest">
                         Upload o arquivo "${estampa.path.split('/').pop()}" para a pasta /src/estampas
                       </div>
                     `;
                     parent.appendChild(msg);
                   }
                 }}
               />
               <div className="absolute inset-0 bg-[#eab308]/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            </div>
            <div className="mt-6 flex flex-col gap-2">
               <span className="text-[10px] text-[#eab308] font-bold uppercase tracking-[0.2em]">Exclusivo F PAC STORE</span>
               <h3 className="font-heading font-black text-2xl tracking-tight uppercase group-hover:text-[#eab308] transition-colors">{estampa.name}</h3>
               <p className="text-sm text-gray-500">Impressão em alta definição com toque zero e alta durabilidade.</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-24 p-8 bg-black text-white text-center">
        <h2 className="text-2xl font-heading font-black uppercase mb-4 tracking-tight">Quer uma estampa personalizada?</h2>
        <p className="text-white/60 mb-8 max-w-2xl mx-auto text-sm">Entre em contato via Instagram para orçamentos de estampas exclusivas para o seu time ou evento.</p>
        <a 
          href="https://instagram.com/f_pac_store" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-block bg-[#eab308] text-black font-black uppercase tracking-[0.2em] px-10 py-4 hover:bg-white transition-colors"
        >
          Falar no Instagram
        </a>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Logo } from './Logo';
import { Instagram, ArrowRight, ShieldCheck, Truck, RefreshCw, X, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function Footer() {
  const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);

  const handleReturnWhatsApp = () => {
    const message = `Olá!%0A%0AA%20solicitação%20deve%20será%20feita%20através%20deste%20canal%20de%20contato,%20nos%20informe:%0A%0ANúmero%20do%20pedido:%0AMotivo%20da%20troca%20ou%20devolução:%0AFotos%20do%20produto%20(em%20caso%20de%20defeito%20ou%20avaria)%20%0A%0A⬇️⬇️⬇️⬇️⬇️`;
    window.open(`https://wa.me/5547997465602?text=${message}`, '_blank');
  };

  return (
    <footer className="bg-[#ffffff] border-t border-black/10 relative overflow-hidden">
      
      {/* Returns and Exchanges Modal */}
      <AnimatePresence>
        {isReturnsModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            onClick={() => setIsReturnsModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-none shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-black/5 p-6 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tighter italic">Trocas e Devoluções</h2>
                  <p className="text-[10px] font-bold text-[#eab308] uppercase tracking-widest">Como Funciona</p>
                </div>
                <button 
                  onClick={() => setIsReturnsModalOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Content */}
              <div className="p-8 space-y-8 font-sans">
                <p className="text-[#64748b] leading-relaxed italic">
                  Após a confirmação da compra, o cliente pode solicitar troca ou devolução de forma simples e segura, seguindo as condições abaixo:
                </p>

                <section className="space-y-4">
                  <h3 className="font-black text-xs uppercase tracking-[0.2em] text-black flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#eab308] rounded-full"></span> 1. Prazo para solicitação
                  </h3>
                  <ul className="space-y-2 text-sm text-[#475569] pl-4 border-l border-black/5">
                    <li>• <span className="font-bold">Trocas:</span> até 07 dias corridos após o recebimento do produto.</li>
                    <li>• <span className="font-bold">Devoluções por arrependimento:</span> até 7 dias corridos após o recebimento, conforme o Código de Defesa do Consumidor.</li>
                  </ul>
                </section>

                <section className="space-y-4">
                  <h3 className="font-black text-xs uppercase tracking-[0.2em] text-black flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#eab308] rounded-full"></span> 2. Condições do produto
                  </h3>
                  <p className="text-sm text-[#475569] pl-4">O item deve estar:</p>
                  <ul className="space-y-2 text-sm text-[#475569] pl-4 border-l border-black/5">
                    <li>• Sem sinais de uso, lavagem ou alteração</li>
                    <li>• Com etiquetas originais fixadas</li>
                    <li>• Acompanhado da embalagem original (quando possível)</li>
                  </ul>
                </section>

                <section className="space-y-4">
                  <h3 className="font-black text-xs uppercase tracking-[0.2em] text-black flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#eab308] rounded-full"></span> 3. Como solicitar
                  </h3>
                  <p className="text-sm text-[#475569] pl-4">A solicitação deve ser feita através do canal de contato disponível no site, informando:</p>
                  <ul className="space-y-2 text-sm text-[#475569] pl-4 border-l border-black/5">
                    <li>• Número do pedido</li>
                    <li>• Motivo da troca ou devolução</li>
                    <li>• Fotos do produto (em caso de defeito ou avaria)</li>
                  </ul>
                </section>

                <section className="space-y-4">
                  <h3 className="font-black text-xs uppercase tracking-[0.2em] text-black flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#eab308] rounded-full"></span> 4. Análise e aprovação
                  </h3>
                  <p className="text-sm text-[#475569] pl-4 border-l border-black/5">Após o envio das informações, a solicitação será analisada. Se aprovada, o cliente receberá as instruções para envio do produto.</p>
                </section>

                <section className="space-y-4">
                  <h3 className="font-black text-xs uppercase tracking-[0.2em] text-black flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#eab308] rounded-full"></span> 5. Envio do produto
                  </h3>
                  <ul className="space-y-2 text-sm text-[#475569] pl-4 border-l border-black/5">
                    <li>• Em casos de defeito, o custo do frete é de responsabilidade da loja.</li>
                    <li>• Para trocas por tamanho ou preferência, o frete pode ser de responsabilidade do cliente.</li>
                  </ul>
                </section>

                <section className="space-y-4">
                  <h3 className="font-black text-xs uppercase tracking-[0.2em] text-black flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#eab308] rounded-full"></span> 6. Opções disponíveis
                  </h3>
                  <p className="text-sm text-[#475569] pl-4">Após o recebimento e conferência do produto, o cliente poderá optar por:</p>
                  <ul className="space-y-2 text-sm text-[#475569] pl-4 border-l border-black/5">
                    <li>• Troca por outro tamanho ou modelo (consultar produtos disponíveis)</li>
                    <li>• Recebimento de crédito para nova compra</li>
                    <li>• Reembolso (no caso de devolução dentro do prazo legal)</li>
                  </ul>
                </section>

                <section className="space-y-4">
                  <h3 className="font-black text-xs uppercase tracking-[0.2em] text-black flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#eab308] rounded-full"></span> 7. Prazo de conclusão
                  </h3>
                  <p className="text-sm text-[#475569] pl-4 border-l border-black/5">O processo de troca ou devolução será concluído em até 10 dias úteis após o recebimento do produto pela loja.</p>
                </section>
              </div>

              {/* Footer Buttons */}
              <div className="sticky bottom-0 bg-gray-50 p-6 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-black/5">
                <button 
                  onClick={() => setIsReturnsModalOpen(false)}
                  className="order-2 md:order-1 border border-black/10 py-4 text-xs font-black uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all rounded-none"
                >
                  Sair
                </button>
                <button 
                  onClick={handleReturnWhatsApp}
                  className="order-1 md:order-2 bg-[#eab308] text-black py-4 text-xs font-black uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all flex items-center justify-center gap-2 rounded-none"
                >
                  <MessageCircle size={16} /> Continuar no WhatsApp
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-10 relative z-10">
        
        {/* Trust Badges - Desktop */}
        <div className="hidden md:flex justify-between items-center py-6 border-b border-black/10">
            <div className="flex items-center gap-4">
                <Truck className="text-[#eab308]" size={32} />
                <div>
                   <h4 className="font-bold">Frete Rápido</h4>
                   <p className="text-sm text-gray-600">Entregamos para todo o Brasil</p>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <ShieldCheck className="text-[#eab308]" size={32} />
                <div>
                   <h4 className="font-bold">Pagamento Seguro</h4>
                   <p className="text-sm text-gray-600">Transação 100% criptografada</p>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <RefreshCw className="text-[#eab308]" size={32} />
                <div>
                   <h4 className="font-bold">Troca Garantida</h4>
                   <p className="text-sm text-gray-600">Até 7 dias após o recebimento</p>
                </div>
             </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 py-16">
          <div className="md:col-span-2 md:col-start-1">
            <h4 className="font-heading font-bold mb-6 text-black uppercase tracking-wider text-sm">Loja</h4>
            <ul className="space-y-4 text-gray-600 text-sm">
              <li><Link to="/catalog" className="hover:text-[#eab308] transition-colors">Ver Coleção</Link></li>
              <li><Link to="/product/force" className="hover:text-[#eab308] transition-colors">Linha FORCE</Link></li>
              <li><Link to="/product/mark" className="hover:text-[#eab308] transition-colors">Linha MARK</Link></li>
              <li><Link to="/product/prime" className="hover:text-[#eab308] transition-colors">Linha PRIME</Link></li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <h4 className="font-heading font-bold mb-6 text-black uppercase tracking-wider text-sm">Ajuda</h4>
            <ul className="space-y-4 text-gray-600 text-sm">
              <li>
                <a 
                  href="https://wa.me/5547997465602?text=Olá!%20Gostaria%20de%20retirar%20duvidas." 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-[#eab308] transition-colors"
                >
                  FAQ
                </a>
              </li>
              <li>
                <button 
                  onClick={() => setIsReturnsModalOpen(true)}
                  className="hover:text-[#eab308] transition-colors text-left"
                >
                  Trocas e Devoluções
                </button>
              </li>
              <li>
                <Link to="/tracking" className="hover:text-[#eab308] transition-colors">
                  Acompanhar Pedido
                </Link>
              </li>
              <li>
                <a 
                  href="https://wa.me/5547997465602?text=Fala%20comigo!%0A%0AVim%20do%20site%20pra%20conquistar%20minha%20F%20PAC%20STORE." 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-[#eab308] transition-colors"
                >
                  Contato
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-3 border-t border-black/10 md:border-t-0 pt-8 md:pt-0">
             <h4 className="font-heading font-bold mb-6 text-black uppercase tracking-wider text-sm">Fique Ligado</h4>
             <p className="text-sm text-gray-600 mb-4">Cadastre-se para receber avisos de drops limitados.</p>
             <form className="flex">
                <input 
                  type="email" 
                  placeholder="Seu melhor e-mail" 
                  className="bg-black/5 border border-black/10 rounded-l-md px-4 py-2 text-sm w-full focus:outline-none focus:border-[#eab308] transition-colors"
                />
                <button 
                  type="button" 
                  className="bg-[#eab308] text-black px-4 rounded-r-md hover:bg-white transition-colors flex items-center justify-center"
                >
                  <ArrowRight size={18} />
                </button>
             </form>
          </div>
        </div>

        <div className="border-t border-black/10 py-4 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] uppercase font-bold tracking-widest text-[#eab308] mt-16">
          <p translate="no">
            &copy; {new Date().getFullYear()} F PAC STORE Limited Edition
          </p>
          <div className="flex gap-8 items-center">
             <a 
               href="https://www.instagram.com/f_pac_store" 
               target="_blank" 
               rel="noopener noreferrer"
               className="flex items-center gap-2 hover:opacity-80 transition-opacity"
             >
               <div className="w-5 h-5 rounded-[4px] flex items-center justify-center text-white" style={{ background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' }}>
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="12" height="12" fill="currentColor">
                   <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/>
                 </svg>
               </div>
               INSTAGRAM
             </a>
             <a 
               href="https://wa.me/5547997465602" 
               target="_blank" 
               rel="noopener noreferrer"
               className="flex items-center gap-2 hover:opacity-80 transition-opacity"
             >
               <div className="w-5 h-5 bg-[#25D366] rounded-full flex items-center justify-center text-white">
                 <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                   <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.067 2.877 1.215 3.076.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                 </svg>
               </div>
               WHATSAPP
             </a>
             <span className="hidden md:inline text-black/20">|</span>
             <span translate="no" className="text-black/40">Vista atitude. Vista F PAC STORE.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

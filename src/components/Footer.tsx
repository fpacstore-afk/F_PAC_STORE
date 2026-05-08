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
          <div className="flex gap-4">
             <span translate="no">Vista atitude. Vista F PAC STORE.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

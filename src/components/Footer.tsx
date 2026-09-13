import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Logo } from './Logo';
import { ArrowRight, ShieldCheck, Truck, RefreshCw, X, MessageCircle, Instagram } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function Footer() {
  const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);

  const handleReturnWhatsApp = () => {
    const message = `Olá!%0A%0AGostaria%20de%20solicitar%20uma%20troca%20ou%20devolução.%0A%0ANúmero%20do%20pedido:%0AMotivo%20da%20troca%20ou%20devolução:%0AFotos%20do%20produto%20(em%20caso%20de%20defeito%20ou%20avaria):`;
    window.open(`https://wa.me/5547997465602?text=${message}`, '_blank');
  };

  return (
    <footer className="bg-white border-t border-black/10 relative overflow-hidden">
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
              initial={{ scale: 0.96, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 14 }}
              className="bg-white w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-black/5 p-5 md:p-6 flex items-center justify-between z-10">
                <div>
                  <p className="text-[9px] font-black text-[#b88700] uppercase tracking-[0.22em]">Ajuda F PAC</p>
                  <h2 className="mt-1 text-xl md:text-2xl font-black uppercase tracking-tighter italic">Trocas e Devoluções</h2>
                </div>
                <button
                  onClick={() => setIsReturnsModalOpen(false)}
                  className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
                  aria-label="Fechar política de trocas e devoluções"
                >
                  <X size={22} />
                </button>
              </div>

              <div className="p-5 md:p-8 space-y-7 font-sans">
                <p className="text-[#64748b] leading-relaxed">
                  Após a confirmação da compra, o cliente pode solicitar troca ou devolução seguindo as condições abaixo.
                </p>

                <section className="space-y-3">
                  <h3 className="font-black text-xs uppercase tracking-[0.18em] text-black flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#eab308] rounded-full" />1. Prazo para solicitação</h3>
                  <ul className="space-y-2 text-sm text-[#475569] pl-4 border-l border-black/5">
                    <li>• <span className="font-bold">Trocas:</span> até 07 dias corridos após o recebimento do produto.</li>
                    <li>• <span className="font-bold">Devoluções por arrependimento:</span> até 7 dias corridos após o recebimento, conforme o Código de Defesa do Consumidor.</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h3 className="font-black text-xs uppercase tracking-[0.18em] text-black flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#eab308] rounded-full" />2. Condições do produto</h3>
                  <p className="text-sm text-[#475569] pl-4">O item deve estar:</p>
                  <ul className="space-y-2 text-sm text-[#475569] pl-4 border-l border-black/5">
                    <li>• Sem sinais de uso, lavagem ou alteração</li>
                    <li>• Com etiquetas originais fixadas</li>
                    <li>• Acompanhado da embalagem original (quando possível)</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h3 className="font-black text-xs uppercase tracking-[0.18em] text-black flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#eab308] rounded-full" />3. Como solicitar</h3>
                  <p className="text-sm text-[#475569] pl-4">A solicitação deve ser feita através do canal de contato disponível no site, informando:</p>
                  <ul className="space-y-2 text-sm text-[#475569] pl-4 border-l border-black/5">
                    <li>• Número do pedido</li>
                    <li>• Motivo da troca ou devolução</li>
                    <li>• Fotos do produto (em caso de defeito ou avaria)</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h3 className="font-black text-xs uppercase tracking-[0.18em] text-black flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#eab308] rounded-full" />4. Análise e aprovação</h3>
                  <p className="text-sm text-[#475569] pl-4 border-l border-black/5">Após o envio das informações, a solicitação será analisada. Se aprovada, o cliente receberá as instruções para envio do produto.</p>
                </section>

                <section className="space-y-3">
                  <h3 className="font-black text-xs uppercase tracking-[0.18em] text-black flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#eab308] rounded-full" />5. Envio do produto</h3>
                  <ul className="space-y-2 text-sm text-[#475569] pl-4 border-l border-black/5">
                    <li>• Em casos de defeito, o custo do frete é de responsabilidade da loja.</li>
                    <li>• Para trocas por tamanho ou preferência, o frete pode ser de responsabilidade do cliente.</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h3 className="font-black text-xs uppercase tracking-[0.18em] text-black flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#eab308] rounded-full" />6. Opções disponíveis</h3>
                  <p className="text-sm text-[#475569] pl-4">Após o recebimento e conferência do produto, o cliente poderá optar por:</p>
                  <ul className="space-y-2 text-sm text-[#475569] pl-4 border-l border-black/5">
                    <li>• Troca por outro tamanho ou modelo (consultar produtos disponíveis)</li>
                    <li>• Recebimento de crédito para nova compra</li>
                    <li>• Reembolso (no caso de devolução dentro do prazo legal)</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h3 className="font-black text-xs uppercase tracking-[0.18em] text-black flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#eab308] rounded-full" />7. Prazo de conclusão</h3>
                  <p className="text-sm text-[#475569] pl-4 border-l border-black/5">O processo de troca ou devolução será concluído em até 10 dias úteis após o recebimento do produto pela loja.</p>
                </section>
              </div>

              <div className="sticky bottom-0 bg-[#f7f7f5] p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-black/5">
                <button onClick={() => setIsReturnsModalOpen(false)} className="order-2 sm:order-1 min-h-12 border border-black/10 px-4 text-[10px] font-black uppercase tracking-[0.18em] hover:bg-black hover:text-white transition-all rounded-xl">Fechar</button>
                <button onClick={handleReturnWhatsApp} className="order-1 sm:order-2 min-h-12 bg-[#eab308] text-black px-4 text-[10px] font-black uppercase tracking-[0.18em] hover:bg-black hover:text-white transition-all flex items-center justify-center gap-2 rounded-xl"><MessageCircle size={16} />Continuar no WhatsApp</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-black text-white">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-7 grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="flex items-start gap-3"><Truck className="text-[#eab308] shrink-0" size={22} /><div><h4 className="font-black uppercase text-xs tracking-wide">Entrega</h4><p className="mt-1 text-xs text-white/50">Consulte as opções disponíveis para o seu CEP durante a compra.</p></div></div>
          <div className="flex items-start gap-3"><ShieldCheck className="text-[#eab308] shrink-0" size={22} /><div><h4 className="font-black uppercase text-xs tracking-wide">Compra segura</h4><p className="mt-1 text-xs text-white/50">Pagamento concluído dentro do fluxo seguro da loja.</p></div></div>
          <div className="flex items-start gap-3"><RefreshCw className="text-[#eab308] shrink-0" size={22} /><div><h4 className="font-black uppercase text-xs tracking-wide">Suporte pós-compra</h4><p className="mt-1 text-xs text-white/50">Acompanhe o pedido e consulte a política de trocas quando precisar.</p></div></div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 md:px-8 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-x-5 gap-y-9 py-10 md:py-14">
          <div className="col-span-2 md:col-span-4">
            <Logo className="h-12 w-auto" />
            <p className="mt-4 max-w-xs text-sm text-gray-500 leading-relaxed">Streetwear, personalização e atitude para quem usa estilo como parte da própria identidade.</p>
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#b88700]">Não é só roupa. É identidade!</p>
          </div>

          <div className="col-span-1 md:col-span-2 md:col-start-6">
            <h4 className="font-black mb-4 text-black uppercase tracking-[0.16em] text-[10px]">Loja</h4>
            <ul className="space-y-3 text-gray-600 text-sm">
              <li><Link to="/produtos" className="hover:text-[#b88700] transition-colors">Produtos</Link></li>
              <li><Link to="/catalog/all" className="hover:text-[#b88700] transition-colors">Catálogo completo</Link></li>
              <li><Link to="/model/force" className="hover:text-[#b88700] transition-colors">FORCE</Link></li>
              <li><Link to="/model/mark" className="hover:text-[#b88700] transition-colors">MARK</Link></li>
              <li><Link to="/prime" className="hover:text-[#b88700] transition-colors font-bold">PRIME CUSTOM</Link></li>
            </ul>
          </div>

          <div className="col-span-1 md:col-span-2">
            <h4 className="font-black mb-4 text-black uppercase tracking-[0.16em] text-[10px]">Ajuda</h4>
            <ul className="space-y-3 text-gray-600 text-sm">
              <li><Link to="/tracking" className="hover:text-[#b88700] transition-colors">Acompanhar pedido</Link></li>
              <li><button onClick={() => setIsReturnsModalOpen(true)} className="hover:text-[#b88700] transition-colors text-left">Trocas e devoluções</button></li>
              <li><a href="https://wa.me/5547997465602?text=Olá!%20Gostaria%20de%20tirar%20uma%20dúvida%20sobre%20a%20F%20PAC%20STORE." target="_blank" rel="noopener noreferrer" className="hover:text-[#b88700] transition-colors">Falar com a F PAC</a></li>
            </ul>
          </div>

          <div className="col-span-2 md:col-span-2">
            <h4 className="font-black mb-4 text-black uppercase tracking-[0.16em] text-[10px]">Conecte-se</h4>
            <a href="https://www.instagram.com/f_pac_store" target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-3 rounded-xl border border-black/10 p-3 hover:border-[#eab308] transition-colors">
              <span className="flex items-center gap-2 text-sm font-bold"><Instagram size={17} />@f_pac_store</span><ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
            </a>
            <a href="https://wa.me/5547997465602" target="_blank" rel="noopener noreferrer" className="group mt-2 flex items-center justify-between gap-3 rounded-xl border border-black/10 p-3 hover:border-[#eab308] transition-colors">
              <span className="flex items-center gap-2 text-sm font-bold"><MessageCircle size={17} />WhatsApp</span><ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>

        <div className="border-t border-black/10 py-5 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-[9px] uppercase font-black tracking-[0.16em] text-black/35">
          <p translate="no">&copy; {new Date().getFullYear()} F PAC STORE</p>
          <span translate="no">Vista atitude. Vista F PAC STORE.</span>
        </div>
      </div>
    </footer>
  );
}

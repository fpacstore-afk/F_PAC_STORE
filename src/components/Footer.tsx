import { Link } from 'react-router-dom';
import { Instagram, ArrowRight, ShieldCheck, Truck, RefreshCw } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-[#ffffff] border-t border-black/10 relative overflow-hidden">
      
      {/* Decorative Glow */}

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
          <div className="md:col-span-4">
            <Link to="/" className="text-3xl font-heading font-black tracking-tighter uppercase block mb-6 text-[#eab308]">
              F PAC <span className="text-black">STORE</span>
            </Link>
            <p className="text-gray-600 mb-6 leading-relaxed max-w-xs">
              A F PAC STORE é para quem rejeita o comum. Peças oversized estampadas com identidade, feitas para marcar presença sem precisar dizer nada.
            </p>
            <div className="flex gap-4">
              <a href="https://instagram.com/f_pac_store" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:opacity-80 transition-opacity" style={{ background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="20" height="20" fill="currentColor">
                  <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/>
                </svg>
              </a>
              <a href="https://wa.me/5547997465602?text=Fala%20comigo!%0A%0AVim%20do%20site%20pra%20conquistar%20minha%20F%20PAC%20STORE." target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center text-white hover:opacity-80 transition-opacity">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="20" height="20" fill="currentColor">
                  <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-23.1-115-65-157zM223.9 414.5c-33.2 0-66.2-8.9-94.8-25.8l-6.8-4-70.5 18.5 18.9-68.7-4.4-7c-18.6-29.3-28.4-63.5-28.4-98.3 0-103.7 84.4-188.1 188.1-188.1 50.2 0 97.4 19.6 133 55.1 35.5 35.5 55 82.8 55 133.1 0 103.7-84.4 188.1-188.2 188.1zm103.4-141.2c-5.7-2.8-33.6-16.6-38.8-18.5-5.2-1.9-9-2.8-12.8 2.8-3.8 5.7-14.7 18.5-18 22.3-3.3 3.8-6.6 4.3-12.3 1.4-5.7-2.8-24-8.8-45.7-28.1-16.9-15-28.3-33.6-31.6-39.3-3.3-5.7-.3-8.8 2.5-11.6 2.5-2.6 5.7-6.6 8.5-9.9 2.8-3.3 3.8-5.7 5.7-9.5 1.9-3.8.9-7.1-.5-9.9-1.4-2.8-12.8-31-17.5-42.5-4.6-11.2-9.2-9.7-12.8-9.9-3.3-.2-7.1-.2-10.9-.2-3.8 0-9.9 1.4-15.1 7.1-5.2 5.7-20 19.4-20 47.1 0 27.7 20.4 54.5 23.3 58.3 2.8 3.8 39.8 60.8 96.3 85.2 13.5 5.8 24 9.3 32.2 11.9 13.6 4.3 26 3.7 35.8 2.2 11-1.7 33.6-13.7 38.3-27 4.7-13.3 4.7-24.6 3.3-27-1.4-2.5-5.2-4-10.9-6.8z"/>
                </svg>
              </a>
            </div>
          </div>
          
          <div className="md:col-span-2 md:col-start-6">
            <h4 className="font-heading font-bold mb-6 text-black uppercase tracking-wider text-sm">Loja</h4>
            <ul className="space-y-4 text-gray-600 text-sm">
              <li><a href="/#collections" className="hover:text-[#eab308] transition-colors">Ver Coleção</a></li>
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
                <a 
                  href="https://wa.me/5547997465602?text=Olá!%20Preciso%20realizar%20uma%20troca.%0ADescreva%20em%20detalhes%20o%20motivo%20da%20sua%20troca:" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-[#eab308] transition-colors"
                >
                  Trocas e Devoluções
                </a>
              </li>
              <li>
                <a 
                  href="https://wa.me/5547997465602?text=Olá!%20Qual%20status%20do%20meu%20pedido?%0ANome:%0ATel.:" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-[#eab308] transition-colors"
                >
                  Acompanhar Pedido
                </a>
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
          <p>
            &copy; {new Date().getFullYear()} F PAC STORE Limited Edition
          </p>
          <div className="flex gap-4">
             <span>Vista atitude. Vista F PAC STORE.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, Menu, X, Instagram } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPromoCode, setShowPromoCode] = useState(false);
  const { items, setIsOpen: setCartOpen } = useCart();
  const location = useLocation();
  const navigate = useNavigate();

  // Generate a dynamic code based on date
  const today = new Date();
  const dynamicCode = `FPAC${today.getDate()}${today.getMonth() + 1}`;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToCollections = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setMobileMenuOpen(false);

    if (location.pathname === '/') {
      const element = document.getElementById('collections');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      navigate('/');
      // Wait for navigation and then scroll
      setTimeout(() => {
        const element = document.getElementById('collections');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  const cartItemsCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <>
      <nav
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out border-b border-white/5 backdrop-blur-md',
          isScrolled
            ? 'bg-[#0a0a0f]/95 py-4'
            : 'bg-[#0a0a0f]/80 py-6'
        )}
      >
        <div className="max-w-7xl mx-auto px-10">
          <div className="flex justify-between items-center">
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/" className="text-xs font-semibold hover:text-[#eab308] transition-colors uppercase tracking-widest text-white">
                INÍCIO
              </Link>
              <div className="group relative">
                <button 
                  onClick={scrollToCollections}
                  className="text-xs font-semibold hover:text-[#eab308] transition-colors uppercase tracking-widest text-white flex items-center gap-1 cursor-pointer"
                >
                  PRODUTOS
                </button>
                <div className="absolute top-full mt-2 w-48 bg-[#0a0a0f] border border-white/10 rounded-none opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <Link to="/product/force" className="block px-4 py-3 text-[10px] text-white hover:bg-white/5 hover:text-[#eab308] uppercase tracking-widest">FORCE</Link>
                  <Link to="/product/mark" className="block px-4 py-3 text-[10px] text-white hover:bg-white/5 hover:text-[#eab308] uppercase tracking-widest">MARK</Link>
                  <Link to="/product/prime" className="block px-4 py-3 text-[10px] text-white hover:bg-white/5 hover:text-[#eab308] uppercase tracking-widest">PRIME</Link>
                </div>
              </div>
              <Link to="/estampas" className="text-xs font-semibold hover:text-[#eab308] transition-colors uppercase tracking-widest text-white">
                ESTAMPAS
              </Link>
            </div>

            {/* Mobile Toggle */}
            <div className="md:hidden relative w-5 h-5 flex-col justify-between cursor-pointer flex" onClick={() => setMobileMenuOpen(true)}>
                <span className="w-full h-0.5 bg-white"></span>
                <span className="w-full h-0.5 bg-[#eab308]"></span>
                <span className="w-2/3 h-0.5 bg-white"></span>
            </div>

            {/* Logo */}
            <Link to="/" className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
              <img 
                src="/logo.png" 
                alt="F PAC STORE" 
                className="h-12 md:h-16 w-auto object-contain"
                onError={(e) => {
                  // Fallback if image not found
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const fallback = document.createElement('div');
                    fallback.className = 'text-2xl font-heading font-black tracking-tighter uppercase text-[#eab308] flex items-center gap-2';
                    fallback.innerHTML = `
                      <span class="w-8 h-8 md:w-10 md:h-10 bg-white/20 rounded-full flex items-center justify-center text-xs text-white">LOGO</span>
                      <span class="hidden md:inline">F PAC <span class="text-white">STORE</span></span>
                    `;
                    parent.appendChild(fallback);
                  }
                }}
              />
            </Link>

            {/* Actions */}
            <div className="flex items-center space-x-6 z-10">
              <button 
                onClick={() => setShowPromoCode(!showPromoCode)}
                className="hidden md:block text-[10px] bg-white/5 border border-white/10 px-3 py-1 rounded-full text-white/80 hover:bg-[#eab308] hover:text-black hover:border-[#eab308] transition-colors"
              >
                {showPromoCode ? `CÓDIGO: ${dynamicCode}` : '5% OFF NO PIX'}
              </button>
              <button 
                className="relative text-white hover:text-[#eab308] transition-colors flex items-center gap-4"
                onClick={() => setCartOpen(true)}
              >
                <ShoppingBag size={20} />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-1.5 left-2.5 bg-[#eab308] text-black text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                    {cartItemsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed inset-0 z-[60] bg-[#ffffff] flex flex-col pt-6 px-6"
          >
            <div className="flex justify-between items-center mb-12">
              <h2 className="font-heading font-bold text-2xl">Menu</h2>
              <button onClick={() => setMobileMenuOpen(false)} className="bg-black/10 p-2 rounded-full hover:bg-black/20 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex flex-col gap-6 text-xl font-medium">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#eab308]">INÍCIO</Link>
              <div className="h-px bg-black/10 my-2" />
              <button 
                onClick={scrollToCollections}
                className="text-left text-sm text-gray-500 uppercase tracking-widest mb-2 hover:text-[#eab308]"
              >
                PRODUTOS
              </button>
              <Link to="/product/force" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#eab308]">FORCE</Link>
              <Link to="/product/mark" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#eab308]">MARK</Link>
              <Link to="/product/prime" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#eab308]">PRIME</Link>
              <div className="h-px bg-black/10 my-2" />
              <Link to="/estampas" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#eab308]">ESTAMPAS</Link>
            </div>
            
            <div className="mt-auto pb-12 flex gap-4">
               <a href="https://instagram.com/f_pac_store" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-gray-600 hover:opacity-80">
                 <div className="w-8 h-8 rounded-md flex items-center justify-center text-white" style={{ background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' }}>
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="18" height="18" fill="currentColor">
                     <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/>
                   </svg>
                 </div>
                 Instagram
               </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

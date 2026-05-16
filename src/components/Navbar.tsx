import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, Menu, X, Instagram, User, LogOut, LogIn, ChevronDown, ShieldCheck } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { Logo } from './Logo';
import { motion, AnimatePresence } from 'framer-motion';

import { useCart } from '../hooks/useCart';
import { getDailyPromoCode } from '../lib/promo';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dailyCode, setDailyCode] = useState(getDailyPromoCode());
  
  const { items, setCoupon } = useCart();
  const cartItemsCount = items.reduce((acc, item) => acc + item.quantity, 0);
  
  const { user, loginWithGoogle, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const authMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (authMenuRef.current && !authMenuRef.current.contains(event.target as Node)) {
        setAuthMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Atualizar o código caso o dia mude enquanto a página está aberta
    const interval = setInterval(() => {
      setDailyCode(getDailyPromoCode());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const scrollToTop = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    }
    setMobileMenuOpen(false);
  };

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
      setTimeout(() => {
        const element = document.getElementById('collections');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  const handlePromoClick = () => {
    const promoCode = dailyCode;
    navigator.clipboard.writeText(promoCode);
    setCoupon(promoCode);
    
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50">
        {/* Top Promo Bar */}
        <div 
          onClick={handlePromoClick}
          className={cn(
            "w-full bg-[#eab308] text-black transition-all duration-500 ease-in-out px-4 flex justify-center items-center cursor-pointer active:scale-95 z-[51]",
            isScrolled ? "py-1 shadow-md" : "py-1.5 md:py-2",
            copied ? "bg-white" : "animate-blink-accent-bar"
          )}
        >
          <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-center flex items-center gap-2">
            {copied ? (
              <>✅ CUPOM APLICADO COM SUCESSO! (-5%)</>
            ) : (
              <>
                🎁 CLIQUE E GANHE 5% OFF 🎁
                <span className={cn(
                  "bg-black text-white px-3 py-1 rounded ml-2 font-mono tracking-[0.2em] shadow-lg border border-white/20 transition-all duration-500",
                  isScrolled ? "text-[10px] md:text-xs" : "text-sm md:text-base"
                )}>
                  {dailyCode}
                </span>
              </>
            )}
          </span>
        </div>

        <nav
          className={cn(
            'relative w-full transition-all duration-500 ease-in-out border-b border-white/5 backdrop-blur-md z-40',
            isScrolled
              ? 'bg-[#0a0a0f]/95 py-1.5 md:py-2 shadow-2xl'
            : 'bg-[#0a0a0f]/80 py-3 md:py-4'
        )}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className={cn(
            "flex justify-between items-center relative transition-all duration-500",
            isScrolled ? "min-h-[40px]" : "min-h-[50px]"
          )}>
            
            {/* Left Section (Desktop Menu) */}
            <div className="hidden md:flex flex-1 items-center gap-6 lg:gap-10 justify-start">
              <button 
                onClick={scrollToTop}
                className="text-[11px] lg:text-xs font-bold hover:text-[#eab308] transition-colors uppercase tracking-[0.25em] text-white whitespace-nowrap cursor-pointer"
              >
                INÍCIO
              </button>
              <div className="group relative">
                <Link 
                  to="/catalog"
                  className="text-[11px] lg:text-xs font-bold hover:text-[#eab308] transition-colors uppercase tracking-[0.25em] text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  PRODUTOS
                </Link>
                <div className="absolute top-full left-0 mt-4 w-56 bg-[#0a0a0f] border border-white/10 rounded-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 py-2 shadow-2xl">
                  <Link to="/product/force" className="block px-6 py-3 text-[10px] text-white hover:bg-white/5 hover:text-[#eab308] uppercase tracking-[0.2em]">FORCE</Link>
                  <Link to="/product/mark" className="block px-6 py-3 text-[10px] text-white hover:bg-white/5 hover:text-[#eab308] uppercase tracking-[0.2em]">MARK</Link>
                  <Link to="/product/prime" className="block px-6 py-3 text-[10px] text-white hover:bg-white/5 hover:text-[#eab308] uppercase tracking-[0.2em]">PRIME</Link>
                </div>
              </div>
              <Link to="/estampas" className="text-[11px] lg:text-xs font-bold hover:text-[#eab308] transition-colors uppercase tracking-[0.25em] text-white whitespace-nowrap">
                ESTAMPAS
              </Link>
            </div>

            {/* Mobile Toggle - Left on mobile */}
            <div className="md:hidden flex items-center">
              <div className="relative w-5 h-5 flex-col justify-between cursor-pointer flex" onClick={() => setMobileMenuOpen(true)}>
                  <span className="w-full h-0.5 bg-white"></span>
                  <span className="w-full h-0.5 bg-[#eab308]"></span>
                  <span className="w-2/3 h-0.5 bg-white"></span>
              </div>
            </div>

            {/* Centered Logo - Absolute centered on desktop */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-30 pointer-events-auto">
              <button onClick={scrollToTop} className="shrink-0 block">
                <Logo className={cn(
                  "transition-all duration-500 ease-in-out drop-shadow-[0_0_15px_rgba(0,0,0,0.3)]",
                  isScrolled ? "h-12 md:h-14" : "h-16 md:h-20 lg:h-24"
                )} />
              </button>
            </div>

              {/* Right Section (Right Menu + Actions) */}
              <div className="flex-1 flex items-center justify-end gap-6 md:gap-8 lg:gap-10">
                {/* Desktop Right Menu links */}
                <div className="hidden md:flex items-center gap-6 lg:gap-10">
                  <Link to="/tracking" className="text-[11px] lg:text-xs font-bold hover:text-[#eab308] transition-colors uppercase tracking-[0.25em] text-white whitespace-nowrap">
                    ACOMPANHAR PEDIDO
                  </Link>
                  {(user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br') && (
                    <Link to="/gestao" className="text-[10px] lg:text-xs font-black text-[#eab308] hover:text-white transition-colors uppercase tracking-[0.2em] whitespace-nowrap bg-white/5 px-4 py-2 rounded border border-white/5">
                      GESTÃO
                    </Link>
                  )}
                </div>

                {/* Always visible icons (User + Cart) */}
                <div className="flex items-center gap-5 md:gap-7 z-20">
                  <div className="relative" ref={authMenuRef}>
                    <button 
                      onClick={() => setAuthMenuOpen(!authMenuOpen)}
                      className="relative text-[#eab308] hover:text-white transition-all duration-300 flex items-center gap-1 group"
                      title={user ? "Minha Conta" : "Entrar / Cadastrar"}
                    >
                      <User size={isScrolled ? 18 : 24} className="transition-all duration-500 group-hover:scale-110" />
                      {user && <ChevronDown size={14} className={cn("transition-transform duration-300 text-white", authMenuOpen && "rotate-180")} />}
                    </button>

                    
                    <AnimatePresence>
                      {authMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute right-0 mt-3 w-56 bg-[#0a0a0f] border border-white/10 shadow-2xl py-2 z-[60]"
                        >
                          {user ? (
                            <>
                              <div className="px-4 py-3 border-b border-white/5">
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Olá,</p>
                                <p className="text-xs font-bold text-white truncate">{user.displayName || user.email}</p>
                              </div>
                              <Link 
                                to="/account" 
                                onClick={() => setAuthMenuOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 text-[10px] text-white hover:bg-white/5 hover:text-[#eab308] uppercase tracking-widest transition-colors"
                              >
                                <User size={14} /> Minha Conta
                              </Link>
                              
                              {(user.email === 'fpacstore@gmail.com' || user.email === 'atendimento@fpacstore.com.br') && (
                                <Link 
                                  to="/gestao" 
                                  onClick={() => setAuthMenuOpen(false)}
                                  className="flex items-center gap-3 px-4 py-3 text-[10px] text-[#eab308] hover:bg-white/5 uppercase tracking-widest transition-colors"
                                >
                                  <ShieldCheck size={14} /> Painel Gestão
                                </Link>
                              )}

                              <button 
                                onClick={() => {
                                  logout();
                                  setAuthMenuOpen(false);
                                  navigate('/');
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-[10px] text-red-500 hover:bg-red-500/10 uppercase tracking-widest transition-colors"
                              >
                                <LogOut size={14} /> Sair da Conta
                              </button>
                            </>
                          ) : (
                            <div className="p-4 space-y-4">
                              <p className="text-[10px] text-gray-400 uppercase tracking-widest text-center leading-relaxed">
                                Acesse sua conta para gerenciar pedidos e dados de entrega.
                              </p>
                              <Link 
                                to="/account"
                                onClick={() => setAuthMenuOpen(false)}
                                className="w-full bg-[#eab308] text-black font-black py-3 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white transition-colors"
                              >
                                <User size={14} /> Entrar / Cadastrar
                              </Link>
                              
                              <button 
                                onClick={() => {
                                  loginWithGoogle();
                                  setAuthMenuOpen(false);
                                }}
                                className="w-full bg-white border border-black text-black font-black py-3 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black hover:text-[#eab308] transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                Google
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <Link 
                    to="/bag"
                    className="relative text-[#eab308] hover:text-white transition-colors flex items-center"
                  >
                    <ShoppingBag size={isScrolled ? 18 : 22} className="transition-all duration-500" />
                    {cartItemsCount > 0 && (
                      <span className={cn(
                        "absolute -top-2 -right-2 bg-[#eab308] text-black font-bold flex items-center justify-center rounded-full transition-all duration-500",
                        isScrolled ? "h-4 w-4 text-[8px]" : "h-5 w-5 text-[10px]"
                      )}>
                        {cartItemsCount}
                      </span>
                    )}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </div>

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
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-heading font-bold text-xl">Menu</h2>
              <button onClick={() => setMobileMenuOpen(false)} className="bg-black/10 p-1.5 rounded-full hover:bg-black/20 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex flex-col gap-3.5 text-base font-medium">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#eab308] py-0.5">INÍCIO</Link>
              <div className="h-px bg-black/5" />
              <Link to="/account" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#eab308] py-0.5">MINHA CONTA</Link>
              <div className="h-px bg-black/5" />
              
              <div className="flex flex-col gap-2.5">
                <Link 
                  to="/catalog"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-left text-[10px] text-gray-400 font-black uppercase tracking-widest hover:text-[#eab308]"
                >
                  PRODUTOS
                </Link>
                <div className="grid grid-cols-3 gap-2">
                  <Link to="/product/force" onClick={() => setMobileMenuOpen(false)} className="bg-black/5 py-3 text-center text-xs font-bold hover:bg-[#eab308] hover:text-black transition-colors rounded-none">FORCE</Link>
                  <Link to="/product/mark" onClick={() => setMobileMenuOpen(false)} className="bg-black/5 py-3 text-center text-xs font-bold hover:bg-[#eab308] hover:text-black transition-colors rounded-none">MARK</Link>
                  <Link to="/product/prime" onClick={() => setMobileMenuOpen(false)} className="bg-black/5 py-3 text-center text-xs font-bold hover:bg-[#eab308] hover:text-black transition-colors rounded-none">PRIME</Link>
                </div>
              </div>

              <div className="h-px bg-black/5" />
              <Link to="/estampas" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#eab308] py-0.5">CATÁLOGO DE ESTAMPAS</Link>
              <div className="h-px bg-black/5" />
              <Link to="/tracking" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#eab308] py-0.5">ACOMPANHAR PEDIDO</Link>
              
              {(user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br') && (
                <>
                  <div className="h-px bg-black/5" />
                  <Link 
                    to="/gestao" 
                    onClick={() => setMobileMenuOpen(false)} 
                    className="flex items-center gap-3 text-[#eab308] py-2 group hover:opacity-80 transition-all font-black uppercase tracking-widest text-[11px]"
                  >
                    <ShieldCheck size={18} />
                    PAINEL GESTÃO
                  </Link>
                </>
              )}
            </div>
            
            <div className="mt-auto pb-8 flex flex-col gap-5">
               <div className="h-px bg-black/5 w-full mb-2" />
               <a href="https://instagram.com/f_pac_store" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm font-black uppercase tracking-widest text-[#d6249f] hover:opacity-80">
                 <div className="w-8 h-8 rounded-md flex items-center justify-center text-white" style={{ background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' }}>
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="18" height="18" fill="currentColor">
                     <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7-42.6-42.6-29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/>
                   </svg>
                 </div>
                 Instagram
               </a>
               <a href="https://wa.me/5547997465602" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm font-black uppercase tracking-widest text-[#25D366] hover:opacity-80">
                 <div className="w-8 h-8 rounded-md flex items-center justify-center text-white bg-[#25D366]">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.067 2.877 1.215 3.076.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                 </div>
                 WhatsApp
               </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, X, Instagram, User, LogOut, ChevronDown, ShieldCheck, Truck, Search, Loader2, Sparkles, House, LayoutGrid, Palette, PackageSearch, Headphones, UsersRound, WandSparkles, MessageCircle, MoreHorizontal } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { cn, getProductUrl, getDisplayPrices } from '../lib/utils';
import { Logo } from './Logo';
import { motion, AnimatePresence } from 'framer-motion';

import { useCart } from '../hooks/useCart';
import { getDailyPromoCode } from '../lib/promo';
import { getActivePromotion } from '../services/promotions/getActivePromotion';
import { WeeklyPromotion } from '../types/promotions';

import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { products as staticProducts } from '../data/products';
import { buildSellableCatalog } from '../lib/catalogProducts';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dailyCode, setDailyCode] = useState(getDailyPromoCode());
  const [activePromo, setActivePromo] = useState<WeeklyPromotion | null>(null);
  
  const { items, setCoupon } = useCart();
  const cartItemsCount = items.reduce((acc, item) => acc + item.quantity, 0);
  
  const { user, loginWithGoogle, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const authMenuRef = useRef<HTMLDivElement>(null);

  // Search real-time states
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutsideSearch = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideSearch);
    return () => document.removeEventListener('mousedown', handleClickOutsideSearch);
  }, []);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isSearchOpen]);

  useEffect(() => {
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllProducts(buildSellableCatalog(staticProducts, dynamicData));
    });

    return () => unsubscribe();
  }, []);

  const filteredProducts = searchQuery.trim() === '' ? [] : allProducts.filter(product => {
    const query = searchQuery.toLowerCase();
    const nameMatch = (product.name || '').toLowerCase().includes(query);
    const headlineMatch = (product.headline || '').toLowerCase().includes(query);
    const categoryMatch = `${product.collection || ''} ${product.category || ''} ${product.productType || ''} ${product.baseModel || ''}`.toLowerCase().includes(query);
    const descMatch = (product.description || '').toLowerCase().includes(query);
    return nameMatch || headlineMatch || categoryMatch || descMatch;
  });

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

  useEffect(() => {
    getActivePromotion().then((promo) => {
      setActivePromo(promo);
    });
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
    if (activePromo && activePromo.active) {
      if (activePromo.discount_type === 'cupom' && activePromo.coupon_code) {
        navigator.clipboard.writeText(activePromo.coupon_code.toUpperCase());
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
      navigate('/catalog?promo=active');
      return;
    }
    const promoCode = dailyCode;
    navigator.clipboard.writeText(promoCode);
    
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const isCampaignActive = activePromo && activePromo.active;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50">
        {/* Top Promo Bar - Continuous Ticker */}
        <div 
          onClick={handlePromoClick}
          className={cn(
            "w-full bg-[#eab308] text-black transition-all duration-500 ease-in-out flex items-center select-none active:scale-[0.98] z-[51] relative overflow-hidden group/ticker",
            "cursor-pointer",
            isScrolled ? "h-8 md:h-10 shadow-md" : "h-10 md:h-12",
            copied ? "bg-white" : "animate-blink-accent-bar"
          )}
        >
          {/* Fade Edges - Essential for Premium look */}
          <div className="absolute inset-y-0 left-0 w-8 md:w-32 bg-gradient-to-r from-[#eab308] via-[#eab308]/80 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-8 md:w-32 bg-gradient-to-l from-[#eab308] via-[#eab308]/80 to-transparent z-10 pointer-events-none" />

          {copied ? (
            <div className="w-full flex justify-center items-center font-black uppercase text-[10px] md:text-xs tracking-widest animate-pulse">
              {isCampaignActive && activePromo.coupon_code
                ? `✅ CUPOM ${activePromo.coupon_code.toUpperCase()} COPIADO! DIGITE-O NA SACOLA.`
                : '✅ CUPOM COPIADO! DIGITE-O NA SACOLA PARA OBTER 5% OFF.'}
            </div>
          ) : (
            <div className="flex whitespace-nowrap items-center hover:[animation-play-state:paused] pointer-events-none md:pointer-events-auto">
              <div className="flex items-center animate-marquee">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center shrink-0">
                    {isCampaignActive ? (
                      <div className="flex items-center gap-12 md:gap-32 px-6 md:px-16">
                        <div className="flex items-center gap-2">
                          <span className="text-sm md:text-base">🔥</span>
                          <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] text-black/80">Campanha Ativa:</span>
                          <span className="bg-black text-[#eab308] px-2 py-0.5 rounded font-mono text-[9px] md:text-xs font-black shadow-xl border border-white/10 uppercase tracking-wider">{activePromo.title}</span>
                        </div>
                        {activePromo.description && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm md:text-base">✨</span>
                            <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.15em] text-black/90">{activePromo.description}</span>
                          </div>
                        )}
                        {activePromo.discount_type === 'cupom' && activePromo.coupon_code && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm md:text-base">🎁</span>
                            <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] text-black/80">Copiar Cupom:</span>
                            <span className="bg-black text-white px-2 py-0.5 rounded font-mono text-[10px] md:text-sm font-bold shadow-xl border border-white/10">{activePromo.coupon_code}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-12 md:gap-32 px-6 md:px-16">
                        <div className="flex items-center gap-2">
                          <span className="text-sm md:text-base">🎁</span>
                          <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em]">GANHE 5% OFF:</span>
                          <span className="bg-black text-white px-2 py-0.5 rounded font-mono text-[10px] md:text-sm shadow-xl border border-white/10">{dailyCode}</span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <Truck size={14} className="md:w-5 md:h-5" />
                          <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em]">FRETE GRÁTIS ACIMA DE 2 PEÇAS</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm md:text-base">💳</span>
                          <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em]">5% OFF NO PIX</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
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
          {/* DESKTOP HEADER (12-COL GRID: LEFT 5, CENTER LOGO 2, RIGHT 5) */}
          <div className="hidden md:grid grid-cols-12 items-center w-full min-h-[50px] relative">
            
            {/* LEFT ZONE (5 COLS) - Primary shopping navigation */}
            <div className="col-span-5 flex items-center gap-4 lg:gap-7 justify-start">
              <button 
                onClick={scrollToTop}
                className="text-[11px] lg:text-xs font-bold hover:text-[#eab308] transition-colors uppercase tracking-[0.18em] text-white whitespace-nowrap cursor-pointer"
              >
                INÍCIO
              </button>

              {/* PRODUTOS DROPDOWN DRAWER */}
              <div className="group relative">
                <Link 
                  to="/produtos"
                  className="text-[11px] lg:text-xs font-bold hover:text-[#eab308] transition-colors uppercase tracking-[0.18em] text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  PRODUTOS
                  <ChevronDown size={12} className="text-gray-400 group-hover:text-[#eab308] transition-transform group-hover:rotate-180" />
                </Link>
                
                {/* GAVETA DE PRODUTOS */}
                <div className="absolute top-full left-0 mt-3 w-64 bg-[#0a0a0f]/95 backdrop-blur-2xl border border-white/10 rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-300 z-50 p-2 shadow-2xl">
                  <Link to="/produtos" className="block px-4 py-2.5 text-[10px] font-bold text-gray-300 hover:bg-white/10 hover:text-white rounded-xl uppercase tracking-widest transition-all">
                    TODOS OS PRODUTOS
                  </Link>
                  <div className="h-px bg-white/10 my-1 mx-2" />
                  <Link to="/catalog/all?line=force" className="block px-4 py-2.5 text-[10px] font-bold text-white hover:bg-white/10 hover:text-[#eab308] rounded-xl uppercase tracking-widest flex items-center justify-between transition-all">
                    <span>LINHA FORCE</span>
                    <span className="text-[9px] font-mono text-gray-400 font-normal">Estampa pequena</span>
                  </Link>
                  <Link to="/catalog/all?line=mark" className="block px-4 py-2.5 text-[10px] font-bold text-white hover:bg-white/10 hover:text-[#eab308] rounded-xl uppercase tracking-widest flex items-center justify-between transition-all">
                    <span>LINHA MARK</span>
                    <span className="text-[9px] font-mono text-gray-400 font-normal">Estampa grande</span>
                  </Link>
                  <Link to="/catalog/all?line=prime" className="block px-4 py-2.5 text-[10px] font-bold text-white hover:bg-white/10 hover:text-[#eab308] rounded-xl uppercase tracking-widest flex items-center justify-between transition-all">
                    <span>LINHA PRIME</span>
                    <span className="text-[9px] font-mono text-gray-400 font-normal">Personalizável</span>
                  </Link>
                  <div className="h-px bg-white/10 my-1 mx-2" />
                  <Link to="/prime" className="block px-4 py-2.5 text-[10px] font-black text-[#eab308] bg-[#eab308]/10 hover:bg-[#eab308] hover:text-black rounded-xl uppercase tracking-widest flex items-center justify-between transition-all group/prime">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-[#eab308] group-hover/prime:text-black animate-pulse" />
                      PRIME CUSTOM
                    </span>
                    <span className="text-[8px] font-mono bg-[#eab308] text-black px-1.5 py-0.5 rounded font-black group-hover/prime:bg-black group-hover/prime:text-[#eab308]">
                      MONTAR
                    </span>
                  </Link>
                </div>
              </div>

              <Link to="/estampas" className="text-[11px] lg:text-xs font-bold hover:text-[#eab308] transition-colors uppercase tracking-[0.18em] text-white whitespace-nowrap">
                ESTAMPAS
              </Link>

              <Link to="/catalog/all?line=prime" className="text-[11px] lg:text-xs font-black text-[#eab308] hover:text-white transition-colors uppercase tracking-[0.18em] whitespace-nowrap flex items-center gap-1.5">
                <Sparkles size={13} aria-hidden="true" />
                PRIME
              </Link>
            </div>

            {/* CENTER ZONE (2 COLS) - Centered Brand Logo */}
            <div className="col-span-2 flex items-center justify-center">
              <button onClick={scrollToTop} className="shrink-0 block group py-1">
                <Logo className={cn(
                  "transition-all duration-500 ease-in-out drop-shadow-[0_0_15px_rgba(0,0,0,0.4)] group-hover:scale-105",
                  isScrolled ? "h-9 md:h-11" : "h-11 md:h-14 lg:h-16"
                )} />
              </button>
            </div>

            {/* RIGHT ZONE (5 COLS) - Secondary navigation and shopping actions */}
            <div className="col-span-5 flex items-center justify-end gap-3 lg:gap-5">
              <div className="group relative">
                <button
                  type="button"
                  className="text-[11px] lg:text-xs font-bold hover:text-[#eab308] transition-colors uppercase tracking-[0.18em] text-white whitespace-nowrap flex items-center gap-1.5 bg-transparent border-0 cursor-pointer"
                  aria-label="Abrir mais opções"
                  aria-haspopup="menu"
                >
                  <MoreHorizontal size={15} aria-hidden="true" />
                  MAIS
                  <ChevronDown size={12} className="text-gray-400 group-hover:text-[#eab308] transition-transform group-hover:rotate-180" aria-hidden="true" />
                </button>

                <div role="menu" className="absolute top-full right-0 mt-3 w-64 bg-[#0a0a0f]/95 backdrop-blur-2xl border border-white/10 rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-300 z-50 p-2 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event('fpac_open_quiz'))}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-bold text-white hover:bg-white/10 hover:text-[#eab308] rounded-xl uppercase tracking-widest transition-all bg-transparent border-0 cursor-pointer"
                  >
                    <WandSparkles size={15} aria-hidden="true" /> Identidade
                  </button>
                  <Link to="/clube" className="flex items-center gap-3 px-4 py-3 text-[10px] font-bold text-white hover:bg-white/10 hover:text-[#eab308] rounded-xl uppercase tracking-widest transition-all">
                    <UsersRound size={15} aria-hidden="true" /> Clube F PAC
                  </Link>
                  <Link to="/radio" className="flex items-center gap-3 px-4 py-3 text-[10px] font-bold text-white hover:bg-white/10 hover:text-[#eab308] rounded-xl uppercase tracking-widest transition-all">
                    <Headphones size={15} aria-hidden="true" /> Rádio F PAC
                  </Link>
                  <Link to="/tracking" className="flex items-center gap-3 px-4 py-3 text-[10px] font-bold text-white hover:bg-white/10 hover:text-[#eab308] rounded-xl uppercase tracking-widest transition-all">
                    <PackageSearch size={15} aria-hidden="true" /> Acompanhar pedido
                  </Link>
                </div>
              </div>

              {(user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br' || (import.meta.env.DEV && localStorage.getItem('admin_bypass') === 'true')) && (
                <Link to="/gestao" className="text-[10px] lg:text-xs font-black text-[#eab308] hover:text-white transition-colors uppercase tracking-[0.15em] whitespace-nowrap bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-[#eab308]">
                  GESTÃO
                </Link>
              )}

              {/* Action Icons (Search + Account + Bag) */}
              <div className="flex items-center gap-4 lg:gap-5 pl-2 border-l border-white/10">
                {/* Search Trigger */}
                <button 
                  onClick={() => {
                    setIsSearchOpen(!isSearchOpen);
                    setAuthMenuOpen(false);
                    setMobileMenuOpen(false);
                  }}
                  className="relative text-[#eab308] hover:text-white transition-all duration-300 flex items-center group cursor-pointer bg-transparent border-0 focus:outline-none"
                  aria-label="Pesquisar produtos"
                  title="Pesquisar produtos"
                >
                  <Search size={18} className="transition-all duration-300 group-hover:scale-110 text-[#eab308]" />
                </button>

                {/* Account Dropdown */}
                <div className="relative" ref={authMenuRef}>
                  <button 
                    onClick={() => setAuthMenuOpen(!authMenuOpen)}
                    className="relative text-[#eab308] hover:text-white transition-all duration-300 flex items-center gap-1 group cursor-pointer bg-transparent border-0"
                    title={user ? "Minha Conta" : "Entrar / Cadastrar"}
                  >
                    <User size={18} className="transition-all duration-300 group-hover:scale-110" />
                    {user && <ChevronDown size={12} className={cn("transition-transform duration-300 text-white", authMenuOpen && "rotate-180")} />}
                  </button>

                  <AnimatePresence>
                    {authMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-3 w-56 bg-[#0a0a0f] border border-white/10 shadow-2xl py-2 z-[60] rounded-xl"
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
                              className="w-full flex items-center gap-3 px-4 py-3 text-[10px] text-red-500 hover:bg-red-500/10 uppercase tracking-widest transition-colors cursor-pointer border-0 bg-transparent text-left"
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
                              className="w-full bg-[#eab308] text-black font-black py-3 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white transition-colors rounded-lg"
                            >
                              <User size={14} /> Entrar / Cadastrar
                            </Link>
                            
                            <button 
                              onClick={() => {
                                loginWithGoogle();
                                setAuthMenuOpen(false);
                              }}
                              className="w-full bg-white border border-black text-black font-black py-3 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black hover:text-[#eab308] transition-colors rounded-lg cursor-pointer"
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

                {/* Shopping Bag Trigger */}
                <Link 
                  to="/bag"
                  className="relative text-[#eab308] hover:text-white transition-colors flex items-center"
                >
                  <ShoppingBag size={18} className="transition-all duration-300" />
                  {cartItemsCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-[#eab308] text-black font-bold h-4 w-4 text-[8px] flex items-center justify-center rounded-full">
                      {cartItemsCount}
                    </span>
                  )}
                </Link>
              </div>
            </div>

          </div>

          {/* MOBILE HEADER (MOBILE ONLY) */}
          <div className="flex md:hidden justify-between items-center relative min-h-[44px]">
            {/* Mobile Hamburger Toggle */}
            <button 
              id="navbar-mobile-toggle"
              aria-label="Abrir menu"
              onClick={() => setMobileMenuOpen(true)}
              className="w-10 h-10 flex items-center justify-center cursor-pointer bg-transparent border-0 focus:outline-none"
            >
              <div className="w-5 h-4 flex flex-col justify-between">
                <span className="w-full h-0.5 bg-white"></span>
                <span className="w-full h-0.5 bg-[#eab308]"></span>
                <span className="w-2/3 h-0.5 bg-white"></span>
              </div>
            </button>

            {/* Centered Mobile Logo */}
            <button onClick={scrollToTop} className="shrink-0 block">
              <Logo className="h-10 transition-all duration-300" />
            </button>

            {/* Mobile Right Action Icons */}
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="p-1 text-[#eab308] bg-transparent border-0 cursor-pointer"
                aria-label="Pesquisar"
              >
                <Search size={20} />
              </button>
              <Link to="/bag" className="relative p-1 text-[#eab308]" aria-label="Sacola">
                <ShoppingBag size={20} />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#eab308] text-black font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                    {cartItemsCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
          </div>
        </nav>

        {/* Real-time Search Drawer */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              ref={searchRef}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="w-full bg-[#0a0a0f]/98 border-b border-white/10 shadow-2xl overflow-hidden backdrop-blur-lg"
            >
              <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 flex flex-col gap-5">
                {/* Search input field */}
                <div className="relative flex items-center">
                  <Search className="absolute left-4 text-[#eab308]" size={18} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="PESQUISAR PRODUTOS (EX: FORCE, MARK, PRIME, OVERSIZED, EXCLUSIVA...)"
                    className="w-full bg-white/5 text-xs font-bold uppercase tracking-[0.2em] text-white pl-12 pr-12 py-3.5 border border-white/15 focus:outline-none focus:border-[#eab308] focus:bg-white/10 transition-all rounded-none placeholder-gray-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-4 p-1 hover:text-[#eab308] text-white transition-colors cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Quick suggestions when query is empty */}
                {searchQuery.trim() === '' ? (
                  <div className="space-y-2.5">
                    <p className="text-[9px] font-black uppercase text-gray-500 tracking-[0.25em]">Estilo / Sugestões rápidas:</p>
                    <div className="flex flex-wrap gap-2">
                      {['FORCE', 'MARK', 'PRIME', 'OVERSIZED', 'EXCLUSIVA'].map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setSearchQuery(tag)}
                          className="px-3 py-1.5 bg-white/5 hover:bg-[#eab308] hover:text-black hover:border-[#eab308] text-[9.5px] font-black uppercase tracking-wider text-white border border-white/5 transition-all duration-300"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Search results list */
                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <p className="text-[9px] font-black uppercase text-[#eab308] tracking-[0.2em]">
                        Resultados Encontrados ({filteredProducts.length})
                      </p>
                      <button 
                        onClick={() => {
                          setIsSearchOpen(false);
                        }}
                        className="text-[9px] font-black uppercase text-gray-400 hover:text-white tracking-wider cursor-pointer"
                      >
                        Fechar
                      </button>
                    </div>

                    {filteredProducts.length === 0 ? (
                      <div className="py-8 text-center space-y-2">
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                          Nenhum produto correspondente a "{searchQuery}"
                        </p>
                        <p className="text-[10px] text-gray-400">
                          Tente de novo com FORCE, MARK, PRIME ou outras palavras-chave.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {filteredProducts.map((p) => {
                          const productImg = p.images?.[0] || '/estampas/logo-fpac.png';
                          return (
                            <Link
                              key={p.id || p.slug}
                              to={getProductUrl(p)}
                              onClick={() => {
                                setIsSearchOpen(false);
                                setSearchQuery('');
                              }}
                              className="flex items-center gap-3.5 p-2 border border-white/5 hover:border-[#eab308] bg-white/0 hover:bg-white/5 transition-all duration-300 group"
                            >
                              <div className="w-14 h-14 bg-neutral-900 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center relative">
                                <img
                                  src={productImg}
                                  alt="Produto"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    e.currentTarget.src = '/estampas/logo-fpac.png';
                                  }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-1">
                                  <h3 className="text-[10px] md:text-xs font-black uppercase tracking-wider text-white group-hover:text-[#eab308] transition-colors truncate">
                                    {p.headline || p.category || p.collection || 'PRODUTO F PAC'}
                                  </h3>
                                  {(() => {
                                    const pPrices = getDisplayPrices(p);
                                    return (
                                      <div className="flex items-baseline gap-1.5 shrink-0">
                                        {pPrices.hasDiscount && (
                                          <span className="font-mono text-[9px] text-gray-500 line-through">
                                            R$ {pPrices.originalPrice.toFixed(2).replace('.', ',')}
                                          </span>
                                        )}
                                        <span className="font-mono text-[10px] md:text-xs font-bold text-[#eab308]">
                                          R$ {pPrices.effectivePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                                <p className="text-[9px] md:text-[10px] text-gray-400 truncate mt-0.5">
                                  {p.headline || p.description}
                                </p>
                                {p.parentSlug && (
                                  <span className="inline-block bg-white/5 text-gray-400 text-[8px] font-mono font-black uppercase px-1.5 py-0.5 rounded mt-1.5">
                                    Linha {p.parentSlug.toUpperCase()}
                                  </span>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
              <button onClick={() => setMobileMenuOpen(false)} className="bg-black/5 p-2 rounded-full hover:bg-black/10 transition-colors" aria-label="Fechar menu">
                <X size={20} />
              </button>
            </div>
            
            <div className="min-h-0 flex-1 flex flex-col gap-5 text-sm overflow-y-auto pb-4">
              <section aria-labelledby="mobile-shop-heading">
                <p id="mobile-shop-heading" className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-black/40">Comprar</p>
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/produtos" onClick={() => setMobileMenuOpen(false)} className="col-span-2 flex min-h-12 items-center gap-3 rounded-xl border border-black/10 bg-black px-4 py-3 font-black uppercase tracking-wider text-white transition-colors hover:bg-[#eab308] hover:text-black">
                    <LayoutGrid size={18} aria-hidden="true" /> Todos os produtos
                  </Link>
                  <Link to="/catalog/all?line=force" onClick={() => setMobileMenuOpen(false)} className="flex min-h-12 items-center justify-center rounded-xl border border-black/10 bg-[#f6f6f6] px-3 py-3 font-black uppercase tracking-wider text-black transition-colors hover:border-[#eab308]">FORCE</Link>
                  <Link to="/catalog/all?line=mark" onClick={() => setMobileMenuOpen(false)} className="flex min-h-12 items-center justify-center rounded-xl border border-black/10 bg-[#f6f6f6] px-3 py-3 font-black uppercase tracking-wider text-black transition-colors hover:border-[#eab308]">MARK</Link>
                  <Link to="/catalog/all?line=prime" onClick={() => setMobileMenuOpen(false)} className="col-span-2 flex min-h-12 items-center justify-center rounded-xl border border-black/10 bg-[#f6f6f6] px-3 py-3 font-black uppercase tracking-wider text-black transition-colors hover:border-[#eab308]">PRIME</Link>
                  <Link to="/prime" onClick={() => setMobileMenuOpen(false)} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#eab308] bg-[#eab308] px-4 py-3 font-black uppercase tracking-wider text-black transition-colors hover:bg-black hover:text-white">
                    <Sparkles size={17} aria-hidden="true" /> Personalizar PRIME
                  </Link>
                  <Link to="/estampas" onClick={() => setMobileMenuOpen(false)} className="col-span-2 flex min-h-12 items-center gap-3 rounded-xl border border-black/10 px-4 py-3 font-black uppercase tracking-wider text-black transition-colors hover:border-[#eab308]">
                    <Palette size={18} aria-hidden="true" /> Catálogo de estampas
                  </Link>
                </div>
              </section>

              <section aria-labelledby="mobile-account-heading">
                <p id="mobile-account-heading" className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-black/40">Conta e pedidos</p>
                <div className="overflow-hidden rounded-xl border border-black/10 divide-y divide-black/10">
                  <Link to="/" onClick={(event) => scrollToTop(event)} className="flex min-h-12 items-center gap-3 px-4 py-3 font-bold text-black transition-colors hover:bg-black/5 hover:text-[#9a7100]">
                    <House size={18} aria-hidden="true" /> Início
                  </Link>
                  <Link to="/account" onClick={() => setMobileMenuOpen(false)} className="flex min-h-12 items-center gap-3 px-4 py-3 font-bold text-black transition-colors hover:bg-black/5 hover:text-[#9a7100]">
                    <User size={18} aria-hidden="true" /> Minha conta
                  </Link>
                  <Link to="/tracking" onClick={() => setMobileMenuOpen(false)} className="flex min-h-12 items-center gap-3 px-4 py-3 font-bold text-black transition-colors hover:bg-black/5 hover:text-[#9a7100]">
                    <PackageSearch size={18} aria-hidden="true" /> Acompanhar pedido
                  </Link>
                </div>
              </section>

              <section aria-labelledby="mobile-brand-heading">
                <p id="mobile-brand-heading" className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-black/40">Universo F PAC</p>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => { setMobileMenuOpen(false); window.dispatchEvent(new Event('fpac_open_quiz')); }} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-black/10 bg-transparent px-2 py-3 text-[10px] font-black uppercase tracking-wide text-black transition-colors hover:border-[#eab308]">
                    <WandSparkles size={19} aria-hidden="true" /> Identidade
                  </button>
                  <Link to="/clube" onClick={() => setMobileMenuOpen(false)} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-black/10 px-2 py-3 text-center text-[10px] font-black uppercase tracking-wide text-black transition-colors hover:border-[#eab308]">
                    <UsersRound size={19} aria-hidden="true" /> Clube
                  </Link>
                  <Link to="/radio" onClick={() => setMobileMenuOpen(false)} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-black/10 px-2 py-3 text-center text-[10px] font-black uppercase tracking-wide text-black transition-colors hover:border-[#eab308]">
                    <Headphones size={19} aria-hidden="true" /> Rádio
                  </Link>
                </div>
              </section>
              
              {(user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br' || (import.meta.env.DEV && localStorage.getItem('admin_bypass') === 'true')) && (
                <>
                  <Link 
                    id="nav-mobile-gestao"
                    to="/gestao" 
                    onClick={() => setMobileMenuOpen(false)} 
                    className="flex items-center gap-3 text-[#eab308] py-3.5 group hover:opacity-80 transition-all font-black uppercase tracking-widest text-[11px]"
                  >
                    <ShieldCheck size={18} />
                    PAINEL GESTÃO
                  </Link>
                </>
              )}
            </div>
            
            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-black/10 py-5">
               <a href="https://instagram.com/f_pac_store" target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/10 text-xs font-black uppercase tracking-wider text-black transition-colors hover:border-[#eab308]">
                 <Instagram size={18} aria-hidden="true" /> Instagram
               </a>
               <a href="https://wa.me/5547997465602" target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/10 text-xs font-black uppercase tracking-wider text-black transition-colors hover:border-[#eab308]">
                 <MessageCircle size={18} aria-hidden="true" /> WhatsApp
               </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

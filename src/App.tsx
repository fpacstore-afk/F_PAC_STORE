import React, { Suspense, lazy, Component, ErrorInfo, ReactNode, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Toaster } from 'react-hot-toast';
import SuccessPage from './pages/SuccessPage';
import ScrollToTop from './components/ScrollToTop';
import { Loader2, AlertTriangle } from 'lucide-react';
import { HelmetProvider } from 'react-helmet-async';
import { cn } from './lib/utils';

import { FlashSaleBadge } from './components/FlashSaleBadge';
import { StyleRecommendationBanner } from './components/StyleQuiz';
import { SimpleStyleQuiz } from './components/SimpleStyleQuiz';

import { Logo } from './components/Logo';
import ModelStamps from './pages/ModelStamps';
import HomeV2 from './pages/HomeV2';

interface ErrorBoundaryProps { children: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public props: ErrorBoundaryProps;
  public state: ErrorBoundaryState = { hasError: false };
  constructor(props: ErrorBoundaryProps) { super(props); this.props = props; }
  static getDerivedStateFromError(_: Error) { return { hasError: true }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error("Uncaught error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
          <AlertTriangle size={48} className="text-red-500 mb-4" />
          <h1 className="text-2xl font-black uppercase mb-2">Ops! Algo deu errado.</h1>
          <p className="text-gray-500 mb-6">Tente recarregar a página ou voltar mais tarde.</p>
          <button onClick={() => window.location.reload()} className="bg-black text-white px-8 py-3 font-bold uppercase hover:bg-[#eab308] hover:text-black transition-all">Recarregar Página</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function lazyWithRetry(importFunc: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(window.sessionStorage.getItem('page_has_been_force_refreshed') || 'false');
    try { return await importFunc(); }
    catch (error: any) {
      console.warn('Lazy loading error, attempting fallback/refresh:', error);
      if (!pageHasAlreadyBeenForceRefreshed) {
        window.sessionStorage.setItem('page_has_been_force_refreshed', 'true');
        window.location.reload();
        return new Promise<{ default: React.ComponentType<any> }>(() => {});
      }
      throw error;
    }
  });
}

const Catalog = lazyWithRetry(() => import('./pages/Catalog'));
const ProductDetail = lazyWithRetry(() => import('./pages/ProductDetail'));
const Checkout = lazyWithRetry(() => import('./pages/Checkout'));
const Bag = lazyWithRetry(() => import('./pages/Bag'));
const AdminOrders = lazyWithRetry(() => import('./pages/AdminOrders'));
const OrderStatus = lazyWithRetry(() => import('./pages/OrderStatus'));
const OrderLookup = lazyWithRetry(() => import('./pages/OrderLookup'));
const Account = lazyWithRetry(() => import('./pages/Account'));
const RadioPage = lazyWithRetry(() => import('./pages/RadioPage'));
const VideoSandbox = lazyWithRetry(() => import('./pages/VideoSandbox'));
const PrimeCustomBuilder = lazyWithRetry(() => import('./pages/PrimeCustomBuilder'));
const StampsGallery = lazyWithRetry(() => import('./pages/StampsGallery'));
const ClubeFPAC = lazyWithRetry(() => import('./pages/ClubeFPAC'));

import { MusicPlayerProvider } from './contexts/MusicPlayerContext';
import { PlayerMini } from './components/Player/PlayerMini';

const PageLoader = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-[#ffffff] gap-6">
    <div className="relative"><Logo className="h-16 w-auto opacity-80" /><div className="absolute -inset-4 border-2 border-[#f7c600] border-t-transparent rounded-full animate-spin opacity-20" /></div>
    <div className="flex flex-col items-center gap-2"><div className="h-[2px] w-32 bg-gray-100 overflow-hidden relative"><div className="absolute inset-0 bg-[#f7c600] animate-[shimmer_1.5s_infinite]" style={{ width: '40%' }} /></div><span className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 animate-pulse">Carregando...</span></div>
  </div>
);

const BrandedSplashScreen = () => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const cleanup = () => { document.body.classList.add('app-loaded'); setTimeout(() => setVisible(false), 800); };
    const timer = setTimeout(cleanup, 200);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-[#ffffff] flex flex-col items-center justify-center transition-opacity duration-500 ease-in-out">
      <div className="relative flex flex-col items-center gap-8">
        <div className="animate-in fade-in zoom-in duration-700"><Logo className="h-24 md:h-32 w-auto" /></div>
        <div className="flex flex-col items-center gap-4"><div className="flex items-center gap-3"><div className="w-8 h-[1px] bg-black/10" /><span className="text-[10px] font-black uppercase tracking-[0.5em] text-black italic">Identity & Stance</span><div className="w-8 h-[1px] bg-black/10" /></div><div className="h-[2px] w-48 bg-gray-50 overflow-hidden rounded-full"><div className="h-full bg-[#f7c600] animate-[shimmer_2s_infinite]" /></div></div>
      </div>
    </div>
  );
};

import { useAuth } from './context/AuthContext';
import { analyticsTracker } from './services/analyticsTracker';

function AppContent() {
  const location = useLocation();
  const { user } = useAuth();
  const isHome = location.pathname === '/';
  useEffect(() => {
    const fullPath = location.pathname + location.search;
    analyticsTracker.trackPageView(fullPath);
    if (location.pathname.startsWith('/product/') || location.pathname.startsWith('/produto/')) {
      const prefixLength = location.pathname.startsWith('/product/') ? 9 : 9;
      const slug = location.pathname.substring(prefixLength);
      analyticsTracker.trackProductView(slug, slug);
    }
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (user) analyticsTracker.identify(user.uid, user.email || '', user.displayName || '', user.phoneNumber || '');
  }, [user]);
  return (
    <main className={cn("flex-1", !isHome && "pt-[118px] md:pt-[146px]")}>
      <ErrorBoundary><Suspense fallback={<PageLoader />}><Routes>
        <Route path="/" element={<HomeV2 />} /><Route path="/catalog" element={<Catalog />} /><Route path="/produtos" element={<Catalog />} /><Route path="/estampas" element={<StampsGallery />} /><Route path="/galeria-estampas" element={<StampsGallery />} /><Route path="/prime" element={<PrimeCustomBuilder />} /><Route path="/prime-custom" element={<PrimeCustomBuilder />} /><Route path="/model/prime" element={<Navigate to="/prime" replace />} /><Route path="/model/:modelSlug" element={<ModelStamps />} /><Route path="/bag" element={<Bag />} /><Route path="/collections" element={<Navigate to="/catalog" replace />} /><Route path="/product" element={<Navigate to="/catalog" replace />} /><Route path="/produto" element={<Navigate to="/catalog" replace />} /><Route path="/product/:slug" element={<ProductDetail />} /><Route path="/produto/:slug" element={<ProductDetail />} /><Route path="/checkout" element={<Checkout />} /><Route path="/success" element={<SuccessPage />} /><Route path="/laboratorio-videos" element={<VideoSandbox />} /><Route path="/radio" element={<RadioPage />} /><Route path="/clube" element={<ClubeFPAC />} /><Route path="/clube-fpac" element={<ClubeFPAC />} /><Route path="/gestao" element={<AdminOrders />} /><Route path="/admin" element={<Navigate to="/gestao" replace />} /><Route path="/admin/estampas" element={<Navigate to="/gestao" replace />} /><Route path="/admin/produtos" element={<Navigate to="/gestao" replace />} /><Route path="/tracking" element={<OrderLookup />} /><Route path="/account" element={<Account />} /><Route path="/order/:orderId" element={<OrderStatus />} /><Route path="/order-status/:orderId" element={<NavigateToOrder />} /><Route path="*" element={<Navigate to="/" replace />} />
      </Routes></Suspense></ErrorBoundary>
    </main>
  );
}

export default function App() {
  return (
    <Router><ScrollToTop /><Toaster position="top-right" toastOptions={{ duration: 5000 }} /><BrandedSplashScreen /><AuthProvider><MusicPlayerProvider>
      <div className="min-h-[100dvh] bg-[#ffffff] text-gray-800 font-sans flex flex-col overflow-x-hidden" translate="no">
        <Navbar /><FlashSaleBadge /><StyleRecommendationBanner /><SimpleStyleQuiz /><AppContent /><Footer />
        <a href="https://wa.me/5547997465602?text=Olá!%20Vim%20pelo%20site%20e%20gostaria%20de%20atendimento." target="_blank" rel="noopener noreferrer" className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center group" aria-label="WhatsApp">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          <span className="absolute right-full mr-3 bg-black text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-none opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/10">Atendimento</span>
        </a>
      </div><PlayerMini />
    </MusicPlayerProvider></AuthProvider></Router>
  );
}

function NavigateToOrder() { const { orderId } = useParams(); return <Navigate to={`/order/${orderId}`} replace />; }

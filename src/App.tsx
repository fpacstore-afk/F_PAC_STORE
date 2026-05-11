import React, { Suspense, lazy, Component, ErrorInfo, ReactNode, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Toaster } from 'react-hot-toast';
import ScrollToTop from './components/ScrollToTop';
import { Loader2, AlertTriangle } from 'lucide-react';

import { FlashSaleBadge } from './components/FlashSaleBadge';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public props: ErrorBoundaryProps;
  public state: ErrorBoundaryState = {
    hasError: false
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
          <AlertTriangle size={48} className="text-red-500 mb-4" />
          <h1 className="text-2xl font-black uppercase mb-2">Ops! Algo deu errado.</h1>
          <p className="text-gray-500 mb-6">Tente recarregar a página ou voltar mais tarde.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-black text-white px-8 py-3 font-bold uppercase hover:bg-[#eab308] hover:text-black transition-all"
          >
            Recarregar Página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Lazy load pages
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })));
const Catalog = lazy(() => import('./pages/Catalog').then(m => ({ default: m.Catalog })));
const ProductDetail = lazy(() => import('./pages/ProductDetail').then(m => ({ default: m.ProductDetail })));
const Checkout = lazy(() => import('./pages/Checkout').then(m => ({ default: m.Checkout })));
const Bag = lazy(() => import('./pages/Bag').then(m => ({ default: m.Bag })));
const AdminOrders = lazy(() => import('./pages/AdminOrders').then(m => ({ default: m.AdminOrders })));
const AdminEstampas = lazy(() => import('./pages/AdminEstampas').then(m => ({ default: m.AdminEstampas })));
const AdminProducts = lazy(() => import('./pages/AdminProducts').then(m => ({ default: m.AdminProducts })));
const OrderStatus = lazy(() => import('./pages/OrderStatus').then(m => ({ default: m.OrderStatus })));
const OrderLookup = lazy(() => import('./pages/OrderLookup').then(m => ({ default: m.OrderLookup })));
const Account = lazy(() => import('./pages/Account').then(m => ({ default: m.Account })));
const Estampas = lazy(() => import('./pages/Estampas').then(m => ({ default: m.Estampas })));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <Loader2 className="animate-spin text-[#eab308]" size={32} />
  </div>
);

export default function App() {
  useEffect(() => {
    // Hide initial loading screen
    const timer = setTimeout(() => {
      document.body.classList.add('app-loaded');
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Router>
      <ScrollToTop />
      <Toaster position="top-right" toastOptions={{ duration: 5000 }} />
      <AuthProvider>
        <div className="min-h-[100dvh] bg-[#ffffff] text-gray-800 font-sans flex flex-col overflow-x-hidden" translate="no">
          <Navbar />
          <FlashSaleBadge />
          
          <main className="flex-1">
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/catalog" element={<Catalog />} />
                  <Route path="/bag" element={<Bag />} />
                  <Route path="/collections" element={<Navigate to="/catalog" replace />} />
                  <Route path="/product/:slug" element={<ProductDetail />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/estampas" element={<Estampas />} />
                  <Route path="/gestao" element={<AdminOrders />} />
                  <Route path="/admin" element={<Navigate to="/gestao" replace />} />
                  <Route path="/admin/estampas" element={<AdminEstampas />} />
                  <Route path="/admin/produtos" element={<AdminProducts />} />
                  <Route path="/tracking" element={<OrderLookup />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/order/:orderId" element={<OrderStatus />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>

          <Footer />
        </div>
      </AuthProvider>
    </Router>
  );
}


import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import ScrollToTop from './components/ScrollToTop';
import { Home } from './pages/Home';
import { Catalog } from './pages/Catalog';
import { ProductDetail } from './pages/ProductDetail';
import { Checkout } from './pages/Checkout';
import { AdminOrders } from './pages/AdminOrders';
import { OrderStatus } from './pages/OrderStatus';

import { Estampas } from './pages/Estampas';

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <CartProvider>
        <div className="min-h-screen bg-[#ffffff] text-gray-800 font-sans flex flex-col" translate="no">
          <Navbar />
          <CartDrawer />
          
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/product/:slug" element={<ProductDetail />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/estampas" element={<Estampas />} />
              <Route path="/gestao" element={<AdminOrders />} />
              <Route path="/order/:orderId" element={<OrderStatus />} />
            </Routes>
          </main>

          <Footer />

          {/* Floating WhatsApp */}
          <a
            href="https://wa.me/5547997465602?text=Fala%20comigo!%0A%0AVim%20do%20site%20pra%20conquistar%20minha%20F%20PAC%20STORE."
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform duration-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="28" height="28" fill="currentColor">
              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-23.1-115-65-157zM223.9 414.5c-33.2 0-66.2-8.9-94.8-25.8l-6.8-4-70.5 18.5 18.9-68.7-4.4-7c-18.6-29.3-28.4-63.5-28.4-98.3 0-103.7 84.4-188.1 188.1-188.1 50.2 0 97.4 19.6 133 55.1 35.5 35.5 55 82.8 55 133.1 0 103.7-84.4 188.1-188.2 188.1zm103.4-141.2c-5.7-2.8-33.6-16.6-38.8-18.5-5.2-1.9-9-2.8-12.8 2.8-3.8 5.7-14.7 18.5-18 22.3-3.3 3.8-6.6 4.3-12.3 1.4-5.7-2.8-24-8.8-45.7-28.1-16.9-15-28.3-33.6-31.6-39.3-3.3-5.7-.3-8.8 2.5-11.6 2.5-2.6 5.7-6.6 8.5-9.9 2.8-3.3 3.8-5.7 5.7-9.5 1.9-3.8.9-7.1-.5-9.9-1.4-2.8-12.8-31-17.5-42.5-4.6-11.2-9.2-9.7-12.8-9.9-3.3-.2-7.1-.2-10.9-.2-3.8 0-9.9 1.4-15.1 7.1-5.2 5.7-20 19.4-20 47.1 0 27.7 20.4 54.5 23.3 58.3 2.8 3.8 39.8 60.8 96.3 85.2 13.5 5.8 24 9.3 32.2 11.9 13.6 4.3 26 3.7 35.8 2.2 11-1.7 33.6-13.7 38.3-27 4.7-13.3 4.7-24.6 3.3-27-1.4-2.5-5.2-4-10.9-6.8z"/>
            </svg>
          </a>
        </div>
      </CartProvider>
    </Router>
  );
}


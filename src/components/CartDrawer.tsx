import { useCart } from '../context/CartContext';
import { X, Plus, Minus, ArrowRight, ShoppingBag, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';

export function CartDrawer() {
  const { items, isOpen, setIsOpen, removeFromCart, updateQuantity, total } = useCart();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[400px] bg-[#ffffff] border-l border-black/10 z-[80] flex flex-col shadow-2xl"
          >
            <div className="p-6 border-b border-black/10 flex justify-between items-center">
              <h2 className="font-heading font-bold text-xl flex items-center gap-2">
                <ShoppingBag size={20} />
                Sua Sacola
              </h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="bg-black/5 p-2 rounded-full hover:bg-black/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-600">
                  <ShoppingBag size={48} className="mb-4 opacity-20" />
                  <p className="mb-6">Sua sacola está vazia.</p>
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="text-[#eab308] hover:underline uppercase text-sm font-bold tracking-wider"
                  >
                    Continuar Comprando
                  </button>
                </div>
              ) : (
                items.map((item, index) => (
                  <div key={`${item.id}-${item.size}-${item.color}-${index}`} className="flex gap-4">
                    <div className="w-20 h-24 bg-black/5 rounded-none overflow-hidden flex-shrink-0">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-sm">{item.name}</h3>
                          <button 
                            onClick={() => removeFromCart(index)}
                            className="text-gray-500 hover:text-red-500 transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <p className="text-[10px] text-black/40 mt-1 uppercase tracking-widest font-bold">
                          Cor: {item.color} | Tam: {item.size}
                        </p>
                        {item.printConfigs && item.printConfigs.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] text-[#eab308] uppercase tracking-widest font-bold border-b border-black/10 pb-1 mb-1">
                              Personalização:
                            </p>
                            {item.printConfigs.map((cfg, cfgIdx) => (
                              <p key={cfgIdx} className="text-[10px] text-black/60">
                                <span className="text-black/80">{cfg.stamp}</span> em <span className="text-black/80">{cfg.location}</span> ({cfg.background})
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between items-end mt-2">
                        <div className="flex items-center gap-3 border border-black/20 rounded-none px-2 py-1">
                          <button 
                            onClick={() => updateQuantity(index, item.quantity - 1)}
                            className="text-gray-600 hover:text-black"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(index, item.quantity + 1)}
                            className="text-gray-600 hover:text-black"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <p className="font-bold text-sm">
                          R$ {(item.price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div className="p-6 border-t border-black/10 bg-[#f9fafb]">
                <div className="flex justify-between items-center mb-6">
                   <span className="text-gray-600">Subtotal</span>
                   <span className="font-bold text-xl">R$ {total.toFixed(2)}</span>
                </div>
                <Link 
                   to="/checkout"
                   onClick={() => setIsOpen(false)}
                   className="w-full bg-[#eab308] text-black font-black py-5 text-sm uppercase tracking-[0.2em] hover:bg-white transition-all transform active:scale-95 flex items-center justify-center gap-2"
                >
                   Finalizar Pedido <ArrowRight size={18} />
                </Link>
                <p className="text-xs text-center text-gray-500 mt-4 flex items-center justify-center gap-1">
                   <ShieldCheck size={14} /> Compra 100% segura
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

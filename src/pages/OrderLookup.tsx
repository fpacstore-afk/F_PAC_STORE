import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';

export function OrderLookup() {
  const [orderId, setOrderId] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderId.trim()) {
      navigate(`/order/${orderId.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-[100dvh] pt-32 pb-24 flex flex-col items-center px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-black transition-colors mb-8 text-xs uppercase font-bold tracking-[0.2em]">
          <ArrowLeft size={16} /> Voltar para Loja
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-black/10 p-8 md:p-12 shadow-2xl"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-black text-[#eab308] flex items-center justify-center mx-auto mb-6">
              <Search size={32} />
            </div>
            <h1 className="text-3xl font-heading font-black uppercase mb-2 tracking-tighter">Acompanhar Pedido</h1>
            <p className="text-gray-500 text-sm uppercase tracking-widest font-bold">Insira o ID do seu pedido abaixo</p>
          </div>

          <form onSubmit={handleSearch} className="space-y-6">
            <div>
              <label htmlFor="orderId" className="block text-[10px] font-black uppercase tracking-[0.2em] text-black/40 mb-2">
                Código do Pedido
              </label>
              <input
                id="orderId"
                type="text"
                required
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="EX: PAC-XXXXXX"
                className="w-full bg-black/5 border border-black/10 rounded-none p-4 text-sm font-bold focus:outline-none focus:border-[#eab308] transition-colors placeholder:text-black/10"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-black text-white py-4 font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 hover:bg-[#eab308] hover:text-black transition-all group"
            >
              Consultar Status
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-black/5 text-center">
            <p className="text-[10px] text-black/30 font-bold uppercase tracking-widest leading-relaxed">
              O código do pedido foi enviado para o seu WhatsApp no momento da compra.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

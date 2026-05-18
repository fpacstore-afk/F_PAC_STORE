import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ShoppingBag, Home, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SuccessPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-20">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center"
      >
        <div className="flex justify-center mb-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
            className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center"
          >
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </motion.div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">
          PAGAMENTO CONFIRMADO!
        </h1>
        <p className="text-gray-500 mb-10 leading-relaxed">
          Seu pedido foi recebido com sucesso. Você receberá um e-mail com os detalhes da sua compra e o código de rastreamento em breve.
        </p>

        <div className="grid gap-3">
          <Link 
            to="/catalog"
            className="flex items-center justify-center gap-2 bg-black text-white py-4 px-6 rounded-none font-bold hover:bg-gray-900 transition-colors group uppercase tracking-widest text-[10px]"
          >
            <ShoppingBag className="w-5 h-5" />
            CONTINUAR COMPRANDO
            <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </Link>
          
          <Link 
            to="/"
            className="flex items-center justify-center gap-2 bg-gray-100 text-gray-800 py-4 px-6 rounded-none font-bold hover:bg-gray-200 transition-colors uppercase tracking-widest text-[10px]"
          >
            <Home className="w-5 h-5" />
            VOLTAR PARA HOME
          </Link>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-100 italic text-sm text-gray-400">
          Obrigado por escolher a F PAC STORE. Sua autenticidade é nossa identidade.
        </div>
      </motion.div>
    </div>
  );
}

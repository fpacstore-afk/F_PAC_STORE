import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Boxes, Layers3, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FinancialPrivacyProvider } from '../context/FinancialPrivacyContext';
import { StrategicInventoryCenter } from '../components/StrategicInventoryCenter';

export default function ManagementCatalog() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen pt-36 bg-[#f5f5f3] flex items-start justify-center">
        <div className="text-[11px] font-black uppercase tracking-[0.25em] text-black/45">Carregando catálogo...</div>
      </div>
    );
  }

  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';
  if (!isAdmin) return <Navigate to="/gestao/operacoes" replace />;

  return (
    <FinancialPrivacyProvider>
      <div className="min-h-screen bg-[#f5f5f3] pb-16">
        <header className="bg-black text-white border-b-4 border-[#eab308]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <Link to="/gestao" className="inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.18em] text-white/45 hover:text-white transition-colors mb-2">
                  <ArrowLeft size={12} /> Central de gestão
                </Link>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="bg-[#eab308] text-black px-2 py-0.5 text-[8px] font-black uppercase tracking-widest">Estoque</span>
                  <span className="text-[8px] uppercase tracking-widest text-white/40 font-black">Produtos + insumos</span>
                </div>
                <h1 className="text-xl md:text-3xl font-black uppercase tracking-[-0.035em]">Gestão de produtos & estoque</h1>
                <p className="mt-1.5 text-xs md:text-sm text-white/55 max-w-2xl leading-relaxed">
                  Uma visão rápida para camisas lisas, peças personalizadas, estampas, variações e próximos produtos da F PAC.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 min-w-full sm:min-w-[320px]">
                <div className="border border-white/10 bg-white/5 p-3">
                  <Boxes size={16} className="text-[#eab308] mb-1.5" />
                  <span className="block text-[7px] text-white/40 uppercase tracking-widest font-black">Estrutura</span>
                  <span className="text-[10px] font-black uppercase">Multi-produto</span>
                </div>
                <div className="border border-white/10 bg-white/5 p-3">
                  <Layers3 size={16} className="text-[#eab308] mb-1.5" />
                  <span className="block text-[7px] text-white/40 uppercase tracking-widest font-black">Controle</span>
                  <span className="text-[10px] font-black uppercase">Peça + insumos</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 pt-4">
          <div className="bg-white border border-black/10 mb-3 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-black text-[#eab308] flex items-center justify-center"><Store size={15} /></div>
              <div>
                <h2 className="text-[11px] font-black uppercase tracking-tight">Estoque preparado para crescer</h2>
                <p className="text-[9px] text-black/50 mt-0.5">A busca e os filtros foram pensados para centenas de SKUs sem transformar a página em uma lista difícil de operar.</p>
              </div>
            </div>
            <Link to="/" className="text-[8px] font-black uppercase tracking-widest text-black/55 hover:text-black">Ver loja</Link>
          </div>

          <StrategicInventoryCenter />
        </div>
      </div>
    </FinancialPrivacyProvider>
  );
}

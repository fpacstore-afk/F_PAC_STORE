import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Boxes, PlusCircle, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FinancialPrivacyProvider } from '../context/FinancialPrivacyContext';
import { AdminStockCenter } from '../components/AdminStockCenter';

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
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
              <div>
                <Link to="/gestao" className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/50 hover:text-white transition-colors mb-4">
                  <ArrowLeft size={13} /> Central de gestão
                </Link>
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-[#eab308] text-black px-2 py-1 text-[8px] font-black uppercase tracking-widest">Catálogo</span>
                  <span className="text-[9px] uppercase tracking-widest text-white/40 font-black">Produtos + estoque</span>
                </div>
                <h1 className="text-2xl md:text-4xl font-black uppercase tracking-[-0.035em]">Catálogo comercial</h1>
                <p className="mt-3 text-sm text-white/55 max-w-2xl leading-relaxed">
                  Cadastre e mantenha produtos de diferentes tipos sem limitar a operação às camisetas oversized.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 min-w-full sm:min-w-[340px]">
                <div className="border border-white/10 bg-white/5 p-3.5">
                  <Boxes size={17} className="text-[#eab308] mb-2" />
                  <span className="block text-[8px] text-white/40 uppercase tracking-widest font-black">Modelo</span>
                  <span className="text-[11px] font-black uppercase">Multi-produto</span>
                </div>
                <div className="border border-white/10 bg-white/5 p-3.5">
                  <PlusCircle size={17} className="text-[#eab308] mb-2" />
                  <span className="block text-[8px] text-white/40 uppercase tracking-widest font-black">Cadastro</span>
                  <span className="text-[11px] font-black uppercase">Produto + variação</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 pt-5">
          <div className="bg-white border border-black/10 mb-4 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-black text-[#eab308] flex items-center justify-center"><Store size={17} /></div>
              <div>
                <h2 className="text-[12px] font-black uppercase tracking-tight">Base preparada para novos produtos</h2>
                <p className="text-[10px] text-black/50 mt-0.5">Camisetas, cropped, moletom, bermuda, boné e próximas categorias podem compartilhar a mesma gestão.</p>
              </div>
            </div>
            <Link to="/" className="text-[9px] font-black uppercase tracking-widest text-black/55 hover:text-black">Ver loja</Link>
          </div>

          <AdminStockCenter />
        </div>
      </div>
    </FinancialPrivacyProvider>
  );
}

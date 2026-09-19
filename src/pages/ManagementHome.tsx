import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Boxes,
  ClipboardList,
  Factory,
  Truck,
  Palette,
  BadgePercent,
  BarChart3,
  Users,
  WalletCards,
  Radio,
  ArrowRight,
  Store,
  Settings2,
  Layers3,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ManagementDashboard from '../components/management/ManagementDashboard';

const modules = [
  {
    title: 'Catálogo & Estoque',
    description: 'Cadastre, edite e organize produtos, variações, imagens, preços e estoque em um único fluxo.',
    href: '/gestao/catalogo',
    icon: Boxes,
    accent: true,
    badge: 'Principal',
  },
  {
    title: 'Pedidos & Vendas',
    description: 'Acompanhe pedidos, pagamentos, vendas manuais e o histórico operacional da loja.',
    href: '/gestao/operacoes',
    icon: ClipboardList,
  },
  {
    title: 'Produção',
    description: 'Controle o andamento dos pedidos que dependem de produção e personalização.',
    href: '/gestao/operacoes',
    icon: Factory,
  },
  {
    title: 'Expedição',
    description: 'Centralize separação, envio e acompanhamento das entregas.',
    href: '/gestao/operacoes',
    icon: Truck,
  },
  {
    title: 'Estampas & Artes',
    description: 'Organize o acervo de estampas usado em produtos personalizados.',
    href: '/gestao/operacoes',
    icon: Palette,
  },
  {
    title: 'Promoções',
    description: 'Gerencie campanhas e regras comerciais sem misturar com o cadastro de produto.',
    href: '/gestao/operacoes',
    icon: BadgePercent,
  },
  {
    title: 'Financeiro',
    description: 'Acompanhe recebimentos, custos, resultado e indicadores financeiros.',
    href: '/gestao/operacoes',
    icon: WalletCards,
  },
  {
    title: 'Clientes',
    description: 'Consulte a base de clientes, identidade e relacionamento.',
    href: '/gestao/operacoes',
    icon: Users,
  },
  {
    title: 'Analytics',
    description: 'Visualize dados de operação, catálogo e desempenho comercial.',
    href: '/gestao/operacoes',
    icon: BarChart3,
  },
  {
    title: 'Rádio & Conteúdo',
    description: 'Gerencie elementos de experiência e conteúdo vinculados ao site.',
    href: '/gestao/operacoes',
    icon: Radio,
  },
];

export default function ManagementHome() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen pt-36 bg-[#f5f5f3] flex items-start justify-center">
        <div className="text-[11px] font-black uppercase tracking-[0.25em] text-black/45">Carregando gestão...</div>
      </div>
    );
  }

  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';
  if (!isAdmin) return <Navigate to="/gestao/operacoes" replace />;

  return (
    <div className="min-h-screen bg-[#f5f5f3] pb-20">
      <section className="bg-black text-white border-b-4 border-[#eab308]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-[#eab308] text-black px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em]">F PAC Commerce</span>
                <span className="text-white/45 text-[9px] font-black uppercase tracking-[0.18em]">Central de gestão</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black uppercase tracking-[-0.03em] leading-none">Gestão da loja</h1>
              <p className="mt-2 text-xs md:text-sm text-white/55 max-w-2xl leading-relaxed">
                Vendas, estoque, clientes e crescimento em uma visão única do negócio.
              </p>
            </div>

            <div className="hidden md:grid grid-cols-2 gap-2 min-w-[350px]">
              <div className="bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3">
                <Store size={18} className="text-[#eab308]" />
                <div><span className="text-[8px] uppercase tracking-widest text-white/40 font-black block">Estrutura</span><span className="text-xs font-black uppercase">Multi-produto</span></div>
              </div>
              <div className="bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3">
                <ShieldCheck size={18} className="text-[#eab308]" />
                <div><span className="text-[8px] uppercase tracking-widest text-white/40 font-black block">Operação</span><span className="text-xs font-black uppercase">Centralizada</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 md:pt-8 space-y-10">
        <ManagementDashboard />

        <section>
          <div className="flex items-center justify-between mb-4 gap-3">
            <div>
              <span className="text-[9px] uppercase tracking-[0.22em] font-black text-black/40">Acessos de gestão</span>
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">Operação do e-commerce</h2>
            </div>
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest border border-black/10 bg-white px-3 py-2 hover:border-black transition-colors"
            >
              Ver loja <ArrowRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {modules.map(({ title, description, href, icon: Icon, accent, badge }) => (
                <Link
                  key={title}
                  to={href}
                  className={`group relative overflow-hidden border p-5 min-h-[150px] transition-all duration-200 ${accent ? 'bg-black text-white border-black hover:border-[#eab308]' : 'bg-white text-black border-black/10 hover:border-black/30 hover:shadow-sm'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className={`w-10 h-10 flex items-center justify-center border ${accent ? 'border-white/10 bg-white/5 text-[#eab308]' : 'border-black/10 bg-black/[0.02]'}`}>
                      <Icon size={20} />
                    </div>
                    <div className="flex items-center gap-2">
                      {badge && <span className="text-[8px] font-black uppercase tracking-widest bg-[#eab308] text-black px-2 py-1">{badge}</span>}
                      <ArrowRight size={16} className="opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                  <h3 className="mt-4 text-base font-black uppercase tracking-tight">{title}</h3>
                  <p className={`mt-2 text-[12px] leading-relaxed ${accent ? 'text-white/55' : 'text-black/55'}`}>{description}</p>
                </Link>
              ))}
            </div>

            <aside className="space-y-4">
              <div className="bg-white border border-black/10 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Layers3 size={17} />
                  <h3 className="text-sm font-black uppercase tracking-tight">Estrutura de catálogo</h3>
                </div>
                <div className="space-y-3 text-[11px] text-black/60 leading-relaxed">
                  <p><strong className="text-black">Produto:</strong> camiseta, cropped oversized, moletom, bermuda, boné ou qualquer novo item.</p>
                  <p><strong className="text-black">Variações:</strong> tamanho, cor e combinações específicas de cada produto.</p>
                  <p><strong className="text-black">Comercial:</strong> preço, status, categoria, mídia e disponibilidade.</p>
                  <p><strong className="text-black">Estoque:</strong> controle separado por produto e variação.</p>
                </div>
                <Link to="/gestao/catalogo" className="mt-5 w-full inline-flex items-center justify-between bg-[#eab308] text-black px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-[#eab308] transition-colors">
                  Abrir catálogo <ArrowRight size={14} />
                </Link>
              </div>

              <div className="bg-[#ecece8] border border-black/10 p-5">
                <Settings2 size={17} className="mb-3" />
                <h3 className="text-sm font-black uppercase tracking-tight">Padrão de gestão</h3>
                <p className="mt-2 text-[11px] text-black/55 leading-relaxed">
                  A gestão fica organizada por função, sem misturar cadastro, estoque, pedidos e conteúdo na mesma tela.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

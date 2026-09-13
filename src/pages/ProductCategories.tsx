import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Shirt, Sparkles, Layers3, Crown, Footprints, Scissors, PackageSearch } from 'lucide-react';

type CategoryCard = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const categories: CategoryCard[] = [
  { slug: 'oversized', title: 'Camisetas Oversized', description: 'Modelagens amplas e coleções streetwear para quem gosta de presença no caimento.', eyebrow: 'Streetwear', icon: Shirt },
  { slug: 'tradicional', title: 'Camisetas Tradicionais', description: 'Modelagens versáteis para uma leitura mais clássica do estilo F PAC.', eyebrow: 'Essencial', icon: Sparkles },
  { slug: 'casacos', title: 'Casacos & Moletons', description: 'Camadas para completar o visual quando conforto e presença precisam andar juntos.', eyebrow: 'Camadas', icon: Layers3 },
  { slug: 'bones', title: 'Bonés', description: 'Acessórios para fechar a composição sem perder a identidade da marca.', eyebrow: 'Acessórios', icon: Crown },
  { slug: 'chinelos', title: 'Chinelos & Slides', description: 'Opções casuais para levar a linguagem F PAC além das camisetas.', eyebrow: 'Lifestyle', icon: Footprints },
  { slug: 'croppeds', title: 'Croppeds', description: 'Modelagens femininas para composições com personalidade e atitude.', eyebrow: 'Feminino', icon: Scissors },
  { slug: 'bermudas', title: 'Bermudas', description: 'Peças para construir o look completo com conforto e versatilidade.', eyebrow: 'Composição', icon: PackageSearch },
];

export default function ProductCategories() {
  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-20 md:pb-28">
      <Helmet>
        <title>Produtos | F PAC STORE</title>
        <meta name="description" content="Explore os produtos F PAC STORE por categoria: camisetas oversized, tradicionais, casacos, bonés, chinelos, croppeds, bermudas e mais." />
        <link rel="canonical" href="https://www.fpacstore.com.br/produtos" />
      </Helmet>

      <section className="bg-black text-white px-5 sm:px-8 py-14 md:py-20 lg:py-24 overflow-hidden relative">
        <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full border border-white/5" />
        <div className="absolute -left-20 -bottom-28 w-72 h-72 rounded-full border border-[#eab308]/10" />
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <span className="inline-block text-[#eab308] text-[10px] md:text-xs font-black uppercase tracking-[0.35em] mb-4">Catálogo F PAC STORE</span>
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black uppercase italic leading-[0.95] tracking-tight">
            Encontre sua próxima <span className="text-[#eab308]">identidade</span>
          </h1>
          <p className="mt-5 text-white/60 max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
            Comece pelo tipo de produto e chegue mais rápido ao que combina com o seu estilo.
          </p>
          <Link
            to="/catalog/all"
            className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 border border-white/20 px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] hover:border-[#eab308] hover:text-[#eab308] transition-colors"
          >
            Ver tudo de uma vez <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-9 md:py-14">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 md:mb-8">
          <div>
            <p className="text-[#b88700] text-[10px] font-black uppercase tracking-[0.3em]">Navegue por categoria</p>
            <h2 className="mt-2 text-3xl md:text-4xl font-black uppercase italic text-black">O que você quer <span className="text-[#eab308]">vestir?</span></h2>
          </div>
          <p className="text-sm text-gray-500 max-w-md">As categorias exibem somente os produtos cadastrados na operação atual. Preço e disponibilidade continuam sendo carregados do catálogo.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {categories.map(({ slug, title, description, eyebrow, icon: Icon }) => (
            <Link
              key={slug}
              to={`/produtos/${slug}`}
              className="group min-h-[230px] md:min-h-[260px] bg-white border border-black/10 rounded-2xl p-6 md:p-8 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="w-13 h-13 bg-black text-[#eab308] rounded-xl flex items-center justify-center group-hover:bg-[#eab308] group-hover:text-black transition-colors">
                    <Icon size={24} />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-[0.22em] text-gray-400">{eyebrow}</span>
                </div>
                <h2 className="mt-6 text-2xl md:text-3xl font-black uppercase italic tracking-tight text-black">{title}</h2>
                <p className="mt-3 text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
              <span className="mt-6 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-black group-hover:text-[#b88700] transition-colors">
                Explorar categoria <ArrowRight size={16} />
              </span>
            </Link>
          ))}

          <Link
            to="/catalog/all"
            className="group min-h-[230px] md:min-h-[260px] bg-black text-white rounded-2xl p-6 md:p-8 flex flex-col justify-between shadow-xl sm:col-span-2 lg:col-span-1"
          >
            <div>
              <div className="w-13 h-13 bg-[#eab308] text-black rounded-xl flex items-center justify-center"><PackageSearch size={24} /></div>
              <p className="mt-6 text-[#eab308] text-[9px] font-black uppercase tracking-[0.22em]">Catálogo completo</p>
              <h2 className="mt-2 text-2xl md:text-3xl font-black uppercase italic tracking-tight">Todos os produtos</h2>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">Use busca, filtros e ordenação para navegar por todo o catálogo em uma única tela.</p>
            </div>
            <span className="mt-6 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]">Abrir catálogo completo <ArrowRight size={16} /></span>
          </Link>
        </div>
      </section>
    </div>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Shirt, Sparkles, Layers3, Crown, Footprints, Scissors, PackageSearch } from 'lucide-react';

type CategoryCard = {
  slug: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const categories: CategoryCard[] = [
  { slug: 'oversized', title: 'Camisetas Oversized', description: 'Modelagens amplas, coleções FORCE, MARK e opções personalizáveis.', icon: Shirt },
  { slug: 'tradicional', title: 'Camisetas Tradicionais', description: 'Modelagem tradicional e opções em suedine para diferentes estilos.', icon: Sparkles },
  { slug: 'casacos', title: 'Casacos & Moletons', description: 'Peças para sobreposição, conforto e presença em dias mais frios.', icon: Layers3 },
  { slug: 'bones', title: 'Bonés', description: 'Acessórios F PAC para completar o visual com identidade.', icon: Crown },
  { slug: 'chinelos', title: 'Chinelos & Slides', description: 'Calçados casuais para levar a identidade F PAC além das roupas.', icon: Footprints },
  { slug: 'croppeds', title: 'Croppeds', description: 'Peças femininas com estética F PAC e modelagens próprias.', icon: Scissors },
  { slug: 'bermudas', title: 'Bermudas', description: 'Opções confortáveis e versáteis para compor o conjunto.', icon: PackageSearch },
];

export default function ProductCategories() {
  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-20 md:pb-28">
      <Helmet>
        <title>Produtos | F PAC STORE</title>
        <meta name="description" content="Escolha a categoria de produtos F PAC STORE: camisetas oversized, tradicionais, casacos, bonés, chinelos, croppeds, bermudas e mais." />
        <link rel="canonical" href="https://www.fpacstore.com.br/produtos" />
      </Helmet>

      <section className="bg-black text-white px-5 sm:px-8 py-12 md:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto text-center">
          <span className="inline-block text-[#eab308] text-[10px] md:text-xs font-black uppercase tracking-[0.35em] mb-4">Catálogo F PAC Store</span>
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black uppercase italic leading-none tracking-tight">Escolha o que você quer <span className="text-[#eab308]">ver</span></h1>
          <p className="mt-5 text-white/60 max-w-2xl mx-auto text-sm md:text-base leading-relaxed">O catálogo agora está organizado por tipo de produto para facilitar sua busca e permitir a entrada de novas categorias sem limitar a F PAC STORE apenas às camisetas.</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-1 md:mt-0 py-8 md:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {categories.map(({ slug, title, description, icon: Icon }) => (
            <Link
              key={slug}
              to={`/produtos/${slug}`}
              className="group min-h-[220px] md:min-h-[250px] bg-white border border-black/10 p-6 md:p-8 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div>
                <div className="w-14 h-14 bg-black text-[#eab308] flex items-center justify-center mb-6 group-hover:bg-[#eab308] group-hover:text-black transition-colors">
                  <Icon size={26} />
                </div>
                <h2 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight text-black">{title}</h2>
                <p className="mt-3 text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
              <span className="mt-6 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-black group-hover:text-[#eab308] transition-colors">Ver categoria <ArrowRight size={16} /></span>
            </Link>
          ))}

          <Link
            to="/catalog/all"
            className="group min-h-[220px] md:min-h-[250px] bg-black text-white p-6 md:p-8 flex flex-col justify-between shadow-xl sm:col-span-2 lg:col-span-1"
          >
            <div>
              <div className="w-14 h-14 bg-[#eab308] text-black flex items-center justify-center mb-6"><PackageSearch size={26} /></div>
              <h2 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight">Todos os produtos</h2>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">Prefere navegar por tudo de uma vez? Abra o catálogo completo.</p>
            </div>
            <span className="mt-6 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]">Abrir catálogo completo <ArrowRight size={16} /></span>
          </Link>
        </div>
      </section>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { db } from '../lib/firebase';
import { products as staticProducts } from '../data/products';
import { buildSellableCatalog } from '../lib/catalogProducts';
import { getProductUrl, getDisplayPrices } from '../lib/utils';

const CATEGORY_LABELS: Record<string, { title: string; subtitle: string; eyebrow: string }> = {
  oversized: { title: 'Camisetas Oversized', subtitle: 'Modelagens amplas para construir um visual streetwear com mais presença.', eyebrow: 'Streetwear' },
  tradicional: { title: 'Camisetas Tradicionais', subtitle: 'Modelagens versáteis para uma leitura mais clássica da identidade F PAC.', eyebrow: 'Essencial' },
  casacos: { title: 'Casacos & Moletons', subtitle: 'Camadas para conforto, composição e atitude nos dias mais frios.', eyebrow: 'Camadas' },
  bones: { title: 'Bonés', subtitle: 'Acessórios para completar o visual sem perder a assinatura F PAC.', eyebrow: 'Acessórios' },
  chinelos: { title: 'Chinelos & Slides', subtitle: 'Opções casuais para levar a identidade da marca para outros momentos.', eyebrow: 'Lifestyle' },
  croppeds: { title: 'Croppeds', subtitle: 'Modelagens femininas para composições com personalidade.', eyebrow: 'Feminino' },
  bermudas: { title: 'Bermudas', subtitle: 'Conforto e versatilidade para construir o look completo.', eyebrow: 'Composição' },
};

function normalize(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function matchesCategory(product: any, category: string) {
  const productType = normalize(product.productType);
  const legacyCategory = normalize(product.category);
  const fit = normalize(product.fit);
  const name = normalize(product.name);
  const headline = normalize(product.headline);
  const tags = Array.isArray(product.tags) ? product.tags.map(normalize).join(' ') : '';
  const haystack = [legacyCategory, fit, name, headline, tags].join(' ');

  if (category === 'oversized') {
    return productType === 'tshirt' && (haystack.includes('oversized') || ['force', 'mark', 'prime'].includes(normalize(product.parentSlug)));
  }
  if (category === 'tradicional') {
    return productType === 'tshirt' && (haystack.includes('tradicional') || haystack.includes('suedine'));
  }
  if (category === 'casacos') {
    return productType === 'jacket' || /casaco|moletom|jaqueta/.test(haystack);
  }
  if (category === 'bones') {
    return /bone|cap|chapeu/.test(haystack);
  }
  if (category === 'chinelos') {
    return /chinelo|slide|sandalia/.test(haystack);
  }
  if (category === 'croppeds') {
    return productType === 'cropped' || haystack.includes('cropped');
  }
  if (category === 'bermudas') {
    return productType === 'shorts' || /bermuda|short/.test(haystack);
  }
  return false;
}

export default function ProductCategoryPage() {
  const { category = '' } = useParams();
  const [products, setProducts] = useState<any[]>(() => buildSellableCatalog(staticProducts, []));
  const [loading, setLoading] = useState(true);
  const meta = CATEGORY_LABELS[category] || { title: 'Produtos', subtitle: 'Explore o catálogo F PAC STORE.', eyebrow: 'F PAC STORE' };

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const dynamic = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
        setProducts(buildSellableCatalog(staticProducts, dynamic));
        setLoading(false);
      },
      () => {
        setProducts(buildSellableCatalog(staticProducts, []));
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => products.filter((product) => matchesCategory(product, category)), [products, category]);

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-20 md:pb-28">
      <Helmet>
        <title>{meta.title} | F PAC STORE</title>
        <meta name="description" content={`${meta.title} F PAC STORE. ${meta.subtitle}`} />
      </Helmet>

      <section className="bg-black text-white px-5 sm:px-8 py-10 md:py-14 lg:py-16">
        <div className="max-w-7xl mx-auto">
          <Link
            to="/produtos"
            className="inline-flex min-h-10 items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/60 hover:text-[#eab308] transition-colors mb-6"
          >
            <ArrowLeft size={15} /> Voltar às categorias
          </Link>
          <p className="text-[#eab308] text-[10px] md:text-xs font-black uppercase tracking-[0.3em]">{meta.eyebrow}</p>
          <h1 className="mt-2 text-4xl sm:text-5xl lg:text-6xl font-black uppercase italic tracking-tight leading-[0.95]">{meta.title}</h1>
          <p className="mt-4 text-white/60 max-w-2xl text-sm md:text-base leading-relaxed">{meta.subtitle}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {!loading && filtered.length > 0 && (
          <div className="mb-6 flex items-center justify-between gap-4">
            <p className="text-xs font-bold text-gray-500">
              {filtered.length} {filtered.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
            </p>
            <Link to="/catalog/all" className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-black hover:text-[#b88700] transition-colors">
              Ver catálogo completo <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm font-bold uppercase tracking-widest text-gray-400">Carregando produtos...</div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-7">
            {filtered.map((product) => {
              const image = product.images?.[0] || '/estampas/logo-fpac.png';
              const prices = getDisplayPrices(product);
              return (
                <Link
                  key={product.id || product.slug}
                  to={getProductUrl(product)}
                  className="group bg-white border border-black/10 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="relative aspect-[4/5] bg-black overflow-hidden">
                    <img
                      src={image}
                      alt={product.name || 'Produto F PAC STORE'}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      onError={(e) => {
                        e.currentTarget.src = '/estampas/logo-fpac.png';
                      }}
                    />
                    <span className="absolute left-3 top-3 bg-black/85 backdrop-blur-sm text-[#eab308] px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-[0.18em]">
                      F PAC STORE
                    </span>
                  </div>
                  <div className="p-5">
                    <h2 className="text-xl font-black uppercase italic text-black leading-tight">{product.name}</h2>
                    {product.headline && product.headline !== product.name && (
                      <p className="mt-1 text-xs text-gray-500 line-clamp-2">{product.headline}</p>
                    )}
                    <div className="mt-4 flex items-end justify-between gap-3 border-t border-black/5 pt-4">
                      <div>
                        {prices.hasDiscount && <p className="text-xs text-gray-400 line-through">R$ {prices.originalPrice.toFixed(2).replace('.', ',')}</p>}
                        <p className="font-black text-lg text-black">R$ {prices.effectivePrice.toFixed(2).replace('.', ',')}</p>
                      </div>
                      <span className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center group-hover:bg-[#eab308] group-hover:text-black transition-colors">
                        <ArrowRight size={17} />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto bg-white border border-black/10 rounded-2xl p-8 md:p-12 text-center shadow-sm">
            <p className="text-[#b88700] text-[10px] font-black uppercase tracking-[0.25em]">Categoria preparada</p>
            <h2 className="mt-2 text-2xl md:text-3xl font-black uppercase italic text-black">Novidades em breve</h2>
            <p className="mt-3 text-gray-500 text-sm leading-relaxed">Nenhum produto disponível foi encontrado nesta categoria agora. Você pode continuar navegando pelo catálogo atual sem alterar os filtros ou dados da operação.</p>
            <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
              <Link to="/produtos" className="inline-flex min-h-11 items-center justify-center gap-2 border border-black/15 px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Outras categorias</Link>
              <Link to="/catalog/all" className="inline-flex min-h-11 items-center justify-center gap-2 bg-black text-white px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Ver catálogo atual <ArrowRight size={15} /></Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

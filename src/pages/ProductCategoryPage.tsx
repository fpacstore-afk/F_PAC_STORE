import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { db } from '../lib/firebase';
import { products as staticProducts } from '../data/products';
import { productMatchesStorefrontCategory, buildSellableCatalog, productMatchesCommercialLine, type CommercialLine } from '../lib/catalogProducts';
import { getProductUrl, getDisplayPrices } from '../lib/utils';
import { fetchPublicProducts, subscribePublicProductSnapshot } from '../services/publicProducts';

const CATEGORY_LABELS: Record<string, { title: string; subtitle: string; eyebrow: string }> = {
  oversized: { title: 'Camisetas Oversized', subtitle: 'Modelagens amplas para construir um visual streetwear com mais presença.', eyebrow: 'Streetwear' },
  tradicional: { title: 'Camisetas Tradicionais', subtitle: 'Modelagens versáteis para uma leitura mais clássica da identidade F PAC.', eyebrow: 'Essencial' },
  casacos: { title: 'Casacos & Moletons', subtitle: 'Camadas para conforto, composição e atitude nos dias mais frios.', eyebrow: 'Camadas' },
  bones: { title: 'Bonés', subtitle: 'Acessórios para completar o visual sem perder a assinatura F PAC.', eyebrow: 'Acessórios' },
  chinelos: { title: 'Chinelos & Slides', subtitle: 'Opções casuais para levar a identidade da marca para outros momentos.', eyebrow: 'Lifestyle' },
  croppeds: { title: 'Croppeds Oversized', subtitle: 'Modelagem feminina oversized, ampla e confortável para composições com personalidade.', eyebrow: 'Feminino Oversized' },
  bermudas: { title: 'Bermudas', subtitle: 'Conforto e versatilidade para construir o look completo.', eyebrow: 'Composição' },
  kits: { title: 'Kits F PAC', subtitle: 'Combinações cadastradas para comprar produtos em conjunto.', eyebrow: 'Kits' },
  acessorios: { title: 'Acessórios', subtitle: 'Itens complementares cadastrados no catálogo F PAC.', eyebrow: 'Complementos' },
};

const PRIME_PRODUCT_BY_CATEGORY: Record<string, string> = {
  oversized: 'prime',
  tradicional: 'traditional',
  croppeds: 'cropped',
  casacos: 'hoodie',
  bermudas: 'shorts',
  bones: 'cap',
};

function normalize(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function ProductCategoryPage() {
  const { category = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<any[]>(() => buildSellableCatalog(staticProducts, []));
  const [loading, setLoading] = useState(true);
  const meta = CATEGORY_LABELS[category] || { title: 'Produtos', subtitle: 'Explore o catálogo F PAC STORE.', eyebrow: 'F PAC STORE' };

  useEffect(() => {
    const loadPublicFallback = () => fetchPublicProducts().then(dynamic => {
      setProducts(buildSellableCatalog(staticProducts, dynamic));
      setLoading(false);
    });
    const unsub = subscribePublicProductSnapshot(
      (snapshot) => {
        const dynamic = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
        if (dynamic.length > 0) {
          setProducts(buildSellableCatalog(staticProducts, dynamic));
          setLoading(false);
        } else void loadPublicFallback();
      },
      () => void loadPublicFallback(),
    );
    return () => unsub();
  }, []);

  const categoryProducts = useMemo(() => products.filter((product) => productMatchesStorefrontCategory(product, category)), [products, category]);
  const requestedLine = normalize(searchParams.get('line'));
  const selectedLine: Exclude<CommercialLine, 'todos'> = requestedLine === 'mark' || requestedLine === 'prime' ? requestedLine : 'force';
  const filtered = useMemo(() => categoryProducts.filter(product => productMatchesCommercialLine(product, selectedLine)), [categoryProducts, selectedLine]);
  const lineCounts = useMemo(() => ({
    force: categoryProducts.filter(product => productMatchesCommercialLine(product, 'force')).length,
    mark: categoryProducts.filter(product => productMatchesCommercialLine(product, 'mark')).length,
    prime: categoryProducts.filter(product => productMatchesCommercialLine(product, 'prime')).length,
  }), [categoryProducts]);
  const selectLine = (line: 'force' | 'mark' | 'prime') => {
    if (line === 'prime') {
      const product = PRIME_PRODUCT_BY_CATEGORY[category];
      navigate(product ? `/prime?product=${encodeURIComponent(product)}` : '/prime');
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.set('line', line);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-20 md:pb-28">
      <Helmet>
        <title>{meta.title} | F PAC STORE</title>
        <meta name="description" content={`${meta.title} F PAC STORE. ${meta.subtitle}`} />
      </Helmet>

      <section className="bg-black text-white px-4 sm:px-8 py-5 md:py-9">
        <div className="max-w-7xl mx-auto">
          <Link
            to="/produtos"
            className="inline-flex min-h-8 items-center gap-2 text-[8px] md:text-[10px] font-black uppercase tracking-[0.18em] text-white/60 hover:text-[#eab308] transition-colors mb-2 md:mb-4"
          >
            <ArrowLeft size={15} /> Voltar às categorias
          </Link>
          <p className="text-[#eab308] text-[10px] md:text-xs font-black uppercase tracking-[0.3em]">{meta.eyebrow}</p>
          <h1 className="mt-1 text-3xl sm:text-5xl font-black uppercase italic tracking-tight leading-[0.95]">{meta.title}</h1>
          <p className="mt-2 text-white/60 max-w-2xl text-xs md:text-sm">{meta.subtitle}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 md:py-8">
        <div className="mb-3 grid grid-cols-3 gap-2 rounded-2xl border border-black/10 bg-white p-2 shadow-sm">
          {(['force', 'mark', 'prime'] as const).map(line => (
            <button key={line} type="button" onClick={() => selectLine(line)} className={`min-h-12 rounded-xl px-2 text-[9px] md:text-xs font-black uppercase tracking-[0.12em] transition-colors ${selectedLine === line ? 'bg-black text-[#eab308]' : 'bg-[#f5f5f2] text-black'}`}>
              <span className="block">{line}</span><span className={`mt-0.5 block text-[7px] font-bold ${selectedLine === line ? 'text-white/50' : 'text-black/35'}`}>{line === 'prime' ? 'Personalizar' : `${lineCounts[line]} ${lineCounts[line] === 1 ? 'produto' : 'produtos'}`}</span>
            </button>
          ))}
        </div>

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
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 md:gap-7">
            {filtered.map((product) => {
              const image = product.images?.[0] || '/estampas/logo-fpac.png';
              const prices = getDisplayPrices(product);
              return (
                <Link
                  key={product.id || product.slug}
                  to={getProductUrl(product)}
                  className="group bg-white border border-black/10 rounded-xl md:rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="relative aspect-square md:aspect-[4/5] bg-black overflow-hidden">
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
                  <div className="p-3 md:p-4">
                    <p className="text-[7px] font-black uppercase tracking-[0.16em] text-[#9a7100]">{selectedLine}</p>
                    <h2 className="mt-1 text-xs md:text-lg font-black uppercase text-black leading-tight line-clamp-2">{product.name}</h2>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        {prices.hasDiscount && <p className="text-xs text-gray-400 line-through">R$ {prices.originalPrice.toFixed(2).replace('.', ',')}</p>}
                        <p className="font-black text-sm md:text-lg text-black">R$ {prices.effectivePrice.toFixed(2).replace('.', ',')}</p>
                      </div>
                      <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center group-hover:bg-[#eab308] group-hover:text-black transition-colors">
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
            <p className="text-[#b88700] text-[10px] font-black uppercase tracking-[0.25em]">Linha {selectedLine}</p>
            <h2 className="mt-2 text-xl md:text-2xl font-black uppercase italic text-black">Nenhum produto publicado</h2>
            <p className="mt-3 text-gray-500 text-sm leading-relaxed">Quando um produto desta categoria for cadastrado na coleção {selectedLine.toUpperCase()}, ele aparecerá aqui automaticamente.</p>
          </div>
        )}
      </section>
    </div>
  );
}

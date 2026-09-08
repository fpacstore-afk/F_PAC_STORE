import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { db } from '../lib/firebase';
import { products as staticProducts } from '../data/products';
import { buildSellableCatalog } from '../lib/catalogProducts';
import { getProductUrl, getDisplayPrices } from '../lib/utils';

const CATEGORY_LABELS: Record<string, { title: string; subtitle: string }> = {
  oversized: { title: 'Camisetas Oversized', subtitle: 'Modelagens amplas e coleções streetwear F PAC.' },
  tradicional: { title: 'Camisetas Tradicionais', subtitle: 'Modelagem tradicional e opções em suedine.' },
  casacos: { title: 'Casacos & Moletons', subtitle: 'Peças para sobreposição, conforto e presença.' },
  bones: { title: 'Bonés', subtitle: 'Acessórios para completar o visual F PAC.' },
  chinelos: { title: 'Chinelos & Slides', subtitle: 'Calçados casuais com identidade F PAC.' },
  croppeds: { title: 'Croppeds', subtitle: 'Peças femininas com modelagens próprias.' },
  bermudas: { title: 'Bermudas', subtitle: 'Conforto e versatilidade para compor o look.' },
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
  const meta = CATEGORY_LABELS[category] || { title: 'Produtos', subtitle: 'Explore o catálogo F PAC STORE.' };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      const dynamic = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
      setProducts(buildSellableCatalog(staticProducts, dynamic));
      setLoading(false);
    }, () => {
      setProducts(buildSellableCatalog(staticProducts, []));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => products.filter((product) => matchesCategory(product, category)), [products, category]);

  return (
    <div className="min-h-screen bg-[#fafafa] pb-20 md:pb-28">
      <Helmet>
        <title>{meta.title} | F PAC STORE</title>
        <meta name="description" content={`${meta.title} F PAC STORE. ${meta.subtitle}`} />
      </Helmet>

      <section className="bg-black text-white px-5 sm:px-8 py-10 md:py-14">
        <div className="max-w-7xl mx-auto">
          <Link to="/produtos" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/60 hover:text-[#eab308] mb-6"><ArrowLeft size={15} /> Voltar às categorias</Link>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black uppercase italic tracking-tight">{meta.title}</h1>
          <p className="mt-3 text-white/60 max-w-2xl text-sm md:text-base">{meta.subtitle}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {loading ? (
          <div className="py-20 text-center text-sm font-bold uppercase tracking-widest text-gray-400">Carregando produtos...</div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-7">
            {filtered.map((product) => {
              const image = product.images?.[0] || '/estampas/logo-fpac.png';
              const prices = getDisplayPrices(product);
              return (
                <Link key={product.id || product.slug} to={getProductUrl(product)} className="group bg-white border border-black/10 overflow-hidden shadow-sm hover:shadow-xl transition-all">
                  <div className="aspect-[4/5] bg-black overflow-hidden">
                    <img src={image} alt={product.name || 'Produto F PAC STORE'} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" onError={(e) => { e.currentTarget.src = '/estampas/logo-fpac.png'; }} />
                  </div>
                  <div className="p-5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#eab308]">F PAC STORE</p>
                    <h2 className="mt-1 text-xl font-black uppercase italic text-black leading-tight">{product.name}</h2>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        {prices.hasDiscount && <p className="text-xs text-gray-400 line-through">R$ {prices.originalPrice.toFixed(2).replace('.', ',')}</p>}
                        <p className="font-black text-lg text-black">R$ {prices.effectivePrice.toFixed(2).replace('.', ',')}</p>
                      </div>
                      <ArrowRight size={18} className="text-black group-hover:text-[#eab308] transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto bg-white border border-black/10 p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-black uppercase italic">Novidades em breve</h2>
            <p className="mt-3 text-gray-500 text-sm">Esta categoria já está pronta no site. Assim que os produtos forem cadastrados com o tipo correto, eles aparecerão aqui automaticamente.</p>
            <Link to="/catalog/all" className="mt-6 inline-flex items-center gap-2 bg-black text-white px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Ver catálogo atual <ArrowRight size={15} /></Link>
          </div>
        )}
      </section>
    </div>
  );
}

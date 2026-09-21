import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { products as staticProducts } from '../data/products';
import { buildSellableCatalog } from '../lib/catalogProducts';
import { ProductMockupSprite } from '../components/ProductMockupSprite';
import type { ProductVisualKind } from '../lib/productPresentation';
import { fetchPublicProducts } from '../services/publicProducts';

type CategoryCard = {
  slug: string;
  title: string;
  visualKind?: ProductVisualKind;
  optional?: boolean;
};

const categories: CategoryCard[] = [
  { slug: 'oversized', title: 'Oversized', visualKind: 'oversized' },
  { slug: 'tradicional', title: 'Tradicional', visualKind: 'traditional' },
  { slug: 'croppeds', title: 'Cropped', visualKind: 'cropped' },
  { slug: 'casacos', title: 'Moletom / Casaco', visualKind: 'hoodie' },
  { slug: 'bermudas', title: 'Bermuda', visualKind: 'shorts' },
  { slug: 'bones', title: 'Boné', visualKind: 'cap' },
  { slug: 'chinelos', title: 'Chinelos & Slides', optional: true },
  { slug: 'kits', title: 'Kits F PAC', optional: true },
  { slug: 'acessorios', title: 'Acessórios', optional: true },
];

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const categoryHasProduct = (product: any, slug: string) => {
  const haystack = normalize([product.name, product.headline, product.category, product.productType, product.baseModel, product.fit].filter(Boolean).join(' '));
  if (slug === 'oversized') return haystack.includes('oversized');
  if (slug === 'tradicional') return /tradicional|suedine/.test(haystack);
  if (slug === 'casacos') return /jacket|casaco|moletom|jaqueta/.test(haystack);
  if (slug === 'bones') return /cap|bone|chapeu/.test(haystack);
  if (slug === 'chinelos') return /chinelo|slide|sandalia/.test(haystack);
  if (slug === 'croppeds') return /cropped|feminino/.test(haystack);
  if (slug === 'bermudas') return /shorts|bermuda|short|cargo/.test(haystack);
  if (slug === 'kits') return /kit f ?pac|\bkit\b/.test(haystack);
  if (slug === 'acessorios') return /accessory|acessorio/.test(haystack);
  return false;
};

export default function ProductCategories() {
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => onSnapshot(
    collection(db, 'products'),
    snapshot => {
      const dynamic = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      if (dynamic.length > 0) setProducts(buildSellableCatalog(staticProducts, dynamic));
      else void fetchPublicProducts().then(items => setProducts(buildSellableCatalog(staticProducts, items)));
    },
    () => void fetchPublicProducts().then(items => setProducts(buildSellableCatalog(staticProducts, items))),
  ), []);

  const categoryCounts = useMemo(() => new Map(categories.map(category => [
    category.slug,
    products.filter(product => categoryHasProduct(product, category.slug)).length,
  ])), [products]);

  const categoryProducts = useMemo(() => new Map(categories.map(category => [
    category.slug,
    products.find(product => categoryHasProduct(product, category.slug)),
  ])), [products]);

  const visibleCategories = useMemo(
    () => categories.filter(category => !category.optional || (categoryCounts.get(category.slug) || 0) > 0),
    [categoryCounts],
  );

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-20 md:pb-28">
      <Helmet>
        <title>Produtos | F PAC STORE</title>
        <meta name="description" content="Explore os produtos F PAC STORE por categoria: camisetas oversized, tradicionais, casacos, bonés, chinelos, croppeds oversized, bermudas e mais." />
        <link rel="canonical" href="https://www.fpacstore.com.br/produtos" />
      </Helmet>

      <section className="bg-black text-white px-4 sm:px-8 py-6 md:py-11 overflow-hidden relative">
        <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full border border-white/5" />
        <div className="absolute -left-20 -bottom-28 w-72 h-72 rounded-full border border-[#eab308]/10" />
        <div className="max-w-7xl mx-auto relative z-10 flex items-end justify-between gap-5">
          <div>
            <span className="inline-block text-[#eab308] text-[9px] md:text-xs font-black uppercase tracking-[0.3em] mb-2">Produtos F PAC</span>
            <h1 className="text-3xl sm:text-5xl font-black uppercase italic leading-[0.95] tracking-tight">
              Escolha o que quer <span className="text-[#eab308]">vestir</span>
            </h1>
          </div>
          <Link
            to="/catalog/all"
            className="shrink-0 inline-flex min-h-11 items-center justify-center gap-2 border border-white/20 px-4 py-2 text-[9px] font-black uppercase tracking-[0.16em] hover:border-[#eab308] hover:text-[#eab308] transition-colors"
          >
            Ver tudo <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-8">
        <div className="mb-3 md:mb-5 flex items-center justify-between gap-3">
          <p className="text-[#8a6600] text-[9px] font-black uppercase tracking-[0.24em]">Navegue por categoria</p>
          <p className="text-[10px] font-bold text-black/45">{visibleCategories.length} tipos</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-5">
          {visibleCategories.map(({ slug, title, visualKind }) => {
            const product = categoryProducts.get(slug);
            const image = product?.images?.[0];
            return (
            <Link
              key={slug}
              to={`/produtos/${slug}`}
              className="group overflow-hidden rounded-xl md:rounded-2xl bg-white border border-black/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="aspect-square overflow-hidden bg-[#f4f3ef]">
                {visualKind ? (
                  <ProductMockupSprite kind={visualKind} className="h-full w-full" imageClassName="transition-transform duration-500 group-hover:scale-[1.03]" label={title} />
                ) : (
                  <img src={image || '/estampas/logo-fpac.png'} alt={title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-3 md:p-4 text-black">
                <div className="min-w-0"><h2 className="truncate text-xs md:text-base font-black uppercase">{title}</h2><p className="mt-0.5 text-[7px] md:text-[8px] font-black uppercase tracking-[0.12em] text-[#9a7100]">FORCE · MARK · PRIME</p></div>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black text-white"><ArrowRight size={13} /></span>
              </div>
            </Link>
          )})}
        </div>
      </section>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, PackageSearch } from 'lucide-react';
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
  description: string;
  eyebrow: string;
  visualKind?: ProductVisualKind;
  optional?: boolean;
};

const categories: CategoryCard[] = [
  { slug: 'oversized', title: 'Camisetas Oversized', description: 'Modelagens amplas e coleções streetwear.', eyebrow: 'Streetwear', visualKind: 'oversized' },
  { slug: 'tradicional', title: 'Camisetas Tradicionais', description: 'Modelagens versáteis e clássicas.', eyebrow: 'Essencial', visualKind: 'traditional' },
  { slug: 'croppeds', title: 'Croppeds Oversized', description: 'Modelagem feminina ampla e confortável.', eyebrow: 'Feminino', visualKind: 'cropped' },
  { slug: 'casacos', title: 'Casacos & Moletons', description: 'Conforto e presença para dias frios.', eyebrow: 'Camadas', visualKind: 'hoodie' },
  { slug: 'bermudas', title: 'Bermudas', description: 'Conforto para completar o visual.', eyebrow: 'Composição', visualKind: 'shorts' },
  { slug: 'bones', title: 'Bonés', description: 'Acessórios com identidade F PAC.', eyebrow: 'Acessórios', visualKind: 'cap' },
  { slug: 'chinelos', title: 'Chinelos & Slides', description: 'Lifestyle F PAC.', eyebrow: 'Lifestyle', optional: true },
  { slug: 'kits', title: 'Kits F PAC', description: 'Produtos combinados.', eyebrow: 'Kits', optional: true },
  { slug: 'acessorios', title: 'Acessórios', description: 'Complementos da marca.', eyebrow: 'Complementos', optional: true },
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
          <p className="text-[10px] font-bold text-black/45">{products.length} no catálogo</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-5">
          {visibleCategories.map(({ slug, title, description, eyebrow, visualKind }) => {
            const product = categoryProducts.get(slug);
            const image = product?.images?.[0];
            return (
            <Link
              key={slug}
              to={`/produtos/${slug}`}
              className="group relative min-h-[180px] md:min-h-[290px] overflow-hidden rounded-2xl bg-black border border-black/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            >
              {visualKind ? (
                <ProductMockupSprite kind={visualKind} className="absolute inset-0" imageClassName="transition-transform duration-500 group-hover:scale-[1.03]" label={title} />
              ) : (
                <img src={image || '/estampas/logo-fpac.png'} alt={title} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3.5 md:p-6 text-white">
                <p className="text-[7px] md:text-[9px] font-black uppercase tracking-[0.2em] text-[#f5bd19]">{eyebrow} · {categoryCounts.get(slug) || 0}</p>
                <h2 className="mt-1 text-base md:text-2xl font-black uppercase italic leading-tight">{title}</h2>
                <p className="mt-1 hidden md:block text-xs text-white/65">{description}</p>
                <span className="mt-2 inline-flex items-center gap-1.5 text-[8px] md:text-[9px] font-black uppercase tracking-[0.16em]">Ver produtos <ArrowRight size={13} /></span>
              </div>
            </Link>
          )})}

          <Link
            to="/catalog/all"
            className="group min-h-[180px] md:min-h-[290px] bg-black text-white rounded-2xl p-4 md:p-7 flex flex-col justify-between shadow-xl"
          >
            <div>
              <div className="w-10 h-10 md:w-14 md:h-14 bg-[#eab308] text-black rounded-xl flex items-center justify-center"><PackageSearch size={22} /></div>
              <p className="mt-4 text-[#eab308] text-[8px] font-black uppercase tracking-[0.2em]">Catálogo completo</p>
              <h2 className="mt-1 text-xl md:text-3xl font-black uppercase italic tracking-tight">Todos os produtos</h2>
            </div>
            <span className="mt-4 inline-flex items-center gap-2 text-[8px] md:text-[10px] font-black uppercase tracking-[0.16em] text-[#eab308]">Abrir tudo <ArrowRight size={15} /></span>
          </Link>
        </div>
      </section>
    </div>
  );
}

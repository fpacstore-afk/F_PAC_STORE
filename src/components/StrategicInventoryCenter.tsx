import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Filter,
  Layers3,
  PackageCheck,
  Palette,
  Search,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useInventory } from '../hooks/useInventory';
import { products as staticProducts } from '../data/products';
import { ProductManagementDrawer } from './admin/products/ProductManagementDrawer';
import { cn } from '../lib/utils';


type InventoryGroup = 'all' | 'blank' | 'finished' | 'stamps' | 'other';
type StockState = 'all' | 'ok' | 'low' | 'out';
type SortMode = 'name' | 'stock_desc' | 'stock_asc' | 'critical';

type UnifiedItem = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  group: InventoryGroup;
  category: string;
  line: string;
  image?: string;
  physical: number;
  reserved: number;
  available: number;
  minStock: number;
  sizes: string[];
  colors: string[];
  source: any;
};

function getInventoryTotals(inv: any) {
  if (!inv) return { physical: 0, reserved: 0, available: 0 };
  const variants = Object.values(inv.variants || {}) as any[];
  if (variants.length > 0) {
    const physical = variants.reduce((sum, v) => sum + (Number(v.physicalQuantity ?? v.stock ?? 0) || 0), 0);
    const reserved = variants.reduce((sum, v) => sum + (Number(v.reservedQuantity ?? v.reserved ?? 0) || 0), 0);
    const available = Math.max(0, physical - reserved);
    return { physical, reserved, available };
  }
  const physical = Number(inv.physicalQuantity ?? inv.totalPhysicalStock ?? inv.stock ?? 0) || 0;
  const reserved = Number(inv.reservedQuantity ?? inv.totalReservedStock ?? 0) || 0;
  const available = Number(inv.availableQuantity ?? inv.totalAvailableStock ?? Math.max(0, physical - reserved)) || 0;
  return { physical, reserved, available };
}

function pickImage(item: any) {
  return item?.imageUrl || item?.image || item?.thumbnailUrl || item?.mockupUrl || item?.pngUrl || item?.images?.[0] || '';
}

export function StrategicInventoryCenter() {
  const { inventory, loading: inventoryLoading } = useInventory();
  const [products, setProducts] = useState<any[]>([]);
  const [designs, setDesigns] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [designsLoading, setDesignsLoading] = useState(true);
  const [group, setGroup] = useState<InventoryGroup>('all');
  const [search, setSearch] = useState('');
  const [stockState, setStockState] = useState<StockState>('all');
  const [line, setLine] = useState('all');
  const [category, setCategory] = useState('all');
  const [size, setSize] = useState('all');
  const [color, setColor] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('critical');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState<any | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      const dynamic = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const merged = staticProducts.map(staticP => {
        const match = dynamic.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        return match ? { ...staticP, ...match } : staticP;
      });
      dynamic.forEach((p: any) => {
        if (!merged.some((m: any) => m.id === p.id || m.slug === p.slug)) merged.push(p);
      });
      setProducts(merged);
      setProductsLoading(false);
    }, () => {
      setProducts(staticProducts);
      setProductsLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'designs'), (snap) => {
      setDesigns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDesignsLoading(false);
    }, () => {
      setDesigns([]);
      setDesignsLoading(false);
    });
    return () => unsub();
  }, []);

  const items = useMemo<UnifiedItem[]>(() => {
    const list: UnifiedItem[] = [];

    products.forEach((p: any) => {
      const slug = String(p.slug || p.id || '').trim();
      if (!slug) return;
      const inv = inventory[slug] || inventory[p.id];
      const totals = getInventoryTotals(inv);
      const isBase = p.inventoryKind === 'blank' || ['force', 'mark', 'prime'].includes(slug);
      const isFinished = p.inventoryKind === 'finished' || (!isBase && Boolean(p.parentSlug));
      const resolvedGroup: InventoryGroup = isBase ? 'blank' : isFinished ? 'finished' : 'other';

      list.push({
        id: String(p.id || slug),
        slug,
        name: p.name || slug,
        sku: String(p.sku || slug).toUpperCase(),
        group: resolvedGroup,
        category: String(p.category || p.productType || 'Produto'),
        line: String(p.collection || p.parentSlug || p.linha || 'Outros').toUpperCase(),
        image: pickImage(p),
        physical: totals.physical,
        reserved: totals.reserved,
        available: totals.available,
        minStock: Number(p.minStock ?? 3) || 0,
        sizes: Array.from(new Set((p.sizes || []).map((x: any) => String(x)))) as string[],
        colors: Array.from(new Set((p.colors || []).map((x: any) => String(x?.name || x)))) as string[],
        source: p,
      });
    });

    designs.forEach((d: any) => {
      const slug = String(d.inventorySlug || d.id || '').trim();
      if (!slug) return;
      const inv = inventory[slug];
      const totals = getInventoryTotals(inv);
      list.push({
        id: String(d.id),
        slug,
        name: d.name || d.code || 'Estampa',
        sku: String(d.code || d.id).toUpperCase(),
        group: 'stamps',
        category: String(d.category || 'Estampa'),
        line: String(d.collection || 'ACERVO').toUpperCase(),
        image: pickImage(d),
        physical: totals.physical,
        reserved: totals.reserved,
        available: totals.available,
        minStock: Number(d.minStock ?? 2) || 0,
        sizes: [],
        colors: [],
        source: d,
      });
    });

    return list;
  }, [products, designs, inventory]);

  const optionSets = useMemo(() => {
    const filteredBase = group === 'all' ? items : items.filter(x => x.group === group);
    return {
      lines: Array.from(new Set(filteredBase.map(x => x.line))).sort(),
      categories: Array.from(new Set(filteredBase.map(x => x.category))).sort(),
      sizes: Array.from(new Set(filteredBase.flatMap(x => x.sizes))).sort(),
      colors: Array.from(new Set(filteredBase.flatMap(x => x.colors))).sort(),
    };
  }, [items, group]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredList = items.filter(item => {
      if (group !== 'all' && item.group !== group) return false;
      if (line !== 'all' && item.line !== line) return false;
      if (category !== 'all' && item.category !== category) return false;
      if (size !== 'all' && !item.sizes.includes(size)) return false;
      if (color !== 'all' && !item.colors.includes(color)) return false;
      if (stockState === 'out' && item.available !== 0) return false;
      if (stockState === 'low' && !(item.available > 0 && item.available <= item.minStock)) return false;
      if (stockState === 'ok' && item.available <= item.minStock) return false;
      if (q) {
        const haystack = [item.name, item.sku, item.slug, item.category, item.line, ...item.sizes, ...item.colors].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return [...filteredList].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'stock_desc') return b.available - a.available;
      if (sortMode === 'stock_asc') return a.available - b.available;
      const scoreA = a.available === 0 ? -1000 : a.available <= a.minStock ? a.available - 100 : a.available;
      const scoreB = b.available === 0 ? -1000 : b.available <= b.minStock ? b.available - 100 : b.available;
      return scoreA - scoreB;
    });
  }, [items, group, line, category, size, color, stockState, search, sortMode]);

  const counts = useMemo(() => {
    const count = (g: InventoryGroup) => items.filter(x => x.group === g).length;
    const qty = (g: InventoryGroup) => items.filter(x => x.group === g).reduce((sum, x) => sum + x.available, 0);
    const critical = items.filter(x => x.available === 0 || x.available <= x.minStock).length;
    return {
      blankItems: count('blank'),
      blankQty: qty('blank'),
      finishedItems: count('finished'),
      finishedQty: qty('finished'),
      stampItems: count('stamps'),
      stampQty: qty('stamps'),
      critical,
    };
  }, [items]);

  const activeFilterCount = [stockState !== 'all', line !== 'all', category !== 'all', size !== 'all', color !== 'all'].filter(Boolean).length;

  const resetFilters = () => {
    setSearch('');
    setStockState('all');
    setLine('all');
    setCategory('all');
    setSize('all');
    setColor('all');
    setSortMode('critical');
  };

  const groupButtons: { id: InventoryGroup; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'all', label: 'Tudo', icon: Boxes },
    { id: 'blank', label: 'Camisas lisas', icon: Shirt },
    { id: 'finished', label: 'Personalizadas prontas', icon: PackageCheck },
    { id: 'stamps', label: 'Estampas', icon: Palette },
    { id: 'other', label: 'Outros produtos', icon: Layers3 },
  ];

  const loading = inventoryLoading || productsLoading || designsLoading;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3">
        <SummaryCard label="Camisas lisas" value={counts.blankQty} sub={`${counts.blankItems} cadastros`} icon={Shirt} />
        <SummaryCard label="Personalizadas prontas" value={counts.finishedQty} sub={`${counts.finishedItems} produtos`} icon={PackageCheck} />
        <SummaryCard label="Estampas" value={counts.stampQty} sub={`${counts.stampItems} artes`} icon={Palette} />
        <SummaryCard label="Atenção" value={counts.critical} sub="itens críticos/zerados" icon={AlertTriangle} danger />
      </section>

      <section className="bg-white border border-black/10 shadow-sm">
        <div className="p-3 sm:p-4 border-b border-black/10 sticky top-0 z-20 bg-white/95 backdrop-blur">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar produto, SKU, cor, tamanho ou estampa..."
                className="w-full h-11 pl-10 pr-10 bg-[#f7f7f5] border border-black/10 text-sm font-semibold outline-none focus:border-[#eab308]"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 hover:text-black"><X size={16} /></button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setShowAdvanced(v => !v)}
                className={cn('h-11 px-4 border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 whitespace-nowrap', showAdvanced || activeFilterCount > 0 ? 'bg-black text-[#eab308] border-black' : 'bg-white border-black/10')}
              >
                <Filter size={15} /> Filtros {activeFilterCount > 0 ? `(${activeFilterCount})` : ''} {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)} className="h-11 px-3 border border-black/10 bg-white text-[10px] font-black uppercase tracking-wider outline-none">
                <option value="critical">Prioridade: críticos</option>
                <option value="name">Nome A–Z</option>
                <option value="stock_desc">Maior estoque</option>
                <option value="stock_asc">Menor estoque</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-none pb-1">
            {groupButtons.map(btn => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.id}
                  onClick={() => {
                    setGroup(btn.id);
                    setLine('all');
                    setCategory('all');
                    setSize('all');
                    setColor('all');
                  }}
                  className={cn('shrink-0 h-10 px-3.5 border text-[10px] font-black uppercase tracking-wide flex items-center gap-2', group === btn.id ? 'bg-[#eab308] text-black border-[#eab308]' : 'bg-[#f7f7f5] border-black/10 text-black/60')}
                >
                  <Icon size={14} /> {btn.label}
                </button>
              );
            })}
          </div>

          {showAdvanced && (
            <div className="mt-3 p-3 bg-[#f7f7f5] border border-black/10 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
              <FilterSelect label="Estoque" value={stockState} onChange={setStockState} options={[
                ['all', 'Todos'], ['ok', 'Normal'], ['low', 'Baixo'], ['out', 'Zerado'],
              ]} />
              <FilterSelect label="Linha" value={line} onChange={setLine} options={[['all', 'Todas'], ...optionSets.lines.map(v => [v, v])]} />
              <FilterSelect label="Categoria" value={category} onChange={setCategory} options={[['all', 'Todas'], ...optionSets.categories.map(v => [v, v])]} />
              <FilterSelect label="Tamanho" value={size} onChange={setSize} options={[['all', 'Todos'], ...optionSets.sizes.map(v => [v, v])]} />
              <FilterSelect label="Cor" value={color} onChange={setColor} options={[['all', 'Todas'], ...optionSets.colors.map(v => [v, v])]} />
              <div className="flex items-end">
                <button onClick={resetFilters} className="w-full h-10 bg-white border border-black/10 text-[9px] font-black uppercase tracking-wider hover:border-black">Limpar filtros</button>
              </div>
            </div>
          )}
        </div>

        <div className="px-3 sm:px-4 py-2.5 bg-black text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[10px]">
          <div className="flex items-center gap-2"><SlidersHorizontal size={14} className="text-[#eab308]" /><b className="uppercase tracking-widest">{filtered.length} itens encontrados</b></div>
          <div className="text-white/55">Físico = total em mãos • Reservado = pedidos aprovados • Disponível = pode vender agora</div>
        </div>

        <div className="divide-y divide-black/5">
          {loading ? (
            <div className="p-10 text-center text-[10px] font-black uppercase tracking-widest text-black/40">Sincronizando estoque...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Search size={28} className="mx-auto text-black/20 mb-3" />
              <p className="text-sm font-black uppercase">Nenhum item encontrado</p>
              <button onClick={resetFilters} className="mt-2 text-[10px] font-black uppercase underline">Limpar filtros</button>
            </div>
          ) : filtered.map(item => (
            <InventoryRow key={`${item.group}-${item.id}`} item={item} onEdit={() => item.group !== 'stamps' && setDrawerProduct(item.source)} />
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-3">
        <div className="bg-black text-white p-4 sm:p-5 border-l-4 border-[#eab308]">
          <div className="flex items-start gap-3">
            <Sparkles size={19} className="text-[#eab308] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black uppercase">Regra de produção personalizada</h3>
              <p className="mt-2 text-xs leading-relaxed text-white/60">A gestão deve tratar a peça personalizada como composição de insumos: 1 camisa lisa da cor/tamanho escolhidos + as estampas aplicadas. O estoque pronto fica separado do estoque de matéria-prima.</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 sm:p-5 border border-black/10">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={19} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black uppercase">Escalável para novos produtos</h3>
              <p className="mt-2 text-xs leading-relaxed text-black/55">Busca única, filtros recolhíveis e segmentação por tipo evitam uma página enorme quando o catálogo crescer. Você consegue chegar ao item por SKU, nome, cor, tamanho, linha ou categoria.</p>
            </div>
          </div>
        </div>
      </section>

      <ProductManagementDrawer
        isOpen={Boolean(drawerProduct)}
        onClose={() => setDrawerProduct(null)}
        product={drawerProduct}
      />
    </div>
  );
}

function SummaryCard({ label, value, sub, icon: Icon, danger = false }: any) {
  return (
    <div className="bg-white border border-black/10 p-3 sm:p-4 flex items-center justify-between gap-3 shadow-sm">
      <div>
        <span className="text-[8px] font-black uppercase tracking-widest text-black/40 block">{label}</span>
        <span className={cn('text-2xl font-black tracking-tight block mt-0.5', danger && 'text-rose-600')}>{value}</span>
        <span className="text-[9px] text-black/45">{sub}</span>
      </div>
      <div className={cn('w-10 h-10 flex items-center justify-center bg-black text-[#eab308]', danger && 'bg-rose-50 text-rose-600')}><Icon size={19} /></div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: any) {
  return (
    <label>
      <span className="block mb-1 text-[8px] font-black uppercase tracking-wider text-black/40">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full h-10 px-2 bg-white border border-black/10 text-[10px] font-bold outline-none focus:border-[#eab308]">
        {options.map(([v, text]: [string, string]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

function InventoryRow({ item, onEdit }: { item: UnifiedItem; onEdit: () => void }) {
  const out = item.available === 0;
  const low = !out && item.available <= item.minStock;
  const groupLabel = item.group === 'blank' ? 'Lisa' : item.group === 'finished' ? 'Personalizada pronta' : item.group === 'stamps' ? 'Estampa' : 'Produto';

  return (
    <div className="p-3 sm:p-4 hover:bg-black/[0.015] transition-colors">
      <div className="grid grid-cols-[56px_1fr] lg:grid-cols-[58px_minmax(220px,1.4fr)_110px_110px_110px_120px_44px] gap-3 items-center">
        <div className="w-14 h-14 bg-[#f2f2ef] border border-black/5 overflow-hidden flex items-center justify-center">
          {item.image ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Boxes size={20} className="text-black/20" />}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-black uppercase truncate">{item.name}</h4>
            <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 bg-black text-white">{groupLabel}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-black/45 font-bold uppercase">
            <span>SKU {item.sku}</span><span>{item.line}</span><span>{item.category}</span>
          </div>
          {(item.sizes.length > 0 || item.colors.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.sizes.slice(0, 5).map(s => <span key={s} className="px-1.5 py-0.5 bg-[#f2f2ef] text-[8px] font-black">{s}</span>)}
              {item.colors.slice(0, 3).map(c => <span key={c} className="px-1.5 py-0.5 bg-[#fff8dc] text-[8px] font-black">{c}</span>)}
            </div>
          )}
        </div>

        <StockCell label="Físico" value={item.physical} className="hidden lg:block" />
        <StockCell label="Reservado" value={item.reserved} className="hidden lg:block" />
        <StockCell label="Disponível" value={item.available} className="hidden lg:block" strong />

        <div className="hidden lg:block">
          <span className={cn('inline-flex px-2.5 py-1 text-[8px] font-black uppercase tracking-wider', out ? 'bg-rose-100 text-rose-700' : low ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700')}>
            {out ? 'Esgotado' : low ? 'Estoque baixo' : 'Normal'}
          </span>
        </div>

        {item.group !== 'stamps' ? (
          <button onClick={onEdit} className="hidden lg:flex w-9 h-9 border border-black/10 items-center justify-center hover:bg-black hover:text-[#eab308]" title="Editar produto"><Edit3 size={15} /></button>
        ) : <div className="hidden lg:block" />}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 lg:hidden">
        <CompactStock label="Físico" value={item.physical} />
        <CompactStock label="Reservado" value={item.reserved} />
        <CompactStock label="Disponível" value={item.available} strong />
      </div>
      <div className="mt-2 flex lg:hidden items-center justify-between gap-2">
        <span className={cn('px-2 py-1 text-[8px] font-black uppercase tracking-wider', out ? 'bg-rose-100 text-rose-700' : low ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700')}>
          {out ? 'Esgotado' : low ? 'Estoque baixo' : 'Normal'}
        </span>
        {item.group !== 'stamps' && <button onClick={onEdit} className="h-8 px-3 border border-black/10 text-[8px] font-black uppercase flex items-center gap-1.5"><Edit3 size={12} /> Editar</button>}
      </div>
    </div>
  );
}

function StockCell({ label, value, strong = false, className = '' }: any) {
  return <div className={className}><span className="block text-[8px] font-black uppercase tracking-wider text-black/35">{label}</span><span className={cn('text-sm font-black', strong && 'text-lg')}>{value}</span></div>;
}

function CompactStock({ label, value, strong = false }: any) {
  return <div className="bg-[#f7f7f5] border border-black/5 p-2"><span className="block text-[7px] uppercase font-black text-black/35">{label}</span><span className={cn('text-sm font-black', strong && 'text-base')}>{value}</span></div>;
}

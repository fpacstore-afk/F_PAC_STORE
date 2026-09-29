import { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { manualProductIdentity, matchesManualProduct } from '../../lib/manualProductIdentity';

export function ManualProductPicker({ products, selected, onSelect, formatPrice, label = 'Escolha o produto' }: {
  products: any[]; selected: any; onSelect: (product: any) => void; formatPrice: (value: number) => string; label?: string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(true);
  const [model, setModel] = useState('');
  const [limit, setLimit] = useState(12);
  const models = useMemo(() => [...new Set(products.map(p => String(p.baseModel || p.fit || p.productType || '')).filter(Boolean))].sort(), [products]);
  const filtered = useMemo(() => products.filter(p => (!model || (p.baseModel || p.fit || p.productType) === model) && matchesManualProduct(p, search)), [products, search, model]);
  return <div className="min-w-0 space-y-2">
    <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase text-gray-500">{label}</span>{selected && <button type="button" onClick={() => setOpen(!open)} className="min-h-10 px-2 text-xs font-bold underline">{open ? 'Fechar lista' : 'Trocar produto'}</button>}</div>
    {selected && <div className="flex items-center gap-3 rounded-lg border border-amber-400 bg-amber-50 p-2"><ProductImage product={selected} /><div className="min-w-0"><b className="block break-words text-xs">{manualProductIdentity(selected).displayName}</b><span className="block text-xs">{manualProductIdentity(selected).reference}</span><strong className="text-xs">{formatPrice(selected.price)}</strong></div><Check className="ml-auto shrink-0" size={16} /></div>}
    {(open || !selected) && <><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><label className="relative block"><Search size={16} className="absolute left-3 top-3.5 text-gray-400" /><input aria-label="Buscar produto para o pedido" value={search} onChange={e => { setSearch(e.target.value); setLimit(12); }} placeholder="Nome, estampa ou referência..." className="min-h-11 w-full rounded-lg border border-black/15 bg-white py-2 pl-9 pr-3 text-sm" /></label><select aria-label="Filtrar modelo da peça" value={model} onChange={e => { setModel(e.target.value); setLimit(12); }} className="min-h-11 rounded-lg border border-black/15 bg-white px-3 text-xs"><option value="">Todos os modelos</option>{models.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
    <p aria-live="polite" className="text-xs text-gray-500">{filtered.length} produto(s) encontrado(s)</p>
    <div aria-label="Produtos para o pedido" className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-black/10 bg-white">
      {filtered.slice(0, limit).map(p => { const identity = manualProductIdentity(p); return <button type="button" key={p.id || p.slug} aria-pressed={selected?.id === p.id} onClick={() => { onSelect(p); setOpen(false); }} className="flex min-h-20 w-full items-center gap-3 border-b border-black/5 p-2 text-left last:border-b-0 hover:bg-amber-50 focus-visible:bg-amber-50">
        <ProductImage product={p} /><span className="min-w-0 flex-1"><b className="block break-words text-xs text-black">{identity.reference}</b><span className="block text-xs text-gray-600">{p.name}</span><span className="block text-[11px] text-gray-500">{identity.details}</span><strong className="block text-xs text-black">{formatPrice(p.price)}</strong></span>
      </button>; })}
      {!filtered.length && <p className="p-4 text-sm text-gray-500">Nenhum produto encontrado.</p>}
    </div>{filtered.length > limit && <button type="button" onClick={() => setLimit(value => value + 12)} className="min-h-11 w-full rounded-lg border border-black/15 text-xs font-bold">Mostrar mais 12 produtos</button>}</>}
  </div>;
}

function ProductImage({ product }: { product: any }) {
  const { image } = manualProductIdentity(product);
  return image ? <img src={image} alt={product.name || 'Produto'} loading="lazy" decoding="async" className="h-16 w-14 shrink-0 rounded bg-gray-100 object-contain" /> : <span className="grid h-16 w-14 shrink-0 place-items-center rounded bg-gray-100 text-center text-[10px] text-gray-500">Sem foto</span>;
}

import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function stampImage(stamp: any): string {
  return stamp?.thumbnailUrl || stamp?.mockupUrl || stamp?.pngUrl || stamp?.imageUrl || stamp?.image || '';
}

export function ManualStampPicker({ stamps, selectedIds, onChange, max = 3 }: { stamps: any[]; selectedIds: string[]; onChange: (ids: string[]) => void; max?: number; }) {
  const [search, setSearch] = useState('');
  const available = useMemo(() => stamps.filter((stamp) => {
    const text = normalize([stamp.name, stamp.code, stamp.sku, stamp.id].join(' '));
    return normalize(search).trim().split(/\s+/).every((term) => text.includes(term));
  }), [stamps, search]);
  const selected = selectedIds.map((id) => stamps.find((stamp) => stamp.id === id)).filter(Boolean);
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase text-gray-500">Estampas do produto ({selected.length}/{max})</span><span className="text-[9px] font-bold text-gray-400">Escolha até 3</span></div>
    {selected.length > 0 && <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{selected.map((stamp: any, index) => <div key={stamp.id} className="flex min-w-0 items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2"><StampThumb stamp={stamp} /><div className="min-w-0 flex-1"><b className="block truncate text-[10px]">{index + 1}. {stamp.name || stamp.code || stamp.id}</b><span className="block truncate text-[9px] text-gray-500">{stamp.code || stamp.sku || stamp.id}</span></div><button type="button" aria-label={`Remover ${stamp.name || 'estampa'}`} onClick={() => onChange(selectedIds.filter((id) => id !== stamp.id))} className="grid h-9 w-9 shrink-0 place-items-center rounded hover:bg-black hover:text-white"><X size={14} /></button></div>)}</div>}
    {selected.length < max && <><label className="relative block"><Search size={16} className="absolute left-3 top-3.5 text-gray-400" /><input aria-label="Buscar estampa" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, código ou referência..." className="min-h-11 w-full rounded-lg border border-black/15 bg-white py-2 pl-9 pr-3 text-sm" /></label><div className="max-h-56 overflow-y-auto rounded-lg border border-black/10 bg-white">{available.filter((stamp) => !selectedIds.includes(stamp.id)).map((stamp) => <button type="button" key={stamp.id} onClick={() => onChange([...selectedIds, stamp.id].slice(0, max))} className="flex min-h-16 w-full items-center gap-3 border-b border-black/5 p-2 text-left last:border-b-0 hover:bg-amber-50"><StampThumb stamp={stamp} /><span className="min-w-0"><b className="block break-words text-xs">{stamp.name || stamp.code || 'Estampa'}</b><span className="block text-[10px] text-gray-500">{stamp.code || stamp.sku || stamp.id}{stamp.status === 'unavailable' ? ' · indisponível' : ''}</span></span></button>)}{!available.length && <p className="p-4 text-sm text-gray-500">Nenhuma estampa encontrada.</p>}</div></>}
  </div>;
}

export function StampThumb({ stamp }: { stamp: any }) {
  const image = stampImage(stamp);
  return image ? <img src={image} alt={stamp.name || 'Estampa'} loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded bg-gray-100 object-contain" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded bg-gray-100 text-[9px] text-gray-500">Sem foto</span>;
}

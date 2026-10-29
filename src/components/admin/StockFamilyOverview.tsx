import React from 'react';
import { ArrowRight, Package, ChevronLeft } from 'lucide-react';
import { summarizeStockFamilies, type StockFamilyId } from '../../../shared/stockFamilies';

export function StockFamilyOverview({ items, selected, onSelect, loading }: { items: any[]; selected: StockFamilyId | null; onSelect: (family: StockFamilyId | null) => void; loading: boolean }) {
  const families = summarizeStockFamilies(items);
  return <section aria-label="Estoque por tipo de produto" className="mx-auto max-w-7xl space-y-4 px-4 md:px-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-black text-black">Seu estoque em 7 tipos de produto</h2><p className="mt-1 text-sm text-neutral-600">Escolha uma peça para gerenciar golas, tecidos, fornecedores, cores e tamanhos.</p></div>
      {selected && <button type="button" onClick={() => onSelect(null)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-black/15 px-3 text-xs font-bold"><ChevronLeft size={16} /> Voltar aos 7 tipos</button>}
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {families.map(family => <button key={family.id} type="button" aria-pressed={selected === family.id} onClick={() => onSelect(family.id)} className={`rounded-xl border p-4 text-left transition-colors ${selected === family.id ? 'border-black bg-black text-white' : 'border-black/10 bg-white text-black hover:border-amber-500'}`}>
        <div className="flex items-start justify-between gap-3"><h3 className="min-h-10 text-sm font-black">{family.label}</h3><Package size={18} className="shrink-0 text-amber-600" /></div>
        <p className="my-3 text-3xl font-black tabular-nums">{loading ? '…' : family.physical}<span className="ml-2 text-xs font-medium opacity-60">peças físicas</span></p>
        {family.collars && <div className="mb-3 grid grid-cols-2 gap-2 text-xs"><span>Gola tradicional<strong className="block tabular-nums">{loading ? '…' : family.classic}</strong></span><span>Gola alta<strong className="block tabular-nums">{loading ? '…' : family.high}</strong></span></div>}
        {family.unclassified > 0 && <p className={`mb-3 rounded-md px-2 py-1 text-xs font-bold ${selected === family.id ? 'bg-amber-300 text-black' : 'bg-amber-50 text-amber-900'}`}>{family.unclassified} peças com gola a conferir</p>}
        <p className="text-xs opacity-65">{loading ? 'Conferindo saldos…' : `${family.plain} lisas · ${family.printed} estampadas`}</p>
        <span className="mt-4 flex items-center justify-between border-t border-current/10 pt-3 text-xs font-bold">Gerenciar este tipo <ArrowRight size={15} /></span>
      </button>)}
    </div>
    <p className="text-xs leading-relaxed text-neutral-500">Os totais somam cada estoque físico uma única vez. Quantidades sem identificação de gola continuam preservadas para conferência; não são atribuídas automaticamente a um modelo.</p>
  </section>;
}

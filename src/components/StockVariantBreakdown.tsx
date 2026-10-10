import React from 'react';
import type { StockVariantRow, StockVariantStatus } from '../lib/stockVariantRows';
import { summarizeStockVariants } from '../lib/stockVariantRows';

const STATUS = {
  inactive: { label: 'Inativo', style: 'border-neutral-200 bg-neutral-100 text-neutral-600' },
  out: { label: 'Esgotado', style: 'border-rose-200 bg-rose-50 text-rose-800' },
  critical: { label: 'Crítico', style: 'border-amber-200 bg-amber-50 text-amber-900' },
  safe: { label: 'Seguro', style: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  unallocated: { label: 'Sem detalhamento', style: 'border-blue-200 bg-blue-50 text-blue-800' },
} satisfies Record<StockVariantStatus, { label: string; style: string }>;

export function StockVariantStatusSummary({ rows }: { rows: StockVariantRow[] }) {
  const summary = summarizeStockVariants(rows);
  return (
    <span className="inline-flex flex-wrap justify-center gap-1 text-[8px] font-black uppercase tracking-wide">
      <span className="rounded-sm bg-emerald-50 px-1.5 py-1 text-emerald-800">{rows.filter(row => row.status === 'safe').length} seguros</span>
      {summary.criticalCount > 0 && <span className="rounded-sm bg-amber-50 px-1.5 py-1 text-amber-900">{summary.criticalCount} críticos</span>}
      {summary.outCount > 0 && <span className="rounded-sm bg-rose-50 px-1.5 py-1 text-rose-800">{summary.outCount} esgotados</span>}
      {summary.inactiveCount > 0 && <span className="rounded-sm bg-neutral-100 px-1.5 py-1 text-neutral-600">{summary.inactiveCount} inativos</span>}
      {rows.some(row => row.status === 'unallocated') && <span className="rounded-sm bg-blue-50 px-1.5 py-1 text-blue-800">Sem detalhamento</span>}
    </span>
  );
}

export function StockVariantBreakdown({ rows }: { rows: StockVariantRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-white" onClick={event => event.stopPropagation()}>
      <table className="w-full min-w-[660px] border-collapse text-left text-[10px]">
        <thead className="bg-neutral-100 text-[9px] font-black uppercase tracking-wider text-neutral-600">
          <tr>
            <th className="p-2.5">Cor / tamanho</th>
            <th className="p-2.5">SKU / referência</th>
            <th className="p-2.5 text-center">Físico</th>
            <th className="p-2.5 text-center">Reservado</th>
            <th className="p-2.5 text-center">Disponível</th>
            <th className="p-2.5 text-center">Mínimo</th>
            <th className="p-2.5 text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.map(row => (
            <tr key={row.key} className="hover:bg-neutral-50">
              <td className="p-2.5 font-bold text-black">{row.color} / {row.size}</td>
              <td className="break-all p-2.5 font-mono text-neutral-700 select-all">{row.sku}</td>
              <td className="p-2.5 text-center tabular-nums">{row.physical}</td>
              <td className="p-2.5 text-center tabular-nums">{row.reserved}</td>
              <td className="p-2.5 text-center font-black tabular-nums">{row.available}</td>
              <td className="p-2.5 text-center tabular-nums">{row.minimum}</td>
              <td className="p-2.5 text-center"><span className={`inline-block whitespace-nowrap border px-2 py-1 font-black uppercase ${STATUS[row.status].style}`}>{STATUS[row.status].label}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some(row => row.status === 'unallocated') && <p className="border-t border-blue-100 bg-blue-50 px-3 py-2 text-[10px] text-blue-900">Este saldo antigo não informa cor e tamanho. Confira a matriz de estoque antes de distribuí-lo.</p>}
    </div>
  );
}

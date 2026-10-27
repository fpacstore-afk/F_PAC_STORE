import React, { useMemo, useState } from 'react';
import { Download, FileText, Printer, AlertTriangle } from 'lucide-react';
import { financialDateKey } from '../../../../shared/cashFlow';
import { buildMeiMonthlyPreview, type MeiRevenueRow } from '../../../../shared/meiRevenuePreview';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';

interface MeiReportProps { orders: any[]; onOpenOrder?: (order: any) => void }
const dateLabel = (value: string) => value ? value.split('-').reverse().join('/') : '—';
const statusLabel: Record<MeiRevenueRow['status'], string> = {
  candidate: 'Candidato à receita', review: 'Conferir', before_registration: 'Antes do MEI'
};
function csvCell(value: unknown) {
  const input = String(value ?? '').replace(/"/g, '""');
  const safe = /^[\s]*[=+@\-\t\r]/.test(input) ? "'" + input : input;
  return '"' + safe + '"';
}
function exportCsv(rows: MeiRevenueRow[], month: string) {
  const values = [
    ['Pedido', 'Data da venda (provisória)', 'Origem', 'Total do pedido (R$)', 'Recebido (R$)', 'Reembolsado (R$)', 'Classificação', 'Pendência/observação'],
    ...rows.map(row => [
      row.id, row.date, row.channel, row.amount.toFixed(2).replace('.', ','),
      row.received.toFixed(2).replace('.', ','), row.refunded.toFixed(2).replace('.', ','),
      statusLabel[row.status], row.reason
    ])
  ];
  const csv = '\uFEFF' + values.map(row => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fpac_previa_receita_mei_${month}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function MeiRevenueReport({ orders, onOpenOrder }: MeiReportProps) {
  const { formatMoney, showFinancialValues } = useFinancialPrivacy();
  const [month, setMonth] = useState(() => (financialDateKey(new Date()) || '2026-10-01').slice(0, 7));
  const [registrationDate, setRegistrationDate] = useState(() => localStorage.getItem('fpac_mei_registration_date_draft') || '');
  const preview = useMemo(
    () => buildMeiMonthlyPreview(orders, month, registrationDate),
    [orders, month, registrationDate]
  );
  const rows = useMemo(() =>
    [...preview.candidates, ...preview.review, ...preview.beforeRegistration].sort((a, b) =>
      b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
    ), [preview]);
  const hasMonthOrders = rows.length > 0;
  const cards = [
    { title: 'Receita candidata à conferência', value: preview.candidateGross, hint: `${preview.candidates.length} pedido(s) com pagamento integral registrado` },
    { title: 'Valores pendentes de revisão', value: preview.reviewGross, hint: `${preview.review.length} pedido(s) não somados à receita candidata` },
    { title: 'Histórico anterior ao MEI', value: preview.preRegistrationGross, hint: `${preview.beforeRegistration.length} pedido(s) separados` }
  ];
  return <section id="mei-report" className="space-y-5 bg-white border border-black/10 rounded-xl p-4 md:p-6">
    <style>{`@media print {body * {visibility:hidden!important;} #mei-report, #mei-report * {visibility:visible!important;} #mei-report {position:absolute!important;inset:0 auto auto 0!important;width:100%!important;border:none!important;} #mei-report .mei-no-print {display:none!important;} }`}</style>
    <header className="flex flex-col lg:flex-row gap-3 lg:items-start lg:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">F PAC · Controle de faturamento</p>
        <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">Relatório mensal — preparação MEI</h2>
        <p className="text-sm text-gray-600 mt-2 max-w-3xl">Prévia de conferência com base nos pedidos registrados no site. Não é a declaração anual, não emite nota fiscal nem substitui o Relatório Mensal de Receitas Brutas oficial.</p>
      </div>
      <div className="mei-no-print flex flex-wrap gap-2">
        <button type="button" onClick={() => exportCsv(rows, month)} disabled={!showFinancialValues}
          title={!showFinancialValues ? 'Exiba os valores financeiros antes de exportar.' : undefined}
          className="flex items-center gap-2 px-3 py-2 bg-black text-white font-bold text-xs disabled:opacity-50"><Download size={15} /> Exportar CSV</button>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 border border-black/20 font-bold text-xs"><Printer size={15} /> Imprimir / salvar PDF</button>
      </div>
    </header>

    <div className="mei-no-print grid sm:grid-cols-2 gap-4 bg-gray-50 border p-4">
      <label className="flex flex-col gap-1 text-xs font-bold">Mês de referência
        <input aria-label="Mês de referência" type="month" value={month} onChange={e => { if (e.target.validity.valid && e.target.value) setMonth(e.target.value); }} className="px-3 py-2 border bg-white text-base" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">Data de abertura do MEI (opcional, quando houver)
        <input aria-label="Data de abertura do MEI" type="date" value={registrationDate} onChange={e => {
          setRegistrationDate(e.target.value);
          if (e.target.value) localStorage.setItem('fpac_mei_registration_date_draft', e.target.value);
          else localStorage.removeItem('fpac_mei_registration_date_draft');
        }} className="px-3 py-2 border bg-white text-base" />
      </label>
      <p className="sm:col-span-2 text-xs text-gray-600">A data informada fica salva somente neste navegador. Antes da formalização, deixe em branco: todas as vendas são apenas um histórico para planejamento, não faturamento declarado do MEI.</p>
    </div>

    <div className="grid sm:grid-cols-3 gap-3">{cards.map(card => <article key={card.title} className="border bg-white p-4">
      <p className="text-[11px] uppercase font-bold text-gray-500">{card.title}</p>
      <p className="text-xl font-black mt-1">{formatMoney(card.value)}</p>
      <p className="text-xs text-gray-600 mt-1">{card.hint}</p>
    </article>)}</div>

    <div className="flex gap-2 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950" role="status">
      <AlertTriangle className="shrink-0" size={18} />
      <div className="space-y-1">
        <p className="font-bold">{!registrationDate ? 'MEI ainda não informado: relatório apenas para planejamento.' : 'Conferência fiscal necessária antes de declarar.'}</p>
        <p>Esta prévia usa a data de criação do pedido como aproximação da data da venda e o valor total do pedido, possivelmente com frete. Não usa data de recebimento para inventar competência. Verifique notas, fretes, descontos, cancelamentos, devoluções, serviços e o regime aplicável com orientação fiscal.</p>
        <p>Vendas na Shopee, Mercado Livre, Amazon ou WhatsApp só aparecem aqui se estiverem registradas nos pedidos do sistema. Pedidos não cadastrados e valores sem data precisam ser adicionados e conferidos antes do relatório oficial.</p>
        {preview.missingDateCount > 0 && <p className="font-bold">{preview.missingDateCount} pedido(s) carregado(s) sem data não puderam ser atribuídos ao mês.</p>}
      </div>
    </div>

    <div className="overflow-x-auto">
      <div className="flex items-center gap-2 mb-3"><FileText size={18} /><h3 className="font-black uppercase text-sm">Detalhamento dos pedidos — {month}</h3></div>
      {!hasMonthOrders ? <p className="text-sm text-gray-500 border p-5">Nenhum pedido encontrado neste mês nos dados carregados.</p> :
      <table className="w-full min-w-[690px] text-xs text-left">
        <thead className="bg-black text-white"><tr><th className="p-3">Data</th><th className="p-3">Pedido / canal</th><th className="p-3">Valor bruto</th><th className="p-3">Classificação</th><th className="p-3">Conferência</th></tr></thead>
        <tbody>{rows.slice(0, 100).map(row => <tr key={row.id} className="border-b align-top">
          <td className="p-3 whitespace-nowrap">{dateLabel(row.date)}</td>
          <td className="p-3"><button type="button" className="font-bold underline mei-no-print" onClick={() => onOpenOrder?.(orders.find(o => String(o.id) === row.id))}>#{row.id}</button><span className="hidden print:inline">#{row.id}</span><br /><span className="text-gray-500">{row.channel}</span></td>
          <td className="p-3 font-bold whitespace-nowrap">{formatMoney(row.amount)}</td>
          <td className="p-3">{statusLabel[row.status]}</td>
          <td className="p-3 text-gray-600">{row.reason}</td>
        </tr>)}</tbody>
      </table>}
      {rows.length > 100 && <p className="p-2 text-sm text-amber-900">Exibindo os 100 primeiros pedidos. O CSV contém os {rows.length} registros.</p>}
    </div>
    <footer className="text-xs text-gray-500 border-t pt-3">
      Gerado para conferência administrativa em {dateLabel(financialDateKey(new Date()) || '')}. Valor bruto não é lucro. Este documento não é comprovante fiscal, nem comprovação de abertura do MEI.
    </footer>
  </section>;
}

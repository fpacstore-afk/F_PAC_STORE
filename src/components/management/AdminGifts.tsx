import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Download, Gift, Package, Plus, Search, TrendingUp } from 'lucide-react';
import { useFinancialPrivacy } from '../../context/FinancialPrivacyContext';
import { dashboardPeriodRange } from '../../../shared/financialDashboard';
import { financialDateKey } from '../../../shared/cashFlow';
import { receiptPeriodRange, type ReceiptRange } from '../../../shared/financialReceipts';
import { giftMonthlyTrend, giftReportCsv, giftReportRows, giftSalesRatio, giftsInRange, GIFT_STATE_LABELS, summarizeGiftRows, type GiftState } from '../../../shared/giftReporting';

type Props = { orders: any[]; products?: any[]; loading?: boolean; error?: boolean; onNewGift?: () => void };
const count = new Intl.NumberFormat('pt-BR');

export function GiftReportView({ orders, products = [], loading = false, error = false, onNewGift }: Props) {
  const { formatMoney, formatPercent, showFinancialValues } = useFinancialPrivacy();
  const [period, setPeriod] = useState('all'), [start, setStart] = useState(''), [end, setEnd] = useState('');
  const [search, setSearch] = useState(''), [status, setStatus] = useState<GiftState | 'all'>('all');
  const allRows = useMemo(() => giftReportRows(orders, products), [orders, products]);
  const range: ReceiptRange = period === 'all' ? null : period === 'month' ? receiptPeriodRange('current_month')
    : period === 'custom' ? { start, end } : dashboardPeriodRange(Number(period));
  const invalidRange = period === 'custom' && (!start || !end || start > end);
  const periodRows = invalidRange ? [] : giftsInRange(allRows, range), summary = summarizeGiftRows(periodRows), historic = summarizeGiftRows(allRows);
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const visibleRows = periodRows.filter(row => (status === 'all' || row.state === status) && (!query || [row.id, row.name, row.reason, ...row.items.map(item => item.name)].some(value => value.toLocaleLowerCase('pt-BR').includes(query))));
  const trend = giftMonthlyTrend(allRows), max = Math.max(1, ...trend.map(row => row.cost));
  const ratio = giftSalesRatio(orders, summary.delivered.knownCost, range);
  const deliveredPartial = periodRows.some(row => row.state === 'delivered' && (row.pendingUnits > 0 || row.shippingMissing || row.missingItems || row.costConflict));
  const exportCsv = () => {
    if (!showFinancialValues) return;
    const url = URL.createObjectURL(new Blob([giftReportCsv(visibleRows)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');link.href = url;link.download = `brindes-fpac-${financialDateKey(new Date())}.csv`;link.click();setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">Não foi possível consultar os brindes. Recarregue a gestão para tentar novamente; os totais não estão disponíveis.</p>;
  if (loading) return <p role="status" className="p-5 text-sm">Carregando os pedidos para conferir os brindes...</p>;
  const metric = (label: string, value: string, hint: string) => <div key={label} className="min-w-0 rounded-xl border border-black/10 bg-white p-4"><div className="text-xs text-black/55 font-bold">{label}</div><div className="mt-2 text-2xl font-black break-words">{value}</div><p className="mt-2 text-xs leading-relaxed text-black/50">{hint}</p></div>;
  return <section id="admin-gifts" className="space-y-6 text-[#171717]">
    <header className="rounded-2xl bg-[#111] border-b-4 border-[#f5be1b] p-5 md:p-7 text-white flex flex-wrap items-center justify-between gap-5">
      <div><div className="flex items-center gap-2 text-[#f5be1b] text-xs font-black uppercase tracking-wider"><Gift size={18} /> Controle de brindes</div><h2 className="mt-2 text-2xl md:text-3xl font-black">Saiba quanto sua marca está presenteando.</h2><p className="mt-2 text-sm text-white/65">Quantidades, destinatários, custos e entregas. Brindes ficam fora das vendas e do ranking.</p></div>
      {onNewGift && <button type="button" onClick={onNewGift} className="inline-flex items-center gap-2 rounded-lg bg-[#f5be1b] px-4 py-3 text-xs font-black text-black"><Plus size={16} /> Novo brinde</button>}
    </header>
    <div className="rounded-xl border border-black/10 bg-white p-4 flex flex-wrap items-end gap-4">
      <label className="text-xs font-bold flex-1 min-w-[180px]">Período do cadastro<select className="mt-1 block w-full rounded-lg border border-black/15 p-2.5 bg-white" value={period} onChange={e => setPeriod(e.target.value)}><option value="all">Todo o histórico</option><option value="month">Este mês</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="custom">Escolher datas</option></select></label>
      {period === 'custom' && <><label className="text-xs font-bold">De<input type="date" value={start} onChange={e => setStart(e.target.value)} className="mt-1 block rounded-lg border border-black/15 p-2" /></label><label className="text-xs font-bold">Até<input type="date" value={end} onChange={e => setEnd(e.target.value)} className="mt-1 block rounded-lg border border-black/15 p-2" /></label></>}
      <p className="text-xs text-black/50 max-w-lg">Acumulado de entregues em todo o histórico: <b>{count.format(historic.delivered.units)} unidades</b> · {formatMoney(historic.delivered.knownCost)} registrados.</p>
    </div>
    {invalidRange ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Informe a data inicial e final, nessa ordem, para consultar o período.</p> : <>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {metric('Brindes entregues', `${count.format(summary.delivered.units)} un.`, `${summary.delivered.orders} pedido(s) com entrega confirmada.`)}
      {metric('Custo registrado dos entregues', formatMoney(summary.delivered.knownCost), 'Produtos com custo histórico e fretes efetivamente registrados.')}
      {metric('Custo estimado, separado', formatMoney(summary.delivered.estimatedCost), 'Valores a conferir; não são somados ao custo registrado.')}
      {metric('Em aberto', `${count.format(summary.open.units)} un.`, `${summary.open.orders} pedido(s) sem entrega confirmada · ${formatMoney(summary.open.knownCost)} registrados.`)}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-xl bg-[#fff5d3] border border-amber-200 p-5"><h3 className="font-black flex items-center gap-2"><TrendingUp size={18} /> Peso dos brindes nas vendas</h3><div className="mt-3 text-3xl font-black">{ratio === null ? 'Sem base de comparação' : formatPercent(ratio)}</div><p className="mt-2 text-xs leading-relaxed text-black/60">Custo registrado dos brindes entregues dividido pelo valor líquido recebido das compras cadastradas no mesmo período. {deliveredPartial ? 'Percentual parcial: há registros ou custos a conferir.' : 'Use o histórico para acompanhar a evolução.'}</p></div>
      <div className="rounded-xl bg-white border border-black/10 p-5"><h3 className="font-black flex items-center gap-2"><Package size={18} /> Custo por unidade entregue</h3><div className="mt-3 text-3xl font-black">{summary.delivered.units ? formatMoney(summary.delivered.knownCost / summary.delivered.units) : '—'}</div><p className="mt-2 text-xs leading-relaxed text-black/60">Média do custo registrado. {deliveredPartial ? 'A média é parcial enquanto houver registros ou custos a conferir.' : 'Estimativas são apresentadas separadamente.'}</p></div>
    </div>
    {(summary.active.pendingUnits > 0 || summary.missingItems > 0 || summary.shippingMissing > 0 || summary.conflicts > 0 || historic.undated > 0) && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><div className="font-bold flex items-center gap-2"><AlertTriangle size={17} /> Custos e registros para conferir</div><p className="mt-2 text-xs leading-relaxed">{summary.missingItems > 0 && `${summary.missingItems} registro(s) sem itens com quantidade válida para contar. `}{summary.active.pendingUnits} unidade(s) com custo estimado ou ausente. {summary.shippingMissing} pedido(s) sem frete real informado; esses fretes não são estimados nem somados ao custo registrado. {summary.conflicts > 0 && `${summary.conflicts} pedido(s) com valores históricos divergentes. `}{historic.undated > 0 && `${historic.undated} brinde(s) sem data ficam disponíveis em “Todo o histórico”. `}Confira os registros antes de concluir se o gasto total está dentro do esperado.</p></div>}
    <div className="rounded-xl border border-black/10 bg-white p-5"><h3 className="font-black">Custo registrado por mês · últimos 12 meses</h3><p className="mt-1 text-xs text-black/50">Brindes com entrega confirmada, agrupados pela data de cadastro; histórico independente do filtro acima.</p>
      {showFinancialValues ? <div className="mt-5 flex items-end gap-2 h-40 overflow-x-auto" role="img" aria-label="Custo mensal registrado de brindes entregues">{trend.map(row => <div key={row.month} className="flex flex-1 min-w-[42px] h-full flex-col justify-end text-center"><div title={`${row.month}: ${formatMoney(row.cost)} · ${row.units} unidades`} className="mx-auto w-full max-w-[46px] rounded-t bg-[#f5be1b]" style={{ height: `${Math.max(2, row.cost / max * 105)}px` }} /><span className="mt-2 text-[10px] text-black/55">{row.month.slice(5)}/{row.month.slice(2, 4)}</span><span className="text-[9px] font-bold">{formatMoney(row.cost)}</span></div>)}</div> : <p className="mt-4 rounded-lg bg-neutral-50 p-6 text-sm text-black/50">Ative a visualização dos valores financeiros para conferir a evolução dos custos.</p>}
    </div>
    <div className="rounded-xl border border-black/10 bg-white overflow-hidden"><div className="p-4 border-b border-black/10 flex flex-wrap items-end gap-3"><div className="flex-1 min-w-[180px]"><label className="text-xs font-bold" htmlFor="gift-search">Buscar brinde</label><div className="relative mt-1"><Search size={15} className="absolute top-3 left-3 text-black/40" /><input id="gift-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Pedido, destinatário, produto ou motivo" className="w-full rounded-lg border border-black/15 py-2.5 pl-9 pr-3 text-xs" /></div></div><label className="text-xs font-bold">Entrega<select value={status} onChange={e => setStatus(e.target.value as GiftState | 'all')} className="mt-1 block rounded-lg border border-black/15 p-2.5 text-xs bg-white"><option value="all">Todas as situações</option><option value="delivered">Entregues</option><option value="open">Em aberto</option><option value="cancelled">Cancelados</option></select></label><button type="button" disabled={!showFinancialValues || !visibleRows.length} onClick={exportCsv} className="rounded-lg border border-black/15 p-2.5 text-xs font-bold inline-flex items-center gap-2 disabled:opacity-40"><Download size={14} /> Exportar CSV</button></div>
      <p className="px-4 py-3 text-xs text-black/50">{visibleRows.length} pedido(s) nesta consulta. Busca e situação filtram a tabela e o CSV. Cancelados ficam fora dos indicadores.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-xs"><thead className="text-left bg-neutral-50 text-black/55"><tr>{['Pedido / destinatário', 'Itens e quantidade', 'Entrega', 'Custo registrado', 'Estimado / a conferir'].map(label => <th key={label} className="p-4 font-bold">{label}</th>)}</tr></thead><tbody>{visibleRows.map(row => <tr key={row.id} className="border-t border-black/5 align-top"><td className="p-4 max-w-[260px]"><Link to={`/gestao?tab=orders&orderId=${encodeURIComponent(row.id)}`} className="font-bold underline underline-offset-4 inline-flex items-center gap-1">{row.id}<ArrowUpRight size={12} /></Link><div className="mt-2 font-semibold">{row.name}</div><div className="mt-1 text-black/50">{row.date ? row.date.split('-').reverse().join('/') : 'Sem data cadastrada'}</div>{row.reason && <p className="mt-2 leading-relaxed text-black/55 break-words">{row.reason}</p>}</td><td className="p-4"><b>{row.units} unidade(s)</b>{row.items.map((item, index) => <div key={index} className="mt-2 text-black/60">{item.units} × {item.name} · {item.color} / {item.size}</div>)}</td><td className="p-4"><span className={`inline-block rounded-full px-2 py-1 font-bold ${row.state === 'delivered' ? 'bg-emerald-50 text-emerald-800' : row.state === 'cancelled' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{GIFT_STATE_LABELS[row.state]}</span></td><td className="p-4 font-bold">{formatMoney(row.knownCost)}<div className="mt-2 font-normal text-black/50">Produtos: {formatMoney(row.merchandiseCost)}</div><div className="mt-1 font-normal text-black/50">Frete: {row.shippingMissing ? 'não informado' : formatMoney(row.shippingCost)}</div></td><td className="p-4"><b>{formatMoney(row.estimatedCost)}</b><div className="mt-2 text-black/50">{row.missingItems ? 'Conferir itens e quantidades' : row.pendingUnits ? `${row.pendingUnits} un. a conferir` : 'Custo dos produtos registrado'}</div>{row.costConflict && <div className="mt-2 text-amber-800">Revisar divergência de custo</div>}</td></tr>)}</tbody></table></div>
      {!visibleRows.length && <p className="p-10 text-center text-sm text-black/50">Nenhum brinde encontrado para estes filtros.</p>}
    </div>
    </>}
    <p className="px-1 text-xs leading-relaxed text-black/50">Estes registros acompanham o custo da mercadoria presenteada, sem gerar outra saída de caixa para a compra já registrada. Estimativas não são custos confirmados. O motivo e os itens continuam no pedido original.</p>
  </section>;
}

export default GiftReportView;

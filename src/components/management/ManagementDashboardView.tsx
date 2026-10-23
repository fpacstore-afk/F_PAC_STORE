import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CircleDollarSign,
  CreditCard, Factory, PackageSearch, RefreshCw, ShoppingCart, TrendingUp,
  Truck, Users, WalletCards,
} from 'lucide-react';
import type { ReceiptBucket } from '../../../shared/managementOverview';
import type { ReceiptRange } from '../../../shared/financialReceipts';
import type { calculateFinancialDRE } from '../../utils/orderFinancial';
import type { summarizePayables } from '../../../shared/financialDashboard';

type PeriodKey = '7d' | '30d' | '90d' | 'all';
type DashboardData = {
  receipts: { received: number; refunded: number; netReceived: number; ordersNeedingReview: number; undatedReceived: number; undatedRefunded: number };
  previousReceipts: { netReceived: number } | null;
  receiptsChange: number | null;
  paidOrdersChange: number | null;
  trend: ReceiptBucket[];
  dre: ReturnType<typeof calculateFinancialDRE>;
  operatingExpenses: number;
  payableSummary: ReturnType<typeof summarizePayables>;
  averageReceipt: number;
  paidOrders: number;
  pendingPayments: number;
  pendingAmount: number;
  inProduction: number;
  readyToShip: number;
  lowStockVariants: number;
  physicalStock: number;
  stale30: number;
  stale60: number;
  bestSellers: { name: string; color: string; size: string; quantity: number }[];
  sessionsCount: number;
  cartSessionsCount: number;
  purchasesCount: number;
  conversion: number;
  abandonment: number;
  newCustomers: number;
  returningCustomers: number;
  ltv: number;
  traffic: { name: string; value: number }[];
  trafficTotal: number;
  integrity: { unlinked: unknown[]; unlinkedPhysical: number };
  unresolvedPayments: number;
  range: ReceiptRange;
  periodLabel: string;
};

const periods: { key: PeriodKey; label: string }[] = [
  { key: '7d', label: '7 dias' }, { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' }, { key: 'all', label: 'Tudo' },
];
const count = new Intl.NumberFormat('pt-BR');
const percent = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

function Heading({ icon: Icon, title, subtitle, href, action }: {
  icon: React.ElementType; title: string; subtitle: string; href?: string; action?: string;
}) {
  return <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#fff2b7] text-black flex items-center justify-center shrink-0"><Icon size={19} /></div>
      <div><h3 className="text-lg font-black tracking-tight text-[#161616]">{title}</h3><p className="text-xs text-black/50 mt-0.5">{subtitle}</p></div>
    </div>
    {href && <Link to={href} className="inline-flex items-center gap-1 text-xs font-bold text-black hover:text-amber-700 underline underline-offset-4">{action || 'Ver detalhes'} <ArrowRight size={13} /></Link>}
  </div>;
}

function Kpi({ label, value, helper, icon: Icon, featured = false, delta, deltaNegative = false }: {
  label: string; value: string; helper: string; icon: React.ElementType; featured?: boolean; delta?: string; deltaNegative?: boolean;
}) {
  return <div className={`rounded-2xl border p-5 lg:p-6 min-w-0 flex flex-col justify-between gap-5 ${featured ? 'bg-[#151515] border-[#151515] text-white' : 'bg-white border-black/10 text-[#171717]'}`}>
    <div className="flex items-start justify-between gap-3"><span className={`text-xs font-bold ${featured ? 'text-white/65' : 'text-black/55'}`}>{label}</span><Icon size={18} className={featured ? 'text-[#facc15]' : 'text-amber-600'} /></div>
    <div><div className={`text-[clamp(1.55rem,2.4vw,2.5rem)] leading-tight font-black tracking-tight break-words ${featured ? 'text-[#facc15]' : ''}`}>{value}</div>
      {delta && <div className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${featured ? 'text-white/85' : deltaNegative ? 'text-rose-700' : 'text-emerald-800'}`}>{deltaNegative ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{delta}</div>}
      <p className={`mt-2 text-xs leading-relaxed ${featured ? 'text-white/55' : 'text-black/50'}`}>{helper}</p></div>
  </div>;
}

function ReceiptChart({ rows, visible, formatMoney }: { rows: ReceiptBucket[]; visible: boolean; formatMoney: (value: number) => string }) {
  if (!visible) return <div className="h-[230px] rounded-xl border border-dashed border-black/15 bg-[#fafaf8] flex items-center justify-center px-5 text-center text-sm text-black/55">Ative a visualização dos valores financeiros no topo da gestão para ver o gráfico.</div>;
  if (rows.every(row => row.current === 0 && (!row.previous || row.previous === 0))) return <div className="h-[230px] rounded-xl border border-dashed border-black/15 bg-[#fafaf8] flex items-center justify-center text-sm text-black/55">Sem pagamentos ou estornos com data neste intervalo.</div>;
  const values = rows.flatMap(row => [row.current, row.previous ?? 0]);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const y = (value: number) => 18 + ((max - value) / (max - min)) * 172;
  const baseline = y(0);
  const step = 900 / rows.length;
  const bar = (value: number, x: number, width: number, fill: string, label: string) => {
    const top = Math.min(y(value), baseline);
    return <rect key={label} x={x} y={top} width={width} height={Math.max(1, Math.abs(y(value) - baseline))} rx="4" fill={value < 0 ? '#e11d48' : fill}><title>{`${label}: ${formatMoney(value)}`}</title></rect>;
  };
  return <div className="overflow-x-auto">
    <svg viewBox="0 0 900 228" className="w-full min-w-[520px] h-[230px]" role="img" aria-label="Recebimento líquido por intervalo, comparado ao período anterior quando disponível">
      {[0, 0.5, 1].map(fraction => <line key={fraction} x1="0" x2="900" y1={18 + fraction * 172} y2={18 + fraction * 172} stroke="#ededeb" strokeDasharray="4 5" />)}
      <line x1="0" x2="900" y1={baseline} y2={baseline} stroke="#a3a3a3" />
      {rows.map((row, index) => {
        const center = step * (index + 0.5);
        const currentWidth = Math.min(40, step * 0.33);
        const previousWidth = Math.min(26, step * 0.24);
        return <g key={row.start}>
          {row.previous !== null && bar(row.previous, center - currentWidth / 2 - previousWidth - 3, previousWidth, '#d4d4d4', `Período anterior a ${row.label}`)}
          {bar(row.current, center - currentWidth / 2, currentWidth, '#f5be1b', row.label)}
          <text x={center} y="215" textAnchor="middle" fontSize="12" fontWeight="600" fill="#737373">{row.label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

export function ManagementDashboardView({ data, period, onPeriodChange, syncState, showFinancialValues, formatMoney, formatPercent, productsCount }: {
  data: DashboardData;
  period: PeriodKey;
  onPeriodChange: (period: PeriodKey) => void;
  syncState: string;
  showFinancialValues: boolean;
  formatMoney: (value: number) => string;
  formatPercent: (value: number) => string;
  productsCount: number;
}) {
  const resultReady = data.dre.cogsEstimatedOrders === 0 && data.dre.giftUnknownUnits === 0;
  const expenseParts = [
    { label: 'Produtos e brindes', value: data.dre.cogs, color: '#1c1917' },
    { label: 'Operação', value: data.dre.fixedExpenses + data.dre.variableExpenses + data.dre.otherExpenses, color: '#f5be1b' },
    { label: 'Marketing', value: data.dre.marketingExpenses, color: '#d97706' },
    { label: 'Taxas e frete', value: data.dre.gatewayFees + data.dre.shippingSubsidy, color: '#a3a3a3' },
  ];
  const expenseTotal = expenseParts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  const bestMax = Math.max(1, ...data.bestSellers.map(item => item.quantity));
  const rangeText = data.range ? `${data.range.start.split('-').reverse().join('/')} a ${data.range.end.split('-').reverse().join('/')}` : 'Todo o histórico';
  const changeLabel = (change: number | null) => change === null || !showFinancialValues ? undefined : `${change > 0 ? '+' : ''}${formatPercent(change)} vs período anterior`;

  return <section className="space-y-6 text-[#171717]">
    {(productsCount === 0 || data.integrity.unlinked.length > 0) && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>{productsCount === 0 ? 'Nenhum produto cadastrado encontrado.' : 'Estoque sem vínculo com o catálogo.'}</strong><p className="mt-1">{data.integrity.unlinked.length} registros, com {count.format(data.integrity.unlinkedPhysical)} peças. Não entram nos alertas de reposição do catálogo.</p></div>}
    {data.unresolvedPayments > 0 && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{data.unresolvedPayments} tentativa(s) aguardam confirmação do provedor. Confira antes de liberar pedidos.</div>}
    <header className="rounded-2xl bg-[#111] border-b-4 border-[#f5be1b] p-5 md:p-7 text-white flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
      <div><div className="text-xs font-black uppercase tracking-[0.18em] text-[#f5be1b]">Painel do proprietário</div><h2 className="mt-2 text-2xl md:text-4xl font-black tracking-tight">Seu negócio em um olhar</h2><p className="mt-2 text-sm text-white/65">{rangeText} · Pedidos, caixa e operação em um só lugar.</p><div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/75"><RefreshCw size={13} />{syncState}</div></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Período do dashboard">{periods.map(item => <button key={item.key} type="button" aria-pressed={period === item.key} onClick={() => onPeriodChange(item.key)} className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${period === item.key ? 'bg-[#f5be1b] text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>{item.label}</button>)}</div>
    </header>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <Kpi featured icon={CircleDollarSign} label="Recebido líquido" value={formatMoney(data.receipts.netReceived)} delta={changeLabel(data.receiptsChange)} deltaNegative={data.receiptsChange !== null && data.receiptsChange < 0} helper="Pagamentos menos estornos na data registrada. Inclui recebimentos de pedidos antigos." />
      <Kpi icon={TrendingUp} label="Resultado operacional estimado" value={resultReady ? formatMoney(data.dre.operatingProfit) : 'Conferir custos'} helper={resultReady ? 'Pedidos criados no período após custos e despesas registrados; não é saldo bancário.' : `Custos completos em ${data.dre.costCoveragePercent}% dos pedidos e brindes do período.`} />
      <Kpi icon={WalletCards} label="Despesas operacionais" value={formatMoney(data.operatingExpenses)} helper="Lançamentos do período, incluindo marketing; sem retiradas pessoais ou investimentos de estrutura." />
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi icon={ShoppingCart} label="Pedidos com pagamento" value={count.format(data.paidOrders)} delta={changeLabel(data.paidOrdersChange)} deltaNegative={data.paidOrdersChange !== null && data.paidOrdersChange < 0} helper="Pedidos criados no período com valor recebido, inclusive parcial." />
      <Kpi icon={CreditCard} label="Média recebida por pedido" value={formatMoney(data.averageReceipt)} helper="Recebimento líquido dividido pelos pedidos que receberam no período." />
      <Kpi icon={CircleDollarSign} label="A receber" value={formatMoney(data.pendingAmount)} helper={`${count.format(data.pendingPayments)} pedido(s) confirmado(s) com saldo. Tentativas de checkout não entram.`} />
      <Kpi icon={WalletCards} label="Contas a pagar" value={formatMoney(data.payableSummary.totalOpen)} helper={`${count.format(data.payableSummary.overdueCount)} vencida(s) · ${formatMoney(data.payableSummary.overdueAmount)} em atraso.`} />
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      <div className="xl:col-span-8 bg-white border border-black/10 rounded-2xl p-5 md:p-6">
        <Heading icon={TrendingUp} title="Evolução dos recebimentos" subtitle={period === 'all' ? 'Últimos 12 meses com pagamento ou estorno datado.' : `Comparação com os ${data.periodLabel} anteriores, intervalo a intervalo.`} href="/gestao?tab=financial" action="Abrir financeiro" />
        <div className="flex gap-5 text-xs text-black/60 mb-3"><span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm bg-[#f5be1b]" /> Atual</span>{period !== 'all' && <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm bg-neutral-300" /> Anterior</span>}<span className="ml-auto">Vermelho = estorno líquido</span></div>
        <ReceiptChart rows={data.trend} visible={showFinancialValues} formatMoney={formatMoney} />
        <div className="grid grid-cols-2 gap-3 border-t border-black/10 pt-4 mt-3 text-sm"><div><div className="text-xs text-black/50">Entradas recebidas</div><strong className="font-black">{formatMoney(data.receipts.received)}</strong></div><div><div className="text-xs text-black/50">Estornos</div><strong className="font-black">{formatMoney(data.receipts.refunded)}</strong></div></div>
        {data.receipts.ordersNeedingReview > 0 && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{data.receipts.ordersNeedingReview} pedido(s) têm datas ou histórico para conferir. Sem data: {formatMoney(data.receipts.undatedReceived)} recebido(s) e {formatMoney(data.receipts.undatedRefunded)} estornado(s). Esses valores não entram no gráfico por data.</p>}
      </div>
      <div className="xl:col-span-4 bg-white border border-black/10 rounded-2xl p-5 md:p-6">
        <Heading icon={CircleDollarSign} title="Onde estão os custos" subtitle="Composição registrada dos pedidos e despesas do período." />
        {showFinancialValues && expenseTotal > 0 ? <>
          <div className="flex h-5 overflow-hidden rounded-full bg-neutral-100" role="img" aria-label="Distribuição dos custos registrados">{expenseParts.map(part => <div key={part.label} style={{ width: `${Math.max(0, part.value) / expenseTotal * 100}%`, backgroundColor: part.color }} title={`${part.label}: ${formatMoney(part.value)}`} />)}</div>
          <div className="mt-5 space-y-3">{expenseParts.map(part => <div key={part.label} className="flex justify-between gap-3 text-sm"><span className="flex items-center gap-2 text-black/70"><i className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: part.color }} />{part.label}</span><strong>{formatMoney(part.value)}</strong></div>)}</div>
        </> : <div className="rounded-xl border border-dashed border-black/15 bg-[#fafaf8] py-12 px-4 text-center text-sm text-black/50">{showFinancialValues ? 'Sem custos registrados neste período.' : 'Ative os valores financeiros para ver a composição.'}</div>}
        <div className="mt-6 rounded-xl bg-[#f7f7f4] p-4"><div className="flex justify-between gap-2 text-xs font-bold"><span>Pedidos com custos completos</span><span>{data.dre.costCoveragePercent}%</span></div><div className="mt-2 h-2 rounded-full bg-black/10"><div className="h-full rounded-full bg-[#f5be1b]" style={{ width: `${Math.min(100, Math.max(0, data.dre.costCoveragePercent))}%` }} /></div><p className="mt-2 text-xs text-black/50">O resultado operacional precisa de custos completos para ser exibido.</p></div>
      </div>
    </div>

    <div className="bg-white border border-black/10 rounded-2xl p-5 md:p-6">
      <Heading icon={AlertTriangle} title="Prioridades de hoje" subtitle="Pendências atuais, independentemente do filtro de período." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[
        { label: 'Cobranças', value: data.pendingPayments, info: 'Pedidos confirmados a receber', icon: CreditCard, href: '/gestao?tab=financial' },
        { label: 'Em produção', value: data.inProduction, info: 'Pedidos em etapas abertas', icon: Factory, href: '/gestao?tab=production' },
        { label: 'Prontos para envio', value: data.readyToShip, info: 'Peças concluídas sem despacho', icon: Truck, href: '/gestao?tab=shipping' },
        { label: 'Estoque baixo', value: data.lowStockVariants, info: 'Variações abaixo do mínimo', icon: Boxes, href: '/gestao?tab=stock_center' },
      ].map(item => <Link key={item.label} to={item.href} className="rounded-xl border border-black/10 bg-[#fafaf8] p-4 hover:border-amber-400 hover:bg-amber-50 transition-colors group"><item.icon size={19} className="text-amber-600" /><div className="mt-4 text-3xl font-black">{count.format(item.value)}</div><div className="mt-1 flex items-center justify-between text-xs font-black">{item.label}<ArrowRight size={14} className="text-black/35 group-hover:text-black" /></div><div className="mt-1 text-[11px] leading-snug text-black/50">{item.info}</div></Link>)}</div>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="bg-white border border-black/10 rounded-2xl p-5 md:p-6">
        <Heading icon={PackageSearch} title="Produtos e estoque" subtitle="O que vende e o que precisa de atenção." href="/gestao?tab=inventory_audit" action="Ver inventário" />
        <div className="grid grid-cols-3 gap-2 mb-6">{[
          ['Estoque físico', count.format(data.physicalStock)],
          ['Sem atualização 30d', count.format(data.stale30)],
          ['Sem atualização 60d', count.format(data.stale60)],
        ].map(([label, value]) => <div key={label} className="rounded-xl bg-[#f7f7f4] p-3"><div className="text-xl md:text-2xl font-black">{value}</div><div className="text-[11px] text-black/50 leading-snug mt-1">{label}</div></div>)}</div>
        <div className="text-xs uppercase tracking-wider font-black text-black/45 mb-3">Mais vendidos · por unidades</div>
        {data.bestSellers.length ? <div className="space-y-3">{data.bestSellers.map((item, index) => <div key={`${item.name}-${item.color}-${item.size}`}><div className="flex justify-between gap-3 text-xs"><span className="font-semibold truncate"><b className="text-amber-700 mr-2">{index + 1}.</b>{item.name} <span className="text-black/45">· {item.color} / {item.size}</span></span><strong className="shrink-0">{count.format(item.quantity)} un.</strong></div><div className="h-1.5 rounded-full bg-black/5 mt-2"><div className="h-full rounded-full bg-[#f5be1b]" style={{ width: `${item.quantity / bestMax * 100}%` }} /></div></div>)}</div> : <div className="py-8 text-center text-sm text-black/45 border border-dashed rounded-xl">Sem pedidos com pagamento criados neste período.</div>}
      </div>
      <div className="bg-white border border-black/10 rounded-2xl p-5 md:p-6">
        <Heading icon={Users} title="Clientes e conversão" subtitle="Sessões validadas que autorizaram estatísticas." href="/gestao?tab=intelligence" action="Ver CRM" />
        <div className="grid grid-cols-2 gap-3 mb-6"><div className="rounded-xl bg-[#151515] text-white p-4"><div className="text-2xl font-black text-[#f5be1b]">{percent(data.conversion)}</div><div className="text-xs text-white/60 mt-1">Conversão das sessões</div></div><div className="rounded-xl bg-[#f7f7f4] p-4"><div className="text-2xl font-black">{percent(data.abandonment)}</div><div className="text-xs text-black/50 mt-1">Carrinhos sem compra</div></div></div>
        <div className="space-y-3 mb-6">{[
          ['Visitas validadas', data.sessionsCount], ['Iniciaram carrinho', data.cartSessionsCount], ['Concluíram compra', data.purchasesCount],
        ].map(([label, value]) => <div key={label} className="flex items-center gap-3 text-xs"><span className="w-32 shrink-0 text-black/60">{label}</span><div className="h-2 flex-1 rounded-full bg-black/5"><div className="h-full rounded-full bg-[#f5be1b]" style={{ width: `${data.sessionsCount ? Number(value) / data.sessionsCount * 100 : 0}%` }} /></div><strong className="w-8 text-right">{count.format(Number(value))}</strong></div>)}</div>
        <div className="border-t border-black/10 pt-4 grid grid-cols-2 gap-3"><div><div className="text-xs text-black/50">Novos / recorrentes</div><strong className="text-lg">{data.newCustomers} / {data.returningCustomers}</strong></div><div><div className="text-xs text-black/50">Média histórica por cliente identificado</div><strong className="text-lg">{formatMoney(data.ltv)}</strong></div></div>
      </div>
    </div>

    <div className="bg-white border border-black/10 rounded-2xl p-5 md:p-6">
      <Heading icon={TrendingUp} title="De onde vêm as visitas" subtitle="Origem das sessões validadas no período. Não é receita atribuída aos anúncios." href="/gestao?tab=intelligence" action="Ver aquisição" />
      {data.traffic.length ? <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4">{data.traffic.map(item => <div key={item.name}><div className="flex justify-between text-xs mb-1.5"><span className="font-bold">{item.name}</span><span className="text-black/50">{count.format(item.value)} · {data.trafficTotal ? percent(item.value / data.trafficTotal * 100) : '0%'}</span></div><div className="h-2 bg-black/5 rounded-full"><div className="h-full bg-[#f5be1b] rounded-full" style={{ width: `${data.trafficTotal ? item.value / data.trafficTotal * 100 : 0}%` }} /></div></div>)}</div> : <div className="py-8 text-center text-sm text-black/45">Sem sessões validadas no período.</div>}
    </div>
    <p className="text-xs leading-relaxed text-black/50 px-1">Recebimentos seguem a data do pagamento; pedidos, custos e despesas seguem suas datas de cadastro. O resultado é uma estimativa operacional, não saldo bancário. Sessões dependem do consentimento de estatísticas. Valores são ocultados pelo controle de privacidade no topo.</p>
  </section>;
}

import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  BarChart3,
  AlertTriangle,
  Boxes,
  CircleDollarSign,
  CreditCard,
  Factory,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  WalletCards,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { catalogIntegrity } from '../../../shared/catalogIntegrity';
import { getOrderPaymentStatus, getOrderPaidAmount, getOrderNetReceived, getOrderPendingAmount } from '../../../shared/orderFinancialCore';
import { useFinancialPrivacy } from '../../context/FinancialPrivacyContext';

const PERIODS = [
  { key: '7d', label: '7 dias', days: 7 },
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
  { key: 'all', label: 'Tudo', days: null },
] as const;

type PeriodKey = typeof PERIODS[number]['key'];

type AnyDoc = Record<string, any> & { id?: string };

const number = new Intl.NumberFormat('pt-BR');

function toDate(value: any): Date | null {
  if (!value) return null;
  try {
    if (value?.toDate) return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function isPaid(order: AnyDoc) {
  return getOrderPaidAmount(order) > 0;
}

function isReturned(order: AnyDoc) {
  const payment = String(order.paymentStatus || '').toLowerCase();
  const shipping = String(order.shippingStatus || '').toLowerCase();
  const production = String(order.productionStatus || '').toLowerCase();
  return payment.includes('refund') || shipping === 'returned' || production === 'returned' || order.exchangeRequested === true || order.returnRequested === true;
}

function orderGross(order: AnyDoc) {
  const discounts = Number(order.couponDiscount || 0) + Number(order.pixDiscount || 0) + Number(order.flashSaleDiscount || 0) + Number(order.discount || 0);
  return Number(order.subtotal || 0) || Math.max(0, Number(order.total || 0) + discounts);
}

function orderNet(order: AnyDoc) {
  return getOrderNetReceived(order);
}

function sessionOrigin(session: AnyDoc) {
  const source = String(session.utm_source || '').toLowerCase();
  const medium = String(session.utm_medium || '').toLowerCase();
  const ref = String(session.referrer || '').toLowerCase();
  if (medium.includes('email') || source.includes('email')) return 'E-mail Marketing';
  if (source.includes('instagram') || ref.includes('instagram')) return 'Instagram';
  if (source.includes('facebook') || ref.includes('facebook')) return 'Facebook';
  if (source.includes('google') && (medium.includes('cpc') || medium.includes('paid') || medium.includes('ads'))) return 'Google Ads';
  if (source.includes('google') || ref.includes('google') || medium.includes('organic')) return 'Tráfego Orgânico';
  if (source.includes('whatsapp') || ref.includes('whatsapp') || ref.includes('wa.me')) return 'WhatsApp';
  if (!session.referrer || session.referrer === 'Direto' || session.referrer === 'Tráfego Direto') return 'Direto';
  return 'Outros';
}

function customerKey(order: AnyDoc) {
  return String(order.customerEmail || order.customerPhone || order.userId || order.customerName || order.id || '').trim().toLowerCase();
}

function MetricCard({ label, value, helper, accent = false }: { label: string; value: string; helper?: string; accent?: boolean }) {
  return (
    <div className={`border p-4 min-h-[126px] flex flex-col justify-between ${accent ? 'bg-black text-white border-black' : 'bg-white border-black/10'}`}>
      <div className={`text-[9px] font-black uppercase tracking-[0.18em] ${accent ? 'text-white/50' : 'text-black/45'}`}>{label}</div>
      <div className={`text-2xl md:text-3xl font-black tracking-tight ${accent ? 'text-[#eab308]' : 'text-black'}`}>{value}</div>
      {helper && <div className={`text-[10px] leading-relaxed ${accent ? 'text-white/45' : 'text-black/45'}`}>{helper}</div>}
    </div>
  );
}

function SectionTitle({ icon: Icon, eyebrow, title }: { icon: React.ElementType; eyebrow: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-9 h-9 bg-black text-[#eab308] flex items-center justify-center"><Icon size={18} /></div>
      <div>
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-black/40">{eyebrow}</div>
        <h3 className="text-lg md:text-xl font-black uppercase tracking-tight">{title}</h3>
      </div>
    </div>
  );
}

export default function ManagementDashboard() {
  const { formatMoney } = useFinancialPrivacy();
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [orders, setOrders] = useState<AnyDoc[]>([]);
  const [sessions, setSessions] = useState<AnyDoc[]>([]);
  const [inventory, setInventory] = useState<AnyDoc[]>([]);
  const [products, setProducts] = useState<AnyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState('Sincronizando dados...');

  useEffect(() => {
    let readyOrders = false;
    let readySessions = false;
    let readyInventory = false;
    let readyProducts = false;
    let loadFailed = false;
    const updateReady = () => {
      if (readyOrders && readySessions && readyInventory && readyProducts) {
        setLoading(false);
        setSyncState(loadFailed ? 'Parte dos dados não pôde ser carregada' : 'Dados atualizados em tempo real');
      }
    };

    const unOrders = onSnapshot(collection(db, 'orders'), snap => {
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      readyOrders = true;
      updateReady();
    }, () => { loadFailed = true; readyOrders = true; updateReady(); });

    const unSessions = onSnapshot(collection(db, 'visitor_sessions'), snap => {
      setSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      readySessions = true;
      updateReady();
    }, () => { loadFailed = true; readySessions = true; updateReady(); });

    const unInventory = onSnapshot(collection(db, 'inventory'), snap => {
      setInventory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      readyInventory = true;
      updateReady();
    }, () => { loadFailed = true; readyInventory = true; updateReady(); });

    const unProducts = onSnapshot(collection(db, 'products'), snap => {
      setProducts(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      readyProducts = true; updateReady();
    }, () => { loadFailed = true; readyProducts = true; updateReady(); });

    return () => { unOrders(); unSessions(); unInventory(); unProducts(); };
  }, []);

  const data = useMemo(() => {
    const selected = PERIODS.find(item => item.key === period) || PERIODS[1];
    const cutoff = selected.days ? Date.now() - selected.days * 24 * 60 * 60 * 1000 : 0;
    const inPeriod = (value: any) => {
      if (!cutoff) return true;
      const date = toDate(value);
      return date ? date.getTime() >= cutoff : false;
    };

    const paidAll = orders.filter(isPaid);
    const paid = paidAll.filter(order => inPeriod(order.createdAt));
    const grossRevenue = paid.reduce((sum, order) => sum + orderGross(order), 0);
    const netRevenue = paid.reduce((sum, order) => sum + orderNet(order), 0);
    const ticket = paid.length ? netRevenue / paid.length : 0;

    const filteredSessions = sessions.filter(session => inPeriod(session.createdAt || session.updatedAt || session.lastActive));
    const purchases = filteredSessions.filter(session => session.purchaseCompleted === true).length;
    const conversion = filteredSessions.length ? (purchases / filteredSessions.length) * 100 : 0;

    const integrity = catalogIntegrity(products, inventory);
    const physicalStock = integrity.linkedPhysical;
    let stale30 = 0;
    let stale60 = 0;
    integrity.linked.forEach(item => {
      const variants = Object.values(item.variants || {}) as AnyDoc[];
      const itemStock = variants.length
        ? variants.reduce((sum, variant) => sum + Number(variant.physicalQuantity ?? variant.stock ?? 0), 0)
        : Number(item.physicalQuantity ?? item.stock ?? 0);
      const updated = toDate(item.updatedAt || item.lastMovementAt || item.createdAt);
      if (itemStock > 0 && updated) {
        const age = (Date.now() - updated.getTime()) / (24 * 60 * 60 * 1000);
        if (age >= 30) stale30 += itemStock;
        if (age >= 60) stale60 += itemStock;
      }
    });

    const bestMap = new Map<string, { name: string; color: string; size: string; quantity: number; revenue: number }>();
    let soldUnits = 0;
    paid.forEach(order => {
      (order.items || []).forEach((item: AnyDoc) => {
        const quantity = Math.max(1, Number(item.quantity || item.qty || 1));
        soldUnits += quantity;
        const name = String(item.name || item.title || item.slug || 'Produto');
        const color = String(item.color || '—');
        const size = String(item.size || '—');
        const key = `${name}|${color}|${size}`;
        const previous = bestMap.get(key) || { name, color, size, quantity: 0, revenue: 0 };
        previous.quantity += quantity;
        previous.revenue += Number(item.price || 0) * quantity;
        bestMap.set(key, previous);
      });
    });
    const bestSellers = [...bestMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const turnover = physicalStock > 0 ? soldUnits / physicalStock : 0;
    const returned = paid.filter(isReturned).length;
    const returnRate = paid.length ? (returned / paid.length) * 100 : 0;

    const cartSessions = filteredSessions.filter(session => session.cartStarted === true);
    const abandoned = cartSessions.filter(session => session.purchaseCompleted !== true).length;
    const abandonment = cartSessions.length ? (abandoned / cartSessions.length) * 100 : 0;

    const firstPurchase = new Map<string, number>();
    paidAll.forEach(order => {
      const key = customerKey(order);
      const date = toDate(order.createdAt)?.getTime() || 0;
      if (!key || !date) return;
      const current = firstPurchase.get(key);
      if (!current || date < current) firstPurchase.set(key, date);
    });
    const customersInPeriod = new Map<string, number>();
    paid.forEach(order => {
      const key = customerKey(order);
      if (!key) return;
      customersInPeriod.set(key, (customersInPeriod.get(key) || 0) + 1);
    });
    let newCustomers = 0;
    let returningCustomers = 0;
    customersInPeriod.forEach((_count, key) => {
      const first = firstPurchase.get(key) || 0;
      if (!cutoff || first >= cutoff) newCustomers += 1;
      else returningCustomers += 1;
    });

    const allCustomers = new Set(paidAll.map(customerKey).filter(Boolean));
    const allNet = paidAll.reduce((sum, order) => sum + orderNet(order), 0);
    const ltv = allCustomers.size ? allNet / allCustomers.size : 0;

    const originMap = new Map<string, number>();
    filteredSessions.forEach(session => {
      const origin = sessionOrigin(session);
      originMap.set(origin, (originMap.get(origin) || 0) + 1);
    });
    const traffic = [...originMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    const trafficTotal = traffic.reduce((sum, item) => sum + item.value, 0) || 1;

    const activeOrders = orders.filter(order => {
      const statuses = [order.status, order.paymentStatus, order.productionStatus, order.shippingStatus]
        .map(value => String(value || '').toLowerCase());
      return !statuses.some(status => ['cancelled', 'canceled', 'rejected', 'refunded'].includes(status));
    });
    const pendingPayments = activeOrders.filter(order => {
      return !['cancelled', 'rejected', 'refunded'].includes(getOrderPaymentStatus(order)) && getOrderPendingAmount(order) > 0;
    }).length;
    const inProduction = activeOrders.filter(order => {
      const status = String(order.production?.status || order.productionStatus || '').toLowerCase();
      return ['waiting', 'pending', 'separacao_corte', 'estamparia', 'costura', 'embalagem', 'processing', 'in_production'].includes(status);
    }).length;
    const readyToShip = activeOrders.filter(order => {
      const production = String(order.production?.status || order.productionStatus || '').toLowerCase();
      const shipping = String(order.shipping?.status || order.shippingStatus || '').toLowerCase();
      return ['ready', 'completed', 'pronto'].includes(production) && !['shipped', 'in_transit', 'delivered'].includes(shipping);
    }).length;
    const lowStockVariants = integrity.lowStockVariants;

    return {
      integrity,
      unresolvedPayments: orders.filter(order => order.paymentCreationUncertain).length,
      grossRevenue,
      netRevenue,
      ticket,
      paidOrders: paid.length,
      conversion,
      soldUnits,
      physicalStock,
      turnover,
      bestSellers,
      returnRate,
      stale30,
      stale60,
      abandonment,
      newCustomers,
      returningCustomers,
      ltv,
      traffic,
      trafficTotal,
      pendingPayments,
      inProduction,
      readyToShip,
      lowStockVariants,
    };
  }, [orders, sessions, inventory, products, period]);

  return (
    <section className="space-y-8">
      {!loading && (products.length === 0 || data.integrity.unlinked.length > 0) && <div role="status" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-bold">{products.length === 0 ? 'Nenhum produto cadastrado foi encontrado.' : 'Há estoque sem vínculo com o catálogo.'}</p>
        <p className="mt-1">{data.integrity.unlinked.length} registros de estoque sem produto correspondente, com {number.format(data.integrity.unlinkedPhysical)} peças registradas. Esses dados foram preservados e não entram nos alertas de reposição do catálogo.</p>
      </div>}
      {data.unresolvedPayments > 0 && <p role="status" className="border border-amber-300 bg-amber-50 p-4 text-sm">{data.unresolvedPayments} tentativa(s) aguardando confirmação do provedor. Confira o pagamento antes de cancelar pedidos ou liberar reservas.</p>}
      <div className="bg-white border border-black/10 p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="text-[9px] uppercase tracking-[0.22em] font-black text-black/40">Dashboard estratégico</div>
          <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Visão geral do negócio</h2>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-black/45"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {syncState}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(item => (
            <button
              key={item.key}
              onClick={() => setPeriod(item.key)}
              className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest border transition-colors ${period === item.key ? 'bg-black text-[#eab308] border-black' : 'bg-white text-black border-black/10 hover:border-black/30'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle icon={AlertTriangle} eyebrow="Agora" title="Prioridades da operação" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard label="Pagamentos pendentes" value={number.format(data.pendingPayments)} helper="Pedidos ativos ainda sem quitação confirmada" accent />
          <MetricCard label="Em produção" value={number.format(data.inProduction)} helper="Pedidos em etapas produtivas abertas" />
          <MetricCard label="Prontos para envio" value={number.format(data.readyToShip)} helper="Produção concluída sem despacho registrado" />
          <MetricCard label="Alertas de estoque" value={number.format(data.lowStockVariants)} helper="Rupturas ou variações abaixo do mínimo cadastrado" />
        </div>
        <div className="mt-3 grid grid-cols-2 xl:grid-cols-4 gap-3 text-[9px] font-black uppercase tracking-wider text-black/45">
          <div className="flex items-center gap-2"><CreditCard size={13} className="text-[#eab308]" /> Cobrança</div>
          <div className="flex items-center gap-2"><Factory size={13} className="text-[#eab308]" /> Produção</div>
          <div className="flex items-center gap-2"><Truck size={13} className="text-[#eab308]" /> Expedição</div>
          <div className="flex items-center gap-2"><Boxes size={13} className="text-[#eab308]" /> Reposição</div>
        </div>
      </div>

      <div>
        <SectionTitle icon={BarChart3} eyebrow="Desempenho" title="Comercial & Vendas" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard label="Valor dos pedidos com recebimento" value={formatMoney(data.grossRevenue)} helper="Inclui o valor total de pedidos pagos parcialmente" accent />
          <MetricCard label="Recebimento líquido desses pedidos" value={formatMoney(data.netRevenue)} helper="Recebido menos estornos; período pela criação do pedido" />
          <MetricCard label="Recebimento médio por pedido" value={formatMoney(data.ticket)} helper="Inclui recebimentos parciais" />
          <MetricCard label="Pedidos / Conversão" value={`${number.format(data.paidOrders)} · ${data.conversion.toFixed(1)}%`} helper="Pedidos pagos · visitantes que compraram" />
        </div>
      </div>

      <div>
        <SectionTitle icon={Boxes} eyebrow="Operação" title="Gestão de Estoque & Produto" />
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.35fr] gap-3">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Giro de estoque" value={`${data.turnover.toFixed(2)}x`} helper={`${number.format(data.soldUnits)} saídas / ${number.format(data.physicalStock)} peças físicas`} accent />
            <MetricCard label="Devolução / troca" value={`${data.returnRate.toFixed(1)}%`} helper="Pedidos com devolução, reembolso ou troca" />
            <MetricCard label="Encalhe 30+ dias" value={number.format(data.stale30)} helper="Peças com estoque e sem atualização recente" />
            <MetricCard label="Encalhe 60+ dias" value={number.format(data.stale60)} helper="Prioridade para ação promocional" />
          </div>
          <div className="bg-white border border-black/10 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-black/40">Best Sellers</div>
                <h4 className="text-base font-black uppercase">Produtos, tamanhos e cores</h4>
              </div>
              <PackageSearch size={20} className="text-[#eab308]" />
            </div>
            <div className="space-y-2">
              {data.bestSellers.length === 0 ? (
                <div className="text-[11px] text-black/45 py-8 text-center border border-dashed border-black/10">Sem vendas concluídas no período.</div>
              ) : data.bestSellers.map((item, index) => (
                <div key={`${item.name}-${item.color}-${item.size}`} className="grid grid-cols-[28px_1fr_auto] gap-3 items-center border-b border-black/5 pb-2 last:border-0">
                  <div className="w-7 h-7 bg-black text-[#eab308] text-[10px] font-black flex items-center justify-center">{index + 1}</div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-black uppercase truncate">{item.name}</div>
                    <div className="text-[9px] uppercase text-black/45">{item.color} · {item.size}</div>
                  </div>
                  <div className="text-right"><div className="text-sm font-black">{item.quantity} un.</div><div className="text-[9px] text-black/40">{formatMoney(item.revenue)}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle icon={Users} eyebrow="Relacionamento" title="Comportamento do Cliente" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MetricCard label="Abandono de carrinho" value={`${data.abandonment.toFixed(1)}%`} helper="Sessões que iniciaram carrinho e não compraram" accent />
          <MetricCard label="Novos vs. recorrentes" value={`${data.newCustomers} / ${data.returningCustomers}`} helper="Clientes no período selecionado" />
          <MetricCard label="LTV médio" value={formatMoney(data.ltv)} helper="Recebimento líquido acumulado por cliente" />
        </div>
      </div>

      <div>
        <SectionTitle icon={TrendingUp} eyebrow="Aquisição" title="Marketing & Tráfego" />
        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-3">
          <div className="bg-black text-white border border-black p-5">
            <div className="flex items-center justify-between mb-5">
              <div><div className="text-[9px] uppercase tracking-[0.2em] font-black text-white/40">Origem do tráfego</div><h4 className="text-base font-black uppercase">De onde chegam os visitantes</h4></div>
              <ShoppingCart size={20} className="text-[#eab308]" />
            </div>
            <div className="space-y-3">
              {data.traffic.length === 0 ? <div className="text-[11px] text-white/40 py-8 text-center">Sem dados de tráfego no período.</div> : data.traffic.map(item => {
                const pct = Math.round((item.value / data.trafficTotal) * 100);
                return (
                  <div key={item.name}>
                    <div className="flex items-center justify-between text-[10px] mb-1.5"><span className="font-black uppercase">{item.name}</span><span className="text-white/45">{item.value} · {pct}%</span></div>
                    <div className="h-1.5 bg-white/10 overflow-hidden"><div className="h-full bg-[#eab308]" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-3">
            <MetricCard label="CAC" value="—" helper="Será calculado quando o investimento de marketing estiver configurado" />
            <MetricCard label="ROI" value="—" helper="Depende do investimento total informado" />
            <MetricCard label="ROAS" value="—" helper="Depende do gasto e receita atribuída aos anúncios" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-[#ecece8] border border-black/10 p-4 flex items-center gap-3"><CircleDollarSign className="text-[#eab308]" size={20} /><div><div className="text-[9px] font-black uppercase tracking-widest text-black/40">Financeiro</div><div className="text-[11px] font-bold">Receita, ticket e devoluções conectados aos pedidos.</div></div></div>
        <div className="bg-[#ecece8] border border-black/10 p-4 flex items-center gap-3"><WalletCards className="text-[#eab308]" size={20} /><div><div className="text-[9px] font-black uppercase tracking-widest text-black/40">Marketing</div><div className="text-[11px] font-bold">CAC, ROI e ROAS ficam prontos assim que o custo de mídia for registrado.</div></div></div>
        <div className="bg-[#ecece8] border border-black/10 p-4 flex items-center gap-3"><Users className="text-[#eab308]" size={20} /><div><div className="text-[9px] font-black uppercase tracking-widest text-black/40">Clientes</div><div className="text-[11px] font-bold">LTV e recorrência usam o histórico de pedidos concluídos.</div></div></div>
      </div>
    </section>
  );
}

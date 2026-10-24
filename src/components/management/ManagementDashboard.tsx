import { buildCustomerIdentities, loyaltyPaidValue } from '../../../shared/customerPurchases';
import { giftReportRows, summarizeGiftRows } from '../../../shared/giftReporting';
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { catalogIntegrity } from '../../../shared/catalogIntegrity';
import { getOrderPaidAmount, getOrderNetReceived, getOrderPendingAmount } from '../../../shared/orderFinancialCore';
import { summarizeReceipts } from '../../../shared/financialReceipts';
import { dashboardPeriodRange, dateMatchesRange, summarizePayables } from '../../../shared/financialDashboard';
import { isConfirmedReceivable, periodChange, previousDashboardRange, receiptTrend } from '../../../shared/managementOverview';
import { calculateFinancialDRE } from '../../utils/orderFinancial';
import { useFinancialPrivacy } from '../../context/FinancialPrivacyContext';
import { ManagementDashboardView } from './ManagementDashboardView';

const PERIODS = [
  { key: '7d', label: '7 dias', days: 7 },
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
  { key: 'all', label: 'Tudo', days: null },
] as const;

type PeriodKey = typeof PERIODS[number]['key'];

type AnyDoc = Record<string, any> & { id?: string };

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
  return loyaltyPaidValue(order) > 0;
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


export default function ManagementDashboard() {
  const { formatMoney, formatPercent, showFinancialValues } = useFinancialPrivacy();
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [orders, setOrders] = useState<AnyDoc[]>([]);
  const [sessions, setSessions] = useState<AnyDoc[]>([]);
  const [inventory, setInventory] = useState<AnyDoc[]>([]);
  const [products, setProducts] = useState<AnyDoc[]>([]);
  const [cashflow, setCashflow] = useState<AnyDoc[]>([]);
  const [investments, setInvestments] = useState<AnyDoc[]>([]);
  const [trafficRecords, setTrafficRecords] = useState<AnyDoc[]>([]);
  const [payables, setPayables] = useState<AnyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState('Sincronizando dados...');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    let readyOrders = false;
    let readySessions = false;
    let readyInventory = false;
    let readyProducts = false;
    let readyCashflow = false;
    let readyInvestments = false;
    let readyTraffic = false;
    let readyPayables = false;
    let loadFailed = false;
    const reportError = () => {
      loadFailed = true;
      setLoadError('Não foi possível carregar todos os dados da gestão. Os indicadores estão indisponíveis até a consulta ser concluída.');
    };
    const updateReady = () => {
      if (readyOrders && readySessions && readyInventory && readyProducts && readyCashflow && readyInvestments && readyTraffic && readyPayables) {
        setLoading(false);
        setSyncState(loadFailed ? 'Parte dos dados não pôde ser carregada' : 'Dados atualizados em tempo real');
      }
    };

    const unOrders = onSnapshot(collection(db, 'orders'), snap => {
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      readyOrders = true;
      updateReady();
    }, () => { reportError(); readyOrders = true; updateReady(); });

    const unSessions = onSnapshot(collection(db, 'visitor_sessions'), snap => {
      setSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      readySessions = true;
      updateReady();
    }, () => { reportError(); readySessions = true; updateReady(); });

    const unInventory = onSnapshot(collection(db, 'inventory'), snap => {
      setInventory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      readyInventory = true;
      updateReady();
    }, () => { reportError(); readyInventory = true; updateReady(); });

    const unProducts = onSnapshot(collection(db, 'products'), snap => {
      setProducts(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      readyProducts = true; updateReady();
    }, () => { reportError(); readyProducts = true; updateReady(); });

    const unCashflow = onSnapshot(collection(db, 'financial_cashflow'), snap => {
      setCashflow(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      readyCashflow = true; updateReady();
    }, () => { reportError(); readyCashflow = true; updateReady(); });

    const unInvestments = onSnapshot(collection(db, 'financial_investments'), snap => {
      setInvestments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      readyInvestments = true; updateReady();
    }, () => { reportError(); readyInvestments = true; updateReady(); });

    const unTraffic = onSnapshot(collection(db, 'financial_traffic'), snap => {
      setTrafficRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      readyTraffic = true; updateReady();
    }, () => { reportError(); readyTraffic = true; updateReady(); });

    const unPayables = onSnapshot(collection(db, 'financial_payables'), snap => {
      setPayables(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      readyPayables = true; updateReady();
    }, () => { reportError(); readyPayables = true; updateReady(); });

    return () => { unOrders(); unSessions(); unInventory(); unProducts(); unCashflow(); unInvestments(); unTraffic(); unPayables(); };
  }, [reloadKey]);

  const data = useMemo(() => {
    const selected = PERIODS.find(item => item.key === period) || PERIODS[1];
    const range = dashboardPeriodRange(selected.days);
    const priorRange = previousDashboardRange(range);
    const inPeriod = (value: any) => dateMatchesRange(value, range);

    const customerKeys = new Map<any,string>();
    buildCustomerIdentities(orders).filter(group => group.aliases.size > 0).forEach(group => group.allOrders.forEach(order => customerKeys.set(order, group.key)));
    const customerKey = (order: AnyDoc) => customerKeys.get(order) || '';
    const paidAll = orders.filter(isPaid);
    const paid = paidAll.filter(order => inPeriod(order.createdAt || order.createdAtDate || order.created_at || order.date));
    const receipts = summarizeReceipts(orders, range);
    const previousReceipts = priorRange ? summarizeReceipts(orders, priorRange) : null;
    const trend = receiptTrend(orders, range, selected.days);
    const averageReceipt = receipts.receivedOrders ? receipts.netReceived / receipts.receivedOrders : 0;
    const periodOrders = orders.filter(order => inPeriod(order.createdAt || order.createdAtDate || order.created_at || order.date));
    const periodRecords = (records: AnyDoc[]) => records.filter(record => inPeriod(record.date || record.createdAt || record.created_at));
    const dre = calculateFinancialDRE(
      periodOrders,
      periodRecords(cashflow),
      periodRecords(investments),
      periodRecords(trafficRecords),
      products,
    );
    const operatingExpenses = dre.fixedExpenses + dre.variableExpenses + dre.otherExpenses + dre.marketingExpenses;
    const payableSummary = summarizePayables(payables);

    const filteredSessions = sessions.filter(session => session.validationVersion === 1 && inPeriod(session.createdAt || session.updatedAt || session.lastActive));
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

    const bestMap = new Map<string, { name: string; color: string; size: string; quantity: number }>();
    paid.forEach(order => {
      (order.items || []).forEach((item: AnyDoc) => {
        const quantity = Math.max(1, Number(item.quantity || item.qty || 1));
        const name = String(item.name || item.title || item.slug || 'Produto');
        const color = String(item.color || '—');
        const size = String(item.size || '—');
        const key = `${name}|${color}|${size}`;
        const previous = bestMap.get(key) || { name, color, size, quantity: 0 };
        previous.quantity += quantity;
        bestMap.set(key, previous);
      });
    });
    const bestSellers = [...bestMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);

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
      if (!range || inPeriod(new Date(first))) newCustomers += 1;
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
    const trafficTotal = filteredSessions.length;

    const activeOrders = orders.filter(order => {
      const statuses = [order.status, order.paymentStatus, order.productionStatus, order.shippingStatus]
        .map(value => String(value || '').toLowerCase());
      return !statuses.some(status => ['cancelled', 'canceled', 'rejected', 'refunded'].includes(status));
    });
    const receivables = activeOrders.filter(isConfirmedReceivable);
    const pendingPayments = receivables.length;
    const pendingAmount = receivables.reduce((sum, order) => sum + getOrderPendingAmount(order), 0);
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
      gifts: summarizeGiftRows(giftReportRows(periodOrders, products)),
      unresolvedPayments: orders.filter(order => order.paymentCreationUncertain).length,
      receipts,
      previousReceipts,
      trend,
      dre,
      operatingExpenses,
      payableSummary,
      averageReceipt,
      paidOrders: paid.length,
      paidOrdersChange: priorRange ? periodChange(paid.length, paidAll.filter(order => dateMatchesRange(order.createdAt || order.createdAtDate || order.created_at || order.date, priorRange)).length) : null,
      receiptsChange: previousReceipts ? periodChange(receipts.netReceived, previousReceipts.netReceived) : null,
      conversion,
      sessionsCount: filteredSessions.length,
      cartSessionsCount: cartSessions.length,
      purchasesCount: purchases,
      physicalStock,
      bestSellers,
      stale30,
      stale60,
      abandonment,
      newCustomers,
      returningCustomers,
      ltv,
      traffic,
      trafficTotal,
      pendingPayments,
      pendingAmount,
      inProduction,
      readyToShip,
      lowStockVariants,
      range,
      periodLabel: selected.label,
    };
  }, [orders, sessions, inventory, products, cashflow, investments, trafficRecords, payables, period]);

  if (loadError) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900"><p>{loadError}</p><button type="button" onClick={() => setReloadKey(key => key + 1)} className="mt-3 rounded-lg bg-black px-4 py-2 text-white">Tentar novamente</button></div>;
  if (loading) return <p role="status" className="p-5 text-sm">Carregando os dados para calcular os indicadores...</p>;

  return <ManagementDashboardView
    data={data}
    period={period}
    onPeriodChange={setPeriod}
    syncState={syncState}
    showFinancialValues={showFinancialValues}
    formatMoney={formatMoney}
    formatPercent={formatPercent}
    productsCount={products.length}
  />;
}

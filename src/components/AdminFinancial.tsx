import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, query, orderBy, onSnapshot, doc, 
  setDoc, deleteDoc, updateDoc, serverTimestamp, getDocs, limit
} from 'firebase/firestore';
import { 
  TrendingUp, TrendingDown, DollarSign, Award, Target, 
  Calendar, Layers, Filter, Plus, Trash2, Download, 
  RefreshCw, CheckCircle2, AlertTriangle, HelpCircle, 
  FileSpreadsheet, PieChart, ShoppingBag, Eye, Percent, ArrowUpRight, CreditCard,
  RotateCcw, ShieldCheck, History, Clock, Receipt, Building2
} from 'lucide-react';
import AdminAccountsReceivable from './AdminAccountsReceivable';
import { FinancialPaymentsView } from './admin/financial/FinancialPaymentsView';
import { FinancialRefundsView } from './admin/financial/FinancialRefundsView';
import { FinancialLedgerView } from './admin/financial/FinancialLedgerView';
import { AccountsPayableManager } from './admin/financial/AccountsPayableManager';
import { SuppliersManager } from './admin/financial/SuppliersManager';
import { CashForecastView } from './admin/financial/CashForecastView';
import { OrderFinancialDrawer } from './admin/financial/OrderFinancialDrawer';
import { ProfitabilityPricingDashboard } from './admin/financial/profitability/ProfitabilityPricingDashboard';
import toast from 'react-hot-toast';
import { getApiUrl, authenticatedFetch } from '../lib/api';
import { cn } from '../lib/utils';
import { useInventory } from '../hooks/useInventory';
import { useAuth } from '../context/AuthContext';
import { useFinancialPrivacy } from '../context/FinancialPrivacyContext';
import { 
  getOrderPendingAmount, 
  getOrderPaidAmount, 
  getOrderRefundedAmount, 
  isOrderPaymentOverdue, 
  getPaymentBadgeType,
  calculateFinancialDRE,
  calculateProductProfitability,
  calculateOrderFinancials,
  getOrderPaymentStatus,
  getOrderTotal
} from '../utils/orderFinancial';

export type FinancialPeriod = 'all' | 'today' | '7days' | 'current_month' | 'previous_month' | 'quarter' | 'year';

// Definition of types for persistence
interface Investment {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
}

interface CashFlowEntry {
  id: string;
  description: string;
  amount: number;
  type: 'in' | 'out';
  category: string;
  date: string;
}

interface TrafficCamp {
  id: string;
  campaignName: string;
  amountSpent: number;
  date: string;
  clicks?: number;
  conversions?: number;
}

export type FinancialSubTab = 
  | 'dashboard' 
  | 'profitability'
  | 'receivables' 
  | 'payments' 
  | 'refunds' 
  | 'ledger' 
  | 'payables'
  | 'suppliers'
  | 'forecast'
  | 'cashflow' 
  | 'investments' 
  | 'traffic' 
  | 'products' 
  | 'sheets' 
  | 'orders';

export interface AdminFinancialProps {
  initialSubTab?: FinancialSubTab;
  selectedOrderId?: string;
  onNavigateOrder?: (orderId: string) => void;
}

export function AdminFinancial({ initialSubTab = 'dashboard', selectedOrderId }: AdminFinancialProps = {}) {
  const { formatMoney, formatPercent, maskFinancial, showFinancialValues } = useFinancialPrivacy();
  const { user, loading: authLoading } = useAuth();
  const isDevBypass = import.meta.env.DEV && localStorage.getItem('admin_bypass') === 'true';
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br' || isDevBypass;

  const [activeSubTab, setActiveSubTab] = useState<FinancialSubTab>(initialSubTab || 'dashboard');
  const [selectedOrderForDrawer, setSelectedOrderForDrawer] = useState<any | null>(null);
  const [periodFilter, setPeriodFilter] = useState<FinancialPeriod>('all');

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);
  
  const { inventory } = useInventory();
  
  // Data States
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [cashflow, setCashflow] = useState<CashFlowEntry[]>([]);
  const [traffic, setTraffic] = useState<TrafficCamp[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isFirestore, setIsFirestore] = useState(true);

  // Visible product IDs for the Margin/Products Tab
  const [visibleProductIds, setVisibleProductIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('fpac_financial_visible_product_ids');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        return [];
      }
    }
    return [];
  });

  const [productToDelete, setProductToDelete] = useState<any | null>(null);

  // Modal and form states for adding products
  const [showAddProdModal, setShowAddProdModal] = useState(false);
  const [addProdMode, setAddProdMode] = useState<'catalog' | 'new'>('catalog');
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [newProdForm, setNewProdForm] = useState({
    name: '',
    price: '',
    costPrice: '',
    stock: ''
  });

  // Form states for adding items
  const [invForm, setInvForm] = useState({ description: '', amount: '', category: 'fornecedores', date: new Date().toISOString().split('T')[0] });
  const [cfForm, setCfForm] = useState({ description: '', amount: '', type: 'out' as 'in' | 'out', category: 'Tráfego Pago', date: new Date().toISOString().split('T')[0] });
  const [trafficForm, setTrafficForm] = useState({ campaignName: '', amountSpent: '', clicks: '', conversions: '', date: new Date().toISOString().split('T')[0] });

  // Webhook sheet simulator
  const [sheetWebhookUrl, setSheetWebhookUrl] = useState(() => {
    return localStorage.getItem('fpac_sheets_webhook_url') || '';
  });
  const [isSyncingWebhook, setIsSyncingWebhook] = useState(false);

  // Load sheet webhook from Firestore
  useEffect(() => {
    if (authLoading || !isAdmin) return;
    const unsub = onSnapshot(
      doc(db, 'settings', 'sheets'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && data.webhookUrl) {
            setSheetWebhookUrl(data.webhookUrl);
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/sheets');
      }
    );
    return () => unsub();
  }, [authLoading, isAdmin]);

  // Pack data and memoize its hash to run automatic background sync without loops
  const [lastSyncHash, setLastSyncHash] = useState('');
  
  const currentDataHash = useMemo(() => {
    const prodStr = (products || []).map(p => `${p.id}_${p.stock}_${p.price}_${p.cost}`).join('|');
    const ordStr = (orders || []).map(o => `${o.id}_${o.status}`).join('|');
    const invStr = (investments || []).map(i => `${i.id}_${i.amount}`).join('|');
    const cfStr = (cashflow || []).map(c => `${c.id}_${c.amount}`).join('|');
    const trStr = (traffic || []).map(t => `${t.id}_${t.amountSpent}`).join('|');
    return `${prodStr}::${ordStr}::${invStr}::${cfStr}::${trStr}`;
  }, [products, orders, investments, cashflow, traffic]);

  useEffect(() => {
    if (!sheetWebhookUrl) return;

    if (!lastSyncHash) {
      setLastSyncHash(currentDataHash);
      return;
    }

    if (currentDataHash === lastSyncHash) return;

    // Debounce: wait 5 seconds of inactivity before auto syncing to avoid sheet rate limits
    const timeout = setTimeout(() => {
      setLastSyncHash(currentDataHash);
      console.log("🔄 [AUTO-SYNC-SHEETS] Syncing database changes automatically with Google Sheets...");
      handleGoogleSheetsSync(true);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [currentDataHash, sheetWebhookUrl, lastSyncHash]);

  // Load live data from Firestore, fallback to LocalStorage if missing / empty
  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    
    let unsubscribeOrders = () => {};
    let unsubscribeProducts = () => {};
    let unsubscribeInv = () => {};
    let unsubscribeCf = () => {};
    let unsubscribeTr = () => {};

    // 2. Fetch live products
    const qProducts = query(collection(db, 'products'));
    unsubscribeProducts = onSnapshot(
      qProducts,
      (snapshot) => {
        const liveProducts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProducts(liveProducts);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'products');
      }
    );

    if (isAdmin) {
      // 1. Fetch live orders in real-time (limited to 100 recent orders for Firestore quota safety)
      const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100));
      unsubscribeOrders = onSnapshot(
        qOrders,
        (snapshot) => {
          const liveOrders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAtDate: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(doc.data().createdAt)
          }));
          setOrders(liveOrders);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'orders');
        }
      );

      // 3. Fetch investments
      const qInv = query(collection(db, 'financial_investments'), orderBy('date', 'desc'));
      unsubscribeInv = onSnapshot(qInv, 
        (snapshot) => {
          const dbItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Investment));
          setInvestments(dbItems.filter(i => (i as any).status !== 'voided'));
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'financial_investments');
        }
      );

      // 4. Fetch cashflow
      const qCf = query(collection(db, 'financial_cashflow'), orderBy('date', 'desc'));
      unsubscribeCf = onSnapshot(qCf, 
        (snapshot) => {
          const dbItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CashFlowEntry));
          setCashflow(dbItems.filter(c => (c as any).status !== 'voided'));
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'financial_cashflow');
        }
      );

      // 5. Fetch traffic
      const qTr = query(collection(db, 'financial_traffic'), orderBy('date', 'desc'));
      unsubscribeTr = onSnapshot(qTr, 
        (snapshot) => {
          const dbItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TrafficCamp));
          setTraffic(dbItems.filter(t => (t as any).status !== 'voided'));
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'financial_traffic');
        }
      );
    } else {
      setInvestments([]);
      setCashflow([]);
      setTraffic([]);
    }

    setLoading(false);

    return () => {
      unsubscribeOrders();
      unsubscribeProducts();
      unsubscribeInv();
      unsubscribeCf();
      unsubscribeTr();
    };
  }, [authLoading, isAdmin]);

  // ----------------------------------------------------
  // LOGIC & MATH CALCULATIONS
  // ----------------------------------------------------

  // Helper to normalize status checks
  const getNormalizedStatus = (status: string) => {
    return String(status || '').trim().toLowerCase();
  };

  // Calculate Mercado Pago Rate & COGS per order helper
  const calculateFeesAndMargins = (order: any) => {
    const total = order.total || 0;
    const method = String(order.paymentMethod || '').toLowerCase();
    const gateway = String(order.gateway || '').toLowerCase();
    
    // 1. Calculate gateway/transaction Fee
    let gatewayFee = 0;
    if (gateway === 'manual' || order.isManual) {
      if (method.includes('pix')) {
        // 0.99% for PIX
        gatewayFee = total * 0.0099;
      } else if (method.includes('cartão') || method.includes('cartao') || method.includes('credit')) {
        // 3.99% + 0.40 for Credit Card
        gatewayFee = total * 0.0399 + 0.40;
      } else {
        // Cash (Dinheiro), Bank Transfer (Transferência), etc have no transactional fees
        gatewayFee = 0;
      }
    } else {
      // Site/Automatic orders (Gateway Mercado Pago)
      if (method.includes('pix')) {
        gatewayFee = total * 0.0099;
      } else {
        gatewayFee = total * 0.0399 + 0.40;
      }
    }

    // 2. Shipping cost (supporting both manual 'shipping' and 'frete' fields)
    const shippingCost = order.shipping || order.frete || 0;

    // 3. COGS cost (costPrice calculation)
    let cogs = 0;
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach((item: any) => {
        const prod = products.find(p => 
          p.id === item.id || 
          p.slug === item.id || 
          p.id === item.slug || 
          p.slug === item.slug
        );
        const singleCost = prod?.costPrice || prod?.cost || 0;
        cogs += singleCost * (item.quantity || 1);
      });
    }

    // 4. Net Profit
    const netProfit = total - gatewayFee - shippingCost - cogs;

    return { gatewayFee, shippingCost, cogs, netProfit };
  };

  // Helper to filter dates by period
  const isWithinPeriod = (dateInput: any, period: FinancialPeriod): boolean => {
    if (period === 'all') return true;
    if (!dateInput) return true;
    
    let d: Date;
    if (dateInput?.toDate && typeof dateInput.toDate === 'function') {
      d = dateInput.toDate();
    } else if (dateInput instanceof Date) {
      d = dateInput;
    } else if (typeof dateInput === 'string' || typeof dateInput === 'number') {
      d = new Date(dateInput);
    } else if (dateInput?.seconds) {
      d = new Date(dateInput.seconds * 1000);
    } else {
      return true;
    }

    if (isNaN(d.getTime())) return true;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    switch (period) {
      case 'today':
        return d >= todayStart;
      case '7days': {
        const past7 = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        return d >= past7;
      }
      case 'current_month': {
        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        return d >= startMonth;
      }
      case 'previous_month': {
        const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        const endPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return d >= startPrevMonth && d <= endPrevMonth;
      }
      case 'quarter': {
        const past90 = new Date(todayStart.getTime() - 90 * 24 * 60 * 60 * 1000);
        return d >= past90;
      }
      case 'year': {
        const startYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        return d >= startYear;
      }
      default:
        return true;
    }
  };

  // Filtered Datasets based on selected Period
  const filteredOrders = useMemo(() => {
    return orders.filter(o => isWithinPeriod(o.createdAt || o.createdAtDate || o.created_at || o.date, periodFilter));
  }, [orders, periodFilter]);

  const filteredCashflow = useMemo(() => {
    return cashflow.filter(c => isWithinPeriod(c.date || (c as any).createdAt, periodFilter));
  }, [cashflow, periodFilter]);

  const filteredTraffic = useMemo(() => {
    return traffic.filter(t => isWithinPeriod(t.date, periodFilter));
  }, [traffic, periodFilter]);

  const filteredInvestments = useMemo(() => {
    return investments.filter(i => isWithinPeriod(i.date || (i as any).createdAt, periodFilter));
  }, [investments, periodFilter]);

  // Canonical DRE Statement Computation
  const dreStats = useMemo(() => {
    return calculateFinancialDRE(filteredOrders, filteredCashflow, filteredInvestments, filteredTraffic, products);
  }, [filteredOrders, filteredCashflow, filteredInvestments, filteredTraffic, products]);

  // Order aggregations (Filtered by Period)
  const orderStats = useMemo(() => {
    const activeOrders = filteredOrders.filter(o => {
      const s = getNormalizedStatus(o.status);
      return s !== 'cancelled' && s !== 'canceled' && s !== 'pagamento não realizado';
    });

    const approvedOrders = filteredOrders.filter(o => {
      const s = getNormalizedStatus(o.status);
      return ['pagamento aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered', 'enviado', 'concluído', 'concluido'].includes(s);
    });

    const pendingOrders = filteredOrders.filter(o => {
      const s = getNormalizedStatus(o.status);
      return ['received', 'recebido', 'payment_pending', 'aguardando pagamento', 'aguardando pagamento pix'].includes(s);
    });

    const pendingPix = filteredOrders.filter(o => {
      const s = getNormalizedStatus(o.status);
      return s === 'aguardando pagamento pix';
    });

    const totalFaturamento = approvedOrders.reduce((acc, o) => acc + (o.total || 0), 0);
    const totalTransactions = approvedOrders.length;
    const ticketMedio = totalTransactions > 0 ? totalFaturamento / totalTransactions : 0;

    // Loop through approved orders to calculate accurate total COGS, gateway fees, shipping costs, and margins
    let totalCogsApproved = 0;
    let totalGatewayFeesApproved = 0;
    let totalShippingApproved = 0;
    let totalNetProfitApproved = 0;

    approvedOrders.forEach(o => {
      const calc = calculateFeesAndMargins(o);
      totalCogsApproved += calc.cogs;
      totalGatewayFeesApproved += calc.gatewayFee;
      totalShippingApproved += calc.shippingCost;
      totalNetProfitApproved += calc.netProfit;
    });

    const totalCheckoutOpportunities = activeOrders.length + filteredOrders.filter(o => {
      const s = getNormalizedStatus(o.status);
      return s === 'cancelled' || s === 'canceled';
    }).length;
    const checkoutSuccessRate = totalCheckoutOpportunities > 0 ? (approvedOrders.length / totalCheckoutOpportunities) * 100 : 85;

    return {
      faturamento: totalFaturamento,
      approvedCount: approvedOrders.length,
      pendingCount: pendingOrders.length,
      pendingPixCount: pendingPix.length,
      pendingPixValue: pendingPix.reduce((acc, o) => acc + (o.total || 0), 0),
      ticketMedio,
      cogs: totalCogsApproved,
      gatewayFees: totalGatewayFeesApproved,
      shipping: totalShippingApproved,
      lucroLiquido: totalNetProfitApproved,
      conversionRate: checkoutSuccessRate,
      rawOrders: approvedOrders
    };
  }, [filteredOrders, products]);

  // Initial Investment aggregations & Break-Even calculation
  const investmentStats = useMemo(() => {
    const totalInvestido = filteredInvestments.reduce((acc, current) => acc + Number(current.amount || 0), 0);
    
    // Break-even logic based on canonical DRE operating profit
    const saldoRestante = Math.max(0, totalInvestido - dreStats.operatingProfit);
    const porcentagemRecuperada = totalInvestido > 0 ? (dreStats.operatingProfit / totalInvestido) * 100 : 0;
    
    const lucroRealPosBreakEven = Math.max(0, dreStats.operatingProfit - totalInvestido);
    const hasRecovered = dreStats.operatingProfit >= totalInvestido;

    return {
      totalInvestido,
      saldoRestante,
      porcentagemRecuperada: Math.min(100, Math.max(0, porcentagemRecuperada)),
      lucroReal: lucroRealPosBreakEven,
      hasRecovered,
      financialBalance: dreStats.operatingProfit - totalInvestido
    };
  }, [filteredInvestments, dreStats.operatingProfit]);

  // Cashflow entries mapping
  const cashflowStats = useMemo(() => {
    const manualIn = filteredCashflow.filter(c => c.type === 'in' && (c as any).status !== 'voided').reduce((acc, current) => acc + Number(current.amount || 0), 0);
    const manualOut = filteredCashflow.filter(c => c.type === 'out' && (c as any).status !== 'voided').reduce((acc, current) => acc + Number(current.amount || 0), 0);
    
    const trafficAdsSpent = filteredTraffic.reduce((acc, t) => acc + Number(t.amountSpent || 0), 0);

    const totalEntradas = dreStats.cashIn;
    const totalSaidas = dreStats.cashOut;
    const saldoAtual = dreStats.netCashFlow;

    return {
      entradas: totalEntradas,
      saidas: totalSaidas,
      saldoAtual,
      manualIn,
      manualOut,
      adsSpent: trafficAdsSpent
    };
  }, [filteredCashflow, filteredTraffic, dreStats]);

  // Paid traffic computations
  const trafficStats = useMemo(() => {
    const totalInvestidoTrafego = filteredTraffic.reduce((acc, t) => acc + Number(t.amountSpent || 0), 0);
    const totalCliques = filteredTraffic.reduce((acc, t) => acc + Number(t.clicks || 0), 0);
    const totalVendasAtribuidasProps = filteredTraffic.reduce((acc, t) => acc + Number(t.conversions || 0), 0);

    const totalRevenueFromAds = totalVendasAtribuidasProps * orderStats.ticketMedio;
    const roas = totalInvestidoTrafego > 0 ? totalRevenueFromAds / totalInvestidoTrafego : 0;
    const cac = totalVendasAtribuidasProps > 0 ? totalInvestidoTrafego / totalVendasAtribuidasProps : 0;
    
    const campaignList = filteredTraffic.map(t => {
      const estimatedValue = Number(t.conversions || 0) * orderStats.ticketMedio;
      const campanhaRoas = Number(t.amountSpent) > 0 ? estimatedValue / Number(t.amountSpent) : 0;
      const campanhaLucro = estimatedValue - Number(t.amountSpent);
      return {
        ...t,
        estimatedValue,
        roas: campanhaRoas,
        lucro: campanhaLucro
      };
    });

    return {
      totalInvestido: totalInvestidoTrafego,
      totalCliques,
      totalConversions: totalVendasAtribuidasProps,
      roas,
      cac,
      campaigns: campaignList
    };
  }, [filteredTraffic, orderStats.ticketMedio]);

  // Product analytical stats (best sellers, profitability, margins)
  const productFinancialStats = useMemo(() => {
    const productsMetrics: Record<string, { quantity: number; faturamento: number; totalCost: number; profit: number }> = {};

    // Initialize metrics under canonical p.id only
    products.forEach(p => {
      productsMetrics[p.id] = {
        quantity: 0,
        faturamento: 0,
        totalCost: 0,
        profit: 0
      };
    });

    // Populate using approved orders details
    const approvedOrders = orders.filter(o => {
      const s = getNormalizedStatus(o.status);
      return ['pagamento aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered', 'enviado', 'concluído', 'concluido'].includes(s);
    });

    approvedOrders.forEach(o => {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          // Robust product matching to consolidate sales stats under the correct canonical product ID
          const prod = products.find(p => 
            p.id === item.id || 
            p.slug === item.id || 
            p.id === item.slug || 
            p.slug === item.slug
          );
          
          const key = prod ? prod.id : (item.id || item.slug);
          if (!key) return;

          const qty = Number(item.quantity) || 1;
          const price = Number(item.price) || 0;
          const cost = Number(prod?.costPrice || prod?.cost || 0);

          if (!productsMetrics[key]) {
            productsMetrics[key] = { quantity: 0, faturamento: 0, totalCost: 0, profit: 0 };
          }

          productsMetrics[key].quantity += qty;
          productsMetrics[key].faturamento += price * qty;
          productsMetrics[key].totalCost += cost * qty;
          productsMetrics[key].profit += (price - cost) * qty;
        });
      }
    });

    // Map to list
    const productFinList = products.map(p => {
      // Direct lookup under the consolidated canonical product ID
      const stats = productsMetrics[p.id] || { quantity: 0, faturamento: 0, totalCost: 0, profit: 0 };
      const currentPrice = Number(p.price || 0);
      const currentCost = Number(p.costPrice || p.cost || 0);
      const margemUnitariaValue = currentPrice > 0 ? ((currentPrice - currentCost) / currentPrice) * 100 : 0;

      // Realtime stock from inventory collection
      const dynamicStock = inventory && inventory[p.id] !== undefined
        ? Number(inventory[p.id].stock)
        : Number(p.stock !== undefined ? p.stock : p.globalStock !== undefined ? p.globalStock : p.estoque !== undefined ? p.estoque : p.quantity !== undefined ? p.quantity : p.inventory !== undefined ? p.inventory : p.estoqueGlobal !== undefined ? p.estoqueGlobal : 0);

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: currentPrice,
        cost: currentCost,
        stock: dynamicStock,
        soldCount: stats.quantity,
        totalFaturamento: stats.faturamento,
        totalProfit: stats.profit,
        unitProfit: currentPrice - currentCost,
        margin: margemUnitariaValue
      };
    });

    return {
      list: productFinList,
      averageMargin: productFinList.length > 0 ? productFinList.reduce((acc, p) => acc + p.margin, 0) / productFinList.length : 0
    };
  }, [products, orders, inventory]);

  // Break Even & Growth Estimates
  const breakEvenStats = useMemo(() => {
    // Break-even point in orders = Fixed investment divided by Net average profit of an order
    const averageProfitPerOrder = orderStats.lucroLiquido > 0 ? orderStats.lucroLiquido / orderStats.approvedCount : 90; // fallback R$ 90 margin
    const pontoEquilibrioPedidos = averageProfitPerOrder > 0 ? Math.ceil(investmentStats.totalInvestido / averageProfitPerOrder) : 0;

    // Estimate Date of Returns
    // Calculated based on daily average net profit. Let's find sales timeline
    const approvedHistory = orders.filter(o => {
      const s = getNormalizedStatus(o.status);
      return ['pagamento aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered', 'enviado', 'concluído', 'concluido'].includes(s);
    });
    
    let estimatedReturnDate = "Pendente de mais vendas";
    if (approvedHistory.length >= 2 && orderStats.lucroLiquido > 0 && !investmentStats.hasRecovered) {
      const lastObj = approvedHistory[0];
      const oldestObj = approvedHistory[approvedHistory.length - 1];
      
      const lastTime = lastObj.createdAtDate instanceof Date && !isNaN(lastObj.createdAtDate.getTime()) 
        ? lastObj.createdAtDate.getTime() 
        : Date.now();
        
      const oldestTime = oldestObj.createdAtDate instanceof Date && !isNaN(oldestObj.createdAtDate.getTime())
        ? oldestObj.createdAtDate.getTime()
        : (Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const diffDays = Math.max(1, (lastTime - oldestTime) / (24 * 60 * 60 * 1000));
      const dailyNetProfit = orderStats.lucroLiquido / diffDays;

      if (dailyNetProfit > 0) {
        const remainingDays = investmentStats.saldoRestante / dailyNetProfit;
        const returnTimestamp = Date.now() + remainingDays * 24 * 60 * 60 * 1000;
        estimatedReturnDate = new Date(returnTimestamp).toLocaleDateString('pt-BR');
      }
    } else if (investmentStats.hasRecovered) {
      estimatedReturnDate = "INVESTIMENTO JÁ RECUPERADO 🎉";
    }

    return {
      pedidosBreakEven: pontoEquilibrioPedidos,
      estimatedReturnDate,
      averageOrderProfit: averageProfitPerOrder
    };
  }, [orderStats, investmentStats, orders]);

  // Filter products for tab "4. Margem Produtos"
  const filteredProductsList = useMemo(() => {
    if (visibleProductIds.length === 0) {
      // Fallback if not initialized yet OR empty. Filter standard FORCE, MARK, PRIME.
      return productFinancialStats.list.filter(p => {
        const nameUpper = (p.name || '').toUpperCase();
        const slugUpper = (p.slug || '').toUpperCase();
        return ['FORCE', 'MARK', 'PRIME'].some(keyword => 
          nameUpper.includes(keyword) || slugUpper.includes(keyword)
        );
      });
    }
    return productFinancialStats.list.filter(p => p.id && visibleProductIds.includes(p.id));
  }, [productFinancialStats.list, visibleProductIds]);

  const filteredAverageMargin = useMemo(() => {
    if (filteredProductsList.length === 0) return 0;
    return filteredProductsList.reduce((acc, p) => acc + p.margin, 0) / filteredProductsList.length;
  }, [filteredProductsList]);


  // ----------------------------------------------------
  // HANDLERS FOR FORMS & VOIDING
  // ----------------------------------------------------

  const handleAddInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invForm.description || !invForm.amount) {
      toast.error('Preencha os campos obrigatórios!');
      return;
    }
    const amountVal = parseFloat(invForm.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }

    try {
      const idempotencyKey = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await authenticatedFetch('/api/admin/financial/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: invForm.description,
          amount: amountVal,
          category: invForm.category,
          date: invForm.date,
          idempotencyKey
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Erro ao registrar investimento.');
      }

      toast.success('Investimento registrado com sucesso!');
      setInvForm({ description: '', amount: '', category: 'fornecedores', date: new Date().toISOString().split('T')[0] });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar investimento.');
    }
  };

  const handleAddCashFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfForm.description || !cfForm.amount) {
      toast.error('Preencha os campos obrigatórios!');
      return;
    }
    const amountVal = parseFloat(cfForm.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }

    try {
      const idempotencyKey = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await authenticatedFetch('/api/admin/financial/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: cfForm.description,
          amount: amountVal,
          type: cfForm.type,
          category: cfForm.category,
          date: cfForm.date,
          idempotencyKey
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Erro ao registrar lançamento financeiro.');
      }

      toast.success('Lançamento inserido no Fluxo de Caixa!');
      setCfForm({ description: '', amount: '', type: 'out', category: 'Tráfego Pago', date: new Date().toISOString().split('T')[0] });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar despesa.');
    }
  };

  const handleAddTraffic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trafficForm.campaignName || !trafficForm.amountSpent) {
      toast.error('Preencha os campos de campanha e valor!');
      return;
    }
    const amountVal = parseFloat(trafficForm.amountSpent);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Informe um valor investido válido maior que zero.');
      return;
    }

    try {
      const idempotencyKey = `trf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await authenticatedFetch('/api/admin/financial/traffic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: trafficForm.campaignName,
          amountSpent: amountVal,
          clicks: parseInt(trafficForm.clicks) || 0,
          conversions: parseInt(trafficForm.conversions) || 0,
          date: trafficForm.date,
          idempotencyKey
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Erro ao registrar métricas de tráfego.');
      }

      toast.success('Métricas da campanha registradas com sucesso!');
      setTrafficForm({ campaignName: '', amountSpent: '', clicks: '', conversions: '', date: new Date().toISOString().split('T')[0] });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar tráfego pago.');
    }
  };

  const handleVoidExpense = async (expenseId: string) => {
    try {
      const idempotencyKey = `void_exp_${expenseId}_${Date.now()}`;
      const res = await authenticatedFetch('/api/admin/financial/expenses/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseId,
          reason: 'Anulação solicitada via Painel Financeiro',
          idempotencyKey
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Erro ao anular lançamento.');
      }

      toast.success('Lançamento anulado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao anular lançamento.');
    }
  };

  const handleVoidInvestment = async (investmentId: string) => {
    try {
      const idempotencyKey = `void_inv_${investmentId}_${Date.now()}`;
      const res = await authenticatedFetch('/api/admin/financial/investments/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investmentId,
          reason: 'Anulação solicitada via Painel Financeiro',
          idempotencyKey
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Erro ao anular investimento.');
      }

      toast.success('Investimento anulado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao anular investimento.');
    }
  };

  const handleVoidTraffic = async (trafficId: string) => {
    try {
      const idempotencyKey = `void_trf_${trafficId}_${Date.now()}`;
      const res = await authenticatedFetch('/api/admin/financial/traffic/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trafficId,
          reason: 'Anulação solicitada via Painel Financeiro',
          idempotencyKey
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Erro ao anular registro de tráfego.');
      }

      toast.success('Registro de tráfego anulado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao anular registro de tráfego.');
    }
  };

  // Bulk Product Costs updates
  const handleUpdateProductCost = async (pId: string, costVal: number, priceVal: number) => {
    try {
      await updateDoc(doc(db, 'products', pId), {
        costPrice: costVal,
        price: priceVal,
        updatedAt: serverTimestamp()
      });
      toast.success('Métricas do Produto Atualizadas!');
    } catch (err) {
      toast.error('Erro de permissão ou rede ao atualizar.');
    }
  };

  // Add an existing catalog product to margins view list
  const handleAddProductToView = (id: string) => {
    setVisibleProductIds(prev => {
      let base = prev;
      if (prev.length === 0) {
        base = products
          .filter(p => {
            const nameUpper = (p.name || '').toUpperCase();
            const slugUpper = (p.slug || '').toUpperCase();
            return ['FORCE', 'MARK', 'PRIME'].some(keyword => 
              nameUpper.includes(keyword) || slugUpper.includes(keyword)
            );
          })
          .map(p => p.id)
          .filter(Boolean);
      }
      if (base.includes(id)) return base;
      const updated = [...base, id];
      localStorage.setItem('fpac_financial_visible_product_ids', JSON.stringify(updated));
      localStorage.setItem('fpac_financial_visible_product_ids_init', 'true');
      return updated;
    });
    toast.success('Produto incluído na visualização.');
  };

  // Create a brand new catalog product and include it in margins view list automatically
  const handleCreateAndAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, price, costPrice, stock } = newProdForm;
    if (!name || !price) {
      toast.error('Preencha pelo menos o Nome e o Preço de Venda!');
      return;
    }

    try {
      const slugVal = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
      const docRef = doc(collection(db, 'products'));
      const newId = docRef.id;

      const finalVal = {
        id: newId,
        name: name.toUpperCase(),
        slug: slugVal,
        price: parseFloat(price) || 0,
        costPrice: parseFloat(costPrice) || 0,
        cost: parseFloat(costPrice) || 0,
        stock: parseInt(stock) || 0,
        category: 'Camisetas',
        headline: 'STREETWEAR',
        description: 'Cadastrado pelo painel financeiro',
        images: [''],
        isActive: true,
        minStock: 5,
        isNew: false,
        isBestseller: false,
        createdAt: serverTimestamp()
      };

      await setDoc(docRef, finalVal);

      // Now add to view
      setVisibleProductIds(prev => {
        let base = prev;
        if (prev.length === 0) {
          base = products
            .filter(p => {
              const nameUpper = (p.name || '').toUpperCase();
              const slugUpper = (p.slug || '').toUpperCase();
              return ['FORCE', 'MARK', 'PRIME'].some(keyword => 
                nameUpper.includes(keyword) || slugUpper.includes(keyword)
              );
            })
            .map(p => p.id)
            .filter(Boolean);
        }
        const updated = [...base, newId];
        localStorage.setItem('fpac_financial_visible_product_ids', JSON.stringify(updated));
        localStorage.setItem('fpac_financial_visible_product_ids_init', 'true');
        return updated;
      });

      // Clear newProdForm state & Close Modal
      setNewProdForm({ name: '', price: '', costPrice: '', stock: '' });
      setShowAddProdModal(false);
      toast.success('Produto criado e adicionado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar produto!');
    }
  };

  // Remove product from margins view or delete from system
  const handleDeleteProductFromView = async (id: string, mode: 'hide' | 'delete') => {
    // Make sure we have the base list computed before removing
    let baseList = visibleProductIds;
    if (visibleProductIds.length === 0) {
      baseList = products
        .filter(p => {
          const nameUpper = (p.name || '').toUpperCase();
          const slugUpper = (p.slug || '').toUpperCase();
          return ['FORCE', 'MARK', 'PRIME'].some(keyword => 
            nameUpper.includes(keyword) || slugUpper.includes(keyword)
          );
        })
        .map(p => p.id)
        .filter(Boolean);
    }

    if (mode === 'hide') {
      const updated = baseList.filter(item => item !== id);
      setVisibleProductIds(updated);
      localStorage.setItem('fpac_financial_visible_product_ids', JSON.stringify(updated));
      localStorage.setItem('fpac_financial_visible_product_ids_init', 'true');
      toast.success('Produto ocultado da visualização.');
    } else {
      if (!window.confirm('Tem certeza que deseja excluir DEFINITIVAMENTE este produto de todo o sistema? Esta ação removerá o produto do catálogo de vendas.')) {
        return;
      }
      try {
        const updated = baseList.filter(item => item !== id);
        setVisibleProductIds(updated);
        localStorage.setItem('fpac_financial_visible_product_ids', JSON.stringify(updated));
        localStorage.setItem('fpac_financial_visible_product_ids_init', 'true');

        await deleteDoc(doc(db, 'products', id));
        toast.success('Produto excluído definitivamente do banco de dados!');
      } catch (err) {
        console.error(err);
        toast.error('Erro ao deletar produto do banco!');
      }
    }
  };

  // ----------------------------------------------------
  // GOOGLE SHEETS DYNAMIC WEBHOOK EXPORTER
  // ----------------------------------------------------
  const handleGoogleSheetsSync = async (silent = false) => {
    if (!sheetWebhookUrl) {
      if (!silent) toast.error("Insira a URL do Script Web do Google Sheets para continuar!");
      return;
    }
    
    if (!silent) setIsSyncingWebhook(true);
    try {
      // Package entire data to send
      const dataPayload = {
        meta: {
          storeName: "F PAC STORE",
          timestamp: new Date().toISOString(),
          totals: {
            faturamento: orderStats.faturamento,
            investimentoInicial: investmentStats.totalInvestido,
            recuperadoPorcentagem: investmentStats.porcentagemRecuperada,
            lucroLiquido: orderStats.lucroLiquido,
            caixaSaldo: cashflowStats.saldoAtual,
            adsSpent: cashflowStats.adsSpent,
            pontoEquilibrio: breakEvenStats.pedidosBreakEven
          }
        },
        investments,
        ordersList: orders.map(o => {
          const calc = calculateFeesAndMargins(o);
          return {
            id: o.id,
            cliente: o.customerName,
            total: o.total,
            status: o.status,
            metodo: o.paymentMethod,
            data: o.createdAtDate?.toLocaleDateString('pt-BR') || '',
            custo_produto: calc.cogs,
            taxa_mp: calc.gatewayFee,
            frete: calc.shippingCost,
            lucro_liquido: calc.netProfit
          };
        }),
        productsCatalog: productFinancialStats.list,
        cashflowEntries: cashflow,
        trafficCampaigns: trafficStats.campaigns
      };

      const resp = await fetch(sheetWebhookUrl, {
        method: 'POST',
        mode: 'no-cors', // standard webhook targets
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataPayload)
      });
      
      if (!silent) toast.success("Dados enviados para sua Planilha Google Sheets! 🎉");
    } catch (err: any) {
      console.error(err);
      if (!silent) toast.error("Falha ao sincronizar. Verifique se o Google Apps Script está publicado!");
    } finally {
      if (!silent) setIsSyncingWebhook(false);
    }
  };

  // Download tabular structure as CSV helper for standard sheets import
  const handleDownloadCSV = (type: 'investments' | 'orders' | 'products' | 'cashflow' | 'traffic') => {
    let headers = '';
    let rows = '';

    if (type === 'investments') {
      headers = 'ID;Data;Descrição;Categoria;Valor (R$)\n';
      rows = investments.map(i => `${i.id};${i.date};${i.description};${i.category};${i.amount.toFixed(2)}`).join('\n');
    } else if (type === 'orders') {
      headers = 'Pedido ID;Data;Cliente;Método;Total (R$);Status;Gateway Pago;Custo Produto;Frete Pago;Lucro Líquido (R$)\n';
      rows = orders.map(o => {
        const calc = calculateFeesAndMargins(o);
        const dateStr = o.createdAtDate ? o.createdAtDate.toLocaleDateString('pt-BR') : '';
        return `${o.id};${dateStr};${o.customerName};${o.paymentMethod};${Number(o.total || 0).toFixed(2)};${o.status};${calc.gatewayFee.toFixed(2)};${calc.cogs.toFixed(2)};${calc.shippingCost.toFixed(2)};${calc.netProfit.toFixed(2)}`;
      }).join('\n');
    } else if (type === 'products') {
      headers = 'SKU;Nome;Estoque;Preço Venda (R$);Custo Unitário (R$);Vendidos;Faturamento Total;Lucro Acumulado;Margem (%)\n';
      rows = productFinancialStats.list.map(p => `${p.slug};${p.name};${p.stock};${p.price.toFixed(2)};${p.cost.toFixed(2)};${p.soldCount};${p.totalFaturamento.toFixed(2)};${p.totalProfit.toFixed(2)};${p.margin.toFixed(1)}`).join('\n');
    } else if (type === 'cashflow') {
      headers = 'ID;Data;Tipo;Descrição;Categoria;Valor (R$)\n';
      rows = cashflow.map(c => `${c.id};${c.date};${c.type === 'in' ? 'Entrada' : 'Saída'};${c.description};${c.category};${c.amount.toFixed(2)}`).join('\n');
    } else if (type === 'traffic') {
      headers = 'ID;Data;Campanha;Investimento;Cliques;Vendas Atribuídas;ROAS;Lucro Estimado\n';
      rows = trafficStats.campaigns.map(c => `${c.id};${c.date};${c.campaignName};${c.amountSpent.toFixed(2)};${c.clicks};${c.conversions};${c.roas.toFixed(1)};${c.lucro.toFixed(2)}`).join('\n');
    }

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(headers + rows);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `fpac_financeiro_${type}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* 1. HERO HEADER - ESTAMPAS STANDARD PATTERN */}
      <div className="bg-black text-white px-4 md:px-8 py-4 md:py-6 border-b-2 border-[#eab308] relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-12 translate-y-12 pointer-events-none">
          <DollarSign size={200} className="text-white" />
        </div>
        
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#eab308] text-black px-2 py-0.5 text-[8px] font-black uppercase tracking-widest font-mono">
                SGC v2.4
              </span>
              <span className="text-gray-400 text-[9px] font-bold uppercase tracking-[0.2em] font-sans">
                • GESTÃO FINANCEIRA E RECURSOS
              </span>
            </div>
            
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight italic font-sans">
              GESTÃO <span className="text-[#eab308]">FINANCEIRA</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => handleDownloadCSV('orders')}
              className="bg-[#eab308] text-black hover:bg-white transition-all px-4 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={13} /> Exportar CSV
            </button>
          </div>
        </div>
      </div>

      {/* 2. INDICATOR CARDS (KPIs) - ESTAMPAS STANDARD PATTERN */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 -translate-y-3 relative z-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 block font-sans">Faturamento Total</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-emerald-700">{formatMoney(orderStats.faturamento)}</span>
            </div>
            <span className="text-[8px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Aprovados</span>
          </div>

          <div className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 block font-sans">Lucro Líquido Real</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-amber-600">{formatMoney(orderStats.lucroLiquido)}</span>
            </div>
            <span className="text-[8px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Líquido</span>
          </div>

          <div className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 block font-sans">Ticket Médio</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block">{formatMoney(orderStats.ticketMedio)}</span>
            </div>
            <span className="text-[8px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Média</span>
          </div>

          <div className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-blue-600 block font-sans">Saldo de Caixa</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-blue-700">{formatMoney(cashflowStats.saldoAtual)}</span>
            </div>
            <span className="text-[8px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Caixa</span>
          </div>
        </div>
      </div>

      {/* Period Selector Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-black/10 p-3 mx-auto w-full">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-[#eab308]" />
          <span className="text-[9px] font-black uppercase tracking-wider text-black">Período de Análise:</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {[
            { id: 'all', label: 'Todo o Período' },
            { id: 'today', label: 'Hoje' },
            { id: '7days', label: 'Últimos 7 Dias' },
            { id: 'current_month', label: 'Mês Atual' },
            { id: 'previous_month', label: 'Mês Anterior' },
            { id: 'quarter', label: 'Trimestre' },
            { id: 'year', label: 'Ano Atual' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setPeriodFilter(p.id as FinancialPeriod)}
              className={cn(
                "px-3 py-1.5 text-[8.5px] font-black uppercase tracking-wider transition-all border cursor-pointer",
                periodFilter === p.id 
                  ? "bg-black text-[#eab308] border-black shadow-sm" 
                  : "bg-white text-gray-500 border-black/10 hover:bg-gray-50 hover:text-black"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid tabs */}
      <div className="flex flex-row overflow-x-auto border-b border-black/10 pb-1 scrollbar-none gap-1 bg-gray-50 p-1">
        {[
          { id: 'dashboard', label: '1. Visão Geral', icon: <PieChart size={14} /> },
          { id: 'profitability', label: '2. Rentabilidade & Precificação', icon: <TrendingUp size={14} /> },
          { id: 'receivables', label: '3. Contas a Receber', icon: <CreditCard size={14} /> },
          { id: 'payables', label: '4. Contas a Pagar', icon: <Building2 size={14} /> },
          { id: 'forecast', label: '5. Previsão Caixa', icon: <Clock size={14} /> },
          { id: 'suppliers', label: '6. Fornecedores', icon: <Layers size={14} /> },
          { id: 'payments', label: '7. Pagamentos', icon: <CheckCircle2 size={14} /> },
          { id: 'refunds', label: '8. Reembolsos', icon: <RotateCcw size={14} /> },
          { id: 'ledger', label: '9. Histórico / Ledger', icon: <History size={14} /> },
          { id: 'cashflow', label: '10. Fluxo de Caixa', icon: <RefreshCw size={14} /> },
          { id: 'investments', label: '11. Custos Loja', icon: <DollarSign size={14} /> },
          { id: 'traffic', label: '12. Tráfego Ads', icon: <Target size={14} /> },
          { id: 'products', label: '13. Margem Produtos', icon: <Layers size={14} /> },
          { id: 'sheets', label: '14. Integração Sheets', icon: <FileSpreadsheet size={14} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={cn(
              "px-4 py-3 text-[8.5px] font-black uppercase tracking-widest flex items-center gap-2 transition-all outline-none shrink-0 border cursor-pointer",
              activeSubTab === tab.id 
                ? "bg-black text-[#eab308] border-black shadow-md scale-102"
                : "bg-white text-gray-500 border-black/5 hover:text-black hover:bg-gray-100"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ----------------------------------------------------
          SUBTAB 1: DASHBOARD
         ---------------------------------------------------- */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* Recovery Gauge Alert Block */}
          <div className={cn(
            "p-8 border relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6",
            investmentStats.hasRecovered 
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800"
              : "bg-red-500/10 border-red-500/20 text-rose-800"
          )}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {investmentStats.hasRecovered ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-rose-600" />}
                <span className="text-[10px] font-black uppercase tracking-widest italic">{investmentStats.hasRecovered ? 'BREAK-EVEN ATINGIDO! LUCRO REAL DESTRAVADO' : 'FASE DE RECUPERAÇÃO DAS DESPESAS INICIAIS'}</span>
              </div>
              <h3 className="text-3xl font-black uppercase tracking-tighter italic">
                {investmentStats.hasRecovered 
                  ? `${formatMoney(investmentStats.lucroReal)} EM LUCRO REAL NET` 
                  : `PREJUÍZO OPERACIONAL ACUMULADO: ${formatMoney(investmentStats.saldoRestante)}`
                }
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-widest max-w-2xl leading-relaxed opacity-70">
                A loja opera em saldo negativo teórico de aquisição até que o volume somado do Lucro Líquido Real (Receitas - Taxas - Frete - Custos Fabricação) cubra 100% do Investimento Inicial.
              </p>
            </div>
            
            {/* Visual Amortization Progress Bar */}
            <div className="w-full md:w-80 shrink-0 space-y-3">
              <div className="flex justify-between text-xs font-black uppercase">
                 <span>Amortização</span>
                 <span className="italic">{formatPercent(investmentStats.porcentagemRecuperada)}</span>
              </div>
              <div className="h-4 bg-black/10 w-full overflow-hidden">
                 <div 
                   className={cn("h-full transition-all duration-1000", investmentStats.hasRecovered ? "bg-emerald-500" : "bg-[#eab308]")} 
                   style={{ width: `${investmentStats.porcentagemRecuperada}%` }} 
                 />
              </div>
              <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest opacity-60">
                 <span>Recuperado: {formatMoney(orderStats.lucroLiquido)}</span>
                 <span>Investido: {formatMoney(investmentStats.totalInvestido)}</span>
              </div>
            </div>
          </div>

          {/* Operational Alerts & Receivables Health Banner */}
          {(() => {
            const overdueOrders = orders.filter(o => isOrderPaymentOverdue(o));
            const overdueTotal = overdueOrders.reduce((acc, o) => acc + getOrderPendingAmount(o), 0);
            const pendingOrders = orders.filter(o => getOrderPendingAmount(o) > 0);
            const pendingTotal = pendingOrders.reduce((acc, o) => acc + getOrderPendingAmount(o), 0);
            const dueTodayOrders = orders.filter(o => getPaymentBadgeType(o) === 'due_today');
            const refundedOrders = orders.filter(o => getOrderRefundedAmount(o) > 0);
            const refundedTotal = refundedOrders.reduce((acc, o) => acc + getOrderRefundedAmount(o), 0);

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Overdue Card */}
                <div className={`p-4 border transition-all ${overdueOrders.length > 0 ? 'bg-red-50/70 border-red-200 text-red-950' : 'bg-gray-50/50 border-black/5 text-gray-700'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[8.5px] font-black uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle size={13} className={overdueOrders.length > 0 ? "text-red-600" : "text-gray-400"} />
                      Inadimplência (Atrasados)
                    </span>
                    <span className={`px-1.5 py-0.5 text-[7.5px] font-black font-mono ${overdueOrders.length > 0 ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                      {overdueOrders.length}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className={`text-xl font-black font-mono ${overdueOrders.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                      {formatMoney(overdueTotal)}
                    </span>
                    <button
                      onClick={() => setActiveSubTab('receivables')}
                      className="text-[8px] font-black uppercase tracking-wider text-black hover:text-[#eab308] underline cursor-pointer"
                    >
                      Cobrar ➔
                    </button>
                  </div>
                </div>

                {/* Total Pending Card */}
                <div className="p-4 border bg-amber-50/50 border-amber-200 text-amber-950">
                  <div className="flex items-center justify-between">
                    <span className="text-[8.5px] font-black uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={13} className="text-amber-600" />
                      Total a Receber (Pendente)
                    </span>
                    <span className="px-1.5 py-0.5 text-[7.5px] font-black font-mono bg-amber-500 text-black">
                      {pendingOrders.length} pedidos
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-black font-mono text-amber-800">
                      {formatMoney(pendingTotal)}
                    </span>
                    <button
                      onClick={() => setActiveSubTab('receivables')}
                      className="text-[8px] font-black uppercase tracking-wider text-amber-900 hover:underline cursor-pointer"
                    >
                      Ver Todos ➔
                    </button>
                  </div>
                </div>

                {/* Refunded Card */}
                <div className="p-4 border bg-purple-50/50 border-purple-200 text-purple-950">
                  <div className="flex items-center justify-between">
                    <span className="text-[8.5px] font-black uppercase tracking-wider flex items-center gap-1.5">
                      <RotateCcw size={13} className="text-purple-600" />
                      Estornos / Reembolsos
                    </span>
                    <span className="px-1.5 py-0.5 text-[7.5px] font-black font-mono bg-purple-600 text-white">
                      {refundedOrders.length}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-black font-mono text-purple-800">
                      {formatMoney(refundedTotal)}
                    </span>
                    <button
                      onClick={() => setActiveSubTab('refunds')}
                      className="text-[8px] font-black uppercase tracking-wider text-purple-900 hover:underline cursor-pointer"
                    >
                      Detalhes ➔
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Bento Grid core numeric summary widgets */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* KPI 1 : Faturamento Real Approved */}
            <div className="bg-white border p-6 flex flex-col justify-between min-h-[140px] shadow-sm relative overflow-hidden group hover:border-[#eab308] transition-colors">
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[9px] font-black uppercase tracking-widest">Faturamento Líquido (Aprovados)</span>
                <DollarSign size={16} className="text-[#eab308]" />
              </div>
              <div>
                <h3 className="text-3xl font-black italic tracking-tighter text-black">{formatMoney(orderStats.faturamento)}</h3>
                <div className="flex justify-between items-center text-[8px] font-bold uppercase tracking-widest text-emerald-600 mt-2">
                   <span>{orderStats.approvedCount} pedidos pagos</span>
                   <span className="bg-emerald-500/10 px-2 py-0.5 font-sans relative flex items-center gap-1">
                     <ArrowUpRight size={8} /> SITE ATIVO
                   </span>
                </div>
              </div>
            </div>

            {/* KPI 2 : Lucro Líquido Real */}
            <div className="bg-white border p-6 flex flex-col justify-between min-h-[140px] shadow-sm relative overflow-hidden group hover:border-[#eab308] transition-colors">
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[9px] font-black uppercase tracking-widest">Lucro Líquido Líquido (Real)</span>
                <TrendingUp size={16} className="text-emerald-500" />
              </div>
              <div>
                <h3 className="text-3xl font-black italic tracking-tighter text-black">{formatMoney(orderStats.lucroLiquido)}</h3>
                <div className="flex justify-between items-center text-[8px] font-bold uppercase tracking-widest text-black/50 mt-2">
                   <span>Margem Média: {formatPercent(productFinancialStats.averageMargin)}</span>
                   <span>COGS: {formatMoney(orderStats.cogs)}</span>
                </div>
              </div>
            </div>

            {/* KPI 3 : Ticket Médio & ROI */}
            <div className="bg-white border p-6 flex flex-col justify-between min-h-[140px] shadow-sm relative overflow-hidden group hover:border-[#eab308] transition-colors">
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[9px] font-black uppercase tracking-widest">Ticket Médio / ROI Geral</span>
                <Award size={16} className="text-blue-500" />
              </div>
              <div>
                <h3 className="text-3xl font-black italic tracking-tighter text-black">{formatMoney(orderStats.ticketMedio)}</h3>
                <div className="flex justify-between items-center text-[8px] font-bold uppercase tracking-widest text-blue-600 mt-2">
                   <span>Sucesso Checkout: {formatPercent(orderStats.conversionRate)}</span>
                   <span>Conversor Ativo</span>
                </div>
              </div>
            </div>

            {/* KPI 4 : Ponto de Equilíbrio & Alvos */}
            <div className="bg-white border p-6 flex flex-col justify-between min-h-[140px] shadow-sm relative overflow-hidden group hover:border-[#eab308] transition-colors">
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[9px] font-black uppercase tracking-widest">Ponto de Equilíbrio Metas</span>
                <Target size={16} className="text-rose-500" />
              </div>
              <div>
                <h3 className="text-3xl font-black italic tracking-tighter text-black">{breakEvenStats.pedidosBreakEven} Pedidos</h3>
                <div className="flex justify-between items-center text-[8px] font-bold uppercase tracking-widest mt-2">
                   <span className="text-rose-500 font-extrabold capitalize">Min para Payback</span>
                   <span className="text-gray-400">Retorno: {breakEvenStats.estimatedReturnDate}</span>
                </div>
              </div>
            </div>

          </div>

          {/* Secondary Stats Row (PIX and Pending balances) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-amber-500/5 border border-amber-500/10 p-6 flex items-center justify-between">
              <div>
                <span className="text-[8px] font-extrabold text-amber-600 uppercase tracking-widest">PEDIDOS AGUARDANDO PIX</span>
                <h4 className="text-xl font-black text-black mt-1">{orderStats.pendingPixCount} Pedidos</h4>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-extrabold text-amber-600 uppercase tracking-widest">VALOR EM JOGO</span>
                <h4 className="text-xl font-black text-black mt-1">{formatMoney(orderStats.pendingPixValue)}</h4>
              </div>
            </div>

            <div className="bg-black/5 border border-black/10 p-6 flex items-center justify-between">
              <div>
                <span className="text-[8px] font-extrabold text-gray-500 uppercase tracking-widest">TOTAL INVESTIMENTO ATIVO</span>
                <h4 className="text-xl font-black text-black mt-1">{formatMoney(investmentStats.totalInvestido)}</h4>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-extrabold text-gray-500 uppercase tracking-widest">AMORTIZADO</span>
                <h4 className="text-xl font-black text-emerald-600 mt-1">{formatMoney(orderStats.lucroLiquido)}</h4>
              </div>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/10 p-6 flex items-center justify-between">
              <div>
                <span className="text-[8px] font-extrabold text-blue-600 uppercase tracking-widest">SALDO DO CAIXA REAL</span>
                <h4 className="text-xl font-black text-black mt-1">{formatMoney(cashflowStats.saldoAtual)}</h4>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-extrabold text-blue-600 uppercase tracking-widest">TRÁFEGO ADS</span>
                <h4 className="text-xl font-black text-black mt-1">{formatMoney(cashflowStats.adsSpent)}</h4>
              </div>
            </div>
          </div>

          {/* Canonical DRE Statement (Demonstrativo do Resultado do Exercício) */}
          <div className="bg-white border p-6 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-black text-[#eab308] px-2 py-0.5 text-[8px] font-black uppercase tracking-widest font-mono">
                    DRE OFICIAL
                  </span>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    Demonstrativo do Resultado do Exercício
                  </span>
                </div>
                <h3 className="text-xl font-black uppercase italic tracking-tight mt-1 text-black">
                  Estrutura de Receitas, Custos e Lucro Real
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn(
                  "px-2.5 py-1 text-[8px] font-black uppercase tracking-wider border",
                  dreStats.isCostEstimated 
                    ? "bg-amber-50 text-amber-800 border-amber-200" 
                    : "bg-emerald-50 text-emerald-800 border-emerald-200"
                )}>
                  {dreStats.isCostEstimated 
                    ? `Estimativa (${dreStats.costCoveragePercent}% Snapshot)` 
                    : '100% Custo Real (Snapshot)'}
                </span>
                <span className="text-[9px] font-mono font-bold text-gray-500">
                  {dreStats.totalValidOrders} Pedidos Válidos
                </span>
              </div>
            </div>

            {/* DRE Waterfall Visual Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50/80 border border-black/5 space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">1. Faturamento Bruto</span>
                <div className="text-xl font-black font-mono text-black">{formatMoney(dreStats.grossRevenue)}</div>
                <div className="text-[7.5px] text-gray-500 font-bold uppercase">Volume total vendido</div>
              </div>

              <div className="p-4 bg-blue-50/50 border border-blue-100 space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-blue-600">2. Receita Líquida Recebida</span>
                <div className="text-xl font-black font-mono text-blue-900">{formatMoney(dreStats.netReceived)}</div>
                <div className="text-[7.5px] text-blue-700 font-bold uppercase">
                  Recebido {formatMoney(dreStats.totalPaid)} - Estornos {formatMoney(dreStats.totalRefunded)}
                </div>
              </div>

              <div className="p-4 bg-amber-50/50 border border-amber-100 space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-amber-700">3. Lucro Bruto (Margem)</span>
                <div className="text-xl font-black font-mono text-amber-900">{formatMoney(dreStats.grossProfit)}</div>
                <div className="text-[7.5px] text-amber-800 font-bold uppercase">
                  Margem Bruta: {formatPercent(dreStats.grossMarginPercent)} (COGS: {formatMoney(dreStats.cogs)})
                </div>
              </div>

              <div className={cn(
                "p-4 border space-y-1",
                dreStats.operatingProfit >= 0 ? "bg-emerald-50/60 border-emerald-200" : "bg-rose-50/60 border-rose-200"
              )}>
                <span className={cn(
                  "text-[8px] font-black uppercase tracking-widest",
                  dreStats.operatingProfit >= 0 ? "text-emerald-700" : "text-rose-700"
                )}>4. Lucro Operacional Líquido</span>
                <div className={cn(
                  "text-xl font-black font-mono",
                  dreStats.operatingProfit >= 0 ? "text-emerald-900" : "text-rose-900"
                )}>{formatMoney(dreStats.operatingProfit)}</div>
                <div className={cn(
                  "text-[7.5px] font-bold uppercase",
                  dreStats.operatingProfit >= 0 ? "text-emerald-800" : "text-rose-800"
                )}>
                  Margem Operacional: {formatPercent(dreStats.operatingMarginPercent)}
                </div>
              </div>
            </div>

            {/* DRE Detailed Table Breakdown */}
            <div className="border border-black/10 overflow-hidden">
              <div className="bg-gray-100/80 px-4 py-2.5 border-b border-black/10 flex justify-between items-center text-[8.5px] font-black uppercase tracking-widest text-gray-600 font-sans">
                <span>Demonstração Linha a Linha (Plano de Contas)</span>
                <span>Valor (R$) / % Receita</span>
              </div>
              <div className="divide-y divide-black/5 text-xs font-sans">
                
                {/* 1. Receita */}
                <div className="px-4 py-3 flex justify-between items-center bg-gray-50/30">
                  <div className="font-bold text-gray-900 flex items-center gap-2">
                    <span className="w-6 font-mono text-[10px] text-gray-400">1.0</span>
                    <span>(+) Faturamento Bruto (Pedidos)</span>
                  </div>
                  <div className="font-mono font-black text-black">{formatMoney(dreStats.grossRevenue)}</div>
                </div>

                <div className="px-4 py-2 flex justify-between items-center text-gray-600 bg-white pl-10">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-6 font-mono text-[9px] text-gray-400">1.1</span>
                    <span>(-) Estornos e Devoluções (Refunds)</span>
                  </div>
                  <div className="font-mono font-bold text-rose-600">-{formatMoney(dreStats.totalRefunded)}</div>
                </div>

                <div className="px-4 py-2.5 flex justify-between items-center bg-blue-50/30 font-extrabold text-blue-950">
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-mono text-[10px] text-blue-500">(=)</span>
                    <span>RECEITA LÍQUIDA REAL RECEBIDA</span>
                  </div>
                  <div className="font-mono font-black text-blue-900">{formatMoney(dreStats.netReceived)} (100%)</div>
                </div>

                {/* 2. CPV / COGS */}
                <div className="px-4 py-2.5 flex justify-between items-center text-gray-700 bg-white pl-10">
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-mono text-[9px] text-gray-400">2.0</span>
                    <span>(-) Custo dos Produtos Vendidos (COGS / Fabricação)</span>
                    {dreStats.isCostEstimated && (
                      <span className="text-[7.5px] px-1.5 py-0.2 bg-amber-100 text-amber-800 font-bold uppercase rounded-xs">
                        Estimado ({dreStats.costCoveragePercent}%)
                      </span>
                    )}
                  </div>
                  <div className="font-mono font-bold text-rose-700">-{formatMoney(dreStats.cogs)}</div>
                </div>

                {/* 3. Lucro Bruto */}
                <div className="px-4 py-2.5 flex justify-between items-center bg-amber-50/40 font-extrabold text-amber-950">
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-mono text-[10px] text-amber-600">(=)</span>
                    <span>LUCRO BRUTO OPERACIONAL</span>
                  </div>
                  <div className="font-mono font-black text-amber-900">
                    {formatMoney(dreStats.grossProfit)} ({formatPercent(dreStats.grossMarginPercent)})
                  </div>
                </div>

                {/* 4. Despesas Operacionais e Variáveis */}
                <div className="px-4 py-2 flex justify-between items-center text-gray-600 bg-white pl-10">
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-mono text-[9px] text-gray-400">3.1</span>
                    <span>(-) Taxas de Gateway (Mercado Pago / Taxa Transação)</span>
                  </div>
                  <div className="font-mono font-medium text-gray-800">-{formatMoney(dreStats.gatewayFees)}</div>
                </div>

                <div className="px-4 py-2 flex justify-between items-center text-gray-600 bg-white pl-10">
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-mono text-[9px] text-gray-400">3.2</span>
                    <span>(-) Frete Real & Subsídio de Frete</span>
                  </div>
                  <div className="font-mono font-medium text-gray-800">
                    -{formatMoney(dreStats.shippingSubsidy)} <span className="text-[9px] text-gray-400">(Real: {formatMoney(dreStats.shippingActualCost)})</span>
                  </div>
                </div>

                <div className="px-4 py-2 flex justify-between items-center text-gray-600 bg-white pl-10">
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-mono text-[9px] text-gray-400">3.3</span>
                    <span>(-) Tráfego Pago / Marketing (Meta & Google Ads)</span>
                  </div>
                  <div className="font-mono font-medium text-gray-800">-{formatMoney(dreStats.marketingExpenses)}</div>
                </div>

                <div className="px-4 py-2 flex justify-between items-center text-gray-600 bg-white pl-10">
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-mono text-[9px] text-gray-400">3.4</span>
                    <span>(-) Despesas Fixas (Domínio, Hospedagem, Software)</span>
                  </div>
                  <div className="font-mono font-medium text-gray-800">-{formatMoney(dreStats.fixedExpenses)}</div>
                </div>

                {dreStats.variableExpenses > 0 && (
                  <div className="px-4 py-2 flex justify-between items-center text-gray-600 bg-white pl-10">
                    <div className="flex items-center gap-2">
                      <span className="w-6 font-mono text-[9px] text-gray-400">3.5</span>
                      <span>(-) Outras Despesas Variáveis Lançadas</span>
                    </div>
                    <div className="font-mono font-medium text-gray-800">-{formatMoney(dreStats.variableExpenses)}</div>
                  </div>
                )}

                {/* 5. Lucro Operacional Líquido */}
                <div className={cn(
                  "px-4 py-3.5 flex justify-between items-center font-black text-sm",
                  dreStats.operatingProfit >= 0 ? "bg-emerald-100/60 text-emerald-950" : "bg-rose-100/60 text-rose-950"
                )}>
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-mono text-[10px]">(=)</span>
                    <span>LUCRO OPERACIONAL LÍQUIDO (RESULTADO DO EXERCÍCIO)</span>
                  </div>
                  <div className="font-mono text-base">
                    {formatMoney(dreStats.operatingProfit)} ({formatPercent(dreStats.operatingMarginPercent)})
                  </div>
                </div>

              </div>
            </div>

            {/* Cash Flow vs CAPEX Summary Footnote */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-gray-50 border border-black/10 flex items-center justify-between">
                <div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">Saldo Líquido de Caixa no Período</span>
                  <div className="text-lg font-black font-mono text-black mt-0.5">{formatMoney(dreStats.netCashFlow)}</div>
                  <div className="text-[7.5px] text-gray-400 font-bold uppercase">Entradas: {formatMoney(dreStats.cashIn)} | Saídas: {formatMoney(dreStats.cashOut)}</div>
                </div>
                <div className="text-right">
                  <span className="text-[8px] font-black uppercase tracking-widest text-blue-600">Contas a Receber</span>
                  <div className="text-lg font-black font-mono text-blue-800 mt-0.5">{formatMoney(dreStats.pendingReceivables)}</div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border border-black/10 flex items-center justify-between">
                <div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">Investimentos CAPEX Ativos</span>
                  <div className="text-lg font-black font-mono text-black mt-0.5">{formatMoney(dreStats.capexInvestments)}</div>
                  <div className="text-[7.5px] text-gray-400 font-bold uppercase">Prensas, Máquinas e Equipamentos</div>
                </div>
                <div className="text-right">
                  <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">Status Amortização</span>
                  <div className={cn(
                    "text-lg font-black font-mono mt-0.5",
                    investmentStats.hasRecovered ? "text-emerald-600" : "text-amber-600"
                  )}>
                    {formatPercent(investmentStats.porcentagemRecuperada)}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Custom SVG Charts panel (Highly responsive and stylish) */}
          <div className="bg-white border p-8 space-y-6">
             <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308]">Gráficos de Performance</span>
                  <h3 className="text-lg font-black uppercase italic mt-0.5">Faturamento Real vs Taxas e COGS</h3>
                </div>
                <div className="flex items-center gap-4 text-[9px] font-bold uppercase tracking-widest text-gray-400">
                   <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-[#eab308]" /> Faturamento</div>
                   <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-500" /> Custos</div>
                </div>
             </div>

             {/* Render a custom elegant bar representation of the store's current health */}
             <div className="pt-8 h-48 flex items-end gap-10 border-b border-black/10 pb-2 px-6">
                {/* Total Faturamento */}
                <div className="flex-1 flex flex-col items-center gap-3">
                   <div className="w-full bg-[#eab308] border border-black max-w-[80px] transition-all group-hover:bg-black" style={{ height: `${Math.max(10, Math.min(100, (orderStats.faturamento / (orderStats.faturamento || 1)) * 100))}%` }} />
                   <span className="text-[9px] font-black text-black">{formatMoney(orderStats.faturamento)}</span>
                   <span className="text-[8px] text-gray-400 uppercase tracking-widest">FATURAMENTO</span>
                </div>

                {/* Operational Costs */}
                <div className="flex-1 flex flex-col items-center gap-3">
                   <div className="w-full bg-rose-500 max-w-[80px]" style={{ height: `${Math.max(10, Math.min(100, (((orderStats.cogs + orderStats.gatewayFees + orderStats.shipping) / (orderStats.faturamento || 1)) * 100)))}%` }} />
                   <span className="text-[9px] font-black text-rose-600">{formatMoney(orderStats.cogs + orderStats.gatewayFees + orderStats.shipping)}</span>
                   <span className="text-[8px] text-gray-400 uppercase tracking-widest">CUSTOS VARIÁVEIS</span>
                </div>

                {/* Real Lucro */}
                <div className="flex-1 flex flex-col items-center gap-3">
                   <div className="w-full bg-emerald-500 max-w-[80px]" style={{ height: `${Math.max(10, Math.min(100, (orderStats.lucroLiquido / (orderStats.faturamento || 1)) * 100))}%` }} />
                   <span className="text-[9px] font-black text-emerald-600">{formatMoney(orderStats.lucroLiquido)}</span>
                   <span className="text-[8px] text-gray-400 uppercase tracking-widest">LUCRO NET</span>
                </div>
             </div>
          </div>

        </div>
      )}

      {/* ----------------------------------------------------
          SUBTAB: RENTABILIDADE & PRECIFICAÇÃO DINÂMICA (FASE 9.6.2 & 9.6.4)
         ---------------------------------------------------- */}
      {activeSubTab === 'profitability' && (
        <ProfitabilityPricingDashboard
          orders={filteredOrders}
          expenses={filteredCashflow}
          investments={filteredInvestments}
          traffic={filteredTraffic}
          governanceOrders={orders}
          governanceExpenses={cashflow}
          governanceInvestments={investments}
          governanceTraffic={traffic}
          productCatalog={products}
          periodFilter={periodFilter}
          onPeriodChange={setPeriodFilter}
          loading={loading}
        />
      )}

      {/* ----------------------------------------------------
          SUBTAB 2: INVESTIMENTO INICIAL
         ---------------------------------------------------- */}
      {activeSubTab === 'investments' && (
        <div className="space-y-8 animate-in cubic-bezier duration-300">
           <div className="p-6 bg-white border flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="text-lg font-black uppercase italic">Lançamento de Custos de Estrutura</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Cadastre todos os gastos da sua e-commerce para iniciar calculadoras automáticas de amortização.</p>
              </div>
              <div className="text-right">
                 <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-widest">SOMA DE GASTOS</span>
                 <h4 className="text-2xl font-black text-black">R$ {investmentStats.totalInvestido.toFixed(2)}</h4>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Add form */}
              <div className="bg-white border p-8 space-y-6 h-fit relative">
                 <div className="absolute top-0 left-0 w-1.5 h-full bg-[#eab308]" />
                 <h4 className="text-xs font-black uppercase tracking-widest italic border-b border-black/5 pb-3">Inserir Gasto de Estrutura</h4>
                 
                 <form onSubmit={handleAddInvestment} className="space-y-4">
                     <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Descrição / Nome do Custo</label>
                        <input required type="text" value={invForm.description} onChange={e => setInvForm({...invForm, description: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs uppercase font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" placeholder="Ex: Domínio fpacstore.com" />
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Valor do Gasto (R$)</label>
                          <input required type="number" step="0.01" value={invForm.amount} onChange={e => setInvForm({...invForm, amount: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" placeholder="0.00" />
                       </div>
                       
                       <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Data do Lançamento</label>
                          <input required type="date" value={invForm.date} onChange={e => setInvForm({...invForm, date: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#eab308]" />
                       </div>
                     </div>

                     <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Categoria do Investimento</label>
                        <select value={invForm.category} onChange={e => setInvForm({...invForm, category: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs uppercase font-extrabold focus:outline-none focus:ring-1 focus:ring-[#eab308] cursor-pointer">
                           <option value="domínio">Domínio</option>
                           <option value="hospedagem">Hospedagem</option>
                           <option value="material_producao">Material para Produção</option>
                           <option value="APIs">APIs</option>
                           <option value="equipamentos">Equipamentos</option>
                           <option value="embalagens">Embalagens</option>
                           <option value="fornecedores">Fornecedores/Estoque</option>
                           <option value="aplicativos">Aplicativos/Serviços</option>
                           <option value="identidade visual">Identidade Visual</option>
                           <option value="taxas">Taxas Administrativas</option>
                           <option value="marketing">Marketing/Campanhas</option>
                           <option value="outros">Outros</option>
                        </select>
                     </div>

                     <button type="submit" className="w-full bg-black text-white hover:bg-[#eab308] hover:text-black py-4 text-[9px] font-black uppercase tracking-[0.2em] transition-all">
                        PUBLICAR LANÇAMENTO
                     </button>
                 </form>
              </div>

              {/* Data Table list */}
              <div className="bg-white border lg:col-span-2">
                 <div className="p-5 border-b border-black/[0.06] flex items-center justify-between font-bold text-xs uppercase bg-gray-50/50">
                    <span>Lista de Despesas Iniciais Cadastradas</span>
                    <span className="text-[9px] text-[#eab308] font-black">EXIBINDO {investments.length} LANÇAMENTOS</span>
                 </div>

                 {investments.length === 0 ? (
                   <div className="p-20 text-center text-xs font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">Null_Entries: Nenhuma despesa de estrutura cadastrada.</div>
                 ) : (
                   <div className="overflow-x-auto max-h-[440px] scrollbar-thin">
                      <table className="w-full text-left text-xs border-collapse block md:table">
                        <thead className="hidden md:table-header-group">
                          <tr className="border-b border-black/10 bg-gray-100 text-[8px] uppercase tracking-widest text-gray-400 font-black">
                            <th className="p-4">Descrição</th>
                            <th className="p-4">Categoria</th>
                            <th className="p-4">Data Registro</th>
                            <th className="p-4">Valor (R$)</th>
                            <th className="p-4 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="block md:table-row-group divide-y divide-black/5 md:divide-none">
                          {investments.map(inv => (
                            <tr key={inv.id} className="block md:table-row border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase p-4 md:p-0 space-y-2.5 md:space-y-0">
                              <td className="block md:table-cell p-0 md:p-4">
                                <div className="font-extrabold text-black text-xs">{inv.description}</div>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Categoria</span>
                                <span className="bg-black/5 text-[9px] px-2 py-0.5 font-bold">{inv.category}</span>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell text-xs font-bold text-gray-500">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Data Registro</span>
                                <span>{new Date(inv.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell font-black italic">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Valor</span>
                                <span>R$ {Number(inv.amount || 0).toFixed(2)}</span>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell text-center">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Ações</span>
                                <button onClick={() => handleVoidInvestment(inv.id)} title="Anular Investimento" className="text-red-500 hover:text-black hover:bg-red-50 p-2 border border-transparent hover:border-red-100 transition-all rounded-sm">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* ----------------------------------------------------
          SUBTAB 3: PEDIDOS (RECEITA)
         ---------------------------------------------------- */}
      {activeSubTab === 'orders' && (
        <div className="space-y-8 animate-in fade-in duration-300">
           <div className="p-6 bg-white border flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="text-lg font-black uppercase italic">Mapeamento Real-Time de Pedidos do Site</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Sincronização imediata de pedidos ativos, calculando taxas, despesas fretes e o retorno líquido real.</p>
              </div>
              <div className="flex gap-4">
                <div className="text-right border-r border-black/10 pr-6">
                   <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-widest">FATURAMENTO</span>
                   <h4 className="text-xl font-black text-black">R$ {orderStats.faturamento.toFixed(2)}</h4>
                </div>
                <div className="text-right">
                   <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-widest">LUCRO NET SEGURO</span>
                   <h4 className="text-xl font-black text-emerald-600">R$ {orderStats.lucroLiquido.toFixed(2)}</h4>
                </div>
              </div>
           </div>

           <div className="bg-white border">
              <div className="p-5 border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-4 font-bold text-xs uppercase bg-gray-50/50">
                 <span>Listagem de Receitas e Impostos calculados</span>
                 <div className="flex items-center gap-4">
                    <span className="text-[9px] text-[#eab308] font-black">{orders.length} PEDIDOS EM HISTÓRICO</span>
                 </div>
              </div>

              {orders.length === 0 ? (
                <div className="p-32 text-center text-xs font-bold uppercase tracking-widest text-gray-400">Sem pedidos registrados na base do site.</div>
              ) : (
                <div className="overflow-x-auto lg:overflow-visible">
                   <table className="w-full text-left text-xs border-collapse block lg:table">
                      <thead className="hidden lg:table-header-group">
                        <tr className="border-b border-black/10 bg-gray-100 text-[8px] uppercase tracking-widest text-gray-400 font-black">
                          <th className="p-4">Nº Pedido / Cliente</th>
                          <th className="p-4">Data</th>
                          <th className="p-4">Método</th>
                          <th className="p-4">Faturamento Bruto (R$)</th>
                          <th className="p-4">Custos de Fabricação</th>
                          <th className="p-4">Taxa Mercado Pago</th>
                          <th className="p-4">Custo Envio (Frete)</th>
                          <th className="p-4">Lucro Líquido Real</th>
                          <th className="p-4">Status Transação</th>
                        </tr>
                      </thead>
                      <tbody className="block lg:table-row-group divide-y divide-black/5 lg:divide-none">
                        {orders.map(order => {
                          const calc = calculateFeesAndMargins(order);
                          const isApproved = ['Pagamento Aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(order.status);
                          
                          return (
                            <tr key={order.id} className={cn("block lg:table-row border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase p-4 lg:p-0 space-y-2.5 lg:space-y-0", !isApproved && "opacity-50 bg-gray-50/40")}>
                              <td className="block lg:table-cell p-0 lg:p-4">
                                <div className="font-extrabold text-black text-xs">#{order.id.slice(0, 10).toUpperCase()}</div>
                                <div className="text-[8.5px] text-gray-400 font-black tracking-widest mt-0.5">{order.customerName}</div>
                              </td>
                              <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell text-xs font-bold text-gray-500 whitespace-nowrap">
                                <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Data</span>
                                <span>{order.createdAtDate?.toLocaleDateString('pt-BR') || ''}</span>
                              </td>
                              <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell font-black tracking-wider text-[10px]">
                                <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Método</span>
                                <span>{order.paymentMethod || 'Cartão'}</span>
                              </td>
                              <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell font-black">
                                <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Faturamento Bruto</span>
                                <span>R$ {Number(order.total || 0).toFixed(2)}</span>
                              </td>
                              <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell font-bold text-gray-600">
                                <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Custos de Fabricação</span>
                                <span>R$ {calc.cogs.toFixed(2)}</span>
                              </td>
                              <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell text-gray-500">
                                <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Taxa Mercado Pago</span>
                                <span>R$ {calc.gatewayFee.toFixed(2)}</span>
                              </td>
                              <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell text-gray-500">
                                <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Custo Envio</span>
                                <span>R$ {calc.shippingCost.toFixed(2)}</span>
                              </td>
                              <td className={cn("block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell font-black italic", isApproved ? "text-emerald-600" : "text-gray-400")}>
                                <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Lucro Líquido Real</span>
                                <span>{isApproved ? `R$ ${calc.netProfit.toFixed(2)}` : 'R$ 0.00'}</span>
                              </td>
                              <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell">
                                <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Status Transação</span>
                                <span className={cn(
                                  "px-2 py-0.5 text-[7px] font-black uppercase tracking-widest border shrink-0",
                                  isApproved ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-yellow-50 text-yellow-700 border-yellow-100"
                                )}>
                                  {order.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                   </table>
                </div>
              )}
           </div>
        </div>
      )}

      {/* ----------------------------------------------------
          SUBTAB 4: MARGEM PRODUTOS
         ---------------------------------------------------- */}
      {activeSubTab === 'products' && (
        <div className="space-y-8 animate-in fade-in duration-300">
           <div className="p-6 bg-white border flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="text-lg font-black uppercase italic">Painel de Custos de Produção e Markup</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Gerencie os custos de confecção ou compra unitária de cada item para habilitar cálculos de ROI.</p>
              </div>
              <div className="text-right">
                 <span className="text-[8px] font-extrabold text-[#eab308] uppercase tracking-widest">MARGEM MÉDIA</span>
                 <h4 className="text-2xl font-black text-black">{filteredAverageMargin.toFixed(1)}%</h4>
              </div>
           </div>

           <div className="bg-white border">
              <div className="p-5 border-b border-black/[0.06] flex items-center justify-between font-bold text-xs uppercase bg-gray-50/50">
                  <div className="flex flex-col gap-0.5">
                     <span>Catálogo Ativo & Variáveis Financeiras</span>
                     <span className="text-[9px] text-gray-400 tracking-wider">Apenas as mudanças salvas em atualizar impactam o site real-time</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                     <button
                       onClick={() => {
                         setAddProdMode('catalog');
                         setShowAddProdModal(true);
                       }}
                       className="bg-[#eab308] hover:bg-black text-black hover:text-white px-3 py-1.5 text-[9px] font-black tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer"
                     >
                       <Plus size={10} strokeWidth={3} /> Incluir do Catálogo
                     </button>
                     <button
                       onClick={() => {
                         setAddProdMode('new');
                         setShowAddProdModal(true);
                       }}
                       className="border border-black text-black hover:bg-black hover:text-white px-3 py-1.5 text-[9px] font-black tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer"
                     >
                       <Plus size={10} strokeWidth={3} /> Criar Novo Produto
                     </button>
                  </div>
               </div>

               {/* Modal for adding product */}
               {showAddProdModal && (
                 <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200 text-black">
                   <div className="bg-white border text-left max-w-md w-full relative p-6 space-y-6">
                     <div className="flex justify-between items-center border-b pb-3 border-black/5">
                       <h3 className="text-sm font-black uppercase italic tracking-wider">Adicionar Produto ao Painel</h3>
                       <button 
                         onClick={() => setShowAddProdModal(false)}
                         className="text-gray-400 hover:text-black text-xs font-bold uppercase transition-all cursor-pointer"
                       >
                         [Fechar]
                       </button>
                     </div>

                     <div className="flex border-b border-black/10">
                       <button
                         type="button"
                         onClick={() => setAddProdMode('catalog')}
                         className={cn(
                           "flex-1 pb-2.5 text-center text-[10px] font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer",
                           addProdMode === 'catalog' ? "border-[#eab308] text-black" : "border-transparent text-gray-400 hover:text-black"
                         )}
                       >
                         Do Catálogo Geral ({products.filter(p => p.id && !visibleProductIds.includes(p.id)).length})
                       </button>
                       <button
                         type="button"
                         onClick={() => setAddProdMode('new')}
                         className={cn(
                           "flex-1 pb-2.5 text-center text-[10px] font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer",
                           addProdMode === 'new' ? "border-[#eab308] text-black" : "border-transparent text-gray-400 hover:text-black"
                         )}
                       >
                         Cadastrar Novo
                       </button>
                     </div>

                     {addProdMode === 'catalog' ? (
                       <div className="space-y-4">
                         <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
                           Selecione um produto que já esteja cadastrado no banco do site para exibi-lo nesta visualização de margens:
                         </p>
                         <div className="space-y-1">
                           <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Selecione o Item</label>
                           <select 
                             value={selectedCatalogId} 
                             onChange={e => setSelectedCatalogId(e.target.value)}
                             className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs uppercase font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]"
                           >
                             <option value="">-- Escolha um Produto --</option>
                             {products
                               .filter(p => p.id && !visibleProductIds.includes(p.id))
                               .map(p => (
                                 <option key={p.id} value={p.id}>
                                   {p.name} (R$ {Number(p.price || 0).toFixed(2)})
                                 </option>
                               ))
                             }
                           </select>
                         </div>
                         <button
                           type="button"
                           onClick={() => {
                             if (!selectedCatalogId) {
                               toast.error("Selecione um produto do catálogo!");
                               return;
                             }
                             handleAddProductToView(selectedCatalogId);
                             setSelectedCatalogId('');
                             setShowAddProdModal(false);
                           }}
                           className="w-full bg-black hover:bg-[#eab308] text-white hover:text-black py-3 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                         >
                           Exibir Produto no Painel
                         </button>
                       </div>
                     ) : (
                       <form onSubmit={handleCreateAndAddProduct} className="space-y-4">
                         <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
                           Crie um novo produto no banco. Ele será cadastrado no catálogo geral do site e adicionado a esta lista:
                         </p>
                         <div className="space-y-1">
                           <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Nome do Produto</label>
                           <input 
                             required 
                             type="text" 
                             value={newProdForm.name} 
                             onChange={e => setNewProdForm({...newProdForm, name: e.target.value})} 
                             className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs uppercase font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" 
                             placeholder="EX: CAMISETA OVERSIZED VIBE" 
                           />
                         </div>

                         <div className="grid grid-cols-3 gap-3">
                           <div className="space-y-1 col-span-1">
                             <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Venda (R$)</label>
                             <input 
                               required 
                               type="number" 
                               step="0.01" 
                               value={newProdForm.price} 
                               onChange={e => setNewProdForm({...newProdForm, price: e.target.value})} 
                               className="w-full bg-[#fcfcfc] border border-black/10 px-3 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" 
                               placeholder="0.00" 
                             />
                           </div>
                           <div className="space-y-1 col-span-1">
                             <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Custo COGS (R$)</label>
                             <input 
                               type="number" 
                               step="0.01" 
                               value={newProdForm.costPrice} 
                               onChange={e => setNewProdForm({...newProdForm, costPrice: e.target.value})} 
                               className="w-full bg-[#fcfcfc] border border-black/10 px-3 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" 
                               placeholder="0.00" 
                             />
                           </div>
                           <div className="space-y-1 col-span-1">
                             <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Estoque Inicial</label>
                             <input 
                               type="number" 
                               value={newProdForm.stock} 
                               onChange={e => setNewProdForm({...newProdForm, stock: e.target.value})} 
                               className="w-full bg-[#fcfcfc] border border-black/15 px-3 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" 
                               placeholder="0" 
                             />
                           </div>
                         </div>

                         <button
                           type="submit"
                           className="w-full bg-black hover:bg-[#eab308] text-white hover:text-black py-3 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                         >
                           Criar e Exibir Produto
                         </button>
                      </form>
                     )}
                   </div>
                 </div>
               )}
               <div className="p-5 border-b border-black/[0.06] flex items-center justify-between font-bold text-xs uppercase bg-gray-50/50">
                 <div className="flex flex-col gap-0.5">


                 </div>


              </div>

              {filteredProductsList.length === 0 ? (
                <div className="p-20 text-center text-xs font-bold uppercase tracking-widest text-gray-400">Carregando catálogo...</div>
              ) : (
                <div className="overflow-x-auto lg:overflow-visible">
                   <table className="w-full text-left text-xs border-collapse block lg:table">
                      <thead className="hidden lg:table-header-group">
                        <tr className="border-b border-black/10 bg-gray-100 text-[8px] uppercase tracking-widest text-gray-400 font-black">
                          <th className="p-4">SKU / Modelo</th>
                          <th className="p-4">Estoque Atual</th>
                          <th className="p-4">Preço de Venda (R$)</th>
                          <th className="p-4">Custo Fabricação (COGS Unitário)</th>
                          <th className="p-4">Lucros Unitários Estimado</th>
                          <th className="p-4">Margem de Lucro Bruta</th>
                          <th className="p-4 text-center">Registrado Vendido (Unidades)</th>
                          <th className="p-4 text-center">Faturamento Total</th>
                          <th className="p-5 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="block lg:table-row-group divide-y divide-black/5 lg:divide-none">
                        {filteredProductsList.map(prod => {
                          return (
                            <ProductRow key={prod.id} prod={prod} onUpdate={handleUpdateProductCost} onDelete={setProductToDelete} />
                          );
                        })}
                      </tbody>
                   </table>
                </div>
              )}
           </div>
        </div>
      )}

      {/* ----------------------------------------------------
          SUBTAB 5: FLUXO DE CAIXA
         ---------------------------------------------------- */}
      {activeSubTab === 'cashflow' && (
        <div className="space-y-8 animate-in cubic-bezier duration-300">
           <div className="p-6 bg-white border flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="text-lg font-black uppercase italic">Fluxo de Caixa Geral (Outros Custos)</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Registre custos fixos operacionais recorrentes, anúncios adicionais, taxas bancárias extras ou frete reverso.</p>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                   <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-widest font-sans">TOTAL SAÍDAS OPERACIONAIS</span>
                   <h4 className="text-xl font-black text-rose-600">R$ {cashflowStats.saidas.toFixed(2)}</h4>
                </div>
                <div>
                   <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-widest font-sans">SALDO ATUAL DO CAIXA</span>
                   <h4 className="text-xl font-black text-black">R$ {cashflowStats.saldoAtual.toFixed(2)}</h4>
                </div>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Insert Form */}
              <div className="bg-white border p-8 space-y-6 h-fit relative">
                 <div className="absolute top-0 left-0 w-1.5 h-full bg-[#eab308]" />
                 <h4 className="text-xs font-black uppercase tracking-widest italic border-b border-black/5 pb-3">Lançamento de Entrada / Saída</h4>
                 
                 <form onSubmit={handleAddCashFlow} className="space-y-4">
                     <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Descrição do Lançamento</label>
                        <input required type="text" value={cfForm.description} onChange={e => setCfForm({...cfForm, description: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs uppercase font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" placeholder="Ex: Pagamento Frete Sedex Reembolso" />
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Valor do Lançamento (R$)</label>
                          <input required type="number" step="0.01" value={cfForm.amount} onChange={e => setCfForm({...cfForm, amount: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" placeholder="0.00" />
                       </div>
                       
                       <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Data</label>
                          <input required type="date" value={cfForm.date} onChange={e => setCfForm({...cfForm, date: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#eab308]" />
                       </div>
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Tipo Fluxo</label>
                          <select value={cfForm.type} onChange={e => setCfForm({...cfForm, type: e.target.value as any})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs uppercase font-extrabold focus:outline-none focus:ring-1 focus:ring-[#eab308] cursor-pointer">
                             <option value="out">Saída (Gasto)</option>
                             <option value="in">Entrada (Receita Extra)</option>
                          </select>
                       </div>

                       <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Categoria</label>
                          <select value={cfForm.category} onChange={e => setCfForm({...cfForm, category: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs uppercase font-extrabold focus:outline-none focus:ring-1 focus:ring-[#eab308] cursor-pointer">
                             <option value="Tráfego Pago">Tráfego Pago</option>
                             <option value="Fornecedor">Fornecedor</option>
                             <option value="Taxa Gateway">Taxa Gateway</option>
                             <option value="Envio/Frete">Envio / Frete</option>
                             <option value="Retirada">Retirada Pro-Labore</option>
                             <option value="Ajuste Caixa">Ajuste Caixa</option>
                             <option value="Brinde">Brinde</option>
                             <option value="Outros">Outros</option>
                          </select>
                       </div>
                     </div>

                     <button type="submit" className="w-full bg-black text-white hover:bg-[#eab308] hover:text-black py-4 text-[9px] font-black uppercase tracking-[0.2em] transition-all">
                        PUBLICAR LANÇAMENTO CAIXA
                     </button>
                 </form>
              </div>

              {/* Data Table */}
              <div className="bg-white border lg:col-span-2">
                 <div className="p-5 border-b border-black/[0.06] flex items-center justify-between font-bold text-xs uppercase bg-gray-50/50">
                    <span>Lista Geral de Operações de Caixa</span>
                    <span className="text-[9px] text-gray-400 font-black tracking-widest">HISTÓRICO</span>
                 </div>

                 {cashflow.length === 0 ? (
                   <div className="p-20 text-center text-xs font-bold uppercase tracking-widest text-gray-400">Nenhum lançamento manual de caixa cadastrado.</div>
                 ) : (
                   <div className="overflow-x-auto lg:overflow-visible max-h-[440px] scrollbar-thin">
                      <table className="w-full text-left text-xs border-collapse block md:table">
                        <thead className="hidden md:table-header-group">
                          <tr className="border-b border-black/10 bg-gray-100 text-[8px] uppercase tracking-widest text-gray-400 font-black">
                            <th className="p-4">Descrição</th>
                            <th className="p-4">Tipo</th>
                            <th className="p-4">Categoria</th>
                            <th className="p-4">Data Registro</th>
                            <th className="p-4">Valor (R$)</th>
                            <th className="p-4 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="block md:table-row-group divide-y divide-black/5 md:divide-none">
                          {cashflow.map(cf => (
                            <tr key={cf.id} className="block md:table-row border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase p-4 md:p-0 space-y-2.5 md:space-y-0">
                              <td className="block md:table-cell p-0 md:p-4 font-extrabold text-black text-xs">
                                {cf.description}
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Tipo</span>
                                <span className={cn(
                                  "px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border font-sans",
                                  cf.type === 'in' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-rose-700 border-red-100"
                                )}>
                                  {cf.type === 'in' ? 'Entrada (+)' : 'Saída (-)'}
                                </span>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Categoria</span>
                                <span className="bg-black/5 text-[9px] px-2 py-0.5 font-bold">{cf.category}</span>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell text-xs font-bold text-gray-500">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Data Registro</span>
                                <span>{new Date(cf.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                              </td>
                              <td className={cn("block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell font-black italic", cf.type === 'in' ? "text-emerald-600" : "text-[#121212]")}>
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Valor</span>
                                <span>{cf.type === 'in' ? '+' : '-'} R$ {Number(cf.amount || 0).toFixed(2)}</span>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell text-center">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Ações</span>
                                <button onClick={() => handleVoidExpense(cf.id)} title="Anular Lançamento" className="text-red-500 hover:text-black hover:bg-red-50 p-2 border border-transparent hover:border-red-100 transition-all rounded-sm">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* ----------------------------------------------------
          SUBTAB 6: TRÁFEGO ADS
         ---------------------------------------------------- */}
      {activeSubTab === 'traffic' && (
        <div className="space-y-8 animate-in fade-in duration-300">
           <div className="p-6 bg-white border flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="text-lg font-black uppercase italic">Painel de Tráfego Pago & ROI</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Mapeie os investimentos em Meta Ads, Google Ads ou TikTok Ads para calcular ROAS do site e ROI geral.</p>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                   <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-widest">INVESTIMENTO ESTIMADO</span>
                   <h4 className="text-xl font-black text-black">R$ {trafficStats.totalInvestido.toFixed(2)}</h4>
                </div>
                <div>
                   <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-widest text-[#eab308]">ROAS GERAL DA CONVERSÃO</span>
                   <h4 className="text-xl font-black text-black">{trafficStats.roas.toFixed(1)}x</h4>
                </div>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Insert Form */}
              <div className="bg-white border p-8 space-y-6 h-fit relative">
                 <div className="absolute top-0 left-0 w-1.5 h-full bg-[#eab308]" />
                 <h4 className="text-xs font-black uppercase tracking-widest italic border-b border-black/5 pb-3">Lançamento de Campanha Diária</h4>
                 
                 <form onSubmit={handleAddTraffic} className="space-y-4">
                     <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Nome da Campanha / Criativa</label>
                        <input required type="text" value={trafficForm.campaignName} onChange={e => setTrafficForm({...trafficForm, campaignName: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs uppercase font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" placeholder="Ex: META STORY AD - OVERSIZED" />
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Investimento (R$) diário</label>
                          <input required type="number" step="0.01" value={trafficForm.amountSpent} onChange={e => setTrafficForm({...trafficForm, amountSpent: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" placeholder="0.00" />
                       </div>
                       
                       <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Data do Registro</label>
                          <input required type="date" value={trafficForm.date} onChange={e => setTrafficForm({...trafficForm, date: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#eab308]" />
                       </div>
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Cliques Estimados</label>
                          <input type="number" value={trafficForm.clicks} onChange={e => setTrafficForm({...trafficForm, clicks: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" placeholder="0" />
                       </div>
                       
                       <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Vendas Convertidas</label>
                          <input type="number" value={trafficForm.conversions} onChange={e => setTrafficForm({...trafficForm, conversions: e.target.value})} className="w-full bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#eab308]" placeholder="0" />
                       </div>
                     </div>

                     <button type="submit" className="w-full bg-black text-white hover:bg-[#eab308] hover:text-black py-4 text-[9px] font-black uppercase tracking-[0.2em] transition-all">
                        PUBLICAR MÉTRICA CAMPANHA
                     </button>
                 </form>
              </div>

              {/* Data Table */}
              <div className="bg-white border lg:col-span-2">
                 <div className="p-5 border-b border-black/[0.06] flex items-center justify-between font-bold text-xs uppercase bg-gray-50/50">
                    <span>Lista Geral Campanhas Mapeadas</span>
                    <span className="text-[9px] text-[#eab308] font-black tracking-widest">RENDIMENTO GERAL</span>
                 </div>

                 {trafficStats.campaigns.length === 0 ? (
                   <div className="p-20 text-center text-xs font-bold uppercase tracking-widest text-gray-400">Nenhum investimento atribulado cadastrado.</div>
                 ) : (
                   <div className="overflow-x-auto lg:overflow-visible max-h-[440px] scrollbar-thin">
                      <table className="w-full text-left text-xs border-collapse block md:table">
                        <thead className="hidden md:table-header-group">
                          <tr className="border-b border-black/10 bg-gray-100 text-[8px] uppercase tracking-widest text-gray-400 font-black">
                            <th className="p-4">Nome Campanha</th>
                            <th className="p-4">Investimento (R$)</th>
                            <th className="p-4 text-center">Cliques</th>
                            <th className="p-4 text-center">Vendas Convertidas</th>
                            <th className="p-4 text-center">ROAS Campanha</th>
                            <th className="p-4 text-center">Lucro Estimado</th>
                            <th className="p-4 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="block md:table-row-group divide-y divide-black/5 md:divide-none">
                          {trafficStats.campaigns.map(camp => (
                            <tr key={camp.id} className="block md:table-row border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase p-4 md:p-0 space-y-2.5 md:space-y-0">
                              <td className="block md:table-cell p-0 md:p-4 font-extrabold text-black text-xs">
                                {camp.campaignName}
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell font-black">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Investimento</span>
                                <span>R$ {Number(camp.amountSpent || 0).toFixed(2)}</span>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell text-center">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Cliques</span>
                                <span>{camp.clicks || 0}</span>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell text-center font-extrabold text-[#eab308]">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Vendas</span>
                                <span>{camp.conversions || 0}</span>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell text-center font-black">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">ROAS</span>
                                <span>{camp.roas.toFixed(1)}x</span>
                              </td>
                              <td className={cn("block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell text-center font-extrabold", camp.lucro >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Lucro Estimado</span>
                                <span>R$ {camp.lucro.toFixed(2)}</span>
                              </td>
                              <td className="block md:table-cell p-0 md:p-4 flex justify-between items-center md:table-cell text-center">
                                <span className="inline-block md:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Ações</span>
                                <button onClick={() => handleVoidTraffic(camp.id)} title="Anular Tráfego" className="text-red-500 hover:text-black hover:bg-red-50 p-2 border border-transparent hover:border-red-100 transition-all rounded-sm">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {activeSubTab === 'sheets' && (
        <div className="space-y-10 animate-in fade-in duration-300">
           
           <div className="bg-white p-8 border space-y-4">
              <div className="flex items-center gap-3">
                 <FileSpreadsheet className="text-[#eab308]" size={24} />
                 <h3 className="text-xl font-black uppercase italic">Como Integrar de Graça com o Google Sheets</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed font-bold uppercase tracking-widest max-w-4xl">
                 Com o Google Apps Script (100% gratuito), você pode fazer sua Planilha Google Sheets receber suas vendas, estoque e investimentos diretamente do site e enviar de volta alterações em tempo real via Webhook! Siga as etapas abaixo.
              </p>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Instructions steps */}
              <div className="bg-white border p-8 space-y-6">
                 <h4 className="text-sm font-black uppercase italic tracking-widest text-[#eab308] border-b border-black/5 pb-3">Etapas de Configuração</h4>
                 
                 <ol className="space-y-6 text-xs font-bold uppercase tracking-widest text-black/70 list-decimal pl-5 leading-relaxed">
                   <li>
                      <span className="text-black font-extrabold">Crie sua Planilha</span>: Abra o <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-[#eab308] underline">Google Sheets</a> e crie uma nova planilha vazia.
                   </li>
                   <li>
                      <span className="text-black font-extrabold">Acesse o Apps Script</span>: No menu superior, vá em <span className="bg-black/5 px-1 font-mono text-[10px]">Extensões &gt; Apps Script</span>.
                   </li>
                   <li>
                      <span className="text-black font-extrabold">Cole o Código e Salve</span>: Apague qualquer código existente no editor e cole o Bloco de Código de Automação ao lado exatamente como está. Em seguida, salve clicando no disquete.
                   </li>
                   <li>
                      <span className="text-black font-extrabold">Implante como App da Web</span>: 
                      Clique no botão azul <span className="text-[#eab308]">Implantar &gt; Nova Implantação</span>. 
                      Selecione o tipo <span className="text-black">"App da Web"</span>. 
                      Configure para rodar como "Eu mesmo" e no campo "Quem tem acesso" escolha <span className="text-emerald-600 font-extrabold">"Qualquer pessoa" (fundamental para receber webhooks!)</span>.
                   </li>
                   <li>
                      <span className="text-black font-extrabold">Copie a URL do Webhook</span>: Conclua a implantação, autorize as permissões de gravação se solicitado, e copie a URL do App da Web gerada pelo Google.
                   </li>
                   <li>
                      <span className="text-black font-extrabold">Cole Aqui e Sincronize</span>: Cole essa URL no painel abaixo e clique em Sincronizar! Seus dados se propagam na planilha do Google na mesma hora.
                   </li>
                   <li>
                      <span className="text-[#eab308] font-black font-extrabold">Sincronização Inversa (Planilha ➜ Site)</span>: Quando editar valores diretamente nas abas da planilha (como estoque, preço, custo na aba PRODUTOS, ou status na aba PEDIDOS), você pode enviar de volta ao site (e para automatizar 100% sem precisar clicar no menu, configure um acionador no Apps Script executando "syncToWebsite" ao evento "Ao editar" ou "Ao alterar")! Basta clicar no menu criado no Sheets chamado <span className="text-[#eab308]">"F PAC Store 🔄" &gt; "Sincronizar Planilha ➜ Site"</span>!
                   </li>
                 </ol>

                 {/* Sync Form simulator */}
                 <div className="pt-6 border-t border-black/5 space-y-4">
                     <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308]">Link do Webhook de Automação do Sheets</span>
                     <div className="flex gap-2">
                        <input 
                          type="url" 
                          value={sheetWebhookUrl} 
                          onChange={e => {
                            const val = e.target.value;
                            setSheetWebhookUrl(val);
                            localStorage.setItem('fpac_sheets_webhook_url', val);
                            setDoc(doc(db, 'settings', 'sheets'), { webhookUrl: val, updatedAt: new Date() }, { merge: true }).catch(err => {
                              handleFirestoreError(err, OperationType.WRITE, 'settings/sheets');
                            });
                          }} 
                          placeholder="https://script.google.com/macros/s/.../exec" 
                          className="flex-1 bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#eab308]"
                        />
                        <button 
                          onClick={() => handleGoogleSheetsSync(false)}
                          disabled={isSyncingWebhook}
                          className="bg-black text-white hover:bg-[#eab308] hover:text-black px-6 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                        >
                          {isSyncingWebhook ? 'Enviando...' : 'Sincronizar Planilha'}
                        </button>
                     </div>
                 </div>
              </div>

              {/* Apps Script Code copy paste block */}
              <div className="bg-black text-[#5dd39e] p-6 font-mono border rounded-sm flex flex-col justify-between max-h-[640px] overflow-hidden">
                 <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4 shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#5dd39e]">Apps Script Copiável (Gratuito)</span>
                    <button 
                      onClick={() => {
                        const computedScript = APPS_SCRIPT_PROMPT.replace("<<WEBSITE_URL>>", window.location.origin);
                        navigator.clipboard.writeText(computedScript);
                        toast.success("Código Copiado com sucesso!");
                      }}
                      className="text-white hover:text-[#eab308] text-[9px] font-black uppercase border border-white/20 hover:border-[#eab308] px-3 py-1.5 transition-all"
                    >
                      Copiar Código
                    </button>
                 </div>
                 
                 <div className="flex-grow overflow-y-auto text-xs leading-relaxed max-h-[480px] scrollbar-thin text-white/90">
                     <pre className="text-[10px] whitespace-pre font-mono p-2 bg-white/5">
                        {APPS_SCRIPT_PROMPT.replace("<<WEBSITE_URL>>", window.location.origin)}
                     </pre>
                  </div>
              </div>

           </div>
        </div>
      )}

      {activeSubTab === 'receivables' && (
        <AdminAccountsReceivable onNavigateOrder={(ordId) => {
          const matched = orders.find(o => String(o.id) === String(ordId));
          if (matched) setSelectedOrderForDrawer(matched);
          else setSelectedOrderForDrawer({ id: ordId, name: `Pedido #${ordId}` });
        }} />
      )}

      {activeSubTab === 'payables' && (
        <AccountsPayableManager />
      )}

      {activeSubTab === 'suppliers' && (
        <SuppliersManager />
      )}

      {activeSubTab === 'forecast' && (
        <CashForecastView />
      )}

      {activeSubTab === 'payments' && (
        <FinancialPaymentsView 
          orders={orders} 
          onOpenOrderDrawer={(ord) => setSelectedOrderForDrawer(ord)} 
        />
      )}

      {activeSubTab === 'refunds' && (
        <FinancialRefundsView 
          orders={orders} 
          onOpenOrderDrawer={(ord) => setSelectedOrderForDrawer(ord)} 
        />
      )}

      {activeSubTab === 'ledger' && (
        <FinancialLedgerView 
          orders={orders} 
          onOpenOrderDrawer={(ord) => setSelectedOrderForDrawer(ord)} 
        />
      )}

      {/* Dynamic Product Deletion Confirmation Dialog */}
      {productToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-black max-w-sm w-full relative p-6 space-y-6 shadow-2xl uppercase font-bold text-black animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b pb-3 border-black/10">
              <span className="text-[10px] font-black tracking-widest text-[#eab308]">OPÇÕES DE EXCLUSÃO</span>
              <button 
                onClick={() => setProductToDelete(null)}
                className="text-gray-400 hover:text-black text-[9px] font-black tracking-wider transition-all cursor-pointer"
              >
                [Fechar]
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-gray-50 border border-black/5 p-3.5 space-y-1 text-left">
                <span className="text-[8px] text-gray-400 font-black tracking-widest block">PRODUTO SELECIONADO:</span>
                <span className="text-sm font-black italic text-black tracking-wider block">{productToDelete.name}</span>
                {productToDelete.slug && (
                  <span className="text-[8px] block text-gray-400 font-mono tracking-wider mt-0.5 font-bold">SKU: {productToDelete.slug}</span>
                )}
              </div>

              <div className="space-y-3">
                {/* Opção 1: Ocultar da aba */}
                <button
                  type="button"
                  onClick={async () => {
                    await handleDeleteProductFromView(productToDelete.id, 'hide');
                    setProductToDelete(null);
                  }}
                  className="w-full text-left bg-[#fcfcfc] hover:bg-yellow-50/40 hover:border-yellow-500/40 border border-black/15 p-4 transition-all flex flex-col gap-1 cursor-pointer group"
                >
                  <span className="text-[10px] font-black uppercase tracking-wider text-black group-hover:text-[#eab308] transition-colors flex items-center gap-1.5">
                    👉 1. OCULTAR DESTA PLANILHA
                  </span>
                  <span className="text-[9px] text-gray-400 lowercase font-medium tracking-normal normal-case leading-relaxed font-bold">
                    Apenas esconde o produto da visualização desta tabela financeira. O produto continuará ATIVO no catálogo de vendas do site e disponível para os clientes.
                  </span>
                </button>

                {/* Opção 2: Excluir do site todo */}
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm(`⚠️ EXCLUSÃO TOTAL: Tem certeza absoluta que deseja apagar DEFINITIVAMENTE o produto "${productToDelete.name}" de todo o sistema? Esta ação é irreversível e removerá o item do catálogo público de vendas.`)) {
                      await handleDeleteProductFromView(productToDelete.id, 'delete');
                      setProductToDelete(null);
                    }
                  }}
                  className="w-full text-left bg-rose-50/30 hover:bg-rose-50 border border-red-200/60 hover:border-red-500 p-4 transition-all flex flex-col gap-1 cursor-pointer group"
                >
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-750 flex items-center gap-1.5 font-black">
                    🚨 2. APAGAR DO SITE COMPLETO
                  </span>
                  <span className="text-[9px] text-red-500/90 lowercase font-medium tracking-normal normal-case leading-relaxed font-bold">
                    Exclui o produto por completo do banco de dados (Firestore) e do estoque. Ação permanente e irreversível.
                  </span>
                </button>
              </div>
            </div>

            <div className="text-right pt-2 border-t border-black/5">
              <button 
                type="button"
                onClick={() => setProductToDelete(null)}
                className="bg-black hover:bg-gray-800 text-white text-[9px] font-black px-4 py-2.5 transition-all tracking-widest cursor-pointer"
              >
                CANCELAR MUDANÇA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Order Financial Drawer */}
      <OrderFinancialDrawer
        order={selectedOrderForDrawer}
        isOpen={!!selectedOrderForDrawer}
        onClose={() => setSelectedOrderForDrawer(null)}
        onOrderUpdated={(updatedOrder) => {
          if (updatedOrder && typeof updatedOrder === 'object') {
            const ordId = updatedOrder.id || selectedOrderForDrawer?.id;
            if (ordId) {
              setOrders(prev => prev.map(o => o.id === ordId ? { ...o, ...updatedOrder } : o));
              setSelectedOrderForDrawer((prev: any) => prev ? { ...prev, ...updatedOrder } : updatedOrder);
            }
          }
        }}
      />

    </div>
  );
}

// Sub-component wrapper for elegant product metrics configuration
interface ProductRowProps {
  key?: any;
  prod: any;
  onUpdate: (id: string, costVal: number, priceVal: number) => Promise<void>;
  onDelete: (prod: any) => void;
}

function ProductRow({ prod, onUpdate, onDelete }: ProductRowProps) {
  const [costInput, setCostInput] = useState<string>('');
  const [priceInput, setPriceInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCostInput(String(prod.cost || prod.costPrice || 0));
    setPriceInput(String(prod.price || 0));
  }, [prod]);

  const unitProfitVal = (parseFloat(priceInput) || 0) - (parseFloat(costInput) || 0);
  const marginUnitPercent = (parseFloat(priceInput) || 0) > 0 ? (unitProfitVal / (parseFloat(priceInput) || 0)) * 105 : 0; // Wait, let's keep margin formula exactly as is: * 100
  const marginUnitPercentActual = (parseFloat(priceInput) || 0) > 0 ? (unitProfitVal / (parseFloat(priceInput) || 0)) * 100 : 0;

  const handleLocalSave = async () => {
    setIsSaving(true);
    await onUpdate(prod.id, parseFloat(costInput) || 0, parseFloat(priceInput) || 0);
    setIsSaving(false);
  };

  return (
    <tr className="block lg:table-row border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase p-4 lg:p-0 space-y-2.5 lg:space-y-0">
      <td className="block lg:table-cell p-0 lg:p-4">
        <div className="font-extrabold text-black text-xs">{prod.name}</div>
        <div className="text-[8.5px] text-gray-400 font-black tracking-widest mt-0.5">SKU: {prod.slug}</div>
      </td>
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell">
         <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Estoque Atual</span>
         <span className="font-bold text-gray-650">{prod.stock || 0}</span>
      </td>
      
      {/* Dynamic Price Venda Input */}
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell">
         <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Preço de Venda</span>
         <div className="flex items-center gap-1 max-w-[110px] bg-gray-50/50 p-1.5 border border-black/5">
            <span className="text-[9px] font-black text-black/30">R$</span>
            <input 
              type="number" 
              step="0.1" 
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
              onFocus={e => {
                if (priceInput === '0' || priceInput === '0.00' || priceInput === '0.0') {
                  setPriceInput('');
                }
              }}
              onBlur={e => {
                const parsed = parseFloat(priceInput);
                if (isNaN(parsed) || priceInput.trim() === '') {
                  setPriceInput('0');
                }
              }}
              className="w-full bg-transparent font-black text-black focus:outline-none placeholder-gray-300" 
            />
         </div>
      </td>

      {/* Dynamic Cost Input */}
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell">
         <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Custo Fabricação</span>
         <div className="flex items-center gap-1 max-w-[110px] bg-gray-50/50 p-1.5 border border-black/5">
            <span className="text-[9px] font-black text-black/30">R$</span>
            <input 
              type="number" 
              step="0.1" 
              value={costInput}
              onChange={e => setCostInput(e.target.value)}
              onFocus={e => {
                if (costInput === '0' || costInput === '0.00' || costInput === '0.0') {
                  setCostInput('');
                }
              }}
              onBlur={e => {
                const parsed = parseFloat(costInput);
                if (isNaN(parsed) || costInput.trim() === '') {
                  setCostInput('0');
                }
              }}
              className="w-full bg-transparent font-bold text-gray-650 focus:outline-none placeholder-gray-300" 
            />
         </div>
      </td>

      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell font-black text-black italic">
        <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Lucro Unitário</span>
        <span>R$ {unitProfitVal.toFixed(2)}</span>
      </td>
      <td className={cn("block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell font-black italic", marginUnitPercentActual > 50 ? "text-emerald-600" : marginUnitPercentActual > 30 ? "text-amber-500" : "text-rose-600")}>
        <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Margem de Lucro</span>
        <span>{marginUnitPercentActual.toFixed(1)}%</span>
      </td>
      
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell text-center font-bold text-gray-750">
        <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Vendido</span>
        <span>{prod.soldCount || 0} u</span>
      </td>
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell text-center font-black">
        <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Faturamento Total</span>
        <span>R$ {Number(prod.totalFaturamento || 0).toFixed(2)}</span>
      </td>
      
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell text-right">
        <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Ações</span>
        <div className="flex items-center justify-end gap-2">
           <button 
             onClick={handleLocalSave}
             disabled={isSaving}
             className="bg-black text-[9px] font-black text-white hover:bg-[#eab308] hover:text-black px-4 py-2 uppercase tracking-wider transition-all"
           >
             {isSaving ? '...' : 'Atualizar'}
           </button>

           <button
             type="button"
             onClick={() => onDelete(prod)}
             className="border border-red-200 hover:border-red-500 text-red-650 hover:bg-rose-50 text-[9px] font-black px-3 py-2 uppercase tracking-wider transition-all cursor-pointer"
           >
             Excluir
           </button>
        </div>
      </td>
    </tr>
  );
}

// Ready copies Apps Script Code string for Google Sheets automated webhook parsing
const APPS_SCRIPT_PROMPT = `// CÓDIGO DE INTEGRAÇÃO BIDIRECIONAL GOOGLE SHEETS & F PAC STORE
// Cole este código inteiro no seu Google Apps Script (Extensões > Apps Script)

// 🔥 COMO ATIVAR A ATUALIZAÇÃO AUTOMÁTICA (PLANILHA ➜ SITE) SEM PRECISAR CLICAR NO MENU:
// 1. No painel esquerdo do seu Apps Script, clique no ícone de relógio (Acionadores / Triggers).
// 2. Clique no botão azul "+ Adicionar Acionador" no canto inferior direito.
// 3. Selecione a função: "syncToWebsite".
// 4. Selecione a fonte de evento: "De planilha".
// 5. Selecione o tipo de evento: "Ao alterar" (recomenda-se "Ao alterar" ou "Ao editar").
// 6. Clique em Salvar e autorize as permissões. Pronto! 🎉

// 1. Cria o menu personalizado na sua planilha ao abrir
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('F PAC Store 🔄')
    .addItem('Sincronizar Planilha ➜ Site', 'syncToWebsite')
    .addToUi();
}

// 2. Recebe dados enviados do Site e atualiza a Planilha
function doPost(e) {
  try {
    var jsonString = e.postData.contents;
    var data = JSON.parse(jsonString);
    var sheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Create, clean and populate Tab 1: DASHBOARD
    var tabDashboard = getOrCreateSheet(sheet, "DASHBOARD");
    tabDashboard.clear();
    tabDashboard.getRange(1, 1).setValue("FATURAMENTO TOTAL COMPILADO").setFontWeight("bold");
    tabDashboard.getRange(1, 2).setValue(data.meta.totals.faturamento);
    tabDashboard.getRange(2, 1).setValue("INVESTIMENTO INICIAL TOTAL").setFontWeight("bold");
    tabDashboard.getRange(2, 2).setValue(data.meta.totals.investimentoInicial);
    tabDashboard.getRange(3, 1).setValue("LUCRO CORRENTE LÍQUIDO").setFontWeight("bold");
    tabDashboard.getRange(3, 2).setValue(data.meta.totals.lucroLiquido);
    tabDashboard.getRange(4, 1).setValue("AMORTIZAÇÃO EFETIVA (%)").setFontWeight("bold");
    tabDashboard.getRange(4, 2).setValue(data.meta.totals.recuperadoPorcentagem + "%");
    tabDashboard.getRange(5, 1).setValue("SALDO ATUAL EM CAIXA").setFontWeight("bold");
    tabDashboard.getRange(5, 2).setValue(data.meta.totals.caixaSaldo);
    tabDashboard.getRange(6, 1).setValue("CAMPANHAS ADS (PAGAS)").setFontWeight("bold");
    tabDashboard.getRange(6, 2).setValue(data.meta.totals.adsSpent);
    tabDashboard.getRange(7, 1).setValue("PONTO EQUILÍBRIO PEDIDOS").setFontWeight("bold");
    tabDashboard.getRange(7, 2).setValue(data.meta.totals.pontoEquilibrio);

    // Populate Tab 2: INVESTIMENTO
    var tabInv = getOrCreateSheet(sheet, "INVESTIMENTO INICIAL");
    tabInv.clear();
    tabInv.appendRow(["ID", "Data Registro", "Descrição Gasto", "Categoria", "Valor Gasto (R$)"]);
    data.investments.forEach(function(i) {
      tabInv.appendRow([i.id, i.date, i.description, i.category, i.amount]);
    });

    // Populate Tab 3: PEDIDOS
    var tabOrds = getOrCreateSheet(sheet, "PEDIDOS");
    tabOrds.clear();
    tabOrds.appendRow(["Pedido ID", "Data Completa", "Cliente", "Método", "Total Pedido (R$)", "Status Venda", "Taxas Gateway (MP)", "COGS Fabricação", "Envio Frete", "Lucro Líquido (R$)"]);
    data.ordersList.forEach(function(o) {
      tabOrds.appendRow([o.id, o.data, o.cliente, o.metodo, o.total, o.status, o.taxa_mp, o.custo_produto, o.frete, o.lucro_liquido]);
    });

    // Populate Tab 4: CATALOGO PRODUTOS
    var tabProds = getOrCreateSheet(sheet, "PRODUTOS");
    tabProds.clear();
    tabProds.appendRow(["SKU Modelo", "Nome Técnico", "Estoque Físico", "Preço Venda (R$)", "Custo Fabricação Unitário (R$)", "Unidades Vendidas", "Faturamento Acumulado (R$)", "Lucro Acumulado (R$)", "Margem Unitária (%)"]);
    data.productsCatalog.forEach(function(p) {
      tabProds.appendRow([p.slug, p.name, p.stock, p.price, p.cost, p.soldCount, p.totalFaturamento, p.totalProfit, p.margin]);
    });

    // Populate Tab 5: OUTRAS TRANSACOES
    var tabCf = getOrCreateSheet(sheet, "FLUXO DE CAIXA");
    tabCf.clear();
    tabCf.appendRow(["Transação ID", "Data", "Tipo Caixa", "Descrição", "Categoria", "Valor Registro (R$)"]);
    data.cashflowEntries.forEach(function(c) {
      tabCf.appendRow([c.id, c.date, c.type === 'in' ? 'Entrada (+)' : 'Saída (-)', c.description, c.category, c.amount]);
    });

    // Populate Tab 6: METRICAS TRAFEGO ADS
    var tabAds = getOrCreateSheet(sheet, "TRAFEGO PAGO");
    tabAds.clear();
    tabAds.appendRow(["Métrica ID", "Data Campanha", "Campanha Nome", "Investimento Ads (R$)", "Cliques Atribuídos", "Conversões Registradas", "ROAS Atribuído", "Lucro Estimado ads (R$)"]);
    data.trafficCampaigns.forEach(function(t) {
      tabAds.appendRow([t.id, t.date, t.campaignName, t.amountSpent, t.clicks, t.conversions, t.roas, t.lucro]);
    });

    return HtmlService.createHtmlOutput("Sincronizado de graça com a F PAC Store com sucesso!");
  } catch(err) {
    return HtmlService.createHtmlOutput("Erro na sincronização: " + err.message);
  }
}

// 3. Lê os dados editados na Planilha e envia de volta ao Site em tempo real
function syncToWebsite() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var WEBSITE_URL = "<<WEBSITE_URL>>";
  
  var payload = {
    investments: [],
    orders: [],
    products: [],
    cashflow: [],
    traffic: []
  };

  // Ler Tab 2: INVESTIMENTO INICIAL
  var tabInv = sheet.getSheetByName("INVESTIMENTO INICIAL");
  if (tabInv) {
    var dataValues = tabInv.getDataRange().getValues();
    for (var i = 1; i < dataValues.length; i++) {
      var row = dataValues[i];
      if (row[0]) {
        payload.investments.push({
          id: String(row[0]),
          date: row[1] instanceof Date ? row[1].toISOString().split('T')[0] : String(row[1]),
          description: String(row[2]),
          category: String(row[3]),
          amount: parseFloat(row[4]) || 0
        });
      }
    }
  }

  // Ler Tab 3: PEDIDOS
  var tabOrds = sheet.getSheetByName("PEDIDOS");
  if (tabOrds) {
    var dataValues = tabOrds.getDataRange().getValues();
    for (var i = 1; i < dataValues.length; i++) {
      var row = dataValues[i];
      if (row[0]) {
        payload.orders.push({
          id: String(row[0]),
          status: String(row[5])
        });
      }
    }
  }

  // Ler Tab 4: PRODUTOS
  var tabProds = sheet.getSheetByName("PRODUTOS");
  if (tabProds) {
    var dataValues = tabProds.getDataRange().getValues();
    for (var i = 1; i < dataValues.length; i++) {
      var row = dataValues[i];
      if (row[0]) {
        payload.products.push({
          slug: String(row[0]),
          name: String(row[1]),
          stock: parseInt(row[2]) || 0,
          price: parseFloat(row[3]) || 0,
          cost: parseFloat(row[4]) || 0
        });
      }
    }
  }

  // Ler Tab 5: FLUXO DE CAIXA
  var tabCf = sheet.getSheetByName("FLUXO DE CAIXA");
  if (tabCf) {
    var dataValues = tabCf.getDataRange().getValues();
    for (var i = 1; i < dataValues.length; i++) {
      var row = dataValues[i];
      if (row[0]) {
        payload.cashflow.push({
          id: String(row[0]),
          date: row[1] instanceof Date ? row[1].toISOString().split('T')[0] : String(row[1]),
          type: String(row[2]).indexOf('+') !== -1 ? 'in' : 'out',
          description: String(row[3]),
          category: String(row[4]),
          amount: parseFloat(row[5]) || 0
        });
      }
    }
  }

  // Ler Tab 6: TRAFEGO PAGO
  var tabAds = sheet.getSheetByName("TRAFEGO PAGO");
  if (tabAds) {
    var dataValues = tabAds.getDataRange().getValues();
    for (var i = 1; i < dataValues.length; i++) {
      var row = dataValues[i];
      if (row[0]) {
        payload.traffic.push({
          id: String(row[0]),
          date: row[1] instanceof Date ? row[1].toISOString().split('T')[0] : String(row[1]),
          campaignName: String(row[2]),
          amountSpent: parseFloat(row[3]) || 0,
          clicks: parseInt(row[4]) || 0,
          conversions: parseInt(row[5]) || 0,
          roas: parseFloat(row[6]) || 0,
          lucro: parseFloat(row[7]) || 0
        });
      }
    }
  }

  var url = WEBSITE_URL + "/api/sheets/sync-back";
  var options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var text = response.getContentText();
    
    if (code === 200) {
      SpreadsheetApp.getUi().alert("Sucesso! O site foi atualizado em tempo real com as alterações da sua planilha! 🎉");
    } else {
      SpreadsheetApp.getUi().alert("Erro retornado pelo site: " + text);
    }
  } catch(err) {
    SpreadsheetApp.getUi().alert("Erro ao conectar com o site: " + err.message);
  }
}

function getOrCreateSheet(spreadsheet, name) {
  var activeSheet = spreadsheet.getSheetByName(name);
  if (!activeSheet) {
    activeSheet = spreadsheet.insertSheet(name);
  }
  return activeSheet;
}
`;

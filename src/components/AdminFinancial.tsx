import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, query, orderBy, onSnapshot, doc, 
  setDoc, deleteDoc, updateDoc, serverTimestamp, getDocs
} from 'firebase/firestore';
import { 
  TrendingUp, TrendingDown, DollarSign, Award, Target, 
  Calendar, Layers, Filter, Plus, Trash2, Download, 
  RefreshCw, CheckCircle2, AlertTriangle, HelpCircle, 
  FileSpreadsheet, PieChart, ShoppingBag, Eye, Percent, ArrowUpRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiUrl } from '../lib/api';
import { cn } from '../lib/utils';

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

// Default initial templates to help user immediately see how to use it
const DEFAULT_INVESTMENTS: Investment[] = [
  { id: 'inv-1', description: 'Registro de Domínio FPAC', amount: 40.00, category: 'domínio', date: '2026-05-01' },
  { id: 'inv-2', description: 'Hospedagem Hostinger (Anual)', amount: 240.00, category: 'hospedagem', date: '2026-05-01' },
  { id: 'inv-3', description: 'Lote Inicial de Embalagens Personalizadas', amount: 450.00, category: 'embalagens', date: '2026-05-03' },
  { id: 'inv-4', description: 'Tecidos e Costureira (Primeiro Lote)', amount: 1200.00, category: 'fornecedores', date: '2026-05-05' }
];

const DEFAULT_CASHFLOW: CashFlowEntry[] = [
  { id: 'cf-1', description: 'Anúncios Google Ads - Campanhas Lançamento', amount: 150.00, type: 'out', category: 'Tráfego Pago', date: '2026-05-10' },
  { id: 'cf-2', description: 'Frete de Devolução (Pedido #1002)', amount: 22.90, type: 'out', category: 'Envio/Frete', date: '2026-05-18' }
];

const DEFAULT_TRAFFIC: TrafficCamp[] = [
  { id: 'tr-1', campaignName: 'INSTAGRAM STORY - OVERSIZED WHITE', amountSpent: 50.00, date: '2026-05-15', clicks: 124, conversions: 2 },
  { id: 'tr-2', campaignName: 'TIKTOK ADS - DROP ESTRELA CHIC', amountSpent: 75.00, date: '2026-05-19', clicks: 310, conversions: 4 }
];

export function AdminFinancial() {
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'investments' | 'orders' | 'products' | 'cashflow' | 'traffic' | 'sheets'>('dashboard');
  
  // Data States
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [cashflow, setCashflow] = useState<CashFlowEntry[]>([]);
  const [traffic, setTraffic] = useState<TrafficCamp[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isFirestore, setIsFirestore] = useState(true);

  // Form states for adding items
  const [invForm, setInvForm] = useState({ description: '', amount: '', category: 'fornecedores', date: new Date().toISOString().split('T')[0] });
  const [cfForm, setCfForm] = useState({ description: '', amount: '', type: 'out' as 'in' | 'out', category: 'Tráfego Pago', date: new Date().toISOString().split('T')[0] });
  const [trafficForm, setTrafficForm] = useState({ campaignName: '', amountSpent: '', clicks: '', conversions: '', date: new Date().toISOString().split('T')[0] });

  // Webhook sheet simulator
  const [sheetWebhookUrl, setSheetWebhookUrl] = useState('');
  const [isSyncingWebhook, setIsSyncingWebhook] = useState(false);

  // Load live data from Firestore, fallback to LocalStorage if missing / empty
  useEffect(() => {
    setLoading(true);
    
    // 1. Fetch live orders in real-time
    const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
      const liveOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAtDate: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(doc.data().createdAt)
      }));
      setOrders(liveOrders);
    });

    // 2. Fetch live products
    const qProducts = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      const liveProducts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(liveProducts);
    });

    // 3. Fetch investments
    const qInv = query(collection(db, 'financial_investments'), orderBy('date', 'desc'));
    const unsubscribeInv = onSnapshot(qInv, (snapshot) => {
      if (!snapshot.empty) {
        setInvestments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Investment)));
      } else {
        // Fallback or Initial template setup
        const local = localStorage.getItem('fpac_financial_investments');
        if (local) {
          setInvestments(JSON.parse(local));
        } else {
          setInvestments(DEFAULT_INVESTMENTS);
          localStorage.setItem('fpac_financial_investments', JSON.stringify(DEFAULT_INVESTMENTS));
        }
      }
    });

    // 4. Fetch cashflow
    const qCf = query(collection(db, 'financial_cashflow'), orderBy('date', 'desc'));
    const unsubscribeCf = onSnapshot(qCf, (snapshot) => {
      if (!snapshot.empty) {
        setCashflow(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CashFlowEntry)));
      } else {
        const local = localStorage.getItem('fpac_financial_cashflow');
        if (local) {
          setCashflow(JSON.parse(local));
        } else {
          setCashflow(DEFAULT_CASHFLOW);
          localStorage.setItem('fpac_financial_cashflow', JSON.stringify(DEFAULT_CASHFLOW));
        }
      }
    });

    // 5. Fetch traffic
    const qTr = query(collection(db, 'financial_traffic'), orderBy('date', 'desc'));
    const unsubscribeTr = onSnapshot(qTr, (snapshot) => {
      if (!snapshot.empty) {
        setTraffic(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TrafficCamp)));
      } else {
        const local = localStorage.getItem('fpac_financial_traffic');
        if (local) {
          setTraffic(JSON.parse(local));
        } else {
          setTraffic(DEFAULT_TRAFFIC);
          localStorage.setItem('fpac_financial_traffic', JSON.stringify(DEFAULT_TRAFFIC));
        }
      }
    });

    setLoading(false);

    return () => {
      unsubscribeOrders();
      unsubscribeProducts();
      unsubscribeInv();
      unsubscribeCf();
      unsubscribeTr();
    };
  }, []);

  // Write changes to Firestore helper
  const handleSaveDoc = async (col: string, data: any) => {
    try {
      const docRef = doc(collection(db, col));
      await setDoc(docRef, { ...data, id: docRef.id });
      toast.success('Lançamento inserido no Banco!');
    } catch (err) {
      // Local fallback if database rules prevent anonymous writes or specific scopes
      console.warn("Firestore save fallback to local storage:", err);
      const localKey = `fpac_${col}`;
      const current = localStorage.getItem(localKey);
      const list = current ? JSON.parse(current) : [];
      const newItem = { ...data, id: `local-${Date.now()}` };
      localStorage.setItem(localKey, JSON.stringify([newItem, ...list]));
      
      // Update local state directly
      if (col === 'financial_investments') setInvestments(prev => [newItem, ...prev]);
      if (col === 'financial_cashflow') setCashflow(prev => [newItem, ...prev]);
      if (col === 'financial_traffic') setTraffic(prev => [newItem, ...prev]);
      
      toast.success('Salvo localmente (Offline-Backup)');
    }
  };

  // Delete document
  const handleDeleteDoc = async (col: string, id: string) => {
    try {
      if (!id.startsWith('local-')) {
        await deleteDoc(doc(db, col, id));
        toast.success('Item excluído com sucesso!');
      } else {
        throw new Error("Local item");
      }
    } catch (err) {
      const localKey = `fpac_${col}`;
      const current = localStorage.getItem(localKey);
      if (current) {
        const list = JSON.parse(current).filter((item: any) => item.id !== id);
        localStorage.setItem(localKey, JSON.stringify(list));
      }
      if (col === 'financial_investments') setInvestments(prev => prev.filter(i => i.id !== id));
      if (col === 'financial_cashflow') setCashflow(prev => prev.filter(c => c.id !== id));
      if (col === 'financial_traffic') setTraffic(prev => prev.filter(t => t.id !== id));
      toast.success('Item excluído do armazenamento local!');
    }
  };

  // ----------------------------------------------------
  // LOGIC & MATH CALCULATIONS
  // ----------------------------------------------------

  // Calculate Mercado Pago Rate & COGS per order helper
  const calculateFeesAndMargins = (order: any) => {
    const total = order.total || 0;
    const method = String(order.paymentMethod || '').toLowerCase();
    
    // 1. Calculate Mercado Pago Fee
    let gatewayFee = 0;
    if (method.includes('pix')) {
      // 0.99% for PIX
      gatewayFee = total * 0.0099;
    } else {
      // 3.99% + 0.40 for Credit Card/Split checkout
      gatewayFee = total * 0.0399 + 0.40;
    }

    // 2. Shipping cost
    const shippingCost = order.shipping || 0;

    // 3. COGS cost (costPrice calculation)
    let cogs = 0;
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach((item: any) => {
        const prod = products.find(p => p.id === item.id || p.slug === item.slug);
        const singleCost = prod?.costPrice || prod?.cost || 0;
        cogs += singleCost * (item.quantity || 1);
      });
    }

    // 4. Net Profit
    const netProfit = total - gatewayFee - shippingCost - cogs;

    return { gatewayFee, shippingCost, cogs, netProfit };
  };

  // Order aggregations
  const orderStats = useMemo(() => {
    const activeOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'Pagamento Não Realizado');
    const approvedOrders = orders.filter(o => ['Pagamento Aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(o.status));
    const pendingOrders = orders.filter(o => ['received', 'payment_pending', 'Aguardando Pagamento PIX'].includes(o.status));
    const pendingPix = orders.filter(o => o.status === 'Aguardando Pagamento PIX');

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

    // Calculate conversions and abandonment rate based on Checkouts collection (mockable or synced if checkout triggers are operational)
    // Total approved / total orders placed = checkout success rate
    const totalCheckoutOpportunities = activeOrders.length + orders.filter(o => o.status === 'cancelled').length;
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
  }, [orders, products]);

  // Initial Investment aggregations
  const investmentStats = useMemo(() => {
    const totalInvestido = investments.reduce((acc, current) => acc + Number(current.amount || 0), 0);
    
    // LÓGICA: Enquanto o lucro acumulado não ultrapassar o valor investido: PREJUÍZO OPERACIONAL. Após ultrapassar: LUCRO REAL.
    const saldoRestante = Math.max(0, totalInvestido - orderStats.lucroLiquido);
    const porcentagemRecuperada = totalInvestido > 0 ? (orderStats.lucroLiquido / totalInvestido) * 100 : 0;
    
    // Lucro após break-even
    const lucroRealPosBreakEven = Math.max(0, orderStats.lucroLiquido - totalInvestido);
    
    // Status visual
    const hasRecovered = orderStats.lucroLiquido >= totalInvestido;

    return {
      totalInvestido,
      saldoRestante,
      porcentagemRecuperada: Math.min(100, porcentagemRecuperada),
      lucroReal: lucroRealPosBreakEven,
      hasRecovered,
      financialBalance: orderStats.lucroLiquido - totalInvestido // represents current operational statement
    };
  }, [investments, orderStats.lucroLiquido]);

  // Cashflow entries mapping (combining manual inputs + site sales auto logs)
  const cashflowStats = useMemo(() => {
    // 1. Inputs manual list
    const manualIn = cashflow.filter(c => c.type === 'in').reduce((acc, current) => acc + Number(current.amount || 0), 0);
    const manualOut = cashflow.filter(c => c.type === 'out').reduce((acc, current) => acc + Number(current.amount || 0), 0);
    
    // 2. Ads spend from traffic or general cashflow
    const trafficAdsSpent = traffic.reduce((acc, t) => acc + Number(t.amountSpent || 0), 0);

    // 3. Totals
    const totalEntradas = orderStats.faturamento + manualIn;
    // Costs consist of fabric COGS, shipping paid, payment gateway fees, initial investment and other expenses
    const totalSaidas = orderStats.cogs + orderStats.gatewayFees + orderStats.shipping + manualOut + trafficAdsSpent;
    const saldoAtual = totalEntradas - totalSaidas;

    return {
      entradas: totalEntradas,
      saidas: totalSaidas,
      saldoAtual,
      manualIn,
      manualOut,
      adsSpent: trafficAdsSpent
    };
  }, [cashflow, traffic, orderStats]);

  // Paid traffic computations
  const trafficStats = useMemo(() => {
    const totalInvestidoTrafego = traffic.reduce((acc, t) => acc + Number(t.amountSpent || 0), 0);
    const totalCliques = traffic.reduce((acc, t) => acc + Number(t.clicks || 0), 0);
    const totalVendasAtribuidasProps = traffic.reduce((acc, t) => acc + Number(t.conversions || 0), 0);

    // ROI, ROAS, CAC
    // Formula ROAS = Revenue / Cost
    // ROI = (Profit - Cost) / Cost
    const totalRevenueFromAds = totalVendasAtribuidasProps * orderStats.ticketMedio;
    const roas = totalInvestidoTrafego > 0 ? totalRevenueFromAds / totalInvestidoTrafego : 0;
    const cac = totalVendasAtribuidasProps > 0 ? totalInvestidoTrafego / totalVendasAtribuidasProps : 0;
    
    // Dynamic Campaign list with manual ROI
    const campaignList = traffic.map(t => {
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
  }, [traffic, orderStats.ticketMedio]);

  // Product analytical stats (best sellers, profitability, margins)
  const productFinancialStats = useMemo(() => {
    const productsMetrics: Record<string, { quantity: number; faturamento: number; totalCost: number; profit: number }> = {};

    // Base initial structures
    products.forEach(p => {
      productsMetrics[p.id || p.slug] = {
        quantity: 0,
        faturamento: 0,
        totalCost: 0,
        profit: 0
      };
    });

    // Populate using approved orders details
    const approvedOrders = orders.filter(o => ['Pagamento Aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(o.status));
    approvedOrders.forEach(o => {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          const pId = item.id || item.slug;
          const qty = Number(item.quantity) || 1;
          const price = Number(item.price) || 0;
          
          const prod = products.find(p => p.id === item.id || p.slug === item.slug);
          const cost = Number(prod?.costPrice || prod?.cost || 0);

          if (!productsMetrics[pId]) {
            productsMetrics[pId] = { quantity: 0, faturamento: 0, totalCost: 0, profit: 0 };
          }

          productsMetrics[pId].quantity += qty;
          productsMetrics[pId].faturamento += price * qty;
          productsMetrics[pId].totalCost += cost * qty;
          productsMetrics[pId].profit += (price - cost) * qty;
        });
      }
    });

    // Map to list
    const productFinList = products.map(p => {
      const stats = productsMetrics[p.id] || productsMetrics[p.slug] || { quantity: 0, faturamento: 0, totalCost: 0, profit: 0 };
      const currentPrice = Number(p.price || 0);
      const currentCost = Number(p.costPrice || p.cost || 0);
      const margemUnitariaValue = currentPrice > 0 ? ((currentPrice - currentCost) / currentPrice) * 100 : 0;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: currentPrice,
        cost: currentCost,
        stock: p.stock || 0,
        soldCount: stats.quantity,
        totalFaturamento: stats.faturamento,
        totalProfit: stats.profit,
        unitProfit: currentPrice - currentCost,
        margin: margemUnitariaValue
      };
    });

    // Sort products based on amount sold and total profit
    const productBestSeller = [...productFinList].sort((a, b) => b.soldCount - a.soldCount)[0];
    const productMostProfitable = [...productFinList].sort((a, b) => b.totalProfit - a.totalProfit)[0];

    return {
      list: productFinList,
      bestSeller: productBestSeller || null,
      mostProfitable: productMostProfitable || null,
      averageMargin: productFinList.length > 0 ? productFinList.reduce((acc, p) => acc + p.margin, 0) / productFinList.length : 0
    };
  }, [products, orders]);

  // Break Even & Growth Estimates
  const breakEvenStats = useMemo(() => {
    // Break-even point in orders = Fixed investment divided by Net average profit of an order
    const averageProfitPerOrder = orderStats.lucroLiquido > 0 ? orderStats.lucroLiquido / orderStats.approvedCount : 90; // fallback R$ 90 margin
    const pontoEquilibrioPedidos = averageProfitPerOrder > 0 ? Math.ceil(investmentStats.totalInvestido / averageProfitPerOrder) : 0;

    // Estimate Date of Returns
    // Calculated based on daily average net profit. Let's find sales timeline
    const approvedHistory = orders.filter(o => ['Pagamento Aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(o.status));
    
    let estimatedReturnDate = "Pendente de mais vendas";
    if (approvedHistory.length >= 2 && orderStats.lucroLiquido > 0 && !investmentStats.hasRecovered) {
      const lastObj = approvedHistory[0];
      const oldestObj = approvedHistory[approvedHistory.length - 1];
      
      const lastTime = lastObj.createdAtDate?.getTime() || Date.now();
      const oldestTime = oldestObj.createdAtDate?.getTime() || (Date.now() - 30 * 24 * 60 * 60 * 1000);
      
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


  // ----------------------------------------------------
  // HANDLERS FOR FORMS
  // ----------------------------------------------------

  const handleAddInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invForm.description || !invForm.amount) {
      toast.error('Preencha os campos obrigatórios!');
      return;
    }
    const amountVal = parseFloat(invForm.amount);
    await handleSaveDoc('financial_investments', {
      description: invForm.description,
      amount: amountVal,
      category: invForm.category,
      date: invForm.date
    });
    setInvForm({ description: '', amount: '', category: 'fornecedores', date: new Date().toISOString().split('T')[0] });
  };

  const handleAddCashFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfForm.description || !cfForm.amount) {
      toast.error('Preencha os campos obrigatórios!');
      return;
    }
    const amountVal = parseFloat(cfForm.amount);
    await handleSaveDoc('financial_cashflow', {
      description: cfForm.description,
      amount: amountVal,
      type: cfForm.type,
      category: cfForm.category,
      date: cfForm.date
    });
    setCfForm({ description: '', amount: '', type: 'out', category: 'Tráfego Pago', date: new Date().toISOString().split('T')[0] });
  };

  const handleAddTraffic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trafficForm.campaignName || !trafficForm.amountSpent) {
      toast.error('Preencha os campos de campanha e valor!');
      return;
    }
    await handleSaveDoc('financial_traffic', {
      campaignName: trafficForm.campaignName,
      amountSpent: parseFloat(trafficForm.amountSpent),
      clicks: parseInt(trafficForm.clicks) || 0,
      conversions: parseInt(trafficForm.conversions) || 0,
      date: trafficForm.date
    });
    setTrafficForm({ campaignName: '', amountSpent: '', clicks: '', conversions: '', date: new Date().toISOString().split('T')[0] });
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

  // ----------------------------------------------------
  // GOOGLE SHEETS DYNAMIC WEBHOOK EXPORTER
  // ----------------------------------------------------
  const handleGoogleSheetsSync = async () => {
    if (!sheetWebhookUrl) {
      toast.error("Insira a URL do Script Web do Google Sheets para continuar!");
      return;
    }
    
    setIsSyncingWebhook(true);
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
      
      toast.success("Dados enviados para sua Planilha Google Sheets! 🎉");
    } catch (err: any) {
      console.error(err);
      toast.error("Falha ao sincronizar. Verifique se o Google Apps Script está publicado!");
    } finally {
      setIsSyncingWebhook(false);
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
    <div className="space-y-12">
      {/* Dynamic Header */}
      <div className="bg-black text-white p-8 border border-white/5 relative overflow-hidden flex flex-col lg:flex-row justify-between lg:items-center gap-6 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#eab308]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-3">
            <span className="bg-[#eab308] text-black px-2 mt-0.5.5 py-1 text-[8px] font-black uppercase tracking-widest italic font-sans animate-pulse">
              FINANCEIRO SPREADSHEET V3.0
            </span>
            <div className="h-[1px] w-6 bg-white/20" />
            <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Custo Zero Automação</span>
          </div>
          <h2 className="text-4xl font-black uppercase tracking-tighter italic">GESTÃO FINANCEIRA E RECURSOS</h2>
          <p className="text-xs text-gray-400 font-bold max-w-xl uppercase tracking-widest leading-relaxed">
            Painel contábil integrado ao site: calculador automático de lucro, ROI, faturamento real, inicial amortização de custos e integração direta com o Google Sheets.
          </p>
        </div>
        
        {/* Quick CSV Downloader */}
        <div className="flex gap-2 relative z-10 shrink-0">
          <button 
            onClick={() => handleDownloadCSV('orders')}
            className="bg-white/10 hover:bg-[#eab308] hover:text-black hover:scale-[1.03] text-white px-5 py-3.5 text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border border-white/10"
          >
            <Download size={14} /> Exportar Completo_CSV
          </button>
        </div>
      </div>

      {/* Grid tabs */}
      <div className="flex flex-row overflow-x-auto border-b border-black/10 pb-1 scrollbar-none gap-1 bg-gray-50 p-1">
        {[
          { id: 'dashboard', label: '1. Dashboard', icon: <PieChart size={14} /> },
          { id: 'investments', label: '2. Custos Loja', icon: <DollarSign size={14} /> },
          { id: 'orders', label: '3. Pedidos (Receita)', icon: <ShoppingBag size={14} /> },
          { id: 'products', label: '4. Margem Produtos', icon: <Layers size={14} /> },
          { id: 'cashflow', label: '5. Fluxo de Caixa', icon: <RefreshCw size={14} /> },
          { id: 'traffic', label: '6. Tráfego Ads', icon: <Target size={14} /> },
          { id: 'sheets', label: '7. Integração Sheets', icon: <FileSpreadsheet size={14} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={cn(
              "px-5 py-3.5 text-[9px] font-black uppercase tracking-widest flex items-center gap-2.5 transition-all outline-none shrink-0 border",
              activeSubTab === tab.id 
                ? "bg-black text-[#eab308] border-black shadow-lg scale-102"
                : "bg-white text-gray-400 border-black/5 hover:text-black"
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
        <div className="space-y-10 animate-in fade-in duration-300">
          
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
                  ? `R$ ${investmentStats.lucroReal.toFixed(2)} EM LUCRO REAL NET` 
                  : `PREJUÍZO OPERACIONAL ACUMULADO: R$ ${investmentStats.saldoRestante.toFixed(2)}`
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
                 <span className="italic">{investmentStats.porcentagemRecuperada.toFixed(1)}%</span>
              </div>
              <div className="h-4 bg-black/10 w-full overflow-hidden">
                 <div 
                   className={cn("h-full transition-all duration-1000", investmentStats.hasRecovered ? "bg-emerald-500" : "bg-[#eab308]")} 
                   style={{ width: `${investmentStats.porcentagemRecuperada}%` }} 
                 />
              </div>
              <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest opacity-60">
                 <span>Recuperado: R$ {orderStats.lucroLiquido.toFixed(2)}</span>
                 <span>Investido: R$ {investmentStats.totalInvestido.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Bento Grid core numeric summary widgets */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* KPI 1 : Faturamento Real Approved */}
            <div className="bg-white border p-6 flex flex-col justify-between min-h-[140px] shadow-sm relative overflow-hidden group hover:border-[#eab308] transition-colors">
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[9px] font-black uppercase tracking-widest">Faturamento Líquido (Aprovados)</span>
                <DollarSign size={16} className="text-[#eab308]" />
              </div>
              <div>
                <h3 className="text-3xl font-black italic tracking-tighter text-black">R$ {orderStats.faturamento.toFixed(2)}</h3>
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
                <h3 className="text-3xl font-black italic tracking-tighter text-black">R$ {orderStats.lucroLiquido.toFixed(2)}</h3>
                <div className="flex justify-between items-center text-[8px] font-bold uppercase tracking-widest text-black/50 mt-2">
                   <span>Margem Média: {productFinancialStats.averageMargin.toFixed(1)}%</span>
                   <span>COGS: R$ {orderStats.cogs.toFixed(1)}</span>
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
                <h3 className="text-3xl font-black italic tracking-tighter text-black">R$ {orderStats.ticketMedio.toFixed(2)}</h3>
                <div className="flex justify-between items-center text-[8px] font-bold uppercase tracking-widest text-blue-600 mt-2">
                   <span>Sucesso Checkout: {orderStats.conversionRate.toFixed(1)}%</span>
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
                <h4 className="text-xl font-black text-black mt-1">{orderStats.pendingPixCount}Pedidos</h4>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-extrabold text-amber-600 uppercase tracking-widest">VALOR EM JOGO</span>
                <h4 className="text-xl font-black text-black mt-1">R$ {orderStats.pendingPixValue.toFixed(2)}</h4>
              </div>
            </div>

            <div className="bg-black/5 border border-black/10 p-6 flex items-center justify-between">
              <div>
                <span className="text-[8px] font-extrabold text-gray-500 uppercase tracking-widest">TOTAL INVESTIMENTO ATIVO</span>
                <h4 className="text-xl font-black text-black mt-1">R$ {investmentStats.totalInvestido.toFixed(2)}</h4>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-extrabold text-gray-500 uppercase tracking-widest">AMORTIZADO</span>
                <h4 className="text-xl font-black text-emerald-600 mt-1">R$ {orderStats.lucroLiquido.toFixed(2)}</h4>
              </div>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/10 p-6 flex items-center justify-between">
              <div>
                <span className="text-[8px] font-extrabold text-blue-600 uppercase tracking-widest">SALDO DO CAIXA REAL</span>
                <h4 className="text-xl font-black text-black mt-1">R$ {cashflowStats.saldoAtual.toFixed(2)}</h4>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-extrabold text-blue-600 uppercase tracking-widest">TRÁFEGO ADS</span>
                <h4 className="text-xl font-black text-black mt-1">R$ {cashflowStats.adsSpent.toFixed(2)}</h4>
              </div>
            </div>
          </div>

          {/* Custom SVG Charts panel (Highly responsive and stylish) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Trend chart */}
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
                     <span className="text-[9px] font-black text-black">R$ {orderStats.faturamento.toFixed(1)}</span>
                     <span className="text-[8px] text-gray-400 uppercase tracking-widest">FATURAMENTO</span>
                  </div>

                  {/* Operational Costs */}
                  <div className="flex-1 flex flex-col items-center gap-3">
                     <div className="w-full bg-rose-500 max-w-[80px]" style={{ height: `${Math.max(10, Math.min(100, (((orderStats.cogs + orderStats.gatewayFees + orderStats.shipping) / (orderStats.faturamento || 1)) * 100)))}%` }} />
                     <span className="text-[9px] font-black text-rose-600">R$ {(orderStats.cogs + orderStats.gatewayFees + orderStats.shipping).toFixed(1)}</span>
                     <span className="text-[8px] text-gray-400 uppercase tracking-widest">CUSTOS VARIÁVEIS</span>
                  </div>

                  {/* Real Lucro */}
                  <div className="flex-1 flex flex-col items-center gap-3">
                     <div className="w-full bg-emerald-500 max-w-[80px]" style={{ height: `${Math.max(10, Math.min(100, (orderStats.lucroLiquido / (orderStats.faturamento || 1)) * 100))}%` }} />
                     <span className="text-[9px] font-black text-emerald-600">R$ {orderStats.lucroLiquido.toFixed(1)}</span>
                     <span className="text-[8px] text-gray-400 uppercase tracking-widest">LUCRO NET</span>
                  </div>
               </div>
            </div>

            {/* Campaign analytics metrics overview */}
            <div className="bg-white border p-8 space-y-6 flex flex-col justify-between">
               <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308]">Focos de Operação</span>
                  <h3 className="text-lg font-black uppercase italic mt-0.5">PRODUTOS MAIS RENTÁVEIS EM HISTÓRICO</h3>
               </div>

               <div className="space-y-4 flex-grow py-5">
                  {productFinancialStats.bestSeller && (
                    <div className="border border-black/5 p-4 flex items-center justify-between">
                       <div>
                          <span className="text-[8px] font-extrabold uppercase text-gray-400">PRODUTO MAIS VENDIDO (VOLUME)</span>
                          <h4 className="text-sm font-black uppercase mt-1 italic">{productFinancialStats.bestSeller.name}</h4>
                          <p className="text-[10px] text-gray-500 font-bold mt-0.5">{productFinancialStats.bestSeller.soldCount} unidades comercializadas</p>
                       </div>
                       <div className="text-right">
                          <span className="text-[8px] font-extrabold uppercase text-[#eab308]">FATURAMENTO</span>
                          <h4 className="text-sm font-black text-black mt-1">R$ {productFinancialStats.bestSeller.totalFaturamento.toFixed(2)}</h4>
                       </div>
                    </div>
                  )}

                  {productFinancialStats.mostProfitable && (
                    <div className="border border-black/5 p-4 flex items-center justify-between">
                       <div>
                          <span className="text-[8px] font-extrabold uppercase text-emerald-600 animate-pulse">PRODUTO MAIS RENTÁVEL (VALOR LÍQUIDO)</span>
                          <h4 className="text-sm font-black uppercase mt-1 italic text-emerald-600">{productFinancialStats.mostProfitable.name}</h4>
                          <p className="text-[10px] text-gray-500 font-bold mt-0.5">Margem Unitária: {productFinancialStats.mostProfitable.margin.toFixed(1)}%</p>
                       </div>
                       <div className="text-right">
                          <span className="text-[8px] font-extrabold uppercase text-emerald-600">LUCRO NET</span>
                          <h4 className="text-sm font-black text-emerald-600 mt-1">R$ {productFinancialStats.mostProfitable.totalProfit.toFixed(2)}</h4>
                       </div>
                    </div>
                  )}
               </div>

               <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest leading-relaxed italic border-t border-black/5 pt-4">
                  * Métodos de fabricação otimizados reduzem o custo de mercadorias vendidas (COGS), impulsionando a amortização de break-even.
               </p>
            </div>

          </div>

        </div>
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
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-black/10 bg-gray-100 text-[8px] uppercase tracking-widest text-gray-400 font-black">
                            <th className="p-4">Descrição</th>
                            <th className="p-4">Categoria</th>
                            <th className="p-4">Data Registro</th>
                            <th className="p-4">Valor (R$)</th>
                            <th className="p-4 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {investments.map(inv => (
                            <tr key={inv.id} className="border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase">
                              <td className="p-4 font-extrabold text-black text-xs">{inv.description}</td>
                              <td className="p-4"><span className="bg-black/5 text-[9px] px-2 py-0.5 font-bold">{inv.category}</span></td>
                              <td className="p-4 text-xs font-bold text-gray-500">{new Date(inv.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                              <td className="p-4 font-black italic">R$ {Number(inv.amount || 0).toFixed(2)}</td>
                              <td className="p-4 text-center">
                                <button onClick={() => handleDeleteDoc('financial_investments', inv.id)} className="text-red-500 hover:text-black hover:bg-red-50 p-2 border border-transparent hover:border-red-100 transition-all rounded-sm">
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
                <div className="overflow-x-auto">
                   <table className="w-full text-left text-xs border-collapse">
                      <thead>
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
                      <tbody>
                        {orders.map(order => {
                          const calc = calculateFeesAndMargins(order);
                          const isApproved = ['Pagamento Aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(order.status);
                          
                          return (
                            <tr key={order.id} className={cn("border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase", !isApproved && "opacity-50 bg-gray-50/40")}>
                              <td className="p-4">
                                <div className="font-extrabold text-black text-xs">#{order.id.slice(0, 10).toUpperCase()}</div>
                                <div className="text-[8.5px] text-gray-400 font-black tracking-widest mt-0.5">{order.customerName}</div>
                              </td>
                              <td className="p-4 text-xs font-bold text-gray-500 whitespace-nowrap">
                                {order.createdAtDate?.toLocaleDateString('pt-BR') || ''}
                              </td>
                              <td className="p-4 font-black tracking-wider text-[10px]">{order.paymentMethod || 'Cartão'}</td>
                              <td className="p-4 font-black">R$ {Number(order.total || 0).toFixed(2)}</td>
                              <td className="p-4 font-bold text-gray-600">R$ {calc.cogs.toFixed(2)}</td>
                              <td className="p-4 text-gray-500">R$ {calc.gatewayFee.toFixed(2)}</td>
                              <td className="p-4 text-gray-500">R$ {calc.shippingCost.toFixed(2)}</td>
                              <td className={cn("p-4 font-black italic", isApproved ? "text-emerald-600" : "text-gray-400")}>
                                {isApproved ? `R$ ${calc.netProfit.toFixed(2)}` : 'R$ 0.00'}
                              </td>
                              <td className="p-4">
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
                 <h4 className="text-2xl font-black text-black">{productFinancialStats.averageMargin.toFixed(1)}%</h4>
              </div>
           </div>

           <div className="bg-white border">
              <div className="p-5 border-b border-black/[0.06] flex items-center justify-between font-bold text-xs uppercase bg-gray-50/50">
                 <span>Catálogo Ativo & Variáveis Financeiras</span>
                 <span className="text-[9px] text-gray-400 tracking-wider">Apenas as mudanças salvas em atualizar impactam o site real-time</span>
              </div>

              {productFinancialStats.list.length === 0 ? (
                <div className="p-20 text-center text-xs font-bold uppercase tracking-widest text-gray-400">Carregando catálogo...</div>
              ) : (
                <div className="overflow-x-auto">
                   <table className="w-full text-left text-xs border-collapse">
                      <thead>
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
                      <tbody>
                        {productFinancialStats.list.map(prod => {
                          return (
                            <ProductRow key={prod.id} prod={prod} onUpdate={handleUpdateProductCost} />
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
                   <div className="overflow-x-auto max-h-[440px] scrollbar-thin">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-black/10 bg-gray-100 text-[8px] uppercase tracking-widest text-gray-400 font-black">
                            <th className="p-4">Descrição</th>
                            <th className="p-4">Tipo</th>
                            <th className="p-4">Categoria</th>
                            <th className="p-4">Data Registro</th>
                            <th className="p-4">Valor (R$)</th>
                            <th className="p-4 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cashflow.map(cf => (
                            <tr key={cf.id} className="border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase">
                              <td className="p-4 font-extrabold text-black text-xs">{cf.description}</td>
                              <td className="p-4">
                                <span className={cn(
                                  "px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border font-sans",
                                  cf.type === 'in' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-rose-700 border-red-100"
                                )}>
                                  {cf.type === 'in' ? 'Entrada (+)' : 'Saída (-)'}
                                </span>
                              </td>
                              <td className="p-4"><span className="bg-black/5 text-[9px] px-2 py-0.5 font-bold">{cf.category}</span></td>
                              <td className="p-4 text-xs font-bold text-gray-500">{new Date(cf.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                              <td className={cn("p-4 font-black italic", cf.type === 'in' ? "text-emerald-600" : "text-[#121212]")}>
                                {cf.type === 'in' ? '+' : '-'} R$ {Number(cf.amount || 0).toFixed(2)}
                              </td>
                              <td className="p-4 text-center">
                                <button onClick={() => handleDeleteDoc('financial_cashflow', cf.id)} className="text-red-500 hover:text-black hover:bg-red-50 p-2 border border-transparent hover:border-red-100 transition-all rounded-sm">
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
                   <div className="overflow-x-auto max-h-[440px] scrollbar-thin">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
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
                        <tbody>
                          {trafficStats.campaigns.map(camp => (
                            <tr key={camp.id} className="border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase">
                              <td className="p-4 font-extrabold text-black text-xs">{camp.campaignName}</td>
                              <td className="p-4 font-black">R$ {Number(camp.amountSpent || 0).toFixed(2)}</td>
                              <td className="p-4 text-center">{camp.clicks || 0}</td>
                              <td className="p-4 text-center font-extrabold text-[#eab308]">{camp.conversions || 0}</td>
                              <td className="p-4 text-center font-black">{camp.roas.toFixed(1)}x</td>
                              <td className={cn("p-4 text-center font-extrabold", camp.lucro >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                R$ {camp.lucro.toFixed(2)}
                              </td>
                              <td className="p-4 text-center">
                                <button onClick={() => handleDeleteDoc('financial_traffic', camp.id)} className="text-red-500 hover:text-black hover:bg-red-50 p-2 border border-transparent hover:border-red-100 transition-all rounded-sm">
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
          SUBTAB 7: INTEGRE COM GOOGLE SHEETS (FREE COPTY-PASTECODE)
         ---------------------------------------------------- */}
      {activeSubTab === 'sheets' && (
        <div className="space-y-10 animate-in fade-in duration-300">
           
           <div className="bg-white p-8 border space-y-4">
              <div className="flex items-center gap-3">
                 <FileSpreadsheet className="text-[#eab308]" size={24} />
                 <h3 className="text-xl font-black uppercase italic">Como Integrar de Graça com o Google Sheets</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed font-bold uppercase tracking-widest max-w-4xl">
                 Com o Google Apps Script (100% gratuito), você pode fazer sua Planilha Google Sheets receber suas vendas, estoque e investimentos diretamente do site em tempo real via Webhook, sem precisar automatizar com n8n pago, Make ou Zapier! Siga as etapas abaixo.
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
                      <span className="text-black font-extrabold">Cole Aqui e Rode o Sync Inicial</span>: Cole essa URL no painel abaixo e clique em Sincronizar Agora! Suas abas serão populadas na planilha do Google na mesma hora de graça.
                   </li>
                 </ol>

                 {/* Sync Form simulator */}
                 <div className="pt-6 border-t border-black/5 space-y-4">
                     <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308]">Link do Webhook de Automação do Sheets</span>
                     <div className="flex gap-2">
                        <input 
                          type="url" 
                          value={sheetWebhookUrl} 
                          onChange={e => setSheetWebhookUrl(e.target.value)} 
                          placeholder="https://script.google.com/macros/s/.../exec" 
                          className="flex-1 bg-[#fcfcfc] border border-black/10 px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#eab308]"
                        />
                        <button 
                          onClick={handleGoogleSheetsSync}
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
                        navigator.clipboard.writeText(APPS_SCRIPT_PROMPT);
                        toast.success("Código Copiado com sucesso!");
                      }}
                      className="text-white hover:text-[#eab308] text-[9px] font-black uppercase border border-white/20 hover:border-[#eab308] px-3 py-1.5 transition-all"
                    >
                      Copiar Código
                    </button>
                 </div>
                 
                 <div className="flex-grow overflow-y-auto text-xs leading-relaxed max-h-[480px] scrollbar-thin text-white/90">
                    <pre className="text-[10px] whitespace-pre font-mono p-2 bg-white/5">{APPS_SCRIPT_PROMPT}</pre>
                 </div>
              </div>

           </div>
        </div>
      )}

    </div>
  );
}

// Sub-component wrapper for elegant product metrics configuration
interface ProductRowProps {
  key?: any;
  prod: any;
  onUpdate: (id: string, costVal: number, priceVal: number) => Promise<void>;
}

function ProductRow({ prod, onUpdate }: ProductRowProps) {
  const [costInput, setCostInput] = useState(prod.cost || prod.costPrice || 0);
  const [priceInput, setPriceInput] = useState(prod.price || 0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCostInput(prod.cost || prod.costPrice || 0);
    setPriceInput(prod.price || 0);
  }, [prod]);

  const unitProfitVal = priceInput - costInput;
  const marginUnitPercent = priceInput > 0 ? (unitProfitVal / priceInput) * 100 : 0;

  const handleLocalSave = async () => {
    setIsSaving(true);
    await onUpdate(prod.id, Number(costInput), Number(priceInput));
    setIsSaving(false);
  };

  return (
    <tr className="border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase">
      <td className="p-4">
        <div className="font-extrabold text-black text-xs">{prod.name}</div>
        <div className="text-[8.5px] text-gray-400 font-black tracking-widest mt-0.5">SKU: {prod.slug}</div>
      </td>
      <td className="p-4 font-bold text-gray-600">{prod.stock || 0}</td>
      
      {/* Dynamic Price Venda Input */}
      <td className="p-4">
         <div className="flex items-center gap-1 max-w-[110px] bg-gray-50/50 p-1.5 border border-black/5">
            <span className="text-[9px] font-black text-black/30">R$</span>
            <input 
              type="number" 
              step="0.1" 
              value={priceInput}
              onChange={e => setPriceInput(parseFloat(e.target.value) || 0)}
              className="w-full bg-transparent font-black text-black focus:outline-none placeholder-gray-300" 
            />
         </div>
      </td>

      {/* Dynamic Cost Input */}
      <td className="p-4">
         <div className="flex items-center gap-1 max-w-[110px] bg-gray-50/50 p-1.5 border border-black/5">
            <span className="text-[9px] font-black text-black/30">R$</span>
            <input 
              type="number" 
              step="0.1" 
              value={costInput}
              onChange={e => setCostInput(parseFloat(e.target.value) || 0)}
              className="w-full bg-transparent font-bold text-gray-650 focus:outline-none placeholder-gray-300" 
            />
         </div>
      </td>

      <td className="p-4 font-black text-black italic">R$ {unitProfitVal.toFixed(2)}</td>
      <td className={cn("p-4 font-black italic", marginUnitPercent > 50 ? "text-emerald-600" : marginUnitPercent > 30 ? "text-amber-500" : "text-rose-600")}>
        {marginUnitPercent.toFixed(1)}%
      </td>
      
      <td className="p-4 text-center font-bold text-gray-750">{prod.soldCount || 0} u</td>
      <td className="p-4 text-center font-black">R$ {Number(prod.totalFaturamento || 0).toFixed(2)}</td>
      
      <td className="p-5 text-right">
         <button 
           onClick={handleLocalSave}
           disabled={isSaving}
           className="bg-black text-[9px] font-black text-white hover:bg-[#eab308] hover:text-black px-4 py-2 uppercase tracking-wider transition-all"
         >
           {isSaving ? '...' : 'Atualizar'}
         </button>
      </td>
    </tr>
  );
}

// Ready copies Apps Script Code string for Google Sheets automated webhook parsing
const APPS_SCRIPT_PROMPT = `
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

function getOrCreateSheet(spreadsheet, name) {
  var activeSheet = spreadsheet.getSheetByName(name);
  if (!activeSheet) {
    activeSheet = spreadsheet.insertSheet(name);
  }
  return activeSheet;
}
`;

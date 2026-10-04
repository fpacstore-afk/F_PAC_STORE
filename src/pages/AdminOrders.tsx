import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgePercent, BarChart3, BellRing, Boxes, CheckCircle, ChevronDown, ChevronUp, ClipboardCheck, ClipboardList, Eye, EyeOff, Factory, FileSpreadsheet, Images, Layers, LayoutDashboard, Loader2, Mail, MessageCircle, Package, Plus, Radio, RefreshCw, Search, Sparkles, Trash2, Truck, Users, WalletCards, Warehouse, XCircle } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { OrderFinancialDrawer } from '../components/admin/financial/OrderFinancialDrawer';
import { ManualProductPicker } from '../components/admin/ManualProductPicker';
import { ManualCustomProductForm } from '../components/admin/ManualCustomProductForm';
import { ManualStampPicker, stampImage, StampThumb } from '../components/admin/ManualStampPicker';
import { AbandonedCartsRecovery } from '../components/admin/orders/AbandonedCartsRecovery';
import { OrderProductionDrawer } from '../components/OrderProductionDrawer';
import { PrimeOrderPlacements } from '../components/PrimeOrderPlacements';
import { roundMoney, roundPercent } from '../config/financialDefaults';
import { getStageFromStatus, PRODUCTION_STAGES } from '../constants/productionStages';
import { useAuth } from '../context/AuthContext';
import { FinancialPrivacyProvider, FinancialPrivacyToggle, useFinancialPrivacy } from '../context/FinancialPrivacyContext';
import { products as staticProducts } from '../data/products';
import { useInventory } from '../hooks/useInventory';
import { mergeProductsWithPrivateCosts, usePrivateProductCosts } from '../hooks/usePrivateProductCosts';
import { authenticatedFetch, parseApiJson } from '../lib/api';
import { db } from '../lib/firebase';
import { manualProductIdentity } from '../lib/manualProductIdentity';
import { isPrivateManualArtworkUrl } from '../lib/manualCustomOrder';
import { isJoinvilleCEP } from '../lib/shipping';
import { cn } from '../lib/utils';
import { resolveProductStampRecipe, resolveProductStampRecipeEntries } from '../../shared/productStampRecipe';
import { isValidCNPJ, isValidCPF } from '../lib/validation';
import {
executeOrderMaintenance,
fetchOrderMaintenancePreview,
OrderMaintenancePreview,
updateOrderStatusInDb,
updateProductionStatus
} from '../services/orders/orderService';
import {
getAdminLifecycleStatus,
getAdminProductionStage,
getAdminShippingStatus,
isAdminOrderCancelled,
isAdminOrderCompleted,
isAdminOrderDelivered,
isAdminOrderInProduction,
isAdminOrderPaid,
isAdminOrderShipped,
isAdminPaymentPending,
matchesAdminStatusFilter
} from '../utils/adminOrderStatus';
import {
deriveManualOrderOperationalState,
getManualOrderInitialPayment,
type ManualOrderOperationalStage
} from '../utils/manualOrderState';
import {
calculateOrderProfitability,
calculateProductProfitability,
getOrderPaidAmount as getCanonicalPaid,
getOrderCogs,
getOrderGatewayFee,
getOrderPendingAmount,
getOrderShippingFinances,
getPaymentBadgeType
} from '../utils/orderFinancial';
function lazyWithRetry<T>(importFunc: () => Promise<T>): React.LazyExoticComponent<React.ComponentType<any>> {
  return React.lazy(async () => {
    let attempts = 0;
    while (attempts < 3) {
      try {
        attempts++;
        const res = await importFunc();
        return res as any;
      } catch (error: any) {
        console.warn(`Admin module lazy load attempt ${attempts} failed:`, error);
        if (attempts >= 3) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    throw new Error("Failed to load admin module after retries");
  });
}

const AdminIntelligenceCRM = lazyWithRetry(() => import('../components/AdminIntelligenceCRM'));
const AdminFinancial = lazyWithRetry(() => import('../components/AdminFinancial').then(m => ({ default: m.AdminFinancial })));
const AdminPromotions = lazyWithRetry(() => import('../components/AdminPromotions').then(m => ({ default: m.AdminPromotions })));
const AdminStockCenter = lazyWithRetry(() => import('../components/AdminStockCenter').then(m => ({ default: m.AdminStockCenter })));
const InventoryAuditCenter = lazyWithRetry(() => import('../components/InventoryAuditCenter').then(m => ({ default: m.InventoryAuditCenter })));
const AdminStampsManager = lazyWithRetry(() => import('../components/admin/AdminStampsManager').then(m => ({ default: m.AdminStampsManager })));
const AdminLoyaltyManager = lazyWithRetry(() => import('../components/AdminLoyaltyManager'));
const AdminMusic = lazyWithRetry(() => import('../components/AdminMusic').then(m => ({ default: m.AdminMusic })));
const AdminCustomerIdentity = lazyWithRetry(() => import('../components/AdminCustomerIdentity').then(m => ({ default: m.AdminCustomerIdentity })));
const AdminSiteMediaManager = lazyWithRetry(() => import('../components/admin/AdminSiteMediaManager').then(m => ({ default: m.AdminSiteMediaManager })));
const ProductionNotificationsAdmin = lazyWithRetry(() => import('../components/ProductionNotificationsAdmin').then(m => ({ default: m.ProductionNotificationsAdmin })));
const AdminProductionCenter = lazyWithRetry(() => import('../components/admin/production/AdminProductionCenter').then(m => ({ default: m.AdminProductionCenter })));
const AdminShippingCenter = lazyWithRetry(() => import('../components/admin/shipping/AdminShippingCenter').then(m => ({ default: m.AdminShippingCenter })));
const ManagementDashboard = lazyWithRetry(() => import('../components/management/ManagementDashboard'));


type ManagementTab =
  | 'dashboard'
  | 'catalog'
  | 'orders'
  | 'production'
  | 'shipping'
  | 'receivables'
  | 'stock_center'
  | 'inventory_audit'
  | 'identity'
  | 'customer_identity'
  | 'intelligence'
  | 'notifications'
  | 'promotions'
  | 'financial'
  | 'loyalty'
  | 'music';

const MANAGEMENT_TABS: Array<{ id: ManagementTab; label: string; icon: React.ElementType }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'catalog', label: 'Catálogo', icon: Boxes },
  { id: 'orders', label: 'Pedidos', icon: ClipboardList },
  { id: 'production', label: 'Produção', icon: Factory },
  { id: 'shipping', label: 'Expedição', icon: Truck },
  { id: 'stock_center', label: 'Estoque', icon: Warehouse },
  { id: 'inventory_audit', label: 'Inventário', icon: ClipboardCheck },
  { id: 'financial', label: 'Financeiro', icon: WalletCards },
  { id: 'customer_identity', label: 'Clientes', icon: Users },
  { id: 'promotions', label: 'Promoções', icon: BadgePercent },
  { id: 'loyalty', label: 'Fidelidade', icon: Sparkles },
  { id: 'identity', label: 'Site & mídia', icon: Images },
  { id: 'music', label: 'Rádio', icon: Radio },
  { id: 'intelligence', label: 'Inteligência & CRM', icon: BarChart3 },
  { id: 'notifications', label: 'Notificações', icon: BellRing },
];

const normalizeManagementTab = (value: string | null): ManagementTab | null => {
  if (value === 'stamps') return 'catalog';
  if (value === 'analytics' || value === 'automations') return 'intelligence';
  return MANAGEMENT_TABS.some(tab => tab.id === value) || value === 'receivables'
    ? value as ManagementTab
    : null;
};

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  customerEmail?: string;
  address: any; // Can be string or object
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  items: any[];
  subtotal: number;
  shipping: number;
  couponDiscount?: number;
  pixDiscount?: number;
  flashSaleDiscount?: number;
  total: number;
  amountPaid?: number;
  balanceDue?: number;
  paymentLogs?: any[];
  paymentMethod: string;
  gateway?: string;
  status: string; // legado: fallback de compatibilidade; não usar como domínio único
  productionStatus?: string;
  paymentStatus?: string;
  shippingStatus?: string;
  historyLogs?: any[];
  createdAt: any;
  updatedAt?: any;
  deliveredAt?: any;
  paymentLink?: string;
  observations?: string;
  deliveryDate?: string;
  isManual?: boolean;
  origin?: string;
  frete?: number;
  stockControl?: any;
  paymentMethodId?: string;
  shippingServiceId?: any;
  whatsappMessages?: {
    pedidoCriado?: boolean;
    [key: string]: any;
  };
  whatsappLogs?: any[];
}

function AdminOrdersInner() {
  const { formatMoney, formatPercent, maskFinancial, showFinancialValues } = useFinancialPrivacy();
  const { user, loading: authLoading, loginWithGoogle, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersError, setOrdersError] = useState(false);
  const [rawDynamicProducts, setRawDynamicProducts] = useState<any[]>([]);
  const { costsByProductId } = usePrivateProductCosts();
  const dynamicProducts = useMemo(
    () => mergeProductsWithPrivateCosts(rawDynamicProducts, costsByProductId),
    [rawDynamicProducts, costsByProductId]
  );
  const [catalogStamps, setCatalogStamps] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'moved' | 'not_moved'>('all');
  const [activeTab, setActiveTab] = useState<ManagementTab>(() => {
    return normalizeManagementTab(searchParams.get('tab')) || 'dashboard';
  });
  const [selectedOrderForFinancialDrawer, setSelectedOrderForFinancialDrawer] = useState<any | null>(null);
  // IDs in this set are local exceptions to the global eye state.
  // Whenever the global control is used, the exceptions are cleared so it
  // deterministically applies to every order and management module.
  const [toggledOrderValueIds, setToggledOrderValueIds] = useState<Set<string>>(() => new Set());

  const isOrderValueVisible = useCallback((orderId: string) => (
    toggledOrderValueIds.has(orderId) ? !showFinancialValues : showFinancialValues
  ), [showFinancialValues, toggledOrderValueIds]);

  const formatOrderCardMoney = useCallback((orderId: string, value: number | string | null | undefined) => {
    if (!isOrderValueVisible(orderId)) return 'R$ ••••••';
    const amount = typeof value === 'number' ? value : Number(String(value ?? 0).replace(',', '.'));
    return `R$ ${(Number.isFinite(amount) ? amount : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [isOrderValueVisible]);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    const normalizedTab = normalizeManagementTab(requestedTab);
    if (normalizedTab && normalizedTab !== requestedTab) {
      setActiveTab(normalizedTab);
      setSearchParams({ tab: normalizedTab }, { replace: true });
      return;
    }
    if (normalizedTab) {
      setActiveTab(normalizedTab);
    }
  }, [searchParams]);

  const selectManagementTab = useCallback((tab: ManagementTab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash.includes('tab=notifications')) {
        setActiveTab('notifications');
        setSearchParams({ tab: 'notifications' }, { replace: true });
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [setSearchParams]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // --- MANUAL ORDER SYSTEM ---
  const [orderSubView, setOrderSubView] = useState<'list' | 'reports' | 'logs'>('list');
  const [orderListView, setOrderListView] = useState<'active' | 'completed'>('active');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualOrderKind, setManualOrderKind] = useState<'sale' | 'gift'>('sale');
  const [isOrderMaintenanceOpen, setIsOrderMaintenanceOpen] = useState(false);
  const [orderMaintenancePreview, setOrderMaintenancePreview] = useState<OrderMaintenancePreview | null>(null);
  const [isOrderMaintenanceLoading, setIsOrderMaintenanceLoading] = useState(false);
  const [isOrderMaintenanceExecuting, setIsOrderMaintenanceExecuting] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Melhor Envio Config modal states
  const [isMelhorEnvioModalOpen, setIsMelhorEnvioModalOpen] = useState(false);
  const [meToken, setMeToken] = useState('');
  const [meBaseUrl, setMeBaseUrl] = useState('https://melhorenvio.com.br');
  const [meHasToken, setMeHasToken] = useState(false);
  const [meMaskedToken, setMeMaskedToken] = useState('');
  const [meTokenVisible, setMeTokenVisible] = useState(false);
  const [meConfigSaving, setMeConfigSaving] = useState(false);

  const fetchMelhorEnvioConfig = useCallback(async () => {
    try {
      const r = await authenticatedFetch('/api/shipping/config');
      const d = await parseApiJson<any>(r);
      if (!r.ok) throw new Error(d?.message || d?.error || `Falha ao consultar o Melhor Envio (HTTP ${r.status}).`);
      if (d) {
        setMeHasToken(Boolean(d.hasToken));
        setMeMaskedToken(d.maskedToken || '');
        setMeBaseUrl(d.baseUrl || 'https://melhorenvio.com.br');
      }
    } catch (e: any) {
      setMeHasToken(false);
      console.error('Erro ao buscar config do Melhor Envio:', e);
      toast.error(e?.message || 'Não foi possível consultar a integração do Melhor Envio.');
    }
  }, []);

  const openOrderMaintenance = async () => {
    setIsOrderMaintenanceOpen(true);
    setIsOrderMaintenanceLoading(true);
    setOrderMaintenancePreview(null);
    try {
      setOrderMaintenancePreview(await fetchOrderMaintenancePreview());
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível conferir os pedidos.');
      setIsOrderMaintenanceOpen(false);
    } finally {
      setIsOrderMaintenanceLoading(false);
    }
  };

  const runOrderMaintenance = async () => {
    if (!orderMaintenancePreview) return;
    setIsOrderMaintenanceExecuting(true);
    try {
      const result = await executeOrderMaintenance(orderMaintenancePreview.previewHash);
      toast.success(`${result.realOrdersToFinalize} pedidos finalizados e ${result.testOrders} testes excluídos.`);
      setIsOrderMaintenanceOpen(false);
      setOrderMaintenancePreview(null);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível executar o encerramento.');
      try {
        setOrderMaintenancePreview(await fetchOrderMaintenancePreview());
      } catch {
        // A mensagem principal já foi apresentada; a prévia pode ser reaberta depois.
      }
    } finally {
      setIsOrderMaintenanceExecuting(false);
    }
  };

  const handleSaveMelhorEnvioConfig = async () => {
    if (!meHasToken && !meToken.trim()) {
      toast.error('Cole o token do Melhor Envio antes de salvar.');
      return;
    }
    setMeConfigSaving(true);
    const toastId = toast.loading('Salvando configuração...');
    try {
      const r = await authenticatedFetch('/api/shipping/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: meBaseUrl,
          token: meToken.trim() || undefined
        })
      });
      const d = await parseApiJson<any>(r);
      if (!r.ok) throw new Error(d?.message || d?.error || `Falha ao salvar (HTTP ${r.status}).`);
      if (d.success) {
        toast.success(d.message || 'Integração do Melhor Envio ativada!', { id: toastId });
        setMeToken('');
        setMeTokenVisible(false);
        setIsMelhorEnvioModalOpen(false);
        await fetchMelhorEnvioConfig();
      } else {
        throw new Error(d.error || 'Erro ao salvar');
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`, { id: toastId });
    } finally {
      setMeConfigSaving(false);
    }
  };

  // Form customer fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custPhone2, setCustPhone2] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custCep, setCustCep] = useState('');
  const [isRetirada, setIsRetirada] = useState(false);
  const [custAddress, setCustAddress] = useState('');
  const [custNumber, setCustNumber] = useState('');
  const [custComplement, setCustComplement] = useState('');
  const [custNeighborhood, setCustNeighborhood] = useState('');

  // Validation and Correction Modal States for Melhor Envio Destinatario
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [meCpfWarning, setMeCpfWarning] = useState(false);
  const [validationOrder, setValidationOrder] = useState<any>(null);
  const [valName, setValName] = useState('');
  const [valPhone, setValPhone] = useState('');
  const [valEmail, setValEmail] = useState('');
  const [valCpf, setValCpf] = useState('');
  const [valCep, setValCep] = useState('');
  const [valStreet, setValStreet] = useState('');
  const [valNumber, setValNumber] = useState('');
  const [valComplement, setValComplement] = useState('');
  const [valNeighborhood, setValNeighborhood] = useState('');
  const [valCity, setValCity] = useState('');
  const [valState, setValState] = useState('');
  const [custCity, setCustCity] = useState('');
  const [custState, setCustState] = useState('');

  // Form item selection
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [manualShowAmounts, setManualShowAmounts] = useState(false);
  const formatManualMoney = (value: number) => manualShowAmounts ? formatMoney(value, { forceShow: true }) : 'R$ ••••••';
  useEffect(() => { if (!isManualModalOpen) setManualShowAmounts(false); }, [isManualModalOpen]);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [manualProductMode, setManualProductMode] = useState<'ready' | 'assembled' | 'custom'>('ready');
  const [selectedStampIds, setSelectedStampIds] = useState<string[]>([]);
  const [selectedStampSizes, setSelectedStampSizes] = useState<Record<string, string>>({});
  const updateSelectedManualStamps = (ids: string[]) => {
    setSelectedStampIds(ids);
    setSelectedStampSizes(current => Object.fromEntries(ids.map(id => {
      const stamp = catalogStamps.find(item => item.id === id);
      const sizes = Array.isArray(stamp?.availableSizes) ? stamp.availableSizes : [];
      const existing = current[id] || '';
      const matched = sizes.find((size: string) => size === existing);
      return [id, matched || (sizes.length === 1 ? sizes[0] : '')];
    })));
  };
  const [itemQty, setItemQty] = useState(1);
  const [itemPrice, setItemPrice] = useState(0);
  const [tempItems, setTempItems] = useState<any[]>([]);
  const hasCustomManualItems = tempItems.some((item) => item.mode === 'custom');
  const hasCatalogManualItems = tempItems.some((item) => item.mode !== 'custom');

  // Form order meta
  const [orderOrigin, setOrderOrigin] = useState('WhatsApp');
  const [paymentMethodForm, setPaymentMethodForm] = useState('PIX');
  const [manualOrderStatus, setManualOrderStatus] = useState<ManualOrderOperationalStage>('received');
  const [manualOrderPaid, setManualOrderPaid] = useState(false);
  const [manualOrderPaidAmount, setManualOrderPaidAmount] = useState(0);
  const [manualInstallmentCount, setManualInstallmentCount] = useState(1);
  const [manualFirstDueDate, setManualFirstDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualOrderObs, setManualOrderObs] = useState('');
  const [manualOrderDeliveryDate, setManualOrderDeliveryDate] = useState('');
  const [manualOrderDiscount, setManualOrderDiscount] = useState<number | ''>('');
  const [manualOrderShipping, setManualOrderShipping] = useState<number | ''>('');
  const [ignoreStock, setIgnoreStock] = useState(true);
  const [savingManualOrder, setSavingManualOrder] = useState(false);
  const [stockControl, setStockControl] = useState<'move' | 'no_move'>('move');
  
  // Custom manual order shipping properties
  const [manualShippingMethod, setManualShippingMethod] = useState<'Pedido Local' | 'Melhor Envio'>('Pedido Local');
  const [manualShippingMethodName, setManualShippingMethodName] = useState('Entrega Local F PAC');
  const [manualShippingServiceId, setManualShippingServiceId] = useState<number>(0);

  // --- REPORTS FILTER STATES ---
  const [repPeriod, setRepPeriod] = useState<string>('30days');
  const [repProduct, setRepProduct] = useState<string>('all');
  const [repModel, setRepModel] = useState<string>('all');
  const [repChannel, setRepChannel] = useState<string>('all');
  const [repStatus, setRepStatus] = useState<string>('paid');

  // --- BI / INDUSTRIAL INTELLIGENCE REPORTS REAL-TIME PLACEHOLDER REMOVED ---

  // CEP Lookup
  const handleCEPLookup = async (cep: string) => {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length === 8) {
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
        const data = await resp.json();
        if (!data.erro) {
          setCustAddress(data.logradouro || '');
          setCustNeighborhood(data.bairro || '');
          const cityVal = data.localidade || '';
          setCustCity(cityVal);
          setCustState(data.uf || '');

          const isLocal = isJoinvilleCEP(cleaned) || cityVal.toLowerCase().trim() === 'joinville';
          if (isLocal) {
            setManualShippingMethod('Pedido Local');
            setManualShippingMethodName('Entrega Local F PAC');
            setManualShippingServiceId(0);
            setManualOrderShipping(11.40);
            toast.success("CEP detectado em Joinville! Configurado para TRILHA LOCAL (Entrega Local).");
          } else {
            setManualShippingMethod('Melhor Envio');
            setManualShippingMethodName('Correios SEDEX');
            setManualShippingServiceId(2);
            setManualOrderShipping(24.90);
            toast.success("CEP fora de Joinville! Configurado para TRILHA NACIONAL (Melhor Envio).");
          }
        }
      } catch (err) {
        console.warn("Failed to lookup CEP:", err);
      }
    }
  };

  // Add audit log helper
  const addAuditLog = async (actionDesc: string, itemsDetailsStr: string) => {
    try {
      const logData = {
        date: new Date().toISOString(),
        user: user?.email || 'admin@fpacstore.com.br',
        action: actionDesc,
        details: itemsDetailsStr,
        createdAt: new Date()
      };
      await setDoc(doc(collection(db, 'audit_logs')), logData);
    } catch (err) {
      console.warn("Failed to save audit log:", err);
    }
  };

  // Fetch audit logs in real-time
  useEffect(() => {
    if (user && activeTab === 'orders' && orderSubView === 'logs') {
      const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAuditLogs(logsData);
      });
      return () => unsubscribe();
    }
  }, [user, activeTab, orderSubView]);

  // Adjustments to itemQty based on selected product available stock
  const getSelectedVariantStock = () => {
    if (!selectedProduct) return 0;
    const invItem = inventory[selectedProduct.parentSlug] || inventory[selectedProduct.slug] || inventory[selectedProduct.id];
    if (!invItem) return 0;
    
    const productHasColors = !!(selectedProduct.colors && selectedProduct.colors.length > 0);
    const variantKey = productHasColors ? `${selectedColor}_${selectedSize}` : selectedSize;
    
    const variant = invItem.variants?.[variantKey] as any;
    const qty = variant?.availableQuantity ?? variant?.availableStock ?? variant?.stock ?? invItem.availableQuantity ?? (invItem as any).availableStock ?? invItem.stock ?? 0;
    return Number(qty) || 0;
  };

  const { inventory } = useInventory({ administrative: true, enabled: activeTab === 'orders' });

  const [hasBypass, setHasBypass] = useState(() => import.meta.env.DEV && localStorage.getItem('admin_bypass') === 'true');
  
  useEffect(() => {
    if (!import.meta.env.DEV) {
      if (localStorage.getItem('admin_bypass')) {
        localStorage.removeItem('admin_bypass');
      }
      setHasBypass(false);
    }
  }, []);

  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br' || hasBypass;

  useEffect(() => {
    if (authLoading || !user || !isAdmin || activeTab !== 'orders') return;
    void fetchMelhorEnvioConfig();
  }, [activeTab, authLoading, user, isAdmin, fetchMelhorEnvioConfig]);

  const needsOrderSubscription = ['orders', 'production', 'shipping', 'loyalty'].includes(activeTab);
  useEffect(() => {
    // Other management modules own their queries; do not duplicate them here.
    if (!isAdmin || !needsOrderSubscription) return;
    setOrdersLoaded(false);
    setOrdersError(false);

    // Listen to orders
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(ordersData);
      setOrdersError(false);
      setOrdersLoaded(true);
    }, (error) => {
      setOrdersError(true);
      setOrdersLoaded(false);
      console.error("Erro ao escutar pedidos:", error);
    });

    return unsubscribeOrders;
  }, [isAdmin, needsOrderSubscription]);

  useEffect(() => {
    if (!isAdmin || activeTab !== 'orders') return;
    // Product and stamp data support manual orders and historical corrections.
    const qProducts = collection(db, 'products');
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      const pData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort in memory to avoid index requirement and handle missing fields
      const sortedPData = [...pData].sort((a: any, b: any) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      });
      
      setRawDynamicProducts(sortedPData);

    }, (error) => {
      console.error("Erro ao escutar produtos:", error);
    });

    // Inclui ativas e indisponíveis: pedidos manuais e correções históricas
    // precisam preservar a arte que foi efetivamente escolhida.
    const unsubscribeCatalogStamps = onSnapshot(collection(db, 'designs'), (snapshot) => {
      setCatalogStamps(snapshot.docs.map((stampDoc) => ({ id: stampDoc.id, ...stampDoc.data() })));
    }, (error) => console.error('Erro ao escutar catálogo de estampas:', error));

    return () => {
      unsubscribeProducts();
      unsubscribeCatalogStamps();
    };
  }, [isAdmin, activeTab]);

  // Merge static and dynamic products to ensure all products are visible with their latest updates
  const baseProducts = staticProducts.map(staticP => {
    const dynamicP = dynamicProducts.find(p => p.id === staticP.id || p.slug === staticP.slug);
    return dynamicP ? { ...staticP, ...dynamicP } : staticP;
  });
  
  // Also add any dynamic products that don't exist in static (if any)
  const extraProducts = dynamicProducts.filter(dynamicP => 
    !staticProducts.find(sp => sp.id === dynamicP.id || sp.slug === dynamicP.slug)
  );

  const currentProducts = [...baseProducts, ...extraProducts].filter(p => {
    const name = String(p.name || '').toUpperCase();
    const slug = String(p.slug || '').toUpperCase();
    const isTest = 
      name.includes('TESTE') || 
      slug.includes('TESTE') ||
      name.includes('TEST') || 
      slug.includes('TEST') ||
      name === 'PRODUTO TESTE PAGAMENTO' ||
      slug === 'PRODUTO-TESTE-PAGAMENTO' ||
      name.includes('PAGAMENTO TESTE') ||
      slug.includes('PAGAMENTO-TESTE') ||
      slug === 'TESTE-CHECKOUT' ||
      name === 'TESTE CHECKOUT' ||
      slug === 'MARK-PRIME-TEST';

    return p.name && p.name.trim() !== '' && !isTest;
  });
  const isPlainManualProduct = (product: any) => product.productFinish === 'plain' || /\b(lisa|liso|base|sem estampa)\b/i.test(`${product.name || ''} ${(product.tags || []).join(' ')}`);
  const readyManualProducts = currentProducts.filter(product => !isPlainManualProduct(product) && !['draft', 'archived', 'inactive'].includes(product.status))
    .map(product => ({ ...product, stampNames: (product.stampIds || []).map(id => catalogStamps.find(stamp => stamp.id === id)?.name).filter(Boolean) }));
  const assembledManualProducts = currentProducts.filter(product => isPlainManualProduct(product) && !['archived', 'inactive'].includes(product.status));

  // --- BI / INDUSTRIAL INTELLIGENCE REPORTS REAL-TIME useMemo ---
  const reportData = useMemo(() => {
    let filtered = [...orders];

    // 1. Filter by Paid / Approved statuses
    if (repStatus === 'paid') {
      filtered = filtered.filter(o => isAdminOrderPaid(o));
    } else if (repStatus === 'pending') {
      filtered = filtered.filter(o => isAdminPaymentPending(o));
    } else if (repStatus === 'cancelled') {
      filtered = filtered.filter(o => isAdminOrderCancelled(o));
    }

    // 2. Filter by Channel / Origin
    if (repChannel !== 'all') {
      filtered = filtered.filter(o => {
        const origin = o.isManual ? (o.origin || 'Outro') : 'Site';
        return origin.toLowerCase() === repChannel.toLowerCase();
      });
    }

    // 3. Filter by Period / Date Range
    const now = new Date();
    filtered = filtered.filter(o => {
      const oDate = o.createdAt?.toMillis ? new Date(o.createdAt.toMillis()) : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || now));
      const diffMs = now.getTime() - oDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (repPeriod === 'today') {
        return oDate.toDateString() === now.toDateString();
      } else if (repPeriod === '7days') {
        return diffDays <= 7;
      } else if (repPeriod === '30days') {
        return diffDays <= 30;
      } else if (repPeriod === 'thisMonth') {
        return oDate.getMonth() === now.getMonth() && oDate.getFullYear() === now.getFullYear();
      } else if (repPeriod === 'lastMonth') {
        const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return oDate.getMonth() === prevMonth && oDate.getFullYear() === prevYear;
      }
      return true; // 'all'
    });

    const paidFilteredOrders = filtered.filter(o => isAdminOrderPaid(o));

    // Canonical Product Profitability ranking for filtered paid orders
    const rankedProducts = calculateProductProfitability(paidFilteredOrders, currentProducts);

    // Initialize metrics
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalShippingSubsidy = 0;
    let totalGatewayFees = 0;
    let totalContributionMargin = 0;
    const channelSales: Record<string, any> = {};
    const productSales: Record<string, any> = {};

    // Populate productSales map from canonical ranking
    rankedProducts.forEach(rp => {
      if (rp.unitsSold > 0 || rp.totalRevenue > 0) {
        productSales[rp.name] = {
          qty: rp.unitsSold,
          revenue: rp.totalRevenue,
          cogs: rp.totalCogs
        };
      }
    });

    filtered.forEach(o => {
      const orderTotal = Number(o.total) || 0;
      const isPaid = isAdminOrderPaid(o);

      // Accumulate metrics if we match product / model filters
      const items = o.items || [];
      let orderMatchesFilter = false;
      let orderAccumRevenue = 0;
      let orderAccumCogs = 0;

      items.forEach((item: any) => {
        const prId = item.id || '';
        const matchesProduct = repProduct === 'all' || prId === repProduct;
        
        let matchesModel = repModel === 'all';
        if (repModel !== 'all') {
          const descriptionString = String(item.name || '').toLowerCase();
          matchesModel = descriptionString.includes(repModel.toLowerCase());
        }

        if (matchesProduct && matchesModel) {
          orderMatchesFilter = true;
          const qty = Number(item.quantity || item.qty || 1);
          const price = Number(item.price || 0);
          const revenueContrib = price * qty;
          
          const itemCostInfo = getOrderCogs({ items: [item] }, currentProducts);
          const cogsContrib = itemCostInfo.cogs;

          orderAccumRevenue += revenueContrib;
          orderAccumCogs += cogsContrib;
        }
      });

      if (repProduct === 'all' && repModel === 'all') {
        const origin = o.isManual ? (o.origin || 'Outro') : 'Site';
        if (!channelSales[origin]) {
          channelSales[origin] = { total: 0, count: 0 };
        }
        channelSales[origin].count += 1;
        
        if (isPaid) {
          const prof = calculateOrderProfitability(o, currentProducts);
          channelSales[origin].total += prof.grossRevenue;
          totalRevenue += prof.grossRevenue;
          totalCogs += prof.cogs;
          totalGatewayFees += prof.gatewayFees;
          totalShippingSubsidy += prof.shippingSubsidy;
          totalContributionMargin += prof.contributionMargin;
        }
      } else if (orderMatchesFilter) {
        if (isPaid) {
          const origin = o.isManual ? (o.origin || 'Outro') : 'Site';
          if (!channelSales[origin]) {
            channelSales[origin] = { total: 0, count: 0 };
          }
          channelSales[origin].count += 1;
          channelSales[origin].total += orderAccumRevenue;

          const gwInfo = getOrderGatewayFee(o);
          const shipInfo = getOrderShippingFinances(o);
          const ratio = orderTotal > 0 ? Math.min(1, orderAccumRevenue / orderTotal) : 1;
          const segmentGwFee = gwInfo.fee * ratio;
          const segmentShipSubsidy = shipInfo.shippingSubsidy * ratio;

          totalRevenue += orderAccumRevenue;
          totalCogs += orderAccumCogs;
          totalGatewayFees += segmentGwFee;
          totalShippingSubsidy += segmentShipSubsidy;
          totalContributionMargin += (orderAccumRevenue - orderAccumCogs - segmentGwFee - segmentShipSubsidy);
        }
      }
    });

    const gatewayFees = roundMoney(totalGatewayFees);
    const revenue = roundMoney(totalRevenue);
    const cogs = roundMoney(totalCogs);
    const shippingSubsidy = roundMoney(totalShippingSubsidy);
    const contributionMargin = roundMoney(totalContributionMargin);
    const grossProfit = roundMoney(revenue - cogs);
    const netProfit = contributionMargin;
    const marginPercent = revenue > 0 ? roundPercent((contributionMargin / revenue) * 100) : 0;

    // Calculate stock/inventory movement stats dynamically based on filtered list
    const stockMoveOrders = filtered.filter(o => !isAdminOrderCancelled(o) && o.stockControl !== 'no_move');
    const stockNoMoveOrders = filtered.filter(o => !isAdminOrderCancelled(o) && o.stockControl === 'no_move');

    const ordersWithStockMove = stockMoveOrders.length;
    const ordersWithStockMoveRevenue = stockMoveOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

    const ordersWithoutStockMove = stockNoMoveOrders.length;
    const ordersWithoutStockMoveRevenue = stockNoMoveOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

    const totalStockMovedQty = stockMoveOrders.reduce((acc, o) => acc + (o.items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity || item.qty) || 0), 0), 0);
    const totalStockNotMovedQty = stockNoMoveOrders.reduce((acc, o) => acc + (o.items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity || item.qty) || 0), 0), 0);

    return {
      revenue,
      cogs,
      shipping: shippingSubsidy,
      shippingSubsidy,
      gatewayFees,
      grossProfit,
      netProfit,
      contributionMargin,
      marginPercent,
      channelSales,
      productSales,
      rankedProducts,
      ordersWithStockMove,
      ordersWithStockMoveRevenue,
      ordersWithoutStockMove,
      ordersWithoutStockMoveRevenue,
      totalStockMovedQty,
      totalStockNotMovedQty
    };
  }, [orders, repPeriod, repProduct, repModel, repChannel, repStatus, currentProducts]);

  const handleMelhorEnvioLabel = async (order: any, skipValidation: boolean = false) => {
    // Block local orders from generating labels in Melhor Envio
    const isJoinvilleLocal = (order.cep && isJoinvilleCEP(order.cep)) || String(order.city || '').toLowerCase() === 'joinville';
    if (isJoinvilleLocal) {
      toast.error("Pedidos locais (Joinville) utilizam apenas a Trilha Local de entrega própria (Etiqueta A). O envio ao Melhor Envio foi bloqueado para este CEP local.", { duration: 5000 });
      return;
    }

    // Validate required fields for Melhor Envio
    const postalCode = String(order.cep || (order.address as any)?.cep || '').replace(/\D/g, '');
    const document = String(order.customerCpf || order.cpf || '').replace(/\D/g, '');
    const phone = String(order.customerPhone || '').replace(/\D/g, '');
    const street = (order.address && typeof order.address === 'object') ? (order.address as any).street : (order.address || '');
    const number = order.number || (order.address as any)?.number || '';
    const neighborhood = order.neighborhood || (order.address as any)?.neighborhood || '';
    const city = order.city || (order.address as any)?.city || '';
    const state = order.state || (order.address as any)?.state || '';
    const email = order.customerEmail || '';
    const name = order.customerName || '';

    const isInvalid = !skipValidation && (
      postalCode.length !== 8 ||
      document.length < 11 ||
      (!isValidCPF(document) && !isValidCNPJ(document)) ||
      phone.length < 10 ||
      street.trim() === '' ||
      number.trim() === '' ||
      neighborhood.trim() === '' ||
      city.trim() === '' ||
      state.trim().length !== 2 ||
      email.trim() === '' ||
      name.trim() === ''
    );

    if (isInvalid) {
      setValidationOrder(order);
      setValName(name);
      setValPhone(order.customerPhone || '');
      setValEmail(email);
      setValCpf(order.customerCpf || order.cpf || '');
      setValCep(order.cep || (order.address as any)?.cep || '');
      setValStreet(street);
      setValNumber(number);
      setValComplement(order.complement || (order.address as any)?.complement || '');
      setValNeighborhood(neighborhood);
      setValCity(city);
      setValState(state);
      setIsValidationModalOpen(true);
      return;
    }

    const toastId = toast.loading('Gerando etiqueta...');
    try {
      const resp = await authenticatedFetch('/api/shipping/create-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          serviceId: Number(order.shippingServiceId || 2)
        })
      });
      
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.message || data.error || 'Erro ao gerar etiqueta');
      }

      if (data.id) {
        toast.success(data.idempotent ? "Etiqueta já existente carregada!" : "Etiqueta gerada com sucesso no Melhor Envio!", { id: toastId });
        const redirectUrl = data.redirectUrl || data.label?.url ||
          (meBaseUrl.includes('sandbox') 
            ? 'https://sandbox.melhorenvio.com.br/painel/envios/carrinho'
            : 'https://painel.melhorenvio.com.br/envios/carrinho');
        window.open(redirectUrl, '_blank');
      } else {
        throw new Error(data.message || data.error || 'Erro ao gerar etiqueta');
      }
    } catch (e: any) {
      const errStr = String(e.message || '');
      if (errStr.includes('não podem ser iguais') || (errStr.includes('remetente') && errStr.includes('destinatário'))) {
        toast.dismiss(toastId);
        toast.error("O CPF de envio e destino são idênticos! Por favor, ajuste o CPF no painel de correção.");
        
        // Open validation modal with warning banner
        setMeCpfWarning(true);
        setValidationOrder(order);
        setValName(name);
        setValPhone(order.customerPhone || '');
        setValEmail(email);
        setValCpf(order.customerCpf || order.cpf || '');
        setValCep(order.cep || (order.address as any)?.cep || '');
        setValStreet(street);
        setValNumber(number);
        setValComplement(order.complement || (order.address as any)?.complement || '');
        setValNeighborhood(neighborhood);
        setValCity(city);
        setValState(state);
        setIsValidationModalOpen(true);
        return;
      }
      toast.error(`Erro: ${e.message}`, { id: toastId });
      console.error(e);
    }
  };

  const handleSaveAndGenerateLabel = async () => {
    if (!validationOrder) return;
    
    // Validate inputs locally first
    const cleanCep = valCep.replace(/\D/g, '');
    const cleanCpf = valCpf.replace(/\D/g, '');
    const cleanPhone = valPhone.replace(/\D/g, '');
    
    if (!valName.trim()) {
      toast.error('O campo Nome é obrigatório');
      return;
    }
    if (cleanPhone.length < 10) {
      toast.error('Por favor, informe um telefone válido com DDD');
      return;
    }
    if (!valEmail.trim() || !valEmail.includes('@')) {
      toast.error('Por favor, informe um e-mail válido');
      return;
    }
    if (cleanCpf.length < 11 || (!isValidCPF(cleanCpf) && !isValidCNPJ(cleanCpf))) {
      toast.error('Por favor, informe um CPF/CNPJ matematicamente válido');
      return;
    }
    if (cleanCep.length !== 8) {
      toast.error('Por favor, informe um CEP válido com 8 dígitos');
      return;
    }
    if (!valStreet.trim()) {
      toast.error('O campo Endereço/Rua é obrigatório');
      return;
    }
    if (!valNumber.trim()) {
      toast.error('O campo Número é obrigatório');
      return;
    }
    if (!valNeighborhood.trim()) {
      toast.error('O campo Bairro é obrigatório');
      return;
    }
    if (!valCity.trim()) {
      toast.error('O campo Cidade é obrigatório');
      return;
    }
    if (valState.trim().length !== 2) {
      toast.error('Por favor, informe o Estado com 2 letras (UF ex: SC, SP)');
      return;
    }

    const toastId = toast.loading('Salvando dados e gerando etiqueta...');
    try {
      // Update order in Firestore
      const orderRef = doc(db, 'orders', validationOrder.id);
      const updatedData = {
        customerName: valName,
        customerPhone: valPhone,
        customerEmail: valEmail,
        customerCpf: valCpf,
        cep: valCep,
        address: valStreet,
        number: valNumber,
        complement: valComplement,
        neighborhood: valNeighborhood,
        city: valCity,
        state: valState.toUpperCase()
      };
      
      await updateDoc(orderRef, updatedData);
      
      // Update the template state locally so the interface updates
      const updatedOrder = {
        ...validationOrder,
        ...updatedData
      };
      
      setIsValidationModalOpen(false);
      toast.dismiss(toastId);
      
      // Re-trigger label creation with validated data
      await handleMelhorEnvioLabel(updatedOrder, true);
    } catch (e: any) {
      toast.error(`Erro ao salvar dados: ${e.message}`, { id: toastId });
    }
  };

  const handleDownloadLocalLabelPdf = (order: any) => {
    const address = typeof order.address === 'object' ? order.address || {} : {};
    const addressLine = typeof order.address === 'string'
      ? order.address
      : `${address.street || 'Endereço não informado'}, ${order.number || address.number || 'S/N'}`;
    const cityLine = `${order.neighborhood || address.neighborhood || '—'} · ${order.city || address.city || 'Joinville'} / ${order.state || address.state || 'SC'}`;
    const phone = order.customerPhone || order.phone || '—';
    const normalizePdfText = (value: unknown) => String(value ?? '—')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/[()]/g, '\\$&')
      .replace(/[^\x20-\x7E]/g, ' ');
    const splitLine = (value: unknown, limit = 43) => {
      const words = normalizePdfText(value).split(/\s+/);
      const lines: string[] = [];
      let line = '';
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length > limit && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });
      if (line) lines.push(line);
      return lines;
    };
    const items = Array.isArray(order.items) ? order.items : [];
    const commands: string[] = [];
    const text = (x: number, y: number, size: number, value: unknown, bold = false) => {
      commands.push(`BT /F${bold ? 2 : 1} ${size} Tf ${x} ${y} Td (${normalizePdfText(value)}) Tj ET`);
    };
    const section = (y: number, label: string) => {
      commands.push(`0 0 0 rg 14 ${y - 11} 255 13 re f 1 1 1 rg`);
      text(20, y - 8, 7.5, label, true);
      commands.push('0 0 0 rg');
    };
    let y = 405;
    text(76, y, 18, 'F PAC STORE', true);
    y -= 14;
    text(24, y, 6.5, 'REM: RUA PARANAGUAMIRIM, 1395 - JOINVILLE/SC');
    y -= 9;
    text(70, y, 6.5, 'ENTREGA LOCAL - ETIQUETA 10x15');
    y -= 14;
    section(y, 'DESTINATARIO');
    y -= 24;
    splitLine(String(order.customerName || order.customer?.name || 'Cliente').toUpperCase(), 31).slice(0, 2).forEach((line) => {
      text(18, y, 13, line, true);
      y -= 15;
    });
    splitLine(addressLine, 48).slice(0, 2).forEach((line) => {
      text(18, y, 9, line, true);
      y -= 11;
    });
    splitLine(cityLine, 48).slice(0, 2).forEach((line) => {
      text(18, y, 8.5, line);
      y -= 10;
    });
    text(18, y, 8.5, `CEP: ${order.cep || address.cep || '—'}   TEL: ${phone}`, true);
    y -= 17;
    section(y, 'ITENS DO PEDIDO');
    y -= 24;
    items.slice(0, 7).forEach((item: any, index: number) => {
      splitLine(`${item.quantity || 1}x  ${item.name || item.title || `Item ${index + 1}`} - ${item.color || '—'} / ${item.size || '—'}`, 48).slice(0, 2).forEach((line) => {
        text(18, y, 8.5, line, index === 0);
        y -= 10;
      });
    });
    if (order.observations && y > 80) {
      y -= 3;
      section(y, 'OBSERVACOES');
      y -= 24;
      splitLine(order.observations, 48).slice(0, 3).forEach((line) => {
        text(18, y, 8, line);
        y -= 9;
      });
    }
    commands.push('0 0 0 RG 1.5 w 14 14 255 397 re S');
    text(77, 34, 15, `PEDIDO #${order.id}`, true);
    text(68, 23, 7, 'PDF TERMICO 100 x 150 mm - SEM REDUCAO');

    const stream = commands.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 283.46 425.20] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
    ];
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets: number[] = [0];
    objects.forEach((object, index) => {
      offsets.push(new TextEncoder().encode(pdf).length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

    const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Etiqueta-Local-${order.id}-100x150.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success('PDF térmico 10×15 baixado. No app, escolha tamanho real / 100%.');
  };

  const handlePrintLocalLabel = (order: any) => {
    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (!printWindow) {
      toast.error("Permissão de popup bloqueada pelo seu navegador. Por favor, permita popups para poder imprimir etiquetas.");
      return;
    }

    const itemsHtml = (order.items || []).map((it: any) => 
      `<li>[${it.quantity}x] ${it.name} - ${it.color} / ${it.size}</li>`
    ).join('');

    const addressInfo = typeof order.address === 'object' ? {
      street: (order.address as any).street || 'Rua não informada',
      number: order.number || (order.address as any).number || 'S/N',
      complement: order.complement || (order.address as any).complement || '',
      neighborhood: order.neighborhood || (order.address as any).neighborhood || '',
      city: order.city || (order.address as any).city || 'Joinville',
      state: order.state || (order.address as any).state || 'SC',
      cep: order.cep || (order.address as any).cep || ''
    } : {
      street: order.address || 'Endereço não informado',
      number: order.number || 'S/N',
      complement: order.complement || '',
      neighborhood: order.neighborhood || '',
      city: order.city || 'Joinville',
      state: order.state || 'SC',
      cep: order.cep || ''
    };

    printWindow.document.write(`
      <html>
        <head>
          <title>Etiqueta Local - #${order.id}</title>
          <style>
            @page {
              size: 100mm 150mm;
              margin: 0;
            }
            html, body {
              width: 100mm;
              height: 150mm;
              overflow: hidden;
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 6mm;
              box-sizing: border-box;
              background: white;
              color: black;
              width: 100mm;
              height: 150mm;
            }
            .container {
              border: 3px solid black;
              padding: 6px;
              height: 100%;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border-radius: 4px;
            }
            .header {
              text-align: center;
              border-bottom: 2px dashed black;
              padding-bottom: 6px;
              margin-bottom: 6px;
            }
            .header h1 {
              font-size: 16px;
              margin: 0;
              font-weight: 900;
              letter-spacing: 1px;
            }
            .header p {
              font-size: 8px;
              margin: 2px 0 0 0;
            }
            .section-title {
              font-size: 9px;
              font-weight: bold;
              text-transform: uppercase;
              margin: 4px 0 2px 0;
              background: black;
              color: white;
              padding: 2px;
              text-align: center;
              letter-spacing: 1px;
            }
            .address-box {
              font-size: 10px;
              line-height: 1.3;
            }
            .recipient-name {
              font-size: 13px;
              font-weight: 900;
              margin-bottom: 4px;
            }
            .items-list {
              font-size: 8px;
              margin: 0;
              padding-left: 12px;
              max-height: 32mm;
              overflow: hidden;
            }
            .footer {
              border-top: 2px dashed black;
              padding-top: 6px;
              margin-top: 6px;
              font-size: 8px;
              text-align: center;
            }
            .order-id {
              font-size: 14px;
              font-weight: 900;
            }
            .barcode-lines {
              display: flex;
              height: 25px;
              width: 100%;
              justify-content: center;
              align-items: stretch;
              margin: 4px 0 2px 0;
            }
            .barcode-lines div {
              background: black;
            }
            .tag {
              border: 1.5px solid black;
              padding: 2px 6px;
              display: inline-block;
              font-weight: 900;
              font-size: 10px;
              margin-bottom: 4px;
              background: #f0f0f0;
            }
            @media print {
              html, body { width: 100mm !important; height: 150mm !important; overflow: hidden !important; }
              .container { break-inside: avoid; page-break-inside: avoid; page-break-after: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div>
              <div class="header">
                <h1>F PAC STORE</h1>
                <p>REM: RUA PARANAGUAMIRIM, 1395 - PARANAGUAMIRIM - JOINVILLE/SC</p>
                <p>CONTATO: (47) 997465602</p>
              </div>
              
              <div style="text-align: center;">
                <span class="tag">🏍️ MODELO A: PEDIDO LOCAL (ENTREGA DIRETA)</span>
              </div>

              <div class="section-title">Destinatário</div>
              <div class="address-box">
                <div class="recipient-name">${String(order.customerName || 'Cliente').toUpperCase()}</div>
                <div><b>Endereço:</b> ${String(addressInfo.street).toUpperCase()}, ${String(addressInfo.number).toUpperCase()}</div>
                ${addressInfo.complement ? '<div><b>Comp:</b> ' + String(addressInfo.complement).toUpperCase() + '</div>' : ''}
                <div><b>Bairro:</b> ${String(addressInfo.neighborhood).toUpperCase()}</div>
                <div><b>Cidade/UF:</b> ${String(addressInfo.city).toUpperCase()} / ${String(addressInfo.state).toUpperCase()}</div>
                <div><b>CEP:</b> ${addressInfo.cep}</div>
                <div><b>Fone:</b> ${order.customerPhone || ''} ${order.customerPhone2 ? '/ ' + order.customerPhone2 : ''}</div>
              </div>

              <div class="section-title">Itens do Pedido</div>
              <ul class="items-list">
                ${itemsHtml}
              </ul>

              ${order.observations ? `
                <div class="section-title">Observações de Entrega</div>
                <div style="font-size: 8px; font-style: italic; max-height: 38px; overflow: hidden; font-weight: bold; padding: 2px;">
                  ${order.observations}
                </div>
              ` : ''}
            </div>

            <div class="footer">
              <div class="barcode-lines">
                <div style="width: 2px; margin-right: 1px;"></div>
                <div style="width: 1px; margin-right: 2px;"></div>
                <div style="width: 3px; margin-right: 1px;"></div>
                <div style="width: 1px; margin-right: 1px;"></div>
                <div style="width: 4px; margin-right: 2px;"></div>
                <div style="width: 2px; margin-right: 1px;"></div>
                <div style="width: 1px; margin-right: 3px;"></div>
                <div style="width: 3px; margin-right: 1px;"></div>
                <div style="width: 2px; margin-right: 1px;"></div>
                <div style="width: 1px; margin-right: 1px;"></div>
                <div style="width: 4px; margin-right: 1px;"></div>
                <div style="width: 2px; margin-right: 2px;"></div>
                <div style="width: 1px; margin-right: 1px;"></div>
                <div style="width: 3px; margin-right: 1px;"></div>
                <div style="width: 2px; margin-right: 3px;"></div>
                <div style="width: 1px; margin-right: 1px;"></div>
                <div style="width: 4px; margin-right: 1px;"></div>
                <div style="width: 2px; margin-right: 2px;"></div>
                <div style="width: 1px; margin-right: 1px;"></div>
                <div style="width: 3px; margin-right: 1px;"></div>
              </div>
              <div class="order-id">PEDIDO #${order.id}</div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 800);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintProductionTicket = async (order: any) => {
    const printWindow = window.open('', '_blank', 'width=520,height=760');
    if (!printWindow) {
      toast.error('Permita a abertura de popups para imprimir a ficha de produção.');
      return;
    }
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character] || character));
    const items = Array.isArray(order.items) ? order.items : [];
    const customProduction = order.customProduction || {};
    const sizes = Array.isArray(customProduction.sizes) && customProduction.sizes.length
      ? customProduction.sizes
      : items.map((item: any) => ({ size: item.size, quantity: item.quantity }));
    const rawArtworks = Array.isArray(customProduction.artworks) && customProduction.artworks.length
      ? customProduction.artworks
      : items.flatMap((item: any) => Array.isArray(item.printConfigs) ? item.printConfigs : []);
    const artworks = rawArtworks.filter((art: any, index: number, all: any[]) => all.findIndex((other) => (
      `${other.stampId || other.id || other.stamp}|${other.location || ''}|${other.artSize || other.printSize || ''}`
      === `${art.stampId || art.id || art.stamp}|${art.location || ''}|${art.artSize || art.printSize || ''}`
    )) === index);
    const artworkQrCodes = await Promise.all(artworks.map(async (art: any) => {
      if (art.source !== 'own_art' || !isPrivateManualArtworkUrl(art.image)) return '';
      try { return await QRCode.toDataURL(art.image, { width: 180, margin: 1 }); }
      catch { return ''; }
    }));
    const itemRows = customProduction.productName ? '' : items.map((item: any) => `
      <div class="item">
        <div class="item-name">${escapeHtml(item.name || 'Produto')}</div>
        <div class="meta">${escapeHtml(item.color || customProduction.garmentColor || 'Cor não informada')} · TAMANHO ${escapeHtml(item.size || '—')} · <b>${escapeHtml(item.quantity || 1)} UN.</b></div>
      </div>`).join('');
    const sizeRows = sizes.map((entry: any) => `
      <div class="size-row"><b>${escapeHtml(entry.size || '—')}</b><span>${escapeHtml(entry.quantity || 1)} peça(s)</span></div>`).join('');
    const artworkRows = artworks.length ? artworks.map((art: any, index: number) => `
      <section class="art">
        <div class="art-title">ARTE ${index + 1}: ${escapeHtml(art.name || art.stamp || art.code || 'Arte')}</div>
        ${art.source === 'catalog' && art.code ? `<div><b>Variante/código:</b> ${escapeHtml(art.code)}</div>` : ''}
        <div><b>Aplicação:</b> ${escapeHtml(art.location || 'Não informada')}</div>
        <div><b>Cor da estampa:</b> ${escapeHtml(art.color || 'Não informada')}</div>
        <div><b>Tamanho:</b> ${escapeHtml(art.artSize || art.printSize || 'Não informado')}</div>
        ${art.stockPrintSize && art.stockPrintSize !== (art.artSize || art.printSize) ? `<div><b>Medida do estoque:</b> ${escapeHtml(art.stockPrintSize)}</div>` : ''}
        ${art.notes ? `<div class="note"><b>Detalhe:</b> ${escapeHtml(art.notes)}</div>` : ''}
        ${art.source === 'own_art' ? '<div class="own-art">ARTE PRÓPRIA — SEM BAIXA NO CATÁLOGO</div>' : ''}
        ${artworkQrCodes[index] ? `<div class="art-qr"><img src="${escapeHtml(artworkQrCodes[index])}" alt="QR da arte ${index + 1}" /><span>Escaneie para abrir a imagem enviada pelo cliente.</span></div>` : ''}
      </section>`).join('') : '<div class="empty">Nenhuma especificação de estampa cadastrada.</div>';
    const dueDate = order.deliveryDate ? new Date(`${order.deliveryDate}T12:00:00`).toLocaleDateString('pt-BR') : '';
    const itemName = customProduction.productName || items[0]?.name || 'Pedido';

    printWindow.document.write(`<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Pedido ${escapeHtml(order.id)} - Produção</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { box-sizing: border-box; }
            html, body { width: 80mm; margin: 0; padding: 0; }
            body { padding: 4mm; color: #000; background: #fff; font: 11px/1.35 Arial, sans-serif; overflow-wrap: anywhere; }
            header { border-bottom: 2px dashed #000; padding-bottom: 3mm; text-align: center; }
            header h1 { margin: 0; font-size: 17px; letter-spacing: .5px; }
            header p { margin: 1mm 0 0; font-size: 9px; font-weight: 700; }
            .order { margin: 3mm 0; padding: 2.5mm; border: 2px solid #000; text-align: center; }
            .order strong { display: block; font-size: 17px; }
            .order span { display: block; margin-top: 1mm; font-size: 9px; font-weight: 700; }
            .section { margin-top: 3mm; }
            .section-title { margin-bottom: 1.5mm; padding: 1.5mm; color: #fff; background: #000; font-size: 10px; font-weight: 900; letter-spacing: .4px; text-transform: uppercase; }
            .customer { font-size: 11px; font-weight: 700; }
            .meta { font-size: 10px; }
            .item, .art { padding: 2mm 0; border-bottom: 1px dashed #777; }
            .item-name, .art-title { font-weight: 900; text-transform: uppercase; }
            .size-row { display: flex; justify-content: space-between; padding: 1mm 0; border-bottom: 1px dotted #999; font-size: 12px; }
            .model { padding: 1mm 0 2mm; font-weight: 700; }
            .art { font-size: 10px; }
            .art > div { margin-top: 1mm; }
            .note { padding: 1.5mm; border: 1px solid #777; }
            .own-art { margin-top: 1.5mm; font-size: 8px; font-weight: 900; }
            .art-qr { display: flex; align-items: center; gap: 2mm; margin-top: 1mm; font-size: 8px; font-weight: 700; }
            .art-qr img { width: 28mm; height: 28mm; image-rendering: pixelated; }
            .observations { white-space: pre-wrap; border: 1px solid #000; padding: 2mm; font-size: 10px; }
            .empty { padding: 2mm 0; color: #555; font-size: 9px; }
            footer { margin-top: 4mm; padding-top: 2mm; border-top: 2px dashed #000; text-align: center; font-size: 8px; font-weight: 700; }
            @media print { html, body { width: 80mm !important; } section, .item, .size-row { break-inside: avoid; page-break-inside: avoid; } }
          </style>
        </head>
        <body>
          <header><h1>F PAC STORE</h1><p>FICHA INTERNA DE PRODUÇÃO</p></header>
          <div class="order"><strong>PEDIDO #${escapeHtml(order.id)}</strong><span>${escapeHtml(new Date().toLocaleString('pt-BR'))}${dueDate ? ` · ENTREGA: ${escapeHtml(dueDate)}` : ''}</span></div>
          <div class="section"><div class="section-title">Cliente</div><div class="customer">${escapeHtml(order.customerName || 'Cliente')}</div><div class="meta">${escapeHtml(order.customerPhone || 'Telefone não informado')}</div></div>
          <div class="section"><div class="section-title">Produto</div>${customProduction.companyName ? `<div class="meta"><b>Empresa/equipe:</b> ${escapeHtml(customProduction.companyName)}</div>` : ''}<div class="item-name">${escapeHtml(itemName)}</div>${customProduction.model ? `<div class="model">Modelo/corte: ${escapeHtml(customProduction.model)}</div>` : ''}<div class="meta">Cor da peça: <b>${escapeHtml(customProduction.garmentColor || items[0]?.color || 'Não informada')}</b></div>${customProduction.notes ? `<div class="note"><b>Tecido/acabamento:</b> ${escapeHtml(customProduction.notes)}</div>` : ''}${itemRows}</div>
          <div class="section"><div class="section-title">Grade de tamanhos</div>${sizeRows || '<div class="empty">Tamanhos não informados.</div>'}</div>
          <div class="section"><div class="section-title">Artes e aplicações</div>${artworkRows}</div>
          ${order.observations ? `<div class="section"><div class="section-title">Observações de produção</div><div class="observations">${escapeHtml(order.observations)}</div></div>` : ''}
          <footer>CONFERIR PEÇA, TAMANHO, COR E POSIÇÃO DAS ARTES ANTES DA PRODUÇÃO</footer>
          <script>window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 200); };</script>
        </body>
      </html>`);
    printWindow.document.close();
  };

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error: any) {
      // Errors are handled in AuthContext, but we can log here
      console.error(error);
    }
  };

  const handleLogout = () => logout().then(() => navigate('/'));

  const triggerStatusEmail = async (order: any, newStatus: string) => {
    if (!order.customerEmail) {
      console.log(`[EMAIL ADMIN] ⚠️ Pedido ${order.id} não possui e-mail cadastrado.`);
      return;
    }
    
    console.log(`[EMAIL ADMIN] 🚀 Notificando cliente sobre novo status: ${newStatus} (Pedido: ${order.id})`);
    try {
      const emailPayload = {
        email: (order.customerEmail || '').trim(),
        customerName: order.customerName || 'Cliente',
        orderId: order.id,
        items: order.items,
        totals: {
          subtotal: order.subtotal || 0,
          shipping: order.shipping || 0,
          discount: (order.couponDiscount || 0) + (order.pixDiscount || 0) + (order.flashSaleDiscount || 0),
          finalTotal: order.total
        },
        status: newStatus,
        address: order.address,
        paymentMethod: order.paymentMethod || 'Mercado Pago',
        paymentLink: order.paymentLink || null
      };

      const response = await authenticatedFetch('/api/automation/stage-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: emailPayload.orderId,
          newStageId: newStatus,
          previousStageId: newStatus,
          changedBy: user?.email || 'Central de Gestão',
          forceResend: true,
        })
      });
      const result = await parseApiJson<any>(response);
      
      if (!result.success) {
        console.error("[EMAIL ADMIN] ❌ Erro ao enviar:", result.error);
        if (result.error?.message?.includes("sandbox")) {
           toast.error("Erro: Resend em modo Sandbox. Verifique o e-mail do destinatário.");
        } else {
           toast.error(`Erro no e-mail: ${result.error?.message || 'Falha no servidor'}`);
        }
      } else {
        console.log(`[EMAIL ADMIN] ✅ E-mail de ${newStatus} disparado.`);
        toast.success(`Notificação de status enviada por e-mail!`);
      }
    } catch (err) {
      console.error("[EMAIL ADMIN] Erro ao enviar e-mail de atualização:", err);
      toast.error("Erro de conexão ao enviar e-mail.");
    }
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      console.log(`[STATUS DEBUG] ✨ Atualizando pedido ${orderId} para status: ${newStatus}`);

      await updateOrderStatusInDb(orderId, newStatus);
      
      // Fetch fresh order data to ensure we have all fields for the email
      const orderSnap = await getDoc(doc(db, 'orders', orderId));
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        // Audit log
        await addAuditLog(
          "Alteração de Status",
          `Pedido #${orderId} de ${orderData.customerName || 'Cliente'} atualizado para: ${newStatus}`
        );
        toast.success(`Status atualizado para: ${newStatus}`);
      }
    } catch (error) {
      console.error("[STATUS DEBUG] ❌ Erro ao atualizar status:", error);
      toast.error("Erro ao atualizar status.");
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(',', '');
    } catch (e) {
      return '';
    }
  };

  const handleStatusUpdate = async (order: Order, status: string) => {
    if (status === 'payment_pending') {
      if (isAdminPaymentPending(order)) return;
      throw new Error('Para reabrir um pagamento já realizado, use a Central Financeira do pedido.');
    }

    if (['approved', 'payment_approved', 'Pagamento Aprovado'].includes(status)) {
      await updateStatus(order.id, 'approved');
      return;
    }

    if (status === 'cancelled') {
      await updateStatus(order.id, 'cancelled');
      return;
    }

    if (['shipped', 'delivered'].includes(status)) {
      // A seleção de expedição representa a intenção final do operador. Para
      // pedidos legados, conclui primeiro todas as etapas canônicas pendentes,
      // evitando que a interface ofereça uma ação que o backend bloqueia.
      const currentProductionStage = getAdminProductionStage(order).id;
      const currentProductionIndex = PRODUCTION_STAGES.findIndex(stage => stage.id === currentProductionStage);
      const completedIndex = PRODUCTION_STAGES.findIndex(stage => stage.id === 'completed');
      if (currentProductionIndex >= 0 && currentProductionIndex < completedIndex) {
        for (let index = currentProductionIndex + 1; index <= completedIndex; index += 1) {
          await updateProductionStatus(
            order.id,
            PRODUCTION_STAGES[index].id,
            user?.email || 'Admin',
            `Conclusão automática da produção para atualizar expedição como ${status}.`,
          );
        }
      }

      const response = await authenticatedFetch(`/api/admin/orders/${order.id}/shipping-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newStatus: status,
          forceLifecycleCompletion: true,
          note: status === 'delivered'
            ? 'Pedido marcado como entregue pelo painel administrativo.'
            : 'Pedido marcado como saiu para entrega pelo painel administrativo.',
        })
      });
      const payload = await parseApiJson<any>(response);
      if (!response.ok) {
        const err = payload || {};
        throw new Error(err.message || err.error || 'Erro ao atualizar expedição.');
      }
      await addAuditLog('Alteração de Expedição', `Pedido #${order.id} atualizado para envio: ${status}`);
      toast.success(status === 'delivered' ? 'Pedido marcado como entregue.' : 'Pedido marcado como enviado.');
      return;
    }

    const productionStage = getStageFromStatus(status).id;
    const currentProductionStage = getAdminProductionStage(order).id;
    const currentIndex = PRODUCTION_STAGES.findIndex(stage => stage.id === currentProductionStage);
    const targetIndex = PRODUCTION_STAGES.findIndex(stage => stage.id === productionStage);
    if (targetIndex < 0) throw new Error('Etapa de produção inválida.');

    if (targetIndex > currentIndex) {
      for (let index = Math.max(0, currentIndex + 1); index <= targetIndex; index += 1) {
        await updateProductionStatus(
          order.id,
          PRODUCTION_STAGES[index].id,
          user?.email || 'Admin',
          `Avanço pelo painel para ${PRODUCTION_STAGES[index].label}`,
        );
      }
    } else {
      await updateProductionStatus(
        order.id,
        productionStage,
        user?.email || 'Admin',
        targetIndex < currentIndex ? 'Correção operacional realizada pelo painel de pedidos.' : undefined,
      );
    }
    await addAuditLog('Alteração de Produção', `Pedido #${order.id} atualizado para produção: ${productionStage}`);
    toast.success(`Produção atualizada para: ${getStageFromStatus(productionStage).label}`);
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        const isAlreadyCancelled = isAdminOrderCancelled(orderData);
        const alreadyReverted = orderData.stockReverted || orderData.stockRevertedAcknowledged;
        
        // Cancel via API to release stock reservation if not already cancelled
        if (!isAlreadyCancelled && !alreadyReverted) {
          await authenticatedFetch(`/api/admin/orders/${orderId}/payment-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newStatus: 'cancelled', reason: 'Pedido excluído' })
          }).catch(() => {});
        }

        // Save audit log before deletion
        await addAuditLog(
          "Exclusão de Pedido",
          `Pedido #${orderId} de ${orderData.customerName || 'Cliente'} no valor de R$ ${orderData.total || 0} excluído permanentemente.`
        );
      }
      
      await deleteDoc(orderRef);
      toast.success("Pedido excluído permanentemente.");
      setConfirmDeleteId(null);
    } catch (error: any) {
      console.error("Erro ao excluir pedido:", error);
      toast.error(`Erro: ${error.message || 'Não foi possível excluir'}`);
    }
  };

  const handleSaveManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      toast.error("Por favor, preencha o nome do cliente.");
      return;
    }
    if (manualOrderKind === 'sale' && !custPhone.trim()) {
      toast.error("Por favor, preencha o telefone do cliente.");
      return;
    }
    if (tempItems.length === 0) {
      toast.error("Adicione pelo menos um produto ao pedido.");
      return;
    }

    setSavingManualOrder(true);
    try {
      const orderId = `${manualOrderKind === 'gift' ? 'MANUAL-BRINDE' : 'MANUAL'}-${Date.now().toString().slice(-5)}-${Math.floor(100 + Math.random() * 900)}`;
      
      const subTotalSum = manualOrderKind === 'gift' ? 0 : tempItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      const totalSum = manualOrderKind === 'gift' ? 0 : Math.max(0, subTotalSum + Number(manualOrderShipping) - Number(manualOrderDiscount));

      // Construct item list expected by standard renderer
      const finalItems = tempItems.map(item => {
        const quantity = Number(item.quantity);
        const unitCostSnapshot = Number(item.product.costPrice ?? item.product.cost ?? 0);
        const identity = manualProductIdentity(item.product);
        const stamps = Array.isArray(item.stamps) ? item.stamps : (item.stamp ? [item.stamp] : []);
        const isCustomProduct = item.mode === 'custom';
        return {
          id: item.product.id,
          productId: item.product.id,
          slug: item.product.slug,
          parentSlug: item.product.parentSlug || item.product.slug || item.product.id,
          variantKey: `${item.color}_${item.size}`,
          name: item.displayName || item.product.name,
          sku: identity.reference,
          manualProductMode: item.mode || 'ready',
          color: item.color,
          size: item.size,
          quantity,
          price: manualOrderKind === 'gift' ? 0 : Number(item.price),
          image: identity.image || '/estampas/logo-fpac.png',
          unitCostSnapshot,
          totalCostSnapshot: Number((unitCostSnapshot * quantity).toFixed(2)),
          costCoverage: unitCostSnapshot <= 0
            ? 'unavailable'
            : (item.product.costCalculation?.coverage === 'partial' ? 'estimated' : 'complete'),
          stampId: stamps[0]?.id || '',
          stampName: stamps.map((stamp: any) => stamp.name || stamp.code).filter(Boolean).join(' + '),
          stampStatus: stamps.some((stamp: any) => stamp.status === 'unavailable') ? 'unavailable' : 'active',
          ...(isCustomProduct ? { customProduct: true, customDetails: item.customDetails } : {}),
          customization: { prints: stamps.map((stamp: any) => ({
            stampId: stamp.id,
            ...(stamp.stockPrintSize || stamp.printSize ? { printSize: stamp.stockPrintSize || stamp.printSize } : {}),
            ...(isCustomProduct ? { stamp: stamp.name, color: stamp.color, location: stamp.location, artSize: stamp.artSize, notes: stamp.notes, source: stamp.source } : {})
          })) },
          printConfigs: stamps.map((stamp: any, index: number) => ({
            stampId: stamp.id,
            stamp: stamp.name || stamp.code || 'Estampa',
            ...(isCustomProduct && stamp.code ? { code: stamp.code } : {}),
            ...(stamp.printSize ? { printSize: stamp.printSize } : {}),
            image: stampImage(stamp),
            status: stamp.status || 'active',
            location: isCustomProduct ? (stamp.location || `Estampa ${index + 1}`) : `Estampa ${index + 1}`,
            ...(isCustomProduct ? {
              color: stamp.color,
              artSize: stamp.artSize || stamp.printSize || '',
              stockPrintSize: stamp.stockPrintSize || '',
              notes: stamp.notes || '',
              source: stamp.source || '',
            } : {}),
          }))
        };
      });

      // O andamento operacional e o financeiro são domínios independentes.
      const operationalState = deriveManualOrderOperationalState(manualOrderStatus);
      const firestoreStatus = operationalState.status;
      const canonicalProductionStatus = operationalState.productionStatus;
      const canonicalShippingStatus = operationalState.shippingStatus;

      const initAmountPaid = getManualOrderInitialPayment(
        totalSum,
        manualOrderStatus,
        manualOrderPaid,
        manualOrderPaidAmount
      );
      const initBalanceDue = Math.max(0, totalSum - initAmountPaid);
      const canonicalPaymentStatus = manualOrderStatus === 'cancelled'
        ? 'cancelled'
        : (initBalanceDue <= 0 ? 'approved' : (initAmountPaid > 0 ? 'partially_paid' : 'pending'));
      // A captura inicial é registrada depois pela API financeira idempotente.
      // O pedido nasce com saldo integral para não duplicar receita/log/ledger.
      const initLogs: any[] = [];
      const installmentCount = Math.max(1, Math.min(60, Number(manualInstallmentCount) || 1));
      const baseInstallment = Math.floor((totalSum / installmentCount) * 100) / 100;
      let paidToAllocate = 0;
      const installments = Array.from({ length: installmentCount }, (_, index) => {
        const due = new Date(`${manualFirstDueDate}T12:00:00`);
        due.setMonth(due.getMonth() + index);
        const amount = index === installmentCount - 1
          ? Number((totalSum - (baseInstallment * (installmentCount - 1))).toFixed(2))
          : baseInstallment;
        const paidAmount = Math.min(amount, paidToAllocate);
        paidToAllocate -= paidAmount;
        return {
          number: index + 1,
          amount,
          paidAmount,
          dueDate: due.toISOString().split('T')[0],
          status: paidAmount + 0.001 >= amount ? 'paid' : 'pending',
          ...(paidAmount + 0.001 >= amount ? { paidAt: new Date().toISOString() } : {})
        };
      });

      const customLines = tempItems.filter((item) => item.mode === 'custom');
      const customOrderDetails = customLines[0]?.customDetails;
      const orderStockControl = customLines.length ? 'no_move' : stockControl;

      const orderPayload = {
        id: orderId,
        customerName: custName,
        customerPhone: custPhone,
        customerPhone2: custPhone2,
        customerEmail: custEmail || '',
        address: isRetirada ? 'Retirada na Loja' : custAddress,
        number: isRetirada ? '' : custNumber,
        complement: isRetirada ? '' : custComplement,
        neighborhood: isRetirada ? '' : custNeighborhood,
        city: isRetirada ? 'Retirada' : custCity,
        state: isRetirada ? 'RET' : custState,
        cep: isRetirada ? '' : custCep,
        items: finalItems,
        ...(customOrderDetails ? {
          customProduction: {
            ...customOrderDetails,
            sizes: customLines.map((item) => ({ size: item.size, quantity: Number(item.quantity) || 1 })),
          }
        } : {}),
        subtotal: subTotalSum,
        shipping: Number(manualOrderShipping),
        couponDiscount: Number(manualOrderDiscount),
        total: totalSum,
        amountPaid: 0,
        balanceDue: totalSum,
        paymentLogs: initLogs,
        installments,
        payment: {
          status: manualOrderKind === 'gift' ? 'not_applicable' : (canonicalPaymentStatus === 'cancelled' ? 'cancelled' : 'pending'),
          paidAmount: 0,
          pendingAmount: manualOrderKind === 'gift' ? 0 : totalSum,
          method: manualOrderKind === 'gift' ? 'BRINDE' : paymentMethodForm,
          dueDate: installments[0]?.dueDate,
          installments
        },
        paymentStatus: manualOrderKind === 'gift' ? 'not_applicable' : (canonicalPaymentStatus === 'cancelled' ? 'cancelled' : 'pending'),
        productionStatus: canonicalProductionStatus,
        shippingStatus: canonicalShippingStatus,
        paymentMethod: manualOrderKind === 'gift' ? 'BRINDE' : paymentMethodForm,
        status: firestoreStatus,
        origin: orderOrigin,
        gateway: 'manual',
        observations: manualOrderObs,
        deliveryDate: manualOrderDeliveryDate,
        isManual: true,
        isGift: manualOrderKind === 'gift',
        orderKind: manualOrderKind,
        shippingMethod: isRetirada ? 'Retirada' : manualShippingMethod,
        shippingMethodName: isRetirada ? 'Retirada na Loja' : manualShippingMethodName,
        shippingServiceId: isRetirada ? 0 : manualShippingServiceId,
        stockControl: orderStockControl, // Produtos personalizados não têm SKU de camisa; as estampas do catálogo continuam baixando por código e medida.
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      try {
        const createResponse = await authenticatedFetch('/api/admin/orders/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: orderPayload })
        });
        const createPayload = await parseApiJson<any>(createResponse);
        if (!createResponse.ok) {
          throw new Error(createPayload.message || createPayload.error || 'Não foi possível criar o pedido manual.');
        }

        // Disparar WhatsApp + e-mail pelo fluxo centralizado quando estiver aguardando pagamento.
        if (initBalanceDue > 0 && manualOrderStatus !== 'cancelled') {
          authenticatedFetch('/api/automation/stage-notification', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              orderId,
              newStageId: 'payment_pending',
              changedBy: user?.email || 'Central de Gestão'
            })
          }).then(async (res) => {
            if (!res.ok) {
              const errData = await parseApiJson<any>(res).catch(() => ({}));
              throw new Error(errData.error || `HTTP error ${res.status}`);
            }
            return parseApiJson<any>(res);
          }).then((data) => {
            if (data.success) {
              console.log(`[NOTIF-AUTO] Notificações processadas para o pedido #${orderId}`);
            } else {
              console.warn(`[NOTIF-AUTO] Falha ao notificar o pedido #${orderId}:`, data.logEntry?.error || data);
            }
          }).catch((err) => {
            console.error(`[NOTIF-AUTO] Erro ao disparar notificações do pedido #${orderId}:`, err);
          });
        }
      } catch (err) {
        throw err;
      }

      // If initial order was marked as paid, register manual payment ledger event via API
      if (initAmountPaid > 0) {
        const paymentResponse = await authenticatedFetch(`/api/admin/orders/${orderId}/manual-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: initAmountPaid,
            method: paymentMethodForm || 'MANUAL',
            reference: `Venda Manual - ${orderOrigin}`,
            notes: `Pagamento inicial registrado na criação manual do pedido #${orderId}`,
            idempotencyKey: `man_init_pay_${orderId}`
          })
        });
        const paymentPayload = await parseApiJson<any>(paymentResponse);
        if (!paymentResponse.ok || !paymentPayload.success) {
          toast.error(`Pedido criado, mas o pagamento não foi registrado: ${paymentPayload.message || paymentPayload.error || 'erro desconhecido'}`);
        }
      }

      // Write to Detailed Audit Logs exactly as requested
      const itemsListDesc = finalItems.map(i => `${i.name} (${i.color}_${i.size}) x${i.quantity}`).join(', ');
      const catalogArtworkAudit = customLines.flatMap((item) => (item.stamps || [])
        .filter((stamp: any) => stamp.source === 'catalog')
        .map((stamp: any) => `${stamp.code || stamp.name} (${stamp.color}, ${stamp.stockPrintSize || stamp.printSize || 'medida padrão'}) x${item.quantity}`))
        .join(', ');
      const estoqueChoiceLabel = customLines.length
        ? `Peças personalizadas sem baixa de SKU; estampas do catálogo debitadas: ${catalogArtworkAudit || 'nenhuma'}`
        : (orderStockControl === 'move' ? 'Movimentar Estoque' : 'Não Movimentar Estoque');
      const userResponsible = user?.email || 'Administrador (fpacstore@gmail.com)';
      const auditLogDesc = customLines.length
        ? 'Pedido Manual Personalizado - Baixa de Estampas por Variante/Medida'
        : (orderStockControl === 'move' ? 'Pedido Manual - Estoque Movimentado' : 'Pedido Manual - Sem Movimentação de Estoque');
      
      const manualOrderDateFormatted = new Date().toLocaleDateString('pt-BR');
      const manualOrderTimeFormatted = new Date().toLocaleTimeString('pt-BR');

      const auditDetails = `Pedido #${orderId}
Origem: ${orderOrigin}
Controle de Estoque: ${estoqueChoiceLabel}
Usuário: ${userResponsible}
Data: ${manualOrderDateFormatted} ${manualOrderTimeFormatted}
Itens: ${itemsListDesc}
Total: R$ ${totalSum.toFixed(2)}`;

      await addAuditLog(
        auditLogDesc,
        auditDetails
      );

      toast.success(`Pedido #${orderId} registrado com sucesso!`);
      
      // Clear Form state
      setCustName('');
      setCustPhone('');
      setCustPhone2('');
      setCustEmail('');
      setCustCep('');
      setIsRetirada(false);
      setCustAddress('');
      setCustNumber('');
      setCustComplement('');
      setCustNeighborhood('');
      setCustCity('');
      setCustState('');
      setTempItems([]);
      setSelectedProduct(null);
      setManualProductMode('ready');
      setSelectedColor('');
      setSelectedSize('');
      setManualOrderObs('');
      setManualOrderDeliveryDate('');
      setManualOrderDiscount('');
      setManualOrderShipping('');
      setManualOrderStatus('received');
      setManualOrderKind('sale');
      setManualOrderPaid(false);
      setManualOrderPaidAmount(0);
      setManualInstallmentCount(1);
      setManualFirstDueDate(new Date().toISOString().split('T')[0]);
      setStockControl('move');
      setIgnoreStock(true);
      setIsManualModalOpen(false);

    } catch (err: any) {
      console.error("Erro ao registrar pedido manual:", err);
      toast.error(`Falha ao registrar pedido: ${err.message || 'Erro de rede'}`);
    } finally {
      setSavingManualOrder(false);
    }
  };

  const showOrderCounts = ordersLoaded && needsOrderSubscription;
  const soldProductUnits = useMemo(() => orders
    .filter(order => isAdminOrderPaid(order) && !isAdminOrderCancelled(order))
    .reduce((total, order) => total + (order.items || []).reduce(
      (subtotal: number, item: any) => subtotal + Math.max(1, Number(item.quantity) || 1),
      0
    ), 0), [orders]);

  const activeOrdersCount = useMemo(() => orders.filter(order => !isAdminOrderCompleted(order) && !isAdminOrderCancelled(order)).length, [orders]);
  const completedOrdersCount = useMemo(() => orders.filter(isAdminOrderCompleted).length, [orders]);

  const filteredOrders = orders.filter(order => {
    const searchLower = String(searchTerm || '').toLowerCase();
    const matchesSearch = 
      String(order.id || '').toLowerCase().includes(searchLower) || 
      String(order.customerName || '').toLowerCase().includes(searchLower) ||
      String(order.customerEmail || '').toLowerCase().includes(searchLower);
    
    const matchesStatus = matchesAdminStatusFilter(order, statusFilter);

    let matchesStock = true;
    if (stockFilter === 'moved') {
      matchesStock = order.stockControl !== 'no_move';
    } else if (stockFilter === 'not_moved') {
      matchesStock = order.stockControl === 'no_move';
    }

    const matchesListView = orderListView === 'completed'
      ? isAdminOrderCompleted(order)
      : !isAdminOrderCompleted(order) && !isAdminOrderCancelled(order);

    return matchesSearch && matchesStatus && matchesStock && matchesListView;
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#eab308]" size={48} /></div>;

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen pt-32 flex flex-col items-center justify-center text-center px-4 max-w-lg mx-auto">
        <Package size={64} className="text-gray-300 mb-6" />
        <h1 className="text-3xl font-black uppercase mb-2">Acesso Restrito</h1>
        <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-8">
          Este painel é exclusivo para administradores da loja.
        </p>
        
        {import.meta.env.DEV && (
          <div className="w-full space-y-4 bg-black/5 p-6 border border-black/10 rounded-lg mb-6 text-center">
            <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider leading-relaxed">
              Seja bem-vindo ao ambiente de testes e desenvolvimento! Como você está testando a aplicação, clique no botão abaixo para ativar o modo de testes e pular o login obrigatório do Firebase.
            </p>
            <button 
              onClick={() => {
                if (!import.meta.env.DEV) return;
                localStorage.setItem('admin_bypass', 'true');
                setHasBypass(true);
                toast.success('Modo de testes ativado com sucesso! Carregando painel...');
              }}
              className="w-full bg-[#eab308] text-black hover:bg-black hover:text-[#eab308] px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Ativar Acesso de Teste (Preview)
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3 w-full">
          <button onClick={handleLogin} className="bg-black text-white px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all">Entrar com Google</button>
          {user && <button onClick={handleLogout} className="text-gray-500 text-xs underline">Sair da Conta Atual ({user.email})</button>}
          <Link to="/" className="text-gray-500 text-xs underline">Voltar para a Loja</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f3] pb-16 max-w-7xl mx-auto">
      <header className="bg-black text-white border-b-4 border-[#eab308] px-4 sm:px-6 lg:px-8 py-5 md:py-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#eab308] text-black px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em]">F PAC Commerce</span>
              <span className="text-white/45 text-[9px] font-black uppercase tracking-[0.18em]">Central de gestão</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-black uppercase tracking-[-0.04em] leading-none">Gestão da empresa</h1>
            <p className="mt-2 text-xs md:text-sm text-white/55 max-w-2xl">Dashboard, catálogo e operação reunidos em uma única página de trabalho.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-wider">
            {showOrderCounts && (
              <span className="bg-white/5 text-white border border-white/10 px-3 py-2 flex items-center gap-2 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {soldProductUnits} produtos vendidos
              </span>
            )}
            <FinancialPrivacyToggle onToggle={() => setToggledOrderValueIds(new Set())} />
            <Link to="/" className="border border-white/10 px-3 py-2 text-white/60 hover:text-[#eab308] hover:border-[#eab308]/40 transition-colors">Ver loja</Link>
          </div>
        </div>
      </header>

      <nav aria-label="Módulos da Central de Gestão" className="sticky top-[var(--site-header-height)] z-30 bg-white border-b border-black/10 shadow-sm">
        <div className="flex overflow-x-auto scrollbar-none px-2 sm:px-4 lg:px-6 py-2 gap-1 snap-x">
          {MANAGEMENT_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectManagementTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={cn(
                "snap-start min-w-max shrink-0 px-3.5 py-2.5 text-[9px] font-black uppercase tracking-[0.12em] transition-all cursor-pointer flex items-center gap-2 border",
                activeTab === id
                  ? "bg-black text-[#eab308] border-black shadow-sm"
                  : "bg-white text-black/55 border-transparent hover:text-black hover:border-black/10 hover:bg-black/[0.025]"
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {label}{id === 'orders' && showOrderCounts ? ` (${orders.length})` : ''}
            </button>
          ))}
        </div>
      </nav>

      <div className="px-2 sm:px-4 lg:px-6 pt-5">

      {activeTab === 'dashboard' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Dashboard...</div>}>
          <ManagementDashboard />
        </React.Suspense>
      ) : activeTab === 'catalog' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Catálogo...</div>}>
          <AdminStampsManager />
        </React.Suspense>
      ) : activeTab === 'orders' ? (
        <div className="space-y-4">
          {/* HERO HEADER - ESTAMPAS STANDARD PATTERN */}
          <div className="bg-black text-white px-4 md:px-8 py-4 md:py-6 border-b-2 border-[#eab308] relative overflow-hidden">
            <div className="absolute right-0 bottom-0 opacity-10 translate-x-12 translate-y-12 pointer-events-none">
              <Layers size={200} className="text-white" />
            </div>
            
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-[#eab308] text-black px-2 py-0.5 text-[8px] font-black uppercase tracking-widest font-mono">
                    SGC v2.4
                  </span>
                  <span className="text-gray-400 text-[9px] font-bold uppercase tracking-[0.2em] font-sans">
                    • CENTRAL DE PEDIDOS E VENDAS
                  </span>
                </div>
                
                <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight italic font-sans">
                  CENTRAL DE <span className="text-[#eab308]">PEDIDOS</span>
                </h1>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={openOrderMaintenance}
                  className="bg-white text-black border border-black/15 hover:border-[#eab308] transition-all px-4 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle size={13} /> Encerrar histórico
                </button>
                <button
                  onClick={() => setOrderSubView(orderSubView === 'reports' ? 'list' : 'reports')}
                  className="bg-black text-[#eab308] border border-[#eab308] hover:bg-[#eab308] hover:text-black transition-all px-4 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet size={13} /> {orderSubView === 'reports' ? 'Voltar à Lista' : 'Relatórios & Canais'}
                </button>
                <button
                  onClick={() => setIsManualModalOpen(true)}
                  className="bg-[#eab308] text-black hover:bg-white transition-all px-4 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={13} /> Novo Pedido Manual
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {isOrderMaintenanceOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm p-4 flex items-center justify-center"
                role="dialog"
                aria-modal="true"
                aria-labelledby="order-maintenance-title"
              >
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.98 }}
                  className="w-full max-w-xl bg-white border-2 border-black shadow-2xl"
                >
                  <div className="bg-black text-white p-5 md:p-6 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#eab308]">Manutenção administrativa</p>
                      <h2 id="order-maintenance-title" className="mt-1 text-xl font-black uppercase italic">Encerrar histórico de pedidos</h2>
                    </div>
                    <button
                      onClick={() => !isOrderMaintenanceExecuting && setIsOrderMaintenanceOpen(false)}
                      className="text-white/70 hover:text-white"
                      aria-label="Fechar"
                      disabled={isOrderMaintenanceExecuting}
                    >
                      <XCircle size={22} />
                    </button>
                  </div>

                  <div className="p-5 md:p-6">
                    {isOrderMaintenanceLoading || !orderMaintenancePreview ? (
                      <div className="py-12 flex items-center justify-center gap-3 text-sm font-bold">
                        <Loader2 className="animate-spin" size={20} /> Conferindo os pedidos...
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          Esta ação encerra o histórico operacional sem alterar pagamentos, reembolsos, frete ou estoque dos pedidos reais.
                        </p>

                        <div className="grid grid-cols-2 gap-3 my-5">
                          <div className="border border-black/10 bg-gray-50 p-4">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Pedidos reais</p>
                            <p className="mt-1 text-3xl font-black">{orderMaintenancePreview.realOrdersToFinalize}</p>
                            <p className="text-[10px] text-gray-500">serão finalizados</p>
                          </div>
                          <div className="border border-red-200 bg-red-50 p-4">
                            <p className="text-[9px] font-black uppercase tracking-widest text-red-700">Pedidos de teste</p>
                            <p className="mt-1 text-3xl font-black text-red-700">{orderMaintenancePreview.testOrders}</p>
                            <p className="text-[10px] text-red-700">serão excluídos</p>
                          </div>
                        </div>

                        {orderMaintenancePreview.reviewCandidates.length > 0 && (
                          <div className="mb-5 border border-orange-300 bg-orange-50 p-4">
                            <p className="text-[10px] font-black uppercase tracking-wider text-orange-800">
                              Revisão obrigatória: {orderMaintenancePreview.reviewCandidates.length} registros fora da lista
                            </p>
                            <p className="mt-1 text-xs text-orange-800">
                              A execução está bloqueada até estes documentos sem data serem classificados.
                            </p>
                            <div className="mt-3 max-h-36 overflow-y-auto space-y-1">
                              {orderMaintenancePreview.reviewCandidates.map((candidate) => (
                                <p key={candidate.id} className="text-[10px] font-mono text-orange-950">
                                  #{candidate.id} — {candidate.customerName}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {orderMaintenancePreview.linkedTestFinancialEvents > 0 && (
                          <div className="border-l-4 border-[#eab308] bg-yellow-50 px-4 py-3 text-xs text-gray-700">
                            {orderMaintenancePreview.linkedTestFinancialEvents} lançamentos financeiros gerados pelos testes também serão removidos para manter os indicadores corretos.
                          </div>
                        )}

                        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                          <button
                            onClick={() => setIsOrderMaintenanceOpen(false)}
                            disabled={isOrderMaintenanceExecuting}
                            className="px-5 py-3 border border-black/15 text-[10px] font-black uppercase tracking-wider disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={runOrderMaintenance}
                            disabled={isOrderMaintenanceExecuting || orderMaintenancePreview.reviewCandidates.length > 0 || (orderMaintenancePreview.realOrdersToFinalize === 0 && orderMaintenancePreview.testOrders === 0)}
                            className="px-5 py-3 bg-red-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {isOrderMaintenanceExecuting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                            Finalizar reais e excluir testes
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {orderSubView !== 'reports' && (
            <>
              {/* INDICATOR CARDS (KPIs) - ESTAMPAS STANDARD PATTERN */}
          <div className="max-w-7xl mx-auto px-2 md:px-4 -translate-y-3 relative z-20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div 
                onClick={() => setStatusFilter('all')}
                className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between cursor-pointer"
              >
                <div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 block font-sans">Total Pedidos</span>
                  <span className="text-xl font-black font-mono tracking-tight mt-0.5 block">{orders.length}</span>
                </div>
                <span className="text-[8px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Geral</span>
              </div>

              <div 
                onClick={() => {
                  setOrderListView('completed');
                  setStatusFilter('completed');
                }}
                className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between cursor-pointer"
              >
                <div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 block font-sans">Concluídos / Enviados</span>
                  <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-emerald-700">{completedOrdersCount}</span>
                </div>
                <span className="text-[8px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Entregues</span>
              </div>

              <div 
                onClick={() => setStatusFilter(statusFilter === 'payment_pending' ? 'all' : 'payment_pending')}
                className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between cursor-pointer"
              >
                <div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 block font-sans">Aguardando Pgto</span>
                  <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-amber-600">{orders.filter(o => isAdminPaymentPending(o)).length}</span>
                </div>
                <span className="text-[8px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase font-mono">PIX / Pendente</span>
              </div>

              <div 
                onClick={() => setStatusFilter(statusFilter === 'payment_approved' ? 'all' : 'payment_approved')}
                className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between cursor-pointer"
              >
                <div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-blue-600 block font-sans">Em Produção</span>
                  <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-blue-700">{orders.filter(o => isAdminOrderInProduction(o)).length}</span>
                </div>
                <span className="text-[8px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Produção</span>
              </div>
            </div>
          </div>

              <div className="max-w-7xl mx-auto px-2 md:px-4 pb-3">
                <div className="grid grid-cols-2 gap-2 bg-white border border-black/10 p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOrderListView('active');
                      setStatusFilter('all');
                    }}
                    className={cn(
                      'min-w-0 px-3 py-2.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider border transition-colors',
                      orderListView === 'active' ? 'bg-black text-[#eab308] border-black' : 'bg-white text-gray-500 border-transparent hover:border-black/10'
                    )}
                  >
                    Pedidos ativos ({activeOrdersCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderListView('completed');
                      setStatusFilter('all');
                    }}
                    className={cn(
                      'min-w-0 px-3 py-2.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider border transition-colors',
                      orderListView === 'completed' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-gray-500 border-transparent hover:border-black/10'
                    )}
                  >
                    Concluídos e entregues ({completedOrdersCount})
                  </button>
                </div>
              </div>

              {/* Integrated Control Toolbar (Filters & Fast Actions) */}
              <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-md p-2 border border-black/10 shadow-xs flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="Buscar por ID, Nome ou E-mail..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full pl-8 pr-3 py-1.5 border border-black/10 text-xs focus:outline-none focus:border-[#eab308] bg-gray-50/50" 
                  />
                </div>

                {/* Stage Filter */}
                <select 
                  value={statusFilter} 
                  onChange={e => setStatusFilter(e.target.value)} 
                  className="py-1.5 px-2.5 border border-black/10 text-[10px] font-black uppercase tracking-wider focus:outline-none focus:border-[#eab308] cursor-pointer bg-white"
                >
                  <option value="all">⚡ TODAS AS ETAPAS ({orders.length})</option>
                  {PRODUCTION_STAGES.map(stage => {
                    const count = orders.filter(o => getAdminProductionStage(o).id === stage.id).length;
                    return (
                      <option key={stage.id} value={stage.id}>
                        {stage.emoji} {stage.label.toUpperCase()} ({count})
                      </option>
                    );
                  })}
                </select>

                {/* Stock Filter */}
                <select 
                  value={stockFilter} 
                  onChange={e => setStockFilter(e.target.value as any)} 
                  className="py-1.5 px-2.5 border border-black/10 text-[10px] font-black uppercase tracking-wider focus:outline-none focus:border-[#eab308] cursor-pointer bg-white"
                >
                  <option value="all">📦 ESTOQUE: TODOS</option>
                  <option value="moved">📈 COM BAIXA</option>
                  <option value="not_moved">🔘 SEM BAIXA</option>
                </select>

                {/* Action 1: Pedido Manual */}
                <button 
                  onClick={() => setIsManualModalOpen(true)}
                  className="px-3 py-1.5 bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer shrink-0 border border-black"
                >
                  <Plus size={12} /> Pedido Manual
                </button>

                {/* Action 2: Melhor Envio */}
                <button 
                  onClick={() => {
                    setMeToken('');
                    setIsMelhorEnvioModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 bg-white text-orange-600 border border-orange-400 hover:bg-orange-500 hover:text-white transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${meHasToken ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
                  <Truck size={12} /> {meHasToken ? 'Melhor Envio' : 'Config. Frete'}
                </button>

                {/* Action 3 & 4: Expand / Collapse */}
                <div className="flex gap-1 ml-auto">
                  <button
                    type="button"
                    onClick={() => setExpandedOrders(filteredOrders.map(o => o.id))}
                    className="px-2 py-1.5 bg-gray-100 hover:bg-black hover:text-white transition-all text-[8px] font-black uppercase tracking-wider border border-gray-200 cursor-pointer"
                    title="Expandir todos os cartões de pedido"
                  >
                    📂 Expandir
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedOrders([])}
                    className="px-2 py-1.5 bg-gray-100 hover:bg-black hover:text-white transition-all text-[8px] font-black uppercase tracking-wider border border-gray-200 cursor-pointer"
                    title="Recolher todos os cartões de pedido"
                  >
                    📁 Recolher
                  </button>
                </div>
              </div>


          <AbandonedCartsRecovery formatMoney={formatMoney} />

          {/* Orders List */}
          <div className="space-y-3">
            {ordersError ? (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
                <p className="font-bold">Pedidos temporariamente indisponíveis</p>
                <p className="mt-2">Não foi possível consultar os pedidos. Confira a conexão e a disponibilidade do banco antes de tentar novamente.</p>
              </div>
            ) : !ordersLoaded ? (
              <p role="status" className="py-12 text-center text-sm text-gray-500">Carregando pedidos...</p>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-gray-50 border border-dashed border-black/10 py-20 text-center">
                <p className="text-gray-400 font-bold uppercase tracking-[0.2em]">Nenhum pedido encontrado</p>
              </div>
            ) : (
              filteredOrders.map((order, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={order.id} 
                  className="bg-white border border-black/10 group hover:border-[#eab308]/30 transition-all overflow-hidden"
                >
                  {/* Top Bar / Interactive Header - Click to expand */}
                  <div 
                    onClick={() => {
                      const id = order.id;
                      setExpandedOrders(prev => 
                        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                      );
                    }}
                    className="cursor-pointer bg-white hover:bg-gray-50/60 px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 select-none transition-colors"
                  >
                    {/* Left block: ID, Date, Origin, Manual Badges */}
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        {/* Chevron Indicator */}
                        <span className="text-gray-400 shrink-0">
                          {expandedOrders.includes(order.id) ? (
                            <ChevronUp size={16} className="text-black font-black" />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                        </span>
                        <span className="text-[12px] font-black text-black tracking-tighter break-all">#{order.id}</span>
                        <span className="text-[9px] text-gray-400 font-bold">{formatDate(order.createdAt)}</span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-1.5">
                        {order.isManual ? (
                          <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/20 uppercase tracking-widest">
                            ⚙️ {order.origin || 'MANUAL'}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-blue-50 text-blue-600 border border-blue-200 uppercase tracking-widest">
                            🛒 SITE
                          </span>
                        )}
                        {order.stockControl === 'no_move' ? (
                          <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-gray-100 text-gray-500 border border-gray-200 uppercase tracking-wider">
                            🔘 SEM BAIXA
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-green-50 text-green-700 border border-green-200 uppercase tracking-wider">
                            📈 COM BAIXA
                          </span>
                        )}
                        {order.deliveryDate && (
                          <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-black text-[#eab308] uppercase tracking-wider border border-black/20">
                            📅 {order.deliveryDate.includes('-') ? order.deliveryDate.split('-').reverse().join('/') : order.deliveryDate}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle block: Customer name & compact items count */}
                    <div className="flex items-center gap-2 md:w-1/3 min-w-0">
                      <div className="truncate">
                        <span className="text-[11px] font-black uppercase text-black tracking-tight block md:inline truncate">{order.customerName}</span>
                        <span className="text-[9px] text-gray-400 font-bold md:ml-1.5 whitespace-nowrap">
                          ({(order.items || []).reduce((acc: number, item: any) => acc + (item.quantity || 1), 0)} un)
                        </span>
                      </div>
                    </div>

                    {/* Right block: Total, Status, and toggle */}
                    <div className="flex min-w-0 flex-col sm:flex-row sm:items-center justify-between md:justify-end gap-2 md:gap-4 border-t pt-2 md:pt-0 md:border-none border-black/5">
                      <div className="text-left md:text-right shrink-0">
                        <span className="text-[12px] font-black font-mono text-black">{formatOrderCardMoney(order.id, order.total)}</span>
                        <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider block leading-none mt-0.5">
                          {order.paymentMethod || 
                           (order.paymentMethodId === 'pix' || (order as any).payment_type_id === 'bank_transfer' ? 'PIX' : '') ||
                           (order.paymentMethodId === 'credit_card' || (order as any).payment_type_id === 'credit_card' ? 'CARTÃO' : '') ||
                           order.paymentMethodId?.toUpperCase() || 
                           'CARTÃO / PIX'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setToggledOrderValueIds((current) => {
                            const next = new Set(current);
                            if (next.has(order.id)) next.delete(order.id);
                            else next.add(order.id);
                            return next;
                          });
                        }}
                        className="inline-flex items-center justify-center gap-1 border border-black/15 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-gray-600 hover:border-black hover:text-black"
                        title={isOrderValueVisible(order.id) ? 'Ocultar valores deste pedido' : 'Ver valores deste pedido'}
                      >
                        {isOrderValueVisible(order.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                        {isOrderValueVisible(order.id) ? 'Ocultar R$' : 'Ver R$'}
                      </button>

                      {(() => {
                        const due = getOrderPendingAmount(order);
                        const paid = getCanonicalPaid(order);
                        const badgeType = getPaymentBadgeType(order);

                        return (
                          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                            {/* Clickable Financial Status Badge */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrderForFinancialDrawer(order);
                              }}
                              className="cursor-pointer transition-transform hover:scale-105"
                              title="Abrir Central Financeira deste pedido"
                            >
                              {badgeType === 'overdue' ? (
                                <span className="px-2 py-1 text-[8.5px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-300 flex items-center justify-center gap-1 shrink-0 shadow-xs animate-pulse">
                                  🚨 ATRASADO (Falta: {formatMoney(due)})
                                </span>
                              ) : badgeType === 'due_today' ? (
                                <span className="px-2 py-1 text-[8.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center gap-1 shrink-0 shadow-xs">
                                  ⏰ VENCE HOJE (Falta: {formatMoney(due)})
                                </span>
                              ) : badgeType === 'upcoming' ? (
                                <span className="px-2 py-1 text-[8.5px] font-black uppercase tracking-wider bg-red-50 text-red-700 border border-red-200 flex items-center justify-center gap-1 shrink-0 shadow-xs">
                                  🔴 A VENCER (Falta: {formatMoney(due)})
                                </span>
                              ) : badgeType === 'partial' ? (
                                <span className="px-2 py-1 text-[8.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center gap-1 shrink-0 shadow-xs">
                                  🟡 PAGAMENTO PARCIAL (Falta: {formatMoney(due)})
                                </span>
                              ) : badgeType === 'refunded' ? (
                                <span className="px-2 py-1 text-[8.5px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-300 flex items-center justify-center gap-1 shrink-0 shadow-xs">
                                  🟣 REEMBOLSADO
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-[8.5px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center gap-1 shrink-0 shadow-xs">
                                  ✅ PAGAMENTO APROVADO
                                </span>
                              )}
                            </button>

                            {/* Quick Button to Financial Drawer */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrderForFinancialDrawer(order);
                              }}
                              className="px-2 py-1 text-[8.5px] font-black uppercase tracking-wider bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black transition-colors cursor-pointer border border-[#eab308]/40 flex items-center gap-1 shrink-0"
                              title="Gerenciar pagamentos, estornos e ledger deste pedido"
                            >
                              💰 Financeiro
                            </button>

                            {/* Production Status Select */}
                            <select
                              onClick={(e) => e.stopPropagation()}
                              value={getAdminLifecycleStatus(order)}
                              onChange={async (e) => {
                                const newStatus = e.target.value;
                                try {
                                  await handleStatusUpdate(order, newStatus);
                                } catch (err: any) {
                                  toast.error(err.message || 'Erro ao atualizar o pedido.');
                                }
                              }}
                              className="w-full min-w-0 sm:w-auto px-2 py-1.5 text-[9px] font-black uppercase border border-black/30 bg-white text-black focus:outline-none focus:border-[#eab308] cursor-pointer"
                            >
                              <option value="payment_pending">⏳ Aguardando Pagamento</option>
                              <option value="payment_approved">✅ Pagamento Realizado</option>
                              <option value="separacao_corte">✂️ Separação e Preparação</option>
                              <option value="estamparia">🎨 Estamparia e Impressão</option>
                              <option value="embalagem">🔍 CQ e Embalagem</option>
                              <option value="ready">📦 Pronto para Envio</option>
                              <option value="shipped">🚚 Saiu para Entrega</option>
                              <option value="delivered">✅ Entregue</option>
                            </select>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {expandedOrders.includes(order.id) && (
                    <OrderProductionDrawer
                      order={order}
                      onStatusUpdate={async (orderId, newStatus) => {
                        await updateProductionStatus(orderId, newStatus, user?.email || 'Admin');
                        setOrders(prev => prev.map(o => o.id === orderId ? {
                          ...o,
                          productionStatus: newStatus,
                          production: { ...(o as any).production, status: newStatus }
                        } as any : o));
                      }}
                      onPrintLocalLabel={handlePrintLocalLabel}
                      onPrintProductionTicket={handlePrintProductionTicket}
                      onDeleteOrder={handleDeleteOrder}
                      onSaveCustomerDetails={async (id, details) => {
                        const customerDetails = {
                          customerName: details.customerName.trim(),
                          customerPhone: details.customerPhone.trim(),
                          customerEmail: details.customerEmail.trim(),
                        };
                        if (!customerDetails.customerName) throw new Error('Informe o nome do comprador.');
                        const batch = writeBatch(db);
                        batch.update(doc(db, 'orders', id), { ...customerDetails, updatedAt: serverTimestamp() });
                        batch.set(doc(collection(db, 'audit_logs')), {
                          date: new Date().toISOString(),
                          user: user?.email || 'Admin',
                          action: 'Correção dos dados do comprador',
                          details: `Pedido #${id}: nome, telefone e e-mail revisados.`,
                          createdAt: serverTimestamp(),
                        });
                        await batch.commit();
                        setOrders(previous => previous.map(entry => entry.id === id ? { ...entry, ...customerDetails } : entry));
                      }}
                      onSaveObservations={async (id, obs) => {
                        await updateDoc(doc(db, 'orders', id), { observations: obs });
                        setOrders(prev => prev.map(o => o.id === id ? { ...o, observations: obs } : o));
                      }}
                      onSaveDeliveryDate={async (id, dateStr) => {
                        await updateDoc(doc(db, 'orders', id), { deliveryDate: dateStr });
                        setOrders(prev => prev.map(o => o.id === id ? { ...o, deliveryDate: dateStr } : o));
                      }}
                      products={currentProducts}
                      stamps={catalogStamps}
                      onSaveOrderDetails={async (id, details) => {
                        await updateDoc(doc(db, 'orders', id), {
                          items: details.items,
                          origin: details.origin,
                          updatedAt: serverTimestamp(),
                        });
                        setOrders((previous) => previous.map((entry) => entry.id === id ? { ...entry, items: details.items, origin: details.origin } : entry));
                        await addAuditLog('Correção de pedido', `Pedido #${id}: produtos, estampas ou canal de venda atualizados.`);
                      }}
                    />
                  )}
                  {false && (
                    <>

                    <div className="md:col-span-4 space-y-4">
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-black flex items-center gap-2 group-hover:text-[#eab308] transition-colors cursor-default">
                          {order.customerName}
                        </h3>
                        <p className="text-[11px] text-gray-500 font-bold tracking-widest uppercase">{order.customerEmail || 'SEM E-MAIL'}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a 
                          href={`https://wa.me/${String(order.customerPhone || '').replace(/\D/g, '')}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-[#25D366] text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:brightness-95 transition-all"
                        >
                          <MessageCircle size={12} /> WhatsApp
                        </a>
                        {order.customerPhone2 && (
                          <a 
                            href={`https://wa.me/${String(order.customerPhone2).replace(/\D/g, '')}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-[#128C7E] text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:brightness-95 transition-all"
                          >
                            <MessageCircle size={12} /> WhatsApp 2
                          </a>
                        )}
                        <a 
                          href={`mailto:${order.customerEmail}`} 
                          className="flex items-center gap-2 bg-black text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all"
                        >
                          <Mail size={12} /> E-mail
                        </a>
                      </div>

                      <div className="bg-black/[0.02] border-l-2 border-[#eab308] p-4 text-[11px]">
                        <p className="text-[9px] font-black uppercase text-gray-400 mb-2 tracking-[0.2em]">Destino</p>
                        {order.address && typeof order.address === 'object' ? (
                          <div className="font-medium text-gray-700 leading-relaxed uppercase">
                            <p className="font-black text-black">{(order.address as any).street || 'Rua não informada'}, {order.number || (order.address as any).number || 'S/N'}</p>
                            {(order.complement || (order.address as any).complement) && <p>Complemento: {order.complement || (order.address as any).complement}</p>}
                            <p>{(order.address as any).neighborhood || ''} — {(order.address as any).city || ''}/{(order.address as any).state || ''}</p>
                            <p className="mt-1 text-gray-400">CEP: {(order.address as any).cep || ''}</p>
                          </div>
                        ) : (
                          <div className="font-medium text-gray-700 leading-relaxed uppercase">
                            <p className="font-black text-black">{order.address || 'Endereço não informado'}, {order.number || 'S/N'}</p>
                            {order.complement && <p>Complemento: {order.complement}</p>}
                            <p>{order.neighborhood || ''} — {order.city || ''}/{order.state || ''}</p>
                            <p className="mt-1 text-gray-400">CEP: {order.cep || ''}</p>
                          </div>
                        )}
                        {((order.cep && isJoinvilleCEP(order.cep)) || String(order.city || '').toLowerCase() === 'joinville') && (
                          <div className="mt-3 bg-[#eab308]/10 border border-[#eab308]/30 px-3 py-2 text-[9px] uppercase font-black tracking-widest text-[#eab308] flex items-center gap-1.5 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#eab308] animate-pulse" />
                            Entrega Manual: Entrega Local F PAC
                          </div>
                        )}
                        {order.deliveryDate && (
                          <div className="mt-3 bg-black text-[#eab308] p-3 text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                            <span>📅 DATA DE ENTREGA:</span>
                            <span className="text-white">{order.deliveryDate.includes('-') ? order.deliveryDate.split('-').reverse().join('/') : order.deliveryDate}</span>
                          </div>
                        )}
                        {order.observations && (
                          <div className="mt-3 bg-[#f3f4f6] border border-black/5 p-3 text-[10px] uppercase font-black tracking-widest leading-normal rounded">
                            <span className="text-gray-400 block mb-1 text-[8px]">📝 Observações:</span>
                            <span className="text-gray-700 font-bold normal-case block whitespace-pre-wrap">{order.observations}</span>
                          </div>
                        )}
                        {order.isManual && (
                          <div className="mt-3 bg-[#f3f4f6] border border-black/5 p-3 text-[10px] uppercase font-black tracking-widest leading-normal rounded">
                            <span className="text-gray-400 block mb-2 text-[8px]">💬 Notificações WhatsApp:</span>
                            <div className="space-y-1.5 normal-case font-bold mb-3">
                              {order.whatsappLogs && order.whatsappLogs.length > 0 ? (
                                order.whatsappLogs.map((log: any, idx: number) => (
                                  <div key={idx} className={cn("text-[10px]", log.status === 'success' ? "text-green-600" : "text-red-600")}>
                                    <span>{log.status === 'success' ? '✅' : '❌'} {log.message}</span>
                                    {log.error && <p className="text-[8.5px] text-gray-500 font-mono mt-0.5 ml-4">Motivo: {log.error}</p>}
                                    <span className="text-[8px] text-gray-400 block ml-4">{log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : ''}</span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-gray-400 text-[9px] italic">Nenhuma notificação automática enviada ainda para este pedido.</p>
                              )}
                            </div>
                            
                            <button
                              onClick={async () => {
                                toast.promise(
                                  authenticatedFetch('/api/automation/send-manual-order-whatsapp', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ orderId: order.id })
                                  }).then(async (res) => {
                                    const data = await res.json();
                                    if (!res.ok || !data.success) {
                                      throw new Error(data.error || "Falha ao enviar mensagem");
                                    }
                                    return data;
                                  }),
                                  {
                                    loading: 'Enviando notificação WhatsApp...',
                                    success: 'Notificação enviada com sucesso!',
                                    error: (err: any) => `Falha no envio: ${err.message}`
                                  }
                                );
                              }}
                              className="w-full bg-black text-[#eab308] py-2 px-3 text-[8.5px] font-black uppercase tracking-widest hover:text-white transition-all flex items-center justify-center gap-1.5 shadow"
                            >
                              💬 Enviar/Reenviar Notificação de Pedido Criado
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="md:col-span-5 border-y md:border-y-0 md:border-x border-black/5 md:px-8 py-6 md:py-0">
                      <p className="text-[9px] font-black uppercase text-gray-400 mb-4 tracking-[0.2em]">Conteúdo do Pedido</p>
                      <div className="space-y-3">
                        {(order.items || []).map((item, idx) => (
                          <div key={idx} className="flex gap-4 items-start border-b border-black/5 pb-3 last:border-0 last:pb-0">
                            <div className="w-10 h-10 bg-black/5 flex-shrink-0 flex items-center justify-center overflow-hidden border border-black/5 rounded bg-white">
                              {item.image ? (
                                <img 
                                  src={item.image} 
                                  alt={item.name} 
                                  className="w-full h-full object-contain p-0.5" 
                                  referrerPolicy="no-referrer" 
                                />
                              ) : (
                                <span className="text-[8px] font-black text-black/20 uppercase">IMG</span>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-[11px] font-black uppercase leading-none mb-1">{item.name}</p>
                              {item.sku && <p className="mb-1 text-[8px] font-bold uppercase tracking-wide text-[#9a7100]">Ref.: {item.sku}</p>}
                              <div className="flex gap-2 text-[9px] font-bold text-gray-400 uppercase">
                                <span>Cor: <span className="text-black">{item.color}</span></span>
                                <span>|</span>
                                <span>Tam: <span className="text-black">{item.size}</span></span>
                                <span>|</span>
                                <span>Qtd: <span className="text-black">{item.quantity}</span></span>
                              </div>

                      <PrimeOrderPlacements item={item} />
                              {/* PRIME CUSTOM Print Configs */}
                              {Array.isArray(item.printConfigs) && item.printConfigs.length > 0 && (
                                <div className="mt-2 bg-black/5 p-2 rounded border border-black/10 text-[9px] space-y-1">
                                  <div className="flex items-center justify-between text-[#eab308] font-black uppercase tracking-wider">
                                    <span>{item.customProduct ? '🎨 PERSONALIZADO' : '✨ PRIME CUSTOM'} ({item.printConfigs.length} estampas):</span>
                                    {!item.customProduct && <a
                                      href="/prime" 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-[8px] bg-black text-white px-2 py-0.5 rounded font-bold hover:bg-[#eab308] hover:text-black transition-colors"
                                    >
                                      Reabrir no Construtor ↗
                                    </a>}
                                  </div>
                                  {item.printConfigs.map((pc: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between text-gray-700 bg-white p-1 rounded border border-gray-200">
                                      <div className="flex items-center gap-1.5 overflow-hidden">
                                        {pc.image && <img src={pc.image} alt={pc.stamp} className="w-5 h-5 rounded object-cover bg-black" />}
                                        <span className="font-bold truncate">{pc.stamp || 'Estampa'}</span>
                                        {pc.source === 'own_art' && isPrivateManualArtworkUrl(pc.image) && <a href={pc.image} target="_blank" rel="noopener noreferrer" className="shrink-0 font-black text-blue-700 underline">Abrir arte</a>}
                                      </div>
                                      <div className="flex items-center gap-2 text-gray-500 font-mono">
                                        <span className="bg-gray-100 px-1 py-0.5 rounded text-[8px] font-bold">{pc.location || 'Peito'}</span>
                                        <span className="bg-gray-100 px-1 py-0.5 rounded text-[8px] font-bold">{pc.printSize || '10x10'}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                               <p className="text-[11px] font-black tracking-tighter">{formatMoney(item.price * item.quantity)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Summary & Actions */}
                    <div className="md:col-span-3 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex flex-col gap-1 items-end">
                          <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Valor do Pedido</p>
                          <p className="text-2xl font-black tracking-tighter uppercase italic">{formatMoney(order.total)}</p>
                          <p className="text-[10px] font-bold text-[#eab308] uppercase tracking-widest">
                            {order.paymentMethod || 
                             (order.paymentMethodId === 'pix' || (order as any).payment_type_id === 'bank_transfer' ? 'PIX' : '') ||
                             (order.paymentMethodId === 'credit_card' || (order as any).payment_type_id === 'credit_card' ? 'CARTÃO DE CRÉDITO' : '') ||
                             order.paymentMethodId?.toUpperCase() || 
                             'CARTÃO / PIX'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-8 space-y-2">
                        {/* Status Quick Actions */}
                        {isAdminPaymentPending(order) && (
                          <button 
                            onClick={() => handleStatusUpdate(order, 'approved')} 
                            className="w-full bg-green-600 text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-green-600/20"
                          >
                            Aprovar Pagamento
                          </button>
                        )}
                        {isAdminOrderPaid(order) && getAdminProductionStage(order).id === 'waiting' && getAdminShippingStatus(order) === 'pending' && (
                          <button 
                            onClick={() => handleStatusUpdate(order, 'separacao_corte')} 
                            className="w-full bg-blue-600 text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-blue-600/20"
                          >
                            Iniciar Separação
                          </button>
                        )}
                        {getAdminProductionStage(order).id === 'separacao_corte' && (
                          <button 
                            onClick={() => handleStatusUpdate(order, 'estamparia')}
                            className="w-full bg-indigo-600 text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-indigo-600/20"
                          >
                            Iniciar Estamparia
                          </button>
                        )}
                        {getAdminProductionStage(order).id === 'embalagem' && (() => {
                          const isJoinvilleLocal = (order.cep && isJoinvilleCEP(order.cep)) || String(order.city || '').toLowerCase() === 'joinville';
                          return (
                            <div className="space-y-4">
                              {/* TRIAGEM LOGÍSTICA INTELIGENTE */}
                              <div className="bg-black text-[#eab308] p-3 text-[10px] font-black uppercase tracking-widest text-center flex flex-col gap-1 rounded">
                                <span>🗺️ TRIAGEM LOGÍSTICA DE CEP</span>
                                <span className="text-[8px] font-bold text-gray-400 normal-case">
                                  {isJoinvilleLocal 
                                    ? "CEP de Joinville-SC identificado. Sugerida Trilha Local (Etiqueta A)." 
                                    : "CEP Externo/Nacional identificado. Sugerida Trilha Nacional (Etiqueta B)."
                                  }
                                </span>
                              </div>

                              {/* MODALIDADE LOCAL: ETIQUETA A */}
                              <div className={`p-3 border rounded space-y-2 ${isJoinvilleLocal ? 'border-[#eab308] bg-[#eab308]/5' : 'border-black/5 bg-gray-50'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-black">🏍️ Modelo A: Entrega Local</span>
                                  {isJoinvilleLocal && (
                                    <span className="bg-black text-[#eab308] px-1.5 py-0.5 text-[8px] font-bold rounded">★ RECOMENDADO</span>
                                  )}
                                </div>
                                <p className="text-[9px] text-gray-500 leading-normal font-sans">
                                  Gera etiqueta de remessa simplificada direta para motorista ou motoboy. Não consome créditos nem aciona APIs externas.
                                </p>
                                <button 
                                  onClick={() => handlePrintLocalLabel(order)} 
                                  className="hidden sm:flex w-full bg-black text-[#eab308] py-2.5 text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-black/90 transition-all shadow items-center justify-center gap-2"
                                >
                                  🖨️ Imprimir Etiqueta A (Local)
                                </button>
                                <button
                                  onClick={() => handleDownloadLocalLabelPdf(order)}
                                  className="sm:hidden w-full bg-black text-[#eab308] py-2.5 text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-black/90 transition-all shadow flex items-center justify-center gap-2"
                                >
                                  📄 Baixar Etiqueta 10×15 (Celular)
                                </button>
                              </div>

                              {/* MODALIDADE NACIONAL: ETIQUETA B */}
                              <div className={`p-3 border rounded space-y-2.5 ${!isJoinvilleLocal ? 'border-orange-500 bg-orange-50/20' : 'border-black/5 bg-gray-50'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-black">📦 Modelo B: Melhor Envio</span>
                                  {!isJoinvilleLocal && (
                                    <span className="bg-orange-500 text-white px-1.5 py-0.5 text-[8px] font-bold rounded">★ RECOMENDADO</span>
                                  )}
                                </div>
                                <p className="text-[9px] text-gray-500 leading-normal font-sans">
                                  Integração direta com o carrinho do Melhor Envio para cotizar e gerar a etiqueta de Correios ou Jadlog por lá.
                                </p>
                                <div className="space-y-1 bg-white p-2 border border-black/5 rounded">
                                  <label className="text-[8px] font-black uppercase text-gray-400 tracking-wider block">Serviço de Envio</label>
                                  <select 
                                    defaultValue={order.shippingServiceId || 2}
                                    onChange={(e) => {
                                      order.shippingServiceId = Number(e.target.value);
                                    }}
                                    className="w-full bg-white text-black border border-black/10 px-2 py-1.5 text-[10px] font-bold uppercase outline-none focus:border-[#eab308]"
                                  >
                                    <option value={1}>Correios PAC</option>
                                    <option value={2}>Correios SEDEX</option>
                                    <option value={3}>Jadlog Package</option>
                                    <option value={4}>Jadlog .COM</option>
                                    <option value={17}>Jamef</option>
                                    <option value={16}>Latam Cargo</option>
                                  </select>
                                </div>
                                <button 
                                  onClick={() => handleMelhorEnvioLabel(order)} 
                                  className="w-full bg-orange-500 text-white py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow flex items-center justify-center gap-2"
                                >
                                  <Truck size={14} /> Gerar Etiqueta B (Melhor Envio)
                                </button>
                              </div>

                              <button 
                                onClick={() => handleStatusUpdate(order, 'shipped')} 
                                className="w-full bg-[#9333ea] text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-purple-600/20 mt-2"
                              >
                                {isJoinvilleLocal ? '🚀 Iniciar Envio Local' : '🚀 Informar Envio'}
                              </button>
                            </div>
                          );
                        })()}
                        {isAdminOrderShipped(order) && (
                          <button 
                            onClick={() => handleStatusUpdate(order, 'delivered')} 
                            className="w-full bg-black text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all shadow-lg"
                          >
                            Marcar Entregue
                          </button>
                        )}
                        {isAdminOrderDelivered(order) && (
                          <button 
                            onClick={() => {
                               const name = order.customerName.split(' ')[0].toUpperCase();
                               const msg = `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nFala ${name}!\n\n🎉 *SEU PEDIDO JÁ FOI ENTREGUE!* 🎉\n\nEsperamos de verdade que você curta muito a sua nova peça F PAC STORE. Ela foi pioneira para trazer estética, identidade e atitude para seu guarda-roupa! 🔥\n\n📸 *NO INSTAGRAM:*\nQuando vestir sua nova peça, tire uma foto irada e marque a gente no Instagram *@f_pac_store*. Vamos adorar repostar você! \n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🌟CANAIS OFICIAIS F PAC STORE:\n🌐 Site Oficial:www.fpacstore.com.br\n📸 Instagram: @f_pac_store\n💬 WhatsApp Oficial: (47) 99746-5602\n📍 Loja/Expedição em Joinville/SC\n🛡️Esta é uma mensagem automática de suporte e acompanhamento de pedido.`;
                               window.open(`https://wa.me/${order.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                            }}
                            className="w-full bg-[#eab308] text-black py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-[#eab308] transition-all shadow-lg"
                          >
                            Pós-Venda (WhatsApp)
                          </button>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={() => {
                              toast.promise(
                                triggerStatusEmail(order, (order as any).shipping?.status || order.shippingStatus || (order as any).production?.status || order.productionStatus || order.paymentStatus || order.status),
                                {
                                  loading: 'Enviando e-mail...',
                                  success: 'E-mail enviado!',
                                  error: 'Erro ao enviar e-mail'
                                }
                              )
                            }}
                            className="bg-gray-50 border border-black/10 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1"
                          >
                            <RefreshCw size={10} /> Reenviar E-mail
                          </button>
                          
                          {confirmDeleteId === order.id ? (
                            <button 
                              onClick={() => handleDeleteOrder(order.id)} 
                              className="bg-red-600 text-white py-2 text-[8px] font-black uppercase tracking-widest animate-pulse"
                            >
                              Confirmar?
                            </button>
                          ) : (
                            <button 
                              onClick={() => setConfirmDeleteId(order.id)} 
                              className="bg-red-50 text-red-600 border border-red-100 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-1"
                            >
                              <Trash2 size={10} /> Excluir
                            </button>
                          )}
                        </div>

                        {isAdminPaymentPending(order) && order.gateway === 'mercadopago' && (
                          <button 
                            onClick={async () => {
                              try {
                                const resp = await authenticatedFetch(`/api/checkout/verify/${order.id}`);
                                const data = await parseApiJson<any>(resp);
                                if (!resp.ok) throw new Error(data.message || data.error || 'Falha ao consultar pagamento.');
                                if (data.paymentStatus === 'approved' || data.status === 'payment_approved') {
                                  toast.success("Pagamento confirmado via consulta!");
                                } else if (data.paymentStatus === 'cancelled' || data.status === 'cancelled') {
                                  toast.error("Pagamento recusado/cancelado via consulta.");
                                } else {
                                  toast.error(`Status atual: ${data.paymentStatus || 'Pendente'}`);
                                }
                              } catch (e) {
                                toast.error("Erro ao consultar Mercado Pago");
                              }
                            }}
                            className="w-full bg-[#f7c600] text-black py-2 text-[8px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1 shadow-lg shadow-[#f7c600]/10"
                          >
                            <RefreshCw size={10} /> Sincronizar MP
                          </button>
                        )}

                        {!isAdminOrderCancelled(order) && !isAdminOrderDelivered(order) && (
                           <button 
                            onClick={() => handleStatusUpdate(order, 'cancelled')} 
                            className="w-full text-gray-400 py-2 text-[8px] font-bold uppercase tracking-widest hover:text-red-500 transition-colors"
                           >
                            Cancelar Pedido
                           </button>
                        )}
                      </div>
                    </div>
                  </>
                  )}
                </motion.div>
              ))
            )}
          </div>
          </>
          )}

          {/* Render Reports Sub-view */}
          {orderSubView === 'reports' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="bg-black text-white p-8 space-y-4">
                <h2 className="text-xl font-black uppercase tracking-widest italic">Painel de Performance e Canais (BI)</h2>
                <p className="text-[10px] text-[#eab308] font-bold uppercase tracking-widest">
                  Análise gerencial em tempo real de vendas manuais integradas e e-commerce
                </p>

                {/* Filtros de Relatórios */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-white/10 text-black">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Período</label>
                    <select 
                      value={repPeriod} 
                      onChange={e => setRepPeriod(e.target.value)}
                      className="bg-white py-2 px-3 border border-gray-300 rounded-none text-xs font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="today">Hoje</option>
                      <option value="7days">Últimos 7 dias</option>
                      <option value="30days">Últimos 30 dias</option>
                      <option value="thisMonth">Este Mês</option>
                      <option value="lastMonth">Mês Anterior</option>
                      <option value="all">Todo Histórico</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Produto</label>
                    <select 
                      value={repProduct} 
                      onChange={e => setRepProduct(e.target.value)}
                      className="bg-white py-2 px-3 border border-gray-300 rounded-none text-xs font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      {currentProducts.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Modelo</label>
                    <select 
                      value={repModel} 
                      onChange={e => setRepModel(e.target.value)}
                      className="bg-white py-2 px-3 border border-gray-300 rounded-none text-xs font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      <option value="force">FORCE</option>
                      <option value="mark">MARK</option>
                      <option value="prime">PRIME</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Canal</label>
                    <select 
                      value={repChannel} 
                      onChange={e => setRepChannel(e.target.value)}
                      className="bg-white py-2 px-3 border border-gray-300 rounded-none text-xs font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      <option value="Site">Site</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Instagram">Instagram</option>
                      <option value="Facebook">Facebook</option>
                      <option value="Loja Física">Loja Física</option>
                      <option value="Indicação">Indicação</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Pagamento</label>
                    <select 
                      value={repStatus} 
                      onChange={e => setRepStatus(e.target.value)}
                      className="bg-white py-2 px-3 border border-gray-300 rounded-none text-xs font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      <option value="paid">Pago / Aprovado</option>
                      <option value="pending">Aguardando Pagamento</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Detailed Financial Stats (Phase 5 of Audit) - Unified in BI Panel */}
              <div className="bg-black text-white p-8 space-y-8 border-2 border-[#eab308]/20">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                    <div className="space-y-1">
                       <h2 className="text-xl font-black uppercase tracking-widest italic flex items-center gap-2">
                          <CheckCircle size={18} className="text-[#eab308]" /> Análise Financeira Real (Auditada)
                       </h2>
                       <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                          Resultados gerenciais consolidados baseados em custos reais e filtros ativos
                       </p>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/20 text-[8px] font-black uppercase tracking-widest self-start sm:self-center">
                       🔒 Auditoria de Custos Reais Ativa
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="space-y-1">
                       <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Faturamento Líquido</p>
                       <p className="text-3xl font-black italic tracking-tighter text-[#eab308]">
                          {formatMoney(reportData.revenue)}
                       </p>
                       <p className="text-[8px] text-gray-400 uppercase font-medium">Aprovado no período</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Custo de Mercadoria (COGS)</p>
                       <p className="text-3xl font-black italic tracking-tighter text-red-400">
                          {formatMoney(reportData.cogs)}
                       </p>
                       <p className="text-[8px] text-gray-400 uppercase font-medium">Base unitária de insumos</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Despesas Variáveis (Taxas + Frete Subsidiado)</p>
                       <p className="text-3xl font-black italic tracking-tighter text-orange-400">
                          {formatMoney(reportData.gatewayFees + reportData.shippingSubsidy)}
                       </p>
                       <p className="text-[8px] text-gray-400 uppercase font-medium">Taxas gateway + frete subsidiado</p>
                    </div>
                    <div className="space-y-1 bg-white/5 p-4 border border-white/10">
                       <p className="text-[9px] font-black uppercase text-[#eab308] tracking-widest">Margem de Contribuição Real</p>
                       <p className="text-3xl font-black italic tracking-tighter text-green-400">
                          {formatMoney(reportData.contributionMargin)}
                       </p>
                       <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                          <span className="text-[8px] font-bold text-gray-400 uppercase">Margem Operacional</span>
                          <span className="text-[10px] font-black text-green-400">
                             {formatPercent(reportData.marginPercent)}
                          </span>
                       </div>
                    </div>
                 </div>

                 {/* Secondary Row: Stock and Inventory Audit */}
                 <div className="border-t border-white/10 pt-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                       <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308] italic flex items-center gap-1.5">
                          📦 Controle de Fluxo & Movimentação de Estoque
                       </h3>
                       <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">
                          Impacto das baixas de inventário no período filtrado
                       </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                       <div className="bg-white/[0.03] p-4 border border-white/5 hover:border-green-500/20 transition-all">
                          <p className="text-[8px] font-black uppercase text-green-400 tracking-widest mb-1">📉 COM BAIXA DE ESTOQUE</p>
                          <div className="flex justify-between items-baseline gap-2">
                             <p className="text-xl font-black italic text-white">{reportData.ordersWithStockMove} Ped.</p>
                             <p className="text-xs font-black text-green-400 font-mono">
                                {formatMoney(reportData.ordersWithStockMoveRevenue)}
                             </p>
                          </div>
                          <p className="text-[7.5px] font-bold text-gray-500 uppercase mt-1">Estoque faturado e baixado</p>
                        </div>

                       <div className="bg-white/[0.03] p-4 border border-white/5 hover:border-gray-500/20 transition-all">
                          <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest mb-1">🔘 SEM BAIXA DE ESTOQUE</p>
                          <div className="flex justify-between items-baseline gap-2">
                             <p className="text-xl font-black italic text-white">{reportData.ordersWithoutStockMove} Ped.</p>
                             <p className="text-xs font-black text-gray-400 font-mono">
                                {formatMoney(reportData.ordersWithoutStockMoveRevenue)}
                             </p>
                          </div>
                          <p className="text-[7.5px] font-bold text-gray-500 uppercase mt-1">Vendas faturadas s/ baixa de estoque</p>
                       </div>

                       <div className="bg-white/[0.03] p-4 border border-white/5 hover:border-[#eab308]/20 transition-all">
                          <p className="text-[8px] font-black uppercase text-[#eab308] tracking-widest mb-1">📦 QTD TOTAL MOVIMENTADA</p>
                          <p className="text-xl font-black italic text-white">{reportData.totalStockMovedQty} un.</p>
                          <p className="text-[7.5px] font-bold text-gray-500 uppercase mt-1">Soma de itens com baixa automática</p>
                       </div>

                       <div className="bg-white/[0.03] p-4 border border-white/5 hover:border-red-500/20 transition-all">
                          <p className="text-[8px] font-black uppercase text-red-400 tracking-widest mb-1">🚫 QTD TOTAL NÃO MOVIMENTADA</p>
                          <p className="text-xl font-black italic text-white">{reportData.totalStockNotMovedQty} un.</p>
                          <p className="text-[7.5px] font-bold text-gray-500 uppercase mt-1">Soma de itens sem baixa de inventário</p>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Channels Representation and Top Selling Products */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Canal Sales Graph */}
                <div className="bg-white border border-black/10 p-6 space-y-4 shadow-sm">
                  <h3 className="text-xs font-black uppercase tracking-widest border-b border-black/5 pb-2">Vendas por Canal (Total Faturado)</h3>
                  <div className="space-y-4">
                    {Object.entries(reportData.channelSales).length === 0 ? (
                      <p className="text-xs font-bold text-gray-400 uppercase py-6 text-center">Nenhuma venda faturada neste filtro</p>
                    ) : (
                      Object.entries(reportData.channelSales)
                        .sort((a: any, b: any) => b[1].total - a[1].total)
                        .map(([channel, metrics]: any) => {
                          const totalPct = reportData.revenue > 0 ? (metrics.total / reportData.revenue) * 105 : 0;
                          return (
                            <div key={channel} className="space-y-1">
                              <div className="flex justify-between text-[10px] font-bold uppercase">
                                <span className="font-black text-black">{channel} ({metrics.count} ped.)</span>
                                <span className="font-mono text-gray-600">{formatMoney(metrics.total)} ({formatPercent(Math.min(100, totalPct / 1.05))})</span>
                              </div>
                              <div className="w-full bg-gray-100 h-2.5 rounded-none">
                                <div 
                                  className="bg-black h-2.5 transition-all duration-500" 
                                  style={{ width: `${Math.min(100, Math.max(2, totalPct / 1.05))}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* Top Selling Products Graph & List */}
                <div className="bg-white border border-black/10 p-6 space-y-4 shadow-sm">
                  <h3 className="text-xs font-black uppercase tracking-widest border-b border-black/5 pb-2">Artigos Mais Vendidos (Vol. Unidades)</h3>
                  <div className="space-y-4">
                    {Object.entries(reportData.productSales).length === 0 ? (
                      <p className="text-xs font-bold text-gray-400 uppercase py-6 text-center">Nenhum produto faturado no período</p>
                    ) : (
                      Object.entries(reportData.productSales)
                        .sort((a: any, b: any) => b[1].qty - a[1].qty)
                        .slice(0, 5)
                        .map(([prodName, metrics]: any) => {
                          const maxQty = Math.max(...Object.values(reportData.productSales).map((m: any) => m.qty));
                          const barPct = maxQty > 0 ? (metrics.qty / maxQty) * 100 : 0;
                          return (
                            <div key={prodName} className="space-y-1">
                              <div className="flex justify-between text-[10px] font-bold uppercase">
                                <span className="truncate max-w-[200px] font-black text-black" title={prodName}>{prodName}</span>
                                <span className="font-mono text-gray-600">{metrics.qty} un. | {formatMoney(metrics.revenue)}</span>
                              </div>
                              <div className="w-full bg-gray-100 h-2 rounded-none">
                                <div 
                                  className="bg-[#eab308] h-2 transition-all duration-500" 
                                  style={{ width: `${Math.min(100, Math.max(3, barPct))}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>

              {/* Rentabilidade Detalhada view */}
              <div className="bg-white border border-black/10 p-6 space-y-4 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-widest border-b border-black/5 pb-2">Análise de Lucro Bruto por Tipo de Produto</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px] uppercase">
                    <thead>
                      <tr className="border-b border-black font-black text-gray-400">
                        <th className="py-2.5">Nome do Artigo</th>
                        <th className="py-2.5 text-center">Qtd Vendida</th>
                        <th className="py-2.5 text-right">Faturamento</th>
                        <th className="py-2.5 text-right">Custo Mercadoria</th>
                        <th className="py-2.5 text-right">Lucro Bruto</th>
                        <th className="py-2.5 text-right">Margem Bruta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {(!reportData.rankedProducts || reportData.rankedProducts.filter((p: any) => p.unitsSold > 0 || p.totalRevenue > 0).length === 0) ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-gray-400 font-bold uppercase">Nenhum dado para exibir</td>
                        </tr>
                      ) : (
                        reportData.rankedProducts
                          .filter((p: any) => p.unitsSold > 0 || p.totalRevenue > 0)
                          .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
                          .map((p: any) => {
                            return (
                              <tr key={p.slug || p.id} className="hover:bg-gray-50 transition-colors">
                                <td className="py-3 font-black text-black">{p.name}</td>
                                <td className="py-3 text-center font-bold">{p.unitsSold}</td>
                                <td className="py-3 text-right font-mono font-bold">{formatMoney(p.totalRevenue)}</td>
                                <td className="py-3 text-right font-mono font-medium text-red-500">{formatMoney(p.totalCogs)}</td>
                                <td className="py-3 text-right font-mono font-bold text-green-600">{formatMoney(p.grossProfit)}</td>
                                <td className="py-3 text-right font-mono font-black text-[#eab308]">{formatPercent(p.marginPercent)}</td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Render Logs Timeline Sub-view */}
          {orderSubView === 'logs' && (
            <div className="space-y-6">
              <div className="bg-black text-white p-8">
                <h2 className="text-xl font-black uppercase tracking-widest italic">Histórico de Auditoria de Operações</h2>
                <p className="text-[10px] text-[#eab308] font-bold uppercase tracking-widest mt-1">
                  Trilha à prova de fraudes para conformidade de estoque, faturamento e modificações manuais
                </p>
              </div>

              <div className="bg-white border border-black/10 p-6 space-y-4 shadow-sm">
                <div className="flex justify-between items-center pb-2 border-b border-black/10">
                  <h3 className="text-xs font-black uppercase tracking-widest">Trilha de Auditoria Recente ({auditLogs.length} eventos)</h3>
                  <span className="text-[9px] font-bold text-gray-500 uppercase">ATUALIZADO EM TEMPO REAL</span>
                </div>

                <div className="divide-y divide-black/5 max-h-[600px] overflow-y-auto">
                  {auditLogs.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 uppercase font-black tracking-widest border border-dashed border-gray-200">
                      Nenhuma movimentação registrada nesta sessão
                    </div>
                  ) : (
                    auditLogs.map((log: any) => {
                      const logDateStr = log.date ? new Date(log.date).toLocaleString('pt-BR') : '';
                      return (
                        <div key={log.id} className="py-4 hover:bg-gray-50 transition-all font-sans px-2 grid grid-cols-1 md:grid-cols-12 gap-4 items-start text-[11px] uppercase">
                          <div className="md:col-span-3 font-mono text-gray-400 font-bold leading-tight">
                            {logDateStr}
                          </div>
                          <div className="md:col-span-3 flex flex-col gap-0.5">
                            <span className={cn(
                              "px-2 py-0.5 text-[8px] font-black tracking-wider self-start border",
                              log.action === 'Exclusão de Pedido' ? 'bg-red-50 text-red-600 border-red-200' :
                              log.action === 'Alteração de Status' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                              'bg-green-50 text-green-600 border-green-200'
                            )}>
                              {log.action}
                            </span>
                            <span className="text-[8px] font-bold text-gray-400 lowercase">{log.user}</span>
                          </div>
                          <div className="md:col-span-6 font-bold leading-relaxed text-black/80 normal-case pr-4">
                            {log.details}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'production' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Central de Produção...</div>}>
          <AdminProductionCenter orders={orders} currentUserEmail={user?.email || 'Admin'} />
        </React.Suspense>
      ) : activeTab === 'shipping' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Central de Expedição...</div>}>
          <AdminShippingCenter orders={orders} currentUserEmail={user?.email || 'Admin'} />
        </React.Suspense>
      ) : activeTab === 'receivables' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Central Financeira...</div>}>
          <AdminFinancial initialSubTab="receivables" />
        </React.Suspense>
      ) : activeTab === 'stock_center' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Gestão de Estoque...</div>}>
          <AdminStockCenter />
        </React.Suspense>
      ) : activeTab === 'inventory_audit' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Inventário...</div>}>
          <InventoryAuditCenter operator={user?.email || 'Administrador'} />
        </React.Suspense>
      ) : activeTab === 'identity' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Gerenciador de Mídias...</div>}>
          <AdminSiteMediaManager />
        </React.Suspense>
      ) : activeTab === 'customer_identity' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Identidades dos Clientes...</div>}>
          <AdminCustomerIdentity />
        </React.Suspense>
      ) : activeTab === 'intelligence' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Inteligência & CRM...</div>}>
          <AdminIntelligenceCRM />
        </React.Suspense>
      ) : activeTab === 'notifications' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Notificações de Produção...</div>}>
          <ProductionNotificationsAdmin />
        </React.Suspense>
      ) : activeTab === 'promotions' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Promoções...</div>}>
          <AdminPromotions />
        </React.Suspense>
      ) : activeTab === 'loyalty' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Programa de Fidelidade...</div>}>
          <AdminLoyaltyManager orders={orders} />
        </React.Suspense>
      ) : activeTab === 'music' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Rádio F PAC...</div>}>
          <AdminMusic />
        </React.Suspense>
      ) : (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Financeiro...</div>}>
          <AdminFinancial />
        </React.Suspense>
      )}
      </div>

      {/* CONFIGURAÇÃO MELHOR ENVIO MODAL */}
      <AnimatePresence>
        {isMelhorEnvioModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-55 overflow-y-auto flex items-start justify-center p-2 sm:p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="my-2 sm:my-4 bg-white text-black border-2 border-black max-w-lg w-full p-4 sm:p-6 md:p-8 shadow-2xl relative space-y-6 max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <div className="flex gap-3 justify-between items-start border-b border-black/10 pb-4">
                <div className="min-w-0">
                  <h2 className="text-base sm:text-xl font-black uppercase tracking-wider sm:tracking-widest italic flex items-center gap-2">
                    <Truck className="text-orange-500" size={24} /> Configurar Melhor Envio
                  </h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                    Cole o token, valide a conexão e ative a integração
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setMeToken('');
                    setMeTokenVisible(false);
                    setIsMelhorEnvioModalOpen(false);
                  }}
                  className="shrink-0 text-gray-500 hover:text-black font-black uppercase text-[10px] border border-gray-200 px-2.5 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  Fechar [X]
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1 bg-gray-50 p-3 border border-black/5 rounded">
                  <p className="text-[10px] font-black uppercase text-gray-400">Status da Integração (Secret Manager)</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-3 h-3 rounded-full ${meHasToken ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                    <span className="text-xs font-black uppercase">
                      {meHasToken ? 'INTEGRAÇÃO ATIVA — TOKEN PROTEGIDO' : 'INTEGRAÇÃO PENDENTE — INFORME O TOKEN'}
                    </span>
                  </div>
                </div>

                {!meHasToken && (
                  <div className="p-3 bg-amber-50 border border-amber-300 text-amber-950 text-[11px] leading-relaxed">
                    <p className="font-black uppercase text-[10px] mb-1">Ação necessária</p>
                    Selecione o ambiente correspondente ao token, cole a credencial abaixo e toque em <strong>Validar e conectar</strong>.
                  </div>
                )}

                <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-900 text-[11px] leading-relaxed">
                  <p className="font-bold uppercase text-[10px] text-blue-800 mb-1">🔐 Credencial protegida</p>
                  O token é enviado diretamente ao backend autenticado, validado no Melhor Envio e guardado em uma coleção exclusiva do servidor. Ele nunca é devolvido ao navegador nem fica disponível pelo painel do Firebase.
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">Ambiente Autorizado / Base URL</label>
                  <select 
                    value={meBaseUrl}
                    onChange={(e) => setMeBaseUrl(e.target.value)}
                    className="w-full bg-white text-black border border-black/10 px-3 py-2 text-xs font-bold uppercase outline-none focus:border-[#eab308]"
                  >
                    <option value="https://melhorenvio.com.br">Produção (melhorenvio.com.br)</option>
                    <option value="https://sandbox.melhorenvio.com.br">Sandbox (sandbox.melhorenvio.com.br)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">
                    {meHasToken ? 'Substituir token (opcional)' : 'Token de acesso *'}
                  </label>
                  <div className="relative">
                    <input
                      type={meTokenVisible ? 'text' : 'password'}
                      value={meToken}
                      onChange={(e) => setMeToken(e.target.value)}
                      autoComplete="new-password"
                      spellCheck={false}
                      placeholder={meHasToken ? (meMaskedToken || 'Token já configurado') : 'Cole aqui o token completo'}
                      className="w-full bg-white text-black border border-black/15 px-3 py-3 pr-12 text-xs font-mono outline-none focus:border-[#eab308]"
                    />
                    <button
                      type="button"
                      onClick={() => setMeTokenVisible((visible) => !visible)}
                      className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center text-gray-500 hover:text-black"
                      aria-label={meTokenVisible ? 'Ocultar token' : 'Mostrar token'}
                    >
                      {meTokenVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    O token não será exibido novamente. Para trocar, cole um novo e salve.
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => {
                      setMeToken('');
                      setMeTokenVisible(false);
                      setIsMelhorEnvioModalOpen(false);
                    }}
                    disabled={meConfigSaving}
                    className="flex-1 py-3 text-[10px] font-black uppercase border border-black/25 text-black hover:bg-gray-50 transition-all tracking-wider"
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={handleSaveMelhorEnvioConfig}
                    disabled={meConfigSaving || (!meHasToken && !meToken.trim())}
                    className="flex-1 py-3 text-[10px] font-black uppercase bg-[#eab308] text-black hover:bg-black hover:text-[#eab308] disabled:opacity-50 disabled:cursor-not-allowed transition-all tracking-wider flex items-center justify-center gap-2"
                  >
                    {meConfigSaving && <Loader2 size={15} className="animate-spin" />}
                    {meToken.trim() ? 'Validar e conectar' : 'Salvar ambiente'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VALIDAÇÃO DE DADOS PARA MELHOR ENVIO MODAL */}
      <AnimatePresence>
        {isValidationModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-56 overflow-y-auto flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white text-black border-2 border-black max-w-lg w-full p-6 md:p-8 shadow-2xl relative space-y-6 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-start border-b border-black/10 pb-4">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest italic flex items-center gap-2 text-orange-500">
                    ⚠️ Corrigir Dados do Cliente
                  </h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                    Melhor Envio exige informações de destinatário completas e válidas
                  </p>
                </div>
                <button 
                  onClick={() => { setIsValidationModalOpen(false); setMeCpfWarning(false); }}
                  className="text-gray-400 hover:text-black font-black uppercase text-xs border border-gray-200 px-3 py-1 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  [X]
                </button>
              </div>

              <div className="space-y-4">
                {meCpfWarning && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-[11px] text-red-800 leading-normal">
                    <p className="font-bold uppercase tracking-wide mb-1">🚫 Auto-Envio Detectado</p>
                    <p className="mb-2">O Melhor Envio não permite gerar etiquetas com CPF/CNPJ de origem e destino idênticos (pedido autônomo de teste do próprio dono).</p>
                    <button 
                      type="button"
                      onClick={() => {
                        const num = () => Math.floor(Math.random() * 9);
                        const n = Array.from({ length: 9 }, num);
                        let d1 = 0;
                        for (let i = 0; i < 9; i++) d1 += n[i] * (10 - i);
                        d1 = 11 - (d1 % 11);
                        if (d1 >= 10) d1 = 0;
                        let d2 = 0;
                        for (let i = 0; i < 9; i++) d2 += n[i] * (11 - i);
                        d2 += d1 * 2;
                        d2 = 11 - (d2 % 11);
                        if (d2 >= 10) d2 = 0;
                        const cpfGenerated = [...n, d1, d2].join('');
                        setValCpf(cpfGenerated);
                        toast.success("Novo CPF de teste gerado com sucesso!");
                      }}
                      className="inline-flex items-center gap-1 bg-red-600 hover:bg-black text-white px-3 py-1.5 text-[10px] uppercase font-black tracking-wider transition-colors shadow"
                    >
                      🔄 Utilizar CPF de Teste Novo
                    </button>
                  </div>
                )}

                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 leading-normal">
                  <p className="font-bold uppercase tracking-wide mb-1">📋 Verifique os campos abaixo:</p>
                  <p>Alguns dados essenciais do destinatário estão ausentes ou inválidos. Complete-os para poder prosseguir com a geração da etiqueta.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Nome Completo</label>
                    <input 
                      type="text"
                      value={valName}
                      onChange={(e) => setValName(e.target.value)}
                      className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Telefone (com DDD)</label>
                    <input 
                      type="text"
                      value={valPhone}
                      onChange={(e) => setValPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">E-mail</label>
                    <input 
                      type="email"
                      value={valEmail}
                      onChange={(e) => setValEmail(e.target.value)}
                      className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">CPF ou CNPJ</label>
                    <input 
                      type="text"
                      value={valCpf}
                      onChange={(e) => setValCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                    />
                  </div>
                </div>

                <div className="border-t border-black/10 pt-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-black">🏠 Endereço de Entrega</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">CEP</label>
                      <input 
                        type="text"
                        value={valCep}
                        onChange={(e) => {
                          setValCep(e.target.value);
                          const cleaned = e.target.value.replace(/\D/g, '');
                          if (cleaned.length === 8) {
                            fetch(`https://viacep.com.br/ws/${cleaned}/json/`)
                              .then(r => r.json())
                              .then(data => {
                                if (data && !data.erro) {
                                  setValStreet(data.logradouro || '');
                                  setValNeighborhood(data.bairro || '');
                                  setValCity(data.localidade || '');
                                  setValState(data.uf || '');
                                }
                              }).catch(err => console.error("Error looking up corrector CEP", err));
                          }
                        }}
                        placeholder="00000-000"
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Estado (UF)</label>
                      <input 
                        type="text"
                        maxLength={2}
                        value={valState}
                        onChange={(e) => setValState(e.target.value.toUpperCase())}
                        placeholder="SC"
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none uppercase font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Rua (Logradouro)</label>
                    <input 
                      type="text"
                      value={valStreet}
                      onChange={(e) => setValStreet(e.target.value)}
                      className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Número</label>
                      <input 
                        type="text"
                        value={valNumber}
                        onChange={(e) => setValNumber(e.target.value)}
                        placeholder="123 ou SN"
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Complemento (Opcional)</label>
                      <input 
                        type="text"
                        value={valComplement}
                        onChange={(e) => setValComplement(e.target.value)}
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Bairro</label>
                      <input 
                        type="text"
                        value={valNeighborhood}
                        onChange={(e) => setValNeighborhood(e.target.value)}
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Cidade</label>
                      <input 
                        type="text"
                        value={valCity}
                        onChange={(e) => setValCity(e.target.value)}
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => { setIsValidationModalOpen(false); setMeCpfWarning(false); }}
                    className="flex-1 py-3 text-[10px] font-black uppercase border border-black/25 text-black hover:bg-gray-50 transition-all tracking-wider"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="button"
                    onClick={handleSaveAndGenerateLabel}
                    className="flex-1 py-3 text-[10px] font-black uppercase bg-orange-500 text-white hover:bg-black transition-all tracking-wider"
                  >
                    Salvar e Enviar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MANUAL ORDER MODAL */}
      <AnimatePresence>
        {isManualModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] overflow-y-auto flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              role="dialog" aria-modal="true" aria-label="Registrar pedido manual"
              className="my-2 sm:my-4 bg-white text-black border-2 border-black max-w-4xl w-full p-4 sm:p-6 md:p-8 shadow-2xl relative space-y-6 overflow-y-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]"
            >
              <div className="sticky -top-4 sm:-top-6 md:-top-8 z-10 -mx-4 sm:-mx-6 md:-mx-8 -mt-4 sm:-mt-6 md:-mt-8 px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 md:pt-8 bg-white flex gap-3 justify-between items-start border-b border-black/10 pb-4">
                <div className="min-w-0">
                  <h2 className="text-base sm:text-xl font-black uppercase tracking-wider sm:tracking-widest italic leading-tight">➕ Registrar Pedido Manual</h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                    {manualOrderKind === 'gift'
                      ? 'Registre o destinatário, os itens e o custo do brinde para acompanhar o impacto na margem.'
                      : 'Insira pedidos originados do WhatsApp, Instagram, etc. com baixa automática de estoque'}
                  </p>
                  <div className="mt-3 inline-flex border border-black/10 bg-gray-50 p-1 text-[9px] font-black uppercase tracking-wider">
                    <button type="button" onClick={() => setManualOrderKind('sale')} className={`px-3 py-2 ${manualOrderKind === 'sale' ? 'bg-black text-[#eab308]' : 'text-gray-500'}`}>Pedido</button>
                    <button type="button" onClick={() => { setManualOrderKind('gift'); setManualOrderDiscount(''); setManualOrderShipping(''); setManualOrderPaid(false); setManualOrderPaidAmount(0); }} className={`px-3 py-2 ${manualOrderKind === 'gift' ? 'bg-[#eab308] text-black' : 'text-gray-500'}`}>🎁 Brinde</button>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <button type="button" aria-pressed={manualShowAmounts} onClick={() => setManualShowAmounts(value => !value)} className="min-h-11 rounded-lg border border-black/15 px-3 text-xs font-bold">{manualShowAmounts ? 'Ocultar valores' : 'Mostrar valores'}</button>
                <button type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="shrink-0 text-gray-500 hover:text-black font-black uppercase text-[10px] border border-gray-200 px-2.5 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  Fechar [X]
                </button>
                </div>
              </div>

              <form onSubmit={handleSaveManualOrder} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* DADOS DO CLIENTE */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#eab308] border-b border-black/5 pb-1">👤 {manualOrderKind === 'gift' ? 'Dados do Destinatário' : 'Dados do Cliente'}</h3>
                    
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black uppercase tracking-wider">Nome Completo *</label>
                      <input 
                        type="text" 
                        required
                        value={custName}
                        onChange={e => setCustName(e.target.value)}
                        placeholder="Ex: João Silva"
                        className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase tracking-wider">Telefone com DDD {manualOrderKind === 'sale' ? '*' : '(opcional)'}</label>
                        <input 
                          type="text" 
                          required={manualOrderKind === 'sale'}
                          value={custPhone}
                          onChange={e => setCustPhone(e.target.value)}
                          placeholder="Ex: 47999887766"
                          className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase tracking-wider">Telefone 2 / Contato 2 (Opcional)</label>
                        <input 
                          type="text" 
                          value={custPhone2}
                          onChange={e => setCustPhone2(e.target.value)}
                          placeholder="Ex: 47999887766"
                          className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <label className="text-[9px] font-black uppercase tracking-wider">E-mail (Opcional)</label>
                        <input 
                          type="email" 
                          value={custEmail}
                          onChange={e => setCustEmail(e.target.value)}
                          placeholder="Ex: joao@gmail.com"
                          className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 py-2 bg-gray-50 border border-black/5 p-3">
                      <input 
                        type="checkbox" 
                        id="isRetiradaCheck"
                        checked={isRetirada}
                        onChange={e => setIsRetirada(e.target.checked)}
                        className="accent-[#eab308] cursor-pointer"
                      />
                      <label htmlFor="isRetiradaCheck" className="text-[10px] font-black uppercase cursor-pointer select-none">
                        Retirada na Loja física (Sem Frete / Entrega local)
                      </label>
                    </div>

                    {!isRetirada && (
                      <div className="space-y-4 pt-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black uppercase tracking-wider">CEP</label>
                          <input 
                            type="text" 
                            max={9}
                            value={custCep}
                            onChange={e => {
                              setCustCep(e.target.value);
                              handleCEPLookup(e.target.value);
                            }}
                            placeholder="Ex: 89201300"
                            className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none"
                          />
                        </div>

                        <div className="grid grid-cols-12 gap-4">
                          <div className="col-span-12 sm:col-span-8 flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Endereço (Rua/Av)</label>
                            <input 
                              type="text" 
                              value={custAddress}
                              onChange={e => setCustAddress(e.target.value)}
                              placeholder="Ex: Rua de Joinville"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                            />
                          </div>
                          <div className="col-span-12 sm:col-span-4 flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Nº</label>
                            <input 
                              type="text" 
                              value={custNumber}
                              onChange={e => setCustNumber(e.target.value)}
                              placeholder="999"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Complemento</label>
                            <input 
                              type="text" 
                              value={custComplement}
                              onChange={e => setCustComplement(e.target.value)}
                              placeholder="Apto 101"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Bairro</label>
                            <input 
                              type="text" 
                              value={custNeighborhood}
                              onChange={e => setCustNeighborhood(e.target.value)}
                              placeholder="Ex: Centro"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Cidade</label>
                            <input 
                              type="text" 
                              value={custCity}
                              onChange={e => setCustCity(e.target.value)}
                              placeholder="Joinville"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Estado (UF)</label>
                            <input 
                              type="text" 
                              maxLength={2}
                              value={custState}
                              onChange={e => setCustState(e.target.value)}
                              placeholder="SC"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                            />
                          </div>
                        </div>

                        {/* Roteamento Logístico Inteligente */}
                        <div className="bg-[#eab308]/5 border border-[#eab308]/25 p-3.5 space-y-3 mt-4">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[#eab308] block">🗺️ Roteamento de Entrega & Etiqueta</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setManualShippingMethod('Pedido Local');
                                setManualShippingMethodName('Entrega Local F PAC');
                                setManualShippingServiceId(0);
                                setManualOrderShipping(11.40);
                                toast.success("Modificado para TRILHA LOCAL (Pedido Local).");
                              }}
                              className={`p-2.5 text-left border text-[10px] uppercase font-black tracking-wider transition-all flex flex-col justify-between h-20 rounded-none ${
                                manualShippingMethod === 'Pedido Local' 
                                  ? 'bg-black text-[#eab308] border-black scale-[1.02] shadow-sm' 
                                  : 'bg-white text-gray-500 border-black/15 hover:border-black'
                              }`}
                            >
                              <span>🏍️ TRILHA LOCAL</span>
                              <span className="text-[8px] font-medium leading-tight normal-case text-gray-400 block mt-1">
                                Joinville-SC. Modelo Etiqueta A (PDF de entrega manual).
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setManualShippingMethod('Melhor Envio');
                                setManualShippingMethodName('Correios SEDEX');
                                setManualShippingServiceId(2);
                                setManualOrderShipping(24.90);
                                toast.success("Modificado para TRILHA NACIONAL (Melhor Envio).");
                              }}
                              className={`p-2.5 text-left border text-[10px] uppercase font-black tracking-wider transition-all flex flex-col justify-between h-20 rounded-none ${
                                manualShippingMethod === 'Melhor Envio' 
                                  ? 'bg-black text-[#eab308] border-black scale-[1.02] shadow-sm' 
                                  : 'bg-white text-gray-500 border-black/15 hover:border-black'
                              }`}
                            >
                              <span>📦 TRILHA NACIONAL</span>
                              <span className="text-[8px] font-medium leading-tight normal-case text-gray-400 block mt-1">
                                Fora de Joinville. Modelo Etiqueta B (Melhor Envio API).
                              </span>
                            </button>
                          </div>

                          {manualShippingMethod === 'Melhor Envio' && (
                            <div className="space-y-1 bg-white p-2 border border-black/5 mt-2">
                              <label className="text-[8px] font-black uppercase text-gray-400 tracking-wider block">Serviço de Frete Nacional</label>
                              <select 
                                value={manualShippingServiceId}
                                onChange={(e) => {
                                  const id = Number(e.target.value);
                                  setManualShippingServiceId(id);
                                  const serviceNames: Record<number, string> = {
                                    1: 'Correios PAC',
                                    2: 'Correios SEDEX',
                                    3: 'Jadlog Package',
                                    4: 'Jadlog .COM',
                                    16: 'Latam Cargo',
                                    17: 'Jamef'
                                  };
                                  setManualShippingMethodName(serviceNames[id] || 'Correios SEDEX');
                                }}
                                className="w-full bg-white text-black border border-black/10 px-2 py-1.5 text-[10px] font-bold uppercase outline-none focus:border-black"
                              >
                                <option value={1}>Correios PAC</option>
                                <option value={2}>Correios SEDEX</option>
                                <option value={3}>Jadlog Package</option>
                                <option value={4}>Jadlog .COM</option>
                                <option value={16}>Latam Cargo</option>
                                <option value={17}>Jamef</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SELEÇÃO E CARRINHO DO PEDIDO */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#eab308] border-b border-black/5 pb-1">👕 {manualOrderKind === 'gift' ? 'Itens do Brinde' : 'Carrinho de Compra'}</h3>

                    {/* Adicionar Produto individual */}
                    <div className="bg-gray-50 border border-black/10 p-4 space-y-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Tipo de produto do pedido">
                        <button type="button" disabled={hasCustomManualItems} onClick={() => { setManualProductMode('ready'); setSelectedProduct(null); updateSelectedManualStamps([]); }} className={cn('min-h-14 border px-3 py-2 text-left text-[10px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-40', manualProductMode === 'ready' ? 'border-black bg-black text-[#eab308]' : 'border-black/15 bg-white text-gray-600')}><span className="block text-xs">1. Produto pronto</span><span className="mt-1 block text-[8px] font-medium normal-case opacity-75">Item já cadastrado no catálogo</span></button>
                        <button type="button" disabled={hasCustomManualItems} onClick={() => { setManualProductMode('assembled'); setSelectedProduct(null); updateSelectedManualStamps([]); }} className={cn('min-h-14 border px-3 py-2 text-left text-[10px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-40', manualProductMode === 'assembled' ? 'border-black bg-black text-[#eab308]' : 'border-black/15 bg-white text-gray-600')}><span className="block text-xs">2. Produto montado</span><span className="mt-1 block text-[8px] font-medium normal-case opacity-75">Peça base + estampas do catálogo</span></button>
                        <button type="button" disabled={hasCatalogManualItems} onClick={() => { setManualProductMode('custom'); setSelectedProduct(null); updateSelectedManualStamps([]); setStockControl('no_move'); }} className={cn('min-h-14 border px-3 py-2 text-left text-[10px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-40', manualProductMode === 'custom' ? 'border-black bg-black text-[#eab308]' : 'border-black/15 bg-white text-gray-600')}><span className="block text-xs">3. Personalizados</span><span className="mt-1 block text-[8px] font-medium normal-case opacity-75">Descreva a peça, tamanhos e, se houver, as artes</span></button>
                      </div>
                      {manualProductMode === 'custom' ? (
                        <ManualCustomProductForm
                          stamps={catalogStamps}
                          disabled={tempItems.length > 0}
                          isGift={manualOrderKind === 'gift'}
                          onAdd={(items) => {
                            setTempItems(items);
                            setStockControl('no_move');
                            toast.success('Peças personalizadas adicionadas ao pedido.');
                          }}
                        />
                      ) : (
                        <>
                      <ManualProductPicker key={manualProductMode} label={manualProductMode === 'ready' ? 'Produto pronto do catálogo' : 'Peça base do estoque'} products={manualProductMode === 'ready' ? readyManualProducts : assembledManualProducts} selected={selectedProduct} formatPrice={formatManualMoney} onSelect={found => {
                        setSelectedProduct(found);
                        setItemPrice(found.price);
                        const firstCol = found.colors?.[0];
                        const initialColor = firstCol && typeof firstCol === 'object' ? firstCol.name || '' : firstCol || '';
                        setSelectedColor(initialColor);
                        updateSelectedManualStamps(manualProductMode === 'ready' ? resolveProductStampRecipe(found, initialColor) : []);
                        setSelectedSize(found.sizes?.[0] || '');
                      }} />

                      {selectedProduct && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedProduct.colors && selectedProduct.colors.length > 0 && (
                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-black uppercase text-gray-400">Cor</label>
                                <select 
                                  value={selectedColor}
                                  onChange={e => {
                                    const color = e.target.value;
                                    setSelectedColor(color);
                                    if (manualProductMode === 'ready') updateSelectedManualStamps(resolveProductStampRecipe(selectedProduct, color));
                                  }}
                                  className="py-2 px-3 bg-white border border-black/5 text-[11px] font-bold uppercase cursor-pointer"
                                >
                                  {selectedProduct.colors.map((c: any) => {
                                    const cName = c && typeof c === 'object' ? (c.name || '') : c;
                                    return (
                                      <option key={cName} value={cName}>{cName}</option>
                                    );
                                  })}
                                </select>
                              </div>
                            )}

                            <div className="flex flex-col gap-1">
                              <label className="text-[8px] font-black uppercase text-gray-400">Tamanho</label>
                              <select 
                                value={selectedSize}
                                onChange={e => setSelectedSize(e.target.value)}
                                className="py-2 px-3 bg-white border border-black/5 text-[11px] font-bold uppercase cursor-pointer"
                              >
                                {selectedProduct.sizes?.map((s: string) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </div>

                          </div>

                          {manualProductMode === 'assembled' && <ManualStampPicker stamps={catalogStamps} selectedIds={selectedStampIds} onChange={updateSelectedManualStamps} selectedSizes={selectedStampSizes} onSizeChange={(stampId, size) => setSelectedStampSizes(current => ({ ...current, [stampId]: size }))} max={3} />}
                          {manualProductMode === 'ready' && selectedStampIds.length > 0 && <div className="space-y-2 rounded border border-black/10 bg-white p-2 text-[10px] font-bold text-gray-600"><p>Receita da cor selecionada, vinculada ao pedido e ao estoque:</p><div className="grid gap-2 sm:grid-cols-3">{selectedStampIds.map((id, index) => {
                            const stamp = catalogStamps.find(item => item.id === id);
                            const recipeEntry = resolveProductStampRecipeEntries(selectedProduct, selectedColor)[index];
                            const recipeSize = recipeEntry?.stampId === id ? recipeEntry.printSize : undefined;
                            return stamp ? <div key={`${id}-${index}`} className="flex min-w-0 items-center gap-2"><StampThumb stamp={stamp} /><span className="break-words">{stamp.name}<small className="block">{stamp.code || stamp.sku}</small><small className="block">Medida: {recipeSize || (stamp.availableSizes?.length === 1 ? stamp.availableSizes[0] : 'não configurada')}</small></span></div> : <p key={`${id}-${index}`} className="text-red-700">Estampa não encontrada. Revise o cadastro do produto.</p>;
                          })}</div></div>}

                          <div className={`grid grid-cols-1 ${manualOrderKind === 'gift' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3 items-end`}>
                            {manualOrderKind === 'sale' && <div className="flex flex-col gap-1">
                              <label className="text-[8px] font-black uppercase text-gray-400">override R$</label>
                              <input 
                                type="number" 
                                value={itemPrice}
                                onChange={e => setItemPrice(Number(e.target.value) || 0)}
                                className="py-2 px-3 border border-black/10 text-xs font-bold font-mono"
                              />
                            </div>}

                            <div className="flex flex-col gap-1">
                              <label className="text-[8px] font-black uppercase text-gray-400">Quantidade</label>
                              <input 
                                type="number" 
                                min={1}
                                value={itemQty}
                                onChange={e => setItemQty(Math.max(1, Number(e.target.value) || 1))}
                                className="py-2 px-3 border border-black/10 text-xs font-bold font-mono text-center"
                              />
                            </div>

                            <button 
                              type="button"
                              onClick={() => {
                                if (!selectedProduct) return;
                                const productHasColors = !!(selectedProduct.colors && selectedProduct.colors.length > 0);
                                if (productHasColors && !selectedColor) {
                                  toast.error("Por favor, selecione uma cor.");
                                  return;
                                }
                                if (!selectedSize) {
                                  toast.error("Por favor, selecione um tamanho.");
                                  return;
                                }
                                const stockVal = getSelectedVariantStock();
                                if (!ignoreStock && stockVal < itemQty) {
                                  toast.error(`Estoque insuficiente! Disponível: ${stockVal} un.`);
                                  return;
                                }

                                const selectedStamps = selectedStampIds.map((id) => {
                                  const stamp = catalogStamps.find((item) => item.id === id);
                                  if (!stamp) return null;
                                  const recipeSize = manualProductMode === 'ready'
                                    ? resolveProductStampRecipeEntries(selectedProduct, selectedColor).find(entry => entry.stampId === id)?.printSize
                                    : selectedStampSizes[id] || (stamp.availableSizes?.length === 1 ? stamp.availableSizes[0] : '');
                                  return { ...stamp, printSize: recipeSize || '' };
                                }).filter(Boolean);
                                if (manualProductMode === 'assembled' && selectedStamps.length === 0) {
                                  toast.error("Escolha pelo menos uma estampa para o produto montado.");
                                  return;
                                }
                                if (selectedStamps.length !== selectedStampIds.filter(Boolean).length) {
                                  toast.error('Uma estampa vinculada não foi encontrada. Revise o cadastro do produto antes de continuar.');
                                  return;
                                }
                                const missingStampSize = selectedStamps.find((stamp: any) => (stamp.availableSizes?.length || 0) > 1 && !stamp.printSize);
                                if (missingStampSize) {
                                  toast.error(manualProductMode === 'ready'
                                    ? `Cadastre a medida da estampa ${missingStampSize.code || missingStampSize.name} na receita deste produto antes de lançar o pedido.`
                                    : `Selecione o tamanho da estampa ${missingStampSize.code || missingStampSize.name}.`);
                                  return;
                                }
                                const stampNames = selectedStamps.map((stamp: any) => stamp.name || stamp.code).filter(Boolean);
                                const newItem = {
                                  id: selectedProduct.id,
                                  slug: selectedProduct.slug || selectedProduct.id,
                                  color: selectedColor || 'PADRÃO',
                                  size: selectedSize,
                                  quantity: itemQty,
                                  price: manualOrderKind === 'gift' ? 0 : (itemPrice || selectedProduct.price),
                                  product: selectedProduct,
                                  mode: manualProductMode,
                                  stamps: selectedStamps,
                                  displayName: manualProductIdentity({ ...selectedProduct, stampNames }).displayName,
                                };

                                setTempItems([...tempItems, newItem]);
                                toast.success("Artigo adicionado!");
                                
                                setSelectedProduct(null);
                                setSelectedColor('');
                                setSelectedSize('');
                                updateSelectedManualStamps([]);
                                setItemQty(1);
                              }}
                              className="py-2.5 bg-black text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-colors shrink-0 cursor-pointer w-full text-center"
                            >
                              ➕ ADICIONAR
                            </button>
                          </div>

                          {/* Live Stock display */}
                          <div className={cn(
                            "text-[9px] font-black p-2 border tracking-widest uppercase text-center",
                            getSelectedVariantStock() > 0 ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-600 border-red-100"
                          )}>
                            Quantidade em estoque: {getSelectedVariantStock()} un.
                          </div>
                        </div>
                      )}
                        </>
                      )}
                    </div>

                    {/* Temp Item List layout */}
                    <div className="border border-black/10 p-3 max-h-[160px] overflow-y-auto divide-y divide-black/5 bg-gray-50/50">
                      {tempItems.length === 0 ? (
                        <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest text-center py-6">Nenhum produto adicionado ainda</p>
                      ) : (
                        tempItems.map((item, index) => (
                          <div key={index} className="py-2 flex justify-between items-center text-[10px] uppercase font-bold text-gray-700">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="flex shrink-0 -space-x-1">{(item.stamps || []).slice(0, 3).map((stamp: any) => stampImage(stamp) ? <img key={stamp.id} src={stampImage(stamp)} alt={stamp.name || 'Estampa'} className="h-9 w-9 rounded border border-white bg-gray-100 object-contain" /> : null)}</div>
                              <div className="min-w-0">
                              <p className="font-black text-black leading-tight">{item.displayName || item.product.name}</p>
                              <p className="text-[8px] text-gray-400 mt-1">{item.color} | Tam {item.size} x{item.quantity}</p>
                              {(item.stamps || []).length > 0 && <p className="text-[8px] text-[#b8860b] mt-1">Estampas: {item.stamps.map((stamp: any) => stamp.name || stamp.code).join(' + ')}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-mono text-black font-black">{manualOrderKind === 'gift' ? `${item.quantity} un.` : formatManualMoney(item.price * item.quantity)}</span>
                              <button 
                                type="button"
                                onClick={() => {
                                  const updated = tempItems.filter((_, idx) => idx !== index);
                                  setTempItems(updated);
                                }}
                                className="text-red-600 hover:text-black hover:scale-110 transition-transform font-black text-xs cursor-pointer"
                              >
                                [x]
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {manualOrderKind === 'sale' ? <>
                    {/* OVERLAYS META INFO DESCONTOS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-black/10 pt-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase text-gray-400">Desconto R$</label>
                        <input 
                          type="number" 
                          min={0}
                          value={manualOrderDiscount}
                          onChange={e => setManualOrderDiscount(e.target.value === '' ? '' : Number(e.target.value))}
                          className="py-2.5 px-3 border border-black/10 text-xs font-bold font-mono"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase text-gray-400">Frete R$</label>
                        <input 
                          type="number" 
                          min={0}
                          value={manualOrderShipping}
                          onChange={e => setManualOrderShipping(e.target.value === '' ? '' : Number(e.target.value))}
                          disabled={isRetirada}
                          className="py-2.5 px-3 border border-[#0000001a] text-xs font-bold font-mono disabled:bg-gray-100 disabled:text-gray-400"
                        />
                      </div>
                    </div>

                    {/* Display Total Price */}
                    <div className="bg-black text-white p-4 flex justify-between items-center border-l-4 border-[#eab308]">
                      <div>
                        <span className="text-[8px] font-black tracking-widest text-[#eab308] uppercase block">Consolidado Final</span>
                        <span className="text-[10px] font-bold text-gray-400 block mt-0.5 leading-none font-sans uppercase">
                          Subtotal: {formatManualMoney(tempItems.reduce((acc, i) => acc + (i.price * i.quantity), 0))}
                        </span>
                      </div>
                      <span className="text-2xl font-black italic tracking-tight font-mono text-white">
                        {formatManualMoney(Math.max(0, tempItems.reduce((acc, i) => acc + (i.price * i.quantity), 0) + Number(manualOrderShipping) - Number(manualOrderDiscount)))}
                      </span>
                    </div>
                    </> : <div className="border-l-4 border-[#eab308] bg-amber-50 p-4 text-[10px] font-bold text-amber-950"><span className="font-black uppercase tracking-widest">Brinde sem faturamento</span><p className="mt-1 normal-case">O custo conhecido será levado ao DRE como custo de brinde. Itens sem custo cadastrado serão sinalizados para revisão.</p></div>}
                  </div>
                </div>

                {/* ORIGEM / METODO PAGAMENTO / STATUS */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 border border-black/5 p-4 text-xs font-black uppercase tracking-wider">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-gray-400">Canal de Origem</label>
                    <select 
                      value={orderOrigin} 
                      onChange={e => setOrderOrigin(e.target.value)}
                      className="py-2 px-3 bg-white border border-black/10 text-[11px] font-bold cursor-pointer"
                    >
                      <option value="WhatsApp">🟢 WhatsApp</option>
                      <option value="Instagram">📸 Instagram</option>
                      <option value="Facebook">🔵 Facebook</option>
                      <option value="Loja Física">🏠 Loja Física</option>
                      <option value="Indicação">🤝 Indicação</option>
                      <option value="Venda Direta">🚪 Venda Direta</option>
                      <option value="Marketplace">🛒 Marketplace</option>
                    </select>
                  </div>

                  {manualOrderKind === 'sale' && <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-gray-400">Forma de Pagamento</label>
                    <select 
                      value={paymentMethodForm} 
                      onChange={e => setPaymentMethodForm(e.target.value)}
                      className="py-2 px-3 bg-white border border-black/10 text-[11px] font-bold cursor-pointer"
                    >
                      <option value="PIX">⚡ PIX</option>
                      <option value="Cartão de Crédito">💳 Cartão de Crédito</option>
                      <option value="Dinheiro">💵 Dinheiro (Física/Direta)</option>
                      <option value="Boleto">📄 Boleto Bancário</option>
                      <option value="Transferência">🏦 Transferência</option>
                    </select>
                  </div>}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-gray-400">Etapa operacional do pedido</label>
                    <select 
                      value={manualOrderStatus} 
                      onChange={e => {
                        const nextStage = e.target.value as ManualOrderOperationalStage;
                        setManualOrderStatus(nextStage);
                        if (nextStage === 'cancelled') {
                          setManualOrderPaid(false);
                          setManualOrderPaidAmount(0);
                        }
                      }}
                      className="py-2 px-3 bg-white border border-black/10 text-[11px] font-bold cursor-pointer"
                    >
                      <option value="received">📥 Pedido recebido</option>
                      <option value="production">👕 Em Produção (Separação)</option>
                      <option value="shipped">🚀 Saiu para entrega</option>
                      <option value="delivered">🙌 Entregue</option>
                      <option value="cancelled">🛑 Cancelado</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5 justify-end">
                    <label className="flex items-center gap-2 cursor-pointer py-2 border-t border-black/5 self-stretch justify-center md:border-none">
                      <input 
                        type="checkbox" 
                        checked={ignoreStock}
                        onChange={e => setIgnoreStock(e.target.checked)}
                        className="accent-[#eab308] scale-110"
                      />
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest select-none">{manualOrderKind === 'gift' ? 'Forçar baixa s/ estoque' : 'Forçar venda s/ estoque'}</span>
                    </label>
                  </div>
                </div>

                {manualOrderKind === 'sale' && <div className="border border-emerald-200 bg-emerald-50/60 p-4 space-y-4">
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Controle financeiro independente</h4>
                    <p className="mt-1 text-[9px] text-emerald-900/70">O pedido pode ser entregue com saldo pendente. Apenas valores recebidos entram no faturamento.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <label className="flex items-center gap-2 border border-emerald-200 bg-white px-3 py-2.5 text-[10px] font-black uppercase cursor-pointer">
                      <input
                        type="checkbox"
                        checked={manualOrderPaid}
                        disabled={manualOrderStatus === 'cancelled'}
                        onChange={(event) => {
                          setManualOrderPaid(event.target.checked);
                          if (event.target.checked) setManualOrderPaidAmount(0);
                        }}
                        className="accent-emerald-600 disabled:opacity-40"
                      />
                      Pago integralmente?
                    </label>
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-black uppercase text-gray-500">Valor já pago (R$)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={manualOrderPaid || manualOrderStatus === 'cancelled'}
                        value={manualOrderPaidAmount}
                        onChange={(event) => setManualOrderPaidAmount(Math.max(0, Number(event.target.value) || 0))}
                        className="border border-black/10 bg-white px-3 py-2.5 text-xs font-bold font-mono disabled:bg-gray-100"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-black uppercase text-gray-500">Quantidade de parcelas</label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={manualInstallmentCount}
                        onChange={(event) => setManualInstallmentCount(Math.max(1, Math.min(60, Number(event.target.value) || 1)))}
                        className="border border-black/10 bg-white px-3 py-2.5 text-xs font-bold font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-black uppercase text-gray-500">1º vencimento</label>
                      <input
                        type="date"
                        value={manualFirstDueDate}
                        onChange={(event) => setManualFirstDueDate(event.target.value)}
                        className="border border-black/10 bg-white px-3 py-2.5 text-xs font-bold"
                      />
                    </div>
                  </div>
                </div>}

                {/* CONTROLE DE ESTOQUE */}
                <div className="bg-gray-100 p-5 border border-black/10">
                  <h4 className="text-[10px] font-black uppercase text-black tracking-widest mb-3 flex items-center gap-1.5">
                    ⚙️ CONTROLE DE ESTOQUE DESTE PEDIDO *
                  </h4>
                  {(manualProductMode === 'custom' || hasCustomManualItems) ? (
                    <div className="border border-amber-300 bg-amber-50 p-3 text-[10px] font-bold leading-relaxed text-amber-950">
                      O estoque de peças do catálogo não será alterado, pois esta camisa foi cadastrada como produto personalizado. Estampas selecionadas no catálogo continuam com baixa automática pelo código/variante e pela medida escolhida; artes próprias ficam sem baixa de estampa.
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-start gap-3 p-3 bg-white border border-black/5 hover:border-[#eab308] cursor-pointer transition-colors relative">
                      <input 
                        type="radio" 
                        name="stockControlRadio"
                        value="move"
                        checked={stockControl === 'move'}
                        onChange={() => setStockControl('move')}
                        className="accent-[#eab308] mt-1 h-4 w-4 text-[#eab308]"
                      />
                      <div className="flex-1">
                        <span className="text-xs font-black uppercase block text-black">🔘 Movimentar Estoque</span>
                        <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 leading-normal">
                          Subtrai as quantidades do estoque. Atualiza inventário, saldo disponível e produtos com baixo estoque. Registra movimentação no histórico.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white border border-black/5 hover:border-black cursor-pointer transition-colors relative">
                      <input 
                        type="radio" 
                        name="stockControlRadio"
                        value="no_move"
                        checked={stockControl === 'no_move'}
                        onChange={() => setStockControl('no_move')}
                        className="accent-black mt-1 h-4 w-4"
                      />
                      <div className="flex-1">
                        <span className="text-xs font-black uppercase block text-black">🔘 Não Movimentar Estoque</span>
                        <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 leading-normal">
                          Cria o pedido sem alterar o estoque ou o inventário. Ideal para faturamento puro, retroativo ou prestação de serviços.
                        </p>
                      </div>
                    </label>
                  </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="flex flex-col gap-1 md:col-span-8">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Observações do Pedido</label>
                    <textarea 
                      value={manualOrderObs}
                      onChange={e => setManualOrderObs(e.target.value)}
                      placeholder={manualOrderKind === 'gift' ? 'Motivo do brinde, campanha ou observação...' : 'Adicione observações para este faturamento manual...'}
                      rows={2}
                      className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1 md:col-span-4">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Data de Entrega do Pedido</label>
                    <input 
                      type="date"
                      value={manualOrderDeliveryDate}
                      onChange={e => setManualOrderDeliveryDate(e.target.value)}
                      className="py-2 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none w-full bg-white font-medium"
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 border-t border-black/10 pt-4 w-full">
                  <button 
                    type="button" 
                    onClick={() => setIsManualModalOpen(false)}
                    className="px-6 py-3 border border-black text-black hover:bg-gray-100 uppercase text-[11px] font-black tracking-widest cursor-pointer font-sans text-center"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={savingManualOrder}
                    className="px-10 py-3 bg-black border-2 border-black text-[#eab308] hover:bg-[#eab308] hover:text-black uppercase text-[11px] font-black tracking-[0.15em] transition-all cursor-pointer disabled:bg-gray-300 disabled:text-gray-500 disabled:border-transparent font-sans text-center"
                  >
                    {savingManualOrder ? 'Confirmando...' : (manualOrderKind === 'gift' ? 'Salvar Brinde' : 'Salvar Pedido Manual')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Order Financial Drawer */}
      <OrderFinancialDrawer
        order={selectedOrderForFinancialDrawer}
        isOpen={!!selectedOrderForFinancialDrawer}
        onClose={() => setSelectedOrderForFinancialDrawer(null)}
        onOrderUpdated={(updated) => {
          if (updated && typeof updated === 'object') {
            const ordId = updated.id || selectedOrderForFinancialDrawer?.id;
            if (ordId) {
              setOrders(prev => prev.map(o => o.id === ordId ? { ...o, ...updated } : o));
              setSelectedOrderForFinancialDrawer((prev: any) => prev ? { ...prev, ...updated } : updated);
            }
          }
        }}
      />
    </div>
  );
}

export default function AdminOrders() {
  return (
    <FinancialPrivacyProvider>
      <AdminOrdersInner />
    </FinancialPrivacyProvider>
  );
}

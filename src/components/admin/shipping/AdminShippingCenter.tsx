import React, { useState, useMemo } from 'react';
import { 
  Package, Search, CheckCircle, XCircle, Clock, AlertTriangle, 
  Truck, Copy, ExternalLink, Printer, Tag, User, Calendar, Filter, 
  Loader2, ShieldAlert, Layers, Lock, RefreshCw, SlidersHorizontal, 
  Sparkles, Eye, ArrowRight, FileText, CheckSquare, Square, MapPin, 
  Phone, Mail, FileSpreadsheet, Send, ChevronDown, ChevronUp, Barcode,
  AlertCircle, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { authenticatedFetch } from '../../../lib/api';
import { isJoinvilleCEP, JOINVILLE_SHIPPING_NAME } from '../../../lib/shipping';
import { cn } from '../../../lib/utils';

interface AdminShippingCenterProps {
  orders: any[];
  currentUserEmail?: string;
  onRefreshOrders?: () => void;
}

export const CANONICAL_SHIPPING_STAGES = [
  { id: 'pending', label: 'Aguardando Preparação', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30', icon: Clock },
  { id: 'label_created', label: 'Etiqueta Criada', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30', icon: Tag },
  { id: 'shipped', label: 'Despachado', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30', icon: Truck },
  { id: 'in_transit', label: 'Em Trânsito', color: 'bg-purple-500/10 text-purple-500 border-purple-500/30', icon: Send },
  { id: 'delivered', label: 'Entregue', color: 'bg-green-500/10 text-green-500 border-green-500/30', icon: CheckCircle },
  { id: 'returned', label: 'Devolvido', color: 'bg-rose-500/10 text-rose-500 border-rose-500/30', icon: XCircle },
];

export const AdminShippingCenter: React.FC<AdminShippingCenterProps> = ({
  orders,
  currentUserEmail = 'Admin',
  onRefreshOrders
}) => {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [activeTab, setActiveTab] = useState<'queue' | 'all'>('queue');
  const [mobileActiveStage, setMobileActiveStage] = useState<string>('pending');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModalityFilter, setSelectedModalityFilter] = useState<'all' | 'local' | 'melhor_envio'>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [showOverdueOnly, setShowOverdueOnly] = useState<boolean>(false);

  // Modals & Drawers
  const [conferenceOrder, setConferenceOrder] = useState<any | null>(null);
  const [conferenceChecklist, setConferenceChecklist] = useState({
    productCorrect: false,
    colorCorrect: false,
    sizeCorrect: false,
    qtyCorrect: false,
    customizationCorrect: false,
    packagingComplete: false,
    addressVerified: false
  });

  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [printOrder, setPrintOrder] = useState<any | null>(null);
  const [trackingModalOrder, setTrackingModalOrder] = useState<any | null>(null);
  const [inputTrackingCode, setInputTrackingCode] = useState('');
  const [inputCarrier, setInputCarrier] = useState('');

  // Operational Notes
  const [noteOrder, setNoteOrder] = useState<any | null>(null);
  const [noteText, setNoteText] = useState('');
  const [assignedOperator, setAssignedOperator] = useState('');

  // Loading States
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Helper: Detect Local Delivery / Entrega Própria
  const isEntregaPropria = (order: any) => {
    if (!order) return false;
    if (order.shippingServiceId === 0 || order.shippingServiceId === '0') return true;
    if (order.cep && isJoinvilleCEP(order.cep)) return true;
    const methodStr = String(order.shippingMethod || order.shipping?.method || order.shippingMethodName || '').toLowerCase();
    return methodStr.includes('local') || methodStr.includes('retirada') || methodStr.includes('joinville');
  };

  // Helper: Is Order Overdue (>24h in ready / pending status)
  const isOrderOverdue = (order: any) => {
    const status = String(order.shipping?.status || order.shippingStatus || 'pending').toLowerCase();
    if (['shipped', 'in_transit', 'delivered', 'returned'].includes(status)) return false;
    const date = order.updatedAt ? new Date(order.updatedAt) : (order.createdAt ? new Date(order.createdAt) : null);
    if (!date) return false;
    const hours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    return hours > 24;
  };

  // Filter Active Queue vs All History
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const orderStatus = String(order.status || '').toLowerCase();
      const payStatus = String(order.payment?.status || order.paymentStatus || 'pending').toLowerCase();
      const prodStatus = String(order.production?.status || order.productionStatus || 'waiting').toLowerCase();
      const shipStatus = String(order.shipping?.status || order.shippingStatus || 'pending').toLowerCase();

      // Search matching
      const query = searchTerm.trim().toLowerCase();
      if (query) {
        const idMatch = String(order.id || '').toLowerCase().includes(query);
        const nameMatch = String(order.customerName || order.customer?.name || '').toLowerCase().includes(query);
        const trackingMatch = String(order.shipping?.trackingCode || order.trackingCode || '').toLowerCase().includes(query);
        const itemMatch = Array.isArray(order.items) && order.items.some((i: any) => 
          String(i.name || i.title || '').toLowerCase().includes(query) ||
          String(i.sku || '').toLowerCase().includes(query)
        );
        if (!idMatch && !nameMatch && !trackingMatch && !itemMatch) return false;
      }

      // Modality filter
      if (selectedModalityFilter === 'local' && !isEntregaPropria(order)) return false;
      if (selectedModalityFilter === 'melhor_envio' && isEntregaPropria(order)) return false;

      // Status filter
      if (selectedStatusFilter !== 'all' && shipStatus !== selectedStatusFilter) return false;

      // Overdue filter
      if (showOverdueOnly && !isOrderOverdue(order)) return false;

      // Queue view vs All view
      if (activeTab === 'queue') {
        // Exclude cancelled / rejected
        if (['cancelled', 'cancelado', 'rejected', 'rejeitado'].includes(orderStatus)) return false;
        // Exclude payment not approved
        if (!['approved', 'partially_paid', 'pagamento aprovado'].includes(payStatus)) return false;
        // Exclude incomplete production (must be ready or completed)
        if (!['ready', 'completed', 'concluido', 'pronto_envio'].includes(prodStatus)) return false;
        // Exclude shipped / delivered in queue active tab
        if (['shipped', 'in_transit', 'delivered', 'returned'].includes(shipStatus)) return false;
      }

      return true;
    });
  }, [orders, searchTerm, selectedModalityFilter, selectedStatusFilter, showOverdueOnly, activeTab]);

  // Group by Canonical Shipping Stage
  const ordersByStage = useMemo(() => {
    const grouped: Record<string, any[]> = {
      pending: [],
      label_created: [],
      shipped: [],
      in_transit: [],
      delivered: [],
      returned: []
    };

    filteredOrders.forEach(order => {
      let rawStatus = String(order.shipping?.status || order.shippingStatus || 'pending').toLowerCase();
      if (rawStatus === 'aguardando_envio' || rawStatus === 'waiting') rawStatus = 'pending';
      if (rawStatus === 'enviado' || rawStatus === 'despachado') rawStatus = 'shipped';
      if (rawStatus === 'entregue') rawStatus = 'delivered';
      
      if (grouped[rawStatus]) {
        grouped[rawStatus].push(order);
      } else {
        grouped.pending.push(order);
      }
    });

    return grouped;
  }, [filteredOrders]);

  // ACTION 1: Generate Label (Melhor Envio)
  const handleCreateLabel = async (order: any) => {
    setActionLoading(`label_${order.id}`);
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
        toast.error(data.message || data.error || 'Erro ao gerar etiqueta.');
        return;
      }

      toast.success(`Etiqueta gerada com sucesso! (ID: ${data.id || data.shippingLabelId})`);
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      toast.error(`Falha ao conectar: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // ACTION 2: Update Shipping Status (Uses Shipping 2.0 Backend)
  const handleUpdateShippingStatus = async (orderId: string, newStatus: string, trackingCode?: string, carrier?: string) => {
    setActionLoading(`status_${orderId}`);
    try {
      const resp = await authenticatedFetch(`/api/admin/orders/${orderId}/shipping-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newStatus,
          trackingCode: trackingCode || undefined,
          carrier: carrier || undefined
        })
      });

      const data = await resp.json();

      if (!resp.ok) {
        toast.error(data.message || data.error || 'Erro ao atualizar status de envio.');
        return;
      }

      toast.success(`Status de envio atualizado para '${newStatus}'!`);
      setTrackingModalOrder(null);
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      toast.error(`Falha operacional: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // ACTION 3: Copy Tracking Code
  const handleCopyTracking = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast.success('Código de rastreamento copiado!');
  };

  // ACTION 4: Save Operational Note
  const handleSaveNote = async () => {
    if (!noteOrder) return;
    setActionLoading(`note_${noteOrder.id}`);
    try {
      const resp = await authenticatedFetch(`/api/admin/orders/${noteOrder.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: `[EXPEDIÇÃO] ${noteText}`,
          assignedTo: assignedOperator || undefined,
          type: 'shipping_note'
        })
      });

      if (!resp.ok) {
        const data = await resp.json();
        toast.error(data.message || 'Erro ao salvar observação.');
        return;
      }

      toast.success('Observação registrada na expedição!');
      setNoteOrder(null);
      setNoteText('');
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-full space-y-6 text-neutral-900 pb-12">
      {/* HEADER BAR */}
      <div className="bg-neutral-900 text-white rounded-2xl p-6 shadow-xl border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#eab308]/20 rounded-xl border border-[#eab308]/40">
              <Truck className="w-6 h-6 text-[#eab308]" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-wide uppercase flex items-center gap-2">
                Central de Expedição 2.0
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#eab308] text-black font-black uppercase">
                  Shipping 2.0
                </span>
              </h1>
              <p className="text-xs text-neutral-400 font-medium mt-0.5">
                Despacho logístico, geração de etiquetas e conferência com orquestração de estoque.
              </p>
            </div>
          </div>
        </div>

        {/* Tab & Refresh Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-neutral-800 p-1 rounded-xl flex items-center border border-neutral-700">
            <button
              onClick={() => setActiveTab('queue')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
                activeTab === 'queue'
                  ? "bg-[#eab308] text-black shadow-md font-black"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Package className="w-3.5 h-3.5" />
              Fila Ativa de Despacho
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
                activeTab === 'all'
                  ? "bg-[#eab308] text-black shadow-md font-black"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Todos os Envios ({orders.length})
            </button>
          </div>

          <button
            onClick={() => onRefreshOrders && onRefreshOrders()}
            className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl border border-neutral-700 transition-all cursor-pointer"
            title="Atualizar Pedidos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por ID, cliente, rastreio, produto ou SKU..."
              className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#eab308] focus:bg-white outline-none transition-all"
            />
          </div>

          {/* Modality Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedModalityFilter}
              onChange={(e: any) => setSelectedModalityFilter(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-700 focus:ring-2 focus:ring-[#eab308] outline-none"
            >
              <option value="all">📦 Todas as Modalidades</option>
              <option value="local">🚗 Entrega Própria (Joinville/Local)</option>
              <option value="melhor_envio">🚚 Melhor Envio (Correios/Transportadora)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-2">
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-700 focus:ring-2 focus:ring-[#eab308] outline-none"
            >
              <option value="all">⚡ Todos os Status</option>
              <option value="pending">Aguardando Preparação</option>
              <option value="label_created">Etiqueta Criada</option>
              <option value="shipped">Despachado</option>
              <option value="in_transit">Em Trânsito</option>
              <option value="delivered">Entregue</option>
              <option value="returned">Devolvido</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="md:col-span-2 flex items-center justify-end gap-2">
            <button
              onClick={() => setShowOverdueOnly(!showOverdueOnly)}
              className={cn(
                "px-2.5 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer",
                showOverdueOnly 
                  ? "bg-rose-50 border-rose-300 text-rose-700 font-black shadow-sm" 
                  : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100"
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Atrasados
            </button>

            <div className="bg-neutral-100 p-1 rounded-xl flex items-center border border-neutral-200">
              <button
                onClick={() => setViewMode('board')}
                className={cn("p-1.5 rounded-lg transition-all", viewMode === 'board' ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-black")}
                title="Visão Kanban"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn("p-1.5 rounded-lg transition-all", viewMode === 'list' ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-black")}
                title="Visão Lista"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Stage Selector Tabs */}
        <div className="flex md:hidden overflow-x-auto gap-2 pt-2 border-t border-neutral-100 pb-1">
          {CANONICAL_SHIPPING_STAGES.map(stage => (
            <button
              key={stage.id}
              onClick={() => setMobileActiveStage(stage.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0",
                mobileActiveStage === stage.id
                  ? "bg-black text-[#eab308] font-black shadow-sm"
                  : "bg-neutral-100 text-neutral-600"
              )}
            >
              {stage.label}
              <span className="px-1.5 py-0.2 rounded-full bg-neutral-200 text-black text-[10px]">
                {ordersByStage[stage.id]?.length || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN VIEW MODE: BOARD (KANBAN) */}
      {viewMode === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
          {CANONICAL_SHIPPING_STAGES.map(stage => {
            const stageOrders = ordersByStage[stage.id] || [];
            const StageIcon = stage.icon;

            return (
              <div
                key={stage.id}
                className={cn(
                  "bg-neutral-50/80 rounded-2xl border border-neutral-200 p-3 flex flex-col min-h-[500px]",
                  mobileActiveStage !== stage.id ? "hidden md:flex" : "flex"
                )}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 border-b border-neutral-200 mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-1 rounded-lg border text-xs font-black flex items-center gap-1.5", stage.color)}>
                      <StageIcon className="w-3.5 h-3.5" />
                      {stage.label}
                    </span>
                  </div>
                  <span className="text-xs font-black text-neutral-500 bg-neutral-200 px-2 py-0.5 rounded-full">
                    {stageOrders.length}
                  </span>
                </div>

                {/* Column Orders List */}
                <div className="space-y-3 overflow-y-auto max-h-[75vh] pr-1">
                  {stageOrders.length === 0 ? (
                    <div className="text-center py-10 px-4 border border-dashed border-neutral-200 rounded-xl bg-white/50">
                      <p className="text-xs font-semibold text-neutral-400">Nenhum pedido nesta fase.</p>
                    </div>
                  ) : (
                    stageOrders.map(order => (
                      <ShippingCard
                        key={order.id}
                        order={order}
                        isLocal={isEntregaPropria(order)}
                        isOverdue={isOrderOverdue(order)}
                        actionLoading={actionLoading}
                        onOpenConference={() => {
                          setConferenceOrder(order);
                          setConferenceChecklist({
                            productCorrect: false,
                            colorCorrect: false,
                            sizeCorrect: false,
                            qtyCorrect: false,
                            customizationCorrect: false,
                            packagingComplete: false,
                            addressVerified: false
                          });
                        }}
                        onOpenPrint={() => setPrintOrder(order)}
                        onOpenDetail={() => setDetailOrder(order)}
                        onOpenNote={() => {
                          setNoteOrder(order);
                          setNoteText('');
                          setAssignedOperator(order.shipping?.assignedTo || '');
                        }}
                        onCreateLabel={() => { handleCreateLabel(order); }}
                        onUpdateStatus={(newStatus) => { handleUpdateShippingStatus(order.id, newStatus); }}
                        onOpenTrackingModal={() => {
                          setTrackingModalOrder(order);
                          setInputTrackingCode(order.shipping?.trackingCode || order.trackingCode || '');
                          setInputCarrier(order.shipping?.carrier || order.transportadora || 'Correios SEDEX');
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-900 text-white text-[11px] font-black uppercase tracking-wider">
                  <th className="p-3">Pedido / Data</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Modalidade</th>
                  <th className="p-3">Itens</th>
                  <th className="p-3">Status Envio</th>
                  <th className="p-3">Rastreio</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs font-medium">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-neutral-400">
                      Nenhum pedido encontrado nos filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => {
                    const local = isEntregaPropria(order);
                    const overdue = isOrderOverdue(order);
                    const currentStatus = String(order.shipping?.status || order.shippingStatus || 'pending').toLowerCase();
                    const stageConfig = CANONICAL_SHIPPING_STAGES.find(s => s.id === currentStatus) || CANONICAL_SHIPPING_STAGES[0];

                    return (
                      <tr key={order.id} className="hover:bg-neutral-50 transition-all">
                        <td className="p-3">
                          <div className="font-black text-black">#{order.id}</div>
                          <div className="text-[10px] text-neutral-400">
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '—'}
                          </div>
                          {overdue && (
                            <span className="mt-1 inline-block px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-700">
                              ⚠️ Atrasado
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-neutral-800">{order.customerName || order.customer?.name || 'Cliente'}</div>
                          <div className="text-[10px] text-neutral-500">
                            {order.city || '—'}/{order.state || '—'} (CEP: {order.cep || '—'})
                          </div>
                        </td>
                        <td className="p-3">
                          {local ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              🚗 Entrega Própria
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                              🚚 Melhor Envio
                            </span>
                          )}
                          <div className="text-[10px] text-neutral-500 mt-0.5">
                            {order.shippingMethodName || order.shipping?.methodName || 'Padrão'}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-black">
                            {Array.isArray(order.items) ? order.items.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0) : 0} pçs
                          </div>
                          <div className="text-[10px] text-neutral-400 max-w-[180px] truncate">
                            {Array.isArray(order.items) ? order.items.map((i: any) => i.name || i.title).join(', ') : '—'}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={cn("px-2 py-1 rounded-lg border text-[10px] font-black uppercase inline-block", stageConfig.color)}>
                            {stageConfig.label}
                          </span>
                        </td>
                        <td className="p-3">
                          {(order.shipping?.trackingCode || order.trackingCode) ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[10px] font-bold bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                                {order.shipping?.trackingCode || order.trackingCode}
                              </span>
                              <button
                                onClick={() => handleCopyTracking(order.shipping?.trackingCode || order.trackingCode)}
                                className="p-1 hover:bg-neutral-200 rounded transition-all text-neutral-600"
                                title="Copiar Rastreio"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-neutral-400">Sem rastreio</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setConferenceOrder(order)}
                              className="px-2 py-1 bg-neutral-900 text-[#eab308] text-[10px] font-black rounded-lg hover:bg-black transition-all"
                            >
                              Conferir
                            </button>
                            <button
                              onClick={() => setPrintOrder(order)}
                              className="p-1.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded-lg transition-all"
                              title="Ficha de Expedição"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDetailOrder(order)}
                              className="p-1.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded-lg transition-all"
                              title="Ver Detalhes"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: CONFERÊNCIA DE EXPEDIÇÃO */}
      <AnimatePresence>
        {conferenceOrder && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200 space-y-5"
            >
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#eab308]/20 rounded-xl">
                    <CheckSquare className="w-5 h-5 text-black" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm uppercase text-black">Conferência Operacional — Pedido #{conferenceOrder.id}</h3>
                    <p className="text-[11px] text-neutral-500">{conferenceOrder.customerName || conferenceOrder.customer?.name}</p>
                  </div>
                </div>
                <button onClick={() => setConferenceOrder(null)} className="p-1 text-neutral-400 hover:text-black">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Items Summary */}
              <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 space-y-2 max-h-48 overflow-y-auto">
                <div className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Itens do Pedido</div>
                {Array.isArray(conferenceOrder.items) && conferenceOrder.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-semibold bg-white p-2 rounded-lg border border-neutral-100">
                    <div>
                      <span className="font-black text-black">{item.quantity || 1}x</span> {item.name || item.title}
                      <div className="text-[10px] text-neutral-500">
                        Cor: <span className="font-bold text-black">{item.color || '—'}</span> | Tam: <span className="font-bold text-black">{item.size || '—'}</span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-600">
                      {item.sku || 'SKU-001'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Interactive Checklist */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-black uppercase text-neutral-700">Checklist Obrigatório antes do Despacho:</div>
                <div className="space-y-2 text-xs">
                  {[
                    { key: 'productCorrect', label: 'Produtos e modelos conferidos com o pedido' },
                    { key: 'colorCorrect', label: 'Cores conferidas no lote de saída' },
                    { key: 'sizeCorrect', label: 'Tamanhos validados etiqueta por etiqueta' },
                    { key: 'qtyCorrect', label: 'Quantidade total de peças batendo com nota/ficha' },
                    { key: 'customizationCorrect', label: 'Estampas e personalizações verificadas' },
                    { key: 'packagingComplete', label: 'Embalagem lacrada e protegida para envio' },
                    { key: 'addressVerified', label: 'Endereço e etiqueta conferidos na caixa' },
                  ].map(chk => (
                    <label key={chk.key} className="flex items-center gap-2.5 p-2 rounded-xl bg-neutral-50 hover:bg-neutral-100 cursor-pointer border border-neutral-200 transition-all">
                      <input
                        type="checkbox"
                        checked={(conferenceChecklist as any)[chk.key]}
                        onChange={(e) => setConferenceChecklist({ ...conferenceChecklist, [chk.key]: e.target.checked })}
                        className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black"
                      />
                      <span className="font-medium text-neutral-800">{chk.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  onClick={() => setConferenceOrder(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-black cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  disabled={!Object.values(conferenceChecklist).every(Boolean)}
                  onClick={() => {
                    handleUpdateShippingStatus(conferenceOrder.id, 'shipped');
                    setConferenceOrder(null);
                  }}
                  className={cn(
                    "px-4 py-2.5 text-xs font-black rounded-xl transition-all flex items-center gap-2 cursor-pointer",
                    Object.values(conferenceChecklist).every(Boolean)
                      ? "bg-[#eab308] text-black shadow-lg hover:bg-yellow-400"
                      : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                  )}
                >
                  <Truck className="w-4 h-4" />
                  Aprovar Conferência & Despachar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: PRINTABLE FICHA DE EXPEDIÇÃO */}
      <AnimatePresence>
        {printOrder && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl border border-neutral-200 space-y-6 text-black print:p-0 print:shadow-none print:border-none"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-black pb-4">
                <div>
                  <h1 className="text-2xl font-black tracking-tight uppercase">F PAC STORE</h1>
                  <p className="text-xs font-bold text-neutral-600">FICHA DE EXPEDIÇÃO & DESPACHO LOGÍSTICO</p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black">PEDIDO #{printOrder.id}</div>
                  <div className="text-xs font-medium text-neutral-500">
                    Data: {printOrder.createdAt ? new Date(printOrder.createdAt).toLocaleDateString('pt-BR') : '—'}
                  </div>
                </div>
              </div>

              {/* Customer & Address */}
              <div className="grid grid-cols-2 gap-4 bg-neutral-50 p-4 rounded-xl border border-neutral-200 text-xs">
                <div>
                  <span className="font-black uppercase text-neutral-500 text-[10px] block mb-1">DESTINATÁRIO</span>
                  <div className="font-bold text-black text-sm">{printOrder.customerName || printOrder.customer?.name}</div>
                  <div>Tel: {printOrder.customerPhone || printOrder.phone || '—'}</div>
                  <div>CPF: {printOrder.cpf || printOrder.customerCpf || '—'}</div>
                </div>
                <div>
                  <span className="font-black uppercase text-neutral-500 text-[10px] block mb-1">ENDEREÇO DE ENTREGA</span>
                  <div className="font-bold">
                    {typeof printOrder.address === 'string' ? printOrder.address : `${printOrder.address?.street || ''}, ${printOrder.number || printOrder.address?.number || ''}`}
                  </div>
                  <div>Bairro: {printOrder.neighborhood || printOrder.address?.neighborhood || '—'}</div>
                  <div>Cidade/UF: {printOrder.city || printOrder.address?.city || '—'} / {printOrder.state || printOrder.address?.state || '—'}</div>
                  <div>CEP: {printOrder.cep || printOrder.address?.cep || '—'}</div>
                </div>
              </div>

              {/* Delivery Modality */}
              <div className="flex items-center justify-between bg-black text-white p-3 rounded-xl text-xs font-bold">
                <div>
                  MODALIDADE: <span className="text-[#eab308] uppercase font-black">{isEntregaPropria(printOrder) ? 'ENTREGA PRÓPRIA (JOINVILLE/RETIRADA)' : 'MELHOR ENVIO (CORREIOS/TRANSPORTADORA)'}</span>
                </div>
                <div>
                  SERVIÇO: <span className="text-[#eab308] font-black">{printOrder.shippingMethodName || 'Padrão'}</span>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <span className="font-black uppercase text-neutral-500 text-[10px] block mb-2">ITENS PARA CONFERÊNCIA</span>
                <table className="w-full text-left border-collapse border border-neutral-200 text-xs">
                  <thead>
                    <tr className="bg-neutral-100 text-neutral-700 font-black border-b border-neutral-200">
                      <th className="p-2">SKU</th>
                      <th className="p-2">Produto</th>
                      <th className="p-2">Cor</th>
                      <th className="p-2">Tam</th>
                      <th className="p-2 text-center">Qtd</th>
                      <th className="p-2 text-center">OK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {Array.isArray(printOrder.items) && printOrder.items.map((item: any, i: number) => (
                      <tr key={i}>
                        <td className="p-2 font-mono text-[10px]">{item.sku || `SKU-${i+1}`}</td>
                        <td className="p-2 font-bold">{item.name || item.title}</td>
                        <td className="p-2">{item.color || '—'}</td>
                        <td className="p-2">{item.size || '—'}</td>
                        <td className="p-2 text-center font-black">{item.quantity || 1}</td>
                        <td className="p-2 text-center">
                          <div className="w-4 h-4 border-2 border-black rounded mx-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer Signature */}
              <div className="pt-6 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-500">
                <div>Conferido por: ___________________________</div>
                <div>Assinatura do Operador: ___________________________</div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 print:hidden">
                <button
                  onClick={() => setPrintOrder(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-black cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2.5 bg-black text-[#eab308] text-xs font-black rounded-xl hover:bg-neutral-800 transition-all flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Ficha
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: OPERATIONAL NOTES */}
      <AnimatePresence>
        {noteOrder && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <h3 className="font-black text-sm uppercase text-black">Observação da Expedição — Pedido #{noteOrder.id}</h3>
                <button onClick={() => setNoteOrder(null)} className="p-1 text-neutral-400 hover:text-black">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1">Operador / Responsável Logístico</label>
                  <input
                    type="text"
                    value={assignedOperator}
                    onChange={(e) => setAssignedOperator(e.target.value)}
                    placeholder="Ex: João (Expedição)"
                    className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#eab308] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1">Observação Logística</label>
                  <textarea
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Ex: Caixa com fragilidade reforçada. Agendado para retirada às 15h."
                    className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#eab308] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setNoteOrder(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-black cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  disabled={!noteText.trim() && !assignedOperator.trim()}
                  onClick={() => { handleSaveNote(); }}
                  className="px-4 py-2 bg-black text-[#eab308] text-xs font-black rounded-xl hover:bg-neutral-800 transition-all flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Send className="w-3.5 h-3.5" />
                  Salvar Observação
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: INFORM TRACKING CODE */}
      <AnimatePresence>
        {trackingModalOrder && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <h3 className="font-black text-sm uppercase text-black">Informar Rastreamento — Pedido #{trackingModalOrder.id}</h3>
                <button onClick={() => setTrackingModalOrder(null)} className="p-1 text-neutral-400 hover:text-black">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1">Transportadora</label>
                  <input
                    type="text"
                    value={inputCarrier}
                    onChange={(e) => setInputCarrier(e.target.value)}
                    placeholder="Ex: Correios SEDEX, Jadlog, Entrega Local Joinville"
                    className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#eab308] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1">Código de Rastreio</label>
                  <input
                    type="text"
                    value={inputTrackingCode}
                    onChange={(e) => setInputTrackingCode(e.target.value)}
                    placeholder="Ex: BR123456789BR"
                    className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-[#eab308] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setTrackingModalOrder(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-black cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { handleUpdateShippingStatus(trackingModalOrder.id, 'shipped', inputTrackingCode, inputCarrier); }}
                  className="px-4 py-2 bg-[#eab308] text-black text-xs font-black rounded-xl hover:bg-yellow-400 transition-all flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Truck className="w-3.5 h-3.5" />
                  Salvar Rastreio & Despachar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* =========================================================================
   SUB-COMPONENT: SHIPPING CARD (EXPEDIÇÃO CARD)
   ========================================================================= */
interface ShippingCardProps {
  order: any;
  isLocal: boolean;
  isOverdue: boolean;
  actionLoading: string | null;
  onOpenConference: () => void;
  onOpenPrint: () => void;
  onOpenDetail: () => void;
  onOpenNote: () => void;
  onCreateLabel: () => void;
  onUpdateStatus: (newStatus: string) => void;
  onOpenTrackingModal: () => void;
}

const ShippingCard: React.FC<ShippingCardProps> = ({
  order,
  isLocal,
  isOverdue,
  actionLoading,
  onOpenConference,
  onOpenPrint,
  onOpenDetail,
  onOpenNote,
  onCreateLabel,
  onUpdateStatus,
  onOpenTrackingModal
}) => {
  const currentStatus = String(order.shipping?.status || order.shippingStatus || 'pending').toLowerCase();
  const hasLabel = Boolean(order.shippingLabelId || order.shipping?.labelId);
  const trackingCode = order.shipping?.trackingCode || order.trackingCode;

  const totalQty = Array.isArray(order.items) 
    ? order.items.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0)
    : 0;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm hover:shadow-md transition-all space-y-3">
      {/* Header Badges */}
      <div className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-black text-sm text-black">#{order.id}</span>
            {isOverdue && (
              <span className="px-1.5 py-0.2 text-[9px] font-black bg-rose-100 text-rose-700 rounded border border-rose-200 animate-pulse">
                ⚠️ Atrasado
              </span>
            )}
          </div>
          <div className="text-[10px] text-neutral-400 font-medium">
            {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '—'}
          </div>
        </div>

        {/* Modality Badge */}
        {isLocal ? (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
            🚗 ENTREGA PRÓPRIA
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-300 shrink-0">
            🚚 MELHOR ENVIO
          </span>
        )}
      </div>

      {/* Customer Info */}
      <div>
        <div className="font-black text-xs text-neutral-900 truncate">
          {order.customerName || order.customer?.name || 'Cliente'}
        </div>
        <div className="text-[10px] text-neutral-500 font-medium flex items-center gap-1 mt-0.5">
          <MapPin className="w-3 h-3 text-neutral-400 shrink-0" />
          <span className="truncate">
            {order.city || order.address?.city || 'Joinville'}/{order.state || order.address?.state || 'SC'} (CEP: {order.cep || order.address?.cep || '—'})
          </span>
        </div>
      </div>

      {/* Items Summary Box */}
      <div className="bg-neutral-50 p-2 rounded-lg border border-neutral-100 text-[11px] space-y-1">
        <div className="flex items-center justify-between font-bold text-neutral-700 text-[10px] uppercase">
          <span>{totalQty} peças</span>
          <span className="text-neutral-400">{order.shippingMethodName || 'Padrão'}</span>
        </div>
        {Array.isArray(order.items) && order.items.slice(0, 2).map((item: any, idx: number) => (
          <div key={idx} className="text-neutral-600 truncate flex items-center justify-between text-[10px]">
            <span className="truncate">{item.name || item.title}</span>
            <span className="font-bold text-black shrink-0 ml-1">({item.color}/{item.size})</span>
          </div>
        ))}
        {Array.isArray(order.items) && order.items.length > 2 && (
          <div className="text-[9px] text-neutral-400 font-bold italic text-right">
            +{order.items.length - 2} outros itens...
          </div>
        )}
      </div>

      {/* Tracking or Label Status */}
      {trackingCode ? (
        <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-lg flex items-center justify-between text-[10px]">
          <span className="font-bold text-emerald-800 font-mono">{trackingCode}</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(trackingCode);
              toast.success('Código copiado!');
            }}
            className="p-1 hover:bg-emerald-100 rounded text-emerald-700"
            title="Copiar Código"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
      ) : hasLabel ? (
        <div className="bg-blue-50 border border-blue-200 p-1.5 rounded-lg text-[10px] text-blue-800 font-black flex items-center gap-1.5">
          <Tag className="w-3 h-3 text-blue-600" />
          ETIQUETA JÁ GERADA
        </div>
      ) : null}

      {/* Actions Grid */}
      <div className="pt-2 border-t border-neutral-100 space-y-1.5">
        {/* Primary Operational Button depending on stage & modality */}
        {!isLocal && currentStatus === 'pending' && !hasLabel && (
          <button
            disabled={actionLoading === `label_${order.id}`}
            onClick={onCreateLabel}
            className="w-full py-1.5 bg-[#eab308] text-black text-xs font-black rounded-lg hover:bg-yellow-400 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          >
            {actionLoading === `label_${order.id}` ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Tag className="w-3.5 h-3.5" />
            )}
            Gerar Etiqueta
          </button>
        )}

        {/* Dispatch Button */}
        {['pending', 'label_created'].includes(currentStatus) && (
          <button
            onClick={onOpenConference}
            className="w-full py-1.5 bg-black text-[#eab308] text-xs font-black rounded-lg hover:bg-neutral-800 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Conferir & Despachar
          </button>
        )}

        {/* Next Stage Transitions */}
        {currentStatus === 'shipped' && (
          <button
            onClick={() => onUpdateStatus('in_transit')}
            className="w-full py-1.5 bg-purple-600 text-white text-xs font-black rounded-lg hover:bg-purple-700 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Marcar Em Trânsito
          </button>
        )}

        {currentStatus === 'in_transit' && (
          <button
            onClick={() => onUpdateStatus('delivered')}
            className="w-full py-1.5 bg-emerald-600 text-white text-xs font-black rounded-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Marcar Como Entregue
          </button>
        )}

        {/* Secondary Utilities */}
        <div className="flex items-center justify-between gap-1 pt-1">
          <button
            onClick={onOpenPrint}
            className="p-1.5 text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-lg transition-all"
            title="Ficha de Expedição"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onOpenTrackingModal}
            className="p-1.5 text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-lg transition-all"
            title="Informar Rastreio"
          >
            <Barcode className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onOpenNote}
            className="p-1.5 text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-lg transition-all"
            title="Observação Logística"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onOpenDetail}
            className="p-1.5 text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-lg transition-all"
            title="Ver Detalhes"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

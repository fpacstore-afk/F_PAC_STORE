import React, { useState, useMemo } from 'react';
import { 
  Package, Search, CheckCircle, XCircle, Clock, AlertTriangle, 
  ChevronRight, ChevronLeft, User, Calendar, Tag, FileText, Printer, 
  Plus, Filter, Loader2, ShieldAlert, Layers, Lock, RefreshCw, 
  SlidersHorizontal, Sparkles, Eye, Flame, ArrowRight, ArrowLeft, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PRODUCTION_STAGES, getStageFromStatus, ProductionStage } from '../../../constants/productionStages';
import { 
  updateProductionStatus, 
  updateProductionPriority, 
  updateProductionAssignment, 
  updateProductionDueDate, 
  addProductionNote 
} from '../../../services/orders/orderService';
import toast from 'react-hot-toast';

interface AdminProductionCenterProps {
  orders: any[];
  currentUserEmail?: string;
  onRefreshOrders?: () => void;
}

export const AdminProductionCenter: React.FC<AdminProductionCenterProps> = ({
  orders,
  currentUserEmail = 'Admin',
  onRefreshOrders
}) => {
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>('all');
  const [selectedDueFilter, setSelectedDueFilter] = useState<string>('all');
  const [selectedBlockFilter, setSelectedBlockFilter] = useState<string>('all');
  const [mobileActiveStage, setMobileActiveStage] = useState<string>('waiting');
  
  // Selected Order for Detail Drawer / Modal
  const [activeOrderForDetail, setActiveOrderForDetail] = useState<any | null>(null);

  // Backward Step Modal State
  const [backwardModal, setBackwardModal] = useState<{
    isOpen: boolean;
    order: any | null;
    targetStage: string;
    reason: string;
  }>({
    isOpen: false,
    order: null,
    targetStage: '',
    reason: ''
  });

  // Printable Production Sheet State
  const [printModalOrder, setPrintModalOrder] = useState<any | null>(null);

  // Loading States
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Active production orders (Filter out cancelled/rejected orders, non-approved/rejected payments, and shipped/delivered orders)
  const activeOrders = useMemo(() => {
    return orders.filter(order => {
      const orderStatus = String(order.status || '').toLowerCase();
      const payStatus = String(order.payment?.status || order.paymentStatus || 'pending').toLowerCase();
      const shipStatus = String(order.shipping?.status || order.shippingStatus || 'pending').toLowerCase();

      // Exclude cancelled or rejected order status
      if (['cancelled', 'cancelado', 'rejected', 'rejeitado'].includes(orderStatus)) return false;

      // Exclude rejected, cancelled, or refunded payments
      if (['rejected', 'cancelled', 'refunded', 'recusado', 'cancelado', 'estornado', 'reembolsado'].includes(payStatus)) return false;

      // Exclude shipped, in transit, or delivered shipping status
      if (['shipped', 'in_transit', 'delivered', 'despachado', 'entregue'].includes(shipStatus)) return false;

      return true;
    });
  }, [orders]);

  // Helper functions for order metrics & badges
  const getOrderMetrics = (order: any) => {
    const totalItems = Array.isArray(order.items) 
      ? order.items.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 1), 0)
      : 0;

    const payStatus = String(order.payment?.status || order.paymentStatus || 'pending').toLowerCase();
    const isPaymentApproved = payStatus === 'approved' || payStatus === 'partially_paid';
    const isPaymentBlocked = !isPaymentApproved;

    // Data completeness block
    let isDataBlocked = false;
    if (Array.isArray(order.items)) {
      order.items.forEach((item: any) => {
        if (!item.color || !item.size || (item.customization && !item.stampName && !item.customization?.stampName)) {
          isDataBlocked = true;
        }
      });
    }

    // Priority
    const priority = order.production?.priority || order.priority || 'normal';

    // Time in stage calculation
    const enteredAt = order.production?.enteredAt || order.production?.updatedAt || order.updatedAt || order.createdAt;
    let timeInStageText = 'Recente';
    if (enteredAt) {
      const date = typeof enteredAt.toDate === 'function' ? enteredAt.toDate() : new Date(enteredAt);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) timeInStageText = `há ${diffDays}d ${diffHours % 24}h`;
      else if (diffHours > 0) timeInStageText = `há ${diffHours}h ${diffMins % 60}min`;
      else if (diffMins > 0) timeInStageText = `há ${diffMins} min`;
      else timeInStageText = 'há instantes';
    }

    // Production due date & status
    const dueDateStr = order.production?.dueDate || order.productionDueDate;
    let dueStatus: 'ontime' | 'today' | 'overdue' | 'none' = 'none';
    let dueStatusLabel = 'Sem prazo';

    if (dueDateStr) {
      const dueDate = new Date(dueDateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDay = new Date(dueDate);
      dueDay.setHours(0, 0, 0, 0);

      const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        dueStatus = 'overdue';
        dueStatusLabel = 'Atrasado';
      } else if (diffDays === 0) {
        dueStatus = 'today';
        dueStatusLabel = 'Vence hoje';
      } else {
        dueStatus = 'ontime';
        dueStatusLabel = `Em ${diffDays} dias`;
      }
    }

    // Customization check
    const isCustomized = Array.isArray(order.items) && order.items.some((i: any) => i.stampName || i.customization || i.isCustom || i.stamp);

    return {
      totalItems,
      payStatus,
      isPaymentBlocked,
      isDataBlocked,
      priority,
      timeInStageText,
      dueStatus,
      dueStatusLabel,
      isCustomized
    };
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return activeOrders.filter(order => {
      const metrics = getOrderMetrics(order);
      const currentProdStatus = order.production?.status || order.productionStatus || 'waiting';

      // Search
      if (searchTerm.trim().length > 0) {
        const term = searchTerm.toLowerCase();
        const idMatch = String(order.id || '').toLowerCase().includes(term);
        const nameMatch = String(order.customerName || order.customer?.name || '').toLowerCase().includes(term);
        const emailMatch = String(order.customerEmail || order.customer?.email || '').toLowerCase().includes(term);
        const itemMatch = Array.isArray(order.items) && order.items.some((i: any) => 
          String(i.name || '').toLowerCase().includes(term) || String(i.sku || '').toLowerCase().includes(term)
        );
        if (!idMatch && !nameMatch && !emailMatch && !itemMatch) return false;
      }

      // Priority Filter
      if (selectedPriority !== 'all' && metrics.priority !== selectedPriority) return false;

      // Stage Filter
      if (selectedStageFilter !== 'all' && currentProdStatus !== selectedStageFilter) return false;

      // Due Date Filter
      if (selectedDueFilter !== 'all') {
        if (selectedDueFilter === 'overdue' && metrics.dueStatus !== 'overdue') return false;
        if (selectedDueFilter === 'today' && metrics.dueStatus !== 'today') return false;
        if (selectedDueFilter === 'ontime' && metrics.dueStatus !== 'ontime') return false;
      }

      // Block Filter
      if (selectedBlockFilter === 'blocked' && !metrics.isPaymentBlocked && !metrics.isDataBlocked) return false;
      if (selectedBlockFilter === 'unblocked' && (metrics.isPaymentBlocked || metrics.isDataBlocked)) return false;

      return true;
    });
  }, [activeOrders, searchTerm, selectedPriority, selectedStageFilter, selectedDueFilter, selectedBlockFilter]);

  // Stage counters
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {
      total: activeOrders.length,
      waiting: 0,
      separacao_corte: 0,
      estamparia: 0,
      costura: 0,
      embalagem: 0,
      ready: 0,
      completed: 0,
      urgent: 0,
      overdue: 0,
      blocked: 0
    };

    activeOrders.forEach(order => {
      const prodStatus = order.production?.status || order.productionStatus || 'waiting';
      const canonical = PRODUCTION_STAGES.find(s => s.id === prodStatus)?.id || 'waiting';
      counts[canonical] = (counts[canonical] || 0) + 1;

      const metrics = getOrderMetrics(order);
      if (metrics.priority === 'urgente') counts.urgent += 1;
      if (metrics.dueStatus === 'overdue') counts.overdue += 1;
      if (metrics.isPaymentBlocked || metrics.isDataBlocked) counts.blocked += 1;
    });

    return counts;
  }, [activeOrders]);

  // Handle stage transition
  const handleTransition = async (order: any, targetStage: string, reasonNote?: string) => {
    const currentProdStatus = order.production?.status || order.productionStatus || 'waiting';
    const currentIndex = PRODUCTION_STAGES.findIndex(s => s.id === currentProdStatus);
    const targetIndex = PRODUCTION_STAGES.findIndex(s => s.id === targetStage);

    // If moving backward and no reason provided, prompt backward modal
    if (targetIndex < currentIndex && (!reasonNote || reasonNote.trim().length === 0)) {
      setBackwardModal({
        isOpen: true,
        order,
        targetStage,
        reason: ''
      });
      return;
    }

    try {
      setUpdatingOrderId(order.id);
      await updateProductionStatus(
        order.id, 
        targetStage, 
        currentUserEmail, 
        reasonNote || `Avançado para ${PRODUCTION_STAGES.find(s => s.id === targetStage)?.label}`
      );
      toast.success(`Etapa atualizada para: ${PRODUCTION_STAGES.find(s => s.id === targetStage)?.label}`);
      
      if (onRefreshOrders) onRefreshOrders();
      if (activeOrderForDetail && activeOrderForDetail.id === order.id) {
        setActiveOrderForDetail((prev: any) => ({
          ...prev,
          production: { ...prev.production, status: targetStage }
        }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar estágio de produção.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Confirm backward transition modal submit
  const submitBackwardTransition = async () => {
    if (!backwardModal.order || !backwardModal.targetStage) return;
    if (!backwardModal.reason || backwardModal.reason.trim().length === 0) {
      toast.error('Informe o motivo obrigatório para retornar de etapa.');
      return;
    }

    const { order, targetStage, reason } = backwardModal;
    setBackwardModal({ isOpen: false, order: null, targetStage: '', reason: '' });
    await handleTransition(order, targetStage, reason);
  };

  // Priority Update
  const handlePriorityChange = async (orderId: string, priority: 'normal' | 'alta' | 'urgente') => {
    try {
      await updateProductionPriority(orderId, priority);
      toast.success(`Prioridade alterada para ${priority.toUpperCase()}`);
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar prioridade.');
    }
  };

  // Assignment Update
  const handleAssignmentChange = async (orderId: string, assignedTo: string) => {
    try {
      await updateProductionAssignment(orderId, assignedTo);
      toast.success(`Responsável atribuído: ${assignedTo || 'Nenhum'}`);
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atribuir responsável.');
    }
  };

  // Due Date Update
  const handleDueDateChange = async (orderId: string, dueDate: string) => {
    try {
      await updateProductionDueDate(orderId, dueDate);
      toast.success(`Prazo definido: ${dueDate}`);
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao definir prazo.');
    }
  };

  // Add Operational Note
  const handleAddNote = async (orderId: string) => {
    if (!newNoteText || newNoteText.trim().length === 0) return;
    try {
      setAddingNote(true);
      await addProductionNote(orderId, newNoteText.trim());
      toast.success('Observação registrada no histórico');
      setNewNoteText('');
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar observação.');
    } finally {
      setAddingNote(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 font-sans text-neutral-900">
      
      {/* 1. Header Banner & Key Indicators */}
      <div className="bg-neutral-900 text-white rounded-2xl p-6 shadow-xl border border-neutral-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-[#eab308] text-xs font-black uppercase tracking-widest mb-1">
              <Sparkles className="w-4 h-4" />
              <span>F PAC Store — Central Operacional de Produção 2.0</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-tight">
              Gestão Canônica de Produção
            </h1>
            <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
              Rastreabilidade ponta a ponta, máquina de estados canônica, controle de prioridades, prazos e ordens de fabricação sem alteração física de estoque.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefreshOrders && (
              <button 
                onClick={onRefreshOrders} 
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 border border-neutral-700 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-[#eab308]" />
                <span>Atualizar Fila</span>
              </button>
            )}
          </div>
        </div>

        {/* Counter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-6 pt-6 border-t border-neutral-800">
          <div className="bg-neutral-800/60 p-3 rounded-xl border border-neutral-700/50">
            <span className="text-[10px] font-bold uppercase text-neutral-400 block">Total Ativos</span>
            <span className="text-xl font-black text-white">{stageCounts.total}</span>
          </div>

          {PRODUCTION_STAGES.map(stage => {
            const count = stageCounts[stage.id] || 0;
            return (
              <div 
                key={stage.id} 
                onClick={() => setSelectedStageFilter(selectedStageFilter === stage.id ? 'all' : stage.id)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedStageFilter === stage.id 
                    ? 'bg-[#eab308]/20 border-[#eab308] text-white' 
                    : 'bg-neutral-800/60 border-neutral-700/50 hover:border-neutral-600 text-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase truncate">{stage.label.split(' ')[0]}</span>
                  <span className="text-xs">{stage.emoji}</span>
                </div>
                <span className="text-xl font-black block mt-0.5">{count}</span>
              </div>
            );
          })}
        </div>

        {/* Alert Indicators */}
        {(stageCounts.urgent > 0 || stageCounts.overdue > 0 || stageCounts.blocked > 0) && (
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-neutral-800 text-xs">
            {stageCounts.urgent > 0 && (
              <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                {stageCounts.urgent} Urgente{stageCounts.urgent > 1 ? 's' : ''}
              </span>
            )}
            {stageCounts.overdue > 0 && (
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {stageCounts.overdue} Atrasado{stageCounts.overdue > 1 ? 's' : ''}
              </span>
            )}
            {stageCounts.blocked > 0 && (
              <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                {stageCounts.blocked} Bloqueado{stageCounts.blocked > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Control Toolbar (Filters & Search) */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-neutral-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-neutral-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Pedido #, Cliente, Produto, SKU..."
            className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="all">Prioridade: Todas</option>
            <option value="normal">🟢 Normal</option>
            <option value="alta">🟡 Alta</option>
            <option value="urgente">🔴 Urgente</option>
          </select>

          {/* Due Status Filter */}
          <select
            value={selectedDueFilter}
            onChange={(e) => setSelectedDueFilter(e.target.value)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="all">Prazo: Todos</option>
            <option value="ontime">No prazo</option>
            <option value="today">Vence hoje</option>
            <option value="overdue">Atrasado</option>
          </select>

          {/* Blocked Filter */}
          <select
            value={selectedBlockFilter}
            onChange={(e) => setSelectedBlockFilter(e.target.value)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="all">Bloqueios: Todos</option>
            <option value="blocked">Somente Bloqueados</option>
            <option value="unblocked">Sem Bloqueio</option>
          </select>
        </div>
      </div>

      {/* Mobile Stage Selector Tabs */}
      <div className="flex lg:hidden overflow-x-auto gap-2 pb-2 scrollbar-none">
        {PRODUCTION_STAGES.map(stage => (
          <button
            key={stage.id}
            onClick={() => setMobileActiveStage(stage.id)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase whitespace-nowrap transition-all cursor-pointer ${
              mobileActiveStage === stage.id
                ? 'bg-black text-[#eab308] shadow-md'
                : 'bg-white text-neutral-600 border border-neutral-200'
            }`}
          >
            {stage.emoji} {stage.label} ({activeOrders.filter(o => (o.production?.status || o.productionStatus || 'waiting') === stage.id).length})
          </button>
        ))}
      </div>

      {/* 3. KANBAN BOARD */}
      <div className="hidden lg:grid grid-cols-7 gap-4 items-start overflow-x-auto pb-6 min-w-[1280px]">
        {PRODUCTION_STAGES.map((stage, stageIdx) => {
          const stageOrders = filteredOrders.filter(order => {
            const currentStatus = order.production?.status || order.productionStatus || 'waiting';
            return currentStatus === stage.id;
          });

          return (
            <div 
              key={stage.id} 
              className="bg-neutral-100/80 rounded-2xl p-3 border border-neutral-200 flex flex-col min-h-[600px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-200/80">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{stage.emoji}</span>
                  <h3 className="text-xs font-black uppercase text-neutral-800 tracking-tight">
                    {stage.label}
                  </h3>
                </div>
                <span className="px-2 py-0.5 bg-neutral-200 text-neutral-700 rounded-full text-[10px] font-black">
                  {stageOrders.length}
                </span>
              </div>

              {/* Cards List */}
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[750px] pr-0.5">
                {stageOrders.length === 0 ? (
                  <div className="h-28 border border-dashed border-neutral-300 rounded-xl flex items-center justify-center text-[11px] font-medium text-neutral-400">
                    Nenhum pedido
                  </div>
                ) : (
                  stageOrders.map(order => {
                    const metrics = getOrderMetrics(order);
                    const isUpdating = updatingOrderId === order.id;

                    return (
                      <motion.div
                        key={order.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all hover:shadow-md relative group ${
                          metrics.isPaymentBlocked 
                            ? 'border-rose-300 bg-rose-50/20' 
                            : metrics.priority === 'urgente' 
                              ? 'border-amber-400' 
                              : 'border-neutral-200'
                        }`}
                      >
                        {/* Card Header: Order ID & Customer */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-black text-black block">
                              #{order.id.slice(-6).toUpperCase()}
                            </span>
                            <span className="text-[11px] font-bold text-neutral-700 truncate block max-w-[130px]">
                              {order.customerName || order.customer?.name || 'Cliente'}
                            </span>
                          </div>

                          {/* Action Details Eye */}
                          <button
                            onClick={() => setActiveOrderForDetail(order)}
                            className="p-1 hover:bg-neutral-100 rounded-lg text-neutral-500 hover:text-black cursor-pointer"
                            title="Ver Detalhes do Pedido"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Payment Block Warning */}
                        {metrics.isPaymentBlocked && (
                          <div className="mt-2 bg-rose-100 text-rose-800 text-[9px] font-black uppercase px-2 py-1 rounded-md flex items-center gap-1 border border-rose-200">
                            <Lock className="w-3 h-3 text-rose-600 shrink-0" />
                            <span>BLOQUEADO — PAGAMENTO</span>
                          </div>
                        )}

                        {/* Data Block Warning */}
                        {metrics.isDataBlocked && (
                          <div className="mt-2 bg-amber-100 text-amber-800 text-[9px] font-black uppercase px-2 py-1 rounded-md flex items-center gap-1 border border-amber-200">
                            <ShieldAlert className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>INFORMAÇÕES INCOMPLETAS</span>
                          </div>
                        )}

                        {/* Items Summary */}
                        <div className="mt-2.5 pt-2 border-t border-neutral-100 space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-500 font-bold uppercase">
                            <span>Peças ({metrics.totalItems})</span>
                            {metrics.isCustomized && (
                              <span className="text-purple-600 font-black flex items-center gap-0.5">
                                <Sparkles className="w-3 h-3" /> PRIME
                              </span>
                            )}
                          </div>
                          
                          <div className="text-[11px] font-semibold text-neutral-800 space-y-0.5 max-h-20 overflow-y-auto scrollbar-none">
                            {Array.isArray(order.items) && order.items.map((item: any, idx: number) => (
                              <div key={idx} className="truncate">
                                <span className="font-bold">{item.quantity}x</span> {item.name || 'Produto'}
                                {item.color && <span className="text-neutral-500"> • {item.color}</span>}
                                {item.size && <span className="text-neutral-500"> • {item.size}</span>}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Priority & Due Date Badges */}
                        <div className="mt-3 flex items-center justify-between text-[10px] gap-1">
                          <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                            metrics.priority === 'urgente' 
                              ? 'bg-red-100 text-red-700 border border-red-200' 
                              : metrics.priority === 'alta' 
                                ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                                : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {metrics.priority}
                          </span>

                          <span className={`font-bold flex items-center gap-1 text-[9px] ${
                            metrics.dueStatus === 'overdue' 
                              ? 'text-red-600' 
                              : metrics.dueStatus === 'today' 
                                ? 'text-amber-600' 
                                : 'text-neutral-500'
                          }`}>
                            <Clock className="w-3 h-3" />
                            {metrics.timeInStageText}
                          </span>
                        </div>

                        {/* Worker assigned */}
                        {order.production?.assignedTo && (
                          <div className="mt-2 text-[10px] text-neutral-500 font-medium flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span className="truncate">{order.production.assignedTo}</span>
                          </div>
                        )}

                        {/* Stage Controls */}
                        <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between gap-1">
                          {/* Step Backward Button */}
                          {stageIdx > 0 ? (
                            <button
                              disabled={isUpdating || metrics.isPaymentBlocked}
                              onClick={() => handleTransition(order, PRODUCTION_STAGES[stageIdx - 1].id)}
                              className="p-1.5 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 text-neutral-700 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                              title={`Voltar para ${PRODUCTION_STAGES[stageIdx - 1].label}`}
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <div />
                          )}

                          {/* Print Ficha Button */}
                          <button
                            onClick={() => setPrintModalOrder(order)}
                            className="p-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg cursor-pointer"
                            title="Ficha de Produção"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Step Forward Button */}
                          {stageIdx < PRODUCTION_STAGES.length - 1 ? (
                            <button
                              disabled={isUpdating || metrics.isPaymentBlocked}
                              onClick={() => handleTransition(order, PRODUCTION_STAGES[stageIdx + 1].id)}
                              className="px-2.5 py-1.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-[#eab308] rounded-lg text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-all shadow-sm"
                            >
                              {isUpdating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <span>Avançar</span>
                                  <ArrowRight className="w-3 h-3" />
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                              CONCLUÍDO
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile Kanban Column View */}
      <div className="lg:hidden space-y-4">
        {(() => {
          const stageOrders = filteredOrders.filter(order => {
            const currentStatus = order.production?.status || order.productionStatus || 'waiting';
            return currentStatus === mobileActiveStage;
          });

          const currentStageObj = PRODUCTION_STAGES.find(s => s.id === mobileActiveStage) || PRODUCTION_STAGES[0];
          const stageIdx = PRODUCTION_STAGES.findIndex(s => s.id === mobileActiveStage);

          return (
            <div className="bg-neutral-100 rounded-2xl p-4 border border-neutral-200">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{currentStageObj.emoji}</span>
                  <h3 className="font-black uppercase text-sm">{currentStageObj.label}</h3>
                </div>
                <span className="px-2.5 py-1 bg-black text-[#eab308] rounded-full text-xs font-black">
                  {stageOrders.length}
                </span>
              </div>

              {stageOrders.length === 0 ? (
                <div className="py-12 text-center text-xs text-neutral-400 font-bold uppercase">
                  Nenhum pedido nesta etapa
                </div>
              ) : (
                <div className="space-y-3">
                  {stageOrders.map(order => {
                    const metrics = getOrderMetrics(order);
                    const isUpdating = updatingOrderId === order.id;

                    return (
                      <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border border-neutral-200">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-black text-black">#{order.id.slice(-6).toUpperCase()}</span>
                            <span className="text-xs font-bold text-neutral-700 block">{order.customerName || order.customer?.name}</span>
                          </div>
                          <button
                            onClick={() => setActiveOrderForDetail(order)}
                            className="p-1.5 bg-neutral-100 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> Detalhes
                          </button>
                        </div>

                        {metrics.isPaymentBlocked && (
                          <div className="mt-2 bg-rose-100 text-rose-800 text-[10px] font-black uppercase px-2 py-1 rounded-md flex items-center gap-1">
                            <Lock className="w-3 h-3" /> BLOQUEADO — PAGAMENTO
                          </div>
                        )}

                        <div className="mt-3 text-xs space-y-1 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200/60">
                          {Array.isArray(order.items) && order.items.map((item: any, idx: number) => (
                            <div key={idx} className="font-medium text-neutral-800">
                              <span className="font-bold">{item.quantity}x</span> {item.name} ({item.color || 'Sem cor'} / {item.size || 'Sem Tam'})
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                          {stageIdx > 0 && (
                            <button
                              disabled={isUpdating || metrics.isPaymentBlocked}
                              onClick={() => handleTransition(order, PRODUCTION_STAGES[stageIdx - 1].id)}
                              className="px-3 py-2 bg-neutral-100 text-neutral-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                            </button>
                          )}

                          {stageIdx < PRODUCTION_STAGES.length - 1 && (
                            <button
                              disabled={isUpdating || metrics.isPaymentBlocked}
                              onClick={() => handleTransition(order, PRODUCTION_STAGES[stageIdx + 1].id)}
                              className="ml-auto px-4 py-2 bg-black text-[#eab308] rounded-xl text-xs font-black uppercase flex items-center gap-1 cursor-pointer shadow-sm"
                            >
                              Avançar <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* 4. MODAL DE RETORNO OBRIGATÓRIO DE ETAPA */}
      <AnimatePresence>
        {backwardModal.isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 space-y-4"
            >
              <div className="flex items-center gap-3 text-amber-600">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="font-black text-lg uppercase">Motivo de Retorno Obrigatório</h3>
              </div>

              <p className="text-xs text-neutral-600 font-medium">
                Você está retornando o pedido <strong>#{backwardModal.order?.id?.slice(-6).toUpperCase()}</strong> para a etapa <strong>{PRODUCTION_STAGES.find(s => s.id === backwardModal.targetStage)?.label}</strong>.
              </p>

              <div>
                <label className="text-[11px] font-black uppercase text-neutral-700 block mb-1">
                  Motivo Operacional / Justificativa *
                </label>
                <textarea
                  value={backwardModal.reason}
                  onChange={(e) => setBackwardModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Ex: Defeito na estampa identificado no CQ, enviado para re-impressão..."
                  rows={3}
                  className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:ring-2 focus:ring-black focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  onClick={() => setBackwardModal({ isOpen: false, order: null, targetStage: '', reason: '' })}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitBackwardTransition}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-xs font-black uppercase rounded-xl cursor-pointer shadow-sm"
                >
                  Confirmar Retorno
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. MODAL DETALHES COMPLETO / DRAWER DA PRODUÇÃO */}
      <AnimatePresence>
        {activeOrderForDetail && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-end">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col justify-between overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="p-6 bg-neutral-900 text-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#eab308]">Ficha de Acompanhamento Operacional</span>
                  <h2 className="text-xl font-black uppercase tracking-tight">
                    Pedido #{activeOrderForDetail.id.slice(-6).toUpperCase()}
                  </h2>
                  <span className="text-xs text-neutral-400 font-medium">
                    Cliente: {activeOrderForDetail.customerName || activeOrderForDetail.customer?.name}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPrintModalOrder(activeOrderForDetail)}
                    className="p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" /> Impressão
                  </button>
                  <button
                    onClick={() => setActiveOrderForDetail(null)}
                    className="p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                
                {/* Section A: Production Status Selector */}
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-3">
                  <h3 className="font-black uppercase text-neutral-800 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#eab308]" /> Estágio Atual na Linha de Produção
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PRODUCTION_STAGES.map(stage => {
                      const currentStatus = activeOrderForDetail.production?.status || activeOrderForDetail.productionStatus || 'waiting';
                      const isCurrent = currentStatus === stage.id;

                      return (
                        <button
                          key={stage.id}
                          onClick={() => handleTransition(activeOrderForDetail, stage.id)}
                          className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                            isCurrent 
                              ? 'bg-black text-[#eab308] border-black font-black shadow-md' 
                              : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400 font-medium'
                          }`}
                        >
                          <span className="text-sm block">{stage.emoji}</span>
                          <span className="text-[11px] uppercase block truncate mt-1">{stage.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section B: Priority, Due Date & Responsibility */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Priority */}
                  <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                    <label className="font-black uppercase text-[10px] text-neutral-500 block mb-1">
                      Prioridade
                    </label>
                    <select
                      value={activeOrderForDetail.production?.priority || activeOrderForDetail.priority || 'normal'}
                      onChange={(e) => handlePriorityChange(activeOrderForDetail.id, e.target.value as any)}
                      className="w-full p-2 bg-white border border-neutral-200 rounded-lg font-bold text-xs focus:ring-2 focus:ring-black cursor-pointer"
                    >
                      <option value="normal">🟢 Normal</option>
                      <option value="alta">🟡 Alta</option>
                      <option value="urgente">🔴 Urgente</option>
                    </select>
                  </div>

                  {/* Due Date */}
                  <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                    <label className="font-black uppercase text-[10px] text-neutral-500 block mb-1">
                      Prazo de Produção
                    </label>
                    <input
                      type="date"
                      value={activeOrderForDetail.production?.dueDate || activeOrderForDetail.productionDueDate || ''}
                      onChange={(e) => handleDueDateChange(activeOrderForDetail.id, e.target.value)}
                      className="w-full p-2 bg-white border border-neutral-200 rounded-lg font-bold text-xs focus:ring-2 focus:ring-black cursor-pointer"
                    />
                  </div>

                  {/* Responsible */}
                  <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                    <label className="font-black uppercase text-[10px] text-neutral-500 block mb-1">
                      Responsável
                    </label>
                    <input
                      type="text"
                      placeholder="Nome do operador..."
                      value={activeOrderForDetail.production?.assignedTo || activeOrderForDetail.assignedTo || ''}
                      onChange={(e) => handleAssignmentChange(activeOrderForDetail.id, e.target.value)}
                      className="w-full p-2 bg-white border border-neutral-200 rounded-lg font-bold text-xs focus:ring-2 focus:ring-black"
                    />
                  </div>
                </div>

                {/* Section C: Order Items & Personalization */}
                <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                  <div className="p-3 bg-neutral-100 border-b border-neutral-200 font-black uppercase text-neutral-800 flex items-center justify-between">
                    <span>Itens do Pedido para Produção</span>
                    <span className="text-neutral-500 font-medium">
                      {Array.isArray(activeOrderForDetail.items) ? activeOrderForDetail.items.length : 0} item(s)
                    </span>
                  </div>

                  <div className="divide-y divide-neutral-100">
                    {Array.isArray(activeOrderForDetail.items) && activeOrderForDetail.items.map((item: any, idx: number) => (
                      <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-12 h-12 object-cover rounded-lg border border-neutral-200 shrink-0" />
                          ) : (
                            <div className="w-12 h-12 bg-neutral-100 rounded-lg border border-neutral-200 flex items-center justify-center shrink-0">
                              <Package className="w-6 h-6 text-neutral-400" />
                            </div>
                          )}

                          <div>
                            <h4 className="font-bold text-sm text-black">{item.name}</h4>
                            <div className="text-neutral-500 space-x-2 font-medium">
                              <span>Cor: <strong>{item.color || 'N/A'}</strong></span>
                              <span>•</span>
                              <span>Tamanho: <strong>{item.size || 'N/A'}</strong></span>
                              <span>•</span>
                              <span>Qtd: <strong>{item.quantity}</strong></span>
                            </div>
                            {item.sku && <span className="text-[10px] text-neutral-400 font-mono block mt-0.5">SKU: {item.sku}</span>}
                          </div>
                        </div>

                        {/* Personalization Details */}
                        {(item.stampName || item.customization) && (
                          <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200 text-purple-900 max-w-xs space-y-1">
                            <span className="font-black text-[10px] uppercase flex items-center gap-1 text-purple-700">
                              <Sparkles className="w-3 h-3" /> Personalização PRIME
                            </span>
                            {item.stampName && <div className="font-bold">Estampa: {item.stampName}</div>}
                            {item.customization?.position && <div>Posição: {item.customization.position}</div>}
                            {item.customization?.notes && <div className="text-[10px] italic">"{item.customization.notes}"</div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section D: Operational Notes */}
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-3">
                  <h3 className="font-black uppercase text-neutral-800 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-[#eab308]" /> Observações Operacionais
                  </h3>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Adicionar observação técnica (ex: conferir gola antes de embalar)..."
                      className="flex-1 p-2.5 bg-white border border-neutral-200 rounded-xl text-xs focus:ring-2 focus:ring-black"
                    />
                    <button
                      disabled={addingNote || !newNoteText.trim()}
                      onClick={() => handleAddNote(activeOrderForDetail.id)}
                      className="px-4 py-2.5 bg-black text-[#eab308] font-black uppercase text-xs rounded-xl disabled:opacity-40 cursor-pointer"
                    >
                      {addingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                    </button>
                  </div>

                  {/* List Notes */}
                  {Array.isArray(activeOrderForDetail.production?.notes) && activeOrderForDetail.production.notes.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-neutral-200">
                      {activeOrderForDetail.production.notes.map((n: any, idx: number) => (
                        <div key={idx} className="bg-white p-3 rounded-lg border border-neutral-200 space-y-1">
                          <p className="font-medium text-neutral-800">{n.note}</p>
                          <div className="text-[10px] text-neutral-400 flex items-center justify-between">
                            <span>{n.author}</span>
                            <span>{new Date(n.timestamp).toLocaleString('pt-BR')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section E: Production History Log */}
                <div className="bg-white p-4 rounded-xl border border-neutral-200 space-y-3">
                  <h3 className="font-black uppercase text-neutral-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#eab308]" /> Histórico Auditável da Produção
                  </h3>

                  {Array.isArray(activeOrderForDetail.history) && activeOrderForDetail.history.filter((h: any) => h.type?.includes('production')).length > 0 ? (
                    <div className="space-y-2 border-l-2 border-neutral-200 pl-4">
                      {activeOrderForDetail.history.filter((h: any) => h.type?.includes('production')).map((h: any, idx: number) => (
                        <div key={idx} className="relative pb-2">
                          <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 bg-black rounded-full border-2 border-white" />
                          <div className="font-bold text-neutral-800">{h.message}</div>
                          <div className="text-[10px] text-neutral-400 flex items-center gap-2">
                            <span>Por: {h.operator}</span>
                            <span>•</span>
                            <span>{new Date(h.timestamp).toLocaleString('pt-BR')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-neutral-400 text-xs italic">Nenhum evento registrado no histórico ainda.</div>
                  )}
                </div>

              </div>

              {/* Drawer Footer */}
              <div className="p-4 bg-neutral-100 border-t border-neutral-200 flex items-center justify-between">
                <button
                  onClick={() => setActiveOrderForDetail(null)}
                  className="px-6 py-2.5 bg-black text-[#eab308] font-black uppercase text-xs rounded-xl cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. MODAL DE IMPRESSÃO / FICHA DE PRODUÇÃO */}
      <AnimatePresence>
        {printModalOrder && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl border border-neutral-300 font-sans print:shadow-none print:border-none"
            >
              <div className="flex items-center justify-between pb-6 border-b-2 border-black">
                <div>
                  <h1 className="text-2xl font-black uppercase tracking-tight text-black">FICHA DE PRODUÇÃO</h1>
                  <span className="text-xs font-bold uppercase text-neutral-600 block mt-0.5">F PAC STORE — ORDEM DE FABRICAÇÃO</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-black">#{printModalOrder.id.slice(-6).toUpperCase()}</span>
                  <span className="text-xs text-neutral-500 block">{new Date().toLocaleDateString('pt-BR')}</span>
                </div>
              </div>

              {/* Customer & Shipping Summary */}
              <div className="grid grid-cols-2 gap-4 my-6 bg-neutral-50 p-4 rounded-xl border border-neutral-200 text-xs">
                <div>
                  <span className="font-black uppercase text-neutral-500 block">Cliente</span>
                  <strong className="text-sm font-bold block text-black">{printModalOrder.customerName || printModalOrder.customer?.name}</strong>
                  <span className="text-neutral-600">{printModalOrder.customerEmail || printModalOrder.customer?.email}</span>
                </div>

                <div>
                  <span className="font-black uppercase text-neutral-500 block">Prazo & Prioridade</span>
                  <strong className="text-sm font-bold block text-black uppercase">{printModalOrder.production?.priority || 'NORMAL'}</strong>
                  <span className="text-neutral-600">Prazo: {printModalOrder.production?.dueDate || 'Não especificado'}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="my-6">
                <h3 className="font-black uppercase text-sm mb-3 text-black">ITENS PARA PRODUÇÃO</h3>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-black text-white uppercase text-left font-black">
                      <th className="p-2.5">Qtd</th>
                      <th className="p-2.5">Produto</th>
                      <th className="p-2.5">Cor</th>
                      <th className="p-2.5">Tamanho</th>
                      <th className="p-2.5">SKU</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 border-b border-neutral-200">
                    {Array.isArray(printModalOrder.items) && printModalOrder.items.map((item: any, idx: number) => (
                      <tr key={idx} className="font-medium text-neutral-900">
                        <td className="p-2.5 font-bold text-sm">{item.quantity}</td>
                        <td className="p-2.5 font-bold">{item.name}</td>
                        <td className="p-2.5">{item.color || '-'}</td>
                        <td className="p-2.5">{item.size || '-'}</td>
                        <td className="p-2.5 font-mono text-[10px]">{item.sku || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Personalization Specs */}
              {Array.isArray(printModalOrder.items) && printModalOrder.items.some((i: any) => i.stampName || i.customization) && (
                <div className="my-6 bg-purple-50 p-4 rounded-xl border border-purple-200 text-xs text-purple-950">
                  <h3 className="font-black uppercase text-purple-900 mb-2">ESPECIFICAÇÕES DE ESTAMPARIA / CUSTOMIZAÇÃO</h3>
                  {printModalOrder.items.map((item: any, idx: number) => (item.stampName || item.customization) && (
                    <div key={idx} className="space-y-1 mb-2 last:mb-0">
                      <strong>Item {idx + 1} ({item.name}):</strong> Estampa: {item.stampName || 'Personalizada'} | Posição: {item.customization?.position || 'Padrão'}
                      {item.customization?.notes && <p className="italic text-purple-800">Obs: {item.customization.notes}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              {Array.isArray(printModalOrder.production?.notes) && printModalOrder.production.notes.length > 0 && (
                <div className="my-6 bg-amber-50 p-4 rounded-xl border border-amber-200 text-xs">
                  <h3 className="font-black uppercase text-amber-900 mb-2">OBSERVAÇÕES OPERACIONAIS DA FÁBRICA</h3>
                  {printModalOrder.production.notes.map((n: any, idx: number) => (
                    <p key={idx} className="text-amber-950 font-medium">• {n.note}</p>
                  ))}
                </div>
              )}

              {/* Signature lines */}
              <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-neutral-300 text-center text-xs text-neutral-500 font-bold uppercase">
                <div>
                  <div className="border-t border-neutral-400 mb-1" />
                  <span>Responsável CQ / Embalagem</span>
                </div>
                <div>
                  <div className="border-t border-neutral-400 mb-1" />
                  <span>Conferência de Expedição</span>
                </div>
              </div>

              {/* Action Buttons (Hidden on Print) */}
              <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-neutral-200 print:hidden">
                <button
                  onClick={() => setPrintModalOrder(null)}
                  className="px-5 py-2.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-6 py-2.5 bg-black text-[#eab308] font-black uppercase text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Ficha
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

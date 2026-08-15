import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  registerManualPayment, 
  processRefund, 
  getOrderFinancialEvents 
} from '../services/orders/orderService';
import { useFinancialPrivacy } from '../context/FinancialPrivacyContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign, 
  CreditCard, 
  Calendar, 
  User, 
  Search, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Plus, 
  X, 
  FileText, 
  Filter, 
  RotateCcw, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ShieldCheck, 
  History, 
  ChevronRight,
  Receipt
} from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  getOrderTotal, 
  getOrderPaidAmount, 
  getOrderPendingAmount, 
  getOrderRefundedAmount, 
  getOrderPaymentStatus, 
  getOrderPaymentDueDate, 
  isOrderPaymentOverdue, 
  getPaymentBadgeType 
} from '../utils/orderFinancial';
import { FinancialEvent } from '../types/financial';

interface AdminAccountsReceivableProps {
  initialSearchTerm?: string;
  onNavigateOrder?: (orderId: string) => void;
}

export function getOrderBalanceDue(order: any): number {
  return getOrderPendingAmount(order);
}

export function getOrderAmountPaid(order: any): number {
  return getOrderPaidAmount(order);
}

export default function AdminAccountsReceivable({ initialSearchTerm = '', onNavigateOrder }: AdminAccountsReceivableProps) {
  const { formatMoney } = useFinancialPrivacy();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'overdue' | 'partial' | 'paid' | 'refunded'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | '7days' | 'month' | 'prev_month'>('all');

  const [ordersLimit, setOrdersLimit] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Modal: Registrar Pagamento Manual
  const [paymentModalOrder, setPaymentModalOrder] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('PIX');
  const [paymentReason, setPaymentReason] = useState<string>('');
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Modal: Reembolso / Estorno
  const [refundModalOrder, setRefundModalOrder] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState<string>('');
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  // Drawer: Histórico Financeiro / Ledger do Pedido
  const [ledgerOrder, setLedgerOrder] = useState<any | null>(null);
  const [ledgerEvents, setLedgerEvents] = useState<FinancialEvent[]>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ordersLimit));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOrders(docs);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar contas a receber:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [ordersLimit]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    const now = new Date();

    return orders.filter(o => {
      // Exclui pedidos cancelados se não houver saldo nem valor pago
      const status = getOrderPaymentStatus(o);
      const total = getOrderTotal(o);
      const paid = getOrderPaidAmount(o);
      const pending = getOrderPendingAmount(o);

      if (status === 'cancelled' && paid === 0) return false;

      // Status filter
      if (statusFilter === 'pending') {
        if (pending <= 0) return false;
      } else if (statusFilter === 'overdue') {
        if (!isOrderPaymentOverdue(o)) return false;
      } else if (statusFilter === 'partial') {
        if (status !== 'partially_paid') return false;
      } else if (statusFilter === 'paid') {
        if (status !== 'approved' || pending > 0) return false;
      } else if (statusFilter === 'refunded') {
        if (status !== 'refunded' && status !== 'partially_refunded' && getOrderRefundedAmount(o) === 0) return false;
      }

      // Period filter based on createdAt
      const created = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt ? new Date(o.createdAt) : null);
      if (created && !isNaN(created.getTime())) {
        if (periodFilter === 'today') {
          if (created.toDateString() !== now.toDateString()) return false;
        } else if (periodFilter === '7days') {
          const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 7) return false;
        } else if (periodFilter === 'month') {
          if (created.getMonth() !== now.getMonth() || created.getFullYear() !== now.getFullYear()) return false;
        } else if (periodFilter === 'prev_month') {
          const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          if (created.getMonth() !== prevMonthDate.getMonth() || created.getFullYear() !== prevMonthDate.getFullYear()) return false;
        }
      }

      // Search term match
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const customerName = String(o.customerName || o.name || '').toLowerCase();
        const customerEmail = String(o.customerEmail || o.email || '').toLowerCase();
        const customerPhone = String(o.customerPhone || o.phone || '').toLowerCase();
        const orderId = String(o.id || '').toLowerCase();
        const method = String(o.payment?.method || o.paymentMethod || '').toLowerCase();
        return (
          customerName.includes(term) ||
          orderId.includes(term) ||
          customerEmail.includes(term) ||
          customerPhone.includes(term) ||
          method.includes(term)
        );
      }

      return true;
    });
  }, [orders, statusFilter, periodFilter, searchTerm]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, periodFilter, searchTerm]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Financial Metrics from canonical data
  const metrics = useMemo(() => {
    let grossTotal = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalRefunded = 0;
    let overdueCount = 0;
    let overdueAmount = 0;

    orders.forEach(o => {
      const status = getOrderPaymentStatus(o);
      if (status === 'cancelled') return;

      const t = getOrderTotal(o);
      const p = getOrderPaidAmount(o);
      const pend = getOrderPendingAmount(o);
      const ref = getOrderRefundedAmount(o);

      grossTotal += t;
      totalPaid += p;
      totalPending += pend;
      totalRefunded += ref;

      if (isOrderPaymentOverdue(o)) {
        overdueCount += 1;
        overdueAmount += pend;
      }
    });

    return {
      grossTotal,
      totalPaid,
      totalPending,
      totalRefunded,
      netReceived: Math.max(0, totalPaid - totalRefunded),
      overdueCount,
      overdueAmount
    };
  }, [orders]);

  // Open Payment Modal
  const handleOpenPaymentModal = (order: any) => {
    setPaymentModalOrder(order);
    const pending = getOrderPendingAmount(order);
    setPaymentAmount(pending > 0 ? pending.toFixed(2) : '');
    setPaymentMethod(order.payment?.method || 'PIX');
    setPaymentReason(`Quitação/parcela referente ao pedido #${order.id}`);
    setPaymentIdempotencyKey(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pay_${order.id}_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`);
  };

  // Submit Manual Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalOrder) return;

    const amountNum = parseFloat(paymentAmount.replace(',', '.'));
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Informe um valor de pagamento válido maior que zero.');
      return;
    }

    const currentPending = getOrderPendingAmount(paymentModalOrder);
    if (amountNum > currentPending + 0.01) {
      toast.error(`O valor inserido (R$ ${amountNum.toFixed(2)}) é maior que o saldo devedor (R$ ${currentPending.toFixed(2)}).`);
      return;
    }

    try {
      setIsSubmittingPayment(true);
      const res = await registerManualPayment(
        paymentModalOrder.id,
        amountNum,
        paymentMethod,
        paymentReason,
        paymentIdempotencyKey
      );
      if (res?.idempotentReplay) {
        toast.success(`Pagamento já processado anteriormente (Replay idempotente).`);
      } else {
        toast.success(`Pagamento de R$ ${amountNum.toFixed(2)} registrado com sucesso!`);
      }
      setPaymentModalOrder(null);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao registrar pagamento.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Open Refund Modal
  const handleOpenRefundModal = (order: any) => {
    setRefundModalOrder(order);
    const paid = getOrderPaidAmount(order);
    const refunded = getOrderRefundedAmount(order);
    const available = Math.max(0, paid - refunded);
    setRefundAmount(available > 0 ? available.toFixed(2) : '');
    setRefundReason(`Estorno/devolução referente ao pedido #${order.id}`);
    setRefundIdempotencyKey(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ref_${order.id}_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`);
  };

  // Submit Refund
  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundModalOrder) return;

    const amountNum = parseFloat(refundAmount.replace(',', '.'));
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Informe um valor de reembolso válido maior que zero.');
      return;
    }

    const paid = getOrderPaidAmount(refundModalOrder);
    const refunded = getOrderRefundedAmount(refundModalOrder);
    const available = Math.max(0, paid - refunded);

    if (amountNum > available + 0.01) {
      toast.error(`O valor informado (R$ ${amountNum.toFixed(2)}) excede o valor disponível para reembolso (R$ ${available.toFixed(2)}).`);
      return;
    }

    try {
      setIsSubmittingRefund(true);
      const res = await processRefund(
        refundModalOrder.id,
        amountNum,
        refundReason,
        refundIdempotencyKey
      );
      if (res?.idempotentReplay) {
        toast.success(`Estorno já processado anteriormente (Replay idempotente).`);
      } else {
        toast.success(`Estorno de R$ ${amountNum.toFixed(2)} processado com sucesso!`);
      }
      setRefundModalOrder(null);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao processar reembolso.');
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  // Open Ledger History Drawer
  const handleOpenLedger = async (order: any) => {
    setLedgerOrder(order);
    setIsLoadingLedger(true);
    try {
      const res = await getOrderFinancialEvents(order.id);
      setLedgerEvents(res.events || []);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao carregar histórico financeiro.');
      setLedgerEvents([]);
    } finally {
      setIsLoadingLedger(false);
    }
  };

  const renderBadge = (order: any) => {
    const badgeType = getPaymentBadgeType(order);
    const pending = getOrderPendingAmount(order);

    switch (badgeType) {
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-300">
            <AlertTriangle size={10} className="shrink-0" />
            ATRASADO (Falta {formatMoney(pending)})
          </span>
        );
      case 'due_today':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
            <Clock size={10} className="shrink-0" />
            VENCE HOJE (Falta {formatMoney(pending)})
          </span>
        );
      case 'upcoming':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
            <Calendar size={10} className="shrink-0" />
            A VENCER (Falta {formatMoney(pending)})
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider bg-yellow-100 text-yellow-800 border border-yellow-300">
            <Clock size={10} className="shrink-0" />
            PARCIAL (Falta {formatMoney(pending)})
          </span>
        );
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle size={10} className="shrink-0" />
            QUITADO / PAGO
          </span>
        );
      case 'refunded':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-300">
            <RotateCcw size={10} className="shrink-0" />
            REEMBOLSADO
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-300">
            PENDENTE
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP STATS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-black/10 p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 block font-sans">Recebido (Capturado)</span>
            <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-emerald-700">{formatMoney(metrics.totalPaid)}</span>
          </div>
          <span className="text-[8px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 font-black uppercase border border-emerald-200">
            {formatMoney(metrics.netReceived)} Líq.
          </span>
        </div>

        <div className="bg-white border border-black/10 p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 block font-sans">A Receber (Saldo Pendente)</span>
            <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-amber-600">{formatMoney(metrics.totalPending)}</span>
          </div>
          <span className="text-[8px] text-amber-800 bg-amber-50 px-1.5 py-0.5 font-black uppercase border border-amber-200">
            Em Aberto
          </span>
        </div>

        <div className="bg-white border border-black/10 p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[8px] font-black uppercase tracking-widest text-red-500 block font-sans">Inadimplência (Atrasados)</span>
            <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-red-600">{formatMoney(metrics.overdueAmount)}</span>
          </div>
          <span className="text-[8px] text-red-700 bg-red-50 px-1.5 py-0.5 font-black uppercase border border-red-200">
            {metrics.overdueCount} Pedidos
          </span>
        </div>

        <div className="bg-white border border-black/10 p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[8px] font-black uppercase tracking-widest text-purple-600 block font-sans">Reembolsos & Estornos</span>
            <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-purple-700">{formatMoney(metrics.totalRefunded)}</span>
          </div>
          <span className="text-[8px] text-purple-700 bg-purple-50 px-1.5 py-0.5 font-black uppercase border border-purple-200">
            Devolvido
          </span>
        </div>
      </div>

      {/* 2. FILTERS & SEARCH BAR */}
      <div className="bg-white border border-black/10 p-4 space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text"
              placeholder="Buscar por ID do pedido, nome do cliente, email, telefone ou método..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-black/15 focus:border-[#eab308] focus:ring-1 focus:ring-[#eab308] outline-none font-medium transition-all"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black cursor-pointer text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-1 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'Todo Período' },
              { id: 'today', label: 'Hoje' },
              { id: '7days', label: '7 Dias' },
              { id: 'month', label: 'Mês Atual' },
              { id: 'prev_month', label: 'Mês Anterior' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodFilter(p.id as any)}
                className={`px-3 py-1.5 text-[8.5px] font-black uppercase tracking-wider border cursor-pointer transition-all shrink-0 ${
                  periodFilter === p.id 
                    ? 'bg-black text-[#eab308] border-black shadow-xs' 
                    : 'bg-white text-gray-500 border-black/10 hover:border-black/30 hover:text-black'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-t border-black/5 pt-2.5">
          <span className="text-[8.5px] font-bold text-gray-400 uppercase tracking-widest mr-1 shrink-0 flex items-center gap-1">
            <Filter size={10} /> Status:
          </span>
          {[
            { id: 'all', label: 'Todos os Pedidos', count: orders.length },
            { id: 'pending', label: 'Pendentes / Saldo Devedor', count: orders.filter(o => getOrderPendingAmount(o) > 0).length },
            { id: 'overdue', label: '🚨 Atrasados (Inadimplência)', count: metrics.overdueCount },
            { id: 'partial', label: '🟡 Pagamento Parcial', count: orders.filter(o => getOrderPaymentStatus(o) === 'partially_paid').length },
            { id: 'paid', label: '✅ Quitados / Pagos', count: orders.filter(o => getOrderPaymentStatus(o) === 'approved' && getOrderPendingAmount(o) === 0).length },
            { id: 'refunded', label: '🟣 Reembolsados', count: orders.filter(o => ['refunded', 'partially_refunded'].includes(getOrderPaymentStatus(o)) || getOrderRefundedAmount(o) > 0).length }
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id as any)}
              className={`px-2.5 py-1 text-[8px] font-black uppercase tracking-wider border cursor-pointer transition-all shrink-0 flex items-center gap-1 ${
                statusFilter === s.id
                  ? 'bg-black text-[#eab308] border-black'
                  : 'bg-gray-50 text-gray-600 border-black/10 hover:bg-gray-100 hover:text-black'
              }`}
            >
              {s.label} <span className="opacity-60 font-mono">({s.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. RECEIVABLES TABLE */}
      <div className="bg-white border border-black/10 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-black text-white text-[8px] font-black uppercase tracking-widest font-mono">
                <th className="py-3 px-4">Pedido / Data</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Método</th>
                <th className="py-3 px-4 text-right">Total Pedido</th>
                <th className="py-3 px-4 text-right">Valor Pago</th>
                <th className="py-3 px-4 text-right">Saldo Devedor</th>
                <th className="py-3 px-4 text-center">Status / Vencimento</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 font-bold uppercase tracking-widest animate-pulse">
                    Carregando contas a receber...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 font-bold uppercase tracking-widest">
                    Nenhum registro encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => {
                  const total = getOrderTotal(order);
                  const paid = getOrderPaidAmount(order);
                  const pending = getOrderPendingAmount(order);
                  const refunded = getOrderRefundedAmount(order);
                  const dueDate = getOrderPaymentDueDate(order);
                  const createdDate = order.createdAt?.toDate ? order.createdAt.toDate() : (order.createdAt ? new Date(order.createdAt) : null);

                  return (
                    <tr key={order.id} className="hover:bg-gray-50/80 transition-colors font-medium">
                      {/* ID / Data */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-black">#{order.id}</span>
                          {order.isManual && (
                            <span className="px-1 py-0.2 text-[6.5px] font-black bg-[#eab308]/20 text-black border border-[#eab308]/30 uppercase">
                              MANUAL
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-gray-400 block mt-0.5">
                          {createdDate ? createdDate.toLocaleDateString('pt-BR') : '—'}
                        </span>
                      </td>

                      {/* Cliente */}
                      <td className="py-3 px-4">
                        <span className="font-black text-black block uppercase truncate max-w-[160px]">
                          {order.customerName || order.name || 'Cliente'}
                        </span>
                        <span className="text-[9px] text-gray-400 block truncate max-w-[160px]">
                          {order.customerPhone || order.phone || order.customerEmail || 'Sem contato'}
                        </span>
                      </td>

                      {/* Método */}
                      <td className="py-3 px-4">
                        <span className="text-[9px] font-black uppercase text-gray-700 block">
                          {order.payment?.method || order.paymentMethod || 'MANUAL / PIX'}
                        </span>
                        {order.payment?.providerPaymentId && (
                          <span className="text-[7.5px] font-mono text-gray-400 block truncate max-w-[110px]" title={order.payment.providerPaymentId}>
                            ID: {order.payment.providerPaymentId}
                          </span>
                        )}
                      </td>

                      {/* Total */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-black">
                        {formatMoney(total)}
                      </td>

                      {/* Pago */}
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-700">
                        {formatMoney(paid)}
                        {refunded > 0 && (
                          <span className="text-[8px] font-mono text-purple-600 block" title="Valor Estornado">
                            -{formatMoney(refunded)}
                          </span>
                        )}
                      </td>

                      {/* Saldo Devedor */}
                      <td className="py-3 px-4 text-right font-mono font-black">
                        <span className={pending > 0 ? 'text-amber-600' : 'text-gray-400'}>
                          {formatMoney(pending)}
                        </span>
                      </td>

                      {/* Status / Vencimento */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {renderBadge(order)}
                          {dueDate && (
                            <span className="text-[7.5px] font-mono text-gray-400 block">
                              Venc: {dueDate.toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Registrar Pagamento */}
                          {pending > 0 && (
                            <button
                              onClick={() => handleOpenPaymentModal(order)}
                              className="px-2 py-1 bg-black text-[#eab308] hover:bg-emerald-600 hover:text-white transition-all text-[8px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1"
                              title="Registrar Pagamento / Quitação"
                            >
                              <Plus size={10} /> Pagar
                            </button>
                          )}

                          {/* Estorno */}
                          {paid > 0 && (paid - refunded) > 0 && (
                            <button
                              onClick={() => handleOpenRefundModal(order)}
                              className="px-2 py-1 bg-gray-100 hover:bg-purple-600 hover:text-white transition-all text-[8px] font-black uppercase tracking-wider border border-gray-300 text-gray-700 cursor-pointer flex items-center gap-1"
                              title="Processar Estorno / Reembolso"
                            >
                              <RotateCcw size={10} /> Estorno
                            </button>
                          )}

                          {/* Histórico / Ledger */}
                          <button
                            onClick={() => handleOpenLedger(order)}
                            className="p-1 text-gray-400 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer border border-transparent hover:border-black/10"
                            title="Ver Histórico do Pedido"
                          >
                            <History size={13} />
                          </button>

                          {/* Ir para Pedido */}
                          {onNavigateOrder && (
                            <button
                              onClick={() => onNavigateOrder(order.id)}
                              className="p-1 text-gray-400 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer border border-transparent hover:border-black/10"
                              title="Abrir detalhes completos do pedido"
                            >
                              <ChevronRight size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination & Load More */}
        {filteredOrders.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-gray-50 border-t border-black/10 text-[10px]">
            <div className="flex items-center gap-2 text-gray-600 font-medium">
              <span>
                Mostrando <strong className="font-mono text-black">{Math.min(filteredOrders.length, (currentPage - 1) * pageSize + 1)}</strong> - <strong className="font-mono text-black">{Math.min(filteredOrders.length, currentPage * pageSize)}</strong> de <strong className="font-mono text-black">{filteredOrders.length}</strong> pedidos filtrados
              </span>
              {orders.length >= ordersLimit && (
                <button
                  type="button"
                  onClick={() => setOrdersLimit(prev => prev + 50)}
                  className="ml-2 px-2 py-0.5 bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black font-black uppercase text-[8px] tracking-wider transition-colors cursor-pointer"
                >
                  + Carregar mais (+50)
                </button>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-2 py-1 bg-white border border-black/10 text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black hover:text-white transition-colors uppercase font-bold text-[9px] cursor-pointer"
                >
                  Anterior
                </button>
                <span className="px-2 font-mono font-bold text-gray-700">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-2 py-1 bg-white border border-black/10 text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black hover:text-white transition-colors uppercase font-bold text-[9px] cursor-pointer"
                >
                  Próxima
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. MODAL: REGISTRAR PAGAMENTO MANUAL */}
      <AnimatePresence>
        {paymentModalOrder && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-2 border-black max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between border-b border-black/10 pb-3">
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight italic flex items-center gap-2">
                    <Receipt className="text-[#eab308]" size={18} /> Registrar Pagamento Manual
                  </h3>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    Pedido #{paymentModalOrder.id} • {paymentModalOrder.customerName || paymentModalOrder.name}
                  </span>
                </div>
                <button
                  onClick={() => setPaymentModalOrder(null)}
                  className="text-gray-400 hover:text-black font-black uppercase text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Balances Summary */}
              <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 border border-black/5 text-center">
                <div>
                  <span className="text-[7.5px] font-bold text-gray-400 uppercase tracking-wider block">Total</span>
                  <span className="text-xs font-black font-mono">{formatMoney(getOrderTotal(paymentModalOrder))}</span>
                </div>
                <div>
                  <span className="text-[7.5px] font-bold text-emerald-600 uppercase tracking-wider block">Pago</span>
                  <span className="text-xs font-black font-mono text-emerald-700">{formatMoney(getOrderPaidAmount(paymentModalOrder))}</span>
                </div>
                <div>
                  <span className="text-[7.5px] font-bold text-amber-600 uppercase tracking-wider block">Saldo Devedor</span>
                  <span className="text-xs font-black font-mono text-amber-700">{formatMoney(getOrderPendingAmount(paymentModalOrder))}</span>
                </div>
              </div>

              <form onSubmit={handleSubmitPayment} className="space-y-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-black block mb-1">
                    Valor a Pagar (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={getOrderPendingAmount(paymentModalOrder)}
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full p-2 text-sm font-mono font-black border border-black/20 focus:border-[#eab308] outline-none"
                    placeholder="0.00"
                  />
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[8px] text-gray-400">
                      Saldo restante: {formatMoney(getOrderPendingAmount(paymentModalOrder))}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(getOrderPendingAmount(paymentModalOrder).toFixed(2))}
                      className="text-[8px] font-black uppercase text-black hover:text-[#eab308] underline cursor-pointer"
                    >
                      Quitar Valor Total
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-black block mb-1">
                    Método de Pagamento *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-2 text-xs font-bold border border-black/20 focus:border-[#eab308] outline-none bg-white"
                  >
                    <option value="PIX">PIX</option>
                    <option value="DINHEIRO">Dinheiro (Espécie)</option>
                    <option value="CARTAO_CREDITO">Cartão de Crédito (Maquininha)</option>
                    <option value="CARTAO_DEBITO">Cartão de Débito (Maquininha)</option>
                    <option value="TRANSFERENCIA">Transferência Bancária (TED/DOC)</option>
                    <option value="BOLETO">Boleto Bancário</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="OUTRO">Outro / Ajuste Manual</option>
                  </select>
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-black block mb-1">
                    Motivo / Observações
                  </label>
                  <input
                    type="text"
                    value={paymentReason}
                    onChange={(e) => setPaymentReason(e.target.value)}
                    placeholder="Ex: Pagamento da 1ª parcela via PIX chave CNPJ"
                    className="w-full p-2 text-xs border border-black/20 focus:border-[#eab308] outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-black/10 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentModalOrder(null)}
                    className="px-4 py-2 text-[9px] font-black uppercase tracking-wider bg-gray-100 hover:bg-gray-200 text-black cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPayment}
                    className="px-5 py-2 text-[9px] font-black uppercase tracking-wider bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <CheckCircle size={12} />
                    {isSubmittingPayment ? 'Gravando...' : 'Confirmar Pagamento'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. MODAL: REEMBOLSO / ESTORNO */}
      <AnimatePresence>
        {refundModalOrder && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-2 border-black max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between border-b border-black/10 pb-3">
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight italic flex items-center gap-2 text-purple-700">
                    <RotateCcw size={18} /> Processar Estorno / Reembolso
                  </h3>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    Pedido #{refundModalOrder.id} • {refundModalOrder.customerName || refundModalOrder.name}
                  </span>
                </div>
                <button
                  onClick={() => setRefundModalOrder(null)}
                  className="text-gray-400 hover:text-black font-black uppercase text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Refund Balances */}
              <div className="grid grid-cols-3 gap-2 bg-purple-50/50 p-3 border border-purple-200 text-center">
                <div>
                  <span className="text-[7.5px] font-bold text-gray-500 uppercase tracking-wider block">Total Pago</span>
                  <span className="text-xs font-black font-mono text-emerald-700">{formatMoney(getOrderPaidAmount(refundModalOrder))}</span>
                </div>
                <div>
                  <span className="text-[7.5px] font-bold text-purple-600 uppercase tracking-wider block">Já Estornado</span>
                  <span className="text-xs font-black font-mono text-purple-700">{formatMoney(getOrderRefundedAmount(refundModalOrder))}</span>
                </div>
                <div>
                  <span className="text-[7.5px] font-bold text-black uppercase tracking-wider block">Disponível</span>
                  <span className="text-xs font-black font-mono text-black">
                    {formatMoney(Math.max(0, getOrderPaidAmount(refundModalOrder) - getOrderRefundedAmount(refundModalOrder)))}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmitRefund} className="space-y-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-black block mb-1">
                    Valor a Estornar (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Math.max(0, getOrderPaidAmount(refundModalOrder) - getOrderRefundedAmount(refundModalOrder))}
                    required
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full p-2 text-sm font-mono font-black border border-black/20 focus:border-purple-600 outline-none"
                    placeholder="0.00"
                  />
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[8px] text-gray-400">
                      Disponível para estorno: {formatMoney(Math.max(0, getOrderPaidAmount(refundModalOrder) - getOrderRefundedAmount(refundModalOrder)))}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRefundAmount((Math.max(0, getOrderPaidAmount(refundModalOrder) - getOrderRefundedAmount(refundModalOrder))).toFixed(2))}
                      className="text-[8px] font-black uppercase text-purple-700 hover:underline cursor-pointer"
                    >
                      Estornar Total
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-black block mb-1">
                    Motivo do Estorno / Reembolso *
                  </label>
                  <input
                    type="text"
                    required
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Ex: Cancelamento por arrependimento / Devolução de mercadoria"
                    className="w-full p-2 text-xs border border-black/20 focus:border-purple-600 outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-black/10 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundModalOrder(null)}
                    className="px-4 py-2 text-[9px] font-black uppercase tracking-wider bg-gray-100 hover:bg-gray-200 text-black cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingRefund}
                    className="px-5 py-2 text-[9px] font-black uppercase tracking-wider bg-purple-700 text-white hover:bg-purple-800 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <RotateCcw size={12} />
                    {isSubmittingRefund ? 'Processando...' : 'Confirmar Estorno'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. DRAWER: HISTÓRICO FINANCEIRO / LEDGER DO PEDIDO */}
      <AnimatePresence>
        {ledgerOrder && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex justify-end">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white border-l-2 border-black max-w-lg w-full h-full p-6 shadow-2xl flex flex-col space-y-4 overflow-y-auto"
            >
              <div className="flex items-start justify-between border-b border-black/10 pb-4">
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight italic flex items-center gap-2">
                    <History className="text-[#eab308]" size={18} /> Histórico Financeiro (Ledger)
                  </h3>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mt-0.5">
                    Pedido #{ledgerOrder.id} • {ledgerOrder.customerName || ledgerOrder.name}
                  </span>
                </div>
                <button
                  onClick={() => setLedgerOrder(null)}
                  className="text-gray-400 hover:text-black font-black uppercase text-xs cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              {/* Order Quick Overview */}
              <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 border border-black/5 text-center">
                <div>
                  <span className="text-[7.5px] font-bold text-gray-400 uppercase tracking-wider block">Total</span>
                  <span className="text-xs font-black font-mono">{formatMoney(getOrderTotal(ledgerOrder))}</span>
                </div>
                <div>
                  <span className="text-[7.5px] font-bold text-emerald-600 uppercase tracking-wider block">Pago</span>
                  <span className="text-xs font-black font-mono text-emerald-700">{formatMoney(getOrderPaidAmount(ledgerOrder))}</span>
                </div>
                <div>
                  <span className="text-[7.5px] font-bold text-amber-600 uppercase tracking-wider block">Saldo Devedor</span>
                  <span className="text-xs font-black font-mono text-amber-700">{formatMoney(getOrderPendingAmount(ledgerOrder))}</span>
                </div>
              </div>

              {/* Events List */}
              <div className="flex-1 overflow-y-auto space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-black">
                    Eventos Financeiros Imutáveis
                  </span>
                  <span className="text-[8px] font-mono text-gray-400">
                    {ledgerEvents.length} eventos
                  </span>
                </div>

                {isLoadingLedger ? (
                  <div className="py-12 text-center text-gray-400 text-xs font-bold uppercase tracking-wider animate-pulse">
                    Carregando eventos...
                  </div>
                ) : ledgerEvents.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-xs font-bold uppercase tracking-wider border border-dashed border-black/10 p-6">
                    Nenhum evento registrado no ledger ainda.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ledgerEvents.map((evt, idx) => {
                      const dateStr = evt.createdAt ? new Date(evt.createdAt).toLocaleString('pt-BR') : '—';
                      return (
                        <div key={evt.id || idx} className="bg-gray-50 border border-black/10 p-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black uppercase tracking-widest bg-black text-[#eab308] px-1.5 py-0.5 font-mono">
                              {evt.type}
                            </span>
                            <span className="text-[8.5px] font-mono text-gray-400">{dateStr}</span>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs font-black font-mono text-black">
                              {evt.amount > 0 ? `R$ ${evt.amount.toFixed(2)}` : 'R$ 0.00'}
                            </span>
                            <div className="text-[8px] font-bold text-gray-500 uppercase">
                              {evt.previousStatus || '—'} ➔ <span className="font-black text-black">{evt.newStatus}</span>
                            </div>
                          </div>

                          {evt.reason && (
                            <p className="text-[9px] text-gray-600 italic bg-white p-1.5 border border-black/5">
                              "{evt.reason}"
                            </p>
                          )}

                          <div className="flex items-center justify-between text-[7.5px] font-mono text-gray-400 pt-1 border-t border-black/5">
                            <span>Op: {evt.actorEmail || 'Admin'}</span>
                            <span>Método: {evt.paymentMethod || 'MANUAL'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-black/10 flex justify-end">
                <button
                  onClick={() => setLedgerOrder(null)}
                  className="px-4 py-2 text-[9px] font-black uppercase tracking-wider bg-black text-white hover:bg-[#eab308] hover:text-black transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

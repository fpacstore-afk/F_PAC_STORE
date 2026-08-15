import React, { useState, useMemo } from 'react';
import { 
  RotateCcw, 
  Search, 
  Filter, 
  Eye, 
  AlertTriangle, 
  DollarSign, 
  ArrowDownRight,
  ShieldAlert
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import { 
  getOrderTotal, 
  getOrderPaidAmount, 
  getOrderRefundedAmount, 
  getOrderPaymentStatus 
} from '../../../utils/orderFinancial';

interface FinancialRefundsViewProps {
  orders: any[];
  onOpenOrderDrawer: (order: any) => void;
}

export function FinancialRefundsView({ orders, onOpenOrderDrawer }: FinancialRefundsViewProps) {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | '7d' | '30d' | 'month'>('all');

  // Filter orders that have refunds or refunded status
  const refundedOrders = useMemo(() => {
    return orders.filter(order => {
      const refAmount = getOrderRefundedAmount(order);
      const status = getOrderPaymentStatus(order);
      return refAmount > 0 || status === 'refunded' || status === 'partially_refunded';
    });
  }, [orders]);

  // Apply search & period filters
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return refundedOrders.filter(order => {
      // Period filter
      if (periodFilter !== 'all') {
        const date = order.createdAt?.toDate ? order.createdAt.toDate() : (order.createdAt ? new Date(order.createdAt) : null);
        if (date) {
          if (periodFilter === 'today' && date < startOfToday) return false;
          if (periodFilter === '7d' && date < sevenDaysAgo) return false;
          if (periodFilter === '30d' && date < thirtyDaysAgo) return false;
          if (periodFilter === 'month' && date < startOfMonth) return false;
        }
      }

      // Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const idMatch = String(order.id || '').toLowerCase().includes(term);
        const nameMatch = String(order.customerName || order.name || '').toLowerCase().includes(term);
        const emailMatch = String(order.customerEmail || order.email || '').toLowerCase().includes(term);
        const phoneMatch = String(order.customerPhone || order.phone || '').toLowerCase().includes(term);
        if (!idMatch && !nameMatch && !emailMatch && !phoneMatch) return false;
      }

      return true;
    });
  }, [refundedOrders, periodFilter, searchTerm]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalRefunded = 0;
    let totalOriginalPaid = 0;

    filteredOrders.forEach(order => {
      totalRefunded += getOrderRefundedAmount(order);
      totalOriginalPaid += getOrderPaidAmount(order);
    });

    const avgRefund = filteredOrders.length > 0 ? totalRefunded / filteredOrders.length : 0;
    const remainingRetained = Math.max(0, totalOriginalPaid - totalRefunded);

    return {
      totalRefunded,
      totalOriginalPaid,
      remainingRetained,
      avgRefund,
      count: filteredOrders.length
    };
  }, [filteredOrders]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Total Estornado / Reembolsado</span>
            <RotateCcw size={16} className="text-purple-600" />
          </div>
          <span className="text-2xl font-black font-mono block text-purple-700">{formatMoney(metrics.totalRefunded)}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            {metrics.count} pedidos com estorno
          </span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Média por Estorno</span>
            <ArrowDownRight size={16} className="text-amber-600" />
          </div>
          <span className="text-2xl font-black font-mono block text-amber-700">{formatMoney(metrics.avgRefund)}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            Valor médio estornado
          </span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Originalmente Pago</span>
            <DollarSign size={16} className="text-emerald-600" />
          </div>
          <span className="text-2xl font-black font-mono block text-black">{formatMoney(metrics.totalOriginalPaid)}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            Soma paga antes dos estornos
          </span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Saldo Líquido Mantido</span>
            <ShieldAlert size={16} className="text-blue-600" />
          </div>
          <span className="text-2xl font-black font-mono block text-blue-700">{formatMoney(metrics.remainingRetained)}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            Saldo que permaneceu na loja
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-black/10 p-4 space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar pedido estornado por ID, cliente, e-mail ou telefone..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-black/10 focus:border-purple-600 outline-none"
            />
          </div>

          {/* Period Filters */}
          <div className="flex items-center border border-black/10 bg-gray-50 p-0.5 shrink-0">
            {[
              { id: 'all', label: 'Tudo' },
              { id: 'today', label: 'Hoje' },
              { id: '7d', label: '7D' },
              { id: '30d', label: '30D' },
              { id: 'month', label: 'Este Mês' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPeriodFilter(p.id as any)}
                className={`px-2.5 py-1 text-[8.5px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                  periodFilter === p.id ? 'bg-purple-700 text-white' : 'text-gray-600 hover:text-black'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Refunds Table */}
      <div className="bg-white border border-black/10 overflow-x-auto shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-purple-50/50 border-b border-purple-200 text-[8.5px] font-black uppercase tracking-wider text-purple-900">
              <th className="p-3">Pedido</th>
              <th className="p-3">Data</th>
              <th className="p-3">Cliente</th>
              <th className="p-3 text-right">Total Pedido</th>
              <th className="p-3 text-right">Total Pago</th>
              <th className="p-3 text-right">Valor Estornado</th>
              <th className="p-3 text-right">Saldo Retido</th>
              <th className="p-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-gray-400 font-bold uppercase tracking-wider">
                  Nenhum pedido com estorno/reembolso registrado no período selecionado.
                </td>
              </tr>
            ) : (
              filteredOrders.map(order => {
                const total = getOrderTotal(order);
                const paid = getOrderPaidAmount(order);
                const refunded = getOrderRefundedAmount(order);
                const retained = Math.max(0, paid - refunded);
                const date = order.createdAt?.toDate ? order.createdAt.toDate() : (order.createdAt ? new Date(order.createdAt) : null);

                return (
                  <tr key={order.id} className="hover:bg-purple-50/30 transition-colors">
                    <td className="p-3">
                      <span className="font-black font-mono text-purple-900 text-[10px]">#{order.id}</span>
                    </td>
                    <td className="p-3 text-[9px] font-mono text-gray-500">
                      {date ? date.toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-black text-[10px]">{order.customerName || order.name || 'Cliente'}</div>
                      <div className="text-[8px] text-gray-400 font-mono">{order.customerEmail || order.email || ''}</div>
                    </td>
                    <td className="p-3 text-right font-black font-mono text-gray-700">
                      {formatMoney(total)}
                    </td>
                    <td className="p-3 text-right font-black font-mono text-emerald-700">
                      {formatMoney(paid)}
                    </td>
                    <td className="p-3 text-right font-black font-mono text-purple-700">
                      {formatMoney(refunded)}
                    </td>
                    <td className="p-3 text-right font-black font-mono text-black">
                      {formatMoney(retained)}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => onOpenOrderDrawer(order)}
                        className="px-2.5 py-1 text-[8px] font-black uppercase tracking-wider bg-purple-700 text-white hover:bg-purple-800 transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <Eye size={10} /> Central
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

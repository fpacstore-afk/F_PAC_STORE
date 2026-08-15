import React, { useState, useMemo } from 'react';
import { 
  CreditCard, 
  Search, 
  Calendar, 
  Filter, 
  CheckCircle, 
  ExternalLink, 
  Eye, 
  DollarSign, 
  PieChart as PieIcon,
  RefreshCw
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import { 
  getOrderTotal, 
  getOrderPaidAmount, 
  getOrderPendingAmount, 
  getOrderRefundedAmount, 
  getPaymentBadgeType 
} from '../../../utils/orderFinancial';

interface FinancialPaymentsViewProps {
  orders: any[];
  onOpenOrderDrawer: (order: any) => void;
}

export function FinancialPaymentsView({ orders, onOpenOrderDrawer }: FinancialPaymentsViewProps) {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | '7d' | '30d' | 'month'>('all');

  // Filter orders that have any captured payment (paid > 0)
  const paidOrders = useMemo(() => {
    return orders.filter(order => getOrderPaidAmount(order) > 0);
  }, [orders]);

  // Apply search, method, and period filters
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return paidOrders.filter(order => {
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

      // Method filter
      const method = (order.payment?.method || order.paymentMethod || 'OUTRO').toUpperCase();
      if (methodFilter !== 'ALL') {
        if (methodFilter === 'PIX' && !method.includes('PIX')) return false;
        if (methodFilter === 'CARD' && !method.includes('CARTAO') && !method.includes('CREDIT') && !method.includes('DEBIT')) return false;
        if (methodFilter === 'MANUAL' && !method.includes('MANUAL') && !method.includes('DINHEIRO') && !method.includes('TRANSFERENCIA')) return false;
        if (methodFilter === 'BOLETO' && !method.includes('BOLETO')) return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const idMatch = String(order.id || '').toLowerCase().includes(term);
        const nameMatch = String(order.customerName || order.name || '').toLowerCase().includes(term);
        const emailMatch = String(order.customerEmail || order.email || '').toLowerCase().includes(term);
        const phoneMatch = String(order.customerPhone || order.phone || '').toLowerCase().includes(term);
        const provMatch = String(order.payment?.providerPaymentId || '').toLowerCase().includes(term);
        if (!idMatch && !nameMatch && !emailMatch && !phoneMatch && !provMatch) return false;
      }

      return true;
    });
  }, [paidOrders, periodFilter, methodFilter, searchTerm]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalPaid = 0;
    let totalRefunded = 0;
    const methodCounts: Record<string, { count: number; total: number }> = {};

    filteredOrders.forEach(order => {
      const paid = getOrderPaidAmount(order);
      const refunded = getOrderRefundedAmount(order);
      totalPaid += paid;
      totalRefunded += refunded;

      const rawMethod = (order.payment?.method || order.paymentMethod || 'OUTRO').toUpperCase();
      let normalized = 'OUTRO';
      if (rawMethod.includes('PIX')) normalized = 'PIX';
      else if (rawMethod.includes('CREDIT') || rawMethod.includes('CARTAO_CREDITO') || rawMethod.includes('CREDITO')) normalized = 'CARTÃO CRÉDITO';
      else if (rawMethod.includes('DEBIT') || rawMethod.includes('CARTAO_DEBITO') || rawMethod.includes('DEBITO')) normalized = 'CARTÃO DÉBITO';
      else if (rawMethod.includes('DINHEIRO')) normalized = 'DINHEIRO';
      else if (rawMethod.includes('BOLETO')) normalized = 'BOLETO';
      else if (rawMethod.includes('TRANSFERENCIA')) normalized = 'TRANSFERÊNCIA';

      if (!methodCounts[normalized]) {
        methodCounts[normalized] = { count: 0, total: 0 };
      }
      methodCounts[normalized].count += 1;
      methodCounts[normalized].total += paid;
    });

    const netReceived = Math.max(0, totalPaid - totalRefunded);
    const avgTicket = filteredOrders.length > 0 ? totalPaid / filteredOrders.length : 0;

    return {
      totalPaid,
      totalRefunded,
      netReceived,
      avgTicket,
      count: filteredOrders.length,
      methods: methodCounts
    };
  }, [filteredOrders]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Total Recebido (Capturado)</span>
            <DollarSign size={16} className="text-emerald-600" />
          </div>
          <span className="text-2xl font-black font-mono block text-emerald-700">{formatMoney(metrics.totalPaid)}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            {metrics.count} pagamentos registrados
          </span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Receita Líquida Recebida</span>
            <CheckCircle size={16} className="text-blue-600" />
          </div>
          <span className="text-2xl font-black font-mono block text-blue-700">{formatMoney(metrics.netReceived)}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            Pago - Estornado ({formatMoney(metrics.totalRefunded)})
          </span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Ticket Médio Pago</span>
            <PieIcon size={16} className="text-[#eab308]" />
          </div>
          <span className="text-2xl font-black font-mono block text-black">{formatMoney(metrics.avgTicket)}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            Média por pedido com pagamento
          </span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Métodos de Pagamento</span>
            <CreditCard size={16} className="text-purple-600" />
          </div>
          <div className="space-y-1 mt-1">
            {Object.entries(metrics.methods).slice(0, 3).map(([name, data]) => (
              <div key={name} className="flex justify-between text-[9px] font-mono">
                <span className="font-bold text-gray-600">{name} ({data.count}):</span>
                <span className="font-black text-black">{formatMoney(data.total)}</span>
              </div>
            ))}
            {Object.keys(metrics.methods).length === 0 && (
              <span className="text-[9px] text-gray-400 font-mono">Nenhum método</span>
            )}
          </div>
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
              placeholder="Buscar por ID do pedido, cliente, e-mail, telefone ou ID Mercado Pago..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-black/10 focus:border-[#eab308] outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
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
                    periodFilter === p.id ? 'bg-black text-[#eab308]' : 'text-gray-600 hover:text-black'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Method Filter */}
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="p-1.5 text-[8.5px] font-black uppercase tracking-wider border border-black/10 bg-white cursor-pointer outline-none shrink-0"
            >
              <option value="ALL">Todos os Métodos</option>
              <option value="PIX">PIX</option>
              <option value="CARD">Cartão de Crédito/Débito</option>
              <option value="MANUAL">Manual / Espécie</option>
              <option value="BOLETO">Boleto</option>
            </select>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-black/10 overflow-x-auto shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-black/10 text-[8.5px] font-black uppercase tracking-wider text-gray-500">
              <th className="p-3">Pedido</th>
              <th className="p-3">Data</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Método / Gateway</th>
              <th className="p-3 text-right">Total Pedido</th>
              <th className="p-3 text-right">Valor Pago</th>
              <th className="p-3 text-right">Saldo Restante</th>
              <th className="p-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-gray-400 font-bold uppercase tracking-wider">
                  Nenhum registro de pagamento localizado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredOrders.map(order => {
                const total = getOrderTotal(order);
                const paid = getOrderPaidAmount(order);
                const pending = getOrderPendingAmount(order);
                const date = order.createdAt?.toDate ? order.createdAt.toDate() : (order.createdAt ? new Date(order.createdAt) : null);
                const method = order.payment?.method || order.paymentMethod || 'PIX';
                const provId = order.payment?.providerPaymentId;

                return (
                  <tr key={order.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black font-mono text-black text-[10px]">#{order.id}</span>
                        {order.isManual && (
                          <span className="text-[7px] font-black uppercase px-1 py-0.2 bg-[#eab308]/20 text-black border border-[#eab308]/40">
                            MANUAL
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-[9px] font-mono text-gray-500">
                      {date ? date.toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-black text-[10px]">{order.customerName || order.name || 'Cliente'}</div>
                      <div className="text-[8px] text-gray-400 font-mono">{order.customerEmail || order.email || ''}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-black uppercase text-[9px] text-gray-800 font-mono">{method}</div>
                      {provId && (
                        <span className="text-[7.5px] font-mono text-gray-400 block truncate max-w-[120px]" title={provId}>
                          ID: {provId}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-black font-mono text-gray-700">
                      {formatMoney(total)}
                    </td>
                    <td className="p-3 text-right font-black font-mono text-emerald-700">
                      {formatMoney(paid)}
                    </td>
                    <td className="p-3 text-right font-black font-mono">
                      {pending > 0 ? (
                        <span className="text-amber-700">{formatMoney(pending)}</span>
                      ) : (
                        <span className="text-gray-400">R$ 0,00</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => onOpenOrderDrawer(order)}
                        className="px-2.5 py-1 text-[8px] font-black uppercase tracking-wider bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black transition-colors cursor-pointer inline-flex items-center gap-1"
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

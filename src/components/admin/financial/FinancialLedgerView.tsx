import React, { useState, useEffect, useMemo } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  RefreshCw, 
  ShieldCheck, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RotateCcw,
  ExternalLink,
  Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import { getFinancialLedger } from '../../../services/orders/orderService';
import { FinancialEvent } from '../../../types/financial';

interface FinancialLedgerViewProps {
  orders: any[];
  onOpenOrderDrawer: (order: any) => void;
}

export function FinancialLedgerView({ orders, onOpenOrderDrawer }: FinancialLedgerViewProps) {
  const { formatMoney } = useFinancialPrivacy();

  const [events, setEvents] = useState<FinancialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await getFinancialLedger(150);
      setEvents(res.events || []);
    } catch (err: any) {
      console.error('Erro ao carregar ledger geral:', err);
      toast.error(err.message || 'Erro ao carregar eventos do ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter(evt => {
      // Type filter
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'PAYMENT' && !evt.type.includes('PAYMENT')) return false;
        if (typeFilter === 'REFUND' && !evt.type.includes('REFUND')) return false;
        if (typeFilter === 'STATUS' && !evt.type.includes('STATUS')) return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const orderIdMatch = String(evt.orderId || '').toLowerCase().includes(term);
        const reasonMatch = String(evt.reason || '').toLowerCase().includes(term);
        const actorMatch = String(evt.actorEmail || evt.actorId || '').toLowerCase().includes(term);
        const typeMatch = String(evt.type || '').toLowerCase().includes(term);
        if (!orderIdMatch && !reasonMatch && !actorMatch && !typeMatch) return false;
      }

      return true;
    });
  }, [events, typeFilter, searchTerm]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalMoved = 0;
    let paymentCount = 0;
    let refundCount = 0;

    events.forEach(evt => {
      totalMoved += evt.amount || 0;
      if (evt.type.includes('PAYMENT')) paymentCount += 1;
      if (evt.type.includes('REFUND')) refundCount += 1;
    });

    return {
      totalEvents: events.length,
      totalMoved,
      paymentCount,
      refundCount
    };
  }, [events]);

  const handleOpenOrderById = (orderId: string) => {
    const matched = orders.find(o => String(o.id) === String(orderId));
    if (matched) {
      onOpenOrderDrawer(matched);
    } else {
      // Create minimal order structure to open drawer
      onOpenOrderDrawer({ id: orderId, name: `Pedido #${orderId}` });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Total de Eventos no Ledger</span>
            <ShieldCheck size={16} className="text-[#eab308]" />
          </div>
          <span className="text-2xl font-black font-mono block text-black">{metrics.totalEvents}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            Registros transacionais imutáveis
          </span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Volume Movimentado</span>
            <DollarSign size={16} className="text-emerald-600" />
          </div>
          <span className="text-2xl font-black font-mono block text-emerald-700">{formatMoney(metrics.totalMoved)}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            Soma de fluxos registrados
          </span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Eventos de Pagamento</span>
            <ArrowUpRight size={16} className="text-blue-600" />
          </div>
          <span className="text-2xl font-black font-mono block text-blue-700">{metrics.paymentCount}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            Capturas e pagamentos parciais
          </span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1 text-gray-500">
            <span className="text-[9px] font-black uppercase tracking-wider">Eventos de Reembolso</span>
            <RotateCcw size={16} className="text-purple-600" />
          </div>
          <span className="text-2xl font-black font-mono block text-purple-700">{metrics.refundCount}</span>
          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">
            Estornos executados
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
              placeholder="Buscar evento por ID do pedido, motivo, operador ou tipo..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-black/10 focus:border-[#eab308] outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
            {/* Type Filters */}
            <div className="flex items-center border border-black/10 bg-gray-50 p-0.5 shrink-0">
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'PAYMENT', label: 'Pagamentos' },
                { id: 'REFUND', label: 'Reembolsos' },
                { id: 'STATUS', label: 'Status' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setTypeFilter(p.id)}
                  className={`px-2.5 py-1 text-[8.5px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                    typeFilter === p.id ? 'bg-black text-[#eab308]' : 'text-gray-600 hover:text-black'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              onClick={fetchLedger}
              className="p-2 text-[8.5px] font-black uppercase tracking-wider border border-black/10 bg-white hover:bg-gray-100 cursor-pointer flex items-center gap-1 shrink-0"
              title="Recarregar eventos do Ledger"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-black/10 overflow-x-auto shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-black/10 text-[8.5px] font-black uppercase tracking-wider text-gray-500">
              <th className="p-3">Data / Hora</th>
              <th className="p-3">Tipo de Evento</th>
              <th className="p-3">Pedido</th>
              <th className="p-3 text-right">Valor Movimentado</th>
              <th className="p-3 text-center">Transição Status</th>
              <th className="p-3">Operador / Método</th>
              <th className="p-3">Motivo / Observações</th>
              <th className="p-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {loading ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-gray-400 font-bold uppercase tracking-wider animate-pulse">
                  Carregando registros do ledger financeiro...
                </td>
              </tr>
            ) : filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-gray-400 font-bold uppercase tracking-wider">
                  Nenhum evento localizado no ledger com os filtros aplicados.
                </td>
              </tr>
            ) : (
              filteredEvents.map((evt, idx) => {
                const isPay = evt.type.includes('PAYMENT');
                const isRef = evt.type.includes('REFUND');
                const dateStr = evt.createdAt ? new Date(evt.createdAt).toLocaleString('pt-BR') : '—';

                return (
                  <tr key={evt.id || idx} className="hover:bg-gray-50/80 transition-colors">
                    <td className="p-3 text-[9px] font-mono text-gray-500 whitespace-nowrap">
                      {dateStr}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest font-mono border whitespace-nowrap ${
                        isRef 
                          ? 'bg-purple-50 text-purple-700 border-purple-200' 
                          : isPay 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-gray-100 text-gray-700 border-gray-300'
                      }`}>
                        {evt.type}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => handleOpenOrderById(evt.orderId)}
                        className="font-black font-mono text-black text-[10px] hover:text-[#eab308] underline cursor-pointer"
                      >
                        #{evt.orderId}
                      </button>
                    </td>
                    <td className="p-3 text-right font-black font-mono">
                      {evt.amount > 0 ? (
                        <span className={isRef ? 'text-purple-700' : isPay ? 'text-emerald-700' : 'text-black'}>
                          {isRef ? `- ${formatMoney(evt.amount)}` : `+ ${formatMoney(evt.amount)}`}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center text-[8.5px] font-mono whitespace-nowrap">
                      <span className="text-gray-400">{evt.previousStatus || '—'}</span>
                      <span className="text-gray-300 mx-1">➔</span>
                      <span className="font-bold text-black">{evt.newStatus || '—'}</span>
                    </td>
                    <td className="p-3">
                      <div className="text-[9px] font-bold text-gray-800">{evt.actorEmail || 'Admin'}</div>
                      <div className="text-[7.5px] font-mono text-gray-400 uppercase">{evt.paymentMethod || 'MANUAL'}</div>
                    </td>
                    <td className="p-3 text-[9px] text-gray-600 max-w-xs truncate" title={evt.reason || ''}>
                      {evt.reason ? `"${evt.reason}"` : '—'}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleOpenOrderById(evt.orderId)}
                        className="px-2 py-1 text-[7.5px] font-black uppercase tracking-wider bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black transition-colors cursor-pointer inline-flex items-center gap-1"
                        title="Ver Central do Pedido"
                      >
                        <Eye size={10} /> Ver
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

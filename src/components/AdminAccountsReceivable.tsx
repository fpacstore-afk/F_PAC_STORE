import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { registerPaymentInstallment, registerInstallmentPayment, PaymentLog } from '../services/orders/orderService';
import { useFinancialPrivacy } from '../context/FinancialPrivacyContext';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, CreditCard, Calendar, User, Search, CheckCircle, Clock, Plus, X, Eye, FileText, Filter } from 'lucide-react';
import toast from 'react-hot-toast';

interface OrderReceivable {
  id: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  total: number;
  amountPaid?: number;
  balanceDue?: number;
  paymentLogs?: PaymentLog[];
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  createdAt: any;
  isManual?: boolean;
}

export function getOrderBalanceDue(order: any): number {
  if (order.balanceDue !== undefined && order.balanceDue !== null) {
    return Number(order.balanceDue) || 0;
  }
  const isPaid = ['payment_approved', 'Pagamento Aprovado', 'shipped', 'delivered', 'separacao', 'embalagem', 'aprovado', 'approved'].includes(order.status) ||
                 ['aprovado', 'approved', 'paid'].includes(order.paymentStatus);
  if (isPaid) return 0;
  return Number(order.total) || 0;
}

export function getOrderAmountPaid(order: any): number {
  if (order.amountPaid !== undefined && order.amountPaid !== null) {
    return Number(order.amountPaid) || 0;
  }
  const isPaid = ['payment_approved', 'Pagamento Aprovado', 'shipped', 'delivered', 'separacao', 'embalagem', 'aprovado', 'approved'].includes(order.status) ||
                 ['aprovado', 'approved', 'paid'].includes(order.paymentStatus);
  if (isPaid) return Number(order.total) || 0;
  return 0;
}

export default function AdminAccountsReceivable() {
  const { formatMoney } = useFinancialPrivacy();
  const [orders, setOrders] = useState<OrderReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendentes' | 'em_analise' | 'aprovados'>('todos');

  // Modal State for registering payment
  const [selectedOrder, setSelectedOrder] = useState<OrderReceivable | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('PIX / Manual');
  const [paymentOperator, setPaymentOperator] = useState<string>('Admin');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal State for viewing logs
  const [logsOrder, setLogsOrder] = useState<OrderReceivable | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: OrderReceivable[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any;
      setOrders(docs);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar contas a receber:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter orders by paymentStatus / balanceDue according to statusFilter and search term
  const filteredOrders = orders.filter(o => {
    if (o.status === 'cancelled' || o.status === 'Pagamento Não Realizado') return false;

    const due = getOrderBalanceDue(o);
    const rawStatus = (o.paymentStatus || '').toLowerCase();
    
    // Status match
    if (statusFilter === 'pendentes') {
      if (due <= 0 && rawStatus !== 'pendente') return false;
    } else if (statusFilter === 'em_analise') {
      if (rawStatus !== 'em_analise' && rawStatus !== 'em analise') return false;
    } else if (statusFilter === 'aprovados') {
      if (due > 0 && rawStatus !== 'aprovado' && rawStatus !== 'approved') return false;
    }

    // Search term match
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        o.customerName?.toLowerCase().includes(term) ||
        o.id?.toLowerCase().includes(term) ||
        o.customerEmail?.toLowerCase().includes(term) ||
        o.customerPhone?.toLowerCase().includes(term)
      );
    }

    return true;
  });

  const pendingReceivables = orders.filter(o => o.status !== 'cancelled' && getOrderBalanceDue(o) > 0);

  // Financial summary metrics
  const totalReceivable = pendingReceivables.reduce((sum, o) => sum + getOrderBalanceDue(o), 0);
  const totalPaidInPending = pendingReceivables.reduce((sum, o) => sum + getOrderAmountPaid(o), 0);
  const totalOriginalVolume = pendingReceivables.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const handleOpenPaymentModal = (order: OrderReceivable) => {
    setSelectedOrder(order);
    const remaining = getOrderBalanceDue(order);
    setPaymentAmount(remaining > 0 ? remaining.toString() : '');
    setPaymentMethod('PIX / Manual');
    setPaymentOperator('Admin');
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    const amountNum = parseFloat(paymentAmount.replace(',', '.'));
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }

    const currentDue = getOrderBalanceDue(selectedOrder);
    if (amountNum > currentDue + 0.01) {
      toast.error(`O valor inserido (R$ ${amountNum.toFixed(2)}) é maior que o saldo devedor (R$ ${currentDue.toFixed(2)}).`);
      return;
    }

    try {
      setIsSubmitting(true);
      await registerPaymentInstallment(
        selectedOrder.id,
        amountNum,
        paymentMethod,
        getOrderAmountPaid(selectedOrder),
        selectedOrder.total,
        paymentOperator
      );
      toast.success(`Pagamento de R$ ${amountNum.toFixed(2)} registrado para o pedido #${selectedOrder.id}!`);
      setSelectedOrder(null);
      setPaymentAmount('');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao registrar pagamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateVal: any) => {
    if (!dateVal) return '-';
    try {
      if (dateVal.toDate) return dateVal.toDate().toLocaleDateString('pt-BR');
      if (dateVal.seconds) return new Date(dateVal.seconds * 1000).toLocaleDateString('pt-BR');
      return new Date(dateVal).toLocaleDateString('pt-BR');
    } catch {
      return String(dateVal);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-black text-white p-6 border-l-4 border-[#eab308] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard size={20} className="text-[#eab308]" />
            <h2 className="text-xl font-black uppercase tracking-wider text-[#eab308]">
              Contas a Receber (Vendas Parceladas)
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Gestão de saldo devedor e recebimentos de parcelas de pedidos manuais e do site
          </p>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[260px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, pedido..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-700 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#eab308]"
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-amber-500/10 border border-amber-500/30 p-4">
          <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider block">
            Total a Receber (Saldo Devedor)
          </span>
          <span className="text-2xl font-black font-mono text-amber-900 mt-1 block">
            {formatMoney(totalReceivable)}
          </span>
          <span className="text-[10px] text-amber-700/80 font-medium mt-1 block">
            {pendingReceivables.length} pedidos pendentes de quitação
          </span>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/30 p-4">
          <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider block">
            Total Já Recebido (Entradas)
          </span>
          <span className="text-2xl font-black font-mono text-emerald-900 mt-1 block">
            {formatMoney(totalPaidInPending)}
          </span>
          <span className="text-[10px] text-emerald-700/80 font-medium mt-1 block">
            Parcelas pagas acumuladas
          </span>
        </div>

        <div className="bg-neutral-900 text-white p-4 border border-neutral-800">
          <span className="text-[10px] font-black uppercase text-[#eab308] tracking-wider block">
            Volume Total Contratado
          </span>
          <span className="text-2xl font-black font-mono text-white mt-1 block">
            {formatMoney(totalOriginalVolume)}
          </span>
          <span className="text-[10px] text-gray-400 font-medium mt-1 block">
            Soma dos totais dos pedidos pendentes
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-black/10 pb-2">
        <span className="text-[10px] font-black uppercase text-black/60 flex items-center gap-1 mr-2">
          <Filter size={12} /> Status Financeiro:
        </span>
        {[
          { id: 'todos', label: 'Todos' },
          { id: 'pendentes', label: 'Pendentes' },
          { id: 'em_analise', label: 'Em Análise' },
          { id: 'aprovados', label: 'Aprovados' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id as any)}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === tab.id
                ? 'bg-black text-[#eab308] border-b-2 border-[#eab308]'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Receivables Table */}
      <div className="bg-white border border-black/10 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-gray-400 font-bold uppercase text-xs">
            Carregando contas a receber...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-20 text-center text-gray-400 font-bold uppercase text-xs space-y-2">
            <CheckCircle size={32} className="mx-auto text-emerald-500 mb-2" />
            <p>Nenhum pedido encontrado para o filtro selecionado!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-black text-white uppercase text-[10px] tracking-wider border-b border-black">
                <tr>
                  <th className="py-3 px-4 font-black">ID do Pedido</th>
                  <th className="py-3 px-4 font-black">Cliente</th>
                  <th className="py-3 px-4 font-black">Data</th>
                  <th className="py-3 px-4 font-black text-right">Total</th>
                  <th className="py-3 px-4 font-black text-right">Valor Pago</th>
                  <th className="py-3 px-4 font-black text-right">Saldo Devedor</th>
                  <th className="py-3 px-4 font-black text-center">Histórico</th>
                  <th className="py-3 px-4 font-black text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {filteredOrders.map((order) => {
                  const paid = getOrderAmountPaid(order);
                  const due = getOrderBalanceDue(order);
                  const logsCount = order.paymentLogs?.length || 0;

                  return (
                    <tr key={order.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-black text-black">
                        #{order.id}
                        {order.isManual && (
                          <span className="ml-1.5 px-1 py-0.2 text-[8px] bg-[#eab308]/20 text-black border border-[#eab308] uppercase font-bold">
                            Manual
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-black uppercase">{order.customerName}</div>
                        {order.customerPhone && (
                          <div className="text-[10px] text-gray-500 font-mono">{order.customerPhone}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600 font-medium">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                        {formatMoney(order.total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                        {formatMoney(paid)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {due > 0 ? (
                          <span className="px-2 py-1 bg-amber-500/15 text-amber-900 border border-amber-500/30 font-mono font-black text-xs inline-block">
                            {formatMoney(due)}
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-emerald-500/15 text-emerald-900 border border-emerald-500/30 font-mono font-black text-xs inline-block">
                            R$ 0,00 (Quitado)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setLogsOrder(order)}
                          className="px-2 py-1 bg-gray-100 hover:bg-black hover:text-white transition-all text-[9px] font-bold uppercase tracking-wider border border-gray-300 cursor-pointer inline-flex items-center gap-1"
                          title="Ver histórico de recebimentos"
                        >
                          <FileText size={10} />
                          {logsCount} {logsCount === 1 ? 'Log' : 'Logs'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {due > 0 ? (
                          <button
                            onClick={() => handleOpenPaymentModal(order)}
                            className="px-3 py-1.5 bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black transition-all text-[10px] font-black uppercase tracking-wider cursor-pointer border border-black shadow-xs inline-flex items-center gap-1"
                          >
                            <Plus size={12} /> Registrar Pagamento
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center justify-center gap-1">
                            <CheckCircle size={12} /> Pago
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Registrar Pagamento de Parcela */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-2 border-black max-w-md w-full p-6 space-y-4 shadow-2xl relative"
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedOrder(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-black cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="border-b border-black/10 pb-3">
                <h3 className="text-base font-black uppercase tracking-wider text-black flex items-center gap-2">
                  <DollarSign size={18} className="text-[#eab308]" />
                  Registrar Pagamento de Parcela
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pedido #{selectedOrder.id} • {selectedOrder.customerName}
                </p>
              </div>

              {/* Order financial summary box */}
              <div className="bg-gray-50 border border-black/10 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold">Valor Total do Pedido:</span>
                  <span className="font-mono font-black">{formatMoney(selectedOrder.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold">Total Já Recebido:</span>
                  <span className="font-mono font-black text-emerald-700">{formatMoney(getOrderAmountPaid(selectedOrder))}</span>
                </div>
                <div className="flex justify-between border-t border-black/10 pt-1.5 text-sm">
                  <span className="text-black font-black uppercase">Saldo Devedor Atual:</span>
                  <span className="font-mono font-black text-amber-700">{formatMoney(getOrderBalanceDue(selectedOrder))}</span>
                </div>
              </div>

              {/* Payment Registration Form */}
              <form onSubmit={handleRegisterPayment} className="space-y-4 pt-1">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-black block">
                      Valor Recebido nesta Parcela (R$) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(getOrderBalanceDue(selectedOrder).toString())}
                      className="text-[9px] font-bold text-[#eab308] hover:underline cursor-pointer bg-black px-1.5 py-0.5 uppercase"
                    >
                      Quitar Saldo Total
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={getOrderBalanceDue(selectedOrder)}
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full py-2.5 px-3 border border-black text-sm font-mono font-black focus:outline-none focus:border-[#eab308]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-black block mb-1">
                    Forma de Pagamento *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full py-2.5 px-3 border border-black text-xs font-bold uppercase focus:outline-none focus:border-[#eab308] bg-white cursor-pointer"
                  >
                    <option value="PIX / Manual">PIX</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Dinheiro">Dinheiro Espécie</option>
                    <option value="Transferência Bancária">Transferência Bancária</option>
                    <option value="Outro / Outra Parcela">Outro / Outra Parcela</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-black block mb-1">
                    Operador / Responsável
                  </label>
                  <input
                    type="text"
                    value={paymentOperator}
                    onChange={(e) => setPaymentOperator(e.target.value)}
                    placeholder="Admin"
                    className="w-full py-2 px-3 border border-black/20 text-xs focus:outline-none focus:border-black uppercase font-bold"
                  />
                </div>

                <div className="flex gap-2 pt-2 border-t border-black/10">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-black uppercase text-[10px] font-black tracking-wider transition-all cursor-pointer border border-gray-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black uppercase text-[10px] font-black tracking-wider transition-all cursor-pointer border border-black disabled:opacity-50"
                  >
                    {isSubmitting ? 'Gravando...' : 'Confirmar Pagamento'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Ver Logs de Pagamento */}
      <AnimatePresence>
        {logsOrder && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-2 border-black max-w-lg w-full p-6 space-y-4 shadow-2xl relative"
            >
              <button
                onClick={() => setLogsOrder(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-black cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="border-b border-black/10 pb-3">
                <h3 className="text-base font-black uppercase tracking-wider text-black flex items-center gap-2">
                  <FileText size={18} className="text-[#eab308]" />
                  Histórico de Recebimentos
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pedido #{logsOrder.id} • {logsOrder.customerName}
                </p>
              </div>

              {(!logsOrder.paymentLogs || logsOrder.paymentLogs.length === 0) ? (
                <div className="py-8 text-center text-gray-400 font-bold uppercase text-xs">
                  Nenhum registro individual de parcela encontrado para este pedido.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {logsOrder.paymentLogs.map((log, i) => (
                    <div key={log.id || i} className="bg-gray-50 border border-black/10 p-3 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-black uppercase">{log.method}</div>
                        <div className="text-[10px] text-gray-400">
                          {formatDate(log.date)} • Op: {log.operator || 'Admin'}
                        </div>
                      </div>
                      <div className="font-mono font-black text-emerald-700 text-sm">
                        +{formatMoney(log.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-black/10 text-right">
                <button
                  onClick={() => setLogsOrder(null)}
                  className="px-4 py-2 bg-black text-white text-[10px] font-black uppercase tracking-wider cursor-pointer"
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

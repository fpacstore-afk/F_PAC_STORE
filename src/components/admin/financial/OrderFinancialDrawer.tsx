import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign, 
  Receipt, 
  RotateCcw, 
  History, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  CreditCard, 
  User, 
  X, 
  RefreshCw, 
  ArrowRight,
  ShieldCheck,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import { 
  getOrderTotal, 
  getOrderPaidAmount, 
  getOrderPendingAmount, 
  getOrderRefundedAmount, 
  getOrderPaymentStatus, 
  getOrderPaymentDueDate, 
  isOrderPaymentOverdue, 
  getPaymentBadgeType 
} from '../../../utils/orderFinancial';
import { 
  registerManualPayment, 
  processRefund, 
  getOrderFinancialEvents 
} from '../../../services/orders/orderService';
import { FinancialEvent } from '../../../types/financial';

interface OrderFinancialDrawerProps {
  order: any | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated?: (order: any) => void;
}

export function OrderFinancialDrawer({
  order,
  isOpen,
  onClose,
  onOrderUpdated
}: OrderFinancialDrawerProps) {
  const { formatMoney } = useFinancialPrivacy();

  // Sub-views / active action mode inside drawer
  const [activeAction, setActiveAction] = useState<'overview' | 'pay' | 'refund'>('overview');

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('PIX');
  const [paymentReason, setPaymentReason] = useState<string>('');
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Refund Form State
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState<string>('');
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  // Financial Events / Ledger State
  const [events, setEvents] = useState<FinancialEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  // Generate new idempotency key
  const generateKey = (prefix: string, orderId: string) => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${prefix}_${orderId}_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
  };

  // Fetch events whenever drawer opens or order changes
  const loadEvents = async (orderId: string) => {
    if (!orderId) return;
    setIsLoadingEvents(true);
    try {
      const res = await getOrderFinancialEvents(orderId);
      setEvents(res.events || []);
    } catch (err: any) {
      console.error('Erro ao buscar eventos do ledger:', err);
      setEvents([]);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (isOpen && order) {
      loadEvents(order.id);
      setActiveAction('overview');
      const pending = getOrderPendingAmount(order);
      setPaymentAmount(pending > 0 ? pending.toFixed(2) : '');
      setPaymentMethod(order.payment?.method || order.paymentMethod || 'PIX');
      setPaymentReason(`Pagamento referente ao pedido #${order.id}`);
      setPaymentIdempotencyKey(generateKey('pay', order.id));

      const paid = getOrderPaidAmount(order);
      const refunded = getOrderRefundedAmount(order);
      const available = Math.max(0, paid - refunded);
      setRefundAmount(available > 0 ? available.toFixed(2) : '');
      setRefundReason(`Estorno referente ao pedido #${order.id}`);
      setRefundIdempotencyKey(generateKey('ref', order.id));
    }
  }, [isOpen, order?.id]);

  if (!isOpen || !order) return null;

  const total = getOrderTotal(order);
  const paid = getOrderPaidAmount(order);
  const pending = getOrderPendingAmount(order);
  const refunded = getOrderRefundedAmount(order);
  const netReceived = Math.max(0, paid - refunded);
  const isOverdue = isOrderPaymentOverdue(order);
  const dueDate = getOrderPaymentDueDate(order);
  const badgeType = getPaymentBadgeType(order);
  const createdDate = order.createdAt?.toDate ? order.createdAt.toDate() : (order.createdAt ? new Date(order.createdAt) : null);

  // Submit Manual Payment
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(paymentAmount.replace(',', '.'));
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Informe um valor de pagamento válido maior que zero.');
      return;
    }

    if (amountNum > pending + 0.01) {
      toast.error(`O valor (R$ ${amountNum.toFixed(2)}) não pode ser superior ao saldo devedor (R$ ${pending.toFixed(2)}).`);
      return;
    }

    try {
      setIsSubmittingPayment(true);
      const res = await registerManualPayment(
        order.id,
        amountNum,
        paymentMethod,
        paymentReason,
        paymentIdempotencyKey
      );

      if (res?.idempotentReplay) {
        toast.success('Pagamento já processado (Replay idempotente).');
      } else {
        toast.success(`Pagamento de R$ ${amountNum.toFixed(2)} registrado com sucesso!`);
      }

      await loadEvents(order.id);
      setActiveAction('overview');
      if (onOrderUpdated) onOrderUpdated(res.order || { ...order, ...res });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao registrar pagamento.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Submit Refund
  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(refundAmount.replace(',', '.'));
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Informe um valor de reembolso válido maior que zero.');
      return;
    }

    const available = Math.max(0, paid - refunded);
    if (amountNum > available + 0.01) {
      toast.error(`O valor informado (R$ ${amountNum.toFixed(2)}) excede o disponível para estorno (R$ ${available.toFixed(2)}).`);
      return;
    }

    try {
      setIsSubmittingRefund(true);
      const res = await processRefund(
        order.id,
        amountNum,
        refundReason,
        refundIdempotencyKey
      );

      if (res?.idempotentReplay) {
        toast.success('Estorno já processado (Replay idempotente).');
      } else {
        toast.success(`Estorno de R$ ${amountNum.toFixed(2)} realizado com sucesso!`);
      }

      await loadEvents(order.id);
      setActiveAction('overview');
      if (onOrderUpdated) onOrderUpdated(res.order || { ...order, ...res });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao processar estorno.');
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex justify-end">
        {/* Backdrop dismiss */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 220 }}
          className="relative bg-white border-l-2 border-black max-w-xl w-full h-full p-6 shadow-2xl flex flex-col space-y-4 overflow-y-auto z-10"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-black/10 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="bg-black text-[#eab308] px-2 py-0.5 text-[8.5px] font-black uppercase tracking-widest font-mono">
                  #{order.id}
                </span>
                {order.isManual ? (
                  <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-[#eab308]/20 text-black border border-[#eab308]/30 uppercase">
                    ⚙️ MANUAL ({order.origin || 'MANUAL'})
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                    🛒 SITE
                  </span>
                )}
                {createdDate && (
                  <span className="text-[9px] text-gray-400 font-bold">
                    {createdDate.toLocaleDateString('pt-BR')} às {createdDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-black uppercase tracking-tight text-black flex items-center gap-2">
                <CreditCard className="text-[#eab308]" size={18} /> Central Financeira do Pedido
              </h2>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Cliente: <span className="text-black font-black">{order.customerName || order.name || 'Cliente'}</span>
                {(order.customerPhone || order.phone) && ` • ${order.customerPhone || order.phone}`}
              </p>
            </div>

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-black font-black uppercase text-xs p-1.5 hover:bg-gray-100 transition-colors cursor-pointer"
              title="Fechar Gaveta"
            >
              <X size={16} />
            </button>
          </div>

          {/* Operational Alerts */}
          {isOverdue && (
            <div className="bg-red-50 border border-red-300 p-3 flex items-start gap-2.5 text-red-900 animate-pulse">
              <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider block text-red-700">
                  🚨 Pagamento Atrasado (Inadimplência)
                </span>
                <p className="text-[8.5px] font-bold uppercase text-red-600 mt-0.5">
                  Vencimento expirado em {dueDate?.toLocaleDateString('pt-BR')}. Saldo devedor pendente: {formatMoney(pending)}.
                </p>
              </div>
            </div>
          )}

          {badgeType === 'due_today' && (
            <div className="bg-amber-50 border border-amber-300 p-3 flex items-start gap-2.5 text-amber-900">
              <Clock size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider block text-amber-800">
                  ⏰ Pagamento Vence Hoje
                </span>
                <p className="text-[8.5px] font-bold uppercase text-amber-700 mt-0.5">
                  Vencimento programado para hoje. Saldo pendente: {formatMoney(pending)}.
                </p>
              </div>
            </div>
          )}

          {/* Canonical Metric Block */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 p-3.5 border border-black/10">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-gray-500 block">Total do Pedido</span>
              <span className="text-base font-black font-mono text-black block mt-0.5">{formatMoney(total)}</span>
            </div>
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 block">Valor Pago</span>
              <span className="text-base font-black font-mono text-emerald-700 block mt-0.5">{formatMoney(paid)}</span>
            </div>
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-600 block">Saldo Devedor</span>
              <span className={`text-base font-black font-mono block mt-0.5 ${pending > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                {formatMoney(pending)}
              </span>
            </div>
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-purple-600 block">Líquido Recebido</span>
              <span className="text-base font-black font-mono text-purple-700 block mt-0.5">{formatMoney(netReceived)}</span>
            </div>
          </div>

          {/* Payment Method / Gateway Info */}
          <div className="bg-white border border-black/10 p-3 text-[10px] space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[8.5px] font-black uppercase text-gray-400">Método / Gateway:</span>
              <span className="font-black uppercase text-black font-mono">
                {order.payment?.method || order.paymentMethod || 'MANUAL / PIX'}
                {order.payment?.gateway && ` (${order.payment.gateway})`}
              </span>
            </div>
            {order.payment?.providerPaymentId && (
              <div className="flex justify-between items-center border-t border-black/5 pt-1">
                <span className="text-[8.5px] font-black uppercase text-gray-400">ID no Provedor:</span>
                <span className="font-mono text-gray-700 text-[9px]" title={order.payment.providerPaymentId}>
                  {order.payment.providerPaymentId}
                </span>
              </div>
            )}
            {order.payment?.installments && order.payment.installments > 1 && (
              <div className="flex justify-between items-center border-t border-black/5 pt-1">
                <span className="text-[8.5px] font-black uppercase text-gray-400">Parcelas:</span>
                <span className="font-mono text-black font-bold">
                  {order.payment.installments}x de {formatMoney(total / order.payment.installments)}
                </span>
              </div>
            )}
            {dueDate && (
              <div className="flex justify-between items-center border-t border-black/5 pt-1">
                <span className="text-[8.5px] font-black uppercase text-gray-400">Data de Vencimento:</span>
                <span className="font-mono font-black text-black">
                  {dueDate.toLocaleDateString('pt-BR')}
                </span>
              </div>
            )}
          </div>

          {/* Action Selector Bar */}
          <div className="flex items-center gap-1.5 border-b border-black/10 pb-2">
            <button
              onClick={() => setActiveAction('overview')}
              className={`px-3 py-1.5 text-[8.5px] font-black uppercase tracking-wider border cursor-pointer transition-all ${
                activeAction === 'overview'
                  ? 'bg-black text-[#eab308] border-black shadow-xs'
                  : 'bg-gray-50 text-gray-600 border-black/10 hover:bg-gray-100 hover:text-black'
              }`}
            >
              📜 Histórico / Ledger ({events.length})
            </button>

            {pending > 0 && (
              <button
                onClick={() => setActiveAction('pay')}
                className={`px-3 py-1.5 text-[8.5px] font-black uppercase tracking-wider border cursor-pointer transition-all flex items-center gap-1 ${
                  activeAction === 'pay'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <Receipt size={11} /> Registrar Pagamento
              </button>
            )}

            {paid > 0 && (paid - refunded) > 0 && (
              <button
                onClick={() => setActiveAction('refund')}
                className={`px-3 py-1.5 text-[8.5px] font-black uppercase tracking-wider border cursor-pointer transition-all flex items-center gap-1 ${
                  activeAction === 'refund'
                    ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                    : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                }`}
              >
                <RotateCcw size={11} /> Reembolsar / Estornar
              </button>
            )}
          </div>

          {/* Action Views */}
          {activeAction === 'pay' && (
            <motion.form
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handlePaymentSubmit}
              className="bg-emerald-50/50 border border-emerald-300 p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-900 flex items-center gap-1.5">
                  <Receipt size={13} className="text-emerald-700" /> Registrar Pagamento Manual
                </span>
                <button
                  type="button"
                  onClick={() => setActiveAction('overview')}
                  className="text-[8px] font-bold text-gray-500 uppercase hover:text-black cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div>
                <label className="text-[8.5px] font-black uppercase tracking-wider text-black block mb-1">
                  Valor a Pagar (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={pending}
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full p-2 text-sm font-mono font-black border border-emerald-300 bg-white focus:border-emerald-600 outline-none"
                  placeholder="0.00"
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[8px] text-gray-500 font-mono">
                    Saldo restante: {formatMoney(pending)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(pending.toFixed(2))}
                    className="text-[8px] font-black uppercase text-emerald-800 hover:underline cursor-pointer"
                  >
                    Quitar Saldo Total
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[8.5px] font-black uppercase tracking-wider text-black block mb-1">
                  Método de Pagamento *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-2 text-xs font-bold border border-emerald-300 bg-white focus:border-emerald-600 outline-none"
                >
                  <option value="PIX">⚡ PIX</option>
                  <option value="DINHEIRO">💵 Dinheiro (Espécie)</option>
                  <option value="CARTAO_CREDITO">💳 Cartão de Crédito (Maquininha)</option>
                  <option value="CARTAO_DEBITO">💳 Cartão de Débito (Maquininha)</option>
                  <option value="TRANSFERENCIA">🏦 Transferência Bancária (TED/DOC)</option>
                  <option value="BOLETO">📄 Boleto Bancário</option>
                  <option value="CHEQUE">📝 Cheque</option>
                  <option value="OUTRO">⚙️ Outro / Ajuste</option>
                </select>
              </div>

              <div>
                <label className="text-[8.5px] font-black uppercase tracking-wider text-black block mb-1">
                  Motivo / Observações
                </label>
                <input
                  type="text"
                  value={paymentReason}
                  onChange={(e) => setPaymentReason(e.target.value)}
                  placeholder="Ex: Pagamento de parcela recebido via PIX"
                  className="w-full p-2 text-xs border border-emerald-300 bg-white focus:border-emerald-600 outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveAction('overview')}
                  className="px-3 py-1.5 text-[8.5px] font-black uppercase tracking-wider bg-white border border-gray-300 text-gray-700 cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-4 py-1.5 text-[8.5px] font-black uppercase tracking-wider bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  <CheckCircle size={11} />
                  {isSubmittingPayment ? 'Gravando...' : 'Confirmar Pagamento'}
                </button>
              </div>
            </motion.form>
          )}

          {activeAction === 'refund' && (
            <motion.form
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleRefundSubmit}
              className="bg-purple-50/50 border border-purple-300 p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-purple-200 pb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-purple-900 flex items-center gap-1.5">
                  <RotateCcw size={13} className="text-purple-700" /> Processar Estorno / Reembolso
                </span>
                <button
                  type="button"
                  onClick={() => setActiveAction('overview')}
                  className="text-[8px] font-bold text-gray-500 uppercase hover:text-black cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div>
                <label className="text-[8.5px] font-black uppercase tracking-wider text-black block mb-1">
                  Valor a Estornar (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Math.max(0, paid - refunded)}
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full p-2 text-sm font-mono font-black border border-purple-300 bg-white focus:border-purple-600 outline-none"
                  placeholder="0.00"
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[8px] text-gray-500 font-mono">
                    Disponível para estorno: {formatMoney(Math.max(0, paid - refunded))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRefundAmount(Math.max(0, paid - refunded).toFixed(2))}
                    className="text-[8px] font-black uppercase text-purple-800 hover:underline cursor-pointer"
                  >
                    Estornar Total
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[8.5px] font-black uppercase tracking-wider text-black block mb-1">
                  Motivo do Reembolso *
                </label>
                <input
                  type="text"
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Ex: Devolução de produto / Arrependimento de compra"
                  className="w-full p-2 text-xs border border-purple-300 bg-white focus:border-purple-600 outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveAction('overview')}
                  className="px-3 py-1.5 text-[8.5px] font-black uppercase tracking-wider bg-white border border-gray-300 text-gray-700 cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRefund}
                  className="px-4 py-1.5 text-[8.5px] font-black uppercase tracking-wider bg-purple-700 text-white hover:bg-purple-800 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  <RotateCcw size={11} />
                  {isSubmittingRefund ? 'Processando...' : 'Confirmar Reembolso'}
                </button>
              </div>
            </motion.form>
          )}

          {/* Ledger / History of Events */}
          <div className="flex-1 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-black" />
                Ledger Imutável de Eventos Financeiros
              </span>
              <button
                onClick={() => loadEvents(order.id)}
                className="text-[8px] font-bold uppercase text-gray-500 hover:text-black flex items-center gap-1 cursor-pointer"
                title="Recarregar eventos"
              >
                <RefreshCw size={10} className={isLoadingEvents ? 'animate-spin' : ''} /> Atualizar
              </button>
            </div>

            {isLoadingEvents ? (
              <div className="py-8 text-center text-gray-400 text-xs font-bold uppercase tracking-wider animate-pulse">
                Carregando eventos do ledger...
              </div>
            ) : events.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-[10px] font-bold uppercase tracking-wider border border-dashed border-black/15 p-4 bg-gray-50">
                Nenhum evento registrado no ledger para este pedido.
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((evt, idx) => {
                  const dateStr = evt.createdAt ? new Date(evt.createdAt).toLocaleString('pt-BR') : '—';
                  const isPay = evt.type?.includes('PAYMENT');
                  const isRef = evt.type?.includes('REFUND');

                  return (
                    <div 
                      key={evt.id || idx}
                      className="bg-white border border-black/10 p-3 space-y-1.5 shadow-xs hover:border-[#eab308]/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`px-1.5 py-0.5 text-[7.5px] font-black uppercase tracking-widest font-mono border ${
                          isRef 
                            ? 'bg-purple-50 text-purple-700 border-purple-200' 
                            : isPay 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-gray-100 text-gray-700 border-gray-300'
                        }`}>
                          {evt.type}
                        </span>
                        <span className="text-[8px] font-mono text-gray-400">{dateStr}</span>
                      </div>

                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-xs font-black font-mono text-black">
                          {evt.amount > 0 ? `R$ ${evt.amount.toFixed(2)}` : 'R$ 0.00'}
                        </span>
                        <div className="text-[8px] font-bold text-gray-500 uppercase">
                          {evt.previousStatus || '—'} <span className="text-gray-300">➔</span> <span className="font-black text-black">{evt.newStatus}</span>
                        </div>
                      </div>

                      {evt.reason && (
                        <p className="text-[8.5px] text-gray-600 italic bg-gray-50 p-1.5 border border-black/5 font-sans">
                          "{evt.reason}"
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[7px] font-mono text-gray-400 pt-1 border-t border-black/5">
                        <span>Operador: {evt.actorEmail || 'Admin'}</span>
                        <span>Método: {evt.paymentMethod || 'MANUAL'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-black/10 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-[9px] font-black uppercase tracking-wider bg-black text-white hover:bg-[#eab308] hover:text-black transition-colors cursor-pointer font-sans"
            >
              Fechar Gaveta
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

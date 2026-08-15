import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Search, Filter, AlertCircle, CheckCircle2, 
  Clock, DollarSign, Calendar, Building2, Tag, 
  Trash2, ArrowUpRight, Check, X, ShieldAlert,
  CreditCard, RefreshCw, AlertTriangle
} from 'lucide-react';
import { authenticatedFetch } from '../../../lib/api';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import { AccountsPayableEntry, Supplier, AccountPlanCategory } from '../../../types/financial';
import toast from 'react-hot-toast';

interface AccountsPayableManagerProps {
  onRefreshStats?: () => void;
}

const CATEGORIES: { label: string; value: AccountPlanCategory }[] = [
  { label: 'Fornecedores & CMV', value: 'FORNECEDOR' },
  { label: 'Custos de Tráfego / Ads', value: 'MARKETING' },
  { label: 'Custos Operacionais / Despesas Fixas', value: 'DESPESA_FIXA' },
  { label: 'Despesas Variáveis', value: 'DESPESA_VARIAVEL' },
  { label: 'Investimentos Fixos / Máquinas', value: 'INVESTIMENTO' },
  { label: 'Impostos & Tributos', value: 'IMPOSTO' },
  { label: 'Fretes & Logística', value: 'FRETE' },
  { label: 'Taxas Gateway', value: 'TAXA_GATEWAY' },
  { label: 'Outras Despesas', value: 'OUTROS' }
];

export function AccountsPayableManager({ onRefreshStats }: AccountsPayableManagerProps) {
  const { formatMoney } = useFinancialPrivacy();
  const [payables, setPayables] = useState<AccountsPayableEntry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [selectedPayable, setSelectedPayable] = useState<AccountsPayableEntry | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    dueDate: new Date().toISOString().split('T')[0],
    category: 'FORNECEDOR',
    supplierId: '',
    competencyDate: new Date().toISOString().split('T')[0],
    recurrence: 'none',
    priority: 'normal',
    notes: ''
  });

  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentMethod: 'PIX',
    paymentDate: new Date().toISOString().split('T')[0],
    reason: ''
  });

  const [voidReason, setVoidReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPayables = async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch('/api/admin/financial/payables');
      const data = await res.json();
      if (data.success && Array.isArray(data.payables)) {
        setPayables(data.payables);
      }
    } catch (err: any) {
      console.error('Erro ao buscar contas a pagar:', err);
      toast.error('Erro ao carregar contas a pagar.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await authenticatedFetch('/api/admin/financial/suppliers');
      const data = await res.json();
      if (data.success && Array.isArray(data.suppliers)) {
        setSuppliers(data.suppliers.filter((s: Supplier) => s.active !== false));
      }
    } catch (err: any) {
      console.error('Erro ao buscar fornecedores:', err);
    }
  };

  useEffect(() => {
    fetchPayables();
    fetchSuppliers();
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  // Metrics
  const metrics = useMemo(() => {
    let totalOpen = 0;
    let totalPaid = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let dueTodayCount = 0;
    let dueTodayAmount = 0;
    let pendingCount = 0;

    payables.forEach(p => {
      if (p.status !== 'voided' && p.status !== 'cancelled') {
        totalPaid += Number(p.amountPaid || 0);
        if (p.status === 'pending' || p.status === 'partially_paid') {
          const open = Number(p.amountOpen || (p.amount - p.amountPaid)) || 0;
          totalOpen += open;
          pendingCount++;

          if (p.dueDate < todayStr) {
            overdueCount++;
            overdueAmount += open;
          } else if (p.dueDate === todayStr) {
            dueTodayCount++;
            dueTodayAmount += open;
          }
        }
      }
    });

    return {
      totalOpen,
      totalPaid,
      overdueCount,
      overdueAmount,
      dueTodayCount,
      dueTodayAmount,
      pendingCount
    };
  }, [payables, todayStr]);

  // Filtered list
  const filteredPayables = useMemo(() => {
    return payables.filter(item => {
      if (filterStatus === 'pending' && !['pending', 'partially_paid'].includes(item.status)) return false;
      if (filterStatus === 'paid' && item.status !== 'paid') return false;
      if (filterStatus === 'overdue' && (['paid', 'voided', 'cancelled'].includes(item.status) || item.dueDate >= todayStr)) return false;
      if (filterStatus === 'voided' && item.status !== 'voided') return false;

      if (filterCategory !== 'all' && item.category !== filterCategory) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const descMatch = item.description?.toLowerCase().includes(term);
        const suppMatch = item.supplierName?.toLowerCase().includes(term);
        const catMatch = item.category?.toLowerCase().includes(term);
        if (!descMatch && !suppMatch && !catMatch) return false;
      }

      return true;
    });
  }, [payables, filterStatus, filterCategory, searchTerm, todayStr]);

  // Handle Create Payable
  const handleCreatePayable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || !formData.dueDate) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    const amt = parseFloat(formData.amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }

    try {
      setIsSubmitting(true);
      const selectedSup = suppliers.find(s => s.id === formData.supplierId);
      const idempotencyKey = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const res = await authenticatedFetch('/api/admin/financial/payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: formData.description,
          amount: amt,
          dueDate: formData.dueDate,
          competencyDate: formData.competencyDate,
          category: formData.category,
          supplierId: formData.supplierId || null,
          supplierName: selectedSup ? selectedSup.name : null,
          recurrence: formData.recurrence,
          priority: formData.priority,
          notes: formData.notes,
          idempotencyKey
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Erro ao criar conta a pagar');
      }

      toast.success('Conta a pagar registrada com sucesso!');
      setShowCreateModal(false);
      setFormData({
        description: '',
        amount: '',
        dueDate: new Date().toISOString().split('T')[0],
        category: 'FORNECEDOR',
        supplierId: '',
        competencyDate: new Date().toISOString().split('T')[0],
        recurrence: 'none',
        priority: 'normal',
        notes: ''
      });
      fetchPayables();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao registrar conta a pagar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Payment
  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayable) return;

    const amt = parseFloat(paymentData.amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Informe um valor válido.');
      return;
    }

    try {
      setIsSubmitting(true);
      const idempotencyKey = `pay_exec_${selectedPayable.id}_${Date.now()}`;

      const res = await authenticatedFetch(`/api/admin/financial/payables/${selectedPayable.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          paymentMethod: paymentData.paymentMethod,
          paymentDate: paymentData.paymentDate,
          reason: paymentData.reason,
          idempotencyKey
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Erro ao registrar pagamento');
      }

      toast.success('Pagamento baixado com sucesso no fluxo e razão contábil!');
      setShowPaymentModal(false);
      setSelectedPayable(null);
      fetchPayables();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao efetuar baixa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Void
  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayable) return;

    try {
      setIsSubmitting(true);
      const idempotencyKey = `pay_void_${selectedPayable.id}_${Date.now()}`;

      const res = await authenticatedFetch(`/api/admin/financial/payables/${selectedPayable.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: voidReason || 'Anulação manual via painel financeiro',
          idempotencyKey
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Erro ao anular conta');
      }

      toast.success('Conta a pagar anulada e estornada com segurança.');
      setShowVoidModal(false);
      setSelectedPayable(null);
      setVoidReason('');
      fetchPayables();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao anular conta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (item: AccountsPayableEntry) => {
    if (item.status === 'voided') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700">Anulada</span>;
    }
    if (item.status === 'paid') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Paga</span>;
    }
    if (item.status === 'partially_paid') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20"><Clock className="w-3 h-3 mr-1" /> Parcial</span>;
    }
    if (item.dueDate < todayStr) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse"><AlertTriangle className="w-3 h-3 mr-1" /> Vencida</span>;
    }
    if (item.dueDate === todayStr) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock className="w-3 h-3 mr-1" /> Vence Hoje</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Em Aberto</span>;
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-5 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            Contas a Pagar & Obrigações
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Gestão estruturada de fornecedores, CMV, despesas recorrentes e liquidação com trilha de auditoria.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchPayables}
            disabled={loading}
            className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-lg transition shadow-lg shadow-amber-500/10"
          >
            <Plus className="w-4 h-4" />
            Nova Conta a Pagar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900/90 border border-neutral-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Total a Pagar Aberto</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {formatMoney(metrics.totalOpen)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            {metrics.pendingCount} títulos em aberto
          </div>
        </div>

        <div className="bg-neutral-900/90 border border-neutral-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Contas Vencidas</span>
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
          <div className={`text-2xl font-bold ${metrics.overdueCount > 0 ? 'text-red-400' : 'text-neutral-300'}`}>
            {formatMoney(metrics.overdueAmount)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            {metrics.overdueCount} títulos vencidos
          </div>
        </div>

        <div className="bg-neutral-900/90 border border-neutral-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Vencendo Hoje</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {formatMoney(metrics.dueTodayAmount)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            {metrics.dueTodayCount} títulos para hoje
          </div>
        </div>

        <div className="bg-neutral-900/90 border border-neutral-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Total Liquidado</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {formatMoney(metrics.totalPaid)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            Pagamentos já efetuados
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-neutral-900/50 border border-neutral-800 p-3 rounded-xl">
        <div className="flex flex-1 items-center gap-2 w-full md:w-auto bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800">
          <Search className="w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar por descrição, fornecedor ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-sm text-white placeholder-neutral-500 outline-none w-full"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-neutral-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-lg px-3 py-2 outline-none"
          >
            <option value="all">Status: Todos</option>
            <option value="pending">Apenas Em Aberto / Parciais</option>
            <option value="overdue">Apenas Vencidos</option>
            <option value="paid">Apenas Pagos</option>
            <option value="voided">Apenas Anulados</option>
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-lg px-3 py-2 outline-none"
          >
            <option value="all">Categoria: Todas</option>
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Payables Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-neutral-300">
            <thead className="bg-neutral-950/80 text-xs uppercase font-medium text-neutral-400 border-b border-neutral-800">
              <tr>
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4">Descrição / Fornecedor</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4 text-right">Valor Total</th>
                <th className="py-3 px-4 text-right">Em Aberto</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
                    Carregando contas a pagar...
                  </td>
                </tr>
              ) : filteredPayables.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-500">
                    Nenhuma conta a pagar encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredPayables.map((item) => {
                  const isVoided = item.status === 'voided';
                  const isPaid = item.status === 'paid';
                  const openAmt = item.amountOpen !== undefined ? item.amountOpen : (item.amount - (item.amountPaid || 0));

                  return (
                    <tr key={item.id} className="hover:bg-neutral-800/40 transition">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono text-xs text-neutral-200">
                          {item.dueDate ? new Date(item.dueDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                        </div>
                        {item.priority === 'urgente' && (
                          <span className="text-[10px] text-red-400 font-semibold uppercase">Urgente</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-white">{item.description}</div>
                        {item.supplierName && (
                          <div className="text-xs text-amber-400/80 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3" />
                            {item.supplierName}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-neutral-400">
                        <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono">
                          {item.category || 'OUTROS'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-white whitespace-nowrap">
                        {formatMoney(item.amount)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className={openAmt > 0 ? 'text-amber-400 font-bold' : 'text-neutral-500'}>
                          {formatMoney(openAmt)}
                        </span>
                        {item.amountPaid > 0 && (
                          <div className="text-[11px] text-emerald-400/80">
                            Pago: {formatMoney(item.amountPaid)}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {getStatusBadge(item)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {!isVoided && !isPaid && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedPayable(item);
                                setPaymentData({
                                  amount: String(openAmt),
                                  paymentMethod: 'PIX',
                                  paymentDate: new Date().toISOString().split('T')[0],
                                  reason: ''
                                });
                                setShowPaymentModal(true);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1 transition"
                            >
                              <Check className="w-3.5 h-3.5" /> Baixar
                            </button>
                            <button
                              onClick={() => {
                                setSelectedPayable(item);
                                setVoidReason('');
                                setShowVoidModal(true);
                              }}
                              className="p-1 text-neutral-500 hover:text-red-400 rounded transition"
                              title="Anular"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {isPaid && (
                          <span className="text-xs text-neutral-500 font-mono">
                            {item.paymentDate ? `Pago em ${new Date(item.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}` : 'Liquidado'}
                          </span>
                        )}
                        {isVoided && (
                          <span className="text-xs text-neutral-500 italic">
                            {item.voidReason || 'Anulado'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                Nova Conta / Obrigação a Pagar
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePayable} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Descrição da Conta / Título *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Compra de Tecido Malha 100% Algodão"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Valor Total (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Data de Vencimento *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Categoria DRE
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Fornecedor (Opcional)
                  </label>
                  <select
                    value={formData.supplierId}
                    onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  >
                    <option value="">Nenhum / Não especificado</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Data de Competência
                  </label>
                  <input
                    type="date"
                    value={formData.competencyDate}
                    onChange={(e) => setFormData({ ...formData, competencyDate: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Prioridade
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  >
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Observações / Dados de Pagamento
                </label>
                <textarea
                  rows={2}
                  placeholder="Chave PIX, código de barras, número da NF..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-sm transition shadow-lg shadow-amber-500/10 flex items-center gap-2"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Cadastrar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {showPaymentModal && selectedPayable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Baixar Pagamento
              </h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePay} className="p-5 space-y-4">
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                <div className="text-xs text-neutral-400 font-medium">Conta a Pagar:</div>
                <div className="text-sm font-bold text-white mt-0.5">{selectedPayable.description}</div>
                <div className="flex justify-between text-xs mt-2 pt-2 border-t border-neutral-800 text-neutral-300">
                  <span>Total da Conta: {formatMoney(selectedPayable.amount)}</span>
                  <span className="text-amber-400 font-semibold">
                    Em Aberto: {formatMoney(selectedPayable.amountOpen ?? (selectedPayable.amount - (selectedPayable.amountPaid || 0)))}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Valor Pago (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-400 outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Método de Pagamento
                  </label>
                  <select
                    value={paymentData.paymentMethod}
                    onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-400 outline-none"
                  >
                    <option value="PIX">PIX</option>
                    <option value="TRANSFERENCIA">Transferência Bancária</option>
                    <option value="BOLETO">Boleto Bancário</option>
                    <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                    <option value="DINHEIRO">Dinheiro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Data do Pagamento
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentData.paymentDate}
                    onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-400 outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Comprovante / Motivo / Observação
                </label>
                <input
                  type="text"
                  placeholder="Ex: Pago via app Nubank pelo sócio"
                  value={paymentData.reason}
                  onChange={(e) => setPaymentData({ ...paymentData, reason: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-400 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm transition shadow-lg shadow-emerald-500/10 flex items-center gap-2"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Confirmar Baixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID MODAL */}
      {showVoidModal && selectedPayable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                Anular Conta a Pagar
              </h3>
              <button onClick={() => setShowVoidModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVoid} className="p-5 space-y-4">
              <p className="text-sm text-neutral-300">
                Tem certeza que deseja anular a conta <strong className="text-white">"{selectedPayable.description}"</strong> no valor de <strong className="text-white">{formatMoney(selectedPayable.amount)}</strong>?
              </p>
              <p className="text-xs text-neutral-400">
                Esta ação manterá a trilha de auditoria e cancelará os débitos pendentes no razão financeiro.
              </p>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Justificativa da Anulação *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Boleto cancelado pelo fornecedor / Duplicidade"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-red-400 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowVoidModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm transition"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition flex items-center gap-2"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Confirmar Anulação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

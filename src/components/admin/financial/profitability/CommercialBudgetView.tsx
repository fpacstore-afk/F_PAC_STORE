import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Layers,
  PieChart,
  Target,
  Zap,
  Info,
  Clock,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Archive,
  Check,
  GitBranch
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import {
  CommercialBudget,
  CommercialBudgetEvent,
  BudgetPeriod,
  LineAllocationMethod,
  CommercialBudgetAllocations,
  CommercialBudgetGuardrails
} from '../../../../types/commercialBudget';
import { CommercialForecast } from '../../../../types/commercialForecast';
import { CommercialGoal } from '../../../../types/commercialGovernance';
import {
  generateCommercialBudget,
  recalculateCommercialBudgetActuals,
  roundMoney,
  roundPercent
} from '../../../../utils/commercialBudget';
import {
  fetchCommercialBudgets,
  createCommercialBudget,
  activateCommercialBudget,
  rebudgetCommercialBudget,
  recalculateCommercialBudget,
  archiveCommercialBudget,
  fetchCommercialBudgetEvents
} from '../../../../services/commercial/commercialBudgetService';

interface CommercialBudgetViewProps {
  rawOrders?: any[];
  expenses?: any[];
  investments?: any[];
  traffic?: any[];
  productCatalog?: any[];
  forecasts?: CommercialForecast[];
  goals?: CommercialGoal[];
}

export const CommercialBudgetView: React.FC<CommercialBudgetViewProps> = ({
  rawOrders = [],
  expenses = [],
  investments = [],
  traffic = [],
  productCatalog = [],
  forecasts = [],
  goals = []
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  const [savedBudgets, setSavedBudgets] = useState<CommercialBudget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<CommercialBudget | null>(null);
  const [events, setEvents] = useState<CommercialBudgetEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isRebudgetMode, setIsRebudgetMode] = useState(false);
  const [rebudgetParentId, setRebudgetParentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [newTitle, setNewTitle] = useState('');
  const [newPeriod, setNewPeriod] = useState<BudgetPeriod>('monthly');
  const [newStartDate, setNewStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [newEndDate, setNewEndDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  );
  const [newTargetRevenue, setNewTargetRevenue] = useState<number>(30000);
  const [newCogsBudget, setNewCogsBudget] = useState<number>(10000);
  const [newTrafficBudget, setNewTrafficBudget] = useState<number>(4500);
  const [newFixedBudget, setNewFixedBudget] = useState<number>(5000);
  const [newVariableBudget, setNewVariableBudget] = useState<number>(1500);
  const [newShippingBudget, setNewShippingBudget] = useState<number>(1000);
  const [newGatewayBudget, setNewGatewayBudget] = useState<number>(1200);
  const [newLinkedForecastId, setNewLinkedForecastId] = useState<string>('');
  const [newLinkedGoalIds, setNewLinkedGoalIds] = useState<string[]>([]);
  const [newLineAllocationMethod, setNewLineAllocationMethod] = useState<LineAllocationMethod>('revenue_proportional');
  const [manualLinesInput, setManualLinesInput] = useState<{ [key: string]: { revenue: number; cogs: number; cm: number; units: number } }>({
    FORCE: { revenue: 0, cogs: 0, cm: 0, units: 0 },
    MARK: { revenue: 0, cogs: 0, cm: 0, units: 0 },
    PRIME: { revenue: 0, cogs: 0, cm: 0, units: 0 },
    OTHER: { revenue: 0, cogs: 0, cm: 0, units: 0 }
  });

  // Guardrail thresholds
  const [maxTrafficPercent, setMaxTrafficPercent] = useState<number>(15);
  const [minMarginPercent, setMinMarginPercent] = useState<number>(30);
  const [maxCogsPercent, setMaxCogsPercent] = useState<number>(40);
  const [burnRateThreshold, setBurnRateThreshold] = useState<number>(110);

  // Carregar lista de orçamentos
  const loadBudgets = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchCommercialBudgets();
      setSavedBudgets(list);
      if (list.length > 0) {
        // Preferir o ativo, senão o primeiro
        const active = list.find(b => b.status === 'active') || list[0];
        setSelectedBudget(active);
        loadEvents(active.id);
      } else {
        // Gerar preview local para exibição imediata
        const localPreview = generateCommercialBudget({
          title: 'Orçamento Comercial Mês Atual',
          period: 'monthly',
          startDate: newStartDate,
          endDate: newEndDate,
          targetRevenue: 30000,
          allocations: {
            cogsBudget: 10000,
            trafficBudget: 4500,
            fixedExpensesBudget: 5000,
            variableExpensesBudget: 1500,
            shippingSubsidyBudget: 1000,
            gatewayFeesBudget: 1200,
            totalExpensesBudget: 23200
          },
          orders: rawOrders,
          expenses,
          investments,
          traffic,
          productCatalog
        });
        setSelectedBudget(localPreview);
      }
    } catch (err: any) {
      console.warn('Fallback to local calculation:', err.message);
      const localPreview = generateCommercialBudget({
        title: 'Orçamento Comercial Mês Atual (Local)',
        period: 'monthly',
        startDate: newStartDate,
        endDate: newEndDate,
        targetRevenue: 30000,
        allocations: {
          cogsBudget: 10000,
          trafficBudget: 4500,
          fixedExpensesBudget: 5000,
          variableExpensesBudget: 1500,
          shippingSubsidyBudget: 1000,
          gatewayFeesBudget: 1200,
          totalExpensesBudget: 23200
        },
        orders: rawOrders,
        expenses,
        investments,
        traffic,
        productCatalog
      });
      setSelectedBudget(localPreview);
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async (budgetId: string) => {
    try {
      const evList = await fetchCommercialBudgetEvents(budgetId);
      setEvents(evList);
    } catch (err) {
      console.warn('Erro ao carregar eventos:', err);
    }
  };

  useEffect(() => {
    loadBudgets();
  }, []);

  const handleSelectBudget = (b: CommercialBudget) => {
    setSelectedBudget(b);
    loadEvents(b.id);
  };

  // Criação de novo orçamento
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setError('Por favor, informe o título do orçamento.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const allocations: CommercialBudgetAllocations = {
      cogsBudget: Number(newCogsBudget) || 0,
      trafficBudget: Number(newTrafficBudget) || 0,
      fixedExpensesBudget: Number(newFixedBudget) || 0,
      variableExpensesBudget: Number(newVariableBudget) || 0,
      shippingSubsidyBudget: Number(newShippingBudget) || 0,
      gatewayFeesBudget: Number(newGatewayBudget) || 0,
      totalExpensesBudget: 0 // Calculado canonicamente no motor
    };

    const guardrails: CommercialBudgetGuardrails = {
      maxTrafficSpendPercentOfRevenue: Number(maxTrafficPercent),
      minContributionMarginPercent: Number(minMarginPercent),
      maxCogsPercentOfRevenue: Number(maxCogsPercent),
      burnRateAlertThresholdPercent: Number(burnRateThreshold)
    };

    const customLineAllocations = newLineAllocationMethod === 'manual'
      ? Object.entries(manualLinesInput).map(([line, val]) => ({
          line,
          targetRevenue: Number(val.revenue) || 0,
          targetRevenuePercent: Number(newTargetRevenue) > 0 ? Number(((val.revenue / Number(newTargetRevenue)) * 100).toFixed(2)) : 0,
          targetCogs: Number(val.cogs) || 0,
          targetContributionMargin: Number(val.cm) || 0,
          targetUnits: Number(val.units) || 0
        }))
      : undefined;

    try {
      if (isRebudgetMode && rebudgetParentId) {
        const rebudgeted = await rebudgetCommercialBudget(rebudgetParentId, {
          title: newTitle,
          targetRevenue: Number(newTargetRevenue),
          allocations,
          guardrails,
          linkedGoalIds: newLinkedGoalIds.length > 0 ? newLinkedGoalIds : undefined,
          lineAllocationMethod: newLineAllocationMethod,
          customLineAllocations
        });
        setSuccessMessage('Rebudget realizado com sucesso! Nova versão gerada.');
        setShowCreateModal(false);
        await loadBudgets();
        setSelectedBudget(rebudgeted);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        const created = await createCommercialBudget({
          title: newTitle,
          period: newPeriod,
          startDate: newStartDate,
          endDate: newEndDate,
          targetRevenue: Number(newTargetRevenue),
          allocations,
          guardrails,
          linkedForecastId: newLinkedForecastId || undefined,
          linkedGoalId: newLinkedGoalIds.length > 0 ? newLinkedGoalIds[0] : undefined,
          linkedGoalIds: newLinkedGoalIds.length > 0 ? newLinkedGoalIds : undefined,
          lineAllocationMethod: newLineAllocationMethod,
          customLineAllocations
        });

        setSuccessMessage('Orçamento comercial criado com sucesso!');
        setShowCreateModal(false);
        await loadBudgets();
        setSelectedBudget(created);
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao processar orçamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenRebudget = (budgetToRebudget: CommercialBudget) => {
    setIsRebudgetMode(true);
    setRebudgetParentId(budgetToRebudget.id);
    setNewTitle(`${budgetToRebudget.title} (Revisão v${(budgetToRebudget.version || 1) + 1})`);
    setNewPeriod(budgetToRebudget.period);
    setNewStartDate(budgetToRebudget.startDate);
    setNewEndDate(budgetToRebudget.endDate);
    setNewTargetRevenue(budgetToRebudget.targetRevenue);
    setNewCogsBudget(budgetToRebudget.allocations.cogsBudget);
    setNewTrafficBudget(budgetToRebudget.allocations.trafficBudget);
    setNewFixedBudget(budgetToRebudget.allocations.fixedExpensesBudget);
    setNewVariableBudget(budgetToRebudget.allocations.variableExpensesBudget);
    setNewShippingBudget(budgetToRebudget.allocations.shippingSubsidyBudget);
    setNewGatewayBudget(budgetToRebudget.allocations.gatewayFeesBudget);

    // Carregar Guardrails
    setMaxTrafficPercent(
      budgetToRebudget.guardrails?.maxTrafficSpendPercentOfRevenue ?? 15
    );
    setMinMarginPercent(
      budgetToRebudget.guardrails?.minContributionMarginPercent ?? 30
    );
    setMaxCogsPercent(
      budgetToRebudget.guardrails?.maxCogsPercentOfRevenue ?? 40
    );
    setBurnRateThreshold(
      budgetToRebudget.guardrails?.burnRateAlertThresholdPercent ?? 110
    );

    // Carregar Metas Vinculadas (linkedGoalIds)
    setNewLinkedGoalIds(
      budgetToRebudget.linkedGoalIds
        ?? (budgetToRebudget.linkedGoalId ? [budgetToRebudget.linkedGoalId] : [])
    );

    // Carregar Método de Alocação por Linha
    const method = budgetToRebudget.lineAllocationMethod ?? 'revenue_proportional';
    setNewLineAllocationMethod(method);

    // Carregar Manual Lines se for manual
    if (method === 'manual' && budgetToRebudget.lineAllocations && budgetToRebudget.lineAllocations.length > 0) {
      const mappedLines: { [key: string]: { revenue: number; cogs: number; cm: number; units: number } } = {
        FORCE: { revenue: 0, cogs: 0, cm: 0, units: 0 },
        MARK: { revenue: 0, cogs: 0, cm: 0, units: 0 },
        PRIME: { revenue: 0, cogs: 0, cm: 0, units: 0 },
        OTHER: { revenue: 0, cogs: 0, cm: 0, units: 0 }
      };

      budgetToRebudget.lineAllocations.forEach(l => {
        if (mappedLines[l.line]) {
          mappedLines[l.line] = {
            revenue: l.targetRevenue || 0,
            cogs: l.targetCogs || 0,
            cm: l.targetContributionMargin || 0,
            units: l.targetUnits || 0
          };
        }
      });

      setManualLinesInput(mappedLines);
    } else {
      setManualLinesInput({
        FORCE: { revenue: 0, cogs: 0, cm: 0, units: 0 },
        MARK: { revenue: 0, cogs: 0, cm: 0, units: 0 },
        PRIME: { revenue: 0, cogs: 0, cm: 0, units: 0 },
        OTHER: { revenue: 0, cogs: 0, cm: 0, units: 0 }
      });
    }

    setNewLinkedForecastId(budgetToRebudget.linkedForecastId || '');
    setShowCreateModal(true);
  };

  const handleOpenCreateNew = () => {
    const today = new Date();
    setIsRebudgetMode(false);
    setRebudgetParentId(null);
    setNewTitle('');
    setNewPeriod('monthly');
    setNewStartDate(
      new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split('T')[0]
    );
    setNewEndDate(
      new Date(today.getFullYear(), today.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0]
    );
    setNewTargetRevenue(30000);
    setNewCogsBudget(10000);
    setNewTrafficBudget(4500);
    setNewFixedBudget(5000);
    setNewVariableBudget(1500);
    setNewShippingBudget(1000);
    setNewGatewayBudget(1200);
    setMaxTrafficPercent(15);
    setMinMarginPercent(30);
    setMaxCogsPercent(40);
    setBurnRateThreshold(110);
    setNewLinkedGoalIds([]);
    setNewLineAllocationMethod('revenue_proportional');
    setManualLinesInput({
      FORCE: { revenue: 0, cogs: 0, cm: 0, units: 0 },
      MARK: { revenue: 0, cogs: 0, cm: 0, units: 0 },
      PRIME: { revenue: 0, cogs: 0, cm: 0, units: 0 },
      OTHER: { revenue: 0, cogs: 0, cm: 0, units: 0 }
    });
    setNewLinkedForecastId('');
    setShowCreateModal(true);
  };

  // Ativar
  const handleActivate = async () => {
    if (!selectedBudget) return;
    setLoading(true);
    try {
      const updated = await activateCommercialBudget(selectedBudget.id);
      setSelectedBudget(updated);
      setSuccessMessage('Orçamento ativado com sucesso!');
      await loadBudgets();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Falha ao ativar orçamento.');
    } finally {
      setLoading(false);
    }
  };

  // Recalcular
  const handleRecalculate = async () => {
    if (!selectedBudget) return;
    setLoading(true);
    try {
      const updated = await recalculateCommercialBudget(selectedBudget.id);
      setSelectedBudget(updated);
      setSuccessMessage('Realizados do orçamento recalculados com sucesso!');
      loadEvents(selectedBudget.id);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Falha ao recalcular orçamento.');
    } finally {
      setLoading(false);
    }
  };

  // Arquivar
  const handleArchive = async () => {
    if (!selectedBudget) return;
    setLoading(true);
    try {
      const updated = await archiveCommercialBudget(selectedBudget.id);
      setSelectedBudget(updated);
      setSuccessMessage('Orçamento arquivado com sucesso!');
      await loadBudgets();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Falha ao arquivar orçamento.');
    } finally {
      setLoading(false);
    }
  };

  const budget = selectedBudget;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-black/10 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <DollarSign className="text-black" size={20} />
            <h2 className="text-xs font-black uppercase tracking-wider text-black">
              Orçamento Comercial & Guardrails Financeiros
            </h2>
          </div>

          {/* Budget Selector Pill */}
          {savedBudgets.length > 0 && (
            <select
              value={selectedBudget?.id || ''}
              onChange={(e) => {
                const found = savedBudgets.find(b => b.id === e.target.value);
                if (found) handleSelectBudget(found);
              }}
              className="bg-gray-50 border border-black/10 px-2.5 py-1.5 text-[10px] font-bold text-gray-800 focus:outline-none focus:border-black cursor-pointer"
            >
              {savedBudgets.map(b => (
                <option key={b.id} value={b.id}>
                  {b.title} ({b.startDate} a {b.endDate}) [{b.status.toUpperCase()}]
                </option>
              ))}
            </select>
          )}

          {budget && (
            <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border ${
              budget.status === 'active'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : budget.status === 'draft'
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-gray-100 text-gray-600 border-gray-300'
            }`}>
              {budget.status === 'active' ? 'Ativo' : budget.status === 'draft' ? 'Rascunho' : 'Arquivado'}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {budget && budget.status === 'draft' && (
            <button
              onClick={handleActivate}
              disabled={loading}
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Check size={12} />
              Ativar Orçamento
            </button>
          )}

          {budget && budget.status === 'active' && (
            <button
              onClick={() => handleOpenRebudget(budget)}
              disabled={loading}
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <GitBranch size={12} />
              Revisar Orçamento
            </button>
          )}

          {budget && (
            <button
              onClick={handleRecalculate}
              disabled={loading}
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-800 hover:bg-gray-200 border border-black/10 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Recalcular Realizado
            </button>
          )}

          {budget && budget.status !== 'archived' && (
            <button
              onClick={handleArchive}
              disabled={loading}
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-white text-gray-600 hover:bg-gray-50 border border-black/10 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Archive size={12} />
              Arquivar
            </button>
          )}

          <button
            onClick={handleOpenCreateNew}
            className="px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider bg-black text-[#eab308] hover:bg-black/90 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus size={13} />
            Novo Orçamento
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {budget && (
        <>
          {/* 4 High-Density KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* Card 1: Receita */}
            <div className="bg-white border border-black/10 p-4 shadow-xs">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                <span>Receita Líquida</span>
                <span className="font-mono text-gray-400">
                  {budget.reconciliation.budgetToDate.elapsedRatio}% tempo
                </span>
              </div>
              <div className="text-xl font-black text-black font-mono">
                {formatMoney(budget.currentActuals.revenue)}
              </div>
              <div className="mt-2 text-[10px] flex items-center justify-between text-gray-600 border-t border-black/5 pt-2">
                <span>Orçado: <strong className="font-mono text-black">{formatMoney(budget.targetRevenue)}</strong></span>
                <span className={`font-bold font-mono ${
                  budget.reconciliation.revenueVariance.isFavorable ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  {budget.reconciliation.revenueVariance.variancePercent >= 0 ? '+' : ''}
                  {budget.reconciliation.revenueVariance.variancePercent}%
                </span>
              </div>
            </div>

            {/* Card 2: Margem de Contribuição */}
            <div className="bg-white border border-black/10 p-4 shadow-xs">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                <span>Margem de Contribuição</span>
                <span className="font-mono text-emerald-700 font-bold">
                  {budget.currentActuals.contributionMarginPercent}%
                </span>
              </div>
              <div className="text-xl font-black text-black font-mono">
                {formatMoney(budget.currentActuals.contributionMargin)}
              </div>
              <div className="mt-2 text-[10px] flex items-center justify-between text-gray-600 border-t border-black/5 pt-2">
                <span>Orçado: <strong className="font-mono text-black">{formatMoney(budget.targetContributionMargin)}</strong></span>
                <span className={`font-bold font-mono ${
                  budget.reconciliation.contributionMarginVariance.isFavorable ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  {budget.reconciliation.contributionMarginVariance.variancePercent >= 0 ? '+' : ''}
                  {budget.reconciliation.contributionMarginVariance.variancePercent}%
                </span>
              </div>
            </div>

            {/* Card 3: Lucro Operacional */}
            <div className="bg-white border border-black/10 p-4 shadow-xs">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                <span>Lucro Operacional</span>
                <span className="font-mono text-gray-500 font-bold">
                  {budget.currentActuals.operatingProfitPercent}%
                </span>
              </div>
              <div className={`text-xl font-black font-mono ${
                budget.currentActuals.operatingProfit >= 0 ? 'text-black' : 'text-red-600'
              }`}>
                {formatMoney(budget.currentActuals.operatingProfit)}
              </div>
              <div className="mt-2 text-[10px] flex items-center justify-between text-gray-600 border-t border-black/5 pt-2">
                <span>Orçado: <strong className="font-mono text-black">{formatMoney(budget.targetOperatingProfit)}</strong></span>
                <span className={`font-bold font-mono ${
                  budget.reconciliation.operatingProfitVariance.isFavorable ? 'text-emerald-700' : 'text-red-600'
                }`}>
                  {budget.reconciliation.operatingProfitVariance.variancePercent >= 0 ? '+' : ''}
                  {budget.reconciliation.operatingProfitVariance.variancePercent}%
                </span>
              </div>
            </div>

            {/* Card 4: Despesas & Burn Rate */}
            <div className="bg-white border border-black/10 p-4 shadow-xs">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                <span>Consumo de Despesas</span>
                <span className="font-mono text-gray-500">
                  {budget.currentActuals.daysElapsed} de {budget.currentActuals.totalDays} dias
                </span>
              </div>
              <div className="text-xl font-black text-black font-mono">
                {formatMoney(budget.currentActuals.totalExpenses)}
              </div>
              <div className="mt-2 text-[10px] flex items-center justify-between text-gray-600 border-t border-black/5 pt-2">
                <span>Teto: <strong className="font-mono text-black">{formatMoney(budget.allocations.totalExpensesBudget)}</strong></span>
                <span className={`font-bold font-mono ${
                  budget.reconciliation.expenseVariance.isFavorable ? 'text-emerald-700' : 'text-red-600'
                }`}>
                  {budget.reconciliation.expenseVariance.variancePercent >= 0 ? '+' : ''}
                  {budget.reconciliation.expenseVariance.variancePercent}%
                </span>
              </div>
            </div>

          </div>

          {/* Guardrails & Alertas de Limite */}
          {budget.reconciliation.alerts.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-900">
                <AlertTriangle size={15} />
                <span>Alertas de Guardrail Financeiro ({budget.reconciliation.alerts.length})</span>
              </div>
              <div className="space-y-1.5">
                {budget.reconciliation.alerts.map(a => (
                  <div key={a.id} className="flex items-start gap-2 text-xs text-amber-950 bg-white/70 p-2 border border-amber-200">
                    <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest border shrink-0 ${
                      a.severity === 'critical'
                        ? 'bg-red-100 text-red-800 border-red-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}>
                      {a.severity.toUpperCase()}
                    </span>
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabela de Alocações por Linha e Departamento */}
          <div className="bg-white border border-black/10 shadow-xs overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-black/10 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2">
                <Layers size={14} />
                Alocações de Despesas e Limites Orçamentários
              </h3>
              <span className="text-[10px] font-mono text-gray-500">
                Cálculo Pro-Rata Canônico 9.6.6
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-100/70 border-b border-black/10 text-[9px] font-black uppercase tracking-wider text-gray-600">
                    <th className="py-2.5 px-3">Linha de Despesa</th>
                    <th className="py-2.5 px-3 text-right">Orçado Total</th>
                    <th className="py-2.5 px-3 text-right">Orçado To-Date</th>
                    <th className="py-2.5 px-3 text-right">Realizado</th>
                    <th className="py-2.5 px-3 text-right">Delta vs To-Date</th>
                    <th className="py-2.5 px-3 text-right">Variância %</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 font-mono text-[11px]">
                  
                  {/* COGS */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-bold text-black">COGS (Custo de Mercadorias)</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{formatMoney(budget.allocations.cogsBudget)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-500">{formatMoney(budget.reconciliation.budgetToDate.cogsToDate)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-black">{formatMoney(budget.currentActuals.cogs)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{formatMoney(budget.reconciliation.cogsVariance.delta)}</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${budget.reconciliation.cogsVariance.isFavorable ? 'text-emerald-700' : 'text-red-600'}`}>
                      {budget.reconciliation.cogsVariance.variancePercent >= 0 ? '+' : ''}{budget.reconciliation.cogsVariance.variancePercent}%
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                        budget.reconciliation.cogsVariance.isFavorable ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {budget.reconciliation.cogsVariance.isFavorable ? 'Favorável' : 'Estourado'}
                      </span>
                    </td>
                  </tr>

                  {/* Tráfego */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-bold text-black">Tráfego Pago & Marketing</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{formatMoney(budget.allocations.trafficBudget)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-500">{formatMoney(budget.reconciliation.budgetToDate.trafficToDate)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-black">{formatMoney(budget.currentActuals.trafficExpenses)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{formatMoney(budget.reconciliation.trafficVariance.delta)}</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${budget.reconciliation.trafficVariance.isFavorable ? 'text-emerald-700' : 'text-red-600'}`}>
                      {budget.reconciliation.trafficVariance.variancePercent >= 0 ? '+' : ''}{budget.reconciliation.trafficVariance.variancePercent}%
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                        budget.reconciliation.trafficVariance.isFavorable ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {budget.reconciliation.trafficVariance.isFavorable ? 'Favorável' : 'Estourado'}
                      </span>
                    </td>
                  </tr>

                  {/* Despesas Fixas */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-bold text-black">Despesas Fixas Operacionais</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{formatMoney(budget.allocations.fixedExpensesBudget)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-500">{formatMoney(budget.reconciliation.budgetToDate.fixedExpensesToDate)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-black">{formatMoney(budget.currentActuals.fixedExpenses)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{formatMoney(budget.reconciliation.fixedExpensesVariance.delta)}</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${budget.reconciliation.fixedExpensesVariance.isFavorable ? 'text-emerald-700' : 'text-red-600'}`}>
                      {budget.reconciliation.fixedExpensesVariance.variancePercent >= 0 ? '+' : ''}{budget.reconciliation.fixedExpensesVariance.variancePercent}%
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                        budget.reconciliation.fixedExpensesVariance.isFavorable ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {budget.reconciliation.fixedExpensesVariance.isFavorable ? 'Favorável' : 'Estourado'}
                      </span>
                    </td>
                  </tr>

                  {/* Despesas Variáveis e Taxas */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-bold text-black">Despesas Variáveis (Gateway + Frete)</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">
                      {formatMoney(budget.allocations.variableExpensesBudget + budget.allocations.shippingSubsidyBudget + budget.allocations.gatewayFeesBudget)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-500">
                      {formatMoney(budget.reconciliation.budgetToDate.variableExpensesToDate + budget.reconciliation.budgetToDate.shippingSubsidyToDate + budget.reconciliation.budgetToDate.gatewayFeesToDate)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-black">
                      {formatMoney(budget.currentActuals.variableCosts + budget.currentActuals.shippingSubsidy + budget.currentActuals.gatewayFees)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-700">
                      {formatMoney(budget.reconciliation.variableExpensesVariance.delta)}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-bold ${budget.reconciliation.variableExpensesVariance.isFavorable ? 'text-emerald-700' : 'text-red-600'}`}>
                      {budget.reconciliation.variableExpensesVariance.variancePercent >= 0 ? '+' : ''}{budget.reconciliation.variableExpensesVariance.variancePercent}%
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                        budget.reconciliation.variableExpensesVariance.isFavorable ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {budget.reconciliation.variableExpensesVariance.isFavorable ? 'Favorável' : 'Estourado'}
                      </span>
                    </td>
                  </tr>

                  {/* Totalizador */}
                  <tr className="bg-gray-50/80 font-bold border-t border-black/10">
                    <td className="py-2.5 px-3 font-sans uppercase text-[10px] tracking-wider text-black">Total de Despesas</td>
                    <td className="py-2.5 px-3 text-right text-black">{formatMoney(budget.allocations.totalExpensesBudget)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{formatMoney(budget.reconciliation.budgetToDate.totalExpensesToDate)}</td>
                    <td className="py-2.5 px-3 text-right text-black">{formatMoney(budget.currentActuals.totalExpenses)}</td>
                    <td className="py-2.5 px-3 text-right text-black">{formatMoney(budget.reconciliation.expenseVariance.delta)}</td>
                    <td className={`py-2.5 px-3 text-right ${budget.reconciliation.expenseVariance.isFavorable ? 'text-emerald-700' : 'text-red-600'}`}>
                      {budget.reconciliation.expenseVariance.variancePercent >= 0 ? '+' : ''}{budget.reconciliation.expenseVariance.variancePercent}%
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                        budget.reconciliation.expenseVariance.isFavorable ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {budget.reconciliation.expenseVariance.isFavorable ? 'No Limite' : 'Acima'}
                      </span>
                    </td>
                  </tr>

                </tbody>
              </table>
            </div>
          </div>

          {/* Tabela de Alocações por Linha de Produto */}
          {budget.lineAllocations && budget.lineAllocations.length > 0 && (
            <div className="bg-white border border-black/10 shadow-xs overflow-hidden">
              <div className="p-3 bg-gray-50 border-b border-black/10 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2">
                  <Layers size={14} />
                  Alocação Orçamentária por Linha de Produto
                </h3>
                <span className="text-[10px] font-mono font-bold bg-black/5 px-2 py-0.5 uppercase">
                  Método: {budget.lineAllocationMethod || 'revenue_proportional'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-100/70 border-b border-black/10 text-[9px] font-black uppercase tracking-wider text-gray-600">
                      <th className="py-2.5 px-3">Linha</th>
                      <th className="py-2.5 px-3 text-right">Receita Orçada</th>
                      <th className="py-2.5 px-3 text-right">Mix %</th>
                      <th className="py-2.5 px-3 text-right">COGS Orçado</th>
                      <th className="py-2.5 px-3 text-right">Margem Contribuição</th>
                      <th className="py-2.5 px-3 text-right">Unidades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 font-mono text-[11px]">
                    {budget.lineAllocations.map(la => (
                      <tr key={la.line} className="hover:bg-gray-50/50">
                        <td className="py-2 px-3 font-sans font-bold text-black">{la.line}</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900">{formatMoney(la.targetRevenue)}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{la.targetRevenuePercent}%</td>
                        <td className="py-2 px-3 text-right text-gray-600">{formatMoney(la.targetCogs)}</td>
                        <td className="py-2 px-3 text-right text-emerald-700 font-bold">{formatMoney(la.targetContributionMargin)}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{la.targetUnits} un</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Comparativo com Metas Vinculadas (Multi-Goals) */}
          {budget.reconciliation.budgetVsGoal && budget.reconciliation.budgetVsGoal.length > 0 && (
            <div className="bg-white border border-black/10 shadow-xs overflow-hidden">
              <div className="p-3 bg-gray-50 border-b border-black/10 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2">
                  <Target size={14} />
                  Metas Vinculadas & Reconciliação ({budget.reconciliation.budgetVsGoal.length} {budget.reconciliation.budgetVsGoal.length === 1 ? 'meta' : 'metas'})
                </h3>
                {budget.linkedGoalIds && budget.linkedGoalIds.length > 0 && (
                  <span className="text-[10px] font-mono text-gray-500">
                    IDs: {budget.linkedGoalIds.join(', ')}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-100/70 border-b border-black/10 text-[9px] font-black uppercase tracking-wider text-gray-600">
                      <th className="py-2.5 px-3">Métrica da Meta</th>
                      <th className="py-2.5 px-3 text-right">Alvo da Meta</th>
                      <th className="py-2.5 px-3 text-right">Orçado no Budget</th>
                      <th className="py-2.5 px-3 text-right">Delta</th>
                      <th className="py-2.5 px-3 text-right">Aderência %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 font-mono text-[11px]">
                    {budget.reconciliation.budgetVsGoal.map((gMetric, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="py-2 px-3 font-sans font-bold text-black">{gMetric.metricName || gMetric.metric}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{formatMoney(gMetric.budgeted)}</td>
                        <td className="py-2 px-3 text-right font-bold text-black">{formatMoney(gMetric.realized)}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{formatMoney(gMetric.delta)}</td>
                        <td className={`py-2 px-3 text-right font-bold ${gMetric.delta >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {gMetric.variancePercent >= 0 ? '+' : ''}{gMetric.variancePercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reconciliação Multi-Way & Snapshots */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Snapshot de Baseline Imutável */}
            <div className="bg-white border border-black/10 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-black/10 pb-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  Baseline Histórico Imutável
                </h4>
                <span className="text-[9px] font-mono bg-gray-100 px-2 py-0.5 text-gray-700">
                  v{budget.baselineSnapshot.snapshotVersion}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 bg-gray-50 border border-black/5">
                  <div className="text-[9px] font-sans text-gray-500 uppercase">Período Amostral</div>
                  <div className="font-bold text-gray-900">{budget.baselineSnapshot.sourceStartDate} a {budget.baselineSnapshot.sourceEndDate}</div>
                </div>
                <div className="p-2 bg-gray-50 border border-black/5">
                  <div className="text-[9px] font-sans text-gray-500 uppercase">Pedidos Analisados</div>
                  <div className="font-bold text-gray-900">{budget.baselineSnapshot.sampleOrdersCount} pedidos ({budget.baselineSnapshot.sampleDaysCount} dias)</div>
                </div>
                <div className="p-2 bg-gray-50 border border-black/5">
                  <div className="text-[9px] font-sans text-gray-500 uppercase">Receita Realizada Base</div>
                  <div className="font-bold text-gray-900">{formatMoney(budget.baselineSnapshot.realizedRevenue)}</div>
                </div>
                <div className="p-2 bg-gray-50 border border-black/5">
                  <div className="text-[9px] font-sans text-gray-500 uppercase">Margem Contrib. Base</div>
                  <div className="font-bold text-gray-900">{formatMoney(budget.baselineSnapshot.realizedContributionMargin)}</div>
                </div>
              </div>
            </div>

            {/* Eventos de Auditoria Append-Only */}
            <div className="bg-white border border-black/10 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-black/10 pb-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                  <Clock size={14} />
                  Auditoria Append-Only
                </h4>
                <span className="text-[9px] font-mono text-gray-500">
                  {events.length} registros
                </span>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {events.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">Nenhum evento registrado ainda.</p>
                ) : (
                  events.map(ev => (
                    <div key={ev.id} className="p-2 bg-gray-50 border border-black/5 text-[10px] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black uppercase tracking-widest text-black">{ev.type}</span>
                        <span className="text-gray-500 font-mono">por {ev.performedBy}</span>
                      </div>
                      <span className="text-gray-400 font-mono">
                        {new Date(ev.timestamp).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </>
      )}

      {/* Modal de Criação de Orçamento */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-black max-w-xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-black/10 pb-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-black flex items-center gap-2">
                {isRebudgetMode ? <GitBranch size={16} className="text-blue-600" /> : <Plus size={16} />}
                {isRebudgetMode ? 'Revisar Orçamento (Rebudgeting)' : 'Criar Novo Orçamento Comercial'}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-black font-mono font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 mb-1">
                  Título do Orçamento
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Ex: Orçamento Comercial Q4 2026"
                  required
                  className="w-full bg-gray-50 border border-black/20 p-2 text-xs font-bold text-black focus:outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 mb-1">
                    Período
                  </label>
                  <select
                    value={newPeriod}
                    onChange={e => setNewPeriod(e.target.value as BudgetPeriod)}
                    className="w-full bg-gray-50 border border-black/20 p-2 text-xs font-bold text-black focus:outline-none focus:border-black cursor-pointer"
                  >
                    <option value="monthly">Mensal</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="yearly">Anual</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 mb-1">
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={e => setNewStartDate(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-black/20 p-2 text-xs font-bold text-black focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 mb-1">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={e => setNewEndDate(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-black/20 p-2 text-xs font-bold text-black focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 mb-1">
                  Meta de Receita Líquida (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newTargetRevenue}
                  onChange={e => setNewTargetRevenue(Number(e.target.value))}
                  required
                  className="w-full bg-gray-50 border border-black/20 p-2 text-xs font-bold font-mono text-black focus:outline-none focus:border-black"
                />
              </div>

              {/* Alocações */}
              <div className="p-3 bg-gray-50 border border-black/10 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-black">
                  Teto de Despesas por Linha (Alocações)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-600 mb-1">COGS (Custo Mercadorias)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newCogsBudget}
                      onChange={e => setNewCogsBudget(Number(e.target.value))}
                      className="w-full bg-white border border-black/10 p-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-600 mb-1">Tráfego Pago & Marketing</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newTrafficBudget}
                      onChange={e => setNewTrafficBudget(Number(e.target.value))}
                      className="w-full bg-white border border-black/10 p-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-600 mb-1">Despesas Fixas</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newFixedBudget}
                      onChange={e => setNewFixedBudget(Number(e.target.value))}
                      className="w-full bg-white border border-black/10 p-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-600 mb-1">Despesas Variáveis Administrativas</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newVariableBudget}
                      onChange={e => setNewVariableBudget(Number(e.target.value))}
                      className="w-full bg-white border border-black/10 p-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-600 mb-1">Subsídio de Frete</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newShippingBudget}
                      onChange={e => setNewShippingBudget(Number(e.target.value))}
                      className="w-full bg-white border border-black/10 p-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-600 mb-1">Taxas de Gateway</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newGatewayBudget}
                      onChange={e => setNewGatewayBudget(Number(e.target.value))}
                      className="w-full bg-white border border-black/10 p-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Multi-Select de Metas Vinculadas (linkedGoalIds) */}
              <div className="p-3 bg-gray-50 border border-black/10 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-black flex items-center justify-between">
                  <span>Vincular a Metas Comerciais ({newLinkedGoalIds.length} selecionadas)</span>
                  <span className="text-[9px] text-gray-500 font-mono">Multi-Select</span>
                </div>
                {goals.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Nenhuma meta cadastrada no sistema.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {goals.map(g => {
                      const isChecked = newLinkedGoalIds.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className={`flex items-center gap-2 p-1.5 text-[11px] border cursor-pointer select-none transition-colors ${
                            isChecked
                              ? 'bg-black text-[#eab308] border-black'
                              : 'bg-white text-gray-800 border-black/10 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setNewLinkedGoalIds(newLinkedGoalIds.filter(id => id !== g.id));
                              } else {
                                setNewLinkedGoalIds([...newLinkedGoalIds, g.id]);
                              }
                            }}
                          />
                          <span className="font-bold truncate">{g.title || g.type}</span>
                          <span className="text-[9px] opacity-75 font-mono ml-auto">{formatMoney(g.targetValue)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Método de Alocação por Linha de Produto */}
              <div className="p-3 bg-gray-50 border border-black/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-black uppercase tracking-wider text-black">
                    Método de Alocação por Linha de Produto
                  </div>
                  <select
                    value={newLineAllocationMethod}
                    onChange={e => setNewLineAllocationMethod(e.target.value as LineAllocationMethod)}
                    className="bg-white border border-black/20 text-xs font-bold text-black p-1 focus:outline-none"
                  >
                    <option value="revenue_proportional">Proporcional à Receita (Automático)</option>
                    <option value="manual">Manual (Definir por Linha)</option>
                    <option value="historical_mix">Mix Histórico de Vendas</option>
                    <option value="equal_split">Divisão Igualitária</option>
                  </select>
                </div>

                {newLineAllocationMethod === 'manual' && (
                  <div className="space-y-2 pt-2 border-t border-black/10">
                    <div className="text-[9px] font-black uppercase text-gray-600 grid grid-cols-5 gap-1 text-center">
                      <span className="text-left">Linha</span>
                      <span>Receita (R$)</span>
                      <span>COGS (R$)</span>
                      <span>Margem (R$)</span>
                      <span>Unidades</span>
                    </div>
                    {['FORCE', 'MARK', 'PRIME', 'OTHER'].map(lineKey => (
                      <div key={lineKey} className="grid grid-cols-5 gap-1 items-center text-xs">
                        <span className="font-bold text-black">{lineKey}</span>
                        <input
                          type="number"
                          placeholder="Receita"
                          value={manualLinesInput[lineKey]?.revenue || ''}
                          onChange={e =>
                            setManualLinesInput({
                              ...manualLinesInput,
                              [lineKey]: {
                                ...manualLinesInput[lineKey],
                                revenue: Number(e.target.value)
                              }
                            })
                          }
                          className="bg-white border border-black/10 p-1 text-right font-mono text-[11px]"
                        />
                        <input
                          type="number"
                          placeholder="COGS"
                          value={manualLinesInput[lineKey]?.cogs || ''}
                          onChange={e =>
                            setManualLinesInput({
                              ...manualLinesInput,
                              [lineKey]: {
                                ...manualLinesInput[lineKey],
                                cogs: Number(e.target.value)
                              }
                            })
                          }
                          className="bg-white border border-black/10 p-1 text-right font-mono text-[11px]"
                        />
                        <input
                          type="number"
                          placeholder="Margem"
                          value={manualLinesInput[lineKey]?.cm || ''}
                          onChange={e =>
                            setManualLinesInput({
                              ...manualLinesInput,
                              [lineKey]: {
                                ...manualLinesInput[lineKey],
                                cm: Number(e.target.value)
                              }
                            })
                          }
                          className="bg-white border border-black/10 p-1 text-right font-mono text-[11px]"
                        />
                        <input
                          type="number"
                          placeholder="Unidades"
                          value={manualLinesInput[lineKey]?.units || ''}
                          onChange={e =>
                            setManualLinesInput({
                              ...manualLinesInput,
                              [lineKey]: {
                                ...manualLinesInput[lineKey],
                                units: Number(e.target.value)
                              }
                            })
                          }
                          className="bg-white border border-black/10 p-1 text-right font-mono text-[11px]"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Guardrails */}
              <div className="p-3 bg-gray-50 border border-black/10 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-black">
                  Guardrails de Governança Financeira
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-600 mb-1">Máximo Tráfego % da Receita</label>
                    <input
                      type="number"
                      step="1"
                      value={maxTrafficPercent}
                      onChange={e => setMaxTrafficPercent(Number(e.target.value))}
                      className="w-full bg-white border border-black/10 p-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-600 mb-1">Mínimo Margem Contribuição %</label>
                    <input
                      type="number"
                      step="1"
                      value={minMarginPercent}
                      onChange={e => setMinMarginPercent(Number(e.target.value))}
                      className="w-full bg-white border border-black/10 p-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-black cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-black text-[#eab308] hover:bg-black/90 transition-colors cursor-pointer"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Orçamento'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};

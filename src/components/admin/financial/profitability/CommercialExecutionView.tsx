import React, { useState, useEffect, useMemo } from 'react';
import { 
  Briefcase, 
  Calendar, 
  Target, 
  TrendingUp, 
  ShieldCheck, 
  AlertTriangle, 
  AlertOctagon, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Play, 
  RotateCcw, 
  Layers, 
  Sparkles, 
  Filter, 
  ArrowUpRight, 
  User, 
  RefreshCw, 
  Ban, 
  Activity,
  CheckCircle,
  TrendingDown,
  Info
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { 
  CommercialExecutionCycle, 
  CommercialExecutionDashboard, 
  CommercialExecutionActionItem,
  CommercialActionPriority,
  CommercialActionExecutionStatus,
  CommercialProductLine
} from '../../../../types/commercialExecution';
import { commercialExecutionService } from '../../../../services/commercial/commercialExecutionService';
import { CommercialExecutionActionDrawer } from './CommercialExecutionActionDrawer';

interface CommercialExecutionViewProps {
  rawOrders?: any[];
  expenses?: any[];
  investments?: any[];
  traffic?: any[];
  productCatalog?: any[];
}

export const CommercialExecutionView: React.FC<CommercialExecutionViewProps> = ({
  rawOrders = [],
  expenses = [],
  investments = [],
  traffic = [],
  productCatalog = []
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  const [cycles, setCycles] = useState<CommercialExecutionCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<CommercialExecutionDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  // Filtros de Ações
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [lineFilter, setLineFilter] = useState<string>('ALL');
  const [ownerFilter, setOwnerFilter] = useState<string>('ALL');

  // Drawer de Ação
  const [selectedAction, setSelectedAction] = useState<CommercialExecutionActionItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Modais de Criação
  const [showCreateCycleModal, setShowCreateCycleModal] = useState(false);
  const [newCycleTitle, setNewCycleTitle] = useState('');
  const [newCycleStart, setNewCycleStart] = useState('');
  const [newCycleEnd, setNewCycleEnd] = useState('');
  const [newCycleBudgetId, setNewCycleBudgetId] = useState('');
  const [newCycleGoalIds, setNewCycleGoalIds] = useState<string[]>([]);
  const [newCycleForecastId, setNewCycleForecastId] = useState<string>('');
  const [availableBudgets, setAvailableBudgets] = useState<any[]>([]);
  const [availableGoals, setAvailableGoals] = useState<any[]>([]);
  const [availableForecasts, setAvailableForecasts] = useState<any[]>([]);

  const [showAddActionModal, setShowAddActionModal] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionDescription, setNewActionDescription] = useState('');
  const [newActionPriority, setNewActionPriority] = useState<CommercialActionPriority>('medium');
  const [newActionLine, setNewActionLine] = useState<CommercialProductLine>('ALL');
  const [newActionOwner, setNewActionOwner] = useState('');
  const [newActionStart, setNewActionStart] = useState('');
  const [newActionEnd, setNewActionEnd] = useState('');
  const [newActionRevenueImpact, setNewActionRevenueImpact] = useState<number | ''>('');
  const [newActionMarginImpact, setNewActionMarginImpact] = useState<number | ''>('');

  // 1. Carregar Ciclos e Budgets
  const fetchCycles = async () => {
    try {
      setLoading(true);
      const fetchedCycles = await commercialExecutionService.getExecutionCycles();
      setCycles(fetchedCycles);

      // Buscar budgets disponíveis para seleção
      const [bRes, gRes, fRes] = await Promise.all([
        fetch('/api/admin/commercial/budgets'),
        fetch('/api/admin/commercial/goals'),
        fetch('/api/admin/commercial/forecasts')
      ]);

      if (bRes.ok) {
        const bData = await bRes.json();
        setAvailableBudgets(bData.budgets || []);
      }
      if (gRes.ok) {
        const gData = await gRes.json();
        setAvailableGoals(gData.goals || []);
      }
      if (fRes.ok) {
        const fData = await fRes.json();
        setAvailableForecasts(fData.forecasts || []);
      }

      if (fetchedCycles.length > 0) {
        // Preferir o primeiro ativo, senão o mais recente
        const activeCycle = fetchedCycles.find(c => c.status === 'active') || fetchedCycles[0];
        setSelectedCycleId(activeCycle.id);
      }
    } catch (err: any) {
      console.error('[CommercialExecutionView] Erro ao listar ciclos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCycles();
  }, []);

  // 2. Carregar Dashboard do Ciclo Selecionado
  const fetchDashboard = async (cycleId: string) => {
    try {
      setRecalculating(true);
      const dash = await commercialExecutionService.getExecutionDashboard(cycleId);
      setDashboard(dash);
    } catch (err: any) {
      console.error('[CommercialExecutionView] Erro ao carregar dashboard:', err);
    } finally {
      setRecalculating(false);
    }
  };

  useEffect(() => {
    if (selectedCycleId) {
      fetchDashboard(selectedCycleId);
    }
  }, [selectedCycleId]);

  // Ações filtradas para visualização Kanban ou Tabela
  const filteredActions = useMemo(() => {
    if (!dashboard?.actions) return [];
    return dashboard.actions.filter(a => {
      if (statusFilter !== 'ALL' && a.executionStatus !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && a.priority !== priorityFilter) return false;
      if (lineFilter !== 'ALL' && (a.productLine || 'ALL') !== lineFilter) return false;
      if (ownerFilter !== 'ALL' && (a.ownerName || 'Não atribuído') !== ownerFilter) return false;
      return true;
    });
  }, [dashboard?.actions, statusFilter, priorityFilter, lineFilter, ownerFilter]);

  // Responsáveis únicos para filtro
  const uniqueOwners = useMemo(() => {
    if (!dashboard?.actions) return [];
    const set = new Set<string>();
    dashboard.actions.forEach(a => {
      if (a.ownerName) set.add(a.ownerName);
    });
    return Array.from(set);
  }, [dashboard?.actions]);

  // Ações por Coluna Kanban
  const kanbanColumns = useMemo(() => {
    const planned = filteredActions.filter(a => a.executionStatus === 'planned');
    const ready = filteredActions.filter(a => a.executionStatus === 'ready');
    const inProgress = filteredActions.filter(a => a.executionStatus === 'in_progress');
    const blocked = filteredActions.filter(a => a.executionStatus === 'blocked');
    const completed = filteredActions.filter(a => a.executionStatus === 'completed');
    return { planned, ready, inProgress, blocked, completed };
  }, [filteredActions]);

  // Operações de Ciclo (Ativar, Concluir, Arquivar)
  const handleActivateCycle = async () => {
    if (!selectedCycleId) return;
    if (!confirm('Deseja ativar este Ciclo de Execução? Isso congelará os snapshots do Budget e das Metas.')) return;
    try {
      setLoading(true);
      await commercialExecutionService.activateExecutionCycle(selectedCycleId);
      await fetchCycles();
      await fetchDashboard(selectedCycleId);
    } catch (err: any) {
      alert(err.message || 'Erro ao ativar ciclo');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteCycle = async () => {
    if (!selectedCycleId) return;
    if (!confirm('Deseja concluir este Ciclo de Execução?')) return;
    try {
      setLoading(true);
      await commercialExecutionService.completeExecutionCycle(selectedCycleId);
      await fetchCycles();
      await fetchDashboard(selectedCycleId);
    } catch (err: any) {
      alert(err.message || 'Erro ao concluir ciclo');
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveCycle = async () => {
    if (!selectedCycleId) return;
    if (!confirm('Deseja arquivar este Ciclo de Execução?')) return;
    try {
      setLoading(true);
      await commercialExecutionService.archiveExecutionCycle(selectedCycleId);
      await fetchCycles();
      await fetchDashboard(selectedCycleId);
    } catch (err: any) {
      alert(err.message || 'Erro ao arquivar ciclo');
    } finally {
      setLoading(false);
    }
  };

  // Criar Ciclo
  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCycleTitle || !newCycleStart || !newCycleEnd || !newCycleBudgetId) {
      alert('Preencha todos os campos obrigatórios do ciclo.');
      return;
    }
    try {
      setLoading(true);
      const created = await commercialExecutionService.createExecutionCycle({
        title: newCycleTitle.trim(),
        periodStart: newCycleStart,
        periodEnd: newCycleEnd,
        budgetId: newCycleBudgetId,
        linkedGoalIds: newCycleGoalIds.length > 0 ? newCycleGoalIds : undefined,
        linkedForecastId: newCycleForecastId || undefined
      });
      setShowCreateCycleModal(false);
      setNewCycleTitle('');
      setNewCycleGoalIds([]);
      setNewCycleForecastId('');
      await fetchCycles();
      setSelectedCycleId(created.id);
    } catch (err: any) {
      alert(err.message || 'Erro ao criar ciclo');
    } finally {
      setLoading(false);
    }
  };

  // Adicionar Ação
  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCycleId || !newActionTitle || !newActionStart || !newActionEnd) {
      alert('Preencha os campos obrigatórios da ação.');
      return;
    }
    try {
      setLoading(true);
      await commercialExecutionService.addActionToCycle(selectedCycleId, {
        title: newActionTitle.trim(),
        description: newActionDescription.trim(),
        priority: newActionPriority,
        productLine: newActionLine,
        ownerName: newActionOwner.trim() || undefined,
        plannedStartDate: newActionStart,
        plannedEndDate: newActionEnd,
        expectedImpact: (newActionRevenueImpact !== '' || newActionMarginImpact !== '') ? {
          revenueImpact: newActionRevenueImpact !== '' ? Number(newActionRevenueImpact) : undefined,
          contributionMarginImpact: newActionMarginImpact !== '' ? Number(newActionMarginImpact) : undefined
        } : undefined
      });
      setShowAddActionModal(false);
      setNewActionTitle('');
      setNewActionDescription('');
      setNewActionOwner('');
      await fetchDashboard(selectedCycleId);
    } catch (err: any) {
      alert(err.message || 'Erro ao adicionar ação');
    } finally {
      setLoading(false);
    }
  };

  // Drawer Handler Actions
  const handleOpenActionDrawer = (action: CommercialExecutionActionItem) => {
    setSelectedAction(action);
    setIsDrawerOpen(true);
  };

  const handleReadyAction = async (actionId: string) => {
    if (!selectedCycleId) return;
    const updated = await commercialExecutionService.readyAction(selectedCycleId, actionId);
    setSelectedAction(updated);
    await fetchDashboard(selectedCycleId);
  };

  const handleStartAction = async (actionId: string) => {
    if (!selectedCycleId) return;
    const updated = await commercialExecutionService.startAction(selectedCycleId, actionId);
    setSelectedAction(updated);
    await fetchDashboard(selectedCycleId);
  };

  const handleBlockAction = async (actionId: string, reason: string) => {
    if (!selectedCycleId) return;
    const updated = await commercialExecutionService.blockAction(selectedCycleId, actionId, reason);
    setSelectedAction(updated);
    await fetchDashboard(selectedCycleId);
  };

  const handleUnblockAction = async (actionId: string) => {
    if (!selectedCycleId) return;
    const updated = await commercialExecutionService.unblockAction(selectedCycleId, actionId);
    setSelectedAction(updated);
    await fetchDashboard(selectedCycleId);
  };

  const handleCompleteAction = async (actionId: string, notes?: string) => {
    if (!selectedCycleId) return;
    const updated = await commercialExecutionService.completeAction(selectedCycleId, actionId, { executionNotes: notes });
    setSelectedAction(updated);
    await fetchDashboard(selectedCycleId);
  };

  const handleCancelAction = async (actionId: string, reason?: string) => {
    if (!selectedCycleId) return;
    const updated = await commercialExecutionService.cancelAction(selectedCycleId, actionId, reason);
    setSelectedAction(updated);
    await fetchDashboard(selectedCycleId);
  };

  const handleRecalculateImpact = async (actionId: string) => {
    if (!selectedCycleId) return;
    const updated = await commercialExecutionService.recalculateActionImpact(selectedCycleId, actionId);
    setSelectedAction(updated);
    await fetchDashboard(selectedCycleId);
  };

  if (loading && cycles.length === 0) {
    return (
      <div className="p-12 text-center bg-white border border-black/10 shadow-xs space-y-3">
        <RefreshCw className="animate-spin text-[#eab308] mx-auto" size={28} />
        <p className="text-xs font-black uppercase tracking-widest text-black">
          Carregando Motor de Execução Comercial 9.6.7...
        </p>
      </div>
    );
  }

  const currentCycle = dashboard?.cycle;
  const progress = dashboard?.progress;
  const health = dashboard?.health;
  const budgetExec = dashboard?.budgetExecution;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* 1. Barra de Cabeçalho e Seleção de Ciclo */}
      <div className="bg-white border border-black/10 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="text-[9px] font-mono font-bold text-gray-500 uppercase block">Ciclo Operacional</span>
            <select
              value={selectedCycleId || ''}
              onChange={(e) => setSelectedCycleId(e.target.value)}
              className="bg-gray-50 border border-black/20 text-xs font-black uppercase px-3 py-1.5 focus:outline-hidden focus:border-black"
            >
              {cycles.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.status.toUpperCase()} — {c.periodStart} até {c.periodEnd})
                </option>
              ))}
            </select>
          </div>

          {currentCycle && (
            <div className="flex items-center gap-2 pt-3 md:pt-0">
              <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border ${
                currentCycle.status === 'active' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                currentCycle.status === 'draft' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                currentCycle.status === 'completed' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                'bg-gray-100 text-gray-700 border-gray-300'
              }`}>
                STATUS: {currentCycle.status}
              </span>

              {health && (
                <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                  health.status === 'healthy' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                  health.status === 'attention' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                  health.status === 'critical' ? 'bg-red-50 text-red-800 border-red-300' :
                  'bg-gray-50 text-gray-700 border-gray-300'
                }`}>
                  <Activity size={11} />
                  SAÚDE: {health.status}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Ações do Ciclo */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              // Preencher datas padrão para novo ciclo
              const today = new Date();
              const y = today.getFullYear();
              const m = String(today.getMonth() + 1).padStart(2, '0');
              setNewCycleTitle(`Ciclo Comercial — ${m}/${y}`);
              setNewCycleStart(`${y}-${m}-01`);
              const lastDay = new Date(y, today.getMonth() + 1, 0).getDate();
              setNewCycleEnd(`${y}-${m}-${lastDay}`);
              if (availableBudgets.length > 0) setNewCycleBudgetId(availableBudgets[0].id);
              setShowCreateCycleModal(true);
            }}
            className="px-3 py-1.5 bg-black text-[#eab308] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-neutral-800"
          >
            <Plus size={13} /> Novo Ciclo
          </button>

          {currentCycle?.status === 'draft' && (
            <button
              onClick={handleActivateCycle}
              className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-emerald-700"
            >
              <Play size={12} /> Ativar Ciclo
            </button>
          )}

          {currentCycle?.status === 'active' && (
            <button
              onClick={handleCompleteCycle}
              className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-blue-700"
            >
              <CheckCircle2 size={12} /> Concluir Ciclo
            </button>
          )}

          {currentCycle && currentCycle.status !== 'archived' && (
            <button
              onClick={handleArchiveCycle}
              className="px-2.5 py-1.5 bg-gray-100 text-gray-700 border border-gray-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:bg-gray-200"
            >
              <Ban size={11} /> Arquivar
            </button>
          )}

          <button
            onClick={() => selectedCycleId && fetchDashboard(selectedCycleId)}
            disabled={recalculating}
            className="p-1.5 border border-black/10 text-gray-700 hover:text-black hover:bg-gray-100 cursor-pointer"
            title="Atualizar Dados"
          >
            <RefreshCw size={14} className={recalculating ? 'animate-spin text-amber-600' : ''} />
          </button>
        </div>
      </div>

      {/* 2. KPIs de Reconciliação Temporal Canônica (Budget vs Actual vs Expected vs Forecast vs Goal) */}
      {budgetExec && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          
          {/* Receita */}
          <div className="bg-white border border-black/10 p-3.5 shadow-xs space-y-2">
            <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 uppercase">
              <span>1. Receita Líquida</span>
              <span className="font-bold text-black">{budgetExec.timeProgressPercent}% tempo</span>
            </div>
            <div className="text-lg font-black text-black font-mono">
              {formatMoney(budgetExec.revenue.actualToDate)}
            </div>
            <div className="space-y-1 font-mono text-[10px] border-t border-black/5 pt-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Ritmo Esperado:</span>
                <span className="font-bold text-gray-800">{formatMoney(budgetExec.revenue.expectedToDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">vs Ritmo:</span>
                <span className={`font-bold ${budgetExec.revenue.varianceToExpected >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {budgetExec.revenue.varianceToExpected >= 0 ? '+' : ''}{formatMoney(budgetExec.revenue.varianceToExpected)} ({budgetExec.revenue.varianceToExpectedPercent}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Budget Alvo:</span>
                <span className="text-gray-700">{formatMoney(budgetExec.revenue.budgetTarget)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Forecast:</span>
                <span className="text-gray-700">{formatMoney(budgetExec.revenue.forecast)}</span>
              </div>
            </div>
          </div>

          {/* Margem de Contribuição */}
          <div className="bg-white border border-black/10 p-3.5 shadow-xs space-y-2">
            <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 uppercase">
              <span>2. Margem Contribuição</span>
              <TrendingUp size={12} className="text-emerald-600" />
            </div>
            <div className="text-lg font-black text-black font-mono">
              {formatMoney(budgetExec.contributionMargin.actualToDate)}
            </div>
            <div className="space-y-1 font-mono text-[10px] border-t border-black/5 pt-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Ritmo Esperado:</span>
                <span className="font-bold text-gray-800">{formatMoney(budgetExec.contributionMargin.expectedToDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">vs Ritmo:</span>
                <span className={`font-bold ${budgetExec.contributionMargin.varianceToExpected >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {budgetExec.contributionMargin.varianceToExpected >= 0 ? '+' : ''}{formatMoney(budgetExec.contributionMargin.varianceToExpected)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Budget Alvo:</span>
                <span className="text-gray-700">{formatMoney(budgetExec.contributionMargin.budgetTarget)}</span>
              </div>
            </div>
          </div>

          {/* Lucro Operacional */}
          <div className="bg-white border border-black/10 p-3.5 shadow-xs space-y-2">
            <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 uppercase">
              <span>3. Lucro Operacional</span>
              <ShieldCheck size={12} className="text-emerald-600" />
            </div>
            <div className="text-lg font-black text-black font-mono">
              {formatMoney(budgetExec.operatingProfit.actualToDate)}
            </div>
            <div className="space-y-1 font-mono text-[10px] border-t border-black/5 pt-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Ritmo Esperado:</span>
                <span className="font-bold text-gray-800">{formatMoney(budgetExec.operatingProfit.expectedToDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Budget Alvo:</span>
                <span className="text-gray-700">{formatMoney(budgetExec.operatingProfit.budgetTarget)}</span>
              </div>
            </div>
          </div>

          {/* Unidades */}
          <div className="bg-white border border-black/10 p-3.5 shadow-xs space-y-2">
            <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 uppercase">
              <span>4. Unidades Vendidas</span>
              <Layers size={12} className="text-blue-600" />
            </div>
            <div className="text-lg font-black text-black font-mono">
              {budgetExec.units.actualToDate} un
            </div>
            <div className="space-y-1 font-mono text-[10px] border-t border-black/5 pt-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Ritmo Esperado:</span>
                <span className="font-bold text-gray-800">{budgetExec.units.expectedToDate} un</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Budget Alvo:</span>
                <span className="text-gray-700">{budgetExec.units.budgetTarget} un</span>
              </div>
            </div>
          </div>

          {/* Progresso do Plano de Ações */}
          <div className="bg-white border border-black/10 p-3.5 shadow-xs space-y-2">
            <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 uppercase">
              <span>5. Execução do Plano</span>
              <Target size={12} className="text-amber-600" />
            </div>
            <div className="text-lg font-black text-black font-mono">
              {progress?.completionPercent || 0}%
            </div>
            <div className="space-y-1 font-mono text-[10px] border-t border-black/5 pt-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Concluídas:</span>
                <span className="font-bold text-emerald-600">{progress?.completedActions || 0} de {progress?.totalActions || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Bloqueadas:</span>
                <span className={`font-bold ${(progress?.blockedActions || 0) > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                  {progress?.blockedActions || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Atrasadas:</span>
                <span className={`font-bold ${(progress?.overdueActions || 0) > 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                  {progress?.overdueActions || 0}
                </span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 3. Alertas Operacionais Canônicos */}
      {dashboard?.alerts && dashboard.alerts.length > 0 && (
        <div className="bg-white border border-black/10 p-4 shadow-xs space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-amber-600" /> Alertas Operacionais de Execução ({dashboard.alerts.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {dashboard.alerts.map((al, idx) => (
              <div 
                key={idx} 
                className={`p-2.5 border text-xs space-y-1 ${
                  al.severity === 'critical' ? 'bg-red-50 border-red-300 text-red-950' :
                  al.severity === 'high' ? 'bg-orange-50 border-orange-300 text-orange-950' :
                  'bg-yellow-50 border-yellow-300 text-yellow-950'
                }`}
              >
                <div className="flex items-center justify-between font-black uppercase text-[10px]">
                  <span>{al.title}</span>
                  <span className="px-1.5 py-0.2 bg-white/80 border text-[8px] font-mono">{al.code}</span>
                </div>
                <p className="text-[11px] leading-tight text-gray-800">{al.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Barra de Filtros e Adição de Ação */}
      <div className="bg-white border border-black/10 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[9px] font-mono font-bold text-gray-500 uppercase flex items-center gap-1">
            <Filter size={11} /> Filtros:
          </span>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-50 border border-black/10 text-[10px] font-bold uppercase px-2 py-1"
          >
            <option value="ALL">Status: Todos</option>
            <option value="planned">1. Planejados</option>
            <option value="ready">2. Prontos</option>
            <option value="in_progress">3. Em Andamento</option>
            <option value="blocked">Bloqueados</option>
            <option value="completed">Concluídos</option>
            <option value="cancelled">Cancelados</option>
          </select>

          {/* Prioridade */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-gray-50 border border-black/10 text-[10px] font-bold uppercase px-2 py-1"
          >
            <option value="ALL">Prioridade: Todas</option>
            <option value="critical">Crítica</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>

          {/* Linha */}
          <select
            value={lineFilter}
            onChange={(e) => setLineFilter(e.target.value)}
            className="bg-gray-50 border border-black/10 text-[10px] font-bold uppercase px-2 py-1"
          >
            <option value="ALL">Linha: Todas</option>
            <option value="FORCE">FORCE</option>
            <option value="MARK">MARK</option>
            <option value="PRIME">PRIME</option>
            <option value="OTHER">OTHER</option>
          </select>

          {/* Responsável */}
          {uniqueOwners.length > 0 && (
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="bg-gray-50 border border-black/10 text-[10px] font-bold uppercase px-2 py-1"
            >
              <option value="ALL">Responsável: Todos</option>
              {uniqueOwners.map(ow => (
                <option key={ow} value={ow}>{ow}</option>
              ))}
            </select>
          )}
        </div>

        {/* Botão Adicionar Ação */}
        {currentCycle?.status !== 'completed' && currentCycle?.status !== 'archived' && (
          <button
            onClick={() => {
              const today = new Date();
              const y = today.getFullYear();
              const m = String(today.getMonth() + 1).padStart(2, '0');
              const d = String(today.getDate()).padStart(2, '0');
              setNewActionStart(`${y}-${m}-${d}`);
              const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
              const ny = nextWeek.getFullYear();
              const nm = String(nextWeek.getMonth() + 1).padStart(2, '0');
              const nd = String(nextWeek.getDate()).padStart(2, '0');
              setNewActionEnd(`${ny}-${nm}-${nd}`);
              setShowAddActionModal(true);
            }}
            className="px-3 py-1.5 bg-black text-[#eab308] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-neutral-800"
          >
            <Plus size={13} /> Adicionar Ação ao Plano
          </button>
        )}
      </div>

      {/* 5. Kanban de Execução Comercial */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        
        {/* Coluna 1: Planejado */}
        <div className="bg-gray-50/70 border border-black/10 p-3 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-black/10">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-700">1. Planejado</span>
            <span className="px-1.5 py-0.2 bg-gray-200 text-gray-800 text-[9px] font-mono font-bold">
              {kanbanColumns.planned.length}
            </span>
          </div>
          <div className="space-y-2">
            {kanbanColumns.planned.map(a => (
              <div 
                key={a.id} 
                onClick={() => handleOpenActionDrawer(a)}
                className="p-2.5 bg-white border border-black/10 hover:border-black cursor-pointer shadow-2xs space-y-1.5 transition-all"
              >
                <div className="flex items-center justify-between text-[9px]">
                  <span className={`px-1.5 py-0.2 font-black uppercase text-white ${
                    a.priority === 'critical' ? 'bg-red-600' :
                    a.priority === 'high' ? 'bg-orange-500' :
                    a.priority === 'medium' ? 'bg-amber-500 text-black' : 'bg-gray-400'
                  }`}>
                    {a.priority}
                  </span>
                  <span className="font-mono text-gray-500">{a.productLine || 'ALL'}</span>
                </div>
                <h4 className="font-bold text-xs text-black leading-snug">{a.title}</h4>
                <div className="flex items-center justify-between text-[9px] text-gray-500 pt-1 border-t border-black/5 font-mono">
                  <span>{a.ownerName || 'Sem responsável'}</span>
                  <span>{a.plannedEndDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna 2: Pronto */}
        <div className="bg-blue-50/40 border border-blue-200 p-3 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-blue-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-900">2. Pronto</span>
            <span className="px-1.5 py-0.2 bg-blue-200 text-blue-900 text-[9px] font-mono font-bold">
              {kanbanColumns.ready.length}
            </span>
          </div>
          <div className="space-y-2">
            {kanbanColumns.ready.map(a => (
              <div 
                key={a.id} 
                onClick={() => handleOpenActionDrawer(a)}
                className="p-2.5 bg-white border border-blue-300 hover:border-black cursor-pointer shadow-2xs space-y-1.5 transition-all"
              >
                <div className="flex items-center justify-between text-[9px]">
                  <span className={`px-1.5 py-0.2 font-black uppercase text-white ${
                    a.priority === 'critical' ? 'bg-red-600' :
                    a.priority === 'high' ? 'bg-orange-500' :
                    a.priority === 'medium' ? 'bg-amber-500 text-black' : 'bg-gray-400'
                  }`}>
                    {a.priority}
                  </span>
                  <span className="font-mono text-gray-500">{a.productLine || 'ALL'}</span>
                </div>
                <h4 className="font-bold text-xs text-black leading-snug">{a.title}</h4>
                <div className="flex items-center justify-between text-[9px] text-gray-500 pt-1 border-t border-black/5 font-mono">
                  <span>{a.ownerName || 'Sem responsável'}</span>
                  <span>{a.plannedEndDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna 3: Em Andamento */}
        <div className="bg-amber-50/50 border border-amber-200 p-3 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-amber-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">3. Em Andamento</span>
            <span className="px-1.5 py-0.2 bg-amber-200 text-amber-900 text-[9px] font-mono font-bold">
              {kanbanColumns.inProgress.length}
            </span>
          </div>
          <div className="space-y-2">
            {kanbanColumns.inProgress.map(a => (
              <div 
                key={a.id} 
                onClick={() => handleOpenActionDrawer(a)}
                className="p-2.5 bg-white border border-amber-300 hover:border-black cursor-pointer shadow-2xs space-y-1.5 transition-all"
              >
                <div className="flex items-center justify-between text-[9px]">
                  <span className={`px-1.5 py-0.2 font-black uppercase text-white ${
                    a.priority === 'critical' ? 'bg-red-600' :
                    a.priority === 'high' ? 'bg-orange-500' :
                    a.priority === 'medium' ? 'bg-amber-500 text-black' : 'bg-gray-400'
                  }`}>
                    {a.priority}
                  </span>
                  <span className="font-mono text-gray-500">{a.productLine || 'ALL'}</span>
                </div>
                <h4 className="font-bold text-xs text-black leading-snug">{a.title}</h4>
                <div className="flex items-center justify-between text-[9px] text-gray-500 pt-1 border-t border-black/5 font-mono">
                  <span>{a.ownerName || 'Sem responsável'}</span>
                  <span className="font-bold text-amber-700">{a.plannedEndDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna 4: Bloqueado */}
        <div className="bg-red-50/50 border border-red-200 p-3 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-red-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-red-900 flex items-center gap-1">
              <AlertOctagon size={12} /> Bloqueado
            </span>
            <span className="px-1.5 py-0.2 bg-red-200 text-red-900 text-[9px] font-mono font-bold">
              {kanbanColumns.blocked.length}
            </span>
          </div>
          <div className="space-y-2">
            {kanbanColumns.blocked.map(a => (
              <div 
                key={a.id} 
                onClick={() => handleOpenActionDrawer(a)}
                className="p-2.5 bg-white border-2 border-red-400 hover:border-red-600 cursor-pointer shadow-2xs space-y-1.5 transition-all"
              >
                <div className="flex items-center justify-between text-[9px]">
                  <span className="px-1.5 py-0.2 font-black uppercase text-white bg-red-600">
                    BLOQUEADO
                  </span>
                  <span className="font-mono text-gray-500">{a.productLine || 'ALL'}</span>
                </div>
                <h4 className="font-bold text-xs text-red-950 leading-snug">{a.title}</h4>
                <p className="text-[10px] text-red-700 italic line-clamp-2">
                  {a.blockingReason || 'Sem motivo detalhado.'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna 5: Concluído */}
        <div className="bg-emerald-50/50 border border-emerald-200 p-3 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1">
              <CheckCircle2 size={12} /> Concluído
            </span>
            <span className="px-1.5 py-0.2 bg-emerald-200 text-emerald-900 text-[9px] font-mono font-bold">
              {kanbanColumns.completed.length}
            </span>
          </div>
          <div className="space-y-2">
            {kanbanColumns.completed.map(a => (
              <div 
                key={a.id} 
                onClick={() => handleOpenActionDrawer(a)}
                className="p-2.5 bg-white border border-emerald-300 hover:border-black cursor-pointer shadow-2xs space-y-1.5 transition-all"
              >
                <div className="flex items-center justify-between text-[9px]">
                  <span className="px-1.5 py-0.2 font-black uppercase text-white bg-emerald-600">
                    100% OK
                  </span>
                  <span className="font-mono text-gray-500">{a.productLine || 'ALL'}</span>
                </div>
                <h4 className="font-bold text-xs text-gray-800 leading-snug">{a.title}</h4>
                <div className="flex items-center justify-between text-[9px] text-gray-500 pt-1 border-t border-black/5 font-mono">
                  <span>{a.ownerName || 'Sem responsável'}</span>
                  <span className="text-emerald-700 font-bold">Concluída</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 6. Linhas de Produtos & Performance 9.6.2 */}
      {dashboard?.linePerformance && (
        <div className="bg-white border border-black/10 p-4 shadow-xs space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
            <Layers size={14} className="text-blue-600" /> Execução Comercial por Linha de Produto (9.6.2)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(dashboard.linePerformance).map(([line, val]) => (
              <div key={line} className="p-3 bg-gray-50 border border-black/10 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between items-center font-bold text-black border-b border-black/10 pb-1">
                  <span>LINHA {line}</span>
                  <span className="text-[10px] text-gray-500">{val.actualUnits} un vendidas</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-600">Receita Realizada:</span>
                  <span className="font-bold text-gray-900">{formatMoney(val.actualRevenue)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-600">Alvo Orçado:</span>
                  <span className="text-gray-700">{formatMoney(val.targetRevenue)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-600">Margem Contrib.:</span>
                  <span className="font-bold text-emerald-700">{formatMoney(val.actualContributionMargin)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drawer de Detalhes da Ação */}
      <CommercialExecutionActionDrawer
        action={selectedAction}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onReady={handleReadyAction}
        onStart={handleStartAction}
        onBlock={handleBlockAction}
        onUnblock={handleUnblockAction}
        onComplete={handleCompleteAction}
        onCancel={handleCancelAction}
        onRecalculateImpact={handleRecalculateImpact}
      />

      {/* Modal Criar Novo Ciclo */}
      {showCreateCycleModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateCycle} className="bg-white p-5 max-w-lg w-full border border-black/20 shadow-xl space-y-4">
            <h4 className="text-sm font-black text-black uppercase flex items-center gap-2">
              <Plus size={16} className="text-[#eab308]" /> Novo Ciclo de Execução Comercial
            </h4>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold uppercase text-[10px] block text-gray-700">Título do Ciclo</label>
                <input
                  type="text"
                  required
                  value={newCycleTitle}
                  onChange={(e) => setNewCycleTitle(e.target.value)}
                  className="w-full p-2 border border-black/20 text-xs focus:outline-hidden focus:border-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase text-[10px] block text-gray-700">Início do Período</label>
                  <input
                    type="date"
                    required
                    value={newCycleStart}
                    onChange={(e) => setNewCycleStart(e.target.value)}
                    className="w-full p-2 border border-black/20 text-xs focus:outline-hidden focus:border-black"
                  />
                </div>
                <div>
                  <label className="font-bold uppercase text-[10px] block text-gray-700">Fim do Período</label>
                  <input
                    type="date"
                    required
                    value={newCycleEnd}
                    onChange={(e) => setNewCycleEnd(e.target.value)}
                    className="w-full p-2 border border-black/20 text-xs focus:outline-hidden focus:border-black"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold uppercase text-[10px] block text-gray-700">Budget Comercial Vinculado (9.6.6)</label>
                <select
                  required
                  value={newCycleBudgetId}
                  onChange={(e) => setNewCycleBudgetId(e.target.value)}
                  className="w-full p-2 border border-black/20 text-xs focus:outline-hidden focus:border-black font-mono"
                >
                  <option value="">Selecione um budget...</option>
                  {availableBudgets.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.status.toUpperCase()} — Alvo: R$ {b.targetRevenue})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold uppercase text-[10px] block text-gray-700">Metas Comerciais Vinculadas (9.6.4)</label>
                <div className="max-h-24 overflow-y-auto border border-black/20 p-2 space-y-1 bg-neutral-50">
                  {availableGoals.length === 0 ? (
                    <span className="text-[10px] text-gray-500">Nenhuma meta cadastrada.</span>
                  ) : (
                    availableGoals.map(g => (
                      <label key={g.id} className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-black/5 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={newCycleGoalIds.includes(g.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewCycleGoalIds([...newCycleGoalIds, g.id]);
                            } else {
                              setNewCycleGoalIds(newCycleGoalIds.filter(id => id !== g.id));
                            }
                          }}
                          className="accent-black"
                        />
                        <span className="font-bold uppercase">{g.title}</span>
                        <span className="text-gray-500 font-mono">({g.type} — {g.targetValue})</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="font-bold uppercase text-[10px] block text-gray-700">Forecast / Planejamento Vinculado (9.6.5)</label>
                <select
                  value={newCycleForecastId}
                  onChange={(e) => setNewCycleForecastId(e.target.value)}
                  className="w-full p-2 border border-black/20 text-xs focus:outline-hidden focus:border-black font-mono"
                >
                  <option value="">Nenhum forecast vinculado (opcional)</option>
                  {availableForecasts.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.title || f.id} (R$ {f.projectedRevenue || 0})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-black/10">
              <button
                type="button"
                onClick={() => setShowCreateCycleModal(false)}
                className="px-3 py-1.5 border border-black/20 text-xs font-bold uppercase cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 bg-black text-[#eab308] text-xs font-black uppercase cursor-pointer hover:bg-neutral-800"
              >
                Criar Ciclo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Adicionar Ação */}
      {showAddActionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleAddAction} className="bg-white p-5 max-w-lg w-full border border-black/20 shadow-xl space-y-4">
            <h4 className="text-sm font-black text-black uppercase flex items-center gap-2">
              <Plus size={16} className="text-[#eab308]" /> Adicionar Ação ao Plano
            </h4>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold uppercase text-[10px] block text-gray-700">Título da Ação Comercial</label>
                <input
                  type="text"
                  required
                  value={newActionTitle}
                  onChange={(e) => setNewActionTitle(e.target.value)}
                  placeholder="Ex: Campanha de Recuperação de Margem da Linha FORCE"
                  className="w-full p-2 border border-black/20 text-xs focus:outline-hidden focus:border-black"
                />
              </div>

              <div>
                <label className="font-bold uppercase text-[10px] block text-gray-700">Descrição / Diretriz Operacional</label>
                <textarea
                  value={newActionDescription}
                  onChange={(e) => setNewActionDescription(e.target.value)}
                  placeholder="Descreva o escopo da ação comercial..."
                  className="w-full p-2 border border-black/20 text-xs h-20 focus:outline-hidden focus:border-black"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold uppercase text-[10px] block text-gray-700">Prioridade</label>
                  <select
                    value={newActionPriority}
                    onChange={(e) => setNewActionPriority(e.target.value as CommercialActionPriority)}
                    className="w-full p-1.5 border border-black/20 text-xs uppercase font-bold"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold uppercase text-[10px] block text-gray-700">Linha</label>
                  <select
                    value={newActionLine}
                    onChange={(e) => setNewActionLine(e.target.value as CommercialProductLine)}
                    className="w-full p-1.5 border border-black/20 text-xs font-bold"
                  >
                    <option value="ALL">Todas (ALL)</option>
                    <option value="FORCE">FORCE</option>
                    <option value="MARK">MARK</option>
                    <option value="PRIME">PRIME</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold uppercase text-[10px] block text-gray-700">Responsável</label>
                  <input
                    type="text"
                    value={newActionOwner}
                    onChange={(e) => setNewActionOwner(e.target.value)}
                    placeholder="Nome do owner"
                    className="w-full p-1.5 border border-black/20 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase text-[10px] block text-gray-700">Início Planejado</label>
                  <input
                    type="date"
                    required
                    value={newActionStart}
                    onChange={(e) => setNewActionStart(e.target.value)}
                    className="w-full p-2 border border-black/20 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold uppercase text-[10px] block text-gray-700">Prazo Limite (Deadline)</label>
                  <input
                    type="date"
                    required
                    value={newActionEnd}
                    onChange={(e) => setNewActionEnd(e.target.value)}
                    className="w-full p-2 border border-black/20 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-2 bg-amber-50/50 border border-amber-200/60">
                <div>
                  <label className="font-bold uppercase text-[9px] block text-amber-900">Impacto Receita Esperado (R$)</label>
                  <input
                    type="number"
                    value={newActionRevenueImpact}
                    onChange={(e) => setNewActionRevenueImpact(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ex: 5000"
                    className="w-full p-1.5 bg-white border border-amber-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold uppercase text-[9px] block text-amber-900">Impacto Margem Esperado (R$)</label>
                  <input
                    type="number"
                    value={newActionMarginImpact}
                    onChange={(e) => setNewActionMarginImpact(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ex: 2000"
                    className="w-full p-1.5 bg-white border border-amber-300 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-black/10">
              <button
                type="button"
                onClick={() => setShowAddActionModal(false)}
                className="px-3 py-1.5 border border-black/20 text-xs font-bold uppercase cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 bg-black text-[#eab308] text-xs font-black uppercase cursor-pointer hover:bg-neutral-800"
              >
                Adicionar Ação
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};

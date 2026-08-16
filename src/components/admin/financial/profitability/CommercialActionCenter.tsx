import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Filter,
  Search,
  Target,
  FileText,
  TrendingUp,
  Layers,
  Sparkles,
  ChevronRight,
  User,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Play
} from 'lucide-react';
import {
  CommercialAction,
  CommercialGoal,
  CommercialActionStatus,
  CommercialActionPriority,
  CommercialActionType,
  CommercialGoalType,
  CommercialGoalPeriod,
  CommercialGoalEvaluation
} from '../../../../types/commercialGovernance';
import {
  fetchCommercialActions,
  fetchCommercialGoals,
  fetchCommercialGoalEvaluation,
  createCommercialAction,
  createCommercialGoal,
  updateCommercialGoalStatus,
  createIdempotencyKey
} from '../../../../services/commercial/commercialGovernanceService';
import {
  isActionOverdue
} from '../../../../utils/commercialGovernance';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { OrderProfitability, ProductProfitabilityItem } from '../../../../utils/profitability';
import { FinancialDREResult } from '../../../../utils/orderFinancial';
import { CommercialRecommendation } from '../../../../utils/commercialIntelligence';
import { CommercialActionDrawer } from './CommercialActionDrawer';

interface CommercialActionCenterProps {
  ordersProfitability: OrderProfitability[];
  productsProfitability: ProductProfitabilityItem[];
  dre: FinancialDREResult;
  recommendations: CommercialRecommendation[];
  onNavigateToSimulator?: (productSlug?: string) => void;
  rawOrders?: any[];
  productCatalog?: any[];
  expenses?: any[];
  investments?: any[];
  traffic?: any[];
}

type ActionCenterSubTab = 'actions' | 'goals' | 'new_action';

export const CommercialActionCenter: React.FC<CommercialActionCenterProps> = ({
  ordersProfitability,
  productsProfitability,
  dre,
  recommendations,
  onNavigateToSimulator,
  rawOrders = [],
  productCatalog = [],
  expenses = [],
  investments = [],
  traffic = []
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  const [activeSubTab, setActiveSubTab] = useState<ActionCenterSubTab>('actions');
  const [actions, setActions] = useState<CommercialAction[]>([]);
  const [goals, setGoals] = useState<CommercialGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros de Ações
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Drawer de Ação
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  // Form State para Nova Ação Manual
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionDesc, setNewActionDesc] = useState('');
  const [newActionType, setNewActionType] = useState<CommercialActionType>('review_price');
  const [newActionPriority, setNewActionPriority] = useState<CommercialActionPriority>('medium');
  const [newActionDueDate, setNewActionDueDate] = useState('');
  const [newActionAssignedTo, setNewActionAssignedTo] = useState('');
  const [newActionEntityId, setNewActionEntityId] = useState('');
  const [creatingAction, setCreatingAction] = useState(false);
  const [createActionKey, setCreateActionKey] = useState<string>(() => createIdempotencyKey('act_create'));

  // Form State para Nova Meta
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalType, setGoalType] = useState<CommercialGoalType>('revenue');
  const [goalTargetValue, setGoalTargetValue] = useState<number>(10000);
  const [goalStartDate, setGoalStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [goalEndDate, setGoalEndDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [goalPeriod, setGoalPeriod] = useState<CommercialGoalPeriod>('monthly');
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [createGoalKey, setCreateGoalKey] = useState<string>(() => createIdempotencyKey('goal_create'));

  // Estado de Avaliação Server-Side Oficial das Metas (Dataset Completo do Firestore)
  const [goalEvaluations, setGoalEvaluations] = useState<
    Record<string, { loading: boolean; error: string | null; evaluation?: CommercialGoalEvaluation }>
  >({});

  const loadGoalEvaluation = async (goalId: string) => {
    try {
      setGoalEvaluations(prev => ({
        ...prev,
        [goalId]: { loading: true, error: null, evaluation: prev[goalId]?.evaluation }
      }));
      const res = await fetchCommercialGoalEvaluation(goalId);
      setGoalEvaluations(prev => ({
        ...prev,
        [goalId]: { loading: false, error: null, evaluation: res.evaluation }
      }));
    } catch (err: any) {
      setGoalEvaluations(prev => ({
        ...prev,
        [goalId]: {
          loading: false,
          error: err.message || 'Não foi possível calcular a meta com o histórico completo.',
          evaluation: undefined
        }
      }));
    }
  };

  const loadAllGoalEvaluations = async (goalsList: CommercialGoal[]) => {
    if (!goalsList || goalsList.length === 0) return;
    await Promise.all(goalsList.map(g => loadGoalEvaluation(g.id)));
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [actionsRes, goalsRes] = await Promise.all([
        fetchCommercialActions({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          priority: priorityFilter !== 'all' ? priorityFilter : undefined,
          type: typeFilter !== 'all' ? typeFilter : undefined,
          limit: 50
        }),
        fetchCommercialGoals().catch(() => [])
      ]);
      setActions(actionsRes.actions || []);
      setNextCursor(actionsRes.nextCursor);
      setHasMore(actionsRes.hasMore);
      const loadedGoals = goalsRes || [];
      setGoals(loadedGoals);
      loadAllGoalEvaluations(loadedGoals);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar governança comercial.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const actionsRes = await fetchCommercialActions({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        limit: 50,
        startAfter: nextCursor
      });
      setActions(prev => [...prev, ...(actionsRes.actions || [])]);
      setNextCursor(actionsRes.nextCursor);
      setHasMore(actionsRes.hasMore);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar mais ações.');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, priorityFilter, typeFilter]);

  // Ações filtradas por busca textual
  const filteredActions = useMemo(() => {
    if (!searchFilter) return actions;
    const query = searchFilter.toLowerCase();
    return actions.filter(action => {
      const matchesTitle = action.title.toLowerCase().includes(query);
      const matchesEntity = action.entityName?.toLowerCase().includes(query) || false;
      const matchesAssigned = action.assignedToName?.toLowerCase().includes(query) || false;
      return matchesTitle || matchesEntity || matchesAssigned;
    });
  }, [actions, searchFilter]);

  // Estatísticas de Ações (Dashboard)
  const stats = useMemo(() => {
    const open = actions.filter(a => ['draft', 'approved', 'in_progress'].includes(a.status)).length;
    const critical = actions.filter(a => ['draft', 'approved', 'in_progress'].includes(a.status) && a.priority === 'critical').length;
    const overdue = actions.filter(a => isActionOverdue(a.dueDate, a.status)).length;
    const inProgress = actions.filter(a => a.status === 'in_progress').length;
    const completed = actions.filter(a => a.status === 'completed').length;

    return { open, critical, overdue, inProgress, completed };
  }, [actions]);

  // Criação Manual de Ação
  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActionTitle.trim()) return;

    try {
      setCreatingAction(true);
      setError(null);
      const res = await createCommercialAction(
        {
          title: newActionTitle.trim(),
          description: newActionDesc.trim(),
          type: newActionType,
          priority: newActionPriority,
          dueDate: newActionDueDate || undefined,
          assignedToName: newActionAssignedTo || undefined,
          entityId: newActionEntityId || undefined
        },
        createActionKey
      );

      setActions(prev => [res.action, ...prev]);
      setNewActionTitle('');
      setNewActionDesc('');
      setCreateActionKey(createIdempotencyKey('act_create'));
      setActiveSubTab('actions');
      setSelectedActionId(res.action.id);
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar plano de ação.');
    } finally {
      setCreatingAction(false);
    }
  };

  // Criação de Nova Meta
  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;

    try {
      setCreatingGoal(true);
      setError(null);
      const newGoal = await createCommercialGoal(
        {
          title: goalTitle.trim(),
          type: goalType,
          targetValue: Number(goalTargetValue),
          startDate: goalStartDate,
          endDate: goalEndDate,
          period: goalPeriod
        },
        createGoalKey
      );

      setGoals(prev => [newGoal, ...prev]);
      loadGoalEvaluation(newGoal.id);
      setShowGoalModal(false);
      setGoalTitle('');
      setCreateGoalKey(createIdempotencyKey('goal_create'));
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar meta comercial.');
    } finally {
      setCreatingGoal(false);
    }
  };

  const handleActionUpdated = (updated: CommercialAction) => {
    setActions(prev => prev.map(a => (a.id === updated.id ? updated : a)));
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-400" />
            Central de Ações & Governança Comercial
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Transformação de diagnósticos analíticos em decisões administrativas, acompanhamento de prazos e metas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('actions')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeSubTab === 'actions'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Planos de Ação ({actions.length})
          </button>
          <button
            onClick={() => setActiveSubTab('goals')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeSubTab === 'goals'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Target className="w-3.5 h-3.5" /> Metas ({goals.length})
          </button>
          <button
            onClick={() => setActiveSubTab('new_action')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Nova Ação
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-zinc-400 hover:text-zinc-200 text-xs">Fechar</button>
        </div>
      )}

      {/* KPI Cards de Governança */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl">
          <div className="text-[11px] text-zinc-400">Ações Carregadas</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">{stats.open}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl">
          <div className="text-[11px] text-rose-400 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Críticas
          </div>
          <div className="text-xl font-bold text-rose-400 mt-1">{stats.critical}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl">
          <div className="text-[11px] text-amber-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Vencidas
          </div>
          <div className="text-xl font-bold text-amber-400 mt-1">{stats.overdue}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl">
          <div className="text-[11px] text-blue-400">Em Execução</div>
          <div className="text-xl font-bold text-blue-400 mt-1">{stats.inProgress}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl">
          <div className="text-[11px] text-emerald-400">Concluídas</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{stats.completed}</div>
        </div>
      </div>

      {/* SUB-TAB 1: PLANOS DE AÇÃO */}
      {activeSubTab === 'actions' && (
        <div className="space-y-4">
          {/* Filtros e Barra de Busca */}
          <div className="bg-zinc-900/80 border border-zinc-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Buscar por título, produto ou responsável..."
                className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-300"
              >
                <option value="all">Todos os Status</option>
                <option value="draft">Rascunho</option>
                <option value="approved">Aprovada</option>
                <option value="in_progress">Em Andamento</option>
                <option value="completed">Concluída</option>
                <option value="dismissed">Descartada</option>
                <option value="cancelled">Cancelada</option>
              </select>

              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-300"
              >
                <option value="all">Todas as Prioridades</option>
                <option value="critical">Crítica</option>
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>

              <button
                onClick={loadData}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                title="Recarregar"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Tabela de Planos de Ação */}
          {filteredActions.length === 0 ? (
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-8 text-center">
              <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <div className="text-sm font-semibold text-zinc-300">Nenhum plano de ação encontrado</div>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                Transforme uma recomendação analítica na aba Recomendações ou registre um novo plano manual para iniciar o acompanhamento operacional.
              </p>
            </div>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800/60">
              {filteredActions.map(action => {
                const overdue = isActionOverdue(action.dueDate, action.status);
                return (
                  <div
                    key={action.id}
                    onClick={() => setSelectedActionId(action.id)}
                    className="p-4 hover:bg-zinc-800/40 cursor-pointer transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            action.priority === 'critical'
                              ? 'bg-rose-500'
                              : action.priority === 'high'
                              ? 'bg-amber-500'
                              : 'bg-zinc-500'
                          }`}
                        />
                        <span className="font-semibold text-sm text-zinc-200 truncate">
                          {action.title}
                        </span>
                        {overdue && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Vencida
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-3">
                        {action.entityName && (
                          <span className="text-zinc-300 font-medium">
                            {action.entityName}
                          </span>
                        )}
                        <span>Responsável: {action.assignedToName || 'Não atribuído'}</span>
                        <span>
                          Prazo: {action.dueDate ? new Date(action.dueDate).toLocaleDateString('pt-BR') : 'Sem prazo'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg capitalize border bg-zinc-950 border-zinc-800 text-zinc-300">
                        {action.status.replace('_', ' ')}
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Botão de Paginação Real (Carregar Mais) */}
          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              >
                {loadingMore ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                Carregar mais ações
              </button>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: METAS PERSISTENTES */}
      {activeSubTab === 'goals' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
            <div className="text-xs text-zinc-400">
              Metas comerciais persistentes avaliadas deterministicamente pelos motores de DRE e Rentabilidade.
            </div>
            <button
              onClick={() => {
                setCreateGoalKey(createIdempotencyKey('goal_create'));
                setShowGoalModal(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Nova Meta Comercial
            </button>
          </div>

          {goals.length === 0 ? (
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-8 text-center">
              <Target className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <div className="text-sm font-semibold text-zinc-300">Nenhuma meta cadastrada</div>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                Defina metas de faturamento, lucro operacional, margem de contribuição ou unidades para acompanhar os resultados.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map(goal => {
                const evalState = goalEvaluations[goal.id];
                const isCurrency = ['revenue', 'operating_profit', 'contribution_margin', 'average_ticket'].includes(goal.type);
                const isLoadingEval = evalState?.loading;
                const evalError = evalState?.error;
                const evaluation = evalState?.evaluation;

                return (
                  <div key={goal.id} className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-zinc-200 text-sm">{goal.title}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                          {goal.period}
                        </span>
                        <button
                          onClick={() => loadGoalEvaluation(goal.id)}
                          disabled={isLoadingEval}
                          title="Recalcular com dataset completo"
                          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                        >
                          <RefreshCw className={`w-3 h-3 ${isLoadingEval ? 'animate-spin text-indigo-400' : ''}`} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-zinc-500">Meta Planejada</div>
                        <div className="font-mono text-zinc-100 font-semibold text-sm">
                          {isCurrency ? formatMoney(goal.targetValue) : `${goal.targetValue} un`}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500">Realizado Atual</div>
                        {isLoadingEval && !evaluation ? (
                          <div className="font-mono text-xs text-zinc-500 italic flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" /> Calculando...
                          </div>
                        ) : evalError ? (
                          <div className="text-xs text-rose-400 font-mono">Erro no cálculo</div>
                        ) : evaluation ? (
                          <div className="font-mono text-indigo-400 font-semibold text-sm">
                            {isCurrency ? formatMoney(evaluation.currentValue) : `${evaluation.currentValue} un`}
                          </div>
                        ) : (
                          <div className="text-xs text-zinc-500 font-mono">—</div>
                        )}
                      </div>
                    </div>

                    {/* Estado de Erro ou Loading ou Barra de Progresso */}
                    {evalError ? (
                      <div className="bg-rose-950/40 border border-rose-900/60 rounded-lg p-2.5 text-xs text-rose-300 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                          <span className="truncate">Não foi possível calcular a meta com o histórico completo.</span>
                        </div>
                        <button
                          onClick={() => loadGoalEvaluation(goal.id)}
                          className="px-2 py-0.5 text-[11px] font-semibold rounded bg-rose-900/80 hover:bg-rose-800 text-rose-100 shrink-0"
                        >
                          Tentar novamente
                        </button>
                      </div>
                    ) : isLoadingEval && !evaluation ? (
                      <div className="py-2 text-xs text-zinc-400 flex items-center gap-2">
                        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden animate-pulse">
                          <div className="h-full bg-indigo-500/40 w-1/2 animate-pulse" />
                        </div>
                      </div>
                    ) : evaluation ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-zinc-400">
                          <span>Progresso: {evaluation.progressPercent}%</span>
                          <span>
                            Faltam: {isCurrency ? formatMoney(evaluation.remainingValue) : `${evaluation.remainingValue} un`}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              evaluation.isMathematicallyAchieved
                                ? 'bg-emerald-500'
                                : evaluation.isOverdue
                                ? 'bg-rose-500'
                                : 'bg-indigo-500'
                            }`}
                            style={{ width: `${Math.min(100, evaluation.progressPercent)}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-xs">
                      <span className="text-zinc-500">
                        Até: {new Date(goal.endDate).toLocaleDateString('pt-BR')}
                      </span>
                      {evaluation?.isMathematicallyAchieved ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Meta Atingida
                        </span>
                      ) : evaluation?.isOverdue ? (
                        <span className="text-rose-400 font-semibold flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Período Encerrado
                        </span>
                      ) : evaluation ? (
                        <span className="text-indigo-300">Em Acompanhamento</span>
                      ) : (
                        <span className="text-zinc-500">Aguardando cálculo</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: NOVA AÇÃO MANUAL */}
      {activeSubTab === 'new_action' && (
        <form onSubmit={handleCreateAction} className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl space-y-4 max-w-2xl">
          <div className="font-semibold text-sm text-zinc-200 border-b border-zinc-800 pb-2">
            Registrar Novo Plano de Ação Comercial
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Título do Plano:</label>
            <input
              type="text"
              value={newActionTitle}
              onChange={e => setNewActionTitle(e.target.value)}
              placeholder="Ex: Renegociar custo do fornecedor Camiseta Classic"
              required
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Descrição Detalhada:</label>
            <textarea
              value={newActionDesc}
              onChange={e => setNewActionDesc(e.target.value)}
              placeholder="Descreva as diretrizes do plano, escopo e metas operacionais..."
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-zinc-400 mb-1">Tipo de Ação:</label>
              <select
                value={newActionType}
                onChange={e => setNewActionType(e.target.value as CommercialActionType)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
              >
                <option value="review_price">Revisão de Preço</option>
                <option value="review_cost">Revisão de Custo</option>
                <option value="improve_margin">Melhoria de Margem</option>
                <option value="review_shipping">Revisão de Frete</option>
                <option value="register_cost">Cadastro de Custo</option>
                <option value="break_even_plan">Plano de Breakeven</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Prioridade:</label>
              <select
                value={newActionPriority}
                onChange={e => setNewActionPriority(e.target.value as CommercialActionPriority)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
              >
                <option value="critical">Crítica</option>
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Prazo de Execução:</label>
              <input
                type="date"
                value={newActionDueDate}
                onChange={e => setNewActionDueDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-zinc-400 mb-1">Responsável Designado:</label>
              <input
                type="text"
                value={newActionAssignedTo}
                onChange={e => setNewActionAssignedTo(e.target.value)}
                placeholder="Nome ou e-mail do operador"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Produto Associado (Opcional):</label>
              <select
                value={newActionEntityId}
                onChange={e => setNewActionEntityId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
              >
                <option value="">Nenhum produto específico</option>
                {productsProfitability.map(p => (
                  <option key={p.slug || p.id} value={p.slug || p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveSubTab('actions')}
              className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creatingAction}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
            >
              {creatingAction ? 'Registrando...' : 'Salvar Plano de Ação'}
            </button>
          </div>
        </form>
      )}

      {/* Modal de Criação de Meta */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGoal}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-2xl"
          >
            <div className="font-bold text-sm text-zinc-100 flex items-center justify-between">
              <span>Nova Meta Comercial</span>
              <button
                type="button"
                onClick={() => setShowGoalModal(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Título da Meta:</label>
              <input
                type="text"
                value={goalTitle}
                onChange={e => setGoalTitle(e.target.value)}
                placeholder="Ex: Faturamento Q3 ou Margem de Contribuição"
                required
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Tipo de Indicador:</label>
                <select
                  value={goalType}
                  onChange={e => setGoalType(e.target.value as CommercialGoalType)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
                >
                  <option value="revenue">Faturamento Líquido (R$)</option>
                  <option value="operating_profit">Lucro Operacional (R$)</option>
                  <option value="contribution_margin">Margem Contribuição (R$)</option>
                  <option value="units">Unidades Vendidas</option>
                  <option value="average_ticket">Ticket Médio (R$)</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Valor Alvo:</label>
                <input
                  type="number"
                  value={goalTargetValue}
                  onChange={e => setGoalTargetValue(Number(e.target.value))}
                  required
                  min={1}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Data Início:</label>
                <input
                  type="date"
                  value={goalStartDate}
                  onChange={e => setGoalStartDate(e.target.value)}
                  required
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Data Fim:</label>
                <input
                  type="date"
                  value={goalEndDate}
                  onChange={e => setGoalEndDate(e.target.value)}
                  required
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowGoalModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingGoal}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              >
                {creatingGoal ? 'Salvando...' : 'Cadastrar Meta'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drawer de Detalhes da Ação */}
      <CommercialActionDrawer
        actionId={selectedActionId}
        onClose={() => setSelectedActionId(null)}
        onActionUpdated={handleActionUpdated}
        productsProfitability={productsProfitability}
      />
    </div>
  );
};

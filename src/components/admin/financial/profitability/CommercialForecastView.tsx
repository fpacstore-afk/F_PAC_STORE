import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Sliders,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Layers,
  DollarSign,
  PieChart,
  Target,
  Zap,
  Info,
  Clock,
  ChevronRight
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import {
  CommercialForecast,
  ForecastHorizon,
  WhatIfScenarioParams,
  WhatIfScenarioResult,
  RealVsGoalVsForecastComparison
} from '../../../../types/commercialForecast';
import { CommercialGoal } from '../../../../types/commercialGovernance';
import {
  generateCommercialForecast,
  simulateWhatIfScenario,
  compareRealVsGoalVsForecast,
  computeHorizonDefaultDates,
  selectCompatibleCommercialGoal,
  safeNum
} from '../../../../utils/commercialForecast';
import {
  fetchCommercialForecasts,
  createCommercialForecast,
  recalculateCommercialForecast,
  convertScenarioToAction,
  createForecastIdempotencyKey
} from '../../../../services/commercial/commercialForecastService';
import {
  fetchCommercialGoals,
  fetchCommercialGoalEvaluation
} from '../../../../services/commercial/commercialGovernanceService';
import { CommercialGoalEvaluation } from '../../../../types/commercialGovernance';

interface CommercialForecastViewProps {
  rawOrders?: any[];
  expenses?: any[];
  investments?: any[];
  traffic?: any[];
  productCatalog?: any[];
  goals?: CommercialGoal[];
  onNavigateToActions?: () => void;
}

export const CommercialForecastView: React.FC<CommercialForecastViewProps> = ({
  rawOrders = [],
  expenses = [],
  investments = [],
  traffic = [],
  productCatalog = [],
  goals = [],
  onNavigateToActions
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  const [savedForecasts, setSavedForecasts] = useState<CommercialForecast[]>([]);
  const [selectedForecast, setSelectedForecast] = useState<CommercialForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New Forecast Form Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newHorizon, setNewHorizon] = useState<ForecastHorizon>('current_month');
  const [newStartDate, setNewStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [newEndDate, setNewEndDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  );
  const [newNotes, setNewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // What-If Simulator state
  const [scenarioName, setScenarioName] = useState('Cenário Otimista');
  const [priceAdj, setPriceAdj] = useState<number>(0);
  const [elasticity, setElasticity] = useState<number>(1.0);
  const [volumeAdj, setVolumeAdj] = useState<number>(0);
  const [costInf, setCostInf] = useState<number>(0);
  const [trafficAdj, setTrafficAdj] = useState<number>(0);
  const [fixedAdj, setFixedAdj] = useState<number>(0);
  const [simulatedResult, setSimulatedResult] = useState<WhatIfScenarioResult | null>(null);
  const [convertingAction, setConvertingAction] = useState(false);

  // Load saved forecasts from server on mount
  const loadForecasts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCommercialForecasts();
      setSavedForecasts(data);
      if (data.length > 0) {
        setSelectedForecast(data[0]);
      } else {
        // Se ainda não houver salvo no backend, gerar uma prévia local instantânea
        const instant = generateCommercialForecast({
          title: 'Forecast Mês Atual (Prévia)',
          horizon: 'current_month',
          startDate: newStartDate,
          endDate: newEndDate,
          rawOrders,
          expenses,
          traffic,
          investments,
          productCatalog,
          createdBy: 'system',
          notes: 'PREVIEW LOCAL — NÃO OFICIAL'
        });
        setSelectedForecast(instant);
      }
    } catch (err: any) {
      setError('Não foi possível calcular o Forecast com o histórico completo.');
      const instant = generateCommercialForecast({
        title: 'Forecast Mês Atual (Prévia)',
        horizon: 'current_month',
        startDate: newStartDate,
        endDate: newEndDate,
        rawOrders,
        expenses,
        traffic,
        investments,
        productCatalog,
        createdBy: 'system',
        notes: 'PREVIEW LOCAL — NÃO OFICIAL'
      });
      setSelectedForecast(instant);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForecasts();
  }, []);

  // Update What-If simulation when parameters or selected forecast change
  useEffect(() => {
    if (!selectedForecast) return;
    const params: WhatIfScenarioParams = {
      name: scenarioName || 'Cenário Personalizado',
      priceAdjustmentPercent: priceAdj,
      volumeElasticityFactor: elasticity,
      volumeAdjustmentPercent: volumeAdj,
      costInflationPercent: costInf,
      trafficSpendAdjustment: trafficAdj,
      fixedExpenseAdjustment: fixedAdj
    };
    const res = simulateWhatIfScenario(selectedForecast, params);
    setSimulatedResult(res);
  }, [selectedForecast, scenarioName, priceAdj, elasticity, volumeAdj, costInf, trafficAdj, fixedAdj]);

  const operationKeysRef = React.useRef<Map<string, string>>(new Map());

  function getOrGenerateKey(opName: string): string {
    if (!operationKeysRef.current.has(opName)) {
      operationKeysRef.current.set(opName, createForecastIdempotencyKey(opName));
    }
    return operationKeysRef.current.get(opName)!;
  }

  function clearOperationKey(opName: string) {
    operationKeysRef.current.delete(opName);
  }

  // Handle New Forecast Creation
  const handleCreateForecast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsSubmitting(true);
    setError(null);

    const idempotencyKey = getOrGenerateKey('fc_create');

    try {
      const result = await createCommercialForecast(
        {
          title: newTitle.trim(),
          horizon: newHorizon,
          startDate: newStartDate,
          endDate: newEndDate,
          notes: newNotes
        },
        idempotencyKey
      );

      clearOperationKey('fc_create');
      setSavedForecasts(prev => [result.forecast, ...prev]);
      setSelectedForecast(result.forecast);
      setShowCreateModal(false);
      setNewTitle('');
      setNewNotes('');
      setSuccessMessage(`Forecast "${result.forecast.title}" criado com sucesso!`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar forecast no backend.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Recalculate
  const handleRecalculate = async () => {
    if (!selectedForecast) return;
    setIsSubmitting(true);
    setError(null);

    const opName = `fc_recalc_${selectedForecast.id}`;
    const idempotencyKey = getOrGenerateKey(opName);

    try {
      const result = await recalculateCommercialForecast(selectedForecast.id, idempotencyKey);
      clearOperationKey(opName);
      setSelectedForecast(result.forecast);
      setSavedForecasts(prev =>
        prev.map(f => (f.id === result.forecast.id ? result.forecast : f))
      );
      setSuccessMessage('Projeção recalculada com sucesso com dados mais recentes!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Erro ao recalcular forecast.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Convert Scenario to Commercial Action
  const handleConvertScenario = async () => {
    if (!selectedForecast || !simulatedResult) return;
    setConvertingAction(true);
    setError(null);

    const opName = `fc_action_${selectedForecast.id}_${simulatedResult.id}`;
    const idempotencyKey = getOrGenerateKey(opName);

    try {
      const result = await convertScenarioToAction({
        forecastId: selectedForecast.id,
        scenario: simulatedResult,
        idempotencyKey
      });

      clearOperationKey(opName);
      setSuccessMessage(`Ação Comercial criada com sucesso em Rascunho (ID: ${result.action.id})!`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Erro ao transformar cenário em ação comercial.');
    } finally {
      setConvertingAction(false);
    }
  };

  const [internalGoals, setInternalGoals] = useState<CommercialGoal[]>(goals || []);
  const [goalEvaluationsById, setGoalEvaluationsById] = useState<
    Record<string, { loading: boolean; error: string | null; evaluation?: CommercialGoalEvaluation }>
  >({});

  useEffect(() => {
    if (goals && goals.length > 0) {
      setInternalGoals(goals);
    } else {
      fetchCommercialGoals()
        .then(res => {
          if (res && res.length > 0) {
            setInternalGoals(res.filter(g => g.status === 'active'));
          }
        })
        .catch(() => {});
    }
  }, [goals]);

  // Identificar metas compatíveis para cada uma das 5 métricas
  const effectiveGoals = (goals && goals.length > 0) ? goals : internalGoals;
  const fcStart = selectedForecast?.forecastStartDate || selectedForecast?.startDate;
  const fcEnd = selectedForecast?.forecastEndDate || selectedForecast?.endDate;

  const compatibleGoals = useMemo(() => {
    if (!selectedForecast || !fcStart || !fcEnd) {
      return {
        revenue: undefined,
        contribution_margin: undefined,
        operating_profit: undefined,
        units: undefined,
        average_ticket: undefined
      };
    }

    return {
      revenue: selectCompatibleCommercialGoal(effectiveGoals, 'revenue', fcStart, fcEnd),
      contribution_margin: selectCompatibleCommercialGoal(effectiveGoals, 'contribution_margin', fcStart, fcEnd),
      operating_profit: selectCompatibleCommercialGoal(effectiveGoals, 'operating_profit', fcStart, fcEnd),
      units: selectCompatibleCommercialGoal(effectiveGoals, 'units', fcStart, fcEnd),
      average_ticket: selectCompatibleCommercialGoal(effectiveGoals, 'average_ticket', fcStart, fcEnd)
    };
  }, [selectedForecast, fcStart, fcEnd, effectiveGoals]);

  // Carregar avaliação server-side de cada meta compatível
  useEffect(() => {
    const goalsToFetch = Object.values(compatibleGoals).filter(Boolean) as CommercialGoal[];

    goalsToFetch.forEach(goal => {
      if (!goalEvaluationsById[goal.id] || (!goalEvaluationsById[goal.id].evaluation && !goalEvaluationsById[goal.id].loading)) {
        setGoalEvaluationsById(prev => ({
          ...prev,
          [goal.id]: { loading: true, error: null }
        }));

        fetchCommercialGoalEvaluation(goal.id)
          .then(res => {
            setGoalEvaluationsById(prev => ({
              ...prev,
              [goal.id]: { loading: false, error: null, evaluation: res.evaluation }
            }));
          })
          .catch(err => {
            setGoalEvaluationsById(prev => ({
              ...prev,
              [goal.id]: { loading: false, error: err.message || 'Erro ao avaliar meta.' }
            }));
          });
      }
    });
  }, [compatibleGoals]);

  // Compute Real vs Goal vs Forecast Comparisons for all 5 Commercial Goal Metrics
  const comparisons: RealVsGoalVsForecastComparison[] = useMemo(() => {
    if (!selectedForecast) return [];

    const {
      revenue: revGoal,
      contribution_margin: cmGoal,
      operating_profit: opGoal,
      units: unitsGoal,
      average_ticket: ticketGoal
    } = compatibleGoals;

    // Se houver meta compatível com avaliação server-side carregada, usar evaluation.currentValue como Realizado oficial
    const revEval = revGoal ? goalEvaluationsById[revGoal.id]?.evaluation : undefined;
    const cmEval = cmGoal ? goalEvaluationsById[cmGoal.id]?.evaluation : undefined;
    const opEval = opGoal ? goalEvaluationsById[opGoal.id]?.evaluation : undefined;
    const unitsEval = unitsGoal ? goalEvaluationsById[unitsGoal.id]?.evaluation : undefined;
    const ticketEval = ticketGoal ? goalEvaluationsById[ticketGoal.id]?.evaluation : undefined;

    const revRealized = revEval ? revEval.currentValue : (selectedForecast.currentActuals?.revenue ?? selectedForecast.baseline.realizedRevenue);
    const cmRealized = cmEval ? cmEval.currentValue : (selectedForecast.currentActuals?.contributionMargin ?? selectedForecast.baseline.realizedContributionMargin);
    const opRealized = opEval ? opEval.currentValue : (selectedForecast.currentActuals?.operatingProfit ?? selectedForecast.baseline.realizedOperatingProfit);
    const unitsRealized = unitsEval ? unitsEval.currentValue : (selectedForecast.currentActuals?.units ?? selectedForecast.baseline.realizedUnits);
    const ticketRealized = ticketEval ? ticketEval.currentValue : (selectedForecast.currentActuals?.averageTicket ?? selectedForecast.baseline.realizedAverageTicket);

    const revComp = compareRealVsGoalVsForecast({
      metric: 'revenue',
      realized: revRealized,
      targetGoal: revGoal?.targetValue,
      forecasted: selectedForecast.projectedRevenue
    });

    const cmComp = compareRealVsGoalVsForecast({
      metric: 'contribution_margin',
      realized: cmRealized,
      targetGoal: cmGoal?.targetValue,
      forecasted: selectedForecast.projectedContributionMargin
    });

    const opComp = compareRealVsGoalVsForecast({
      metric: 'operating_profit',
      realized: opRealized,
      targetGoal: opGoal?.targetValue,
      forecasted: selectedForecast.projectedOperatingProfit
    });

    const unitsComp = compareRealVsGoalVsForecast({
      metric: 'units',
      realized: unitsRealized,
      targetGoal: unitsGoal?.targetValue,
      forecasted: selectedForecast.projectedUnits
    });

    const ticketComp = compareRealVsGoalVsForecast({
      metric: 'average_ticket',
      realized: ticketRealized,
      targetGoal: ticketGoal?.targetValue,
      forecasted: selectedForecast.projectedAverageTicket
    });

    return [revComp, cmComp, opComp, unitsComp, ticketComp];
  }, [selectedForecast, compatibleGoals, goalEvaluationsById]);

  const confidenceBadge = (level: string) => {
    switch (level) {
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CheckCircle2 size={11} className="text-emerald-700" /> Alta Confiança ({selectedForecast?.confidence?.score || 85}%)
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
            <AlertCircle size={11} className="text-amber-700" /> Confiança Moderada ({selectedForecast?.confidence?.score || 60}%)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-gray-100 text-gray-800 border border-gray-300">
            <Info size={11} className="text-gray-600" /> Amostragem em Evolução ({selectedForecast?.confidence?.score || 35}%)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header com Ações Rápidas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-black/10 p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#eab308] bg-black px-2 py-0.5">
              FASE 9.6.5
            </span>
            <h2 className="text-sm font-black uppercase tracking-wider text-black">
              Planejamento Comercial & Projeções (Forecast)
            </h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Projeções canônicas de DRE, simulação de cenários What-If e reconciliação Real vs Meta vs Forecast.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 bg-black text-[#eab308] border border-black text-[10px] font-black uppercase tracking-wider hover:bg-zinc-800 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus size={13} />
            Novo Forecast
          </button>
          <button
            onClick={handleRecalculate}
            disabled={isSubmitting || !selectedForecast}
            className="px-3 py-2 bg-white text-gray-700 border border-black/15 text-[10px] font-black uppercase tracking-wider hover:bg-gray-100 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={isSubmitting ? 'animate-spin' : ''} />
            Recalcular
          </button>
        </div>
      </div>

      {/* Alertas de Sucesso / Erro */}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="text-rose-700 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Seletor de Forecast Ativo */}
      {savedForecasts.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 shrink-0">
            Projeções Salvas:
          </span>
          {savedForecasts.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedForecast(f)}
              className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border transition-all whitespace-nowrap cursor-pointer ${
                selectedForecast?.id === f.id
                  ? 'bg-black text-[#eab308] border-black shadow-xs'
                  : 'bg-white text-gray-600 border-black/10 hover:bg-gray-50'
              }`}
            >
              {f.title}
            </button>
          ))}
        </div>
      )}

      {selectedForecast && (
        <>
          {/* Card Principal: Baseline e Projeção Atual */}
          <div className="bg-white border border-black/10 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-black/10 gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-black uppercase text-black">
                    {selectedForecast.title}
                  </h3>
                  {confidenceBadge(selectedForecast.confidence.level)}
                  {selectedForecast.notes?.includes('PREVIEW LOCAL') && (
                    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-200 text-amber-950 border border-amber-400">
                      PREVIEW LOCAL — NÃO OFICIAL
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500 font-mono mt-1">
                  <span>Vigência: {selectedForecast.startDate} a {selectedForecast.endDate}</span>
                  <span>•</span>
                  <span>{selectedForecast.targetDaysCount} dias de horizonte</span>
                  <span>•</span>
                  <span>{selectedForecast.baseline.sampleOrdersCount} pedidos na amostragem</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono text-gray-600">
                <ShieldCheck size={14} className="text-emerald-600" />
                <span>Baseline Imutável v{selectedForecast.baseline.snapshotVersion}</span>
              </div>
            </div>

            {/* Grid de Métricas Projetadas Canônicas */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-gray-50 border border-black/5 p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">
                  Receita Projetada
                </span>
                <div className="text-base font-black text-black mt-1">
                  {formatMoney(selectedForecast.projectedRevenue)}
                </div>
                <div className="text-[9px] text-gray-500 font-mono mt-0.5">
                  Run-rate: {formatMoney(selectedForecast.baseline.dailyAverageRevenue)}/dia
                </div>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-200/60 p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-900">
                  Margem de Contribuição
                </span>
                <div className="text-base font-black text-emerald-900 mt-1">
                  {formatMoney(selectedForecast.projectedContributionMargin)}
                </div>
                <div className="text-[9px] text-emerald-800 font-mono mt-0.5">
                  {formatPercent(selectedForecast.projectedContributionMarginPercent)} da receita (Motor 9.6.1)
                </div>
              </div>

              <div className="bg-blue-50/60 border border-blue-200/60 p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-blue-900">
                  Lucro Operacional
                </span>
                <div className={`text-base font-black mt-1 ${selectedForecast.projectedOperatingProfit >= 0 ? 'text-blue-900' : 'text-rose-600'}`}>
                  {formatMoney(selectedForecast.projectedOperatingProfit)}
                </div>
                <div className="text-[9px] text-blue-800 font-mono mt-0.5">
                  DRE Canônico pós-fixos e tráfego
                </div>
              </div>

              <div className="bg-gray-50 border border-black/5 p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">
                  Volume de Unidades
                </span>
                <div className="text-base font-black text-black mt-1">
                  {selectedForecast.projectedUnits} un
                </div>
                <div className="text-[9px] text-gray-500 font-mono mt-0.5">
                  Média: {selectedForecast.baseline.dailyAverageUnits.toFixed(1)} un/dia
                </div>
              </div>

              <div className="bg-gray-50 border border-black/5 p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">
                  Ticket Médio Projetado
                </span>
                <div className="text-base font-black text-black mt-1">
                  {formatMoney(selectedForecast.projectedAverageTicket)}
                </div>
                <div className="text-[9px] text-gray-500 font-mono mt-0.5">
                  Cobertura Custos: {selectedForecast.baseline.costCoveragePercent}%
                </div>
              </div>
            </div>

            {/* Motivos da Confiança */}
            {selectedForecast.confidence.reasons.length > 0 && (
              <div className="bg-zinc-50 border border-black/5 p-2.5 text-[10px] text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                <span className="font-bold text-black uppercase">Fatores de Confiança:</span>
                {selectedForecast.confidence.reasons.map((r, i) => (
                  <span key={i} className="flex items-center gap-1">
                    • {r}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Comparativo Real vs Meta vs Forecast */}
          <div className="bg-white border border-black/10 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-black/10">
              <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2">
                <Target size={14} className="text-[#eab308]" />
                Reconciliação: Realizado x Meta Vigente x Projeção (Forecast)
              </h3>
              <span className="text-[10px] text-gray-500 font-mono">
                Validação de Ritmo de Execução Comercial
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {comparisons.map(comp => {
                const metricLabels: Record<string, string> = {
                  revenue: 'Receita',
                  contribution_margin: 'Margem Contribuição',
                  operating_profit: 'Lucro Operacional',
                  units: 'Unidades Vendidas',
                  average_ticket: 'Ticket Médio'
                };

                const isCurrency = comp.metric !== 'units';

                return (
                  <div key={comp.metric} className="border border-black/10 p-3 bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-black">
                        {metricLabels[comp.metric] || comp.metric}
                      </span>
                      {comp.targetGoal !== undefined && (
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 ${
                          comp.isGoalOnTrack ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
                        }`}>
                          {comp.isGoalOnTrack ? 'No Ritmo' : 'Abaixo do Ritmo'}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-gray-600">
                        <span>Realizado:</span>
                        <span className="font-mono font-bold text-black">
                          {isCurrency ? formatMoney(comp.realized) : `${comp.realized} un`}
                        </span>
                      </div>
                      {comp.targetGoal !== undefined && (
                        <div className="flex justify-between text-gray-600">
                          <span>Meta Alvo:</span>
                          <span className="font-mono font-bold text-black">
                            {isCurrency ? formatMoney(comp.targetGoal) : `${comp.targetGoal} un`}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-gray-600">
                        <span>Projeção (Forecast):</span>
                        <span className="font-mono font-black text-[#eab308] bg-black px-1">
                          {isCurrency ? formatMoney(comp.forecasted) : `${comp.forecasted} un`}
                        </span>
                      </div>
                    </div>

                    {comp.targetGoal !== undefined && (
                      <div className="pt-2 border-t border-black/5 text-[9px] text-gray-500 flex justify-between">
                        <span>Atingimento Projetado:</span>
                        <span className="font-bold text-black">{comp.projectedAttainmentPercent}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simulador Interativo de Cenários What-If */}
          <div className="bg-white border border-black/10 p-5 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-black/10 gap-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2">
                  <Sliders size={14} className="text-[#eab308]" />
                  Simulador de Cenários What-If & Elasticidade
                </h3>
                <p className="text-[10px] text-gray-500">
                  Teste o impacto de variações de preço, elasticidade de demanda, inflação de custo e despesas no lucro líquido final.
                </p>
              </div>

              {simulatedResult && (
                <button
                  onClick={handleConvertScenario}
                  disabled={convertingAction}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Zap size={13} />
                  {convertingAction ? 'Criando Ação...' : 'Transformar Cenário em Ação Comercial'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Controles de Simulação */}
              <div className="lg:col-span-6 space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-700 block mb-1">
                    Nome do Cenário:
                  </label>
                  <input
                    type="text"
                    value={scenarioName}
                    onChange={e => setScenarioName(e.target.value)}
                    className="w-full text-xs font-bold border border-black/15 p-2 bg-white text-black"
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span>Variação de Preço Médio:</span>
                      <span className="font-mono text-black">{priceAdj > 0 ? `+${priceAdj}%` : `${priceAdj}%`}</span>
                    </div>
                    <input
                      type="range"
                      min="-30"
                      max="30"
                      step="1"
                      value={priceAdj}
                      onChange={e => setPriceAdj(Number(e.target.value))}
                      className="w-full accent-black cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span>Fator de Elasticidade da Demanda:</span>
                      <span className="font-mono text-black">{elasticity.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="2.5"
                      step="0.1"
                      value={elasticity}
                      onChange={e => setElasticity(Number(e.target.value))}
                      className="w-full accent-black cursor-pointer"
                    />
                    <span className="text-[8px] text-gray-500">1.0 = Proporcional, &lt;1.0 = Demanda Inelástica, &gt;1.0 = Demanda Sensível</span>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span>Variação Adicional de Volume:</span>
                      <span className="font-mono text-black">{volumeAdj > 0 ? `+${volumeAdj}%` : `${volumeAdj}%`}</span>
                    </div>
                    <input
                      type="range"
                      min="-30"
                      max="50"
                      step="2"
                      value={volumeAdj}
                      onChange={e => setVolumeAdj(Number(e.target.value))}
                      className="w-full accent-black cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span>Inflação / Variação de Custo (COGS):</span>
                      <span className="font-mono text-black">{costInf > 0 ? `+${costInf}%` : `${costInf}%`}</span>
                    </div>
                    <input
                      type="range"
                      min="-20"
                      max="30"
                      step="1"
                      value={costInf}
                      onChange={e => setCostInf(Number(e.target.value))}
                      className="w-full accent-black cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[9px] font-bold uppercase text-gray-600 block mb-1">
                        Ajuste Tráfego Pago (R$):
                      </label>
                      <input
                        type="number"
                        value={trafficAdj}
                        onChange={e => setTrafficAdj(Number(e.target.value))}
                        className="w-full text-xs font-mono border border-black/15 p-1.5 bg-white"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-bold uppercase text-gray-600 block mb-1">
                        Ajuste Despesas Fixas (R$):
                      </label>
                      <input
                        type="number"
                        value={fixedAdj}
                        onChange={e => setFixedAdj(Number(e.target.value))}
                        className="w-full text-xs font-mono border border-black/15 p-1.5 bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Painel de Resultados do Cenário */}
              {simulatedResult && (
                <div className="lg:col-span-6 bg-zinc-900 text-white p-4 flex flex-col justify-between border border-black space-y-4">
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#eab308]">
                        Resultado da Projeção Simulada
                      </span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 ${
                        simulatedResult.impactAssessment === 'positive'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : simulatedResult.impactAssessment === 'negative'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {simulatedResult.impactAssessment === 'positive' ? 'Impacto Positivo' : simulatedResult.impactAssessment === 'negative' ? 'Impacto Negativo' : 'Neutro'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="bg-zinc-800/80 p-2.5 border border-zinc-700">
                        <span className="text-[8px] font-black uppercase text-zinc-400">Receita Simulada</span>
                        <div className="text-sm font-bold text-white mt-0.5">
                          {formatMoney(simulatedResult.projectedRevenue)}
                        </div>
                        <div className={`text-[9px] font-mono mt-0.5 ${simulatedResult.deltaRevenue >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {simulatedResult.deltaRevenue >= 0 ? `+${formatMoney(simulatedResult.deltaRevenue)}` : formatMoney(simulatedResult.deltaRevenue)}
                        </div>
                      </div>

                      <div className="bg-zinc-800/80 p-2.5 border border-zinc-700">
                        <span className="text-[8px] font-black uppercase text-zinc-400">Margem Contribuição</span>
                        <div className="text-sm font-bold text-[#eab308] mt-0.5">
                          {formatMoney(simulatedResult.projectedContributionMargin)}
                        </div>
                        <div className={`text-[9px] font-mono mt-0.5 ${simulatedResult.deltaContributionMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {simulatedResult.deltaContributionMargin >= 0 ? `+${formatMoney(simulatedResult.deltaContributionMargin)}` : formatMoney(simulatedResult.deltaContributionMargin)}
                        </div>
                      </div>

                      <div className="bg-zinc-800/80 p-2.5 border border-zinc-700">
                        <span className="text-[8px] font-black uppercase text-zinc-400">Lucro Operacional</span>
                        <div className="text-sm font-bold text-emerald-400 mt-0.5">
                          {formatMoney(simulatedResult.projectedOperatingProfit)}
                        </div>
                        <div className={`text-[9px] font-mono mt-0.5 ${simulatedResult.deltaOperatingProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {simulatedResult.deltaOperatingProfit >= 0 ? `+${formatMoney(simulatedResult.deltaOperatingProfit)}` : formatMoney(simulatedResult.deltaOperatingProfit)}
                        </div>
                      </div>

                      <div className="bg-zinc-800/80 p-2.5 border border-zinc-700">
                        <span className="text-[8px] font-black uppercase text-zinc-400">Volume Simulado</span>
                        <div className="text-sm font-bold text-white mt-0.5">
                          {simulatedResult.projectedUnits} un
                        </div>
                        <div className={`text-[9px] font-mono mt-0.5 ${simulatedResult.deltaUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {simulatedResult.deltaUnits >= 0 ? `+${simulatedResult.deltaUnits} un` : `${simulatedResult.deltaUnits} un`}
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-zinc-300 bg-zinc-800/50 p-2.5 border border-zinc-700/50 mt-3 font-mono">
                      {simulatedResult.summary}
                    </p>
                  </div>

                  <div className="text-[9px] text-zinc-400 border-t border-zinc-800 pt-2 flex items-center justify-between">
                    <span>* Simulação não altera nenhum produto no catálogo</span>
                    <span>Origem: Motor 9.6.1 + DRE Canônico</span>
                  </div>
                </div>
              )}

            </div>
          </div>
        </>
      )}

      {/* Modal de Criação de Novo Forecast */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center pb-2 border-b border-black/10">
              <h3 className="text-xs font-black uppercase tracking-wider text-black">
                Criar Nova Projeção de Forecast
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-black font-mono text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateForecast} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-700 block mb-1">
                  Título do Planejamento / Forecast *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Forecast Q3 2026 Expansão"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full text-xs font-bold border border-black/15 p-2 bg-white text-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-700 block mb-1">
                    Horizonte *
                  </label>
                  <select
                    value={newHorizon}
                    onChange={e => {
                      const h = e.target.value as ForecastHorizon;
                      setNewHorizon(h);
                      if (h !== 'custom') {
                        const { startDate, endDate } = computeHorizonDefaultDates(h);
                        setNewStartDate(startDate);
                        setNewEndDate(endDate);
                      }
                    }}
                    className="w-full text-xs border border-black/15 p-2 bg-white text-black"
                  >
                    <option value="current_month">Mês Atual</option>
                    <option value="next_month">Próximo Mês</option>
                    <option value="quarter">Trimestre</option>
                    <option value="year">Anual</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-700 block mb-1">
                    Data Início *
                  </label>
                  <input
                    type="date"
                    required
                    value={newStartDate}
                    onChange={e => setNewStartDate(e.target.value)}
                    className="w-full text-xs border border-black/15 p-2 bg-white text-black font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-700 block mb-1">
                  Data Fim *
                </label>
                <input
                  type="date"
                  required
                  value={newEndDate}
                  onChange={e => setNewEndDate(e.target.value)}
                  className="w-full text-xs border border-black/15 p-2 bg-white text-black font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-700 block mb-1">
                  Observações / Premissas
                </label>
                <textarea
                  rows={2}
                  placeholder="Premissas comerciais, metas corporativas, etc."
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  className="w-full text-xs border border-black/15 p-2 bg-white text-black"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-black/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-600 hover:text-black"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-black text-[#eab308] border border-black text-[10px] font-black uppercase tracking-wider hover:bg-zinc-800 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSubmitting ? 'Gerando Baseline...' : 'Gerar e Salvar Forecast'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

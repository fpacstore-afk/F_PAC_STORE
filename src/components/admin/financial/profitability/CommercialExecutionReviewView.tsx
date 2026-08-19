import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Lock,
  Archive,
  ArrowRight,
  Layers,
  Award,
  Sparkles,
  BarChart3,
  Calendar,
  DollarSign,
  PlusCircle,
  HelpCircle,
  Clock,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Filter
} from 'lucide-react';
import {
  CommercialExecutionReview,
  CommercialLearningInsight,
  CommercialHistoricalLearningSummary,
  CommercialActionEffectiveness,
  CommercialExecutionReviewActionSnapshot
} from '../../../../types/commercialReview';
import { CommercialExecutionCycle } from '../../../../types/commercialExecution';
import { commercialReviewService } from '../../../../services/commercial/commercialReviewService';

export const CommercialExecutionReviewView: React.FC = () => {
  const [reviews, setReviews] = useState<CommercialExecutionReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<CommercialExecutionReview | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'bridge' | 'budget' | 'forecast' | 'actions' | 'insights' | 'history' | 'events'>('overview');
  const [historicalSummary, setHistoricalSummary] = useState<CommercialHistoricalLearningSummary | null>(null);
  const [events, setEvents] = useState<any[]>([]);

  // Estado para snapshots de ações paginadas (FASE 9.6.8 / 9.6.8-D)
  const [actionSnapshots, setActionSnapshots] = useState<CommercialExecutionReviewActionSnapshot[]>([]);
  const [actionsLoading, setActionsLoading] = useState<boolean>(false);
  const [actionsPage, setActionsPage] = useState<number>(1);
  const [actionsCursor, setActionsCursor] = useState<string | null>(null);
  const [actionsNextCursor, setActionsNextCursor] = useState<string | null>(null);
  const [actionsCursorHistory, setActionsCursorHistory] = useState<(string | null)[]>([]);
  const [actionsHasMore, setActionsHasMore] = useState<boolean>(false);

  // Mapa de chaves de idempotência estáveis por operação/entidade via useRef síncrono (FASE 9.6.8-G / 9.6.8-G.1)
  const operationKeysRef = useRef<Record<string, { key: string; payloadHash: string }>>({});

  const getStableIdempotencyKey = (operationId: string, payload: any = {}): string => {
    const payloadHash = JSON.stringify(payload);
    const existing = operationKeysRef.current[operationId];
    if (existing && existing.payloadHash === payloadHash) {
      return existing.key;
    }
    const newKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    operationKeysRef.current[operationId] = { key: newKey, payloadHash };
    return newKey;
  };

  const clearStableIdempotencyKey = (operationId: string) => {
    delete operationKeysRef.current[operationId];
  };

  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal para criar novo review
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newCycleId, setNewCycleId] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');

  // Modal para converter insight em ação comercial (FASE 9.6.8-C / 9.6.8-D)
  const [showConvertModal, setShowConvertModal] = useState<boolean>(false);
  const [selectedInsightForAction, setSelectedInsightForAction] = useState<CommercialLearningInsight | null>(null);
  const [availableTargetCycles, setAvailableTargetCycles] = useState<CommercialExecutionCycle[]>([]);
  const [selectedTargetCycleId, setSelectedTargetCycleId] = useState<string>('');
  const [actionTitle, setActionTitle] = useState<string>('');
  const [actionPriority, setActionPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [actionProductLine, setActionProductLine] = useState<'FORCE' | 'MARK' | 'PRIME' | 'OTHER' | 'ALL'>('ALL');

  const loadReviews = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await commercialReviewService.listReviews({ limit: 50 });
      setReviews(res.reviews || []);
      if (res.reviews && res.reviews.length > 0) {
        // Preserva o selecionado se já existir, senão pega o primeiro
        setSelectedReview(prev => {
          if (!prev) return res.reviews[0];
          const found = res.reviews.find(r => r.id === prev.id);
          return found || res.reviews[0];
        });
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar reviews comerciais.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistoricalSummary = useCallback(async () => {
    try {
      const summary = await commercialReviewService.getHistoricalLearningSummary();
      setHistoricalSummary(summary);
    } catch (err: any) {
      console.error('Falha ao buscar sumário histórico:', err);
    }
  }, []);

  const loadEvents = useCallback(async (reviewId: string) => {
    try {
      const res = await commercialReviewService.listReviewEvents(reviewId);
      setEvents(res.events || []);
    } catch (err: any) {
      console.error('Falha ao carregar eventos:', err);
    }
  }, []);

  const loadReviewActions = useCallback(async (reviewId: string, cursor?: string | null) => {
    try {
      setActionsLoading(true);
      const res = await commercialReviewService.listReviewActions(reviewId, {
        limit: 10,
        cursor: cursor || undefined
      });
      setActionSnapshots(res.actions || []);
      setActionsHasMore(res.pagination?.hasMore || false);
      setActionsNextCursor(res.pagination?.nextCursor || null);
    } catch (err: any) {
      console.error('Falha ao carregar ações do review:', err);
    } finally {
      setActionsLoading(false);
    }
  }, []);

  const handleNextActionsPage = () => {
    if (!selectedReview?.id || !actionsNextCursor || !actionsHasMore) return;
    setActionsCursorHistory(prev => [...prev, actionsCursor]);
    setActionsCursor(actionsNextCursor);
    setActionsPage(prev => prev + 1);
    loadReviewActions(selectedReview.id, actionsNextCursor);
  };

  const handlePrevActionsPage = () => {
    if (!selectedReview?.id || actionsPage <= 1) return;
    const prevHistory = [...actionsCursorHistory];
    const prevCursor = prevHistory.pop() || null;
    setActionsCursorHistory(prevHistory);
    setActionsCursor(prevCursor);
    setActionsPage(prev => Math.max(1, prev - 1));
    loadReviewActions(selectedReview.id, prevCursor);
  };

  useEffect(() => {
    loadReviews();
    loadHistoricalSummary();
  }, [loadReviews, loadHistoricalSummary]);

  useEffect(() => {
    if (selectedReview?.id) {
      loadEvents(selectedReview.id);
      setActionsPage(1);
      setActionsCursor(null);
      setActionsNextCursor(null);
      setActionsCursorHistory([]);
      loadReviewActions(selectedReview.id, null);
    }
  }, [selectedReview?.id, loadEvents, loadReviewActions]);

  const handleGenerateReview = async () => {
    if (!selectedReview) return;
    const opId = `generate:${selectedReview.id}`;
    const key = getStableIdempotencyKey(opId, {});
    try {
      setActionLoading(true);
      setError(null);
      const updated = await commercialReviewService.generateReview(selectedReview.id, key);
      clearStableIdempotencyKey(opId);
      setSelectedReview(updated);
      setSuccessMessage('Pós-mortem gerado com sucesso com cálculos canônicos.');
      await loadReviews();
      await loadHistoricalSummary();
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar análise pós-mortem.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecalculateReview = async () => {
    if (!selectedReview) return;
    const opId = `recalculate:${selectedReview.id}`;
    const key = getStableIdempotencyKey(opId, {});
    try {
      setActionLoading(true);
      setError(null);
      const updated = await commercialReviewService.recalculateReview(selectedReview.id, key);
      clearStableIdempotencyKey(opId);
      setSelectedReview(updated);
      setSuccessMessage(`Pós-mortem recalculado (Versão ${updated.analysisVersion}).`);
      await loadReviews();
      await loadHistoricalSummary();
    } catch (err: any) {
      setError(err.message || 'Erro ao recalcular review.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveReview = async () => {
    if (!selectedReview) return;
    const confirm = window.confirm(
      'Atenção: Ao aprovar este Review Comercial, ele se tornará ESTRITAMENTE IMUTÁVEL para garantir governança contábil e auditoria. Deseja prosseguir?'
    );
    if (!confirm) return;

    const opId = `approve:${selectedReview.id}`;
    const key = getStableIdempotencyKey(opId, {});
    try {
      setActionLoading(true);
      setError(null);
      const updated = await commercialReviewService.approveReview(selectedReview.id, key);
      clearStableIdempotencyKey(opId);
      setSelectedReview(updated);
      setSuccessMessage('Review Comercial aprovado e congelado como imutável com sucesso.');
      await loadReviews();
      await loadHistoricalSummary();
    } catch (err: any) {
      setError(err.message || 'Erro ao aprovar review comercial.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchiveReview = async () => {
    if (!selectedReview) return;
    const opId = `archive:${selectedReview.id}`;
    const key = getStableIdempotencyKey(opId, {});
    try {
      setActionLoading(true);
      setError(null);
      const updated = await commercialReviewService.archiveReview(selectedReview.id, key);
      clearStableIdempotencyKey(opId);
      setSelectedReview(updated);
      setSuccessMessage('Review Comercial arquivado.');
      await loadReviews();
    } catch (err: any) {
      setError(err.message || 'Erro ao arquivar review.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCycleId.trim()) {
      setError('ID do ciclo de execução é obrigatório.');
      return;
    }
    const payload = {
      executionCycleId: newCycleId.trim(),
      title: newTitle.trim() || undefined,
      notes: newNotes.trim() || undefined
    };
    const opId = 'create';
    const key = getStableIdempotencyKey(opId, payload);
    try {
      setActionLoading(true);
      setError(null);
      const created = await commercialReviewService.createReview(payload, key);
      clearStableIdempotencyKey(opId);
      setShowCreateModal(false);
      setNewCycleId('');
      setNewTitle('');
      setNewNotes('');
      setSuccessMessage('Review Comercial criado em rascunho com sucesso.');
      await loadReviews();
      setSelectedReview(created);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar review comercial.');
    } finally {
      setActionLoading(false);
    }
  };

  const openConvertInsightModal = async (insight: CommercialLearningInsight) => {
    setSelectedInsightForAction(insight);
    setActionTitle(`[Plano Pós-Mortem] ${insight.title}`);
    setActionPriority('high');
    if (insight.type === 'PRODUCT_LINE') {
      const line = (insight.metrics?.bestMarginLine || insight.metrics?.topRevenueLine || insight.metrics?.line || 'ALL') as 'FORCE' | 'MARK' | 'PRIME' | 'OTHER' | 'ALL';
      setActionProductLine(['FORCE', 'MARK', 'PRIME', 'OTHER'].includes(line) ? line : 'ALL');
    } else {
      setActionProductLine('ALL');
    }
    try {
      setActionLoading(true);
      const validCycles = await commercialReviewService.listEligibleTargetCycles();
      setAvailableTargetCycles(validCycles);
      if (validCycles.length > 0) {
        setSelectedTargetCycleId(validCycles[0].id);
      } else {
        setSelectedTargetCycleId('');
      }
      setShowConvertModal(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar ciclos de destino.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmConvertInsight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview || !selectedInsightForAction) return;
    if (!selectedTargetCycleId) {
      setError('Selecione um ciclo de execução alvo ativo ou em planejamento.');
      return;
    }
    const payload = {
      targetCycleId: selectedTargetCycleId,
      title: actionTitle.trim() || undefined,
      priority: actionPriority,
      productLine: actionProductLine
    };
    const opId = `create-action:${selectedReview.id}:${selectedInsightForAction.id}:${selectedTargetCycleId}`;
    const key = getStableIdempotencyKey(opId, payload);
    try {
      setActionLoading(true);
      setError(null);
      const res = await commercialReviewService.convertInsightToAction(
        selectedReview.id,
        selectedInsightForAction.id,
        payload,
        key
      );
      clearStableIdempotencyKey(opId);
      setShowConvertModal(false);
      setSelectedInsightForAction(null);
      setSuccessMessage(
        res.alreadyCreated
          ? `Ação comercial já existente para este insight (ID: ${res.action?.id}).`
          : `Nova ação comercial criada com sucesso a partir do insight (ID: ${res.action?.id})!`
      );
      const refreshed = await commercialReviewService.getReviewById(selectedReview.id);
      setSelectedReview(refreshed);
    } catch (err: any) {
      setError(err.message || 'Erro ao converter insight em ação comercial.');
    } finally {
      setActionLoading(false);
    }
  };

  const isImmutable = selectedReview?.status === 'approved' || selectedReview?.status === 'archived';
  const outcome = selectedReview?.outcomeSnapshot;

  return (
    <div className="space-y-6">
      {/* Top Notification Bar */}
      {error && (
        <div className="p-4 rounded-lg bg-red-900/30 border border-red-500/50 text-red-200 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-xs uppercase tracking-wider font-semibold">
            Fechar
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-900/30 border border-emerald-500/50 text-emerald-200 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200 text-xs uppercase tracking-wider font-semibold">
            Fechar
          </button>
        </div>
      )}

      {/* Header com Selector e Ações Globais */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Award className="w-6 h-6 text-amber-400" />
              Pós-Mortem Comercial & Eficácia de Ações (9.6.8)
            </h1>
            {selectedReview && (
              <span className={`px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${
                selectedReview.status === 'approved'
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60'
                  : selectedReview.status === 'generated'
                  ? 'bg-blue-950/80 text-blue-400 border border-blue-700/60'
                  : selectedReview.status === 'archived'
                  ? 'bg-slate-800 text-slate-400 border border-slate-700'
                  : 'bg-amber-950/80 text-amber-400 border border-amber-700/60'
              }`}>
                {selectedReview.status === 'approved' ? 'Aprovado (Imutável)' : selectedReview.status}
              </span>
            )}
            {selectedReview?.analysisVersion && selectedReview.analysisVersion > 1 && (
              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded border border-slate-700">
                v{selectedReview.analysisVersion}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Fechamento oficial de ciclo, variance bridge cent-exact, eficácia de ações e aprendizado contínuo.
          </p>
        </div>

        {/* Review Selector and Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {reviews.length > 0 && (
            <select
              value={selectedReview?.id || ''}
              onChange={(e) => {
                const found = reviews.find(r => r.id === e.target.value);
                if (found) setSelectedReview(found);
              }}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {reviews.map(r => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.status})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="whitespace-nowrap">Novo Review</span>
          </button>

          {selectedReview && selectedReview.status === 'draft' && (
            <button
              onClick={handleGenerateReview}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span className="whitespace-nowrap">Gerar Pós-Mortem</span>
            </button>
          )}

          {selectedReview && selectedReview.status === 'generated' && (
            <>
              <button
                onClick={handleRecalculateReview}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 transition disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="whitespace-nowrap">Recalcular</span>
              </button>
              <button
                onClick={handleApproveReview}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span className="whitespace-nowrap">Aprovar Review</span>
              </button>
            </>
          )}

          {selectedReview && selectedReview.status === 'approved' && (
            <button
              onClick={handleArchiveReview}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg border border-slate-700 transition disabled:opacity-50"
            >
              <Archive className="w-4 h-4" />
              <span className="whitespace-nowrap">Arquivar</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs de Navegação */}
      <div className="flex border-b border-slate-800 space-x-1 overflow-x-auto pb-px">
        {[
          { id: 'overview', label: 'Visão Geral', icon: FileText },
          { id: 'bridge', label: 'Variance Bridge', icon: BarChart3 },
          { id: 'budget', label: 'Budget vs Actual', icon: DollarSign },
          { id: 'forecast', label: 'Calibração Forecast', icon: TrendingUp },
          { id: 'actions', label: 'Eficácia de Ações', icon: Award },
          { id: 'insights', label: 'Insights & Ações', icon: Sparkles },
          { id: 'history', label: 'Histórico Acumulado', icon: Layers },
          { id: 'events', label: 'Auditoria', icon: Clock }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                isActive
                  ? 'border-blue-500 text-blue-400 bg-slate-800/50 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo das Tabs */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-3" />
          <p>Carregando análises de pós-mortem comercial...</p>
        </div>
      ) : !selectedReview ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          <Award className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-200 mb-1">Nenhum Review Comercial Encontrado</h3>
          <p className="text-sm text-slate-400 mb-4">Crie um review para um ciclo de execução concluído para iniciar a análise.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition"
          >
            Criar Primeiro Review
          </button>
        </div>
      ) : (
        <>
          {/* TAB 1: VISÃO GERAL */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Resumo Executivo Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Sumário Executivo do Ciclo
                </h2>

                {selectedReview.summary ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/60">
                      <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Aderência ao Budget</span>
                      <span className={`text-base font-bold capitalize ${
                        selectedReview.summary.budgetAdherence === 'exceeded' || selectedReview.summary.budgetAdherence === 'achieved'
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}>
                        {selectedReview.summary.budgetAdherence === 'exceeded' ? 'Superou a Meta' : (selectedReview.summary.budgetAdherence === 'achieved' ? 'Meta Atingida' : 'Abaixo da Meta')}
                      </span>
                    </div>

                    <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/60">
                      <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Principal Driver de Desvio</span>
                      <span className="text-base font-bold text-slate-200">
                        {selectedReview.summary.primaryVarianceDriver}
                      </span>
                    </div>

                    <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/60">
                      <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Taxa de Conclusão de Ações</span>
                      <span className="text-base font-bold text-blue-400">
                        {selectedReview.summary.actionEffectivenessRate.toFixed(1)}%
                      </span>
                    </div>

                    <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/60">
                      <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Acurácia do Forecast</span>
                      <span className="text-base font-bold capitalize text-amber-400">
                        {selectedReview.summary.forecastAccuracyRating === 'high' ? 'Alta Precisão' : (selectedReview.summary.forecastAccuracyRating === 'medium' ? 'Moderada' : 'Baixa')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-800/40 rounded-lg text-sm text-slate-400">
                    O review está em rascunho. Clique em <strong>"Gerar Pós-Mortem"</strong> para calcular o sumário e todos os indicadores.
                  </div>
                )}

                {selectedReview.summary?.headline && (
                  <div className="mt-4 p-3 bg-blue-950/30 border border-blue-800/40 rounded-lg text-sm text-blue-200">
                    <strong>Conclusão do Ciclo:</strong> {selectedReview.summary.headline}
                  </div>
                )}
              </div>

              {/* Métricas Finais Realizadas */}
              {outcome?.finalActuals && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-emerald-400" />
                      Resultado Financeiro Realizado Oficial
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Cobertura de Custo:</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {outcome.finalActuals.costCoveragePercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400 uppercase">Receita Líquida</span>
                      <p className="text-xl font-bold text-slate-100 mt-1">R$ {outcome.finalActuals.revenue.toFixed(2)}</p>
                      <span className="text-xs text-slate-500">{outcome.finalActuals.orders} pedidos ({outcome.finalActuals.units} peças)</span>
                    </div>

                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400 uppercase">Ticket Médio</span>
                      <p className="text-xl font-bold text-slate-100 mt-1">R$ {outcome.finalActuals.averageTicket.toFixed(2)}</p>
                      <span className="text-xs text-slate-500">por pedido realizado</span>
                    </div>

                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400 uppercase">Margem de Contribuição</span>
                      <p className="text-xl font-bold text-emerald-400 mt-1">R$ {outcome.finalActuals.contributionMargin.toFixed(2)}</p>
                      <span className="text-xs text-emerald-500/80">{outcome.finalActuals.contributionMarginPercent.toFixed(1)}% da receita</span>
                    </div>

                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400 uppercase">Lucro Operacional</span>
                      <p className="text-xl font-bold text-blue-400 mt-1">R$ {outcome.finalActuals.operatingProfit.toFixed(2)}</p>
                      <span className="text-xs text-blue-500/80">{outcome.finalActuals.operatingProfitPercent.toFixed(1)}% de margem líquida</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VARIANCE BRIDGE */}
          {activeTab === 'bridge' && (
            <div className="space-y-6">
              {outcome?.varianceBridge ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-purple-400" />
                        Ponte de Variação de Receita (Variance Bridge)
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Decomposição exata: Efeito Volume + Efeito Ticket Médio + Residual = Variação Total
                      </p>
                    </div>
                    {outcome.varianceBridge.isCentExact && (
                      <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-700/60">
                        <ShieldCheck className="w-3.5 h-3.5" /> Reconciliado ao Centavo
                      </span>
                    )}
                  </div>

                  {/* Variance Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/60">
                      <span className="text-xs text-slate-400 uppercase">Receita Orçada</span>
                      <p className="text-lg font-bold text-slate-200 mt-1">R$ {outcome.varianceBridge.budgetRevenue.toFixed(2)}</p>
                    </div>

                    <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/60">
                      <span className="text-xs text-slate-400 uppercase">Efeito Volume de Pedidos</span>
                      <p className={`text-lg font-bold mt-1 ${outcome.varianceBridge.orderVolumeEffect >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {outcome.varianceBridge.orderVolumeEffect >= 0 ? '+' : ''}R$ {outcome.varianceBridge.orderVolumeEffect.toFixed(2)}
                      </p>
                      <span className="text-xs text-slate-500">(Qtd Real - Meta) × Ticket Base</span>
                    </div>

                    <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/60">
                      <span className="text-xs text-slate-400 uppercase">Efeito Ticket Médio</span>
                      <p className={`text-lg font-bold mt-1 ${outcome.varianceBridge.ticketEffect >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {outcome.varianceBridge.ticketEffect >= 0 ? '+' : ''}R$ {outcome.varianceBridge.ticketEffect.toFixed(2)}
                      </p>
                      <span className="text-xs text-slate-500">Qtd Real × (Ticket Real - Ticket Meta)</span>
                    </div>

                    <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/60">
                      <span className="text-xs text-slate-400 uppercase">Receita Realizada</span>
                      <p className="text-lg font-bold text-slate-100 mt-1">R$ {outcome.varianceBridge.actualRevenue.toFixed(2)}</p>
                      <span className={`text-xs font-semibold ${outcome.varianceBridge.totalVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        Variação Total: {outcome.varianceBridge.totalVariance >= 0 ? '+' : ''}R$ {outcome.varianceBridge.totalVariance.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Planning Residual Alert se existir */}
                  {outcome.varianceBridge.residualExplanation && (
                    <div className="p-4 bg-amber-950/30 border border-amber-700/50 rounded-lg text-sm text-amber-300 flex items-start gap-3 mb-6">
                      <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block">Residual de Planejamento (R$ {outcome.varianceBridge.planningResidual.toFixed(2)}):</span>
                        <p className="text-xs text-amber-200/90 mt-0.5">{outcome.varianceBridge.residualExplanation}</p>
                      </div>
                    </div>
                  )}

                  {/* Drivers Breakdown Table */}
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">Detalhamento dos Drivers de Desvio</h3>
                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-800/80 text-xs uppercase text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Driver</th>
                          <th className="px-4 py-3 text-right">Impacto</th>
                          <th className="px-4 py-3 text-center">Classificação</th>
                          <th className="px-4 py-3">Explicação do Fator</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {outcome.varianceBridge.drivers.map((d, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="px-4 py-3 font-semibold text-slate-200">{d.driver}</td>
                            <td className={`px-4 py-3 text-right font-bold ${d.favorable ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {d.amount >= 0 ? '+' : ''}R$ {d.amount.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded ${d.favorable ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60' : 'bg-rose-950/80 text-rose-400 border border-rose-700/60'}`}>
                                {d.favorable ? 'Favorável' : 'Desfavorável'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">{d.explanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400">Pós-mortem ainda não gerado.</div>
              )}
            </div>
          )}

          {/* TAB 3: BUDGET VS REALIZADO */}
          {activeTab === 'budget' && (
            <div className="space-y-6">
              {outcome?.budgetComparisons ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    Comparativo Completo: Budget Aprovado vs Realizado
                  </h2>

                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-800/80 text-xs uppercase text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Linha / Métrica</th>
                          <th className="px-4 py-3 text-right">Orçado (Budget)</th>
                          <th className="px-4 py-3 text-right">Realizado (Actual)</th>
                          <th className="px-4 py-3 text-right">Variação Absoluta</th>
                          <th className="px-4 py-3 text-right">Variação %</th>
                          <th className="px-4 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {[
                          { label: 'Receita Bruta/Líquida', data: outcome.budgetComparisons.revenue, isCurrency: true },
                          { label: 'Volume de Pedidos', data: outcome.budgetComparisons.orders, isCurrency: false },
                          { label: 'Volume de Unidades', data: outcome.budgetComparisons.units, isCurrency: false },
                          { label: 'Ticket Médio', data: outcome.budgetComparisons.averageTicket, isCurrency: true },
                          { label: 'CPV / COGS', data: outcome.budgetComparisons.cogs, isCurrency: true },
                          { label: 'Taxas Gateway', data: outcome.budgetComparisons.gatewayFees, isCurrency: true },
                          { label: 'Subsídio de Frete', data: outcome.budgetComparisons.shippingSubsidy, isCurrency: true },
                          { label: 'Investimento Marketing', data: outcome.budgetComparisons.marketingSpend, isCurrency: true },
                          { label: 'Margem de Contribuição', data: outcome.budgetComparisons.contributionMargin, isCurrency: true },
                          { label: 'Lucro Operacional', data: outcome.budgetComparisons.operatingProfit, isCurrency: true }
                        ].map((row, idx) => {
                          const isAvail = row.data.available !== false;
                          return (
                            <tr key={idx} className="hover:bg-slate-800/30">
                              <td className="px-4 py-3 font-semibold text-slate-200">{row.label}</td>
                              <td className="px-4 py-3 text-right font-medium text-slate-300">
                                {isAvail ? (row.isCurrency ? `R$ ${row.data.budget.toFixed(2)}` : row.data.budget) : <span className="text-slate-500 text-xs">Não estipulado</span>}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-100">
                                {row.isCurrency ? `R$ ${row.data.actual.toFixed(2)}` : row.data.actual}
                              </td>
                              <td className={`px-4 py-3 text-right font-bold ${isAvail ? (row.data.favorable ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-500'}`}>
                                {isAvail ? `${row.data.varianceAbsolute >= 0 ? '+' : ''}${row.isCurrency ? `R$ ${row.data.varianceAbsolute.toFixed(2)}` : row.data.varianceAbsolute}` : '—'}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold ${isAvail ? (row.data.favorable ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-500'}`}>
                                {isAvail && row.data.variancePercent !== null ? `${row.data.variancePercent >= 0 ? '+' : ''}${row.data.variancePercent.toFixed(1)}%` : '—'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isAvail ? (
                                  <span className={`px-2 py-0.5 text-xs font-semibold rounded ${row.data.favorable ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60' : 'bg-rose-950/80 text-rose-400 border border-rose-700/60'}`}>
                                    {row.data.favorable ? 'Favorável' : 'Desfavorável'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-800 text-slate-400 border border-slate-700">
                                    N/A
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400">Pós-mortem ainda não gerado.</div>
              )}
            </div>
          )}

          {/* TAB 4: CALIBRAÇÃO FORECAST */}
          {activeTab === 'forecast' && (
            <div className="space-y-6">
              {outcome?.forecastCalibration ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-400" />
                        Calibração do Modelo de Forecast ({outcome.forecastCalibration.forecastTitle || 'Forecast Vinculado'})
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Avaliação de viés (Bias) e erro médio percentual absoluto (MAPE).
                      </p>
                    </div>
                    {outcome.forecastCalibration.meanAbsolutePercentageError !== null && (
                      <span className="text-xs font-semibold px-3 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">
                        MAPE: {outcome.forecastCalibration.meanAbsolutePercentageError.toFixed(1)}%
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto border border-slate-800 rounded-lg mb-6">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-800/80 text-xs uppercase text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Métrica</th>
                          <th className="px-4 py-3 text-right">Previsto (Forecast)</th>
                          <th className="px-4 py-3 text-right">Realizado (Actual)</th>
                          <th className="px-4 py-3 text-right">Erro Absoluto</th>
                          <th className="px-4 py-3 text-right">Erro %</th>
                          <th className="px-4 py-3 text-center">Direção do Erro</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {outcome.forecastCalibration.metrics.map((m, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="px-4 py-3 font-semibold text-slate-200 capitalize">{m.metric}</td>
                            <td className="px-4 py-3 text-right text-slate-300">
                              {typeof m.forecastValue === 'number' ? m.forecastValue.toFixed(2) : m.forecastValue}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-100">
                              {typeof m.actualValue === 'number' ? m.actualValue.toFixed(2) : m.actualValue}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-300">
                              {m.error >= 0 ? '+' : ''}{m.error.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-200">
                              {m.errorPercent !== null ? `${m.errorPercent >= 0 ? '+' : ''}${m.errorPercent.toFixed(1)}%` : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                                m.direction === 'accurate'
                                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60'
                                  : m.direction === 'under_forecast'
                                  ? 'bg-blue-950/80 text-blue-400 border border-blue-700/60'
                                  : 'bg-amber-950/80 text-amber-400 border border-amber-700/60'
                              }`}>
                                {m.direction === 'accurate' ? 'Aderente' : (m.direction === 'under_forecast' ? 'Under-Forecast (Subestimou)' : 'Over-Forecast (Superestimou)')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {outcome.forecastCalibration.calibrationRecommendation && (
                    <div className="p-4 bg-blue-950/30 border border-blue-800/40 rounded-lg text-sm text-blue-200">
                      <strong>Recomendação de Calibração:</strong> {outcome.forecastCalibration.calibrationRecommendation}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400">Nenhum forecast vinculado a este ciclo.</div>
              )}
            </div>
          )}

          {/* TAB 5: EFICÁCIA DE AÇÕES */}
          {activeTab === 'actions' && (
            <div className="space-y-6">
              {outcome?.actionEffectivenessSummary ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                      <Award className="w-5 h-5 text-amber-400" />
                      Eficácia & Atribuição de Ações Comerciais
                    </h2>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-400">Taxa de Conclusão: <strong className="text-slate-200">{outcome.actionEffectivenessSummary.completionRate}%</strong></span>
                      <span className="text-slate-400">Receita Atribuída Direta: <strong className="text-emerald-400">R$ {outcome.actionEffectivenessSummary.directAttributedRevenue.toFixed(2)}</strong></span>
                    </div>
                  </div>

                  {/* Summary Badges */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400">Superaram a Meta</span>
                      <p className="text-lg font-bold text-emerald-400">{outcome.actionEffectivenessSummary.exceededCount}</p>
                    </div>
                    <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400">Atingiram a Meta</span>
                      <p className="text-lg font-bold text-blue-400">{outcome.actionEffectivenessSummary.metCount}</p>
                    </div>
                    <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400">Abaixo do Esperado</span>
                      <p className="text-lg font-bold text-rose-400">{outcome.actionEffectivenessSummary.belowExpectedCount}</p>
                    </div>
                    <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400">Dados Insuficientes</span>
                      <p className="text-lg font-bold text-amber-400">{outcome.actionEffectivenessSummary.insufficientCount}</p>
                    </div>
                  </div>

                  {/* Tabela de Ações Auditadas com Paginação Server-side */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-slate-400" />
                        Snapshots de Ações Avaliadas no Ciclo
                      </h3>
                      {actionsLoading && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando ações...
                        </span>
                      )}
                    </div>

                    <div className="overflow-x-auto border border-slate-800 rounded-lg">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-800/80 uppercase text-slate-400">
                          <tr>
                            <th className="px-4 py-3">Ação Comercial</th>
                            <th className="px-4 py-3">Prioridade / Linha</th>
                            <th className="px-4 py-3">Execução</th>
                            <th className="px-4 py-3 text-right">Impacto Previsto</th>
                            <th className="px-4 py-3 text-right">Impacto Real</th>
                            <th className="px-4 py-3 text-center">Atribuição / Resultado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {actionSnapshots.map((act) => (
                            <tr key={act.id} className="hover:bg-slate-800/30">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-200">{act.title}</div>
                                <div className="text-slate-500 font-mono text-[10px]">{act.actionId}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                                    act.priority === 'critical' ? 'bg-rose-950 text-rose-400 border border-rose-800/60' :
                                    act.priority === 'high' ? 'bg-amber-950 text-amber-400 border border-amber-800/60' :
                                    'bg-slate-800 text-slate-300'
                                  }`}>
                                    {act.priority}
                                  </span>
                                  {act.productLine && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                                      {act.productLine}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                                  act.executionSnapshot?.executionStatus === 'completed'
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60'
                                    : act.executionSnapshot?.executionStatus === 'in_progress'
                                    ? 'bg-blue-950/80 text-blue-400 border border-blue-700/60'
                                    : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {act.executionSnapshot?.executionStatus || 'N/A'} ({act.executionSnapshot?.progressPercent || 0}%)
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {act.expectedImpactSnapshot?.revenue !== undefined ? (
                                  <span className="font-medium text-slate-300">R$ {Number(act.expectedImpactSnapshot.revenue).toFixed(2)}</span>
                                ) : (
                                  <span className="text-slate-500">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {act.actualImpactSnapshot?.revenue !== undefined ? (
                                  <span className="font-bold text-slate-100">R$ {Number(act.actualImpactSnapshot.revenue).toFixed(2)}</span>
                                ) : (
                                  <span className="text-slate-500">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  act.effectivenessResult === 'exceeded' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                  act.effectivenessResult === 'met' ? 'bg-blue-950 text-blue-400 border border-blue-800' :
                                  act.effectivenessResult === 'below_expected' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                                  'bg-slate-800 text-slate-400'
                                }`}>
                                  {act.effectivenessResult === 'exceeded' ? 'Superou' :
                                   act.effectivenessResult === 'met' ? 'Atingiu' :
                                   act.effectivenessResult === 'below_expected' ? 'Abaixo' : 'Sem dados'}
                                </span>
                                <div className="text-[10px] text-slate-500 mt-0.5 capitalize">
                                  Atribuição: {act.attributionSnapshot || 'insufficient'}
                                </div>
                              </td>
                            </tr>
                          ))}

                          {actionSnapshots.length === 0 && !actionsLoading && (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                Nenhuma ação comercial avaliada encontrada neste review.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Controles de Paginação Server-side */}
                    <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                      <span>Página {actionsPage}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handlePrevActionsPage}
                          disabled={actionsPage <= 1 || actionsLoading}
                          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300 transition"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                        </button>
                        <button
                          onClick={handleNextActionsPage}
                          disabled={!actionsHasMore || actionsLoading}
                          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300 transition"
                        >
                          Próxima <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400">Pós-mortem ainda não gerado.</div>
              )}
            </div>
          )}

          {/* TAB 6: INSIGHTS & APRENDIZADO CONTÍNUO */}
          {activeTab === 'insights' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    Insights de Aprendizado Contínuo com Evidências
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Insights auditáveis gerados com evidências numéricas para o próximo ciclo de planejamento.
                  </p>
                </div>
              </div>

              {outcome?.learningInsights && outcome.learningInsights.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {outcome.learningInsights.map(insight => (
                    <div key={insight.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-950/80 text-blue-400 border border-blue-700/60">
                              {insight.type}
                            </span>
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                              insight.confidence === 'high' ? 'bg-emerald-950/80 text-emerald-400' : 'bg-amber-950/80 text-amber-400'
                            }`}>
                              Confiança: {insight.confidence}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-slate-100">{insight.title}</h3>
                          <p className="text-sm text-slate-300 mt-1">{insight.description}</p>
                        </div>

                        {insight.canCreateAction && (
                          <div className="shrink-0">
                            {insight.convertedActionId ? (
                              <span className="px-3 py-1.5 bg-emerald-950/80 text-emerald-400 text-xs font-semibold rounded-lg border border-emerald-700/60 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4" /> Plano Criado
                              </span>
                            ) : (
                              <button
                                onClick={() => openConvertInsightModal(insight)}
                                disabled={actionLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                                <span className="whitespace-nowrap">Criar Plano de Ação</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Evidence Table */}
                      {insight.evidence && insight.evidence.length > 0 && (
                        <div className="overflow-x-auto border border-slate-800 rounded-lg bg-slate-950/40">
                          <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-800/60 text-slate-400">
                              <tr>
                                <th className="px-3 py-2">Métrica de Evidência</th>
                                <th className="px-3 py-2 text-right">Referência / Meta</th>
                                <th className="px-3 py-2 text-right">Realizado</th>
                                <th className="px-3 py-2 text-right">Variação</th>
                                <th className="px-3 py-2">Fonte dos Dados</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {insight.evidence.map((ev, eIdx) => (
                                <tr key={eIdx}>
                                  <td className="px-3 py-2 font-medium text-slate-200">{ev.metric}</td>
                                  <td className="px-3 py-2 text-right text-slate-400">{ev.referenceValue}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-slate-100">{ev.actualValue}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-blue-400">{ev.variance}</td>
                                  <td className="px-3 py-2 text-slate-500">{ev.source}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {insight.recommendedNextStep && (
                        <div className="p-3 bg-slate-800/60 rounded-lg text-xs text-slate-300 flex items-start gap-2">
                          <ArrowRight className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-slate-200">Próximo Passo Recomendado:</span> {insight.recommendedNextStep}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400">Nenhum insight gerado para este ciclo.</div>
              )}
            </div>
          )}

          {/* TAB 7: HISTÓRICO ACUMULADO */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              {historicalSummary ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                        <Layers className="w-5 h-5 text-purple-400" />
                        Sumário de Aprendizado Histórico Agregado
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Consolidação exclusiva de reviews <strong>APROVADOS</strong> com governança de tamanho de amostra.
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded text-xs font-semibold border ${
                      historicalSummary.confidence === 'high'
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                        : historicalSummary.confidence === 'medium'
                        ? 'bg-blue-950/80 text-blue-400 border-blue-700/60'
                        : 'bg-amber-950/80 text-amber-400 border-amber-700/60'
                    }`}>
                      Confiança da Amostra: {historicalSummary.confidence} ({historicalSummary.reviewCount} ciclos)
                    </span>
                  </div>

                  {/* Sample Rule Banner */}
                  <div className="p-4 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-slate-300">
                    <strong>Governança de Amostra:</strong> {historicalSummary.confidenceReason}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400 uppercase">Ciclos Aprovados</span>
                      <p className="text-2xl font-bold text-slate-100 mt-1">{historicalSummary.reviewCount}</p>
                    </div>

                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400 uppercase">Desvio Médio Budget</span>
                      <p className="text-2xl font-bold text-blue-400 mt-1">
                        {historicalSummary.averageBudgetVariancePercent !== null ? `${historicalSummary.averageBudgetVariancePercent.toFixed(1)}%` : '-'}
                      </p>
                    </div>

                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400 uppercase">Viés Histórico Forecast</span>
                      <p className="text-2xl font-bold text-amber-400 mt-1 capitalize">
                        {historicalSummary.forecastBias.direction}
                      </p>
                    </div>

                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400 uppercase">Taxa Conclusão Ações</span>
                      <p className="text-2xl font-bold text-emerald-400 mt-1">
                        {historicalSummary.actionCompletionRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Performance por Linha de Produto */}
                  {historicalSummary.linePerformanceSummary.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-300 mb-3">Performance Histórica por Linha de Produto</h3>
                      <div className="overflow-x-auto border border-slate-800 rounded-lg">
                        <table className="w-full text-left text-sm text-slate-300">
                          <thead className="bg-slate-800/80 text-xs uppercase text-slate-400">
                            <tr>
                              <th className="px-4 py-3">Linha</th>
                              <th className="px-4 py-3 text-right">Receita Total Acumulada</th>
                              <th className="px-4 py-3 text-right">Margem Média %</th>
                              <th className="px-4 py-3 text-right">Share de Receita</th>
                              <th className="px-4 py-3 text-center">Ciclos Contabilizados</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {historicalSummary.linePerformanceSummary.map((line, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/30">
                                <td className="px-4 py-3 font-semibold text-slate-200">{line.line}</td>
                                <td className="px-4 py-3 text-right text-slate-100 font-bold">R$ {line.totalRevenue.toFixed(2)}</td>
                                <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{line.averageContributionMarginPercent.toFixed(1)}%</td>
                                <td className="px-4 py-3 text-right text-slate-300">{line.shareOfRevenuePercent.toFixed(1)}%</td>
                                <td className="px-4 py-3 text-center text-slate-400">{line.reviewsCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Ajuste de Calibração Sugerido */}
                  {historicalSummary.suggestedCalibrationAdjustment && (
                    <div className="p-4 bg-purple-950/30 border border-purple-800/40 rounded-lg text-sm text-purple-200 space-y-2">
                      <div className="font-semibold text-purple-100 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        Recomendação de Calibração para o Próximo Ciclo:
                      </div>
                      <p className="text-xs text-purple-300">{historicalSummary.suggestedCalibrationAdjustment.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400">Nenhum dado histórico agregado disponível.</div>
              )}
            </div>
          )}

          {/* TAB 8: AUDITORIA / EVENTOS */}
          {activeTab === 'events' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-400" />
                Trilha de Auditoria do Review Comercial
              </h2>
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/80 uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Evento</th>
                      <th className="px-4 py-3">Usuário / Ator</th>
                      <th className="px-4 py-3">ID do Evento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {events.map((ev, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-400">{new Date(ev.timestamp).toLocaleString()}</td>
                        <td className="px-4 py-3 font-semibold text-slate-200">{ev.eventType}</td>
                        <td className="px-4 py-3 text-slate-300">{ev.actorEmail || ev.actorUid || 'Sistema'}</td>
                        <td className="px-4 py-3 font-mono text-slate-500">{ev.id}</td>
                      </tr>
                    ))}
                    {events.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                          Nenhum evento registrado ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Criar Novo Review */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-blue-400" />
              Criar Novo Review Comercial
            </h3>
            <form onSubmit={handleCreateReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  ID do Ciclo de Execução (Completed / Archived) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: cycle_1739..."
                  value={newCycleId}
                  onChange={e => setNewCycleId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Título do Review
                </label>
                <input
                  type="text"
                  placeholder="ex: Review Comercial Março 2026"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Anotações / Contexto
                </label>
                <textarea
                  rows={3}
                  placeholder="Observações iniciais sobre o encerramento do ciclo..."
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); clearStableIdempotencyKey('create'); }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                >
                  Criar Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Converter Insight em Ação Comercial (FASE 9.6.8-C) */}
      {showConvertModal && selectedInsightForAction && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-blue-400" />
                Criar Plano de Ação a partir do Insight
              </h3>
              <button
                onClick={() => {
                  if (selectedReview && selectedInsightForAction) {
                    clearStableIdempotencyKey(`create-action:${selectedReview.id}:${selectedInsightForAction.id}`);
                  }
                  setShowConvertModal(false);
                  setSelectedInsightForAction(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1">
              <span className="text-xs font-semibold text-blue-400">{selectedInsightForAction.type}</span>
              <p className="text-sm font-medium text-slate-200">{selectedInsightForAction.title}</p>
              <p className="text-xs text-slate-400">{selectedInsightForAction.description}</p>
            </div>

            <form onSubmit={handleConfirmConvertInsight} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Ciclo de Destino (Ativo / Planejado) *
                </label>
                {availableTargetCycles.length > 0 ? (
                  <select
                    required
                    value={selectedTargetCycleId}
                    onChange={e => setSelectedTargetCycleId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableTargetCycles.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.title || c.id} ({c.status}) — {c.periodStart} a {c.periodEnd}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-300">
                    Nenhum ciclo operacional ativo ou em planejamento encontrado. Crie ou abra um ciclo antes de converter este insight em plano de ação.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Título da Ação Comercial
                </label>
                <input
                  type="text"
                  required
                  value={actionTitle}
                  onChange={e => setActionTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                    Linha de Produto
                  </label>
                  <select
                    value={actionProductLine}
                    onChange={e => setActionProductLine(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ALL">Todas as Linhas / Geral</option>
                    <option value="FORCE">FORCE</option>
                    <option value="MARK">MARK</option>
                    <option value="PRIME">PRIME</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                    Prioridade
                  </label>
                  <select
                    value={actionPriority}
                    onChange={e => setActionPriority(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="critical">Crítica</option>
                    <option value="high">Alta</option>
                    <option value="medium">Média</option>
                    <option value="low">Baixa</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedReview && selectedInsightForAction) {
                      clearStableIdempotencyKey(`create-action:${selectedReview.id}:${selectedInsightForAction.id}`);
                    }
                    setShowConvertModal(false);
                    setSelectedInsightForAction(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || availableTargetCycles.length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Criar Plano no Ciclo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

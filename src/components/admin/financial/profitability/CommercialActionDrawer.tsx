import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  User,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Play,
  Check,
  Ban,
  MessageSquare,
  History,
  FileText,
  ShieldCheck,
  TrendingUp,
  Tag,
  Send,
  AlertTriangle
} from 'lucide-react';
import {
  CommercialAction,
  CommercialActionEvent,
  CommercialActionStatus,
  CommercialActionResultClassification
} from '../../../../types/commercialGovernance';
import {
  fetchCommercialActionById,
  fetchCommercialActionEvents,
  approveCommercialAction,
  startCommercialAction,
  completeCommercialAction,
  dismissCommercialAction,
  cancelCommercialAction,
  addCommercialActionNote,
  createIdempotencyKey
} from '../../../../services/commercial/commercialGovernanceService';
import { isActionOverdue } from '../../../../utils/commercialGovernance';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { ProductProfitabilityItem } from '../../../../utils/profitability';

interface CommercialActionDrawerProps {
  actionId: string | null;
  onClose: () => void;
  onActionUpdated: (updatedAction: CommercialAction) => void;
  productsProfitability?: ProductProfitabilityItem[];
}

export const CommercialActionDrawer: React.FC<CommercialActionDrawerProps> = ({
  actionId,
  onClose,
  onActionUpdated,
  productsProfitability = []
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();
  const [action, setAction] = useState<CommercialAction | null>(null);
  const [events, setEvents] = useState<CommercialActionEvent[]>([]);
  const [eventsNextCursor, setEventsNextCursor] = useState<string | null>(null);
  const [eventsHasMore, setEventsHasMore] = useState<boolean>(false);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sub-forms state
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [resultNote, setResultNote] = useState('');
  const [resultClassification, setResultClassification] = useState<CommercialActionResultClassification>('successful');
  const [reasonText, setReasonText] = useState('');
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Stable Idempotency Keys per operation (preserved across errors/retries)
  const [approveKey, setApproveKey] = useState<string>(() => createIdempotencyKey('act_app'));
  const [startKey, setStartKey] = useState<string>(() => createIdempotencyKey('act_start'));
  const [completeKey, setCompleteKey] = useState<string>(() => createIdempotencyKey('act_comp'));
  const [dismissKey, setDismissKey] = useState<string>(() => createIdempotencyKey('act_dism'));
  const [cancelKey, setCancelKey] = useState<string>(() => createIdempotencyKey('act_canc'));
  const [noteKey, setNoteKey] = useState<string>(() => createIdempotencyKey('act_note'));

  useEffect(() => {
    if (!actionId) {
      setAction(null);
      setEvents([]);
      setEventsNextCursor(null);
      setEventsHasMore(false);
      return;
    }

    // Refresh action & keys on modal open
    setApproveKey(createIdempotencyKey('act_app'));
    setStartKey(createIdempotencyKey('act_start'));
    setCompleteKey(createIdempotencyKey('act_comp'));
    setDismissKey(createIdempotencyKey('act_dism'));
    setCancelKey(createIdempotencyKey('act_canc'));
    setNoteKey(createIdempotencyKey('act_note'));

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchCommercialActionById(actionId, { limit: 50 });
        setAction(data.action);
        setEvents(data.events || []);
        setEventsNextCursor(data.eventsNextCursor || null);
        setEventsHasMore(Boolean(data.eventsHasMore));
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar detalhes da ação comercial.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [actionId]);

  const handleLoadMoreEvents = async () => {
    if (!actionId || !eventsNextCursor || loadingMoreEvents) return;
    try {
      setLoadingMoreEvents(true);
      const res = await fetchCommercialActionEvents(actionId, { limit: 50, startAfter: eventsNextCursor });
      setEvents(prev => [...prev, ...(res.events || [])]);
      setEventsNextCursor(res.nextCursor);
      setEventsHasMore(res.hasMore);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar mais eventos.');
    } finally {
      setLoadingMoreEvents(false);
    }
  };

  if (!actionId) return null;

  // Métricas Atuais Recalculadas pelo motor atual para comparação (sem causalidade)
  const currentProduct = action?.entityId
    ? productsProfitability.find(p => p.id === action.entityId || p.slug === action.entityId)
    : undefined;

  const handleApprove = async () => {
    if (!action) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await approveCommercialAction(action.id, approveKey);
      setAction(res.action);
      onActionUpdated(res.action);
      setApproveKey(createIdempotencyKey('act_app'));
      const data = await fetchCommercialActionById(action.id);
      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao aprovar ação comercial.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStart = async () => {
    if (!action) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await startCommercialAction(action.id, startKey);
      setAction(res.action);
      onActionUpdated(res.action);
      setStartKey(createIdempotencyKey('act_start'));
      const data = await fetchCommercialActionById(action.id);
      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao iniciar ação comercial.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action || !resultNote.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await completeCommercialAction(action.id, resultNote.trim(), resultClassification, completeKey);
      setAction(res.action);
      onActionUpdated(res.action);
      setIsCompleting(false);
      setCompleteKey(createIdempotencyKey('act_comp'));
      const data = await fetchCommercialActionById(action.id);
      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao concluir ação comercial.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action || !reasonText.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await dismissCommercialAction(action.id, reasonText.trim(), dismissKey);
      setAction(res.action);
      onActionUpdated(res.action);
      setIsDismissing(false);
      setDismissKey(createIdempotencyKey('act_dism'));
      const data = await fetchCommercialActionById(action.id);
      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao descartar ação comercial.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action || !reasonText.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await cancelCommercialAction(action.id, reasonText.trim(), cancelKey);
      setAction(res.action);
      onActionUpdated(res.action);
      setIsCancelling(false);
      setCancelKey(createIdempotencyKey('act_canc'));
      const data = await fetchCommercialActionById(action.id);
      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao cancelar ação comercial.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action || !newNote.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      await addCommercialActionNote(action.id, newNote.trim(), noteKey);
      setNewNote('');
      setNoteKey(createIdempotencyKey('act_note'));
      const data = await fetchCommercialActionById(action.id);
      setAction(data.action);
      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar nota.');
    } finally {
      setSubmitting(false);
    }
  };

  const overdue = action ? isActionOverdue(action.dueDate, action.status) : false;

  const statusBadge = (status: CommercialActionStatus) => {
    switch (status) {
      case 'draft':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-zinc-800 text-zinc-300 border border-zinc-700">Rascunho</span>;
      case 'approved':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">Aprovada</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">Em Andamento</span>;
      case 'completed':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Concluída</span>;
      case 'dismissed':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-zinc-800 text-zinc-400 border border-zinc-700">Descartada</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">Cancelada</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-zinc-800 text-zinc-300">{status}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-2xl bg-zinc-900 border-l border-zinc-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/90">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">
                Plano de Ação Comercial
              </span>
              {action && statusBadge(action.status)}
              {overdue && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Vencida
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-zinc-100 truncate max-w-md">
              {action?.title || 'Carregando Ação...'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-zinc-400">
              <Clock className="w-6 h-6 animate-spin mr-2" />
              Carregando plano de governança...
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
              {error}
            </div>
          ) : action ? (
            <>
              {/* Descrição & Metadados */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-3">
                <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Visão Geral do Plano
                </div>
                <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                  {action.description || 'Nenhuma descrição detalhada fornecida.'}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/60 text-xs">
                  <div>
                    <div className="text-zinc-500">Prioridade</div>
                    <div className="font-semibold text-zinc-200 capitalize">{action.priority}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Responsável</div>
                    <div className="font-semibold text-zinc-200 truncate">{action.assignedToName || 'Não atribuído'}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Prazo Estimado</div>
                    <div className="font-semibold text-zinc-200">
                      {action.dueDate ? new Date(action.dueDate).toLocaleDateString('pt-BR') : 'Sem prazo'}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Origem</div>
                    <div className="font-semibold text-zinc-200">
                      {action.source === 'commercial_intelligence' ? 'Inteligência Comercial' : 'Manual'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Comparativo de Métricas: Na Criação (Snapshot Histórico) vs Atual */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-zinc-400" />
                    Auditoria de Métricas (Snapshot Histórico vs Atual)
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Capturado: {action.sourceSnapshot?.snapshotCapturedAt ? new Date(action.sourceSnapshot.snapshotCapturedAt).toLocaleDateString('pt-BR') : 'N/D'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {/* Na Criação */}
                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/60">
                    <div className="text-xs font-semibold text-zinc-400 mb-2 border-b border-zinc-800 pb-1">
                      Métricas na Criação
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Preço Registrado:</span>
                        <span className="font-mono text-zinc-200">{formatMoney(action.sourceSnapshot?.currentPrice || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Preço Mínimo Breakeven:</span>
                        <span className="font-mono text-zinc-200">{formatMoney(action.sourceSnapshot?.minimumPrice || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Margem Contribuição %:</span>
                        <span className="font-mono text-zinc-200">{formatPercent(action.sourceSnapshot?.contributionMarginPercent || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Cobertura de Custo:</span>
                        <span className="font-mono text-zinc-200">{formatPercent(action.sourceSnapshot?.costCoveragePercent || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Atual Real */}
                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/60">
                    <div className="text-xs font-semibold text-zinc-400 mb-2 border-b border-zinc-800 pb-1">
                      Métricas Atuais do Motor
                    </div>
                    {currentProduct ? (
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Preço Vigente:</span>
                          <span className="font-mono text-zinc-200">{formatMoney(currentProduct.unitPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Custo Unitário:</span>
                          <span className="font-mono text-zinc-200">{formatMoney(currentProduct.unitCost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Margem Contribuição %:</span>
                          <span className="font-mono text-zinc-200">{formatPercent(currentProduct.contributionMarginPercent)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Cobertura de Custo:</span>
                          <span className="font-mono text-zinc-200">{formatPercent(currentProduct.costCoveragePercent)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500 italic py-3 text-center">
                        Métricas de nível global ou entidade sem catálogo direto associado.
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-zinc-500 flex items-center gap-1 mt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Após a ação, a margem observada evolui conforme novas vendas reais são consolidadas no motor.
                  </span>
                </div>
              </div>

              {/* Ações Administrativas de Transição de Estado */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-3">
                <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Controle de Transição de Estado
                </div>

                {action.status === 'draft' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleApprove}
                      disabled={submitting}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Aprovar Plano
                    </button>
                    <button
                      onClick={() => setIsDismissing(true)}
                      disabled={submitting}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
                    >
                      Descartar
                    </button>
                    <button
                      onClick={() => setIsCancelling(true)}
                      disabled={submitting}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {action.status === 'approved' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleStart}
                      disabled={submitting}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" /> Iniciar Execução
                    </button>
                    <button
                      onClick={() => setIsCancelling(true)}
                      disabled={submitting}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {action.status === 'in_progress' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setIsCompleting(true)}
                      disabled={submitting}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Concluir Plano de Ação
                    </button>
                    <button
                      onClick={() => setIsCancelling(true)}
                      disabled={submitting}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {['completed', 'dismissed', 'cancelled'].includes(action.status) && (
                  <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-xs text-zinc-400">
                    {action.status === 'completed' && (
                      <div>
                        <span className="font-semibold text-emerald-400">Concluído: </span>
                        {action.resultNote || 'Sem nota de encerramento.'}
                      </div>
                    )}
                    {action.status === 'dismissed' && (
                      <div>
                        <span className="font-semibold text-zinc-300">Motivo do Descarte: </span>
                        {action.dismissReason || 'Não informado.'}
                      </div>
                    )}
                    {action.status === 'cancelled' && (
                      <div>
                        <span className="font-semibold text-rose-400">Motivo do Cancelamento: </span>
                        {action.cancelReason || 'Não informado.'}
                      </div>
                    )}
                  </div>
                )}

                {/* Modal de Conclusão */}
                {isCompleting && (
                  <form onSubmit={handleComplete} className="p-3 rounded-lg bg-zinc-900 border border-emerald-500/40 space-y-3 mt-3">
                    <div className="text-xs font-bold text-emerald-400">Registrar Conclusão da Ação</div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Nota de Resultado (Obrigatória):</label>
                      <textarea
                        value={resultNote}
                        onChange={e => setResultNote(e.target.value)}
                        placeholder="Descreva a alteração operacional efetuada e os resultados observados..."
                        rows={3}
                        required
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Classificação do Resultado:</label>
                      <select
                        value={resultClassification}
                        onChange={e => setResultClassification(e.target.value as CommercialActionResultClassification)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200"
                      >
                        <option value="successful">Bem Sucedido</option>
                        <option value="partially_successful">Parcialmente Sucedido</option>
                        <option value="unsuccessful">Não Sucedido</option>
                        <option value="not_measurable">Não Mensurável</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCompleting(false)}
                        className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={submitting || !resultNote.trim()}
                        className="px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                      >
                        Confirmar Conclusão
                      </button>
                    </div>
                  </form>
                )}

                {/* Modal de Descarte */}
                {isDismissing && (
                  <form onSubmit={handleDismiss} className="p-3 rounded-lg bg-zinc-900 border border-zinc-700 space-y-3 mt-3">
                    <div className="text-xs font-bold text-zinc-300">Descartar Plano de Ação</div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Motivo do Descarte (Obrigatório):</label>
                      <textarea
                        value={reasonText}
                        onChange={e => setReasonText(e.target.value)}
                        placeholder="Ex: Produto estratégico fora de linha / Ajuste de catálogo planejado..."
                        rows={2}
                        required
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsDismissing(false)}
                        className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        Voltar
                      </button>
                      <button
                        type="submit"
                        disabled={submitting || !reasonText.trim()}
                        className="px-3 py-1.5 text-xs font-semibold rounded bg-zinc-700 hover:bg-zinc-600 text-white disabled:opacity-50"
                      >
                        Confirmar Descarte
                      </button>
                    </div>
                  </form>
                )}

                {/* Modal de Cancelamento */}
                {isCancelling && (
                  <form onSubmit={handleCancel} className="p-3 rounded-lg bg-zinc-900 border border-rose-500/40 space-y-3 mt-3">
                    <div className="text-xs font-bold text-rose-400">Cancelar Plano de Ação</div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Motivo do Cancelamento (Obrigatório):</label>
                      <textarea
                        value={reasonText}
                        onChange={e => setReasonText(e.target.value)}
                        placeholder="Informe a justificativa administrativa do cancelamento..."
                        rows={2}
                        required
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCancelling(false)}
                        className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        Voltar
                      </button>
                      <button
                        type="submit"
                        disabled={submitting || !reasonText.trim()}
                        className="px-3 py-1.5 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50"
                      >
                        Confirmar Cancelamento
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Timeline de Eventos Imutáveis (Append-Only Audit Trail) */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-3">
                <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-zinc-400" />
                  Linha do Tempo de Auditoria ({events.length} Eventos)
                </div>

                <div className="space-y-3 pl-2 border-l-2 border-zinc-800">
                  {events.map(ev => (
                    <div key={ev.id} className="relative pl-4 space-y-1 text-xs">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-zinc-700 border-2 border-zinc-950" />
                      <div className="flex items-center justify-between text-zinc-400">
                        <span className="font-semibold text-zinc-300 uppercase font-mono text-[11px]">
                          {ev.eventType}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {new Date(ev.timestamp).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="text-zinc-400">
                        Operador: <span className="text-zinc-200">{ev.operatorName || ev.operatorEmail}</span>
                      </div>
                      {ev.note && <div className="text-zinc-300 bg-zinc-900/60 p-2 rounded border border-zinc-800/50">{ev.note}</div>}
                      {ev.reason && <div className="text-zinc-400 italic">Justificativa: {ev.reason}</div>}
                    </div>
                  ))}
                </div>

                {/* Carregar Mais Eventos */}
                {eventsHasMore && (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={handleLoadMoreEvents}
                      disabled={loadingMoreEvents}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {loadingMoreEvents ? <Clock className="w-3.5 h-3.5 animate-spin" /> : null}
                      Carregar mais eventos
                    </button>
                  </div>
                )}

                {/* Adicionar Nova Nota */}
                <form onSubmit={handleAddNote} className="flex gap-2 pt-2 border-t border-zinc-800/60">
                  <input
                    type="text"
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="Adicionar nota de acompanhamento..."
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !newNote.trim()}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg flex items-center gap-1 disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" /> Registrar
                  </button>
                </form>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

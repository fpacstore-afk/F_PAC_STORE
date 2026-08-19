import React, { useState } from 'react';
import { 
  X, 
  Play, 
  CheckCircle2, 
  AlertOctagon, 
  RotateCcw, 
  Ban, 
  TrendingUp, 
  Calendar, 
  User, 
  Tag, 
  DollarSign, 
  Layers, 
  ShieldAlert, 
  Activity,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { 
  CommercialExecutionActionItem, 
  CommercialActionExecutionStatus 
} from '../../../../types/commercialExecution';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';

interface CommercialExecutionActionDrawerProps {
  action: CommercialExecutionActionItem | null;
  isOpen: boolean;
  onClose: () => void;
  onReady?: (actionId: string) => Promise<void>;
  onStart: (actionId: string) => Promise<void>;
  onBlock: (actionId: string, reason: string) => Promise<void>;
  onUnblock: (actionId: string) => Promise<void>;
  onComplete: (actionId: string, notes?: string) => Promise<void>;
  onCancel: (actionId: string, reason?: string) => Promise<void>;
  onRecalculateImpact: (actionId: string) => Promise<void>;
}

export const CommercialExecutionActionDrawer: React.FC<CommercialExecutionActionDrawerProps> = ({
  action,
  isOpen,
  onClose,
  onReady,
  onStart,
  onBlock,
  onUnblock,
  onComplete,
  onCancel,
  onRecalculateImpact
}) => {
  const { formatMoney } = useFinancialPrivacy();
  const [loading, setLoading] = useState(false);
  const [blockingReasonInput, setBlockingReasonInput] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [completeNotesInput, setCompleteNotesInput] = useState('');

  if (!isOpen || !action) return null;

  const handleReady = async () => {
    if (!onReady) return;
    try {
      setLoading(true);
      await onReady(action.id);
    } catch (err: any) {
      alert(err.message || 'Erro ao marcar ação como pronta');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    try {
      setLoading(true);
      await onStart(action.id);
    } catch (err: any) {
      alert(err.message || 'Erro ao iniciar ação');
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!blockingReasonInput.trim()) {
      alert('Informe o motivo do bloqueio');
      return;
    }
    try {
      setLoading(true);
      await onBlock(action.id, blockingReasonInput.trim());
      setShowBlockModal(false);
      setBlockingReasonInput('');
    } catch (err: any) {
      alert(err.message || 'Erro ao bloquear ação');
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async () => {
    try {
      setLoading(true);
      await onUnblock(action.id);
    } catch (err: any) {
      alert(err.message || 'Erro ao desbloquear ação');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    try {
      setLoading(true);
      await onComplete(action.id, completeNotesInput.trim() || undefined);
    } catch (err: any) {
      alert(err.message || 'Erro ao concluir ação');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      setLoading(true);
      await onCancel(action.id, cancelReasonInput.trim() || undefined);
      setShowCancelModal(false);
      setCancelReasonInput('');
    } catch (err: any) {
      alert(err.message || 'Erro ao cancelar ação');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculateImpact = async () => {
    try {
      setLoading(true);
      await onRecalculateImpact(action.id);
    } catch (err: any) {
      alert(err.message || 'Erro ao recalcular impacto');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: CommercialActionExecutionStatus) => {
    switch (status) {
      case 'planned':
        return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-300">1. Planejado</span>;
      case 'ready':
        return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-300">2. Pronto</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">3. Em Andamento</span>;
      case 'blocked':
        return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-800 border border-red-300">Bloqueado</span>;
      case 'completed':
        return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">Concluído</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-zinc-100 text-zinc-500 border border-zinc-300">Cancelado</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-black/20 overflow-y-auto">
        
        {/* Header */}
        <div className="p-4 border-b border-black/10 bg-gray-50 flex items-center justify-between sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold text-gray-500">AÇÃO COMERCIAL</span>
              {getStatusBadge(action.executionStatus)}
              <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                action.priority === 'critical' ? 'bg-red-600 text-white' :
                action.priority === 'high' ? 'bg-orange-500 text-white' :
                action.priority === 'medium' ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-800'
              }`}>
                {action.priority}
              </span>
            </div>
            <h2 className="text-base font-black text-black leading-snug">{action.title}</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 text-gray-600 hover:text-black border border-black/10"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-6 flex-1 text-xs">
          
          {/* Alerta de Bloqueio se houver */}
          {action.executionStatus === 'blocked' && (
            <div className="p-3 bg-red-50 border-l-4 border-red-600 text-red-900 space-y-1">
              <div className="flex items-center gap-1.5 font-black uppercase text-[10px] tracking-wider">
                <AlertOctagon size={14} className="text-red-600" />
                Motivo do Bloqueio Operacional:
              </div>
              <p className="text-xs">{action.blockingReason || 'Motivo não detalhado.'}</p>
            </div>
          )}

          {/* Resumo e Descrição */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <Tag size={12} /> Descrição e Diretriz
            </h3>
            <p className="text-gray-800 bg-gray-50 p-3 border border-black/5 leading-relaxed">
              {action.description || 'Sem descrição detalhada cadastrada.'}
            </p>
          </div>

          {/* Metadados Operacionais (Responsável, Prazo, Linha) */}
          <div className="grid grid-cols-2 gap-3 bg-white border border-black/10 p-3">
            <div>
              <span className="text-[9px] font-mono text-gray-500 uppercase flex items-center gap-1">
                <User size={10} /> Responsável
              </span>
              <p className="font-bold text-gray-900 mt-0.5">{action.ownerName || 'Não atribuído'}</p>
            </div>
            <div>
              <span className="text-[9px] font-mono text-gray-500 uppercase flex items-center gap-1">
                <Layers size={10} /> Linha de Produto
              </span>
              <p className="font-bold text-gray-900 mt-0.5">{action.productLine || 'ALL'}</p>
            </div>
            <div>
              <span className="text-[9px] font-mono text-gray-500 uppercase flex items-center gap-1">
                <Calendar size={10} /> Início Planejado
              </span>
              <p className="font-mono text-gray-900 mt-0.5">{action.plannedStartDate}</p>
            </div>
            <div>
              <span className="text-[9px] font-mono text-gray-500 uppercase flex items-center gap-1">
                <Calendar size={10} /> Prazo Limite (Deadline)
              </span>
              <p className="font-mono text-gray-900 mt-0.5 font-bold">{action.plannedEndDate}</p>
            </div>
          </div>

          {/* Impacto Esperado vs Impacto Real */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <TrendingUp size={12} /> Análise Financeira de Impacto
              </h3>
              <button
                onClick={handleRecalculateImpact}
                disabled={loading}
                className="text-[9px] font-black uppercase text-amber-700 hover:text-black flex items-center gap-1 cursor-pointer"
              >
                <Activity size={10} /> Recalcular Impacto
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Expected Impact */}
              <div className="p-3 bg-amber-50/50 border border-amber-200/70 space-y-2">
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-900 block">
                  Impacto Esperado (Estimativa)
                </span>
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Receita:</span>
                    <span className="font-bold text-gray-900">
                      {action.expectedImpact?.revenueImpact ? formatMoney(action.expectedImpact.revenueImpact) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Margem Contrib.:</span>
                    <span className="font-bold text-gray-900">
                      {action.expectedImpact?.contributionMarginImpact ? formatMoney(action.expectedImpact.contributionMarginImpact) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Unidades:</span>
                    <span className="font-bold text-gray-900">{action.expectedImpact?.unitsImpact || '—'} un</span>
                  </div>
                </div>
              </div>

              {/* Actual Impact */}
              <div className="p-3 bg-emerald-50/50 border border-emerald-200/70 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-900">
                    Impacto Observado
                  </span>
                  <span className={`px-1.5 py-0.2 text-[8px] font-mono font-bold uppercase border ${
                    action.actualImpact?.impactAttribution === 'direct' ? 'bg-emerald-200 text-emerald-900 border-emerald-400' :
                    action.actualImpact?.impactAttribution === 'correlated' ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-gray-100 text-gray-700 border-gray-300'
                  }`}>
                    {action.actualImpact?.impactAttribution || 'insufficient'}
                  </span>
                </div>
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Receita associada:</span>
                    <span className="font-bold text-gray-900">
                      {action.actualImpact?.revenue ? formatMoney(action.actualImpact.revenue) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Margem associada:</span>
                    <span className="font-bold text-gray-900">
                      {action.actualImpact?.contributionMargin ? formatMoney(action.actualImpact.contributionMargin) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Confiança:</span>
                    <span className="font-bold text-gray-900 uppercase">{action.actualImpact?.confidence || 'insufficient'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {action.actualImpact?.notes && (
              <p className="text-[10px] text-gray-500 font-mono italic">
                * {action.actualImpact.notes}
              </p>
            )}
          </div>

          {/* Notas de Execução */}
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Notas de Conclusão / Execução</span>
            <p className="text-gray-700 bg-gray-50 p-2.5 border border-black/5 font-mono text-[11px]">
              {action.executionNotes || 'Nenhuma nota registrada até o momento.'}
            </p>
          </div>

        </div>

        {/* Footer Actions (State Machine) */}
        <div className="p-4 border-t border-black/10 bg-gray-100 flex flex-wrap items-center justify-between gap-2 sticky bottom-0">
          <div className="flex items-center gap-2">
            {/* PRONTA: planned */}
            {action.executionStatus === 'planned' && onReady && (
              <button
                onClick={handleReady}
                disabled={loading}
                className="px-3 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-blue-700"
              >
                <CheckCircle2 size={12} /> Marcar como Pronta
              </button>
            )}

            {/* INICIAR: apenas quando estiver no estado 'ready' */}
            {action.executionStatus === 'ready' && (
              <button
                onClick={handleStart}
                disabled={loading}
                className="px-3 py-2 bg-black text-[#eab308] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-neutral-800"
              >
                <Play size={12} /> Iniciar Ação
              </button>
            )}

            {/* BLOQUEAR: in_progress */}
            {action.executionStatus === 'in_progress' && (
              <button
                onClick={() => setShowBlockModal(true)}
                disabled={loading}
                className="px-3 py-2 bg-red-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-red-700"
              >
                <AlertOctagon size={12} /> Bloquear
              </button>
            )}

            {/* DESBLOQUEAR: blocked */}
            {action.executionStatus === 'blocked' && (
              <button
                onClick={handleUnblock}
                disabled={loading}
                className="px-3 py-2 bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-amber-600"
              >
                <RotateCcw size={12} /> Desbloquear
              </button>
            )}

            {/* CONCLUIR: in_progress */}
            {action.executionStatus === 'in_progress' && (
              <button
                onClick={handleComplete}
                disabled={loading}
                className="px-3 py-2 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-emerald-700"
              >
                <CheckCircle2 size={12} /> Concluir Ação
              </button>
            )}
          </div>

          {/* CANCELAR: se não concluída nem cancelada */}
          {action.executionStatus !== 'completed' && action.executionStatus !== 'cancelled' && (
            <button
              onClick={() => setShowCancelModal(true)}
              disabled={loading}
              className="px-3 py-2 bg-white text-red-600 border border-red-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-red-50"
            >
              <Ban size={12} /> Cancelar
            </button>
          )}
        </div>

        {/* Modal de Bloqueio */}
        {showBlockModal && (
          <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white p-5 max-w-md w-full border border-black/20 shadow-xl space-y-4">
              <h4 className="text-sm font-black text-red-600 uppercase flex items-center gap-2">
                <AlertOctagon size={16} /> Bloquear Ação Operacional
              </h4>
              <p className="text-xs text-gray-600">
                Informe detalhadamente qual impedimento está bloqueando o andamento desta ação:
              </p>
              <textarea
                value={blockingReasonInput}
                onChange={(e) => setBlockingReasonInput(e.target.value)}
                placeholder="Ex: Aguardando fornecedor aprovar lote piloto de embalagens..."
                className="w-full p-2.5 border border-black/20 text-xs h-24 focus:outline-hidden focus:border-black"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowBlockModal(false)}
                  className="px-3 py-1.5 border border-black/20 text-xs font-bold uppercase cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  onClick={handleBlock}
                  disabled={loading}
                  className="px-4 py-1.5 bg-red-600 text-white text-xs font-black uppercase cursor-pointer"
                >
                  Confirmar Bloqueio
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Cancelamento */}
        {showCancelModal && (
          <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white p-5 max-w-md w-full border border-black/20 shadow-xl space-y-4">
              <h4 className="text-sm font-black text-black uppercase flex items-center gap-2">
                <Ban size={16} className="text-red-600" /> Cancelar Ação Comercial
              </h4>
              <p className="text-xs text-gray-600">
                Tem certeza que deseja cancelar esta ação comercial? Esta operação registrará o motivo no log de auditoria.
              </p>
              <input
                type="text"
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                placeholder="Motivo do cancelamento (opcional)..."
                className="w-full p-2 border border-black/20 text-xs focus:outline-hidden focus:border-black"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="px-3 py-1.5 border border-black/20 text-xs font-bold uppercase cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="px-4 py-1.5 bg-red-600 text-white text-xs font-black uppercase cursor-pointer"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

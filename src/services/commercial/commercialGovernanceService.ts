/**
 * SERVIÇO CLIENT-SIDE DE GOVERNANÇA COMERCIAL
 * FASE 9.6.4 — FPAC Store
 *
 * Todas as mutações e consultas são realizadas EXCLUSIVAMENTE através do backend autenticado.
 * ZERO chamadas diretas de escrita no Firestore (setDoc, addDoc, updateDoc, deleteDoc).
 * Mutações exigem explicitamente Idempotency-Key estável fornecida pela camada de UI.
 */

import { authenticatedFetch } from '../../lib/api';
import {
  CommercialAction,
  CommercialActionEvent,
  CommercialActionStatus,
  CommercialActionType,
  CommercialActionPriority,
  CommercialActionResultClassification,
  CommercialGoal,
  CommercialGoalStatus,
  CommercialGoalType,
  CommercialGoalPeriod,
  CommercialGoalEvaluation
} from '../../types/commercialGovernance';

/**
 * Gera chave de idempotência segura para inicialização de operações administrativas
 */
export function createIdempotencyKey(prefix: string = 'comm_act'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export interface GetActionsParams {
  status?: string;
  priority?: string;
  type?: string;
  entityId?: string;
  limit?: number;
  startAfter?: string;
}

export interface GetActionsResponse {
  actions: CommercialAction[];
  pageSize: number;
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Busca ações comerciais com paginação e filtros
 */
export async function fetchCommercialActions(params: GetActionsParams = {}): Promise<GetActionsResponse> {
  const query = new URLSearchParams();
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.priority && params.priority !== 'all') query.set('priority', params.priority);
  if (params.type && params.type !== 'all') query.set('type', params.type);
  if (params.entityId) query.set('entityId', params.entityId);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.startAfter) query.set('startAfter', params.startAfter);

  const url = `/api/admin/commercial/actions${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await authenticatedFetch(url, { method: 'GET' });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao carregar ações comerciais.');
  }

  return res.json();
}

export interface FetchCommercialActionResponse {
  action: CommercialAction;
  events: CommercialActionEvent[];
  eventsNextCursor?: string | null;
  eventsHasMore?: boolean;
  pageSize?: number;
}

/**
 * Busca detalhes de uma ação comercial com histórico de eventos (paginação padrão 50 itens)
 */
export async function fetchCommercialActionById(
  id: string,
  params: { limit?: number; startAfter?: string } = {}
): Promise<FetchCommercialActionResponse> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.startAfter) query.set('startAfter', params.startAfter);

  const url = `/api/admin/commercial/actions/${id}${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await authenticatedFetch(url, { method: 'GET' });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao carregar detalhe da ação.');
  }

  return res.json();
}

export interface GetActionEventsParams {
  limit?: number;
  startAfter?: string;
}

export interface GetActionEventsResponse {
  events: CommercialActionEvent[];
  pageSize: number;
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Busca eventos paginados da timeline de auditoria
 */
export async function fetchCommercialActionEvents(
  actionId: string,
  params: GetActionEventsParams = {}
): Promise<GetActionEventsResponse> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.startAfter) query.set('startAfter', params.startAfter);

  const url = `/api/admin/commercial/actions/${actionId}/events${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await authenticatedFetch(url, { method: 'GET' });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao carregar eventos da ação.');
  }

  return res.json();
}

export interface CreateActionPayload {
  title: string;
  description?: string;
  type: CommercialActionType;
  priority: CommercialActionPriority;
  entityType?: 'product' | 'line' | 'store' | 'shipping' | 'gateway' | 'custom';
  entityId?: string;
  entityName?: string;
  recommendationId?: string;
  reasonCodes?: string[];
  dueDate?: string;
  assignedTo?: string;
  assignedToName?: string;
  notes?: string;
  sourceSnapshot?: Record<string, any>;
}

/**
 * Criação de uma nova Ação Comercial (Rascunho) com chave obrigatória
 */
export async function createCommercialAction(
  payload: CreateActionPayload,
  idempotencyKey: string
): Promise<{ idempotentReplay: boolean; action: CommercialAction }> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED: Chave de idempotência é obrigatória para criação de ação.');
  }

  const res = await authenticatedFetch('/api/admin/commercial/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      ...payload,
      idempotencyKey
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao registrar ação comercial.');
  }

  return res.json();
}

/**
 * Aprovação de Ação Comercial com chave obrigatória
 */
export async function approveCommercialAction(
  id: string,
  idempotencyKey: string
): Promise<{ idempotentReplay: boolean; action: CommercialAction }> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED: Chave de idempotência é obrigatória para aprovar ação.');
  }

  const res = await authenticatedFetch(`/api/admin/commercial/actions/${id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ idempotencyKey })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao aprovar ação comercial.');
  }

  return res.json();
}

/**
 * Iniciar execução de Ação Comercial com chave obrigatória
 */
export async function startCommercialAction(
  id: string,
  idempotencyKey: string
): Promise<{ idempotentReplay: boolean; action: CommercialAction }> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED: Chave de idempotência é obrigatória para iniciar ação.');
  }

  const res = await authenticatedFetch(`/api/admin/commercial/actions/${id}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ idempotencyKey })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao iniciar ação comercial.');
  }

  return res.json();
}

/**
 * Concluir Ação Comercial (com nota de resultado e chave obrigatórias)
 */
export async function completeCommercialAction(
  id: string,
  resultNote: string,
  resultClassification: CommercialActionResultClassification = 'successful',
  idempotencyKey: string
): Promise<{ idempotentReplay: boolean; action: CommercialAction }> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED: Chave de idempotência é obrigatória para concluir ação.');
  }

  const res = await authenticatedFetch(`/api/admin/commercial/actions/${id}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      resultNote,
      resultClassification,
      idempotencyKey
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao concluir ação comercial.');
  }

  return res.json();
}

/**
 * Descartar Ação Comercial (com motivo e chave obrigatórios)
 */
export async function dismissCommercialAction(
  id: string,
  reason: string,
  idempotencyKey: string
): Promise<{ idempotentReplay: boolean; action: CommercialAction }> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED: Chave de idempotência é obrigatória para descartar ação.');
  }

  const res = await authenticatedFetch(`/api/admin/commercial/actions/${id}/dismiss`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      reason,
      dismissReason: reason,
      idempotencyKey
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao descartar ação comercial.');
  }

  return res.json();
}

/**
 * Cancelar Ação Comercial (com motivo e chave obrigatórios)
 */
export async function cancelCommercialAction(
  id: string,
  reason: string,
  idempotencyKey: string
): Promise<{ idempotentReplay: boolean; action: CommercialAction }> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED: Chave de idempotência é obrigatória para cancelar ação.');
  }

  const res = await authenticatedFetch(`/api/admin/commercial/actions/${id}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      reason,
      cancelReason: reason,
      idempotencyKey
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao cancelar ação comercial.');
  }

  return res.json();
}

/**
 * Adicionar nota de acompanhamento à Ação Comercial com chave obrigatória
 */
export async function addCommercialActionNote(
  id: string,
  note: string,
  idempotencyKey: string
): Promise<void> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED: Chave de idempotência é obrigatória para registrar nota.');
  }

  const res = await authenticatedFetch(`/api/admin/commercial/actions/${id}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ note, idempotencyKey })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao adicionar nota.');
  }
}

/**
 * =========================================================================
 * METAS COMERCIAIS
 * =========================================================================
 */

export async function fetchCommercialGoals(): Promise<CommercialGoal[]> {
  const res = await authenticatedFetch('/api/admin/commercial/goals', { method: 'GET' });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao carregar metas comerciais.');
  }

  const data = await res.json();
  return data.goals || [];
}

export interface CreateGoalPayload {
  title: string;
  type: CommercialGoalType;
  targetValue: number;
  startDate: string;
  endDate: string;
  period: CommercialGoalPeriod;
  notes?: string;
}

export async function createCommercialGoal(
  payload: CreateGoalPayload,
  idempotencyKey: string
): Promise<CommercialGoal> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED: Chave de idempotência é obrigatória para criar meta.');
  }

  const res = await authenticatedFetch('/api/admin/commercial/goals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ ...payload, idempotencyKey })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao criar meta comercial.');
  }

  const data = await res.json();
  return data.goal;
}

export async function updateCommercialGoalStatus(
  id: string,
  status: CommercialGoalStatus,
  idempotencyKey: string
): Promise<void> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED: Chave de idempotência é obrigatória para atualizar meta.');
  }

  const res = await authenticatedFetch(`/api/admin/commercial/goals/${id}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ status, idempotencyKey })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao atualizar status da meta.');
  }
}

export interface FetchCommercialGoalEvaluationResponse {
  success: boolean;
  goal: CommercialGoal;
  evaluation: CommercialGoalEvaluation;
}

/**
 * Busca avaliação server-side da meta comercial com todo o dataset do período
 */
export async function fetchCommercialGoalEvaluation(
  goalId: string
): Promise<FetchCommercialGoalEvaluationResponse> {
  const res = await authenticatedFetch(`/api/admin/commercial/goals/${goalId}/evaluation`, {
    method: 'GET'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Não foi possível calcular a meta com o histórico completo.');
  }

  return res.json();
}



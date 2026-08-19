/**
 * CLIENT-SIDE SERVICE DE EXECUÇÃO COMERCIAL & PLANOS DE AÇÃO
 * FASE 9.6.7 — FPAC Store
 *
 * Comunicação exclusiva via endpoints autenticados da API backend (/api/admin/commercial/execution-cycles).
 * Zero mutações diretas no Firestore via SDK de cliente.
 */

import {
  CommercialExecutionCycle,
  CommercialExecutionDashboard,
  CommercialExecutionEvent,
  CommercialExecutionActionItem,
  CommercialActionExecutionStatus,
  CommercialActionPriority,
  CommercialProductLine,
  CommercialActionExpectedImpact,
  CommercialActionActualImpact
} from '../../types/commercialExecution.js';

function getApiUrl(): string {
  return '';
}

async function getAuthHeaders(idempotencyKey?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  return headers;
}

export const commercialExecutionService = {
  /**
   * Lista todos os ciclos operacionais comerciais
   */
  async getExecutionCycles(status?: string): Promise<CommercialExecutionCycle[]> {
    const headers = await getAuthHeaders();
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles${query}`, {
      method: 'GET',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao buscar ciclos' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.cycles || [];
  },

  /**
   * Obtém um ciclo operacional pelo ID
   */
  async getExecutionCycleById(id: string): Promise<CommercialExecutionCycle> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${id}`, {
      method: 'GET',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao buscar ciclo' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.cycle;
  },

  /**
   * Obtém o dashboard server-side agregado do ciclo
   */
  async getExecutionDashboard(id: string): Promise<CommercialExecutionDashboard> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${id}/dashboard`, {
      method: 'GET',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao buscar dashboard de execução' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.dashboard || data;
  },

  /**
   * Obtém o log de auditoria de eventos de um ciclo
   */
  async getExecutionEvents(id: string): Promise<CommercialExecutionEvent[]> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${id}/events`, {
      method: 'GET',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao buscar eventos do ciclo' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.events || [];
  },

  /**
   * Cria um novo ciclo de execução comercial
   */
  async createExecutionCycle(payload: {
    title: string;
    periodStart: string;
    periodEnd: string;
    budgetId: string;
    linkedGoalIds?: string[];
    linkedForecastId?: string;
    notes?: string;
  }, idempotencyKey?: string): Promise<CommercialExecutionCycle> {
    const key = idempotencyKey || `cycle_create_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao criar ciclo' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.cycle;
  },

  /**
   * Atualiza um ciclo de execução comercial
   */
  async updateExecutionCycle(id: string, payload: Partial<CommercialExecutionCycle>, idempotencyKey?: string): Promise<CommercialExecutionCycle> {
    const key = idempotencyKey || `cycle_update_${id}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao atualizar ciclo' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.cycle;
  },

  /**
   * Ativa um ciclo de execução comercial (congelando snapshot de Budget e Goals)
   */
  async activateExecutionCycle(id: string, idempotencyKey?: string): Promise<CommercialExecutionCycle> {
    const key = idempotencyKey || `cycle_activate_${id}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${id}/activate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao ativar ciclo' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.cycle;
  },

  /**
   * Conclui um ciclo de execução comercial
   */
  async completeExecutionCycle(id: string, idempotencyKey?: string): Promise<CommercialExecutionCycle> {
    const key = idempotencyKey || `cycle_complete_${id}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${id}/complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao concluir ciclo' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.cycle;
  },

  /**
   * Arquiva um ciclo de execução comercial
   */
  async archiveExecutionCycle(id: string, idempotencyKey?: string): Promise<CommercialExecutionCycle> {
    const key = idempotencyKey || `cycle_archive_${id}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${id}/archive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao arquivar ciclo' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.cycle;
  },

  /**
   * Adiciona uma nova ação ao ciclo
   */
  async addActionToCycle(cycleId: string, payload: {
    title: string;
    description?: string;
    priority: CommercialActionPriority;
    productLine?: CommercialProductLine;
    ownerUid?: string;
    ownerName?: string;
    plannedStartDate: string;
    plannedEndDate: string;
    expectedImpact?: CommercialActionExpectedImpact;
    sourceRecommendationId?: string;
    sourceRecommendationSnapshot?: any;
  }, idempotencyKey?: string): Promise<CommercialExecutionActionItem> {
    const key = idempotencyKey || `action_add_${cycleId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${cycleId}/actions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao adicionar ação ao ciclo' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.action;
  },

  /**
   * Atualiza dados de uma ação do ciclo
   */
  async updateAction(cycleId: string, actionId: string, payload: Partial<CommercialExecutionActionItem>, idempotencyKey?: string): Promise<CommercialExecutionActionItem> {
    const key = idempotencyKey || `action_patch_${actionId}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${cycleId}/actions/${actionId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao atualizar ação' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.action;
  },

  /**
   * Define uma ação planejada como pronta para início (planned -> ready)
   */
  async readyAction(cycleId: string, actionId: string, idempotencyKey?: string): Promise<CommercialExecutionActionItem> {
    const key = idempotencyKey || `action_rdy_${actionId}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${cycleId}/actions/${actionId}/ready`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao marcar ação como pronta' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.action;
  },

  /**
   * Inicia a execução de uma ação
   */
  async startAction(cycleId: string, actionId: string, idempotencyKey?: string): Promise<CommercialExecutionActionItem> {
    const key = idempotencyKey || `action_start_${actionId}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${cycleId}/actions/${actionId}/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao iniciar ação' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.action;
  },

  /**
   * Bloqueia uma ação informando o motivo
   */
  async blockAction(cycleId: string, actionId: string, blockingReason: string, idempotencyKey?: string): Promise<CommercialExecutionActionItem> {
    const key = idempotencyKey || `action_block_${actionId}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${cycleId}/actions/${actionId}/block`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockingReason })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao bloquear ação' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.action;
  },

  /**
   * Desbloqueia uma ação
   */
  async unblockAction(cycleId: string, actionId: string, idempotencyKey?: string): Promise<CommercialExecutionActionItem> {
    const key = idempotencyKey || `action_unblock_${actionId}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${cycleId}/actions/${actionId}/unblock`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao desbloquear ação' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.action;
  },

  /**
   * Conclui uma ação
   */
  async completeAction(cycleId: string, actionId: string, payload?: { executionNotes?: string }, idempotencyKey?: string): Promise<CommercialExecutionActionItem> {
    const key = idempotencyKey || `action_complete_${actionId}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${cycleId}/actions/${actionId}/complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload || {})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao concluir ação' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.action;
  },

  /**
   * Cancela uma ação informando o motivo
   */
  async cancelAction(cycleId: string, actionId: string, cancelReason?: string, idempotencyKey?: string): Promise<CommercialExecutionActionItem> {
    const key = idempotencyKey || `action_cancel_${actionId}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${cycleId}/actions/${actionId}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cancelReason })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao cancelar ação' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.action;
  },

  /**
   * Recalcula o impacto real observado de uma ação
   */
  async recalculateActionImpact(cycleId: string, actionId: string, idempotencyKey?: string): Promise<CommercialExecutionActionItem> {
    const key = idempotencyKey || `action_recalc_${actionId}_${Date.now()}`;
    const headers = await getAuthHeaders(key);
    const res = await fetch(`${getApiUrl()}/api/admin/commercial/execution-cycles/${cycleId}/actions/${actionId}/recalculate-impact`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao recalcular impacto da ação' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.action;
  }
};

/**
 * CLIENT-SIDE SERVICE DE PÓS-MORTEM COMERCIAL & APRENDIZADO CONTÍNUO
 * FASE 9.6.8 / 9.6.8-D — FPAC Store
 *
 * Comunicação exclusiva via endpoints autenticados da API backend (/api/admin/commercial/reviews).
 * Utiliza authenticatedFetch() para garantir envio do Firebase ID Token e cabeçalhos de auditoria/idempotência.
 * Zero mutações diretas no Firestore via SDK de cliente.
 */

import { authenticatedFetch } from '../../lib/api';
import {
  CommercialExecutionReview,
  CommercialReviewEvent,
  CommercialReviewActionSnapshot,
  CommercialHistoricalLearningSummary
} from '../../types/commercialReview';
import {
  CommercialActionType
} from '../../types/commercialGovernance';
import { CommercialExecutionCycle } from '../../types/commercialExecution';

export interface ConvertInsightToActionPayload {
  targetCycleId: string;
  title?: string;
  description?: string;
  type?: CommercialActionType;
  entityType?: 'product' | 'line' | 'store' | 'shipping' | 'gateway' | 'custom' | 'category';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  productLine?: 'FORCE' | 'MARK' | 'PRIME' | 'OTHER' | 'ALL';
  plannedStartDate?: string;
  plannedEndDate?: string;
  expectedImpact?: {
    revenue?: number;
    units?: number;
    contributionMargin?: number;
    operatingProfit?: number;
  };
  targetRevenue?: number;
  targetUnits?: number;
  targetContributionMargin?: number;
  assignedTo?: string;
  channel?: string;
}

function getRequestHeaders(idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  return headers;
}

export const commercialReviewService = {
  /**
   * Lista todos os reviews com paginação e filtro opcional por status
   */
  async listReviews(params?: { limit?: number; cursor?: string; status?: string }): Promise<{ reviews: CommercialExecutionReview[]; pagination: any }> {
    const headers = getRequestHeaders();
    const queryParts: string[] = [];
    if (params?.limit) queryParts.push(`limit=${params.limit}`);
    if (params?.cursor) queryParts.push(`cursor=${encodeURIComponent(params.cursor)}`);
    if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);

    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    const res = await authenticatedFetch(`/api/admin/commercial/reviews${queryString}`, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao listar reviews' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /**
   * Obtém um review pelo ID
   */
  async getReviewById(id: string): Promise<CommercialExecutionReview> {
    const headers = getRequestHeaders();
    const res = await authenticatedFetch(`/api/admin/commercial/reviews/${id}`, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao buscar review' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.review;
  },

  /**
   * Obtém o dashboard analítico completo do review
   */
  async getReviewDashboard(id: string): Promise<{ review: CommercialExecutionReview; dashboard: any }> {
    const headers = getRequestHeaders();
    const res = await authenticatedFetch(`/api/admin/commercial/reviews/${id}/dashboard`, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao carregar dashboard de review' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /**
   * Lista os snapshots de ações avaliadas no review com suporte a paginação e cursor
   */
  async listReviewActions(id: string, params?: { limit?: number; cursor?: string } | number): Promise<{ actions: CommercialReviewActionSnapshot[]; total: number; pagination?: any }> {
    const headers = getRequestHeaders();
    let limit = 50;
    let cursor: string | undefined = undefined;

    if (typeof params === 'number') {
      limit = params;
    } else if (params) {
      if (params.limit) limit = params.limit;
      if (params.cursor) cursor = params.cursor;
    }

    const queryParts: string[] = [`limit=${limit}`];
    if (cursor) queryParts.push(`cursor=${encodeURIComponent(cursor)}`);

    const queryString = `?${queryParts.join('&')}`;
    const res = await authenticatedFetch(`/api/admin/commercial/reviews/${id}/actions${queryString}`, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao carregar ações do review' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /**
   * Lista eventos de auditoria do review
   */
  async listReviewEvents(id: string, params?: { limit?: number; cursor?: string }): Promise<{ events: CommercialReviewEvent[]; pagination: any }> {
    const headers = getRequestHeaders();
    const queryParts: string[] = [];
    if (params?.limit) queryParts.push(`limit=${params.limit}`);
    if (params?.cursor) queryParts.push(`cursor=${encodeURIComponent(params.cursor)}`);

    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    const res = await authenticatedFetch(`/api/admin/commercial/reviews/${id}/events${queryString}`, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao buscar eventos do review' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /**
   * Cria um novo review para um ciclo de execução concluído/arquivado
   */
  async createReview(
    data: { executionCycleId: string; title?: string; notes?: string },
    idempotencyKey: string
  ): Promise<CommercialExecutionReview> {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey é obrigatória para createReview');
    }
    const headers = getRequestHeaders(idempotencyKey);

    const res = await authenticatedFetch(`/api/admin/commercial/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao criar review' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const result = await res.json();
    return result.review;
  },

  /**
   * Atualiza dados de anotação do review
   */
  async updateReview(
    id: string,
    data: { title?: string; notes?: string },
    idempotencyKey: string
  ): Promise<CommercialExecutionReview> {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey é obrigatória para updateReview');
    }
    const headers = getRequestHeaders(idempotencyKey);

    const res = await authenticatedFetch(`/api/admin/commercial/reviews/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao atualizar review' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const result = await res.json();
    return result.review;
  },

  /**
   * Gera a apuração pós-mortem e passa o status para 'generated'
   */
  async generateReview(id: string, idempotencyKey: string): Promise<CommercialExecutionReview> {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey é obrigatória para generateReview');
    }
    const headers = getRequestHeaders(idempotencyKey);

    const res = await authenticatedFetch(`/api/admin/commercial/reviews/${id}/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao gerar review' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const result = await res.json();
    return result.review;
  },

  /**
   * Recalcula o review atualizando o snapshot e avançando analysisVersion
   */
  async recalculateReview(id: string, idempotencyKey: string): Promise<CommercialExecutionReview> {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey é obrigatória para recalculateReview');
    }
    const headers = getRequestHeaders(idempotencyKey);

    const res = await authenticatedFetch(`/api/admin/commercial/reviews/${id}/recalculate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao recalcular review' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const result = await res.json();
    return result.review;
  },

  /**
   * Aprova o review e congela os resultados imutáveis
   */
  async approveReview(id: string, idempotencyKey: string): Promise<CommercialExecutionReview> {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey é obrigatória para approveReview');
    }
    const headers = getRequestHeaders(idempotencyKey);

    const res = await authenticatedFetch(`/api/admin/commercial/reviews/${id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao aprovar review' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const result = await res.json();
    return result.review;
  },

  /**
   * Arquiva o review comercial
   */
  async archiveReview(id: string, idempotencyKey: string): Promise<CommercialExecutionReview> {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey é obrigatória para archiveReview');
    }
    const headers = getRequestHeaders(idempotencyKey);

    const res = await authenticatedFetch(`/api/admin/commercial/reviews/${id}/archive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao arquivar review' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const result = await res.json();
    return result.review;
  },

  /**
   * Converte manualmente um Insight em uma nova CommercialAction planejada
   */
  async convertInsightToAction(
    reviewId: string,
    insightId: string,
    data: ConvertInsightToActionPayload,
    idempotencyKey: string
  ): Promise<{ action: any; alreadyCreated: boolean }> {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey é obrigatória para convertInsightToAction');
    }
    const headers = getRequestHeaders(idempotencyKey);

    const res = await authenticatedFetch(`/api/admin/commercial/reviews/${reviewId}/insights/${insightId}/create-action`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao converter insight em ação' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /**
   * Obtém o sumário de aprendizado histórico de todos os reviews aprovados
   */
  async getHistoricalLearningSummary(params?: {
    periodStart?: string;
    periodEnd?: string;
    productLine?: string;
  }): Promise<CommercialHistoricalLearningSummary> {
    const headers = getRequestHeaders();
    const queryParts: string[] = [];
    if (params?.periodStart) queryParts.push(`periodStart=${encodeURIComponent(params.periodStart)}`);
    if (params?.periodEnd) queryParts.push(`periodEnd=${encodeURIComponent(params.periodEnd)}`);
    if (params?.productLine) queryParts.push(`productLine=${encodeURIComponent(params.productLine)}`);

    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    const res = await authenticatedFetch(`/api/admin/commercial/learning/summary${queryString}`, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao buscar sumário histórico de aprendizado' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const result = await res.json();
    return result.summary;
  },

  /**
   * Lista ciclos de execução elegíveis para receber novas Ações originadas de Insights pós-mortem.
   * Filtra exclusivamente ciclos que não estejam 'completed' ou 'archived'.
   */
  async listEligibleTargetCycles(): Promise<CommercialExecutionCycle[]> {
    const headers = getRequestHeaders();
    const res = await authenticatedFetch(`/api/admin/commercial/execution-cycles`, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao carregar ciclos de execução' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const cycles: CommercialExecutionCycle[] = data.cycles || data || [];
    return cycles.filter(c => c.status !== 'completed' && c.status !== 'archived');
  }
};

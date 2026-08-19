/**
 * SERVIÇO CLIENT-SIDE DE FORECAST E PLANEJAMENTO COMERCIAL
 * FASE 9.6.5 — FPAC Store
 *
 * Todas as operações e projeções são realizadas EXCLUSIVAMENTE pelo backend autenticado.
 * Nenhuma mutação direta no Firestore pelo cliente.
 */

import { authenticatedFetch } from '../../lib/api';
import {
  CommercialForecast,
  ForecastHorizon,
  ForecastBaselineSnapshot,
  WhatIfScenarioParams,
  WhatIfScenarioResult,
  CommercialForecastEvent
} from '../../types/commercialForecast';
import { CommercialAction } from '../../types/commercialGovernance';

export function createForecastIdempotencyKey(prefix: string = 'fc_op'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Obtém baseline histórico calculado em tempo real para um intervalo de datas
 */
export async function fetchForecastBaseline(startDate: string, endDate: string): Promise<{
  baseline: ForecastBaselineSnapshot;
  ordersCount: number;
  expensesCount: number;
}> {
  const params = new URLSearchParams({ startDate, endDate });
  const res = await authenticatedFetch(`/api/admin/commercial/forecast/baseline?${params.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao calcular baseline (${res.status})`);
  }
  const data = await res.json();
  return {
    baseline: data.baseline,
    ordersCount: data.ordersCount,
    expensesCount: data.expensesCount
  };
}

/**
 * Lista todos os forecasts comerciais salvos
 */
export async function fetchCommercialForecasts(): Promise<CommercialForecast[]> {
  const res = await authenticatedFetch('/api/admin/commercial/forecasts');
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao carregar forecasts (${res.status})`);
  }
  const data = await res.json();
  return data.forecasts || [];
}

/**
 * Obtém um forecast por ID
 */
export async function fetchCommercialForecastById(id: string): Promise<CommercialForecast> {
  const res = await authenticatedFetch(`/api/admin/commercial/forecasts/${id}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao obter forecast (${res.status})`);
  }
  const data = await res.json();
  return data.forecast;
}

/**
 * Cria um novo forecast com baseline imutável
 */
export interface CreateForecastPayload {
  title: string;
  horizon: ForecastHorizon;
  startDate?: string;
  endDate?: string;
  sourceStartDate?: string;
  sourceEndDate?: string;
  asOfDate?: string;
  forecastStartDate?: string;
  forecastEndDate?: string;
  notes?: string;
}

export async function createCommercialForecast(
  payload: CreateForecastPayload,
  idempotencyKey: string
): Promise<{ forecast: CommercialForecast; event: CommercialForecastEvent }> {
  if (!idempotencyKey) {
    throw new Error('Idempotency-Key é obrigatória para criar forecast.');
  }

  const res = await authenticatedFetch('/api/admin/commercial/forecasts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': idempotencyKey
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao criar forecast (${res.status})`);
  }

  const data = await res.json();
  return {
    forecast: data.forecast,
    event: data.event
  };
}

/**
 * Recalcula a projeção de um forecast existente
 */
export async function recalculateCommercialForecast(
  forecastId: string,
  idempotencyKey: string
): Promise<{ forecast: CommercialForecast; event: CommercialForecastEvent }> {
  if (!idempotencyKey) {
    throw new Error('Idempotency-Key é obrigatória para recalcular forecast.');
  }

  const res = await authenticatedFetch(`/api/admin/commercial/forecasts/${forecastId}/recalculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': idempotencyKey
    }
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao recalcular forecast (${res.status})`);
  }

  const data = await res.json();
  return {
    forecast: data.forecast,
    event: data.event
  };
}

/**
 * Simula Cenário What-If em tempo real via backend
 */
export async function simulateWhatIfScenarioViaApi(
  forecast: CommercialForecast,
  params: WhatIfScenarioParams
): Promise<WhatIfScenarioResult> {
  const res = await authenticatedFetch('/api/admin/commercial/forecast/scenario', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      forecast,
      params
    })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao simular cenário (${res.status})`);
  }

  const data = await res.json();
  return data.scenario;
}

/**
 * Atualiza campos parciais de um forecast existente
 */
export interface UpdateForecastPayload {
  status?: 'active' | 'archived' | 'superseded' | 'completed';
  notes?: string;
}

export async function updateCommercialForecast(
  id: string,
  payload: UpdateForecastPayload,
  idempotencyKey: string
): Promise<{ success: boolean; updated: Record<string, any>; event: CommercialForecastEvent }> {
  if (!idempotencyKey) {
    throw new Error('Idempotency-Key é obrigatória para atualizar forecast.');
  }

  const res = await authenticatedFetch(`/api/admin/commercial/forecasts/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': idempotencyKey
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao atualizar forecast (${res.status})`);
  }

  const data = await res.json();
  return data;
}

/**
 * Converte um cenário What-If em uma Ação Comercial concreta (Draft) no backend
 */
export async function convertScenarioToAction(params: {
  forecastId: string;
  scenario: WhatIfScenarioResult;
  targetProductId?: string;
  targetProductName?: string;
  idempotencyKey: string;
}): Promise<{ action: CommercialAction; forecastEvent: CommercialForecastEvent }> {
  const { forecastId, scenario, targetProductId, targetProductName, idempotencyKey } = params;

  if (!idempotencyKey) {
    throw new Error('Idempotency-Key é obrigatória para converter cenário em ação.');
  }

  const res = await authenticatedFetch('/api/admin/commercial/forecast/scenario/convert-to-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': idempotencyKey
    },
    body: JSON.stringify({
      forecastId,
      scenario,
      targetProductId,
      targetProductName
    })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao converter cenário em ação comercial (${res.status})`);
  }

  const data = await res.json();
  return {
    action: data.action,
    forecastEvent: data.forecastEvent
  };
}

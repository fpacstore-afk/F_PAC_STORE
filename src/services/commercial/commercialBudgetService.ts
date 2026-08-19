/**
 * CLIENT SERVICE — ORÇAMENTO COMERCIAL & GUARDRAILS FINANCEIROS
 * FASE 9.6.6 — FPAC Store
 *
 * Comunicação com as rotas autenticadas da API de Orçamento Comercial
 */

import { CommercialBudget, CommercialBudgetEvent } from '../../types/commercialBudget.js';

export function createBudgetIdempotencyKey(action: string, idSuffix: string = ''): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 9);
  return `budget_${action}_${idSuffix ? `${idSuffix}_` : ''}${ts}_${rand}`;
}

export async function fetchCommercialBudgets(params?: { status?: string; period?: string }): Promise<CommercialBudget[]> {
  const query = new URLSearchParams();
  if (params?.status) query.append('status', params.status);
  if (params?.period) query.append('period', params.period);

  const res = await fetch(`/api/admin/commercial/budgets?${query.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Falha ao listar orçamentos comerciais (${res.status})`);
  }
  const data = await res.json();
  return data.budgets || [];
}

export async function fetchCommercialBudgetById(id: string): Promise<CommercialBudget> {
  const res = await fetch(`/api/admin/commercial/budgets/${id}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Falha ao carregar orçamento comercial (${res.status})`);
  }
  const data = await res.json();
  return data.budget;
}

export async function fetchCommercialBudgetEvents(id: string): Promise<CommercialBudgetEvent[]> {
  const res = await fetch(`/api/admin/commercial/budgets/${id}/events`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Falha ao carregar eventos do orçamento (${res.status})`);
  }
  const data = await res.json();
  return data.events || [];
}

export async function createCommercialBudget(payload: any, idempotencyKey?: string): Promise<CommercialBudget> {
  const key = idempotencyKey || createBudgetIdempotencyKey('create');
  const res = await fetch('/api/admin/commercial/budgets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key
    },
    body: JSON.stringify({ ...payload, idempotencyKey: key })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Falha ao criar orçamento comercial (${res.status})`);
  }

  const data = await res.json();
  return data.budget;
}

export async function updateCommercialBudget(id: string, payload: any, idempotencyKey?: string): Promise<CommercialBudget> {
  const key = idempotencyKey || createBudgetIdempotencyKey('update', id);
  const res = await fetch(`/api/admin/commercial/budgets/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key
    },
    body: JSON.stringify({ ...payload, idempotencyKey: key })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Falha ao atualizar orçamento comercial (${res.status})`);
  }

  const data = await res.json();
  return data.budget;
}

export async function activateCommercialBudget(id: string, idempotencyKey?: string): Promise<CommercialBudget> {
  const key = idempotencyKey || createBudgetIdempotencyKey('activate', id);
  const res = await fetch(`/api/admin/commercial/budgets/${id}/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key
    },
    body: JSON.stringify({ idempotencyKey: key })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Falha ao ativar orçamento comercial (${res.status})`);
  }

  const data = await res.json();
  return data.budget;
}

export async function rebudgetCommercialBudget(id: string, payload: any, idempotencyKey?: string): Promise<CommercialBudget> {
  const key = idempotencyKey || createBudgetIdempotencyKey('rebudget', id);
  const res = await fetch(`/api/admin/commercial/budgets/${id}/rebudget`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key
    },
    body: JSON.stringify({ ...payload, idempotencyKey: key })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Falha ao realizar revisão/rebudgeting (${res.status})`);
  }

  const data = await res.json();
  return data.budget;
}

export async function recalculateCommercialBudget(id: string, idempotencyKey?: string): Promise<CommercialBudget> {
  const key = idempotencyKey || createBudgetIdempotencyKey('recalculate', id);
  const res = await fetch(`/api/admin/commercial/budgets/${id}/recalculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key
    },
    body: JSON.stringify({ idempotencyKey: key })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Falha ao recalcular orçamento comercial (${res.status})`);
  }

  const data = await res.json();
  return data.budget;
}

export async function archiveCommercialBudget(id: string, idempotencyKey?: string): Promise<CommercialBudget> {
  const key = idempotencyKey || createBudgetIdempotencyKey('archive', id);
  const res = await fetch(`/api/admin/commercial/budgets/${id}/archive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key
    },
    body: JSON.stringify({ idempotencyKey: key })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Falha ao arquivar orçamento comercial (${res.status})`);
  }

  const data = await res.json();
  return data.budget;
}

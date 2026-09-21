import { authenticatedFetch, parseApiJson } from '../lib/api';

export interface PrivateProductCostRecord {
  productId: string;
  slug?: string;
  costPrice?: number | null;
  cost?: number | null;
  costCalculation?: Record<string, any> | null;
  updatedAt?: any;
}

function notifyCostsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fpac:product-costs-changed'));
  }
}

async function ensureSuccess(response: Response) {
  if (response.ok) return;
  const payload: { error?: string } = await parseApiJson<{ error?: string }>(response).catch(() => ({}));
  throw new Error(payload.error || `Falha ao atualizar custo (HTTP ${response.status}).`);
}

export async function listPrivateProductCosts(): Promise<PrivateProductCostRecord[]> {
  const response = await authenticatedFetch('/api/admin/product-costs');
  await ensureSuccess(response);
  const payload = await parseApiJson<{ costs?: PrivateProductCostRecord[] }>(response);
  return Array.isArray(payload.costs) ? payload.costs : [];
}

export async function savePrivateProductCost(params: {
  productId: string;
  slug?: string;
  costPrice?: number | null;
  costCalculation?: Record<string, any> | null;
}) {
  const response = await authenticatedFetch(`/api/admin/product-costs/${encodeURIComponent(params.productId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: params.slug || '',
      costPrice: params.costPrice ?? null,
      costCalculation: params.costCalculation ?? null
    })
  });
  await ensureSuccess(response);
  notifyCostsChanged();
}

export async function deletePrivateProductCost(productId: string) {
  const response = await authenticatedFetch(`/api/admin/product-costs/${encodeURIComponent(productId)}`, {
    method: 'DELETE'
  });
  await ensureSuccess(response);
  notifyCostsChanged();
}

export async function deleteAllPrivateProductCosts() {
  const response = await authenticatedFetch('/api/admin/product-costs', { method: 'DELETE' });
  await ensureSuccess(response);
  notifyCostsChanged();
}

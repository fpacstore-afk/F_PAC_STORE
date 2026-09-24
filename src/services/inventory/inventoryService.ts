import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { authenticatedFetch } from '../../lib/api';

export interface StockAdjustmentInput {
  variantKey: string;
  quantity: number;
  reason?: string;
}

export function subscribeToInventory(callback: (inventoryMap: Record<string, any>) => void) {
  const colRef = collection(db, 'inventory');
  return onSnapshot(colRef, (snapshot) => {
    const invMap: Record<string, any> = {};
    snapshot.docs.forEach((doc) => {
      invMap[doc.id] = doc.data();
    });
    callback(invMap);
  });
}

export async function updateVariantStockInDb(
  productSlug: string,
  variantKey: string,
  newStock: number,
  operator: string = 'Admin',
  reason?: string
) {
  if (newStock < 0) {
    throw new Error('ESTOQUE_INSUFICIENTE: O estoque não pode ser negativo.');
  }

  const response = await authenticatedFetch('/api/admin/stock/movement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productSlug,
      variantKey,
      type: 'adjust',
      quantity: Math.max(0, newStock),
      reason: reason || `Ajuste manual de estoque via painel por ${operator}`
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || errData.message || 'Erro ao atualizar estoque.');
  }

  return response.json();
}

/**
 * Confirma uma grade inteira em uma única operação atômica. Isso evita que um
 * produto seja salvo enquanto apenas parte das cores/tamanhos foi persistida.
 */
export async function adjustMultipleVariantStocksInDb(
  productSlug: string,
  updates: StockAdjustmentInput[],
  reason: string = 'Ajuste manual de estoque',
  idempotencyKey?: string
) {
  const normalizedProductSlug = String(productSlug || '').trim();
  if (!normalizedProductSlug) {
    throw new Error('Informe o produto para atualizar o estoque.');
  }
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error('Informe ao menos uma variação para atualizar o estoque.');
  }
  if (updates.length > 100) {
    throw new Error('A grade possui variações demais para uma única confirmação.');
  }

  const seenVariants = new Set<string>();
  const normalizedUpdates = updates.map((update) => {
    const variantKey = String(update?.variantKey || '').trim();
    const quantity = Number(update?.quantity);
    if (!variantKey || !Number.isSafeInteger(quantity) || quantity < 0) {
      throw new Error('Cada variação precisa ter uma quantidade inteira maior ou igual a zero.');
    }
    if (seenVariants.has(variantKey)) {
      throw new Error(`A variação ${variantKey} foi informada mais de uma vez.`);
    }
    seenVariants.add(variantKey);
    return {
      variantKey,
      quantity,
      reason: String(update?.reason || reason || 'Ajuste manual de estoque').trim()
    };
  });
  const normalizedIdempotencyKey = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (normalizedIdempotencyKey && !/^[A-Za-z0-9_-]{8,160}$/.test(normalizedIdempotencyKey)) {
    throw new Error('Não foi possível identificar esta confirmação de estoque. Tente salvar novamente.');
  }

  const response = await authenticatedFetch('/api/admin/stock/bulk-adjust', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productSlug: normalizedProductSlug,
      updates: normalizedUpdates,
      reason,
      idempotencyKey: normalizedIdempotencyKey || undefined
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || errData.message || 'Erro ao confirmar a grade de estoque.');
  }

  return response.json();
}

export async function recordStockMovementInDb(
  productSlug: string,
  variantKey: string,
  type: 'add' | 'subtract' | 'adjust' | 'sale' | 'return',
  quantity: number,
  reason: string
) {
  const response = await authenticatedFetch('/api/admin/stock/movement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productSlug,
      variantKey,
      type,
      quantity: Math.abs(quantity),
      reason
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || errData.message || 'Erro ao registrar movimentação de estoque.');
  }

  return response.json();
}

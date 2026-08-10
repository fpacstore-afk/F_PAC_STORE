import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { authenticatedFetch } from '../../lib/api';

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
  operator: string = 'Admin'
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
      reason: `Ajuste manual de estoque via painel por ${operator}`
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || errData.message || 'Erro ao atualizar estoque.');
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


import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { authenticatedFetch } from '../../lib/api';

export interface PaymentLog {
  id: string;
  amount: number;
  date: any;
  method: string;
  operator?: string;
}

export async function fetchOrdersList(): Promise<any[]> {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToOrders(callback: (orders: any[]) => void) {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const ordersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(ordersData);
  });
}

export async function updateProductionStatus(
  orderId: string,
  newStatus: string,
  operator: string = 'Admin',
  note?: string
) {
  if (!orderId) throw new Error('ID do pedido não fornecido.');

  const response = await authenticatedFetch(`/api/admin/orders/${orderId}/production-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newStatus,
      currentStage: newStatus,
      note,
      operator
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao atualizar estágio de produção.');
  }

  return response.json();
}

export async function updateProductionPriority(
  orderId: string,
  priority: 'normal' | 'alta' | 'urgente',
  note?: string
) {
  if (!orderId) throw new Error('ID do pedido não fornecido.');

  const response = await authenticatedFetch(`/api/admin/orders/${orderId}/production-priority`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priority, note })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao atualizar prioridade de produção.');
  }

  return response.json();
}

export async function updateProductionAssignment(
  orderId: string,
  assignedTo: string,
  note?: string
) {
  if (!orderId) throw new Error('ID do pedido não fornecido.');

  const response = await authenticatedFetch(`/api/admin/orders/${orderId}/production-assignment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignedTo, note })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao atribuir responsável da produção.');
  }

  return response.json();
}

export async function updateProductionDueDate(
  orderId: string,
  productionDueDate: string,
  note?: string
) {
  if (!orderId) throw new Error('ID do pedido não fornecido.');

  const response = await authenticatedFetch(`/api/admin/orders/${orderId}/production-due-date`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productionDueDate, note })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao definir prazo de produção.');
  }

  return response.json();
}

export async function addProductionNote(
  orderId: string,
  note: string
) {
  if (!orderId) throw new Error('ID do pedido não fornecido.');

  const response = await authenticatedFetch(`/api/admin/orders/${orderId}/production-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao adicionar observação de produção.');
  }

  return response.json();
}

export async function updateOrderStatusInDb(orderId: string, newStatus: string, extraFields: Record<string, any> = {}) {
  const isPaymentState = ['pending', 'approved', 'rejected', 'cancelled', 'refunded', 'pago', 'recusado', 'cancelado'].includes(newStatus);
  if (isPaymentState) {
    const mappedPaymentStatus = newStatus === 'pago' ? 'approved' : (newStatus === 'recusado' ? 'rejected' : newStatus);
    const response = await authenticatedFetch(`/api/admin/orders/${orderId}/payment-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newStatus: mappedPaymentStatus,
        reason: extraFields.reason || `Atualização de status via painel`
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || err.error || 'Erro ao atualizar status de pagamento.');
    }
    return response.json();
  } else {
    return updateProductionStatus(orderId, newStatus, 'Admin', extraFields.note);
  }
}

export async function registerPartialPayment(
  orderId: string,
  amount: number,
  method: string,
  currentAmountPaid: number,
  currentTotal: number,
  operator: string = 'Admin'
) {
  if (!orderId) throw new Error('ID do pedido não fornecido.');
  const numericAmount = Number(amount) || 0;
  const newAmountPaid = (Number(currentAmountPaid) || 0) + numericAmount;
  const newBalanceDue = (Number(currentTotal) || 0) - newAmountPaid;

  let newPaymentStatus: 'pending' | 'approved' | 'partially_paid' = 'partially_paid';
  if (newBalanceDue <= 0) newPaymentStatus = 'approved';

  const response = await authenticatedFetch(`/api/admin/orders/${orderId}/payment-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newStatus: newPaymentStatus,
      reason: `Pagamento de R$ ${numericAmount.toFixed(2)} via ${method} por ${operator}`
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao registrar pagamento.');
  }

  return response.json();
}

export async function registerPaymentInstallment(
  orderId: string,
  amount: number,
  method: string,
  currentAmountPaid: number,
  currentTotal: number,
  operator: string = 'Admin'
) {
  return registerPartialPayment(orderId, amount, method, currentAmountPaid, currentTotal, operator);
}

export async function registerInstallmentPayment(
  orderId: string,
  amount: number,
  method: string,
  operator: string = 'Admin'
) {
  return registerPartialPayment(orderId, amount, method, 0, amount, operator);
}

export async function cancelOrder(orderId: string, reason?: string) {
  if (!orderId) throw new Error('ID do pedido não fornecido.');

  const response = await authenticatedFetch(`/api/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Erro ao cancelar o pedido.');
  }

  return response.json();
}

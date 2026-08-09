import { doc, getDoc, updateDoc, arrayUnion, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface PaymentLog {
  id: string;
  amount: number;
  date: any;
  method: string;
  operator?: string;
}

export const updateProductionStatus = async (orderId: string, newStatus: string, operator: string = 'Admin') => {
  if (!orderId) throw new Error('ID do pedido não fornecido.');
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    productionStatus: newStatus,
    status: newStatus,
    updatedAt: Timestamp.now(),
    historyLogs: arrayUnion({
      date: Timestamp.now(),
      action: `Status de produção alterado para ${newStatus}`,
      operator
    })
  });
};

export const registerPartialPayment = async (
  orderId: string, 
  amount: number, 
  method: string, 
  currentAmountPaid: number, 
  currentTotal: number, 
  operator: string = 'Admin'
) => {
  if (!orderId) throw new Error('ID do pedido não fornecido.');
  const numericAmount = Number(amount) || 0;
  const newAmountPaid = (Number(currentAmountPaid) || 0) + numericAmount;
  const newBalanceDue = (Number(currentTotal) || 0) - newAmountPaid;
  
  let newPaymentStatus = 'parcial';
  if (newBalanceDue <= 0) newPaymentStatus = 'aprovado';
  if (newAmountPaid === 0) newPaymentStatus = 'pendente';

  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    amountPaid: newAmountPaid,
    balanceDue: Math.max(0, newBalanceDue), // Evita saldo negativo
    paymentStatus: newPaymentStatus,
    updatedAt: Timestamp.now(),
    paymentLogs: arrayUnion({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      amount: numericAmount,
      date: Timestamp.now(),
      method,
      operator
    }),
    historyLogs: arrayUnion({
      date: Timestamp.now(),
      action: `Pagamento parcial de R$ ${numericAmount.toFixed(2)} registrado. Via: ${method}`,
      operator
    })
  });
};

export const registerPaymentInstallment = async (
  orderId: string, 
  amount: number, 
  method: string, 
  currentAmountPaid: number, 
  currentTotal: number, 
  operator: string = 'Admin'
) => {
  return registerPartialPayment(orderId, amount, method, currentAmountPaid, currentTotal, operator);
};

/**
 * Compatibility wrapper for existing callers
 */
export async function registerInstallmentPayment(
  orderId: string,
  amount: number,
  method: string,
  operator: string = 'admin'
) {
  const orderRef = doc(db, 'orders', orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) {
    throw new Error('Pedido não encontrado no banco de dados.');
  }
  const orderData = orderSnap.data();
  const total = Number(orderData.total) || 0;
  let currentPaid = 0;
  if (orderData.amountPaid !== undefined && orderData.amountPaid !== null) {
    currentPaid = Number(orderData.amountPaid) || 0;
  } else if (
    ['payment_approved', 'Pagamento Aprovado', 'shipped', 'delivered', 'separacao', 'embalagem', 'aprovado', 'approved'].includes(orderData.status) ||
    ['aprovado', 'approved', 'paid'].includes(orderData.paymentStatus)
  ) {
    currentPaid = total;
  }

  await registerPaymentInstallment(orderId, amount, method, currentPaid, total, operator);
}


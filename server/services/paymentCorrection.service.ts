import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../firebase.js';
import { deriveLedgerEventId } from './financialLedger.service.js';
import { canCorrectRecordedPayment, paymentCorrectionRevision } from '../../shared/paymentCorrection.js';
import { getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderPaymentStatus, getOrderTotal } from '../../shared/orderFinancialCore.js';
import { correctedReceiptBasis } from '../../shared/financialReceipts.js';

function fail(code: string, message: string, status = 400): never { throw Object.assign(new Error(message), { code, status }); }

export async function correctRecordedPayment(input: {
  orderId: string; correctedPaidAmount: number; reason: string; idempotencyKey: string;
  expectedRevision: string; confirmed: boolean; actor: { uid: string; email?: string };
}, db = getDb()) {
  const { orderId, correctedPaidAmount, idempotencyKey, expectedRevision, actor } = input;
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!orderId || orderId.includes('/') || orderId.length > 200 || typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 200 ||
      !Number.isFinite(correctedPaidAmount) || correctedPaidAmount < 0 ||
      Math.abs(correctedPaidAmount * 100 - Math.round(correctedPaidAmount * 100)) > 0.00001 ||
      reason.length < 5 || reason.length > 500 || input.confirmed !== true || !expectedRevision || !actor?.uid) {
    fail('INVALID_PAYMENT_CORRECTION', 'Informe o total recebido correto, o motivo e confirme a conferência.');
  }
  const eventId = deriveLedgerEventId(`payment-correction:${idempotencyKey.trim()}`);
  const ref = db.collection('orders').doc(orderId), eventRef = db.collection('financial_events').doc(eventId);
  return db.runTransaction(async (tx: any) => {
    const existing = await tx.get(eventRef), snap = await tx.get(ref);
    if (!snap.exists) fail('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
    const order = snap.data()!;
    if (existing.exists) {
      const event = existing.data();
      if (event.orderId !== orderId || event.type !== 'payment_correction' || event.newPaidAmount !== correctedPaidAmount || event.reason !== reason) {
        fail('IDEMPOTENCY_CONFLICT', 'Esta solicitação já foi usada em outra correção.', 409);
      }
      return { success: true, idempotentReplay: true, eventId, order: financialPatch(orderId, order) };
    }
    if (paymentCorrectionRevision(order) !== expectedRevision) fail('PAYMENT_CORRECTION_STALE', 'O financeiro mudou. Atualize o pedido e confira os valores novamente.', 409);
    if (!canCorrectRecordedPayment(order)) fail('PAYMENT_CORRECTION_NOT_ALLOWED', 'Correção disponível para recebimentos manuais sem estorno ativo. Pagamentos do provedor exigem conciliação.', 409);
    const previousPaid = getOrderPaidAmount(order), total = getOrderTotal(order);
    if (![previousPaid,total].every(value => Number.isFinite(value) && value >= 0) || correctedPaidAmount >= previousPaid || correctedPaidAmount > total) {
      fail('INVALID_PAYMENT_CORRECTION', 'O total correto deve ser menor que o registrado. Para novos recebimentos, use Registrar pagamento.');
    }
    const pending = Math.max(0, Math.round(total * 100) - Math.round(correctedPaidAmount * 100)) / 100;
    const status = pending === 0 ? 'approved' : correctedPaidAmount > 0 ? 'partially_paid' : 'pending';
    const timestamp = new Date().toISOString();
    const basis = correctedReceiptBasis(order, correctedPaidAmount, eventId);
    const correction = { eventId, previousPaidAmount: previousPaid, newPaidAmount: correctedPaidAmount,
      amount: Math.round((correctedPaidAmount - previousPaid) * 100) / 100, reason, timestamp, operator: actor.email || actor.uid };
    const payment = { ...(order.payment || {}), paidAmount: correctedPaidAmount, pendingAmount: pending, status, paidAt: null };
    const originalInstallments = Array.isArray(order.payment?.installments) ? order.payment.installments : Array.isArray(order.installments) ? order.installments : null;
    let installments: any[] | null = null;
    if (originalInstallments?.length) {
      let available = Math.round(correctedPaidAmount * 100);
      installments = originalInstallments.map((installment: any) => {
        const amount = Math.round(Number(installment.amount) * 100);
        if (!Number.isFinite(amount) || amount < 0) fail('INVALID_INSTALLMENTS', 'Confira os valores das parcelas antes de corrigir.', 409);
        const allocated = Math.min(amount, available); available -= allocated;
        return { ...installment, paidAmount: allocated / 100, status: allocated >= amount ? 'paid' : 'pending',
          paidAt: allocated >= amount ? installment.paidAt || null : null };
      });
      if (available > 0) fail('INVALID_INSTALLMENTS', 'As parcelas não cobrem o total recebido. Confira a grade de pagamentos.', 409);
      payment.installments = installments;
    }
    const patch: any = { payment, paidAmount: correctedPaidAmount, amountPaid: correctedPaidAmount, balanceDue: pending,
      paymentStatus: status, paymentReceiptBasis: basis, paymentCorrections: [...(order.paymentCorrections || []), correction] };
    if (installments) patch.installments = installments;
    const event = { id: eventId, orderId, type: 'payment_correction', amount: correction.amount,
      previousStatus: getOrderPaymentStatus(order), newStatus: status,
      previousPaidAmount: previousPaid, newPaidAmount: correctedPaidAmount,
      previousPendingAmount: getOrderPendingAmount(order), newPendingAmount: pending,
      previousRefundedAmount: getOrderRefundedAmount(order), newRefundedAmount: getOrderRefundedAmount(order),
      provider: 'manual', paymentMethod: order.payment?.method || order.paymentMethod || 'MANUAL',
      actorId: actor.uid, ...(actor.email ? { actorEmail: actor.email } : {}), reason,
      idempotencyKey: idempotencyKey.trim(), receiptBasis: basis, previousReceiptBasis: order.paymentReceiptBasis || null,
      previousPaymentPaidAt: order.payment?.paidAt || null,
      createdAt: timestamp, recordedAt: FieldValue.serverTimestamp() };
    tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion({ ...correction, type: 'payment_correction', status, message: reason }) });
    tx.set(eventRef, event);
    // Audit is atomic with the order and its immutable financial event.
    tx.set(db.collection('audit_logs').doc(eventId), { action: 'CORRECT_RECORDED_PAYMENT', userId: actor.uid,
      resource: 'orders', resourceId: orderId, userEmail: actor.email || 'owner-request',
      metadata: { reason, previousPaidAmount: previousPaid, newPaidAmount: correctedPaidAmount, newPendingAmount: pending, eventId }, timestamp });
    return { success: true, idempotentReplay: false, eventId, order: { id: orderId, ...patch } };
  });
}

export function financialPatch(id: string, order: any) {
  return { id, payment: order.payment, paidAmount: getOrderPaidAmount(order), amountPaid: getOrderPaidAmount(order),
    balanceDue: getOrderPendingAmount(order), paymentStatus: getOrderPaymentStatus(order),
    paymentReceiptBasis: order.paymentReceiptBasis || null, paymentCorrections: order.paymentCorrections || [],
    paymentLogs: order.paymentLogs || [], refundLogs: order.refundLogs || [],
    ...(Array.isArray(order.installments) ? { installments: order.installments } : {}) };
}

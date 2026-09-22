import crypto from 'node:crypto';
import { getDb } from '../firebase.js';
import { mpService } from './mp.service.js';
import { processPaymentUpdate } from './payment.service.js';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const validCheckoutKey = (key: unknown): key is string => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
export const checkoutTrackingToken = (key: string) => digest(`checkout-tracking:${key}`);
const pending = { pendingConfirmation: true, status: 'pending', message: 'Ainda estamos confirmando esta tentativa. Consulte novamente antes de fazer outro pagamento.' };

// The opaque key is both the retry identity and a guest capability. Only its hash
// is stored. No card token or customer/contact payload is persisted in this record.
export function createCheckoutAttempts(deps = { getDb, mpService, processPaymentUpdate }) {
  const refFor = (key: string) => deps.getDb().collection('checkout_attempts').doc(digest(key));
  const assertOwner = (record: any, uid: string | null) => {
    if (record.userId !== uid) throw Object.assign(new Error('Tentativa não autorizada.'), { status: 403 });
  };
  const claim = async (key: string, uid: string | null) => deps.getDb().runTransaction(async (tx: any) => {
    const ref = refFor(key), snap = await tx.get(ref);
    if (snap.exists) { assertOwner(snap.data(), uid); return { ...snap.data(), fresh: false }; }
    const value = { orderId: `FPAC-${crypto.randomUUID()}`, userId: uid, phase: 'preparing', createdAt: new Date().toISOString() };
    tx.set(ref, value);
    return { ...value, fresh: true };
  });
  const submitted = async (key: string, orderId: string) => {
    await deps.getDb().runTransaction(async (tx: any) => {
      const attemptRef = refFor(key), snap = await tx.get(attemptRef);
      if (!snap.exists || snap.data().phase !== 'preparing' || snap.data().orderId !== orderId) throw new Error('Tentativa inválida.');
      tx.update(attemptRef, { phase: 'submitted', submittedAt: new Date().toISOString() });
      tx.update(deps.getDb().collection('orders').doc(orderId), { paymentCreationUncertain: true });
    });
  };
  const failBeforeSubmission = async (key: string) => {
    await deps.getDb().runTransaction(async (tx: any) => {
      const ref = refFor(key), snap = await tx.get(ref);
      if (snap.exists && snap.data().phase === 'preparing') tx.update(ref, { phase: 'failed' });
    });
  };
  const complete = async (key: string, result: any) => {
    // The payment pipeline validates amount/identity and updates the canonical order
    // before any response is treated as confirmed by the browser.
    const record = (await refFor(key).get()).data();
    if (!record || !result?.id || result.external_reference !== record.orderId) throw new Error('Resposta de pagamento incompatível.');
    await deps.processPaymentUpdate(record.orderId, result);
    await deps.getDb().collection('orders').doc(record.orderId).update({ paymentCreationUncertain: false });
    await refFor(key).update({ phase: 'complete', paymentId: String(result.id), updatedAt: new Date().toISOString() });
    const order = (await deps.getDb().collection('orders').doc(record.orderId).get()).data();
    return {
      id: result.id, status: order.payment?.status || order.paymentStatus || 'pending', payment_method_id: result.payment_method_id,
      payment_type_id: result.payment_type_id, external_reference: record.orderId,
      trackingAccessToken: checkoutTrackingToken(key), pricing: order.pricing,
      // Do not reflect unrelated provider or payer metadata to the client.
      point_of_interaction: { transaction_data: {
        qr_code: result.point_of_interaction?.transaction_data?.qr_code || '',
        qr_code_base64: result.point_of_interaction?.transaction_data?.qr_code_base64 || '',
      } },
    };
  };
  const resume = async (key: string, uid: string | null) => {
    const record = await deps.getDb().runTransaction(async (tx: any) => {
      const ref = refFor(key), snap = await tx.get(ref);
      if (snap.exists) { assertOwner(snap.data(), uid); return snap.data(); }
      // Seal a missing attempt: a delayed initial request can no longer create a
      // payment after the browser has been told it is safe to start again.
      const closed = { userId: uid, phase: 'failed', createdAt: new Date().toISOString() };
      tx.set(ref, closed); return closed;
    });
    if (record.phase === 'failed') return { safeToRetry: true, status: 'not_started', message: 'Nenhuma cobrança foi iniciada nesta tentativa. Você pode tentar novamente.' };
    if (record.phase === 'preparing') return pending;
    const order = (await deps.getDb().collection('orders').doc(record.orderId).get()).data();
    const paymentId = record.paymentId || order?.mercadoPagoId || order?.payment_id;
    const result = paymentId ? await deps.mpService.getPayment(String(paymentId)) : await deps.mpService.findPaymentByOrder(record.orderId);
    if (!result) return { ...pending, external_reference: record.orderId, trackingAccessToken: checkoutTrackingToken(key) };
    return complete(key, result);
  };
  return { claim, submitted, failBeforeSubmission, complete, resume };
}

export const checkoutAttempts = createCheckoutAttempts();

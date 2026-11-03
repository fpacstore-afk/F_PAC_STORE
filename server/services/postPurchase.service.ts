import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { getDb } from '../firebase.js';
import { sendWhatsAppMessage } from './automation.service.js';

const SETTINGS_ID = 'default';
const DEFAULT_SETTINGS = { surveyAutomatic: false, repurchaseAutomatic: false, discountPercent: 0, couponValidityDays: 30 };
const clean = (value: unknown, max = 160) => String(value ?? '').trim().slice(0, max);
const millis = (value: any) => value?.toDate ? value.toDate().getTime() : value instanceof Date ? value.getTime() : Date.parse(value || '');
const iso = (value: any) => Number.isFinite(millis(value)) ? new Date(millis(value)).toISOString() : '';
const phoneOf = (order: any) => String(order?.customer?.phone || order?.customerPhone || '').replace(/\D/g, '');
const emailOf = (order: any) => String(order?.customer?.email || order?.customerEmail || '').trim().toLowerCase();
const paid = (order: any) => ['approved', 'paid', 'partially_paid'].includes(String(order?.paymentStatus || order?.payment?.status || '').toLowerCase());

export async function getPostPurchaseDashboard() {
  const db = getDb();
  const [settingsSnap, ordersSnap] = await Promise.all([
    db.collection('post_purchase_settings').doc(SETTINGS_ID).get(),
    db.collection('orders').orderBy('createdAt', 'desc').limit(500).get(),
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...(settingsSnap.data() || {}) };
  const orders = ordersSnap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }))
    .filter((order: any) => paid(order) && (phoneOf(order) || emailOf(order)))
    .sort((a: any, b: any) => millis(b.createdAt) - millis(a.createdAt))
    .slice(0, 300)
    .map((order: any) => ({
      id: order.id, customerName: clean(order.customer?.name || order.customerName || 'Cliente'),
      phone: phoneOf(order), email: emailOf(order), createdAt: iso(order.createdAt),
      items: (order.items || []).map((item: any) => ({ name: clean(item.name), color: clean(item.color, 50), size: clean(item.size, 20), quantity: Number(item.quantity) || 1 })),
      satisfaction: order.postPurchaseSatisfaction || null,
      surveyStatus: order.postPurchaseSurveyStatus || 'pending',
      repurchaseStatus: order.postPurchaseRepurchaseStatus || 'pending',
      marketingConsent: order.postPurchaseMarketingConsent === true,
    }));
  return { settings, orders, whatsappAutomaticAvailable: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY) };
}

export async function savePostPurchaseSettings(input: any) {
  const discountPercent = Math.max(0, Math.min(50, Number(input?.discountPercent) || 0));
  const couponValidityDays = Math.max(1, Math.min(180, Math.floor(Number(input?.couponValidityDays) || 30)));
  const data = {
    surveyAutomatic: input?.surveyAutomatic === true,
    repurchaseAutomatic: input?.repurchaseAutomatic === true && discountPercent > 0,
    discountPercent, couponValidityDays,
    updatedAt: new Date().toISOString(),
  };
  await getDb().collection('post_purchase_settings').doc(SETTINGS_ID).set(data, { merge: true });
  return data;
}

async function issueCoupon(order: any, settings: any) {
  if (Number(settings.discountPercent) <= 0) throw new Error('Configure o percentual do bônus antes de emitir cupons.');
  const db = getDb();
  const docRef = db.collection('post_purchase_coupons').doc(`return_${order.id}`);
  const snap = await docRef.get();
  if (snap.exists) return snap.data();
  const code = `VOLTA${randomBytes(5).toString('hex').toUpperCase()}`;
  const now = Date.now();
  const coupon = {
    code, orderId: order.id, email: emailOf(order), phone: phoneOf(order),
    discountPercent: Number(settings.discountPercent), status: 'active',
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + Number(settings.couponValidityDays) * 86400000).toISOString(),
  };
  await docRef.create(coupon);
  return coupon;
}

const surveyMessage = (name: string) => `Oi, ${name}! Passando para saber como foi sua experiência com a F PAC STORE.\n\n1) O que achou do produto? (1 a 5)\n2) Como avalia o atendimento? (1 a 5)\n3) Teve dificuldade na compra? (não / sim — qual?)\n\nSua resposta ajuda a gente a melhorar. Obrigado!`;

export async function preparePostPurchaseMessage(orderId: string, kind: 'survey' | 'repurchase', manual = true) {
  const db = getDb();
  const orderRef = db.collection('orders').doc(clean(orderId, 128));
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists || !paid(orderSnap.data())) throw new Error('Pedido não encontrado ou ainda sem pagamento aprovado.');
  const order = { ...orderSnap.data(), id: orderSnap.id };
  const phone = phoneOf(order);
  if (phone.length < 10) throw new Error('Pedido sem telefone válido para WhatsApp.');
  let message = '';
  if (kind === 'survey') {
    message = surveyMessage(clean(order.customer?.name || order.customerName || 'Cliente').split(' ')[0]);
  } else {
    const settings = { ...DEFAULT_SETTINGS, ...((await db.collection('post_purchase_settings').doc(SETTINGS_ID).get()).data() || {}) };
    const coupon = await issueCoupon(order, settings);
    message = `Oi, ${clean(order.customer?.name || order.customerName || 'Cliente').split(' ')[0]}! Preparamos um bônus de ${coupon.discountPercent}% para sua próxima compra na F PAC STORE.\n\nUse o cupom ${coupon.code} no site até ${new Date(coupon.expiresAt).toLocaleDateString('pt-BR')}: https://www.fpacstore.com.br/`;
  }
  if (manual) {
    await orderRef.update(kind === 'survey' ? { postPurchaseSurveyManualPreparedAt: new Date().toISOString() } : { postPurchaseRepurchaseManualPreparedAt: new Date().toISOString() });
    return { whatsappUrl: `https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}?text=${encodeURIComponent(message)}`, message };
  }
  const sent = await sendWhatsAppMessage(phone, 'custom_message', { customMessage: message, customerName: order.customerName, id: order.id });
  await orderRef.update(kind === 'survey'
    ? { postPurchaseSurveyStatus: sent ? 'sent' : 'failed', postPurchaseSurveySentAt: sent ? new Date().toISOString() : null }
    : { postPurchaseRepurchaseStatus: sent ? 'sent' : 'failed', postPurchaseRepurchaseSentAt: sent ? new Date().toISOString() : null });
  return { sent };
}

export async function saveSurveyResponse(orderId: string, input: any) {
  const productRating = Number(input?.productRating), serviceRating = Number(input?.serviceRating);
  const checkoutDifficulty = ['no', 'yes'].includes(input?.checkoutDifficulty) ? input.checkoutDifficulty : '';
  if (!Number.isInteger(productRating) || productRating < 1 || productRating > 5 || !Number.isInteger(serviceRating) || serviceRating < 1 || serviceRating > 5 || !checkoutDifficulty) throw new Error('Informe as duas notas de 1 a 5 e se houve dificuldade na compra.');
  const values = {
    productRating, serviceRating, checkoutDifficulty,
    difficultyDetails: clean(input?.difficultyDetails, 500), notes: clean(input?.notes, 1000),
    updatedAt: new Date().toISOString(),
  };
  await getDb().collection('orders').doc(clean(orderId, 128)).update({ postPurchaseSatisfaction: values });
  return values;
}

export async function validateRepurchaseCoupon(code: unknown, phone: unknown, email: unknown) {
  const normalized = clean(code, 32).toUpperCase();
  if (!normalized) return null;
  const db = getDb();
  const snapshot = await db.collection('post_purchase_coupons').where('code', '==', normalized).limit(1).get();
  if (snapshot.empty) return null;
  const coupon = snapshot.docs[0].data();
  if (coupon.status !== 'active' || Date.parse(coupon.expiresAt) <= Date.now()) return null;
  const matchesPhone = coupon.phone && String(coupon.phone) === String(phone || '').replace(/\D/g, '');
  const matchesEmail = coupon.email && String(coupon.email).toLowerCase() === String(email || '').trim().toLowerCase();
  if (!matchesPhone && !matchesEmail) return null;
  return coupon;
}

export async function reserveRepurchaseCoupon(code: unknown, phone: unknown, email: unknown, orderId: string) {
  const coupon = await validateRepurchaseCoupon(code, phone, email);
  if (!coupon) return false;
  const snapshot = await getDb().collection('post_purchase_coupons').where('code', '==', String(coupon.code).toUpperCase()).limit(1).get();
  if (snapshot.empty) throw new Error('Este cupom não está mais disponível.');
  const ref = snapshot.docs[0].ref;
  await getDb().runTransaction(async (tx: any) => {
    const current = (await tx.get(ref)).data();
    if (current?.status === 'reserved' && current?.reservedByOrderId === orderId) return;
    if (current?.status !== 'active' || Date.parse(current.expiresAt) <= Date.now()) throw new Error('Este cupom já foi usado ou expirou.');
    tx.update(ref, { status: 'reserved', reservedByOrderId: orderId, reservedAt: new Date().toISOString() });
  });
  return true;
}

export async function releaseRepurchaseCoupon(code: unknown, orderId: string, redeemed = false) {
  const normalized = clean(code, 32).toUpperCase();
  if (!normalized) return;
  const snapshot = await getDb().collection('post_purchase_coupons').where('code', '==', normalized).limit(1).get();
  if (snapshot.empty) return;
  const ref = snapshot.docs[0].ref;
  await getDb().runTransaction(async (tx: any) => {
    const current = (await tx.get(ref)).data();
    if (current?.status !== 'reserved' || current?.reservedByOrderId !== orderId) return;
    tx.update(ref, redeemed
      ? { status: 'redeemed', redeemedByOrderId: orderId, redeemedAt: new Date().toISOString() }
      : { status: 'active', reservedByOrderId: FieldValue.delete(), reservedAt: FieldValue.delete() });
  });
}

export async function runPostPurchaseAutomations() {
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) return;
  const db = getDb();
  const settingsSnap = await db.collection('post_purchase_settings').doc(SETTINGS_ID).get();
  const settings = { ...DEFAULT_SETTINGS, ...(settingsSnap.data() || {}) };
  if (!settings.surveyAutomatic && !settings.repurchaseAutomatic) return;
  const orders = await db.collection('orders').where('postPurchaseMarketingConsent', '==', true).get();
  const now = Date.now();
  for (const snap of orders.docs) {
    const order = { ...snap.data(), id: snap.id };
    if (!paid(order) || order.postPurchaseMarketingConsent !== true || phoneOf(order).length < 10) continue;
    const age = now - millis(order.paidAt || order.createdAt);
    for (const [kind, enabled, delay] of [
      ['survey', settings.surveyAutomatic, 7 * 86400000],
      ['repurchase', settings.repurchaseAutomatic, 30 * 86400000],
    ] as const) {
      if (!enabled || age < delay) continue;
      const statusField = kind === 'survey' ? 'postPurchaseSurveyStatus' : 'postPurchaseRepurchaseStatus';
      if (order[statusField] === 'sent') continue;
      const ref = snap.ref;
      const attemptsField = kind === 'survey' ? 'postPurchaseSurveyAttemptCount' : 'postPurchaseRepurchaseAttemptCount';
      const retryField = kind === 'survey' ? 'postPurchaseSurveyRetryAt' : 'postPurchaseRepurchaseRetryAt';
      let claimed = false;
      await db.runTransaction(async (tx: any) => {
        const fresh = (await tx.get(ref)).data();
        if (!fresh || fresh.postPurchaseMarketingConsent !== true || fresh[statusField] === 'sent') return;
        const lease = Date.parse(fresh[`${statusField}LeaseUntil`] || '');
        if (lease > now) return;
        if (Date.parse(fresh[retryField] || '') > now) return;
        let attemptNumber = Number(fresh[attemptsField]) || 0;
        if (attemptNumber >= 3) return;
        attemptNumber += 1;
        tx.update(ref, { [statusField]: 'sending', [attemptsField]: attemptNumber, [`${statusField}LeaseUntil`]: new Date(now + 5 * 60000).toISOString() });
        claimed = true;
      });
      if (!claimed) continue;
      try {
        const result = await preparePostPurchaseMessage(order.id, kind, false);
        if (!result.sent) await ref.update({ [retryField]: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
      } catch {
        await ref.update({ [statusField]: 'failed', [`${statusField}RetryAt`]: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), [`${statusField}LeaseUntil`]: FieldValue.delete() });
      }
    }
  }
}

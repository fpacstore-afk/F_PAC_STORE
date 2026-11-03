import { createHash, randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { getDb } from '../firebase.js';
import { sendWhatsAppMessage } from './automation.service.js';

const SETTINGS_ID = 'default';
const DEFAULT_SETTINGS = {
  surveyEmailAutomatic: true, repurchaseEmailAutomatic: true,
  surveyWhatsAppAutomatic: false, repurchaseWhatsAppAutomatic: false,
  discountPercent: 5, couponValidityDays: 7,
};
const clean = (value: unknown, max = 160) => String(value ?? '').trim().slice(0, max);
const millis = (value: any) => value?.toDate ? value.toDate().getTime() : value instanceof Date ? value.getTime() : Date.parse(value || '');
const iso = (value: any) => Number.isFinite(millis(value)) ? new Date(millis(value)).toISOString() : '';
const phoneOf = (order: any) => String(order?.customer?.phone || order?.customerPhone || '').replace(/\D/g, '');
const emailOf = (order: any) => String(order?.customer?.email || order?.customerEmail || '').trim().toLowerCase();
const paid = (order: any) => ['approved', 'paid', 'partially_paid'].includes(String(order?.paymentStatus || order?.payment?.status || '').toLowerCase());
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function customerLockRefs(db: FirebaseFirestore.Firestore, phone: unknown, email: unknown) {
  const keys = [...new Set([
    String(phone || '').replace(/\D/g, ''),
    String(email || '').trim().toLowerCase(),
  ].filter(Boolean))];
  return keys.map(key => db.collection('post_purchase_coupon_limits').doc(createHash('sha256').update(key).digest('hex')));
}

function sixMonthsBefore(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear(), month = date.getUTCMonth() - 6, day = date.getUTCDate();
  const first = new Date(Date.UTC(year, month, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first.getTime();
}

async function getSettings() {
  const snap = await getDb().collection('post_purchase_settings').doc(SETTINGS_ID).get();
  const saved = snap.data() || {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    // Retired settings could have enabled coupled WhatsApp delivery. Keep it manual by default.
    surveyWhatsAppAutomatic: false,
    repurchaseWhatsAppAutomatic: false,
    discountPercent: 5,
    couponValidityDays: 7,
  };
}

export async function getPostPurchaseDashboard() {
  const db = getDb();
  const [settings, ordersSnap] = await Promise.all([
    getSettings(), db.collection('orders').orderBy('createdAt', 'desc').limit(500).get(),
  ]);
  const orders = ordersSnap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }))
    .filter((order: any) => paid(order) && (phoneOf(order) || emailOf(order)))
    .sort((a: any, b: any) => millis(b.createdAt) - millis(a.createdAt)).slice(0, 300)
    .map((order: any) => ({
      id: order.id, customerName: clean(order.customer?.name || order.customerName || 'Cliente'),
      phone: phoneOf(order), email: emailOf(order), createdAt: iso(order.createdAt),
      items: (order.items || []).map((item: any) => ({ name: clean(item.name), color: clean(item.color, 50), size: clean(item.size, 20), quantity: Number(item.quantity) || 1 })),
      satisfaction: order.postPurchaseSatisfaction || null,
      surveyStatus: order.postPurchaseSurveyStatus || 'pending',
      repurchaseStatus: order.postPurchaseRepurchaseStatus || 'pending',
      surveyEmailStatus: order.postPurchaseSurveyEmailStatus || 'pending',
      repurchaseEmailStatus: order.postPurchaseRepurchaseEmailStatus || 'pending',
      emailConsent: order.postPurchaseEmailConsent === true,
      whatsappConsent: order.postPurchaseWhatsAppConsent === true || order.postPurchaseMarketingConsent === true,
      marketingConsent: order.postPurchaseEmailConsent === true || order.postPurchaseWhatsAppConsent === true || order.postPurchaseMarketingConsent === true,
    }));
  return {
    settings, orders,
    whatsappAutomaticAvailable: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY),
    emailAutomaticAvailable: Boolean(process.env.RESEND_API_KEY),
  };
}

export async function savePostPurchaseSettings(input: any) {
  const data = {
    surveyEmailAutomatic: input?.surveyEmailAutomatic !== false,
    repurchaseEmailAutomatic: input?.repurchaseEmailAutomatic !== false,
    surveyWhatsAppAutomatic: false,
    repurchaseWhatsAppAutomatic: false,
    discountPercent: 5, couponValidityDays: 7,
    updatedAt: new Date().toISOString(),
  };
  await getDb().collection('post_purchase_settings').doc(SETTINGS_ID).set(data, { merge: true });
  return data;
}

async function issueCoupon(order: any) {
  const db = getDb();
  const docRef = db.collection('post_purchase_coupons').doc(`return_${order.id}`);
  const snap = await docRef.get();
  if (snap.exists) return snap.data();
  const code = `VOLTA${randomBytes(5).toString('hex').toUpperCase()}`;
  const now = Date.now();
  const coupon = {
    code, orderId: order.id, email: emailOf(order), phone: phoneOf(order),
    discountPercent: 5, bonusPercent: 5, stacksWithActiveCoupon: true, status: 'active',
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 7 * 86400000).toISOString(),
  };
  await docRef.create(coupon);
  return coupon;
}

const surveyMessage = (name: string) => `Oi, ${name}! Como foi sua experiência com a F PAC STORE?\n\n1) Produto: nota de 1 a 5\n2) Atendimento: nota de 1 a 5\n3) Teve dificuldade para comprar? (não/sim — qual?)\n\nObrigado por ajudar a gente a melhorar!`;

function repurchaseMessage(order: any, coupon: any) {
  const name = clean(order.customer?.name || order.customerName || 'Cliente').split(' ')[0];
  return `Oi, ${name}! Você ganhou +5% de desconto para sua próxima compra, acumulável com cupons ativos.\n\nCupom: ${coupon.code}\nVálido por 7 dias, até ${new Date(coupon.expiresAt).toLocaleDateString('pt-BR')}. Uso limitado a 1 vez a cada 6 meses por cliente.\n\nAcesse: https://www.fpacstore.com.br/`;
}

async function sendPostPurchaseEmail(order: any, kind: 'survey' | 'repurchase') {
  const key = process.env.RESEND_API_KEY, email = emailOf(order);
  if (!key) throw new Error('RESEND_API_KEY não configurada.');
  if (!validEmail(email)) throw new Error('Pedido sem e-mail válido.');
  const name = clean(order.customer?.name || order.customerName || 'Cliente').split(' ')[0];
  let subject: string, message: string;
  if (kind === 'survey') {
    subject = 'Como foi sua experiência com a F PAC STORE?';
    message = surveyMessage(name);
  } else {
    subject = 'Seu bônus de recompra da F PAC STORE';
    message = repurchaseMessage(order, await issueCoupon(order));
  }
  const result = await new Resend(key).emails.send({
    from: 'F PAC STORE <atendimento@fpacstore.com.br>', to: [email], subject, text: message,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#202820;max-width:600px;margin:auto;padding:24px"><h2 style="color:#3c503e">F PAC STORE</h2><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p style="font-size:12px;color:#666">Você recebeu esta mensagem porque autorizou comunicações pós-compra no checkout.</p></div>`,
  }, { idempotencyKey: `postpurchase/${order.id}/${kind}` });
  if (result.error || !result.data?.id) throw new Error(result.error?.message || 'O provedor não confirmou o envio do e-mail.');
  return result.data.id;
}

export async function preparePostPurchaseMessage(orderId: string, kind: 'survey' | 'repurchase', manual = true) {
  const db = getDb();
  const orderRef = db.collection('orders').doc(clean(orderId, 128));
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists || !paid(orderSnap.data())) throw new Error('Pedido não encontrado ou ainda sem pagamento aprovado.');
  const order = { ...orderSnap.data(), id: orderSnap.id };
  const phone = phoneOf(order);
  if (phone.length < 10) throw new Error('Pedido sem telefone válido para WhatsApp.');
  const message = kind === 'survey'
    ? surveyMessage(clean(order.customer?.name || order.customerName || 'Cliente').split(' ')[0])
    : repurchaseMessage(order, await issueCoupon(order));
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
  const values = { productRating, serviceRating, checkoutDifficulty, difficultyDetails: clean(input?.difficultyDetails, 500), notes: clean(input?.notes, 1000), updatedAt: new Date().toISOString() };
  await getDb().collection('orders').doc(clean(orderId, 128)).update({ postPurchaseSatisfaction: values });
  return values;
}

async function cooldownActive(db: FirebaseFirestore.Firestore, phone: unknown, email: unknown, now: number) {
  const locks = customerLockRefs(db, phone, email);
  const snaps = await Promise.all(locks.map(ref => ref.get()));
  if (snaps.some(snap => {
    const value = snap.data() || {};
    return (Number(value.redeemedAtMs) >= sixMonthsBefore(now)) || (value.reservedByOrderId && value.reservedExpiresAtMs > now);
  })) return true;
  // Honor redemptions recorded by the earlier coupon flow as well.
  const normalizedPhone = String(phone || '').replace(/\D/g, ''), normalizedEmail = String(email || '').trim().toLowerCase();
  const history = await Promise.all([
    normalizedPhone ? db.collection('post_purchase_coupons').where('phone', '==', normalizedPhone).get() : Promise.resolve(null),
    normalizedEmail ? db.collection('post_purchase_coupons').where('email', '==', normalizedEmail).get() : Promise.resolve(null),
  ]);
  const cutoff = sixMonthsBefore(now);
  return history.some(result => result?.docs.some((doc: any) => {
    const coupon = doc.data();
    const redeemedAt = Number(coupon.redeemedAtMs) || Date.parse(coupon.redeemedAt || '');
    return coupon.status === 'redeemed' && Number.isFinite(redeemedAt) && redeemedAt >= cutoff;
  }));
}

export async function validateRepurchaseCoupon(code: unknown, phone: unknown, email: unknown) {
  const normalized = clean(code, 32).toUpperCase();
  if (!normalized) return null;
  const db = getDb();
  const snapshot = await db.collection('post_purchase_coupons').where('code', '==', normalized).limit(1).get();
  if (snapshot.empty) return null;
  const coupon = snapshot.docs[0].data();
  if (coupon.status !== 'active' || Date.parse(coupon.expiresAt) <= Date.now()) return null;
  const normalizedPhone = String(phone || '').replace(/\D/g, ''), normalizedEmail = String(email || '').trim().toLowerCase();
  const matchesPhone = coupon.phone && String(coupon.phone) === normalizedPhone;
  const matchesEmail = coupon.email && String(coupon.email).toLowerCase() === normalizedEmail;
  if ((!matchesPhone && !matchesEmail) || await cooldownActive(db, normalizedPhone, normalizedEmail, Date.now())) return null;
  return coupon;
}

export async function reserveRepurchaseCoupon(code: unknown, phone: unknown, email: unknown, orderId: string) {
  const coupon = await validateRepurchaseCoupon(code, phone, email);
  if (!coupon) return false;
  const db = getDb();
  const snapshot = await db.collection('post_purchase_coupons').where('code', '==', String(coupon.code).toUpperCase()).limit(1).get();
  if (snapshot.empty) throw new Error('Este cupom não está mais disponível.');
  const couponRef = snapshot.docs[0].ref, lockRefs = customerLockRefs(db, phone, email), now = Date.now();
  await db.runTransaction(async (tx: any) => {
    const couponSnap = await tx.get(couponRef);
    const lockSnaps = await Promise.all(lockRefs.map(ref => tx.get(ref)));
    const current = couponSnap.data();
    if (current?.status === 'reserved' && current?.reservedByOrderId === orderId) return;
    if (current?.status !== 'active' || Date.parse(current.expiresAt) <= now) throw new Error('Este cupom já foi usado ou expirou.');
    for (const lockSnap of lockSnaps) {
      const limit = lockSnap.data() || {};
      if (Number(limit.redeemedAtMs) >= sixMonthsBefore(now)) throw new Error('Este cliente já usou um cupom de recompra nos últimos 6 meses.');
      if (limit.reservedByOrderId && limit.reservedByOrderId !== orderId && Number(limit.reservedExpiresAtMs) > now) throw new Error('Já existe um cupom em uso para este cliente.');
    }
    tx.update(couponRef, { status: 'reserved', reservedByOrderId: orderId, reservedAt: new Date(now).toISOString() });
    for (const ref of lockRefs) tx.set(ref, { reservedByOrderId: orderId, reservedCouponCode: current.code, reservedAtMs: now, reservedExpiresAtMs: now + 24 * 60 * 60 * 1000 }, { merge: true });
  });
  return true;
}

export async function releaseRepurchaseCoupon(code: unknown, orderId: string, redeemed = false) {
  const normalized = clean(code, 32).toUpperCase();
  if (!normalized) return;
  const db = getDb();
  const snapshot = await db.collection('post_purchase_coupons').where('code', '==', normalized).limit(1).get();
  if (snapshot.empty) return;
  const couponRef = snapshot.docs[0].ref, coupon = snapshot.docs[0].data();
  const lockRefs = customerLockRefs(db, coupon.phone, coupon.email), now = Date.now();
  await db.runTransaction(async (tx: any) => {
    const couponSnap = await tx.get(couponRef);
    const lockSnaps = await Promise.all(lockRefs.map(ref => tx.get(ref)));
    const current = couponSnap.data();
    if (current?.status !== 'reserved' || current?.reservedByOrderId !== orderId) return;
    tx.update(couponRef, redeemed
      ? { status: 'redeemed', redeemedByOrderId: orderId, redeemedAt: new Date(now).toISOString(), redeemedAtMs: now }
      : { status: 'active', reservedByOrderId: FieldValue.delete(), reservedAt: FieldValue.delete() });
    lockSnaps.forEach((snap: any, index: number) => {
      if (snap.data()?.reservedByOrderId !== orderId) return;
      tx.set(lockRefs[index], redeemed
        ? { redeemedAtMs: now, redeemedAt: new Date(now).toISOString(), lastRedeemedOrderId: orderId, reservedByOrderId: FieldValue.delete(), reservedCouponCode: FieldValue.delete(), reservedAtMs: FieldValue.delete(), reservedExpiresAtMs: FieldValue.delete() }
        : { reservedByOrderId: FieldValue.delete(), reservedCouponCode: FieldValue.delete(), reservedAtMs: FieldValue.delete(), reservedExpiresAtMs: FieldValue.delete() }, { merge: true });
    });
  });
}

async function claimAutomaticSend(ref: FirebaseFirestore.DocumentReference, statusField: string, attemptsField: string, retryField: string, now: number) {
  return getDb().runTransaction(async (tx: any) => {
    const snap = await tx.get(ref), fresh = snap.data();
    if (!fresh || fresh[statusField] === 'sent' || Date.parse(fresh[retryField] || '') > now || Date.parse(fresh[`${statusField}LeaseUntil`] || '') > now) return false;
    const attempts = Number(fresh[attemptsField]) || 0;
    if (attempts >= 3) return false;
    tx.update(ref, { [statusField]: 'sending', [attemptsField]: attempts + 1, [`${statusField}LeaseUntil`]: new Date(now + 5 * 60000).toISOString() });
    return true;
  });
}

export async function runPostPurchaseAutomations() {
  const db = getDb(), settings = await getSettings(), now = Date.now();
  const [emailOrders, whatsappOrders] = await Promise.all([
    settings.surveyEmailAutomatic || settings.repurchaseEmailAutomatic ? db.collection('orders').where('postPurchaseEmailConsent', '==', true).get() : Promise.resolve({ docs: [] } as any),
    (settings.surveyWhatsAppAutomatic || settings.repurchaseWhatsAppAutomatic) && process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY
      ? db.collection('orders').where('postPurchaseWhatsAppConsent', '==', true).get() : Promise.resolve({ docs: [] } as any),
  ]);
  const jobs = new Map<string, { snap: any; order: any; channel: 'email' | 'whatsapp'; kind: 'survey' | 'repurchase' }>();
  const addJobs = (docs: any[], channel: 'email' | 'whatsapp') => docs.forEach(snap => {
    const order = { ...snap.data(), id: snap.id };
    if (!paid(order)) return;
    for (const kind of ['survey', 'repurchase'] as const) {
      const enabled = channel === 'email'
        ? kind === 'survey' ? settings.surveyEmailAutomatic : settings.repurchaseEmailAutomatic
        : kind === 'survey' ? settings.surveyWhatsAppAutomatic : settings.repurchaseWhatsAppAutomatic;
      const consent = channel === 'email' ? order.postPurchaseEmailConsent === true : order.postPurchaseWhatsAppConsent === true;
      const delay = (kind === 'survey' ? 7 : 30) * 86400000;
      if (enabled && consent && now - millis(order.paidAt || order.createdAt) >= delay) jobs.set(`${snap.id}:${channel}:${kind}`, { snap, order, channel, kind });
    }
  });
  addJobs(emailOrders.docs, 'email'); addJobs(whatsappOrders.docs, 'whatsapp');
  for (const { snap, order, channel, kind } of jobs.values()) {
    const ref = snap.ref;
    if (channel === 'email' && (!validEmail(emailOf(order)) || !process.env.RESEND_API_KEY)) continue;
    if (channel === 'whatsapp' && (phoneOf(order).length < 10 || !process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY)) continue;
    const statusField = kind === 'survey' ? `postPurchaseSurvey${channel === 'email' ? 'Email' : ''}Status` : `postPurchaseRepurchase${channel === 'email' ? 'Email' : ''}Status`;
    const attemptsField = `${statusField}AttemptCount`, retryField = `${statusField}RetryAt`;
    if (!await claimAutomaticSend(ref, statusField, attemptsField, retryField, now)) continue;
    try {
      let sent = false;
      if (channel === 'email') { await sendPostPurchaseEmail(order, kind); sent = true; }
      else sent = Boolean((await preparePostPurchaseMessage(order.id, kind, false)).sent);
      if (!sent) throw new Error('O provedor não confirmou o envio.');
      await ref.update({ [statusField]: 'sent', [`${statusField}SentAt`]: new Date().toISOString(), [`${statusField}LeaseUntil`]: FieldValue.delete(), [retryField]: FieldValue.delete() });
    } catch (error: any) {
      await ref.update({ [statusField]: 'failed', [`${statusField}RetryAt`]: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), [`${statusField}LeaseUntil`]: FieldValue.delete(), [`${statusField}LastError`]: clean(error?.message, 300) });
    }
  }
}

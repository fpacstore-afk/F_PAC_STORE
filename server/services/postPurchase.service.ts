import { createHash, randomBytes } from 'crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import sharp from 'sharp';
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
    // Both WhatsApp image workflows stay manual unless an admin explicitly enables them.
    surveyWhatsAppAutomatic: saved.surveyWhatsAppImageAutomatic === true,
    repurchaseWhatsAppAutomatic: saved.repurchaseWhatsAppImageAutomatic === true,
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
    surveyWhatsAppAutomatic: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && input?.surveyWhatsAppAutomatic === true),
    repurchaseWhatsAppAutomatic: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && input?.repurchaseWhatsAppAutomatic === true),
    surveyWhatsAppImageAutomatic: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && input?.surveyWhatsAppAutomatic === true),
    repurchaseWhatsAppImageAutomatic: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && input?.repurchaseWhatsAppAutomatic === true),
    discountPercent: 5, couponValidityDays: 7,
    updatedAt: new Date().toISOString(),
  };
  await getDb().collection('post_purchase_settings').doc(SETTINGS_ID).set(data, { merge: true });
  return data;
}

async function issueCoupon(order: any) {
  const db = getDb();
  const docRef = db.collection('post_purchase_coupons').doc(`return_${order.id}`);
  const now = Date.now();
  const code = `VOLTA${randomBytes(5).toString('hex').toUpperCase()}`;
  return db.runTransaction(async (tx: any) => {
    const snap = await tx.get(docRef), current = snap.data();
    if (current?.status === 'active' && Date.parse(current.expiresAt) > now) return current;
    if (current && current.status !== 'active') throw new Error('Este cupom já foi utilizado ou está em uma compra em andamento.');
    const coupon = {
      code, orderId: order.id, email: emailOf(order), phone: phoneOf(order),
      discountPercent: 5, bonusPercent: 5, stacksWithActiveCoupon: true, status: 'active',
      createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 7 * 86400000).toISOString(),
    };
    tx.set(docRef, coupon);
    return coupon;
  });
}

const surveyMessage = (name: string) => `Oi, ${name}! Queremos saber como foi sua experiência com a F PAC STORE.\n\nVocê responde em menos de 1 minuto:\n1) Se já recebeu a peça, que nota dá ao produto? (1 a 5)\n2) Que nota dá ao nosso atendimento? (1 a 5)\n3) Foi fácil concluir a compra no site? (sim/não)\n\nPode responder assim: Produto 5 | Atendimento 5 | Compra: sim.\nSe ainda não recebeu o pedido, pode responder depois. Obrigado por vestir F PAC!`;

function repurchaseMessage(order: any, coupon: any) {
  const name = clean(order.customer?.name || order.customerName || 'Cliente').split(' ')[0];
  return `Oi, ${name}! Preparamos um bônus especial para sua próxima compra na F PAC STORE.\n\nVocê ganhou +5% adicional, somado aos cupons ativos.\n\nSeu cupom: ${coupon.code}\nVálido por 7 dias, até ${new Date(coupon.expiresAt).toLocaleDateString('pt-BR')}.\n\nAcesse o site: https://www.fpacstore.com.br/`;
}

const BRAND_LOGO_FILE = path.resolve(process.cwd(), 'public/estampas/logo-fpac.png');
let logoBase64Promise: Promise<string> | undefined;
async function brandLogoBase64() {
  logoBase64Promise ||= readFile(BRAND_LOGO_FILE).then(file => file.toString('base64')).catch(() => '');
  return logoBase64Promise;
}

function emailArtworkSvg(kind: 'survey' | 'repurchase', name: string, coupon?: any, logoBase64 = '') {
  const safeName = escapeHtml(name);
  const logo = logoBase64
    ? `<image x="490" y="48" width="220" height="220" href="data:image/png;base64,${logoBase64}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="600" y="160" text-anchor="middle" fill="#eab308" font-family="Arial,sans-serif" font-size="72" font-weight="900" font-style="italic">F PAC</text><text x="600" y="205" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="24" letter-spacing="12">STORE</text>`;
  const header = `<rect width="1200" height="390" fill="#090909"/><rect y="382" width="1200" height="8" fill="#eab308"/>${logo}<text x="600" y="318" text-anchor="middle" fill="#eab308" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="5">NÃO É SÓ ROUPA. É IDENTIDADE.</text>`;
  if (kind === 'survey') return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600"><rect width="1200" height="1600" fill="#f4f2ec"/>${header}<text x="600" y="486" text-anchor="middle" fill="#151515" font-family="Arial,sans-serif" font-size="52" font-weight="900">SUA EXPERIÊNCIA</text><text x="600" y="550" text-anchor="middle" fill="#9a7200" font-family="Arial,sans-serif" font-size="52" font-weight="900">FAZ DIFERENÇA</text><text x="600" y="615" text-anchor="middle" fill="#333333" font-family="Arial,sans-serif" font-size="28">Oi, ${safeName}! Conta pra gente como foi.</text><text x="600" y="664" text-anchor="middle" fill="#666666" font-family="Arial,sans-serif" font-size="22">São só 3 respostas rápidas — menos de 1 minuto.</text><rect x="90" y="720" width="1020" height="610" rx="30" fill="#ffffff"/><circle cx="160" cy="808" r="34" fill="#eab308"/><text x="160" y="819" text-anchor="middle" fill="#090909" font-family="Arial,sans-serif" font-size="30" font-weight="900">1</text><text x="220" y="800" fill="#111111" font-family="Arial,sans-serif" font-size="28" font-weight="700">Se já recebeu a peça, que nota dá ao produto?</text><text x="220" y="844" fill="#666666" font-family="Arial,sans-serif" font-size="22">1 = não gostei · 5 = gostei muito</text><rect x="220" y="865" width="740" height="2" fill="#eeeeea"/><circle cx="160" cy="980" r="34" fill="#eab308"/><text x="160" y="991" text-anchor="middle" fill="#090909" font-family="Arial,sans-serif" font-size="30" font-weight="900">2</text><text x="220" y="972" fill="#111111" font-family="Arial,sans-serif" font-size="28" font-weight="700">Como avalia o nosso atendimento?</text><text x="220" y="1016" fill="#666666" font-family="Arial,sans-serif" font-size="22">Dê uma nota de 1 a 5</text><rect x="220" y="1037" width="740" height="2" fill="#eeeeea"/><circle cx="160" cy="1150" r="34" fill="#eab308"/><text x="160" y="1161" text-anchor="middle" fill="#090909" font-family="Arial,sans-serif" font-size="30" font-weight="900">3</text><text x="220" y="1142" fill="#111111" font-family="Arial,sans-serif" font-size="28" font-weight="700">Foi fácil concluir sua compra no site?</text><text x="220" y="1186" fill="#666666" font-family="Arial,sans-serif" font-size="22">Responda: sim ou não</text><rect x="90" y="1370" width="1020" height="150" rx="26" fill="#090909"/><text x="600" y="1430" text-anchor="middle" fill="#eab308" font-family="Arial,sans-serif" font-size="28" font-weight="900" letter-spacing="2">TOQUE AQUI PARA RESPONDER</text><text x="600" y="1476" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="22">Exemplo: Produto 5 | Atendimento 5 | Compra: sim</text><text x="600" y="1550" text-anchor="middle" fill="#777777" font-family="Arial,sans-serif" font-size="17">Mensagem enviada após seu aceite no checkout.</text></svg>`;
  const expires = coupon ? new Date(coupon.expiresAt).toLocaleDateString('pt-BR') : '';
  const code = escapeHtml(String(coupon?.code || ''));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500"><rect width="1200" height="1500" fill="#f4f2ec"/>${header}<text x="600" y="500" text-anchor="middle" fill="#111111" font-family="Arial,sans-serif" font-size="48" font-weight="900">UM PRESENTE</text><text x="600" y="562" text-anchor="middle" fill="#9a7200" font-family="Arial,sans-serif" font-size="48" font-weight="900">PARA SEU PRÓXIMO LOOK</text><text x="600" y="625" text-anchor="middle" fill="#444444" font-family="Arial,sans-serif" font-size="26">Oi, ${safeName}! Guardamos um bônus especial pra você.</text><rect x="90" y="700" width="1020" height="570" rx="32" fill="#ffffff"/><text x="600" y="790" text-anchor="middle" fill="#555555" font-family="Arial,sans-serif" font-size="24" font-weight="700" letter-spacing="3">SEU BÔNUS DE RECOMPRA</text><text x="600" y="900" text-anchor="middle" fill="#111111" font-family="Arial,sans-serif" font-size="106" font-weight="900">+5%</text><text x="600" y="950" text-anchor="middle" fill="#444444" font-family="Arial,sans-serif" font-size="25">ADICIONAL, SOMADO AOS CUPONS ATIVOS</text><rect x="185" y="1000" width="830" height="125" rx="18" fill="#090909"/><text x="600" y="1080" text-anchor="middle" fill="#eab308" font-family="Arial,sans-serif" font-size="54" font-weight="900" letter-spacing="4">${code}</text><text x="600" y="1185" text-anchor="middle" fill="#555555" font-family="Arial,sans-serif" font-size="23">Válido por 7 dias — até ${escapeHtml(expires)}</text><text x="600" y="1350" text-anchor="middle" fill="#111111" font-family="Arial,sans-serif" font-size="25" font-weight="700">Digite o cupom no checkout e aproveite.</text><text x="600" y="1405" text-anchor="middle" fill="#777777" font-family="Arial,sans-serif" font-size="20">F PAC STORE · Joinville/SC</text><text x="600" y="1455" text-anchor="middle" fill="#777777" font-family="Arial,sans-serif" font-size="17">Mensagem enviada após seu aceite no checkout.</text></svg>`;
}

async function renderEmailArtwork(kind: 'survey' | 'repurchase', name: string, coupon?: any) {
  const logo = await brandLogoBase64();
  return sharp(Buffer.from(emailArtworkSvg(kind, name, coupon, logo))).png().toBuffer();
}

async function sendPostPurchaseEmail(order: any, kind: 'survey' | 'repurchase') {
  const key = process.env.RESEND_API_KEY, email = emailOf(order);
  if (!key) throw new Error('RESEND_API_KEY não configurada.');
  if (!validEmail(email)) throw new Error('Pedido sem e-mail válido.');
  const name = clean(order.customer?.name || order.customerName || 'Cliente').split(' ')[0];
  let subject: string, message: string;
  let coupon: any;
  if (kind === 'survey') {
    subject = `${name}, conta pra gente como foi sua experiência`;
    message = surveyMessage(name);
  } else {
    subject = 'Um bônus especial espera por você na F PAC STORE';
    coupon = await issueCoupon(order);
    message = repurchaseMessage(order, coupon);
  }
  const image = await renderEmailArtwork(kind, name, coupon);
  const contentId = `fpac-${kind}-${createHash('sha1').update(order.id).digest('hex').slice(0, 16)}`;
  const imageAlt = kind === 'survey' ? 'Pesquisa de satisfação F PAC STORE: produto, atendimento e facilidade da compra.' : 'Bônus F PAC STORE: +5% adicional, cupom de recompra válido por 7 dias.';
  const imageLink = kind === 'survey'
    ? `mailto:atendimento@fpacstore.com.br?subject=${encodeURIComponent(`Pesquisa F PAC STORE — pedido ${order.id}`)}&body=${encodeURIComponent('Produto: %0AAtendimento: %0ACompra foi fácil? (sim/não): ')}`
    : '';
  const result = await new Resend(key).emails.send({
    from: 'F PAC STORE <atendimento@fpacstore.com.br>', to: [email], subject, text: message,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:8px;background:#f4f2ec;text-align:center">${imageLink ? `<a href="${imageLink.replace(/&/g, '&amp;')}" aria-label="Responder pesquisa F PAC STORE">` : ''}<img src="cid:${contentId}" alt="${imageAlt}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;margin:0 auto"/>${imageLink ? '</a>' : ''}${kind === 'repurchase' ? `<p style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;margin:12px 0 4px;color:#111"><a href="https://www.fpacstore.com.br/" style="color:#111;text-decoration:underline">https://www.fpacstore.com.br/</a></p>` : ''}</div>`,
    attachments: [{ filename: `fpac-${kind}-pedido-${order.id}.png`, content: image.toString('base64'), contentType: 'image/png', contentId }],
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
  const coupon = kind === 'repurchase' ? await issueCoupon(order) : undefined;
  const name = clean(order.customer?.name || order.customerName || 'Cliente').split(' ')[0];
  const message = kind === 'survey' ? surveyMessage(name) : repurchaseMessage(order, coupon);
  const image = await renderEmailArtwork(kind, name, coupon);
  const imageBase64 = image.toString('base64');
  const imageFileName = `fpac-${kind}-${order.id}.png`;
  const whatsappUrl = `https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}?text=${encodeURIComponent(message)}`;
  if (manual) {
    await orderRef.update(kind === 'survey' ? { postPurchaseSurveyManualPreparedAt: new Date().toISOString() } : { postPurchaseRepurchaseManualPreparedAt: new Date().toISOString() });
    return { whatsappUrl, message, imageBase64, imageFileName, imageMimeType: 'image/png' };
  }
  const sent = await sendWhatsAppMessage(phone, 'custom_message', { customMessage: message, mediaBase64: imageBase64, mediaMimeType: 'image/png', mediaFileName: imageFileName, customerName: order.customerName, id: order.id });
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
    return (Number(value.redeemedAtMs) >= sixMonthsBefore(now)) || Boolean(value.reservedByOrderId);
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
      if (limit.reservedByOrderId && limit.reservedByOrderId !== orderId) throw new Error('Já existe um cupom em uso para este cliente.');
    }
    tx.update(couponRef, { status: 'reserved', reservedByOrderId: orderId, reservedAt: new Date(now).toISOString() });
    for (const ref of lockRefs) tx.set(ref, { reservedByOrderId: orderId, reservedCouponCode: current.code, reservedAtMs: now }, { merge: true });
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
        ? { redeemedAtMs: now, redeemedAt: new Date(now).toISOString(), lastRedeemedOrderId: orderId, reservedByOrderId: FieldValue.delete(), reservedCouponCode: FieldValue.delete(), reservedAtMs: FieldValue.delete() }
        : { reservedByOrderId: FieldValue.delete(), reservedCouponCode: FieldValue.delete(), reservedAtMs: FieldValue.delete() }, { merge: true });
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

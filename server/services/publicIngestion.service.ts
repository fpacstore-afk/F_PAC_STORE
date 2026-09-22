import crypto from 'node:crypto';
import { getDb } from '../firebase.js';
import { hashTrackingToken, verifyTrackingToken } from './tracking.service.js';
import { publicAnalyticsPath } from '../../shared/privacy.js';
import { QUESTIONS, calculateIdentity } from '../../shared/identityQuiz.js';
import { QUESTIONS as SIMPLE_QUESTIONS, calculateSimpleIdentity } from '../../shared/simpleIdentity.js';
import { getOrderPaymentStatus, getOrderNetReceived } from '../../shared/orderFinancialCore.js';

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const text = (value: unknown, max = 120) => typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max) : '';
const number = (value: unknown, max: number) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value as number))) : 0;
const list = (value: any, limit: number, clean: (item: any) => any) => Array.isArray(value) ? [...new Set(value.slice(0, limit).map(clean).filter(Boolean))] : [];
const slug = (value: unknown) => /^[a-zA-Z0-9_-]{1,150}$/.test(String(value)) ? String(value) : '';
const eventTypes = new Set(['page_view', 'product_view', 'category_view', 'search', 'cart_start', 'cart_add', 'checkout_start']);
const credential = (body: any, prefix: string) => {
  if (!body || !new RegExp(`^${prefix}_[a-f0-9-]{36}$`).test(body.sessionId) || !/^[a-f0-9]{64}$/.test(body.sessionToken || '') || !Number.isInteger(body.sequence) || body.sequence < 1 || body.sequence > 2000) throw fail('Sessão inválida.');
  if (Buffer.byteLength(JSON.stringify(body)) > 48_000) throw fail('Dados excedem o limite.', 413);
};

export async function claimIngestionQuota(ip: string, db = getDb()) {
  const window = Math.floor(Date.now() / 3_600_000);
  const id = crypto.createHash('sha256').update(`${window}:${ip}`).digest('hex');
  await db.runTransaction(async (tx: any) => {
    const ref = db.collection('public_ingestion_limits').doc(id), snap = await tx.get(ref);
    const count = Number(snap.data()?.count || 0);
    if (count >= 600) throw fail('Limite temporário atingido.', 429);
    tx.set(ref, { count: count + 1, expiresAt: new Date((window + 2) * 3_600_000).toISOString() });
  });
}

export function createPublicIngestion(db = getDb()) {
  const save = async (collection: string, body: any, data: any, extra?: (tx: any, previous: any) => Promise<any>) => db.runTransaction(async (tx: any) => {
    const ref = db.collection(collection).doc(body.sessionId), snap = await tx.get(ref), previous = snap.data() || {};
    if (snap.exists && !verifyTrackingToken(body.sessionToken, previous.accessTokenHash)) throw fail('Sessão não autorizada.', 403);
    if (snap.exists && Date.now() - Date.parse(previous.createdAt) > 24 * 3_600_000) throw fail('Sessão expirada.', 409);
    const stale = Number(previous.sequence || 0) >= body.sequence;
    if (stale && !body.purchase) return;
    const controlled = extra ? await extra(tx, previous) : {};
    if (stale) { tx.set(ref, controlled, { merge: true }); return; }
    tx.set(ref, { ...data, ...controlled, id: body.sessionId, sessionId: body.sessionId, accessTokenHash: previous.accessTokenHash || hashTrackingToken(body.sessionToken), sequence: body.sequence, createdAt: previous.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
  });
  const analytics = async (body: any) => {
    credential(body, 's');
    if (body.consent !== true) throw fail('Estatísticas sem autorização.');
    const input = body.data || {};
    const pages = list(input.pages, 50, publicAnalyticsPath);
    const events = Array.isArray(input.events) ? input.events.slice(0, 100).flatMap((event: any) => {
      if (!eventTypes.has(event?.type)) return [];
      const path = event.type === 'checkout_start' ? '/checkout' : publicAnalyticsPath(event.path);
      if (!path) return [];
      return [{ type: event.type, path, timestamp: Math.min(Date.now(), Math.max(Date.now() - 86_400_000, number(event.timestamp, Date.now()))) }];
    }) : [];
    let referrer = 'Direto';
    try { const url = new URL(input.referrer); if (url.protocol === 'https:' || url.protocol === 'http:') referrer = url.origin.slice(0, 160); } catch {}
    const data = {
      visitorId: /^[a-f0-9-]{36}$/.test(input.visitorId || '') ? input.visitorId : body.sessionId,
      isNewUser: input.isNewUser === true, lastActive: Date.now(), pages, pagesVisited: Math.max(pages.length, number(input.pagesVisited, 1000)), events,
      device: ['desktop', 'mobile', 'tablet'].includes(input.device) ? input.device : 'desktop',
      browser: ['Firefox','Edge','Chrome','Safari'].includes(input.browser) ? input.browser : 'Outro',
      os: ['Android','iOS','Windows','macOS'].includes(input.os) ? input.os : 'Outro',
      referrer, city: 'Não coletado', region: 'Não coletado', country: 'Não coletado',
      utm_source: null, utm_medium: null, utm_campaign: null,
      userId: null, userEmail: null, userPhone: null, userName: null, isIdentified: false,
      cartStarted: input.cartStarted === true, checkoutStarted: input.checkoutStarted === true,
      viewedProducts: list(input.viewedProducts, 30, slug), cartProducts: list(input.cartProducts, 30, slug), searches: [],
      consent: true, consentVersion: 'analytics-v1', validationVersion: 1,
    };
    await save('visitor_sessions', body, data, async (tx, previous) => {
      const purchase = body.purchase;
      const totals = { purchaseCompleted: previous.purchaseCompleted === true, totalSpent: Number(previous.totalSpent || 0), purchaseCount: Number(previous.purchaseCount || 0) };
      if (!purchase) return totals;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(purchase.orderId || '') || !/^[a-f0-9]{64}$/.test(purchase.trackingAccessToken || '')) throw fail('Compra inválida.');
      const order = (await tx.get(db.collection('orders').doc(purchase.orderId))).data();
      if (!order || !verifyTrackingToken(purchase.trackingAccessToken, order.trackingAccessTokenHash)) throw fail('Compra não autorizada.', 403);
      if (getOrderPaymentStatus(order) !== 'approved') throw fail('Pagamento ainda não confirmado.', 409);
      const conversionRef = db.collection('analytics_conversions').doc(purchase.orderId), conversion = await tx.get(conversionRef);
      if (conversion.exists) return totals;
      tx.set(conversionRef, { sessionId: body.sessionId, createdAt: new Date().toISOString() });
      return { purchaseCompleted: true, totalSpent: Math.round((totals.totalSpent + getOrderNetReceived(order)) * 100) / 100, purchaseCount: totals.purchaseCount + 1 };
    });
  };
  const quiz = async (body: any) => {
    credential(body, 'q');
    const input = body.data || {}, answers: Record<number, string> = {};
    if (body.consent !== true && !input.lead) throw fail('Estatísticas sem autorização.');
    const simple = body.quizVersion === 'simple-v1';
    const questions = simple ? SIMPLE_QUESTIONS.map((question, index) => ({ ...question, id: index + 1 })) : QUESTIONS;
    for (const question of questions) {
      const answer = input.answers?.[question.id];
      if (answer !== undefined) {
        if (!question.options.some(option => option.id === answer)) throw fail('Resposta inválida.');
        answers[question.id] = answer;
      }
    }
    const completed = input.status === 'completed';
    if (completed && Object.keys(answers).length !== questions.length) throw fail('Responda todas as perguntas.');
    const simpleResult = completed && simple ? calculateSimpleIdentity(answers) : null;
    const result = completed && !simple ? calculateIdentity(answers) : null;
    let lead: any = null;
    if (completed && input.lead) {
      if (typeof input.lead.optIn !== 'boolean') throw fail('Informe sua escolha para receber novidades.');
      const name = text(input.lead.name, 100), email = text(input.lead.email, 254).toLowerCase(), whatsapp = text(input.lead.whatsapp, 30).replace(/\D/g, '');
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{10,13}$/.test(whatsapp)) throw fail('Confira nome, e-mail e WhatsApp.');
      lead = { name, email, whatsapp, optIn: input.lead.optIn, consentVersion: 'identity-marketing-v1', consentAt: new Date().toISOString() };
    }
    const data: any = { answers, status: completed ? 'completed' : 'started', currentStep: completed ? 11 : number(input.currentStep, questions.length + 1), origem: 'f_pac_store', validationVersion: 1, quizVersion: simple ? 'simple-v1' : 'legacy-v1' };
    if (result) Object.assign(data, { completedAt: new Date().toISOString(), lead, generatedProfile: result.profile.id, recommendedCollection: result.profile.recommendedCollection, scores: result.scores, durationSeconds: number(input.durationSeconds, 86_400) });
    if (simpleResult) Object.assign(data, { completedAt: new Date().toISOString(), lead: null, generatedProfile: null, recommendedCollection: simpleResult.collection, scores: simpleResult.scores, durationSeconds: number(input.durationSeconds, 86_400) });
    await save('identity_quiz_sessions', body, data, async (_tx, previous) => {
      // Completion is immutable; delayed progress cannot erase a completed result/consent.
      if (previous.status === 'completed') return {
        status: previous.status, currentStep: previous.currentStep, answers: previous.answers,
        lead: previous.lead, generatedProfile: previous.generatedProfile, recommendedCollection: previous.recommendedCollection,
        scores: previous.scores, durationSeconds: previous.durationSeconds, completedAt: previous.completedAt,
      };
      return {};
    });
    return result ? { generatedProfile: result.profile.id, scores: result.scores } : {};
  };
  const promotion = async (body: any) => {
    credential(body, 's');
    if (body.consent !== true || !['view','click'].includes(body.eventType) || !slug(body.promoId)) throw fail('Evento inválido.');
    await db.runTransaction(async (tx: any) => {
      const sessionRef = db.collection('visitor_sessions').doc(body.sessionId), session = await tx.get(sessionRef);
      if (!session.exists || !verifyTrackingToken(body.sessionToken, session.data().accessTokenHash)) throw fail('Sessão não autorizada.', 403);
      if (Date.now() - Date.parse(session.data().createdAt) > 86_400_000) throw fail('Sessão expirada.', 409);
      const promo = await tx.get(db.collection('weekly_promotions').doc(body.promoId));
      if (!promo.exists || promo.data().active === false || promo.data().is_active === false) throw fail('Promoção indisponível.');
      const id = hashTrackingToken(`${body.sessionId}:${body.promoId}:${body.eventType}`);
      const ref = db.collection('promotion_analytics').doc(id), existing = await tx.get(ref);
      if (!existing.exists) tx.set(ref, { promo_id: body.promoId, event_type: body.eventType, product_id: slug(body.productId), value: 0, created_at: new Date().toISOString(), validationVersion: 1 });
    });
  };
  return { analytics, quiz, promotion };
}

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';
import { createPublicIngestion } from '../server/services/publicIngestion.service.ts';
import { hashTrackingToken } from '../server/services/tracking.service.ts';
import { QUESTIONS, calculateIdentity } from '../shared/identityQuiz.ts';
import { csvCell } from '../shared/csv.ts';
import { QUESTIONS as SIMPLE_QUESTIONS, calculateSimpleIdentity } from '../shared/simpleIdentity.ts';

const db = requireIsolatedTestDb(), service = createPublicIngestion(db);
const session = (prefix: string) => ({ sessionId: prefix + '_' + crypto.randomUUID(), sessionToken: crypto.randomBytes(32).toString('hex'), sequence: 1, consent: true });
const visitor = session('s'), quiz = session('q');
let checks = 0;
async function check(name: string, test: () => void | Promise<void>) { await test(); checks++; console.log('PASS ' + name); }
await check('CSV exports neutralize formulas in customer-provided cells', () => {
  for (const value of ['=HYPERLINK("evil")', '+cmd', '-cmd', '@SUM(1)', ' \t=1+1']) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('Cliente "A"'), '"Cliente ""A"""');
});
await check('telemetry requires explicit opt-in and bounded unguessable credentials', async () => {
  await assert.rejects(service.analytics({ ...visitor, consent: false }), (e: any) => e.status === 400);
  await assert.rejects(service.analytics({ ...visitor, sessionToken: 'short' }), (e: any) => e.status === 400);
  await assert.rejects(service.analytics({ ...visitor, data: { attack: 'a'.repeat(49000) } }), (e: any) => e.status === 413);
});
await check('server discards identity, private routes, forged purchases, money and client dates', async () => {
  await service.analytics({ ...visitor, data: { createdAt: '2000-01-01', userEmail: 'private@example.invalid', userPhone: '47999999999', purchaseCompleted: true, totalSpent: 50000, pagesVisited: 9999999, pages: ['/catalog?token=private', '/api/artwork/private?token=secret', '/order/private'], events: [{ type: 'purchase', path: '/success' }], searches: ['private query'], viewedProducts: ['shirt?token=secret'] } });
  const record = (await db.collection('visitor_sessions').doc(visitor.sessionId).get()).data();
  assert.equal(record.purchaseCompleted, false); assert.equal(record.totalSpent, 0);
  assert.equal(record.pagesVisited, 1000); assert.deepEqual(record.pages, ['/catalog']);
  assert.deepEqual(record.events, []); assert.equal(record.userEmail, null);
  assert.doesNotMatch(JSON.stringify(record), /private|secret|2000-01-01/);
  assert.notEqual(record.accessTokenHash, visitor.sessionToken);
});
await check('a different secret and older updates cannot overwrite a visitor session', async () => {
  await assert.rejects(service.analytics({ ...visitor, sequence: 2, sessionToken: 'f'.repeat(64), data: {} }), (e: any) => e.status === 403);
  await service.analytics({ ...visitor, sequence: 5, data: { pages: ['/catalog'], cartStarted: true } });
  await service.analytics({ ...visitor, sequence: 2, data: { cartStarted: false } });
  assert.equal((await db.collection('visitor_sessions').doc(visitor.sessionId).get()).data().cartStarted, true);
});
const trackingToken = 'c'.repeat(64), orderId = 'FPAC-INGEST-FIXTURE';
await db.collection('orders').doc(orderId).set({ payment: { status: 'pending', paidAmount: 0 }, pricing: { total: 75 }, trackingAccessTokenHash: hashTrackingToken(trackingToken) });
const purchase = { orderId, trackingAccessToken: trackingToken };
await check('conversion requires ownership and canonical payment approval', async () => {
  await assert.rejects(service.analytics({ ...visitor, sequence: 6, purchase }), (e: any) => e.status === 409);
  await db.collection('orders').doc(orderId).update({ payment: { status: 'approved', paidAmount: 75 } });
  await assert.rejects(service.analytics({ ...visitor, sequence: 6, purchase: { orderId, trackingAccessToken: 'd'.repeat(64) } }), (e: any) => e.status === 403);
});
await check('late confirmed purchases are counted once at the server amount even across sessions', async () => {
  // Sequence 4 is deliberately older than the latest page update (5).
  await service.analytics({ ...visitor, sequence: 4, purchase, data: { totalSpent: 99999 } });
  await Promise.all([service.analytics({ ...visitor, sequence: 6, purchase }), service.analytics({ ...visitor, sequence: 7, purchase }), service.analytics({ ...session('s'), purchase })]);
  const record = (await db.collection('visitor_sessions').doc(visitor.sessionId).get()).data();
  assert.equal(record.totalSpent, 75); assert.equal(record.purchaseCount, 1); assert.equal(record.purchaseCompleted, true);
  assert.equal((await db.collection('analytics_conversions').get()).docs.length, 1);
  assert.doesNotMatch(JSON.stringify(record), new RegExp(trackingToken));
});
const answers = Object.fromEntries(QUESTIONS.map(q => [q.id, q.options[0].id]));
await check('quiz rejects invalid answers, incomplete results and implicit marketing choices', async () => {
  await assert.rejects(service.quiz({ ...quiz, data: { answers: { 1: 'invented' } } }), (e: any) => e.status === 400);
  await assert.rejects(service.quiz({ ...quiz, data: { status: 'completed', answers: {} } }), (e: any) => e.status === 400);
  await assert.rejects(service.quiz({ ...quiz, data: { status: 'completed', answers, lead: { email: 'fixture@example.invalid' } } }), (e: any) => e.status === 400);
});
await check('quiz result and percentages come from shared scoring; contact is optional', async () => {
  await service.quiz({ ...quiz, data: { status: 'completed', answers, generatedProfile: 'forged', scores: { force: 100, prime: 100 }, couponUsed: 'FAKE' } });
  const record = (await db.collection('identity_quiz_sessions').doc(quiz.sessionId).get()).data(), expected = calculateIdentity(answers);
  assert.equal(record.generatedProfile, expected.profile.id); assert.deepEqual(record.scores, expected.scores);
  assert.equal(Object.values(record.scores).reduce((a: number, b: any) => a + b, 0), 100);
  assert.equal(record.lead, null); assert.equal(record.couponUsed, undefined);
});
await check('completed quiz retries are idempotent and delayed progress cannot erase results', async () => {
  await service.quiz({ ...quiz, sequence: 2, data: { answers, currentStep: 2 } });
  const record = (await db.collection('identity_quiz_sessions').doc(quiz.sessionId).get()).data();
  assert.equal(record.status, 'completed'); assert.equal(record.currentStep, 11);
  await assert.rejects(service.quiz({ ...quiz, sequence: 3, sessionToken: 'd'.repeat(64), data: {} }), (e: any) => e.status === 403);
});
await check('marketing opt-out is preserved and private extras are discarded from leads', async () => {
  const other = session('q');
  await service.quiz({ ...other, data: { status: 'completed', answers, lead: { name: 'Fixture', email: 'fixture@example.invalid', whatsapp: '(47) 99999-9999', optIn: false, cpf: 'private-cpf', address: 'private-address' } } });
  const record = (await db.collection('identity_quiz_sessions').doc(other.sessionId).get()).data();
  assert.equal(record.lead.optIn, false); assert.equal(record.lead.whatsapp, '47999999999');
  assert.doesNotMatch(JSON.stringify(record), /private-cpf|private-address/);
});
await check('promotion views are bounded per session and cannot fabricate purchases', async () => {
  await db.collection('weekly_promotions').doc('fixture-promo').set({ active: true });
  const event = { ...visitor, promoId: 'fixture-promo', eventType: 'view', value: 9000 };
  await service.promotion(event); await service.promotion(event);
  assert.equal((await db.collection('promotion_analytics').get()).docs.length, 1);
  await assert.rejects(service.promotion({ ...event, eventType: 'purchase' }), (e: any) => e.status === 400);
  await assert.rejects(service.promotion({ ...event, sessionToken: 'd'.repeat(64) }), (e: any) => e.status === 403);
});
await check('the active three-question quiz saves validated collections without inventing a personality or contact', async () => {
  const credentials = session('q');
  const answers = Object.fromEntries(SIMPLE_QUESTIONS.map((q, index) => [index + 1, q.options[2].id]));
  await assert.rejects(service.quiz({ ...credentials, consent: false, quizVersion: 'simple-v1', data: { status: 'completed', answers } }), (e: any) => e.status === 400);
  await service.quiz({ ...credentials, quizVersion: 'simple-v1', data: { status: 'completed', answers } });
  const record = (await db.collection('identity_quiz_sessions').doc(credentials.sessionId).get()).data();
  assert.equal(record.recommendedCollection, 'prime');
  assert.deepEqual(record.scores, calculateSimpleIdentity(answers).scores);
  assert.equal(record.generatedProfile, null); assert.equal(record.lead, null);
});
console.log(`${checks} protected ingestion checks passed without external calls.`);

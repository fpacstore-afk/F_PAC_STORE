import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import admin from 'firebase-admin';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';
import { createCheckoutIdentityMiddleware } from '../server/middleware/checkoutIdentity.ts';
import { createPaymentStatusControllers } from '../server/controllers/paymentStatus.controller.ts';
import { generateTrackingToken, verifyOrderTrackingAccess } from '../server/services/tracking.service.ts';
import { paymentOutcome } from '../shared/paymentOutcome.ts';

const db = requireIsolatedTestDb();
const token = generateTrackingToken();
await db.collection('orders').doc('audit-order').set({ userId: 'owner', customerEmail: 'owner@example.invalid', payment: { status: 'pending' }, paymentStatus: 'approved', mercadoPagoId: '123456', trackingAccessTokenHash: token.hash, customerCpf: 'never-public', point_of_interaction: { private: true } });
const originalVerifier = admin.auth().verifyIdToken;
admin.auth().verifyIdToken = (async (value: string) => {
  if (value === 'owner-token') return { uid: 'owner', email: 'owner@example.invalid', email_verified: true };
  if (value === 'stranger-token') return { uid: 'stranger', email: 'owner@example.invalid', email_verified: true };
  throw new Error('invalid token');
}) as any;
const controllers = createPaymentStatusControllers({ getDb: () => db, verifyOrderTrackingAccess });
const app = express();
app.use(express.json());
app.post('/identity', createCheckoutIdentityMiddleware(), (_req, res) => res.json({ userId: res.locals.checkoutUserId }));
app.get('/order/:orderId', controllers.verifyCheckout);
app.get('/payment/:paymentId', controllers.paymentStatus);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address() as { port: number };
const base = `http://127.0.0.1:${address.port}`;
let checks = 0;
async function check(name: string, fn: () => Promise<void> | void) { await fn(); checks++; console.log(`PASS ${name}`); }
try {
  await check('guest cannot spoof the order owner using body.userId', async () => {
    const r = await fetch(`${base}/identity`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'victim' }) });
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), { userId: null });
  });
  await check('authenticated owner is derived only from the verified ID token', async () => {
    const r = await fetch(`${base}/identity`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner-token' }, body: JSON.stringify({ userId: 'victim' }) });
    assert.deepEqual(await r.json(), { userId: 'owner' });
  });
  await check('invalid, empty and malformed authorization never downgrade to guest', async () => {
    for (const authorization of ['Bearer bad', 'Basic owner-token', 'Bearer ']) {
      assert.equal((await fetch(`${base}/identity`, { method: 'POST', headers: { Authorization: authorization } })).status, 401);
    }
  });
  for (const route of ['/order/audit-order', '/payment/123456']) {
    await check(`${route}: anonymous, wrong token and wrong UID are denied`, async () => {
      for (const headers of [{}, { 'x-tracking-token': 'bad' }, { Authorization: 'Bearer stranger-token' }]) {
        const r = await fetch(base + route, { headers }); assert.equal(r.status, 403);
        assert.doesNotMatch(await r.text(), /never-public|audit-order|owner@example/);
      }
    });
    await check(`${route}: owner and high-entropy guest token can read minimal, uncached status`, async () => {
      for (const headers of [{ Authorization: 'Bearer owner-token' }, { 'x-tracking-token': token.token }]) {
        const r = await fetch(base + route, { headers }); assert.equal(r.status, 200);
        assert.match(r.headers.get('cache-control')!, /no-store/);
        const data = await r.json(); assert.equal(data.paymentStatus, 'pending'); assert.equal(data.synced, false);
        assert.deepEqual(Object.keys(data).sort(), ['id','orderId','paymentStatus','status','synced']);
      }
    });
  }
  await check('unknown orders do not reveal existence and reads do not mutate the order', async () => {
    assert.equal((await fetch(base + '/payment/987654')).status, 403);
    assert.equal((await db.collection('orders').doc('audit-order').get()).data().payment.status, 'pending');
  });
  await check('invalid IDs are rejected before lookup', async () => {
    assert.equal((await fetch(base + '/order/a%2Fb')).status, 400);
  });
  await check('payment state cannot be inferred from delivery or an unknown state', () => {
    for (const v of ['pending','in_process','delivered','completed',undefined]) assert.equal(paymentOutcome(v), 'pending');
    assert.equal(paymentOutcome('approved'), 'approved');
    for (const v of ['rejected','cancelled','expired']) assert.equal(paymentOutcome(v), 'failed');
    assert.equal(paymentOutcome('refunded'), 'refunded');
  });
  await check('PIX copies provider code and status sends the access token without query leakage', () => {
    const pix = readFileSync('src/components/PixDisplay.tsx','utf8');
    assert.match(pix, /clipboard\.writeText\(qrCode\)/);
    assert.doesNotMatch(pix, /fpacstore@gmail|qrserver\.com|payment\/status/);
    assert.match(readFileSync('src/services/paymentStatus.ts','utf8'), /'x-tracking-token': trackingToken/);
  });
  await check('checkout route verifies identity and controller does not trust a JSON userId', () => {
    assert.match(readFileSync('server.ts','utf8'), /checkout\/process-payment", checkoutLimiter, checkoutIdentity, processPayment/);
    const controller = readFileSync('server/controllers/checkout.controller.ts','utf8');
    assert.doesNotMatch(controller, /body\.userId/); assert.match(controller, /res.locals.checkoutUserId/);
  });
  await check('opening management never automatically deletes test-named products', () => {
    const source = readFileSync('src/pages/AdminOrders.tsx','utf8');
    assert.doesNotMatch(source, /Auto-delete|Purged test product|sortedPData\.forEach\(async/);
  });
  await check('customer reviews contain no seeded testimonials or public moderator bypass', () => {
    const source = readFileSync('src/pages/ProductDetail.tsx','utf8');
    assert.doesNotMatch(source, /DEFAULT_REVIEWS|Lucas R\.|Mateus F\.|Bruno S\.|admin_moderation_enabled|btn-toggle-moderador/);
    assert.match(source, /reviews\.map/);
  });
} finally {
  admin.auth().verifyIdToken = originalVerifier;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
console.log(`${checks} ecommerce security regressions passed in isolated fixtures; no production writes.`);

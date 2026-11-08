import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';
import { authenticateAdmin, resetAuthForTesting, setAuthDbForTesting, setAuthTokenVerifierForTesting, matchesSecret } from '../server/middleware/auth.middleware.ts';
import { isAdminIdentity } from '../shared/adminIdentity.ts';
import { sharedRequestLimit } from '../server/middleware/requestSecurity.ts';
import { redactLogText, sanitizeLogData } from '../server/utils/logger.ts';
import { SECURITY_HEADERS } from '../shared/securityHeaders.ts';
import { verifyOrderTrackingAccess } from '../server/services/tracking.service.ts';
import { cancelOrderController, requestOrderReturnController } from '../server/controllers/order.controller.ts';

const db = requireIsolatedTestDb();
const previousRevocation = process.env.ADMIN_CHECK_REVOKED;
process.env.ADMIN_CHECK_REVOKED = 'false';
const app = express(); app.use(express.json());
setAuthDbForTesting(db);
const identities: Record<string, any> = {
  unverified: { uid: 'stranger', email: 'fpacstore@gmail.com', email_verified: false },
  verified: { uid: 'owner', email: 'FPACSTORE@gmail.com', email_verified: true },
  customer: { uid: 'customer', email: 'customer@example.invalid', email_verified: true },
  claimed: { uid: 'claimed-admin', admin: true },
};
setAuthTokenVerifierForTesting(async token => { if (!identities[token]) throw new Error('revoked fixture'); return identities[token]; });
app.get('/admin', authenticateAdmin, (_req, res) => res.json({ ok: true }));
const guardA = sharedRequestLimit('fixture', 3, 60_000, () => db);
const guardB = sharedRequestLimit('fixture', 3, 60_000, () => db);
app.post('/instance-a', guardA, (_req, res) => res.json({ ok: true }));
app.post('/instance-b', guardB, (_req, res) => res.json({ ok: true }));
const verifier = getAuth().verifyIdToken;
getAuth().verifyIdToken = (async (token: string, revoked?: boolean) => {
  assert.equal(revoked, true, 'privileged order actions must check token revocation');
  return identities[token];
}) as any;
await db.collection('orders').doc('security-fixture').set({ userId: 'victim', customerEmail: 'victim@example.invalid', status: 'payment_pending', paymentStatus: 'pending', items: [], total: 100 });
app.post('/cancel/:orderId', cancelOrderController);
app.post('/return/:orderId', requestOrderReturnController);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let checks = 0;
async function check(name: string, run: () => unknown | Promise<unknown>) { await run(); checks++; console.log('PASS '+name); }
try {
  await check('an unverified admin email and a normal customer cannot enter management', async () => {
    for (const token of ['unverified', 'customer']) assert.equal((await fetch(base+'/admin', { headers: { Authorization: 'Bearer '+token } })).status, 403);
    assert.equal((await fetch(base+'/admin', { headers: { Authorization: 'Bearer revoked' } })).status, 401);
  });
  await check('verified existing admins and server-issued claims retain management access', async () => {
    for (const token of ['verified','claimed']) assert.equal((await fetch(base+'/admin', { headers: { Authorization: 'Bearer '+token } })).status, 200);
    assert.equal(isAdminIdentity({ uid: 'u', email: 'fpacstore@gmail.com', emailVerified: false }), false);
    assert.equal(isAdminIdentity({ uid: 'u', email: 'fpacstore@gmail.com', emailVerified: true }), true);
    assert.equal(matchesSecret(['secret'], 'secret'), false);
    assert.equal(matchesSecret('secret', 'secret'), true);
  });
  await check('admin and order tracking check revocation even when the old environment flag is false', async () => {
    setAuthTokenVerifierForTesting(null);
    const normal = getAuth().verifyIdToken;
    try {
      assert.equal((await fetch(base+'/admin', { headers: { Authorization: 'Bearer verified' } })).status, 200);
      assert.equal((await verifyOrderTrackingAccess({ userId: 'customer' }, 'Bearer customer')).authorized, true);
      getAuth().verifyIdToken = (async (_token: string, checkRevoked?: boolean) => { assert.equal(checkRevoked, true); throw new Error('auth/id-token-revoked'); }) as any;
      assert.equal((await fetch(base+'/admin', { headers: { Authorization: 'Bearer verified' } })).status, 401);
      assert.equal((await verifyOrderTrackingAccess({ userId: 'customer' }, 'Bearer customer')).authorized, false);
    } finally { getAuth().verifyIdToken = normal; setAuthTokenVerifierForTesting(async token => { if (!identities[token]) throw new Error('revoked'); return identities[token]; }); }
  });
  await check('unverified email cannot cancel or return another customer order', async () => {
    for (const route of ['cancel','return']) assert.equal((await fetch(base+`/${route}/security-fixture`, { method: 'POST', headers: { Authorization: 'Bearer unverified', 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'fixture' }) })).status, 403);
    assert.equal((await db.collection('orders').doc('security-fixture').get()).data().status, 'payment_pending');
  });
  await check('two independent limiter instances enforce one shared concurrent budget', async () => {
    const responses = await Promise.all(Array.from({ length: 7 }, (_, i) => fetch(base+(i%2 ? '/instance-a' : '/instance-b'), { method: 'POST' })));
    assert.equal(responses.filter(r=>r.status===200).length, 3);
    assert.equal(responses.filter(r=>r.status===429).length, 4);
    for (const r of responses.filter(r=>r.status===429)) assert.ok(Number(r.headers.get('retry-after')) > 0);
    const entries = (await db.collection('request_limits').get()).docs.map((d: any)=>d.data());
    assert.equal(entries.length, 1); assert.equal(entries[0].count, 3);
    assert.doesNotMatch(JSON.stringify(entries), /127\.0\.0\.1/);
  });
  await check('logger redacts credential URLs, authorization, personal data and cyclic objects', () => {
    assert.doesNotMatch(redactLogText('https://example.invalid/x?token=private-token Bearer private-jwt fixture@example.invalid'), /private-token|private-jwt|fixture@example/);
    const value: any = { token: 'private', contact: { email: 'private' }, message: 'Bearer private-jwt' }; value.self=value;
    assert.doesNotMatch(JSON.stringify(sanitizeLogData(value)), /private/);
  });
  await check('all production hosts enforce the same CSP without inline script permission', () => {
    const headers = readFileSync('public/_headers','utf8');
    const firebase = JSON.parse(readFileSync('firebase.json','utf8')).hosting.headers.find((h: any)=>h.source==='**').headers;
    for (const [key,value] of Object.entries(SECURITY_HEADERS)) {
      assert.ok(headers.includes(`${key}: ${value}`));
      assert.equal(firebase.find((h: any)=>h.key===key)?.value,value);
    }
    const script = SECURITY_HEADERS['Content-Security-Policy'].split(';').find(s=>s.trim().startsWith('script-src '))!;
    assert.doesNotMatch(script, /unsafe-inline|unsafe-eval/);
    assert.doesNotMatch(readFileSync('index.html','utf8'), /onerror=/);
  });
} finally {
  getAuth().verifyIdToken=verifier; resetAuthForTesting();
  if (previousRevocation === undefined) delete process.env.ADMIN_CHECK_REVOKED; else process.env.ADMIN_CHECK_REVOKED = previousRevocation;
  await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
}

// Exercise the application's actual parser/error stack, with no external services.
const { default: store } = await import('../server.ts');
const appServer = store.listen(0,'127.0.0.1');
await new Promise<void>(resolve=>appServer.once('listening',resolve));
const url=`http://127.0.0.1:${(appServer.address() as any).port}`;
try {
  await check('review API validates content, derives identity and shares the write budget', async () => {
    await db.collection('products').doc('review-shirt').set({ name: 'Review shirt', status: 'active', price: 99 });
    await db.collection('products').doc('hidden-review-shirt').set({ status: 'draft' });
    const review = { productId: 'review-shirt', name: 'Cliente', rating: 5, comment: 'Muito boa' };
    const post = (body: any, token?: string) => fetch(url+'/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer '+token } : {}) }, body: JSON.stringify(body) });
    const auth = getAuth().verifyIdToken;
    getAuth().verifyIdToken = (async (token: string, revoked?: boolean) => { assert.equal(revoked, true); if (token !== 'review-owner') throw new Error('revoked'); return { uid: 'review-owner' }; }) as any;
    try {
      assert.equal((await post({ ...review, rating: 6 })).status, 400);
      assert.equal((await post({ ...review, productId: 'hidden-review-shirt' })).status, 404);
      assert.equal((await post(review, 'revoked')).status, 401);
      const guest = await post({ ...review, userId: 'victim', verified: true, createdAt: 'forged', admin: true });
      assert.equal(guest.status, 201);
      const stored = (await db.collection('reviews').doc((await guest.json()).id).get()).data();
      assert.equal(stored.userId, null); assert.equal(stored.verified, false); assert.equal(stored.admin, undefined); assert.notEqual(stored.createdAt, 'forged');
      const owner = await post({ ...review, userId: 'victim' }, 'review-owner');
      assert.equal(owner.status, 201);
      assert.equal((await db.collection('reviews').doc((await owner.json()).id).get()).data().userId, 'review-owner');
      const limited = await post(review);
      assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
      assert.equal((await db.collection('reviews').get()).size, 2);
    } finally { getAuth().verifyIdToken = auth; }
  });
  await check('order tracking rejects another customer and malformed tokens without caching or leaking details', async () => {
    const auth = getAuth().verifyIdToken;
    getAuth().verifyIdToken = (async (_token: string, revoked?: boolean) => { assert.equal(revoked, true); return { uid: 'attacker' }; }) as any;
    try {
      for (const suffix of ['', '?token[invalid]=fixture', '?token=a&token=b']) {
        const response = await fetch(url+'/api/orders/security-fixture/tracking'+suffix, { headers: { Authorization: 'Bearer attacker' } });
        assert.equal(response.status, 403); assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.doesNotMatch(await response.text(), /victim|customerEmail|total|TypeError/);
      }
    } finally { getAuth().verifyIdToken = auth; }
  });
  await check('unknown API routes never echo query credentials or user-controlled URLs', async () => {
    const response = await fetch(url+'/api/unknown-route?token=private-fixture&email=fixture@example.invalid');
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Rota de API não encontrada.' });
  });
  await check('runtime liveness is uncached and independent of JSON parsing or customer routes', async () => {
    const response = await fetch(url+'/runtime-health');
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { status: 'ok' });
    const invalid = await fetch(url+'/runtime-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(invalid.status, 405); assert.equal(invalid.headers.get('allow'), 'GET, HEAD');
  });
  await check('malformed, compressed and oversized bodies are rejected without exposing errors', async () => {
    const malformed=await fetch(url+'/api/health', { method:'POST', headers:{'Content-Type':'application/json'},body:'{"private-value":' });
    assert.equal(malformed.status,400); assert.doesNotMatch(await malformed.text(),/private-value|JSON|SyntaxError/);
    const compressed=await fetch(url+'/api/health',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body:'not-compressed'});
    assert.equal(compressed.status,415);
    const huge=await fetch(url+'/api/events/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:'x'.repeat(50_000)})});
    assert.equal(huge.status,413);
    assert.equal((await fetch(url+'/api/health')).status,200);
  });
} finally { await new Promise<void>((resolve,reject)=>appServer.close(e=>e?reject(e):resolve())); }
console.log(`${checks} security hardening regressions passed without production access.`);

import assert from 'node:assert/strict';
import express from 'express';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';
import { publicAnalyticsPath, persistentCart, validCheckoutSession, CHECKOUT_SESSION_TTL } from '../shared/privacy.ts';
import { escapeHtml } from '../server/utils/escapeHtml.ts';
import { RecoveryRevocations } from '../src/services/recoveryRevocations.ts';

const db = requireIsolatedTestDb();
// No provider or webhook can be contacted by these local fixtures.
for (const key of ['N8N_WEBHOOK_URL', 'EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'WHATSAPP_WEBHOOK_URL', 'RESEND_API_KEY']) delete process.env[key];
const { handleSaveLead, handleCancelRecovery } = await import('../server/controllers/automation.controller.ts');
const { runAbandonedCheckoutDetector, sendWhatsAppMessage, sendAbandonedEmail, saveCheckoutLead, claimRecoveryAttempt, recoveryAllowed } = await import('../server/services/automation.service.ts');
const app = express();
app.use(express.json());
app.post('/lead', handleSaveLead);
app.post('/cancel', handleCancelRecovery);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/lead`;
const id = 'lead_01234567-1234-1234-1234-0123456789ab';
const secret = 'a'.repeat(64);
const post = (data: any) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
let checks = 0;
async function check(name: string, test: () => void | Promise<void>) { await test(); checks++; console.log('PASS ' + name); }
try {
  await check('telemetry removes query secrets and private route identifiers', () => {
    for (const path of ['/order/private?token=secret', '/gestao?tab=finance', '/account', '/checkout', '/success']) assert.equal(publicAnalyticsPath(path), null);
    assert.equal(publicAnalyticsPath('/product/oversized?email=private#token'), '/product/oversized');
  });
  await check('persistent cart excludes identity, address, session tokens and notes', () => {
    const saved = persistentCart({ items: [{ id: 'shirt' }], customerInfo: { cpf: 'private' }, leadAccessToken: 'private', checkout_session_id: 'private', observations: 'private' });
    assert.deepEqual(saved, { items: [{ id: 'shirt' }], coupon: null, paymentMethod: 'CREDIT_CARD' });
    assert.equal(validCheckoutSession({ customerInfo: {}, expiresAt: 100 + CHECKOUT_SESSION_TTL }, 100), true);
    assert.equal(validCheckoutSession({ customerInfo: {}, expiresAt: 99 }, 100), false);
  });
  await check('capture requires an explicit consent decision and an unguessable secret', async () => {
    assert.equal((await post({ checkout_session_id: id, email: 'fixture@example.invalid' })).status, 400);
    assert.equal((await db.collection('abandoned_checkouts').doc(id).get()).exists, false);
  });
  await check('allowed lead capture strips private and server-controlled fields', async () => {
    const result = await post({ checkout_session_id: id, leadAccessToken: secret, recoveryConsent: true, email: 'fixture@example.invalid', customer_name: '<b>Fixture</b>', cpf: 'private-cpf', address: 'private-address', payment_status: 'approved', cart_items: [{ id: 'shirt', name: 'Fixture shirt', quantity: 1, price: 10, privateArt: 'secret-url' }], total: 10 });
    assert.equal(result.status, 200);
    const data = (await db.collection('abandoned_checkouts').doc(id).get()).data();
    assert.equal(data.recoveryConsent, true); assert.equal(data.payment_status, 'pending');
    assert.notEqual(data.leadAccessTokenHash, secret);
    assert.equal(data.leadAccessToken, undefined); assert.equal(data.cpf, undefined);
    assert.doesNotMatch(JSON.stringify(data), /private-address|secret-url|private-cpf/);
  });
  await check('a different session secret cannot overwrite or revoke a lead', async () => {
    for (const consent of [true, false]) {
      assert.equal((await post({ checkout_session_id: id, leadAccessToken: 'b'.repeat(64), recoveryConsent: consent, email: 'attacker@example.invalid' })).status, 403);
    }
    assert.equal((await db.collection('abandoned_checkouts').doc(id).get()).data().email, 'fixture@example.invalid');
  });
  await check('owner can revoke without resending contact details', async () => {
    assert.equal((await post({ checkout_session_id: id, leadAccessToken: secret, recoveryConsent: false })).status, 200);
    assert.equal((await db.collection('abandoned_checkouts').doc(id).get()).data().recoveryConsent, false);
  });
  await check('delayed captures cannot restore revoked consent, even before initial capture', async () => {
    assert.equal((await post({ checkout_session_id: id, leadAccessToken: secret, recoveryConsent: true, email: 'fixture@example.invalid' })).status, 409);
    const lateId = 'lead_01234567-1234-1234-1234-0123456789ac';
    await saveCheckoutLead({ checkout_session_id: lateId, recoveryConsent: false }, secret);
    await assert.rejects(saveCheckoutLead({ checkout_session_id: lateId, recoveryConsent: true, email: 'fixture@example.invalid' }, secret), (error: any) => error.status === 409);
  });
  await check('cancellation link only revokes and never permits lead updates', async () => {
    const cancelId = 'lead_01234567-1234-1234-1234-0123456789ad';
    await saveCheckoutLead({ checkout_session_id: cancelId, recoveryConsent: true, email: 'fixture@example.invalid' }, secret);
    const data = (await db.collection('abandoned_checkouts').doc(cancelId).get()).data();
    const cancel = (token: string) => fetch(base.replace('/lead', '/cancel'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cancelId, token }) });
    assert.equal((await cancel('b'.repeat(64))).status, 403);
    assert.equal((await post({ checkout_session_id: cancelId, leadAccessToken: data.recoveryCancelToken, recoveryConsent: false })).status, 403);
    assert.equal((await cancel(data.recoveryCancelToken)).status, 200);
    assert.equal((await cancel(data.recoveryCancelToken)).status, 200);
    assert.equal((await db.collection('abandoned_checkouts').doc(cancelId).get()).data().recoveryConsent, false);
  });
  await check('legacy and revoked leads cannot trigger recovery providers', async () => {
    assert.equal(await sendWhatsAppMessage('47999999999', 'abandoned_60m', {}), false);
    assert.equal(await sendAbandonedEmail({ email: 'fixture@example.invalid' } as any), false);
  });
  await check('legacy records do not occupy the consenting recovery queue', async () => {
    for (let index = 0; index < 55; index++) await db.collection('abandoned_checkouts').doc('legacy-' + index).set({ payment_status: 'pending', recovery_status: 'pending' });
    const due = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    await db.collection('abandoned_checkouts').doc('consenting-fixture').set({ id: 'consenting-fixture', payment_status: 'pending', recovery_status: 'pending', recoveryConsent: true, recoveryExpiresAt: new Date(Date.now() + 48 * 60 * 60_000).toISOString(), updated_at: due });
    const result = await runAbandonedCheckoutDetector();
    assert.equal(result.marked, 1);
    assert.equal((await db.collection('abandoned_checkouts').doc('legacy-0').get()).data().recovery_status, 'pending');
  });
  await check('24-hour reminders are processed even when first-reminder queue is empty', async () => {
    await db.collection('abandoned_checkouts').doc('consenting-fixture').update({ recovery_attempts: 1, lastRecoveryAttemptAt: new Date(Date.now() - 24 * 60 * 60_000).toISOString(), last_interaction: new Date(Date.now() - 25 * 60 * 60_000).toISOString(), created_at: new Date(Date.now() - 25 * 60 * 60_000).toISOString() });
    await runAbandonedCheckoutDetector();
    assert.equal((await db.collection('abandoned_checkouts').doc('consenting-fixture').get()).data().recovery_attempts, 2);
  });
  await check('simultaneous detector workers claim each reminder once', async () => {
    const due = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    await db.collection('abandoned_checkouts').doc('concurrent-fixture').set({ id: 'concurrent-fixture', payment_status: 'pending', recovery_status: 'pending', recoveryConsent: true, recoveryExpiresAt: new Date(Date.now() + 48 * 60 * 60_000).toISOString(), updated_at: due });
    const attempts = await Promise.all([claimRecoveryAttempt('concurrent-fixture', 1), claimRecoveryAttempt('concurrent-fixture', 1)]);
    assert.equal(attempts.filter(Boolean).length, 1);
    assert.equal(await claimRecoveryAttempt('concurrent-fixture', 2), null);
  });
  await check('expired, purchased or revoked consent never allows recovery', () => {
    const active = { recoveryConsent: true, payment_status: 'pending', recoveryExpiresAt: new Date(Date.now() + 60_000).toISOString() };
    assert.equal(recoveryAllowed(active), true);
    assert.equal(recoveryAllowed({ ...active, recoveryExpiresAt: '2000-01-01' }), false);
    assert.equal(recoveryAllowed({ ...active, payment_status: 'approved' }), false);
    assert.equal(recoveryAllowed({ ...active, recoveryRevokedAt: '2026-09-21' }), false);
  });
  await check('missing WhatsApp integration is reported as not sent', async () => {
    assert.equal(await sendWhatsAppMessage('47999999999', 'custom_message', { customMessage: 'isolated fixture' }), false);
  });
  await check('offline revocations survive reload and retry without re-enabling consent', async () => {
    let stored = ''; let online = false; let pending = false; let sent = 0;
    const dependencies = { read: () => stored, write: (value: string) => { stored = value; }, changed: (value: boolean) => { pending = value; }, send: async () => { if (!online) throw new Error('offline'); sent++; return true; } };
    const firstTab = new RecoveryRevocations(dependencies);
    assert.equal(await firstTab.enqueue(id, secret), false); assert.equal(pending, true);
    const reloaded = new RecoveryRevocations(dependencies);
    assert.equal(reloaded.hasPending(), true); online = true;
    await Promise.all([reloaded.flush(), reloaded.flush()]);
    assert.equal(sent, 1); assert.equal(pending, false); assert.equal(stored, '[]');
  });
  await check('email text cannot introduce links, tags or attribute delimiters', () => {
    assert.equal(escapeHtml('<a href="bad">A&B</a>'), '&lt;a href=&quot;bad&quot;&gt;A&amp;B&lt;/a&gt;');
  });
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
console.log(`${checks} privacy regressions passed with isolated fixtures; no customer messages sent.`);

import assert from 'node:assert/strict';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { createCheckoutAttempts } from '../server/services/checkoutAttempts.service';
import { CHECKOUT_PREPARATION_TTL_MS, checkoutAttemptId } from '../shared/checkoutPreparation';
import { scanMaintenancePages } from '../server/services/maintenancePagination';
import { reserveStock } from '../server/services/store.service';
const db = requireIsolatedTestDb();
let clock = Date.now(), cleanups = 0, failCleanup = false, lookups = 0;
const provider = { findPaymentByOrder: async () => { lookups++; return null; }, getPayment: async () => null };
const attempts = createCheckoutAttempts({ getDb: () => db, mpService: provider, processPaymentUpdate: async () => ({}),
  now: () => clock, cleanupPreparation: async () => { if (failCleanup) throw new Error('cleanup unavailable'); cleanups++; } });
const key = (n: number) => n.toString(16).padStart(64, '0');
const first = await attempts.claim(key(1), null);
assert.equal((await attempts.resume(key(1), null) as any).pendingConfirmation, true);
clock += CHECKOUT_PREPARATION_TTL_MS;
failCleanup = true;
await assert.rejects(() => attempts.resume(key(1), null), /cleanup unavailable/);
assert.equal((await db.collection('checkout_attempts').doc(checkoutAttemptId(key(1))).get()).data().phase, 'expired_cleanup');
await assert.rejects(() => attempts.submitted(key(1), first.orderId));
failCleanup = false;
assert.equal((await attempts.resume(key(1), null) as any).safeToRetry, true);
assert.equal(cleanups, 1);
assert.equal((await attempts.resume(key(1), null) as any).safeToRetry, true);
assert.equal(cleanups, 1);
await assert.rejects(() => attempts.resume(key(1), 'other'), (error: any) => error.status === 403);
await assert.rejects(() => reserveStock(first.orderId, [], 'late-reserve', { id: first.orderId }, { attemptId: checkoutAttemptId(key(1)) }), /expirou/);
assert.equal((await db.collection('orders').doc(first.orderId).get()).exists, false);

const second = await attempts.claim(key(2), null);
await db.collection('orders').doc(second.orderId).set({ payment: { paidAmount: 0 }, items: [] });
await attempts.submitted(key(2), second.orderId);
clock += 86400000;
assert.equal((await attempts.resume(key(2), null) as any).pendingConfirmation, true);
assert.equal(cleanups, 1);
assert.equal(lookups, 1);
assert.equal((await db.collection('orders').doc(second.orderId).get()).data().paymentCreationUncertain, true);

const third = await attempts.claim(key(3), null);
clock += CHECKOUT_PREPARATION_TTL_MS;
const race = await Promise.allSettled([attempts.submitted(key(3), third.orderId), attempts.resume(key(3), null)]);
assert.equal(race[0].status, 'rejected');
assert.equal((race[1] as any).value.safeToRetry, true);

for (let i = 0; i < 61; i++) await db.collection('maintenance_fixture').doc(String(i).padStart(3, '0')).set({ pending: true });
const visited: string[] = [];
const query = db.collection('maintenance_fixture').where('pending', '==', true);
for (let round = 0; round < 3; round++) {
  await scanMaintenancePages(db, 'test_fairness', query, async doc => {
    visited.push(doc.id);
    if (Number(doc.id) % 2) await doc.ref.update({ pending: false });
  }, { pageSize: 25, maxPages: 1, now: () => clock });
}
assert.equal(visited.length, 61);
assert.equal(new Set(visited).size, 61);
assert.equal(visited.at(-1), '060');
await db.collection('maintenance_cursors').doc('busy').set({ leaseUntil: clock + 1000, owner: 'other' });
assert.equal((await scanMaintenancePages(db, 'busy', query, async () => { throw new Error('must not run'); }, { now: () => clock })).skipped, true);
await assert.rejects(() => scanMaintenancePages(db, 'retry_failure', query, async () => { throw new Error('fixture error'); }, { now: () => clock }), /fixture error/);
const checkpoint = (await db.collection('maintenance_cursors').doc('retry_failure').get()).data();
assert.equal(checkpoint.leaseUntil, 0);
assert.equal(checkpoint.cursor, null);
console.log('Checkout preparation expiry, failed-cleanup recovery, ownership, late submission/reservation fencing, uncertain payments and fair leased pagination passed.');

// Exercise the actual cleanup against a real reservation in the isolated DB.
let realClock = Date.now();
const actual = createCheckoutAttempts({ getDb: () => db, mpService: provider, processPaymentUpdate: async () => ({}), now: () => realClock });
const actualAttempt = await actual.claim(key(20), null);
const item = { productId: 'recover-shirt', slug: 'recover-shirt', variantKey: 'Preto_M', color: 'Preto', size: 'M', quantity: 1, name: 'Recovery fixture' };
await db.collection('products').doc('recover-shirt').set({ id: 'recover-shirt', slug: 'recover-shirt', name: 'Recovery fixture', productFinish: 'plain',
  status: 'active', colors: [{ name: 'Preto' }], sizes: ['M'], stockMode: 'ready_only' });
await db.collection('inventory').doc('recover-shirt').set({ variants: { Preto_M: { physicalQuantity: 2, reservedQuantity: 0 } } });
await reserveStock(actualAttempt.orderId, [item], 'actual-recovery-reserve', { id: actualAttempt.orderId, items: [item], payment: { status: 'pending', paidAmount: 0 } },
  { attemptId: checkoutAttemptId(key(20)) });
assert.equal((await db.collection('inventory').doc('recover-shirt').get()).data().variants.Preto_M.reservedQuantity, 1);
realClock += CHECKOUT_PREPARATION_TTL_MS;
assert.equal((await actual.resume(key(20), null) as any).safeToRetry, true);
assert.equal((await db.collection('inventory').doc('recover-shirt').get()).data().variants.Preto_M.reservedQuantity, 0);
assert.equal((await db.collection('orders').doc(actualAttempt.orderId).get()).data().paymentStatus, 'rejected');
await actual.resume(key(20), null);
assert.equal((await db.collection('inventory').doc('recover-shirt').get()).data().variants.Preto_M.physicalQuantity, 2);
console.log('Real isolated stock reservation is released once after expiry; physical stock and payment uncertainty protections are preserved.');

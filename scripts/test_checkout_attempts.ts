import assert from 'node:assert/strict';
import express from 'express';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';
import { createCheckoutAttempts, checkoutTrackingToken } from '../server/services/checkoutAttempts.service.ts';
import { createCheckoutControllers } from '../server/controllers/checkout.controller.ts';
import { verifyTrackingToken } from '../server/services/tracking.service.ts';
import { catalogIntegrity } from '../shared/catalogIntegrity.ts';
import { releaseStockReservation } from '../server/services/store.service.ts';

const db = requireIsolatedTestDb();
let charges = 0, reserves = 0, releases = 0, timeout = false, pricingFails = false;
const payments = new Map<string, any>();
const provider: any = {
  createPayment: async (body: any) => {
    charges++;
    const result = { id: String(charges), external_reference: body.external_reference, status: 'pending', payment_method_id: 'pix', transaction_amount: 100, payer: { private: true }, point_of_interaction: { transaction_data: { qr_code: 'fixture-qr' } } };
    payments.set(body.external_reference, result);
    if (timeout) throw new Error('timeout after acceptance');
    return result;
  },
  findPaymentByOrder: async (id: string) => payments.get(id) || null,
  getPayment: async (id: string) => [...payments.values()].find(p => p.id === id),
};
const attempts = createCheckoutAttempts({ getDb: () => db, mpService: provider, processPaymentUpdate: async (id: string, result: any) => {
  await db.collection('orders').doc(id).update({ mercadoPagoId: result.id, 'payment.status': result.status });
  return {} as any;
} });
const controllers = createCheckoutControllers({
  mpService: provider, checkoutAttempts: attempts,
  calculateOrderPricing: async () => { if (pricingFails) throw new Error('fixture unavailable'); return { pricing: { total: 100, subtotal: 100 }, verifiedItems: [{ id: 'shirt', name: 'Fixture', quantity: 1, price: 100 }] } as any; },
  storeService: {
    checkStock: async () => ({ isAvailable: true }),
    reserveStock: async (id: string, _items: any, _key: string, order: any) => { reserves++; await db.collection('orders').doc(id).set(order); },
    releaseStockReservation: async () => { releases++; },
    updateOrderPaymentSnapshot: async () => {},
  } as any,
  sendOrderReceivedEmail: async () => ({} as any),
});
const app = express(); app.use(express.json());
app.use((req, res, next) => { res.locals.checkoutUserId = req.headers['x-fixture-user'] || null; next(); });
app.post('/pay', controllers.processPayment); app.post('/resume', controllers.resumePayment);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const key = (n: number) => n.toString(16).padStart(64, '0');
const payload = { payment_method_id: 'pix', items: [{ id: 'shirt', quantity: 1 }], customerInfo: { name: 'Fixture', email: 'fixture@example.invalid', cpf: 'private-fixture' } };
async function post(path: string, attempt: string, body = payload, user = '') {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt, ...(user ? { 'x-fixture-user': user } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
let checks = 0;
async function check(name: string, fn: () => Promise<void>) { await fn(); checks++; console.log(`PASS ${name}`); }
try {
  await check('stock without a catalog product is reported separately and inactive variants do not alert', async () => {
    const result = catalogIntegrity([{ id: 'shirt', slug: 'shirt-slug' }], [
      { id: 'shirt-slug', variants: { P: { physicalQuantity: 3, reservedQuantity: 3, availableQuantity: 99 }, M: { stock: 0, active: false } } },
      { id: 'old-product', variants: { P: { stock: 16 }, M: { stock: 0 } } },
    ]);
    assert.equal(result.linkedPhysical, 3); assert.equal(result.unlinkedPhysical, 16); assert.equal(result.lowStockVariants, 1);
    assert.equal(catalogIntegrity([], [{ id: 'old', stock: 16 }]).lowStockVariants, 0);
  });
  await check('missing or short retry keys never start a payment', async () => {
    assert.equal((await post('/pay', 'bad')).status, 400); assert.equal(charges, 0);
  });
  await check('concurrent requests create one order, one reservation and one provider call', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => post('/pay', key(1))));
    assert.equal(charges, 1); assert.equal(reserves, 1);
    assert.equal((await db.collection('orders').get()).size, 1);
    assert.ok(results.some(r => r.status === 201));
  });
  await check('replay after a lost response recovers the same QR and guest capability', async () => {
    const first = await post('/resume', key(1));
    const second = await post('/pay', key(1), { ...payload, items: [{ id: 'changed', quantity: 9 }] });
    assert.equal(first.body.external_reference, second.body.external_reference);
    assert.equal(first.body.point_of_interaction.transaction_data.qr_code, 'fixture-qr');
    assert.equal(first.body.trackingAccessToken, checkoutTrackingToken(key(1)));
    assert.equal(charges, 1);
    const order = (await db.collection('orders').doc(first.body.external_reference).get()).data();
    assert.ok(verifyTrackingToken(first.body.trackingAccessToken, order.trackingAccessTokenHash));
    assert.doesNotMatch(JSON.stringify(first.body), /private-fixture|payer|fixture@example/);
  });
  await check('provider timeout retains the reservation and is reconciled without a second charge', async () => {
    timeout = true;
    const result = await post('/pay', key(2));
    assert.equal(result.status, 202); assert.equal(result.body.pendingConfirmation, true); assert.equal(releases, 0);
    const before = (await db.collection('orders').get()).docs.map((d: any) => d.data()).find((d: any) => d.paymentCreationUncertain);
    assert.ok(before);
    timeout = false;
    const recovered = await post('/resume', key(2));
    assert.equal(recovered.status, 200); assert.equal(charges, 2); assert.equal(releases, 0);
    assert.equal((await db.collection('orders').doc(recovered.body.external_reference).get()).data().paymentCreationUncertain, false);
  });
  await check('unknown provider result never turns into a rejection or releases stock', async () => {
    timeout = true; await post('/pay', key(3)); timeout = false;
    const latest = [...payments.keys()].at(-1)!; payments.delete(latest);
    const result = await post('/resume', key(3));
    assert.equal(result.status, 202); assert.equal(releases, 0); assert.equal(charges, 3);
    await assert.rejects(releaseStockReservation(latest, [{ id: 'shirt', quantity: 1, color: 'Preto', size: 'M' }], 'uncertain-release'), /PAYMENT_CONFIRMATION_PENDING/);
  });
  await check('lookup before delayed submission seals the attempt and prevents a late charge', async () => {
    assert.equal((await post('/resume', key(4))).body.safeToRetry, true);
    assert.equal((await post('/pay', key(4))).body.safeToRetry, true);
    assert.equal(charges, 3);
  });
  await check('pricing failure closes the attempt before any reservation or charge', async () => {
    const before = reserves; pricingFails = true;
    assert.equal((await post('/pay', key(5))).body.safeToRetry, true); pricingFails = false;
    assert.equal(reserves, before); assert.equal(charges, 3);
  });
  await check('authenticated attempt rejects another account even with the retry key', async () => {
    await post('/pay', key(6), payload, 'owner');
    assert.equal((await post('/resume', key(6), payload, 'stranger')).status, 403);
  });
  await check('attempt records contain neither contact data nor raw card/tracking/retry secrets', async () => {
    const records = JSON.stringify((await db.collection('checkout_attempts').get()).docs.map((d: any) => d.data()));
    assert.doesNotMatch(records, /private-fixture|fixture@example|cardToken|trackingAccessToken/);
    assert.ok(!records.includes(key(1)));
  });
} finally { await new Promise<void>(r => server.close(() => r())); }
console.log(`${checks} checkout retry regressions passed; fake provider only.`);

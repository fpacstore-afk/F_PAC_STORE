import assert from 'node:assert/strict';
import express from 'express';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { createCustomerOrdersController } from '../server/controllers/customerOrders.controller';
import { matchesStorefrontSearch } from '../src/lib/storefrontSearch';
import { isFocusedStoreRoute } from '../shared/storefrontFocus';
import { isDefinitivePaymentRefusal } from '../shared/paymentSubmissionError';
const db = requireIsolatedTestDb();
for (const [id, fields] of Object.entries({ own: { userId: 'owner' }, guest: { customerEmail: 'owner@example.invalid' }, other: { userId: 'other', customerEmail: 'owner@example.invalid' } })) {
  await db.collection('orders').doc(id).set({ ...fields, total: 100, createdAt: '2026-11-02T12:00:00Z', status: 'payment_pending', items: [{ unitCostSnapshot: 40 }], internalNotes: 'private', trackingAccessTokenHash: 'private-hash' });
}
const app = express();
app.get('/orders', createCustomerOrdersController({ getDb: () => db, verifyToken: async token => {
  if (!['owner', 'unverified'].includes(token)) throw new Error('invalid');
  return { uid: 'owner', email: 'owner@example.invalid', email_verified: token === 'owner' };
} }));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/orders`;
try {
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(base, { headers: { Authorization: 'Bearer bad' } })).status, 401);
  const response = await fetch(base, { headers: { Authorization: 'Bearer owner' } });
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const data = await response.json();
  assert.deepEqual(data.orders.map((order: any) => order.id).sort(), ['guest', 'own']);
  assert.doesNotMatch(JSON.stringify(data), /unitCost|private|internal|TokenHash|customerEmail/);
  const unverified = await (await fetch(base, { headers: { Authorization: 'Bearer unverified' } })).json();
  assert.deepEqual(unverified.orders.map((order: any) => order.id), ['own']);
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
const product = { name: 'Camisa Oversized', collection: 'FORCE', sku: 'FP-001', tags: ['algodão'] };
assert.equal(matchesStorefrontSearch(product, 'oversized force'), true);
assert.equal(matchesStorefrontSearch(product, 'FP-001'), true);
assert.equal(matchesStorefrontSearch(product, 'algodao'), true);
for (const path of ['/checkout', '/bag', '/gestao', '/order/FP-1', '/tracking']) assert.equal(isFocusedStoreRoute(path), true);
for (const path of ['/', '/produtos', '/radio']) assert.equal(isFocusedStoreRoute(path), false);
assert.equal(isDefinitivePaymentRefusal({ status: 400, message: 'Invalid card token' }), true);
for (const status of [408, 409, 429, 500, 502]) assert.equal(isDefinitivePaymentRefusal({ status }), false);
assert.equal(isDefinitivePaymentRefusal({ status: 400, message: 'Idempotency conflict' }), false);
console.log('Customer order projection, verified ownership, private fields, shared search, focused screens and refusal classification passed.');

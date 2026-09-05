import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('server/controllers/admin.controller.ts', 'utf8');
const store = fs.readFileSync('server/services/store.service.ts', 'utf8');
const state = fs.readFileSync('server/services/stateMachine.service.ts', 'utf8');

function section(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `Missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const shipping = section(
  admin,
  'export async function updateOrderShippingStatus',
  '/**\n * Authorizes a return request'
);

assert.match(shipping, /db\.runTransaction\(async \(transaction\)/, 'shipping transition must run in Firestore transaction');
assert.match(shipping, /transaction\.get\(orderRef\)/, 'authoritative order read must be inside transaction');
assert.match(shipping, /assertShippingOrderEligible\(orderData\)/, 'shipping eligibility guard must remain enforced');
assert.match(shipping, /canTransitionShippingStatus\(currentShippingStatus, newStatus, orderData\)/, 'shipping state machine must remain enforced');
assert.match(shipping, /consumeStockReservationInTransaction\(/, 'shipped transition must consume reservation in the same transaction');
assert.match(shipping, /transaction\.update\(orderRef, updatePayload\)/, 'order mutation must be committed by the same transaction');
assert.doesNotMatch(shipping, /await consumeStockReservation\(/, 'shipping controller must not perform separate stock-consumption transaction');
assert.match(shipping, /newStatus === 'shipped'/, 'physical stock consumption event must remain tied to shipped');
assert.match(shipping, /validateTrackingInfo/, 'tracking input validation must remain enforced');

const consume = section(
  store,
  'export async function consumeStockReservationInTransaction',
  '/** Consume an active reservation exactly once when the order is physically shipped. */'
);
assert.match(consume, /isIdempotentDuplicate\(transaction, db, effectiveIdempotencyKey\)/, 'stock consumption must be idempotent');
assert.match(consume, /resData\.status !== 'active'/, 'only active reservation can be consumed');
assert.match(consume, /stats\.physicalQuantity < requestedQty/, 'physical quantity must be protected');
assert.match(consume, /stats\.reservedQuantity < requestedQty/, 'reserved quantity must be protected');
assert.match(consume, /newPhysicalQuantity < 0 \|\| newReservedQuantity < 0 \|\| newAvailableQuantity < 0/, 'negative inventory must be blocked');
assert.match(consume, /status: 'consumed'/, 'reservation must be marked consumed');
assert.match(consume, /type: 'reservation_consumption'/, 'physical shipment movement must be auditable');

const wrapper = section(
  store,
  'export async function consumeStockReservation(orderId',
  '/**\n * Processes a physical return.'
);
assert.match(wrapper, /db\.runTransaction\(async \(transaction\)/, 'legacy/public stock consumption API must remain transactional');
assert.match(wrapper, /consumeStockReservationInTransaction\(transaction, db, orderId, items, idempotencyKey\)/, 'public API must delegate to canonical transaction primitive');

assert.match(state, /CANONICAL_SHIPPING_STATUSES/, 'canonical shipping status list must exist');
assert.match(state, /MELHOR_ENVIO_SHIPPING_TRANSITIONS/, 'Melhor Envio transition map must exist');
assert.match(state, /LOCAL_DELIVERY_SHIPPING_TRANSITIONS/, 'local delivery transition map must exist');
assert.match(state, /paymentStatusStr !== 'approved'/, 'shipping must remain blocked without approved payment');
assert.match(state, /productionStatusStr/, 'shipping eligibility must consider production status');

console.log('✅ Shipping/Entregas 2.0 certification checks passed');

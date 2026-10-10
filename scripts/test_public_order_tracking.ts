import assert from 'node:assert/strict';
import { sanitizeTrackingResponse } from '../server/services/tracking.service.ts';

const productionOrder = sanitizeTrackingResponse('FP-123', {
  status: 'received',
  paymentStatus: 'approved',
  productionStatus: 'Estamparia e Impressão',
  customerEmail: 'cliente@example.com',
  customerName: 'Cliente',
  total: 199.9,
  trackingAccessTokenHash: 'must-not-leak',
  trackingCode: 'BR123',
});

assert.equal(productionOrder.status, 'payment_approved');
assert.equal(productionOrder.productionStage, 'estamparia');
assert.equal(productionOrder.trackingCode, 'BR123');
assert.equal('customerEmail' in productionOrder, false);
assert.equal('customerName' in productionOrder, false);
assert.equal('total' in productionOrder, false);
assert.equal('trackingAccessTokenHash' in productionOrder, false);

const pendingOrder = sanitizeTrackingResponse('FP-124', {
  status: 'pending',
  paymentStatus: 'pending',
});
assert.equal(pendingOrder.status, 'payment_pending');
assert.equal(pendingOrder.productionStage, null);

const legacyOrder = sanitizeTrackingResponse('FP-125', {
  status: 'Em Produção',
  productionStatus: 'CQ e Embalagem',
});
assert.equal(legacyOrder.status, 'processing');
assert.equal(legacyOrder.productionStage, 'embalagem');

const unsafeStageOrder = sanitizeTrackingResponse('FP-126', {
  status: 'shipped',
  productionStatus: '<script>alert(1)</script>',
});
assert.equal(unsafeStageOrder.status, 'shipped');
assert.equal(unsafeStageOrder.productionStage, null);

console.log('14 public-order tracking assertions passed: accurate status, safe production stage and PII exclusion.');

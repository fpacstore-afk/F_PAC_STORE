import assert from 'node:assert/strict';
import fs from 'node:fs';
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

assert.equal(productionOrder.success, true);
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

assert.equal(sanitizeTrackingResponse('FP-127', { status: 'in_transit' }).status, 'in_transit');

const customerTrackingPage = fs.readFileSync('src/pages/OrderStatus.tsx', 'utf8');
assert.ok(
  customerTrackingPage.includes("['payment_pending', 'received', 'pending'].includes(order.status) && <NotificationBox"),
  'payment reminder must be shown only while payment is pending',
);
assert.ok(customerTrackingPage.includes('Etapa atual da produção'), 'customer tracking must show the current production stage');
assert.ok(customerTrackingPage.includes('aria-valuenow={productionStage.progress}'), 'production progress must expose an accessible progress value');

console.log('18 public-order tracking assertions passed: accurate status, safe production stage and PII exclusion.');

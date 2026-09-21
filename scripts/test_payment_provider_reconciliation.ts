import assert from 'node:assert/strict';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { deriveMercadoPagoFinancialState, processPaymentUpdate } from '../server/services/payment.service';

let checks = 0;
function test(name: string, run: () => void) {
  run();
  checks++;
  console.log(`PASS ${name}`);
}

const approvedOrder = {
  id: 'provider-payment-fixture',
  total: 100,
  status: 'delivered',
  productionStatus: 'completed',
  shippingStatus: 'delivered',
  paymentStatus: 'approved',
  payment: { status: 'approved', paidAmount: 100, refundedAmount: 0, providerPaymentId: '9001', paidAt: '2026-09-01T12:00:00Z' }
};

test('partial provider refund preserves capture and derives partially_refunded', () => {
  const state = deriveMercadoPagoFinancialState(approvedOrder, {
    id: 9001,
    status: 'approved',
    transaction_amount: 100,
    transaction_amount_refunded: 30,
    date_last_updated: '2026-09-20T12:00:00Z'
  });
  assert.equal(state.paidAmount, 100);
  assert.equal(state.refundedAmount, 30);
  assert.equal(state.refundedDelta, 30);
  assert.equal(state.pendingAmount, 0);
  assert.equal(state.canonicalStatus, 'partially_refunded');
});

test('terminal refund without cumulative field keeps capture and becomes fully refunded', () => {
  const state = deriveMercadoPagoFinancialState(approvedOrder, {
    id: 9001,
    status: 'refunded',
    transaction_amount: 100,
    date_last_updated: '2026-09-20T12:00:00Z'
  });
  assert.equal(state.paidAmount, 100);
  assert.equal(state.refundedAmount, 100);
  assert.equal(state.canonicalStatus, 'refunded');
});

test('late rejection cannot erase an existing provider capture', () => {
  const state = deriveMercadoPagoFinancialState(approvedOrder, {
    id: 9001,
    status: 'rejected',
    transaction_amount: 100
  });
  assert.equal(state.paidAmount, 100);
  assert.equal(state.canonicalStatus, 'approved');
  assert.equal(state.requiresReview, true);
});

test('provider refund greater than capture is rejected', () => {
  assert.throws(() => deriveMercadoPagoFinancialState(approvedOrder, {
    id: 9001,
    status: 'refunded',
    transaction_amount: 100,
    transaction_amount_refunded: 101
  }), /exceeds captured amount/);
});

async function main() {
  const db = requireIsolatedTestDb();
  const ref = db.collection('orders').doc(approvedOrder.id);
  await ref.set(approvedOrder);

  const providerUpdate = {
    id: 9001,
    status: 'refunded',
    status_detail: 'refunded',
    transaction_amount: 100,
    transaction_amount_refunded: 100,
    date_approved: '2026-09-01T12:00:00Z',
    date_last_updated: '2026-09-20T12:00:00Z',
    payment_type_id: 'credit_card'
  };
  await processPaymentUpdate(approvedOrder.id, providerUpdate);
  let saved = (await ref.get()).data();
  assert.equal(saved.status, 'delivered');
  assert.equal(saved.productionStatus, 'completed');
  assert.equal(saved.shippingStatus, 'delivered');
  assert.equal(saved.payment.status, 'refunded');
  assert.equal(saved.payment.paidAmount, 100);
  assert.equal(saved.payment.refundedAmount, 100);
  assert.equal(saved.refundLogs.length, 1);
  assert.equal(saved.refundLogs[0].amount, 100);

  await processPaymentUpdate(approvedOrder.id, providerUpdate);
  saved = (await ref.get()).data();
  assert.equal(saved.refundLogs.length, 1);
  checks++;
  console.log('PASS provider webhook changes only financial state and replay does not duplicate movements');

  console.log(`${checks} provider payment reconciliation checks passed; isolated database, no production writes.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

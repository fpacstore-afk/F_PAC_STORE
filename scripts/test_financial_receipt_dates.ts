import assert from 'node:assert/strict';
import { summarizeReceipts, receiptMonthRange, receiptPeriodRange, receiptGoalRanges, orderReceiptHistory } from '../shared/financialReceipts';
import { financialDateKey } from '../shared/cashFlow';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';

let checks = 0;
function test(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }
const september = receiptMonthRange(2026, 8);
const october = receiptMonthRange(2026, 9);
const fixture = (changes: any = {}) => ({ total: 300, createdAt: '2026-01-01', payment: { paidAmount: 300, refundedAmount: 0 }, ...changes });
test('partial payments follow receipt dates, independently of creation and delivery', () => {
  const order = fixture({ status: 'Entregue', paymentLogs: [
    { id: 'one', amount: 100, date: '2026-09-10' }, { id: 'two', amount: 200, date: '2026-10-05' }
  ] });
  assert.equal(summarizeReceipts([order], september).netReceived, 100);
  assert.equal(summarizeReceipts([order], october).netReceived, 200);
  assert.equal(summarizeReceipts([order], receiptMonthRange(2026, 0)).netReceived, 0);
  assert.equal(summarizeReceipts([order]).netReceived, 300);
});
test('later refunds reduce their own month, including a negative monthly net', () => {
  const order = fixture({ payment: { paidAmount: 300, refundedAmount: 70, paidAt: '2026-09-10' }, history: [
    { eventId: 'r1', type: 'refund', amount: 20, timestamp: '2026-10-01' },
    { eventId: 'r2', type: 'refund', amount: 50, timestamp: '2026-10-02' }
  ] });
  assert.equal(summarizeReceipts([order], september).netReceived, 300);
  assert.equal(summarizeReceipts([order], october).netReceived, -70);
  assert.equal(summarizeReceipts([order], { start: '2026-01-01', end: '2026-12-31' }).netReceived, 230);
});
test('missing receipt dates stay unallocated; order creation is never a payment date', () => {
  const summary = summarizeReceipts([fixture({ createdAt: '2026-09-01' })], september);
  assert.equal(summary.netReceived, 0); assert.equal(summary.undatedReceived, 300); assert.equal(summary.ordersNeedingReview, 1);
  assert.equal(summarizeReceipts([fixture()]).netReceived, 300);
});
test('partial history does not assign its missing opening balance to the latest paidAt', () => {
  const order = fixture({ payment: { paidAmount: 300, paidAt: '2026-09-20' }, paymentLogs: [{ amount: 50, date: '2026-09-20' }] });
  const summary = summarizeReceipts([order], september);
  assert.equal(summary.received, 50); assert.equal(summary.undatedReceived, 250);
});
test('stable event IDs prevent duplicates without merging separate identical payments', () => {
  const event = { id: 'a', amount: 100, date: '2026-09-20' };
  const order = fixture({ payment: { paidAmount: 200 }, paymentLogs: [event, { ...event }, { ...event, id: 'b' }] });
  assert.equal(summarizeReceipts([order], september).received, 200);
  assert.equal(summarizeReceipts([order], september).ordersNeedingReview, 0);
});
test('conflicting IDs and totals above the captured amount require review', () => {
  for (const logs of [
    [{ id: 'a', amount: 50, date: '2026-09-20' }, { id: 'a', amount: 60, date: '2026-09-20' }],
    [{ amount: 400, date: '2026-09-20' }]
  ]) {
    const summary = summarizeReceipts([fixture({ paymentLogs: logs })], september);
    assert.equal(summary.received, 0); assert.equal(summary.undatedReceived, 300); assert.equal(summary.ordersNeedingReview, 1);
  }
});
test('rejected attempts and delivered status alone are not receipts', () => {
  const order = fixture({ payment: { paidAmount: 100 }, paymentLogs: [
    { amount: 100, date: '2026-09-20' }, { amount: 200, date: '2026-09-20', status: 'rejected' }
  ] });
  assert.equal(summarizeReceipts([order], september).received, 100);
  assert.equal(summarizeReceipts([{ total: 300, status: 'Entregue', createdAt: '2026-09-20' }], september).received, 0);
});
test('history fallback supports new incremental administrative movements', () => {
  const order = fixture({ payment: { paidAmount: 100, refundedAmount: 20 }, history: [
    { type: 'payment_update', financialType: 'payment_approved', amount: 100, timestamp: '2026-09-01' },
    { type: 'payment_update', financialType: 'partial_refund', amount: 20, timestamp: '2026-10-01' }
  ] });
  assert.equal(summarizeReceipts([order], september).netReceived, 100);
  assert.equal(summarizeReceipts([order], october).netReceived, -20);
});
test('Brazilian month boundaries, Firestore dates, leap years and year rollover', () => {
  const seconds = Date.parse('2026-10-01T01:00:00Z') / 1000;
  assert.equal(financialDateKey({ seconds }), '2026-09-30');
  assert.equal(financialDateKey({ toDate: () => new Date(seconds * 1000) }), '2026-09-30');
  assert.equal(summarizeReceipts([fixture({ payment: { paidAmount: 300, paidAt: { seconds } } })], september).received, 300);
  assert.deepEqual(receiptMonthRange(2024, 1), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(receiptPeriodRange('previous_month', new Date('2026-01-20T12:00:00Z')), { start: '2025-12-01', end: '2025-12-31' });
  assert.deepEqual(receiptPeriodRange('7days', new Date('2026-09-20T12:00:00Z')), { start: '2026-09-14', end: '2026-09-20' });
});

test('goals and overview share the current month cutoff, including future records', () => {
  const now = new Date('2026-09-20T12:00:00Z');
  const ranges = receiptGoalRanges(2026, 8, now);
  assert.deepEqual(ranges.month, receiptPeriodRange('current_month', now));
  assert.deepEqual(ranges.year, receiptPeriodRange('year', now));
  const future = fixture({payment: {paidAmount: 300, paidAt: '2026-09-21'}});
  assert.equal(summarizeReceipts([future], ranges.month).received, 0);
});

async function main() {
  const db = requireIsolatedTestDb();
  const { processOrderRefundController, updateOrderPaymentStatus } = await import('../server/controllers/admin.controller');
  async function call(handler: any, id: string, body: any) {
    let status = 200, result: any;
    await handler({ params: { orderId: id }, body, user: { uid: 'isolated-test', email: 'isolated@example.invalid' }, ip: '127.0.0.1' },
      { status(code: number) { status = code; return this; }, json(data: any) { result = data; return this; } });
    return { status, result };
  }
  const ref = db.collection('orders').doc('receipt-date-refund-fixture');
  await ref.set({ total: 100, status: 'delivered', productionStatus: 'completed', shippingStatus: 'delivered', payment: { paidAmount: 100, status: 'approved', paidAt: '2026-01-01' }, history: [{ type: 'note', message: 'preserve me' }] });
  for (const [amount, key] of [[30, 'date-r1'], [70, 'date-r2']] as const) {
    const body = { amount, idempotencyKey: key };
    assert.equal((await call(processOrderRefundController, ref.id, body)).status, 200);
    assert.equal((await call(processOrderRefundController, ref.id, body)).result.idempotentReplay, true);
  }
  let saved = (await ref.get()).data();
  assert.equal(saved.payment.refundedAmount, 100);
  assert.equal(saved.status, 'delivered');
  assert.equal(saved.productionStatus, 'completed');
  assert.equal(saved.shippingStatus, 'delivered');
  assert.deepEqual(saved.refundLogs.map((event: any) => event.amount), [30, 70]);
  assert.equal(saved.history.length, 3); assert.equal(saved.history[0].message, 'preserve me');
  assert.deepEqual(orderReceiptHistory(saved).outgoing.movements.map(e => e.amount), [30, 70]);
  checks++; console.log('PASS isolated refund controller keeps incremental history and replay does not duplicate');

  const adminRef = db.collection('orders').doc('receipt-date-admin-fixture');
  await adminRef.set({ total: 100, status: 'delivered', productionStatus: 'completed', shippingStatus: 'delivered', payment: { paidAmount: 100, status: 'approved', paidAt: '2026-01-01' }, history: [{ type: 'note', message: 'preserve me' }] });
  const partial = { newStatus: 'partially_refunded', amount: 30, idempotencyKey: 'date-admin-r1' };
  assert.equal((await call(updateOrderPaymentStatus, adminRef.id, partial)).status, 200);
  assert.equal((await call(updateOrderPaymentStatus, adminRef.id, partial)).result.idempotentReplay, true);
  assert.equal((await adminRef.get()).data().payment.refundedAmount, 30);
  assert.equal((await call(updateOrderPaymentStatus, adminRef.id, { ...partial, amount: 40 })).result.error, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await call(updateOrderPaymentStatus, adminRef.id, { newStatus: 'refunded', idempotencyKey: 'date-admin-r2' })).status, 200);
  saved = (await adminRef.get()).data();
  assert.equal(saved.status, 'delivered');
  assert.equal(saved.productionStatus, 'completed');
  assert.equal(saved.shippingStatus, 'delivered');
  assert.deepEqual(saved.refundLogs.map((event: any) => event.amount), [30, 70]);
  assert.deepEqual(orderReceiptHistory(saved).outgoing.movements.map(e => e.amount), [30, 70]);
  assert.equal(saved.history[0].message, 'preserve me');
  const events = await db.collection('financial_events').where('orderId', '==', adminRef.id).get();
  assert.deepEqual(events.docs.map((d: any) => d.data().amount).sort((a: number, b: number) => a - b), [30, 70]);
  checks++; console.log('PASS administrative partial/full refunds use deltas and guard the complete replay');

  const invalidRef = db.collection('orders').doc('receipt-date-invalid-fixture');
  await invalidRef.set({ total: 100, payment: { paidAmount: 100, status: 'approved' } });
  for (const amount of [undefined, -1, 101, 'invalid']) {
    const response = await call(updateOrderPaymentStatus, invalidRef.id, { newStatus: 'partially_refunded', amount, idempotencyKey: `invalid-${amount}` });
    assert.equal(response.status, 400); assert.equal(response.result.error, 'INVALID_REFUND_AMOUNT');
  }
  assert.equal((await invalidRef.get()).data().payment.refundedAmount, undefined);
  await invalidRef.update({ 'payment.paidAmount': 0 });
  assert.equal((await call(updateOrderPaymentStatus, invalidRef.id, { newStatus: 'refunded', idempotencyKey: 'unpaid-refund' })).result.error, 'INVALID_REFUND_AMOUNT');
  checks++; console.log('PASS malformed or excessive refunds cannot manufacture captured money');
  console.log(`${checks} receipt date checks passed; isolated database, no customer notifications or production writes.`);
}
main().catch(error => { console.error(error); process.exit(1); });

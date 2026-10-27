import assert from 'node:assert/strict';
import { buildMeiMonthlyPreview } from '../shared/meiRevenuePreview';
const paid = (id: string, date: any, total = 69.90) => ({
  id, createdAt: date, total,
  payment: { status: 'approved', paidAmount: total, refundedAmount: 0 }
});
const pending = (id: string, date: string, total = 69.90) => ({
  id, createdAt: date, total, payment: { status: 'pending', paidAmount: 0, refundedAmount: 0 }
});
let checks = 0;
function check(name: string, fn: () => void) { fn(); checks++; console.log('PASS', name); }
check('only valid paid sales count as provisional candidates without mixing deposits', () => {
  const result = buildMeiMonthlyPreview([paid('A', '2026-10-01'), pending('B', '2026-10-02')], '2026-10');
  assert.equal(result.candidateGross, 69.90);
  assert.equal(result.reviewGross, 69.90);
  assert.equal(result.candidates[0].id, 'A');
  assert.equal(result.review[0].id, 'B');
});
check('exclude freebies and test IDs, dedupe orders, do not count other months', () => {
  const result = buildMeiMonthlyPreview([
    paid('ONE', '2026-10-20'), paid('ONE', '2026-10-20'),
    paid('TEST_fixture', '2026-10-20'), paid('OLD', '2026-09-30'),
    { ...paid('GIFT', '2026-10-01'), type: 'BRINDE' }
  ], '2026-10');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidateGross, 69.90);
});
check('identify historical orders before MEI opening date', () => {
  const result = buildMeiMonthlyPreview([paid('BEFORE', '2026-10-01'), paid('AFTER', '2026-10-22')], '2026-10', '2026-10-15');
  assert.equal(result.preRegistrationGross, 69.90);
  assert.equal(result.candidateGross, 69.90);
  assert.equal(result.beforeRegistration[0].id, 'BEFORE');
});
check('refunds, cancelled and partial payments require review', () => {
  const a = { ...paid('RETURN', '2026-10-01'), payment: { paidAmount: 69.90, refundedAmount: 20, status: 'partially_refunded' } };
  const b = { ...paid('CANCEL', '2026-10-02'), status: 'cancelled' };
  const c = { ...paid('PARTIAL', '2026-10-03'), payment: { paidAmount: 30, refundedAmount: 0, status: 'partially_paid' } };
  const result = buildMeiMonthlyPreview([a,b,c], '2026-10');
  assert.equal(result.candidateGross, 0);
  assert.equal(result.review.length, 3);
});
check('date is from the sale; never infer a period from payment date', () => {
  const order = { ...paid('SEP', '2026-09-28'), payment: { status: 'approved', paidAmount: 69.90, paidAt: '2026-10-02' } };
  assert.equal(buildMeiMonthlyPreview([order], '2026-10').candidateGross, 0);
  assert.equal(buildMeiMonthlyPreview([order], '2026-09').candidateGross, 69.90);
});
check('missing date is flagged and timezone boundary respects Sao Paulo', () => {
  const a = paid('MISSING', null);
  const b = paid('SP', { seconds: Date.parse('2026-10-01T01:00:00Z') / 1000 });
  const result = buildMeiMonthlyPreview([a,b], '2026-09');
  assert.equal(result.candidateGross, 69.90);
  assert.equal(result.missingDateCount, 1);
});
check('reject malformed months', () => {
  assert.throws(() => buildMeiMonthlyPreview([], '2026-13'));
});
console.log('MEI preview regression checks:', checks);

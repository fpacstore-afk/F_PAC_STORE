import assert from 'node:assert/strict';
import { companyCashMovements, cashRegisterSummary } from '../shared/companyCashRegister.ts';
import { getDb } from '../server/firebase.ts';
import { getCompanyCashRegister, resetCompanyCashRegister } from '../server/services/companyCashRegister.service.ts';

const now = new Date('2026-11-03T01:00:00Z'); // Monday night in São Paulo
const orders = [{ id: 'sale', total: 300, paymentStatus: 'partially_paid', amountPaid: 150,
  paymentLogs: [{ id: 'first', amount: 100, date: '2026-10-30' }, { id: 'second', amount: 50, date: '2026-11-02' }] }];
const cashflow = [
  { id: 'legacy', orderId: 'sale', amount: 150, type: 'in', date: '2026-11-02' },
  { id: 'supplier', type: 'out', amount: 20, date: '2026-11-02', sourceType: 'accounts_payable', sourceReferenceId: 'bill' },
  { id: 'withdrawal', type: 'out', amount: 10, date: '2026-11-02', category: 'Retirada Pessoal' },
  { id: 'future', type: 'out', amount: 999, date: '2026-11-20' },
  { id: 'void', type: 'out', amount: 999, date: '2026-11-02', status: 'voided' },
  { id: 'campaign', type: 'out', amount: 5, date: '2026-11-02', sourceType: 'traffic', sourceReferenceId: 'ad' },
];
const result = companyCashMovements(orders, cashflow, [], [{ id: 'ad', amountSpent: 5, date: '2026-11-02' }], [{ id: 'bill', amountPaid: 20 }]);
const summary = cashRegisterSummary(result.entries, {}, now);
assert.deepEqual(summary.totals, { cashIn: 150, cashOut: 35, balance: 115 });
assert.deepEqual(summary.periods.week, { cashIn: 50, cashOut: 35, balance: 15 });
assert.deepEqual(summary.periods.today, summary.periods.week);
assert.deepEqual(cashRegisterSummary(result.entries, { ...summary.totals, revision: 1 }, now).cycle, { cashIn: 0, cashOut: 0, balance: 0 });
const undated = companyCashMovements([{ id: 'undated', total: 12, paymentStatus: 'paid', amountPaid: 12 }], [], [], [], []);
const unknownSummary = cashRegisterSummary(undated.entries, {}, now);
assert.equal(unknownSummary.totals.cashIn, 12);
assert.equal(unknownSummary.periods.today.cashIn, 0);
assert.equal(unknownSummary.undated.cashIn, 12);

const db = getDb();
await db.collection('financial_cashflow').doc('in').set({ type: 'in', amount: 120, date: '2026-01-01' });
let current = await getCompanyCashRegister();
assert.equal(current.cycle.balance, 120);
await assert.rejects(() => resetCompanyCashRegister({ requestId: 'wrong_123', revision: 0, expectedBalance: 1 }, { uid: 'admin' }), /REGISTER_CHANGED/);
const input = { requestId: 'reset_12345', revision: current.revision, expectedBalance: current.cycle.balance };
await resetCompanyCashRegister(input, { uid: 'admin' });
assert.deepEqual(await resetCompanyCashRegister(input, { uid: 'admin' }), { alreadyReset: true });
current = await getCompanyCashRegister();
assert.equal(current.cycle.balance, 0);
assert.equal(current.totals.cashIn, 120);
assert.equal((await db.collection('financial_cashflow').doc('in').get()).exists, true);
await db.collection('financial_cashflow').doc('out').set({ type: 'out', amount: 25, date: '2026-01-02' });
assert.equal((await getCompanyCashRegister()).cycle.balance, -25);
await assert.rejects(() => resetCompanyCashRegister({ requestId: 'stale_12345', revision: 0, expectedBalance: -25 }, { uid: 'admin' }), /REGISTER_CHANGED/);
console.log('Company cash register: dated partial receipts, deduplication, withdrawals, future dates, undated records, reset history, retries and stale-reset protection passed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deriveLedgerEventId } from '../server/services/financialLedger.service.js';

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    throw error;
  }
}

check('ledger idempotency key derives a stable deterministic event id', () => {
  const a = deriveLedgerEventId('order:123:payment:abc');
  const b = deriveLedgerEventId('order:123:payment:abc');
  const c = deriveLedgerEventId('order:123:payment:def');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});

check('blank idempotency keys are rejected', () => {
  assert.throws(() => deriveLedgerEventId('   '), /IDEMPOTENCY_KEY_REQUIRED/);
});

check('idempotent standalone ledger writes are atomic and cannot overwrite concurrently', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'server/services/financialLedger.service.ts'), 'utf8');
  const start = source.indexOf('export async function recordFinancialEvent');
  const end = source.indexOf('export async function getFinancialEventsForOrder', start);
  assert.ok(start >= 0 && end > start, 'ledger record function boundaries must exist');
  const fn = source.slice(start, end);

  assert.match(fn, /else if \(docId\) \{[\s\S]*?db\.runTransaction\s*\(/, 'idempotent no-transaction path must open a Firestore transaction');
  assert.match(fn, /const existingSnap = await tx\.get\(docRef\)/, 'transaction must read deterministic event id');
  assert.match(fn, /tx\.set\(docRef, eventData\)/, 'transaction must write event in the same transaction');
  assert.doesNotMatch(fn, /else if \(docId\) \{[\s\S]*?await docRef\.get\(\)[\s\S]*?await docRef\.set\(/, 'must not use race-prone standalone get/set for deterministic events');
});

check('manual payment status and financial ledger event are committed atomically', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'server/controllers/admin.controller.ts'), 'utf8');
  const start = source.indexOf('export async function updateOrderPaymentStatus');
  const end = source.indexOf('export async function', start + 20);
  assert.ok(start >= 0 && end > start, 'manual payment controller boundaries must exist');
  const fn = source.slice(start, end);

  assert.match(fn, /db\.runTransaction\s*\(/, 'manual payment update must run inside Firestore transaction');
  assert.match(fn, /transaction\.get\(orderRef\)/, 'transaction must read the authoritative order state');
  assert.match(fn, /transaction\.update\(orderRef,\s*updatePayload\)/, 'payment state payload must be written by the same transaction');
  assert.match(fn, /recordFinancialEvent\([\s\S]*?\},\s*db,\s*transaction\)/, 'ledger event must receive the same Firestore transaction');
  const outsideUpdates = [...fn.matchAll(/await\s+orderRef\.update\(\{([\s\S]*?)\}\);/g)].map(match => match[1]);
  assert.ok(outsideUpdates.every(body => !/paymentStatus|['\"]payment\./.test(body)), 'payment state must not be written outside the transaction');
});

console.log('\n💰 FINANCEIRO 2.0 certification checks passed.');

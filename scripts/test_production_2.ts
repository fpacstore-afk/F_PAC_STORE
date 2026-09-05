import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANONICAL_PRODUCTION_STATUSES,
  assertProductionOrderEligible,
  canTransitionProductionStatus,
  normalizeProductionStatus
} from '../server/services/stateMachine.service.js';

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    throw error;
  }
}

check('canonical production flow remains stable', () => {
  assert.deepEqual(CANONICAL_PRODUCTION_STATUSES, [
    'waiting',
    'separacao_corte',
    'estamparia',
    'costura',
    'embalagem',
    'ready',
    'completed'
  ]);
});

check('only one-step forward production transitions are allowed', () => {
  for (let i = 0; i < CANONICAL_PRODUCTION_STATUSES.length - 1; i++) {
    assert.equal(
      canTransitionProductionStatus(CANONICAL_PRODUCTION_STATUSES[i], CANONICAL_PRODUCTION_STATUSES[i + 1]),
      true
    );
  }
  assert.equal(canTransitionProductionStatus('waiting', 'estamparia'), false);
  assert.equal(canTransitionProductionStatus('waiting', 'completed'), false);
  assert.equal(canTransitionProductionStatus('costura', 'completed'), false);
});

check('completed is terminal while non-terminal backward correction remains possible', () => {
  assert.equal(canTransitionProductionStatus('completed', 'ready'), false);
  assert.equal(canTransitionProductionStatus('embalagem', 'estamparia'), true);
});

check('production aliases normalize without changing canonical meaning', () => {
  assert.equal(normalizeProductionStatus('Recebido'), 'waiting');
  assert.equal(normalizeProductionStatus('Corte'), 'separacao_corte');
  assert.equal(normalizeProductionStatus('CQ'), 'embalagem');
  assert.equal(normalizeProductionStatus('Pronto para envio'), 'ready');
});

check('production eligibility requires approved payment', () => {
  const blocked = assertProductionOrderEligible({
    status: 'processing',
    payment: { status: 'pending' },
    shipping: { status: 'pending' }
  });
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.error, 'PRODUCTION_BLOCKED_PAYMENT');

  const eligible = assertProductionOrderEligible({
    status: 'processing',
    payment: { status: 'approved' },
    shipping: { status: 'pending' }
  });
  assert.equal(eligible.eligible, true);
});

check('cancelled/rejected and already shipped orders are blocked from production mutations', () => {
  const cancelled = assertProductionOrderEligible({
    status: 'Cancelado',
    payment: { status: 'approved' },
    shipping: { status: 'pending' }
  });
  assert.equal(cancelled.eligible, false);
  assert.equal(cancelled.error, 'PRODUCTION_BLOCKED_CANCELLED');

  const shipped = assertProductionOrderEligible({
    status: 'processing',
    payment: { status: 'approved' },
    shipping: { status: 'shipped' }
  });
  assert.equal(shipped.eligible, false);
  assert.equal(shipped.error, 'PRODUCTION_BLOCKED_SHIPPING');
});

check('production status mutation is atomic against concurrent updates', () => {
  const controllerPath = path.resolve(process.cwd(), 'server/controllers/admin.controller.ts');
  const source = fs.readFileSync(controllerPath, 'utf8');
  const start = source.indexOf('export async function updateOrderProductionStatus');
  const end = source.indexOf('export async function updateOrderProductionPriority', start);
  assert.ok(start >= 0 && end > start, 'production controller function boundaries must exist');
  const fn = source.slice(start, end);

  assert.match(fn, /db\.runTransaction\s*\(/, 'transition must use a Firestore transaction');
  assert.match(fn, /transaction\.get\s*\(orderRef\)/, 'authoritative order read must occur in transaction');
  assert.match(fn, /transaction\.update\s*\(orderRef\s*,\s*updatePayload\)/, 'order state write must occur in same transaction');
  assert.doesNotMatch(fn, /await\s+orderRef\.get\s*\(/, 'must not read transition state outside transaction');
  assert.doesNotMatch(fn, /await\s+orderRef\.update\s*\(/, 'must not write transition state outside transaction');
});

check('admin order drawer reads and writes the production state, not the global order status', () => {
  const drawer = fs.readFileSync(path.resolve(process.cwd(), 'src/components/OrderProductionDrawer.tsx'), 'utf8');
  assert.match(
    drawer,
    /getStageFromStatus\(order\.production\?\.status \|\| order\.productionStatus \|\| order\.status \|\| 'waiting'\)/,
    'drawer stage must prioritize production.status'
  );

  const adminOrders = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/AdminOrders.tsx'), 'utf8');
  assert.match(
    adminOrders,
    /await updateProductionStatus\(orderId, newStatus, user\?\.email \|\| 'Admin'\)/,
    'drawer callback must use the production endpoint'
  );
  assert.match(
    adminOrders,
    /productionStatus: newStatus/,
    'local admin state must update productionStatus after successful mutation'
  );
  assert.doesNotMatch(
    adminOrders,
    /onStatusUpdate=\{async \(orderId, newStatus\) => \{\s*await updateStatus\(orderId, newStatus as any\)/,
    'drawer must never route a production transition through the global order status updater'
  );
});

console.log('\n🏭 PRODUÇÃO 2.0 certification checks passed.');

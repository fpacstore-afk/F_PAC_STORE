import assert from 'node:assert/strict';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import {
  deriveManualOrderOperationalState,
  getManualOrderInitialPayment
} from '../src/utils/manualOrderState';

let checks = 0;
function test(name: string, run: () => void) {
  run();
  checks++;
  console.log(`PASS ${name}`);
}

test('manual operational stages never encode payment state', () => {
  assert.deepEqual(deriveManualOrderOperationalState('received'), {
    status: 'received', productionStatus: 'waiting', shippingStatus: 'pending'
  });
  assert.deepEqual(deriveManualOrderOperationalState('production'), {
    status: 'received', productionStatus: 'separacao_corte', shippingStatus: 'pending'
  });
  assert.deepEqual(deriveManualOrderOperationalState('shipped'), {
    status: 'received', productionStatus: 'completed', shippingStatus: 'shipped'
  });
  assert.deepEqual(deriveManualOrderOperationalState('delivered'), {
    status: 'received', productionStatus: 'completed', shippingStatus: 'delivered'
  });
});

test('cancelled manual orders cannot manufacture an initial receipt', () => {
  assert.equal(getManualOrderInitialPayment(100, 'cancelled', true, 100), 0);
  assert.equal(getManualOrderInitialPayment(100, 'received', true, 0), 100);
  assert.equal(getManualOrderInitialPayment(100, 'delivered', false, 40), 40);
  assert.equal(getManualOrderInitialPayment(100, 'delivered', false, 140), 100);
});

async function main() {
  const db = requireIsolatedTestDb();
  const { createManualOrderController, registerManualPaymentController, processOrderRefundController, reverseOrderRefundController } = await import('../server/controllers/admin.controller');
  const orderId = 'MANUAL-FLOW-001';
  const order = {
    id: orderId,
    items: [{ id: 'shirt', quantity: 1, price: 100 }],
    total: 100,
    status: 'received',
    productionStatus: 'completed',
    shippingStatus: 'delivered',
    stockControl: 'no_move',
    paymentStatus: 'pending',
    amountPaid: 0,
    balanceDue: 100,
    payment: {
      status: 'pending',
      paidAmount: 0,
      pendingAmount: 100,
      installments: [
        { number: 1, amount: 50, paidAmount: 0, status: 'pending', dueDate: '2026-09-20' },
        { number: 2, amount: 50, paidAmount: 0, status: 'pending', dueDate: '2026-10-20' }
      ]
    },
    installments: [
      { number: 1, amount: 50, paidAmount: 0, status: 'pending', dueDate: '2026-09-20' },
      { number: 2, amount: 50, paidAmount: 0, status: 'pending', dueDate: '2026-10-20' }
    ]
  };

  function responseCapture() {
    const capture: any = { statusCode: 200, body: undefined };
    capture.status = (code: number) => { capture.statusCode = code; return capture; };
    capture.json = (body: any) => { capture.body = body; return capture; };
    return capture;
  }

  const createResponse = responseCapture();
  await createManualOrderController(
    { body: { order }, user: { uid: 'isolated-test', email: 'isolated@example.invalid' }, ip: '127.0.0.1' } as any,
    createResponse
  );
  assert.equal(createResponse.statusCode, 201);

  async function pay(amount: number, idempotencyKey: string) {
    const response = responseCapture();
    await registerManualPaymentController({
      params: { orderId },
      body: { amount, method: 'PIX', idempotencyKey },
      user: { uid: 'isolated-test', email: 'isolated@example.invalid' },
      ip: '127.0.0.1'
    } as any, response);
    assert.equal(response.statusCode, 200);
    return response.body;
  }

  let result = await pay(40, 'manual-flow-partial');
  assert.equal(result.paymentStatus, 'partially_paid');
  let saved = (await db.collection('orders').doc(orderId).get()).data();
  assert.equal(saved.status, 'received');
  assert.equal(saved.productionStatus, 'completed');
  assert.equal(saved.shippingStatus, 'delivered');
  assert.equal(saved.payment.paidAmount, 40);
  assert.equal(saved.payment.pendingAmount, 60);
  assert.deepEqual(saved.payment.installments.map((entry: any) => entry.paidAmount), [40, 0]);

  result = await pay(60, 'manual-flow-final');
  assert.equal(result.paymentStatus, 'approved');
  saved = (await db.collection('orders').doc(orderId).get()).data();
  assert.equal(saved.status, 'received');
  assert.equal(saved.productionStatus, 'completed');
  assert.equal(saved.shippingStatus, 'delivered');
  assert.equal(saved.payment.paidAmount, 100);
  assert.equal(saved.payment.pendingAmount, 0);
  assert.deepEqual(saved.payment.installments.map((entry: any) => entry.status), ['paid', 'paid']);

  const replay = await pay(60, 'manual-flow-final');
  assert.equal(replay.idempotentReplay, true);
  checks++;
  console.log('PASS delivered manual order remains delivered through partial payment, settlement and replay');

  const refundResponse = responseCapture();
  await processOrderRefundController({
    params: { orderId }, body: { refundAmount: 100, idempotencyKey: 'manual-flow-refund' },
    user: { uid: 'isolated-test', email: 'isolated@example.invalid' }, ip: '127.0.0.1'
  } as any, refundResponse);
  assert.equal(refundResponse.statusCode, 200);
  assert.equal(refundResponse.body.paymentStatus, 'refunded');

  const reversalResponse = responseCapture();
  await reverseOrderRefundController({
    params: { orderId }, body: { reason: 'Estorno lançado por engano', idempotencyKey: 'manual-flow-refund-reversal' },
    user: { uid: 'isolated-test', email: 'isolated@example.invalid' }, ip: '127.0.0.1'
  } as any, reversalResponse);
  assert.equal(reversalResponse.statusCode, 200);
  assert.equal(reversalResponse.body.paymentStatus, 'approved');
  saved = (await db.collection('orders').doc(orderId).get()).data();
  assert.equal(saved.payment.paidAmount, 100);
  assert.equal(saved.payment.refundedAmount, 0);
  assert.equal(saved.payment.status, 'approved');
  assert.equal(saved.status, 'received');
  assert.equal(saved.shippingStatus, 'delivered');
  const reversalEvent = await db.collection('financial_events').doc(reversalResponse.body.eventId).get();
  assert.equal(reversalEvent.data()?.type, 'refund_reversal');
  checks++;
  console.log('PASS refund reversal restores payment while retaining an immutable corrective ledger event');

  console.log(`${checks} manual-order financial flow checks passed; isolated database, no production writes.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

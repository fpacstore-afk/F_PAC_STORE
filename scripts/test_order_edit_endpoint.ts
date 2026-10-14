import assert from 'node:assert/strict';
import { updateOrderDetailsController } from '../server/controllers/admin.controller.ts';
import { getDb } from '../server/firebase.ts';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';

process.env.NODE_ENV = 'test';
const db = requireIsolatedTestDb();

async function seedOrder(orderId: string, paid = false) {
  const requirements = [{ stampId: 'edit-art', printSize: '10x10', quantity: 1 }];
  await db.collection('designs').doc('edit-art').set({
    name: 'Arte sintética',
    code: 'ART-EDIT',
    availableSizes: ['10x10', '12x12'],
    stockBalance: 8,
    stockBySize: { '10x10': 4, '12x12': 4 },
  });
  await db.collection('stamp_stock_events').doc(`${orderId}_order_debit`).set({ orderId, action: 'order_debit', requirements });
  await db.collection('orders').doc(orderId).set({
    id: orderId,
    origin: 'Site',
    customerName: 'Cliente sintético',
    items: [{
      id: 'custom-line-1',
      productId: 'custom-line-1',
      name: 'Produto sintético',
      quantity: 1,
      price: 10,
      printConfigs: [{ stampId: 'edit-art', stamp: 'Arte sintética', printSize: '10x10', artSize: '10x10' }],
    }],
    subtotal: 10,
    total: 10,
    shipping: 0,
    couponDiscount: 0,
    inventoryLifecycle: 'unmanaged',
    stampStockRequirements: requirements,
    detailsVersion: 0,
    ...(paid ? { amountPaid: 5, paymentLogs: [{ id: 'historic-payment', amount: 5, status: 'approved' }] } : {}),
  });
}

function buildBody(orderId: string, editId: string, overrides: Record<string, unknown> = {}) {
  return {
    editId,
    expectedVersion: 0,
    origin: 'WhatsApp',
    fields: { customerName: 'Cliente revisado', observations: 'Conferir aplicação da arte' },
    items: [{
      sourceIndex: 0,
      productId: 'custom-line-1',
      slug: '',
      name: 'Produto sintético',
      color: 'Preta',
      size: 'M',
      quantity: 1,
      price: 10,
      artworks: [{ stampId: 'edit-art', name: 'Arte sintética', printSize: '12x12', artSize: '20x20 cm', location: 'Frente' }],
    }],
    ...overrides,
  };
}

async function invoke(orderId: string, body: any) {
  const res: any = {
    statusCode: 200,
    payload: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.payload = payload; return this; },
  };
  await updateOrderDetailsController({ params: { orderId }, body, user: { uid: 'synthetic-admin', email: 'test@example.invalid' } } as any, res);
  return res;
}

async function main() {
  assert.equal(getDb().isIsolatedInMemoryDatabase, true);
  await seedOrder('EDIT-SYNTHETIC-1');
  const body = buildBody('EDIT-SYNTHETIC-1', 'edit-test-0001');
  const saved = await invoke('EDIT-SYNTHETIC-1', body);
  assert.equal(saved.statusCode, 200, saved.payload?.message);
  assert.equal(saved.payload.order.id, 'EDIT-SYNTHETIC-1', 'editing preserves the order identity');

  const stored = (await db.collection('orders').doc('EDIT-SYNTHETIC-1').get()).data();
  assert.equal(stored.detailsVersion, 1);
  assert.equal(stored.origin, 'WhatsApp');
  assert.equal(stored.customerName, 'Cliente revisado');
  assert.equal(stored.items[0].printConfigs[0].printSize, '12x12');
  assert.equal(stored.items[0].printConfigs[0].artSize, '20x20 cm');
  assert.equal(stored.stampStockRequirements[0].printSize, '12x12');
  assert.equal((await db.collection('designs').doc('edit-art').get()).data()?.stockBySize['10x10'], 5);
  assert.equal((await db.collection('designs').doc('edit-art').get()).data()?.stockBySize['12x12'], 3);

  const retry = await invoke('EDIT-SYNTHETIC-1', body);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.payload.idempotent, true, 'repeated save with the same edit ID is idempotent');
  assert.equal((await db.collection('orders').doc('EDIT-SYNTHETIC-1').get()).data()?.detailsVersion, 1);
  assert.equal((await db.collection('designs').doc('edit-art').get()).data()?.stockBalance, 8, 'retry does not move print stock twice');

  await seedOrder('EDIT-SYNTHETIC-PAID', true);
  const paidBody = buildBody('EDIT-SYNTHETIC-PAID', 'edit-test-paid1', {
    items: [{
      sourceIndex: 0,
      productId: 'custom-line-1',
      name: 'Produto sintético',
      quantity: 2,
      price: 10,
      artworks: [{ stampId: 'edit-art', name: 'Arte sintética', printSize: '10x10' }],
    }],
  });
  const rejected = await invoke('EDIT-SYNTHETIC-PAID', paidBody);
  assert.equal(rejected.statusCode, 409);
  assert.equal(rejected.payload.error, 'ORDER_EDIT_FINANCIAL_HISTORY_PROTECTED');
  const paidStored = (await db.collection('orders').doc('EDIT-SYNTHETIC-PAID').get()).data();
  assert.equal(paidStored.items[0].quantity, 1, 'blocked financial edit leaves item quantities unchanged');
  assert.equal(paidStored.paymentLogs[0].id, 'historic-payment', 'historic payment remains untouched');

  const invalid = await invoke('EDIT-SYNTHETIC-1', buildBody('EDIT-SYNTHETIC-1', 'edit-test-invalid', {
    expectedVersion: 1,
    items: [{ sourceIndex: 0, name: '', quantity: 1, price: 10, artworks: [] }],
  }));
  assert.equal(invalid.statusCode, 400, 'invalid edits return actionable validation errors');
  assert.equal((await db.collection('orders').doc('EDIT-SYNTHETIC-1').get()).data()?.detailsVersion, 1, 'invalid edit is not persisted');

  const stale = await invoke('EDIT-SYNTHETIC-1', { ...buildBody('EDIT-SYNTHETIC-1', 'edit-test-stale'), expectedVersion: 0 });
  assert.equal(stale.statusCode, 409, 'concurrent stale edit is rejected');
  assert.equal(stale.payload.error, 'ORDER_EDIT_CONFLICT');
  console.log('PASS: order edit endpoint persists synthetic edits, is idempotent, preserves paid history, and rejects invalid/stale requests.');
}

await main();

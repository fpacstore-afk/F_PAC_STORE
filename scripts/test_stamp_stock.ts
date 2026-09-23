import assert from 'node:assert/strict';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { applyOrderStampStockInTransaction, adjustStampBalance } from '../server/services/stampStock.service';

async function main() {
  const db = requireIsolatedTestDb();
  await db.collection('designs').doc('print-a').set({ name: 'Estampa A', stockBalance: 1 });
  await db.collection('designs').doc('print-b').set({ name: 'Estampa B', stockBalance: 0 });
  await db.collection('products').doc('ready-shirt').set({ productFinish: 'printed', stampIds: ['print-a', 'print-b'] });
  const items = [{ productId: 'ready-shirt', slug: 'ready-shirt', quantity: 2 }];
  const apply = (orderId: string, action: 'order_debit' | 'order_release' | 'delivery_reconcile') =>
    db.runTransaction((transaction: any) => applyOrderStampStockInTransaction(transaction, db, orderId, items, action));
  const balance = async (id: string) => (await db.collection('designs').doc(id).get()).data()?.stockBalance;

  await apply('ORDER-1', 'order_debit');
  assert.equal(await balance('print-a'), -1);
  assert.equal(await balance('print-b'), -2);
  await apply('ORDER-1', 'order_debit');
  assert.equal(await balance('print-b'), -2, 'replayed order cannot debit again');

  await db.collection('products').doc('ready-shirt').update({ stampIds: [] });
  await apply('ORDER-1', 'delivery_reconcile');
  assert.equal(await balance('print-a'), 0);
  assert.equal(await balance('print-b'), 0);
  await apply('ORDER-1', 'delivery_reconcile');
  assert.equal(await balance('print-b'), 0, 'replayed delivery cannot add stock again');
  const entry = (await db.collection('stamp_movements').doc('ORDER-1_delivery_reconcile_print-b').get()).data();
  const consumption = (await db.collection('stamp_movements').doc('ORDER-1_production_consumption_print-b').get()).data();
  assert.equal(entry?.delta, 2);
  assert.equal(consumption?.quantity, 2);
  assert.equal(consumption?.delta, 0, 'physical consumption was already deducted at order creation');

  await db.collection('products').doc('ready-shirt').update({ stampIds: ['print-b'] });
  await apply('ORDER-2', 'order_debit');
  assert.equal(await balance('print-b'), -2);
  await apply('ORDER-2', 'order_release');
  assert.equal(await balance('print-b'), 0);
  await apply('ORDER-2', 'order_release');
  assert.equal(await balance('print-b'), 0);

  await adjustStampBalance('print-a', 5, 'isolated-test', 'Reposição física');
  assert.equal(await balance('print-a'), 5);
  console.log('PASS stamp stock: negative sales, immutable recipe, delivery reconciliation, replay, release and audited replenishment');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

import assert from 'node:assert/strict';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { applyOrderStampStockInTransaction, adjustStampBalance, recountStampSizes } from '../server/services/stampStock.service';

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

  await db.collection('designs').doc('fp-white').set({
    code: 'FP-BRANCA', name: 'FP branca', stockBalance: 4,
    availableSizes: ['8x6', '10x10'], stockBySize: { '8x6': 2, '10x10': 2 },
  });
  await db.collection('designs').doc('fp-black').set({
    code: 'FP-PRETA', name: 'FP preta', stockBalance: 6,
    availableSizes: ['8x6', '10x10'], stockBySize: { '8x6': 2, '10x10': 4 },
  });
  await db.collection('products').doc('beige-fp-shirt').set({
    productFinish: 'printed',
    stampIdsByColor: { Bege: ['fp-black'], Preto: ['fp-white'] },
    stampSizesByColor: { Bege: ['8x6'], Preto: ['8x6'] },
  });
  const beigeItems = [{ productId: 'beige-fp-shirt', color: 'Bege', quantity: 2 }];
  const unknownColorItems = [{ productId: 'beige-fp-shirt', color: 'Areia', quantity: 1 }];
  const applyBeige = (orderId: string, action: 'order_debit' | 'order_release' | 'delivery_reconcile') =>
    db.runTransaction((transaction: any) => applyOrderStampStockInTransaction(transaction, db, orderId, beigeItems, action));
  await applyBeige('ORDER-BEIGE-FP', 'order_debit');
  assert.deepEqual((await db.collection('designs').doc('fp-black').get()).data()?.stockBySize, { '8x6': 0, '10x10': 4 });
  assert.equal((await db.collection('designs').doc('fp-black').get()).data()?.stockBalance, 4);
  assert.equal((await db.collection('designs').doc('fp-white').get()).data()?.stockBalance, 4, 'beige garment must never debit the white artwork');
  const beigeMovement = (await db.collection('stamp_movements').doc('ORDER-BEIGE-FP_order_debit_fp-black_8x6').get()).data();
  assert.equal(beigeMovement?.size, '8x6');
  await db.collection('products').doc('beige-fp-no-size').set({ productFinish: 'printed', stampIdsByColor: { Bege: ['fp-black'] } });
  await assert.rejects(
    db.runTransaction((transaction: any) => applyOrderStampStockInTransaction(transaction, db, 'ORDER-MISSING-SIZE', [{ productId: 'beige-fp-no-size', color: 'Bege', quantity: 1 }], 'order_debit')),
    /Selecione a medida da estampa/,
    'a system-managed multi-size print must not fall back to aggregate stock when its size is missing'
  );
  await db.collection('products').doc('beige-fp-wrong-size').set({ productFinish: 'printed', stampIdsByColor: { Bege: ['fp-black'] }, stampSizesByColor: { Bege: ['12x12'] } });
  await assert.rejects(
    db.runTransaction((transaction: any) => applyOrderStampStockInTransaction(transaction, db, 'ORDER-WRONG-SIZE', [{ productId: 'beige-fp-wrong-size', color: 'Bege', quantity: 1 }], 'order_debit')),
    /não está cadastrada no estoque/,
    'a registered product recipe must reject a size that does not belong to the selected stamp'
  );
  await db.collection('products').doc('beige-fp-shirt').update({ stampIdsByColor: { Bege: ['fp-white'] } });
  await applyBeige('ORDER-BEIGE-FP', 'order_release');
  assert.deepEqual((await db.collection('designs').doc('fp-black').get()).data()?.stockBySize, { '8x6': 2, '10x10': 4 }, 'release restores the original black 8x6 variant even if product setup changed later');
  assert.equal((await db.collection('designs').doc('fp-white').get()).data()?.stockBySize['8x6'], 2);

  await db.collection('designs').doc('fp-multi').set({
    code: 'FP-MULTI', name: 'FP em duas medidas', stockBalance: 2,
    availableSizes: ['8x6', '10x10'], stockBySize: { '8x6': 1, '10x10': 1 },
  });
  await db.collection('products').doc('multi-size-shirt').set({
    productFinish: 'printed', stampIds: ['fp-multi', 'fp-multi'], stampSizes: ['8x6', '10x10'],
  });
  const multiItems = [{ productId: 'multi-size-shirt', color: 'Preto', quantity: 1 }];
  const applyMulti = (orderId: string, action: 'order_debit' | 'order_release' | 'delivery_reconcile') =>
    db.runTransaction((transaction: any) => applyOrderStampStockInTransaction(transaction, db, orderId, multiItems, action));
  await applyMulti('ORDER-MULTI-SIZE', 'order_debit');
  assert.deepEqual((await db.collection('designs').doc('fp-multi').get()).data()?.stockBySize, { '8x6': 0, '10x10': 0 });
  assert.equal((await db.collection('stamp_movements').doc('ORDER-MULTI-SIZE_order_debit_fp-multi_8x6').get()).data()?.delta, -1);
  assert.equal((await db.collection('stamp_movements').doc('ORDER-MULTI-SIZE_order_debit_fp-multi_10x10').get()).data()?.delta, -1);
  await applyMulti('ORDER-MULTI-SIZE', 'order_release');
  assert.deepEqual((await db.collection('designs').doc('fp-multi').get()).data()?.stockBySize, { '8x6': 1, '10x10': 1 });

  await db.collection('products').doc('manual-base').set({ productFinish: 'plain' });
  const manualItems = [{ productId: 'manual-base', quantity: 1, customization: { prints: [{ stampId: 'fp-black', printSize: '10x10' }] } }];
  const applyManual = (orderId: string, action: 'order_debit' | 'order_release') =>
    db.runTransaction((transaction: any) => applyOrderStampStockInTransaction(transaction, db, orderId, manualItems, action));
  await applyManual('ORDER-MANUAL-SIZE', 'order_debit');
  assert.equal((await db.collection('designs').doc('fp-black').get()).data()?.stockBySize['10x10'], 3);
  await applyManual('ORDER-MANUAL-SIZE', 'order_release');
  assert.equal((await db.collection('designs').doc('fp-black').get()).data()?.stockBySize['10x10'], 4);

  await db.collection('designs').doc('fp-unallocated').set({
    code: 'FP-ANTIGA', name: 'FP saldo antigo agregado', stockBalance: 3,
    availableSizes: ['8x6', '10x10'],
  });
  const recount = await recountStampSizes('fp-unallocated', { '8x6': 1, '10x10': 4 }, 'isolated-test', 'Contagem física completa');
  assert.equal(recount.before, 3);
  assert.equal(recount.after, 5);
  assert.equal(recount.unallocatedBefore, 3, 'the old aggregate is called out instead of being silently assigned to a size');
  assert.deepEqual((await db.collection('designs').doc('fp-unallocated').get()).data()?.stockBySize, { '8x6': 1, '10x10': 4 });
  assert.equal((await db.collection('stamp_movements').get()).docs.some((movement: any) => movement.data().type === 'manual_recount' && movement.data().reason === 'Contagem física completa'), true);

  console.log('PASS stamp stock: color recipe, exact print-size debit, immutable release, replay, production reconciliation and audited physical recount');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

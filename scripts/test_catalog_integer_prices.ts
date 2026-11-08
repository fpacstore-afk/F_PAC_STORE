import assert from 'node:assert/strict';
import { createInMemoryDb } from '../server/firebase';
import { applyCatalogIntegerPrices, CATALOG_INTEGER_CHANGE_ID } from '../server/services/catalogIntegerPrices.service';

const plan = [{ id: 'shirt', price: 89.9, promotionalPrice: 79.9 }, { id: 'top', price: 69.9, promotionalPrice: 59.9 }];
async function fixture() {
  const db = createInMemoryDb();
  for (const row of plan) await db.collection('products').doc(row.id).set({ ...row, status: 'active', costPrice: 30.25, stock: 4, name: 'Fixture' });
  await db.collection('products').doc('untouched-base').set({ price: 12.5, productFinish: 'plain' });
  await db.collection('orders').doc('historic').set({ total: 79.9, items: [{ price: 79.9 }], amountPaid: 79.9 });
  await db.collection('inventory').doc('shirt').set({ stock: 4 });
  return db;
}
const db = await fixture();
const results = await Promise.all([applyCatalogIntegerPrices(db, plan), applyCatalogIntegerPrices(db, plan)]);
assert.equal(results.filter(result => !result.alreadyApplied).length, 1);
assert.equal((await db.collection('products').doc('shirt').get()).data().price, 89);
assert.equal((await db.collection('products').doc('shirt').get()).data().promotionalPrice, 79);
assert.equal((await db.collection('products').doc('shirt').get()).data().costPrice, 30.25);
assert.equal((await db.collection('products').doc('untouched-base').get()).data().price, 12.5);
assert.deepEqual((await db.collection('orders').doc('historic').get()).data(), { total: 79.9, items: [{ price: 79.9 }], amountPaid: 79.9 });
assert.equal((await db.collection('inventory').doc('shirt').get()).data().stock, 4);
const audit = (await db.collection('catalog_price_changes').doc(CATALOG_INTEGER_CHANGE_ID).get()).data();
assert.equal(audit.changes[0].before.promotionalPrice, 79.9); assert.equal(audit.changes[0].after.promotionalPrice, 79);
await assert.rejects(applyCatalogIntegerPrices(db, [{ id: 'other', price: 19.9 }]), /another plan/);
const stale = await fixture();
await stale.collection('products').doc('top').update({ price: 71.9 });
await assert.rejects(applyCatalogIntegerPrices(stale, plan), /changed since/);
assert.equal((await stale.collection('products').doc('shirt').get()).data().price, 89.9, 'stale plans apply no partial changes');
assert.equal((await stale.collection('catalog_price_changes').get()).size, 0);
for (const invalid of [[], [{ id: 'invalid/path', price: 99.9 }], [{ id: 'shirt', price: 0.9 }], [{ id: 'shirt', price: NaN }], [plan[0], plan[0]]]) await assert.rejects(applyCatalogIntegerPrices(await fixture(), invalid));
console.log('PASS atomic, idempotent, scoped integer repricing; protected before/after audit; no stale overwrite or historical finance changes.');

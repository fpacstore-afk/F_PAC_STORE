import assert from 'node:assert/strict';
import { createInMemoryDb } from '../server/firebase.ts';
import { previewPendingZimmInventory, applyPendingZimmInventory } from '../server/services/pendingZimmInventory.service.ts';

const db: any = createInMemoryDb();
const seedZin = async (database: any) => {
  await database.collection('products').doc('zin-basic-existing').set({ name:'Camiseta Básica Tradicional — Zin',
    sku:'FPAC-ZIN-BAS-001', baseModel:'Camiseta Básica Tradicional', productFinish:'plain', status:'draft', variants:[], colors:[], sizes:[], price:0 });
  await database.collection('products').doc('zin-dry-existing').set({ name:'Camiseta Tradicional Dry Fit — Zin',
    sku:'FPAC-ZIN-DRY-001', baseModel:'Tradicional Dry Fit', productFinish:'plain', status:'draft', variants:[], colors:[], sizes:[], price:0 });
};
await seedZin(db);
await db.collection('products').doc('other').set({ id:'other', name:'Regata', baseModel:'Regata', productFinish:'plain', status:'draft' });
await db.collection('inventory').doc('other').set({ variants:{ Branco_M:{ physicalQuantity:3, reservedQuantity:1 } }, totalPhysicalStock:3 });
const preview = await previewPendingZimmInventory(db);
assert.equal(preview.countedTotal, 14);
assert.equal(preview.previousTotal, 0);
assert.equal(preview.conflicts.length, 0);
assert.equal(preview.lines.length, 14);
const result = await applyPendingZimmInventory(db, 'isolated-audit');
assert.equal(result.countedTotal, 14);
assert.equal(result.changedVariants, 9);
assert.equal(result.alreadyApplied, false);
assert.equal((await applyPendingZimmInventory(db, 'isolated-audit')).alreadyApplied, true);
const products = (await db.collection('products').get()).docs;
assert.equal(products.length, 3, 'replay cannot duplicate either base');
const basic = (await db.collection('products').doc('zin-basic-existing').get()).data();
const dry = (await db.collection('products').doc('zin-dry-existing').get()).data();
assert.equal(basic.baseModel, 'Camiseta Básica Tradicional');
assert.equal(dry.baseModel, 'Tradicional Dry Fit');
assert.equal(basic.sizes.includes('XG'), true);
assert.equal(basic.sizes.includes('G1'), false);
assert.deepEqual(basic.supplierSizeUnverified, ['XG']);
assert.equal(dry.fabric.includes('poliéster'), true);
assert.equal(basic.fabric.includes('algodão'), true);
assert.equal(basic.status, 'draft', 'without retail price these bases are not published');
assert.equal((await db.collection('inventory').doc(basic.id).get()).data().totalPhysicalStock, 6);
assert.equal((await db.collection('inventory').doc(dry.id).get()).data().totalPhysicalStock, 8);
assert.equal((await db.collection('inventory').doc('other').get()).data().variants.Branco_M.reservedQuantity, 1);
assert.equal((await db.collection('stock_movements').get()).docs.length, 9);
const duplicateDb: any = createInMemoryDb();
await seedZin(duplicateDb);
await duplicateDb.collection('products').doc('legacy-basic').set({ name:'Camiseta Básica', baseModel:'Camiseta Básica Tradicional', productFinish:'plain', status:'draft' });
assert.equal((await previewPendingZimmInventory(duplicateDb)).conflicts.length > 0, true);
await assert.rejects(applyPendingZimmInventory(duplicateDb, 'isolated'), /outra base física/);
assert.equal((await duplicateDb.collection('inventory').get()).docs.length, 0);
const legacyDb: any = createInMemoryDb();
await seedZin(legacyDb);
await legacyDb.collection('products').doc('garment-zim-001').set({ name:'Camiseta Tradicional F PAC — Gola Tradicional · 30.1',
  baseModel:'Tradicional Suedine', supplierName:'Zimm', productFinish:'plain', status:'active' });
assert.equal((await previewPendingZimmInventory(legacyDb)).conflicts.length, 0);
assert.equal((await previewPendingZimmInventory(legacyDb)).advisories.length, 1,
  'the legacy cotton ficha is kept for manual review and is not overwritten');
await applyPendingZimmInventory(legacyDb, 'isolated');
assert.equal((await legacyDb.collection('products').doc('garment-zim-001').get()).data().baseModel, 'Tradicional Suedine');
console.log('PASS Zimm final count: 14 physical pieces, 9 differences, XG distinct, supplier families, history, reservations, duplicate refusal and idempotent replay.');

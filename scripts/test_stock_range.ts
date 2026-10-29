import assert from 'node:assert/strict';
import { createInMemoryDb } from '../server/firebase';
import { STOCK_FAMILIES, stockFamily, stockCollar, summarizeStockFamilies } from '../shared/stockFamilies';
import { previewStockRange, applyStockRange } from '../server/services/stockRange.service';
import { productMatchesStorefrontCategory } from '../src/lib/catalogProducts';

assert.equal(STOCK_FAMILIES.length,7);
assert.equal(stockFamily({name:'Camisa Oversized — Gola tradicional · Suedine',baseModel:'Oversized Suedine'}),'oversized');
assert.equal(stockFamily({name:'Regata',productType:'tshirt'}),'regatas');
assert.equal(productMatchesStorefrontCategory({name:'Regata ZIMM',productType:'tshirt'},'regatas'),true);
for(const name of ['Camiseta infantil','Camisa Polo','Calça','Kit F PAC','Chinelo']) assert.equal(stockFamily({name}),null);
assert.equal(stockCollar({baseModel:'Oversized Premium 240GSM',supplierName:'Tiggas'}),'unclassified','Supplier text alone must not classify mixed physical stock');
assert.equal(stockCollar({baseModel:'Oversized Premium 240GSM',neckline:'classic_open'}),'classic_open');
const grouped=summarizeStockFamilies([
  {id:'mixed',slug:'mixed',baseModel:'Oversized Premium 240GSM',totalStock:39,stockGroup:'plain'},
  {id:'alias',slug:'mixed',baseModel:'Oversized Premium 240GSM',totalStock:39,stockGroup:'plain'},
  {id:'high',baseModel:'Oversized Suedine',neckline:'high_closed',totalStock:4,stockGroup:'plain'},
  {id:'old',baseModel:'Oversized Suedine',status:'archived',totalStock:8},
]);
assert.equal(grouped[0].physical,43,'A stock-bearing slug counts once, without archived rows');
assert.equal(grouped[0].unclassified,39);assert.equal(grouped[0].high,4);assert.equal(grouped[0].classic,0);
const db=createInMemoryDb();
const originals=[
  {id:'mixed',slug:'mixed',name:'Camiseta Oversized',productFinish:'plain',baseModel:'Oversized Premium 240GSM',status:'draft',sku:'ORIGINAL',price:0,costPrice:32,variants:[{colorName:'Preto',size:'M',active:false}]},
  {id:'design',slug:'design',name:'Camiseta Oversized F PAC — Fênix',baseModel:'Oversized Premium 240GSM',productFinish:'printed',price:89.9,status:'active',stockBaseSlug:'mixed'},
  {id:'outside',slug:'outside',name:'Calça antiga',category:'Calças',status:'active',price:120},
];
for(const product of originals) await db.collection('products').doc(product.id).set(product);
const originalInventory={variants:{Preto_M:{physicalQuantity:39,stock:39,reservedQuantity:3,active:false,physicalCountVerified:false}},totalPhysicalStock:39,totalReservedStock:3};
await db.collection('inventory').doc('mixed').set(originalInventory);
await db.collection('inventory').doc('orphan').set({variants:{Preto_G:{physicalQuantity:7,reservedQuantity:2}}});
await db.collection('orders').doc('order').set({items:[{productId:'mixed',quantity:3}],status:'processing'});
await db.collection('stock_reservations').doc('reserve').set({productSlug:'mixed',quantity:3,status:'active'});
const read=async(col:string,id:string)=>(await db.collection(col).doc(id).get()).data();
const beforeOrder=await read('orders','order'), beforeReservation=await read('stock_reservations','reserve');
const stale=await previewStockRange(db);
await db.collection('products').doc('design').update({price:99.9});
await assert.rejects(applyStockRange(db,{requestId:'stale',fingerprint:stale.fingerprint},'test'),/mudaram/);
assert.deepEqual(await read('inventory','mixed'),originalInventory);
const plan=await previewStockRange(db), operation={requestId:'range-1',fingerprint:plan.fingerprint};
const result=await applyStockRange(db,operation,'test');
assert.equal(result.updated,3);assert.equal(result.created.length,6);
assert.deepEqual(await read('inventory','mixed'),originalInventory,'Every existing variant, reservation and activation flag remains byte-for-byte equivalent');
assert.equal((await read('inventory','orphan')).variants.Preto_G.physicalQuantity,7,'Orphan stock stays available for reconciliation');
assert.deepEqual(await read('orders','order'),beforeOrder);assert.deepEqual(await read('stock_reservations','reserve'),beforeReservation);
const saved=await read('products','mixed');
assert.equal(saved.stockFamily,'oversized');assert.equal(saved.name,'Camisa Oversized');assert.equal(saved.sku,'ORIGINAL');assert.equal(saved.slug,'mixed');assert.equal(saved.garmentModelId,undefined);assert.equal(saved.neckline,undefined);assert.equal(saved.costPrice,32);assert.deepEqual(saved.variants,originals[0].variants);
assert.equal((await read('products','design')).price,99.9);assert.equal((await read('products','design')).stockBaseSlug,'mixed');
assert.equal((await read('products','outside')).status,'archived');assert.equal((await read('products','outside')).price,120);
for(const created of result.created){const item=await read('products',created.id);assert.equal(item.status,'draft');assert.equal(item.primeBaseEnabled,false);assert.equal((await read('inventory',created.id)).stock,0);assert.deepEqual(item.sizes,[],'No invented size grade');}
assert.equal((await applyStockRange(db,operation,'test')).alreadyApplied,true);
await assert.rejects(applyStockRange(db,{...operation,fingerprint:'a'.repeat(64)},'test'),/Identificador/);
const event=await read('stock_range_events','range-1');assert.ok(event.beforeFields.length);assert.equal(event.actor,'test');
assert.equal((await previewStockRange(db)).updates.length,0,'Reorganization is stable after one application');
console.log('PASS seven-family classification, collar uncertainty, deduplication, stale-plan rejection, idempotency, reversible metadata and conservation of all existing stock, reservations, orders and prices.');

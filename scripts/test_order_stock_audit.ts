import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { allocateGarments, garmentOrderBalance, variantAvailable } from '../shared/sharedGarmentStock';
import { assertManualOrderStock, manualOrderStockItems, manualVariantBalance } from '../shared/manualOrderStock';
import { createManualOrderController, recordBulkStockMovement, recordStockMovement } from '../server/controllers/admin.controller';
import { checkStock, consumeStockReservation, releaseStockReservation, reserveStock } from '../server/services/store.service';
import { reconcileSharedStockEdit } from '../server/services/sharedStockEdit.service';
import { loadPublicCatalog } from '../server/services/publicCatalog.service';
import { calculateOrderPricing } from '../server/services/pricing.service';

const db = requireIsolatedTestDb();
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('External services are forbidden in stock certification'); };
const user = { uid: 'stock-audit', email: 'stock-audit@example.invalid' };
const invoke = async (handler: any, body: any) => {
  const res = { statusCode: 200, body: {} as any, status(code: number) { this.statusCode = code; return this; }, json(data: any) { this.body = data; return this; } };
  await handler({ body, user }, res); return res;
};
const variant = (physicalQuantity: number, reservedQuantity = 0) => ({ physicalQuantity, stock: physicalQuantity, reservedQuantity, available: physicalQuantity > reservedQuantity });
const base = (id: string, model: string) => ({ id, slug: id, name: 'Camiseta Oversized Suedine lisa', productFinish: 'plain', status: 'draft', primeBaseEnabled: true, baseModel: 'Oversized Premium 240GSM', garmentModelId: model, garmentModelName: model === 'ZIM-009' ? 'Gola alta · Suedine' : 'Gola tradicional · Suedine', sizes: ['P','M'], colors: [{ name: 'Off White' }, { name: 'Branco' }] });
const high = base('high', 'ZIM-009'), classic = base('classic', 'TIG-006');
const design = { id: 'fenix', slug: 'fenix', name: 'Camiseta Oversized F PAC', productFinish: 'printed', status: 'active', price: 89, baseModel: high.baseModel, modelSeparationRequired: true, sizes: high.sizes, colors: high.colors };
const second = { ...design, id: 'logo', slug: 'logo' };
const chosen = (model = 'ZIM-009', id = 'fenix') => ({ ...design, id, slug: id, garmentModelId: model, garmentModelName: model === 'ZIM-009' ? high.garmentModelName : classic.garmentModelName, stockBaseSlug: model === 'ZIM-009' ? 'high' : 'classic' });
const draft = (quantity = 1, model = 'ZIM-009', id = 'fenix') => ({ product: chosen(model, id), color: 'Off White', size: 'M', quantity, price: 89, mode: 'ready' });
const products = [high, classic, design, second];
const inventories = async () => Object.fromEntries((await db.collection('inventory').get()).docs.map(doc => [doc.id, doc.data()]));
const physical = async (id: string) => (await db.collection('inventory').doc(id).get()).data();
let checks = 0;
async function check(name: string, action: () => Promise<void> | void) { await action(); console.log(`PASS ${name}`); checks++; }
try {
  for (const p of products) await db.collection('products').doc(p.id).set(p);
  await db.collection('inventory').doc('high').set({ available: false, variants: { 'Off White_M': variant(0), Branco_P: variant(0) } });
  await db.collection('inventory').doc('classic').set({ variants: { 'Off White_M': variant(5) } });
  for (const id of ['fenix', 'logo']) await db.collection('inventory').doc(id).set({ variants: { 'Off White_M': variant(100) } });

  await check('Off White M from a different collar does not cover a zero Suedine pool', async () => {
    const inventory = await inventories();
    assert.equal(manualVariantBalance(chosen(), 'Off White', 'M', products, inventory).availableQuantity, 0);
    assert.equal(manualVariantBalance(chosen('TIG-006'), 'Off White', 'M', products, inventory).availableQuantity, 5);
    const result = await invoke(createManualOrderController, { order: { id: 'MANUAL-ZERO', items: manualOrderStockItems([draft()]), stockControl: 'move', total: 89 } });
    assert.equal(result.statusCode, 409);
    assert.equal((await db.collection('orders').doc('MANUAL-ZERO').get()).exists, false);
    assert.equal((await physical('classic')).variants['Off White_M'].physicalQuantity, 5);
  });
  await check('receiving stock into an exhausted pool reopens availability and records entry once', async () => {
    const request = { productSlug: 'high', mode: 'receive', reason: 'Isolated supplier receipt', idempotencyKey: randomUUID(), updates: [{ variantKey: 'Off White_M', quantity: 3 }] };
    assert.equal((await invoke(recordBulkStockMovement, request)).statusCode, 200);
    assert.equal((await invoke(recordBulkStockMovement, request)).body.replayed, true);
    const inv = await physical('high'); assert.equal(inv.available, true); assert.equal(inv.variants['Off White_M'].physicalQuantity, 3);
    const catalog = await loadPublicCatalog(db); assert.equal(catalog.availability.high.variants['Off White_M'].availableQuantity, 3);
    assert.equal(manualVariantBalance(chosen(), 'Off White', 'M', products, await inventories()).availableQuantity, 3);
  });
  await check('different prints and direct blank lines share the remaining draft balance', async () => {
    const inventory = await inventories(), first = draft(2);
    assert.equal(manualVariantBalance(chosen('ZIM-009','logo'), 'Off White', 'M', products, inventory, [first]).availableQuantity, 1);
    assert.equal(manualVariantBalance(high, 'Off White', 'M', products, inventory, [first]).availableQuantity, 1);
    assert.equal(manualVariantBalance(chosen('TIG-006'), 'Off White', 'M', products, inventory, [first]).availableQuantity, 5);
    assert.throws(() => assertManualOrderStock([first,draft(2,'ZIM-009','logo')], products, inventory), /insuficiente/);
    assert.equal((await physical('high')).variants['Off White_M'].reservedQuantity, 0, 'preview never mutates inventory');
  });
  await check('a real manual endpoint creates and replays the order with authoritative model allocations', async () => {
    const order = { id: 'MANUAL-AUDIT', items: manualOrderStockItems([draft(2)]), stockControl: 'move', total: 178, shippingStatus: 'pending' };
    assert.equal((await invoke(createManualOrderController, { order })).statusCode, 201);
    assert.equal((await invoke(createManualOrderController, { order })).statusCode, 201);
    const saved = (await db.collection('orders').doc(order.id).get()).data();
    assert.equal(saved.items[0].inventoryAllocations[0].productSlug, 'high');
    assert.equal(saved.items[0].garmentModelId, 'ZIM-009');
    assert.equal((await physical('high')).variants['Off White_M'].reservedQuantity, 2);
    assert.equal((await checkStock(manualOrderStockItems([draft(2,'ZIM-009','logo')]))).isAvailable, false);
    await releaseStockReservation(order.id, order.items); await releaseStockReservation(order.id, order.items);
    assert.equal((await physical('high')).variants['Off White_M'].reservedQuantity, 0);
    assert.equal((await physical('high')).available, true);
  });
  await check('checkout price verification, last-unit reservation, shipment and restock share one source', async () => {
    const result = await calculateOrderPricing({ items: manualOrderStockItems([draft(3)]), customerInfo: {} }, { priceOnly: true });
    assert.equal(result.verifiedItems[0].garmentModelId, 'ZIM-009');
    await reserveStock('CHECKOUT-AUDIT', result.verifiedItems, undefined, { items: result.verifiedItems });
    assert.equal((await checkStock(manualOrderStockItems([draft()]))).isAvailable, false);
    const reservedOrder = (await db.collection('orders').doc('CHECKOUT-AUDIT').get()).data();
    await db.runTransaction(async tx => {
      const edited = await reconcileSharedStockEdit(tx, db, 'CHECKOUT-AUDIT', reservedOrder, reservedOrder.items, 1);
      tx.update(db.collection('orders').doc('CHECKOUT-AUDIT'), { items: edited });
    });
    assert.equal((await physical('high')).variants['Off White_M'].reservedQuantity, 3, 'editing the last reserved units keeps the original pool usable within the transaction');
    await consumeStockReservation('CHECKOUT-AUDIT', result.verifiedItems);
    await consumeStockReservation('CHECKOUT-AUDIT', result.verifiedItems);
    assert.equal((await physical('high')).variants['Off White_M'].physicalQuantity, 0);
    assert.equal((await physical('high')).available, false);
    const request = { productSlug: 'high', variantKey: 'Off White_M', type: 'purchase_entry', quantity: 2, reason: 'Another isolated receipt', idempotencyKey: randomUUID() };
    assert.equal((await invoke(recordStockMovement, request)).statusCode, 200);
    assert.equal((await invoke(recordStockMovement, request)).body.replayed, true);
    assert.equal((await physical('high')).variants['Off White_M'].physicalQuantity, 2);
    assert.equal((await physical('high')).available, true);
    assert.equal((await checkStock(manualOrderStockItems([draft(2)]))).isAvailable, true);
    assert.equal((await invoke(recordStockMovement, { ...request, quantity: 9 })).statusCode, 409);
  });
  await check('stock movements reject unknown operations, fractions, infinity and unsafe document identifiers', async () => {
    for (const patch of [{ type: 'unknown' }, { quantity: 1.5 }, { quantity: Infinity }, { quantity: -1 }, { quantity: 0 }, { productSlug: '../bad' }, { variantKey: '__proto__' }, { idempotencyKey: '../bad' }]) {
      const result = await invoke(recordStockMovement, { productSlug: 'high', variantKey: 'Off White_M', type: 'add', quantity: 1, ...patch });
      assert.equal(result.statusCode, 400, JSON.stringify(patch));
    }
    assert.equal((await physical('high')).variants['Off White_M'].physicalQuantity, 2);
  });
  await check('restock preserves existing reservations and does not release disabled variants or colors', async () => {
    await reserveStock('HOLD-AUDIT', manualOrderStockItems([draft()]), undefined, { items: [] });
    await invoke(recordBulkStockMovement, { productSlug: 'high', mode: 'receive', reason: 'Restock with active order', idempotencyKey: randomUUID(), updates: [{ variantKey: 'Off White_M', quantity: 2 }] });
    assert.equal((await physical('high')).variants['Off White_M'].reservedQuantity, 1);
    assert.equal(garmentOrderBalance(manualOrderStockItems([draft()])[0], products, new Map(Object.entries(await inventories()))).availableQuantity, 3);
    assert.equal(manualVariantBalance(chosen(), 'Branco', 'M', products, await inventories()).availableQuantity, 0, 'no fallback to another color or missing variation');
    const disabled = products.map(p => p.id === 'high' ? { ...p, variants: [{ colorName: 'Off White', size: 'M', active: false }] } : p);
    assert.equal(manualVariantBalance(chosen(), 'Off White', 'M', disabled, await inventories()).availableQuantity, 0);
    await releaseStockReservation('HOLD-AUDIT', []);
  });
  await check('malformed stored quantities cannot authorize a sale', () => {
    for (const data of [{ physicalQuantity: Infinity }, { physicalQuantity: NaN }, { physicalQuantity: 1.5 }, { physicalQuantity: 2, reservedQuantity: -1 }]) {
      assert.equal(variantAvailable({ variants: { X_M: data } }, 'X_M'), 0);
    }
  });
  await check('manual orders reject fractional quantities before any order or stock write', async () => {
    for (const quantity of [0, -1, 1.5, Infinity, '1']) {
      const result = await invoke(createManualOrderController, { order: { id: 'MANUAL-BAD-QTY', items: [{ productId: 'fenix', quantity }], stockControl: 'move' } });
      assert.equal(result.statusCode, 400);
    }
    assert.equal((await db.collection('orders').doc('MANUAL-BAD-QTY').get()).exists, false);
    assert.throws(() => manualOrderStockItems([draft(1.5)]), /inteira/);
  });
  await check('generic catalog totals exclude colors and sizes not offered by that design', async () => {
    await db.collection('products').doc('restricted').set({ ...design, id: 'restricted', slug: 'restricted', colors: [{ name: 'Branco' }], sizes: ['P'] });
    const catalog = await loadPublicCatalog(db);
    assert.equal(catalog.availability.restricted.availableQuantity, 0);
    assert.equal(catalog.availability.restricted.variants['Off White_M'], undefined);
  });
  await check('a documented receipt into a zero ready-stock variant becomes sellable without certifying legacy quantities', async () => {
    const ready = { ...design, id: 'ready', slug: 'ready', modelSeparationRequired: false, stockMode: 'ready_only' };
    await db.collection('products').doc('ready').set(ready);
    await db.collection('inventory').doc('ready').set({ available: false, variants: { 'Off White_M': variant(0), Branco_P: variant(20) } });
    const received = await invoke(recordBulkStockMovement, { productSlug: 'ready', mode: 'receive', reason: 'Physically received ready item', idempotencyKey: randomUUID(), updates: [{ variantKey: 'Off White_M', quantity: 1 }, { variantKey: 'Branco_P', quantity: 1 }] });
    assert.equal(received.statusCode, 200);
    const catalog = await loadPublicCatalog(db);
    assert.equal(catalog.availability.ready.variants['Off White_M'].availableQuantity, 1);
    assert.equal(catalog.availability.ready.variants.Branco_P.availableQuantity, 0, 'legacy uncounted balances remain protected');
    assert.equal((await physical('ready')).variants.Branco_P.physicalQuantity, 21, 'receipt never overwrites previous quantities');
    assert.equal(allocateGarments([{ productId:'ready', color:'Off White', size:'M', quantity:1 }], [ready], new Map([['ready', await physical('ready')]]))[0].inventoryAllocations[0].source, 'ready');
  });
} finally { globalThis.fetch = originalFetch; }
console.log(`${checks} stock audit scenarios passed; isolated DB, real order/pricing/reservation handlers, no external payments, messages or production writes.`);

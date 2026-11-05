import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.js';
import { cancelPosSale, chargePosSale, completePosSale, expirePosReservations, getPosSale, loadPosVariants, preparePosSale } from '../server/services/pos.service.js';
import { reserveStock } from '../server/services/store.service.js';
import { recordBulkStockMovement } from '../server/controllers/admin.controller.js';
import { saveInventoryCount } from '../server/controllers/inventoryCount.controller.js';
import { companyCashMovements } from '../shared/companyCashRegister.js';

const db = requireIsolatedTestDb();
const user = { uid: 'tester', email: 'operator@example.test' };
const key = 'Preto_M';
const posItem = { productId: 'plain-test', name: 'Oversized lisa', variantKey: key, color: 'Preto', size: 'M', quantity: 1 };
await db.collection('products').doc('plain-test').set({
  slug: 'plain-test', productFinish: 'plain', name: 'Oversized lisa', price: 89.90,
  sizes: ['M'], colors: ['Preto'], status: 'active', baseModel: 'Oversized Premium 240GSM'
});
const invRef = db.collection('inventory').doc('plain-test');
await invRef.set({ variants: { [key]: { physicalQuantity: 1, reservedQuantity: 0, available: true } } });
const getVariant = async () => (await invRef.get()).data()!.variants[key];
const [variant] = await loadPosVariants();
assert.match(variant.code, /^FP[A-F0-9]{20}$/);
const id = randomUUID();
const lines = [{ code: variant.code, quantity: 1, unitCents: 8990 }];
await assert.rejects(preparePosSale({ requestId: id, lines: [{ ...lines[0], unitCents: 1 }] }, user), /preço mudou/);
const reserved = await preparePosSale({ requestId: id, lines }, user);
assert.equal(reserved.state, 'reserved');
assert.equal((await getVariant()).reservedQuantity, 1);
assert.equal((await preparePosSale({ requestId: id, lines }, user)).orderId, reserved.orderId);
await assert.rejects(reserveStock('online-checkout', [posItem]), /insuficiente/i);
await assert.rejects(completePosSale(id, user), /indisponível/);
await assert.rejects(chargePosSale(id, 'invalid', user), /forma de pagamento/);
assert.equal((await chargePosSale(id, 'PIX', user)).state, 'charging');
await assert.rejects(cancelPosSale(id, user, false), /recebimento/);
const done = await completePosSale(id, user);
assert.equal(done.state, 'completed');
assert.equal((await completePosSale(id, user)).state, 'completed');
assert.equal((await getVariant()).physicalQuantity, 0);
assert.equal((await getVariant()).reservedQuantity, 0);
assert.equal((await db.collection('financial_events').get()).docs.length, 1);
await assert.rejects(cancelPosSale(id, user, true), /recebimento/);
const paidOrder = (await db.collection('orders').doc(done.orderId).get()).data();
assert.equal(companyCashMovements([paidOrder], [], [], [], []).entries[0].amount, 89.90);

async function invoke(handler: any, body: any) {
  const res = { code: 200, payload: {} as any, status(code: number) { this.code = code; return this; }, json(payload: unknown) { this.payload = payload; return this; } };
  await handler({ body, user }, res);
  return res;
}
const entry = {
  productSlug: 'plain-test', mode: 'receive', idempotencyKey: randomUUID(), reason: 'Fornecedor e compra de teste',
  updates: [{ variantKey: key, quantity: 2 }]
};
assert.equal((await invoke(recordBulkStockMovement, entry)).code, 200);
assert.equal((await invoke(recordBulkStockMovement, entry)).code, 200);
assert.equal((await getVariant()).physicalQuantity, 2);

const second = randomUUID();
const held = await preparePosSale({ requestId: second, lines }, user);
await db.collection('orders').doc(held.orderId).update({ posExpiresAt: '2026-01-01T00:00:00.000Z' });
await expirePosReservations();
assert.equal((await getPosSale(second)).state, 'cancelled');
assert.equal((await getVariant()).physicalQuantity, 2);
assert.equal((await getVariant()).reservedQuantity, 0);
await assert.rejects(chargePosSale(second, 'PIX', user), /encerrada/);

const count = { reference: '2026-11', requestId: randomUUID(), counts: [{ productSlug: 'plain-test', variantKey: key, counted: 0 }] };
const countSaved = await invoke(saveInventoryCount, count);
assert.equal(countSaved.code, 201);
assert.equal(countSaved.payload.differenceCount, 1);
assert.equal((await invoke(saveInventoryCount, count)).payload.id, countSaved.payload.id);
assert.equal((await invoke(saveInventoryCount, { ...count, counts: [{ ...count.counts[0], counted: 1 }] })).code, 409);
assert.equal((await getVariant()).physicalQuantity, 2);
console.log('PDV: physical allocation, last unit, price checks, settlement replay, expiry, incoming stock and physical count verified.');

const { getPosCashDrawer, listPosCardSettlements, settlePosCard, updatePosCashDrawer } = await import('../server/services/posCash.service.js');
const { calculateRecordedCashFlow, financialDateKey } = await import('../shared/cashFlow.js');
const cashOpenId = randomUUID();
const cashOpen = await updatePosCashDrawer('open', { requestId: cashOpenId, cents: 5000 }, user);
await updatePosCashDrawer('open', { requestId: cashOpenId, cents: 5000 }, user);
assert.equal(cashOpen.current.expectedCents, 5000);
const cashId = randomUUID();
await preparePosSale({ requestId: cashId, lines }, user);
await chargePosSale(cashId, 'DINHEIRO', user);
await completePosSale(cashId, user);
await completePosSale(cashId, user);
assert.equal((await getPosCashDrawer()).current!.expectedCents, 13990);
const adjustId = randomUUID();
const cashAdjustment = { requestId: adjustId, sessionId: cashOpenId, cents: 1000, direction: 'out', reason: 'Retirada de teste' };
await updatePosCashDrawer('adjust', cashAdjustment, user);
await updatePosCashDrawer('adjust', cashAdjustment, user);
assert.equal((await getPosCashDrawer()).current!.expectedCents, 12990);
assert.equal((await updatePosCashDrawer('close', { requestId: randomUUID(), sessionId: cashOpenId, cents: 12990 }, user)).current.differenceCents, 0);

const cardId = randomUUID();
await preparePosSale({ requestId: cardId, lines }, user);
await chargePosSale(cardId, 'CRÉDITO', user);
const cardSale = await completePosSale(cardId, user);
const cardRef = db.collection('orders').doc(cardSale.orderId);
const awaiting = (await cardRef.get()).data();
assert.equal((await listPosCardSettlements()).pending[0].requestId, cardId);
assert.equal(calculateRecordedCashFlow([awaiting]).netCashFlow, 0);
assert.equal(companyCashMovements([awaiting], [], [], [], []).entries.length, 0);
const deposit = { date: financialDateKey(new Date()), depositCents: 8690, feeCents: 300, refundCents: 0, reference: 'Extrato de teste' };
await assert.rejects(settlePosCard(cardId, { ...deposit, feeCents: 0 }, user), /devem fechar/);
await settlePosCard(cardId, deposit, user);
await settlePosCard(cardId, deposit, user);
const settled = (await cardRef.get()).data();
assert.equal(calculateRecordedCashFlow([settled]).netCashFlow, 86.90);
assert.equal(companyCashMovements([settled], [], [], [], []).entries[0].amount, 86.90);
assert.equal((await listPosCardSettlements()).pending.length, 0);
console.log('PDV: cash drawer, idempotent cash reconciliation and actual card deposit verified.');

const { linkPosAlias, loadPosAliases, transformPosGarments } = await import('../server/services/posInventory.service.js');
await db.collection('products').doc('qa-ready').set({
  slug: 'qa-ready', productFinish: 'printed', name: 'Oversized estampada', price: 99.90, status: 'active',
  sizes: ['M'], colors: ['Preto'], stockBaseSlug: 'plain-test', baseModel: 'Oversized Premium 240GSM',
  stampIdsByColor: { Preto: ['qa-art'] }, stampSizesByColor: { Preto: ['8x6'] }
});
const ready = db.collection('inventory').doc('qa-ready');
await ready.set({ variants: { [key]: { physicalQuantity: 0, reservedQuantity: 0, available: false } } });
await db.collection('designs').doc('qa-art').set({ availableSizes: ['8x6'], stockBySize: { '8x6': 1 }, stockBalance: 1 });
const readyVariant = (await loadPosVariants()).find(item => item.slug === 'qa-ready')!;
assert.equal(readyVariant.available, 0);
await linkPosAlias({ alias: '0012345678', code: variant.code }, user);
await linkPosAlias({ alias: '0012345678', code: variant.code }, user);
assert.deepEqual(await loadPosAliases(), [{ alias: '0012345678', code: variant.code }]);
await assert.rejects(linkPosAlias({ alias: '0012345678', code: readyVariant.code }, user), /outra variação/);

await invoke(recordBulkStockMovement, { ...entry, idempotencyKey: randomUUID() });
const conversion = { requestId: randomUUID(), sourceCode: variant.code, targetCode: readyVariant.code, quantity: 1, consumeStamps: true };
await transformPosGarments(conversion, user);
await transformPosGarments(conversion, user);
assert.equal((await getVariant()).physicalQuantity, 1);
assert.equal((await ready.get()).data()!.variants[key].physicalQuantity, 1);
assert.equal((await db.collection('designs').doc('qa-art').get()).data()!.stockBalance, 0);
await assert.rejects(transformPosGarments({ ...conversion, requestId: randomUUID() }, user), /estoque físico/i);
assert.equal((await getVariant()).physicalQuantity, 1);
assert.equal((await ready.get()).data()!.variants[key].physicalQuantity, 1);
console.log('PDV: barcode alias uniqueness, stock conversion replay and atomic stamp consumption verified.');

const express = (await import('express')).default;
const { authenticateAdmin, setAuthTokenVerifierForTesting, resetAuthForTesting } = await import('../server/middleware/auth.middleware.js');
const { createPosRouter } = await import('../server/controllers/pos.controller.js');
setAuthTokenVerifierForTesting(async token => {
  if (token === 'admin-test') return { uid: 'tester', admin: true } as any;
  if (token === 'user-test') return { uid: 'customer-test' } as any;
  throw new Error('Fixture invalid token');
});
process.env.ADMIN_API_KEY = 'isolated-test-admin-key';
const app = express();
app.use('/api/admin/pdv', authenticateAdmin, createPosRouter());
const http = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => http.once('listening', resolve));
try {
  const port = (http.address() as { port: number }).port;
  const path = 'http://127.0.0.1:' + port + '/api/admin/pdv/variants';
  assert.equal((await fetch(path)).status, 401);
  assert.equal((await fetch(path, { headers: { 'x-admin-api-key': 'isolated-test-admin-key' } })).status, 401);
  assert.equal((await fetch(path, { headers: { authorization: 'Bearer user-test' } })).status, 403);
  const authorized = await fetch(path, { headers: { authorization: 'Bearer admin-test' } });
  assert.equal(authorized.status, 200);
  assert.match(authorized.headers.get('cache-control') || '', /no-store/);
  assert.doesNotMatch(await authorized.text(), /unitCostSnapshot|privateCosts|actorEmail/);
} finally {
  resetAuthForTesting();
  delete process.env.ADMIN_API_KEY;
  await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
}
console.log('PDV: unauthenticated, automation-key and customer requests denied; admin data marked no-store.');

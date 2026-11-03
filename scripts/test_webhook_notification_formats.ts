import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { handleWebhook } from '../server/controllers/webhook.controller';
import { mpService } from '../server/services/mp.service';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
const db = requireIsolatedTestDb();
const original = mpService.getPayment;
const originalSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'isolated-test-secret';
for (const id of ['123', '456', '789']) await db.collection('orders').doc(`webhook-${id}`).set({
  total: 100, pricing: { total: 100 }, paymentStatus: 'pending', payment: { status: 'pending', paidAmount: 0, provider: 'mercadopago' }, mercadoPagoId: id,
});
const called: string[] = [];
mpService.getPayment = async (id: string) => { called.push(id); return { id, status: 'pending', transaction_amount: 100, external_reference: `webhook-${id}`, payment_method_id: 'pix' } as any; };
const app = express(); app.use(express.json()); app.post('/webhook', handleWebhook);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/webhook`;
let index = 0;
async function call(query: string, body: any, id: string, options: { old?: boolean; corrupt?: boolean; signature?: string; requestId?: string } = {}) {
  const requestId = options.requestId || `request-${++index}`;
  const ts = String(Math.floor(Date.now() / 1000) - (options.old ? 1000 : 0));
  const hash = crypto.createHmac('sha256', 'isolated-test-secret').update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  return fetch(base + query, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-request-id': requestId,
    'x-signature': options.signature || `ts=${ts}, v1=${options.corrupt ? '0'.repeat(64) : hash}` }, body: JSON.stringify(body) });
}
try {
  assert.equal((await call('?data.id=123&type=payment', {}, '123')).status, 200);
  assert.equal(called.at(-1), '123');
  assert.equal((await call('', { type: 'payment', data: { id: 456 } }, '456')).status, 200);
  assert.equal(called.at(-1), '456');
  assert.equal((await call('?id=789&topic=payment', {}, '789')).status, 200);
  assert.equal(called.at(-1), '789');
  assert.equal((await call('?data.id=123&type=payment', { data: { id: 999 } }, '123')).status, 200);
  assert.equal(called.at(-1), '123');
  assert.equal((await call('?data.id=123&type=payment', {}, '123', { old: true })).status, 401);
  assert.equal((await call('?data.id=123&type=payment', {}, '123', { corrupt: true })).status, 401);
  assert.equal((await call('?data.id=123&data.id=456&type=payment', {}, '123')).status, 400);
  assert.equal((await call('?data.id=123&type=payment', {}, '123', { signature: 'ts=bad,v1=abc' })).status, 401);
  assert.equal(called.length, 4);
  assert.equal((await db.collection('orders').get()).size, 3);
  console.log('Signed webhook query/body/legacy formats, whitespace, conflicting body, stale/invalid signatures and ambiguous IDs passed; fake provider only.');
} finally {
  mpService.getPayment = original;
  if (originalSecret === undefined) delete process.env.MERCADO_PAGO_WEBHOOK_SECRET; else process.env.MERCADO_PAGO_WEBHOOK_SECRET = originalSecret;
  await new Promise<void>(resolve => server.close(() => resolve()));
}

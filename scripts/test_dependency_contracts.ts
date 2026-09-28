import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { MercadoPagoService } from '../server/services/mp.service';

// Exercise native SDK objects without opening a database connection.
const app = initializeApp({ projectId: 'demo-fpac-sdk-contracts', storageBucket: 'demo-fpac-sdk-contracts.appspot.com' }, 'sdk-contracts');
const database = getFirestore(app, 'audit-named-database');
assert.equal(database.databaseId, 'audit-named-database');
assert.equal(getAuth(app).app, app);
assert.equal(getStorage(app).bucket().name, 'demo-fpac-sdk-contracts.appspot.com');
assert.ok(FieldValue.increment(2).isEqual(FieldValue.increment(2)));
assert.ok(FieldValue.arrayUnion('item').isEqual(FieldValue.arrayUnion('item')));
await database.terminate(); await deleteApp(app);

// Verify the gaxios 6 multipart caller still works with the patched uuid v4 API.
const require = createRequire(import.meta.url);
const storageRequire = createRequire(require.resolve('@google-cloud/storage'));
const { Gaxios } = storageRequire('gaxios');
let multipartChecked = false;
const gaxios = new Gaxios({ adapter: async (options: any) => {
  const type = options.headers['Content-Type'];
  assert.match(type, /^multipart\/related; boundary=[0-9a-f-]{36}$/);
  const boundary = type.split('boundary=')[1];
  let body = ''; for await (const chunk of options.body) body += chunk.toString();
  assert.ok(body.includes(`--${boundary}`)); assert.ok(body.includes('audit-content'));
  multipartChecked = true;
  return { status: 200, statusText: 'OK', headers: {}, data: { ok: true }, config: options };
} });
await gaxios.request({ url: 'https://example.invalid/upload', method: 'POST', multipart: [{ headers: { 'Content-Type': 'text/plain' }, content: 'audit-content' }] });
assert.ok(multipartChecked);

// Replace the SDK's transport: no real payment, token or external request.
const originalFetch = globalThis.fetch;
const originalToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-sdk-contract-only';
const requests: { url: URL; options: RequestInit }[] = [];
let duplicate = false, decline = false;
globalThis.fetch = (async (input: any, options: RequestInit = {}) => {
  const url = new URL(String(input)); requests.push({ url, options });
  if (decline) return Response.json({ message: 'validation error', error: 'bad_request', status: 400 }, { status: 400 });
  if (url.pathname.endsWith('/search')) return Response.json({ results: [{ id: 123, external_reference: 'audit-order' }], paging: { total: duplicate ? 2 : 1 } });
  return Response.json({ id: 123, external_reference: 'audit-order', status: 'pending' });
}) as typeof fetch;
try {
  const service = new MercadoPagoService();
  const body = { external_reference: 'audit-order', transaction_amount: 1, payment_method_id: 'pix', payer: { email: 'audit@example.invalid' } };
  assert.equal((await service.createPayment(body, 'audit-idempotency')).id, 123);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(new Headers(requests[0].options.headers).get('X-Idempotency-Key'), 'audit-idempotency');
  assert.deepEqual(JSON.parse(String(requests[0].options.body)), body);
  assert.equal((await service.getPayment('123')).id, 123);
  assert.equal((await service.findPaymentByOrder('audit-order'))?.id, 123);
  assert.equal(requests[2].url.searchParams.get('external_reference'), 'audit-order');
  duplicate = true; await assert.rejects(service.findPaymentByOrder('audit-order'), /Mais de um pagamento/);
  decline = true; await assert.rejects(service.createPayment(body, 'audit-decline'));
} finally {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
  else process.env.MERCADO_PAGO_ACCESS_TOKEN = originalToken;
}
console.log('PASS Firebase modular SDK, gaxios multipart/uuid and Mercado Pago transport contracts');

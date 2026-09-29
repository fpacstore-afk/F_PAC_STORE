import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeRequest } from '../cloudflare/worker';

let assetCalls = 0;
const env = { ASSETS: { fetch: async (_request: Request) => { assetCalls++; return new Response('<html>store</html>'); } } };
const body = '{ "data": {"id":"test-only"}, "action":"payment.updated" }';
const incoming = new Request('https://fpacstore.com.br/api/webhook/mercadopago?data.id=a%2Fb&x=1&x=2', {
  method: 'POST', body,
  headers: { 'content-type': 'application/json', 'x-signature': 'test-signature', 'authorization': 'Bearer test-only', 'x-idempotency-key': 'test-key' },
});
const response = await routeRequest(incoming, env, async (forwarded, options) => {
  assert.equal(forwarded.url, 'https://fpac-store62.web.app/api/webhook/mercadopago?data.id=a%2Fb&x=1&x=2');
  assert.equal(forwarded.method, 'POST');
  assert.equal(await forwarded.text(), body);
  for (const key of ['content-type', 'x-signature', 'authorization', 'x-idempotency-key']) {
    assert.equal(forwarded.headers.get(key), incoming.headers.get(key));
  }
  assert.equal(options.redirect, 'manual');
  assert.equal(options.cf.cacheTtl, 0);
  assert.equal(options.cf.cacheEverything, false);
  return new Response('provider unavailable', { status: 503, headers: { 'retry-after': '10', 'cache-control': 'public, max-age=3600' } });
});
assert.equal(response.status, 503);
assert.equal(await response.text(), 'provider unavailable');
assert.equal(response.headers.get('retry-after'), '10');
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
assert.equal(assetCalls, 0);

for (const path of ['/api', '/api/health', '/api/orders?url=https://example.com']) {
  await routeRequest(new Request(`https://fpacstore.com.br${path}`), env, async request => {
    assert.equal(new URL(request.url).origin, 'https://fpac-store62.web.app');
    assert.equal(request.method, 'GET');
    return Response.json({ status: 'ok' });
  });
}
for (const path of ['/', '/gestao', '/produtos', '/assets/app.js', '/api-other']) {
  const asset = await routeRequest(new Request(`https://fpacstore.com.br${path}`), env, async () => { throw new Error('Must not call API'); });
  assert.equal(await asset.text(), '<html>store</html>');
}
assert.equal(assetCalls, 5);
const failure = await routeRequest(new Request('https://fpacstore.com.br/api/health'), env, async () => { throw new Error('private origin details'); });
assert.equal(failure.status, 502);
assert.equal(failure.headers.get('cache-control'), 'no-store');
assert.ok(!JSON.stringify(await failure.json()).includes('private origin details'));

const config = JSON.parse(readFileSync('wrangler.json', 'utf8'));
assert.equal(config.main, 'cloudflare/worker.ts');
assert.equal(config.assets.not_found_handling, 'single-page-application');
assert.deepEqual(config.assets.run_worker_first, ['/api', '/api/*']);
const excluded = readFileSync('public/.assetsignore', 'utf8');
assert.ok(excluded.includes('server.cjs') && excluded.includes('**/*.map'));
console.log('Cloudflare API routing: payload, auth, origin, cache, errors and asset isolation passed.');

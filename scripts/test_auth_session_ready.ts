import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real API client with an isolated Firebase session and transport.
// No browser credentials, live requests or database writes are used.
const source = readFileSync('src/lib/api.ts', 'utf8').replaceAll('import.meta.env', '({})');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function fixture() {
  let ready!: () => void;
  let fail!: (error: Error) => void;
  const initialization = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject; });
  const auth = {
    currentUser: null as null | { getIdToken: () => Promise<string> },
    authStateReady: () => initialization
  };
  const requests: { url: string; options: RequestInit }[] = [];
  const exports: any = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name: string) => { assert.equal(name, './firebase'); return { auth }; },
    Headers,
    window: { location: { hostname: 'localhost', origin: 'http://localhost:3000' } },
    fetch: async (url: string, options: RequestInit) => {
      requests.push({ url, options });
      return new Response('{}', { status: 200 });
    }
  });
  return { auth, ready, fail, requests, request: exports.authenticatedFetch as (url: string, options?: RequestInit) => Promise<Response> };
}

let checks = 0;
async function check(name: string, run: () => void | Promise<void>) {
  await run(); checks++; console.log('PASS ' + name);
}

await check('direct reload waits for the persisted session, including parallel requests', async () => {
  const f = fixture();
  const headers = new Headers({ 'X-Fixture': 'preserved' });
  const pending = [f.request('/api/shipping/config', { headers }), f.request('/api/admin/product-costs')];
  await Promise.resolve();
  assert.equal(f.requests.length, 0, 'must not send an anonymous request while the session is loading');
  f.auth.currentUser = { getIdToken: async () => 'restored-session-fixture' };
  f.ready();
  await Promise.all(pending);
  assert.equal(f.requests.length, 2);
  for (const request of f.requests) {
    assert.equal(new Headers(request.options.headers).get('Authorization'), 'Bearer restored-session-fixture');
  }
  assert.equal(new Headers(f.requests[0].options.headers).get('X-Fixture'), 'preserved');
  assert.equal(headers.has('Authorization'), false, 'caller headers must not be mutated');
});

await check('guest requests still work after Firebase confirms no session', async () => {
  const f = fixture(); f.ready();
  await f.request('/api/checkout', { method: 'POST', body: '{"fixture":true}' });
  assert.equal(f.requests.length, 1);
  assert.equal(new Headers(f.requests[0].options.headers).has('Authorization'), false);
  assert.equal(f.requests[0].options.method, 'POST');
  assert.equal(f.requests[0].options.body, '{"fixture":true}');
});

await check('failed session initialization never falls back to an anonymous request', async () => {
  const f = fixture(); const pending = f.request('/api/shipping/config');
  f.fail(new Error('fixture initialization failure'));
  await assert.rejects(pending, /fixture initialization failure/);
  assert.equal(f.requests.length, 0);
});

await check('token refresh failure never sends or replays a mutation as a guest', async () => {
  const f = fixture(); f.ready();
  f.auth.currentUser = { getIdToken: async () => { throw new Error('fixture expired session'); } };
  await assert.rejects(f.request('/api/admin/orders', { method: 'POST' }), /fixture expired session/);
  assert.equal(f.requests.length, 0);
});

await check('a request cancelled during restoration is not sent afterwards', async () => {
  const f = fixture(); const controller = new AbortController();
  const pending = f.request('/api/shipping/config', { signal: controller.signal });
  controller.abort(); f.ready();
  await assert.rejects(pending, (error: any) => error.name === 'AbortError');
  assert.equal(f.requests.length, 0);
});

// Evaluate the real Orders effect across session/route states, independently of JSX.
const adminSource = ts.createSourceFile('AdminOrders.tsx', readFileSync('src/pages/AdminOrders.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let shippingEffect: ts.CallExpression | undefined;
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(adminSource) === 'useEffect' && node.arguments[0]?.getText(adminSource).includes('fetchMelhorEnvioConfig()')) {
    assert.equal(shippingEffect, undefined, 'there must be a single shipping configuration effect');
    shippingEffect = node;
  }
  ts.forEachChild(node, visit);
}
visit(adminSource);
assert.ok(shippingEffect, 'Orders shipping configuration effect must exist');
const effect = shippingEffect!.arguments[0].getText(adminSource);
const dependencies = shippingEffect!.arguments[1].getText(adminSource);

await check('Orders loads shipping only after admin session restoration and again after login', () => {
  let calls = 0;
  let previous: any[] | undefined;
  const fetchMelhorEnvioConfig = () => { calls++; };
  function render(authLoading: boolean, user: any, isAdmin: boolean, activeTab: string) {
    const context = { authLoading, user, isAdmin, activeTab, fetchMelhorEnvioConfig };
    const next: any[] = vm.runInNewContext(dependencies, context);
    if (!previous || next.some((value, index) => value !== previous![index])) {
      vm.runInNewContext(`(${effect})()`, context);
    }
    previous = next;
  }
  render(true, null, false, 'orders'); assert.equal(calls, 0);
  render(false, null, false, 'orders'); assert.equal(calls, 0);
  const customer = { uid: 'fixture-customer' };
  render(false, customer, false, 'orders'); assert.equal(calls, 0);
  const admin = { uid: 'fixture-admin' };
  render(true, admin, true, 'orders'); assert.equal(calls, 0);
  render(false, admin, true, 'orders'); assert.equal(calls, 1);
  render(false, admin, true, 'orders'); assert.equal(calls, 1);
  render(false, admin, true, 'dashboard'); assert.equal(calls, 1);
  render(false, admin, true, 'orders'); assert.equal(calls, 2);
  render(false, null, false, 'orders'); assert.equal(calls, 2);
  render(false, { uid: 'fixture-second-admin' }, true, 'orders'); assert.equal(calls, 3);
});

console.log(`${checks} session restoration regressions passed.`);

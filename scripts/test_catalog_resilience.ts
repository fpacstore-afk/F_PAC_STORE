import assert from 'node:assert/strict';
import { createCachedRequest } from '../shared/cachedRequest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { observeHeaderCatalog, type HeaderCatalogState } from '../src/services/headerCatalog';

let checks = 0;
async function check(name: string, run: () => void | Promise<void>) { await run(); checks++; console.log('PASS ' + name); }
const defer = <T>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

await check('slow requests stay shared beyond TTL and cache starts at completion', async () => {
  let time = 0, calls = 0;
  const pending = defer<number>();
  const load = createCachedRequest(() => { calls++; return pending.promise; }, { now: () => time });
  const first = load(); await Promise.resolve();
  time = 150_000;
  assert.equal(load(), first); assert.equal(calls, 1);
  pending.resolve(7); assert.equal(await first, 7);
  time = 260_000; assert.equal(await load(), 7); assert.equal(calls, 1);
  time = 270_000; await load(); assert.equal(calls, 2);
});

await check('outages pause concurrent retries and never return expired stock', async () => {
  let time = 0, calls = 0;
  const load = createCachedRequest(async () => { calls++; if (calls === 2) throw new Error('quota'); return { stock: calls }; }, { now: () => time });
  assert.equal((await load()).stock, 1);
  time = 120_001; await assert.rejects(load(), /quota/);
  const failures = await Promise.allSettled(Array.from({ length: 20 }, () => load()));
  assert.ok(failures.every(r => r.status === 'rejected')); assert.equal(calls, 2);
  time += 30_000; assert.equal((await load()).stock, 3); assert.equal(calls, 3);
});

await check('a synchronously thrown load also respects retry cooldown', async () => {
  let calls = 0;
  const load = createCachedRequest(() => { calls++; throw new Error('offline'); });
  await assert.rejects(load(), /offline/); await assert.rejects(load(), /offline/);
  assert.equal(calls, 1);
});

function fixture() {
  let calls = 0, fail = true, listener: (() => void) | undefined;
  const pending = defer<Response>();
  const exports: any = {};
  const compiled = ts.transpileModule(readFileSync('src/services/publicProducts.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, {
    exports, AbortSignal, Error, Date, Promise, Set,
    require: (name: string) => name.includes('cachedRequest') ? { createCachedRequest } : { getPublicApiUrl: (path: string) => path },
    fetch: () => { calls++; return pending.promise; },
    setInterval: () => 1, clearInterval: () => {},
    document: { visibilityState: 'visible', addEventListener: (_: string, f: () => void) => { listener = f; }, removeEventListener: () => {} },
  });
  return { exports, pending, calls: () => calls };
}

await check('HTTP 503 reaches subscribers as failure without a false empty catalog or immediate retry', async () => {
  const f = fixture(); let next = 0; const errors: Error[] = [];
  const unsubscribe = f.exports.subscribePublicCatalog(() => { next++; }, (error: Error) => errors.push(error));
  f.pending.resolve(new Response('{"products":[],"count":0}', { status: 503 }));
  await assert.rejects(f.exports.fetchPublicCatalog());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(next, 0); assert.equal(errors.length, 1);
  await assert.rejects(f.exports.fetchPublicCatalog()); assert.equal(f.calls(), 1);
  unsubscribe();
});

await check('an actual empty catalog succeeds, and unsubscribed views receive no late update', async () => {
  const f = fixture(); let next = 0;
  const unsubscribe = f.exports.subscribePublicCatalog(() => { next++; });
  unsubscribe();
  f.pending.resolve(new Response('{"products":[],"availability":{}}', { status: 200 }));
  assert.equal((await f.exports.fetchPublicCatalog()).products.length, 0);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(next, 0);
});

await check('header shows loading until real data, then distinguishes empty success from failure', async () => {
  const states: HeaderCatalogState[] = [];
  let next!: (products: any[]) => void;
  let fail!: () => void;
  let stopped = 0;
  const close = observeHeaderCatalog(state => states.push(state), async () => (onNext, onError) => {
    next = onNext; fail = onError; return () => { stopped++; };
  });
  assert.equal(states.at(-1)?.status, 'loading');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.length, 1);
  next([]); assert.deepEqual(states.at(-1), { status: 'ready', products: [] });
  next([{ id: 'shirt' }]); assert.equal(states.at(-1)?.products.length, 1);
  fail(); assert.deepEqual(states.at(-1), { status: 'error', products: [] });
  next([{ id: 'recovered' }]); assert.equal(states.at(-1)?.status, 'ready');
  close(); const count = states.length;
  next([{ id: 'late' }]); fail();
  assert.equal(states.length, count); assert.equal(stopped, 1);
});

await check('closing header during import prevents a late subscription and import errors are recoverable', async () => {
  const states: HeaderCatalogState[] = [];
  const pending = defer<any>(); let subscribed = 0;
  const close = observeHeaderCatalog(state => states.push(state), () => pending.promise);
  close(); pending.resolve(() => { subscribed++; return () => {}; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(subscribed, 0); assert.equal(states.length, 1);
  const failed = observeHeaderCatalog(state => states.push(state), async () => { throw new Error('chunk unavailable'); });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1)?.status, 'error'); failed();
  const reopened = observeHeaderCatalog(state => states.push(state), async () => next => { next([{ id: 'shirt' }]); return () => {}; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1)?.status, 'ready'); reopened();
});

console.log(`${checks} catalog resilience regressions passed.`);

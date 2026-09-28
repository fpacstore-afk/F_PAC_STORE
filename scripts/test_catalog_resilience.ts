import assert from 'node:assert/strict';
import { createCachedRequest } from '../shared/cachedRequest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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

console.log(`${checks} catalog resilience regressions passed.`);

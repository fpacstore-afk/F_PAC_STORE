import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createCachedRequest } from '../shared/cachedRequest';

const compiled = ts.transpileModule(readFileSync('src/services/promotions/getActivePromotion.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(rows: any[] = []) {
  let time = 1_000, calls = 0, fail = false, pending: Promise<void> | undefined;
  const exports: any = {};
  class Clock extends Date { static now() { return time; } }
  vm.runInNewContext(compiled, { exports, Date: Clock, console: { warn() {} }, require(name: string) {
    if (name.includes('cachedRequest')) return { createCachedRequest: (load: any, options: any) => createCachedRequest(load, { ...options, now: () => time }) };
    if (name === 'firebase/firestore') return { collection() {}, query() {}, where() {}, async getDocs() {
      calls++; await pending; if (fail) throw new Error('quota');
      return { docs: rows.map(row => ({ id: row.id, data: () => row })) };
    } };
    return { db: {} };
  } });
  return { get: exports.getActivePromotion, calls: () => calls, at: (value: number) => { time = value; }, fail: (value: boolean) => { fail = value; }, pending: (value: Promise<void>) => { pending = value; } };
}

const empty = fixture();
await Promise.all(Array.from({ length: 20 }, () => empty.get()));
assert.equal(await empty.get(), null); assert.equal(empty.calls(), 1);
empty.at(31_000); await empty.get(); assert.equal(empty.calls(), 2);

const dates = fixture([{ id: 'current', active: true, end_date: new Date(2_000).toISOString() }, { id: 'next', active: true, start_date: new Date(2_001).toISOString(), priority: 10 }]);
assert.equal((await dates.get()).id, 'current');
dates.at(2_001); assert.equal((await dates.get()).id, 'next'); assert.equal(dates.calls(), 1);

const slow = fixture([{ id: 'expired', active: true, end_date: new Date(2_000).toISOString() }]);
let resolve!: () => void; slow.pending(new Promise<void>(done => { resolve = done; }));
const first = slow.get(); await Promise.resolve(); slow.at(32_000); const second = slow.get();
resolve(); assert.equal(await first, null); assert.equal(await second, null); assert.equal(slow.calls(), 1);

const outage = fixture(); outage.fail(true);
await Promise.all(Array.from({ length: 20 }, () => outage.get()));
await outage.get(); assert.equal(outage.calls(), 1);
outage.at(31_000); outage.fail(false); assert.equal(await outage.get(), null); assert.equal(outage.calls(), 2);

const priority = fixture([{ id: 'a', active: true, priority: 1 }, { id: 'b', active: true, priority: 1 }, { id: 'c', active: false, priority: 100 }]);
assert.equal((await priority.get()).id, 'b');
console.log('PASS promotion cache: shared and empty reads, date boundaries, slow reads, outage cooldown and priority');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real AuthProvider effect with isolated delayed reads and sessions.
const source = ts.createSourceFile('AuthContext.tsx', readFileSync('src/context/AuthContext.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect: ts.Node | undefined;
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('onAuthStateChanged')) effect = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(source); assert.ok(effect);
const compiled = ts.transpileModule(`const start = ${effect!.getText(source)}; start();`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const defer = () => { let resolve!: (data: any) => void; let reject!: (error: Error) => void; const promise = new Promise<any>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const snapshot = (name: string) => ({ exists: () => true, data: () => ({ name, email: name + '@example.invalid' }) });
function fixture() {
  let authChanged!: (user: any) => Promise<void>;
  let profile: any, loading = true, listeners = 0, writes = 0;
  const reads = new Map<string, ReturnType<typeof defer>>();
  const timers = new Set<any>();
  const cleanup = vm.runInNewContext(compiled, {
    auth: {}, db: {}, console: { warn: () => {} },
    onAuthStateChanged: (_: any, cb: any) => { authChanged = cb; return () => {}; },
    setUser: () => {}, setProfile: (p: any) => { profile = p; }, setLoading: (v: boolean) => { loading = v; },
    doc: (_: any, __: string, id: string) => id,
    getDoc: (id: string) => { const pending = defer(); reads.set(id, pending); return pending.promise; },
    setDoc: async () => { writes++; },
    onSnapshot: (_: any, __: any) => { listeners++; return () => { listeners--; }; },
    setTimeout: (fn: any) => { timers.add(fn); return fn; }, clearTimeout: (fn: any) => timers.delete(fn),
  });
  return { change: (uid: string | null) => authChanged(uid ? { uid, displayName: uid, email: uid + '@example.invalid' } : null), reads, cleanup, state: () => ({ profile, loading, listeners, writes, timers: timers.size }) };
}
let checks = 0;
async function check(name: string, run: () => Promise<void>) { await run(); checks++; console.log('PASS ' + name); }
await check('logout during a pending read cannot restore the previous profile or listener', async () => {
  const f = fixture(); const old = f.change('old'); await f.change(null);
  f.reads.get('old')!.resolve(snapshot('private-old')); await old;
  assert.equal(f.state().profile, null); assert.equal(f.state().listeners, 0); assert.equal(f.state().timers, 0); f.cleanup();
});
await check('a late failure from the old account cannot overwrite the new account', async () => {
  const f = fixture(); const old = f.change('old'); const current = f.change('new');
  f.reads.get('new')!.resolve(snapshot('new')); await current;
  f.reads.get('old')!.reject(new Error('quota')); await old;
  assert.equal(f.state().profile.name, 'new'); assert.equal(f.state().listeners, 1);
  f.cleanup(); assert.equal(f.state().listeners, 0); assert.equal(f.state().timers, 0);
});
await check('switching accounts clears the previous profile immediately', async () => {
  const f = fixture(); const first = f.change('old'); f.reads.get('old')!.resolve(snapshot('old')); await first;
  const second = f.change('new'); assert.equal(f.state().profile, null); assert.equal(f.state().listeners, 0);
  f.reads.get('new')!.reject(new Error('quota')); await second;
  assert.equal(f.state().profile.name, 'new'); assert.equal(f.state().loading, false); assert.equal(f.state().timers, 0); f.cleanup();
});
await check('unmount cancels state updates and prevents creation of a missing old profile', async () => {
  const f = fixture(); const pending = f.change('old'); f.cleanup();
  f.reads.get('old')!.resolve({ exists: () => false }); await pending;
  assert.equal(f.state().writes, 0); assert.equal(f.state().listeners, 0); assert.equal(f.state().timers, 0);
});
console.log(`${checks} profile lifecycle regressions passed.`);

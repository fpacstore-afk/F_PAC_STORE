import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { denyPrivateFiles } from '../server/middleware/privateFiles.ts';
import { inspectPublicBuild } from './verify_public_build.ts';

const directory = mkdtempSync(path.join(os.tmpdir(), 'fpac-public-build-'));
try {
  mkdirSync(path.join(directory, 'assets'));
  writeFileSync(path.join(directory, 'assets/app.js'), 'console.log("storefront")');
  writeFileSync(path.join(directory, 'index.html'), '<html>storefront</html>');
  assert.deepEqual(inspectPublicBuild(directory), []);
  for (const name of ['server.cjs', 'app.js.map', '.env', 'private.pem', 'server.ts']) {
    writeFileSync(path.join(directory, name), 'private-fixture');
    assert.ok(inspectPublicBuild(directory).some(failure => failure.startsWith(name+':')));
  }
  writeFileSync(path.join(directory, 'assets/leak.js'), 'const key = "-----BEGIN '+'PRIVATE KEY-----";');
  const failures = inspectPublicBuild(directory);
  assert.ok(failures.includes('assets/leak.js: credential signature'));
  assert.ok(failures.every(failure => !failure.includes('private-fixture')));

  // An accidental future file copy must still not expose artifacts through the direct runtime.
  const app = express(); app.use(denyPrivateFiles); app.use(express.static(directory));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for (const requestPath of ['/server.cjs', '/app.js.map', '/.env', '/private.pem', '/server.ts', '/%73erver.cjs', '/build-server/server.cjs', '/scripts/internal.ts']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(base+requestPath, { method });
        assert.equal(response.status, 404, `${method} ${requestPath}`);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(await response.text(), '');
      }
    }
    assert.equal(await (await fetch(base+'/assets/app.js')).text(), 'console.log("storefront")');
    assert.equal((await fetch(base+'/')).status, 200);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }

  const pkg = JSON.parse(readFileSync('package.json','utf8'));
  assert.ok(pkg.scripts.start.includes('build-server/server.cjs'));
  assert.ok(pkg.scripts.build.includes('--outfile=build-server/server.cjs'));
  assert.ok(pkg.scripts.build.includes('npm run verify:public-build'));
  console.log('PASS public build rejects private artifacts and recognized credentials; direct runtime blocks accidental copies while storefront assets remain accessible.');
} finally { rmSync(directory, { recursive:true, force:true }); }

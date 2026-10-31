import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { loadConfigFromFile } from 'vite';
import { inspectPublicBuild } from './verify_public_build.ts';
import { assertSafeClientEnvironment } from './clientCredentialSafety.ts';
import { redactLogText, sanitizeLogData } from '../server/utils/logger.ts';
import { authenticateAdmin, resetAuthForTesting, setAuthDbForTesting, setAuthTokenVerifierForTesting } from '../server/middleware/auth.middleware.ts';

const fixture = 'fixture-private-credential-20261031';
for (const name of ['VITE_MERCADO_PAGO_ACCESS_TOKEN', 'VITE_RESEND_API_KEY', 'VITE_FIREBASE_SERVICE_ACCOUNT', 'VITE_ADMIN_API_KEY', 'VITE_INSTAGRAM_ACCESS_TOKEN', 'VITE_OPENAI_API_KEY']) {
  assert.throws(() => assertSafeClientEnvironment({ [name]: fixture }), error =>
    error instanceof Error && error.message.includes(name) && !error.message.includes(fixture));
}
assertSafeClientEnvironment({ VITE_FIREBASE_API_KEY: 'public-firebase-key', VITE_MERCADO_PAGO_PUBLIC_KEY: 'public-payment-key', VITE_PUBLIC_API_ORIGIN: 'https://example.invalid' });
const previousPublicToken = process.env.VITE_MERCADO_PAGO_ACCESS_TOKEN;
try {
  process.env.VITE_MERCADO_PAGO_ACCESS_TOKEN = fixture;
  await assert.rejects(loadConfigFromFile({ command: 'build', mode: 'production' }, path.resolve('vite.config.ts')),
    error => error instanceof Error && error.message.includes('VITE_MERCADO_PAGO_ACCESS_TOKEN') && !error.message.includes(fixture));
} finally {
  if (previousPublicToken === undefined) delete process.env.VITE_MERCADO_PAGO_ACCESS_TOKEN;
  else process.env.VITE_MERCADO_PAGO_ACCESS_TOKEN = previousPublicToken;
}

const directory = mkdtempSync(path.join(os.tmpdir(), 'fpac-reel-security-'));
try {
  mkdirSync(path.join(directory, 'assets'));
  const asset = path.join(directory, 'assets/app.js');
  for (const secret of [fixture, 'fixture with spaces/and+symbols=20261031', 'fixture\nprivate-service-account-line-20261031']) {
    const environment = { MERCADO_PAGO_ACCESS_TOKEN: secret };
    for (const encoded of [secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret)]) {
      writeFileSync(asset, encoded);
      assert.deepEqual(inspectPublicBuild(directory, environment), ['assets/app.js: credential signature']);
    }
  }
  for (const signature of ['sk-proj-' + 'A'.repeat(40), 'AKIA' + 'A'.repeat(16), '-----BEGIN ENCRYPTED ' + 'PRIVATE KEY-----']) {
    writeFileSync(asset, signature);
    assert.deepEqual(inspectPublicBuild(directory, {}), ['assets/app.js: credential signature']);
  }
  writeFileSync(asset, 'const firebasePublicKey="public-firebase-key";');
  assert.deepEqual(inspectPublicBuild(directory, { VITE_FIREBASE_API_KEY: 'public-firebase-key' }), []);
} finally { rmSync(directory, { recursive: true, force: true }); }

for (const name of ['x-admin-api-key', 'x-api-key', 'x-sync-secret', 'x-tracking-token', 'set-cookie', 'refreshToken', 'FIREBASE_SERVICE_ACCOUNT']) {
  assert.doesNotMatch(JSON.stringify(sanitizeLogData({ headers: { [name]: fixture }, message: `${name}: "${fixture}"` })), /fixture-private/);
  assert.ok(!redactLogText(`https://example.invalid?${encodeURIComponent(name)}=${fixture}&page=2`).includes(fixture));
  assert.ok(!redactLogText(`https://example.invalid?${name.replace(/-/g, '%2D')}=${fixture}`).includes(fixture));
}
for (const text of [`Authorization: Bearer ${fixture}`, `Authorization: Basic ${Buffer.from(fixture).toString('base64')}`, `Cookie: session=${fixture}; other=${fixture}`, `Set-Cookie: session=${fixture}; Path=/; Secure`, `-----BEGIN PRIVATE KEY-----\n${fixture}\n-----END PRIVATE KEY-----`]) {
  const sanitized = redactLogText(text);
  assert.ok(!sanitized.includes(fixture));
  assert.ok(!sanitized.includes(Buffer.from(fixture).toString('base64')));
}
assert.equal(redactLogText('https://example.invalid/products?page=2&size=M'), 'https://example.invalid/products?page=2&size=M');

const previousAdminKey = process.env.ADMIN_API_KEY;
process.env.ADMIN_API_KEY = fixture;
setAuthDbForTesting({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) });
setAuthTokenVerifierForTesting(async token => {
  if (token === 'valid-admin') return { uid: 'fixture-admin', admin: true } as any;
  if (token === 'customer') return { uid: 'fixture-customer' } as any;
  throw new Error('invalid fixture');
});
const app = express();
app.get('/admin', authenticateAdmin, (_req, res) => res.json({ internal: true }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
try {
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const cases = [
    { headers: {}, status: 401 },
    { headers: { Authorization: 'Bearer invalid' }, status: 401 },
    { headers: { Authorization: 'Bearer customer' }, status: 403 },
    { headers: { Authorization: 'Bearer valid-admin' }, status: 200 },
    { headers: { 'x-admin-api-key': fixture }, status: 200 },
  ];
  for (const scenario of cases) {
    const response = await fetch(base + '/admin', { headers: scenario.headers });
    assert.equal(response.status, scenario.status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const vary = response.headers.get('vary')!.toLowerCase();
    for (const header of ['authorization', 'x-admin-api-key', 'x-api-key', 'x-sync-secret']) assert.ok(vary.includes(header));
    if (scenario.status !== 200) assert.ok(!(await response.text()).includes('internal'));
  }
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  resetAuthForTesting();
  if (previousAdminKey === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = previousAdminKey;
}
console.log('PASS real Vite configuration rejects public secret variables; public artifacts reject private values; logs redact credential variants; administrative data and access failures are never cached.');

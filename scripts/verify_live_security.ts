const base = String(process.env.PUBLIC_API_BASE_URL || 'https://fpac-store62.web.app').replace(/\/$/, '');
const strict = process.env.REQUIRE_PRIVATE_FILE_404 === 'true';
async function request(route: string) {
  return fetch(base+route, { redirect:'error', signal:AbortSignal.timeout(20_000) });
}

for (const route of ['/server.cjs', '/server.cjs.map', '/build-server/server.cjs', '/.env']) {
  const response = await request(route);
  const denied = [403,404].includes(response.status);
  const spaFallback = !strict && response.status === 200 && response.headers.get('content-type')?.includes('text/html');
  await response.body?.cancel();
  if (!denied && !spaFallback) throw new Error(`Private artifact check failed (${route}, ${response.status}); response content was not logged.`);
}

const protectedRoute = await request('/api/admin/garment-models/range-preview');
await protectedRoute.body?.cancel();
if (![401,403].includes(protectedRoute.status)) throw new Error(`Administrative endpoint did not deny anonymous access (${protectedRoute.status}).`);

const missing = await request('/api/security-check-unknown?token=fpac-public-test&email=fixture@example.invalid');
if (missing.status !== 404 || missing.headers.get('cache-control') !== 'no-store') throw new Error('Unknown API route must be an uncached 404.');
const body = await missing.text();
if (body.includes('fpac-public-test') || body.includes('fixture@') || body.includes('security-check-unknown')) throw new Error('API error reflected request data.');
if (JSON.parse(body).error !== 'Rota de API não encontrada.') throw new Error('Unexpected API error response.');
for (const header of ['content-security-policy','strict-transport-security','x-content-type-options','referrer-policy','permissions-policy']) {
  if (!missing.headers.get(header)) throw new Error(`Missing production security header: ${header}`);
}
console.log(`PASS private artifacts, anonymous admin denial, minimal API errors and security headers through ${base}`);

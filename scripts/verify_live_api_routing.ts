#!/usr/bin/env node

const baseUrl = String(process.env.PUBLIC_API_BASE_URL || 'https://fpac-store62.web.app').replace(/\/$/, '');

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000)
  });
  const body = await response.text();
  return { response, body };
}

const health = await request('/api/health');
if (!health.response.ok || !health.response.headers.get('content-type')?.includes('application/json')) {
  throw new Error(`Public health endpoint is not reaching the API (${health.response.status}).`);
}
const healthPayload = JSON.parse(health.body);
if (healthPayload?.status !== 'ok') throw new Error('Public health endpoint returned an invalid payload.');

const webhook = await request('/api/webhook/mercadopago', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}'
});
if (webhook.response.status !== 200 || webhook.body.trim() !== 'OK (Ignored - No ID)') {
  throw new Error(`Mercado Pago webhook route is not reaching the API (${webhook.response.status}).`);
}

console.log(`PASS public API and Mercado Pago webhook routing through ${baseUrl}`);

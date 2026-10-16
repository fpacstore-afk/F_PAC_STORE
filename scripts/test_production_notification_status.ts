import assert from 'node:assert/strict';
import { getStageNotificationView, isNotificationSettingsSnapshot } from '../shared/productionNotificationStatus';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';

const settings = {
  whatsappEnabled: false, emailEnabled: true, activeStages: { ready: true },
  templates: { ready: 'Mensagem {{numero_pedido}}' },
  integration: { whatsappConfigured: true, emailConfigured: true }
};
const order = {
  id: 'TEST-NOTICE-STATUS', customerPhone: '(47) 99746-5602', customerEmail: 'customer@example.invalid',
  sentStageNotifications: { ready: { whatsappSent: false, emailSent: true, whatsappStatus: 'Desativado', emailStatus: 'Enviado' } }
};
const view = (overrides: any = {}) => getStageNotificationView({ order, stage: 'ready', settings, ...overrides });

assert.equal(view().whatsapp.kind, 'manual');
assert.equal(view().email.kind, 'sent');
assert.equal(view().canRetry, false, 'manual WhatsApp must not create a pending automatic notice');
assert.equal(view().canOpenWhatsApp, true);

assert.equal(view({ settings: null }).email.kind, 'sent', 'keep a recorded receipt while settings load');
assert.equal(view({ settings: null }).canRetry, false);
assert.equal(view({ settings: null }).canOpenWhatsApp, false);
assert.equal(isNotificationSettingsSnapshot(settings), true);
assert.equal(isNotificationSettingsSnapshot({ ...settings, integration: null }), false);
assert.equal(isNotificationSettingsSnapshot({ ...settings, activeStages: [] }), false);

let changed = view({ settings: { ...settings, whatsappEnabled: true } });
assert.deepEqual(changed.retryChannels, { whatsapp: true, email: false }, 'enabling automation makes the previously disabled channel eligible');
changed = view({ settings: { ...settings, whatsappEnabled: true, integration: { whatsappConfigured: false, emailConfigured: true } } });
assert.equal(changed.whatsapp.kind, 'unconfigured');
assert.equal(changed.canRetry, false);
assert.equal(changed.canOpenWhatsApp, true);

const missingContactOrder = { id: 'TEST-MISSING', customerEmail: '', customerPhone: '', sentStageNotifications: { ready: { emailStatus: 'Sem E-mail' } } };
assert.equal(view({ order: missingContactOrder }).email.kind, 'missing_contact');
assert.equal(view({ order: missingContactOrder }).canRetry, false);
assert.equal(view({ order: { ...missingContactOrder, customerEmail: 'fixed@example.invalid' } }).email.canRetry, true, 'correcting a contact must clear a historical missing-contact block');
assert.equal(view({ order: { ...missingContactOrder, customerEmail: 'invalid', customerPhone: '123' } }).canOpenWhatsApp, false);
assert.equal(view({ order: { ...missingContactOrder, customerEmail: 'invalid' } }).canRetry, false);

assert.equal(view({ settings: { ...settings, activeStages: { ready: false } } }).whatsapp.kind, 'disabled');
assert.equal(view({ settings: { ...settings, activeStages: { ready: false } } }).canRetry, false);
assert.equal(view({ order: missingContactOrder, settings: { ...settings, emailEnabled: false } }).email.kind, 'disabled');

const failedOrder = { ...order, sentStageNotifications: { ready: { whatsappSent: false, emailSent: false, emailStatus: 'Erro' } } };
assert.equal(view({ order: failedOrder }).email.kind, 'failed');
assert.deepEqual(view({ order: failedOrder }).retryChannels, { whatsapp: false, email: true });
assert.equal(view({ order: failedOrder, attempt: { orderId: 'ANOTHER', stage: 'ready', data: { emailSent: true } } }).email.kind, 'failed');
assert.equal(view({ order: failedOrder, attempt: { orderId: order.id, stage: 'estamparia', data: { emailSent: true } } }).email.kind, 'failed');
assert.equal(view({ order: failedOrder, attempt: { orderId: order.id, stage: 'ready', data: { emailSent: true } } }).email.kind, 'sent');
assert.equal(view({ attempt: { orderId: order.id, stage: 'ready', data: { emailSent: false, emailStatus: 'Erro' } } }).email.kind, 'sent', 'a stale failed response must not erase a persisted success');

const legacyOrder = { ...order, sentStageNotifications: {}, notificationLogs: [{ stageId: 'ready', message: 'Avisos do pedido #123: WhatsApp Desativado; e-mail Enviado' }] };
assert.equal(view({ order: legacyOrder }).email.kind, 'sent', 'historical confirmed sends must not be retried');
assert.equal(view({ order: { ...legacyOrder, notificationLogs: [{ stageId: 'estamparia', emailSent: true }] } }).email.kind, 'unsent');

const leased = { ...failedOrder, sentStageNotifications: { ready: { leaseUntil: 10001, emailStatus: 'Erro' } } };
assert.equal(view({ order: leased, now: 10000 }).email.kind, 'sending');
assert.equal(view({ order: leased, now: 10000 }).canRetry, false);
assert.equal(view({ order: leased, now: 10002 }).email.canRetry, true);

const db = requireIsolatedTestDb();
const { saveProductionNotificationSettings } = await import('../server/services/productionNotification.service');
const { triggerProductionStageNotification } = await import('../server/controllers/automation.controller');
const response = () => ({ statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } });
await saveProductionNotificationSettings({ whatsappEnabled: true, emailEnabled: true, activeStages: { ready: true } });
process.env.RESEND_API_KEY = 're_isolated_test';
process.env.EVOLUTION_API_URL = 'https://whatsapp.invalid';
process.env.EVOLUTION_API_KEY = 'isolated-test';
let emails = 0, whatsapps = 0;
globalThis.fetch = async (input: any) => {
  assert.match(String(input), /^https:\/\/api\.resend\.com\//);
  emails++;
  return new Response(JSON.stringify({ id: 'fake-notice-email' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const { default: axios } = await import('axios');
axios.defaults.adapter = async config => {
  assert.match(config.url!, /^https:\/\/whatsapp\.invalid\//);
  whatsapps++;
  return { status: 201, statusText: 'Created', data: { key: { id: 'fake-notice-whatsapp' } }, headers: {}, config };
};
await db.collection('orders').doc(order.id).set({ customerPhone: order.customerPhone, customerEmail: order.customerEmail });
let res = response();
await triggerProductionStageNotification({ body: { orderId: order.id, newStageId: 'ready', channels: { email: true } } } as any, res as any);
assert.equal(res.statusCode, 200);
assert.equal(res.body.emailSent, true);
assert.equal(res.body.whatsappSent, false);
assert.deepEqual([emails, whatsapps], [1, 0], 'an email-only retry must not send WhatsApp');
res = response();
await triggerProductionStageNotification({ body: { orderId: order.id, newStageId: 'ready', channels: { whatsapp: true, email: false } } } as any, res as any);
assert.equal(res.statusCode, 200);
assert.equal(res.body.whatsappSent, true);
assert.equal(res.body.emailSent, true);
assert.deepEqual([emails, whatsapps], [1, 1], 'completed email must remain confirmed during a WhatsApp-only retry');
res = response();
await triggerProductionStageNotification({ body: { orderId: order.id, newStageId: 'ready', channels: { whatsapp: true, email: true } } } as any, res as any);
assert.deepEqual([emails, whatsapps], [1, 1], 'retrying completed channels must not send again');
for (const channels of [null, [], {}, { whatsapp: false, email: false }, { email: 'true' }, { sms: true }]) {
  res = response();
  await triggerProductionStageNotification({ body: { orderId: order.id, newStageId: 'ready', channels } } as any, res as any);
  assert.equal(res.statusCode, 400);
}
assert.deepEqual([emails, whatsapps], [1, 1], 'invalid channel selections must have no side effects');
console.log('PASS notification status: manual mode, current settings/contact changes, receipts, failures, leases, stale attempts, channel-specific retries and no duplicate sends. Providers and database are isolated mocks.');

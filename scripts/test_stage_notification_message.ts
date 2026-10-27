import assert from 'node:assert/strict';
import { DEFAULT_STAGE_TEMPLATES } from '../src/constants/notificationTemplates';
import { resolveProductionStageMessage } from '../src/lib/productionStageMessage';
import { renderStageTemplate as renderServerStageTemplate } from '../server/services/productionNotification.service';

const order = {
  id: 'MANUAL-123',
  customerName: 'Cliente Teste',
  items: [{ quantity: 15, name: 'Camisa polo', color: 'Azul', size: 'XG', stampName: 'Logo da empresa' }],
  notificationLogs: [{ message: '💳 AGUARDANDO PAGAMENTO' }]
};

const productionMessage = resolveProductionStageMessage('estamparia', order, undefined);
assert.match(productionMessage, /Em estamparia/);
assert.doesNotMatch(productionMessage, /AGUARDANDO PAGAMENTO/);

const orderReceived = resolveProductionStageMessage('received', order, undefined);
assert.match(orderReceived, /Item: 15x Camisa polo/);
assert.doesNotMatch(orderReceived, /\{\{resumo_itens\}\}|Estampa: Logo da empresa/);
assert.match(orderReceived, /Acompanhe: https:\/\/fpacstore\.com\.br\/tracking/);

const secureUrl = 'https://fpacstore.com.br/order/MANUAL-123?token=private-access-key';
const sentMessage = renderServerStageTemplate(DEFAULT_STAGE_TEMPLATES.received, {
  ...order,
  publicTrackingUrl: secureUrl,
});
assert.match(sentMessage, /Item: 15x Camisa polo/);
assert.ok(sentMessage.includes(secureUrl), 'sent notifications must include a one-click secure tracking link');
assert.match(renderServerStageTemplate('Itens: {{produto}}', order), /Cor: Azul · Tam\.: XG · Estampa: Logo da empresa/, 'custom detailed templates remain supported');
const legacyLinkMessage = renderServerStageTemplate(
  'Acompanhe: https://www.fpacstore.com.br/#/order/{{numero_pedido}}',
  { ...order, publicTrackingUrl: secureUrl },
);
assert.equal(legacyLinkMessage, `Acompanhe: ${secureUrl}`, 'legacy order-number links must be upgraded to secure direct links');

const configured = resolveProductionStageMessage('estamparia', order, undefined, {
  ...DEFAULT_STAGE_TEMPLATES,
  estamparia: 'Etapa personalizada: {{numero_pedido}}'
});
assert.equal(configured, 'Etapa personalizada: MANUAL-123');

const sentForCurrentStage = resolveProductionStageMessage(
  'estamparia',
  order,
  { lastMessage: 'Mensagem enviada para estamparia' }
);
assert.equal(sentForCurrentStage, 'Mensagem enviada para estamparia');

console.log('Stage notification message regression passed.');

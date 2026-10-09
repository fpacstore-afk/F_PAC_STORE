import assert from 'node:assert/strict';
import { DEFAULT_STAGE_TEMPLATES } from '../src/constants/notificationTemplates';
import { resolveProductionStageMessage } from '../src/lib/productionStageMessage';

const order = {
  id: 'MANUAL-123',
  customerName: 'Cliente Teste',
  notificationLogs: [{ message: '💳 AGUARDANDO PAGAMENTO' }]
};

const productionMessage = resolveProductionStageMessage('estamparia', order, undefined);
assert.match(productionMessage, /ESTAMPARIA E IMPRESSÃO/);
assert.doesNotMatch(productionMessage, /AGUARDANDO PAGAMENTO/);

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

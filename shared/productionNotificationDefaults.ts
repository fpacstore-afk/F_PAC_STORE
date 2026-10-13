export interface ProductionNotificationConfig {
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  allowResendOnStageReentry: boolean;
  activeStages: Record<string, boolean>;
  templates: Record<string, string>;
}

const footer = `━━━━━━━━━━━━━━━━━
🌐 www.fpacstore.com.br
📸 @f_pac_store
💬 WhatsApp: (47) 99746-5602

🛡️ Mensagem automática de acompanhamento do pedido.`;

const template = (icon: string, title: string, body: string) => `F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE!
━━━━━━━━━━━━━━━━━

Olá, *{{nome_cliente}}*! 👋

${icon} *${title}*

${body}

Pedido: *#{{numero_pedido}}*
Itens: {{produto}}

👉 Acompanhe em:
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

${footer}`;

const separation = template('✂️', 'SEPARAÇÃO E PREPARAÇÃO', 'Nossa equipe está separando e preparando os itens do seu pedido.');
const printing = template('🎨', 'ESTAMPARIA E IMPRESSÃO', 'Sua arte entrou na etapa de impressão e aplicação. Estamos cuidando de cada detalhe.');
const packaging = template('🔍', 'CONTROLE DE QUALIDADE E EMBALAGEM', 'Seu pedido está passando pela conferência final de acabamento antes de ser embalado.');
const ready = template('📦', 'PRONTO PARA ENTREGA OU RETIRADA', 'Seu pedido está produzido, conferido e embalado. Vamos seguir com a entrega ou retirada conforme combinado.');
const completed = template('✅', 'PRODUÇÃO CONCLUÍDA', 'A produção do seu pedido foi concluída com sucesso. Obrigado por escolher a F PAC STORE!');

export const DEFAULT_STAGE_TEMPLATES: Record<string, string> = {
  received: template('✅', 'PEDIDO RECEBIDO', 'Recebemos seu pedido e registramos todos os detalhes. Você será avisado a cada avanço.'),
  payment_pending: template('💳', 'AGUARDANDO PAGAMENTO', 'O pagamento do seu pedido ainda está pendente. A produção e a entrega seguem o combinado com nossa equipe.'),
  payment_approved: template('✅', 'PAGAMENTO CONFIRMADO', 'Registramos a confirmação do pagamento do seu pedido.'),
  separacao_corte: separation,
  estamparia: printing,
  embalagem: packaging,
  ready,
  shipped: `F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE!
━━━━━━━━━━━━━━━━━

Olá, *{{nome_cliente}}*! 👋

🚚 *PEDIDO ENVIADO*

Seu pedido *#{{numero_pedido}}* está a caminho.

Código: *{{codigo_rastreio}}*
Transportadora: *{{transportadora}}*
Rastreamento: {{link_rastreio}}

${footer}`,
  delivered: template('🎉', 'PEDIDO ENTREGUE', 'A entrega foi confirmada. Esperamos que seu novo produto represente sua identidade. Marque @f_pac_store no seu look!'),
  completed,
  cancelled: template('⚠️', 'PEDIDO CANCELADO', 'O pedido foi cancelado. Se precisar de ajuda ou desejar refazer a compra, fale com nossa equipe.'),
  aguardando_impressao: separation,
  estampa_finalizada: printing,
  controle_qualidade: packaging,
  pronto_envio: ready,
};

export const DEFAULT_NOTIFICATION_CONFIG: ProductionNotificationConfig = {
  whatsappEnabled: true,
  emailEnabled: true,
  allowResendOnStageReentry: false,
  activeStages: Object.fromEntries(Object.keys(DEFAULT_STAGE_TEMPLATES).map(stage => [stage, stage !== 'cancelled'])),
  templates: { ...DEFAULT_STAGE_TEMPLATES },
};

// Upgrade only exact historical defaults. Merchant-written templates remain intact.
export function resolveSavedStageTemplates(saved: Record<string, string> = {}) {
  const templates = { ...DEFAULT_STAGE_TEMPLATES, ...saved };
  const oldSeparation = separation.replace('Nossa equipe está separando e preparando', 'O pagamento foi confirmado e nossa equipe já está separando e preparando');
  for (const key of ['separacao_corte', 'aguardando_impressao', 'payment_approved']) {
    if (templates[key] === oldSeparation) templates[key] = DEFAULT_STAGE_TEMPLATES[key];
  }
  const oldPending = DEFAULT_STAGE_TEMPLATES.payment_pending.replace('O pagamento do seu pedido ainda está pendente. A produção e a entrega seguem o combinado com nossa equipe.', 'Seu pedido foi criado e aguarda a confirmação do pagamento para entrar em produção.');
  if (templates.payment_pending === oldPending) templates.payment_pending = DEFAULT_STAGE_TEMPLATES.payment_pending;
  const oldReady = ready.replace('PRONTO PARA ENTREGA OU RETIRADA', 'PRONTO PARA ENVIO').replace('Vamos seguir com a entrega ou retirada conforme combinado.', 'A próxima atualização será a postagem ou retirada.');
  for (const key of ['ready', 'pronto_envio']) if (templates[key] === oldReady) templates[key] = DEFAULT_STAGE_TEMPLATES[key];
  return templates;
}

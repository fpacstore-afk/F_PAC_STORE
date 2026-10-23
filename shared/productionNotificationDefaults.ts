export interface ProductionNotificationConfig {
  testEmail?: string;
  testPhone?: string;
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
Itens do pedido:
{{produto}}

👉 Acompanhe o pedido: {{link_acompanhamento}}

${footer}`;

const separation = template('✂️', 'SEPARAÇÃO E PREPARAÇÃO', 'Nossa equipe está separando e preparando os itens do seu pedido.');
const printing = template('🎨', 'ESTAMPARIA E IMPRESSÃO', 'Sua arte entrou na etapa de impressão e aplicação. Estamos cuidando de cada detalhe.');
const packaging = template('🔍', 'CONTROLE DE QUALIDADE E EMBALAGEM', 'Seu pedido está passando pela conferência final de acabamento antes de ser embalado.');
const ready = template('📦', 'PRONTO PARA ENTREGA OU RETIRADA', 'Seu pedido está produzido, conferido e embalado. Vamos seguir com a entrega ou retirada conforme combinado.');
const completed = template('✅', 'PRODUÇÃO CONCLUÍDA', 'A produção do seu pedido foi concluída com sucesso. Obrigado por escolher a F PAC STORE!');

const PREVIOUS_STAGE_TEMPLATES: Record<string, string> = {
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
Status do pedido: {{link_acompanhamento}}

${footer}`,
  delivered: template('🎉', 'PEDIDO ENTREGUE', 'A entrega foi confirmada. Esperamos que seu novo produto represente sua identidade. Marque @f_pac_store no seu look!'),
  completed,
  cancelled: template('⚠️', 'PEDIDO CANCELADO', 'O pedido foi cancelado. Se precisar de ajuda ou desejar refazer a compra, fale com nossa equipe.'),
  aguardando_impressao: separation,
  estampa_finalizada: printing,
  controle_qualidade: packaging,
  pronto_envio: ready,
};

const revisedTemplate = (icon: string, title: string, body: string) => template(icon, title, body)
  .replace('🛡️ Mensagem automática de acompanhamento do pedido.', 'Acompanhamento do pedido • F PAC STORE');

export const DEFAULT_STAGE_TEMPLATES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(PREVIOUS_STAGE_TEMPLATES).map(([key, value]) => [key, value
    .replace('https://www.fpacstore.com.br/#/order/{{numero_pedido}}', 'https://fpacstore.com.br/tracking')
    .replace('🛡️ Mensagem automática de acompanhamento do pedido.', 'Acompanhamento do pedido • F PAC STORE')])),
  received: revisedTemplate('✅', 'PEDIDO RECEBIDO', 'Recebemos seu pedido e registramos os detalhes. O pagamento, a produção e a entrega serão atualizados conforme cada etapa for confirmada.'),
  payment_pending: revisedTemplate('💳', 'AGUARDANDO PAGAMENTO', 'O pagamento do seu pedido ainda está pendente. A produção e a entrega seguem o combinado com nossa equipe.'),
  payment_approved: revisedTemplate('✅', 'PAGAMENTO CONFIRMADO', 'Registramos a confirmação do pagamento do seu pedido. Acompanhe a produção e a entrega pelas próximas atualizações.'),
  payment_rejected: revisedTemplate('💳', 'PAGAMENTO NÃO APROVADO', 'O pagamento não foi aprovado. Confira a forma de pagamento ou fale com nossa equipe para saber como continuar.'),
  payment_refunded: revisedTemplate('💳', 'ESTORNO REGISTRADO', 'Foi registrado um estorno no pagamento do seu pedido. O prazo de disponibilidade do valor depende da forma de pagamento e da instituição financeira.'),
  separacao_corte: revisedTemplate('✂️', 'SEPARAÇÃO E PREPARAÇÃO', 'Nossa equipe está separando e preparando os itens do seu pedido. O prazo de entrega ou retirada segue o combinado com nossa equipe.'),
  estamparia: revisedTemplate('🎨', 'ESTAMPARIA E IMPRESSÃO', 'Seu pedido está na etapa de impressão e aplicação das artes, conforme os detalhes aprovados. Depois, seguirá para a conferência de acabamento.'),
  embalagem: revisedTemplate('🔍', 'CONTROLE DE QUALIDADE E EMBALAGEM', 'Estamos conferindo o acabamento e preparando a embalagem do seu pedido. Avisaremos quando estiver pronto para entrega ou retirada.'),
  ready: revisedTemplate('📦', 'PRONTO PARA ENTREGA OU RETIRADA', 'Seu pedido está produzido, conferido e embalado. A entrega ou retirada será realizada conforme combinado. Acompanhe a confirmação dessa etapa nas próximas atualizações.'),
  completed: revisedTemplate('✅', 'PRODUÇÃO CONCLUÍDA', 'Concluímos a produção do seu pedido. A entrega ou retirada segue o andamento registrado no pedido e o combinado com nossa equipe. Obrigado por escolher a F PAC STORE!'),
};
for (const [legacy, current] of Object.entries({ aguardando_impressao: 'separacao_corte', estampa_finalizada: 'estamparia', controle_qualidade: 'embalagem', pronto_envio: 'ready' })) {
  DEFAULT_STAGE_TEMPLATES[legacy] = DEFAULT_STAGE_TEMPLATES[current];
}

export const DEFAULT_NOTIFICATION_CONFIG: ProductionNotificationConfig = {
  testEmail: '',
  testPhone: '',
  whatsappEnabled: false,
  emailEnabled: true,
  allowResendOnStageReentry: false,
  activeStages: Object.fromEntries(Object.keys(DEFAULT_STAGE_TEMPLATES).map(stage => [stage, stage !== 'cancelled'])),
  templates: { ...DEFAULT_STAGE_TEMPLATES },
};

// Upgrade only exact historical defaults. Merchant-written templates remain intact.
export function resolveSavedStageTemplates(saved: Record<string, string> = {}) {
  const templates = { ...DEFAULT_STAGE_TEMPLATES, ...saved };
  for (const [key, value] of Object.entries(saved)) {
    if (value === PREVIOUS_STAGE_TEMPLATES[key]) templates[key] = DEFAULT_STAGE_TEMPLATES[key];
  }
  const oldSeparation = separation.replace('Nossa equipe está separando e preparando', 'O pagamento foi confirmado e nossa equipe já está separando e preparando');
  for (const key of ['separacao_corte', 'aguardando_impressao', 'payment_approved']) {
    if ([oldSeparation, DEFAULT_STAGE_TEMPLATES.separacao_corte.replace('Nossa equipe está separando e preparando', 'O pagamento foi confirmado e nossa equipe já está separando e preparando')].includes(templates[key])) templates[key] = DEFAULT_STAGE_TEMPLATES[key];
  }
  const oldPending = DEFAULT_STAGE_TEMPLATES.payment_pending.replace('O pagamento do seu pedido ainda está pendente. A produção e a entrega seguem o combinado com nossa equipe.', 'Seu pedido foi criado e aguarda a confirmação do pagamento para entrar em produção.');
  if (templates.payment_pending === oldPending) templates.payment_pending = DEFAULT_STAGE_TEMPLATES.payment_pending;
  const oldReady = ready.replace('PRONTO PARA ENTREGA OU RETIRADA', 'PRONTO PARA ENVIO').replace('Vamos seguir com a entrega ou retirada conforme combinado.', 'A próxima atualização será a postagem ou retirada.');
  for (const key of ['ready', 'pronto_envio']) if (templates[key] === oldReady) templates[key] = DEFAULT_STAGE_TEMPLATES[key];
  return templates;
}

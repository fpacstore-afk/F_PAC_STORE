import { randomUUID } from 'node:crypto';
import { getDb } from "../firebase.js";
import { logger } from "../utils/logger.js";
import { sendWhatsAppMessage, logAutomationEvent } from "./automation.service.js";
import { Resend } from "resend";
import {
  resolveSavedStageTemplates,
  DEFAULT_NOTIFICATION_CONFIG as SHARED_NOTIFICATION_CONFIG,
  DEFAULT_STAGE_TEMPLATES as SHARED_STAGE_TEMPLATES,
} from "../../shared/productionNotificationDefaults.js";

export interface ProductionNotificationConfig {
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  allowResendOnStageReentry: boolean;
  activeStages: Record<string, boolean>;
  templates: Record<string, string>;
}

const LEGACY_STAGE_TEMPLATES: Record<string, string> = {
  received: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

✅ *SEU PEDIDO FOI RECEBIDO!*

Recebemos o seu pedido *#{{numero_pedido}}* com sucesso.

    A partir de agora nossa equipe iniciará a preparação para garantir que seu produto chegue com a qualidade que você merece.

Você será avisado automaticamente sempre que seu pedido avançar para uma nova etapa.

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  payment_pending: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

💳 *AGUARDANDO PAGAMENTO*

Seu pedido *#{{numero_pedido}}* foi criado com sucesso.

Assim que o pagamento for confirmado, sua produção será iniciada automaticamente.

Caso já tenha realizado o pagamento, não se preocupe. A confirmação pode levar alguns minutos, dependendo da forma de pagamento.

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  payment_approved: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

✅ *PAGAMENTO REALIZADO*

O pagamento do pedido *#{{numero_pedido}}* foi confirmado com sucesso.

Seu pedido já está liberado para preparação pela equipe F PAC.

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  aguardando_impressao: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

🖨️ *SUA ESTAMPA ESTÁ NA FILA DE IMPRESSÃO!*

Seu pedido *#{{numero_pedido}}* entrou na etapa de impressão.

Nossa equipe está preparando sua arte para produzir uma estampa com máxima qualidade e durabilidade.

Em breve sua camiseta começará a ganhar vida!

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  estampa_finalizada: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

🎨 *ESTAMPA FINALIZADA!*

Boas notícias!

A estampa da sua camiseta *#{{numero_pedido}}* foi produzida com sucesso.

Agora ela seguirá para nossa conferência de qualidade antes da preparação para envio.

Estamos cada vez mais perto de entregar sua nova identidade!

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  controle_qualidade: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

🔍 *CONTROLE DE QUALIDADE*

Sua camiseta *#{{numero_pedido}}* está passando pela inspeção final.

Nossa equipe está verificando acabamento, qualidade da estampa e todos os detalhes para garantir que você receba um produto impecável.

Qualidade vem sempre em primeiro lugar.

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  pronto_envio: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

📦 *SEU PEDIDO ESTÁ PRONTO!*

Sua camiseta *#{{numero_pedido}}* já foi produzida, conferida e embalada.

Agora estamos preparando a postagem junto à transportadora.

Em breve você receberá o código de rastreamento.

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  shipped: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

🚚 *SEU PEDIDO FOI ENVIADO!*

Seu pedido *#{{numero_pedido}}* já está a caminho!

Agora é só acompanhar a entrega utilizando as informações abaixo.

📦 Código de Rastreio:
*{{codigo_rastreio}}*

🚛 Transportadora:
*{{transportadora}}*

🔗 Rastreamento:
{{link_rastreio}}

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  delivered: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

🎉 *PEDIDO ENTREGUE!*

Conforme a transportadora, seu pedido *#{{numero_pedido}}* foi entregue.

Esperamos que seu novo produto represente sua identidade e supere suas expectativas.

Sua opinião é muito importante para nós! Marque *@f_pac_store* usando seu produto e compartilhe esse momento.

Obrigado por fazer parte da família F PAC STORE! 🖤

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`
};

const LEGACY_NOTIFICATION_CONFIG: ProductionNotificationConfig = {
  whatsappEnabled: true,
  emailEnabled: true,
  allowResendOnStageReentry: false,
  activeStages: {
    received: false,
    payment_pending: true,
    payment_approved: true,
    aguardando_impressao: false,
    estampa_finalizada: false,
    controle_qualidade: false,
    pronto_envio: false,
    shipped: true,
    delivered: true,
    cancelled: false
  },
  templates: { ...LEGACY_STAGE_TEMPLATES }
};

// Fonte única compartilhada com o painel administrativo para impedir divergência
// entre o texto exibido, o texto restaurado e a mensagem realmente enviada.
export const DEFAULT_STAGE_TEMPLATES = SHARED_STAGE_TEMPLATES;
export const DEFAULT_NOTIFICATION_CONFIG: ProductionNotificationConfig = SHARED_NOTIFICATION_CONFIG;

export function renderStageTemplate(templateStr: string, orderData: any): string {
  if (!templateStr) return '';
  
  const name = orderData?.customerName || orderData?.name || 'Cliente';
  const firstName = String(name).split(' ')[0].toUpperCase();
  const orderId = orderData?.id || orderData?.orderId || '0000';
  const totalVal = Number(orderData?.total || orderData?.amount || 0);
  const formattedTotal = totalVal > 0 ? `R$ ${totalVal.toFixed(2).replace('.', ',')}` : 'R$ 0,00';
  
  const items = orderData?.items || [];
  const firstItemName = items[0]?.name || items[0]?.title || 'Camiseta F PAC';
  const itemsSummary = items.map((i: any) => `${i.quantity || 1}x ${i.name || i.title || 'Camiseta'}`).join(', ') || firstItemName;
  const totalQty = items.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 1), 0) || 1;

  const dateStr = orderData?.createdAt
    ? new Date(orderData.createdAt?.seconds ? orderData.createdAt.seconds * 1000 : (typeof orderData.createdAt === 'string' ? orderData.createdAt : Date.now())).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');

  const deliveryEstimate = orderData?.deliveryDate || orderData?.previsao || '3 a 7 dias úteis';
  const paymentMethod = orderData?.paymentMethod || orderData?.formaPagamento || 'PIX / Cartão';

  const trackingCode = orderData?.trackingCode || orderData?.codigoRastreio || orderData?.trackingUrl || 'Em processamento';
  const carrier = orderData?.shippingCompany || orderData?.transportadora || (orderData?.cep && String(orderData.cep).startsWith('892') ? 'Entrega Local Joinville' : 'Correios / Transportadora');
  const trackingLink = orderData?.trackingUrl || (orderData?.trackingCode ? `https://www.linkcorreios.com.br/?id=${orderData.trackingCode}` : `https://www.fpacstore.com.br/#/order/${orderId}`);

  return templateStr
    .replace(/\{\{nome_cliente\}\}/g, firstName)
    .replace(/\{\{numero_pedido\}\}/g, String(orderId))
    .replace(/\{\{valor_pedido\}\}/g, formattedTotal)
    .replace(/\{\{produto\}\}/g, itemsSummary)
    .replace(/\{\{quantidade\}\}/g, String(totalQty))
    .replace(/\{\{data\}\}/g, dateStr)
    .replace(/\{\{previsao\}\}/g, deliveryEstimate)
    .replace(/\{\{forma_pagamento\}\}/g, paymentMethod)
    .replace(/\{\{codigo_rastreio\}\}/g, trackingCode)
    .replace(/\{\{transportadora\}\}/g, carrier)
    .replace(/\{\{link_rastreio\}\}/g, trackingLink);
}

export async function getProductionNotificationSettings(): Promise<ProductionNotificationConfig> {
  const db = getDb();
  try {
    const docSnap = await db.collection("settings").doc("production_notifications").get();
    if (docSnap.exists) {
      const data = docSnap.data() as any;
      return {
        whatsappEnabled: data.whatsappEnabled ?? DEFAULT_NOTIFICATION_CONFIG.whatsappEnabled,
        emailEnabled: data.emailEnabled ?? DEFAULT_NOTIFICATION_CONFIG.emailEnabled,
        allowResendOnStageReentry: data.allowResendOnStageReentry ?? DEFAULT_NOTIFICATION_CONFIG.allowResendOnStageReentry,
        activeStages: { ...DEFAULT_NOTIFICATION_CONFIG.activeStages, ...(data.activeStages || {}) },
        templates: resolveSavedStageTemplates(data.templates || {})
      };
    }
  } catch (error: any) {
    logger.warn(`⚠️ [PROD-NOTIF] Using default settings: ${error.message}`);
  }
  return DEFAULT_NOTIFICATION_CONFIG;
}

export async function saveProductionNotificationSettings(config: Partial<ProductionNotificationConfig>): Promise<ProductionNotificationConfig> {
  const db = getDb();
  const current = await getProductionNotificationSettings();
  const updated: ProductionNotificationConfig = {
    whatsappEnabled: config.whatsappEnabled ?? current.whatsappEnabled,
    emailEnabled: config.emailEnabled ?? current.emailEnabled,
    allowResendOnStageReentry: config.allowResendOnStageReentry ?? current.allowResendOnStageReentry,
    activeStages: { ...current.activeStages, ...(config.activeStages || {}) },
    templates: { ...current.templates, ...(config.templates || {}) }
  };

  await db.collection("settings").doc("production_notifications").set({
    ...updated,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  logger.info("✅ [PROD-NOTIF] Production notification settings updated");
  return updated;
}

const STAGE_LABELS: Record<string, string> = {
  received: 'Pedido Recebido',
  payment_pending: 'Aguardando Pagamento',
  payment_approved: 'Pagamento Realizado',
  separacao_corte: 'Separação e Preparação',
  estamparia: 'Estamparia e Impressão',
  embalagem: 'Controle de Qualidade e Embalagem',
  ready: 'Pronto para Envio',
  completed: 'Produção Concluída',
  aguardando_impressao: 'Aguardando Impressão',
  estampa_finalizada: 'Estampa Finalizada',
  controle_qualidade: 'Controle de Qualidade',
  pronto_envio: 'Pronto para Envio',
  shipped: 'Saiu para Entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado'
};

const AUTOMATIC_CUSTOMER_STAGES = new Set(Object.keys(DEFAULT_STAGE_TEMPLATES));


export function notificationIntegrationStatus() {
  return {
    whatsappConfigured: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY),
    emailConfigured: Boolean(process.env.RESEND_API_KEY)
  };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function dispatchStageNotification(params: {
  orderId: string; newStageId: string; previousStageId?: string; changedBy?: string; forceResend?: boolean;
}) {
  const { orderId, newStageId, previousStageId, changedBy = 'Sistema', forceResend = false } = params;
  if (!AUTOMATIC_CUSTOMER_STAGES.has(newStageId)) throw new Error('Etapa de notificação inválida.');
  const db = getDb();
  const orderRef = db.collection('orders').doc(orderId);
  const settings = await getProductionNotificationSettings();
  if (!settings.activeStages[newStageId] && !forceResend) {
    return { success: true, skipped: true, reason: 'Avisos desta etapa desativados.', whatsappStatus: 'Desativado', emailStatus: 'Desativado' };
  }
  const token = randomUUID();
  // A transaction claims this stage across concurrent requests/instances.
  const claim = await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new Error('Pedido não encontrado.');
    const order = snap.data();
    const prior = order.sentStageNotifications?.[newStageId] || {};
    if (Number(prior.leaseUntil) > Date.now()) return { busy: true };
    const repeat = forceResend || (settings.allowResendOnStageReentry && previousStageId && previousStageId !== newStageId);
    const state = repeat ? {} : prior;
    tx.update(orderRef, { ['sentStageNotifications.' + newStageId]: { ...state, emailAttemptKey: state.emailAttemptKey || token, leaseToken: token, leaseUntil: Date.now() + 120000 } });
    return { order, prior: state };
  });
  if (claim.busy) return { success: true, skipped: true, reason: 'Envio já em andamento.' };
  const { order, prior } = claim;
  let whatsappSent = Boolean(prior.whatsappSent), emailSent = Boolean(prior.emailSent);
  let whatsappStatus = whatsappSent ? 'Já enviado' : 'Desativado';
  let emailStatus = emailSent ? 'Já enviado' : 'Desativado';
  const errors: string[] = [];
  const phone = order.customerPhone || order.phone || order.customer?.phone || order.customer?.phone2 || '';
  const email = order.customerEmail || order.email || order.customer?.email || '';
  const raw = settings.templates[newStageId] || DEFAULT_STAGE_TEMPLATES[newStageId];
  const message = renderStageTemplate(raw, { ...order, id: orderId });
  const persistChannel = async (channel: string) => {
    await orderRef.update({ ['sentStageNotifications.' + newStageId + '.' + channel + 'Sent']: true });
  };
  try {
    // Independent channels: a failed WhatsApp must never suppress email (or vice versa).
    await Promise.all([
      (async () => {
        if (!settings.whatsappEnabled || whatsappSent) return;
        if (!phone) { whatsappStatus = 'Sem Telefone'; return; }
        if (!notificationIntegrationStatus().whatsappConfigured) { whatsappStatus = 'Não configurado'; return; }
        try {
          whatsappSent = await sendWhatsAppMessage(phone, 'custom_message', { customMessage: message });
          whatsappStatus = whatsappSent ? 'Enviado' : 'Erro';
          if (whatsappSent) await persistChannel('whatsapp');
          else errors.push('WhatsApp: envio não confirmado; confira a conexão.');
        } catch (err: any) { whatsappStatus = 'Erro'; errors.push('WhatsApp: ' + err.message); }
      })(),
      (async () => {
        if (!settings.emailEnabled || emailSent) return;
        if (!email) { emailStatus = 'Sem E-mail'; return; }
        if (!notificationIntegrationStatus().emailConfigured) { emailStatus = 'Não configurado'; return; }
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const result = await resend.emails.send({
            from: 'F PAC STORE <atendimento@fpacstore.com.br>', to: [email],
            subject: 'Pedido #' + orderId + ' — ' + (STAGE_LABELS[newStageId] || newStageId),
            text: message,
            html: '<div style="font-family:Arial;white-space:pre-line;line-height:1.6;padding:24px">' + escapeHtml(message.replace(/\*/g, '')) + '</div>'
          }, { ...{ signal: AbortSignal.timeout(20000) }, idempotencyKey: 'production/' + orderId + '/' + newStageId + '/' + (prior.emailAttemptKey || token) });
          if (result.error || !result.data?.id) throw new Error(result.error?.message || 'Servidor de e-mail não confirmou o envio.');
          emailSent = true; emailStatus = 'Enviado';
          await persistChannel('email');
        } catch (err: any) { emailStatus = 'Erro'; errors.push('E-mail: ' + err.message); }
      })()
    ]);
    const timestamp = new Date().toISOString();
    const logEntry = {
      id: 'NOTIF-' + token, timestamp, stageId: newStageId, stageLabel: STAGE_LABELS[newStageId],
      changedBy, previousStage: previousStageId || '', newStage: newStageId,
      channels: { whatsapp: settings.whatsappEnabled, email: settings.emailEnabled },
      whatsappStatus, emailStatus, whatsappSent, emailSent, customerPhone: phone, customerEmail: email,
      message, errorDetails: errors.join(' | ')
    };
    await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(orderRef);
      const latest = snap.data();
      if (latest.sentStageNotifications?.[newStageId]?.leaseToken !== token) return;
      tx.update(orderRef, {
        ['sentStageNotifications.' + newStageId]: {
          whatsappSent, emailSent, whatsappStatus, emailStatus, timestamp, lastMessage: message,
          emailAttemptKey: prior.emailAttemptKey || token, leaseUntil: 0
        },
        notificationLogs: [logEntry, ...(latest.notificationLogs || [])].slice(0, 50),
        lastNotificationAttemptAt: timestamp,
        ...(whatsappSent || emailSent ? { lastNotificationSentAt: timestamp, lastNotificationStage: newStageId } : {})
      });
    });
    await logAutomationEvent('production.stage_notification', whatsappSent || emailSent ? 'info' : 'warning',
      'Avisos do pedido #' + orderId + ': WhatsApp ' + whatsappStatus + '; e-mail ' + emailStatus, phone || email || 'Manual');
    return { success: true, whatsappSent, emailSent, whatsappStatus, emailStatus, logEntry, message };
  } finally {
    await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(orderRef);
      if (snap.data()?.sentStageNotifications?.[newStageId]?.leaseToken === token) {
        tx.update(orderRef, { ['sentStageNotifications.' + newStageId + '.leaseUntil']: 0 });
      }
    });
  }
}

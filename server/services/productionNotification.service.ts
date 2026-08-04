import { getDb } from "../firebase.js";
import { logger } from "../utils/logger.js";
import { sendWhatsAppMessage, logAutomationEvent } from "./automation.service.js";
import { Resend } from "resend";

export interface ProductionNotificationConfig {
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  allowResendOnStageReentry: boolean;
  activeStages: Record<string, boolean>;
  templates: Record<string, string>;
}

export const DEFAULT_STAGE_TEMPLATES: Record<string, string> = {
  received: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

✅ *SEU PEDIDO FOI RECEBIDO!*

Recebemos o seu pedido *#{{numero_pedido}}* com sucesso.

A partir de agora nossa equipe iniciará todo o processo de produção para garantir que sua camiseta chegue com a qualidade que você merece.

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

Esperamos que sua nova camiseta represente sua identidade e supere suas expectativas.

Sua opinião é muito importante para nós! Marque *@f_pac_store* usando sua camiseta e compartilhe esse momento.

Obrigado por fazer parte da família F PAC STORE! 🖤

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`
};

export const DEFAULT_NOTIFICATION_CONFIG: ProductionNotificationConfig = {
  whatsappEnabled: true,
  emailEnabled: true,
  allowResendOnStageReentry: false,
  activeStages: {
    received: true,
    payment_pending: true,
    aguardando_impressao: true,
    estampa_finalizada: true,
    controle_qualidade: true,
    pronto_envio: true,
    shipped: true,
    delivered: true,
    cancelled: false
  },
  templates: { ...DEFAULT_STAGE_TEMPLATES }
};

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
        templates: { ...DEFAULT_STAGE_TEMPLATES, ...(data.templates || {}) }
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
  aguardando_impressao: 'Aguardando Impressão',
  estampa_finalizada: 'Estampa Finalizada',
  controle_qualidade: 'Controle de Qualidade',
  pronto_envio: 'Pronto para Envio',
  shipped: 'Enviado',
  delivered: 'Finalizado',
  cancelled: 'Cancelado'
};

export async function dispatchStageNotification(params: {
  orderId: string;
  newStageId: string;
  previousStageId?: string;
  changedBy?: string;
  forceResend?: boolean;
}) {
  const { orderId, newStageId, previousStageId, changedBy = 'Sistema', forceResend = false } = params;
  const db = getDb();

  try {
    // 1. Fetch Order Document
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      throw new Error(`Pedido #${orderId} não encontrado`);
    }
    const order = orderSnap.data()!;

    // 2. Fetch Settings
    const settings = await getProductionNotificationSettings();

    // Check if stage is enabled
    if (!settings.activeStages[newStageId] && !forceResend) {
      logger.info(`ℹ️ [PROD-NOTIF] Stage ${newStageId} notification is disabled in settings. Skipping.`);
      return {
        success: true,
        skipped: true,
        reason: `Notificações da etapa '${STAGE_LABELS[newStageId] || newStageId}' estão desativadas nas configurações.`
      };
    }

    // Check if duplicate send
    const sentStages = order.sentStageNotifications || {};
    const previousSent = sentStages[newStageId];
    if (previousSent && previousSent.whatsappSent && !forceResend && !settings.allowResendOnStageReentry) {
      logger.info(`ℹ️ [PROD-NOTIF] Notification for stage ${newStageId} already sent previously for order #${orderId}. Skipping.`);
      return {
        success: true,
        skipped: true,
        alreadySent: true,
        reason: `Notificação para a etapa '${STAGE_LABELS[newStageId] || newStageId}' já foi enviada anteriormente.`
      };
    }

    // Get template
    const templateRaw = settings.templates[newStageId] || DEFAULT_STAGE_TEMPLATES[newStageId] || DEFAULT_STAGE_TEMPLATES.received;
    const compiledMessage = renderStageTemplate(templateRaw, { id: orderId, ...order });

    let whatsappSent = false;
    let whatsappStatus: 'Enviado' | 'Erro' | 'Sem Telefone' | 'Desativado' = 'Desativado';
    let whatsappError = '';

    let emailSent = false;
    let emailStatus: 'Enviado' | 'Erro' | 'Sem E-mail' | 'Desativado' = 'Desativado';
    let emailError = '';

    // 3. WhatsApp Dispatch
    const customerPhone = order.customerPhone || order.phone;
    if (settings.whatsappEnabled) {
      if (customerPhone) {
        try {
          whatsappSent = await sendWhatsAppMessage(customerPhone, 'custom_message', {
            customMessage: compiledMessage
          });
          whatsappStatus = whatsappSent ? 'Enviado' : 'Erro';
          if (!whatsappSent) whatsappError = 'Falha no envio via Evolution API / Conexão WhatsApp';
        } catch (waErr: any) {
          whatsappStatus = 'Erro';
          whatsappError = waErr.message || 'Erro de rede no WhatsApp';
        }
      } else {
        whatsappStatus = 'Sem Telefone';
      }
    }

    // 4. Email Dispatch
    const customerEmail = order.customerEmail || order.email;
    if (settings.emailEnabled) {
      if (customerEmail) {
        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey) {
          try {
            const resend = new Resend(resendKey);
            const stageName = STAGE_LABELS[newStageId] || 'Produção';
            
            // Format HTML email
            const emailHtml = `
              <div style="font-family: sans-serif; background-color: #000; color: #fff; padding: 30px; max-width: 600px; margin: 0 auto; border: 1px solid #222;">
                <h1 style="color: #f7c600; text-align: center; margin-bottom: 5px;">F PAC STORE</h1>
                <p style="color: #888; text-align: center; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">NÃO É SÓ ROUPA. É IDENTIDADE.</p>
                <hr style="border-color: #333; margin: 20px 0;">
                <h2 style="color: #fff; text-align: center;">ETAPA ATUALIZADA: <span style="color: #f7c600;">${stageName.toUpperCase()}</span></h2>
                <div style="background-color: #111; padding: 20px; border: 1px solid #333; white-space: pre-line; line-height: 1.6; font-size: 13px;">
                  ${compiledMessage.replace(/\*/g, '').replace(/https?:\/\/[^\s]+/g, (url) => `<a href="${url}" style="color: #f7c600;">${url}</a>`)}
                </div>
                <div style="text-align: center; margin-top: 30px;">
                  <a href="https://www.fpacstore.com.br/#/order/${orderId}" style="background-color: #f7c600; color: #000; padding: 12px 25px; text-decoration: none; font-weight: bold; text-transform: uppercase; font-size: 11px;">Acompanhar Pedido #${orderId}</a>
                </div>
              </div>
            `;

            await resend.emails.send({
              from: 'F PAC STORE <atendimento@fpacstore.com.br>',
              to: [customerEmail],
              subject: `👕 Pedido #${orderId} - Nova Etapa: ${stageName}`,
              html: emailHtml
            });

            emailSent = true;
            emailStatus = 'Enviado';
          } catch (emErr: any) {
            emailStatus = 'Erro';
            emailError = emErr.message || 'Erro no servidor Resend';
          }
        } else {
          emailStatus = 'Erro';
          emailError = 'Chave RESEND_API_KEY não configurada';
        }
      } else {
        emailStatus = 'Sem E-mail';
      }
    }

    // 5. Construct Log Entry
    const nowIso = new Date().toISOString();
    const logEntry = {
      id: `NOTIF-${Date.now()}`,
      timestamp: nowIso,
      stageId: newStageId,
      stageLabel: STAGE_LABELS[newStageId] || newStageId,
      changedBy: changedBy,
      previousStage: previousStageId || '',
      newStage: newStageId,
      channels: {
        whatsapp: settings.whatsappEnabled,
        email: settings.emailEnabled
      },
      whatsappStatus,
      emailStatus,
      whatsappSent,
      emailSent,
      customerPhone: customerPhone || 'N/A',
      customerEmail: customerEmail || 'N/A',
      message: compiledMessage,
      errorDetails: [whatsappError, emailError].filter(Boolean).join(' | ')
    };

    // 6. Update Order Document
    const updatedSentStages = {
      ...sentStages,
      [newStageId]: {
        whatsappSent,
        emailSent,
        timestamp: nowIso,
        lastMessage: compiledMessage
      }
    };

    const existingLogs = Array.isArray(order.notificationLogs) ? order.notificationLogs : [];
    const updatedLogs = [logEntry, ...existingLogs].slice(0, 50); // Keep last 50 entries

    await orderRef.update({
      sentStageNotifications: updatedSentStages,
      notificationLogs: updatedLogs,
      lastNotificationSentAt: nowIso,
      lastNotificationStage: newStageId
    });

    // 7. Global Audit Log Entry
    await logAutomationEvent(
      'production.stage_notification',
      (whatsappSent || emailSent) ? 'info' : 'warning',
      `Notificação de Produção (${STAGE_LABELS[newStageId] || newStageId}) enviada para #${orderId} (${order.customerName || 'Cliente'}). WA: ${whatsappStatus}, Email: ${emailStatus}`,
      customerPhone || customerEmail || 'Manual'
    );

    return {
      success: true,
      whatsappSent,
      emailSent,
      whatsappStatus,
      emailStatus,
      logEntry,
      message: compiledMessage
    };

  } catch (error: any) {
    logger.error(`❌ [PROD-NOTIF-ERR] ${error.message}`);
    throw error;
  }
}

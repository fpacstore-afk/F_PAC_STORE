import { notificationIntegrationStatus } from '../services/productionNotification.service.js';
import { Request, Response } from "express";
import { 
  saveCheckoutLead, 
  cancelRecoveryByToken,
  prepareRecoveryWhatsApp,
  recoveryAllowed,
  runAbandonedCheckoutDetector, 
  sendWhatsAppMessage, 
  sendAbandonedEmail,
  logAutomationEvent
} from "../services/automation.service.js";
import {
  getProductionNotificationSettings,
  saveProductionNotificationSettings,
  dispatchStageNotification,
  DEFAULT_STAGE_TEMPLATES,
  renderStageTemplate
} from "../services/productionNotification.service.js";
import { getDb } from "../firebase.js";
import { logger } from "../utils/logger.js";
import { Resend } from "resend";
import { manualWhatsAppUrl, normalizeNotificationEmail } from "../../shared/notificationContacts.js";
import { restoreRecoveryCart } from '../services/cartRecovery.service.js';

const recoveryText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function recoveryItem(item: any) {
  if (item?.printConfigs && (!Array.isArray(item.printConfigs) || item.printConfigs.length > 5 || JSON.stringify(item.printConfigs).length > 20_000)) throw Object.assign(new Error('INVALID_CART'), { status: 400 });
  return {
    id: recoveryText(item?.id, 128), productId: recoveryText(item?.productId, 128), slug: recoveryText(item?.slug, 128),
    baseProductSlug: recoveryText(item?.baseProductSlug, 128), parentSlug: recoveryText(item?.parentSlug, 128),
    name: recoveryText(item?.name, 150), size: recoveryText(item?.size, 20), color: recoveryText(item?.color, 50),
    quantity: Math.max(1, Math.min(99, Math.floor(Number(item?.quantity) || 1))), price: Math.max(0, Math.min(100_000, Number(item?.price) || 0)),
    ...(item?.printConfigs ? { printConfigs: item.printConfigs.map((print: any) => ({
      id: recoveryText(print?.id, 160), stampId: recoveryText(print?.stampId, 160), stamp: recoveryText(print?.stamp, 160),
      location: recoveryText(print?.location, 120), printSize: recoveryText(print?.printSize, 80), background: recoveryText(print?.background, 80),
      ...(print?.placement && typeof print.placement === 'object' ? { placement: print.placement } : {}),
    })) } : {}),
  };
}

/**
 * Controller to save/update checkout lead dynamically as they type
 */
export async function handleSaveLead(req: Request, res: Response) {
  try {
    const body = req.body || {};
    if (!/^lead_[a-f0-9-]{36}$/.test(body.checkout_session_id || '') || !/^[a-f0-9]{64}$/.test(body.leadAccessToken || '') || typeof body.recoveryConsent !== 'boolean') {
      return res.status(400).json({ error: 'INVALID_LEAD_SESSION' });
    }
    const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const email = text(body.email, 254);
    const phone = text(body.phone, 24).replace(/\D/g, '');
    if (body.recoveryConsent && !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /^\d{10,13}$/.test(phone))) return res.status(400).json({ error: 'INVALID_CONTACT' });
    if (body.cart_items && (!Array.isArray(body.cart_items) || body.cart_items.length > 60)) return res.status(400).json({ error: 'INVALID_CART' });
    const cart_items = (body.cart_items || []).map(recoveryItem);
    const result = await saveCheckoutLead({ checkout_session_id: body.checkout_session_id, recoveryConsent: body.recoveryConsent, customer_name: text(body.customer_name, 100), email, phone, cart_items, total: Math.max(0, Math.min(1_000_000, Number(body.total) || 0)) }, body.leadAccessToken);
    res.json(result);
  } catch (error: any) {
    const status = [400, 403, 409].includes(error.status) ? error.status : 503;
    res.status(status).json({ error: status === 409 ? 'CONSENT_REVOKED' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'INVALID_LEAD_SESSION' });
  }
}

export async function handleRestoreRecovery(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  try { res.json(await restoreRecoveryCart(req.body?.id, req.body?.token)); }
  catch (error: any) {
    const status = [403, 410].includes(error.status) ? error.status : 503;
    res.status(status).json({ error: status === 503 ? 'Não foi possível atualizar esta sacola. Tente novamente ou escolha os produtos no catálogo.' : error.message });
  }
}

export async function handleRecoveryWhatsApp(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!/^lead_[a-f0-9-]{36}$/.test(req.body?.id || '')) return res.status(400).json({ error: 'Sacola inválida.' });
    res.json(await prepareRecoveryWhatsApp(req.body.id));
  } catch (error: any) { res.status(error.status === 410 ? 410 : 503).json({ error: error.message }); }
}

export async function handleCancelRecovery(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.json(await cancelRecoveryByToken(req.body?.id, req.body?.token));
  } catch (error: any) {
    res.status(error.status === 403 ? 403 : 503).json({ error: error.status === 403 ? 'INVALID_CANCELLATION_LINK' : 'SERVICE_UNAVAILABLE' });
  }
}

/**
 * Endpoint to manually trigger the abandonment scanning routine
 */
export async function triggerCronCheck(req: Request, res: Response) {
  try {
    const results = await runAbandonedCheckoutDetector();
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Manual recovery trigger ("Reenviar automação" button in Admin)
 */
export async function manualResendAutomation(req: Request, res: Response) {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Lead id (checkout_session_id) is required" });
  }

  const db = getDb();
  try {
    const doc = await db.collection("abandoned_checkouts").doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Checkout lead not found" });
    }

    const checkout = doc.data()!;
    if (!recoveryAllowed(checkout)) return res.status(409).json({ error: 'CONSENT_REQUIRED', message: 'Esta sacola não possui autorização vigente para lembretes.' });

    logger.info(`⚡ [MANUAL RESEND] Operator triggered recovery for ${checkout.customer_name} (${checkout.id})`);

    // Increment attempts
    const newAttempts = (checkout.recovery_attempts || 0) + 1;
    await db.collection("abandoned_checkouts").doc(id).update({
      recovery_attempts: newAttempts,
      updated_at: new Date().toISOString()
    });

    await logAutomationEvent(
      'checkout.abandoned',
      'info',
      `Reenvio manual disparado pelo operador para ${checkout.customer_name || 'Cliente'}`,
      checkout.email || checkout.phone || 'Manual'
    );

    let waSent = false;
    let emailSent = false;

    if (checkout.phone) {
      waSent = await sendWhatsAppMessage(checkout.phone, 'abandoned_60m', checkout);
    }

    if (checkout.email) {
      emailSent = await sendAbandonedEmail(checkout as any);
    }

    res.json({
      success: waSent || emailSent,
      attempts: newAttempts,
      whatsapp: waSent,
      email: emailSent,
      message: waSent || emailSent ? 'Lembrete enviado.' : 'Nenhuma mensagem foi enviada. Verifique as integrações e a autorização da sacola.'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Dashboard telemetry and metrics provider for AUTOMAÇÕES panel
 */
export async function getAutomationDashboard(req: Request, res: Response) {
  const db = getDb();
  try {
    // 1. Fetch leads
    const checkoutsSnap = await db.collection("abandoned_checkouts")
      .orderBy("last_interaction", "desc")
      .limit(100)
      .get();
    
    const leads = checkoutsSnap.docs.map(doc => {
      const { leadAccessTokenHash, recoveryCancelToken, recoveryLinkToken, ...data } = doc.data();
      return data;
    });

    // 2. Fetch logs
    const logsSnap = await db.collection("automation_logs")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();

    const logs = logsSnap.docs.map(doc => {
      const d = doc.data() as any;
      // Format timestamps
      let formattedTime = d.timestamp;
      if (d.timestamp && d.timestamp.toDate) {
        formattedTime = d.timestamp.toDate().toISOString();
      }
      return {
        ...d,
        timestamp: formattedTime
      };
    });

    // 3. Calculate telemetry metrics
    let totalAbandoned = 0;
    let totalRecovered = 0;
    let totalRecoveredSalesValue = 0;
    let totalAbandonedValue = 0;

    leads.forEach((l: any) => {
      if (l.recovery_status === 'recovered') {
        totalRecovered++;
        totalRecoveredSalesValue += Number(l.total || 0);
      } else if (l.recovery_status === 'abandoned') {
        totalAbandoned++;
        totalAbandonedValue += Number(l.total || 0);
      } else if (l.payment_status === 'pending') {
        // It remains pending/in checkout
        totalAbandonedValue += Number(l.total || 0);
      }
    });

    const divisor = totalAbandoned + totalRecovered;
    const recoveryRate = divisor > 0 ? (totalRecovered / divisor) * 100 : 0;

    // Check WhatsApp service connection payload
    const wpaUrl = process.env.EVOLUTION_API_URL;
    const wpaKey = process.env.EVOLUTION_API_KEY;
    const waStatus = (wpaUrl && wpaKey) ? 'CONNECTED' : 'DISCONNECTED';

    // Whatsapp message dispatch volume
    const waSentLogs = logs.filter(lg => lg.event === 'whatsapp.sent').length;

    res.json({
      metrics: {
        totalAbandoned,
        totalRecovered,
        recoveryRate: Number(recoveryRate.toFixed(1)),
        recoveredValue: Number(totalRecoveredSalesValue.toFixed(2)),
        whatsappSentCount: waSentLogs,
        whatsappStatus: waStatus,
      },
      checkouts: leads,
      logs: logs
    });

  } catch (error: any) {
    logger.error(`❌ [DASHBOARD-TELEMETRY-ERR] ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get Production Notification Settings
 */
export async function getProductionSettings(req: Request, res: Response) {
  try {
    const settings = await getProductionNotificationSettings();
    res.json({ ...settings, integration: notificationIntegrationStatus() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Save Production Notification Settings
 */
export async function saveProductionSettings(req: Request, res: Response) {
  try {
    const settings = await saveProductionNotificationSettings(req.body);
    res.json({ success: true, settings, message: "Configurações salvas com sucesso!" });
  } catch (error: any) {
    res.status(/válido|válida/.test(error.message) ? 400 : 500).json({ error: error.message });
  }
}

/**
 * Restore Default Production Templates
 */
export async function restoreDefaultProductionSettings(req: Request, res: Response) {
  try {
    const settings = await saveProductionNotificationSettings({
      templates: DEFAULT_STAGE_TEMPLATES
    });
    res.json({ success: true, settings, message: "Modelos de mensagem restaurados para o padrão oficial!" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Dispatch Stage Notification for an Order
 */
export async function triggerProductionStageNotification(req: Request, res: Response) {
  try {
    const { orderId, newStageId, previousStageId, changedBy, forceResend, channels } = req.body;
    if (!orderId || !newStageId) {
      return res.status(400).json({ error: "orderId and newStageId are required" });
    }

    if (channels !== undefined && (
      !channels || typeof channels !== 'object' || Array.isArray(channels)
      || Object.keys(channels).some(key => !['whatsapp', 'email'].includes(key) || typeof channels[key] !== 'boolean')
      || (channels.whatsapp !== true && channels.email !== true)
    )) return res.status(400).json({ error: 'Selecione um canal válido para o envio.' });

    const result = await dispatchStageNotification({
      orderId,
      newStageId,
      previousStageId,
      changedBy: (req as any).user?.email || (req as any).user?.uid || 'Admin',
      forceResend: Boolean(forceResend),
      ...(channels === undefined ? {} : { channels: { whatsapp: channels.whatsapp === true, email: channels.email === true } })
    });

    res.json(result);
  } catch (error: any) {
    logger.error(`❌ [TRIGGER-PROD-NOTIF-ERR] ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Send Test Production Notification
 */
export async function testProductionNotification(req: Request, res: Response) {
  try {
    const { stageId, phone, email, customTemplate, channel } = req.body || {};
    if (typeof stageId !== 'string' || !DEFAULT_STAGE_TEMPLATES[stageId]) return res.status(400).json({ error: 'Selecione uma etapa válida para o teste.' });
    if (customTemplate !== undefined && (typeof customTemplate !== 'string' || !customTemplate.trim() || customTemplate.length > 12000)) return res.status(400).json({ error: 'Informe uma mensagem de teste válida.' });
    const settings = await getProductionNotificationSettings();
    const rawTemplate = customTemplate || settings.templates[stageId] || DEFAULT_STAGE_TEMPLATES[stageId];
    const sampleOrder = {
      id: 'TESTE-999', customerName: 'Cliente Teste F PAC', total: 189.90,
      items: [{ name: 'CAMISETA OVERSIZED F PAC - EXEMPLO', quantity: 1, price: 189.90 }],
      createdAt: new Date().toISOString(), trackingCode: 'EXEMPLO-SEM-RASTREIO',
      shippingCompany: 'Transportadora de exemplo', trackingUrl: 'https://fpacstore.com.br/tracking'
    };
    const compiled = renderStageTemplate(rawTemplate, sampleOrder);
    const testMessage = '[TESTE • PEDIDO DE EXEMPLO]\n\n' + compiled;
    if (channel === 'whatsapp_manual' || (!email && phone && channel !== 'email')) {
      const whatsappUrl = manualWhatsAppUrl(phone || settings.testPhone || '', testMessage);
      return res.json({ success: true, manualOnly: true, whatsappSent: false, emailSent: false, whatsappUrl, messageSent: testMessage });
    }
    const recipient = normalizeNotificationEmail(email === undefined ? settings.testEmail || '' : email);
    if (!recipient) return res.status(400).json({ error: 'Cadastre o e-mail de teste antes de enviar.' });
    if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'O serviço de e-mail não está configurado.', emailSent: false });
    const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const delivery = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'F PAC STORE <atendimento@fpacstore.com.br>', to: [recipient],
      subject: `[TESTE] F PAC — ${stageId}`, text: testMessage,
      html: '<div style="font-family:Arial;padding:24px;line-height:1.6;white-space:pre-line">' + escape(testMessage.replace(/\*/g, '')) + '</div>'
    });
    if (delivery.error || !delivery.data?.id) return res.status(502).json({ error: delivery.error?.message || 'O provedor não confirmou o envio do teste.', emailSent: false });
    await logAutomationEvent('notification.test_email', 'success', 'Provedor aceitou e-mail de teste da etapa ' + stageId, recipient);
    return res.json({ success: true, whatsappSent: false, emailSent: true, emailId: delivery.data.id, messageSent: testMessage });
  } catch (error: any) {
    return res.status(error.status === 400 || /válido|válida/.test(error.message) ? 400 : 500).json({ error: error.message, emailSent: false });
  }
}

import { Request, Response } from "express";
import { 
  saveCheckoutLead, 
  cancelRecoveryByToken,
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
    const cart_items = (body.cart_items || []).map((item: any) => ({ id: text(item?.id, 128), name: text(item?.name, 150), size: text(item?.size, 20), color: text(item?.color, 50), quantity: Math.max(1, Math.min(99, Number(item?.quantity) || 1)), price: Math.max(0, Math.min(100_000, Number(item?.price) || 0)) }));
    const result = await saveCheckoutLead({ checkout_session_id: body.checkout_session_id, recoveryConsent: body.recoveryConsent, customer_name: text(body.customer_name, 100), email, phone, cart_items, total: Math.max(0, Math.min(1_000_000, Number(body.total) || 0)) }, body.leadAccessToken);
    res.json(result);
  } catch (error: any) {
    const status = [400, 403, 409].includes(error.status) ? error.status : 503;
    res.status(status).json({ error: status === 409 ? 'CONSENT_REVOKED' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'INVALID_LEAD_SESSION' });
  }
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
      const { leadAccessTokenHash, recoveryCancelToken, ...data } = doc.data();
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
    res.json(settings);
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
    res.status(500).json({ error: error.message });
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
    const { orderId, newStageId, previousStageId, changedBy, forceResend } = req.body;
    if (!orderId || !newStageId) {
      return res.status(400).json({ error: "orderId and newStageId are required" });
    }

    const result = await dispatchStageNotification({
      orderId,
      newStageId,
      previousStageId,
      changedBy,
      forceResend: Boolean(forceResend)
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
    const { stageId, phone, email, customTemplate } = req.body;
    const settings = await getProductionNotificationSettings();

    const rawTemplate = customTemplate || settings.templates[stageId] || DEFAULT_STAGE_TEMPLATES[stageId] || DEFAULT_STAGE_TEMPLATES.received;
    
    // Dummy sample order data
    const sampleOrder = {
      id: 'TESTE-999',
      customerName: 'Cliente Teste F PAC',
      total: 189.90,
      items: [{ name: 'CAMISETA OVERSIZED F PAC - IDENTIDADE', quantity: 1, price: 189.90 }],
      createdAt: new Date().toISOString(),
      trackingCode: 'BR123456789PAC',
      shippingCompany: 'Correios / Jadlog'
    };

    const compiled = renderStageTemplate(rawTemplate, sampleOrder);

    let waSent = false;
    let emailSent = false;

    if (phone) {
      waSent = await sendWhatsAppMessage(phone, 'custom_message', { customMessage: compiled });
    }

    if (email && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'F PAC STORE <atendimento@fpacstore.com.br>',
        to: [email],
        subject: `[TESTE] Notificação de Produção - Etapa: ${stageId}`,
        html: `<div style="font-family: sans-serif; padding:20px; background:#000; color:#fff; white-space:pre-line;">${compiled}</div>`
      });
      emailSent = true;
    }

    res.json({
      success: true,
      whatsappSent: waSent,
      emailSent: emailSent,
      messageSent: compiled
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

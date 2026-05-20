import { Request, Response } from "express";
import { 
  saveCheckoutLead, 
  runAbandonedCheckoutDetector, 
  sendWhatsAppMessage, 
  sendAbandonedEmail,
  logAutomationEvent
} from "../services/automation.service.js";
import { getDb } from "../firebase.js";
import { logger } from "../utils/logger.js";

/**
 * Controller to save/update checkout lead dynamically as they type
 */
export async function handleSaveLead(req: Request, res: Response) {
  try {
    const { checkout_session_id } = req.body;
    if (!checkout_session_id) {
      return res.status(400).json({ error: "checkout_session_id is required" });
    }

    const result = await saveCheckoutLead(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
      success: true,
      attempts: newAttempts,
      whatsapp: waSent,
      email: emailSent,
      message: "Recuperação reenviada de forma manual com sucesso!"
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
    
    const leads = checkoutsSnap.docs.map(doc => doc.data());

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

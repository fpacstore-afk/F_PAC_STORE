import express from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import { ShippingStatus } from "./server/types/order.types.js";

// 1. Load Environment Configuration
dotenv.config();

// 2. Imports from internal architecture
import { getDb } from "./server/firebase.js";
import { logger } from "./server/utils/logger.js";
import { mpService } from "./server/services/mp.service.js";
import { MelhorEnvioService, sanitizeSecrets } from "./server/services/melhor-envio.service.js";
import { processPayment } from "./server/controllers/checkout.controller.js";
import { cancelOrderController } from "./server/controllers/order.controller.js";
import { handleWebhook } from "./server/controllers/webhook.controller.js";
import { 
  handleSaveLead, 
  triggerCronCheck, 
  manualResendAutomation, 
  getAutomationDashboard,
  getProductionSettings,
  saveProductionSettings,
  restoreDefaultProductionSettings,
  triggerProductionStageNotification,
  testProductionNotification
} from "./server/controllers/automation.controller.js";
import { authenticateAdmin } from "./server/middleware/auth.middleware.js";
import { 
  publicApiLimiter, 
  checkoutLimiter, 
  adminApiLimiter, 
  webhookLimiter 
} from "./server/middleware/rateLimiter.js";
import { validateSheetSyncPayload } from "./server/utils/sheetValidation.js";
import { recordAuditLog } from "./server/utils/auditLogger.js";
import { migrateOrdersToCanonical } from "./server/services/migration.service.js";
import { assertShippingOrderEligible, isLocalDeliveryOrder, canTransitionShippingStatus, normalizeShippingStatus, isShippingStatus } from "./server/services/stateMachine.service.js";
import { consumeStockReservation } from "./server/services/store.service.js";
import { runIntegrityTestSuite } from "./server/tests/integrity.test.js";
import {
  updateOrderProductionStatus,
  updateOrderProductionPriority,
  updateOrderProductionAssignment,
  updateOrderProductionDueDate,
  addOrderProductionNote,
  updateOrderPaymentStatus,
  updateOrderShippingStatus,
  recordStockMovement,
  exportOrdersCsv,
  exportFinancialCsv,
  authorizeOrderReturnController,
  processPhysicalReceiveController
} from "./server/controllers/admin.controller.js";
import { requestOrderReturnController } from "./server/controllers/order.controller.js";

const app = express();
const isSandbox = process.env.DEFAULT_APP_PORT === "3000" && process.env.NODE_ENV !== "production" && !process.env.K_SERVICE;
const PORT = isSandbox ? 3000 : (Number(process.env.PORT) || 3000);
const melhorEnvio = new MelhorEnvioService();

// Security Header Setup (Helmet)
app.use(helmet({
  contentSecurityPolicy: false, // Evita bloquear scripts/mídias do Firebase, Mercado Pago, Three.js, etc.
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Restrição Estrita de CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const defaultOrigins = [
  'https://www.fpacstore.com.br',
  'https://fpacstore.com.br',
];

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true; // Permite chamadas server-to-server ou ferramentas de teste sem Origin
  if (defaultOrigins.includes(origin)) return true;
  if (allowedOrigins.includes(origin)) return true;
  
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    if (origin.includes('.run.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return true;
    }
  }
  return false;
};

app.set('trust proxy', 1);
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Acesso bloqueado pelas políticas de CORS da F PAC STORE'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-api-key', 'x-sync-secret', 'x-signature', 'x-request-id']
}));

app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => {
    if (buf && buf.length) {
      req.rawBody = Buffer.from(buf);
    }
  }
}));

// 3. Environment Guardian - Diagnostic Helper
const getMPEnvInfo = () => {
  const pk = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY || '';
  const at = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
  
  const identify = (val: string) => {
    if (!val) return 'EMPTY';
    const s = String(val).trim().toUpperCase();
    if (s.startsWith('TEST-')) return 'SANDBOX';
    if (s.startsWith('APP_USR-')) return 'PRODUCTION';
    return 'UNKNOWN';
  };

  const pkMode = identify(pk);
  const atMode = identify(at);
  const hasLegacyAT = !!process.env.MP_ACCESS_TOKEN;

  return {
    pk: { mode: pkMode, prefix: pk.substring(0, 11), length: pk.length },
    at: { mode: atMode, prefix: at.substring(0, 11), length: at.length },
    isCompatible: pkMode === atMode && pkMode !== 'EMPTY' && pkMode !== 'UNKNOWN',
    hasLegacyConflict: hasLegacyAT
  };
};

const envCheck = getMPEnvInfo();
console.log('----------------------------------------------------');
console.log('🚀 [STARTUP] AUDITORIA DE INFRAESTRUTURA');
console.log(`MODO FRONTEND (PK): ${envCheck.pk.mode} [${envCheck.pk.prefix}...]`);
console.log(`MODO BACKEND  (AT): ${envCheck.at.mode} [${envCheck.at.prefix}...]`);

if (envCheck.hasLegacyConflict) {
  console.warn('⚠️ AVISO: Você ainda tem a secret legada MP_ACCESS_TOKEN. Remova-a nos Secrets!');
}

if (!envCheck.isCompatible) {
  console.error('🛑 BLOQUEIO CRÍTICO: AMBIENTE INCONSISTENTE!');
  console.error('Sua aplicação não processará pagamentos até que PK e AT sejam do mesmo ambiente (Ambos PRODUCTION ou ambos SANDBOX).');
} else {
  console.log('✅ INTEGRIDADE: AMBIENTE CONSISTENTE E OPERACIONAL.');
}
console.log('----------------------------------------------------');

// 4. Carregamento Seguro de Credenciais do Melhor Envio
// As credenciais são lidas exclusivamente de process.env.MELHOR_ENVIO_TOKEN e Secret Manager.

// 5. API Routes Router
const apiRouter = express.Router();

// Public Endpoints
apiRouter.get("/health", publicApiLimiter, (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

apiRouter.get("/checkout/config", publicApiLimiter, (req, res) => {
  const pk = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY || '';
  const info = getMPEnvInfo();
  
  if (!pk) {
    return res.status(500).json({ error: "Public Key missing in server environment." });
  }

  res.json({
    mercadopago: {
      publicKey: pk,
      mode: info.pk.mode,
      compatible: info.isCompatible
    }
  });
});

apiRouter.post("/checkout/process-payment", checkoutLimiter, processPayment);
apiRouter.post("/checkout/lead", checkoutLimiter, handleSaveLead);
apiRouter.post("/orders/:orderId/cancel", publicApiLimiter, cancelOrderController);
apiRouter.post("/shipping/calculate", publicApiLimiter, async (req, res) => {
  try {
    const { to, items } = req.body;
    const from = process.env.ORIGIN_CEP ? process.env.ORIGIN_CEP.replace(/\D/g, '') : '89234100';
    const result = await melhorEnvio.calculateShipping({ from, to, items });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Webhooks
apiRouter.post("/webhook/mercadopago", webhookLimiter, handleWebhook);
apiRouter.post("/webhooks/mercadopago", webhookLimiter, handleWebhook);

// Protected Administrative Endpoints (REQUIRE AUTHENTICATION & AUTHORIZATION)
apiRouter.get("/automation/dashboard", adminApiLimiter, authenticateAdmin, getAutomationDashboard);
apiRouter.post("/checkout/trigger-cron", adminApiLimiter, authenticateAdmin, triggerCronCheck);
apiRouter.post("/automation/resend", adminApiLimiter, authenticateAdmin, manualResendAutomation);

apiRouter.get("/automation/production-settings", adminApiLimiter, authenticateAdmin, getProductionSettings);
apiRouter.post("/automation/production-settings", adminApiLimiter, authenticateAdmin, async (req, res, next) => {
  const user = (req as any).user;
  await recordAuditLog({
    userId: user?.uid,
    userEmail: user?.email,
    action: 'UPDATE_PRODUCTION_SETTINGS',
    resource: 'automation/production-settings',
    ip: req.ip
  });
  next();
}, saveProductionSettings);

apiRouter.post("/automation/production-settings/restore-defaults", adminApiLimiter, authenticateAdmin, async (req, res, next) => {
  const user = (req as any).user;
  await recordAuditLog({
    userId: user?.uid,
    userEmail: user?.email,
    action: 'RESTORE_DEFAULT_PRODUCTION_SETTINGS',
    resource: 'automation/production-settings',
    ip: req.ip
  });
  next();
}, restoreDefaultProductionSettings);

apiRouter.post("/automation/stage-notification", adminApiLimiter, authenticateAdmin, triggerProductionStageNotification);
apiRouter.post("/automation/stage-notification/test", adminApiLimiter, authenticateAdmin, testProductionNotification);

// Phase 2 Data Integrity Migration & Testing Endpoints
apiRouter.post("/admin/migrate-orders", adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const report = await migrateOrdersToCanonical(dryRun);
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: "Migration failed", message: err.message });
  }
});

apiRouter.all("/admin/run-integrity-tests", adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    const report = await runIntegrityTestSuite();
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: "Integrity test execution failed", message: err.message });
  }
});

// Phase 4 & Phase 7 Operational Production Endpoints
apiRouter.post("/admin/orders/:orderId/production-status", adminApiLimiter, authenticateAdmin, updateOrderProductionStatus);
apiRouter.put("/admin/orders/:orderId/production-status", adminApiLimiter, authenticateAdmin, updateOrderProductionStatus);
apiRouter.post("/admin/orders/:orderId/production-priority", adminApiLimiter, authenticateAdmin, updateOrderProductionPriority);
apiRouter.put("/admin/orders/:orderId/production-priority", adminApiLimiter, authenticateAdmin, updateOrderProductionPriority);
apiRouter.post("/admin/orders/:orderId/production-assignment", adminApiLimiter, authenticateAdmin, updateOrderProductionAssignment);
apiRouter.put("/admin/orders/:orderId/production-assignment", adminApiLimiter, authenticateAdmin, updateOrderProductionAssignment);
apiRouter.post("/admin/orders/:orderId/production-due-date", adminApiLimiter, authenticateAdmin, updateOrderProductionDueDate);
apiRouter.put("/admin/orders/:orderId/production-due-date", adminApiLimiter, authenticateAdmin, updateOrderProductionDueDate);
apiRouter.post("/admin/orders/:orderId/production-notes", adminApiLimiter, authenticateAdmin, addOrderProductionNote);
apiRouter.post("/admin/orders/:orderId/payment-status", adminApiLimiter, authenticateAdmin, updateOrderPaymentStatus);
apiRouter.post("/admin/orders/:orderId/shipping-status", adminApiLimiter, authenticateAdmin, updateOrderShippingStatus);
apiRouter.post("/admin/stock/movement", adminApiLimiter, authenticateAdmin, recordStockMovement);
apiRouter.get("/admin/orders/export", adminApiLimiter, authenticateAdmin, exportOrdersCsv);
apiRouter.get("/admin/financial/export", adminApiLimiter, authenticateAdmin, exportFinancialCsv);

// Phase 8.6 — Devoluções & Logística Reversa 2.0 Endpoints
apiRouter.post("/orders/:orderId/return-request", publicApiLimiter, requestOrderReturnController);
apiRouter.post("/admin/orders/:orderId/returns/authorize", adminApiLimiter, authenticateAdmin, authorizeOrderReturnController);
apiRouter.post("/admin/orders/:orderId/returns/physical-receive", adminApiLimiter, authenticateAdmin, processPhysicalReceiveController);

apiRouter.post("/automation/send-manual-order-whatsapp", adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }
    const db = getDb();
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }
    const orderData = orderSnap.data()!;
    
    if (orderData.whatsappMessages?.pedidoCriado) {
      return res.json({ success: true, alreadySent: true, message: "Mensagem automática 'Pedido Criado' já foi enviada anteriormente." });
    }

    const { sendWhatsAppMessage } = await import("./server/services/automation.service.js");
    
    const phone = orderData.customerPhone || orderData.phone || "";
    const name = orderData.customerName || orderData.name || "Cliente";
    
    logger.info(`Sending manual order creation whatsapp for order ${orderId} to ${phone}`);
    const success = await sendWhatsAppMessage(phone, 'manual_order_pending', {
      id: orderId,
      customerName: name,
    });
    
    const timestamp = new Date().toISOString();
    const logEntry: any = {
      type: "pedidoCriado",
      status: success ? "success" : "error",
      timestamp,
      message: success 
        ? "Mensagem automática 'Pedido Criado' enviada via WhatsApp."
        : "Falha ao enviar mensagem automática 'Pedido Criado'."
    };
    
    if (!success) {
      logEntry.error = "Evolution API / Webhook return failure or phone is invalid.";
    }
    
    const whatsappMessages = orderData.whatsappMessages || {};
    whatsappMessages.pedidoCriado = true;
    
    const whatsappLogs = orderData.whatsappLogs || [];
    whatsappLogs.push(logEntry);
    
    await orderRef.update({
      whatsappMessages,
      whatsappLogs,
      updatedAt: new Date()
    });

    const user = (req as any).user;
    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'SEND_MANUAL_WHATSAPP',
      resource: 'orders',
      resourceId: orderId,
      ip: req.ip
    });
    
    res.json({ success, logEntry });
  } catch (error: any) {
    logger.error(`❌ [MANUAL-ORDER-WA-ERR] Error sending manual order whatsapp: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Shipping Integration Config Endpoints (SEM SALVAR/RETORNAR TOKEN NO FIRESTORE)
const ALLOWED_SHIPPING_URLS = [
  'https://www.melhorenvio.com.br',
  'https://sandbox.melhorenvio.com.br',
  'https://melhorenvio.com.br'
];

apiRouter.get("/shipping/config", adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    const dbInstance = getDb();
    const settingsSnap = await dbInstance.collection('settings').doc('melhorenvio').get();
    let baseUrl = process.env.MELHOR_ENVIO_URL || "https://sandbox.melhorenvio.com.br";
    
    if (settingsSnap.exists) {
      const data = settingsSnap.data();
      if (data && data.baseUrl && ALLOWED_SHIPPING_URLS.includes(String(data.baseUrl).trim())) {
        baseUrl = String(data.baseUrl).trim();
      }
    }
    
    res.json({
      hasToken: Boolean(process.env.MELHOR_ENVIO_TOKEN),
      baseUrl
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/shipping/config", adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    const { baseUrl } = req.body;
    const dbInstance = getDb();
    
    const sanitizedUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!ALLOWED_SHIPPING_URLS.includes(sanitizedUrl)) {
      return res.status(400).json({ 
        error: "URL do Melhor Envio não autorizada. As URLs permitidas são: " + ALLOWED_SHIPPING_URLS.join(', ') 
      });
    }
    
    // NUNCA grava token no Firestore. Atualiza apenas a baseUrl.
    await dbInstance.collection('settings').doc('melhorenvio').set({
      baseUrl: sanitizedUrl,
      updatedAt: new Date()
    }, { merge: true });

    const user = (req as any).user;
    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'UPDATE_SHIPPING_CONFIG',
      resource: 'settings/melhorenvio',
      ip: req.ip
    });

    res.json({ success: true, message: "URL do Melhor Envio atualizada com sucesso. O token de API deve ser configurado via variável de ambiente MELHOR_ENVIO_TOKEN no Secret Manager." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/shipping/create-label", adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'INVALID_ORDER', message: 'ID do pedido é obrigatório para geração de etiqueta.' });
    }

    const db = getDb();
    const orderRef = db.collection('orders').doc(orderId);
    const lockRef = db.collection('shipping_locks').doc(orderId);

    // 1. Fetch Order Document First
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;

    // 2. Eligibility Guard (includes local delivery check for labels)
    const eligibility = assertShippingOrderEligible(orderData, { forMelhorEnvioLabel: true });
    if (!eligibility.eligible) {
      return res.status(400).json({
        error: eligibility.error,
        message: eligibility.message
      });
    }

    // 3. Official Service ID Validation (OFFICIAL SNAPSHOT FROM ORDER ONLY)
    // PROHIBITED: req.body.serviceId and default || 2
    const rawServiceId = orderData.shipping?.serviceId !== undefined
      ? orderData.shipping?.serviceId
      : orderData.shippingServiceId;
    
    const officialServiceId = rawServiceId !== undefined && rawServiceId !== null ? Number(rawServiceId) : NaN;

    if (!Number.isFinite(officialServiceId) || officialServiceId <= 0) {
      return res.status(400).json({
        error: 'SHIPPING_SERVICE_NOT_SELECTED',
        message: 'Pedido não possui um serviço de envio (serviceId) oficial válido selecionado.'
      });
    }

    // 4. Idempotency: Check if label already exists on order
    const existingLabelId = orderData.shippingLabelId || orderData.shipping?.labelId || orderData.shipping?.label?.id;
    if (existingLabelId) {
      const existingUrl = orderData.shippingLabelUrl || orderData.shipping?.label?.url || null;
      const existingCreated = orderData.shippingLabelCreatedAt || orderData.shipping?.label?.createdAt;
      return res.json({
        success: true,
        idempotent: true,
        message: `Etiqueta já gerada anteriormente para o pedido ${orderId}.`,
        id: existingLabelId,
        redirectUrl: existingUrl,
        label: orderData.shipping?.label || {
          id: existingLabelId,
          status: 'created',
          url: existingUrl,
          createdAt: existingCreated,
          provider: 'melhor_envio'
        }
      });
    }

    const labelOperationId = orderData.labelOperationId || `label_${orderId}`;

    // 5. Lock & Reconciliation Check
    const lockSnap = await lockRef.get();
    const lockData = lockSnap.exists ? lockSnap.data() : null;

    if (lockData?.status === 'completed' && lockData.labelId) {
      return res.json({
        success: true,
        idempotent: true,
        message: `Etiqueta já gerada anteriormente para o pedido ${orderId}.`,
        id: lockData.labelId,
        redirectUrl: lockData.redirectUrl || null,
        createdAt: lockData.updatedAt
      });
    }

    if (lockData?.status === 'processing') {
      const startedAt = new Date(lockData.startedAt).getTime();
      const now = Date.now();
      if (now - startedAt < 30000) {
        return res.status(409).json({
          error: 'OPERATION_IN_PROGRESS',
          message: 'Operação de criação de etiqueta em andamento para este pedido. Por favor, aguarde.'
        });
      }
    }

    // 6. RECONCILE FIRST IF RECONCILIATION REQUIRED OR LOCK EXISTS (NOT FAILED CONFIRMED)
    if (lockData?.status === 'reconciliation_required' || (lockData && lockData.status !== 'failed_confirmed')) {
      try {
        const reconciliation = await melhorEnvio.reconcileLabelWithProvider(orderId, labelOperationId);
        if (reconciliation.found) {
          const timestamp = new Date().toISOString();
          const labelId = reconciliation.labelId!;
          const redirectUrl = reconciliation.redirectUrl || null;

          const historyEntry = {
            type: 'shipping_label_reconciled',
            status: 'label_created',
            labelId,
            timestamp,
            message: `Etiqueta reconciliada com sucesso via Melhor Envio (ID: ${labelId})`,
            operator: user?.email || user?.uid || 'Admin'
          };

          const labelCanonicalModel = {
            id: labelId,
            status: 'created',
            url: redirectUrl,
            createdAt: timestamp,
            updatedAt: timestamp,
            provider: 'melhor_envio',
            providerReference: reconciliation.providerReference || labelId
          };

          await lockRef.set({
            orderId,
            labelOperationId,
            status: 'completed',
            labelId,
            redirectUrl,
            providerReference: reconciliation.providerReference || labelId,
            updatedAt: timestamp
          }, { merge: true });

          const updatePayload: any = {
            shippingLabelId: labelId,
            shippingLabelUrl: redirectUrl,
            shippingLabelCreatedAt: timestamp,
            labelOperationId,
            'shipping.label': labelCanonicalModel,
            'shipping.labelId': labelId,
            'shipping.status': 'label_created',
            shippingStatus: 'label_created',
            updatedAt: (await import('firebase-admin')).default.firestore.FieldValue.serverTimestamp(),
            history: (await import('firebase-admin')).default.firestore.FieldValue.arrayUnion(historyEntry)
          };

          if (reconciliation.trackingCode) {
            updatePayload['shipping.trackingCode'] = reconciliation.trackingCode;
            updatePayload.trackingCode = reconciliation.trackingCode;
          }

          await orderRef.update(updatePayload);

          return res.json({
            success: true,
            idempotent: true,
            reconciled: true,
            id: labelId,
            redirectUrl,
            label: labelCanonicalModel
          });
        }
      } catch (recErr: any) {
        const sanitizedMsg = sanitizeSecrets(recErr.message || 'Erro ao comunicar com provedor para reconciliação');
        await lockRef.set({
          orderId,
          labelOperationId,
          status: 'reconciliation_required',
          error: sanitizedMsg,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        return res.status(502).json({
          error: 'RECONCILIATION_REQUIRED',
          message: 'Não foi possível determinar o estado da etiqueta junto ao provedor após timeout/falha anterior. Não é possível tentar nova compra.'
        });
      }
    }

    // 7. ACQUIRE LOCK BEFORE EXTERNAL CALL
    await lockRef.set({
      orderId,
      labelOperationId,
      status: 'processing',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      operator: user?.email || user?.uid || 'Admin'
    });

    await orderRef.update({
      labelOperationId,
      updatedAt: (await import('firebase-admin')).default.firestore.FieldValue.serverTimestamp()
    });

    // 8. CONSTRUCT CANONICAL PAYLOAD
    const cleanCep = String(orderData.cep || orderData.address?.cep || '').replace(/\D/g, '');
    const destName = String(orderData.customerName || orderData.customer?.name || orderData.name || 'Cliente').trim();
    const destPhone = String(orderData.customerPhone || orderData.phone || '47999999999').replace(/\D/g, '');
    const destEmail = String(orderData.customerEmail || orderData.email || 'cliente@fpacstore.com').trim();
    const destCpf = String(orderData.cpf || orderData.customerCpf || '').replace(/\D/g, '');
    
    let destStreet = '';
    let destNumber = 'SN';
    let destNeighborhood = '';
    let destCity = '';
    let destState = 'SC';

    if (typeof orderData.address === 'object' && orderData.address) {
      destStreet = String(orderData.address.street || orderData.address.address || '').trim();
      destNumber = String(orderData.address.number || 'SN').trim();
      destNeighborhood = String(orderData.address.neighborhood || '').trim();
      destCity = String(orderData.address.city || '').trim();
      destState = String(orderData.address.state || 'SC').trim().toUpperCase();
    } else {
      destStreet = String(orderData.address || orderData.street || '').trim();
      destNumber = String(orderData.number || 'SN').trim();
      destNeighborhood = String(orderData.neighborhood || '').trim();
      destCity = String(orderData.city || '').trim();
      destState = String(orderData.state || 'SC').trim().toUpperCase();
    }

    if (!cleanCep || cleanCep.length !== 8 || !destStreet || !destName) {
      await lockRef.set({
        orderId,
        labelOperationId,
        status: 'failed_confirmed',
        error: 'Endereço de entrega incompleto',
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return res.status(400).json({
        error: 'INVALID_SHIPPING_ADDRESS',
        message: 'Endereço de entrega incompleto para geração de etiqueta. Verifique CEP, logradouro e nome do destinatário.'
      });
    }

    const originAddress = {
      name: "F PAC STORE",
      phone: "47997465602",
      email: "fpacstore@gmail.com",
      postal_code: "89234100",
      address: "Rua Paranaguamirim",
      number: "1395",
      neighborhood: "Paranaguamirim",
      city: "Joinville",
      state: "SC"
    };

    const items = (orderData.items || []).map((it: any) => ({
      name: String(it.name || it.title || 'Produto F PAC').trim(),
      quantity: Number(it.quantity || 1),
      unitary_value: Number(it.price || it.unitPrice || 0)
    }));

    let totalWeight = 0;
    let maxHeight = 0;
    let maxWidth = 0;
    let maxLength = 0;

    (orderData.items || []).forEach((it: any) => {
      const qty = Number(it.quantity || 1);
      const w = Number(it.weight || 0.3);
      const h = Number(it.height || 5);
      const wd = Number(it.width || 17);
      const lg = Number(it.length || 11);

      totalWeight += w * qty;
      maxHeight += h * qty;
      maxWidth = Math.max(maxWidth, wd);
      maxLength = Math.max(maxLength, lg);
    });

    const volumes = [{
      height: Number((maxHeight || 5).toFixed(2)),
      width: Number((maxWidth || 17).toFixed(2)),
      length: Number((maxLength || 11).toFixed(2)),
      weight: Number((totalWeight || 0.3).toFixed(2))
    }];

    const declaredValue = Number(orderData.total || orderData.subtotal || 0);

    const mePayload = {
      orderId,
      labelOperationId,
      serviceId: officialServiceId,
      from: originAddress,
      to: {
        name: destName,
        phone: destPhone,
        email: destEmail,
        document: destCpf,
        postal_code: cleanCep,
        address: destStreet,
        number: destNumber,
        neighborhood: destNeighborhood,
        city: destCity,
        state: destState
      },
      items,
      volumes,
      totalValue: declaredValue
    };

    // 9. EXTERNAL CALL WITH CLASSIFIED ERROR HANDLING
    let labelResult: any = null;
    try {
      labelResult = await melhorEnvio.createLabel(mePayload);
    } catch (extErr: any) {
      const sanitizedMsg = sanitizeSecrets(extErr.message || 'Erro de comunicação com o Melhor Envio');
      const is4xxClientError = typeof extErr.status === 'number' && extErr.status >= 400 && extErr.status < 500;
      const isAmbiguousError = !is4xxClientError;

      const newLockStatus = isAmbiguousError ? 'reconciliation_required' : 'failed_confirmed';

      await lockRef.set({
        orderId,
        labelOperationId,
        status: newLockStatus,
        error: sanitizedMsg,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return res.status(isAmbiguousError ? 502 : 400).json({
        error: isAmbiguousError ? 'RECONCILIATION_REQUIRED' : 'MELHOR_ENVIO_API_ERROR',
        message: sanitizedMsg
      });
    }

    // 10. UPDATE ORDER & LOCK ON SUCCESS
    const labelId = labelResult?.id;
    if (labelId) {
      const timestamp = new Date().toISOString();
      const redirectUrl = labelResult.redirectUrl || null;

      const historyEntry = {
        type: 'shipping_label_created',
        status: 'label_created',
        labelId,
        timestamp,
        message: `Etiqueta gerada via Melhor Envio (ID: ${labelId})`,
        operator: user?.email || user?.uid || 'Admin'
      };

      const labelCanonicalModel = {
        id: labelId,
        status: 'created',
        url: redirectUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
        provider: 'melhor_envio',
        providerReference: labelId
      };

      await lockRef.set({
        orderId,
        labelOperationId,
        status: 'completed',
        labelId,
        redirectUrl,
        providerReference: labelId,
        updatedAt: timestamp
      }, { merge: true });

      await orderRef.update({
        shippingLabelId: labelId,
        shippingLabelUrl: redirectUrl,
        shippingLabelCreatedAt: timestamp,
        labelOperationId,
        'shipping.label': labelCanonicalModel,
        'shipping.labelId': labelId,
        'shipping.status': 'label_created',
        shippingStatus: 'label_created',
        updatedAt: (await import('firebase-admin')).default.firestore.FieldValue.serverTimestamp(),
        history: (await import('firebase-admin')).default.firestore.FieldValue.arrayUnion(historyEntry)
      });

      await recordAuditLog({
        userId: user?.uid,
        userEmail: user?.email,
        action: 'CREATE_SHIPPING_LABEL',
        resource: 'shipping/create-label',
        resourceId: orderId,
        ip: req.ip
      });

      return res.json({
        success: true,
        idempotent: false,
        id: labelId,
        redirectUrl,
        label: labelCanonicalModel
      });
    } else {
      await lockRef.set({
        orderId,
        labelOperationId,
        status: 'reconciliation_required',
        error: 'Resposta inválida do Melhor Envio (sem ID de etiqueta)',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return res.status(500).json({
        error: 'LABEL_CREATION_FAILED',
        message: 'A API do Melhor Envio não retornou um ID de etiqueta válido.'
      });
    }
  } catch (error: any) {
    const sanitizedMsg = sanitizeSecrets(error.message || 'Erro interno ao processar etiqueta.');
    res.status(500).json({ error: sanitizedMsg });
  }
});

// Google Sheets Bidirectional Sync-Back (PROTECTED & VALIDATED)
apiRouter.post("/sheets/sync-back", adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const validation = validateSheetSyncPayload(req.body);

    if (!validation.isValid || !validation.sanitized) {
      return res.status(400).json({ error: validation.error || "Payload inválido para sincronização" });
    }

    const { products, orders, investments, cashflow, traffic } = validation.sanitized;
    const dbInstance = getDb();
    if (!dbInstance) {
      return res.status(503).json({ error: "Banco de dados não disponível" });
    }

    logger.info(`📥 [SHEETS-SYNC-BACK] Atualizando banco de dados por solicitação autenticada de ${user?.email || user?.uid}...`);

    // 1. Atualizar Produtos
    if (products && Array.isArray(products)) {
      for (const p of products) {
        if (!p.slug) continue;
        const querySnapshot = await dbInstance.collection('products').where('slug', '==', p.slug).get();
        if (!querySnapshot.empty) {
          const docId = querySnapshot.docs[0].id;
          const updateData: any = {};
          
          if (p.stock !== undefined) updateData.stock = Number(p.stock);
          if (p.price !== undefined) updateData.price = Number(p.price);
          if (p.cost !== undefined) {
            updateData.cost = Number(p.cost);
            updateData.costPrice = Number(p.cost);
          }
          
          updateData.updatedAt = new Date();
          await dbInstance.collection('products').doc(docId).update(updateData);
        }
      }
    }

    // 2. Atualizar Pedidos
    if (orders && Array.isArray(orders)) {
      for (const o of orders) {
        if (!o.id) continue;
        const docRef = dbInstance.collection('orders').doc(o.id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const validStatuses = ['recebido', 'separacao_corte', 'estamparia', 'costura', 'embalagem', 'enviado', 'entregue', 'cancelado', 'received', 'separacao', 'shipped', 'delivered', 'canceled'];
          let statusVal = String(o.status || '').trim().toLowerCase();
          
          if (statusVal === 'pagamento aprovado' || statusVal === 'payment_approved') statusVal = 'embalagem';
          if (statusVal === 'recebido' || statusVal === 'aguardando pagamento' || statusVal === 'payment_pending') statusVal = 'recebido';
          if (statusVal === 'concluído' || statusVal === 'concluido') statusVal = 'entregue';
          if (statusVal === 'cancelado') statusVal = 'cancelado';
          if (statusVal === 'enviado') statusVal = 'enviado';

          if (validStatuses.includes(statusVal)) {
            const orderData = docSnap.data();
            const alreadyReverted = orderData?.stockReverted || orderData?.stockRevertedAcknowledged;
            const isCancellation = statusVal === 'cancelado' || statusVal === 'canceled';

            await docRef.update({
              status: statusVal,
              updatedAt: new Date()
            });

            if (isCancellation && !alreadyReverted && orderData?.items) {
              try {
                logger.info(`📦 [SHEETS-SYNC-BACK] Revertendo estoque para pedido cancelado: ${o.id}`);
                const { adjustStock } = await import("./server/services/store.service.js");
                await adjustStock(orderData.items, 'add');
                await docRef.update({
                  stockReverted: true,
                  stockRevertedAcknowledged: true
                });
              } catch (stockErr: any) {
                logger.error(`❌ [SHEETS-SYNC-BACK] Falha ao reverter estoque do pedido ${o.id}:`, stockErr);
              }
            }
          }
        }
      }
    }

    // 3. Atualizar Investimentos
    if (investments && Array.isArray(investments)) {
      for (const inv of investments) {
        if (!inv.id) continue;
        const isLocalPrueba = inv.id.startsWith('local-') || inv.id.startsWith('inv-');
        const docId = isLocalPrueba ? dbInstance.collection('financial_investments').doc().id : inv.id;
        
        await dbInstance.collection('financial_investments').doc(docId).set({
          id: docId,
          date: inv.date || new Date().toISOString().split('T')[0],
          description: inv.description || '',
          category: inv.category || 'fornecedores',
          amount: Number(inv.amount || 0)
        }, { merge: true });
      }
    }

    // 4. Atualizar Fluxo de Caixa
    if (cashflow && Array.isArray(cashflow)) {
      for (const cf of cashflow) {
        if (!cf.id) continue;
        const isLocalPrueba = cf.id.startsWith('local-') || cf.id.startsWith('cf-');
        const docId = isLocalPrueba ? dbInstance.collection('financial_cashflow').doc().id : cf.id;
        
        await dbInstance.collection('financial_cashflow').doc(docId).set({
          id: docId,
          date: cf.date || new Date().toISOString().split('T')[0],
          type: cf.type || 'out',
          description: cf.description || '',
          category: cf.category || 'Outros',
          amount: Number(cf.amount || 0)
        }, { merge: true });
      }
    }

    // 5. Atualizar Tráfego
    if (traffic && Array.isArray(traffic)) {
      for (const tr of traffic) {
        if (!tr.id) continue;
        const isLocalPrueba = tr.id.startsWith('local-') || tr.id.startsWith('tr-');
        const docId = isLocalPrueba ? dbInstance.collection('financial_traffic').doc().id : tr.id;
        
        await dbInstance.collection('financial_traffic').doc(docId).set({
          id: docId,
          date: tr.date || new Date().toISOString().split('T')[0],
          campaignName: tr.campaignName || '',
          amountSpent: Number(tr.amountSpent || 0),
          clicks: Number(tr.clicks || 0),
          conversions: Number(tr.conversions || 0),
          roas: Number(tr.roas || 0),
          lucro: Number(tr.lucro || 0)
        }, { merge: true });
      }
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'SHEETS_SYNC_BACK',
      resource: 'google_sheets_sync',
      ip: req.ip
    });

    logger.info("✅ [SHEETS-SYNC-BACK] Banco de dados sincronizado com sucesso com validações de segurança.");
    res.json({ success: true, message: "Site sincronizado em tempo real com as alterações enviadas com validação e segurança!" });
  } catch (error: any) {
    logger.error("❌ [SHEETS-SYNC-BACK] Erro ao sincronizar:", error);
    res.status(500).json({ error: error.message });
  }
});

// Public Order Tracking Verification Endpoint
apiRouter.get("/orders/:orderId/tracking", publicApiLimiter, async (req, res) => {
  try {
    const { orderId } = req.params;
    const database = getDb();
    if (!database) return res.status(503).json({ error: "Database not ready" });

    const doc = await database.collection('orders').doc(orderId).get();
    if (!doc.exists) return res.status(404).json({ error: "ORDER_NOT_FOUND", message: "Pedido não encontrado." });

    const data = doc.data()!;
    const isLocal = isLocalDeliveryOrder(data);

    res.json({
      success: true,
      orderId,
      shippingStatus: data.shipping?.status || data.shippingStatus || 'pending',
      carrier: data.shipping?.carrier || data.carrier || (isLocal ? 'Entrega Própria (Joinville)' : 'Correios'),
      trackingCode: data.shipping?.trackingCode || data.trackingCode || null,
      trackingUrl: data.shipping?.trackingUrl || data.trackingUrl || null,
      inTransitAt: data.shipping?.inTransitAt || data.inTransitAt || null,
      deliveredAt: data.shipping?.deliveredAt || data.deliveredAt || null,
      isLocalDelivery: isLocal,
      trackingEvents: data.shipping?.trackingEvents || []
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Shipping Webhook Tracking Integration Endpoint
function mapProviderShippingStatus(value: unknown): ShippingStatus | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();

  const mapping: Record<string, ShippingStatus> = {
    'pending': 'pending',
    'label_created': 'label_created',
    'shipped': 'shipped',
    'in_transit': 'in_transit',
    'delivered': 'delivered',
    'returned': 'returned',
    'posted': 'shipped',
    'postado': 'shipped',
    'em_transito': 'in_transit',
    'entregue': 'delivered',
    'devolvido': 'returned'
  };

  if (mapping[normalized]) {
    return mapping[normalized];
  }

  if (isShippingStatus(normalized)) {
    return normalized as ShippingStatus;
  }

  return null;
}

export async function shippingWebhookTrackingHandler(req: express.Request, res: express.Response) {
  try {
    // 1. Secret check
    if (!process.env.SHIPPING_WEBHOOK_SECRET) {
      return res.status(503).json({
        error: 'WEBHOOK_NOT_CONFIGURED'
      });
    }

    // 2. Header check
    const signature = req.get('X-Webhook-Signature');
    const timestamp = req.get('X-Webhook-Timestamp');

    if (!signature || !timestamp) {
      return res.status(401).json({
        error: 'UNAUTHORIZED'
      });
    }

    // 3. Timestamp age check
    const MAX_WEBHOOK_AGE_MS = 300000;
    const timestampNum = Number(timestamp);
    if (isNaN(timestampNum) || Math.abs(Date.now() - timestampNum) > MAX_WEBHOOK_AGE_MS) {
      return res.status(401).json({
        error: 'UNAUTHORIZED'
      });
    }

    // 4. Raw body check & HMAC SHA-256 calculation
    const rawBody = (req as any).rawBody;

    if (!rawBody) {
      return res.status(400).json({
        error: 'RAW_BODY_NOT_AVAILABLE'
      });
    }

    const rawBodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
    const signedPayload = Buffer.concat([
      Buffer.from(`${timestamp}.`, 'utf8'),
      rawBodyBuffer
    ]);

    const expectedSignature = crypto
      .createHmac('sha256', process.env.SHIPPING_WEBHOOK_SECRET)
      .update(signedPayload)
      .digest('hex');

    let receivedSignature = signature.trim();
    if (receivedSignature.startsWith('sha256=')) {
      receivedSignature = receivedSignature.slice(7);
    }

    const receivedBuffer = Buffer.from(receivedSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
      return res.status(401).json({
        error: 'UNAUTHORIZED'
      });
    }

    // 5. Read body ONLY after HMAC check
    const { orderId, status: newStatus, trackingCode, carrier, trackingUrl, eventId, eventAt, note } = req.body || {};

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return res.status(400).json({
        error: 'INVALID_WEBHOOK_EVENT'
      });
    }

    if (!orderId) {
      return res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'orderId é obrigatório.'
      });
    }

    const canonicalStatus = mapProviderShippingStatus(newStatus);
    if (!canonicalStatus) {
      return res.status(400).json({
        error: 'INVALID_PROVIDER_SHIPPING_STATUS'
      });
    }

    const db = getDb();
    const cleanEventId = eventId.trim();
    const eventKey = `shipping_event_${cleanEventId}`;

    // Idempotency check
    const idempRef = db.collection('idempotency_records').doc(eventKey);
    const idempSnap = await idempRef.get();
    if (idempSnap.exists) {
      return res.json({ success: true, idempotent: true, message: 'Evento de rastreio já processado anteriormente.' });
    }

    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data()!;
    const currentShippingStatus = normalizeShippingStatus(
      orderData.shipping?.status || orderData.shippingStatus || 'pending'
    );

    // Terminal/Out-of-Order protection:
    // If order is delivered or returned, do NOT regress status
    let updateStatus = true;
    if (currentShippingStatus === 'delivered' && canonicalStatus !== 'delivered' && canonicalStatus !== 'returned') {
      updateStatus = false;
    }
    if (currentShippingStatus === 'returned' && canonicalStatus !== 'returned') {
      updateStatus = false;
    }

    // Check transition validity if we plan to change status
    if (updateStatus && currentShippingStatus !== canonicalStatus) {
      if (!canTransitionShippingStatus(currentShippingStatus, canonicalStatus, false)) {
        updateStatus = false;
      }
    }

    const eventTimestamp = eventAt || new Date().toISOString();
    const trackingEvent = {
      eventId: cleanEventId,
      status: canonicalStatus,
      timestamp: new Date().toISOString(),
      eventAt: eventTimestamp,
      source: 'webhook',
      carrier: carrier || orderData.shipping?.carrier || 'Correios',
      trackingCode: trackingCode || orderData.shipping?.trackingCode || null,
      trackingUrl: trackingUrl || orderData.shipping?.trackingUrl || null,
      description: String(note || `Atualização logística via webhook: ${canonicalStatus}`).replace(/<[^>]*>?/gm, '').trim()
    };

    const updatePayload: any = {
      'shipping.trackingEvents': (await import('firebase-admin')).default.firestore.FieldValue.arrayUnion(trackingEvent),
      updatedAt: (await import('firebase-admin')).default.firestore.FieldValue.serverTimestamp()
    };

    if (updateStatus && currentShippingStatus !== canonicalStatus) {
      updatePayload['shipping.status'] = canonicalStatus;
      updatePayload.shippingStatus = canonicalStatus;

      if (canonicalStatus === 'in_transit') {
        updatePayload['shipping.inTransitAt'] = eventTimestamp;
        updatePayload.inTransitAt = eventTimestamp;
      }
      if (canonicalStatus === 'delivered') {
        updatePayload['shipping.deliveredAt'] = eventTimestamp;
        updatePayload.deliveredAt = eventTimestamp;
      }

      // If transitioning to shipped via webhook for first time
      if (canonicalStatus === 'shipped' && currentShippingStatus !== 'shipped' && Array.isArray(orderData.items) && orderData.items.length > 0) {
        await consumeStockReservation(orderId, orderData.items, `shipping_shipped_${orderId}`);
      }
    }

    await db.runTransaction(async (tx) => {
      tx.set(idempRef, { status: 'completed', processedAt: new Date().toISOString(), orderId, eventId: cleanEventId });
      tx.update(orderRef, updatePayload);
    });

    res.json({ success: true, updatedStatus: updateStatus ? canonicalStatus : currentShippingStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

apiRouter.post("/shipping/webhook/tracking", webhookLimiter, shippingWebhookTrackingHandler);

// Status Verification (By Order ID)
apiRouter.get("/checkout/verify/:orderId", publicApiLimiter, async (req, res) => {
  try {
    const { orderId } = req.params;
    const database = getDb();
    if (!database) return res.status(503).json({ error: "Database not ready" });
    
    const doc = await database.collection('orders').doc(orderId).get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });
    
    const data = doc.data();
    res.json({
      id: orderId,
      status: data?.status || 'received',
      paymentStatus: data?.paymentStatus || 'pending',
      point_of_interaction: data?.point_of_interaction || null
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Status Verification (By Payment ID)
apiRouter.get("/payment/status/:paymentId", publicApiLimiter, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const database = getDb();
    if (!database) return res.status(503).json({ error: "Database not ready" });
    
    let query = await database.collection('orders')
      .where('mercadoPagoId', '==', String(paymentId))
      .limit(1)
      .get();

    if (query.empty) {
      query = await database.collection('orders')
        .where('payment_id', '==', String(paymentId))
        .limit(1)
        .get();
    }

    if (query.empty) return res.status(404).json({ error: "Payment not found in database" });
    
    const orderDoc = query.docs[0];
    const order = orderDoc.data();
    const orderId = orderDoc.id;

    if (order.status !== 'Pagamento Aprovado' && order.paymentStatus !== 'approved') {
      logger.info(`🔄 [PAYMENT-SYNC] Proactive check for Payment ID ${paymentId} (Order: ${orderId})`);
      try {
        const mpPayment = await mpService.getPayment(String(paymentId));
        if (mpPayment && mpPayment.status === 'approved') {
          logger.info(`✅ [PAYMENT-SYNC] Found approved status on MP for ${paymentId}. Updating DB...`);
          const { processPaymentUpdate } = await import('./server/services/payment.service.js');
          await processPaymentUpdate(orderId, mpPayment);
          
          const updatedDoc = await database.collection('orders').doc(orderId).get();
          const updatedData = updatedDoc.data()!;
          return res.json({
            orderId,
            status: updatedData.status,
            paymentStatus: updatedData.paymentStatus,
            synced: true
          });
        }
      } catch (mpErr) {
        logger.error(`⚠️ [PAYMENT-SYNC] Failed to fetch MP status for ${paymentId}`, mpErr);
      }
    }

    res.json({
      orderId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      synced: false
    });
  } catch (e: any) {
    logger.error(`❌ [PAYMENT-STATUS-ERR] ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.use("/api", apiRouter);

// Catch-all 404 handler for API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Rota de API não encontrada: ${req.method} ${req.originalUrl}` });
});

// Global Express error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api')) {
    logger.error(`❌ [API-ERROR] ${req.method} ${req.path}:`, err);
    return res.status(500).json({ error: err?.message || "Erro interno no servidor de API" });
  }
  next(err);
});

// Serve uploads statically
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

// 6. Dynamic Application Mode (Vite Dev vs Prod)
async function bootstrap() {
  const isBundled = typeof __filename !== "undefined" && __filename.includes("server.cjs");
  const isDev = process.env.NODE_ENV !== 'production' && !isBundled;

  if (isDev) {
    try {
      app.use(express.static(path.join(process.cwd(), "public")));

      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: false,
          watch: null,
          host: '0.0.0.0',
          port: 3000
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      app.listen(PORT, "0.0.0.0", () => {
        logger.info(`✅ [DEV SERVER] Running on port ${PORT}`);
      });
    } catch (err) {
      logger.error("Failed to start Vite middleware", err);
      app.listen(PORT, "0.0.0.0", () => {
        logger.info(`✅ [FALLBACK SERVER] Running on port ${PORT}`);
      });
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        if (req.path.startsWith("/api")) return res.status(404).end();
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
    app.listen(PORT, "0.0.0.0", () => {
      logger.info(`✅ [PROD SERVER] Running on port ${PORT}`);
    });
  }
}

bootstrap();

setTimeout(async () => {
  try {
    const { autoCancelUnpaidOrders } = await import("./server/services/payment.service.js");
    await autoCancelUnpaidOrders();
  } catch (err: any) {
    logger.error("❌ [STARTUP-ERR] Initial auto-cancel scan failed", err);
  }
}, 5000);

setInterval(async () => {
  try {
    const { runAbandonedCheckoutDetector } = await import("./server/services/automation.service.js");
    await runAbandonedCheckoutDetector();
  } catch (err: any) {
    logger.error("❌ [CRON-INTERVAL-ERR] Background abandoned checkout scan failed", err);
  }

  try {
    const { autoCancelUnpaidOrders } = await import("./server/services/payment.service.js");
    await autoCancelUnpaidOrders();
  } catch (err: any) {
    logger.error("❌ [CRON-INTERVAL-ERR] Background auto-cancel unpaid orders scan failed", err);
  }
}, 10 * 60 * 1000);

export default app;

import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";

// 1. Load Environment Configuration
dotenv.config();

// 2. Imports from internal architecture
import { getDb } from "./server/firebase.js";
import { logger } from "./server/utils/logger.js";
import { mpService } from "./server/services/mp.service.js";
import { MelhorEnvioService } from "./server/services/melhor-envio.service.js";
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
  exportFinancialCsv
} from "./server/controllers/admin.controller.js";

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

app.use(express.json({ limit: '10mb' }));

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

    // Idempotência: verificar se etiqueta já foi gerada para este pedido
    if (orderId) {
      const db = getDb();
      const orderSnap = await db.collection('orders').doc(orderId).get();
      if (orderSnap.exists) {
        const orderData = orderSnap.data();
        if (orderData?.shippingLabelId) {
          return res.status(400).json({ 
            error: `Etiqueta já gerada anteriormente para o pedido ${orderId} (Etiqueta ID: ${orderData.shippingLabelId}).` 
          });
        }
      }
    }

    const result = await melhorEnvio.createLabel(req.body);

    if (orderId && result?.id) {
      const db = getDb();
      await db.collection('orders').doc(orderId).update({
        shippingLabelId: result.id,
        shippingLabelCreatedAt: new Date().toISOString()
      });
    }

    await recordAuditLog({
      userId: user?.uid,
      userEmail: user?.email,
      action: 'CREATE_SHIPPING_LABEL',
      resource: 'shipping/create-label',
      resourceId: orderId,
      ip: req.ip
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

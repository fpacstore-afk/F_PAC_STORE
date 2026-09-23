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
import { MelhorEnvioService, melhorEnvio, sanitizeSecrets } from "./server/services/melhor-envio.service.js";
import { processPayment, resumePayment } from "./server/controllers/checkout.controller.js";
import { checkoutIdentity } from "./server/middleware/checkoutIdentity.js";
import { verifyCheckout, paymentStatus } from "./server/controllers/paymentStatus.controller.js";
import { getPublicCatalog } from "./server/services/publicCatalog.service.js";
import { catalogReadLimiter, paymentStatusLimiter, leadCaptureLimiter } from "./server/middleware/rateLimiter.js";
import { cancelOrderController } from "./server/controllers/order.controller.js";
import { handleWebhook } from "./server/controllers/webhook.controller.js";
import { 
  handleSaveLead, 
  handleCancelRecovery,
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
import { uploadAdminMediaController } from "./server/controllers/media.controller.js";
import { uploadArtwork, readArtwork } from './server/controllers/artwork.controller.js';
import { 
  publicApiLimiter, 
  checkoutLimiter, 
  adminApiLimiter, 
  webhookLimiter 
} from "./server/middleware/rateLimiter.js";
import { validateSheetSyncPayload } from "./server/utils/sheetValidation.js";
import { buildAutomaticCostMetadata, inferProductCostSelector, resolveProductCostProfile } from "./shared/productCostProfiles.js";
import { recordAuditLog } from "./server/utils/auditLogger.js";
import { migrateOrdersToCanonical } from "./server/services/migration.service.js";
import { assertShippingOrderEligible, isLocalDeliveryOrder, canTransitionShippingStatus, normalizeShippingStatus, isShippingStatus } from "./server/services/stateMachine.service.js";
import { verifyOrderTrackingAccess, sanitizeTrackingResponse } from "./server/services/tracking.service.js";
import { consumeStockReservation } from "./server/services/store.service.js";
import { getInstagramConfiguration, getInstagramFeed, saveInstagramToken } from "./server/services/instagram.service.js";
import { getPublicClubRanking } from "./server/services/club.service.js";
import { runIntegrityTestSuite } from "./server/tests/integrity.test.js";
import {
  updateOrderProductionStatus,
  updateOrderProductionPriority,
  updateOrderProductionAssignment,
  updateOrderProductionDueDate,
  addOrderProductionNote,
  addOrderShippingNote,
  updateOrderPaymentStatus,
  updateOrderShippingStatus,
  recordStockMovement,
  exportOrdersCsv,
  exportFinancialCsv,
  authorizeOrderReturnController,
  processPhysicalReceiveController,
  registerManualPaymentController,
  processOrderRefundController,
  reverseOrderRefundController,
  repairRefundReversalBalanceController,
  correctRefundReversalOrderTotalController,
  getOrderFinancialEventsController,
  getFinancialLedgerController,
  createFinancialExpenseController,
  voidFinancialExpenseController,
  createFinancialInvestmentController,
  voidFinancialInvestmentController,
  createFinancialTrafficController,
  voidFinancialTrafficController,
  recordOrderActualShippingCostController,
  recordOrderGatewayFeeController,
  createAccountsPayableController,
  payAccountsPayableController,
  voidAccountsPayableController,
  getAccountsPayablesController,
  createSupplierController,
  updateSupplierController,
  deactivateSupplierController,
  getSuppliersController,
  getCashForecastController,
  previewHistoricalOrderCloseout,
  executeHistoricalOrderCloseout,
  createManualOrderController
} from "./server/controllers/admin.controller.js";
import {
  getCommercialActionsController,
  getCommercialActionByIdController,
  getCommercialActionEventsController,
  createCommercialActionController,
  approveCommercialActionController,
  startCommercialActionController,
  completeCommercialActionController,
  dismissCommercialActionController,
  cancelCommercialActionController,
  addCommercialActionNoteController,
  getCommercialGoalsController,
  createCommercialGoalController,
  updateCommercialGoalStatusController,
  getCommercialGoalEvaluationController
} from "./server/controllers/commercialGovernance.controller.js";
import {
  getForecastBaselineController,
  createCommercialForecastController,
  getCommercialForecastsController,
  getCommercialForecastByIdController,
  updateCommercialForecastController,
  recalculateCommercialForecastController,
  simulateForecastScenarioController,
  convertScenarioToActionController
} from "./server/controllers/commercialForecast.controller.js";
import {
  getCommercialBudgetsController,
  getCommercialBudgetByIdController,
  getCommercialBudgetEventsController,
  createCommercialBudgetController,
  updateCommercialBudgetController,
  activateCommercialBudgetController,
  rebudgetCommercialBudgetController,
  recalculateCommercialBudgetController,
  archiveCommercialBudgetController,
  getCommercialBudgetBaselinePreviewController
} from "./server/controllers/commercialBudget.controller.js";
import {
  getCommercialExecutionCyclesController,
  getCommercialExecutionCycleByIdController,
  getCommercialExecutionEventsController,
  createCommercialExecutionCycleController,
  updateCommercialExecutionCycleController,
  activateCommercialExecutionCycleController,
  completeCommercialExecutionCycleController,
  archiveCommercialExecutionCycleController,
  getCommercialExecutionDashboardController,
  recalculateCommercialExecutionCycleController,
  addCommercialActionToCycleController,
  updateCommercialActionController,
  readyCommercialActionController,
  startCommercialActionController as startCommercialExecutionActionController,
  blockCommercialActionController,
  unblockCommercialActionController,
  completeCommercialActionController as completeCommercialExecutionActionController,
  cancelCommercialActionController as cancelCommercialExecutionActionController,
  recalculateCommercialActionImpactController
} from "./server/controllers/commercialExecution.controller.js";
import {
  listCommercialExecutionReviewsController,
  getCommercialExecutionReviewController,
  getCommercialExecutionReviewDashboardController,
  listCommercialExecutionReviewActionsController,
  listCommercialExecutionReviewEventsController,
  createCommercialExecutionReviewController,
  updateCommercialExecutionReviewController,
  generateCommercialExecutionReviewController,
  recalculateCommercialExecutionReviewController,
  approveCommercialExecutionReviewController,
  archiveCommercialExecutionReviewController,
  convertInsightToCommercialActionController,
  getCommercialHistoricalLearningSummaryController
} from "./server/controllers/commercialReview.controller.js";
import { requestOrderReturnController } from "./server/controllers/order.controller.js";
import { ingestPublic } from './server/controllers/publicIngestion.controller.js';
import { ingestionLimiter } from './server/middleware/rateLimiter.js';

const app = express();
const isSandbox = process.env.DEFAULT_APP_PORT === "3000" && process.env.NODE_ENV !== "production" && !process.env.K_SERVICE;
const PORT = isSandbox ? 3000 : (Number(process.env.PORT) || 3000);

// Security Header Setup (Helmet)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CSP observation phase: report-only, no resource blocking.
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy-Report-Only",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com https://*.firebaseio.com https://*.firebasestorage.app https://api.cloudinary.com https://viacep.com.br https://ipapi.co",
      "frame-src 'self' https://*.firebaseapp.com",
    ].join("; ")
  );
  next();
});

// Restrição Estrita de CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const defaultOrigins = [
  'https://www.fpacstore.com.br',
    'https://fpacstore.com.br',
    'https://fpac-store62.web.app',
    'https://fpac-store62.firebaseapp.com',
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
  allowedHeaders: ['Content-Type', 'Authorization', 'idempotency-key', 'x-admin-api-key', 'x-sync-secret', 'x-signature', 'x-request-id', 'x-file-name', 'x-media-kind', 'x-tracking-token']
}));

app.use(['/api/events', '/api/identity'], express.json({ limit: '48kb' }));
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

apiRouter.post('/artwork/upload', leadCaptureLimiter, express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '10mb' }), uploadArtwork);
apiRouter.get('/artwork/:id', catalogReadLimiter, readArtwork);
apiRouter.post('/events/session', ingestionLimiter, ingestPublic('analytics'));
apiRouter.post('/events/promotion', ingestionLimiter, ingestPublic('promotion'));
apiRouter.post('/identity/session', ingestionLimiter, ingestPublic('quiz'));

apiRouter.get("/products", catalogReadLimiter, async (_req, res) => {
  try {
    const catalog = await getPublicCatalog();
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=15');
    res.json(catalog);
  } catch (error: any) {
    logger.error('Public product catalog unavailable', { message: error?.message || 'Unknown product catalog error' });
    res.status(503).json({ products: [], count: 0 });
  }
});

apiRouter.get("/instagram/feed", publicApiLimiter, async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit || 6);
    const feed = await getInstagramFeed(requestedLimit);
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
    res.json(feed);
  } catch (error: any) {
    logger.error("Instagram feed unavailable", {
      message: error?.message || "Unknown Instagram API error",
    });
    res.status(503).json({ configured: true, items: [], fetchedAt: null, stale: false });
  }
});

// The token is only accepted by the authenticated backend and is never stored
// in a browser-readable document or returned in an API response.
apiRouter.get('/instagram/config', adminApiLimiter, authenticateAdmin, async (_req, res) => {
  try { res.json(await getInstagramConfiguration()); }
  catch (error: any) { res.status(500).json({ error: error?.message || 'Não foi possível consultar a integração do Instagram.' }); }
});
apiRouter.post('/instagram/config', adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    await saveInstagramToken(req.body?.token, (req as any).user?.uid || 'admin');
    res.json({ success: true, message: 'Instagram conectado com segurança.' });
  } catch (error: any) { res.status(400).json({ error: error?.message || 'Não foi possível salvar o token do Instagram.' }); }
});

apiRouter.get("/club/ranking", publicApiLimiter, async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit || 10);
    const limit = Math.max(1, Math.min(10, Math.floor(requestedLimit) || 10));
    const payload = await getPublicClubRanking(limit);
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    res.json(payload);
  } catch (error: any) {
    logger.error("Public Club ranking unavailable", {
      message: error?.message || "Unknown Club ranking error",
    });
    res.status(503).json({ ranking: [], topBuyer: null, updatedAt: null });
  }
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

apiRouter.post("/checkout/process-payment", checkoutLimiter, checkoutIdentity, processPayment);
apiRouter.post("/checkout/attempt", paymentStatusLimiter, checkoutIdentity, resumePayment);
apiRouter.post("/checkout/lead", leadCaptureLimiter, handleSaveLead);
apiRouter.post("/checkout/recovery/cancel", leadCaptureLimiter, handleCancelRecovery);
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
apiRouter.get("/admin/orders-maintenance/preview", adminApiLimiter, authenticateAdmin, previewHistoricalOrderCloseout);
apiRouter.post("/admin/orders-maintenance/execute", adminApiLimiter, authenticateAdmin, executeHistoricalOrderCloseout);
apiRouter.post("/admin/orders/manual", adminApiLimiter, authenticateAdmin, createManualOrderController);
apiRouter.post(
  "/admin/media/upload",
  adminApiLimiter,
  authenticateAdmin,
  express.raw({ type: ['image/*', 'video/*'], limit: '101mb' }),
  uploadAdminMediaController
);
apiRouter.post("/admin/orders/:orderId/production-status", adminApiLimiter, authenticateAdmin, updateOrderProductionStatus);
apiRouter.put("/admin/orders/:orderId/production-status", adminApiLimiter, authenticateAdmin, updateOrderProductionStatus);
apiRouter.post("/admin/orders/:orderId/production-priority", adminApiLimiter, authenticateAdmin, updateOrderProductionPriority);
apiRouter.put("/admin/orders/:orderId/production-priority", adminApiLimiter, authenticateAdmin, updateOrderProductionPriority);
apiRouter.post("/admin/orders/:orderId/production-assignment", adminApiLimiter, authenticateAdmin, updateOrderProductionAssignment);
apiRouter.put("/admin/orders/:orderId/production-assignment", adminApiLimiter, authenticateAdmin, updateOrderProductionAssignment);
apiRouter.post("/admin/orders/:orderId/production-due-date", adminApiLimiter, authenticateAdmin, updateOrderProductionDueDate);
apiRouter.put("/admin/orders/:orderId/production-due-date", adminApiLimiter, authenticateAdmin, updateOrderProductionDueDate);
apiRouter.post("/admin/orders/:orderId/production-notes", adminApiLimiter, authenticateAdmin, addOrderProductionNote);
apiRouter.post("/admin/orders/:orderId/notes", adminApiLimiter, authenticateAdmin, addOrderShippingNote);
apiRouter.post("/admin/orders/:orderId/payment-status", adminApiLimiter, authenticateAdmin, updateOrderPaymentStatus);
apiRouter.post("/admin/orders/:orderId/manual-payment", adminApiLimiter, authenticateAdmin, registerManualPaymentController);
apiRouter.post("/admin/orders/:orderId/refund", adminApiLimiter, authenticateAdmin, processOrderRefundController);
apiRouter.post("/admin/orders/:orderId/reverse-refund", adminApiLimiter, authenticateAdmin, reverseOrderRefundController);
apiRouter.post("/admin/orders/:orderId/repair-refund-reversal", adminApiLimiter, authenticateAdmin, repairRefundReversalBalanceController);
apiRouter.post("/admin/orders/:orderId/correct-refund-reversal-total", adminApiLimiter, authenticateAdmin, correctRefundReversalOrderTotalController);
apiRouter.get("/admin/orders/:orderId/financial-events", adminApiLimiter, authenticateAdmin, getOrderFinancialEventsController);
apiRouter.get("/admin/financial/ledger", adminApiLimiter, authenticateAdmin, getFinancialLedgerController);
apiRouter.post("/admin/financial/expenses", adminApiLimiter, authenticateAdmin, createFinancialExpenseController);
apiRouter.post("/admin/financial/expenses/void", adminApiLimiter, authenticateAdmin, voidFinancialExpenseController);
apiRouter.post("/admin/financial/investments", adminApiLimiter, authenticateAdmin, createFinancialInvestmentController);
apiRouter.post("/admin/financial/investments/void", adminApiLimiter, authenticateAdmin, voidFinancialInvestmentController);
apiRouter.post("/admin/financial/traffic", adminApiLimiter, authenticateAdmin, createFinancialTrafficController);
apiRouter.post("/admin/financial/traffic/void", adminApiLimiter, authenticateAdmin, voidFinancialTrafficController);
apiRouter.post("/admin/financial/payables", adminApiLimiter, authenticateAdmin, createAccountsPayableController);
apiRouter.post("/admin/financial/payables/:id/pay", adminApiLimiter, authenticateAdmin, payAccountsPayableController);
apiRouter.post("/admin/financial/payables/:id/void", adminApiLimiter, authenticateAdmin, voidAccountsPayableController);
apiRouter.get("/admin/financial/payables", adminApiLimiter, authenticateAdmin, getAccountsPayablesController);
apiRouter.post("/admin/financial/suppliers", adminApiLimiter, authenticateAdmin, createSupplierController);
apiRouter.put("/admin/financial/suppliers/:id", adminApiLimiter, authenticateAdmin, updateSupplierController);
apiRouter.post("/admin/financial/suppliers/:id/deactivate", adminApiLimiter, authenticateAdmin, deactivateSupplierController);
apiRouter.get("/admin/financial/suppliers", adminApiLimiter, authenticateAdmin, getSuppliersController);
apiRouter.get("/admin/financial/forecast", adminApiLimiter, authenticateAdmin, getCashForecastController);
apiRouter.post("/admin/orders/:orderId/shipping-cost", adminApiLimiter, authenticateAdmin, recordOrderActualShippingCostController);
apiRouter.post("/admin/orders/:orderId/gateway-fee", adminApiLimiter, authenticateAdmin, recordOrderGatewayFeeController);
apiRouter.post("/admin/orders/:orderId/shipping-status", adminApiLimiter, authenticateAdmin, updateOrderShippingStatus);
apiRouter.put("/admin/orders/:orderId/shipping-status", adminApiLimiter, authenticateAdmin, updateOrderShippingStatus);
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
    if (baseUrl === 'https://www.melhorenvio.com.br') baseUrl = 'https://melhorenvio.com.br';
    
    const tokenStatus = await melhorEnvio.hasConfiguredToken();
    res.json({
      hasToken: tokenStatus.hasToken,
      tokenSource: tokenStatus.source,
      tokenUpdatedAt: tokenStatus.updatedAt || null,
      maskedToken: tokenStatus.hasToken ? '••••••••••••' : '',
      baseUrl
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/shipping/config", adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    const { baseUrl, token } = req.body;
    const dbInstance = getDb();
    
    const rawUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
    const sanitizedUrl = rawUrl === 'https://www.melhorenvio.com.br'
      ? 'https://melhorenvio.com.br'
      : rawUrl;
    if (!ALLOWED_SHIPPING_URLS.includes(sanitizedUrl)) {
      return res.status(400).json({ 
        error: "URL do Melhor Envio não autorizada. As URLs permitidas são: " + ALLOWED_SHIPPING_URLS.join(', ') 
      });
    }
    
    const normalizedToken = String(token || '').trim().replace(/^Bearer\s+/i, '');
    if (normalizedToken) {
      // Valida no provedor antes de substituir a credencial ativa.
      await melhorEnvio.validateCredentials(normalizedToken, sanitizedUrl);
      await dbInstance.collection('server_secrets').doc('melhorenvio').set({
        token: normalizedToken,
        updatedAt: new Date(),
        updatedBy: (req as any).user?.uid || 'admin'
      }, { merge: true });
      melhorEnvio.invalidateTokenCache();
    } else {
      const tokenStatus = await melhorEnvio.hasConfiguredToken();
      if (!tokenStatus.hasToken) {
        return res.status(400).json({
          error: 'Informe o token do Melhor Envio para concluir a integração.'
        });
      }
    }

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

    res.json({
      success: true,
      hasToken: true,
      message: normalizedToken
        ? 'Token validado e integração do Melhor Envio ativada com sucesso.'
        : 'Ambiente do Melhor Envio atualizado com sucesso.'
    });
  } catch (error: any) {
    const safeMessage = sanitizeSecrets(error?.message || 'Falha ao configurar o Melhor Envio.');
    const isValidationError = /Token|Melhor Envio|validar|responder/i.test(safeMessage);
    res.status(isValidationError ? 400 : 500).json({ error: safeMessage });
  }
});

const activeLabelOperations = new Set<string>();

export async function shippingCreateLabelHandler(req: express.Request, res: express.Response) {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: 'INVALID_ORDER', message: 'ID do pedido é obrigatório para geração de etiqueta.' });
  }

  if (activeLabelOperations.has(orderId)) {
    return res.status(409).json({
      error: 'OPERATION_IN_PROGRESS',
      message: 'Operação de geração de etiqueta em andamento para este pedido.'
    });
  }
  activeLabelOperations.add(orderId);

  try {
    const user = (req as any).user;

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

    // 6. RECONCILE FIRST IF RECONCILIATION REQUIRED
    if (lockData?.status === 'reconciliation_required') {
      const externalCartId =
        orderData.shipping?.provider?.cartId ||
        orderData.shipping?.provider?.checkoutId ||
        orderData.shipping?.provider?.purchaseId ||
        orderData.shipping?.provider?.labelId ||
        orderData.shippingLabelId ||
        lockData?.cartId ||
        null;

      if (!externalCartId) {
        return res.status(409).json({
          error: 'RECONCILIATION_MANUAL_REQUIRED',
          message: 'Reconciliação manual necessária: operação em estado de reconciliação mas nenhum ID externo foi localizado.'
        });
      }

      try {
        const reconciliation = await melhorEnvio.reconcileLabelWithProvider(orderId, labelOperationId, externalCartId);
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

          const providerData = {
            name: 'melhor_envio',
            cartId: externalCartId || labelId,
            labelId: labelId,
            protocol: reconciliation.providerReference || labelId,
            updatedAt: timestamp
          };

          const updatePayload: any = {
            shippingLabelId: labelId,
            shippingLabelUrl: redirectUrl,
            shippingLabelCreatedAt: timestamp,
            labelOperationId,
            'shipping.label': labelCanonicalModel,
            'shipping.labelId': labelId,
            'shipping.provider': providerData,
            'shipping.operationalState': 'generated',
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
        } else {
          await lockRef.set({
            orderId,
            labelOperationId,
            status: 'reconciliation_required',
            updatedAt: new Date().toISOString()
          }, { merge: true });

          return res.status(409).json({
            error: 'RECONCILIATION_REQUIRED',
            message: 'A operação anterior no provedor não pôde ser confirmada automaticamente. Reconciliação manual necessária.'
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

    // 7. ACQUIRE LOCK ATOMICALLY BEFORE EXTERNAL CALL
    let acquiredLock = false;
    await db.runTransaction(async (tx) => {
      const txLockSnap = await tx.get(lockRef);
      const txLockData = txLockSnap.exists ? txLockSnap.data() : null;

      if (txLockData?.status === 'processing') {
        const startedAt = new Date(txLockData.startedAt).getTime();
        if (Date.now() - startedAt < 30000) {
          acquiredLock = false;
          return;
        }
      }

      if (txLockData?.status === 'completed' && txLockData.labelId) {
        acquiredLock = false;
        return;
      }

      tx.set(lockRef, {
        orderId,
        labelOperationId,
        status: 'processing',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        operator: user?.email || user?.uid || 'Admin'
      }, { merge: true });

      acquiredLock = true;
    });

    if (!acquiredLock) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'Operação de criação de etiqueta em andamento para este pedido. Por favor, aguarde.'
      });
    }

    await orderRef.update({
      labelOperationId,
      updatedAt: (await import('firebase-admin')).default.firestore.FieldValue.serverTimestamp()
    });

    // 8. CONSTRUCT CANONICAL PAYLOAD
    const cleanCep = String(
      orderData.cep || 
      orderData.address?.cep || 
      orderData.shippingAddress?.postalCode || 
      orderData.shippingAddress?.cep || 
      ''
    ).replace(/\D/g, '');

    const destName = String(
      orderData.customerName || 
      orderData.customer?.name || 
      orderData.name || 
      'Cliente'
    ).trim();

    const destPhone = String(
      orderData.customerPhone || 
      orderData.phone || 
      orderData.customer?.phone || 
      '47999999999'
    ).replace(/\D/g, '');

    const destEmail = String(
      orderData.customerEmail || 
      orderData.email || 
      orderData.customer?.email || 
      'cliente@fpacstore.com'
    ).trim();

    const destCpf = String(
      orderData.cpf || 
      orderData.customerCpf || 
      orderData.customer?.cpf || 
      ''
    ).replace(/\D/g, '');
    
    let destStreet = '';
    let destNumber = 'SN';
    let destNeighborhood = '';
    let destCity = '';
    let destState = 'SC';

    const addrObj = orderData.shippingAddress || orderData.address;
    if (typeof addrObj === 'object' && addrObj) {
      destStreet = String(addrObj.street || addrObj.address || addrObj.logradouro || '').trim();
      destNumber = String(addrObj.number || addrObj.numero || 'SN').trim();
      destNeighborhood = String(addrObj.neighborhood || addrObj.bairro || addrObj.district || '').trim();
      destCity = String(addrObj.city || addrObj.cidade || '').trim();
      destState = String(addrObj.state || addrObj.uf || 'SC').trim().toUpperCase();
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

    // 9. STEP-BY-STEP EXTERNAL CALLS WITH IMMEDIATE PERSISTENCE
    let currentCartId = orderData.shipping?.provider?.cartId || orderData.shipping?.provider?.shipmentId || null;
    let operationStatus = orderData.shipping?.provider?.operationStatus || null;
    let checkoutId = orderData.shipping?.provider?.checkoutId || orderData.shipping?.provider?.purchaseId || null;
    let labelId = orderData.shipping?.provider?.labelId || null;

    // STEP 1: Add to Cart (if not already created and persisted)
    if (!currentCartId) {
      try {
        const cartRes = await melhorEnvio.addToCart(mePayload);
        if (!cartRes || !cartRes.cartId) {
          throw new Error('Erro na API do Melhor Envio: ID de carrinho não retornado');
        }
        currentCartId = cartRes.cartId;
        operationStatus = 'cart_created';

        const cartTs = new Date().toISOString();
        await orderRef.update({
          'shipping.provider.name': 'melhor_envio',
          'shipping.provider.cartId': currentCartId,
          'shipping.provider.operationStatus': 'cart_created',
          'shipping.provider.updatedAt': cartTs,
          updatedAt: (await import('firebase-admin')).default.firestore.FieldValue.serverTimestamp()
        });

        await lockRef.set({
          orderId,
          labelOperationId,
          cartId: currentCartId,
          status: 'cart_created',
          updatedAt: cartTs
        }, { merge: true });
      } catch (cartErr: any) {
        const sanitizedMsg = sanitizeSecrets(cartErr.message || 'Erro ao adicionar item ao carrinho do Melhor Envio');
        const is4xxClientError = typeof cartErr.status === 'number' && cartErr.status >= 400 && cartErr.status < 500;
        const newLockStatus = is4xxClientError ? 'failed_confirmed' : 'reconciliation_required';

        await lockRef.set({
          orderId,
          labelOperationId,
          status: newLockStatus,
          error: sanitizedMsg,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        return res.status(is4xxClientError ? 400 : 502).json({
          error: is4xxClientError ? 'MELHOR_ENVIO_API_ERROR' : 'RECONCILIATION_REQUIRED',
          message: sanitizedMsg
        });
      }
    }

    // STEP 2: Checkout Shipment (if not already purchased)
    if (operationStatus === 'cart_created' || !checkoutId) {
      try {
        const checkoutRes = await melhorEnvio.checkoutShipment(currentCartId);
        checkoutId = String(checkoutRes?.purchase?.id || checkoutRes?.id || currentCartId);
        operationStatus = 'purchased';

        const checkoutTs = new Date().toISOString();
        await orderRef.update({
          'shipping.provider.checkoutId': checkoutId,
          'shipping.provider.purchaseId': checkoutId,
          'shipping.provider.operationStatus': 'purchased',
          'shipping.provider.updatedAt': checkoutTs,
          updatedAt: (await import('firebase-admin')).default.firestore.FieldValue.serverTimestamp()
        });

        await lockRef.set({
          orderId,
          labelOperationId,
          checkoutId,
          status: 'purchased',
          updatedAt: checkoutTs
        }, { merge: true });
      } catch (checkoutErr: any) {
        const sanitizedMsg = sanitizeSecrets(checkoutErr.message || 'Erro ao realizar checkout no Melhor Envio');
        const is4xxClientError = typeof checkoutErr.status === 'number' && checkoutErr.status >= 400 && checkoutErr.status < 500;
        const newLockStatus = is4xxClientError ? 'failed_confirmed' : 'reconciliation_required';

        await lockRef.set({
          orderId,
          labelOperationId,
          status: newLockStatus,
          error: sanitizedMsg,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        return res.status(is4xxClientError ? 400 : 502).json({
          error: is4xxClientError ? 'MELHOR_ENVIO_API_ERROR' : 'RECONCILIATION_REQUIRED',
          message: sanitizedMsg
        });
      }
    }

    // STEP 3: Generate Label (if not already generated)
    if (operationStatus === 'purchased' || !labelId) {
      try {
        const generateRes = await melhorEnvio.generateLabel(currentCartId);
        labelId = String(generateRes?.id || generateRes?.[0]?.id || currentCartId);
        operationStatus = 'generated';

        const generateTs = new Date().toISOString();
        await orderRef.update({
          'shipping.provider.labelId': labelId,
          'shipping.provider.operationStatus': 'generated',
          'shipping.provider.updatedAt': generateTs,
          updatedAt: (await import('firebase-admin')).default.firestore.FieldValue.serverTimestamp()
        });

        await lockRef.set({
          orderId,
          labelOperationId,
          labelId,
          status: 'generated',
          updatedAt: generateTs
        }, { merge: true });
      } catch (generateErr: any) {
        const sanitizedMsg = sanitizeSecrets(generateErr.message || 'Erro ao gerar etiqueta no Melhor Envio');
        const is4xxClientError = typeof generateErr.status === 'number' && generateErr.status >= 400 && generateErr.status < 500;
        const newLockStatus = is4xxClientError ? 'failed_confirmed' : 'reconciliation_required';

        await lockRef.set({
          orderId,
          labelOperationId,
          status: newLockStatus,
          error: sanitizedMsg,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        return res.status(is4xxClientError ? 400 : 502).json({
          error: is4xxClientError ? 'MELHOR_ENVIO_API_ERROR' : 'RECONCILIATION_REQUIRED',
          message: sanitizedMsg
        });
      }
    }

    // STEP 4: Print Label (optional/public) & Finalize
    let printUrl: string | null = null;
    try {
      const printRes = await melhorEnvio.printLabel(currentCartId);
      printUrl = printRes?.url || null;
    } catch (e) {
      // Non-fatal
    }

    const baseUrl = await melhorEnvio.getUrl();
    const redirectUrl = printUrl || (baseUrl.includes('sandbox')
      ? 'https://sandbox.melhorenvio.com.br/painel/envios/carrinho'
      : 'https://painel.melhorenvio.com.br/envios/carrinho');

    const finalLabelId = labelId || currentCartId;
    const timestamp = new Date().toISOString();

    const historyEntry = {
      type: 'shipping_label_created',
      status: 'label_created',
      labelId: finalLabelId,
      timestamp,
      message: `Etiqueta gerada via Melhor Envio (ID: ${finalLabelId})`,
      operator: user?.email || user?.uid || 'Admin'
    };

    const labelCanonicalModel = {
      id: finalLabelId,
      status: 'created',
      url: redirectUrl,
      createdAt: timestamp,
      updatedAt: timestamp,
      provider: 'melhor_envio',
      providerReference: finalLabelId
    };

    await lockRef.set({
      orderId,
      labelOperationId,
      status: 'completed',
      labelId: finalLabelId,
      redirectUrl,
      providerReference: finalLabelId,
      updatedAt: timestamp
    }, { merge: true });

    const providerData = {
      name: 'melhor_envio',
      cartId: currentCartId,
      checkoutId: checkoutId || currentCartId,
      shipmentId: currentCartId,
      labelId: finalLabelId,
      protocol: finalLabelId,
      operationStatus: 'completed',
      updatedAt: timestamp
    };

    await orderRef.update({
      shippingLabelId: finalLabelId,
      shippingLabelUrl: redirectUrl,
      shippingLabelCreatedAt: timestamp,
      labelOperationId,
      'shipping.label': labelCanonicalModel,
      'shipping.labelId': finalLabelId,
      'shipping.provider': providerData,
      'shipping.operationalState': 'generated',
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
      id: finalLabelId,
      redirectUrl,
      label: labelCanonicalModel
    });
  } catch (error: any) {
    const sanitizedMsg = sanitizeSecrets(error.message || 'Erro interno ao processar etiqueta.');
    res.status(500).json({ error: sanitizedMsg });
  } finally {
    activeLabelOperations.delete(orderId);
  }
}

apiRouter.post("/shipping/create-label", adminApiLimiter, authenticateAdmin, shippingCreateLabelHandler);

// Product cost documents are backend-only. The admin panel uses these
// authenticated endpoints instead of receiving Firestore access to internal CMV.
apiRouter.get("/admin/product-costs", adminApiLimiter, authenticateAdmin, async (_req, res) => {
  try {
    const dbInstance = getDb();
    if (!dbInstance) return res.status(503).json({ error: "Banco de dados não disponível" });

    const snapshot = await dbInstance.collection('product_costs').get();
    const costs = snapshot.docs.map((costDoc) => {
      const data = costDoc.data() || {};
      const updatedAt = data.updatedAt?.toDate instanceof Function
        ? data.updatedAt.toDate().toISOString()
        : data.updatedAt || null;
      return { ...data, productId: costDoc.id, updatedAt };
    });
    return res.json({ costs });
  } catch (error: any) {
    logger.error(`❌ [PRODUCT-COSTS-LIST] ${error.message}`);
    return res.status(500).json({ error: "Não foi possível carregar os custos dos produtos." });
  }
});

apiRouter.put("/admin/product-costs/:productId", adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    const productId = String(req.params.productId || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(productId)) {
      return res.status(400).json({ error: "Identificador de produto inválido." });
    }

    const rawCost = req.body?.costPrice;
    const numericCost = rawCost === null || rawCost === undefined || rawCost === ''
      ? null
      : Number(rawCost);
    if (numericCost !== null && (!Number.isFinite(numericCost) || numericCost < 0 || numericCost > 1000000)) {
      return res.status(400).json({ error: "Preço de custo inválido." });
    }

    const dbInstance = getDb();
    if (!dbInstance) return res.status(503).json({ error: "Banco de dados não disponível" });
    const firebaseAdmin = (await import('firebase-admin')).default;
    const payload = {
      productId,
      slug: String(req.body?.slug || '').trim().slice(0, 200),
      costPrice: numericCost,
      cost: numericCost,
      costCalculation: req.body?.costCalculation && typeof req.body.costCalculation === 'object'
        ? req.body.costCalculation
        : null,
      updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    };
    await dbInstance.collection('product_costs').doc(productId).set(payload, { merge: true });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error(`❌ [PRODUCT-COSTS-SAVE] ${error.message}`);
    return res.status(500).json({ error: "Não foi possível salvar o custo do produto." });
  }
});

apiRouter.delete("/admin/product-costs/:productId", adminApiLimiter, authenticateAdmin, async (req, res) => {
  try {
    const productId = String(req.params.productId || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(productId)) {
      return res.status(400).json({ error: "Identificador de produto inválido." });
    }
    const dbInstance = getDb();
    if (!dbInstance) return res.status(503).json({ error: "Banco de dados não disponível" });
    await dbInstance.collection('product_costs').doc(productId).delete();
    return res.json({ success: true });
  } catch (error: any) {
    logger.error(`❌ [PRODUCT-COSTS-DELETE] ${error.message}`);
    return res.status(500).json({ error: "Não foi possível excluir o custo do produto." });
  }
});

apiRouter.delete("/admin/product-costs", adminApiLimiter, authenticateAdmin, async (_req, res) => {
  try {
    const dbInstance = getDb();
    if (!dbInstance) return res.status(503).json({ error: "Banco de dados não disponível" });
    const snapshot = await dbInstance.collection('product_costs').get();
    let batch = dbInstance.batch();
    let batchSize = 0;
    for (const costDoc of snapshot.docs) {
      batch.delete(costDoc.ref);
      batchSize += 1;
      if (batchSize >= 400) {
        await batch.commit();
        batch = dbInstance.batch();
        batchSize = 0;
      }
    }
    if (batchSize > 0) await batch.commit();
    return res.json({ success: true, deleted: snapshot.size });
  } catch (error: any) {
    logger.error(`❌ [PRODUCT-COSTS-DELETE-ALL] ${error.message}`);
    return res.status(500).json({ error: "Não foi possível limpar os custos dos produtos." });
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

    const { costProfiles, products, orders, investments, cashflow, traffic } = validation.sanitized;
    const dbInstance = getDb();
    if (!dbInstance) {
      return res.status(503).json({ error: "Banco de dados não disponível" });
    }
    const firebaseAdmin = (await import('firebase-admin')).default;
    const deleteFirestoreField = firebaseAdmin.firestore.FieldValue.delete();

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
            const numericCost = Number(p.cost);
            await dbInstance.collection('product_costs').doc(docId).set({
              productId: docId,
              slug: p.slug,
              costPrice: numericCost,
              cost: numericCost,
              costCalculation: {
                mode: 'manual',
                coverage: 'complete',
                source: 'google_sheets_products',
                calculatedAt: new Date().toISOString()
              },
              updatedAt: new Date()
            }, { merge: true });
            updateData.cost = deleteFirestoreField;
            updateData.costPrice = deleteFirestoreField;
            updateData.costCalculation = deleteFirestoreField;
          }
          
          updateData.updatedAt = new Date();
          await dbInstance.collection('products').doc(docId).update(updateData);
        }
      }
    }

    // 1.1. Persistir a fonte central e reaplicar o custo em todos os produtos
    // compatíveis. O COGS histórico dos pedidos não é alterado: ele continua
    // protegido pelo unitCostSnapshot gravado no momento da venda.
    let automaticallyUpdatedProducts = 0;
    if (costProfiles && Array.isArray(costProfiles)) {
      const syncedAt = new Date().toISOString();
      const profilesWithTimestamp = costProfiles.map((profile) => ({
        ...profile,
        sourceUpdatedAt: syncedAt
      }));

      const productsSnapshot = await dbInstance.collection('products').get();
      const privateCostsSnapshot = await dbInstance.collection('product_costs').get();
      const privateCostsByProductId = new Map(
        privateCostsSnapshot.docs.map((costDoc) => [costDoc.id, costDoc.data() || {}])
      );
      let batch = dbInstance.batch();
      let batchSize = 0;

      for (const productDoc of productsSnapshot.docs) {
        const productData = productDoc.data() || {};
        const privateCostRef = dbInstance.collection('product_costs').doc(productDoc.id);
        const privateCostData: any = privateCostsByProductId.get(productDoc.id);
        const profile = resolveProductCostProfile(
          profilesWithTimestamp,
          inferProductCostSelector(productData)
        );

        const hasLegacyCostFields = productData.costPrice !== undefined
          || productData.cost !== undefined
          || productData.costCalculation !== undefined;
        if (hasLegacyCostFields) {
          batch.update(productDoc.ref, {
            costPrice: deleteFirestoreField,
            cost: deleteFirestoreField,
            costCalculation: deleteFirestoreField,
            updatedAt: new Date()
          });
          batchSize += 1;
        }

        if (!profile) {
          if (privateCostData?.costCalculation?.mode === 'automatic') {
            batch.delete(privateCostRef);
            automaticallyUpdatedProducts += 1;
            batchSize += 1;
          } else if (!privateCostData) {
            const legacyCost = Number(productData.costPrice ?? productData.cost);
            if (Number.isFinite(legacyCost) && legacyCost > 0) {
              batch.set(privateCostRef, {
                productId: productDoc.id,
                slug: productData.slug || '',
                costPrice: legacyCost,
                cost: legacyCost,
                costCalculation: productData.costCalculation || {
                  mode: 'manual',
                  coverage: 'complete',
                  source: 'legacy_product_migration',
                  calculatedAt: syncedAt
                },
                updatedAt: new Date()
              }, { merge: true });
              batchSize += 1;
            }
          }
        } else {
          batch.set(privateCostRef, {
            productId: productDoc.id,
            slug: productData.slug || '',
            costPrice: Number(profile.unitCost.toFixed(2)),
            cost: Number(profile.unitCost.toFixed(2)),
            costCalculation: buildAutomaticCostMetadata(profile, syncedAt),
            updatedAt: new Date()
          }, { merge: true });
          automaticallyUpdatedProducts += 1;
          batchSize += 1;
        }

        if (batchSize >= 380) {
          await batch.commit();
          batch = dbInstance.batch();
          batchSize = 0;
        }
      }

      if (batchSize > 0) await batch.commit();

      // Publish the new source only after all compatible products were updated,
      // avoiding a UI that advertises a profile not yet applied to the catalog.
      await dbInstance.collection('settings').doc('product_costs').set({
        profiles: profilesWithTimestamp,
        source: 'google_sheets',
        updatedAt: new Date(),
        updatedBy: user?.email || user?.uid || 'sheets-sync'
      }, { merge: true });
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
    res.json({
      success: true,
      message: "Site sincronizado em tempo real com as alterações enviadas com validação e segurança!",
      costProfilesReceived: costProfiles?.length || 0,
      automaticallyUpdatedProducts
    });
  } catch (error: any) {
    logger.error("❌ [SHEETS-SYNC-BACK] Erro ao sincronizar:", error);
    res.status(500).json({ error: error.message });
  }
});

// Secure Order Tracking Verification Endpoint
apiRouter.get("/orders/:orderId/tracking", publicApiLimiter, async (req, res) => {
  try {
    const { orderId } = req.params;
    const database = getDb();
    if (!database) return res.status(503).json({ error: "Database not ready" });

    const doc = await database.collection('orders').doc(orderId).get();
    if (!doc.exists) return res.status(404).json({ error: "ORDER_NOT_FOUND", message: "Pedido não encontrado." });

    const orderData = doc.data()!;

    // Validate access: Firebase Ownership OR Valid trackingAccessToken
    const authHeader = req.headers.authorization;
    const queryToken = (req.query.token as string) || (req.query.trackingAccessToken as string);
    const headerToken = req.headers['x-tracking-token'] as string;

    const access = await verifyOrderTrackingAccess(orderData, authHeader, queryToken, headerToken);

    if (!access.authorized) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Acesso não autorizado ao rastreamento do pedido.'
      });
    }

    const sanitized = sanitizeTrackingResponse(orderId, orderData);
    res.json(sanitized);
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
      if (!canTransitionShippingStatus(currentShippingStatus, canonicalStatus, orderData)) {
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

// =========================================================================
// FASE 9.6.4 — GOVERNANÇA COMERCIAL, AÇÕES E METAS PERSISTENTES (ADMIN ONLY)
// =========================================================================
apiRouter.get("/admin/commercial/actions", adminApiLimiter, authenticateAdmin, getCommercialActionsController);
apiRouter.get("/admin/commercial/actions/:id", adminApiLimiter, authenticateAdmin, getCommercialActionByIdController);
apiRouter.get("/admin/commercial/actions/:id/events", adminApiLimiter, authenticateAdmin, getCommercialActionEventsController);
apiRouter.post("/admin/commercial/actions", adminApiLimiter, authenticateAdmin, createCommercialActionController);
apiRouter.post("/admin/commercial/actions/:id/approve", adminApiLimiter, authenticateAdmin, approveCommercialActionController);
apiRouter.post("/admin/commercial/actions/:id/start", adminApiLimiter, authenticateAdmin, startCommercialActionController);
apiRouter.post("/admin/commercial/actions/:id/complete", adminApiLimiter, authenticateAdmin, completeCommercialActionController);
apiRouter.post("/admin/commercial/actions/:id/dismiss", adminApiLimiter, authenticateAdmin, dismissCommercialActionController);
apiRouter.post("/admin/commercial/actions/:id/cancel", adminApiLimiter, authenticateAdmin, cancelCommercialActionController);
apiRouter.post("/admin/commercial/actions/:id/notes", adminApiLimiter, authenticateAdmin, addCommercialActionNoteController);

apiRouter.get("/admin/commercial/goals", adminApiLimiter, authenticateAdmin, getCommercialGoalsController);
apiRouter.get("/admin/commercial/goals/:id/evaluation", adminApiLimiter, authenticateAdmin, getCommercialGoalEvaluationController);
apiRouter.post("/admin/commercial/goals", adminApiLimiter, authenticateAdmin, createCommercialGoalController);
apiRouter.post("/admin/commercial/goals/:id/status", adminApiLimiter, authenticateAdmin, updateCommercialGoalStatusController);

// =========================================================================
// FASE 9.6.5 — PLANEJAMENTO COMERCIAL, FORECAST & CENÁRIOS WHAT-IF (ADMIN ONLY)
// =========================================================================
apiRouter.get("/admin/commercial/forecast/baseline", adminApiLimiter, authenticateAdmin, getForecastBaselineController);
apiRouter.get("/admin/commercial/forecasts", adminApiLimiter, authenticateAdmin, getCommercialForecastsController);
apiRouter.get("/admin/commercial/forecasts/:id", adminApiLimiter, authenticateAdmin, getCommercialForecastByIdController);
apiRouter.post("/admin/commercial/forecasts", adminApiLimiter, authenticateAdmin, createCommercialForecastController);
apiRouter.patch("/admin/commercial/forecasts/:id", adminApiLimiter, authenticateAdmin, updateCommercialForecastController);
apiRouter.post("/admin/commercial/forecasts/:id/recalculate", adminApiLimiter, authenticateAdmin, recalculateCommercialForecastController);
apiRouter.post("/admin/commercial/forecast/scenario", adminApiLimiter, authenticateAdmin, simulateForecastScenarioController);
apiRouter.post("/admin/commercial/forecast/scenario/convert-to-action", adminApiLimiter, authenticateAdmin, convertScenarioToActionController);

// =========================================================================
// FASE 9.6.6 — ORÇAMENTO COMERCIAL & GUARDRAILS FINANCEIROS (ADMIN ONLY)
// =========================================================================
apiRouter.get("/admin/commercial/budgets/baseline", adminApiLimiter, authenticateAdmin, getCommercialBudgetBaselinePreviewController);
apiRouter.get("/admin/commercial/budgets", adminApiLimiter, authenticateAdmin, getCommercialBudgetsController);
apiRouter.get("/admin/commercial/budgets/:id", adminApiLimiter, authenticateAdmin, getCommercialBudgetByIdController);
apiRouter.get("/admin/commercial/budgets/:id/events", adminApiLimiter, authenticateAdmin, getCommercialBudgetEventsController);
apiRouter.post("/admin/commercial/budgets", adminApiLimiter, authenticateAdmin, createCommercialBudgetController);
apiRouter.patch("/admin/commercial/budgets/:id", adminApiLimiter, authenticateAdmin, updateCommercialBudgetController);
apiRouter.post("/admin/commercial/budgets/:id/activate", adminApiLimiter, authenticateAdmin, activateCommercialBudgetController);
apiRouter.post("/admin/commercial/budgets/:id/rebudget", adminApiLimiter, authenticateAdmin, rebudgetCommercialBudgetController);
apiRouter.post("/admin/commercial/budgets/:id/recalculate", adminApiLimiter, authenticateAdmin, recalculateCommercialBudgetController);
apiRouter.post("/admin/commercial/budgets/:id/archive", adminApiLimiter, authenticateAdmin, archiveCommercialBudgetController);

// =========================================================================
// FASE 9.6.7 — EXECUÇÃO COMERCIAL, PLANOS DE AÇÃO & RESULTADOS (ADMIN ONLY)
// =========================================================================
apiRouter.get("/admin/commercial/execution-cycles", adminApiLimiter, authenticateAdmin, getCommercialExecutionCyclesController);
apiRouter.get("/admin/commercial/execution-cycles/:id", adminApiLimiter, authenticateAdmin, getCommercialExecutionCycleByIdController);
apiRouter.get("/admin/commercial/execution-cycles/:id/dashboard", adminApiLimiter, authenticateAdmin, getCommercialExecutionDashboardController);
apiRouter.get("/admin/commercial/execution-cycles/:id/events", adminApiLimiter, authenticateAdmin, getCommercialExecutionEventsController);
apiRouter.post("/admin/commercial/execution-cycles", adminApiLimiter, authenticateAdmin, createCommercialExecutionCycleController);
apiRouter.patch("/admin/commercial/execution-cycles/:id", adminApiLimiter, authenticateAdmin, updateCommercialExecutionCycleController);
apiRouter.post("/admin/commercial/execution-cycles/:id/activate", adminApiLimiter, authenticateAdmin, activateCommercialExecutionCycleController);
apiRouter.post("/admin/commercial/execution-cycles/:id/complete", adminApiLimiter, authenticateAdmin, completeCommercialExecutionCycleController);
apiRouter.post("/admin/commercial/execution-cycles/:id/archive", adminApiLimiter, authenticateAdmin, archiveCommercialExecutionCycleController);
apiRouter.post("/admin/commercial/execution-cycles/:id/recalculate", adminApiLimiter, authenticateAdmin, recalculateCommercialExecutionCycleController);

// Ações no Ciclo
apiRouter.post("/admin/commercial/execution-cycles/:id/actions", adminApiLimiter, authenticateAdmin, addCommercialActionToCycleController);
apiRouter.patch("/admin/commercial/execution-cycles/:id/actions/:actionId", adminApiLimiter, authenticateAdmin, updateCommercialActionController);
apiRouter.post("/admin/commercial/execution-cycles/:id/actions/:actionId/ready", adminApiLimiter, authenticateAdmin, readyCommercialActionController);
apiRouter.post("/admin/commercial/execution-cycles/:id/actions/:actionId/start", adminApiLimiter, authenticateAdmin, startCommercialExecutionActionController);
apiRouter.post("/admin/commercial/execution-cycles/:id/actions/:actionId/block", adminApiLimiter, authenticateAdmin, blockCommercialActionController);
apiRouter.post("/admin/commercial/execution-cycles/:id/actions/:actionId/unblock", adminApiLimiter, authenticateAdmin, unblockCommercialActionController);
apiRouter.post("/admin/commercial/execution-cycles/:id/actions/:actionId/complete", adminApiLimiter, authenticateAdmin, completeCommercialExecutionActionController);
apiRouter.post("/admin/commercial/execution-cycles/:id/actions/:actionId/cancel", adminApiLimiter, authenticateAdmin, cancelCommercialExecutionActionController);
apiRouter.post("/admin/commercial/execution-cycles/:id/actions/:actionId/recalculate-impact", adminApiLimiter, authenticateAdmin, recalculateCommercialActionImpactController);

// =========================================================================
// FASE 9.6.8 — PÓS-MORTEM COMERCIAL, EFICÁCIA DE AÇÕES E APRENDIZADO (ADMIN ONLY)
// =========================================================================
apiRouter.get("/admin/commercial/reviews", adminApiLimiter, authenticateAdmin, listCommercialExecutionReviewsController);
apiRouter.get("/admin/commercial/reviews/:id", adminApiLimiter, authenticateAdmin, getCommercialExecutionReviewController);
apiRouter.get("/admin/commercial/reviews/:id/dashboard", adminApiLimiter, authenticateAdmin, getCommercialExecutionReviewDashboardController);
apiRouter.get("/admin/commercial/reviews/:id/actions", adminApiLimiter, authenticateAdmin, listCommercialExecutionReviewActionsController);
apiRouter.get("/admin/commercial/reviews/:id/events", adminApiLimiter, authenticateAdmin, listCommercialExecutionReviewEventsController);
apiRouter.post("/admin/commercial/reviews", adminApiLimiter, authenticateAdmin, createCommercialExecutionReviewController);
apiRouter.patch("/admin/commercial/reviews/:id", adminApiLimiter, authenticateAdmin, updateCommercialExecutionReviewController);
apiRouter.post("/admin/commercial/reviews/:id/generate", adminApiLimiter, authenticateAdmin, generateCommercialExecutionReviewController);
apiRouter.post("/admin/commercial/reviews/:id/recalculate", adminApiLimiter, authenticateAdmin, recalculateCommercialExecutionReviewController);
apiRouter.post("/admin/commercial/reviews/:id/approve", adminApiLimiter, authenticateAdmin, approveCommercialExecutionReviewController);
apiRouter.post("/admin/commercial/reviews/:id/archive", adminApiLimiter, authenticateAdmin, archiveCommercialExecutionReviewController);
apiRouter.post("/admin/commercial/reviews/:id/insights/:insightId/create-action", adminApiLimiter, authenticateAdmin, convertInsightToCommercialActionController);
apiRouter.get("/admin/commercial/learning/summary", adminApiLimiter, authenticateAdmin, getCommercialHistoricalLearningSummaryController);

// Both lookup paths require ownership or a tracking token and never mutate payments.
apiRouter.get("/checkout/verify/:orderId", paymentStatusLimiter, verifyCheckout);
apiRouter.get("/payment/status/:paymentId", paymentStatusLimiter, paymentStatus);

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

if (process.env.NODE_ENV !== "test") {
  bootstrap();

  setTimeout(async () => {
    try {
      const { autoCancelUnpaidOrders, reconcileUncertainPayments } = await import("./server/services/payment.service.js");
      await reconcileUncertainPayments();
      await autoCancelUnpaidOrders();
    } catch (err: any) {
      if (err?.code === 8 || err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('Quota limit exceeded')) {
        logger.warn("⚠️ [STARTUP-WARN] Initial auto-cancel scan deferred due to Firestore quota limit.");
      } else {
        logger.error("❌ [STARTUP-ERR] Initial auto-cancel scan failed", err);
      }
    }
  }, 5000);

  setInterval(async () => {
    try {
      const { runAbandonedCheckoutDetector } = await import("./server/services/automation.service.js");
      await runAbandonedCheckoutDetector();
    } catch (err: any) {
      if (err?.code === 8 || err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('Quota limit exceeded')) {
        logger.warn("⚠️ [CRON-WARN] Background abandoned checkout scan deferred due to Firestore quota limit.");
      } else {
        logger.error("❌ [CRON-INTERVAL-ERR] Background abandoned checkout scan failed", err);
      }
    }

    try {
      const { autoCancelUnpaidOrders, reconcileUncertainPayments } = await import("./server/services/payment.service.js");
      await reconcileUncertainPayments();
      await autoCancelUnpaidOrders();
    } catch (err: any) {
      if (err?.code === 8 || err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('Quota limit exceeded')) {
        logger.warn("⚠️ [CRON-WARN] Background auto-cancel unpaid orders scan deferred due to Firestore quota limit.");
      } else {
        logger.error("❌ [CRON-INTERVAL-ERR] Background auto-cancel unpaid orders scan failed", err);
      }
    }
  }, 10 * 60 * 1000);
}

export default app;

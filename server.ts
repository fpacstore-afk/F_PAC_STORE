
import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";
import admin from "firebase-admin";

// 1. Load Environment Configuration
dotenv.config();

// 2. Imports from internal architecture
import { getDb } from "./server/firebase.js";
import { logger } from "./server/utils/logger.js";
import { mpService } from "./server/services/mp.service.js";
import { MelhorEnvioService } from "./server/services/melhor-envio.service.js";
import { processPayment } from "./server/controllers/checkout.controller.js";
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

const app = express();
const isSandbox = process.env.DEFAULT_APP_PORT === "3000" && process.env.NODE_ENV !== "production" && !process.env.K_SERVICE;
const PORT = isSandbox ? 3000 : (Number(process.env.PORT) || 3000);
const melhorEnvio = new MelhorEnvioService();

// Middleware setup
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

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

  // Check for legacy duplicates to warn user
  const hasLegacyAT = !!process.env.MP_ACCESS_TOKEN;

  return {
    pk: { mode: pkMode, prefix: pk.substring(0, 11), length: pk.length },
    at: { mode: atMode, prefix: at.substring(0, 11), length: at.length },
    isCompatible: pkMode === atMode && pkMode !== 'EMPTY' && pkMode !== 'UNKNOWN',
    hasLegacyConflict: hasLegacyAT
  };
};

// Start Check
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

// 4. API Routes
const apiRouter = express.Router();

// Auto seed user token if provided
const seedMelhorEnvioToken = async () => {
  try {
    const dbInstance = getDb();
    const providedToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiMmQxZTljYWZmNGQ2N2ViZGNkOGZlYjc5ZWZkNTU4OTI5ZjU0N2RlYTQ2NGI1ZmE2MWU1YzI4YWQ4MTRkYTEzNWVmYjA5YWIyMzAyODE3MWMiLCJpYXQiOjE3ODA4NTU3ODkuMTU0NTY4LCJuYmYiOjE3ODA4NTU3ODkuMTU0NTY5LCJleHAiOjE4MTIzOTE3ODkuMTQ0MDY2LCJzdWIiOiJhMWQyZDI3Yi01M2JhLTRlOTEtYjgyYi1mODkxZWE0MzVhMTQiLCJzY29wZXMiOlsiY2FydC1yZWFkIiwiY2FydC13cml0ZSIsImNvbXBhbmllcy1yZWFkIiwiY29tcGFuaWVzLXdyaXRlIiwiY291cG9ucy1yZWFkIiwiY291cG9ucy13cml0ZSIsIm5vdGlmaWNhdGlvbnMtcmVhZCIsIm9yZGVycy1yZWFkIiwicHJvZHVjdHMtcmVhZCIsInByb2R1Y3RzLWRlc3Ryb3kiLCJwcm9kdWN0cy13cml0ZSIsInB1cmNoYXNlcy1yZWFkIiwic2hpcHBpbmctY2FsY3VsYXRlIiwic2hpcHBpbmctY2FuY2VsIiwic2hpcHBpbmctY2hlY2tvdXQiLCJzaGlwcGluZy1jb21wYW5pZXMiLCJzaGlwcGluZy1nZW5lcmF0ZSIsInNoaXBwaW5nLXByZXZpZXciLCJzaGlwcGluZy1wcmludCIsInNoaXBwaW5nLXNoYXJlIiwic2hpcHBpbmctdHJhY2tpbmciLCJlY29tbWVyY2Utc2hpcHBpbmciLCJ0cmFuc2FjdGlvbnMtcmVhZCIsInVzZXJzLXJlYWQiLCJ1c2Vycy13cml0ZSIsIndlYmhvb2tzLXJlYWQiLCJ3ZWJob29rcy13cml0ZSIsIndlYmhvb2tzLWRlbGV0ZSIsInRkZWFsZXItd2ViaG9vayJdfQ.xK-VMrt44ilOYWGU-dMtGbxIVtRyUzJbF6TJ68rYSqqR3nKcys0Db5GytLS7ptntp4po8CEat6NkbwWYuvxIy7IlLei-oxmCs0iGJ9zjS_Y6dgzcQGHmGKOKsBdvyeFY4ihgQrtI6B49SGHA7LXl2ILtETWTt_undQUwuh6H347fv0UpkgfXlPV2P1MtcW-FJRVOt8Tu_qJ2fhmZggehPQj7kjydSZCtj1HoIW0Pzs3m9c-SwIISWgzGwT0swBFtejVIm4Jpf8OA3O7Q83NzYWdrFhjE8HGg6j1ybG_ZBysGN1kf05yI1X776aWVHwtoOQryborXEEeYdrz3yldzvMMpuOo15tR5jkq1nG0MR_V6ieZOHu4HSWVdmFZ79KJa899H5SH58OLzl7Eblz2fNtPCzaNae0UGLxEofRM42vdmqE8WCtd0jJ0bZrMwtsWDMgBBb37C0eDFnfJA7hF1GgDGLFKFDDjGP46MuSVdoyy41qNAT97UTJ7Dazx8W8B-K8EzSkCyqTNQUpOwxcmTRHL8R9No5WQTQPnKoY-16HEM43Vsv9QN_DqXlKK0_E21fYndlBmg6ZDvSOlaUAXgK8wMzJHVAM3U4-EpqRtyYWa2QNVu-tZqfCqnhPD5Fhe7rBBVEKGWpkSrgujMTvBrC6KXVX6L6r5dJb_K7ShZpL0";
    await dbInstance.collection('settings').doc('melhorenvio').set({
      token: providedToken,
      baseUrl: "https://www.melhorenvio.com.br",
      updatedAt: new Date()
    }, { merge: true });
    logger.info("✅ [STARTUP] Melhor Envio token has been auto-seeded successfully.");
  } catch (err: any) {
    logger.error(`⚠️ [STARTUP] Failed to seed Melhor Envio token: ${err.message}`);
  }
};
seedMelhorEnvioToken();

apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

apiRouter.get("/checkout/config", (req, res) => {
  const pk = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY || '';
  const info = getMPEnvInfo();
  
  if (!pk) {
    return res.status(500).json({ error: "Public Key missing in server environment." });
  }

  res.json({
    mercadopago: {
      publicKey: pk,
      mode: info.pk.mode,
      atMode: info.at.mode,
      atPrefix: info.at.prefix,
      compatible: info.isCompatible
    }
  });
});

apiRouter.post("/checkout/process-payment", processPayment);

// Automation and Checkout Lead Recovery
apiRouter.post("/checkout/lead", handleSaveLead);
apiRouter.post("/checkout/trigger-cron", triggerCronCheck);
apiRouter.post("/automation/resend", manualResendAutomation);
apiRouter.get("/automation/dashboard", getAutomationDashboard);

// Production Notifications & Automation Config
apiRouter.get("/automation/production-settings", getProductionSettings);
apiRouter.post("/automation/production-settings", saveProductionSettings);
apiRouter.post("/automation/production-settings/restore-defaults", restoreDefaultProductionSettings);
apiRouter.post("/automation/stage-notification", triggerProductionStageNotification);
apiRouter.post("/automation/stage-notification/test", testProductionNotification);

apiRouter.post("/automation/send-manual-order-whatsapp", async (req, res) => {
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
    
    // Check if it's already sent to avoid duplicate
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
    
    // Build log entry
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
    
    // Update document
    const whatsappMessages = orderData.whatsappMessages || {};
    whatsappMessages.pedidoCriado = true;
    
    const whatsappLogs = orderData.whatsappLogs || [];
    whatsappLogs.push(logEntry);
    
    await orderRef.update({
      whatsappMessages,
      whatsappLogs,
      updatedAt: new Date()
    });
    
    res.json({ success, logEntry });
  } catch (error: any) {
    logger.error(`❌ [MANUAL-ORDER-WA-ERR] Error sending manual order whatsapp: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Shipping Integration Config Endpoints
apiRouter.get("/shipping/config", async (req, res) => {
  try {
    const dbInstance = getDb();
    const settingsSnap = await dbInstance.collection('settings').doc('melhorenvio').get();
    let melhorenvioConfig = { token: "", baseUrl: "https://www.melhorenvio.com.br" };
    if (settingsSnap.exists) {
      const data = settingsSnap.data();
      if (data) {
        melhorenvioConfig = {
          token: data.token || "",
          baseUrl: data.baseUrl || "https://www.melhorenvio.com.br"
        };
      }
    }
    const token = melhorenvioConfig.token;
    const maskedToken = token ? `${token.substring(0, 10)}...${token.substring(token.length - 10)}` : "";
    res.json({
      hasToken: !!token,
      maskedToken,
      baseUrl: melhorenvioConfig.baseUrl
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/shipping/config", async (req, res) => {
  try {
    const { token, baseUrl } = req.body;
    const dbInstance = getDb();
    await dbInstance.collection('settings').doc('melhorenvio').set({
      token: token || "",
      baseUrl: baseUrl || "https://www.melhorenvio.com.br",
      updatedAt: new Date()
    }, { merge: true });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/shipping/calculate", async (req, res) => {
  try {
    const { to, items } = req.body;
    const from = process.env.ORIGIN_CEP ? process.env.ORIGIN_CEP.replace(/\D/g, '') : '89234100';
    const result = await melhorEnvio.calculateShipping({ from, to, items });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/shipping/create-label", async (req, res) => {
  try {
    // Only basic integration for now, requires admin auth if we had it properly implemented
    const result = await melhorEnvio.createLabel(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/webhook/mercadopago", handleWebhook);
apiRouter.post("/webhooks/mercadopago", handleWebhook); // Plural variant requested by user

// Google Sheets Bidirectional real-time update sync-back
apiRouter.post("/sheets/sync-back", async (req, res) => {
  try {
    const { products, orders, investments, cashflow, traffic } = req.body;
    const dbInstance = getDb();
    if (!dbInstance) {
      return res.status(503).json({ error: "Database not ready" });
    }

    console.log("📥 [SHEETS-SYNC-BACK] Recebendo atualizações da planilha...");

    // 1. Update Products
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

    // 2. Update Orders status
    if (orders && Array.isArray(orders)) {
      for (const o of orders) {
        if (!o.id) continue;
        const docRef = dbInstance.collection('orders').doc(o.id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const validStatuses = ['received', 'separacao', 'embalagem', 'shipped', 'delivered', 'canceled'];
          // Normalize status
          let statusVal = String(o.status || '').trim().toLowerCase();
          if (statusVal === 'pagamento aprovado' || statusVal === 'payment_approved') statusVal = 'embalagem';
          if (statusVal === 'recebido' || statusVal === 'aguardando pagamento' || statusVal === 'payment_pending') statusVal = 'received';
          if (statusVal === 'concluído' || statusVal === 'concluido') statusVal = 'delivered';
          if (statusVal === 'cancelado') statusVal = 'canceled';
          if (statusVal === 'enviado') statusVal = 'shipped';

          if (validStatuses.includes(statusVal)) {
            const orderData = docSnap.data();
            const alreadyReverted = orderData?.stockReverted || orderData?.stockRevertedAcknowledged;
            const isCancellation = statusVal === 'canceled';

            await docRef.update({
              status: statusVal,
              updatedAt: new Date()
            });

            if (isCancellation && !alreadyReverted && orderData?.items) {
              try {
                logger.info(`📦 [SHEETS-SYNC-BACK] Reverting stock for canceled order: ${o.id}`);
                const { adjustStock } = await import("./server/services/store.service.js");
                await adjustStock(orderData.items, 'add');
                await docRef.update({
                  stockReverted: true,
                  stockRevertedAcknowledged: true
                });
              } catch (stockErr: any) {
                logger.error(`❌ [SHEETS-SYNC-BACK] Failed to revert stock for order ${o.id}:`, stockErr);
              }
            }
          }
        }
      }
    }

    // 3. Update/Create Investments
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

    // 4. Update/Create Cashflow
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

    // 5. Update/Create Traffic
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

    console.log("✅ [SHEETS-SYNC-BACK] Banco de dados atualizado com as alterações da planilha.");
    res.json({ success: true, message: "Site sincronizado em tempo real com as alterações da planilha!" });
  } catch (error: any) {
    console.error("❌ [SHEETS-SYNC-BACK] Erro ao sincronizar de volta:", error);
    res.status(500).json({ error: error.message });
  }
});

// Status Verification (By Order ID)
apiRouter.get("/checkout/verify/:orderId", async (req, res) => {
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

// Status Verification (By Payment ID) - Requested by User
apiRouter.get("/payment/status/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    const database = getDb();
    if (!database) return res.status(503).json({ error: "Database not ready" });
    
    let query = await database.collection('orders')
      .where('mercadoPagoId', '==', String(paymentId))
      .limit(1)
      .get();

    // Fallback search by legacy field if needed
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

    // DEFINITIVE SYNC: If not approved in DB, check MP directly
    if (order.status !== 'Pagamento Aprovado' && order.paymentStatus !== 'approved') {
      logger.info(`🔄 [PAYMENT-SYNC] Proactive check for Payment ID ${paymentId} (Order: ${orderId})`);
      try {
        const mpPayment = await mpService.getPayment(String(paymentId));
        if (mpPayment && mpPayment.status === 'approved') {
          logger.info(`✅ [PAYMENT-SYNC] Found approved status on MP for ${paymentId}. Updating DB...`);
          const { processPaymentUpdate } = await import('./server/services/payment.service.js');
          await processPaymentUpdate(orderId, mpPayment);
          
          // Re-fetch data after update
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

// Catch-all 404 handler for API routes to guarantee JSON responses (never HTML)
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Rota de API não encontrada: ${req.method} ${req.originalUrl}` });
});

// Global Express error handler for API errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api')) {
    logger.error(`❌ [API-ERROR] ${req.method} ${req.path}:`, err);
    return res.status(500).json({ error: err?.message || "Erro interno no servidor de API" });
  }
  next(err);
});

// Serve uploads statically in BOTH dev and production modes
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

// 5. Dynamic Application Mode (Vite Dev vs Prod)
async function bootstrap() {
  const isBundled = typeof __filename !== "undefined" && __filename.includes("server.cjs");
  const isDev = process.env.NODE_ENV !== 'production' && !isBundled;

  if (isDev) {
    // Development Mode (Vite Middleware)
    try {
      // Support raw static file serving for public directory assets (e.g., /shirt_baked.glb) in dev mode
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
      // Basic fallback
      app.listen(PORT, "0.0.0.0", () => {
        logger.info(`✅ [FALLBACK SERVER] Running on port ${PORT}`);
      });
    }
  } else {
    // Production Mode (Static Build)
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

// Run once immediately on startup with a tiny delay to allow database/Firestore instance stabilization
setTimeout(async () => {
  try {
    const { autoCancelUnpaidOrders } = await import("./server/services/payment.service.js");
    await autoCancelUnpaidOrders();
  } catch (err: any) {
    logger.error("❌ [STARTUP-ERR] Initial auto-cancel scan failed", err);
  }
}, 5000);

// Register background cron routine to detect abandoned checkouts and auto-cancel old orders every 10 minutes
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

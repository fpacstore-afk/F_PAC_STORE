
import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";

// Environment setup
dotenv.config();

// Imports from new architecture
import { initFirebase, getDb } from "./server/firebase";
import { logger } from "./server/utils/logger";
import { processPayment } from "./server/controllers/checkout.controller";
import { handleWebhook } from "./server/controllers/webhook.controller";
import * as storeService from "./server/services/store.service";

const app = express();
const PORT = 3000;

// 1. Initial configuration
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Audit Middleware
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  logger.info(`${req.method} ${req.url} from ${req.ip}`);
  next();
});

// Initialize Firebase synchronously
initFirebase();

// 2. API Router - Defined Synchronously
const apiRouter = express.Router();

// Health & Diagnostics
apiRouter.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

apiRouter.get("/diagnostics", (req, res) => {
  try {
    const pk = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY || '';
    const at = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
    
    const getMode = (str: string) => {
      if (!str) return 'EMPTY';
      const upper = str.toUpperCase();
      if (upper.startsWith('TEST-')) return 'SANDBOX';
      if (upper.startsWith('APP_USR-')) return 'PRODUCTION';
      return 'UNKNOWN';
    };

    const pkType = getMode(pk);
    const atType = getMode(at);
    
    res.json({
      timestamp: new Date().toISOString(),
      env: {
        MERCADO_PAGO_AT_SET: !!at,
        MERCADO_PAGO_PK_SET: !!pk,
        AT_TYPE: atType,
        PK_TYPE: pkType,
        AT_PREFIX: at ? at.substring(0, 10).toUpperCase() + '...' : 'MISSING',
        PK_PREFIX: pk ? pk.substring(0, 10).toUpperCase() + '...' : 'MISSING',
        MATCH: pkType === atType && atType !== 'UNKNOWN' && atType !== 'EMPTY'
      },
      system: {
        node_env: process.env.NODE_ENV,
        is_vercel: !!process.env.VERCEL,
        cwd: process.cwd()
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: "Diagnostics failed", message: err.message });
  }
});

apiRouter.get("/checkout/config", (req, res) => {
  try {
    const publicKey = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY;
    
    if (!publicKey) {
      logger.error("CRITICAL: MERCADO_PAGO_PUBLIC_KEY is not defined in any environment variable.");
      return res.status(500).json({ 
        error: "Config Error", 
        message: "A chave pública do Mercado Pago não foi configurada no servidor." 
      });
    }

    res.json({ mercadopago: { publicKey } });
  } catch (err: any) {
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

// Main Checkout Flow
apiRouter.post("/checkout/process-payment", processPayment);
apiRouter.post("/webhook/mercadopago", handleWebhook);

// Status Verification
apiRouter.get("/checkout/verify/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const database = getDb();
    if (!database) throw new Error("DB not available");
    
    const doc = await database.collection('orders').doc(orderId).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    const data = doc.data();
    res.json({
      id: orderId,
      status: data?.status || 'pending',
      paymentStatus: data?.paymentStatus || 'pending',
      point_of_interaction: data?.point_of_interaction || null
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.use("/api", apiRouter);

// 3. Vite / Static Serving Initialization
async function setupFrontend() {
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL;

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (err) {
      logger.error("Vite failing in dev mode", err);
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
  }
}

setupFrontend();

// 4. Background Utility: Cleanup expired orders
async function cleanupTask() {
  try {
    const database = getDb();
    if (!database) return;
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const oldOrdersSnap = await database.collection('orders')
      .where('createdAt', '<', yesterday)
      .limit(20)
      .get();
      
    for (const docSnap of oldOrdersSnap.docs) {
      const order = docSnap.data();
      if (order.status === 'received' || order.status === 'pending') {
        await storeService.updateOrderStatus(docSnap.id, 'cancelled', { paymentStatus: 'expired' });
        await storeService.adjustStock(order.items || [], 'add');
      }
    }
  } catch (err) {
     // Ignore cleanup errors
  }
}

// 5. Start Server
if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`✅ [SYSTEM READY] Server listening on ${PORT}`);
    setInterval(cleanupTask, 1000 * 60 * 60); 
  });
}

export default app;

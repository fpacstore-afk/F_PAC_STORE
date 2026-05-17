
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

// Crash Logger for Vercel
process.on('uncaughtException', (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", err.message, err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error("🔥 UNHANDLED REJECTION:", reason);
});

const app = express();
const PORT = 3000;

// 1. Initial configuration
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Fast Health Check (No logs, no logic)
app.get("/api/health", (req, res) => res.json({ status: "ok", env: process.env.NODE_ENV }));

// Audit Middleware
app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path === '/api/diagnostics') return next();
  try {
    logger.info(`${req.method} ${req.url} from ${req.ip}`);
  } catch (e) {}
  next();
});

// 2. API Router
const apiRouter = express.Router();

apiRouter.get("/diagnostics", (req, res) => {
  try {
    const pk = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY || '';
    const at = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
    
    const getMode = (val: string) => {
      if (!val) return 'EMPTY';
      const s = String(val).toUpperCase();
      if (s.startsWith('TEST-')) return 'SANDBOX';
      if (s.startsWith('APP_USR-')) return 'PRODUCTION';
      return 'UNKNOWN';
    };

    const pkMode = getMode(pk);
    const atMode = getMode(at);

    res.json({
      timestamp: new Date().toISOString(),
      mercadoPago: {
        pk_mode: pkMode,
        at_mode: atMode,
        pk_prefix: pk ? pk.substring(0, 15) : null,
        at_prefix: at ? at.substring(0, 15) : null,
        match: pkMode === atMode && pkMode !== 'UNKNOWN' && pkMode !== 'EMPTY'
      },
      firebase: {
        sa_len: process.env.FIREBASE_SERVICE_ACCOUNT?.length || 0,
        pid: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'MISSING'
      },
      env: {
        node_env: process.env.NODE_ENV,
        is_vercel: !!process.env.VERCEL,
        region: process.env.VERCEL_REGION || 'local'
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: "Diagnostics failed", message: err.message, stack: err.stack });
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

// 5. Vite Development Support (Skip on Vercel)
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  const setupDev = async () => {
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
  };
  setupDev();
}

// 5. Start Server (Skip on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`✅ [SYSTEM READY] Server listening on ${PORT}`);
    setInterval(cleanupTask, 1000 * 60 * 60); 
  });
}

export default app;

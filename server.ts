
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

// 2. API Router
const apiRouter = express.Router();

// Outra rota para diagnósticos em português (conforme visto em prints)
apiRouter.get("/diagnostico", (req: any, res: any) => {
  res.json({
    status: "ok",
    message: "Use /api/diagnostics para detalhes",
    redirected: true
  });
});

apiRouter.get("/health", (req, res) => res.json({ status: "ok", env: process.env.NODE_ENV }));

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
    res.status(500).json({ error: "Diagnostics failed", message: err.message });
  }
});

apiRouter.get("/checkout/config", (req, res) => {
  try {
    const publicKey = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY;
    if (!publicKey) return res.status(500).json({ error: "Public key missing" });
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
    if (!database) return res.status(503).json({ error: "Database not ready" });
    
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

// 3. Static Serving (Skip Vite logic in Vercel/Production for performance/bundling)
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  // Local Dev - Vite handles it
  import("vite").then(({ createServer }) => {
    createServer({ server: { middlewareMode: true }, appType: "spa" }).then(vite => {
      app.use(vite.middlewares);
      app.listen(PORT, "0.0.0.0", () => {
        logger.info(`✅ [SYSTEM READY] Dev server listening on ${PORT}`);
      });
    });
  }).catch(() => {
    app.listen(PORT, "0.0.0.0", () => logger.info(`✅ [SYSTEM READY] fallback listening on ${PORT}`));
  });
} else if (!process.env.VERCEL) {
  // Production Standalone - Static Serving
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return res.status(404).end();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => logger.info(`✅ [PROD READY] Server listening on ${PORT}`));
}


export default app;

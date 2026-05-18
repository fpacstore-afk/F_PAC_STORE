
import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";

// Environment setup
dotenv.config();

// Imports from new architecture
import { getDb } from "./server/firebase.js";
import { logger } from "./server/utils/logger.js";
import { processPayment } from "./server/controllers/checkout.controller.js";
import { handleWebhook } from "./server/controllers/webhook.controller.js";
// storeService removed from top level and will be used via its exports where needed

const app = express();
const PORT = 3000;

// 1. Initial configuration
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// 2. API Router
const apiRouter = express.Router();

// Diagnóstico rápido
apiRouter.get("/health", (req, res) => {
  console.log("Health check hit");
  res.json({ status: "ok", vercel: !!process.env.VERCEL });
});

apiRouter.get("/diagnostico", (req: any, res: any) => {
  console.log("Redirecting /api/diagnostico to diagnostics");
  res.redirect("/api/diagnostics");
});

apiRouter.get("/diagnostics", (req, res) => {
  console.log("DIAGNOSTICS ROUTE START");
  try {
    const pk_vite = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || '';
    const pk_server = process.env.MERCADO_PAGO_PUBLIC_KEY || '';
    const pk = pk_vite || pk_server;
    const at = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
    
    const pk_source = pk_vite ? "VITE_MERCADO_PAGO_PUBLIC_KEY" : (pk_server ? "MERCADO_PAGO_PUBLIC_KEY" : "NONE");

    const getMode = (val: any) => {
      if (!val) return 'EMPTY';
      const s = String(val).trim().toUpperCase();
      if (s.startsWith('TEST-')) return 'SANDBOX';
      if (s.startsWith('APP_USR-')) return 'PRODUCTION';
      return `UNKNOWN(${s.substring(0, 5)})`;
    };

    const pkMode = getMode(pk);
    const atMode = getMode(at);

    const result = {
      timestamp: new Date().toISOString(),
      status: "online",
      mercadoPago: {
        pk_mode: pkMode,
        at_mode: atMode,
        match: pkMode === atMode && pkMode !== 'EMPTY',
        pk_source: pk_source,
        sources: {
          VITE_MERCADO_PAGO_PUBLIC_KEY: { mode: getMode(pk_vite), prefix: pk_vite ? pk_vite.substring(0, 15) : null },
          MERCADO_PAGO_PUBLIC_KEY: { mode: getMode(pk_server), prefix: pk_server ? pk_server.substring(0, 15) : null },
          MERCADO_PAGO_ACCESS_TOKEN: { mode: atMode, prefix: at ? at.substring(0, 15) : null }
        }
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
    };
    
    console.log("Diagnostics result prepared successfully.");
    res.json(result);
  } catch (err: any) {
    console.error("DIAGNOSTICS ERROR:", err);
    res.status(500).json({ error: "Diagnostics failed", message: err.message });
  }
});

apiRouter.get("/checkout/config", (req, res) => {
  const publicKey = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY;
  if (!publicKey) return res.status(500).json({ error: "Public key missing" });
  res.json({ mercadopago: { publicKey } });
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

// 3. Vite development server setup
async function start() {
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: false,
          watch: null
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      app.listen(PORT, "0.0.0.0", () => {
        logger.info(`✅ [SYSTEM READY] Dev server listening on http://localhost:${PORT}`);
      });
    } catch (err) {
      logger.error("Vite failing in dev mode", err);
      app.listen(PORT, "0.0.0.0", () => {
        logger.info(`✅ [SYSTEM READY] Fallback server listening on ${PORT}`);
      });
    }
  } else if (!process.env.VERCEL) {
    // Production Standalone (non-Vercel)
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        if (req.path.startsWith("/api")) return res.status(404).end();
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
    app.listen(PORT, "0.0.0.0", () => {
      logger.info(`✅ [PROD READY] Server listening on ${PORT}`);
    });
  }
}

start();

export default app;

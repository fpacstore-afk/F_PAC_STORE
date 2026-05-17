
import express from "express";
import path from "path";
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

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  
  logger.info("🚀 [AUDIT] System reconstruction initializing...");
  
  // 1. Init Database
  const db = initFirebase();

  // 2. Setup Express
  const app = express();
  app.set('trust proxy', true);
  app.use(cors());
  app.use(express.json());

  // Audit Middleware
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url} from ${req.ip}`);
    next();
  });

  // 3. API Router
  const apiRouter = express.Router();
  
  // Health & Diagnostics
  apiRouter.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
  
  apiRouter.get("/checkout/config", (req, res) => {
    const publicKey = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY;
    if (!publicKey) logger.warn("API Request for config but public key is missing");
    res.json({ mercadopago: { publicKey: publicKey || "" } });
  });

  // Main Checkout Flow
  apiRouter.post("/checkout/process-payment", processPayment);
  apiRouter.post("/webhook/mercadopago", handleWebhook);

  // Status Verification
  apiRouter.get("/checkout/verify/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;
      const doc = await db.collection('orders').doc(orderId).get();
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

  apiRouter.get("/diagnostics", (req, res) => {
    res.json({
      timestamp: new Date().toISOString(),
      env: {
        MERCADO_PAGO: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
        FIREBASE: !!process.env.FIREBASE_PROJECT_ID,
        RESEND: !!process.env.RESEND_API_KEY
      }
    });
  });

  app.use("/api", apiRouter);

  // 4. Production Static Serving
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // 5. Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(`Unhandled Error at ${req.path}`, { error: err.message, stack: err.stack });
    res.status(err.status || 500).json({ 
      error: "Internal Server Error", 
      message: err.message || "An unexpected error occurred",
      timestamp: new Date().toISOString()
    });
  });

  // 6. Background Utility: Cleanup expired orders
  async function cleanupTask() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const oldOrdersSnap = await db.collection('orders')
        .where('createdAt', '<', yesterday)
        .limit(50)
        .get();
        
      for (const docSnap of oldOrdersSnap.docs) {
        const order = docSnap.data();
        if (order.status === 'received' || order.status === 'pending') {
          logger.audit(`[CLEANUP] Cancelling expired order ${docSnap.id}`);
          await storeService.updateOrderStatus(docSnap.id, 'cancelled', { paymentStatus: 'expired' });
          await storeService.adjustStock(order.items || [], 'add');
        }
      }
    } catch (err) {
       logger.error("Cleanup task failed", err);
    }
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`✅ [SYSTEM READY] Audit completed. Server listening on ${PORT}`);
    setInterval(cleanupTask, 1000 * 60 * 60); // Every 1h
    cleanupTask(); // Initial run
  });
}

startServer().catch(err => {
  console.error("❌ CRITICAL SERVER INITIALIZATION ERROR:", err);
  process.exit(1);
});

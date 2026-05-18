
import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";
import { createServer as createViteServer } from "vite";

// 1. Load Environment Configuration
dotenv.config();

// 2. Imports from internal architecture
import { getDb } from "./server/firebase.js";
import { logger } from "./server/utils/logger.js";
import { processPayment } from "./server/controllers/checkout.controller.js";
import { handleWebhook } from "./server/controllers/webhook.controller.js";

const app = express();
const PORT = 3000;

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

  return {
    pk: { mode: pkMode, prefix: pk.substring(0, 10), length: pk.length },
    at: { mode: atMode, prefix: at.substring(0, 10), length: at.length },
    isCompatible: pkMode === atMode && pkMode !== 'EMPTY' && pkMode !== 'UNKNOWN'
  };
};

// Start Check
const envCheck = getMPEnvInfo();
console.log('----------------------------------------------------');
console.log('🚀 [STARTUP] MERCADO PAGO CONFIGURATION AUDIT');
console.log(`PUBLIC KEY:   ${envCheck.pk.mode} (${envCheck.pk.prefix}...)`);
console.log(`ACCESS TOKEN: ${envCheck.at.mode} (${envCheck.at.prefix}...)`);
if (!envCheck.isCompatible) {
  console.error('🛑 CRITICAL: AMBIENTE INCONSISTENTE DETECTADO!');
  console.error('Sua Public Key e Access Token não pertencem ao mesmo ambiente.');
} else {
  console.log('✅ AMBIENTE CONSISTENTE E PRONTO PARA USO.');
}
console.log('----------------------------------------------------');

// 4. API Routes
const apiRouter = express.Router();

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
      compatible: info.isCompatible
    }
  });
});

apiRouter.post("/checkout/process-payment", processPayment);
apiRouter.post("/webhook/mercadopago", handleWebhook);

// Status Verification
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

app.use("/api", apiRouter);

// 5. Dynamic Application Mode (Vite Dev vs Prod)
async function bootstrap() {
  if (process.env.NODE_ENV !== 'production') {
    // Development Mode (Vite Middleware)
    try {
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

export default app;

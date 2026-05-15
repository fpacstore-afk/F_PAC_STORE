import express from "express";
import path from "path";
import fs from "fs";
import admin from "firebase-admin";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { Resend } from "resend";
import dotenv from "dotenv";
import cors from "cors";
import { createServer as createViteServer } from "vite";

dotenv.config();

async function startServer() {
  console.log(`🚀 [SERVER] Starting initialization... PORT: ${process.env.PORT || 3000}, NODE_ENV: ${process.env.NODE_ENV}`);
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // Log all requests
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} [${req.method}] ${req.url}`);
    next();
  });

// ------------------------------------------------------------
// FIREBASE ADMIN SETUP
// ------------------------------------------------------------
let dbAdmin: admin.firestore.Firestore;

try {
  console.log("🔥 [FIREBASE] Initializing...");
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
    }
  } else if (!admin.apps.length) {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    let fallbackId = undefined;
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        fallbackId = config.projectId;
      } catch (e) {}
    }

    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || fallbackId
    });
  }
  dbAdmin = admin.firestore();
} catch (error) {
  console.error("🔥 [FIREBASE] Critical Error:", error);
  process.exit(1);
}

// ------------------------------------------------------------
// MERCADO PAGO SETUP
// ------------------------------------------------------------
const getMPClient = () => {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN is missing");
  return new MercadoPagoConfig({ accessToken: token });
};

// ------------------------------------------------------------
// RESEND SETUP
// ------------------------------------------------------------
const getResend = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is missing");
  return new Resend(key);
};

// ------------------------------------------------------------
// UTILS
// ------------------------------------------------------------
async function updateStock(items: any[], mode: 'subtract' | 'add') {
  const batch = dbAdmin.batch();
  for (const item of items) {
    const invRef = dbAdmin.collection('inventory').doc(`${item.productId}_${item.size}`);
    batch.set(invRef, {
      stock: admin.firestore.FieldValue.increment(mode === 'subtract' ? -item.quantity : item.quantity),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
}

async function sendOrderEmail(orderId: string, status: string) {
  try {
    const orderSnap = await dbAdmin.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) return;
    const order = orderSnap.data();
    const resend = getResend();
    
    await resend.emails.send({
      from: 'F PAC STORE <atendimento@fpacstore.com.br>',
      to: [order?.customerEmail],
      subject: `Pedido #${orderId} - Status: ${status}`,
      html: `<p>Olá ${order?.customerName}, seu pedido #${orderId} foi atualizado para: ${status}</p>`
    });
  } catch (e) {
    console.warn("Email failed:", e);
  }
}

function getBaseUrl(req: express.Request) {
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${protocol}://${host}`;
}

// ------------------------------------------------------------
// API ROUTER
// ------------------------------------------------------------
const apiRouter = express.Router();

apiRouter.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});

apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

  apiRouter.get("/checkout/config", (req, res) => {
    console.log("📥 [API] Requesting checkout config");
    try {
      res.json({
        mercadopago: {
          publicKey: process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || null,
          enabled: !!process.env.MERCADO_PAGO_ACCESS_TOKEN
        }
      });
    } catch (err: any) {
      console.error("❌ [API] Error in /checkout/config:", err);
      res.status(500).json({ error: err.message });
    }
  });

apiRouter.get("/checkout/mercadopago/verify/:orderId", async (req, res) => {
  const { orderId } = req.params;
  try {
    const orderRef = dbAdmin.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return res.status(404).json({ error: "Pedido não encontrado" });

    const orderData = orderSnap.data();
    const mpId = orderData?.mercadoPagoId;
    if (!mpId) return res.json({ status: orderData?.status, message: "Aguardando pagamento" });

    const payment = new Payment(getMPClient());
    const mpPayment = await payment.get({ id: String(mpId) });
    
    if (mpPayment.status === 'approved' && orderData?.status !== 'payment_approved') {
      await orderRef.update({ status: 'payment_approved', paymentStatus: 'approved' });
      await sendOrderEmail(orderId, 'Aprovado');
    }

    res.json({ status: mpPayment.status, detail: mpPayment.status_detail });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao verificar" });
  }
});

apiRouter.post("/checkout/mercadopago/process-payment", async (req, res) => {
  try {
    const { token, issuer_id, payment_method_id, transaction_amount, installments, payer, items, customerInfo, userId } = req.body;
    
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    const orderId = `FPAC-${timestamp}-${random}`;

    await dbAdmin.collection('orders').doc(orderId).set({
      ...req.body,
      id: orderId,
      customerEmail: customerInfo.email.toLowerCase(),
      customerName: customerInfo.name,
      status: 'received',
      paymentStatus: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await updateStock(items, 'subtract');

    const payment = new Payment(getMPClient());
    const mpResult = await payment.create({
      body: {
        transaction_amount: Number(transaction_amount),
        token,
        description: `Pedido #${orderId}`,
        installments: Number(installments),
        payment_method_id,
        issuer_id,
        external_reference: orderId,
        notification_url: `${getBaseUrl(req)}/api/webhook/mercadopago`,
        payer: {
          email: payer.email,
          identification: payer.identification
        }
      }
    });

    await dbAdmin.collection('orders').doc(orderId).update({
      mercadoPagoId: String(mpResult.id),
      paymentStatus: mpResult.status
    });

    if (mpResult.status === 'approved') {
      await dbAdmin.collection('orders').doc(orderId).update({ status: 'payment_approved' });
      await sendOrderEmail(orderId, 'Aprovado');
    }

    res.status(201).json({
      id: mpResult.id,
      status: mpResult.status,
      external_reference: orderId,
      point_of_interaction: mpResult.point_of_interaction
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post("/webhook/mercadopago", async (req, res) => {
  try {
    const paymentId = req.query.id || req.body.data?.id;
    if (paymentId) {
      const payment = new Payment(getMPClient());
      const mpPayment = await payment.get({ id: String(paymentId) });
      const orderId = mpPayment.external_reference;
      
      if (orderId) {
        const orderRef = dbAdmin.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (orderSnap.exists) {
          const orderData = orderSnap.data();
          if (mpPayment.status === 'approved' && orderData?.status !== 'payment_approved') {
            await orderRef.update({ status: 'payment_approved', paymentStatus: 'approved' });
            await sendOrderEmail(orderId, 'Aprovado');
          } else if (['rejected', 'cancelled'].includes(mpPayment.status!) && orderData?.status !== 'cancelled') {
            await orderRef.update({ status: 'cancelled', paymentStatus: mpPayment.status });
            await updateStock(orderData?.items || [], 'add');
          }
        }
      }
    }
    res.send("OK");
  } catch (e) {
    res.status(200).send("OK");
  }
});

apiRouter.all("*", (req, res) => res.status(404).json({ error: "Not Found" }));

  app.use("/api", apiRouter);

  // Error logging middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("🔥 [SERVER ERROR]:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  });

  // ------------------------------------------------------------
  // VITE MIDDLEWARE / PRODUCTION SETUP
  // ------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (!req.path.startsWith("/api")) {
        res.sendFile(path.join(distPath, "index.html"));
      }
    });
  }

  async function cleanupUnpaidOrders() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    console.log("🧹 [CLEANUP] Rodando limpeza de pedidos expirados...");
    
    // Fetch orders created before yesterday (uses default single-field index)
    const oldOrdersSnap = await dbAdmin.collection('orders')
      .where('createdAt', '<', yesterday)
      .limit(100)
      .get();
      
    if (oldOrdersSnap.empty) return;
    
    for (const docSnap of oldOrdersSnap.docs) {
      const order = docSnap.data();
      
      // Filter by status in memory to avoid composite index requirement
      if (order.status === 'received') {
        console.log(`♻️ [CLEANUP] Cancelando pedido expirado: ${docSnap.id}`);
        
        await dbAdmin.collection('orders').doc(docSnap.id).update({
          status: 'cancelled',
          paymentStatus: 'expired',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        await updateStock(order.items || [], 'add');
      }
    }
  } catch (err) {
    console.error("❌ [CLEANUP] Erro:", err);
  }
}

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server on ${PORT}`);
    
    // Cleanup initial run and interval
    setTimeout(cleanupUnpaidOrders, 5000);
    setInterval(cleanupUnpaidOrders, 60 * 60 * 1000); // 1h
  });
}

startServer();

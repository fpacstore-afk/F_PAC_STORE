import express from "express";
import path from "path";
import fs from "fs";
import admin from "firebase-admin";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { Resend } from "resend";
import dotenv from "dotenv";
import cors from "cors";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";

dotenv.config();

async function startServer() {
  console.log(`🚀 [SERVER] Starting initialization... PORT: ${process.env.PORT || 3000}, NODE_ENV: ${process.env.NODE_ENV}`);
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

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
  let protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  
  if (host && host.includes('.') && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    protocol = 'https';
  }
  
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

// ------------------------------------------------------------
// CHECKOUT ROUTES
// ------------------------------------------------------------
apiRouter.get("/checkout/config", (req, res) => {
  const publicKey = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY;
  
  if (!publicKey) {
    console.error("❌ [CONFIG] Error: Mercado Pago Public Key is MISSING in environment variables!");
  } else {
    // Basic redaction for logging
    const keyHint = publicKey.substring(0, 8);
    console.log(`🔍 [CONFIG] Key request handled. Hint: ${keyHint}...`);
  }
  
  res.json({
    mercadopago: {
      publicKey: publicKey || null
    }
  });
});

apiRouter.get("/checkout/verify/:orderId", async (req, res) => {
  const { orderId } = req.params;
  try {
    const orderDoc = await dbAdmin.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found" });

    const data = orderDoc.data();
    res.json({
      id: orderId,
      status: data?.status || 'pending',
      paymentStatus: data?.paymentStatus || 'pending',
      point_of_interaction: data?.point_of_interaction || null
    });
  } catch (err) {
    res.status(500).json({ error: "Error verifying order" });
  }
});

apiRouter.post("/checkout/process-payment", async (req, res) => {
  console.log("💳 [CHECKOUT] New Payment Request:", JSON.stringify(req.body, null, 2));
  
  try {
    const { 
      transaction_amount, 
      payment_method_id, 
      payer, 
      items, 
      customerInfo, 
      userId,
      token,
      installments,
      issuer_id
    } = req.body;

    // 1. Validations
    if (!customerInfo?.email || !transaction_amount) {
      return res.status(400).json({ error: "Missing required information" });
    }

    // 2. Create Order in Firestore first
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    const orderId = `FPAC-${timestamp}-${random}`;

    const orderPayload = {
      id: orderId,
      userId: userId || null,
      customerName: customerInfo.name,
      customerEmail: customerInfo.email,
      customerPhone: customerInfo.phone || '',
      shippingAddress: {
        street: customerInfo.address,
        number: customerInfo.number,
        complement: customerInfo.complement || '',
        neighborhood: customerInfo.neighborhood || '',
        city: customerInfo.city,
        state: customerInfo.state,
        zipCode: customerInfo.cep
      },
      items,
      total: transaction_amount,
      status: 'received',
      paymentStatus: 'pending',
      paymentMethod: payment_method_id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await dbAdmin.collection('orders').doc(orderId).set(orderPayload);
    await updateStock(items, 'subtract');

    // 3. Process with Mercado Pago
    const client = getMPClient();
    const payment = new Payment(client);

    const nameParts = customerInfo.name.split(' ');
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'F PAC';

    const cpfRaw = (customerInfo.cpf || payer?.identification?.number || '').replace(/\D/g, '');
    const identification = cpfRaw.length >= 11 ? {
      type: 'CPF',
      number: cpfRaw.substring(0, 11)
    } : undefined;

    // Sanitize Notification URL
    let notification_url = process.env.MERCADO_PAGO_WEBHOOK_URL;
    if (notification_url && !notification_url.startsWith('http')) {
      console.warn("⚠️ [MP] Invalid notification_url ignored:", notification_url);
      notification_url = undefined;
    }

    const mpBody: any = {
      transaction_amount: Number(transaction_amount),
      description: `Pedido #${orderId.substring(0, 10)}`,
      payment_method_id: payment_method_id,
      external_reference: String(orderId),
      notification_url: notification_url || undefined,
      additional_info: {
        items: items.map((item: any) => ({
          id: item.id || item.slug,
          title: item.name,
          quantity: Number(item.quantity),
          unit_price: Number(item.price)
        }))
      },
      payer: {
        email: customerInfo.email.trim(),
        first_name: firstName.substring(0, 40),
        last_name: lastName.substring(0, 40),
        identification
      }
    };

    if (token) mpBody.token = token;
    if (installments) mpBody.installments = Number(installments);
    if (issuer_id) mpBody.issuer_id = String(issuer_id);

    console.log("📤 [MP] API REQUEST:", JSON.stringify(mpBody, null, 2));

    const result = await payment.create({
      body: mpBody,
      requestOptions: { idempotencyKey: `IDEMP-${orderId}` }
    });

    console.log("✅ [MP] API SUCCESS:", result.id, result.status);

    // 4. Update Order with MP ID and status
    await dbAdmin.collection('orders').doc(orderId).update({
      mercadoPagoId: String(result.id),
      paymentStatus: result.status,
      point_of_interaction: result.point_of_interaction || null,
      status: result.status === 'approved' ? 'payment_approved' : 'received',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (result.status === 'approved') {
      await sendOrderEmail(orderId, 'Aprovado');
    }

    res.status(201).json({
      id: result.id,
      status: result.status,
      external_reference: orderId,
      point_of_interaction: result.point_of_interaction
    });

  } catch (err: any) {
    console.error("❌ [CHECKOUT ERROR]:", err);
    
    // Log the full response if it exists
    if (err.response) {
      console.error("❌ [MP] API FULL ERROR RESPONSE:", JSON.stringify(err.response, null, 2));
    }
    
    let errorMessage = "Erro no processamento do pagamento.";
    let details = null;

    if (err.response) {
      // In SDK v2, it might be in different places
      errorMessage = err.response.message || err.message || errorMessage;
      details = err.response;
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    res.status(err.status || 500).json({ 
      error: "Error processing payment", 
      message: errorMessage,
      details: details
    });
  }
});

apiRouter.post("/webhook/mercadopago", async (req, res) => {
  const paymentId = req.query.id || req.body.data?.id;
  const type = req.query.topic || req.body.type;

  // 1. Signature Validation (Fase 7)
  const xSignature = req.headers['x-signature'] as string;
  const xRequestId = req.headers['x-request-id'] as string;
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  if (secret && xSignature && xRequestId && paymentId) {
    try {
      const parts = xSignature.split(',');
      const tsPart = parts.find(p => p.startsWith('ts='));
      const v1Part = parts.find(p => p.startsWith('v1='));
      
      if (tsPart && v1Part) {
        const ts = tsPart.split('=')[1];
        const v1 = v1Part.split('=')[1];
        const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts};`;
        
        const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
        
        if (hash !== v1) {
          console.warn(`⚠️ [WEBHOOK] Invalid signature for payment ${paymentId}`);
          return res.status(401).send("Invalid Signature");
        }
        console.log(`✅ [WEBHOOK] Signature verified: ${paymentId}`);
      }
    } catch (err) {
      console.error("❌ [WEBHOOK] Signature check failed:", err);
    }
  }

  console.log(`🔔 [WEBHOOK] Notification: ${type} - ${paymentId}`);

  if (type === 'payment' && paymentId) {
    try {
      const client = getMPClient();
      const payment = new Payment(client);
      const mpPayment = await payment.get({ id: String(paymentId) });
      const orderId = mpPayment.external_reference;

      if (orderId) {
        const orderRef = dbAdmin.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();

        if (orderSnap.exists) {
          const currentData = orderSnap.data();
          
          if (mpPayment.status === 'approved' && currentData?.status !== 'payment_approved') {
            await orderRef.update({
              status: 'payment_approved',
              paymentStatus: 'approved',
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await sendOrderEmail(orderId, 'Aprovado');
          } else if (['rejected', 'cancelled'].includes(mpPayment.status || '') && currentData?.status !== 'cancelled') {
            await orderRef.update({
              status: 'cancelled',
              paymentStatus: mpPayment.status,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await updateStock(currentData?.items || [], 'add');
          }
        }
      }
    } catch (err) {
      console.error("❌ [WEBHOOK ERROR]:", err);
    }
  }

  res.status(200).send("OK");
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

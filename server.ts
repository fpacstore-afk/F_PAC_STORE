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
  
  // Se for um domínio real (contém ponto e não é localhost), forçamos HTTPS para compatibilidade com gateways
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

  apiRouter.get("/checkout/config", (req, res) => {
    console.log("📥 [API] Requesting checkout config...");
    try {
      const pubKey = process.env.VITE_MERCADO_PAGO_PUBLIC_KEY;
      const accToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      
      console.log(`🔍 [API] Config Check - PubKey: ${pubKey ? 'Exists' : 'MISSING'}, Token: ${accToken ? 'Exists' : 'MISSING'}`);
      
      res.json({
        mercadopago: {
          publicKey: pubKey || null,
          enabled: !!accToken
        }
      });
    } catch (err: any) {
      console.error("❌ [API] Error in /checkout/config:", err);
      res.status(500).json({ error: "Internal Config Error", details: err.message });
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

    const currentStatus = (await orderRef.get()).data()?.status;

    res.json({ 
      status: currentStatus, 
      mpStatus: mpPayment.status,
      detail: mpPayment.status_detail 
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao verificar" });
  }
});

apiRouter.post("/checkout/mercadopago/process-payment", async (req, res) => {
  try {
    const { token, issuer_id, payment_method_id, transaction_amount, installments, payer: incomingPayer, items, customerInfo, userId } = req.body;

    // Use customerInfo as the primary source of truth for email if the form payer is missing it
    const payerEmail = (incomingPayer?.email || customerInfo?.email || "").trim().toLowerCase();

    if (!payerEmail || !payerEmail.includes("@")) {
      console.warn("⚠️ [API] Tentativa de pagamento sem email válido:", { incomingPayer, email: customerInfo?.email });
      return res.status(400).json({ 
        error: "Dados do pagador incompletos", 
        message: "Um e-mail válido é obrigatório para processar o pagamento." 
      });
    }
    
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    const orderId = `FPAC-${timestamp}-${random}`;

    await dbAdmin.collection('orders').doc(orderId).set({
      ...req.body,
      id: orderId,
      customerEmail: payerEmail,
      customerName: customerInfo?.name || 'Cliente',
      status: 'payment_pending',
      paymentStatus: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    try {
      if (items && items.length > 0) {
        await updateStock(items, 'subtract');
      }
    } catch (stockErr) {
      console.warn("⚠️ [API] Falha ao atualizar estoque (não-crítico):", stockErr);
    }

    console.log(`💳 [API] Processando pagamento. Método: ${payment_method_id}, Valor: ${transaction_amount}`);
    console.log(`👤 [API] Payer Email: ${payerEmail}`);

    // Use only explicitly configured webhook URL
    const webhookUrl = process.env.MERCADO_PAGO_WEBHOOK_URL;
    const payment = new Payment(getMPClient());
    
    // Ensure transaction_amount is a number and rounded to 2 decimals
    const roundedAmount = Math.round(Number(transaction_amount) * 100) / 100;

    if (isNaN(roundedAmount) || roundedAmount <= 0) {
      throw new Error(`Valor de transação inválido: ${transaction_amount}`);
    }

    // Map units for Mercado Pago items
    const mpItems = (items || []).map((item: any) => {
      const price = Number(item.price);
      if (isNaN(price) || price <= 0) return null;
      return {
        id: String(item.productId || 'item').substring(0, 50),
        title: String(item.name || 'Produto').substring(0, 100),
        description: `Ref: ${item.productId}${item.size ? ` - Tam: ${item.size}` : ''}`.substring(0, 100),
        quantity: Math.max(1, Number(item.quantity || 1)),
        unit_price: Number(price.toFixed(2)),
        category_id: 'clothing',
        currency_id: 'BRL'
      };
    }).filter(Boolean);

    // Ensure we have at least one valid item for MP
    if (mpItems.length === 0) {
      console.warn("⚠️ [MP] Itens vazios ou inválidos. Usando item genérico.");
      mpItems.push({
        id: 'default',
        title: 'Pedido F PAC STORE',
        quantity: 1,
        unit_price: roundedAmount,
        category_id: 'clothing',
        currency_id: 'BRL'
      });
    }

    // Extract first and last name from customerInfo (which is reliable)
    const fullName = (customerInfo?.name || 'Cliente').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = (incomingPayer?.first_name || nameParts[0] || 'Cliente').substring(0, 50);
    const lastName = (incomingPayer?.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'F PAC')).substring(0, 50);

    // Build identifying info - ensure it has a valid length (11 for CPF, 14 for CNPJ)
    const cpfNumber = (incomingPayer?.identification?.number || customerInfo?.cpf || '').replace(/\D/g, '');
    let identification = undefined;
    
    if (cpfNumber.length >= 11) {
      identification = {
        type: cpfNumber.length === 11 ? 'CPF' : 'CNPJ',
        number: cpfNumber
      };
    }

    const isPix = String(payment_method_id).toLowerCase() === 'pix';

    // Critical validation for PIX in Brazil
    if (isPix && !identification) {
      console.error("❌ [MP] PIX requer identificação (CPF/CNPJ)");
      return res.status(400).json({
        error: "Dados incompletos",
        message: "O CPF ou CNPJ é obrigatório para gerar o pagamento via PIX."
      });
    }

    // Default body
    const paymentBody: any = {
      transaction_amount: roundedAmount,
      description: `Pedido #${orderId} - F PAC`.substring(0, 60),
      payment_method_id: String(payment_method_id).toLowerCase(),
      external_reference: orderId,
      notification_url: (webhookUrl && !webhookUrl.includes('localhost')) ? webhookUrl : undefined,
      payer: {
        email: payerEmail,
        first_name: firstName,
        last_name: lastName,
        identification: identification || undefined
      }
    };

    // Add card specific fields only if they exist and it's NOT a PIX payment
    if (payment_method_id?.toLowerCase() !== 'pix') {
      if (token) paymentBody.token = token;
      if (installments && Number(installments) > 0) paymentBody.installments = Number(installments);
      if (issuer_id && issuer_id !== 'null' && issuer_id !== 'undefined') paymentBody.issuer_id = String(issuer_id);
    }

    // Additional info for Better approval rates & PIX
    // For PIX, we keep it simpler to avoid 400 errors related to formatting
    paymentBody.additional_info = {
      items: mpItems.length > 0 ? mpItems : undefined,
      payer: {
        first_name: firstName,
        last_name: lastName,
        address: (customerInfo.address && customerInfo.cep && !isPix) ? {
          zip_code: customerInfo.cep.replace(/\D/g, '').substring(0, 8),
          street_name: customerInfo.address.substring(0, 100),
          street_number: String(customerInfo.number || '0').replace(/\D/g, '') || '0'
        } : undefined,
        registration_date: new Date().toISOString()
      },
      external_reference: orderId
    };

    // For non-pix, we can add shipments
    if (!isPix && customerInfo.address && customerInfo.cep) {
      paymentBody.additional_info.shipments = {
        receiver_address: {
          zip_code: customerInfo.cep.replace(/\D/g, '').substring(0, 8),
          street_name: customerInfo.address.substring(0, 100),
          street_number: String(customerInfo.number || '0').replace(/\D/g, '') || '0',
          floor: String(customerInfo.complement || '').substring(0, 10),
          apartment: ''
        }
      };
    }

    console.log("📤 [MP] Request Body (Redacted):", JSON.stringify({ ...paymentBody, token: paymentBody.token ? '***' : undefined }, null, 2));
    
    try {
      console.log("📤 [MP] Starting Payment.create...");
      const mpResult = await payment.create({ 
        body: paymentBody,
        requestOptions: { idempotencyKey: orderId } 
      });
      
      console.log(`✅ [MP] Success! ID: ${mpResult.id}, Status: ${mpResult.status}`);

      await dbAdmin.collection('orders').doc(orderId).update({
        mercadoPagoId: String(mpResult.id),
        paymentStatus: mpResult.status,
        point_of_interaction: mpResult.point_of_interaction || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (mpResult.status === 'approved') {
        await dbAdmin.collection('orders').doc(orderId).update({ status: 'payment_approved' });
        await sendOrderEmail(orderId, 'Aprovado');
      }

      res.status(201).json({
        id: mpResult.id,
        status: mpResult.status,
        external_reference: orderId,
        point_of_interaction: mpResult.point_of_interaction,
        payment_method_id: mpResult.payment_method_id
      });
    } catch (mpErr: any) {
      console.error("❌ [MP] Detailed Error API Response:");
      
      // Extraction for better feedback
      const mpResponse = mpErr.response || {};
      const mpData = mpErr.cause || mpErr.message || [];
      
      console.error("- Response Data:", JSON.stringify(mpResponse, null, 2));
      console.error("- Cause Data:", JSON.stringify(mpData, null, 2));
      
      let detail = "Erro ao processar pagamento com o gateway.";
      if (Array.isArray(mpErr.cause)) {
        detail = mpErr.cause[0]?.description || detail;
      } else if (mpErr.message) {
        detail = mpErr.message;
      }

      // Special handling for 400 errors (validation)
      res.status(400).json({ 
        error: "Erro no gateway de pagamento", 
        message: detail,
        mp_error: mpData,
        status: 400
      });
    }
  } catch (err: any) {
    console.error("❌ [API] Erro geral no processamento:", err);
    res.status(500).json({ error: "Erro interno ao processar pedido", message: err.message });
  }
});

apiRouter.post("/webhook/mercadopago", async (req, res) => {
  try {
    const paymentId = req.query.id || req.body.data?.id;
    const type = req.query.topic || req.body.type;
    
    console.log(`🔔 [WEBHOOK] MP Notification - Type: ${type}, ID: ${paymentId}`);

    if (paymentId && (type === 'payment' || !type)) {
      const payment = new Payment(getMPClient());
      const mpPayment = await payment.get({ id: String(paymentId) });
      const orderId = mpPayment.external_reference;
      
      console.log(`💳 [WEBHOOK] MP Payment ${paymentId} - Status: ${mpPayment.status}, Order: ${orderId}`);

      if (orderId) {
        const orderRef = dbAdmin.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (orderSnap.exists) {
          const orderData = orderSnap.data();
          if (mpPayment.status === 'approved' && orderData?.status !== 'payment_approved') {
            console.log(`✅ [WEBHOOK] Approving order ${orderId}`);
            await orderRef.update({ 
              status: 'payment_approved', 
              paymentStatus: 'approved',
              mercadoPagoId: String(paymentId),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await sendOrderEmail(orderId, 'Aprovado');
          } else if (['rejected', 'cancelled'].includes(mpPayment.status!) && orderData?.status !== 'cancelled') {
            console.log(`❌ [WEBHOOK] Cancelling order ${orderId} (MP Status: ${mpPayment.status})`);
            await orderRef.update({ 
              status: 'cancelled', 
              paymentStatus: mpPayment.status,
              mercadoPagoId: String(paymentId),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await updateStock(orderData?.items || [], 'add');
          }
        } else {
          console.warn(`⚠️ [WEBHOOK] Order ${orderId} not found in Firestore`);
        }
      }
    }
    res.status(200).send("OK");
  } catch (e: any) {
    console.error(`🔥 [WEBHOOK] Error:`, e.message);
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

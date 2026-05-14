import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";

import { Resend } from 'resend';
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
import fs from 'fs';

let adminEmail = "Ambiente (ADC)";

function initAdmin() {
  if (admin.apps.length > 0) return;

  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  let config: any = null;
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {}
  }

  // Detect project ID from environment or config
  const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || 
                     process.env.FIREBASE_PROJECT_ID || 
                     process.env.VITE_FIREBASE_PROJECT_ID;

  const projectId = envProjectId || config?.projectId || 'fpac-store62';

  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.CONTA_DE_SERVIÇO_FIREBASE;

  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      adminEmail = serviceAccount.client_email || "Service Account JSON";
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId
      });
      console.log(`✅ [FIREBASE] Admin SDK inicializado via Service Account: ${adminEmail} (Projeto: ${projectId})`);
      return;
    } catch (e: any) {
      console.error("❌ [FIREBASE] Erro ao processar JSON da Service Account:", e.message);
    }
  }

  try {
    // Configuração mínima e segura para ADC
    const options: admin.AppOptions = { projectId };
    
    // No Cloud Run/AI Studio, usamos ADC. 
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE) {
      options.credential = admin.credential.applicationDefault();
    }

    admin.initializeApp(options);
    console.log(`✅ [FIREBASE] Admin SDK inicializado (Projeto: ${projectId} | ADC)`);
  } catch (e: any) {
    if (e.message.includes('already exists')) {
      console.log("ℹ️ [FIREBASE] Admin já estava inicializado.");
    } else {
      console.error("❌ [FIREBASE] Erro crítico na inicialização do Admin:", e.message);
    }
  }
}

initAdmin();

function getDb() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  let databaseId = '(default)';
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.firestoreDatabaseId) databaseId = config.firestoreDatabaseId;
    } catch (e) {}
  }
  
  const app = admin.app();
  console.log(`ℹ️ [FIREBASE] Resolvendo Firestore: DB=${databaseId} | Project=${app.options.projectId}`);
  
  // v13+ style: getFirestore already handles (default) correctly
  return getFirestore(app, databaseId === '(default)' ? undefined : databaseId);
}

const dbAdmin = getDb();

// Diagnóstico adicional de dbAdmin
if (dbAdmin) {
  console.log(`📡 [FIREBASE] dbAdmin configurado para:`, {
    projectId: (dbAdmin as any).projectId || admin.app().options.projectId,
    databaseId: (dbAdmin as any).databaseId || '(default)'
  });
}

// Teste de conexão/permissão imediato
(async () => {
  try {
    const healthRef = dbAdmin.collection('_health');
    console.log(`🔍 [FIREBASE] Testando acesso ao projeto: ${admin.app().options.projectId}...`);
    await healthRef.limit(1).get();
    console.log("✅ [FIREBASE] Teste de LEITURA OK.");
    
    await healthRef.doc('init').set({ 
      lastInit: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development'
    }, { merge: true });
    console.log("✅ [FIREBASE] Teste de ESCRITA OK.");
  } catch (e: any) {
    console.error("❌ [FIREBASE] TESTE ADMIN FALHOU:", e.message);
    if (e.message.includes("PERMISSION_DENIED") || e.code === 7) {
      console.error("👉 ERRO DE PERMISSÃO: O Admin SDK não tem autorização no projeto Firestore.");
      console.error(`DETALHES: ProjectID=${admin.app().options.projectId} | DB=${(dbAdmin as any).databaseId || "(default)"}`);
      console.error(`SERVICE_ACCOUNT: ${adminEmail}`);
      console.error("DICA: No Console do GCP (https://console.cloud.google.com/iam-admin/iam), procure por: " + adminEmail);
      console.error("1. Se o e-mail for 'Ambiente (ADC)', procure o e-mail que termina em '-compute@developer.gserviceaccount.com' no seu projeto.");
      console.error("2. Clique em 'EDITAR' (ícone de lápis) ao lado do e-mail.");
      console.error("3. Clique em '+ ADICIONAR OUTRO PAPEL'.");
      console.error("4. Procure por: 'Usuário do Cloud Datastore' (Cloud Datastore User).");
      console.error("5. Se o problema persistir, adicione também: 'Administrador do Firebase' (apenas para teste).");
      console.error("6. Salve e aguarde 2 minutos.");
    }
  }
})();

// Função para garantir que o Admin SDK retorne erro amigável se falhar
function checkFirebaseReady() {
  if (!admin.apps.length) {
    throw new Error("[FIREBASE_NOT_CONFIGURED] O Firebase Admin não foi inicializado.");
  }
}

// Load .env if exists (for local dev)
dotenv.config();

// Resolvendo caminhos para CJS/ESM
let _dirname = "";
try {
  // @ts-ignore
  _dirname = __dirname;
} catch (e) {
  _dirname = path.dirname(fileURLToPath(import.meta.url));
}

let resendClient: Resend | null = null;
let stripeClient: Stripe | null = null;

// ==========================================
// CONFIGURAÇÕES E UTILITÁRIOS
// ==========================================
const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("❌ [CONFIG] RESEND_API_KEY ausente.");
    throw new Error("RESEND_API_KEY ausente");
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
};

const getStripe = () => {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    console.error("❌ [CONFIG] STRIPE_SECRET_KEY ausente.");
    throw new Error("Stripe: Secret Key ausente.");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(apiKey);
  }
  return stripeClient;
};

/**
 * Retorna a URL base do site atual, corrigindo para o modo 'pre' (shared) no AI Studio
 * para garantir que o webhook consiga redirecionar/comunicar.
 */
const getBaseUrl = (req: express.Request) => {
  const host = req.get('x-forwarded-host') || req.get('host') || "";
  let finalHost = host;
  
  if (host.includes('ais-dev-') && host.includes('.run.app')) {
    finalHost = host.replace('ais-dev-', 'ais-pre-');
  }
  
  return `https://${finalHost}`;
};

// ==========================================
// ESTOQUE E PRODUTO DE TESTE
// ==========================================

/**
 * Cria o produto de teste obrigatório se não existir
 */
async function initTestProduct() {
  try {
    const productSlug = 'teste-checkout-real';
    const productRef = dbAdmin.collection('products').doc(productSlug);
    const snap = await productRef.get();

    if (!snap.exists) {
      console.log("🛠️ [INIT] Criando produto 'TESTE CHECKOUT'...");
      await productRef.set({
        name: "TESTE CHECKOUT",
        slug: productSlug,
        price: 1.00,
        description: "Produto temporário para validação real do fluxo de pagamento (Stripe LIVE/TEST).",
        images: ["https://placehold.co/600x800/000000/eab308?text=TESTE+CHECKOUT"],
        stock: 999,
        category: "Test",
        headline: "VALIDAÇÃO DE SISTEMA",
        isAvailable: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log("✅ [INIT] Produto 'TESTE CHECKOUT' criado.");
    }
  } catch (err: any) {
    console.error("❌ [INIT] Erro ao criar produto de teste:", err.message);
  }
}

async function updateStock(items: any[], type: 'subtract' | 'add') {
  console.log(`📦 [STOCK] Atualizando: ${type}`);
  for (const item of items) {
    try {
      const productId = item.id || item.productId;
      if (!productId) continue;

      const productRef = dbAdmin.collection('products').doc(productId);
      
      await dbAdmin.runTransaction(async (transaction) => {
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) return;

        const productData = productSnap.data() || {};
        const currentStock = Number(productData.stock || 0);
        const quantity = Number(item.quantity || 1);
        
        let newStock = type === 'subtract' ? Math.max(0, currentStock - quantity) : currentStock + quantity;

        transaction.update(productRef, { 
          stock: newStock,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
    } catch (err: any) {
      console.error(`❌ [STOCK] Erro:`, err.message);
    }
  }
}

// Tarefa de limpeza de pedidos não pagos (> 24h)
async function cleanupUnpaidOrders() {
  console.log("🧹 [CLEANUP] Verificando pedidos não pagos (> 24h)...");
  try {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    // Pedidos em 'received' ou 'payment_pending' que são antigos
    const unpaidOrdersSnap = await dbAdmin.collection('orders')
      .where('status', 'in', ['received', 'payment_pending'])
      .where('createdAt', '<', admin.firestore.Timestamp.fromDate(twentyFourHoursAgo))
      .get();

    console.log(`🧹 [CLEANUP] Encontrados ${unpaidOrdersSnap.size} pedidos para cancelar.`);

    for (const doc of unpaidOrdersSnap.docs) {
      const orderData = doc.data();
      const orderId = doc.id;

      console.log(`🧹 [CLEANUP] Cancelando pedido: ${orderId}`);
      
      await doc.ref.update({
        status: 'cancelled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        cancellationReason: 'non_payment_timeout'
      });

      // Devolver estoque reservado
      if (orderData.items) {
        await updateStock(orderData.items, 'add');
      }

      await sendOrderEmail(orderId, 'non_payment_cancellation');
    }
  } catch (err: any) {
    console.error("❌ [CLEANUP] Erro:", err.message);
  }
}

// Rodar cleanup a cada 1 hora
setInterval(cleanupUnpaidOrders, 60 * 60 * 1000);
// E também rodar na inicialização
setTimeout(cleanupUnpaidOrders, 5000);

// ==========================================
// TEMPLATE DE E-MAIL (PREMIUM & PROFISSIONAL)
// ==========================================
const getEmailHtml = (params: any) => {
  const { customerName, orderId, message, itemsHtml, totals, paymentLink, address, paymentMethod, status, buttonText } = params;
  return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f6f6f6; padding: 20px;">
      <div style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.08); border: 1px solid #eee;">
        <div style="background: #000; padding: 40px 30px; text-align: center; color: #fff;">
          <h1 style="margin: 0; font-size: 32px; letter-spacing: 6px; font-weight: 900; text-transform: uppercase;">
            F PAC <span style="color: #eab308;">STORE</span>
          </h1>
          <div style="margin-top: 15px; height: 2px; width: 40px; background: #eab308; margin-left: auto; margin-right: auto;"></div>
          <p style="margin: 15px 0 0 0; font-size: 11px; letter-spacing: 3px; color: #888; text-transform: uppercase; font-weight: bold;">Estúdio de Identidade e Atitude</p>
        </div>
        
        <div style="padding: 40px 35px; color: #333;">
          <h2 style="margin-top: 0; font-size: 24px; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: -1px;">Olá, ${customerName}!</h2>
          <p style="font-size: 16px; line-height: 1.7; color: #444; margin: 20px 0 35px 0;">${message}</p>
          
          ${paymentLink ? `
          <div style="margin-bottom: 40px; text-align: center; padding: 25px; background: #fffcf0; border: 1px dashed #eab308; border-radius: 12px;">
            <p style="margin: 0 0 15px 0; font-size: 13px; font-weight: bold; color: #854d0e; text-transform: uppercase; letter-spacing: 1px;">Conclua seu pagamento:</p>
            <a href="${paymentLink}" style="display: inline-block; background: #eab308; color: #000; text-align: center; padding: 18px 35px; text-decoration: none; font-weight: 900; border-radius: 4px; text-transform: uppercase; letter-spacing: 2px; font-size: 14px; box-shadow: 0 4px 12px rgba(234, 179, 8, 0.3);">
              EFETUAR PAGAMENTO
            </a>
          </div>
          ` : ''}

          <div style="margin: 0; padding: 0;">
            <h3 style="margin-top: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; color: #000; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px;">Detalhes do Pedido #${orderId}</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="text-align: left; font-size: 10px; text-transform: uppercase; color: #aaa; padding-bottom: 12px; font-weight: 900;">Item</th>
                  <th style="text-align: center; font-size: 10px; text-transform: uppercase; color: #aaa; padding-bottom: 12px; font-weight: 900;">Qtd</th>
                  <th style="text-align: right; font-size: 10px; text-transform: uppercase; color: #aaa; padding-bottom: 12px; font-weight: 900;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
            
            <div style="margin-top: 25px; padding: 25px; background: #fcfcfc; border: 1px solid #f0f0f0; border-radius: 12px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 20px 0 0 0; font-size: 14px; text-transform: uppercase; color: #000; font-weight: 900; border-top: 2px solid #000; letter-spacing: 1px;">Valor Total</td>
                  <td style="padding: 20px 0 0 0; text-align: right; font-size: 26px; color: #000; font-weight: 900; border-top: 2px solid #000;">R$ ${totals.finalTotal.toFixed(2)}</td>
                </tr>
              </table>
            </div>
          </div>
          
          <div style="margin-top: 50px; text-align: center;">
            <a href="https://fpacstore.com.br" style="display: inline-block; background: #000; color: #fff; text-align: center; padding: 22px 50px; text-decoration: none; font-weight: 900; border-radius: 4px; text-transform: uppercase; letter-spacing: 3px; font-size: 14px;">
              ${buttonText}
            </a>
          </div>
        </div>
        
        <div style="background: #000; padding: 40px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #fff; text-transform: uppercase; letter-spacing: 4px; font-weight: 900;">NÃO É SÓ ROUPA, É IDENTIDADE</p>
        </div>
      </div>
    </div>
  `;
};

// ==========================================
// API: NOTIFICATIONS (RESEND HELPER)
// ==========================================
async function sendOrderEmail(orderId: string, customStatus?: string) {
  try {
    const orderRef = dbAdmin.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    
    if (!orderSnap.exists) {
      console.error(`❌ [EMAIL] Pedido ${orderId} não encontrado.`);
      return;
    }

    const order = orderSnap.data();
    if (!order) return;

    const email = order.customerEmail;
    const customerName = order.customerName;
    const items = order.items || [];
    const totals = { finalTotal: order.total || 0 };
    const status = customStatus || order.status;
    const paymentMethod = order.paymentMethod;
    const address = order.address;

    const itemsHtml = items.map((item: any) => {
      let printDetails = '';
      if (item.printConfigs && item.printConfigs.length > 0) {
        printDetails = item.printConfigs.map((cfg: any) => 
          `<div style="font-size: 10px; color: #854d0e; margin-top: 4px; font-weight: bold; text-transform: uppercase;">• ${cfg.stamp} - ${cfg.location} (${cfg.printSize || 'N/A'})</div>`
        ).join('');
      }

      return `
      <tr>
        <td style="padding: 15px 0; border-bottom: 1px solid #f4f4f4;">
          <div style="font-weight: bold; font-size: 14px; color: #000; text-transform: uppercase;">${item.name}</div>
          <div style="font-size: 11px; color: #888; margin-top: 4px; letter-spacing: 0.5px;">PRODUTO PREMIUM | TAM: ${item.size}</div>
          ${printDetails}
        </td>
        <td style="padding: 15px 0; border-bottom: 1px solid #f4f4f4; text-align: center; font-size: 14px; color: #000; font-weight: bold;">${item.quantity}x</td>
        <td style="padding: 15px 0; border-bottom: 1px solid #f4f4f4; text-align: right; font-size: 14px; color: #000; font-weight: 900;">R$ ${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `;
    }).join('');

    let subject = `✅ Pedido #${orderId} Recebido - F PAC STORE`;
    let message = `Recebemos seu pedido com sucesso! Estamos aguardando a confirmação do pagamento para iniciar a produção das suas peças exclusivas.`;
    let buttonText = "ACOMPANHAR PEDIDO";

    const statusMap: Record<string, any> = {
      received: { 
        subject: `✅ Pedido #${orderId} Recebido - F PAC STORE`, 
        message: `Recebemos seu pedido com sucesso! Estamos aguardando o processamento do pagamento para dar início à produção das suas peças exclusivas.` 
      },
      payment_pending: { 
        subject: `⏳ Pagamento Pendente - Pedido #${orderId}`, 
        message: `O pagamento do seu pedido #${orderId} está sendo processado. Assim que for confirmado, iniciaremos a separação.` 
      },
      payment_approved: { 
        subject: `🎉 Pagamento Confirmado! Pedido #${orderId}`, 
        message: `Seu pagamento foi confirmado! Suas peças entraram agora em nossa linha de produção e separação.` 
      },
      processing: { 
        subject: `🛠️ Seu pedido #${orderId} está em produção!`, 
        message: `Estamos preparando cada detalhe do seu pedido com o máximo cuidado. Em breve ele será enviado.` 
      },
      shipped: { 
        subject: `🚀 Pedido #${orderId} Enviado!`, 
        message: `Grande dia! Seu pedido #${orderId} já foi enviado e está a caminho. Prepare-se para vestir atitude.`, 
        buttonText: "RASTREAR PEDIDO" 
      },
      delivered: { 
        subject: `🙌 Pedido #${orderId} Entregue!`, 
        message: `Seu pedido #${orderId} acaba de ser entregue. Esperamos que curta muito suas novas peças! Não esqueça de nos marcar no Instagram.`, 
        buttonText: "VER PEDIDO" 
      },
      cancelled: { 
        subject: `❌ Pedido #${orderId} Cancelado`, 
        message: `Seu pedido #${orderId} foi cancelado. Se desejar saber mais detalhes ou tiver dúvidas, entre em contato conosco.` 
      },
      non_payment_cancellation: {
        subject: `⚠️ Pedido #${orderId} Cancelado por Falta de Pagamento`,
        message: `Seu pedido foi cancelado automaticamente porque não identificamos o pagamento nas últimas 24 horas. Os itens voltaram para o estoque, mas você pode acessar o site agora mesmo e realizar um novo pedido se desejar!`,
        buttonText: "VOLTAR À LOJA"
      }
    };

    if (statusMap[status]) {
      subject = statusMap[status].subject;
      message = statusMap[status].message;
      if (statusMap[status].buttonText) buttonText = statusMap[status].buttonText;
    }

    const resend = getResend();
    console.log(`📧 [EMAIL] Preparando envio para ${email} (Cliente: ${customerName}, Status: ${status})...`);
    
    // Verificamos se o e-mail não está vazio
    if (!email || !email.includes('@')) {
      console.error(`❌ [EMAIL] Erro: E-mail do destinatário está vazio ou inválido.`);
      return;
    }

    const { data, error } = await resend.emails.send({
      from: 'F PAC STORE <atendimento@fpacstore.com.br>',
      to: [email.trim().toLowerCase()],
      replyTo: 'fpacstore@gmail.com',
      subject: subject,
      html: getEmailHtml({ customerName, orderId, message, itemsHtml, totals, address, paymentMethod, status, buttonText })
    });

    if (error) {
      console.error(`❌ [EMAIL] Erro retornado pela API Resend:`, JSON.stringify(error, null, 2));
      // Se for erro de domínio não verificado, logar um aviso específico
      if (JSON.stringify(error).includes('domain')) {
        console.warn(`⚠️ [ADVERTÊNCIA] O domínio 'fpacstore.com.br' pode não estar verificado no seu painel da Resend.`);
      }
      return;
    }

    console.log(`📧 [EMAIL] Enviado com sucesso ID: ${data?.id}`);
  } catch (error: any) {
    console.error(`❌ [EMAIL] Falha catastrófica no processo de envio:`, error.message || error);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware de Diagnóstico Global - Executa antes de TUDO
  app.use((req, res, next) => {
    console.log(`🌐 [SERVER] ${req.method} ${req.url} | Origin: ${req.get('origin')} | Host: ${req.get('host')}`);
    next();
  });

  const allowedOrigins = [
    'https://fpacstore.com.br',
    'https://www.fpacstore.com.br',
    'https://ais-pre-5qzcpkpneat5vzmwyn7iab-494240747029.us-west2.run.app',
    'https://ais-dev-5qzcpkpneat5vzmwyn7iab-494240747029.us-west2.run.app',
    'http://localhost:3000'
  ];

  app.use(cors({
    origin: function(origin, callback) {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) || 
                       origin.includes('ais-dev-') || 
                       origin.includes('run.app');
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }));
  
  app.options("*", cors()); 
  
  // Stripe Webhook: RECRIADO DO ZERO PARA SEGURANÇA MÁXIMA
  app.post("/api/checkout/webhook", express.raw({type: 'application/json'}), async (req, res) => {
    console.log("🔔 [WEBHOOK] Evento recebido.");
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripe = getStripe();

    let event;
    try {
      if (!sig || !endpointSecret) throw new Error("Webhook Secret ou Signature ausentes.");
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      console.error(`❌ [WEBHOOK] Verificação falhou: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.client_reference_id;

      if (orderId) {
        console.log(`💰 [WEBHOOK] Pagamento aprovado: ${orderId}`);
        const orderRef = dbAdmin.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        
        if (orderSnap.exists) {
          const orderData = orderSnap.data();
          if (orderData?.status === 'payment_pending') {
            await orderRef.update({
              status: 'payment_approved',
              paymentStatus: 'approved',
              stripeSessionId: session.id,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await updateStock(orderData.items, 'subtract');
            await sendOrderEmail(orderId, 'payment_approved');
          }
        }
      }
    }
    res.json({ received: true });
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ROTA DE DIAGNÓSTICO ULTRA-RÁPIDA
  app.all("/api/ping", (req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  const apiRouter = express.Router();

  // Middleware de Log para Diagnóstico de API (Dentro do Router)
  apiRouter.use((req, res, next) => {
    console.log(`📡 [API ROUTER] ${req.method} ${req.path} | Host: ${req.get('host')} | Referer: ${req.get('referer')}`);
    
    // Configuração agressiva de Headers para evitar retorno HTML de SPA
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // CORS manual reforçado para o router
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization,Accept,Origin,X-Firebase-AppCheck');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // Mount API router FIRST - Antes de qualquer outro middleware de redirecionamento ou estático
  app.use("/api", apiRouter);

  // Removido o middleware de redirecionamento WWW -> non-WWW que estava causando loops e perda de métodos POST
  // O Cloud Run e o domínio customizado devem ser tratados de forma transparente para o usuário.

  apiRouter.get("/diag-iam", async (req, res) => {
    try {
      const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
        headers: { 'Metadata-Flavor': 'Google' }
      });
      if (!response.ok) throw new Error(`Metadata server returned ${response.status}`);
      const identity = await response.text();
      res.json({ identity, projectId: admin.app().options.projectId });
    } catch (e: any) {
      res.status(500).json({ error: e.message, hint: "Este diagnóstico só funciona em ambiente Cloud Run ou se o servidor de metadata estiver acessível." });
    }
  });

  apiRouter.get("/diag-firebase", async (req, res) => {
    try {
      checkFirebaseReady();
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      let config = {};
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }

      const collections = await dbAdmin.listCollections();
      res.json({ 
        success: true, 
        projectId: admin.app().options.projectId,
        admin_email: adminEmail,
        databaseId: (dbAdmin as any)._databaseId || '(default)',
        config_file: config,
        env_project_id: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
        collections_found: collections.length 
      });
    } catch (err: any) {
      res.status(500).json({ 
        success: false, 
        error: err.message,
        code: err.code,
        projectId: admin.app().options.projectId
      });
    }
  });

  apiRouter.get("/whoami", (req, res) => {
    res.json({
      method: req.method,
      url: req.url,
      baseUrl: req.baseUrl,
      originalUrl: req.originalUrl,
      headers: req.headers,
      query: req.query,
      timestamp: new Date().toISOString()
    });
  });

  // ==========================================
  // API Router
  // ==========================================
  apiRouter.get("/diag-env", (req, res) => {
    const envKeys = Object.keys(process.env);
    const firebaseKeys = envKeys.filter(k => k.includes('FIREBASE') || k.includes('GOOGLE'));
    res.json({
      node_env: process.env.NODE_ENV,
      port: process.env.PORT,
      firebase_envs: firebaseKeys,
      has_adc: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  });

  apiRouter.get("/health", async (req, res) => {
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      const resendKey = process.env.RESEND_API_KEY;
      const baseUrl = getBaseUrl(req);
      
      // Test Firebase connection
      let firebaseStatus = "unknown";
      try {
        const testDoc = await dbAdmin.collection('_health_check').doc('ping').get();
        firebaseStatus = "connected";
      } catch (err: any) {
        firebaseStatus = `error: ${err.message}`;
      }
      
      res.json({ 
        status: "online", 
        firebase: firebaseStatus,
        stripe: {
          configured: !!stripeKey,
          publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ? "✅ Presente" : "❌ Ausente"
        },
        resend: {
          configured: !!resendKey,
          from: 'atendimento@fpacstore.com.br',
          apiKeyPrefix: resendKey ? "re_" + resendKey.substring(3, 8) + "..." : "missing"
        },
        server: {
          node: process.version,
          env: process.env.NODE_ENV,
          baseUrl
        }
      });
    } catch (e: any) {
      console.error("❌ [HEALTH] Error:", e.message);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  apiRouter.get("/test-email", async (req, res) => {
    try {
      const email = (req.query.email as string || "fpacstore@gmail.com").trim();
      const resend = getResend();
      console.log(`📧 [TEST] Enviando e-mail de teste para ${email}...`);
      
      const { data, error } = await resend.emails.send({
        from: 'F PAC STORE <atendimento@fpacstore.com.br>',
        to: [email],
        subject: 'Teste de Configuração - F PAC STORE',
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
            <h1>Teste de Conexão</h1>
            <p>Se você recebeu este e-mail, a integração com a Resend está funcionando!</p>
            <hr />
            <p style="font-size: 12px; color: #888;">F PAC STORE - Ambiente de Diagnóstico</p>
          </div>
        `
      });

      if (error) {
        console.error("❌ [TEST] Erro Resend:", error);
        return res.status(400).json({ 
          success: false, 
          error, 
          hint: "Verifique se o domínio atendimento@fpacstore.com.br está verificado no painel da Resend." 
        });
      }

      res.json({ success: true, data });
    } catch (e: any) {
      console.error("❌ [TEST] Falha técnica:", e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  apiRouter.get("/payment-config", (req, res) => {
    console.log("💳 [API] GET /payment-config solicitado");
    res.json({ 
      publicKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || null,
      provider: 'stripe'
    });
  });

  // CHECKOUT: RECRIADO DO ZERO PARA SEGURANÇA E LIMPIDÊZ
  apiRouter.post("/checkout/create-session", async (req, res) => {
    try {
      const stripe = getStripe();
      const { items, customerInfo, shipping, discounts, observations } = req.body;

      if (!items || items.length === 0 || !customerInfo?.email) {
        return res.status(400).json({ error: "Dados inválidos para checkout." });
      }

      const orderId = `PAC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      console.log(`🛒 [CHECKOUT] Criando sessão para Pedido #${orderId}`);

      // 1. Validar e Formatar Line Items para Stripe
      const lineItems = await Promise.all(items.map(async (item: any) => {
        // Busca preço real do banco para evitar manipulação client-side
        const productRef = dbAdmin.collection('products').doc(item.id);
        const productSnap = await productRef.get();
        const productData = productSnap.data();
        const realPrice = productData?.price || item.price || 0;

        return {
          price_data: {
            currency: 'brl',
            product_data: {
              name: `${item.name} (${item.size})`,
              images: item.image ? [item.image.startsWith('http') ? item.image : `${getBaseUrl(req)}${item.image}`] : [],
            },
            unit_amount: Math.round(Number(realPrice) * 100),
          },
          quantity: Math.max(1, Number(item.quantity || 1)),
        };
      }));

      // Adicionar Frete se aplicável
      if (Number(shipping) > 0) {
        lineItems.push({
          price_data: {
            currency: 'brl',
            product_data: { name: 'Frete / Entrega', description: 'Custo de envio' },
            unit_amount: Math.round(Number(shipping) * 100),
          },
          quantity: 1,
        });
      }

      // Cálculo de cupom/desconto (Stripe Checkout sessions não aceitam itens negativos de forma nativa fácil aqui, 
      // idealmente usamos 'discounts' array com Stripe Coupons, mas para simplicidade vamos aplicar no unit_amount 
      // do frete ou reduzir proporcionalmente se necessário. Aqui apenas avisamos se houver falha).
      // Em produção, recomendo Stripe Coupons.

      // 2. Salvar Pedido no Firestore com status 'waiting_payment'
      const orderData = {
        id: orderId,
        customerName: customerInfo.name,
        customerEmail: customerInfo.email.toLowerCase(),
        customerPhone: customerInfo.phone,
        address: customerInfo.address,
        items,
        total: lineItems.reduce((acc, curr) => acc + (curr.price_data.unit_amount * curr.quantity), 0) / 100,
        status: 'payment_pending',
        paymentMethod: 'STRIPE',
        observations: observations || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await dbAdmin.collection('orders').doc(orderId).set(orderData);

      // 3. Criar Sessão Stripe
      const session = await stripe.checkout.sessions.create({
        line_items: lineItems,
        mode: 'payment',
        customer_email: customerInfo.email,
        client_reference_id: orderId,
        success_url: `${getBaseUrl(req)}/order/${orderId}?status=success`,
        cancel_url: `${getBaseUrl(req)}/checkout?status=cancel`,
        metadata: { orderId }
      });

      console.log(`✅ [SESSION] Criada: ${session.id}`);
      res.json({ url: session.url, orderId });

    } catch (error: any) {
      console.error("❌ [CHECKOUT] Erro fatal:", error.message);
      res.status(500).json({ error: "Erro interno ao processar checkout.", details: error.message });
    }
  });

  // Catch-all para rotas de API inexistentes (Garante JSON e evita queda no SPA fallback)
  apiRouter.all("*", (req, res) => {
    console.warn(`⚠️ [API 404] Rota não encontrada no Router: ${req.method} ${req.path}`);
    res.status(404).json({ 
      error: "API Route not found",
      method: req.method,
      path: req.path
    });
  });

  // Garantia: Se a URL começa com /api/, mas não bateu no roteador, RETORNA 404 JSON, nunca HTML.
  app.all("/api/*", (req, res) => {
    console.error(`🚨 [ROUTING ERROR] Request em /api/* vazou para o app global: ${req.method} ${req.url}`);
    res.status(404).json({
      error: "Recurso de API não encontrado",
      path: req.url,
      suggestedAction: "Verifique o prefixo da rota ou se o router está montado corretamente.",
      timestamp: new Date().toISOString()
    });
  });

  // Middleware de Erro Global (Garante JSON em falhas do Express)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("🔥 [FATAL ERROR]", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  console.log("🏁 [STARTUP] Verificando configurações...");
  console.log(`🌍 [SERVER] Região: ${process.env.CLOUD_RUN_REGION || "Local"}`);
  console.log(`🔧 [CONFIG] Se estiver usando Firebase Hosting, certifique-se de que a serviceId em firebase.json corresponde ao nome deste serviço.`);
  console.log(`🔑 [CONFIG] STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? "✅ Presente" : "❌ Ausente"}`);
  console.log(`🔑 [CONFIG] VITE_STRIPE_PUBLISHABLE_KEY: ${process.env.VITE_STRIPE_PUBLISHABLE_KEY ? "✅ Presente" : "❌ Ausente"}`);
  console.log(`🔑 [CONFIG] RESEND_API_KEY: ${process.env.RESEND_API_KEY ? "✅ Presente" : "❌ Ausente"}`);

  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("⚠️ [STARTUP] Vite not found, skipping HMR in dev.");
    }
  } else {
    // No bundle dist/server.cjs, _dirname é o próprio diretório dist
    const distPath = fs.existsSync(path.join(_dirname, "index.html")) 
      ? _dirname 
      : path.join(process.cwd(), "dist");
    
    console.log(`🚀 [PRODUCTION] Servindo arquivos estáticos de: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Frontend build not found. Please run npm run build.");
      }
    });
  }

  // Inicializar produto de teste
  await initTestProduct();

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

startServer();

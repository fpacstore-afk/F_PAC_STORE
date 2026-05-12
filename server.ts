import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";

import { Resend } from 'resend';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
import fs from 'fs';

let adminEmail = "Ambiente (ADC)";

function initAdmin() {
  if (admin.apps.length > 0) return;

  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.CONTA_DE_SERVIÇO_FIREBASE;

  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      adminEmail = serviceAccount.client_email || "Service Account JSON";
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      console.log(`✅ [FIREBASE] Admin SDK inicializado via Service Account: ${adminEmail}`);
      return;
    } catch (e: any) {
      console.error("❌ [FIREBASE] Erro ao processar JSON da Service Account:", e.message);
    }
  }

  // Fallback para ADC ou Config Local
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  let config: any = null;
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {}
  }

  // No ambiente de produção do Cloud Run, o Google provê variáveis específicas.
  const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || 
                     process.env.FIREBASE_PROJECT_ID || 
                      process.env.VITE_FIREBASE_PROJECT_ID;

  const configProjectId = config?.projectId;
  
  // Se estivermos em produção mas o projectId config for 'fpac-store62' (fixo), 
  // pode haver conflito se o projeto real for outro.
  const projectId = envProjectId || configProjectId || 'fpac-store62';

  try {
    if (admin.apps.length > 0) return;
    
    // Configuração mínima e segura
    const options: admin.AppOptions = { projectId };
    
    // No Cloud Run, usamos ADC. Em desenvolvimento local, dependemos de env vars ou config.
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE) {
      options.credential = admin.credential.applicationDefault();
    }

    admin.initializeApp(options);
    console.log(`✅ [FIREBASE] Admin SDK inicializado (Projeto: ${projectId})`);
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
  // FORÇAR o banco (default) conforme visto no print do usuário, 
  // a menos que o config diga explicitamente outra coisa válida.
  let databaseId = '(default)';
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.firestoreDatabaseId) databaseId = config.firestoreDatabaseId;
    } catch (e) {}
  }
  
  // No Cloud Run/AI Studio, se o databaseId vier como um ID longo (Enterprise), usamos ele.
  // Mas se os dados estão no (default), precisamos garantir que estamos lá.
  console.log(`ℹ️ [FIREBASE] Inicializando Firestore: DB=${databaseId} | Project=${admin.app().options.projectId}`);
  
  const db = databaseId && databaseId !== '(default)' 
    ? getFirestore(admin.app(), databaseId) 
    : getFirestore(admin.app());

  return db;
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
      console.error(`DICA: No Console do GCP (https://console.cloud.google.com/iam-admin/iam), procure por: ${adminEmail}`);
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let resendClient: Resend | null = null;
let mpClient: MercadoPagoConfig | null = null;

// ==========================================
// CONFIGURAÇÕES E UTILITÁRIOS
// ==========================================
const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("❌ [CONFIG] RESEND_API_KEY ausente nas variáveis de ambiente.");
    throw new Error("RESEND_API_KEY ausente");
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
    console.log("✅ [RESEND] Cliente inicializado.");
  }
  return resendClient;
};

const getMPConfig = () => {
  // Credenciais de Produção extraídas da auditoria visual
  const PROD_TOKEN = "APP_USR-4649284691039265-050721-1f6ce7cf32a1ecf217a9df4ed93ea663-3349892045";
  const PROD_PUBLIC_KEY = "APP_USR-80ac68d8-e255-4c34-8c31-295078a37fca";

  // Credenciais de Teste (Sandbox) extraídas do print
  const TEST_TOKEN = "TEST-4649284691039265-050721-85444cfbdef770c9a62096550223a685-3349892045";
  const TEST_PUBLIC_KEY = "TEST-b734f17c-a5a9-422c-8a13-a5ebdee1fd7d";

  // Se USE_SANDBOX=true for definido, priorizamos as credenciais de teste
  const useSandbox = process.env.USE_SANDBOX === 'true';

  const token = (process.env.MERCADO_PAGO_ACCESS_TOKEN || (useSandbox ? TEST_TOKEN : PROD_TOKEN)).trim();
  const publicKey = (process.env.VITE_MP_PUBLIC_KEY || process.env.MP_PUBLIC_KEY || (useSandbox ? TEST_PUBLIC_KEY : PROD_PUBLIC_KEY)).trim();
  
  if (!token) {
    console.error("❌ [CONFIG] MERCADO_PAGO_ACCESS_TOKEN não configurado.");
    throw new Error("Mercado Pago: Access Token ausente.");
  }

  const isProduction = token.startsWith('APP_USR');
  console.log(`ℹ️ [MP] Modo: ${isProduction ? "PRODUÇÃO" : "TESTE (SANDBOX)"} | Configurado via fallback: ${token === TEST_TOKEN || token === PROD_TOKEN ? 'SIM' : 'NÃO (ENV)'}`);
  
  return { token, publicKey, isProduction };
};

const getBaseUrl = (req: express.Request) => {
  const host = req.get('x-forwarded-host') || req.get('host') || "";
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  
  let finalHost = host;
  // No AI Studio, dev environment URLs are restricted. Use 'pre' for webhooks.
  if (host.includes('ais-dev-') && host.includes('.run.app')) {
    finalHost = host.replace('ais-dev-', 'ais-pre-');
  }
  
  // No AI Studio, forced HTTPS for known production domains or if received as secure
  const isSecure = (finalHost.includes('run.app') || finalHost.includes('fpacstore.com.br')) || protocol === 'https';
  
  return `https://${finalHost}`;
};

const getMPClient = () => {
  if (!mpClient) {
    const { token } = getMPConfig();
    mpClient = new MercadoPagoConfig({ accessToken: token });
  }
  return mpClient;
};

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
      received: { subject: `✅ Pedido #${orderId} Recebido - F PAC STORE`, message: `Seu pedido foi registrado! Conclua o pagamento para garantirmos suas peças.` },
      approved: { subject: `🎉 Pagamento Confirmado! Pedido #${orderId}`, message: `Seu pagamento foi confirmado! Iniciando a produção.` },
      validated: { subject: `🎉 Pagamento Confirmado! Pedido #${orderId}`, message: `Seu pagamento foi confirmado! Iniciando a produção.` },
      shipped: { subject: `🚀 Pedido #${orderId} Enviado!`, message: `Seu pedido está a caminho!`, buttonText: "RASTREAR PEDIDO" },
      delivered: { subject: `🙌 Pedido #${orderId} Entregue!`, message: `Seu pedido foi entregue!`, buttonText: "VER PEDIDO" },
      cancelled: { subject: `❌ Pedido #${orderId} Cancelado`, message: `Seu pedido foi cancelado.` }
    };

    if (statusMap[status]) {
      subject = statusMap[status].subject;
      message = statusMap[status].message;
      if (statusMap[status].buttonText) buttonText = statusMap[status].buttonText;
    }

    const resend = getResend();
    console.log(`📧 [EMAIL] Preparando envio para ${email} (Filtro: ${customerName}, Status: ${status})...`);
    
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
    'http://localhost:3000'
  ];

  app.use(cors({
    origin: function(origin, callback) {
      // Permitir requests sem origin (como server-to-server ou apps mobile)
      if (!origin) return callback(null, true);
      
      const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) || 
                       origin.includes('ais-dev-') || 
                       origin.includes('run.app');
                       
      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Bloqueado: ${origin}`);
        callback(null, true); // No AI Studio, facilitamos mas logamos o aviso
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
  }));
  
  app.options("*", cors()); 
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const apiRouter = express.Router();

  // Middleware de Log para Diagnóstico de API (Dentro do Router)
  apiRouter.use((req, res, next) => {
    console.log(`📡 [API ROUTER] ${req.method} ${req.path}`);
    
    // Forçar JSON e CORS em todas as respostas deste roteador
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // Mount API router FIRST - Antes de qualquer outro middleware de redirecionamento ou estático
  app.use("/api", apiRouter);

  // Removido o middleware de redirecionamento WWW -> non-WWW que estava causando loops e perda de métodos POST
  // O Cloud Run e o domínio customizado devem ser tratados de forma transparente para o usuário.

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
      const { publicKey, token, isProduction } = getMPConfig();
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
        mercadopago: {
          configured: !!publicKey && !!token,
          mode: isProduction ? "PRODUCTION" : "SANDBOX/TEST",
          publicKeyPrefix: publicKey?.substring(0, 15),
          tokenPrefix: token?.substring(0, 15),
          webhookUrl: `${baseUrl}/api/webhooks/mercadopago`
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
    try {
      const { publicKey } = getMPConfig();
      if (!publicKey) {
        console.warn("⚠️ [MP] Public key solicitada, mas está vazia no servidor.");
        return res.status(200).json({ publicKey: null, warning: "Chave não configurada no servidor." });
      }
      res.status(200).send(JSON.stringify({ publicKey }));
    } catch (e: any) {
      console.error("❌ [MP_CONFIG_API] Falha ao ler configuração:", e.message);
      res.status(500).send(JSON.stringify({ error: "Erro na configuração do Mercado Pago", details: e.message }));
    }
  });

  apiRouter.post("/notify-order", async (req, res) => {
    const method = req.method;
    const path = req.path;
    console.log(`📧 [API] Chamada em ${path} | Método: ${method}`);
    
    try {
      const { orderId } = req.body;
      console.log(`📧 [API] Recebida solicitação de notificação para pedido: ${orderId}`);
      
      if (!orderId) {
        console.error("❌ [API] Falha: orderId não fornecido.");
        return res.status(400).json({ error: "OrderId missing", received: req.body });
      }
      
      console.log(`📧 [API] Disparando envio de e-mail 'received' para o pedido #${orderId}`);
      // Não bloqueia a resposta da API pelo envio do e-mail
      sendOrderEmail(orderId, 'received').catch(err => {
        console.error(`❌ [API] Erro ao enviar e-mail para ${orderId}:`, err.message);
      });
      
      res.status(200).json({ 
        success: true, 
        message: "Notificação enfileirada com sucesso",
        orderId 
      });
    } catch (e: any) {
      console.error(`❌ [API] Erro interno em /notify-order:`, e.message);
      res.status(500).json({ error: e.message });
    }
  });

  apiRouter.post("/create_preference", async (req, res) => {
    try {
      const client = getMPClient();
      const preference = new Preference(client);
      const { items, orderId, customerEmail, customerName } = req.body;

      if (!orderId || !items || !items.length) {
        return res.status(400).json({ error: "Dados do pedido incompletos para criar preferência." });
      }

      console.log(`🛒 [MP] Gerando Preferência para o Pedido #${orderId}`);
      const baseUrl = getBaseUrl(req);

      // Normalização rigorosa dos itens para evitar Bad Request (400)
      const mappedItems = items.map((item: any) => {
        const price = Number(item.price);
        const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
        
        return {
          id: String(item.id || orderId).substring(0, 250),
          title: String(item.name || "Produto F PAC").substring(0, 250),
          quantity: quantity,
          unit_price: price > 0 ? price : 0.01, // Garante que o preço nunca seja 0
          currency_id: 'BRL',
          // Limita picture_url para evitar erros de tamanho no MP
          picture_url: item.image && item.image.length < 600 ? item.image : undefined
        };
      });

      const body = {
        items: mappedItems,
        payer: {
          email: String(customerEmail || "cliente@fpacstore.com.br").toLowerCase().trim(),
          name: String(customerName || "Cliente PAC").substring(0, 200),
        },
        external_reference: String(orderId),
        notification_url: (baseUrl.includes('localhost') || baseUrl.includes('ais-dev')) ? undefined : `${baseUrl}/api/webhooks/mercadopago`,
        back_urls: {
          success: `${baseUrl}/#/order/${orderId}?status=success`,
          failure: `${baseUrl}/#/order/${orderId}?status=failure`,
          pending: `${baseUrl}/#/order/${orderId}?status=pending`,
        },
        auto_return: 'approved' as const,
        payment_methods: {
          installments: 12,
          excluded_payment_types: [
            { id: 'ticket' } // Remove boleto da preferência também
          ],
          // Se quiser remover Mercado Pago wallet (amarelo) e Crédito (azul) via Preferência:
          excluded_payment_methods: [
            { id: 'paycash' } // Exemplo de exclusão
          ]
        },
        statement_descriptor: "F PAC STORE",
        expires: false
      };

      console.log("📦 [MP] Preference Body:", JSON.stringify(body, null, 2));

      const result = await preference.create({ body });
      console.log(`✅ [MP] Preferência Criada com Sucesso: ${result.id}`);
      res.json({ id: result.id, init_point: result.init_point });
    } catch (error: any) {
      const mpError = error.api_response?.body || error.response?.data || error;
      console.error("❌ [MP Preference] Erro detalhado:", JSON.stringify(mpError, null, 2));
      
      let errorMsg = "Erro ao preparar pagamento.";
      if (mpError.message?.includes("access_token")) {
        errorMsg = "Token do Mercado Pago inválido ou expirado. Verifique as credenciais.";
      } else if (mpError.message) {
        errorMsg = `Mercado Pago: ${mpError.message}`;
      }
      
      res.status(500).json({ 
        error: errorMsg,
        detail: mpError 
      });
    }
  });

  apiRouter.post("/process_payment", async (req, res) => {
    let currentOrderId = "unknown";
    try {
      const client = getMPClient();
      const payment = new Payment(client);
      const { formData } = req.body;
      const orderId = formData.external_reference;
      currentOrderId = orderId;

      if (!orderId) {
        return res.status(400).json({ message: "ERRO: ID do Pedido ausente." });
      }

      console.log(`🚀 [MP] Iniciando Pagamento Pedido #${orderId}`);

      // Tenta buscar o pedido com retentativa curta (evita race condition de replicação)
      let orderSnap = await dbAdmin.collection('orders').doc(orderId).get();
      if (!orderSnap.exists) {
        console.warn(`⚠️ [MP] Pedido ${orderId} não encontrado de imediato. Aguardando 1s...`);
        await new Promise(r => setTimeout(r, 1000));
        orderSnap = await dbAdmin.collection('orders').doc(orderId).get();
      }
      
      if (!orderSnap.exists) {
        return res.status(404).json({ message: "Pedido ainda não processado pelo banco. Tente em instantes." });
      }

      const orderData = orderSnap.data();
      const amount = Number(Number(formData.transaction_amount || orderData?.total).toFixed(2));
      
      const fullName = (orderData?.customerName || formData.payer.name || "Cliente").trim();
      const [firstName = "Cliente", ...lastNameParts] = fullName.split(/\s+/);
      const lastName = lastNameParts.join(' ') || "PAC";

      const baseUrl = getBaseUrl(req);
      const payerEmail = (formData.payer?.email || orderData?.customerEmail || "").trim().toLowerCase();
      
      if (!payerEmail || !payerEmail.includes('@')) {
        return res.status(400).json({ message: "E-mail do pagador inválido ou incompleto." });
      }

      const body: any = {
        transaction_amount: amount,
        description: `F PAC STORE - Pedido #${orderId}`,
        payment_method_id: formData.payment_method_id,
        external_reference: String(orderId),
        installments: formData.installments ? Number(formData.installments) : 1,
        payer: {
          email: payerEmail,
          first_name: firstName.substring(0, 40),
          last_name: lastName.substring(0, 40),
          ...( (formData.payer?.identification?.number || orderData?.cpf) ? {
            identification: {
              type: 'CPF',
              number: String(formData.payer?.identification?.number || orderData?.cpf || "").replace(/\D/g, '')
            }
          } : {})
        },
        additional_info: {
          items: (orderData?.items || []).map((item: any) => ({
            id: item.id,
            title: item.name,
            quantity: item.quantity,
            unit_price: Number(item.price),
            category_id: 'clothing'
          }))
        }
      };

      if (!['pix', 'bolbradesco', 'pec'].includes(formData.payment_method_id)) {
        if (!formData.token) throw new Error("Token do cartão ausente.");
        body.token = formData.token;
        if (formData.issuer_id) body.issuer_id = String(formData.issuer_id);
      }

      if (!baseUrl.includes('localhost')) {
        body.notification_url = `${baseUrl}/api/webhooks/mercadopago`;
      }

      console.log(`📤 [MP] Enviando Pagamento para API do Mercado Pago...`);
      const response = await payment.create({ body });
      console.log(`✅ [MP] Resposta do MP para #${orderId}: ${response.status}`);

      const updateData: any = { 
        paymentStatus: response.status,
        paymentId: String(response.id),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (response.status === 'approved' || response.status === 'validated') {
        updateData.status = 'validated';
        sendOrderEmail(orderId, 'approved').catch(() => {});
      } else if (formData.payment_method_id === 'pix' && response.status === 'pending') {
        updateData.paymentMethod = 'PIX';
        updateData.pixData = {
          qr_code: response.point_of_interaction?.transaction_data?.qr_code,
          qr_code_base64: response.point_of_interaction?.transaction_data?.qr_code_base64,
          ticket_url: response.point_of_interaction?.transaction_data?.ticket_url
        };
        sendOrderEmail(orderId, 'pending').catch(() => {});
      }

      await dbAdmin.collection('orders').doc(orderId).update(updateData);

      return res.status(201).json({
        id: response.id,
        status: response.status,
        status_detail: response.status_detail,
        qr_code: response.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: response.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: response.point_of_interaction?.transaction_data?.ticket_url,
      });

    } catch (error: any) {
      console.error(`❌ [MP API ERROR] Pedido #${currentOrderId}:`, error.message);
      
    if (error.code === 7 || error.message.includes('PERMISSION_DENIED')) {
        console.error("👉 [DIAGNÓSTICO] Falha de Permissão no Firestore Admin SDK.");
        const app = admin.app();
        console.error(`   Projeto App: ${app.options.projectId}`);
        console.error(`   Service Account: ${app.options.credential ? 'Configurada' : 'Padrão (ADC)'}`);
        console.error("   Ação Sugerida: Verifique se a conta de serviço do Cloud Run tem as permissões 'Cloud Datastore User' no projeto alvo.");
      }

      const mpError = error.api_response?.body || error;
      res.status(400).json({ 
        message: mpError.message || "Erro no processamento do pagamento ou no banco de dados.", 
        detail: mpError 
      });
    }
  });

  apiRouter.post("/webhooks/mercadopago", async (req, res) => {
    const { action, type, data } = req.body;
    if (type === 'payment' && data?.id) {
      try {
        const client = getMPClient();
        const paymentData = await new Payment(client).get({ id: data.id });
        const orderId = paymentData.external_reference;
        const status = paymentData.status;

        if (orderId) {
          const orderRef = dbAdmin.collection('orders').doc(orderId);
          const orderSnap = await orderRef.get();
          if (orderSnap.exists) {
            const currentStatus = orderSnap.data()?.status;
            let statusUpdate: any = { 
              paymentStatus: status, 
              paymentId: String(data.id), 
              updatedAt: admin.firestore.FieldValue.serverTimestamp() 
            };
            
            if (status === 'approved' && currentStatus === 'pending') {
              statusUpdate.status = 'validated';
              await sendOrderEmail(orderId, 'approved');
            } else if ((status === 'cancelled' || status === 'rejected') && currentStatus === 'pending') {
              statusUpdate.status = 'cancelled';
              await sendOrderEmail(orderId, 'cancelled');
            }
            
            await orderRef.update(statusUpdate);
            console.log(`✅ [WEBHOOK] Pedido #${orderId} atualizado para ${status}`);
          }
        }
      } catch (e) {
        console.error("❌ [WEBHOOK] Error:", e);
      }
    }
    res.sendStatus(200);
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

  console.log("🏁 [STARTUP] Verificando configurações...");
  console.log(`🌍 [SERVER] Região: ${process.env.CLOUD_RUN_REGION || "Local"}`);
  console.log(`🔧 [CONFIG] Se estiver usando Firebase Hosting, certifique-se de que a serviceId em firebase.json corresponde ao nome deste serviço.`);
  console.log(`🔑 [CONFIG] MERCADO_PAGO_ACCESS_TOKEN: ${process.env.MERCADO_PAGO_ACCESS_TOKEN ? "✅ Presente" : "❌ Ausente"}`);
  console.log(`🔑 [CONFIG] VITE_MP_PUBLIC_KEY: ${process.env.VITE_MP_PUBLIC_KEY ? "✅ Presente" : "❌ Ausente"}`);
  console.log(`🔑 [CONFIG] RESEND_API_KEY: ${process.env.RESEND_API_KEY ? "✅ Presente" : "❌ Ausente"}`);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

startServer();

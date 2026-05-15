import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";

import { Resend } from 'resend';
import { MercadoPagoConfig, Payment } from 'mercadopago';
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

  const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || 
                     process.env.FIREBASE_PROJECT_ID || 
                     process.env.VITE_FIREBASE_PROJECT_ID;

  // No AI Studio, FIREBASE_CONFIG é a fonte da verdade sobre o ambiente local
  let platformConfig: any = null;
  if (process.env.FIREBASE_CONFIG) {
    try {
      platformConfig = JSON.parse(process.env.FIREBASE_CONFIG);
      console.log(`📡 [FIREBASE] FIREBASE_CONFIG detectado. Projeto: ${platformConfig.projectId}`);
    } catch (e) {}
  }

  // Decisão de Project ID: 
  // 1. Configuração da plataforma (AI Studio)
  // 2. Variável de ambiente explícita
  // 3. Arquivo de configuração local
  // 4. Hardcoded fallback
  const projectId = platformConfig?.projectId || envProjectId || config?.projectId || 'fpac-store62';

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
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE || process.env.FIREBASE_CONFIG) {
      options.credential = admin.credential.applicationDefault();
      console.log("ℹ️ [FIREBASE] Usando Application Default Credentials (ADC)");
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

// Diagnóstico de inicialização do Admin
let startupTestResult: any = { status: 'pending' };

// Teste de conexão/permissão imediato
(async () => {
  try {
    const healthRef = dbAdmin.collection('_health');
    const pid = admin.app().options.projectId;
    const dbid = (dbAdmin as any).databaseId || '(default)';
    
    console.log(`🔍 [FIREBASE] Testando acesso ao projeto: ${pid} | DB: ${dbid}...`);
    await healthRef.limit(1).get();
    console.log("✅ [FIREBASE] Teste de LEITURA OK.");
    
    await healthRef.doc('init').set({ 
      lastInit: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      identity: adminEmail
    }, { merge: true });
    console.log("✅ [FIREBASE] Teste de ESCRITA OK.");
    
    startupTestResult = { 
      status: 'success', 
      projectId: pid, 
      databaseId: dbid,
      identity: adminEmail,
      timestamp: new Date().toISOString()
    };
  } catch (e: any) {
    console.error("❌ [FIREBASE] TESTE ADMIN FALHOU:", e.message);
    startupTestResult = { 
      status: 'error', 
      error: e.message, 
      code: e.code,
      projectId: admin.app().options.projectId,
      databaseId: (dbAdmin as any).databaseId || '(default)',
      identity: adminEmail,
      timestamp: new Date().toISOString()
    };

    if (e.message.includes("PERMISSION_DENIED") || e.code === 7) {
      console.error("👉 ERRO DE PERMISSÃO: O Admin SDK não tem autorização no projeto Firestore.");
      console.error(`DETALHES: ProjectID=${admin.app().options.projectId} | DB=${(dbAdmin as any).databaseId || "(default)"}`);
      console.error(`SERVICE_ACCOUNT: ${adminEmail}`);
      console.error("DICA: Certifique-se de que a conta de serviço tem o papel 'Cloud Datastore User' no projeto.");
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
let mpClient: MercadoPagoConfig | null = null;

// ==========================================
// CONFIGURAÇÕES E UTILITÁRIOS
// ==========================================
const getMPClient = () => {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) {
    console.error("❌ [CONFIG] MERCADO_PAGO_ACCESS_TOKEN ausente.");
    throw new Error("Mercado Pago: Access Token ausente.");
  }
  if (!mpClient) {
    mpClient = new MercadoPagoConfig({ accessToken: token });
  }
  return mpClient;
};

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

/**
 * Retorna a URL base do site atual, corrigindo para o modo 'pre' (shared) no AI Studio
 * para garantir que o webhook consiga redirecionar/comunicar.
 */
const getBaseUrl = (req: express.Request) => {
  const forwardedHost = req.get('x-forwarded-host');
  const forwardedProto = req.get('x-forwarded-proto') || 'https';
  const host = req.get('host') || "www.fpacstore.com.br";
  
  // Se estivermos no AI Studio e houver forwarded host, respeitá-lo, 
  // mas garantir que a URL final seja compatível com o domínio público ('pre')
  let currentHost = forwardedHost || host;
  
  // Localhost case
  if (currentHost.includes('localhost') || currentHost.includes('127.0.0.1')) {
    return `http://${currentHost}`;
  }

  // AI Studio specific mapping: dev -> pre
  if (currentHost.includes('ais-dev-') && currentHost.includes('.run.app')) {
    currentHost = currentHost.replace('ais-dev-', 'ais-pre-');
  }
  
  // Garantir HTTPS em produção
  return `https://${currentHost}`;
};

// ==========================================
// ESTOQUE E PRODUTO DE TESTE
// ==========================================

/**
 * Cria o produto de teste obrigatório se não existir
 */
async function initTestProduct() {
  try {
    const productsToEnsure = [
      {
        slug: 'force',
        name: 'FORCE',
        price: 89.90,
        stock: 50,
        description: "A camiseta FORCE é a combinação estética minimalista com atitude marcante."
      },
      {
        slug: 'mark',
        name: 'MARK',
        price: 99.90,
        stock: 30,
        description: "A linha MARK foca na identidade visual através de artes exclusivas."
      },
      {
        slug: 'prime',
        name: 'PRIME',
        price: 119.90,
        stock: 20,
        description: "A tela em branco para a sua identidade."
      },
      {
        slug: 'teste-checkout-real',
        name: 'TESTE CHECKOUT',
        price: 1.00,
        stock: 999,
        description: "Produto temporário para validação real do fluxo de pagamento."
      }
    ];

    for (const p of productsToEnsure) {
      const productRef = dbAdmin.collection('products').doc(p.slug);
      const snap = await productRef.get();

      if (!snap.exists) {
        console.log(`🛠️ [INIT] Criando produto '${p.name}'...`);
        await productRef.set({
          ...p,
          images: [`https://placehold.co/600x800/000000/eab308?text=${p.name}`],
          isAvailable: true,
          sizes: ["P", "M", "G", "GG"],
          colors: [
            { name: "Preto", hex: "#000000" },
            { name: "Branco", hex: "#ffffff" }
          ],
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        // Se o produto existe mas está sem estoque, resetar para o padrão inicial para garantir funcionamento
        const data = snap.data();
        if (!data?.stock || data.stock <= 0) {
          console.log(`🛠️ [INIT] Repondo estoque do produto '${p.name}'...`);
          await productRef.set({ stock: p.stock }, { merge: true });
        }
      }

      // Garante que o inventário esteja sincronizado
      const invRef = dbAdmin.collection('inventory').doc(p.slug);
      const invSnap = await invRef.get();
      if (!invSnap.exists || invSnap.data()?.stock === 0) {
        console.log(`🛠️ [INIT] Sincronizando estoque para '${p.name}'...`);
        await invRef.set({
          available: true,
          stock: p.stock,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    }
    console.log("✅ [INIT] Auditoria de produtos e estoque concluída.");
  } catch (err: any) {
    console.error("❌ [INIT] Erro ao inicializar produtos:", err.message);
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

        // Sincronizar com a nova coleção 'inventory' também
        if (productData.slug) {
          const invRef = dbAdmin.collection('inventory').doc(productData.slug);
          transaction.set(invRef, {
            stock: newStock,
            available: newStock > 0,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
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
    // Pedidos em 'received' ou 'payment_pending'
    // Filtramos apenas por status para evitar a necessidade de índice composto com createdAt
    const unpaidOrdersSnap = await dbAdmin.collection('orders')
      .where('status', 'in', ['received', 'payment_pending'])
      .get();

    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const docsToCancel = unpaidOrdersSnap.docs.filter(doc => {
      const data = doc.data();
      if (!data.createdAt) return false;
      
      const createdAtDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      return createdAtDate < twentyFourHoursAgo;
    });

    console.log(`🧹 [CLEANUP] Verificados ${unpaidOrdersSnap.size} pedidos pendentes. ${docsToCancel.length} serão cancelados.`);

    for (const doc of docsToCancel) {
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

import helmet from "helmet";

const app = express();
const PORT = 3000;

async function startServer() {
  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  // Redirecionamento WWW para non-WWW (Canonical)
  app.use((req, res, next) => {
    // Configuração para capturar IP real via Cloudflare ou Load Balancer
    const realIp = req.get('cf-connecting-ip') || req.get('x-forwarded-for') || req.ip;
    (req as any).realIp = realIp;

    if (req.hostname.startsWith('www.')) {
      const host = req.hostname.slice(4);
      return res.redirect(301, `https://${host}${req.url}`);
    }
    next();
  });

  // Middleware de Diagnóstico Global - Executa antes de TUDO
  app.use((req, res, next) => {
    if (req.path.includes('create-checkout-session')) {
      console.log(`🚨 [URGENT-DIAG] ${req.method} ${req.url} arriving at server!`);
    }
    next();
  });

  // Log de Chaves de Ambiente (para diagnóstico de CI/CD / AI Studio)
  const envKeys = Object.keys(process.env);
  console.log("🔑 [ENV] Variáveis disponíveis:", envKeys.filter(k => !k.includes('SECRET') && !k.includes('KEY')).join(', '));
  console.log("🔑 [ENV] Segredos presentes:", envKeys.filter(k => k.includes('SECRET') || k.includes('KEY')).map(k => `${k} (check: ${!!process.env[k]})`).join(', '));


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

  // JSON and URL encoding middleware should be BEFORE routes
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mercado Pago Webhook
  app.post("/api/webhook/mercadopago", async (req, res) => {
    const { action, data, type } = req.body;
    console.log(`🔔 [WEBHOOK-MP] Ação: ${action} | Tipo: ${type} | ID: ${data?.id}`);

    try {
      let paymentId = null;

      if (type === 'payment') {
        paymentId = data?.id;
      } else if (type === 'merchant_order') {
        // Se for merchant_order, precisamos buscar o pedido e pegar o ID do pagamento aprovado
        const merchantOrderId = data?.id;
        const merchantOrderResp = await axios.get(`https://api.mercadopago.com/merchant_orders/${merchantOrderId}`, {
          headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.VITE_MERCADOPAGO_ACCESS_TOKEN}` }
        });
        const mOrder = merchantOrderResp.data;
        if (mOrder.payments && mOrder.payments.length > 0) {
          // Pegamos o último pagamento ou o aprovado
          const approvedPayment = mOrder.payments.find((p: any) => p.status === 'approved');
          paymentId = approvedPayment ? approvedPayment.id : mOrder.payments[mOrder.payments.length - 1].id;
        }
      }

      if (!paymentId) {
        // Fallback para resource
        paymentId = req.body.resource?.split('/').pop();
      }

      if (paymentId) {
        const payment = new Payment(getMPClient());
        const mpPayment = await payment.get({ id: paymentId });
        const orderId = mpPayment.external_reference;

        if (orderId) {
          console.log(`💰 [WEBHOOK-MP] Processando pagamento ${paymentId} para Pedido ${orderId} (Status: ${mpPayment.status})`);
          
          const orderRef = dbAdmin.collection('orders').doc(orderId);
          const orderSnap = await orderRef.get();
          
          if (orderSnap.exists) {
            const orderData = orderSnap.data();
            
            // Atualizar status no Firestore se houver mudança relevante
            if (mpPayment.status === 'approved' && orderData?.status !== 'payment_approved') {
              console.log(`✅ [WEBHOOK-MP] APROVANDO PEDIDO ${orderId}`);
              await orderRef.update({
                status: 'payment_approved',
                paymentStatus: 'approved',
                mercadoPagoId: String(paymentId),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              await updateStock(orderData.items || [], 'subtract');
              await sendOrderEmail(orderId, 'payment_approved');
            } 
            else if ((mpPayment.status === 'rejected' || mpPayment.status === 'cancelled' || mpPayment.status === 'refunded') && orderData?.status !== 'cancelled') {
              console.log(`❌ [WEBHOOK-MP] CANCELANDO PEDIDO ${orderId} (Status MP: ${mpPayment.status})`);
              await orderRef.update({
                status: 'cancelled',
                paymentStatus: mpPayment.status,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              await updateStock(orderData.items || [], 'add'); // Devolver ao estoque
              await sendOrderEmail(orderId, 'cancelled');
            }
            else {
              // Outros status: in_process, pending, etc
              await orderRef.update({
                paymentStatus: mpPayment.status,
                paymentStatusDetail: mpPayment.status_detail,
                mercadoPagoId: String(paymentId),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.error("❌ [WEBHOOK-MP] Erro:", err.message);
    }

    res.status(200).send('OK');
  });

  // ROTA DE DIAGNÓSTICO ULTRA-RÁPIDA
  app.all("/api/ping", (req, res) => {
    res.json({ 
      ok: true, 
      timestamp: new Date().toISOString(),
      ip: (req as any).realIp 
    });
  });

  // Sitemap.xml dinâmico (Opcional, se quiser servir via API)
  app.get("/sitemap.xml", (req, res) => {
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://fpacstore.com.br/</loc><priority>1.0</priority></url>
  <url><loc>https://fpacstore.com.br/produtos</loc><priority>0.8</priority></url>
  <url><loc>https://fpacstore.com.br/estampas</loc><priority>0.8</priority></url>
</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  });


  const apiRouter = express.Router();

  // Middleware de Log para Diagnóstico de API (Dentro do Router)
  // ROTA DE VERIFICAÇÃO MANUAL DE PAGAMENTO
  apiRouter.get("/checkout/mercadopago/verify/:orderId", async (req, res) => {
    const { orderId } = req.params;
    console.log(`🔍 [VERIFY-MP] Verificando status para Pedido: ${orderId}`);
    
    try {
      const orderRef = dbAdmin.collection('orders').doc(orderId);
      const orderSnap = await orderRef.get();
      
      if (!orderSnap.exists) {
        return res.status(404).json({ error: "Pedido não encontrado" });
      }

      const orderData = orderSnap.data();
      const mpId = orderData.mercadoPagoId;

      if (!mpId) {
        // Tentar buscar por external_reference se não tivermos o ID ainda
        try {
          const client = getMPClient();
          const payment = new Payment(client);
          // O SDK do MP não tem "search" direto fácil de usar aqui sem filtros complexos, 
          // então vamos apenas informar que ainda não temos o ID.
          return res.json({ status: orderData.status, paymentStatus: orderData.paymentStatus, message: "Aguardando ID do Mercado Pago" });
        } catch (e) {
          return res.status(400).json({ error: "ID do Mercado Pago ausente no pedido" });
        }
      }

      const payment = new Payment(getMPClient());
      const mpPayment = await payment.get({ id: mpId });
      
      console.log(`🔎 [VERIFY-MP] Status MP: ${mpPayment.status}`);

      // Sync status if needed
      if (mpPayment.status === 'approved' && orderData.status !== 'payment_approved') {
        await orderRef.update({
          status: 'payment_approved',
          paymentStatus: 'approved',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await updateStock(orderData.items || [], 'subtract');
        await sendOrderEmail(orderId, 'payment_approved');
      } else if ((mpPayment.status === 'rejected' || mpPayment.status === 'cancelled') && orderData.status !== 'cancelled') {
        await orderRef.update({
          status: 'cancelled',
          paymentStatus: mpPayment.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await updateStock(orderData.items || [], 'add');
        await sendOrderEmail(orderId, 'cancelled');
      }

      res.json({
        status: mpPayment.status === 'approved' ? 'payment_approved' : (mpPayment.status === 'rejected' ? 'cancelled' : orderData.status),
        paymentStatus: mpPayment.status,
        detail: mpPayment.status_detail
      });

    } catch (err: any) {
      console.error("❌ [VERIFY-MP] Erro:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.use((req, res, next) => {
    console.log(`📡 [API ROUTER] ${req.method} ${req.path} | Host: ${req.get('host')}`);
    
    // Configuração de Headers para respostas de API
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // Legacy Check inside apiRouter
  apiRouter.all("/create-checkout-session", (req, res) => {
    console.warn(`🚨 [API-LEGACY] ${req.method} /api/create-checkout-session`);
    res.status(200).json({ 
      error: "Recarregue a página / Refresh Page", 
      message: "Seu navegador está servindo uma versão antiga. Clique no logo ou pressione CTRL+F5." 
    });
  });

  // 1. Configurações Públicas (REFORÇADAS)
  apiRouter.get("/checkout/config", (req, res) => {
    console.log("💰 [API] Serving checkout config...");
    res.json({
      mercadopago: {
        publicKey: process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || null,
        enabled: !!process.env.MERCADO_PAGO_ACCESS_TOKEN && !!process.env.VITE_MERCADO_PAGO_PUBLIC_KEY
      },
      stripe: {
        publicKey: process.env.VITE_STRIPE_PUBLIC_KEY || null,
        enabled: !!process.env.STRIPE_SECRET_KEY && !!process.env.VITE_STRIPE_PUBLIC_KEY
      },
      timestamp: new Date().toISOString()
    });
  });

  // Mount API router FIRST - Antes de qualquer outro middleware de redirecionamento ou estático
  app.use("/api", apiRouter);

  // Removido o middleware de redirecionamento WWW -> non-WWW que estava causando loops e perda de métodos POST
  // O Cloud Run e o domínio customizado devem ser tratados de forma transparente para o usuário.

  apiRouter.get("/test-permissions", async (req, res) => {
    let identity = "Não identificado (Local)";
    try {
      // Tenta pegar o e-mail real da conta de serviço no Cloud Run
      const resp = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
        headers: { 'Metadata-Flavor': 'Google' },
        timeout: 2000
      } as any);
      if (resp.ok) identity = await resp.text();
    } catch (e) {
      identity = `Erro ao detectar: ${adminEmail}`;
    }

    const results: any[] = [];
    const collections = ['products', 'orders', 'inventory', 'estampas', '_health'];
    
    const pid = admin.app().options.projectId;
    const dbid = (dbAdmin as any)._databaseId || (dbAdmin as any).databaseId || '(default)';

    for (const col of collections) {
      try {
        const snap = await dbAdmin.collection(col).limit(1).get();
        results.push({ collection: col, operation: 'read', success: true, count: snap.size });
      } catch (e: any) {
        results.push({ collection: col, operation: 'read', success: false, error: e.message, code: e.code });
      }

      try {
        const id = `test-id-perm`;
        const ref = dbAdmin.collection(col).doc(id);
        await ref.set({ test: true, timestamp: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        results.push({ collection: col, operation: 'write', success: true });
      } catch (e: any) {
        results.push({ collection: col, operation: 'write', success: false, error: e.message, code: e.code });
      }
    }

    res.json({
      identity,
      projectId: pid,
      databaseId: dbid,
      results
    });
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
        startup: startupTestResult,
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
        startup: startupTestResult,
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
    const mpKeys = envKeys.filter(k => k.includes('MERCADO_PAGO'));
    
    res.json({
      node_env: process.env.NODE_ENV,
      port: process.env.PORT,
      firebase_envs: firebaseKeys,
      mercadopago_envs: mpKeys.map(k => `${k} (set: ${!!process.env[k]})`),
      has_adc: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      has_mp_access_token: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
      has_mp_public_key: !!process.env.VITE_MERCADO_PAGO_PUBLIC_KEY,
      uptime: process.uptime()
    });
  });

  apiRouter.get("/health", async (req, res) => {
    try {
      const mpKey = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      const resendKey = process.env.RESEND_API_KEY;
      const baseUrl = getBaseUrl(req);
      
      // Test Firebase connection
      let firebaseStatus = "unknown";
      try {
        await dbAdmin.collection('_health_check').doc('ping').get();
        firebaseStatus = "connected";
      } catch (err: any) {
        firebaseStatus = `error: ${err.message}`;
      }
      
      res.json({ 
        status: "online", 
        firebase: firebaseStatus,
        mercadopago: {
          configured: !!mpKey,
          publicKey: process.env.VITE_MERCADO_PAGO_PUBLIC_KEY ? "✅ Presente" : "❌ Ausente"
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

  // ==========================================
  // API: CHECKOUT MODULAR (MERCADO PAGO ONLY)
  // ==========================================

  // 1.5 Mercado Pago: Processar Pagamento (Checkout Transparente)
  apiRouter.post("/checkout/mercadopago/process-payment", async (req, res) => {
    try {
      const { 
        token, 
        issuer_id, 
        payment_method_id, 
        transaction_amount, 
        installments, 
        payer, 
        items, 
        customerInfo, 
        shipping, 
        discounts, 
        userId,
        payment_type_id // pix, credit_card, etc
      } = req.body;

      console.log(`🚀 [MERCADO-PAGO] Iniciando pagamento: ${payment_method_id} | Valor: ${transaction_amount}`);

      const orderId = `MP-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      
      // Criar pedido no Firestore (Status inicial recebido)
      await dbAdmin.collection('orders').doc(orderId).set({
        ...req.body,
        id: orderId,
        customerName: (customerInfo.name || '').trim(),
        customerEmail: (customerInfo.email || '').trim().toLowerCase(),
        customerPhone: customerInfo.phone,
        // Map address fields to top level for compatibility
        address: customerInfo.address,
        number: customerInfo.number,
        complement: customerInfo.complement || '',
        neighborhood: customerInfo.neighborhood,
        city: customerInfo.city,
        state: customerInfo.state,
        cep: (customerInfo.cep || '').replace(/\D/g, ''),
        cpf: (customerInfo.cpf || '').replace(/\D/g, ''),
        userId: userId || '',
        gateway: 'mercadopago',
        total: Number(transaction_amount),
        status: 'received',
        paymentStatus: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const payment = new Payment(getMPClient());
      
      const paymentData: any = {
        body: {
          transaction_amount: Number(transaction_amount),
          token,
          description: `Pedido #${orderId} - F PAC STORE`,
          installments: Number(installments),
          payment_method_id,
          issuer_id,
          external_reference: orderId,
          notification_url: `${getBaseUrl(req)}/api/webhook/mercadopago`,
          payer: {
            email: payer.email,
            identification: payer.identification,
            first_name: payer.first_name || customerInfo.name.split(' ')[0],
            last_name: payer.last_name || customerInfo.name.split(' ').slice(1).join(' ') || 'Cliente'
          }
        }
      };

      // Se for PIX, não tem token
      if (payment_method_id === 'pix') {
        delete paymentData.body.token;
      }

      const mpResponse = await payment.create(paymentData);
      const mpResult = mpResponse;

      console.log(`✅ [MERCADO-PAGO] Resposta da API:`, {
        id: mpResult.id,
        status: mpResult.status,
        status_detail: mpResult.status_detail
      });

      // Atualizar pedido com ID do Mercado Pago
      const orderRef = dbAdmin.collection('orders').doc(orderId);
      await orderRef.update({
        mercadoPagoId: String(mpResult.id),
        paymentStatus: mpResult.status,
        paymentStatusDetail: mpResult.status_detail,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Se aprovado imediatamente (Cartão)
      if (mpResult.status === 'approved') {
        await orderRef.update({
          status: 'payment_approved',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await updateStock(items, 'subtract');
        await sendOrderEmail(orderId, 'payment_approved');
      } 
      // Se for PIX ou pendente
      else if (mpResult.status === 'pending') {
        await orderRef.update({
          status: 'payment_pending',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await sendOrderEmail(orderId, 'payment_pending');
      }

      res.status(201).json({
        id: mpResult.id,
        status: mpResult.status,
        status_detail: mpResult.status_detail,
        external_reference: orderId,
        point_of_interaction: mpResult.point_of_interaction // Contém QR Code Pix se aplicável
      });

    } catch (err: any) {
      console.error("❌ [MERCADO-PAGO] Erro process-payment:", err.response?.data || err.message);
      res.status(500).json({ 
        error: "Erro no Mercado Pago", 
        details: err.response?.data || err.message 
      });
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
  console.log(`🔑 [CONFIG] MERCADO_PAGO_ACCESS_TOKEN: ${process.env.MERCADO_PAGO_ACCESS_TOKEN ? "✅ Presente" : "❌ Ausente"}`);
  console.log(`🔑 [CONFIG] VITE_MERCADO_PAGO_PUBLIC_KEY: ${process.env.VITE_MERCADO_PAGO_PUBLIC_KEY ? "✅ Presente" : "❌ Ausente"}`);
  console.log(`🔑 [CONFIG] RESEND_API_KEY: ${process.env.RESEND_API_KEY ? "✅ Presente" : "❌ Ausente"}`);

  // SPA Fallback: DEVE ser o último
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
    
    // Cache control para assets (JS, CSS, Imagens)
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true
    }));

    // Cache control padrão para o resto (Exceto index.html)
    app.use(express.static(distPath, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));

    app.get("*", (req, res) => {
      // Se começar com /api/, não deve cair aqui se o roteador falhar (já temos catch-all no apiRouter)
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: "API Route Not Found", path: req.path });
      }

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

  // No Vercel, o app.listen é gerenciado pela plataforma
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 [LOCAL] Server running on http://localhost:${PORT}`);
    });
  }
}

// Executar inicialização
startServer().catch(err => {
  console.error("🔥 [FATAL] Erro ao iniciar servidor:", err);
});

// Exportar o app para Vercel
export default app;

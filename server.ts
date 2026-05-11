import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";

import { Resend } from 'resend';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'fpac-store62'
  });
}
const dbAdmin = admin.firestore();

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
  const token = (process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  const publicKey = (process.env.VITE_MP_PUBLIC_KEY || process.env.MP_PUBLIC_KEY || "").trim();
  
  if (!token) {
    console.error("❌ [CONFIG] MP_ACCESS_TOKEN não configurado.");
    throw new Error("Mercado Pago: Access Token não configurado.");
  }

  const isProduction = token.startsWith('APP_USR');
  console.log(`ℹ️ [MP] Modo detectado: ${isProduction ? "PRODUÇÃO 🚀" : "SANDBOX/TESTE 🛠️"}`);
  
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

    const itemsHtml = items.map((item: any) => `
      <tr>
        <td style="padding: 15px 0; border-bottom: 1px solid #f4f4f4;">
          <div style="font-weight: bold; font-size: 14px; color: #000; text-transform: uppercase;">${item.name}</div>
          <div style="font-size: 11px; color: #888; margin-top: 4px; letter-spacing: 0.5px;">PRODUTO PREMIUM | TAM: ${item.size}</div>
        </td>
        <td style="padding: 15px 0; border-bottom: 1px solid #f4f4f4; text-align: center; font-size: 14px; color: #000; font-weight: bold;">${item.quantity}x</td>
        <td style="padding: 15px 0; border-bottom: 1px solid #f4f4f4; text-align: right; font-size: 14px; color: #000; font-weight: 900;">R$ ${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    let subject = `✅ Recebemos seu Pedido #${orderId} - F PAC STORE`;
    let message = `Recebemos seu pedido com sucesso! Estamos aguardando a confirmação do pagamento para iniciar a produção das suas peças exclusivas.`;
    let buttonText = "ACOMPANHAR PEDIDO";

    const statusMap: Record<string, any> = {
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

  app.use(cors());
  app.options("*", cors()); 
  app.use(express.json());

  // Middleware de Log para Diagnóstico
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      console.log(`📡 [API Request] ${req.method} ${req.path}`);
    }
    next();
  });
  
  console.log("🏁 [STARTUP] Verificando configurações...");
  console.log(`🔑 [CONFIG] MP_ACCESS_TOKEN: ${process.env.MP_ACCESS_TOKEN ? "✅ Presente" : "❌ Ausente"}`);
  console.log(`🔑 [CONFIG] VITE_MP_PUBLIC_KEY: ${process.env.VITE_MP_PUBLIC_KEY ? "✅ Presente" : "❌ Ausente"}`);
  console.log(`🔑 [CONFIG] RESEND_API_KEY: ${process.env.RESEND_API_KEY ? "✅ Presente" : "❌ Ausente"}`);

  const apiRouter = express.Router();

  // ==========================================
  // API Router
  // ==========================================
  apiRouter.get("/health", async (req, res) => {
    try {
      const { publicKey, token, isProduction } = getMPConfig();
      const resendKey = process.env.RESEND_API_KEY;
      const baseUrl = getBaseUrl(req);
      
      res.json({ 
        status: "online", 
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
    try {
      const { publicKey } = getMPConfig();
      res.json({ publicKey });
    } catch (e) {
      res.json({ publicKey: null });
    }
  });

  apiRouter.post("/create_preference", async (req, res) => {
    try {
      const client = getMPClient();
      const preference = new Preference(client);
      const { items, orderId, customerEmail, customerName } = req.body;

      const baseUrl = getBaseUrl(req);

      const body = {
        items: items.map((item: any) => ({
          id: String(item.id),
          title: String(item.name).substring(0, 250),
          quantity: Number(item.quantity),
          unit_price: Number(item.price),
          currency_id: 'BRL',
          picture_url: item.image
        })),
        payer: {
          email: customerEmail,
          name: customerName,
        },
        external_reference: String(orderId),
        notification_url: baseUrl.includes('localhost') ? undefined : `${baseUrl}/api/webhooks/mercadopago`,
        back_urls: {
          success: `${baseUrl}/#/order/${orderId}?status=success`,
          failure: `${baseUrl}/#/order/${orderId}?status=failure`,
          pending: `${baseUrl}/#/order/${orderId}?status=pending`,
        },
        auto_return: 'approved' as const,
        payment_methods: {
          installments: 12,
        },
      };

      const result = await preference.create({ body });
      res.json({ init_point: result.init_point });
    } catch (error: any) {
      console.error("❌ [MP Preference] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post("/process_payment", async (req, res) => {
    try {
      const client = getMPClient();
      const payment = new Payment(client);
      const { formData } = req.body;
      const orderId = formData.external_reference;

      if (!orderId) {
        return res.status(400).json({ message: "ERRO: ID do Pedido ausente no formulário." });
      }

      const orderRef = dbAdmin.collection('orders').doc(orderId);
      const orderSnap = await orderRef.get();
      
      if (!orderSnap.exists) {
        return res.status(404).json({ message: "ERRO: Pedido não encontrado no banco de dados." });
      }

      const orderData = orderSnap.data();
      const amount = Number(Number(formData.transaction_amount || orderData?.total).toFixed(2));
      
      const fullName = (orderData?.customerName || formData.payer.name || "Cliente").trim();
      const nameParts = fullName.split(/\s+/);
      const firstName = nameParts[0] || "Cliente";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : "Silveira";

      const baseUrl = getBaseUrl(req);
      const methodId = String(formData.payment_method_id || "").toLowerCase();
      const isCard = !['pix', 'bolbradesco', 'pec'].includes(methodId);
      
      const body: any = {
        transaction_amount: amount,
        description: `F PAC STORE - Pedido #${orderId}`,
        payment_method_id: formData.payment_method_id,
        external_reference: String(orderId),
        installments: formData.installments ? Number(formData.installments) : 1,
        payer: {
          email: (formData.payer?.email || orderData?.customerEmail || "").trim().toLowerCase(),
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
          items: [
            {
              id: String(orderId),
              title: `Pedido #${orderId} no F PAC STORE`,
              quantity: 1,
              unit_price: amount,
              category_id: 'clothing'
            }
          ]
        }
      };

      console.log("📦 [MP] Payload Payer:", JSON.stringify(body.payer, null, 2));

      if (isCard) {
        if (!formData.token) {
          console.error("❌ [MP] Token do cartão ausente no formData.");
          return res.status(400).json({ message: "Cartão recusado: Token não gerado." });
        }
        body.token = formData.token;
        if (formData.issuer_id) body.issuer_id = String(formData.issuer_id);
      }

      if (!baseUrl.includes('localhost')) {
        body.notification_url = `${baseUrl}/api/webhooks/mercadopago`;
      }

      console.log(`🚀 [MP] Processando Pedido #${orderId} | Val: ${amount} | Mét: ${formData.payment_method_id}`);
      
      const response = await payment.create({ body });

      await orderRef.update({ 
        paymentStatus: response.status,
        paymentId: String(response.id),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if ((response.status === 'approved' || response.status === 'validated')) {
        console.log(`✅ [MP] Pedido #${orderId} aprovado instantaneamente.`);
        await orderRef.update({ status: 'validated' });
        sendOrderEmail(orderId, 'approved').catch(err => console.error("Erro e-mail imediato:", err));
      } else if (formData.payment_method_id === 'pix' && response.status === 'pending') {
        await orderRef.update({
          paymentMethod: 'PIX',
          pixData: {
            qr_code: response.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: response.point_of_interaction?.transaction_data?.qr_code_base64,
            ticket_url: response.point_of_interaction?.transaction_data?.ticket_url,
            expires_at: response.date_of_expiration
          }
        });
        sendOrderEmail(orderId, 'pending').catch(err => console.error("Erro e-mail PIX:", err));
      } else {
        sendOrderEmail(orderId, 'pending').catch(err => console.error("Erro e-mail Pendente:", err));
      }

      return res.status(201).json({
        id: response.id,
        status: response.status,
        status_detail: response.status_detail,
        qr_code: response.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: response.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: response.point_of_interaction?.transaction_data?.ticket_url,
      });

    } catch (error: any) {
      console.error("❌ [MP] Erro Detalhado:");
      let mpError: any = error.api_response?.body || error.response?.data || error;
      console.error(JSON.stringify(mpError, null, 2));

      let message = "Erro ao processar pagamento. Tente novamente.";
      const errorStr = JSON.stringify(mpError).toLowerCase();

      if (errorStr.includes('payer.identification')) message = "CPF inválido ou não informado corretamente.";
      else if (errorStr.includes('email')) message = "E-mail do comprador inválido.";
      else if (errorStr.includes('card_token')) message = "Cartão recusado. Verifique os dados digitados.";
      else if (errorStr.includes('amount')) message = "Valor da transação inválido.";

      return res.status(400).json({ success: false, message, error: mpError });
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

  apiRouter.all("*", (req, res) => res.status(404).json({ error: "API Route not found" }));

  // Mount API router
  app.use("/api", apiRouter);

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

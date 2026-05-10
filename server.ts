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
// CONFIGURAÇÕES E UTILITÁRIOS (LIMPO)
// ==========================================
const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY ausente");
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
};

const getMPConfig = () => {
  // Busca priorizando as chaves padrão de produção
  const token = (process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  const publicKey = (process.env.VITE_MP_PUBLIC_KEY || process.env.MP_PUBLIC_KEY || "").trim();
  
  if (!token || token.length < 20) {
    throw new Error("Mercado Pago: Access Token não configurado corretamente.");
  }
  
  return { token, publicKey };
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
    await resend.emails.send({
      from: 'F PAC STORE <atendimento@fpacstore.com.br>',
      to: [email.trim()],
      replyTo: 'fpacstore@gmail.com',
      subject: subject,
      html: getEmailHtml({ customerName, orderId, message, itemsHtml, totals, address, paymentMethod, status, buttonText })
    });

    console.log(`📧 [EMAIL] Enviado com sucesso (${status}) para ${email}`);
  } catch (error) {
    console.error(`❌ [EMAIL] Erro ao enviar:`, error);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.options("*", cors()); 
  app.use(express.json());

  // ==========================================
  // API: CONFIG & HEALTH
  // ==========================================
  app.get("/api/health", (req, res) => {
    try {
      const { publicKey, token } = getMPConfig();
      res.json({ 
        status: "online", 
        mercadopago: publicKey ? "configured" : "pending",
        token_present: !!token,
        token_prefix: token?.substring(0, 7),
        mode: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      });
    } catch (e: any) {
      res.json({ status: "partial", error: e.message });
    }
  });

  app.get("/api/payment-config", (req, res) => {
    try {
      const { publicKey } = getMPConfig();
      res.json({ publicKey });
    } catch (e) {
      res.json({ publicKey: null });
    }
  });

  // ==========================================
  // API: NOTIFICATIONS (RESEND)
  // ==========================================
  app.post("/api/send-confirmation", async (req, res) => {
    try {
      const { orderId, status } = req.body;
      if (!orderId) return res.status(400).json({ success: false, error: "OrderId obrigatório" });
      
      await sendOrderEmail(orderId, status);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==========================================
  // API: MERCADO PAGO (PRO / REDIRECT)
  // ==========================================
  app.post("/api/create_preference", async (req, res) => {
    try {
      const client = getMPClient();
      const preference = new Preference(client);
      const { items, orderId, customerEmail, customerName, total } = req.body;

      const host = req.get('host');
      const protocol = host?.includes('localhost') ? 'http' : 'https';
      const baseUrl = `${protocol}://${host}`;

      const body = {
        items: items.map((item: any) => ({
          id: item.id,
          title: item.name,
          quantity: Number(item.quantity),
          unit_price: Number(item.price),
          currency_id: 'BRL',
          picture_url: item.image
        })),
        payer: {
          email: customerEmail,
          name: customerName,
        },
        external_reference: orderId,
        back_urls: {
          success: `${baseUrl}/#/order/${orderId}?status=success`,
          failure: `${baseUrl}/#/order/${orderId}?status=failure`,
          pending: `${baseUrl}/#/order/${orderId}?status=pending`,
        },
        auto_return: 'approved' as const,
        notification_url: host?.includes('localhost') ? undefined : `${baseUrl}/api/webhooks/mercadopago`,
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

  // ==========================================
  // API: MERCADO PAGO (LEGACY BRICKS)
  // ==========================================
  app.post("/api/process_payment", async (req, res) => {
    try {
      const client = getMPClient();
      const payment = new Payment(client);
      const { formData } = req.body;
      const orderId = formData.external_reference;

      if (!orderId) {
        return res.status(400).json({ message: "ERRO: external_reference (ID do Pedido) ausente." });
      }

      // Buscar dados do pedido para garantir que temos o nome/email corretos
      const orderRef = dbAdmin.collection('orders').doc(orderId);
      const orderSnap = await orderRef.get();
      const orderData = orderSnap.exists ? orderSnap.data() : null;

      const customerName = (orderData?.customerName || formData.payer.name || "Cliente F PAC").trim();
      const names = customerName.split(/\s+/);
      const firstName = names[0] || "Cliente";
      let lastName = names.length > 1 ? names.slice(1).join(' ') : "Store";
      if (firstName === lastName) lastName = "F PAC";

      const body: any = {
        transaction_amount: Number(formData.transaction_amount),
        description: `F PAC STORE - Pedido #${orderId}`,
        payment_method_id: formData.payment_method_id,
        external_reference: String(orderId),
        payer: {
          email: (formData.payer.email || orderData?.customerEmail || "").trim(),
          first_name: firstName,
          last_name: lastName,
        }
      };

      // Identificação é CRÍTICA no Brasil
      const cpfFromForm = formData.payer.identification?.number || orderData?.cpf || "";
      const cleanCpf = cpfFromForm.replace(/\D/g, '');
      
      if (cleanCpf.length >= 11) {
        body.payer.identification = {
          type: 'CPF',
          number: cleanCpf
        };
      }

      // Additional Info Payer (Obrigatório para alguns métodos)
      body.additional_info = {
        items: [
          {
            id: String(orderId),
            title: `Pedido #${orderId} no F PAC STORE`,
            quantity: 1,
            unit_price: Number(formData.transaction_amount)
          }
        ],
        payer: {
          first_name: firstName,
          last_name: lastName,
          email: body.payer.email,
          registration_date: new Date().toISOString()
        }
      };

      if (orderData?.address) {
        body.additional_info.payer.address = {
          zip_code: orderData.address.cep?.replace(/\D/g, '') || "00000000",
          street_name: (orderData.address.street || "Rua").substring(0, 70),
          street_number: Number(orderData.address.number) || 1
        };
        // MP também gosta de phone em additional_info
        if (orderData.customerPhone) {
          const cleanPhone = orderData.customerPhone.replace(/\D/g, '');
          body.additional_info.payer.phone = {
            area_code: cleanPhone.substring(0, 2) || "47",
            number: cleanPhone.length > 2 ? cleanPhone.substring(2).slice(-9) : "999999999"
          };
        }
      }

      if (formData.payment_method_id !== 'pix' && formData.payment_method_id !== 'bolbradesco') {
        if (formData.token) body.token = formData.token;
        if (formData.installments) body.installments = Number(formData.installments);
        
        // Muitos erros 400 vem de issuer_id sendo enviado como string vazia ou incorreta
        if (formData.issuer_id && String(formData.issuer_id) !== "") {
          body.issuer_id = String(formData.issuer_id);
        }
      }

      const host = req.get('host');
      if (host && !host.includes('localhost') && !host.includes('run.app')) {
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        body.notification_url = `${protocol}://${host}/api/webhooks/mercadopago`;
      }

      console.log(`🚀 [MP] Payload processado para Pedido #${orderId}`);
      // console.log(JSON.stringify(body, null, 2));
      
      const response = await payment.create({ body });
      
      // Se for PIX, salvar os dados na ordem para o cliente ver no status
      if (formData.payment_method_id === 'pix' && response.status === 'pending') {
        try {
          await orderRef.update({
            paymentMethod: 'PIX',
            paymentId: String(response.id),
            pixData: {
              qr_code: response.point_of_interaction?.transaction_data?.qr_code,
              qr_code_base64: response.point_of_interaction?.transaction_data?.qr_code_base64,
              ticket_url: response.point_of_interaction?.transaction_data?.ticket_url,
              expires_at: response.date_of_expiration
            }
          });
        } catch (dbErr) {
          console.error("❌ [API] Erro ao salvar PIX Data:", dbErr);
        }
      }

      res.status(201).json({
        id: response.id,
        status: response.status,
        status_detail: response.status_detail,
        qr_code: response.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: response.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: response.point_of_interaction?.transaction_data?.ticket_url,
      });
    } catch (error: any) {
      console.error("❌ [MP] Error Completo:", error);
      
      let mpErrorData = error;
      if (error.response?.data) mpErrorData = error.response.data;
      
      console.error("❌ [MP] Detalhes do Erro:", JSON.stringify(mpErrorData, null, 2));
      
      let userFriendlyMessage = "Erro no processamento do pagamento";
      const errorMsg = JSON.stringify(mpErrorData).toLowerCase();

      // Mapear erros comuns do Mercado Pago com mais precisão
      if (errorMsg.includes('payer.identification') || errorMsg.includes('324') || errorMsg.includes('invalid_identification')) {
        userFriendlyMessage = "CPF/CNPJ inválido ou obrigatório";
      } else if (errorMsg.includes('amount') || errorMsg.includes('total_paid_amount')) {
        userFriendlyMessage = "Valor da transação inválido";
      } else if (errorMsg.includes('email') || errorMsg.includes('2040')) {
        userFriendlyMessage = "E-mail do comprador inválido ou ausente";
      } else if (errorMsg.includes('first_name') || errorMsg.includes('last_name')) {
        userFriendlyMessage = "Nome ou sobrenome do titular inválido";
      } else if (errorMsg.includes('token') || errorMsg.includes('card_token')) {
        userFriendlyMessage = "Cartão recusado ou inválido";
      } else if (errorMsg.includes('installments')) {
        userFriendlyMessage = "Número de parcelas inválido";
      }

      res.status(400).json({ 
        message: userFriendlyMessage, 
        error: mpErrorData,
        details: error.cause || null
      });
    }
  });

  app.post("/api/webhooks/mercadopago", async (req, res) => {
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
              // Enviar e-mail de pagamento aprovado
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

  app.all("/api/*", (req, res) => res.status(404).json({ error: "Route not found" }));

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

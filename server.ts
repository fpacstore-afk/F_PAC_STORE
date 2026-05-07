import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

import { Resend } from 'resend';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let resendClient: Resend | null = null;

function getResend() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is required for sending emails");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

let mpClient: MercadoPagoConfig | null = null;

function getMPClient() {
  if (!mpClient) {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("MP_ACCESS_TOKEN environment variable is required for processing payments");
    }
    mpClient = new MercadoPagoConfig({ accessToken });
  }
  return mpClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ==========================================
  // NOVO FLUXO DE E-MAIL (RESEND v2)
  // ==========================================
  app.post("/api/send-confirmation", async (req, res) => {
    console.log("📥 [DEBUG] RECEBIDA REQUISIÇÃO DE E-MAIL");
    try {
      const { email, customerName, orderId, items, totals, status } = req.body;
      const apiKey = process.env.RESEND_API_KEY;

      if (!apiKey) {
        console.error("❌ [DEBUG] RESEND_API_KEY NÃO DEFINIDA");
        console.error("❌ ERRO CRÍTICO: RESEND_API_KEY não está definida nas configurações do AI Studio.");
        return res.status(500).json({ 
          success: false, 
          error: "Configuração do servidor incompleta (API Key ausente). Verifique os Secrets." 
        });
      }

      const resend = new Resend(apiKey);
      
      let subject = `✅ Recebemos seu Pedido #${orderId}`;
      let message = 'Recebemos seu pedido com sucesso! Estamos aguardando a confirmação do pagamento.';
      let buttonText = 'Ver detalhes no site';

      if (status === 'approved' || status === 'validated') {
        subject = `🚀 Pedido Confirmado! #${orderId}`;
        message = 'O pagamento do seu pedido foi confirmado! 🎉 Já estamos preparando tudo com muito cuidado.';
      } else if (status === 'processing') {
        subject = `👕 Seu pedido está em produção! #${orderId}`;
        message = 'Ótimas notícias! Seu pedido entrou em produção e logo estará pronto para envio.';
      } else if (status === 'shipped') {
        subject = `📦 Seu pedido foi enviado! #${orderId}`;
        message = 'Seu pedido já saiu para entrega! Prepare o coração (e o look).';
        buttonText = 'Acompanhar Pedido';
      } else if (status === 'delivered') {
        subject = `✨ Pedido Entregue! #${orderId}`;
        message = 'Seu pedido foi entregue com sucesso. Esperamos que você ame sua nova peça F PAC STOCK!';
        buttonText = 'Ver Detalhes';
      } else if (status === 'cancelled') {
        subject = `❌ Pedido Cancelado #${orderId}`;
        message = 'O seu pedido foi cancelado. Se você tiver alguma dúvida, entre em contato conosco.';
      }
      
      const itemsHtml = items.map((item: any) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">
            <div style="font-weight: bold; font-size: 14px; color: #000;">${item.name.toUpperCase()}</div>
            <div style="font-size: 12px; color: #666;">Cor: ${item.color} | Tam: ${item.size}</div>
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: center; font-size: 14px; color: #000;">${item.quantity}x</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-size: 14px; color: #000;">R$ ${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `).join('');

      console.log(`🚀 Tentando enviar e-mail via Resend para: ${email} | Status: ${status}`);

      const { data, error } = await resend.emails.send({
        from: 'F PAC STORE <vendas@fpacstore.com.br>',
        to: [email.trim()],
        replyTo: 'fpacstore@gmail.com',
        subject: subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden; background-color: #fff;">
            <div style="background: #000; padding: 25px; text-align: center; color: #fff;">
              <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px; font-weight: 900; text-transform: uppercase;">
                F PAC <span style="color: #eab308;">STORE</span>
              </h1>
            </div>
            <div style="padding: 30px; color: #333;">
              <h2 style="margin-top: 0; font-size: 20px; font-weight: 800; color: #000; text-transform: uppercase;">Olá, ${customerName}!</h2>
              <p style="font-size: 16px; line-height: 1.5; color: #444;">${message}</p>
              
              <div style="margin: 30px 0; padding: 20px; background: #fafafa; border: 1px solid #eee; border-radius: 4px;">
                <h3 style="margin-top: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888; border-bottom: 1px solid #eee; padding-bottom: 10px;">Pedido #${orderId}</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  ${itemsHtml}
                </table>
                <div style="text-align: right; margin-top: 20px; padding-top: 15px; border-top: 2px solid #eee;">
                  <span style="font-size: 14px; text-transform: uppercase; color: #888; font-weight: bold; margin-right: 10px;">Total do Pedido:</span>
                  <span style="font-size: 20px; color: #000; font-weight: 900;">R$ ${totals.finalTotal.toFixed(2)}</span>
                </div>
              </div>
              
              <a href="https://fpacstore.com.br/#/tracking" style="display: block; background: #eab308; color: #000; text-align: center; padding: 15px; text-decoration: none; font-weight: 900; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px; font-size: 14px; box-shadow: 0 4px 10px rgba(234,179,8,0.2);">
                ${buttonText}
              </a>
              
              <p style="text-align: center; margin-top: 15px;">
                <a href="https://fpacstore.com.br/#/order/${orderId}" style="color: #666; font-size: 12px; text-decoration: underline;">Ver status detalhado do pedido #${orderId}</a>
              </p>
              
              <p style="margin-top: 30px; font-size: 12px; color: #999; text-align: center;">
                Este é um e-mail automático da F PAC STORE. Não responda a este e-mail.<br>
                Em caso de dúvidas, contate-nos pelo WhatsApp: (47) 99746-5602
              </p>
            </div>
            <div style="background: #f4f4f4; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 2px; font-weight: bold;">
                NÃO É SÓ ROUPA, É IDENTIDADE
              </p>
            </div>
          </div>
        `
      });

      if (error) {
        console.error("❌ FALHA RESEND:", error);
        return res.status(400).json({ success: false, error });
      }

      console.log(`✅ SUCESSO RESEND: E-mail enviado (ID: ${data?.id})`);
      return res.status(200).json({ success: true, id: data?.id });

    } catch (err: any) {
      console.error("💥 ERRO NA ROTA DE E-MAIL:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // ROTA DE TESTE DIRETO (Acessar via Browser)
  // ==========================================
  app.get("/api/test-email-direct", async (req, res) => {
    console.log("🚀 [DEBUG] TESTE DIRETO ACIONADO VIA GET");
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return res.send("❌ ERRO: Chave RESEND_API_KEY não configurada nos Secrets!");
      }

      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: 'F PAC STORE <vendas@fpacstore.com.br>',
        to: ['fpacstore@gmail.com'],
        subject: '🧪 TESTE DE CONEXÃO DIRETA',
        html: '<h1>O servidor está conseguindo falar com o Resend!</h1><p>Se você recebeu isso, a configuração está 100%.</p>'
      });

      if (error) {
        return res.send("❌ ERRO DO RESEND: " + JSON.stringify(error));
      }

      res.send("✅ SUCESSO! E-mail enviado com ID: " + data?.id);
    } catch (err: any) {
      res.send("💥 ERRO CRÍTICO NO SCRIPT: " + err.message);
    }
  });

  // Mercado Pago Payment Route
  app.post("/api/process_payment", async (req, res) => {
    try {
      const client = getMPClient();
      const payment = new Payment(client);

      const { formData } = req.body;

      console.log(`💳 Iniciando processamento de pagamento para: ${formData.payer.email}...`);
      const paymentResponse = await payment.create({
        body: {
          transaction_amount: formData.transaction_amount,
          token: formData.token,
          description: formData.description,
          installments: formData.installments,
          payment_method_id: formData.payment_method_id,
          issuer_id: formData.issuer_id,
          payer: {
            email: formData.payer.email,
            identification: {
              type: formData.payer.identification.type,
              number: formData.payer.identification.number,
            },
          },
        }
      });
      console.log(`✅ Pagamento processado! Status: ${paymentResponse.status} | ID: ${paymentResponse.id}`);

      res.status(201).json({
        id: paymentResponse.id,
        status: paymentResponse.status,
        status_detail: paymentResponse.status_detail,
        qr_code: paymentResponse.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: paymentResponse.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: paymentResponse.point_of_interaction?.transaction_data?.ticket_url,
      });
    } catch (error: any) {
      console.error("❌ Erro no pagamento Mercado Pago:", error.message || error);
      res.status(500).json({ 
        message: "Erro ao processar pagamento", 
        error: error.message || "Erro interno"
      });
    }
  });

  // Vite middleware for development
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
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

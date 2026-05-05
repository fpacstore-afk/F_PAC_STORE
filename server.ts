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

  // API Route for Email Confirmation
  // In a real app, you would use a service like SendGrid, Resend, or Nodemailer with SMTP
  app.post("/api/send-confirmation", async (req, res) => {
    try {
      const { email, customerName, orderId, summary } = req.body;
      
      const apiKey = process.env.RESEND_API_KEY;
      
      if (!apiKey) {
        console.warn("⚠️ AVISO: RESEND_API_KEY não configurada. E-mails reais não serão enviados.");
        console.log(`[SIMULAÇÃO] Para: ${email} | Assunto: Pedido #${orderId}`);
        return res.status(200).json({ 
          success: true, 
          message: "Modo simulação: Adicione a RESEND_API_KEY nas configurações para envio real.",
          simulated: true 
        });
      }

      const resend = getResend();
      
      // Convert Markdown-style summary to basic HTML
      const summaryContent = summary
        .replace(/\n/g, '<br>')
        .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
        .replace(/_(.*?)_/g, '<em>$1</em>');

      console.log(`📧 Tentando enviar e-mail para: ${email}...`);

      const { data, error } = await resend.emails.send({
        // ⚠️ IMPORTANTE: 
        // 1. Enquanto seu domínio NÃO estiver verificado (Status Failed), USE 'onboarding@resend.dev'.
        //    Nota: Nesse modo, o e-mail só chega para VOCÊ (o dono da conta Resend).
        // 2. Após o status no Resend ficar VERDE (Verified), mude para 'vendas@fpacstore.com.br'.
        from: 'F PAC STORE <onboarding@resend.dev>', 
        to: [email],
        reply_to: 'fpacstore@gmail.com',
        bcc: ['fpacstore@gmail.com'],
        subject: `Pedido #${orderId} Recebido - F PAC STORE`,
        html: `
          <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; padding: 40px 20px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 40px;">
              <h1 style="font-size: 32px; font-weight: 900; letter-spacing: -1px; text-transform: uppercase; margin: 0; color: #000;">F PAC <span style="color: #eab308;">STORE</span></h1>
              <div style="height: 2px; width: 40px; background: #eab308; margin: 15px auto;"></div>
            </div>
            
            <h2 style="font-size: 20px; font-weight: 700; text-transform: uppercase; margin-bottom: 20px;">Olá, ${customerName}!</h2>
            <p style="font-size: 16px; line-height: 1.6; color: #4a4a4a; margin-bottom: 30px;">
              Recebemos seu pedido com sucesso! Estamos muito felizes que você escolheu a <strong>F PAC STORE</strong>.
            </p>
            
            <div style="background-color: #f8f8f8; border-left: 4px solid #eab308; padding: 25px; margin-bottom: 35px;">
              <h3 style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-top: 0; margin-bottom: 15px; color: #888;">Resumo do Pedido #${orderId}</h3>
              <div style="font-size: 14px; line-height: 1.8; color: #333;">
                ${summaryContent}
              </div>
            </div>

            <div style="text-align: center; margin-top: 40px; padding-top: 30px; border-top: 1px solid #eee;">
              <p style="font-size: 14px; color: #666; margin-bottom: 20px;">Qualquer dúvida, responda a este e-mail ou nos chame no WhatsApp.</p>
              <p style="font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 2px;">
                F PAC STORE &copy; 2026<br>
                JOINVILLE - SC
              </p>
            </div>
          </div>
        `
      });

      if (error) {
        console.error("❌ Erro do Resend:", error);
        return res.status(400).json({ success: false, error: error.message });
      }

      console.log(`✅ E-mail enviado com sucesso! ID: ${data?.id}`);
      res.status(200).json({ success: true, message: "E-mail enviado com sucesso", data });
    } catch (error: any) {
      console.error("💥 Erro crítico no envio de e-mail:", error);
      res.status(500).json({ success: false, error: error?.message || "Erro interno ao processar e-mail" });
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

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
  // FLUXO DE E-MAIL (RESEND)
  // ==========================================
  app.post("/api/send-confirmation", async (req, res) => {
    try {
      const { email, customerName, orderId, items, totals, status } = req.body;
      
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.error("❌ ERRO: RESEND_API_KEY não configurada.");
        return res.status(500).json({ success: false, error: "API Key ausente." });
      }

      const resend = new Resend(apiKey);
      const isApproved = status === 'approved' || status === 'validated';
      
      // Construção do HTML do Pedido
      const itemsHtml = items.map((item: any) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">
            <div style="font-weight: bold; font-size: 14px;">${item.name.toUpperCase()}</div>
            <div style="font-size: 12px; color: #666;">Cor: ${item.color} | Tam: ${item.size}</div>
            ${item.printConfigs?.length ? item.printConfigs.map((c:any) => `<div style="font-size: 11px; color: #eab308;">+ ${c.stamp} (${c.location})</div>`).join('') : ''}
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: center; font-size: 14px;">${item.quantity}x</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-size: 14px;">R$ ${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `).join('');

      console.log(`📧 Disparando e-mail de ${isApproved ? 'CONFIRMAÇÃO' : 'RECEBIMENTO'} para: ${email}`);

      const { data, error } = await resend.emails.send({
        from: 'F PAC STORE <vendas@fpacstore.com.br>',
        to: [email.trim()],
        replyTo: 'fpacstore@gmail.com',
        bcc: ['fpacstore@gmail.com'],
        subject: isApproved ? `🚀 Pagamento Confirmado! Pedido #${orderId}` : `✅ Pedido #${orderId} Recebido!`,
        html: `
          <div style="background-color: #f9f9f9; padding: 40px 0; font-family: sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #eee;">
              <div style="background: #000; padding: 30px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px; letter-spacing: 2px;">F PAC <span style="color: #eab308;">STORE</span></h1>
              </div>
              
              <div style="padding: 40px;">
                <p style="font-size: 18px; font-weight: bold; margin-bottom: 20px;">Olá, ${customerName}!</p>
                <p style="color: #444; line-height: 1.6;">
                  ${isApproved 
                    ? 'Recebemos a confirmação do seu pagamento! Seu pedido já entrou na nossa fila de produção e logo estará a caminho.' 
                    : 'Recebemos seu pedido com sucesso! Assim que o pagamento for confirmado, iniciaremos a produção das suas peças.'}
                </p>

                <div style="margin: 30px 0; padding: 20px; background: #fcfcfc; border: 1px dashed #ddd;">
                  <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #888;">Detalhes do Pedido #${orderId}</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    ${itemsHtml}
                  </table>
                  
                  <div style="margin-top: 20px; text-align: right;">
                    <div style="font-size: 14px; color: #666;">Frete: R$ ${totals.frete.toFixed(2)}</div>
                    ${totals.discount > 0 ? `<div style="font-size: 14px; color: #dc2626;">Desconto: - R$ ${totals.discount.toFixed(2)}</div>` : ''}
                    <div style="font-size: 18px; font-weight: bold; margin-top: 10px;">Total: R$ ${totals.finalTotal.toFixed(2)}</div>
                  </div>
                </div>

                <div style="text-align: center; margin-top: 40px;">
                  <a href="https://fpacstore.com.br/#/order/${orderId}" style="background: #eab308; color: #000; padding: 15px 30px; text-decoration: none; font-weight: bold; border-radius: 4px; text-transform: uppercase; font-size: 12px;">Acompanhar Pedido</a>
                </div>
              </div>

              <div style="background: #fafafa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
                F PAC STORE - Joinville/SC<br>
                fpacstore@gmail.com
              </div>
            </div>
          </div>
        `
      });

      if (error) {
        console.error("❌ Erro Resend:", error);
        return res.status(400).json({ success: false, error });
      }

      res.status(200).json({ success: true, data });
    } catch (err: any) {
      console.error("💥 Erro Script:", err);
      res.status(500).json({ success: false, error: err.message });
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

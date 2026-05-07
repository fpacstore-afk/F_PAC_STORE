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
    console.log("📥 [DEBUG] RECEBIDA REQUISIÇÃO DE E-MAIL:", JSON.stringify(req.body, null, 2));
    try {
      const { email, customerName, orderId, items, totals, status, address, paymentMethod } = req.body;
      
      if (!email || !orderId || !items || !totals) {
        console.error("❌ [DEBUG] DADOS INCOMPLETOS NA REQUISIÇÃO:", { email, orderId, hasItems: !!items, hasTotals: !!totals });
        return res.status(400).json({ success: false, error: "Dados do pedido incompletos para envio de e-mail." });
      }

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
          <td style="padding: 15px 0; border-bottom: 1px solid #f4f4f4;">
            <div style="font-weight: bold; font-size: 14px; color: #000; text-transform: uppercase;">${item.name}</div>
            <div style="font-size: 12px; color: #666; margin-top: 4px;">Cor: ${item.color} | Tam: ${item.size}</div>
          </td>
          <td style="padding: 15px 0; border-bottom: 1px solid #f4f4f4; text-align: center; font-size: 14px; color: #000;">${item.quantity}x</td>
          <td style="padding: 15px 0; border-bottom: 1px solid #f4f4f4; text-align: right; font-size: 14px; color: #000; font-weight: bold;">R$ ${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `).join('');

      const addressHtml = address ? `
        <div style="margin-top: 25px; padding: 20px; background: #fff; border: 1px solid #eee; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888;">Endereço de Entrega</h4>
          <p style="margin: 0; font-size: 14px; color: #333; line-height: 1.6;">
            ${address.street}, ${address.number} ${address.complement ? '- ' + address.complement : ''}<br>
            ${address.neighborhood} - ${address.city}/${address.state}<br>
            CEP: ${address.cep}
          </p>
        </div>
      ` : '';

      const paymentHtml = paymentMethod ? `
        <div style="margin-top: 15px; padding: 20px; background: #fff; border: 1px solid #eee; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888;">Método de Pagamento</h4>
          <p style="margin: 0; font-size: 14px; color: #333; font-weight: bold;">
            ${paymentMethod.toUpperCase()}
          </p>
        </div>
      ` : '';

      console.log(`🚀 Tentando enviar e-mail via Resend para: ${email} | Status: ${status}`);

      const { data, error } = await resend.emails.send({
        from: 'F PAC STORE <vendas@fpacstore.com.br>',
        to: [email.trim()],
        replyTo: 'fpacstore@gmail.com',
        subject: subject,
        html: `
          <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
            <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #eee;">
              <div style="background: #000; padding: 30px; text-align: center; color: #fff;">
                <h1 style="margin: 0; font-size: 28px; letter-spacing: 4px; font-weight: 900; text-transform: uppercase;">
                  F PAC <span style="color: #eab308;">STORE</span>
                </h1>
                <p style="margin: 10px 0 0 0; font-size: 10px; letter-spacing: 2px; color: #aaa; text-transform: uppercase;">Estúdio de Identidade e Atitude</p>
              </div>
              
              <div style="padding: 40px 30px; color: #333;">
                <h2 style="margin-top: 0; font-size: 22px; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: -0.5px;">Olá, ${customerName}!</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #555; margin-bottom: 30px;">${message}</p>
                
                  <div style="margin: 30px 0; padding: 0;">
                  <h3 style="margin-top: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #000; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">Resumo do Pedido #${orderId}</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                      <tr>
                        <th style="text-align: left; font-size: 10px; text-transform: uppercase; color: #999; padding-bottom: 10px;">Item</th>
                        <th style="text-align: center; font-size: 10px; text-transform: uppercase; color: #999; padding-bottom: 10px;">Qtd</th>
                        <th style="text-align: right; font-size: 10px; text-transform: uppercase; color: #999; padding-bottom: 10px;">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHtml}
                    </tbody>
                  </table>
                  
                  <div style="margin-top: 20px; padding: 20px; background: #fafafa; border-radius: 8px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                      <tr>
                        <td style="padding: 4px 0; color: #666; text-transform: uppercase;">Frete</td>
                        <td style="padding: 4px 0; text-align: right; color: #000; font-weight: bold;">R$ ${totals.frete.toFixed(2)}</td>
                      </tr>
                      ${totals.discount > 0 ? `
                      <tr>
                        <td style="padding: 4px 0; color: #eab308; text-transform: uppercase;">Desconto</td>
                        <td style="padding: 4px 0; text-align: right; color: #eab308; font-weight: bold;">- R$ ${totals.discount.toFixed(2)}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 15px 0 0 0; font-size: 14px; text-transform: uppercase; color: #000; font-weight: 900; border-top: 1px solid #eee;">Total</td>
                        <td style="padding: 15px 0 0 0; text-align: right; font-size: 22px; color: #000; font-weight: 900; border-top: 1px solid #eee;">R$ ${totals.finalTotal.toFixed(2)}</td>
                      </tr>
                    </table>
                  </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                  <tr>
                    <td style="width: 50%; padding-right: 10px; vertical-align: top;">
                      ${address ? `
                      <div style="padding: 20px; background: #fff; border: 1px solid #eee; border-radius: 8px; min-height: 120px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888;">Entrega em:</h4>
                        <p style="margin: 0; font-size: 13px; color: #333; line-height: 1.5;">
                          ${address.street}, ${address.number}<br>
                          ${address.complement ? address.complement + '<br>' : ''}
                          ${address.neighborhood}<br>
                          ${address.city}/${address.state} - ${address.cep}
                        </p>
                      </div>
                      ` : ''}
                    </td>
                    <td style="width: 50%; padding-left: 10px; vertical-align: top;">
                      ${paymentMethod ? `
                      <div style="padding: 20px; background: #fff; border: 1px solid #eee; border-radius: 8px; min-height: 120px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888;">Pagamento via:</h4>
                        <p style="margin: 0; font-size: 14px; color: #000; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;">
                          ${paymentMethod}
                        </p>
                      </div>
                      ` : ''}
                    </td>
                  </tr>
                </table>
                
                <div style="margin-top: 40px; text-align: center;">
                  <a href="https://fpacstore.com.br/#/tracking" style="display: inline-block; background: #000; color: #fff; text-align: center; padding: 18px 40px; text-decoration: none; font-weight: 900; border-radius: 4px; text-transform: uppercase; letter-spacing: 2px; font-size: 14px; box-shadow: 0 10px 20px rgba(0,0,0,0.1);">
                    ${buttonText}
                  </a>
                  <p style="margin-top: 20px;">
                    <a href="https://fpacstore.com.br/#/order/${orderId}" style="color: #999; font-size: 11px; text-decoration: underline; text-transform: uppercase; letter-spacing: 1px;">Ver detalhes complexos do pedido</a>
                  </p>
                </div>
                
                <div style="margin-top: 50px; padding-top: 30px; border-top: 1px solid #eee; text-align: center;">
                  <p style="margin-bottom: 10px; font-size: 14px; font-weight: bold; color: #000;">Dúvidas ou problemas?</p>
                  <p style="margin: 0; font-size: 13px; color: #666;">
                    Chama a gente no WhatsApp:<br>
                    <a href="https://wa.me/5547997465602" style="color: #eab308; font-weight: bold; text-decoration: none; font-size: 16px;">(47) 99746-5602</a>
                  </p>
                </div>
              </div>
              
              <div style="background: #000; padding: 30px; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: #fff; text-transform: uppercase; letter-spacing: 3px; font-weight: bold;">
                  NÃO É SÓ ROUPA, É IDENTIDADE
                </p>
                <div style="margin-top: 15px; font-size: 10px; color: #555;">
                  &copy; 2024 F PAC STORE. Todos os direitos reservados.
                </div>
              </div>
            </div>
            
            <p style="margin-top: 25px; font-size: 10px; color: #bbb; text-align: center; line-height: 1.5;">
              Este é um e-mail transacional enviado pela F PAC STORE.<br>
              Se você não realizou este pedido, por favor desconsidere este e-mail.
            </p>
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

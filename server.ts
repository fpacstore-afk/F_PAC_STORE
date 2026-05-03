import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

import { Resend } from 'resend';

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
        // IMPORTANTE: Assim que verificar seu domínio no Resend, mude para seu e-mail oficial aqui (ex: vendas@fpacstore.com.br)
        from: 'F PAC STORE <vendas@fpacstore.com.br>', 
        to: [email],
        bcc: ['fpacstore@gmail.com'],
        subject: `Pedido #${orderId} Recebido - F PAC STORE`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; padding: 20px;">
            <h1 style="color: #000; font-size: 24px;">Olá, ${customerName}!</h1>
            <p style="font-size: 16px; line-height: 1.5;">Seu pedido <strong>#${orderId}</strong> foi recebido com sucesso.</p>
            <p style="font-size: 16px; line-height: 1.5;">Obrigado pela compra! Em breve, enviaremos novas atualizações.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <div style="background: #f9f9f9; padding: 20px; border: 1px solid #eee; border-radius: 4px;">
              ${summaryContent}
            </div>
            <p style="font-size: 12px; color: #999; margin-top: 40px; text-align: center;">
              F PAC STORE © 2026 - Todos os direitos reservados.
            </p>
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

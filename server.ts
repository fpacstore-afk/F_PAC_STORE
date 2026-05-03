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
        console.warn("⚠️ AVISO: RESEND_API_KEY não configurada. Simulando envio de e-mail...");
        console.log(`Para: ${email} | Assunto: Pedido #${orderId}`);
        return res.status(200).json({ success: true, message: "Simulação realizada (chave ausente)" });
      }

      const resend = getResend();
      
      // Convert Markdown-style summary to basic HTML
      const summaryContent = summary
        .replace(/\n/g, '<br>')
        .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
        .replace(/_(.*?)_/g, '<em>$1</em>');

      const { data, error } = await resend.emails.send({
        from: 'F PAC STORE <onboarding@resend.dev>', // You should update this to your verified domain
        to: [email],
        bcc: ['fpacstore@gmail.com'],
        subject: `Pedido #${orderId} Recebido - F PAC STORE`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h1 style="color: #000;">Olá, ${customerName}!</h1>
            <p style="font-size: 16px;">Seu pedido <strong>#${orderId}</strong> foi recebido com sucesso.</p>
            <p style="font-size: 16px;">Obrigado pela compra! Em breve, enviaremos novas atualizações.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <div style="background: #f9f9f9; padding: 20px; border: 1px solid #eee;">
              ${summaryContent}
            </div>
            <p style="font-size: 12px; color: #999; margin-top: 40px; text-align: center;">
              F PAC STORE © 2026 - Todos os direitos reservados.
            </p>
          </div>
        `
      });

      if (error) {
        throw error;
      }

      res.status(200).json({ success: true, message: "E-mail enviado com sucesso", data });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ success: false, error: "Erro ao enviar e-mail" });
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

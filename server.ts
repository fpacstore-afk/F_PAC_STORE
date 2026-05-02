import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Email Confirmation
  // In a real app, you would use a service like SendGrid, Resend, or Nodemailer with SMTP
  app.post("/api/send-confirmation", async (req, res) => {
    try {
      const { email, customerName, orderId, summary } = req.body;
      
      console.log("-----------------------------------------");
      console.log(`SIMULATING EMAIL SEND TO: ${email}`);
      console.log(`SUBJECT: Pedido #${orderId} Recebido - F PAC STORE`);
      console.log("BODY:");
      console.log(`Olá, ${customerName}!`);
      console.log("");
      console.log(`Seu pedido #${orderId} foi recebido com sucesso.`);
      console.log("");
      console.log("Obrigado pela compra! Em breve, enviaremos novas atualizações.");
      console.log("");
      console.log(summary);
      console.log("-----------------------------------------");
      
      // To implement real emails, you can use Resend like this (requires API Key):
      /*
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'F PAC STORE <vendas@fpacstore.com.br>',
          to: [email],
          subject: `Pedido #${orderId} Recebido - F PAC STORE`,
          html: `<p>Olá, ${customerName}!</p>...`
        })
      });
      */

      res.status(200).json({ success: true, message: "Simulação de e-mail enviada com sucesso (ver log do servidor)" });
    } catch (error) {
      console.error("Error in email simulation:", error);
      res.status(500).json({ success: false, error: "Erro ao processar e-mail" });
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

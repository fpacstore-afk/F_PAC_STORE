import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";

import { Resend } from 'resend';
import { MercadoPagoConfig, Payment } from 'mercadopago';
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
    const env = process.env as any;
    
    // Log available keys (masked for security)
    const allKeys = Object.keys(env);
    const mpKeys = allKeys.filter(k => k.includes('MP_') || k.includes('MERCADO'));
    console.log("🔍 [DEBUG] Buscando Mercado Pago nos Secrets. Chaves encontradas:", mpKeys);

    // 1. SEARCH FOR ACCESS TOKEN
    const foundTokenKey = allKeys.find(k => 
      (k.toUpperCase().includes('MP_ACCESS') || k.toUpperCase().includes('MERCADOPAGO_ACCESS') || k.toUpperCase() === 'MP_TOKEN') && 
      env[k]?.trim().length > 20
    );
    
    let accessToken = (env[foundTokenKey || ''] || 
                       process.env.MP_ACCESS_TOKEN || 
                       process.env.MERCADOPAGO_ACCESS_TOKEN ||
                       process.env.MP_TOKEN || "").trim();
    
    // DETECÇÃO DE TROCA DE CHAVES
    if (accessToken.startsWith('APP_USR-') && accessToken.includes('TEST-')) {
       console.error("🚨 [ERRO CRÍTICO] O Access Token parece conter uma mistura de PROD e TEST.");
    }
    
    // Se o token começar com public key pattern (ex: APP_USR-xxxx) e for muito curto, avisar
    if (accessToken.length > 0 && accessToken.length < 30) {
       console.error("🚨 [ALERTA] O Access Token é suspeitamente curto. Você pode ter colado a Public Key no lugar do Access Token.");
    }
    
    if (!accessToken || accessToken.length < 20) {
      console.error("❌ MP_ACCESS_TOKEN ausente ou muito curto nos Secrets.");
      console.log("Dica: Adicione MP_ACCESS_TOKEN nos Secrets e REINICIE o servidor.");
      throw new Error("Servidor não configurado para pagamentos (Access Token ausente).");
    }

    // 2. SEARCH FOR PUBLIC KEY
    const foundPublicKeyKey = allKeys.find(k => 
      (k.toUpperCase().includes('MP_PUBLIC') || k.toUpperCase().includes('MP_CHAVE_P') || k.toUpperCase() === 'VITE_MP_PUBLIC_KEY') && 
      env[k]?.trim().length > 10
    );
    
    let publicKey = (env[foundPublicKeyKey || ''] || 
                     process.env.VITE_MP_PUBLIC_KEY || 
                     process.env.MP_PUBLIC_KEY || "").trim();
    
    if (publicKey && accessToken) {
      const tokenIsTest = accessToken.startsWith('TEST-');
      const keyIsTest = publicKey.startsWith('TEST-');
      
      console.log(`🔍 [MP CHECK] Token is ${tokenIsTest ? 'TEST' : 'PROD'}. Key is ${keyIsTest ? 'TEST' : 'PROD'}.`);

      if (tokenIsTest !== keyIsTest) {
        console.warn(`🚨 [MP MISMATCH] Token e Key de ambientes diferentes! Isso VAI causar erro 'invalid access token'.`);
      }
    }

    const maskedToken = accessToken.substring(0, 10) + "..." + accessToken.substring(accessToken.length - 5);
    console.log(`✅ Mercado Pago configurado. Token detectado: ${maskedToken}`);
    console.log(`✅ Modo detectado: ${accessToken.startsWith('TEST-') ? 'TESTE' : 'PRODUÇÃO'}`);
    mpClient = new MercadoPagoConfig({ accessToken });
  }
  return mpClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use CORS to allow requests from the custom domain
  app.use(cors());
  app.options("*", cors()); // Handle preflight

  app.use(express.json());

  console.log("🚀 [SERVER] Iniciando... Verificando Secrets...");
  
  const mpToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_TOKEN;
  const mpPublic = process.env.VITE_MP_PUBLIC_KEY || process.env.MP_PUBLIC_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  console.log(`🔑 MERCADO PAGO ACCESS TOKEN: ${mpToken ? `PRESENTE ✅ (Inicia com: ${mpToken.substring(0, 8)}...)` : 'AUSENTE ❌'}`);
  console.log(`🔑 MERCADO PAGO PUBLIC KEY: ${mpPublic ? `PRESENTE ✅ (Inicia com: ${mpPublic.substring(0, 8)}...)` : 'AUSENTE ❌'}`);
  console.log(`🔑 RESEND API KEY: ${resendKey ? `PRESENTE ✅ (Inicia com: ${resendKey.substring(0, 8)}...)` : 'AUSENTE ❌'}`);
  
  if (mpToken && mpPublic && mpToken === mpPublic) {
    console.error("🚨 [ALERTA] Access Token e Public Key são IGUAIS! Isso está incorreto e impedirá o checkout.");
  }

  // Log all requests for debugging (especially 405 errors)
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) {
      console.log(`📡 [API DEBUG] ${req.method} ${req.url}`);
    }
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    const mpToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_TOKEN;
    const mpPublic = process.env.VITE_MP_PUBLIC_KEY || process.env.MP_PUBLIC_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    
    // Diagnostic logic
    let mpStatus = "ok";
    let mpMessage = "Configurado corretamente.";
    
    if (!mpToken || mpToken.length < 20) {
      mpStatus = "error";
      mpMessage = "Access Token ausente ou inválido.";
    } else if (!mpPublic || mpPublic.length < 10) {
      mpStatus = "warning";
      mpMessage = "Public Key ausente (isso impede o checkout no navegador).";
    } else {
      const tokenIsTest = mpToken.trim().startsWith('TEST-');
      const keyIsTest = mpPublic.trim().startsWith('TEST-');
      
      if (tokenIsTest !== keyIsTest) {
        mpStatus = "error";
        mpMessage = `Mismatch de Ambiente: O Token é de ${tokenIsTest ? 'TESTE' : 'PRODUÇÃO'} mas a Public Key é de ${keyIsTest ? 'TESTE' : 'PRODUÇÃO'}. Elas devem ser do mesmo ambiente.`;
      } else if (mpToken === mpPublic) {
        mpStatus = "error";
        mpMessage = "Access Token e Public Key são idênticos! Você provavelmente colou a mesma chave nos dois segredos.";
      }
    }

    res.json({ 
      status: "ok", 
      mp_diagnostics: {
        status: mpStatus,
        message: mpMessage,
        is_test_mode: mpToken?.startsWith('TEST-')
      },
      resend_configured: !!resendKey && resendKey.length > 10,
      mode: process.env.NODE_ENV,
      node_version: process.version
    });
  });

  app.get("/api/test-email-simple", async (req, res) => {
    try {
      const { email } = req.query;
      const target = (email as string) || 'fpacstore@gmail.com';
      console.log(`📧 [TESTE] Tentando enviar e-mail direto para ${target}`);
      
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new Error("RESEND_API_KEY ausente nos Secrets.");
      
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: 'F PAC STORE <atendimento@fpacstore.com.br>',
        to: [target],
        subject: 'Teste de Conexão - F PAC STORE',
        html: '<div style="font-family: sans-serif; padding: 40px; border: 1px solid #eee; border-radius: 8px;">' +
              '<h1 style="color: #000;">Teste de Sistema ✅</h1>' +
              '<p>Se você está lendo isso, sua configuração do <strong>Resend</strong> está correta e pronta para enviar notificações de pedidos.</p>' +
              '<p style="color: #666; font-size: 12px; margin-top: 20px;">Enviado em: ' + new Date().toLocaleString() + '</p>' +
              '</div>'
      });
      
      if (error) {
        console.error("❌ [RESEND ERROR]:", error);
        throw error;
      }
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("❌ Erro no teste de e-mail:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get Public Key for Frontend fallback
  app.get("/api/payment-config", (req, res) => {
    console.log("📡 [API] Solicitando configuração de pagamento...");
    const env = process.env as any;
    const allKeys = Object.keys(env);
    
    // Fallback detection (same logic as getMPClient)
    const foundPublicKeyKey = allKeys.find(k => 
      (k.toUpperCase().includes('MP_PUBLIC') || k.toUpperCase().includes('MP_CHAVE_P')) && 
      env[k]?.length > 10
    );
    
    const publicKey = env[foundPublicKeyKey || ''] || 
                     process.env.VITE_MP_PUBLIC_KEY || 
                     process.env.MP_PUBLIC_KEY;
    
    if (publicKey) {
      console.log(`✅ [API] Chave pública encontrada. Comprimento: ${publicKey.length} | Início: ${publicKey.substring(0, 10)}... (Origem: ${foundPublicKeyKey || 'Config'})`);
    } else {
      console.warn("⚠️ [API] Chave pública NÃO encontrada nos Secrets.");
    }
    
    res.json({ publicKey: publicKey || null });
  });

  // ==========================================
  // FLUXO DE E-MAIL (RESEND)
  // ==========================================
  app.post("/api/send-confirmation", async (req, res) => {
    console.log(`📥 [API] Chamada recebida POST /api/send-confirmation`);
    try {
      const { email, customerName, orderId, items, totals, status, address, paymentMethod, paymentLink: rawPaymentLink } = req.body;
      
      const paymentLink = rawPaymentLink || '';
      
      if (!email || !orderId) {
        return res.status(400).json({ success: false, error: "Email e OrderId são obrigatórios." });
      }

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.error("❌ [EMAIL] RESEND_API_KEY ausente nos Secrets.");
        return res.json({ success: false, error: "Servidor de e-mail não configurado (RESEND_API_KEY ausente)." });
      }

      console.log(`📧 [EMAIL] Iniciando envio para ${email} (Pedido #${orderId}, Status: ${status})`);

      let subject = `✅ Recebemos seu Pedido #${orderId} - F PAC STORE`;
      let message = `Recebemos seu pedido com sucesso! Estamos aguardando a confirmação do pagamento para iniciar a produção das suas peças exclusivas.`;
      let buttonText = "ACOMPANHAR PEDIDO";

      if (status === 'approved' || status === 'validated') {
        subject = `🎉 Pagamento Confirmado! Pedido #${orderId} - F PAC STORE`;
        message = `Seu pagamento foi confirmado com sucesso! Já estamos iniciando o processo de separação e produção do seu pedido.`;
      } else if (status === 'processing') {
        subject = `🛠️ Seu Pedido #${orderId} está em Produção! - F PAC STORE`;
        message = `Ótimas notícias! Seu pedido já está sendo preparado com todo cuidado pela nossa equipe. Em breve ele estará pronto para ser enviado.`;
      } else if (status === 'shipped') {
        subject = `🚀 Seu Pedido #${orderId} foi Enviado! - F PAC STORE`;
        message = `Seu pedido já está a caminho! Em breve você estará com suas novas peças F PAC STORE em mãos. Aproveite para renovar sua identidade.`;
        buttonText = "RASTREAR PEDIDO";
      } else if (status === 'delivered') {
        subject = `🙌 Pedido #${orderId} Entregue! - F PAC STORE`;
        message = `Seu pedido foi entregue! Esperamos que curta muito sua nova identidade. Não esqueça de nos marcar no Instagram @f_pac_store!`;
        buttonText = "VER PEDIDO";
      } else if (status === 'cancelled') {
        subject = `❌ Pedido #${orderId} Cancelado - F PAC STORE`;
        message = `Seu pedido foi cancelado. Se você não solicitou o cancelamento ou tem alguma dúvida, entre em contato conosco pelo WhatsApp.`;
      }
      
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

      console.log(`🚀 Preparando envio para: ${email} | Assunto: ${subject} | De: atendimento@fpacstore.com.br`);

      const resend = getResend();
      const { data, error } = await resend.emails.send({
        from: 'F PAC STORE <atendimento@fpacstore.com.br>',
        to: [email.trim()],
        replyTo: 'fpacstore@gmail.com',
        subject: subject,
        html: `
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
                  <p style="margin: 0 0 15px 0; font-size: 13px; font-weight: bold; color: #854d0e; text-transform: uppercase; letter-spacing: 1px;">Ainda não concluiu o pagamento?</p>
                  <a href="${paymentLink}" style="display: inline-block; background: #eab308; color: #000; text-align: center; padding: 18px 35px; text-decoration: none; font-weight: 900; border-radius: 4px; text-transform: uppercase; letter-spacing: 2px; font-size: 14px; box-shadow: 0 4px 12px rgba(234, 179, 8, 0.3);">
                    EFETUAR PAGAMENTO AGORA
                  </a>
                  <p style="margin: 15px 0 0 0; font-size: 10px; color: #a16207;">Válido para PIX ou Cartão de Crédito</p>
                </div>
                ` : ''}

                <div style="margin: 0; padding: 0;">
                  <h3 style="margin-top: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; color: #000; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px;">Detalhes do Pedido #${orderId}</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                      <tr>
                        <th style="text-align: left; font-size: 10px; text-transform: uppercase; color: #aaa; padding-bottom: 12px; font-weight: 900;">Item / Descrição</th>
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
                        <td style="padding: 6px 0; color: #777; text-transform: uppercase; letter-spacing: 1px; font-size: 11px; font-weight: bold;">Subtotal</td>
                        <td style="padding: 6px 0; text-align: right; color: #333; font-weight: bold;">R$ ${(totals.subtotal || (totals.finalTotal + (totals.discount || 0) - (totals.frete || 0))).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #777; text-transform: uppercase; letter-spacing: 1px; font-size: 11px; font-weight: bold;">Frete Joinville</td>
                        <td style="padding: 6px 0; text-align: right; color: #333; font-weight: bold;">${totals.frete > 0 ? `R$ ${totals.frete.toFixed(2)}` : 'GRÁTIS'}</td>
                      </tr>
                      ${totals.discount > 0 ? `
                      <tr>
                        <td style="padding: 6px 0; color: #eab308; text-transform: uppercase; letter-spacing: 1px; font-size: 11px; font-weight: 900;">Desconto Aplicado</td>
                        <td style="padding: 6px 0; text-align: right; color: #eab308; font-weight: 900;">- R$ ${totals.discount.toFixed(2)}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 20px 0 0 0; font-size: 14px; text-transform: uppercase; color: #000; font-weight: 900; border-top: 2px solid #000; letter-spacing: 1px;">Valor Total</td>
                        <td style="padding: 20px 0 0 0; text-align: right; font-size: 26px; color: #000; font-weight: 900; border-top: 2px solid #000;">R$ ${totals.finalTotal.toFixed(2)}</td>
                      </tr>
                    </table>
                  </div>
                </div>

                <div style="margin-top: 25px;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="width: 50%; padding-right: 10px; vertical-align: top;">
                        ${address ? `
                        <div style="padding: 20px; background: #fff; border: 1px solid #f0f0f0; border-radius: 12px; min-height: 140px;">
                          <h4 style="margin: 0 0 12px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #aaa; font-weight: 900;">Entrega em:</h4>
                          <p style="margin: 0; font-size: 13px; color: #333; line-height: 1.6; font-weight: 500;">
                            ${address.street}, ${address.number}<br>
                            ${address.complement ? address.complement + '<br>' : ''}
                            ${address.neighborhood}<br>
                            ${address.city}/${address.state}<br>
                            <span style="font-weight: 900; color: #000;">CEP ${address.cep}</span>
                          </p>
                        </div>
                        ` : ''}
                      </td>
                      <td style="width: 50%; padding-left: 10px; vertical-align: top;">
                        ${paymentMethod ? `
                        <div style="padding: 20px; background: #fff; border: 1px solid #f0f0f0; border-radius: 12px; min-height: 140px;">
                          <h4 style="margin: 0 0 12px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #aaa; font-weight: 900;">Pagamento:</h4>
                          <p style="margin: 0; font-size: 15px; color: #000; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">
                            ${paymentMethod}
                          </p>
                          <div style="margin-top: 15px; font-size: 10px; color: #888; font-style: italic;">
                            ${status === 'pending' ? 'Aguardando confirmação' : 'Confirmado com sucesso'}
                          </div>
                        </div>
                        ` : ''}
                      </td>
                    </tr>
                  </table>
                </div>
                
                <div style="margin-top: 50px; text-align: center;">
                  <a href="${paymentLink}" style="display: inline-block; background: #000; color: #fff; text-align: center; padding: 22px 50px; text-decoration: none; font-weight: 900; border-radius: 4px; text-transform: uppercase; letter-spacing: 3px; font-size: 14px; box-shadow: 0 15px 35px rgba(0,0,0,0.15);">
                    ${buttonText}
                  </a>
                  <p style="margin-top: 25px;">
                    <a href="${paymentLink}" style="color: #bbb; font-size: 10px; text-decoration: underline; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">Acessar painel do pedido</a>
                  </p>
                </div>
                
                <div style="margin-top: 60px; padding-top: 40px; border-top: 1px solid #f0f0f0; text-align: center;">
                  <p style="margin-bottom: 12px; font-size: 15px; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 1px;">Central de Atendimento</p>
                  <p style="margin: 0; font-size: 13px; color: #666; line-height: 1.6;">
                    Qualquer dúvida, fale com nosso time pelo WhatsApp:<br>
                    <a href="https://wa.me/5547997465602" style="color: #eab308; font-weight: 900; text-decoration: none; font-size: 18px; letter-spacing: -0.5px;">(47) 99746-5602</a>
                  </p>
                </div>
              </div>
              
              <div style="background: #000; padding: 40px; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #fff; text-transform: uppercase; letter-spacing: 4px; font-weight: 900;">
                  NÃO É SÓ ROUPA, É IDENTIDADE
                </p>
                <div style="margin-top: 20px; font-size: 9px; color: #444; letter-spacing: 1px; text-transform: uppercase; font-weight: bold;">
                  &copy; 2024 F PAC STORE.Joinville/SC.
                </div>
              </div>
            </div>
            
            <p style="margin-top: 30px; font-size: 10px; color: #ccc; text-align: center; line-height: 1.7; text-transform: uppercase; letter-spacing: 1px;">
              Este é um e-mail automático. Não responda.<br>
              F PAC STORE - Estúdio de Identidade e Atitude.
            </p>
          </div>
        `
      });

      if (error) {
        console.error("❌ [E-MAIL] Resend Error:", error);
        return res.status(400).json({ success: false, error });
      }

      console.log("✅ [E-MAIL] Sucesso:", data);
      res.json({ success: true, data });
    } catch (error: any) {
      console.error(`❌ [API] Erro CRÍTICO no envio de e-mail (Resend):`, error);
      
      const errorMessage = error.response?.data || error.message || String(error);
      console.error(`📄 [API] Detalhes do erro Resend:`, JSON.stringify(errorMessage));
      
      res.status(500).json({ 
        success: false, 
        error: "Erro ao enviar e-mail de confirmação.", 
        details: errorMessage 
      });
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
        from: 'F PAC STORE <atendimento@fpacstore.com.br>',
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
    console.log("💳 [API] Recebendo tentativa de pagamento...");
    try {
      let client;
      try {
        client = getMPClient();
      } catch (configErr: any) {
        return res.status(500).json({ 
          message: "Configuração de pagamento inválida", 
          error: configErr.message 
        });
      }
      
      const payment = new Payment(client);
      const { formData } = req.body;
      const orderId = formData.external_reference || null;

      console.log(`💳 Iniciando processamento de pagamento (${formData.payment_method_id}) para: ${formData.payer.email}. Pedido: ${orderId}...`);
      
      // Build request body carefully
      const amount = Number(formData.transaction_amount);
      
      console.log(`💳 [MP] Preparando payload para ${formData.payment_method_id}. Valor: R$ ${amount.toFixed(2)}`);

      const body: any = {
        transaction_amount: amount,
        description: formData.description || `Pedido F PAC STORE`,
        payment_method_id: formData.payment_method_id,
        external_reference: orderId,
        payer: {
          email: formData.payer.email,
          identification: {
            type: formData.payer.identification.type,
            number: formData.payer.identification.number,
          },
        },
      };

      // Dinamic notification URL
      const host = req.get('host');
      const protocol = req.protocol;
      const baseUrl = `${protocol}://${host}`;
      
      if (!host.includes('localhost')) {
        body.notification_url = `${baseUrl}/api/webhooks/mercadopago`;
        console.log(`🔔 [MP] Notification URL: ${body.notification_url}`);
      }

      // If not PIX, it's card, needs Token and Installments
      if (formData.payment_method_id !== 'pix') {
        body.token = formData.token;
        body.installments = Number(formData.installments);
        if (formData.issuer_id) {
          body.issuer_id = Number(formData.issuer_id);
        }
      }

      console.log("📡 [MP] Enviando requisição para API do Mercado Pago...");
      const paymentResponse = await payment.create({ body });
      console.log(`✅ [MP] Resposta recebida! Status: ${paymentResponse.status} | ID: ${paymentResponse.id}`);

      res.status(201).json({
        id: paymentResponse.id,
        status: paymentResponse.status,
        status_detail: paymentResponse.status_detail,
        qr_code: paymentResponse.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: paymentResponse.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: paymentResponse.point_of_interaction?.transaction_data?.ticket_url,
      });
    } catch (error: any) {
      console.error("❌ [MP ERROR] Erro bruto:", error);
      
      let errorDetail = "Erro ao processar pagamento";
      let mpCode = "";

      if (error.cause && Array.isArray(error.cause)) {
        errorDetail = error.cause.map((c: any) => c.description || c.code).join(', ');
        mpCode = error.cause[0]?.code || "";
      } else if (error.message) {
        errorDetail = error.message;
      }

      // Se o erro for 'invalid_access_token', damos uma dica clara
      if (errorDetail.includes('access_token') || mpCode === 'invalid_access_token') {
         errorDetail = "Token de Acesso Inválido (MP). Verifique se você não inverteu Public Key com Access Token nos Secrets.";
      }
      
      console.error("📄 Detalhes do erro formatados:", errorDetail);
      if (error.cause) console.error("   Cause full:", JSON.stringify(error.cause));
      
      res.status(400).json({ 
        message: "Erro ao processar pagamento", 
        error: errorDetail
      });
    }
  });

  // Mercado Pago Webhook Route
  app.post("/api/webhooks/mercadopago", async (req, res) => {
    const { action, type, data } = req.body;
    
    console.log(`🔔 [WEBHOOK] Payload recebido:`, JSON.stringify(req.body));
    console.log(`🔔 [WEBHOOK] Recebido action: ${action}, type: ${type}`);
    
    if (type === 'payment' && data?.id) {
      try {
        const client = getMPClient();
        const payment = new Payment(client);
        
        console.log(`🔍 [WEBHOOK] Buscando dados do pagamento no Mercado Pago: ${data.id}`);
        const paymentData = await payment.get({ id: data.id });
        const orderId = paymentData.external_reference;
        const status = paymentData.status; // approved, pending, rejected, etc.
        
        console.log(`🔔 [WEBHOOK] Pedido: ${orderId} | Status: ${status} | MP ID: ${data.id}`);
        
        if (orderId) {
          const orderRef = dbAdmin.collection('orders').doc(orderId);
          const orderSnap = await orderRef.get();
          
          if (orderSnap.exists) {
            const currentStatus = orderSnap.data()?.status;
            
            // Map MP status to App status
            let newAppStatus = 'pending';
            if (status === 'approved') newAppStatus = 'validated';
            else if (status === 'cancelled' || status === 'rejected' || status === 'refunded') newAppStatus = 'cancelled';
            
            console.log(`📝 [WEBHOOK] Status Atual: ${currentStatus} -> Novo Status sugerido: ${newAppStatus}`);

            const updateData: any = {
              paymentStatus: status,
              paymentId: String(data.id),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            // Se o pagamento for aprovado, validamos o pedido
            if (status === 'approved') {
              updateData.status = 'validated';
            } else if (status === 'cancelled' || status === 'rejected') {
              // Só cancelamos se o pedido ainda estiver pendente (evita cancelar pedidos já em produção)
              if (currentStatus === 'pending') {
                updateData.status = 'cancelled';
              }
            }
            
            await orderRef.update(updateData);
            console.log(`✅ [WEBHOOK] Pedido ${orderId} atualizado com sucesso no Firestore.`);
          } else {
            console.warn(`⚠️ [WEBHOOK] Pedido ${orderId} não encontrado no Firestore.`);
          }
        }
      } catch (error) {
        console.error("❌ [WEBHOOK] Erro ao processar webhook:", error);
      }
    }
    
    // Always return 200 to MP
    res.sendStatus(200);
  });

  // Garantir que rotas de API que não existem respondam JSON (evita o erro do token '<')
  app.all("/api/*", (req, res) => {
    console.warn(`⚠️ [API] Rota não encontrada: ${req.method} ${req.url}`);
    res.status(404).json({ success: false, error: `A rota ${req.url} não foi encontrada no servidor.` });
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

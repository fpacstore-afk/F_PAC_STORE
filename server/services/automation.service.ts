import { getDb } from "../firebase.js";
import admin from "firebase-admin";
import { Resend } from "resend";
import axios from "axios";
import { logger } from "../utils/logger.js";

export interface CheckoutLead {
  id: string; // Checkout Session ID
  customer_name: string;
  email: string;
  phone: string;
  cep: string;
  cart_items: any[];
  total: number;
  checkout_session_id: string;
  payment_status: string; // pending, approved, cancelled
  recovery_status: string; // pending, abandoned, recovered, failed
  recovery_attempts: number;
  created_at?: any;
  updated_at?: any;
  last_interaction: string;
  // Extra fields for shipping
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

/**
 * Log Helper for Automation Activity
 */
export async function logAutomationEvent(
  event: 'checkout.abandoned' | 'payment.approved' | 'order.shipped' | 'customer.recovered' | 'whatsapp.sent' | 'email.sent' | 'lead.saved' | 'lead.updated' | 'production.stage_notification' | string,
  type: 'info' | 'warn' | 'error' | 'success' | 'warning',
  message: string,
  target: string
) {
  try {
    const db = getDb();
    const logId = `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    await db.collection('automation_logs').doc(logId).set({
      id: logId,
      event,
      type,
      message,
      target,
      timestamp: admin.firestore.FieldValue.serverTimestamp() || new Date().toISOString()
    });
    logger.info(`🤖 [AUTOMATION LOG] [${event.toUpperCase()}] ${message} (${target})`);

    // n8n integration hook
    const n8nWebhook = process.env.N8N_WEBHOOK_URL;
    if (n8nWebhook) {
      axios.post(n8nWebhook, {
        id: logId,
        event,
        type,
        message,
        target,
        timestamp: new Date().toISOString()
      }).catch(e => logger.warn(`[N8N-HOOK-ERR] ${e.message}`));
    }
  } catch (error: any) {
    logger.error(`❌ [AUTOMATION-LOG-ERR] Failed to write log: ${error.message}`);
  }
}

/**
 * Saves a checkout lead. Updates existing ones using idempotency key (checkout_session_id).
 */
export async function saveCheckoutLead(lead: Partial<CheckoutLead>) {
  if (!lead.checkout_session_id) {
    throw new Error("checkout_session_id is required");
  }

  const db = getDb();
  const docRef = db.collection('abandoned_checkouts').doc(lead.checkout_session_id);

  try {
    await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      const now = admin.firestore.FieldValue.serverTimestamp();

      if (!docSnap.exists) {
        // Create new
        const newLead: CheckoutLead = {
          id: lead.checkout_session_id!,
          customer_name: lead.customer_name || 'Cliente Sem Nome',
          email: lead.email || '',
          phone: lead.phone || '',
          cep: lead.cep || '',
          cart_items: lead.cart_items || [],
          total: lead.total || 0,
          checkout_session_id: lead.checkout_session_id!,
          payment_status: 'pending',
          recovery_status: 'pending',
          recovery_attempts: 0,
          created_at: now,
          updated_at: now,
          last_interaction: new Date().toISOString(),
          address: lead.address || '',
          number: lead.number || '',
          complement: lead.complement || '',
          neighborhood: lead.neighborhood || '',
          city: lead.city || 'Joinville',
          state: lead.state || 'SC',
        };
        transaction.set(docRef, newLead);
        
        // Log asynchronously outside transaction or schedule it
      } else {
        // Update existing only if payment_status is not approved
        const currentData = docSnap.data() as CheckoutLead;
        if (currentData.payment_status === 'approved' || currentData.recovery_status === 'recovered') {
          return; // Skip updates for already purchased carts
        }

        const updatedFields: Partial<CheckoutLead> = {
          updated_at: now,
          last_interaction: new Date().toISOString()
        };

        if (lead.customer_name) updatedFields.customer_name = lead.customer_name;
        if (lead.email) updatedFields.email = lead.email;
        if (lead.phone) updatedFields.phone = lead.phone;
        if (lead.cep) updatedFields.cep = lead.cep;
        if (lead.cart_items) updatedFields.cart_items = lead.cart_items;
        if (lead.total !== undefined) updatedFields.total = lead.total;
        if (lead.address) updatedFields.address = lead.address;
        if (lead.number) updatedFields.number = lead.number;
        if (lead.complement) updatedFields.complement = lead.complement;
        if (lead.neighborhood) updatedFields.neighborhood = lead.neighborhood;
        if (lead.city) updatedFields.city = lead.city;
        if (lead.state) updatedFields.state = lead.state;

        transaction.update(docRef, updatedFields);
      }
    });

    const action = lead.customer_name ? 'lead.updated' : 'lead.saved';
    const cleanEmail = lead.email || 'Checkout Iniciado';
    await logAutomationEvent(
      action as any,
      'info',
      `Lead de checkout atualizado: ${lead.customer_name || 'Sem nome'} - R$ ${lead.total?.toFixed(2)}`,
      cleanEmail
    );

    return { success: true };
  } catch (error: any) {
    logger.error(`❌ [SAVE-LEAD-ERR] ${error.message}`);
    throw error;
  }
}

/**
 * Service to execute professional WhatsApp messages via Evolution API or custom webhook
 */
export async function sendWhatsAppMessage(phone: string, type: 'payment_approved' | 'abandoned_60m' | 'abandoned_24h' | 'order_shipped' | 'manual_order_pending' | 'custom_message', payload: any) {
  try {
    const cleanPhone = String(phone).replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 10) {
      logger.warn(`⚠️ [WHATSAPP] Phone number ${phone} is invalid. Skipping.`);
      return false;
    }

    // Append 55 for Brazil if not present
    const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    // Get Messages Templates requested by the user
    let content = "";
    const name = String(payload?.customerName || payload?.customer_name || payload?.name || "Cliente").split(" ")[0].toUpperCase();
    const orderId = payload?.id ? `#${payload.id}` : "";

    if (type === 'custom_message') {
      content = payload?.customMessage || payload?.message || '';
    } else {
      switch (type) {
        case 'payment_approved':
          content = `✅ *PAGAMENTO CONFIRMADO!* ✅\n\nSeu pagamento do pedido *${orderId}* foi aprovado com sucesso! 🎉\n\nNossa equipe já foi acionada e suas peças entraram em nossa linha de produção para serem preparadas com todo o carinho.`;
          break;
        case 'abandoned_60m':
          content = `🛒 *CARRINHO RESERVADO!* 🛒\n\nVimos que você escolheu peças incríveis com muita atitude e iniciou seu pedido, mas acabou não finalizando o checkout.\nReservamos os itens temporariamente no nosso estoque para você não perder! Garanta suas peças oficiais da F PAC STORE no link seguro abaixo:\n\n👉CONCLUIR COM SEGURANÇA:\nhttps://www.fpacstore.com.br/catalog`;
          break;
        case 'abandoned_24h':
          content = `⚠️ *ÚLTIMAS HORAS DISPONÍVEIS!* ⚠️\n\nPassando para lembrar que os itens que você separou continuam reservados, mas nosso estoque é extremamente limitado e está esgotando. 🔥\n\nGaranta as suas peças originais da F PAC STORE no link seguro abaixo:\n\n👉FINALIZAR SEU CHECKOUT AGORA:\nhttps://www.fpacstore.com.br/catalog`;
          break;
        case 'order_shipped':
          const tracking = payload?.trackingCode || payload?.trackingUrl || "Acompanhamento pendente";
          content = `🚀 *SEU PEDIDO FOI ENVIADO!* 🚀\n\nExcelente notícia: seu pedido *${orderId}* já foi despachado e está a caminho de sua casa para trazer o máximo de estilo e identidade! 📦\n\n📊 *DADOS DE RASTREIO E ENVIO:*\nCódigo/Link de Rastreio: \`${tracking}\``;
          break;
        case 'manual_order_pending':
          content = `Seu pedido *${orderId}* foi gerado com sucesso pela equipe da *F PAC*.\n\n📋 *Status atual:* Aguardando Pagamento.\n\nAssim que o pagamento for confirmado, seu pedido seguirá automaticamente para produção.\n\nCaso tenha qualquer dúvida, nossa equipe está à disposição.\n\nObrigado por escolher a *F PAC*! 🖤💛`;
          break;
      }
    }

    const message = type === 'custom_message' 
      ? content 
      : `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nFala ${name}!\n\n${content}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🌟CANAIS OFICIAIS F PAC STORE:\n🌐 Site Oficial:www.fpacstore.com.br\n📸 Instagram: @f_pac_store\n💬 WhatsApp Oficial: (47) 99746-5602\n📍 Loja/Expedição em Joinville/SC\n🛡️Esta é uma mensagem automática de suporte e acompanhamento de pedido.`;

    // Send using Evolution API if environment is configured
    const apiUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE || 'F_PAC_STORE';

    let sentReal = false;
    if (apiUrl && apiKey) {
      try {
        const endpoint = `${apiUrl.replace(/\/$/, "")}/message/sendText/${instance}`;
        logger.info(`📡 [WHATSAPP-EVOLUTION] Sending message to ${formattedPhone}...`);
        const response = await axios.post(
          endpoint,
          {
            number: formattedPhone,
            options: {
              delay: 1200,
              presence: "composing",
              linkPreview: true
            },
            textMessage: {
              text: message
            }
          },
          {
            headers: {
              "Content-Type": "application/json",
              "apikey": apiKey
            }
          }
        );
        logger.info(`✅ [WHATSAPP-EVOLUTION] Message status: ${response.status}`);
        sentReal = true;
      } catch (err: any) {
        logger.error(`❌ [WHATSAPP-EVOLUTION-ERR] Failed: ${err.response?.data?.message || err.message}`);
      }
    }

    // Always log event to audit database for CRM logs and automation panel!
    await logAutomationEvent(
      'whatsapp.sent',
      sentReal ? 'success' : 'info',
      `WhatsApp (${type}) ${sentReal ? 'enviado de forma automática' : 'simulado / pronto'} para ${phone}`,
      phone
    );

    return true;
  } catch (error: any) {
    logger.error(`❌ [WHATSAPP-ERR] ${error.message}`);
    return false;
  }
}

/**
 * Sends a highly stylized professional recovery email using Resend
 */
export async function sendAbandonedEmail(checkout: CheckoutLead) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.warn("⚠️ [RESEND] API token not configured. Skipping recovery email.");
    return false;
  }

  if (!checkout.email) return false;

  try {
    const resend = new Resend(key);
    const trackingUrl = `https://fpacstore.com.br/bag`;

    const itemsHtml = checkout.cart_items?.map((item: any) => `
      <tr>
        <td style="padding: 15px 0; border-bottom: 1px solid #222;">
          <span style="color: #fff; font-size: 13px; font-weight: 700; text-transform: uppercase; display: block; letter-spacing: 1px;">${item.name}</span>
          ${item.size ? `<span style="color: #666; font-size: 11px; text-transform: uppercase;">TAMANHO: ${item.size}</span>` : ''}
        </td>
        <td align="center" style="padding: 15px 0; color: #fff; font-size: 13px; font-weight: 700; border-bottom: 1px solid #222;">${item.quantity}</td>
        <td align="right" style="padding: 15px 0; color: #fff; font-size: 13px; font-weight: 700; border-bottom: 1px solid #222;">R$ ${Number(item.price || 0).toFixed(2)}</td>
      </tr>
    `).join('') || '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
      </head>
      <body style="margin: 0; padding: 0; background-color: #000; font-family: sans-serif;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #000;">
              <tr>
                  <td align="center" style="padding: 40px 0;">
                      <table border="0" cellpadding="0" cellspacing="0" width="600" style="border: 1px solid #1a1a1a; background-color: #050505;">
                          <!-- Header -->
                          <tr>
                              <td align="center" style="padding: 40px 0;">
                                  <h1 style="color: #fff; margin: 0; letter-spacing: 4px; font-weight: 900; font-style: italic; font-size: 24px;">F <span style="color: #f7c600;">PAC</span> STORE</h1>
                              </td>
                          </tr>

                          <!-- Title -->
                          <tr>
                              <td style="padding: 0 40px; text-align: center;">
                                  <h2 style="color: #f7c600; font-size: 30px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: -1px; line-height: 1;">SEU CARRINHO ESTÁ RESERVADO!</h2>
                                  <p style="color: #666; font-size: 10px; letter-spacing: 3px; margin: 15px 0 0; text-transform: uppercase;">ID DO CHECKOUT: #${checkout.id}</p>
                              </td>
                          </tr>

                          <!-- Body -->
                          <tr>
                              <td style="padding: 40px; color: #fff; line-height: 1.6; font-size: 14px;">
                                  Olá, <strong>${checkout.customer_name}</strong>!<br><br>
                                  Vimos que você adicionou itens incríveis à sua sacola, mas não concluiu seu pedido. 
                                  As peças da <strong>F PAC STORE</strong> trazem autenticidade e são produzidas com estoque limitado.<br><br>
                                  Garantimos a reserva de suas peças por mais um tempo limitado. Aproveite para finalizar agora e garantir seu cupom <strong>FPAC14 (5% de desconto EXTRA)</strong>.
                              </td>
                          </tr>

                          <!-- Items Table -->
                          <tr>
                              <td style="padding: 0 40px;">
                                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #222;">
                                      <tr>
                                          <td style="padding: 15px 0; color: #444; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px;">PRODUTO</td>
                                          <td align="center" style="padding: 15px 0; color: #444; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px;">QTD</td>
                                          <td align="right" style="padding: 15px 0; color: #444; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px;">PREÇO</td>
                                      </tr>
                                      ${itemsHtml}
                                  </table>
                              </td>
                          </tr>

                          <!-- Totals -->
                          <tr>
                              <td style="padding: 30px 40px;">
                                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                      <tr>
                                          <td width="50%"></td>
                                          <td width="50%" align="right">
                                              <p style="color: #666; margin: 0 0 5px; font-size: 12px;">Total Estimado</p>
                                              <p style="color: #f7c600; margin: 0; font-size: 24px; font-weight: 900;">R$ ${(checkout.total || 0).toFixed(2)}</p>
                                          </td>
                                      </tr>
                                  </table>
                              </td>
                          </tr>

                          <!-- CTA -->
                          <tr>
                              <td align="center" style="padding: 20px 40px 60px;">
                                  <a href="${trackingUrl}" style="background-color: #f7c600; color: #000; padding: 18px 36px; text-decoration: none; font-weight: 900; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; display: inline-block;">FINALIZAR COMPRA AGORA</a>
                              </td>
                          </tr>

                          <!-- Footer -->
                          <tr>
                              <td style="padding: 40px; background-color: #000; text-align: center; border-top: 1px solid #1a1a1a;">
                                  <p style="color: #333; font-size: 9px; letter-spacing: 2px; margin: 0; text-transform: uppercase;">&copy; FPAC STORE. AUTHENTIC STREETWEAR & IDENTITY.</p>
                              </td>
                          </tr>
                      </table>
                  </td>
              </tr>
          </table>
      </body>
      </html>
    `;

    await resend.emails.send({
      from: 'F PAC STORE <atendimento@fpacstore.com.br>',
      to: [checkout.email],
      subject: `Não perca suas peças! Carrinho Reservado 🛒`,
      html: htmlContent
    });

    await logAutomationEvent(
      'email.sent',
      'success',
      `E-mail de recuperação de checkout enviado para ${checkout.email}`,
      checkout.email
    );
    return true;
  } catch (error: any) {
    logger.warn(`❌ [EMAIL-RECOVERY-ERR] Failed to send email: ${error.message}`);
    return false;
  }
}

/**
 * Main routine. Identifies abandoned checkouts (no updates in 60 minutes) and sends recovery notifications.
 * Can be run manually or triggered periodically (every 10 minutes).
 */
export async function runAbandonedCheckoutDetector() {
  const db = getDb();
  logger.info("🕒 [ABANDONED-CRON] Running check for inactive checkout leads...");

  try {
    // Checkouts that are 'pending' recovery, 'pending' payment
    const checkoutsQuery = await db.collection('abandoned_checkouts')
      .where('payment_status', '==', 'pending')
      .where('recovery_status', '==', 'pending')
      .get();

    if (checkoutsQuery.empty) {
      logger.info("🕒 [ABANDONED-CRON] No potential checkouts found in queue.");
      return { checked: 0, marked: 0 };
    }

    const now = Date.now();
    const alertThreshold60m = 60 * 60 * 1000; // 60 minutes
    const alertThreshold24h = 24 * 60 * 60 * 1000; // 24 hours
    
    let markedCount = 0;

    for (const doc of checkoutsQuery.docs) {
      const checkout = doc.data() as CheckoutLead;
      
      // Calculate parsed timing
      let updatedTime = now;
      if (checkout.updated_at) {
        updatedTime = checkout.updated_at.toDate ? checkout.updated_at.toDate().getTime() : new Date(checkout.updated_at).getTime();
      } else if (checkout.last_interaction) {
        updatedTime = new Date(checkout.last_interaction).getTime();
      }

      const diffMs = now - updatedTime;

      // Rule: If inactive for > 60 minutes, transition to 'abandoned' status and trigger recovery actions
      if (diffMs >= alertThreshold60m) {
        logger.info(`🚨 [ABANDONED-CRON] Checkout ${checkout.id} inactive for ${Math.round(diffMs / 60000)} minutes. Marking as abandoned.`);
        
        // Mark as abandoned
        await db.collection('abandoned_checkouts').doc(checkout.id).update({
          recovery_status: 'abandoned',
          recovery_attempts: 1,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        markedCount++;

        // Trigger Event Log
        await logAutomationEvent(
          'checkout.abandoned',
          'warn',
          `Abandono detectado: ${checkout.customer_name || 'Cliente'} (${checkout.email || 'Sem email'})`,
          checkout.email || checkout.phone || 'Checkout'
        );

        // Fire Notifications
        if (checkout.phone) {
          await sendWhatsAppMessage(checkout.phone, 'abandoned_60m', checkout);
        }
        if (checkout.email) {
          await sendAbandonedEmail(checkout);
        }
      }
    }

    // Now, also check for checkouts in 'abandoned' status to see if they've hit the 24h milestone (1 day later)
    // and recovery_attempts is exactly 1 (to prevent spam repetition)
    const alert24hQuery = await db.collection('abandoned_checkouts')
      .where('payment_status', '==', 'pending')
      .where('recovery_status', '==', 'abandoned')
      .where('recovery_attempts', '==', 1)
      .get();

    for (const doc of alert24hQuery.docs) {
      const checkout = doc.data() as CheckoutLead;
      let createdTime = now;
      if (checkout.created_at) {
        createdTime = checkout.created_at.toDate ? checkout.created_at.toDate().getTime() : new Date(checkout.created_at).getTime();
      }
      const ageMs = now - createdTime;

      if (ageMs >= alertThreshold24h) {
        logger.info(`⏰ [ABANDONED-CRON] Checkout ${checkout.id} has matured to 24 hours. Triggering stage 2 recovery.`);
        
        await db.collection('abandoned_checkouts').doc(checkout.id).update({
          recovery_attempts: 2,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        if (checkout.phone) {
          await sendWhatsAppMessage(checkout.phone, 'abandoned_24h', checkout);
        }
      }
    }

    logger.info(`🕒 [ABANDONED-CRON] Completed. Inactive leads tagged as abandoned: ${markedCount}`);
    return { checked: checkoutsQuery.docs.length, marked: markedCount };
  } catch (error: any) {
    logger.error(`❌ [ABANDONED-CRON-ERR] CRITICAL CRON FAILURE: ${error.message}`);
    return { error: error.message };
  }
}

/**
 * Handles when payment succeeds for an order related to an abandoned checkout
 */
export async function handleRecoveredCheckout(emailOrPhone: string, checkoutSessionId?: string) {
  const db = getDb();
  try {
    let orderMatchDoc: any = null;

    // Try finding by explicit session ID if provided
    if (checkoutSessionId) {
      const snap = await db.collection('abandoned_checkouts').doc(checkoutSessionId).get();
      if (snap.exists) {
        orderMatchDoc = snap;
      }
    }

    // Direct fallback lookups using email
    if (!orderMatchDoc && emailOrPhone) {
      const snap = await db.collection('abandoned_checkouts')
        .where('email', '==', emailOrPhone)
        .where('payment_status', '==', 'pending')
        .limit(1)
        .get();
        
      if (!snap.empty) {
        orderMatchDoc = snap.docs[0];
      }
    }

    // Direct fallback using phone
    if (!orderMatchDoc && emailOrPhone) {
      const snap = await db.collection('abandoned_checkouts')
        .where('phone', '==', emailOrPhone)
        .where('payment_status', '==', 'pending')
        .limit(1)
        .get();
        
      if (!snap.empty) {
        orderMatchDoc = snap.docs[0];
      }
    }

    if (orderMatchDoc) {
      const leadId = orderMatchDoc.id;
      const data = orderMatchDoc.data() as CheckoutLead;

      await db.collection('abandoned_checkouts').doc(leadId).update({
        payment_status: 'approved',
        recovery_status: 'recovered',
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      await logAutomationEvent(
        'customer.recovered',
        'success',
        `Carrinho recuperado com sucesso para ${data.customer_name || 'Cliente'} - R$ ${(data.total || 0).toFixed(2)}`,
        data.email || data.phone || 'Recuperacao'
      );
      
      logger.info(`💰 [RECOVERY] Checkout lead ${leadId} updated to RECOVERED`);
      return true;
    }
    return false;
  } catch (error: any) {
    logger.error(`❌ [RECOVERY-ERR] Failed tracking recovery: ${error.message}`);
    return false;
  }
}

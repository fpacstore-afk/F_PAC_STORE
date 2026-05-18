
import { Resend } from "resend";
import { getDb } from "../firebase.js";

async function getEmailHtml(order: any, orderId: string, title: string, subtitle: string, intro: string, trackingUrl: string) {
  const itemsHtml = order.items?.map((item: any) => `
    <tr>
      <td style="padding: 15px 0; border-bottom: 1px solid #111;">
        <span style="color: #fff; font-size: 13px; font-weight: 700; text-transform: uppercase; display: block; letter-spacing: 1px;">${item.name}</span>
        ${item.size ? `<span style="color: #666; font-size: 11px; text-transform: uppercase;">TAMANHO: ${item.size}</span>` : ''}
      </td>
      <td align="center" style="padding: 15px 0; color: #fff; font-size: 13px; font-weight: 700; border-bottom: 1px solid #111;">${item.quantity}</td>
      <td align="right" style="padding: 15px 0; color: #fff; font-size: 13px; font-weight: 700; border-bottom: 1px solid #111;">R$ ${item.price.toFixed(2)}</td>
    </tr>
  `).join('') || '';

  const pixInfo = order.point_of_interaction?.transaction_data;
  const isPendingPix = (order.status === 'received' || order.status === 'Aguardando Pagamento PIX') && pixInfo;

  const pixHtml = isPendingPix ? `
    <!-- PIX Payment Section -->
    <tr>
        <td style="padding: 20px 40px; background-color: #111; border: 2px solid #f7c600; text-align: center;">
            <p style="color: #f7c600; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 15px;">PAGUE COM PIX PARA APROVAÇÃO IMEDIATA</p>
            
            <div style="background-color: #fff; padding: 15px; display: inline-block; margin-bottom: 20px; border-radius: 8px;">
                <img src="${pixInfo.qr_code_base64 ? `data:image/png;base64,${pixInfo.qr_code_base64}` : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixInfo.qr_code)}`}" 
                     width="200" height="200" alt="PIX QR Code" style="display: block;">
            </div>

            <p style="color: #666; font-size: 9px; font-weight: 700; text-transform: uppercase; margin: 0 0 8px;">Código Copia e Cola:</p>
            <div style="background-color: #000; border: 1px solid #333; padding: 12px; margin-bottom: 15px;">
                <code style="color: #fff; font-size: 11px; word-break: break-all; font-family: monospace;">${pixInfo.qr_code}</code>
            </div>
            
            <p style="color: #888; font-size: 10px; line-height: 1.4; margin: 0;">
                O pagamento é aprovado instantaneamente e seu pedido entra em produção na mesma hora.<br>
                Aponte a câmera do seu banco ou copie o código acima no app pagamentos.
            </p>
        </td>
    </tr>
    <tr><td style="padding: 20px 0;"></td></tr>
  ` : '';

  return `
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
                                <h2 style="color: #f7c600; font-size: 32px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: -1px; line-height: 1;">${title}</h2>
                                <p style="color: #666; font-size: 10px; letter-spacing: 3px; margin: 15px 0 0; text-transform: uppercase;">PEDIDO: #${orderId}</p>
                            </td>
                        </tr>

                        <!-- Body Intro -->
                        <tr>
                            <td style="padding: 40px; color: #fff; line-height: 1.6; font-size: 14px;">
                                Olá, <strong>${order.customerName}</strong>!<br><br>
                                ${intro}
                            </td>
                        </tr>

                        <!-- PIX Section -->
                        ${pixHtml}

                        <!-- Items -->
                        <tr>
                            <td style="padding: 0 40px;">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #1a1a1a;">
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
                                        <td width="55%" style="vertical-align: top;">
                                            <h4 style="color: #f7c600; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 10px;">ENDEREÇO DE ENTREGA</h4>
                                            <p style="color: #666; font-size: 12px; margin: 0; line-height: 1.4;">
                                                ${order.customerName}<br>
                                                ${order.shippingAddress || 'Endereço não informado'}
                                            </p>
                                        </td>
                                        <td width="45%" style="vertical-align: top;">
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                <tr>
                                                    <td style="color: #666; padding: 5px 0; font-size: 12px;">Subtotal</td>
                                                    <td align="right" style="color: #fff; padding: 5px 0; font-size: 12px;">R$ ${((order.total || 0) + (order.discount || 0)).toFixed(2)}</td>
                                                </tr>
                                                ${order.discount ? `
                                                <tr>
                                                    <td style="color: #666; padding: 5px 0; font-size: 12px;">Desconto</td>
                                                    <td align="right" style="color: #ff4444; padding: 5px 0; font-size: 12px;">- R$ ${order.discount.toFixed(2)}</td>
                                                </tr>` : ''}
                                                <tr>
                                                    <td style="color: #666; padding: 5px 0; font-size: 12px;">Frete</td>
                                                    <td align="right" style="color: #00ff00; padding: 5px 0; font-size: 12px; font-weight: 700;">GRÁTIS</td>
                                                </tr>
                                                <tr>
                                                    <td style="color: #fff; padding: 15px 0 0; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">TOTAL</td>
                                                    <td align="right" style="color: #f7c600; padding: 15px 0 0; font-size: 18px; font-weight: 900;">R$ ${(order.total || 0).toFixed(2)}</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- CTA -->
                        <tr>
                            <td align="center" style="padding: 20px 40px 60px;">
                                <a href="${trackingUrl}" style="background-color: #f7c600; color: #000; padding: 18px 36px; text-decoration: none; font-weight: 900; font-size: 11px; letter-spacing: 2px; text-transform: uppercase;">ACOMPANHAR PEDIDO</a>
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
}

export async function sendOrderReceivedEmail(orderId: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;

  try {
    const db = getDb();
    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) return;
    const order = orderSnap.data();

    const resend = new Resend(key);
    const trackingUrl = `https://fpacstore.com.br/order/${orderId}`;

    const html = await getEmailHtml(
      order, 
      orderId, 
      "PEDIDO RECEBIDO",
      `#${orderId}`,
      "Recebemos seu pedido com sucesso. No momento estamos aguardando a confirmação do pagamento para iniciar a produção das suas peças exclusivas.",
      trackingUrl
    );

    await resend.emails.send({
      from: 'F PAC STORE <atendimento@fpacstore.com.br>',
      to: [order?.customerEmail],
      subject: `Pedido Recebido! #${orderId}`,
      html: html
    });
    console.log(`📧 [EMAIL] Order Received email sent for ${orderId}`);
  } catch (err) {
    console.warn("📧 [EMAIL] Failed to send received email:", err);
  }
}

export async function sendStatusEmail(orderId: string, status: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;

  try {
    const db = getDb();
    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) return;
    const order = orderSnap.data();

    const resend = new Resend(key);
    const readableStatus = mapStatusToText(status);
    const trackingUrl = `https://fpacstore.com.br/order/${orderId}`;
    
    const isApproval = status === 'payment_approved';
    const title = isApproval ? "PAGAMENTO CONFIRMADO" : "STATUS ATUALIZADO";
    const subject = isApproval ? `Pagamento Confirmado! #${orderId}` : `Pedido #${orderId} - ${readableStatus}`;
    const intro = isApproval 
      ? "Seu pagamento foi confirmado com sucesso. Já estamos preparando suas peças exclusivas para envio. Sua autenticidade é nossa identidade."
      : `O status do seu pedido foi atualizado para: <strong>${readableStatus.toUpperCase()}</strong>.`;

    const html = await getEmailHtml(
      order,
      orderId,
      title,
      readableStatus,
      intro,
      trackingUrl
    );

    await resend.emails.send({
      from: 'F PAC STORE <atendimento@fpacstore.com.br>',
      to: [order?.customerEmail],
      subject: subject,
      html: html
    });
    console.log(`📧 [EMAIL] Status email (${status}) sent for ${orderId}`);
  } catch (err) {
    console.warn("📧 [EMAIL] Failed to send status email:", err);
  }
}

function mapStatusToText(status: string) {
  const map: any = {
    'received': 'Recebido',
    'payment_pending': 'Aguardando Pagamento',
    'payment_approved': 'Pagamento Aprovado',
    'Pagamento Aprovado': 'Pagamento Aprovado',
    'Aguardando Pagamento PIX': 'Aguardando Pagamento PIX',
    'Pagamento Não Realizado': 'Pagamento Não Realizado',
    'processing': 'Em Produção',
    'shipped': 'Enviado',
    'delivered': 'Entregue',
    'cancelled': 'Cancelado',
    'rejected': 'Pagamento Recusado',
    'refunded': 'Reembolsado'
  };
  return map[status] || status;
}


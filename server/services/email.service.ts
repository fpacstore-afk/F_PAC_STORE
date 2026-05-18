
import { Resend } from "resend";
import { getDb } from "../firebase.js";

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

    await resend.emails.send({
      from: 'F PAC STORE <atendimento@fpacstore.com.br>',
      to: [order?.customerEmail],
      subject: `Pedido Recebido! #${orderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px; border: 1px solid #333;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #f7c600; font-size: 28px; text-transform: uppercase; margin: 0;">PEDIDO RECEBIDO</h1>
            <p style="color: #666; font-size: 14px; letter-spacing: 2px;">#${orderId}</p>
          </div>
          
          <p style="font-size: 16px; color: #ccc; line-height: 1.6;">Olá, <strong>${order?.customerName}</strong>!</p>
          <p style="font-size: 16px; color: #ccc; line-height: 1.6;">Recebemos seu pedido com sucesso. No momento estamos aguardando a confirmação do pagamento para iniciar a produção das suas peças exclusivas.</p>
          
          <div style="background: #111; padding: 25px; border: 1px solid #222; border-left: 4px solid #f7c600; margin: 30px 0;">
             <h3 style="color: #f7c600; margin-top: 0; font-size: 14px; text-transform: uppercase;">Resumo do Pedido:</h3>
             <ul style="list-style: none; padding: 0; color: #999; font-size: 14px;">
               ${order?.items?.map((item: any) => `<li>${item.quantity}x ${item.name} - R$ ${item.price.toFixed(2)}</li>`).join('')}
             </ul>
             <p style="margin-bottom: 0; font-weight: bold; color: #fff; border-top: 1px solid #222; pt: 10px; margin-top: 10px;">TOTAL: R$ ${order?.total?.toFixed(2)}</p>
          </div>

          <div style="text-align: center; margin: 40px 0;">
            <a href="${trackingUrl}" style="display: inline-block; background: #f7c600; color: #000; padding: 16px 32px; text-decoration: none; font-weight: 900; font-size: 14px; letter-spacing: 1px; text-transform: uppercase;">ACOMPANHAR MEU PEDIDO</a>
          </div>

          <p style="font-size: 13px; color: #666; text-align: center;">Assim que o pagamento for confirmado, você receberá uma nova notificação.</p>
          
          <hr style="border: 0; border-top: 1px solid #222; margin: 40px 0;">
          <p style="font-size: 11px; color: #444; text-align: center; letter-spacing: 1px;">F PAC STORE - AUTHENTIC STREETWEAR & IDENTITY</p>
        </div>
      `
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
    
    // Customize subject and header for approval
    const isApproval = status === 'payment_approved';
    const subject = isApproval ? `Pagamento Confirmado! #${orderId}` : `Atualização do Pedido #${orderId}`;
    const title = isApproval ? "PAGAMENTO CONFIRMADO" : "STATUS ATUALIZADO";

    await resend.emails.send({
      from: 'F PAC STORE <atendimento@fpacstore.com.br>',
      to: [order?.customerEmail],
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px; border: 1px solid #333;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #f7c600; font-size: 24px; text-transform: uppercase; margin: 0;">${title}</h1>
            <p style="color: #666; font-size: 12px; letter-spacing: 2px;">PEDIDO #${orderId}</p>
          </div>

          <p style="font-size: 16px; color: #ccc;">Olá, <strong>${order?.customerName}</strong>!</p>
          <p style="font-size: 16px; color: #ccc;">${isApproval ? 'Seu pagamento foi confirmado! Já estamos preparando tudo com o máximo cuidado.' : `O status do seu pedido foi atualizado para:`}</p>
          
          <div style="background: #111; padding: 25px; border-left: 4px solid #f7c600; font-weight: bold; font-size: 18px; margin: 30px 0; letter-spacing: 1px; color: #f7c600;">
            ${readableStatus.toUpperCase()}
          </div>
          
          <div style="text-align: center; margin: 40px 0;">
            <a href="${trackingUrl}" style="display: inline-block; background: #f7c600; color: #000; padding: 16px 32px; text-decoration: none; font-weight: 900; font-size: 14px; letter-spacing: 1px; text-transform: uppercase;">VER MEU PEDIDO</a>
          </div>

          <p style="font-size: 13px; color: #666; text-align: center;">Você pode acompanhar o rastreamento em tempo real clicando no botão acima.</p>
          
          <hr style="border: 0; border-top: 1px solid #333; margin: 40px 0;">
          <p style="font-size: 11px; color: #444; text-align: center; letter-spacing: 1px;">F PAC STORE - TODOS OS DIREITOS RESERVADOS.</p>
        </div>
      `
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
    'processing': 'Em Produção',
    'shipped': 'Enviado',
    'delivered': 'Entregue',
    'cancelled': 'Cancelado',
    'rejected': 'Pagamento Recusado',
    'refunded': 'Reembolsado'
  };
  return map[status] || status;
}

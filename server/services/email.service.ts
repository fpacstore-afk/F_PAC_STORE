
import { Resend } from "resend";
import { getDb } from "../firebase.js";

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

    await resend.emails.send({
      from: 'F PAC STORE <atendimento@fpacstore.com.br>',
      to: [order?.customerEmail],
      subject: `Pedido #${orderId} - ${readableStatus}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px; border: 1px solid #333;">
          <h1 style="color: #f7c600; font-size: 24px; text-transform: uppercase;">Olá, ${order?.customerName}!</h1>
          <p style="font-size: 16px; color: #ccc;">O status do seu pedido <strong>#${orderId}</strong> foi atualizado para:</p>
          <div style="background: #111; padding: 20px; border-left: 4px solid #f7c600; font-weight: bold; font-size: 18px; margin: 20px 0;">
            ${readableStatus.toUpperCase()}
          </div>
          <p style="font-size: 14px; color: #999;">Você pode acompanhar os detalhes do seu pedido em nosso site.</p>
          <a href="https://fpacstore.com.br/order-status/${orderId}" style="display: inline-block; background: #f7c600; color: #000; padding: 12px 24px; text-decoration: none; font-weight: bold; margin-top: 20px;">VER MEU PEDIDO</a>
          <hr style="border: 0; border-top: 1px solid #333; margin: 40px 0;">
          <p style="font-size: 11px; color: #444; text-align: center;">F PAC STORE - Todos os direitos reservados.</p>
        </div>
      `
    });
    console.log(`📧 [EMAIL] Status email sent for ${orderId}`);
  } catch (err) {
    console.warn("📧 [EMAIL] Failed to send email:", err);
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

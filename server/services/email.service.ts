
import { dispatchStageNotification } from "./productionNotification.service.js";
import { getOrderPaymentStatus } from "../utils/orderFinancial.js";

async function getEmailHtml(order: any, orderId: string, title: string, subtitle: string, intro: string, trackingUrl: string) {
  const charged = order.shippingFinances?.shippingCharged ?? order.pricing?.shipping ??
    (typeof order.shipping === 'number' || typeof order.shipping === 'string' ? order.shipping : undefined) ?? order.frete;
  const shippingText = charged === undefined || charged === null ? 'A confirmar' : Number(charged) > 0 ? 'R$ ' + Number(charged).toFixed(2) : 'GRÁTIS';
  const itemsHtml = order.items?.map((item: any) => `
    <tr>
      <td style="padding: 15px 0; border-bottom: 1px solid #111;">
        <span style="color: #fff; font-size: 13px; font-weight: 700; text-transform: uppercase; display: block; letter-spacing: 1px;">${escapeHtml(String(item.name || 'Produto F PAC'))}</span>
        ${item.size ? `<span style="color: #666; font-size: 11px; text-transform: uppercase;">TAMANHO: ${escapeHtml(String(item.size))}</span>` : ''}
      </td>
      <td align="center" style="padding: 15px 0; color: #fff; font-size: 13px; font-weight: 700; border-bottom: 1px solid #111;">${Number(item.quantity) || 1}</td>
      <td align="right" style="padding: 15px 0; color: #fff; font-size: 13px; font-weight: 700; border-bottom: 1px solid #111;">R$ ${Number(item.price || 0).toFixed(2)}</td>
    </tr>
  `).join('') || '';

  const pixInfo = order.point_of_interaction?.transaction_data;
  const isPendingPix = ['pending', 'processing'].includes(getOrderPaymentStatus(order)) && pixInfo;

  const pixHtml = isPendingPix ? `
    <!-- PIX Payment Section -->
    <tr>
        <td style="padding: 20px 40px; background-color: #111; border: 2px solid #f7c600; text-align: center;">
            <p style="color: #f7c600; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 15px;">PAGUE COM PIX PARA APROVAÇÃO IMEDIATA</p>
            
            <div style="background-color: #fff; padding: 15px; display: inline-block; margin-bottom: 20px; border-radius: 8px;">
                <img src="${pixInfo.qr_code ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixInfo.qr_code)}` : (pixInfo.qr_code_base64 ? `data:image/png;base64,${pixInfo.qr_code_base64}` : '')}" 
                     width="200" height="200" alt="PIX QR Code" style="display: block;">
            </div>

            <p style="color: #666; font-size: 9px; font-weight: 700; text-transform: uppercase; margin: 0 0 8px;">Código Copia e Cola:</p>
            <div style="background-color: #000; border: 1px solid #333; padding: 12px; margin-bottom: 15px;">
                <code style="color: #fff; font-size: 11px; word-break: break-all; font-family: monospace;">${pixInfo.qr_code}</code>
            </div>
            
            <p style="color: #888; font-size: 10px; line-height: 1.4; margin: 0;">
                Após o pagamento, aguarde a confirmação. A produção e a entrega seguem o prazo combinado.<br>
                Aponte a câmera do seu banco ou copie o código acima no app pagamentos.
            </p>
        </td>
    </tr>
    <tr><td style="padding: 20px 0;"></td></tr>
  ` : '';

  // Resolve address dynamically
  let shippingAddressStr = order.shippingAddress;
  if (!shippingAddressStr) {
    if (order.address) {
      if (typeof order.address === 'object') {
        const addr = order.address as any;
        shippingAddressStr = `${addr.street || ''}, ${order.number || addr.number || ''} ${order.complement || addr.complement || ''}<br>${addr.neighborhood || ''} — ${addr.city || ''}/${addr.state || ''}<br>CEP: ${order.cep || addr.cep || ''}`;
      } else {
        shippingAddressStr = `${order.address}, ${order.number || ''} ${order.complement || ''}<br>${order.neighborhood || ''} — ${order.city || ''}/${order.state || ''}<br>CEP: ${order.cep || ''}`;
      }
    } else {
      shippingAddressStr = 'Endereço não informado';
    }
  }

  // Resolve payment method text
  const pMethod = order.paymentMethod || 
                  (order.paymentMethodId === 'pix' || order.payment_type_id === 'bank_transfer' ? 'PIX' : '') ||
                  (order.paymentMethodId === 'credit_card' || order.payment_type_id === 'credit_card' ? 'CARTÃO DE CRÉDITO' : '') ||
                  order.paymentMethodId?.toUpperCase() || 
                  'CARTÃO / PIX';


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
                                Olá, <strong>${escapeHtml(String(order.customerName || 'Cliente'))}</strong>!<br><br>
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
                                                ${escapeHtml(String(order.customerName || 'Cliente'))}<br>
                                                ${shippingAddressStr}
                                            </p>
                                        </td>
                                        <td width="45%" style="vertical-align: top;">
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                <tr>
                                                    <td style="color: #666; padding: 5px 0; font-size: 12px;">Subtotal</td>
                                                    <td align="right" style="color: #fff; padding: 5px 0; font-size: 12px;">R$ ${Number(order.subtotal ?? ((Number(order.total) || 0) + (Number(order.discount) || 0) - (Number(charged) || 0))).toFixed(2)}</td>
                                                </tr>
                                                ${order.discount ? `
                                                <tr>
                                                    <td style="color: #666; padding: 5px 0; font-size: 12px;">Desconto</td>
                                                    <td align="right" style="color: #ff4444; padding: 5px 0; font-size: 12px;">- R$ ${Number(order.discount).toFixed(2)}</td>
                                                </tr>` : ''}
                                                <tr>
                                                    <td style="color: #666; padding: 5px 0; font-size: 12px;">Frete</td>
                                                    <td align="right" style="color: #00ff00; padding: 5px 0; font-size: 12px; font-weight: 700;">${shippingText}</td>
                                                </tr>
                                                <tr>
                                                    <td style="color: #666; padding: 5px 0; font-size: 12px;">Pagamento</td>
                                                    <td align="right" style="color: #fff; padding: 5px 0; font-size: 12px; font-weight: 700; text-transform: uppercase;">${escapeHtml(String(pMethod))}</td>
                                                </tr>
                                                <tr>
                                                    <td style="color: #fff; padding: 15px 0 0; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">TOTAL</td>
                                                    <td align="right" style="color: #f7c600; padding: 15px 0 0; font-size: 18px; font-weight: 900;">R$ ${Number(order.total || 0).toFixed(2)}</td>
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

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function sendOrderReceivedEmail(orderId: string) {
  return sendStatusEmail(orderId, 'received');
}

export function sendStatusEmail(orderId: string, status: string, includeWhatsApp = false) {
  const stage = ({ approved: 'payment_approved', rejected: 'payment_rejected', refunded: 'payment_refunded', 'Pagamento Aprovado': 'payment_approved', 'Aguardando Pagamento PIX': 'payment_pending' } as Record<string, string>)[status] || status;
  return dispatchStageNotification({
    orderId, newStageId: stage, changedBy: 'Sistema', channels: { whatsapp: includeWhatsApp },
    emailHtml: async (message, order) => getEmailHtml(order, orderId, 'ATUALIZAÇÃO DO PEDIDO', stage,
      escapeHtml(message.replace(/\*/g, '')).replace(/\n/g, '<br>'), 'https://fpacstore.com.br/tracking')
  });
}

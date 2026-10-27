import { manualWhatsAppUrl } from './notificationContacts';
import { getOrderPendingAmount, getOrderTotal } from './orderFinancialCore';

interface ReceivableWhatsAppLink {
  url: string | null;
  unavailableReason: string | null;
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Prepare a draft only. Opening this link never sends or records a payment. */
export function getReceivableWhatsAppLink(order: any): ReceivableWhatsAppLink {
  const unavailable = (reason: string): ReceivableWhatsAppLink => ({ url: null, unavailableReason: reason });
  const pending = getOrderPendingAmount(order);
  if (order?.isGift === true || order?.orderKind === 'gift' || pending <= 0) {
    return unavailable('Este pedido não possui saldo pendente para cobrar.');
  }

  const total = getOrderTotal(order);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(pending) || pending > total) {
    return unavailable('Confira os valores do pedido antes de preparar a mensagem.');
  }

  const phone = order?.customerPhone || order?.phone || order?.customer?.phone || '';
  const name = String(order?.customerName || order?.name || order?.customer?.name || '').trim();
  const orderId = String(order?.id || order?.orderId || '').trim();
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemsSummary = items.map((item: any) => {
    const quantity = Number(item?.quantity);
    const prefix = Number.isFinite(quantity) && quantity > 0 ? `${quantity}x ` : '';
    const product = item?.name || item?.title || item?.productName || 'Item do pedido (descrição não informada)';
    const details = [item?.color, item?.size && `Tam. ${item.size}`].filter(Boolean);
    return `• ${prefix}${product}${details.length ? ` (${details.join(' · ')})` : ''}`;
  }).join('\n') || 'Itens: consulte os detalhes do pedido.';

  const message = [
    `Olá${name ? `, ${name}` : ''}! Aqui é a F PAC STORE.`,
    '',
    `Ao realizar o fechamento do caixa, identificamos uma pendência no sistema referente ${orderId ? `ao pedido #${orderId}` : 'à sua compra'}:`,
    itemsSummary,
    '',
    `Total da compra: ${money(total)}`,
    `Valor pendente: ${money(pending)}`,
    '',
    'Se você já realizou o pagamento, por favor, envie o comprovante para darmos baixa no sistema.',
    '',
    '_Mensagem automática. Caso já tenha realizado o pagamento, desconsidere esta mensagem._',
  ].join('\n');

  try {
    return { url: manualWhatsAppUrl(phone, message), unavailableReason: null };
  } catch {
    return unavailable('Cadastre um WhatsApp válido com DDD no pedido para abrir a conversa.');
  }
}

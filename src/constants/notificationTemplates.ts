export {
  DEFAULT_NOTIFICATION_CONFIG,
  DEFAULT_STAGE_TEMPLATES,
  type ProductionNotificationConfig,
} from '../../shared/productionNotificationDefaults';

export function renderStageTemplate(templateStr: string, orderData: any): string {
  if (!templateStr) return '';
  const name = orderData?.customerName || orderData?.name || 'Cliente';
  const firstName = String(name).trim().split(/\s+/)[0].toUpperCase();
  const orderId = orderData?.id || orderData?.orderId || '0000';
  const totalVal = Number(orderData?.total || orderData?.amount || 0);
  const formattedTotal = `R$ ${(Number.isFinite(totalVal) ? totalVal : 0).toFixed(2).replace('.', ',')}`;
  const items = Array.isArray(orderData?.items) ? orderData.items : [];
  const itemsSummary = items.map((item: any) => `${Number(item.quantity) || 1}x ${item.name || item.title || 'Produto F PAC'}`).join(', ') || 'Produto F PAC';
  const totalQty = items.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 1), 0) || 1;
  const rawDate = orderData?.createdAt?.seconds ? new Date(orderData.createdAt.seconds * 1000) : new Date(orderData?.createdAt || Date.now());
  const dateStr = Number.isNaN(rawDate.getTime()) ? new Date().toLocaleDateString('pt-BR') : rawDate.toLocaleDateString('pt-BR');
  const deliveryEstimate = orderData?.deliveryDate || orderData?.previsao || '3 a 7 dias úteis';
  const paymentMethod = orderData?.paymentMethod || orderData?.formaPagamento || 'PIX / Cartão';
  const trackingCode = orderData?.trackingCode || orderData?.codigoRastreio || 'Em processamento';
  const carrier = orderData?.shippingCompany || orderData?.transportadora || 'Correios / Transportadora';
  const trackingLink = orderData?.trackingUrl || (orderData?.trackingCode ? `https://www.linkcorreios.com.br/?id=${orderData.trackingCode}` : `https://www.fpacstore.com.br/#/order/${orderId}`);

  return templateStr
    .replace(/\{\{nome_cliente\}\}/g, firstName)
    .replace(/\{\{numero_pedido\}\}/g, String(orderId))
    .replace(/\{\{valor_pedido\}\}/g, formattedTotal)
    .replace(/\{\{produto\}\}/g, itemsSummary)
    .replace(/\{\{quantidade\}\}/g, String(totalQty))
    .replace(/\{\{data\}\}/g, dateStr)
    .replace(/\{\{previsao\}\}/g, deliveryEstimate)
    .replace(/\{\{forma_pagamento\}\}/g, paymentMethod)
    .replace(/\{\{codigo_rastreio\}\}/g, trackingCode)
    .replace(/\{\{transportadora\}\}/g, carrier)
    .replace(/\{\{link_rastreio\}\}/g, trackingLink);
}

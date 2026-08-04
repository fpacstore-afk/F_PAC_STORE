export interface ProductionNotificationConfig {
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  allowResendOnStageReentry: boolean;
  activeStages: Record<string, boolean>;
  templates: Record<string, string>;
}

export const DEFAULT_STAGE_TEMPLATES: Record<string, string> = {
  received: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

✅ *SEU PEDIDO FOI RECEBIDO!*

Recebemos o seu pedido *#{{numero_pedido}}* com sucesso.

A partir de agora nossa equipe iniciará todo o processo de produção para garantir que sua camiseta chegue com a qualidade que você merece.

Você será avisado automaticamente sempre que seu pedido avançar para uma nova etapa.

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  payment_pending: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

💳 *AGUARDANDO PAGAMENTO*

Seu pedido *#{{numero_pedido}}* foi criado com sucesso.

Assim que o pagamento for confirmado, sua produção será iniciada automaticamente.

Caso já tenha realizado o pagamento, não se preocupe. A confirmação pode levar alguns minutos, dependendo da forma de pagamento.

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  aguardando_impressao: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

🖨️ *SUA ESTAMPA ESTÁ NA FILA DE IMPRESSÃO!*

Seu pedido *#{{numero_pedido}}* entrou na etapa de impressão.

Nossa equipe está preparando sua arte para produzir uma estampa com máxima qualidade e durabilidade.

Em breve sua camiseta começará a ganhar vida!

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  estampa_finalizada: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

🎨 *ESTAMPA FINALIZADA!*

Boas notícias!

A estampa da sua camiseta *#{{numero_pedido}}* foi produzida com sucesso.

Agora ela seguirá para nossa conferência de qualidade antes da preparação para envio.

Estamos cada vez mais perto de entregar sua nova identidade!

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  controle_qualidade: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

🔍 *CONTROLE DE QUALIDADE*

Sua camiseta *#{{numero_pedido}}* está passando pela inspeção final.

Nossa equipe está verificando acabamento, qualidade da estampa e todos os detalhes para garantir que você receba um produto impecável.

Qualidade vem sempre em primeiro lugar.

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  pronto_envio: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

📦 *SEU PEDIDO ESTÁ PRONTO!*

Sua camiseta *#{{numero_pedido}}* já foi produzida, conferida e embalada.

Agora estamos preparando a postagem junto à transportadora.

Em breve você receberá o código de rastreamento.

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  shipped: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

🚚 *SEU PEDIDO FOI ENVIADO!*

Seu pedido *#{{numero_pedido}}* já está a caminho!

Agora é só acompanhar a entrega utilizando as informações abaixo.

📦 Código de Rastreio:
*{{codigo_rastreio}}*

🚛 Transportadora:
*{{transportadora}}*

🔗 Rastreamento:
{{link_rastreio}}

👉 *ACOMPANHE SEU PEDIDO:*
https://www.fpacstore.com.br/#/order/{{numero_pedido}}

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`,

  delivered: `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕
━━━━━━━━━━━━━━━━━

Fala *{{nome_cliente}}*! 👋

🎉 *PEDIDO ENTREGUE!*

Conforme a transportadora, seu pedido *#{{numero_pedido}}* foi entregue.

Esperamos que sua nova camiseta represente sua identidade e supere suas expectativas.

Sua opinião é muito importante para nós! Marque *@f_pac_store* usando sua camiseta e compartilhe esse momento.

Obrigado por fazer parte da família F PAC STORE! 🖤

━━━━━━━━━━━━━━━━━

🌟 CANAIS OFICIAIS F PAC STORE

🌐 Site Oficial: www.fpacstore.com.br
📸 Instagram: @f_pac_store
💬 WhatsApp Oficial: (47) 99746-5602
📍 Loja/Expedição em Joinville/SC

🛡️ Esta é uma mensagem automática de acompanhamento do seu pedido.`
};

export const DEFAULT_NOTIFICATION_CONFIG: ProductionNotificationConfig = {
  whatsappEnabled: true,
  emailEnabled: true,
  allowResendOnStageReentry: false,
  activeStages: {
    received: true,
    payment_pending: true,
    aguardando_impressao: true,
    estampa_finalizada: true,
    controle_qualidade: true,
    pronto_envio: true,
    shipped: true,
    delivered: true,
    cancelled: false
  },
  templates: { ...DEFAULT_STAGE_TEMPLATES }
};

export function renderStageTemplate(templateStr: string, orderData: any): string {
  if (!templateStr) return '';
  
  const name = orderData?.customerName || orderData?.name || 'Cliente';
  const firstName = String(name).split(' ')[0].toUpperCase();
  const orderId = orderData?.id || orderData?.orderId || '0000';
  const totalVal = Number(orderData?.total || orderData?.amount || 0);
  const formattedTotal = totalVal > 0 ? `R$ ${totalVal.toFixed(2).replace('.', ',')}` : 'R$ 0,00';
  
  // Extract item details
  const items = orderData?.items || [];
  const firstItemName = items[0]?.name || items[0]?.title || 'Camiseta F PAC';
  const itemsSummary = items.map((i: any) => `${i.quantity || 1}x ${i.name || i.title || 'Camiseta'}`).join(', ') || firstItemName;
  const totalQty = items.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 1), 0) || 1;

  const dateStr = orderData?.createdAt
    ? new Date(orderData.createdAt?.seconds ? orderData.createdAt.seconds * 1000 : orderData.createdAt).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');

  const deliveryEstimate = orderData?.deliveryDate || orderData?.previsao || '3 a 7 dias úteis';
  const paymentMethod = orderData?.paymentMethod || orderData?.formaPagamento || 'PIX / Cartão';

  const trackingCode = orderData?.trackingCode || orderData?.codigoRastreio || orderData?.trackingUrl || 'Em processamento';
  const carrier = orderData?.shippingCompany || orderData?.transportadora || (orderData?.cep && String(orderData.cep).startsWith('892') ? 'Entrega Local Joinville' : 'Correios / Transportadora');
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

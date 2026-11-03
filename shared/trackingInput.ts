/** Accept only our order links; never redirect to pasted external URLs. */
export function parseOrderTrackingInput(orderInput: string, accessInput = '') {
  const raw = orderInput.trim();
  const access = accessInput.trim();
  const candidate = /^https?:\/\//i.test(raw) ? raw : /^https?:\/\//i.test(access) ? access : '';
  if (candidate) {
    let url: URL;
    try { url = new URL(candidate); } catch { throw new Error('Confira o link de acompanhamento recebido.'); }
    if (!['fpacstore.com.br', 'www.fpacstore.com.br'].includes(url.hostname) || url.protocol !== 'https:') {
      throw new Error('Use o link de acompanhamento da F PAC STORE.');
    }
    const route = url.hash.startsWith('#/') ? new URL(url.hash.slice(1), url.origin) : url;
    const match = route.pathname.match(/^\/(?:order|order-status)\/([a-zA-Z0-9_-]+)\/?$/);
    if (!match) throw new Error('Cole o link completo do pedido enviado pela F PAC.');
    const id = match[1];
    if (raw && candidate !== raw && raw.replace(/^#/, '').toUpperCase() !== id.toUpperCase()) {
      throw new Error('O link pertence a outro pedido. Confira o número informado.');
    }
    return { orderId: id, token: route.searchParams.get('token') || route.searchParams.get('trackingAccessToken') || '' };
  }
  const orderId = raw.replace(/^#/, '').toUpperCase();
  if (!/^[A-Z0-9_-]{1,100}$/.test(orderId)) throw new Error('Informe o número completo do pedido ou cole o link recebido.');
  return { orderId, token: access };
}

export function safeTrackingUrl(value: unknown, fallback = 'https://fpacstore.com.br/tracking') {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : fallback;
  } catch { return fallback; }
}

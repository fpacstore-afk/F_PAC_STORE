import { authenticatedFetch } from '../lib/api';

export async function fetchPaymentStatus(orderId: string, trackingToken?: string, signal?: AbortSignal) {
  const response = await authenticatedFetch(`/api/checkout/verify/${encodeURIComponent(orderId)}`, {
    headers: trackingToken ? { 'x-tracking-token': trackingToken } : {},
    cache: 'no-store', signal,
  });
  if (!response.ok) {
    throw new Error(response.status === 403
      ? 'Abra o acompanhamento pelo link seguro do pedido ou entre na sua conta.'
      : response.status === 429 ? 'Muitas consultas. Aguarde alguns minutos antes de tentar novamente.'
      : 'Não foi possível atualizar o pagamento. Você pode consultar o acompanhamento do pedido.');
  }
  return response.json();
}

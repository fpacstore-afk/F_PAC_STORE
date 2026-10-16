export function emailDeliveryLabel(event: string) {
  const labels: Record<string, string> = {
    sent: 'Aceito pelo provedor', queued: 'Na fila', scheduled: 'Agendado',
    delivered: 'Entregue ao servidor', opened: 'Entregue ao servidor', clicked: 'Entregue ao servidor',
    delivery_delayed: 'Entrega adiada', bounced: 'Devolvido', failed: 'Falha de entrega',
    canceled: 'Cancelado', complained: 'Sinalizado como spam', suppressed: 'Envio bloqueado',
  };
  return labels[event] || 'Sem confirmação de entrega';
}

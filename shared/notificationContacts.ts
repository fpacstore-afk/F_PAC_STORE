export function normalizeNotificationEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Informe um e-mail de teste válido.');
  const email = value.trim().toLowerCase();
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('Informe um e-mail de teste válido.');
  }
  return email;
}

export function normalizeNotificationPhone(value: unknown): string {
  if (typeof value !== 'string' || /[^\d+().\s-]/.test(value)) throw new Error('Informe um WhatsApp com DDD válido.');
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  if (digits.length >= 12 && digits.length <= 15 && !digits.startsWith('0')) return digits;
  throw new Error('Informe um WhatsApp com DDD válido.');
}

export function manualWhatsAppUrl(phone: string, message: string): string {
  const number = normalizeNotificationPhone(phone);
  if (!number) throw new Error('Cadastre o número do WhatsApp.');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

// Historical summary logs have no structured channel flags. Never invent success.
export function notificationChannelStatus(log: any, channel: 'whatsapp' | 'email'): string {
  if (typeof log?.[channel + 'Status'] === 'string' && log[channel + 'Status'].trim()) return log[channel + 'Status'];
  if (log?.[channel + 'Sent'] === true) return 'Enviado';
  const summary = String(log?.message || log?.details || '');
  const match = summary.match(channel === 'whatsapp' ? /WhatsApp\s+([^;\n]+)/i : /e-mail\s+([^;\n]+)/i);
  const statuses = ['Enviado', 'Já enviado', 'Erro', 'Desativado', 'Não configurado', 'Sem E-mail', 'Sem Telefone'];
  const historical = statuses.find(status => status.toLowerCase() === match?.[1]?.trim().toLowerCase());
  return historical || 'Sem confirmação';
}

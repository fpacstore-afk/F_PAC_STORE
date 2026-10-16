import { normalizeNotificationEmail, normalizeNotificationPhone, notificationChannelStatus } from './notificationContacts';

export interface NotificationSettingsSnapshot {
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  activeStages: Record<string, boolean>;
  templates: Record<string, string>;
  integration: { whatsappConfigured: boolean; emailConfigured: boolean };
}

export interface NotificationAttempt {
  orderId: string;
  stage: string;
  data: any;
}

export interface NotificationChannelView {
  kind: 'sent' | 'unknown' | 'disabled' | 'manual' | 'missing_contact' | 'unconfigured' | 'sending' | 'failed' | 'unsent';
  label: string;
  canRetry: boolean;
}

export function isNotificationSettingsSnapshot(value: any): value is NotificationSettingsSnapshot {
  return Boolean(value && typeof value === 'object'
    && typeof value.whatsappEnabled === 'boolean' && typeof value.emailEnabled === 'boolean'
    && value.activeStages && typeof value.activeStages === 'object' && !Array.isArray(value.activeStages)
    && value.templates && typeof value.templates === 'object' && !Array.isArray(value.templates)
    && typeof value.integration?.whatsappConfigured === 'boolean'
    && typeof value.integration?.emailConfigured === 'boolean');
}

export function getStageNotificationView(params: {
  order: any;
  stage: string;
  settings: NotificationSettingsSnapshot | null;
  attempt?: NotificationAttempt | null;
  now?: number;
}) {
  const { order, stage, settings, attempt, now = Date.now() } = params;
  const saved = order.sentStageNotifications?.[stage];
  const log = Array.isArray(order.notificationLogs)
    ? order.notificationLogs.find((entry: any) => entry.stageId === stage) : null;
  const currentAttempt = attempt?.orderId === order.id && attempt.stage === stage ? attempt.data : null;
  const records = [currentAttempt, saved, log].filter(Boolean);
  const phone = String(order.customerPhone || order.phone || order.customer?.phone || order.customer?.phone2 || '');
  const email = String(order.customerEmail || order.email || order.customer?.email || '');
  let validPhone = false, validEmail = false;
  try { validPhone = Boolean(normalizeNotificationPhone(phone)); } catch {}
  try { validEmail = Boolean(normalizeNotificationEmail(email)); } catch {}
  const inProgress = Number(saved?.leaseUntil) > now;

  const channel = (name: 'whatsapp' | 'email'): NotificationChannelView => {
    const sent = records.some(record => record[name + 'Sent'] === true
      || ['Enviado', 'Já enviado'].includes(notificationChannelStatus(record, name)));
    if (sent) return { kind: 'sent', label: 'Enviado', canRetry: false };
    if (!settings) return { kind: 'unknown', label: 'Configuração ainda não conferida', canRetry: false };
    if (settings.activeStages[stage] !== true) return { kind: 'disabled', label: 'Avisos desta etapa desativados', canRetry: false };
    if (name === 'email' && !settings.emailEnabled) return { kind: 'disabled', label: 'Desativado', canRetry: false };
    if (!(name === 'whatsapp' ? validPhone : validEmail)) {
      return { kind: 'missing_contact', label: name === 'whatsapp' ? 'Confira o telefone do cliente' : 'Confira o e-mail do cliente', canRetry: false };
    }
    if (name === 'whatsapp' && !settings.whatsappEnabled) return { kind: 'manual', label: 'Envio manual', canRetry: false };
    if (!(name === 'whatsapp' ? settings.integration.whatsappConfigured : settings.integration.emailConfigured)) {
      return { kind: 'unconfigured', label: name === 'whatsapp' ? 'Automático não configurado; use o envio manual' : 'Serviço de e-mail não configurado', canRetry: false };
    }
    if (inProgress) return { kind: 'sending', label: 'Envio em andamento', canRetry: false };
    const lastStatus = records.length ? notificationChannelStatus(records[0], name) : '';
    if (lastStatus === 'Erro') return { kind: 'failed', label: 'Falha no envio', canRetry: true };
    // Eligibility uses today's settings and contact, not a historical disabled/missing state.
    return { kind: 'unsent', label: 'Sem envio registrado', canRetry: true };
  };
  const whatsapp = channel('whatsapp'), emailView = channel('email');
  return {
    whatsapp, email: emailView, phone, hasRecord: records.length > 0,
    canOpenWhatsApp: Boolean(settings && validPhone),
    retryChannels: { whatsapp: whatsapp.canRetry, email: emailView.canRetry },
    canRetry: whatsapp.canRetry || emailView.canRetry,
    hasFailure: whatsapp.kind === 'failed' || emailView.kind === 'failed',
  };
}

import { DEFAULT_STAGE_TEMPLATES, renderStageTemplate } from '../constants/notificationTemplates';

type SentStageNotification = { lastMessage?: unknown } | null | undefined;

export function resolveProductionStageMessage(
  stageId: string,
  order: any,
  sentNotification: SentStageNotification,
  templates: Record<string, string> = DEFAULT_STAGE_TEMPLATES
): string {
  if (typeof sentNotification?.lastMessage === 'string' && sentNotification.lastMessage.trim()) {
    return sentNotification.lastMessage;
  }

  const template = templates[stageId] || DEFAULT_STAGE_TEMPLATES[stageId] || DEFAULT_STAGE_TEMPLATES.received;
  return renderStageTemplate(template, order);
}

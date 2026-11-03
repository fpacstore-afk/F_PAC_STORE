import { createHash } from 'node:crypto';

export const CHECKOUT_PREPARATION_TTL_MS = 15 * 60 * 1000;
export const checkoutAttemptId = (key: string) => createHash('sha256').update(key).digest('hex');
export function preparationExpired(record: any, now = Date.now()) {
  const created = Date.parse(record?.createdAt || '');
  return Number.isFinite(created) && now - created >= CHECKOUT_PREPARATION_TTL_MS;
}

import { safeStorage } from '../lib/storage';

export const PRIVACY_EVENT = 'fpac:privacy-preferences';
const KEY = 'fpac_privacy_v1';
export type PrivacyChoice = 'essential' | 'analytics';
export function privacyChoice(): PrivacyChoice | null {
  const value = safeStorage.getItem(KEY);
  return value === 'essential' || value === 'analytics' ? value : null;
}
export const analyticsAllowed = () => privacyChoice() === 'analytics';
export function savePrivacyChoice(choice: PrivacyChoice) {
  safeStorage.setItem(KEY, choice);
  if (choice !== 'analytics') {
    for (const key of ['fpac_visitor_id','fpac_session_id','fpac_session_timestamp','fpac_visitor_geo']) safeStorage.removeItem(key);
    try { sessionStorage.removeItem('fpac_analytics_session'); } catch { /* unavailable storage */ }
  }
  window.dispatchEvent(new Event(PRIVACY_EVENT));
}

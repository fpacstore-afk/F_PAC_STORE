// Secrets stay in this tab. Only their hash reaches the database.
export interface OwnedSession { id: string; token: string; sequence: number; expiresAt: number }
export function ownedSession(scope: 'analytics' | 'identity', reset = false): OwnedSession | null {
  try {
    const key = 'fpac_owned_' + scope;
    const raw = reset ? null : sessionStorage.getItem(key), previous = raw ? JSON.parse(raw) : null;
    const value = previous?.expiresAt > Date.now() ? previous : { id: (scope === 'analytics' ? 's_' : 'q_') + crypto.randomUUID(), token: Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''), sequence: 0, expiresAt: Date.now() + (scope === 'analytics' ? 30 : 240) * 60_000 };
    value.sequence++; sessionStorage.setItem(key, JSON.stringify(value)); return value;
  } catch { return null; }
}

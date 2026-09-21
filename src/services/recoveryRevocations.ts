type Revocation = { checkout_session_id: string; leadAccessToken: string; expiresAt: number };
type Dependencies = { read: () => string | null; write: (value: string) => void; send: (entry: Revocation) => Promise<boolean>; changed: (pending: boolean) => void; now?: () => number };
const MAX_AGE = 48 * 60 * 60_000;

/** Retain failed cancellations across reloads in this tab; never restore consent. */
export class RecoveryRevocations {
  private pending: Revocation[] = [];
  private running: Promise<boolean> | null = null;
  private now: () => number;
  constructor(private dependencies: Dependencies) {
    this.now = dependencies.now || Date.now;
    try {
      const stored = JSON.parse(dependencies.read() || '[]');
      if (Array.isArray(stored)) this.pending = stored.filter(entry => /^lead_[a-f0-9-]{36}$/.test(entry?.checkout_session_id || '') && /^[a-f0-9]{64}$/.test(entry?.leadAccessToken || '') && entry.expiresAt > this.now() && entry.expiresAt <= this.now() + MAX_AGE);
    } catch { /* Inaccessible session storage leaves the in-memory queue available. */ }
  }
  hasPending() { return this.pending.length > 0; }
  private persist() {
    try { this.dependencies.write(JSON.stringify(this.pending)); } catch { /* Keep pending cancellations in memory. */ }
    this.dependencies.changed(this.hasPending());
  }
  enqueue(checkout_session_id: string, leadAccessToken: string) {
    if (!this.pending.some(entry => entry.checkout_session_id === checkout_session_id)) {
      this.pending.push({ checkout_session_id, leadAccessToken, expiresAt: this.now() + MAX_AGE });
      this.persist();
    }
    return this.flush();
  }
  flush(): Promise<boolean> {
    if (this.running) return this.running.then(success => success && this.hasPending() ? this.flush() : success);
    this.running = (async () => {
      while (this.pending.length) {
        const entry = this.pending[0];
        if (entry.expiresAt > this.now()) {
          try { if (!await this.dependencies.send(entry)) return false; } catch { return false; }
        }
        this.pending.shift();
        this.persist();
      }
      return true;
    })().finally(() => { this.running = null; });
    return this.running;
  }
}

import { randomUUID } from 'node:crypto';

/** Bounded scans resume after the last processed document instead of starving
 * every record beyond the first batch. A lease avoids overlapping cron scans. */
export async function scanMaintenancePages(db: any, name: string, baseQuery: any,
  processDocument: (doc: any) => Promise<void>, options: { pageSize?: number; maxPages?: number; now?: () => number } = {}) {
  const pageSize = options.pageSize || 25, maxPages = options.maxPages || 10;
  const now = options.now || Date.now, owner = randomUUID();
  const ref = db.collection('maintenance_cursors').doc(name);
  const state = await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref), saved = snap.data() || {};
    if (Number(saved.leaseUntil) > now()) return null;
    tx.set(ref, { cursor: saved.cursor || null, owner, leaseUntil: now() + 5 * 60_000 }, { merge: true });
    return saved;
  });
  if (!state) return { processed: 0, skipped: true };
  let cursor = state.cursor || null, processed = 0;
  const checkpoint = async (done = false) => db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (snap.data()?.owner !== owner) throw new Error('MAINTENANCE_LEASE_LOST');
    tx.set(ref, { cursor, owner: done ? '' : owner, leaseUntil: done ? 0 : now() + 5 * 60_000 }, { merge: true });
  });
  try {
    for (let page = 0; page < maxPages; page++) {
      let query = baseQuery.orderBy('__name__').limit(pageSize);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      for (const doc of snapshot.docs) { await processDocument(doc); processed++; }
      cursor = snapshot.docs.length === pageSize ? snapshot.docs.at(-1).id : null;
      await checkpoint();
      if (!cursor) break;
    }
    return { processed, skipped: false };
  } finally { await checkpoint(true); }
}

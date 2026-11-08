import { createHash } from 'node:crypto';
import { projectPublicProduct } from './publicCatalog.service.js';
export type PriceChange = { id: string; price: number; promotionalPrice?: number };
export const CATALOG_INTEGER_CHANGE_ID = 'catalog-floor-20261108-v1';

/** Atomic, one-time catalog update. No customer, order, cost or inventory collection is written. */
export async function applyCatalogIntegerPrices(db: any, expected: readonly PriceChange[]) {
  if (!expected.length || expected.length > 100 || new Set(expected.map(row => row.id)).size !== expected.length) throw new Error('Invalid price change plan.');
  for (const row of expected) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(row.id) || !Number.isFinite(row.price) || row.price < 1 ||
        (row.promotionalPrice !== undefined && (!Number.isFinite(row.promotionalPrice) || row.promotionalPrice < 1))) throw new Error('Invalid catalog price.');
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(expected)).digest('hex');
  return db.runTransaction(async (tx: any) => {
    const eventRef = db.collection('catalog_price_changes').doc(CATALOG_INTEGER_CHANGE_ID);
    const event = await tx.get(eventRef);
    if (event.exists) {
      if (event.data().fingerprint !== fingerprint) throw new Error('Price change identifier already used for another plan.');
      return { ...event.data().result, alreadyApplied: true };
    }
    const references = expected.map(row => db.collection('products').doc(row.id));
    const snapshots = await Promise.all(references.map(ref => tx.get(ref)));
    const changes = expected.map((before, index) => {
      const snapshot = snapshots[index], stored = snapshot.data();
      if (!snapshot.exists || !projectPublicProduct(snapshot.id, stored) || stored?.price !== before.price || stored?.promotionalPrice !== before.promotionalPrice) throw new Error('Catalog prices changed since the owner preview. No prices were changed.');
      const after = { price: Math.floor(before.price), ...(before.promotionalPrice !== undefined ? { promotionalPrice: Math.floor(before.promotionalPrice) } : {}) };
      return { id: before.id, before: { price: before.price, ...(before.promotionalPrice !== undefined ? { promotionalPrice: before.promotionalPrice } : {}) }, after };
    });
    const now = new Date().toISOString();
    for (const [index, change] of changes.entries()) tx.update(references[index], { ...change.after, updatedAt: now });
    const result = { updated: changes.length, rounding: 'down', preservedOrders: true, preservedCosts: true, preservedInventory: true };
    tx.set(eventRef, { fingerprint, actor: 'owner-authorized-deployment', createdAt: now, changes, result });
    return { ...result, alreadyApplied: false };
  });
}

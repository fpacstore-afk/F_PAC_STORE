import { getDb } from '../server/firebase.js';
import { applyCatalogIntegerPrices } from '../server/services/catalogIntegerPrices.service.js';
import { CATALOG_INTEGER_PRICE_CHANGE } from '../server/data/catalogIntegerPrices20261108.js';

if (process.env.NODE_ENV !== 'production' || process.env.FIREBASE_PROJECT_ID !== 'fpac-store62' ||
    process.env.FIREBASE_DATABASE_ID !== 'ai-studio-a7d50f8c-9b01-4490-9a13-dd8892e0c41a') throw new Error('Unexpected catalog migration environment.');
async function main() {
  const db = getDb();
  try {
    const result = await applyCatalogIntegerPrices(db, CATALOG_INTEGER_PRICE_CHANGE);
    if (result.updated !== CATALOG_INTEGER_PRICE_CHANGE.length || !result.preservedOrders || !result.preservedCosts || !result.preservedInventory) throw new Error('Price change was not verified.');
    for (const row of CATALOG_INTEGER_PRICE_CHANGE) {
      const actual = (await db.collection('products').doc(row.id).get()).data();
      if (actual?.price !== Math.floor(row.price) || actual?.promotionalPrice !== Math.floor(row.promotionalPrice)) throw new Error('Post-change catalog verification failed.');
    }
    console.log('Verified 22 catalog products with integer prices rounded down. Protected audit saved; orders, costs and inventory preserved.');
  } finally { await db.terminate(); }
}
main().catch(() => { console.error('Catalog price update did not complete. Review the protected price audit before promotion.'); process.exitCode = 1; });

import { getDb } from '../server/firebase';
import { applyStockRange, previewStockRange } from '../server/services/stockRange.service';

// Invoked once by the production workflow, inside the existing runtime identity.
// No customer requests, authentication keys, IAM changes or startup DB dependency.
if (process.env.NODE_ENV !== 'production' || process.env.FIREBASE_PROJECT_ID !== 'fpac-store62' || process.env.FIREBASE_DATABASE_ID !== 'ai-studio-a7d50f8c-9b01-4490-9a13-dd8892e0c41a' || process.env.USE_MOCK_DB === 'true') throw new Error('Unexpected stock reorganization environment.');
async function main() {
  const db=getDb(), requestId='stock-range-20261029-v1';
  try {
    const prior=await db.collection('stock_range_events').doc(requestId).get();
    if (!prior.exists) {
      const plan=await previewStockRange(db);
      console.log('Read-only stock audit completed. Applying reversible product metadata; existing inventory documents will not be written.');
      await applyStockRange(db,{requestId,fingerprint:plan.fingerprint},'authorized-production-deployment');
    }
    const event=await db.collection('stock_range_events').doc(requestId).get();
    const result=event.data()?.result;
    if (!event.exists || !result?.preservedExistingInventory || !result.preservedOrders || !result.preservedPrices) throw new Error('Stock reorganization was not verified.');
    const remaining=await previewStockRange(db);
    if (remaining.updates.length || remaining.creates.length) throw new Error('The product range changed during reorganization. Review the current plan before promotion.');
    console.log('Verified seven product families. Existing quantities, reservations, prices, IDs, slugs, model sheets and orders are preserved.');
  } finally { await db.terminate(); }
}
main().catch(() => { console.error('The stock reorganization did not complete. Review the protected stock audit before promotion.'); process.exitCode=1; });

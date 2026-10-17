import { catalogProductCost } from '../../shared/catalogProductCost.js';
import { buildAutomaticCostMetadata } from '../../shared/productCostProfiles.js';

const clean = (value: any) => JSON.parse(JSON.stringify(value));

export async function completeMissingProductCosts(db: any, actor: string) {
  const products = await db.collection('products').get();
  const summary = { updated: 0, preserved: 0, unresolved: [] as { id: string; name: string; reason: string }[] };
  for (const productDoc of products.docs) {
    const outcome = await db.runTransaction(async (tx: any) => {
      const costRef = db.collection('product_costs').doc(productDoc.id);
      const [currentProduct, currentCost, config] = await Promise.all([
        tx.get(productDoc.ref), tx.get(costRef), tx.get(db.collection('pricing_workbench').doc('catalog'))
      ]);
      if (!currentProduct.exists) return 'deleted';
      const product = currentProduct.data(), cost = currentCost.data();
      const recorded = Number(cost ? cost.costPrice ?? cost.cost : product.costPrice ?? product.cost);
      if (Number.isFinite(recorded) && recorded > 0) return 'preserved';
      const profile = config.data()?.catalog ? catalogProductCost(config.data().catalog, product) : null;
      if (!profile) return { id: productDoc.id, name: product.name || productDoc.id, reason: 'Modelo sem cotação individual compatível nos cadastros de precificação' };
      const now = new Date().toISOString();
      const next = clean({ productId: productDoc.id, slug: product.slug || '', costPrice: profile.unitCost, cost: profile.unitCost,
        costCalculation: { ...buildAutomaticCostMetadata(profile, now), catalogVersion: config.data().version || 0 }, updatedAt: now });
      tx.set(db.collection('product_cost_events').doc(), { type: 'complete_missing', productId: productDoc.id, before: clean(cost || {}), after: next, actor, createdAt: now });
      tx.set(costRef, next, { merge: true });
      return 'updated';
    });
    if (outcome === 'updated') summary.updated++;
    else if (outcome === 'preserved') summary.preserved++;
    else if (typeof outcome === 'object') summary.unresolved.push(outcome);
  }
  return summary;
}

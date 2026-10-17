import { calculateCustomOrderCosts, catalogCostSnapshot, orderCostCatalogSnapshot } from '../../shared/orderCostComposition.js';
import { emptyCatalog } from '../../shared/pricingWorkbench.js';
import { loadProductsWithPrivateCosts } from '../utils/productCosts.js';

function validateRecipe(recipe: any) {
  const text = (value: any) => typeof value === 'string' && value.length <= 500;
  if (!recipe || !text(recipe.productId) || !text(recipe.line) || !text(recipe.printRuleId)
    || !Array.isArray(recipe.extraIds) || recipe.extraIds.length > 100 || recipe.extraIds.some((id: any) => !text(id))
    || typeof recipe.extrasReviewed !== 'boolean' || typeof recipe.manualConfirmed !== 'boolean' || !text(recipe.manualReason)
    || (recipe.manualMode !== undefined && typeof recipe.manualMode !== 'boolean')
    || (recipe.manualUnitCost !== null && (typeof recipe.manualUnitCost !== 'number' || !Number.isFinite(recipe.manualUnitCost) || recipe.manualUnitCost < 0))) {
    throw Object.assign(new Error('Confira os dados de custo do produto.'), { status: 400 });
  }
}

/** Called only when creating a new order. Existing sale snapshots are immutable. */
export async function prepareManualOrderCosts(order: any, db: any) {
  const custom = order.items.filter((item: any) => item.customProduct && item.customDetails?.costRecipe);
  for (const item of custom) {
    validateRecipe(item.customDetails.costRecipe);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100000
      || !Array.isArray(item.customDetails.artworks) || item.customDetails.artworks.length > 20) {
      throw Object.assign(new Error('Confira a quantidade e as artes do produto.'), { status: 400 });
    }
  }
  const [config, products] = await Promise.all([
    custom.length ? db.collection('pricing_workbench').doc('catalog').get() : Promise.resolve(null),
    order.items.some((item: any) => !item.customProduct) ? loadProductsWithPrivateCosts(db) : Promise.resolve([]),
  ]);
  const catalog = config?.data()?.catalog || emptyCatalog(), version = config?.data()?.version || 0;
  if (custom.length && order.expectedCostCatalogVersion !== undefined && order.expectedCostCatalogVersion !== version) {
    throw Object.assign(new Error('Os custos cadastrados mudaram. Atualize a base de custos e confira o resumo antes de salvar.'), { status: 409 });
  }
  const items = calculateCustomOrderCosts(order.items, catalog, version).map((item: any) => {
    if (item.customProduct) return item;
    const ids = [item.productId, item.id, item.slug, item.parentSlug].filter(Boolean);
    const product = products.find((p: any) => ids.includes(p.id) || ids.includes(p.slug));
    const metadata = item.manualProductMode === 'assembled' && item.customization?.prints?.length
      ? { coverage: 'partial', pendingComponents: [...(product?.costCalculation?.pendingComponents || []), 'Conferir custo das estampas e aplicação do produto montado'] }
      : product?.costCalculation;
    return { ...item, ...catalogCostSnapshot(product?.costPrice ?? product?.cost, Number(item.quantity), metadata) };
  });
  const prepared = { ...order, items, ...(custom.length ? { costCatalogSnapshot: { version, catalog: orderCostCatalogSnapshot(custom, catalog) } } : {}) };
  if (Buffer.byteLength(JSON.stringify(prepared)) > 850000) throw Object.assign(new Error('Pedido muito grande. Divida as peças em pedidos menores.'), { status: 400 });
  return prepared;
}

import { dtfCost, normalize, origin, round, type Catalog } from './pricingWorkbench';
import { artworkDimensions } from './orderCostComposition';
import { inferProductCostSelector, type ProductCostProfile } from './productCostProfiles';

// Model identity only. Supplier prices remain in the authenticated cost catalog.
const MODEL_SOURCES: Record<string, { supplier: string; product: string }> = {
  'oversized premium 240gsm': { supplier: 'Tiggas', product: 'Oversized Suedine' },
  'tradicional suedine': { supplier: 'Zimm', product: 'Camiseta Suedine' },
  'cropped oversized feminino': { supplier: 'Tiggas', product: 'Boxy Feminina' },
  'boxy feminina': { supplier: 'Tiggas', product: 'Boxy Feminina' },
  'bermuda linho cargo': { supplier: 'Tiggas', product: 'Linho Cargo' },
  'polo': { supplier: 'Tiggas', product: 'Polo Piquet' },
  'regata': { supplier: 'Zimm', product: 'Linha Regata' }
};

export function productCostRecipeKey(product: Record<string, any>) {
  const selector = inferProductCostSelector(product);
  return JSON.stringify([selector.baseModel, selector.productFinish, selector.collection,
    product.stampIds || [], product.stampSizes || [], product.stampIdsByColor || {}, product.stampSizesByColor || {}]);
}

/** Reference unit cost, without guessing a purchase lot or replacing order COGS. */
export function catalogProductCost(catalog: Catalog, product: Record<string, any>): ProductCostProfile | null {
  const selector = inferProductCostSelector(product);
  const model = MODEL_SOURCES[normalize(String(selector.baseModel || ''))];
  if (!model) return null;
  const prices = catalog.entries.filter(entry => entry.active && entry.kind === 'price'
    && normalize(entry.supplier || '') === normalize(model.supplier)
    && normalize(entry.product || '') === normalize(model.product)
    && (entry.minQty || 1) <= 1 && !entry.line
    && typeof entry.cost === 'number' && Number.isFinite(entry.cost) && entry.cost > 0);
  if (!prices.length) return null;
  // A catalog product spans its colors/sizes. Never select a cheaper restricted
  // variant or a volume discount without a corresponding purchase quantity.
  const price = [...prices].sort((a, b) => b.cost! - a.cost! || a.id.localeCompare(b.id))[0];
  const components = [{ name: `${model.product} · ${model.supplier}`, unitCost: price.cost!, source: `${origin(price.source)} · referência de 1 peça` }];
  const pending = ['Conferir custo do lote e frete de compra', 'Energia, tributos e despesas fixas não rateados'];
  if (price.status !== 'Confirmado') pending.push(`Preço da peça: ${price.status}`);
  if (price.color || price.size || new Set(prices.map(p => p.cost)).size > 1) pending.push('Conferir custos por cor e tamanho');
  if (selector.productFinish !== 'plain') {
    const recipes = [{ ids: product.stampIds || [], sizes: product.stampSizes || [] },
      ...Object.entries(product.stampIdsByColor || {}).map(([color, ids]) => ({ ids: ids as string[], sizes: product.stampSizesByColor?.[color] || [] }))];
    let printCost = 0;
    let foundPrint = false;
    for (const recipe of recipes) {
      let subtotal = 0;
      for (let i = 0; i < recipe.ids.length; i++) {
        foundPrint = true;
        const { width, height } = artworkDimensions(String(recipe.sizes[i] || ''));
        const fit = dtfCost(width, height, catalog.rules);
        if (!fit) pending.push('Estampa sem medida válida ou sem encaixe na folha DTF');
        else subtotal += fit.unitCost;
      }
      printCost = Math.max(printCost, subtotal);
    }
    if (printCost > 0) components.push({ name: 'DTF · maior receita entre as cores', unitCost: printCost, source: 'Parâmetros cadastrados · encaixe repetido na folha, com rotação e espaçamento' });
    if (!foundPrint) pending.push('Definir estampas e medidas do produto');
    if (catalog.rules.dtfStatus !== 'Confirmado') pending.push(`DTF: ${catalog.rules.dtfStatus}`);
    pending.push('Conferir aproveitamento no lote real de DTF');
    const extras = catalog.entries.filter(entry => entry.active && entry.kind === 'extra' && entry.basis === 'unit' && entry.defaultForOrders);
    for (const extra of extras) {
      if (typeof extra.cost !== 'number' || !Number.isFinite(extra.cost) || extra.cost < 0) pending.push(`${extra.name}: falta custo`);
      else {
        components.push({ name: extra.name, unitCost: extra.cost, source: origin(extra.source) });
        if (extra.status !== 'Confirmado') pending.push(`${extra.name}: ${extra.status}`);
      }
    }
    if (!extras.some(e => /embalag/.test(normalize(e.name)))) pending.push('Embalagem não definida como custo padrão');
    if (!extras.some(e => /mao de obra|aplicacao/.test(normalize(e.name)))) pending.push('Mão de obra e aplicação não definidas como custo padrão');
    pending.push('Adicionais por pedido dependem da quantidade real e não entram integralmente em cada produto');
  }
  return {
    id: `catalog-recipe-${normalize(String(selector.baseModel)).replace(/[^a-z0-9]+/g, '-')}-${selector.productFinish || 'printed'}`,
    baseModel: String(selector.baseModel), productFinish: selector.productFinish === 'plain' ? 'plain' : 'printed', collection: String(selector.collection || 'TODOS'),
    unitCost: round(components.reduce((total, component) => total + component.unitCost, 0)), coverage: 'partial',
    pendingComponents: [...new Set(pending)], sourceLabel: `${catalog.sourceTitle || 'Precificação e Orçamentos'} · ${model.supplier} · referência individual`,
    sourceUpdatedAt: price.date, active: true, components, method: 'catalog_recipe_v1'
  };
}

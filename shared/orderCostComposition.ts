import { calculateItem, dtfPurchase, emptyCatalog, quoteExtraQuantities, round, type Catalog, type Component, type ItemInput } from './pricingWorkbench';

/** References only. The server resolves prices; a browser preview is never a price source. */
export type OrderCostRecipe = {
  productId: string;
  line: string;
  printRuleId: string;
  extraIds: string[];
  extrasReviewed: boolean;
  manualUnitCost: number | null;
  manualMode?: boolean;
  manualConfirmed: boolean;
  manualReason: string;
};
export type OrderCostComposition = {
  version: 1;
  calculatedAt: string;
  catalogVersion?: number;
  mode: 'automatic' | 'manual' | 'catalog' | 'quote';
  components: Component[];
  pending: string[];
  warnings: string[];
};

export function artworkDimensions(value: unknown): { width: number | null; height: number | null } {
  const match = String(value || '').match(/^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*$/i);
  const numbers = match?.slice(1).map(n => Number(n.replace(',', '.')));
  return numbers?.every(n => n > 0 && n <= 1000)
    ? { width: numbers[0], height: numbers[1] } : { width: null, height: null };
}

function costItem(line: any, index: number): ItemInput {
  const recipe: OrderCostRecipe = line.customDetails.costRecipe;
  return {
    id: String(line.manualLineId || line.id || index), productId: recipe.productId, line: recipe.line,
    color: String(line.color || ''), size: String(line.size || ''), quantity: Number(line.quantity),
    prints: (line.customDetails.artworks || []).map((art: any) => ({
      stampId: art.costRuleId || recipe.printRuleId, ...artworkDimensions(art.artSize || art.stockPrintSize || art.printSize),
      position: String(art.location || 'Estampa'), manualCost: null,
    })),
    extraIds: [...new Set(recipe.extraIds)], margin: 0, fee: 0,
    manualGarmentCost: null, manualSalePrice: Number(line.price || 0), description: '',
  };
}

/** Uses the same quantity tiers, DTF basis and extra allocation as the quotation. */
export function calculateCustomOrderCosts(lines: any[], catalog: Catalog = emptyCatalog(), catalogVersion = 0, calculatedAt = new Date().toISOString()) {
  // A manual total still consumes material and participates in the physical lot.
  const inputs = lines.filter(line => line.customDetails?.costRecipe).map(costItem);
  const quantities = quoteExtraQuantities(inputs, catalog);
  const purchase = dtfPurchase(inputs, catalog);
  let inputIndex = 0;
  return lines.map(line => {
    const recipe: OrderCostRecipe | undefined = line.customDetails?.costRecipe;
    if (!recipe) return line;
    const input = inputs[inputIndex++];
    let components: Component[], pending: string[], warnings: string[];
    const manual = recipe.manualMode === true || recipe.manualUnitCost != null;
    if (manual) {
      const valid = typeof recipe.manualUnitCost === 'number' && Number.isFinite(recipe.manualUnitCost) && recipe.manualUnitCost >= 0;
      components = [{ name: 'Custo total por peça informado', unitCost: valid ? recipe.manualUnitCost : null, source: recipe.manualReason || 'Ajuste manual' }];
      pending = valid && recipe.manualConfirmed && recipe.manualReason.trim() ? [] : ['Conferir o custo manual e informar o motivo'];
      warnings = [];
    } else {
      const result = calculateItem(input, catalog, calculatedAt.slice(0, 10), quantities, purchase);
      components = result.components;
      pending = [...result.costPending, ...result.errors];
      if (!recipe.extrasReviewed) pending.push('Conferir embalagem, aplicação e demais insumos');
      warnings = result.warnings;
    }
    const anyKnown = components.some(c => c.unitCost != null);
    const unit = components.reduce((sum, c) => sum + (c.unitCost ?? 0), 0);
    return {
      ...line, unitCostSnapshot: round(unit), totalCostSnapshot: round(unit * Number(line.quantity)),
      costCoverage: !anyKnown ? 'unavailable' : pending.length || warnings.length ? 'estimated' : 'complete',
      costComposition: { version: 1, calculatedAt, catalogVersion, mode: manual ? 'manual' : 'automatic', components, pending: [...new Set(pending)], warnings: [...new Set(warnings)] } satisfies OrderCostComposition,
    };
  });
}

/** Keep only the relevant private references for future edits at the original rates. */
export function orderCostCatalogSnapshot(lines: any[], catalog: Catalog): Catalog {
  const recipes: OrderCostRecipe[] = lines.map(line => line.customDetails?.costRecipe).filter(Boolean);
  const products = catalog.entries.filter(e => e.kind === 'product' && recipes.some(r => r.productId === e.id));
  const extras = new Set(recipes.flatMap(r => r.extraIds));
  const stamps = new Set([...recipes.map(r => r.printRuleId), ...lines.flatMap(line => (line.customDetails?.artworks || []).map((art: any) => art.costRuleId).filter(Boolean))]);
  return { ...catalog, entries: catalog.entries.filter(e => products.includes(e)
    || (e.kind === 'stamp' && stamps.has(e.id)) || (e.kind === 'extra' && extras.has(e.id))
    || (e.kind === 'price' && products.some(p => p.name === e.product && p.supplier === e.supplier))) };
}

export function catalogCostSnapshot(unit: number | null | undefined, quantity: number, metadata?: any, calculatedAt = new Date().toISOString()) {
  const known = typeof unit === 'number' && Number.isFinite(unit) && unit >= 0;
  const pending: string[] = known ? [...(Array.isArray(metadata?.pendingComponents) ? metadata.pendingComponents : [])] : ['Custo do produto não cadastrado'];
  if (metadata?.coverage === 'partial' && !pending.length) pending.push('Composição parcial do cadastro');
  return {
    unitCostSnapshot: known ? round(unit) : 0, totalCostSnapshot: known ? round(unit * quantity) : 0,
    costCoverage: !known ? 'unavailable' : pending.length ? 'estimated' : 'complete',
    costComposition: { version: 1, calculatedAt, mode: 'catalog', components: [{ name: 'Produto (custo cadastrado)', unitCost: known ? unit : null, source: metadata?.sourceLabel || 'Cadastro privado de custos' }], pending, warnings: [] } satisfies OrderCostComposition,
  };
}

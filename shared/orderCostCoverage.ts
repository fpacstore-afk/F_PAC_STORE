import { FINANCIAL_DEFAULTS, roundMoney } from './financialDefaults';

export function getOrderItemCost(item: any, productCatalog?: any[]): {
  unitCost: number;
  totalCost: number;
  isSnapshot: boolean;
  isEstimated: boolean;
  costCoverage: 'complete' | 'estimated' | 'unavailable';
} {
  const qty = Math.max(1, Number(item.quantity) || 1);

  // 0. Caso explícito de custo indisponível / não cadastrado
  if (item.costCoverage === 'unavailable' || item.costCoverage === 'missing') {
    return {
      unitCost: 0,
      totalCost: 0,
      isSnapshot: false,
      isEstimated: false,
      costCoverage: 'unavailable'
    };
  }

  // 1. Snapshot histórico gravado na criação do pedido
  if (item.unitCostSnapshot !== undefined && item.unitCostSnapshot !== null && !isNaN(Number(item.unitCostSnapshot))) {
    const unitCost = Number(item.unitCostSnapshot);
    const totalCost = item.totalCostSnapshot !== undefined ? Number(item.totalCostSnapshot) : Number((unitCost * qty).toFixed(2));
    const coverage = item.costCoverage === 'complete' || item.costCoverage === undefined ? 'complete' : 'estimated';
    return {
      unitCost,
      totalCost,
      isSnapshot: true,
      isEstimated: coverage === 'estimated',
      costCoverage: coverage
    };
  }

  // 2. Item com custo explícito legado / direto no item
  const directItemCost = Number(item.costPrice ?? item.cost ?? item.manufacturingCost ?? 0);
  if (directItemCost > 0) {
    return {
      unitCost: directItemCost,
      totalCost: Number((directItemCost * qty).toFixed(2)),
      isSnapshot: false,
      isEstimated: false,
      costCoverage: 'complete'
    };
  }

  // 3. Consulta ao catálogo de produtos
  if (Array.isArray(productCatalog) && productCatalog.length > 0) {
    const searchKeys = [item.productId, item.slug, item.id, item.parentSlug].filter(Boolean);
    const foundProd = productCatalog.find(p => searchKeys.includes(p.id) || searchKeys.includes(p.slug));
    if (foundProd) {
      if (foundProd.costCoverage === 'unavailable' || foundProd.costCoverage === 'missing' || foundProd.costPrice === 0 || foundProd.cost === 0) {
        return {
          unitCost: 0,
          totalCost: 0,
          isSnapshot: false,
          isEstimated: false,
          costCoverage: 'unavailable'
        };
      }
      const prodCost = Number(foundProd.costPrice ?? foundProd.cost ?? foundProd.manufacturingCost ?? 0);
      if (prodCost > 0) {
        const isPartial = foundProd.costCalculation?.coverage === 'partial';
        return {
          unitCost: prodCost,
          totalCost: Number((prodCost * qty).toFixed(2)),
          isSnapshot: false,
          isEstimated: isPartial,
          costCoverage: isPartial ? 'estimated' : 'complete'
        };
      }
    }
  }

  // 4. Estimativa canônica por linha de produto
  const name = String(item.name || item.slug || '').toLowerCase();
  let estimatedUnit: number = 0;
  if (name.includes('mark')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.MARK;
  else if (name.includes('prime')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.PRIME;
  else if (name.includes('force')) estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts.FORCE;
  else if (Array.isArray(productCatalog) && productCatalog.length > 0) {
    const searchKeys = [item.productId, item.slug, item.id, item.parentSlug].filter(Boolean);
    const foundProd = productCatalog.find(p => searchKeys.includes(p.id) || searchKeys.includes(p.slug));
    if (foundProd?.line && FINANCIAL_DEFAULTS.estimatedProductCosts[foundProd.line]) {
      estimatedUnit = FINANCIAL_DEFAULTS.estimatedProductCosts[foundProd.line];
    }
  }

  if (estimatedUnit > 0) {
    return {
      unitCost: estimatedUnit,
      totalCost: roundMoney(estimatedUnit * qty),
      isSnapshot: false,
      isEstimated: true,
      costCoverage: 'estimated'
    };
  }

  return {
    unitCost: 0,
    totalCost: 0,
    isSnapshot: false,
    isEstimated: false,
    costCoverage: 'unavailable'
  };
}

export function getOrderCogs(order: any, productCatalog?: any[]): {
  cogs: number;
  isComplete: boolean;
  isEstimated: boolean;
  costCoveragePercent: number;
  itemsCount: number;
} {
  const items = order.items && Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) {
    return { cogs: 0, isComplete: true, isEstimated: false, costCoveragePercent: 100, itemsCount: 0 };
  }

  let totalCogs = 0;
  let completeItemsCount = 0;

  items.forEach(item => {
    const costInfo = getOrderItemCost(item, productCatalog);
    totalCogs += costInfo.totalCost;
    if (costInfo.costCoverage === 'complete') {
      completeItemsCount++;
    }
  });

  const costCoveragePercent = Math.round((completeItemsCount / items.length) * 100);

  return {
    cogs: Number(totalCogs.toFixed(2)),
    isComplete: costCoveragePercent === 100,
    isEstimated: costCoveragePercent < 100,
    costCoveragePercent,
    itemsCount: items.length
  };
}

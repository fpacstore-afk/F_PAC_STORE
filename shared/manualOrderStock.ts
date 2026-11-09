import { allocateGarments, garmentOrderBalance, type StockProduct } from './sharedGarmentStock';

/** Preserve the selected physical model when converting the editor's draft lines. */
export function manualOrderStockItems(lines: any[]) {
  return lines.map(line => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100000) throw new Error('Informe uma quantidade inteira entre 1 e 100.000 peças.');
    const product = line.product || line;
    return {
      ...line, productId: product.id || line.productId, slug: product.slug || line.slug,
      parentSlug: product.parentSlug || product.slug || product.id,
      garmentModelId: product.garmentModelId, stockBaseSlug: product.stockBaseSlug,
      name: line.displayName || product.name || line.name,
      variantKey: `${line.color}_${line.size}`,
      ...(line.mode === 'custom' ? { customProduct: true, customDetails: line.customDetails } : {})
    };
  });
}

export function manualVariantBalance(product: any, color: string, size: string, products: StockProduct[], inventory: Record<string, any>, draft: any[] = []) {
  return garmentOrderBalance(manualOrderStockItems([{ product, color, size, quantity: 1 }])[0], products, new Map(Object.entries(inventory)), manualOrderStockItems(draft));
}

export function assertManualOrderStock(lines: any[], products: StockProduct[], inventory: Record<string, any>) {
  return allocateGarments(manualOrderStockItems(lines), products, new Map(Object.entries(inventory)));
}

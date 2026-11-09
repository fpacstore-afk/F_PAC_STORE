import { isSellableCatalogProduct, productMatchesCommercialLine, productMatchesStorefrontCategory, type CatalogProductLike } from './catalogProducts';

export type CategoryCatalogLine = 'all' | 'prime' | 'mark' | 'force';

/** Categories start unfiltered: a commercial line must never hide an active product by default. */
export function categoryCatalogView<T extends CatalogProductLike>(products: T[], category: string, requestedLine: unknown, allowPrime = false) {
  const categoryProducts = products.filter(product => isSellableCatalogProduct(product) && productMatchesStorefrontCategory(product, category));
  const requested = String(requestedLine || '').trim().toLowerCase();
  const selectedLine: CategoryCatalogLine = requested === 'force' || requested === 'mark' || (requested === 'prime' && allowPrime) ? requested : 'all';
  const lineCounts = {
    all: categoryProducts.length,
    force: categoryProducts.filter(product => productMatchesCommercialLine(product, 'force')).length,
    mark: categoryProducts.filter(product => productMatchesCommercialLine(product, 'mark')).length,
    prime: categoryProducts.filter(product => productMatchesCommercialLine(product, 'prime')).length,
  };
  const visibleLines = (['all', 'prime', 'mark', 'force'] as const).filter(line => line === 'all' || (line === 'prime' ? allowPrime : lineCounts[line] > 0 || selectedLine === line));
  return { categoryProducts, selectedLine, lineCounts, visibleLines, filteredProducts: categoryProducts.filter(product => productMatchesCommercialLine(product, selectedLine)) };
}

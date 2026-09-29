const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function matchesStorefrontSearch(product: any, query: string): boolean {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const searchable = normalize([
    product.name, product.sku, product.headline, product.collection, product.category,
    product.productType, product.baseModel, product.description, ...(Array.isArray(product.tags) ? product.tags : []),
  ].join(' '));
  return words.every(word => searchable.includes(word));
}

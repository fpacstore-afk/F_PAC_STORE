import { manualProductIdentity } from './manualProductIdentity';

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function stockProductIdentity(product: any, designs: Array<{ id: string; name?: string; code?: string }>) {
  const stamps = (Array.isArray(product.stampIds) ? product.stampIds : []).filter(Boolean).map((id: string) => {
    const design = designs.find(item => item.id === id);
    return design ? [design.code, design.name].filter(Boolean).join(' · ') : id;
  });
  const identity = manualProductIdentity({ ...product, stampNames: stamps });
  const searchable = normalize([
    identity.displayName, identity.reference, identity.details, product.id, product.slug,
    product.category, product.displayCategory, product.linha, ...(Array.isArray(product.tags) ? product.tags : [])
  ].join(' '));
  return { ...identity, searchable };
}

export function matchesStockProduct(searchable: string, query: string): boolean {
  return normalize(query).split(/\s+/).every(word => searchable.includes(word));
}

export function duplicateProductReferences(products: Array<{ id?: string; sku?: string }>): Set<string> {
  const owners = new Map<string, Set<string | number>>();
  products.forEach((product, index) => {
    const sku = normalize(product.sku);
    if (!sku) return;
    const ids = owners.get(sku) || new Set();
    ids.add(product.id || index);
    owners.set(sku, ids);
  });
  return new Set([...owners].filter(([, ids]) => ids.size > 1).map(([sku]) => sku));
}

export function hasDuplicateProductReference(sku: string, duplicates: Set<string>): boolean {
  return duplicates.has(normalize(sku));
}

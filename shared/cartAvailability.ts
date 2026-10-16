/** Match checkout stock aggregation without changing or deleting the customer's cart. */
export function cartAvailabilityIssues(items: any[], getStock: (id: string, variant: string) => number, products: any[] = []) {
  const grouped = new Map<string, { id: string; variant: string; name: string; quantity: number }>();
  for (const item of items) {
    const id = String(item.baseProductSlug || item.parentSlug || item.slug || item.productId || item.id || '');
    const variant = String(item.variantKey || `${item.color}_${item.size}`);
    const key = `${id}::${variant}`;
    const previous = grouped.get(key);
    grouped.set(key, { id, variant, name: String(item.name || 'Produto'), quantity: (previous?.quantity || 0) + Number(item.quantity || 0) });
  }
  const shared = new Map<string, { id: string; variant: string; name: string; quantity: number }>();
  for (const item of grouped.values()) {
    const product = products.find(p => [p.id, p.slug].includes(item.id));
    const base = product?.stockBaseSlug;
    if (!base) continue;
    const key = `${base}::${item.variant}`;
    const needed = Math.max(0, item.quantity - Math.max(0, getStock(item.id, item.variant) - getStock(base, item.variant)));
    const previous = shared.get(key);
    shared.set(key, { id: base, variant: item.variant, name: 'Camisas lisas compartilhadas', quantity: (previous?.quantity || 0) + needed });
  }
  // PRIME's direct base items consume the same physical pool as catalog designs.
  for (const item of grouped.values()) {
    const key = `${item.id}::${item.variant}`;
    const pool = shared.get(key);
    if (pool) pool.quantity += item.quantity;
  }
  return [...grouped.values(), ...shared.values()].flatMap(item => {
    const available = getStock(item.id, item.variant);
    return available < item.quantity ? [{ ...item, available }] : [];
  });
}

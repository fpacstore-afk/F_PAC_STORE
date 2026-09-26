/** Match checkout stock aggregation without changing or deleting the customer's cart. */
export function cartAvailabilityIssues(items: any[], getStock: (id: string, variant: string) => number) {
  const grouped = new Map<string, { id: string; variant: string; name: string; quantity: number }>();
  for (const item of items) {
    const id = String(item.baseProductSlug || item.parentSlug || item.slug || item.productId || item.id || '');
    const variant = String(item.variantKey || `${item.color}_${item.size}`);
    const key = `${id}::${variant}`;
    const previous = grouped.get(key);
    grouped.set(key, { id, variant, name: String(item.name || 'Produto'), quantity: (previous?.quantity || 0) + Number(item.quantity || 0) });
  }
  return [...grouped.values()].flatMap(item => {
    const available = getStock(item.id, item.variant);
    return available < item.quantity ? [{ ...item, available }] : [];
  });
}

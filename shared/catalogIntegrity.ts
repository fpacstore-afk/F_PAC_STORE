type Row = Record<string, any>;
const quantity = (value: unknown) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
export function catalogIntegrity(products: Row[], inventory: Row[]) {
  const keys = new Set(products.flatMap(product => [product.id, product.slug, product.parentSlug]).filter(Boolean));
  const linked = inventory.filter(item => keys.has(item.id));
  const unlinked = inventory.filter(item => !keys.has(item.id));
  const physical = (item: Row) => {
    const variants = Object.values(item.variants || {}) as Row[];
    return variants.length ? variants.reduce((sum, v) => sum + quantity(v.physicalQuantity ?? v.stock), 0)
      : quantity(item.totalPhysicalStock ?? item.physicalQuantity ?? item.stock);
  };
  const lowStockVariants = linked.reduce((count, item) => {
    if (item.active === false || item.available === false) return count;
    const variants = Object.values(item.variants || {}) as Row[];
    return count + (variants.length ? variants : [item]).filter(variant => {
      if (variant.active === false || variant.available === false) return false;
      if (!['physicalQuantity', 'stock', 'quantity', 'availableQuantity'].some(key => variant[key] !== undefined)) return false;
      const physical = quantity(variant.physicalQuantity ?? variant.stock ?? variant.quantity);
      const available = Math.max(0, physical - quantity(variant.reservedQuantity ?? variant.reserved));
      const minimum = variant.minimumStock ?? variant.minStock ?? item.minimumStock ?? item.minStock;
      return available <= 0 || (minimum !== undefined && available <= quantity(minimum));
    }).length;
  }, 0);
  return { linked, unlinked, lowStockVariants, linkedPhysical: linked.reduce((n, item) => n + physical(item), 0), unlinkedPhysical: unlinked.reduce((n, item) => n + physical(item), 0) };
}

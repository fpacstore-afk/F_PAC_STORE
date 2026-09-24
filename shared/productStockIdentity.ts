interface ProductIdentity {
  id?: string;
  slug?: string;
}

export function hasSharedProductSlug(product: ProductIdentity, products: ProductIdentity[]): boolean {
  return Boolean(product.slug && products.some(other => other.id !== product.id && other.slug === product.slug));
}

// Product names and even operator-entered SKUs can repeat. The stable Firestore
// document ID keeps both the public URL and the inventory key exclusive.
export function resolveProductStockSlug(
  documentId: string,
  sku: string,
  existingSlug?: string,
  sharedSlug = false
): string {
  if (existingSlug && !sharedSlug) return existingSlug;
  const base = sku.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110) || 'produto';
  return `${base}-${documentId}`;
}

export function readProductVariantQuantity(
  product: { variantsStock?: Record<string, number>; sizeStock?: Array<{ size: string; quantity: number }> },
  inventory: { variants?: Record<string, { physicalQuantity?: number; stock?: number }> } | undefined,
  variantKey: string,
  size: string,
  colorCount: number,
  sharedSlug = false
): number {
  // A shared inventory cannot tell us which product owns a unit. During repair,
  // use that product's last saved matrix, never another product's shared balance.
  if (!sharedSlug && inventory) {
    const variant = inventory.variants?.[variantKey];
    return Math.max(0, Number(variant?.physicalQuantity ?? variant?.stock ?? 0) || 0);
  }
  if (product.variantsStock) return Math.max(0, Number(product.variantsStock[variantKey]) || 0);
  // Legacy size totals cover all colors, so they must not be copied to each color.
  return colorCount === 1
    ? Math.max(0, Number(product.sizeStock?.find(item => item.size === size)?.quantity) || 0)
    : 0;
}

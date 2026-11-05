import { isGiftOrder, purchasedQuantity } from './customerPurchases';

function isMadeToOrderItem(item: any): boolean {
  return item?.customProduct === true || item?.manualProductMode === 'custom' || Boolean(item?.customDetails)
    || [item?.id, item?.productId, item?.slug, item?.parentSlug].some(value =>
      typeof value === 'string' && /^manual-custom-(uniform|product)(?:$|-)/i.test(value));
}

/** The manual custom-production flow is separate from customization of retail SKUs, including PRIME. */
export function ownBrandSaleItems(order: any): any[] {
  if (isGiftOrder(order) || order?.sourceQuote || /^MANUAL-QUOTE-/i.test(order?.id || '')) return [];
  const items = Array.isArray(order?.items) ? order.items : [];
  // Some older personalized orders only recorded production details on the order.
  if (order?.customProduction && !items.some(isMadeToOrderItem)) return [];
  return items.filter(item => item && !isMadeToOrderItem(item) && purchasedQuantity(item) > 0);
}

/** Mixed orders allocate receipts by merchandise value. Missing prices leave the mixed value unallocated. */
export function ownBrandRevenueShare(order: any, brandItems = ownBrandSaleItems(order)): number {
  if (!brandItems.length) return 0;
  const saleItems = order.items.filter((item: any) => item && purchasedQuantity(item) > 0);
  if (brandItems.length === saleItems.length) return 1;
  const included = new Set(brandItems);
  let total = 0;
  let brand = 0;
  for (const item of saleItems) {
    const quantity = purchasedQuantity(item);
    const rawPrice = item.price ?? item.unitPrice ?? item.unit_price;
    if (rawPrice == null || rawPrice === '') return 0;
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price < 0) return 0;
    const line = Math.round(price * 100) * quantity;
    total += line;
    if (included.has(item)) brand += line;
  }
  return total > 0 ? brand / total : 0;
}

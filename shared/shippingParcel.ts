export type ShippingParcelSource = {
  id?: string; productId?: string; quantity: number; price: number;
  width?: unknown; height?: unknown; length?: unknown; weight?: unknown;
};
const positive = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
/** Defaults match the existing storefront; callers supply catalog dimensions when known. */
export function shippingParcel(item: ShippingParcelSource) {
  return {
    id: item.productId || item.id || 'produto',
    width: positive(item.width,17), height: positive(item.height,5),
    length: positive(item.length,11), weight: positive(item.weight,.3),
    insurance_value: item.price, quantity: item.quantity,
  };
}

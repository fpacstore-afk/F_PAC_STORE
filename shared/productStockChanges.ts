export interface VariantStockChange {
  variantKey: string;
  previousStock: number;
  newStock: number;
  removed: boolean;
}

// Compare with the saved matrix, including combinations removed from the form.
// Omitting a combination from a partial inventory update would leave its balance.
export function buildVariantStockChanges(
  saved: Record<string, number>,
  current: Record<string, number>
): VariantStockChange[] {
  return [...new Set([...Object.keys(saved), ...Object.keys(current)])].flatMap(variantKey => {
    const previousStock = saved[variantKey] ?? 0;
    const newStock = current[variantKey] ?? 0;
    return previousStock === newStock ? [] : [{
      variantKey,
      previousStock,
      newStock,
      removed: !Object.prototype.hasOwnProperty.call(current, variantKey)
    }];
  });
}

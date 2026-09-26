type BaseProduct = { id: string; slug?: string; colors?: any[]; sizes?: any[]; variants?: any[] };
const active = (value: any) => value?.active !== false && value?.available !== false && !['inactive', 'hidden', 'archived'].includes(value?.status);
const name = (value: any) => typeof value === 'string' ? value : value?.name || value?.label || value?.id || '';

/** Only explicitly configured colors/sizes with available stock can be chosen. */
export function primeBaseOptions(bases: BaseProduct[], availability: Record<string, any>) {
  const combinations = bases.flatMap(base => {
    const stock = availability[base.slug || base.id] || availability[base.id];
    if (!stock || stock.available === false) return [];
    const colors = (base.colors || []).filter(active).map(c => typeof c === 'string' ? { name: c } : c);
    const sizes = (base.sizes || []).filter(active).map(name).filter(Boolean);
    return colors.flatMap(color => sizes.flatMap(size => {
      const key = `${color.name}_${size}`;
      const variant = stock.variants?.[key];
      const configured = (base.variants || []).find(v => v.colorName === color.name && v.size === size);
      if (configured && !active(configured)) return [];
      if (!variant || variant.available === false || !(variant.availableQuantity > 0)) return [];
      return [{ base, color, size, quantity: variant.availableQuantity }];
    }));
  });
  const colors = [...new Map(combinations.map(item => [item.color.name, item.color])).values()];
  return { combinations, colors, sizes: [...new Set(combinations.map(item => item.size))] };
}

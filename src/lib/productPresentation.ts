export type ProductVisualKind = 'oversized' | 'traditional' | 'cropped' | 'hoodie' | 'shorts' | 'cap';

export interface ProductVisualDefinition {
  kind: ProductVisualKind;
  label: string;
  spriteIndex: number;
  frontMax: readonly [number, number];
  backMax: readonly [number, number];
}

export const PRODUCT_VISUALS: Readonly<Record<ProductVisualKind, ProductVisualDefinition>> = Object.freeze({
  oversized: { kind: 'oversized', label: 'Camiseta Oversized', spriteIndex: 0, frontMax: [30, 40], backMax: [30, 40] },
  traditional: { kind: 'traditional', label: 'Camiseta Tradicional', spriteIndex: 1, frontMax: [30, 40], backMax: [30, 40] },
  cropped: { kind: 'cropped', label: 'Cropped Oversized', spriteIndex: 2, frontMax: [30, 35], backMax: [30, 40] },
  hoodie: { kind: 'hoodie', label: 'Moletom / Casaco', spriteIndex: 3, frontMax: [30, 40], backMax: [30, 40] },
  shorts: { kind: 'shorts', label: 'Bermuda', spriteIndex: 4, frontMax: [15, 20], backMax: [15, 20] },
  cap: { kind: 'cap', label: 'Boné', spriteIndex: 5, frontMax: [12, 6], backMax: [10, 6] },
});

const normalize = (value: unknown): string => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

export function getProductVisualKind(product: any): ProductVisualKind {
  const source = normalize([
    product?.baseModel,
    product?.productType,
    product?.category,
    product?.fit,
    product?.name,
    product?.headline,
    ...(Array.isArray(product?.tags) ? product.tags : []),
  ].filter(Boolean).join(' '));

  if (/cropped|boxy feminina|feminino/.test(source)) return 'cropped';
  if (/moletom|casaco|hoodie|jacket|jaqueta/.test(source)) return 'hoodie';
  if (/bermuda|shorts|short|cargo/.test(source)) return 'shorts';
  if (/bone|boné|cap|chapeu|chapéu/.test(source)) return 'cap';
  if (/tradicional|suedine|classic|regular/.test(source)) return 'traditional';
  return 'oversized';
}

export function getProductVisual(product: any): ProductVisualDefinition {
  return PRODUCT_VISUALS[getProductVisualKind(product)];
}

export function getSpritePosition(kind: ProductVisualKind): string {
  const index = PRODUCT_VISUALS[kind].spriteIndex;
  const column = index % 3;
  const row = Math.floor(index / 3);
  return `${column * 50}% ${row * 100}%`;
}


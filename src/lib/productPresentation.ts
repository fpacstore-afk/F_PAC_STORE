import type { CSSProperties } from 'react';
import { parsePrimePrintSize } from '../../shared/primeArtworkSizing';
import { getCustomizationProfileById } from '../../shared/customizationProfiles';

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
  hoodie: { kind: 'hoodie', label: 'Moletom / Casaco', spriteIndex: 3, frontMax: [30, 25], backMax: [30, 40] },
  shorts: { kind: 'shorts', label: 'Bermuda', spriteIndex: 4, frontMax: [3, 3], backMax: [10, 10] },
  cap: { kind: 'cap', label: 'Boné', spriteIndex: 5, frontMax: [12, 8], backMax: [10, 6] },
});

export const PRIME_VISUAL_AREA_ANCHORS = Object.freeze({
  shorts: Object.freeze({
    front: Object.freeze({ left: 80, top: 48, baseWidth: 4.5 }),
    back: Object.freeze({ left: 66, top: 28, baseWidth: 20 }),
  }),
  cap: Object.freeze({
    front: Object.freeze({ left: 50, top: 50, baseWidth: 34 }),
  }),
});

type PrimeVisualAnchor = { left: number; top: number; baseWidth: number; rotationDeg?: number };

export function getPrimeVisualAreaStyle(
  kind: ProductVisualKind,
  placement: { id: string; maxWidth: number },
  printSize: string,
): CSSProperties {
  const [width, height] = parsePrimePrintSize(printSize) || [1, 1];
  const widthRatio = Math.min(1, width / placement.maxWidth);
  const anchor: PrimeVisualAnchor | undefined = kind === 'shorts'
    ? PRIME_VISUAL_AREA_ANCHORS.shorts[placement.id as 'front' | 'back']
    : kind === 'cap' ? PRIME_VISUAL_AREA_ANCHORS.cap.front : undefined;
  const baseWidth = anchor?.baseWidth ?? (placement.id === 'sleeve' ? 13 : 34);
  const rotationDeg = getCustomizationProfileById(kind)?.printAreas.find(area => area.id === placement.id)?.rotationDeg ?? anchor?.rotationDeg ?? 0;
  const minimumWidth = kind === 'shorts' && placement.id === 'front' ? 1 : 7;
  return {
    left: `${anchor?.left ?? (placement.id === 'sleeve' ? 24 : 50)}%`,
    top: `${anchor?.top ?? (placement.id === 'sleeve' ? 42 : kind === 'cropped' ? 51 : 49)}%`,
    width: `${Math.max(baseWidth * widthRatio, minimumWidth)}%`,
    aspectRatio: `${width} / ${height}`,
    transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
  };
}

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
  if (/oversized/.test(source)) return 'oversized';
  if (/tradicional|traditional|suedine|classic|regular/.test(source)) return 'traditional';
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


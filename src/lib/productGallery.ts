import type { Product } from '../types/product';
import { resolveVerifiedCatalogMedia } from './verifiedCatalogMedia';

/** Prefer the selected color and exclude images explicitly assigned to another color. */
export function getProductGallery(
  product: Pick<Product, 'images' | 'colorVariants' | 'mockups'> | null | undefined,
  selectedColor: string,
  fallbackImages: string[] = [],
): string[] {
  const general = resolveVerifiedCatalogMedia((product?.images?.length ? product.images : fallbackImages).filter(Boolean), selectedColor);
  const normalizedColor = selectedColor.trim().toLocaleLowerCase('pt-BR');
  const variant = product?.colorVariants?.find(
    color => color.name.trim().toLocaleLowerCase('pt-BR') === normalizedColor,
  );
  const variantImages = variant?.images?.filter(Boolean) || [];
  const mockupImages = (product?.mockups || [])
    .filter(mockup => mockup.colorName?.trim().toLocaleLowerCase('pt-BR') === normalizedColor)
    .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || a.order - b.order)
    .map(mockup => mockup.url)
    .filter(Boolean);
  const colorImages = [...variantImages, ...mockupImages];
  if (!normalizedColor) return [...new Set(general)];
  const selectedImages = new Set(colorImages);
  const otherColorImages = new Set([
    ...(product?.colorVariants || [])
      .filter(color => color.name.trim().toLocaleLowerCase('pt-BR') !== normalizedColor)
      .flatMap(color => color.images || []),
    ...(product?.mockups || [])
      .filter(mockup => mockup.colorName?.trim() && mockup.colorName.trim().toLocaleLowerCase('pt-BR') !== normalizedColor)
      .map(mockup => mockup.url),
  ]);
  const generalImages = general.filter(url => !otherColorImages.has(url) || selectedImages.has(url));
  return [...new Set([...colorImages, ...generalImages])];
}

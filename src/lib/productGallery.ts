import type { Product } from '../types/product';

/** Show images for the selected garment color first, followed by the general gallery. */
export function getProductGallery(
  product: Pick<Product, 'images' | 'colorVariants' | 'mockups'> | null | undefined,
  selectedColor: string,
  fallbackImages: string[] = [],
): string[] {
  const general = (product?.images?.length ? product.images : fallbackImages).filter(Boolean);
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
  return colorImages.length ? [...new Set([...colorImages, ...general])] : general;
}

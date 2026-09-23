import type { Product } from '../types/product';

/** Show the selected garment color first; older products retain their general gallery. */
export function getProductGallery(
  product: Pick<Product, 'images' | 'colorVariants'> | null | undefined,
  selectedColor: string,
  fallbackImages: string[] = [],
): string[] {
  const general = (product?.images?.length ? product.images : fallbackImages).filter(Boolean);
  const variant = product?.colorVariants?.find(
    color => color.name.trim().toLocaleLowerCase('pt-BR') === selectedColor.trim().toLocaleLowerCase('pt-BR'),
  );
  const colorImages = variant?.images?.filter(Boolean) || [];
  return colorImages.length ? [...new Set([...colorImages, ...general])] : general;
}

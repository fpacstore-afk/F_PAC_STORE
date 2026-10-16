// These immutable image references were checked in the published FP gallery.
// Only recognized images receive color labels; unrelated uploads stay untouched.
const verifiedImages = [
  { reference: '1790265191025-1751e7e5', colors: ['preto'] },
  { reference: '1790265187193-2c28a8c5', colors: ['preto'] },
  { reference: '1790265181534-e8f55c75', colors: ['azul marinho'] },
  { reference: '1790265184250-b0c07fd5', colors: ['marrom', 'marrom café'] },
  { reference: '1790265189924-352b2a80', colors: ['verde militar'] },
];
export const FP_BLACK_ANGLE_IMAGE = '/product-visuals/force-fp-preto-angle-v1.webp';

export function resolveVerifiedCatalogMedia(images: string[], selectedColor: string): string[] {
  const color = selectedColor.trim().toLocaleLowerCase('pt-BR');
  if (!color) return images;
  const hasPrimary = images.some(url => url.includes(verifiedImages[0].reference));
  return images.flatMap(url => {
    const verified = verifiedImages.find(image => url.includes(image.reference));
    if (!verified) return [url];
    if (!verified.colors.includes(color)) return [];
    // Both black uploads contain the same photograph (identical SHA-256).
    if (hasPrimary && verified === verifiedImages[1]) return [];
    return color === 'preto' ? [url, FP_BLACK_ANGLE_IMAGE] : [url];
  });
}

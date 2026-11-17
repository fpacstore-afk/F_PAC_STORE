export const CATALOG_IMAGE_WIDTHS = [160, 320, 640, 960, 1440] as const;
export const CATALOG_IMAGE_FOLDER = 'catalog-media/images/';

export function isCatalogImageName(name: string) {
  return /^\d{13}-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}-[a-z\d._-]{1,120}$/i.test(name);
}

export function getCatalogImageName(source: string): string | undefined {
  try {
    const url = new URL(source);
    if (url.origin !== 'https://firebasestorage.googleapis.com') return;
    if (url.username || url.password || url.searchParams.get('alt') !== 'media') return;
    const encoded = url.pathname.match(/^\/v0\/b\/fpac-store62\.firebasestorage\.app\/o\/([^/]+)$/)?.[1];
    const objectName = encoded && decodeURIComponent(encoded);
    if (!objectName?.startsWith(CATALOG_IMAGE_FOLDER)) return;
    const name = objectName.slice(CATALOG_IMAGE_FOLDER.length);
    return isCatalogImageName(name) ? name : undefined;
  } catch { return undefined; }
}

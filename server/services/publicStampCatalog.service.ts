import { getDb } from '../firebase.js';

export type PublicStamp = {
  id: string;
  code: string;
  name: string;
  category: string;
  collection: string;
  compatibleProducts: string[];
  theme: string;
  tags: string[];
  description: string;
  pngUrl: string;
  mockupUrl: string;
  thumbnailUrl: string;
  videoUrl: string;
  dominantColors: string[];
  colorVariants: Array<{ name: string; hex: string; pngUrl?: string; mockupUrl?: string }>;
  author: string;
  status: 'active';
  availableForCustomization: boolean;
  readyToShip: boolean;
  displayOrder: number;
  availableSizes: string[];
};

/** Public projection deliberately excludes stock balances, production files, and edit history. */
export function toPublicStamp(id: string, data: any): PublicStamp | null {
  const status = String(data?.status || 'active');
  const pngUrl = String(data?.pngUrl || data?.image || '');
  const mockupUrl = String(data?.mockupUrl || data?.thumbnailUrl || data?.image || pngUrl);
  const thumbnailUrl = String(data?.thumbnailUrl || data?.mockupUrl || data?.image || pngUrl);
  const videoUrl = String(data?.videoUrl || data?.video?.url || '');
  const availableForCustomization = data?.availableForCustomization !== false;
  const readyToShip = data?.readyToShip === true;

  if (status !== 'active' || !(mockupUrl || thumbnailUrl || pngUrl || videoUrl) || !(availableForCustomization || readyToShip)) {
    return null;
  }

  return {
    id,
    code: String(data?.code || `EST-${id.slice(0, 4).toUpperCase()}`),
    name: String(data?.name || 'Estampa Sem Nome').trim() || 'Estampa Sem Nome',
    category: String(data?.category || 'Frases'),
    collection: String(data?.collection || 'MARK'),
    compatibleProducts: Array.isArray(data?.compatibleProducts) && data.compatibleProducts.length
      ? data.compatibleProducts.map((value: unknown) => String(value).trim()).filter(Boolean)
      : ['Todos os produtos'],
    theme: String(data?.theme || 'Streetwear'),
    tags: Array.isArray(data?.tags) ? data.tags.map((value: unknown) => String(value)) : [],
    description: String(data?.description || ''),
    pngUrl,
    mockupUrl,
    thumbnailUrl,
    videoUrl,
    dominantColors: Array.isArray(data?.dominantColors) ? data.dominantColors.map((value: unknown) => String(value)) : ['#000000', '#EAB308'],
    colorVariants: Array.isArray(data?.colorVariants)
      ? data.colorVariants.slice(0, 8).map((variant: any) => ({
          name: String(variant?.name || ''),
          hex: String(variant?.hex || ''),
          ...(variant?.pngUrl ? { pngUrl: String(variant.pngUrl) } : {}),
          ...(variant?.mockupUrl ? { mockupUrl: String(variant.mockupUrl) } : {}),
        }))
      : [],
    author: String(data?.author || 'F PAC Creative Lab'),
    status: 'active',
    availableForCustomization,
    readyToShip,
    displayOrder: Number.isFinite(Number(data?.displayOrder)) ? Number(data.displayOrder) : 9999,
    availableSizes: Array.isArray(data?.availableSizes)
      ? data.availableSizes.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 5)
      : [],
  };
}

export async function getPublicStampCatalog(): Promise<{ stamps: PublicStamp[] }> {
  const snapshot = await getDb().collection('designs').get();
  const stamps = snapshot.docs
    .map(document => toPublicStamp(document.id, document.data()))
    .filter((stamp): stamp is PublicStamp => Boolean(stamp))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'pt-BR'));
  return { stamps };
}

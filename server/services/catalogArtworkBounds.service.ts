import sharp from 'sharp';
import { getDb } from '../firebase.js';
import { normalizeArtwork } from './artwork.service.js';
import { fetchRemoteArtwork } from './remoteArtwork.service.js';
import { getVisibleArtworkBounds, type ArtworkBounds } from '../../shared/primePlacement.js';

export function createCatalogArtworkBoundsService(deps = { getDb, fetchRemoteArtwork }) {
  const cache = new Map<string, { expires: number; bounds: ArtworkBounds }>();
  let activeReads = 0;
  return async (id: string): Promise<ArtworkBounds> => {
    if (!/^[\w-]{1,160}$/.test(id)) throw Object.assign(new Error('Arte não encontrada.'), { status: 404 });
    const document = await deps.getDb().collection('designs').doc(id).get();
    const design = document.data();
    if (!document.exists || !design || ![undefined, 'active'].includes(design.status) || design.availableForCustomization === false || design.available === false) {
      throw Object.assign(new Error('Arte não encontrada.'), { status: 404 });
    }
    const source = String(design.pngUrl || design.image || '');
    if (!source) throw Object.assign(new Error('Arte não encontrada.'), { status: 404 });
    const key = id + ':' + source;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.bounds;
    if (activeReads >= 3) throw Object.assign(new Error('Tente aplicar a arte novamente em instantes.'), { status: 429 });
    activeReads++;
    try {
      // The client supplies only an ID, never a URL. Reuse the hardened importer
      // (pinned public DNS, bounded bytes, redirect/time limits) for catalog media.
      const normalized = await normalizeArtwork(await deps.fetchRemoteArtwork(source));
      const { data, info } = await sharp(normalized.data).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const bounds = { sourceWidth: normalized.width, sourceHeight: normalized.height, crop: getVisibleArtworkBounds(data, info.width, info.height) };
      if (cache.size >= 256) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + 10 * 60_000, bounds });
      return bounds;
    } finally { activeReads--; }
  };
}
export const getCatalogArtworkBounds = createCatalogArtworkBoundsService();

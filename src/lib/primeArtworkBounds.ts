import { getVisibleArtworkBounds, type ArtworkBounds } from '../../shared/primePlacement';
import { getApiUrl } from './api';

const cache = new Map<string, Promise<ArtworkBounds>>();

/** Inspect alpha only: never remove white/black pixels or change the source art. */
export function loadPrimeArtworkBounds(src: string, catalogId?: string): Promise<ArtworkBounds> {
  const key = `${catalogId || ''}:${src}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (catalogId) {
    const request = fetch(getApiUrl(`/api/artwork/catalog/${encodeURIComponent(catalogId)}/bounds`)).then(async response => {
      if (!response.ok) throw new Error('Não foi possível medir esta arte. Tente novamente em instantes.');
      return await response.json() as ArtworkBounds;
    });
    cache.set(key, request);
    request.catch(() => cache.delete(key));
    return request;
  }
  const promise = new Promise<ArtworkBounds>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const ratio = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Não foi possível medir a imagem.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const crop = getVisibleArtworkBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        resolve({ sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight, crop });
      } catch {
        reject(new Error('Não foi possível medir esta imagem. Envie o arquivo pela opção Dispositivo.'));
      }
    };
    image.onerror = () => reject(new Error('Não foi possível carregar a arte. Tente novamente ou envie o arquivo.'));
    // The catalog thumbnail may already be cached as an opaque no-CORS image.
    // Use a separate URL for the readable bitmap to avoid reusing that response.
    const readableUrl = new URL(src, window.location.href);
    readableUrl.searchParams.set('primeMeasure', '1');
    image.src = readableUrl.href;
  });
  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}

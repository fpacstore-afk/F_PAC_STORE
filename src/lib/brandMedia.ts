import { convertDriveUrlToDirect, isMediaVideo } from './utils';
import type { MediaSlotConfig } from '../types/mediaSlot';

export function resolveBrandMedia(data: any, field: string, legacyField: string): MediaSlotConfig | null {
  const saved = data?.[field];
  if (saved?.active === false) return null;
  const url = convertDriveUrlToDirect(String(saved?.url ?? data?.[legacyField] ?? '').trim());
  if (!url) return null;
  return { ...saved, id: saved?.id || field, name: saved?.name || field, url, active: true,
    type: saved?.type || (isMediaVideo(url) ? 'video' : 'image'), objectFit: saved?.objectFit || 'cover' };
}

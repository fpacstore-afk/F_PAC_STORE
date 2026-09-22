import { VideoData } from '../types/video';
import { auth } from '../lib/firebase';
import { getPublicApiUrl } from '../lib/api';

/**
 * Validates whether a given URL is a secure Cloudinary resource URL.
 * Only accepts URLs from the official 'res.cloudinary.com' domain.
 */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsedUrl = new URL(url.trim());
    return parsedUrl.protocol === 'https:' && parsedUrl.hostname === 'res.cloudinary.com';
  } catch {
    return false;
  }
}

/** Optimizes a Cloudinary video URL by injecting auto-format and auto-quality parameters. */
export function getOptimizedVideoUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!isCloudinaryUrl(trimmed)) return trimmed;

  const uploadMarker = '/video/upload';
  if (trimmed.includes(uploadMarker)) {
    if (!trimmed.includes('/f_auto') && !trimmed.includes('/f_mp4') && !trimmed.includes('/q_auto') && !trimmed.includes('/br_')) {
      const parts = trimmed.split(uploadMarker);
      return `${parts[0]}${uploadMarker}/f_mp4,q_auto${parts[1]}`;
    }
  }
  return trimmed;
}

/** Safely extracts the string URL from video input. */
export function getVideoUrl(video: any): string {
  if (!video) return '';
  if (typeof video === 'string') return video.trim();
  if (typeof video === 'object' && video !== null) return (video.url || '').trim();
  return '';
}

/** Parses and validates raw video inputs into a structured VideoData model. */
export function parseVideoData(video: any): VideoData {
  const url = getVideoUrl(video);
  if (!url) return { url: '', isCloudinary: false, isValid: false };
  const isCloudinary = isCloudinaryUrl(url);
  let isStoreVideo = false;
  try {
    const parsed = new URL(url);
    isStoreVideo = parsed.protocol === 'https:' && parsed.hostname === 'firebasestorage.googleapis.com' && !parsed.username && !parsed.password;
  } catch { /* Invalid links are not rendered. */ }
  return {
    url: isCloudinary ? getOptimizedVideoUrl(url) : isStoreVideo ? url : '',
    isCloudinary,
    isValid: isCloudinary || isStoreVideo,
  };
}

export interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  duration?: number;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
}

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
function validateFile(file: File, video = false) {
  if (!(video ? ['video/mp4', 'video/webm', 'video/quicktime'] : imageTypes).includes(file.type)) throw new Error(video ? 'Use MP4, WebM ou MOV.' : 'Use PNG, JPG/JPEG ou WebP.');
  if (file.size <= 0 || file.size > (video ? 100 : 10) * 1024 * 1024) throw new Error('O arquivo deve ter até ' + (video ? 100 : 10) + ' MB.');
}
async function upload(source: File | string, adminKind?: 'image' | 'video', onProgress?: (value: number) => void): Promise<CloudinaryUploadResponse> {
  let token = '';
  if (adminKind) {
    if (!auth.currentUser) throw new Error('Entre novamente na gestão para enviar o arquivo.');
    token = await auth.currentUser.getIdToken();
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', getPublicApiUrl(adminKind ? '/api/admin/media/upload' : '/api/artwork/upload'));
    xhr.timeout = adminKind === 'video' ? 300_000 : 120_000;
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('Content-Type', typeof source === 'string' ? 'application/json' : source.type);
    if (adminKind) xhr.setRequestHeader('x-media-kind', adminKind);
    if (typeof source !== 'string') xhr.setRequestHeader('x-file-name', encodeURIComponent(source.name));
    xhr.upload.onprogress = event => { if (event.lengthComputable && event.total) onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 100))); };
    xhr.onload = () => {
      let result: any;
      try { result = JSON.parse(xhr.responseText); } catch { reject(new Error('O servidor não confirmou o envio. Tente novamente.')); return; }
      if (xhr.status < 200 || xhr.status >= 300 || typeof result?.secure_url !== 'string') { reject(new Error(result?.message || 'Não foi possível enviar o arquivo. Confira sua conexão e tente novamente.')); return; }
      try {
        const url = new URL(result.secure_url);
        if (url.protocol !== 'https:') throw new Error('invalid');
        if (!adminKind && url.pathname.startsWith('/api/artwork/')) result.secure_url = getPublicApiUrl(url.pathname + url.search);
        onProgress?.(100); resolve(result);
      } catch { reject(new Error('O servidor retornou um endereço de imagem inválido.')); }
    };
    xhr.onerror = () => reject(new Error('Falha de conexão durante o envio. Tente novamente.'));
    xhr.ontimeout = () => reject(new Error('O envio demorou mais que o esperado. Confira sua conexão.'));
    xhr.onabort = () => reject(new Error('O envio foi cancelado.'));
    xhr.send(typeof source === 'string' ? JSON.stringify({ url: source }) : source);
  });
}

// Compatible names; validated server uploads replace the unsigned public preset.
export async function uploadArtworkToCloudinary(file: File, onProgress?: (value: number) => void) {
  validateFile(file); return upload(file, undefined, onProgress);
}
export async function uploadArtworkUrlToCloudinary(rawUrl: string) {
  const url = new URL(rawUrl.trim());
  if (rawUrl.length > 2048 || url.protocol !== 'https:' || url.username || url.password) throw new Error('Use um link público HTTPS direto para a imagem.');
  return upload(url.href);
}
export async function uploadAdminArtwork(file: File, onProgress?: (value: number) => void) {
  validateFile(file); return upload(file, 'image', onProgress);
}
export async function uploadAdminVideo(file: File, onProgress?: (value: number) => void) {
  validateFile(file, true); return upload(file, 'video', onProgress);
}
export const uploadVideoToCloudinary = uploadAdminVideo;

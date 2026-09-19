import { VideoData } from '../types/video';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from '../lib/firebase';
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
  return {
    url: isCloudinary ? getOptimizedVideoUrl(url) : '',
    isCloudinary,
    isValid: isCloudinary,
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

const getCloudinaryPublicConfig = () => {
  let cloudName = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'fpac-store-cloud').trim();
  let uploadPreset = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'fpac_store_public_preset').trim();

  if (cloudName.includes('=')) cloudName = cloudName.split('=').pop()?.trim() || '';
  if (uploadPreset.includes('=')) uploadPreset = uploadPreset.split('=').pop()?.trim() || '';

  if (!cloudName || !uploadPreset) {
    throw new Error('Configuração do Cloudinary ausente. Defina VITE_CLOUDINARY_CLOUD_NAME e VITE_CLOUDINARY_UPLOAD_PRESET no ambiente.');
  }
  return { cloudName, uploadPreset };
};

type UploadSource = File | string;

const uploadToCloudinary = (
  source: UploadSource,
  resourceType: 'image' | 'video',
  onProgress?: (progress: number) => void,
): Promise<CloudinaryUploadResponse> => {
  let config: ReturnType<typeof getCloudinaryPublicConfig>;
  try {
    config = getCloudinaryPublicConfig();
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`);
    xhr.timeout = resourceType === 'video' ? 180_000 : 60_000;

    if (typeof source !== 'string') {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (!response.secure_url || !isCloudinaryUrl(response.secure_url)) {
            reject(new Error('Resposta do Cloudinary não contém uma URL HTTPS válida.'));
            return;
          }
          resolve({
            secure_url: response.secure_url,
            public_id: response.public_id || '',
            duration: response.duration,
            format: response.format,
            width: response.width,
            height: response.height,
            bytes: response.bytes,
          });
        } catch {
          reject(new Error('Erro ao interpretar a resposta do Cloudinary.'));
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText);
          reject(new Error(errRes.error?.message || `Erro no upload (Status: ${xhr.status})`));
        } catch {
          reject(new Error(`Erro no upload (Status: ${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Falha de rede no upload para o Cloudinary.'));
    xhr.ontimeout = () => reject(new Error('O envio demorou mais que o esperado. Verifique sua conexão e tente novamente.'));

    const formData = new FormData();
    formData.append('file', source);
    formData.append('upload_preset', config.uploadPreset);
    xhr.send(formData);
  });
};

/** Uploads a video file to Cloudinary via the configured unsigned upload preset. */
export function uploadVideoToCloudinary(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<CloudinaryUploadResponse> {
  return uploadToCloudinary(file, 'video', onProgress);
}

const ALLOWED_ARTWORK_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;

/** Uploads customer artwork from the current device. */
export function uploadArtworkToCloudinary(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<CloudinaryUploadResponse> {
  if (!ALLOWED_ARTWORK_TYPES.has(file.type)) {
    return Promise.reject(new Error('Formato inválido. Use PNG, JPG/JPEG ou WebP.'));
  }
  if (file.size <= 0 || file.size > MAX_ARTWORK_BYTES) {
    return Promise.reject(new Error('A arte deve ter no máximo 10 MB.'));
  }
  return uploadToCloudinary(file, 'image', onProgress);
}

const sanitizeUploadName = (name: string) => name
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .slice(-120);

const uploadAdminMediaToFirebase = (
  file: File,
  resourceType: 'image' | 'video',
  onProgress?: (progress: number) => void,
): Promise<CloudinaryUploadResponse> => new Promise((resolve, reject) => {
  const folder = resourceType === 'video' ? 'videos' : 'images';
  const objectName = `${Date.now()}-${sanitizeUploadName(file.name || resourceType)}`;
  const storageRef = ref(storage, `catalog-media/${folder}/${objectName}`);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || undefined,
    customMetadata: { source: 'admin-catalog' },
  });
  const timeoutMs = resourceType === 'video' ? 300_000 : 120_000;
  const timeout = window.setTimeout(() => {
    task.cancel();
    reject(new Error('O envio demorou mais que o esperado. Verifique sua conexão e tente novamente.'));
  }, timeoutMs);

  task.on('state_changed', (snapshot) => {
    if (snapshot.totalBytes > 0) {
      onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
    }
  }, (error) => {
    window.clearTimeout(timeout);
    reject(error);
  }, async () => {
    window.clearTimeout(timeout);
    try {
      const secureUrl = await getDownloadURL(task.snapshot.ref);
      onProgress?.(100);
      resolve({
        secure_url: secureUrl,
        public_id: task.snapshot.ref.fullPath,
        bytes: task.snapshot.totalBytes,
      });
    } catch (error) {
      reject(error);
    }
  });
});

const uploadAdminMedia = async (
  file: File,
  resourceType: 'image' | 'video',
  onProgress?: (progress: number) => void,
): Promise<CloudinaryUploadResponse> => {
  const uploadThroughAdminApi = async (): Promise<CloudinaryUploadResponse> => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Sessão de administrador não encontrada. Entre novamente e tente o envio.');
    const token = await currentUser.getIdToken();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', getPublicApiUrl('/api/admin/media/upload'));
      xhr.timeout = resourceType === 'video' ? 300_000 : 120_000;
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.setRequestHeader('x-media-kind', resourceType);
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name || resourceType));
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        }
      };
      xhr.onload = () => {
        let payload: any = null;
        try { payload = JSON.parse(xhr.responseText || '{}'); } catch { /* handled below */ }
        if (xhr.status >= 200 && xhr.status < 300 && payload?.secure_url) {
          onProgress?.(100);
          resolve(payload as CloudinaryUploadResponse);
          return;
        }
        reject(new Error(payload?.message || `Falha no upload pelo servidor (HTTP ${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error('Falha de rede ao enviar o arquivo. Confira a conexão e tente novamente.'));
      xhr.ontimeout = () => reject(new Error('O envio excedeu o tempo limite. Tente novamente em uma conexão estável.'));
      xhr.onabort = () => reject(new Error('O envio foi cancelado antes de terminar.'));
      xhr.send(file);
    });
  };

  try {
    return await uploadThroughAdminApi();
  } catch (serverError) {
    console.warn('[Admin media] API autenticada indisponível; tentando Firebase Storage.', serverError);
    try {
      return await uploadAdminMediaToFirebase(file, resourceType, onProgress);
    } catch (firebaseError) {
      console.warn('[Admin media] Firebase Storage direto indisponível; tentando Cloudinary.', firebaseError);
      try {
        return await uploadToCloudinary(file, resourceType, onProgress);
      } catch (cloudinaryError) {
        console.error('[Admin media] Falha nos três caminhos de upload.', { serverError, firebaseError, cloudinaryError });
        const reasons = [serverError, firebaseError, cloudinaryError]
          .map(error => error instanceof Error ? error.message : '')
          .filter(Boolean);
        throw new Error(reasons[0] || 'Não foi possível enviar o arquivo. Confira sua sessão e conexão e tente novamente.');
      }
    }
  }
};

/** Uploads an admin catalog image to Firebase Storage, with Cloudinary fallback. */
export function uploadAdminArtwork(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<CloudinaryUploadResponse> {
  if (!ALLOWED_ARTWORK_TYPES.has(file.type)) {
    return Promise.reject(new Error('Formato inválido. Use PNG, JPG/JPEG ou WebP.'));
  }
  if (file.size <= 0 || file.size > MAX_ARTWORK_BYTES) {
    return Promise.reject(new Error('A imagem deve ter no máximo 10 MB.'));
  }
  return uploadAdminMedia(file, 'image', onProgress);
}

/** Uploads an admin catalog video to Firebase Storage, with Cloudinary fallback. */
export function uploadAdminVideo(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<CloudinaryUploadResponse> {
  if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
    return Promise.reject(new Error('Formato inválido. Use MP4, WebM ou MOV.'));
  }
  if (file.size <= 0 || file.size > 100 * 1024 * 1024) {
    return Promise.reject(new Error('O vídeo deve ter no máximo 100 MB.'));
  }
  return uploadAdminMedia(file, 'video', onProgress);
}

const isBlockedRemoteHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
};

/**
 * Imports a public HTTPS image link into F PAC's Cloudinary account.
 * The cart never stores the third-party URL: it stores only the trusted Cloudinary URL returned after import.
 */
export function uploadArtworkUrlToCloudinary(rawUrl: string): Promise<CloudinaryUploadResponse> {
  const input = String(rawUrl || '').trim();
  if (!input || input.length > 2048) return Promise.reject(new Error('Informe um link público válido para a imagem.'));

  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || isBlockedRemoteHost(parsed.hostname)) {
      return Promise.reject(new Error('Use um link público HTTPS direto para a imagem.'));
    }
  } catch {
    return Promise.reject(new Error('O link informado não é válido.'));
  }

  return uploadToCloudinary(input, 'image');
}

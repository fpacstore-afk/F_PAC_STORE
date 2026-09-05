import { VideoData } from '../types/video';

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

/**
 * Optimizes a Cloudinary video URL by injecting auto-format and auto-quality parameters.
 */
export function getOptimizedVideoUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();

  if (!isCloudinaryUrl(trimmed)) {
    return trimmed;
  }

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
  if (!url) {
    return { url: '', isCloudinary: false, isValid: false };
  }

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
  let cloudName = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
  let uploadPreset = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim();

  if (cloudName.includes('=')) cloudName = cloudName.split('=').pop()?.trim() || '';
  if (uploadPreset.includes('=')) uploadPreset = uploadPreset.split('=').pop()?.trim() || '';

  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Configuração do Cloudinary ausente. Defina VITE_CLOUDINARY_CLOUD_NAME e VITE_CLOUDINARY_UPLOAD_PRESET no ambiente.',
    );
  }

  return { cloudName, uploadPreset };
};

const uploadToCloudinary = (
  file: File,
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

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

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

    const formData = new FormData();
    formData.append('file', file);
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

/**
 * Uploads customer artwork without persisting base64 content in the cart.
 * PNG, JPEG and WebP are accepted up to 10 MB.
 */
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

import { VideoData } from '../types/estampas';

/**
 * Validates whether a given URL is a secure Cloudinary resource URL.
 * Only accepts URLs from the official 'res.cloudinary.com' domain.
 *
 * @param url The URL string to validate
 * @returns boolean
 */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsedUrl = new URL(url.trim());
    return parsedUrl.hostname === 'res.cloudinary.com';
  } catch (e) {
    // Return false if URL parsing fails
    return false;
  }
}

/**
 * Optimizes a Cloudinary video URL by injecting auto-format and auto-quality parameters
 * if they aren't already present in the transformation path.
 *
 * Example input:  https://res.cloudinary.com/demo/video/upload/sample.mp4
 * Example output: https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/sample.mp4
 *
 * @param url The raw Cloudinary video URL
 * @returns string Optimized video URL
 */
export function getOptimizedVideoUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();

  if (!isCloudinaryUrl(trimmed)) {
    return trimmed; // Return fallback/original if it isn't a Cloudinary URL
  }

  // Inject optimization parameters in Cloudinary delivery path
  const uploadMarker = '/video/upload';
  if (trimmed.includes(uploadMarker)) {
    // Ensure we don't duplicate transformations
    if (!trimmed.includes('/f_auto') && !trimmed.includes('/f_mp4') && !trimmed.includes('/q_auto') && !trimmed.includes('/br_')) {
      const parts = trimmed.split(uploadMarker);
      return `${parts[0]}${uploadMarker}/f_mp4,q_auto${parts[1]}`;
    }
  }

  return trimmed;
}

/**
 * Safely extracts the string URL from the video property, which can be a string or RichVideoDetails.
 */
export function getVideoUrl(video: any): string {
  if (!video) return '';
  if (typeof video === 'string') {
    return video.trim();
  }
  if (typeof video === 'object' && video !== null) {
    return (video.url || '').trim();
  }
  return '';
}

/**
 * Parses and validates raw video inputs into a structured VideoData model.
 *
 * @param video The video source string, URL, or RichVideoDetails object
 * @returns VideoData
 */
export function parseVideoData(video: any): VideoData {
  const url = getVideoUrl(video);
  if (!url) {
    return { url: '', isCloudinary: false, isValid: false };
  }

  const isCloudinary = isCloudinaryUrl(url);
  
  return {
    url: isCloudinary ? getOptimizedVideoUrl(url) : '',
    isCloudinary,
    isValid: isCloudinary // Strictly require Cloudinary for security
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

/**
 * Uploads a video file to Cloudinary via Unsigned Uploads.
 * Reports real-time progress via the onProgress callback.
 *
 * @param file The video File object (MP4 or WebM)
 * @param onProgress Callback to report progress percentage (0 - 100)
 * @returns Promise<CloudinaryUploadResponse>
 */
export function uploadVideoToCloudinary(
  file: File,
  onProgress?: (progress: number) => void
): Promise<CloudinaryUploadResponse> {
  let cloudName = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "").trim();
  let uploadPreset = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "").trim();

  // Sanitize values in case they are formatted as "KEY=VALUE" from env setups
  if (cloudName.includes("=")) {
    cloudName = cloudName.split("=").pop()?.trim() || "";
  }
  if (uploadPreset.includes("=")) {
    uploadPreset = uploadPreset.split("=").pop()?.trim() || "";
  }

  if (!cloudName || !uploadPreset) {
    return Promise.reject(
      new Error(
        "Configuração do Cloudinary ausente. Defina VITE_CLOUDINARY_CLOUD_NAME e VITE_CLOUDINARY_UPLOAD_PRESET no ambiente."
      )
    );
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.secure_url) {
            resolve({
              secure_url: response.secure_url,
              public_id: response.public_id || '',
              duration: response.duration,
              format: response.format,
              width: response.width,
              height: response.height,
              bytes: response.bytes,
            });
          } else {
            reject(new Error("Resposta do Cloudinary não contém secure_url"));
          }
        } catch (e) {
          reject(new Error("Erro ao parsear resposta do Cloudinary"));
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText);
          reject(new Error(errRes.error?.message || `Erro no upload (Status: ${xhr.status})`));
        } catch (e) {
          reject(new Error(`Erro no upload (Status: ${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error("Falha na conexão ou erro de rede no upload para o Cloudinary"));
    };

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);
    
    xhr.send(formData);
  });
}


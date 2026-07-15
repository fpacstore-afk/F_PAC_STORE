import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function resizeImage(file: File, maxWidth = 1200, maxHeight = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Only resize images
    if (!file.type.startsWith('image/')) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(file);
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file); // Fallback to original
            }
          },
          file.type,
          0.8 // Quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

export function convertDriveUrlToDirect(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  // Check for google drive patterns
  if (trimmed.includes('drive.google.com')) {
    let fileId = '';
    // e.g. /file/d/1AZ.../view or /file/d/1AZ.../preview
    const matchD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    // e.g. ?id=1AZ... or &id=1AZ...
    const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    
    if (matchD && matchD[1]) {
      fileId = matchD[1];
    } else if (matchId && matchId[1]) {
      fileId = matchId[1];
    }
    
    if (fileId) {
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }
  }
  return trimmed;
}

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.m4v', '.3gp', '.avi', '.flv'];
  
  if (videoExtensions.some(ext => cleanUrl.endsWith(ext) || url.toLowerCase().includes(ext + '?') || url.toLowerCase().includes(ext))) {
    return true;
  }
  
  if (url.toLowerCase().includes('video') || url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.webm') || url.toLowerCase().includes('.mov')) {
    return true;
  }
  
  return false;
}



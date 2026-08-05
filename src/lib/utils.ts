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

/**
 * Recursively cleans an object for Firestore by removing any keys that have `undefined` values.
 * Firestore throws a runtime error if any property in an object is `undefined`.
 */
export function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Preserve special Firestore types like serverTimestamp(), FieldValue, Timestamp, Date
  if (
    obj instanceof Date ||
    typeof (obj as any).toMillis === 'function' ||
    (obj as any)._methodName
  ) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanFirestoreData) as unknown as T;
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj as Record<string, any>)) {
    if (value === undefined) {
      continue;
    }
    cleaned[key] = cleanFirestoreData(value);
  }
  return cleaned as T;
}




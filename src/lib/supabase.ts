import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Lazy initialization of Supabase client to avoid crash on startup when variables are not configured yet
let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project') || supabaseAnonKey.includes('your-anon-key')) {
      console.warn("⚠️ Supabase credentials are not configured inside environment variables!");
    }
    // We create the client anyway; if variables are empty, it will only throw when calling APIs
    supabaseInstance = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder');
  }
  return supabaseInstance;
}

/**
 * Automatical mapping of folders/categories to standard Supabase buckets:
 * - produtos (public)
 * - banners (public)
 * - estampas (public)
 * - mockups (public)
 * - clientes (private)
 */
export function determineBucket(folder: string): string {
  const f = folder.toLowerCase();
  if (f.includes('product') || f.includes('prod') || f === 'produtos') return 'produtos';
  if (f.includes('banner')) return 'banners';
  if (f.includes('estampa') || f.includes('stamp') || f === 'estampas') return 'estampas';
  if (f.includes('mockup') || f === 'mockups' || f.includes('maquete') || f === 'maquetes') return 'maquetes';
  if (f.includes('client') || f.includes('user') || f.includes('customer') || f.includes('identity') || f === 'clientes') return 'clientes';
  return 'produtos'; // default fallback
}

/**
 * Client side image conversion to WebP dynamically to optimize speed and size
 */
export async function convertToWebP(file: File | Blob): Promise<Blob | File> {
  const allowedWebpConversion = ['image/png', 'image/jpeg', 'image/jpg'];
  if (!allowedWebpConversion.includes(file.type)) {
    return file; // Return as is if already webp or another format
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file); // fallback
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(file);
          }
        }, 'image/webp', 0.85); // Compress to professional quality WebP
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

interface UploadResult {
  url: string;
  path: string;
  bucket: string;
}

/**
 * Main helper to upload file to Supabase Storage, handle validation, WebP optimization, 
 * save metadata in Firestore (supabase_uploads) and return public url.
 */
export async function uploadToSupabase(file: File | Blob, folder: string, customName?: string): Promise<UploadResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project') || supabaseAnonKey.includes('your-anon-key')) {
    throw new Error('Supabase Storage não está configurado. Configure as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no painel de configurações!');
  }

  // 1. Validation limits: Max 5MB
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('O arquivo excede o limite máximo permitido de 5MB.');
  }

  // Validate only image types
  const allowedExtensions = ['image/webp', 'image/png', 'image/jpeg', 'image/jpg'];
  if (!allowedExtensions.includes(file.type)) {
    throw new Error('Tipo de arquivo inválido. Apenas imagens (.webp, .png, .jpg, .jpeg) são permitidas!');
  }

  // 2. Map bucket based on folder argument
  const bucketName = determineBucket(folder);
  const isPrivate = bucketName === 'clientes';

  // 3. Performance auto-conversion to WebP if possible
  const processedBlob = await convertToWebP(file);
  
  // Create sanitized filename to keep storage organized
  const originalName = (customName || (file as any).name || 'image.png').replace(/[^a-zA-Z0-9.-]/g, '_');
  const extension = processedBlob instanceof Blob && processedBlob.type === 'image/webp' ? 'webp' : originalName.split('.').pop() || 'png';
  const baseNameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  const fileName = `${Date.now()}_${baseNameWithoutExt}.${extension}`;
  
  // Custom smart path (produtos/categoria/nome-do-produto etc.)
  // We can organize by folder inside the bucket
  const fileSubPath = `${folder}/${fileName}`.replace('//', '/');

  // 4. Upload to Supabase Bucket
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(fileSubPath, processedBlob, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('Supabase upload error details:', error);
    throw new Error(`Falha no upload do Supabase: ${error.message}`);
  }

  // 5. Retrieve Public or Private Signed URL
  let imageUrl = '';
  if (isPrivate) {
    // For private buckets (clientes), generate a temporary signed url valid for 1 hour
    const { data: signedData, error: signError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(data.path, 3600);
    
    if (signError) {
      throw new Error(`Erro ao gerar URL assinada para bucket privado: ${signError.message}`);
    }
    imageUrl = signedData.signedUrl;
  } else {
    // For public buckets
    const { data: publicData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path);
    
    imageUrl = publicData.publicUrl;
  }

  // 6. DB Requirement: Save image_url, image_path, bucket_name, uploaded_at inside a dedicated Firestore collection
  try {
    await addDoc(collection(db, 'supabase_uploads'), {
      image_url: imageUrl,
      image_path: data.path,
      bucket_name: bucketName,
      original_filename: customName || (file as any).name || 'image.png',
      uploaded_at: serverTimestamp(),
      is_private: isPrivate
    });
  } catch (fsError) {
    console.error('[Supabase Storage Warning] Falha ao registar metadados no Firestore, mas upload concluiu com sucesso:', fsError);
  }

  return {
    url: imageUrl,
    path: data.path,
    bucket: bucketName
  };
}

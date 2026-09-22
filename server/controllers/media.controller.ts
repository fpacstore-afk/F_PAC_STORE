import crypto from 'crypto';
import path from 'path';
import { Request, Response } from 'express';
import { getStorageBucket } from '../firebase.js';
import { logger } from '../utils/logger.js';
import { normalizeArtwork } from '../services/artwork.service.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const cleanFilename = (value: string) => path.basename(value || 'arquivo')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .slice(-120);

export async function uploadAdminMediaController(req: Request, res: Response) {
  try {
    const mediaKind = String(req.headers['x-media-kind'] || '').toLowerCase();
    let contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const isImage = mediaKind === 'image' && IMAGE_TYPES.has(contentType);
    const isVideo = mediaKind === 'video' && VIDEO_TYPES.has(contentType);
    if (!isImage && !isVideo) {
      return res.status(415).json({
        error: 'UNSUPPORTED_MEDIA_TYPE',
        message: mediaKind === 'video'
          ? 'Formato de vídeo inválido. Use MP4, WebM ou MOV.'
          : 'Formato de imagem inválido. Use PNG, JPG/JPEG ou WebP.'
      });
    }

    let body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: 'EMPTY_UPLOAD', message: 'O arquivo recebido está vazio.' });
    }
    const maxBytes = isImage ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
    if (body.length > maxBytes) {
      return res.status(413).json({
        error: 'UPLOAD_TOO_LARGE',
        message: `${isImage ? 'A imagem' : 'O vídeo'} deve ter no máximo ${isImage ? '10 MB' : '100 MB'}.`
      });
    }

    if (isImage) { body = (await normalizeArtwork(body)).data; contentType = 'image/png'; }

    const originalName = cleanFilename(String(req.headers['x-file-name'] || (isImage ? 'imagem' : 'video')));
    const token = crypto.randomUUID();
    const objectName = `catalog-media/${isImage ? 'images' : 'videos'}/${Date.now()}-${crypto.randomUUID()}-${originalName}`;
    const bucket = getStorageBucket();
    const file = bucket.file(objectName);

    await file.save(body, {
      resumable: false,
      validation: 'crc32c',
      metadata: {
        contentType,
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: {
          firebaseStorageDownloadTokens: token,
          source: 'admin-catalog',
          uploadedBy: (req as any).user?.email || (req as any).user?.uid || 'admin'
        }
      }
    });

    const encodedObject = encodeURIComponent(objectName);
    const secureUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedObject}?alt=media&token=${token}`;
    return res.status(201).json({
      secure_url: secureUrl,
      public_id: objectName,
      bytes: body.length,
      format: contentType.split('/')[1]
    });
  } catch (error: any) {
    if ([413, 415].includes(error?.status)) return res.status(error.status).json({ error: 'INVALID_IMAGE', message: error.message });
    logger.error(`❌ [ADMIN-MEDIA-UPLOAD] ${error?.message || error}`, error);
    return res.status(500).json({
      error: 'MEDIA_UPLOAD_FAILED',
      message: error?.message?.includes('FIREBASE_STORAGE_BUCKET')
        ? 'Armazenamento não configurado no servidor. Contate o suporte.'
        : 'O servidor não conseguiu salvar o arquivo. Tente novamente.'
    });
  }
}

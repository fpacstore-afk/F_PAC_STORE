import type { Request, Response } from 'express';
import { artworkService, claimArtworkQuota } from '../services/artwork.service.js';
import { fetchRemoteArtwork } from '../services/remoteArtwork.service.js';
let activeUploads = 0;

export async function uploadArtwork(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  if (activeUploads >= 2) return res.status(429).json({ message: 'Há outros envios em andamento. Tente novamente em instantes.' });
  activeUploads++;
  try {
    await claimArtworkQuota(req.ip || 'unknown');
    const bytes = req.is('application/json') ? await fetchRemoteArtwork(req.body?.url) : req.body;
    return res.status(201).json(await artworkService.save(bytes));
  } catch (error: any) {
    return res.status(error.status || 400).json({ message: error.status ? error.message : 'Não foi possível importar a imagem. Envie um arquivo PNG, JPG ou WebP do dispositivo.' });
  } finally { activeUploads--; }
}
export async function readArtwork(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  try {
    const bytes = await artworkService.read(String(req.params.id), typeof req.query.token === 'string' ? req.query.token : '');
    res.type('png').send(bytes);
  } catch { res.status(404).json({ error: 'ARTWORK_NOT_FOUND' }); }
}

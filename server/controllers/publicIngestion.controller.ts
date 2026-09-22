import type { Request, Response } from 'express';
import { claimIngestionQuota, createPublicIngestion } from '../services/publicIngestion.service.js';

export const ingestPublic = (kind: 'analytics' | 'quiz' | 'promotion') => async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (Number(req.headers['content-length']) > 48_000 || Buffer.byteLength(JSON.stringify(req.body || {})) > 48_000) return res.status(413).json({ message: 'Dados excedem o limite.' });
    await claimIngestionQuota(req.ip || 'unknown');
    const result = await createPublicIngestion()[kind](req.body);
    return res.json({ ok: true, ...(result || {}) });
  } catch (error: any) {
    return res.status(error.status || 503).json({ message: error.status ? error.message : 'Não foi possível salvar agora.' });
  }
};

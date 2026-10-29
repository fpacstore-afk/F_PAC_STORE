import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../firebase.js';
import { logger } from '../utils/logger.js';

/** A transactional counter shared across instances; no raw IP or token is stored. */
export function sharedRequestLimit(scope: string, limit: number, windowMs: number, database = getDb) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now(), window = Math.floor(now / windowMs);
    const reset = (window + 1) * windowMs;
    const retryAfter = Math.max(1, Math.ceil((reset - now) / 1000));
    const id = crypto.createHash('sha256').update(`${scope}:${window}:${req.ip || 'unknown'}`).digest('hex');
    try {
      const db = database();
      const allowed = await db.runTransaction(async (tx: any) => {
        const ref = db.collection('request_limits').doc(id);
        const previous = (await tx.get(ref)).data();
        const count = Number(previous?.count || 0);
        if (count >= limit) return false;
        tx.set(ref, { count: count + 1, expiresAt: new Date(reset + windowMs) });
        return true;
      });
      if (!allowed) {
        res.setHeader('Retry-After', retryAfter);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(429).json({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
      }
      next();
    } catch {
      // Payment and contact ingestion must not silently lose their abuse protection.
      res.setHeader('Retry-After', '30');
      return res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente em instantes.' });
    }
  };
}

export const safeApiError: ErrorRequestHandler = (error, req, res, next) => {
  if (!req.path.startsWith('/api')) return next(error);
  if (res.headersSent) return next(error);
  const messages: Record<number, string> = {
    400: 'Dados inválidos. Confira as informações e tente novamente.',
    403: 'Solicitação não permitida.',
    413: 'Os dados enviados excedem o tamanho permitido.',
    415: 'Formato de envio não permitido.',
  };
  const status = Object.hasOwn(messages, error?.status) ? Number(error.status) : 500;
  logger.error('Falha na API', { method: req.method, path: req.path, status });
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json({ error: messages[status] || 'Serviço temporariamente indisponível. Tente novamente em instantes.' });
};

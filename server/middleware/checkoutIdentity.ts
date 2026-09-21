import admin from 'firebase-admin';
import type { Request, Response, NextFunction } from 'express';

/** Guests are allowed, but a supplied identity must be verified, never trusted from JSON. */
export function createCheckoutIdentityMiddleware(
  verifyIdToken: (token: string) => Promise<{ uid: string }> = token => admin.auth().verifyIdToken(token, true),
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    res.locals.checkoutUserId = null;
    const authorization = req.headers.authorization;
    if (!authorization) return next();
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Entre novamente na sua conta para continuar.' });
    try {
      const identity = await verifyIdToken(match[1]);
      if (!identity.uid) throw new Error('Missing UID');
      res.locals.checkoutUserId = identity.uid;
      return next();
    } catch {
      return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Sua sessão expirou. Entre novamente para continuar.' });
    }
  };
}

export const checkoutIdentity = createCheckoutIdentityMiddleware();

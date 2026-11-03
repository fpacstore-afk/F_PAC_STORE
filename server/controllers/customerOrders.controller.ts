import type { Request, Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from '../firebase.js';
import { sanitizeTrackingResponse } from '../services/tracking.service.js';

/** Customers receive a small projection; internal costs remain admin-only. */
export function createCustomerOrdersController(deps = {
  getDb,
  verifyToken: (token: string): Promise<any> => getAuth().verifyIdToken(token, true),
}) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.vary('Authorization');
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!token) return res.status(401).json({ error: 'Entre na sua conta para consultar os pedidos.' });
    let identity: any;
    try { identity = await deps.verifyToken(token); if (!identity.uid) throw new Error('No UID'); }
    catch { return res.status(401).json({ error: 'Entre novamente na sua conta.' }); }
    try {
      const collection = deps.getDb().collection('orders');
      const snapshots = await Promise.all([
        collection.where('userId', '==', identity.uid).get(),
        identity.email_verified === true && identity.email
          ? collection.where('customerEmail', '==', String(identity.email).toLowerCase()).get() : Promise.resolve(null),
      ]);
      const orders = new Map<string, any>();
      for (const snapshot of snapshots) for (const doc of snapshot?.docs || []) {
        const data = doc.data();
        // An order linked to another UID never falls back to matching email.
        if (data.userId && data.userId !== identity.uid) continue;
        const rawDate = data.createdAt;
        const date = rawDate?.toDate ? rawDate.toDate() : typeof rawDate?.seconds === 'number' ? new Date(rawDate.seconds * 1000) : new Date(rawDate);
        const amount = Number(data.total ?? data.pricing?.total ?? 0);
        orders.set(doc.id, { id: doc.id, total: Number.isFinite(amount) ? amount : 0,
          status: sanitizeTrackingResponse(doc.id, data).status,
          createdAt: Number.isFinite(date.getTime()) ? date.toISOString() : null });
      }
      return res.json({ orders: [...orders.values()].sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || '')) });
    } catch { return res.status(503).json({ error: 'Não foi possível consultar seus pedidos. Tente novamente.' }); }
  };
}
export const getCustomerOrders = createCustomerOrdersController();

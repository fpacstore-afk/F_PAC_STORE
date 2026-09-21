import type { Request, Response } from 'express';
import { getDb } from '../firebase.js';
import { verifyOrderTrackingAccess } from '../services/tracking.service.js';
import { logger } from '../utils/logger.js';

export function createPaymentStatusControllers(deps = { getDb, verifyOrderTrackingAccess }) {
  const respond = async (req: Request, res: Response, snapshot: any) => {
    // Identical response for unknown and unauthorized records avoids an existence oracle.
    const order = snapshot?.exists ? snapshot.data() : null;
    const token = typeof req.query.token === 'string' ? req.query.token : undefined;
    const headerToken = typeof req.headers['x-tracking-token'] === 'string' ? req.headers['x-tracking-token'] : undefined;
    const access = await deps.verifyOrderTrackingAccess(order, req.headers.authorization, token, headerToken);
    if (!access.authorized) return res.status(403).json({ error: 'FORBIDDEN', message: 'Acesso não autorizado ao pedido.' });
    return res.json({
      id: snapshot.id,
      orderId: snapshot.id,
      status: order.status || 'received',
      paymentStatus: order.payment?.status || order.paymentStatus || 'pending',
      // Polling is read-only. Provider reconciliation belongs to the payment pipeline.
      synced: false,
    });
  };
  const handle = (byPayment: boolean) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const id = byPayment ? req.params.paymentId : req.params.orderId;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
        return res.status(400).json({ error: 'INVALID_ID' });
      }
      const database = deps.getDb();
      if (!database) return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
      if (!byPayment) return await respond(req, res, await database.collection('orders').doc(id).get());
      let found = await database.collection('orders').where('mercadoPagoId', '==', id).limit(1).get();
      if (found.empty) found = await database.collection('orders').where('payment_id', '==', id).limit(1).get();
      return await respond(req, res, found.docs[0]);
    } catch (error) {
      logger.error('[PAYMENT-STATUS] Falha ao consultar pedido', error);
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Não foi possível consultar o pagamento agora.' });
    }
  };
  return { verifyCheckout: handle(false), paymentStatus: handle(true) };
}

export const { verifyCheckout, paymentStatus } = createPaymentStatusControllers();

import type { Request, Response } from 'express';
import { correctRecordedPayment } from '../services/paymentCorrection.service.js';
export async function correctRecordedPaymentController(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const result = await correctRecordedPayment({ ...req.body, orderId: req.params.orderId, actor: (req as any).user });
    return res.json(result);
  } catch (error: any) {
    const known = ['INVALID_PAYMENT_CORRECTION','ORDER_NOT_FOUND','IDEMPOTENCY_CONFLICT','PAYMENT_CORRECTION_STALE','PAYMENT_CORRECTION_NOT_ALLOWED','INVALID_INSTALLMENTS'];
    return res.status(known.includes(error.code) ? error.status : 500).json({ error: known.includes(error.code) ? error.code : 'PAYMENT_CORRECTION_FAILED',
      message: known.includes(error.code) ? error.message : 'Não foi possível confirmar a correção. Atualize o pedido antes de tentar novamente.' });
  }
}

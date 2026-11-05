import { Router, type Request, type Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { getPosCashDrawer, listPosCardSettlements, settlePosCard, updatePosCashDrawer } from '../services/posCash.service.js';
import { linkPosAlias, loadPosAliases, transformPosGarments } from '../services/posInventory.service.js';
import { logger } from '../utils/logger.js';
import {
  PosError, cancelPosSale, chargePosSale, completePosSale, expirePosReservations, getPosSale,
  isPosStockConflict, listPendingPosSales, loadPosVariants, preparePosSale
} from '../services/pos.service.js';

export function createPosRouter() {
  const router = Router();
  const handle = (operation: (request: Request, operator: NonNullable<AuthenticatedRequest['user']>) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const operator = (req as AuthenticatedRequest).user;
      if (!operator || operator.role !== 'admin' || operator.uid === 'system-admin-key' || operator.uid === 'sheets-sync-bot') {
        return res.status(403).json({ message: 'Entre com sua conta administrativa para usar o PDV.' });
      }
      try {
        return res.json(await operation(req, operator));
      } catch (error) {
        if (error instanceof PosError) return res.status(error.status).json({ message: error.message });
        if ((error as { status?: number })?.status === 409) return res.status(409).json({ message: 'Estoque físico insuficiente ou alterado. Confira a operação.' });
        if (isPosStockConflict(error)) return res.status(409).json({ message: 'O estoque disponível mudou. Atualize a seleção.' });
        logger.error('[PDV] Falha ao processar operação', error);
        return res.status(503).json({ message: 'Não foi possível confirmar a operação. Consulte a venda antes de cobrar novamente.' });
      }
    };
  router.get('/cash', handle(() => getPosCashDrawer()));
  router.post('/cash/:action', handle((req, operator) => updatePosCashDrawer(req.params.action, req.body, operator)));
  router.get('/cards', handle(() => listPosCardSettlements()));
  router.post('/cards/:id/settle', handle((req, operator) => settlePosCard(req.params.id, req.body, operator)));
  router.get('/variants', handle(async () => {
    const [variants, aliases] = await Promise.all([loadPosVariants(), loadPosAliases()]);
    return { variants, aliases };
  }));
  router.post('/aliases', handle((req, operator) => linkPosAlias(req.body, operator)));
  router.post('/transform', handle((req, operator) => transformPosGarments(req.body, operator)));
  router.get('/sales', handle(async () => ({ sales: await listPendingPosSales() })));
  router.get('/sales/:id', handle(req => getPosSale(req.params.id)));
  router.post('/sales', handle(async (req, operator) => {
    await expirePosReservations();
    return preparePosSale(req.body, operator);
  }));
  router.post('/sales/:id/charge', handle((req, operator) => chargePosSale(req.params.id, req.body?.method, operator)));
  router.post('/sales/:id/complete', handle((req, operator) => completePosSale(req.params.id, operator)));
  router.post('/sales/:id/cancel', handle((req, operator) => cancelPosSale(req.params.id, operator, req.body?.confirmedUnpaid === true)));
  return router;
}

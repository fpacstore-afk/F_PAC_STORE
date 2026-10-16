import { Router } from 'express';
import { createMockupApprovalService } from '../services/mockupApproval.service.js';

const handle = (fn: (req: any, res: any) => Promise<any>) => async (req: any, res: any) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try { await fn(req, res); } catch (error: any) { res.status(error.status || 503).json({ message: error.status ? error.message : 'Não foi possível consultar o mockup. Tente novamente.' }); }
};
export function createMockupAdminRouter(service = createMockupApprovalService()) {
  const router = Router({ mergeParams: true });
  router.get('/', handle(async (req, res) => res.json(await service.adminStatus(req.params.orderId))));
  router.post('/', handle(async (req, res) => res.status(201).json(await service.issue(req.params.orderId, req.body, req.user?.email || req.user?.uid || 'admin'))));
  router.post('/:requestId/revoke', handle(async (req, res) => res.json(await service.revoke(req.params.orderId, req.params.requestId, req.user?.email || req.user?.uid || 'admin'))));
  return router;
}
export function createMockupPublicRouter(service = createMockupApprovalService()) {
  const router = Router();
  const token = (req: any) => /^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization') || '')?.[1] || '';
  router.get('/:requestId', handle(async (req, res) => res.json(await service.publicStatus(req.params.requestId, token(req)))));
  router.get('/:requestId/images/:index', handle(async (req, res) => {
    const bytes = await service.image(req.params.requestId, token(req), /^\d$/.test(req.params.index) ? Number(req.params.index) : -1);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('png').send(bytes);
  }));
  router.post('/:requestId/approve', handle(async (req, res) => res.json(await service.approve(req.params.requestId, token(req), req.body))));
  return router;
}

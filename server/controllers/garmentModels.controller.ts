import { Router } from 'express';
import { getDb } from '../firebase.js';
import { initializeGarmentModels, readGarmentModels, transferGarmentModel, unifyGarmentModel } from '../services/garmentModels.service.js';
export function createGarmentModelsRouter(dbProvider = getDb) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
  const handle = (fn: any) => async (req: any, res: any) => { try { res.json(await fn(req)); } catch (error: any) { res.status(400).json({ error: error.message || 'Não foi possível atualizar os modelos.' }); } };
  router.get('/', handle(() => readGarmentModels(dbProvider())));
  router.post('/initialize', handle((req: any) => initializeGarmentModels(dbProvider(), req.user?.uid || 'admin')));
  router.post('/transfer', handle((req: any) => transferGarmentModel(dbProvider(), req.body, req.user?.uid || 'admin')));
  router.post('/unify', handle((req: any) => unifyGarmentModel(dbProvider(), req.body, req.user?.uid || 'admin')));
  return router;
}

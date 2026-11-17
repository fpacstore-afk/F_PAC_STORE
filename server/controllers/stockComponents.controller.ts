import type { Request, Response } from 'express';
import { getDb } from '../firebase.js';
import { productionUnitCost, readProductionUsage, readStockComponent } from '../../shared/stockValuation.js';

export async function listStockComponents(_req: Request, res: Response) {
  res.set('Cache-Control', 'private, no-store');
  try {
    const snapshot = await getDb().collection('stock_components').get();
    return res.json({ components: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) });
  } catch {
    return res.status(503).json({ error: 'Não foi possível carregar os componentes.' });
  }
}

export async function saveStockComponent(req: Request, res: Response) {
  const id = String(req.params.componentId);
  const revision = req.body?.revision;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    || !Number.isSafeInteger(revision) || revision < 0) {
    return res.status(400).json({ error: 'Identificação ou versão do componente inválida.' });
  }
  let data: ReturnType<typeof readStockComponent>;
  try {
    data = readStockComponent(req.body);
    if (revision === 0 && data.archived) throw new Error('Cadastre o componente antes de arquivá-lo.');
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
  try {
    const db = getDb();
    const ref = db.collection('stock_components').doc(id);
    const component = await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if ((current?.revision ?? 0) !== revision) {
        // A retry after a lost response may return the exact already saved change.
        if (current?.revision === revision + 1 && Object.entries(data).every(([key, value]) => current[key] === value)) {
          return { ...data, revision: current.revision, id };
        }
        return null;
      }
      const saved = { ...data, revision: revision + 1 };
      const updatedAt = new Date().toISOString();
      tx.set(ref, { ...saved, updatedAt, updatedBy: (req as any).user?.uid || 'admin' });
      tx.create(ref.collection('versions').doc(String(saved.revision)), { ...saved, updatedAt, updatedBy: (req as any).user?.uid || 'admin' });
      return { ...saved, id };
    });
    if (!component) return res.status(409).json({ error: 'Este componente mudou em outra sessão. Recarregue e confira os valores.' });
    return res.json({ component });
  } catch {
    return res.status(503).json({ error: 'Não foi possível salvar o componente.' });
  }
}

export async function prepareStockProductCost(db: any, tx: any, productId: string, expectedCost: number | null, metadata: any) {
  const { usage, extraCents } = readProductionUsage(metadata);
  const components = await Promise.all(usage.map(async row => {
    if (row.kind === 'base' && row.reference === productId) throw new Error('Use uma base diferente do produto que está sendo editado.');
    const collection = row.kind === 'component' ? 'stock_components' : 'product_costs';
    const record = (await tx.get(db.collection(collection).doc(row.reference))).data();
    if (!record || record.archived || (row.kind === 'base'
      && (['partial', 'estimated'].includes(record.costCalculation?.coverage) || record.costCalculation?.method === 'stock_components_v1'))) {
      throw new Error('Confira o custo completo de cada base e componente.');
    }
    const unitCostCents = row.kind === 'component' ? record.unitCostCents : Math.round(Number(record.costPrice ?? record.cost) * 100);
    if (!Number.isSafeInteger(unitCostCents) || unitCostCents < 0 || (row.kind === 'base' && unitCostCents === 0)) {
      throw new Error('Cadastre o custo de cada insumo antes de salvar.');
    }
    return { ...row, unitCostCents, usage: row.amount, unitCost: unitCostCents * row.amount / 100 };
  }));
  const total = productionUnitCost([...components, { unitCostCents: extraCents, usage: 1 }]);
  if (total === null || total <= 0 || total / 100 !== expectedCost) {
    throw new Error('O custo de um componente mudou. Recarregue a lista e confira o total.');
  }
  return {
    method: 'stock_components_v1', coverage: 'complete', sourceLabel: 'Composição de estoque conferida',
    unitCost: total / 100, extraCents,
    usage: usage.map(({ kind, reference, quantity }) => ({ kind, reference, quantity })),
    components: components.map(({ kind, reference, unitCostCents, unitCost }) => ({ kind, reference, unitCostCents, unitCost })),
  };
}

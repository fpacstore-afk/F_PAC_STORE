import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getDb } from '../firebase.js';
import { calculateQuote, emptyCatalog, validateCatalog, validateQuote } from '../../shared/pricingWorkbench.js';
import { createQuoteOrderService } from '../services/quoteOrder.service.js';

const clean = (value: any) => JSON.parse(JSON.stringify(value));
const bounded = (value: any, limit = 700000) => {
  if (Buffer.byteLength(JSON.stringify(value)) > limit) throw new Error('Registro muito grande. Divida os dados em registros menores.');
};
function conflict(message: string): never { throw Object.assign(new Error(message), { status: 409 }); }
const quoteSummary = (d: any) => { const q = d.data(); return { id: d.id, version: q.version, status: q.status, title: q.input.title || '', customer: q.input.customer, updatedAt: q.updatedAt, total: q.result.total, products: q.result.items.map((i: any) => i.product?.name || '').join(' ') }; };
async function page(db: any, collection: string, field: string, size: number, after?: unknown) {
  let query = db.collection(collection).orderBy(field, 'desc');
  if (after) {
    if (typeof after !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(after)) throw new Error('Página inválida.');
    const cursor = await db.collection(collection).doc(after).get();
    if (!cursor.exists) throw new Error('Referência da página não encontrada.');
    query = query.startAfter(cursor);
  }
  return query.limit(size).get();
}

// Mounted behind authenticateAdmin. These collections have no client Firestore access.
export function createPricingRouter(dbProvider = getDb) {
  const router = Router();
  const convertQuote = createQuoteOrderService(dbProvider);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
  const handle = (fn: (req: any, res: any) => Promise<void>) => async (req: any, res: any) => {
    try { await fn(req, res); } catch (error: any) {
      const validation = error instanceof Error && !(error as any).code;
      res.status(error.status || (validation ? 400 : 503)).json({ error: validation ? error.message : 'Não foi possível salvar/consultar. Tente novamente; seus dados permanecem no formulário.' });
    }
  };
  const actor = (req: any) => req.user?.uid || 'admin';
  router.get('/catalog', handle(async (_req, res) => {
    const config = await dbProvider().collection('pricing_workbench').doc('catalog').get();
    res.json({ catalog: config.data()?.catalog || emptyCatalog(), version: config.data()?.version || 0 });
  }));
  router.get('/', handle(async (_req, res) => {
    const db = dbProvider();
    const [config, quotes] = await Promise.all([db.collection('pricing_workbench').doc('catalog').get(), db.collection('pricing_workbench_quotes').orderBy('updatedAt', 'desc').limit(200).get()]);
    res.json({ catalog: config.data()?.catalog || emptyCatalog(), version: config.data()?.version || 0, importId: config.data()?.importId || null, quotes: quotes.docs.map(quoteSummary) });
  }));
  router.post('/import', handle(async (req, res) => {
    const { catalog, archive } = req.body || {};
    validateCatalog(catalog); bounded(catalog); bounded(archive || {});
    const db = dbProvider(), ref = db.collection('pricing_workbench').doc('catalog'), id = randomUUID(), now = new Date().toISOString();
    await db.runTransaction(async (tx: any) => {
      const current = await tx.get(ref);
      if (current.exists) conflict('A base já foi iniciada. Atualize os cadastros para preservar o histórico.');
      tx.set(ref, { catalog: clean(catalog), version: 1, importId: id, updatedAt: now });
      // Store raw sheet JSON as text to preserve formulas without Firestore nested-array limits.
      tx.set(db.collection('pricing_workbench_imports').doc(id), { archiveJson: JSON.stringify(archive || {}), createdAt: now, actor: actor(req) });
      tx.set(db.collection('pricing_workbench_events').doc(id), { type: 'import', createdAt: now, actor: actor(req), version: 1, catalog: clean(catalog) });
    });
    res.json({ version: 1, importId: id });
  }));
  router.put('/catalog', handle(async (req, res) => {
    const { catalog, expectedVersion } = req.body || {};
    validateCatalog(catalog); bounded(catalog);
    const db = dbProvider(), ref = db.collection('pricing_workbench').doc('catalog'), now = new Date().toISOString();
    await db.runTransaction(async (tx: any) => {
      const current = await tx.get(ref), version = current.data()?.version || 0;
      if (expectedVersion !== version) conflict('Os cadastros mudaram em outra sessão. Recarregue a base antes de salvar.');
      const next = { ...current.data(), catalog: clean(catalog), version: version + 1, updatedAt: now };
      tx.set(ref, next);
      tx.set(db.collection('pricing_workbench_events').doc(randomUUID()), { type: 'catalog', createdAt: now, actor: actor(req), version: version + 1, catalog: clean(catalog) });
    });
    res.json({ version: expectedVersion + 1 });
  }));
  router.get('/history', handle(async (req, res) => {
    const rows = await page(dbProvider(), 'pricing_workbench_events', 'createdAt', 100, req.query.after);
    res.json(rows.docs.map((d: any) => { const e = d.data(); return { id: d.id, type: e.type, createdAt: e.createdAt, version: e.version, quoteId: e.quoteId || null }; }));
  }));
  router.get('/quotes', handle(async (req, res) => {
    const rows = await page(dbProvider(), 'pricing_workbench_quotes', 'updatedAt', 200, req.query.after);
    res.json(rows.docs.map(quoteSummary));
  }));
  router.get('/history/:id', handle(async (req, res) => {
    const row = await dbProvider().collection('pricing_workbench_events').doc(req.params.id).get();
    if (!row.exists) { res.status(404).json({ error: 'Histórico não encontrado.' }); return; }
    res.json(row.data());
  }));
  router.get('/archive/:id', handle(async (req, res) => {
    const row = await dbProvider().collection('pricing_workbench_imports').doc(req.params.id).get();
    if (!row.exists) { res.status(404).json({ error: 'Importação não encontrada.' }); return; }
    res.json(JSON.parse(row.data().archiveJson));
  }));
  router.get('/quotes/:id', handle(async (req, res) => {
    const row = await dbProvider().collection('pricing_workbench_quotes').doc(req.params.id).get();
    if (!row.exists) { res.status(404).json({ error: 'Orçamento não encontrado.' }); return; }
    res.json({ ...row.data(), id: row.id });
  }));
  router.post('/quotes/:id/order', handle(async (req, res) => {
    res.json(await convertQuote(req.params.id, req.body?.expectedVersion, req.body?.confirmCustomerApproval, actor(req)));
  }));
  router.put('/quotes/:id', handle(async (req, res) => {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(req.params.id)) throw new Error('Identificador inválido.');
    const { input, expectedVersion, catalogVersion, status } = req.body || {};
    validateQuote(input);
    if (!['draft', 'finalized'].includes(status)) throw new Error('Situação inválida.');
    const db = dbProvider(), ref = db.collection('pricing_workbench_quotes').doc(req.params.id), now = new Date().toISOString();
    let saved: any;
    await db.runTransaction(async (tx: any) => {
      const [current, config] = await Promise.all([tx.get(ref), tx.get(db.collection('pricing_workbench').doc('catalog'))]);
      if ((current.data()?.version || 0) !== expectedVersion) conflict('Este orçamento mudou em outra sessão. Abra a versão salva antes de editar.');
      if (current.data()?.status === 'finalized') conflict('Orçamento finalizado. Duplique para preparar uma nova proposta.');
      if (!config.exists || config.data().version !== catalogVersion) conflict('Os preços foram atualizados. Recarregue a base e confira os novos cálculos.');
      const catalog = config.data().catalog, result = calculateQuote(input, catalog);
      if (status === 'finalized' && (result.total == null || result.errors.length)) throw new Error('Corrija os itens e preencha os preços/frete antes de finalizar.');
      saved = clean({ input, result, catalog, catalogVersion, status, version: expectedVersion + 1, createdAt: current.data()?.createdAt || now, updatedAt: now, actor: actor(req) });
      bounded(saved);
      tx.set(ref, saved);
      tx.set(db.collection('pricing_workbench_events').doc(randomUUID()), { ...saved, type: 'quote', quoteId: req.params.id, createdAt: now });
    });
    res.json({ ...saved, id: req.params.id });
  }));
  return router;
}

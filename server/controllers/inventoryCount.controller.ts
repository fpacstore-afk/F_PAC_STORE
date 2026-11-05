import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { getDb } from '../firebase.js';
import { getVariantStats } from '../services/store.service.js';

export async function getInventoryOverview(req: Request, res: Response) {
  try {
    const db = getDb();
    const reference = String(req.query.reference || '');
    const [production, counts] = await Promise.all([db.collection('production_stock').get(), db.collection('inventory_counts').where('reference', '==', reference).get()]);
    const latest = counts.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)).sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0];
    return res.json({ production: production.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((item: any) => item.status !== 'shipped'), latestCount: latest || null });
  } catch { return res.status(503).json({ message: 'Não foi possível carregar o inventário de produção e as contagens salvas.' }); }
}

/** Immutable monthly count; correcting stock remains an explicit, separately logged action. */
export async function saveInventoryCount(req: Request, res: Response) {
  try {
    const { reference, counts, requestId } = req.body || {};
    if (requestId !== undefined && (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId))) return res.status(400).json({ message: 'Identificação da contagem inválida.' });
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reference || '') || !Array.isArray(counts) || !counts.length || counts.length > 3000) return res.status(400).json({ message: 'Informe o mês e pelo menos uma contagem física.' });
    const keys = new Set<string>();
    for (const row of counts) {
      if (!row || typeof row.productSlug !== 'string' || !row.productSlug || row.productSlug.includes('/') || row.productSlug.length > 200 || typeof row.variantKey !== 'string' || !row.variantKey || row.variantKey.length > 200 || !Number.isInteger(row.counted) || row.counted < 0 || row.counted > 1000000 || keys.has(`${row.productSlug}:${row.variantKey}`)) return res.status(400).json({ message: 'Confira os produtos e as quantidades da contagem.' });
      keys.add(`${row.productSlug}:${row.variantKey}`);
    }
    const db = getDb();
    const fingerprint = requestId ? createHash('sha256').update(JSON.stringify([reference,
      counts.map((row: any) => [row.productSlug, row.variantKey, row.counted]).sort()
    ])).digest('hex') : null;
    const collection = db.collection('inventory_counts');
    const ref = requestId ? collection.doc('pos_' + requestId) : collection.doc();
    const result = await db.runTransaction(async tx => {
      if (fingerprint) {
        const prior = (await tx.get(ref)).data();
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw new Error('Esta identificação já foi usada para outra contagem.');
          return { id: ref.id, reference, capturedAt: prior.capturedAt, differenceCount: prior.differenceCount, countedVariants: prior.lines.length };
        }
      }
      const lines: any[] = [];
      const cached = new Map<string, any>();
      for (const row of counts) {
        if (!cached.has(row.productSlug)) {
          const snap = await tx.get(db.collection('inventory').doc(row.productSlug));
          cached.set(row.productSlug, snap.data());
        }
        const inv = cached.get(row.productSlug);
        if (!inv?.variants?.[row.variantKey]) throw new Error('Uma variação não está mais cadastrada. Atualize o inventário antes de salvar.');
        const stats = getVariantStats(inv.variants[row.variantKey]);
        lines.push({ ...row, physicalQuantity: stats.physicalQuantity, reservedQuantity: stats.reservedQuantity, availableQuantity: stats.availableQuantity, difference: row.counted - stats.physicalQuantity });
      }
      const production = await tx.get(db.collection('production_stock'));
      const pending = production.docs.map(doc => ({ orderId: doc.id, ...doc.data() })).filter((item: any) => item.status !== 'shipped');
      // A matching count confirms ready stock without changing its quantity.
      // Divergences remain pending until an explicit official stock adjustment.
      for (const [slug, inv] of cached) {
        const variants = { ...inv.variants };
        for (const line of lines.filter(row => row.productSlug === slug && row.difference === 0)) variants[line.variantKey] = { ...variants[line.variantKey], physicalCountVerified: true };
        tx.update(db.collection('inventory').doc(slug), { variants });
      }
      const capturedAt = new Date().toISOString();
      const data = { reference, capturedAt, countedBy: (req as any).user?.email || (req as any).user?.uid || 'Admin', lines, production: pending, differenceCount: lines.filter(line => line.difference !== 0).length };
      tx.set(ref, { ...data, ...(fingerprint ? { fingerprint } : {}) });
      return { id: ref.id, reference, capturedAt, differenceCount: data.differenceCount, countedVariants: lines.length };
    });
    return res.status(201).json({ success: true, ...result });
  } catch (error: any) { return res.status(409).json({ message: error.message || 'Não foi possível salvar a contagem.' }); }
}

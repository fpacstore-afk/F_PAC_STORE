import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../firebase.js';
import { variantAvailable } from '../../shared/sharedGarmentStock.js';
import { requiresGarmentClassification } from '../../shared/garmentModels.js';
import { normalizeProductStatus } from '../../shared/productPublication.js';

/** Only repair the cached parent flag; physical pieces and reservations stay immutable. */
export function stockAvailabilityAudit(documents: Array<{ id: string; data: any }>, products: any[] = []) {
  const eligible = new Set<string>(products.filter(product => ['active','draft'].includes(normalizeProductStatus(product.status)) && !product.mergedIntoProductId && !product.rangeArchived && !requiresGarmentClassification(product)).flatMap(product => [product.id, product.slug].filter(Boolean)));
  const issues = documents.flatMap(({ id, data }) => {
    if (!eligible.has(id) || data.available !== false || data.active === false) return [];
    const available = Object.keys(data.variants || {}).reduce((sum, key) => sum + variantAvailable({ ...data, available: true }, key), 0);
    return available > 0 ? [{ productSlug: id, availableQuantity: available }] : [];
  }).sort((a,b) => a.productSlug.localeCompare(b.productSlug));
  const fingerprint = documents.map(({ id, data }) => [id, data.active ?? null, data.available ?? null, Object.entries(data.variants || {}).sort(([a],[b]) => a.localeCompare(b))]).sort((a,b) => String(a[0]).localeCompare(String(b[0])));
  const hash = createHash('sha256').update(JSON.stringify([fingerprint, [...eligible].sort()])).digest('hex');
  return { checked: documents.length, issues, hash };
}

export async function getStockAvailabilityAudit(_req: Request, res: Response) {
  res.setHeader('Cache-Control','no-store');
  try {
    const db = getDb();
    const [snapshot, products] = await Promise.all([db.collection('inventory').get(), db.collection('products').get()]);
    return res.json(stockAvailabilityAudit(snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })), products.docs.map(doc => ({ ...doc.data(), id: doc.id }))));
  } catch { return res.status(500).json({ message: 'Não foi possível conferir a disponibilidade do estoque.' }); }
}

export async function repairStockAvailability(req: Request, res: Response) {
  res.setHeader('Cache-Control','no-store');
  const hash = req.body?.hash;
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return res.status(400).json({ message: 'Confira a disponibilidade antes de corrigir.' });
  try {
    const db = getDb();
    const result = await db.runTransaction(async tx => {
      const previous = await tx.get(db.collection('inventory_availability_repairs').doc(hash));
      if (previous.exists) return { ...previous.data(), replayed: true };
      const [snapshot, products] = await Promise.all([tx.get(db.collection('inventory')), tx.get(db.collection('products'))]);
      const audit = stockAvailabilityAudit(snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })), products.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      if (audit.hash !== hash) throw Object.assign(new Error('O estoque mudou. Confira novamente antes de corrigir.'), { status: 409 });
      if (audit.issues.length > 400) throw new Error('Divida a conferência antes de corrigir este volume de registros.');
      for (const issue of audit.issues) tx.update(db.collection('inventory').doc(issue.productSlug), { available: true, updatedAt: FieldValue.serverTimestamp() });
      const report = { checked: audit.checked, repaired: audit.issues, hash, performedBy: (req as any).user?.uid || 'admin', createdAt: new Date().toISOString() };
      tx.set(db.collection('inventory_availability_repairs').doc(hash), report);
      return report;
    });
    return res.json(result);
  } catch (error: any) { return res.status(error.status || 500).json({ message: error.status === 409 ? error.message : 'Não foi possível corrigir a disponibilidade.' }); }
}

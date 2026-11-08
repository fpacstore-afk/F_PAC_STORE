import type { Request, Response } from 'express';
import { getDb } from '../firebase.js';
import { projectPublicProduct } from '../services/publicCatalog.service.js';

export async function createProductReview(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  const { productId, name, rating, comment, styleInfo } = req.body || {};
  const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  if (!text(productId, 128) || productId.includes('/') || !text(name, 200) || !text(comment, 1000) ||
      typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5 ||
      (styleInfo != null && (typeof styleInfo !== 'string' || styleInfo.length > 100))) {
    return res.status(400).json({ error: 'Confira o produto, nome, nota e comentário do depoimento.' });
  }
  try {
    const db = getDb();
    const product = await db.collection('products').doc(productId).get();
    if (!product.exists || !projectPublicProduct(product.id, product.data())) return res.status(404).json({ error: 'Produto não encontrado.' });
    const ref = db.collection('reviews').doc();
    await ref.set({ id: ref.id, productId, name: name.trim(), rating, comment: comment.trim(),
      ...(styleInfo ? { styleInfo: styleInfo.trim() } : {}),
      verified: false, userId: res.locals.checkoutUserId || null, createdAt: new Date().toISOString() });
    return res.status(201).json({ id: ref.id });
  } catch {
    return res.status(503).json({ error: 'Não foi possível enviar o depoimento. Tente novamente em instantes.' });
  }
}

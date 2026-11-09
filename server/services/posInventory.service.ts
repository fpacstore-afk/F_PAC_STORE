import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveGarmentBase, stockSlug, variantAvailable } from '../../shared/sharedGarmentStock.js';
import { getDb } from '../firebase.js';
import { isPosVariantEligible, loadPosVariants, PosError, posOrderId, type PosOperator } from './pos.service.js';
import { buildUpdatedInventory, getVariantStats } from './store.service.js';
import { applyOrderStampStockInTransaction } from './stampStock.service.js';

const aliasPattern = /^[A-Z0-9][A-Z0-9._-]{3,63}$/;
const aliasId = (alias: string) => createHash('sha256').update(alias).digest('hex');
export async function loadPosAliases() {
  const aliases = await getDb().collection('pos_barcode_aliases').get();
  return aliases.docs.map(doc => ({ alias: String(doc.data().alias), code: String(doc.data().code) }));
}

export async function linkPosAlias(body: any, operator: PosOperator) {
  const alias = typeof body?.alias === 'string' ? body.alias.trim().toUpperCase() : '';
  if (!aliasPattern.test(alias) || /^FP[A-F0-9]{20}$/.test(alias)) throw new PosError(400, 'Informe um código de fornecedor válido.');
  const variants = await loadPosVariants();
  const variant = variants.find(item => item.code === body?.code);
  if (!variant) throw new PosError(404, 'Variação não encontrada.');
  if (variants.some(item => item.code !== variant.code && item.sku.toUpperCase() === alias)) {
    throw new PosError(409, 'O código já identifica outra variação.');
  }
  const db = getDb();
  const ref = db.collection('pos_barcode_aliases').doc(aliasId(alias));
  const invRef = db.collection('inventory').doc(variant.slug);
  return db.runTransaction(async tx => {
    const [prior, inv] = await Promise.all([tx.get(ref), tx.get(invRef)]);
    if (prior.exists && prior.data()?.code !== variant.code) throw new PosError(409, 'Código vinculado a outra variação.');
    if (!Object.hasOwn(inv.data()?.variants || {}, variant.variantKey)) throw new PosError(409, 'A variação mudou. Atualize o estoque.');
    if (!prior.exists) tx.set(ref, { alias, code: variant.code, linkedBy: operator.uid, linkedAt: FieldValue.serverTimestamp() });
    return { alias, code: variant.code };
  });
}

export async function transformPosGarments(body: any, operator: PosOperator) {
  const requestId = posOrderId(body?.requestId).slice('MANUAL-PDV-'.length);
  const quantity = body?.quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100 || typeof body?.consumeStamps !== 'boolean') {
    throw new PosError(400, 'Informe a quantidade e confirme como registrar o consumo das estampas.');
  }
  const db = getDb();
  const variants = await loadPosVariants();
  const source = variants.find(row => row.code === body?.sourceCode && row.finish === 'plain');
  const target = variants.find(row => row.code === body?.targetCode && row.finish === 'ready');
  if (!source || !target || source.variantKey !== target.variantKey || source.slug === target.slug) {
    throw new PosError(400, 'Escolha uma peça lisa e uma pronta da mesma cor e tamanho.');
  }
  const signature = JSON.stringify([source.code, target.code, quantity, body.consumeStamps]);
  const eventRef = db.collection('pos_stock_conversions').doc(requestId);
  const sourceRef = db.collection('inventory').doc(source.slug), targetRef = db.collection('inventory').doc(target.slug);
  return db.runTransaction(async tx => {
    const prior = await tx.get(eventRef);
    if (prior.exists) {
      if (prior.data()?.signature !== signature) throw new PosError(409, 'Esta tentativa já pertence a outra transformação.');
      return { transformed: true, requestId };
    }
    const [sourceDoc, targetDoc, products] = await Promise.all([tx.get(sourceRef), tx.get(targetRef), tx.get(db.collection('products'))]);
    const catalog = products.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    const from = catalog.find(item => item.id === source.productId);
    const to = catalog.find(item => item.id === target.productId);
    if (!from || !to || stockSlug(from) !== source.slug || stockSlug(to) !== target.slug ||
        !isPosVariantEligible(from, source.variantKey) || !isPosVariantEligible(to, target.variantKey) ||
        from.productFinish !== 'plain' || to.productFinish !== 'printed' ||
        stockSlug(resolveGarmentBase(to, catalog) || {}) !== source.slug) {
      throw new PosError(409, 'A peça lisa não é a base de estoque cadastrada para esta peça estampada.');
    }
    const before = sourceDoc.data(), after = targetDoc.data();
    const sourceVariant = before?.variants?.[source.variantKey], targetVariant = after?.variants?.[target.variantKey];
    if (!sourceVariant || !targetVariant || variantAvailable(before, source.variantKey) < quantity) {
      throw new PosError(409, 'Estoque de peças lisas insuficiente ou variação indisponível.');
    }
    const targetStats = getVariantStats(targetVariant, target.slug, target.variantKey);
    if (targetStats.active === false || after?.active === false ||
        ((targetStats.physicalQuantity !== 0 || targetStats.reservedQuantity !== 0) && targetVariant.physicalCountVerified !== true)) {
      throw new PosError(409, 'Confira o estoque físico da peça pronta no Inventário antes de transformar.');
    }
    if (body.consumeStamps) {
      await applyOrderStampStockInTransaction(tx, db, 'PDV-PROD-' + requestId, [{
        productId: target.productId, slug: target.slug, color: target.color, quantity
      }], 'stock_production');
    }
    const now = new Date().toISOString();
    for (const [row, ref, inventory, delta] of [[source, sourceRef, before!, -quantity], [target, targetRef, after!, quantity]] as const) {
      const raw = inventory.variants[row.variantKey];
      const stats = getVariantStats(raw, row.slug, row.variantKey);
      const physical = stats.physicalQuantity + delta, available = physical - stats.reservedQuantity;
      const totals = buildUpdatedInventory(inventory, row.slug, row.variantKey, {
        ...raw, physicalQuantity: physical, stock: physical, availableQuantity: available, available: available > 0,
        ...(delta > 0 ? { physicalCountVerified: true } : {}), updatedAt: now
      });
      tx.update(ref, {
        variants: totals.updatedVariants, stock: totals.totalPhysical, totalPhysicalStock: totals.totalPhysical,
        totalReservedStock: totals.totalReserved, totalAvailableStock: totals.totalAvailable, available: totals.totalAvailable > 0, updatedAt: FieldValue.serverTimestamp()
      });
      const movement = db.collection('stock_movements').doc();
      tx.set(movement, {
        id: movement.id, type: delta < 0 ? 'exit' : 'entry', productSlug: row.slug, variantKey: row.variantKey,
        quantity: Math.abs(delta), sku: stats.sku, referenceType: 'pos_stock_conversion', referenceId: requestId,
        previousPhysicalQuantity: stats.physicalQuantity, newPhysicalQuantity: physical,
        previousReservedQuantity: stats.reservedQuantity, newReservedQuantity: stats.reservedQuantity,
        previousAvailableQuantity: stats.availableQuantity, newAvailableQuantity: available,
        performedBy: operator.email || operator.uid, createdAt: now, reason: 'Transformação de peça lisa em peça pronta.'
      });
    }
    tx.set(eventRef, {
      signature, source: source.code, target: target.code, quantity, consumedStamps: body.consumeStamps,
      performedBy: operator.uid, createdAt: FieldValue.serverTimestamp()
    });
    return { transformed: true, requestId };
  });
}

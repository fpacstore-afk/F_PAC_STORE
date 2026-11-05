import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { financialDateKey } from '../../shared/cashFlow.js';
import { requiresGarmentClassification } from '../../shared/garmentModels.js';
import { isGarmentVariantAllowed, stockSlug, variantAvailable } from '../../shared/sharedGarmentStock.js';
import { getDb } from '../firebase.js';
import { deriveLedgerEventId } from './financialLedger.service.js';
import { prepareManualOrderCosts } from './orderCosts.service.js';
import { consumeStockReservationInTransaction, getVariantStats, OutOfStockError, releaseStockReservation, reserveStock } from './store.service.js';

export const POS_METHODS = ['PIX', 'DINHEIRO', 'DÉBITO', 'CRÉDITO'] as const;
export type PosOperator = { uid: string; email?: string };
type PosVariant = {
  code: string; productId: string; slug: string; variantKey: string; name: string;
  color: string; size: string; neckline: string; finish: 'plain' | 'ready';
  sku: string; unitCents: number; available: number; physical: number; reserved: number;
};
type Selection = { code: string; quantity: number; unitCents: number };
const labelCode = /^FP[A-F0-9]{20}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const holdDuration = 15 * 60 * 1000;

export class PosError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function posOrderId(value: unknown) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new PosError(400, 'Identificador de venda inválido.');
  return 'MANUAL-PDV-' + value;
}
function unitCents(product: any) {
  const base = Number(product.price);
  const promo = Number(product.promotionalPrice);
  const price = promo > 0 && promo < base ? promo : base;
  return Number.isFinite(price) && price > 0 && price <= 100000 ? Math.round(price * 100) : 0;
}
export function isPosVariantEligible(product: any, key: string) {
  return !product.parentSlug && !product.is_prime && !product.customizable &&
    !['inactive', 'archived', 'deleted', 'draft'].includes(String(product.status || '').toLowerCase()) &&
    !requiresGarmentClassification(product) && isGarmentVariantAllowed(product, key);
}
function projection(order: any) {
  return {
    orderId: String(order.id),
    requestId: String(order.id).slice('MANUAL-PDV-'.length),
    state: String(order.posState),
    total: Number(order.total),
    expiresAt: String(order.posExpiresAt),
    method: String(order.paymentMethod || ''),
    lines: (order.items || []).map((item: any) => ({
      code: item.posCode, name: item.name, color: item.color, size: item.size,
      quantity: item.quantity, unitCents: Math.round(item.price * 100)
    }))
  };
}

export async function loadPosVariants(): Promise<PosVariant[]> {
  const db = getDb();
  const [products, inventories] = await Promise.all([db.collection('products').get(), db.collection('inventory').get()]);
  const bySlug = new Map<string, FirebaseFirestore.DocumentData>(inventories.docs.map(doc => [doc.id, doc.data()]));
  const slugCounts = new Map<string, number>();
  const catalog = products.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  for (const product of catalog) {
    const slug = stockSlug(product);
    slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
  }
  return catalog.flatMap((product: any) => {
    const slug = stockSlug(product);
    const inventory = bySlug.get(slug);
    if (!inventory || slugCounts.get(slug) !== 1 || product.parentSlug) return [];
    return Object.entries(inventory.variants || {}).flatMap(([key, variant]: [string, any]) => {
      if (!variant || !isPosVariantEligible(product, key)) return [];
      const stats = getVariantStats(variant, slug, key);
      const finish = product.productFinish === 'plain' ? 'plain' : 'ready';
      const verified = finish === 'plain' || product.productFinish !== 'printed' || variant.physicalCountVerified === true;
      const code = 'FP' + createHash('sha256').update(JSON.stringify([slug, key])).digest('hex').slice(0, 20).toUpperCase();
      return [{
        code, productId: product.id, slug, variantKey: key,
        name: String(product.name || slug), color: stats.color, size: stats.size,
        neckline: String(product.neckline || product.collar || ''), finish,
        sku: String(stats.sku || ''), unitCents: unitCents(product),
        available: verified ? variantAvailable(inventory, key) : 0,
        physical: stats.physicalQuantity, reserved: stats.reservedQuantity
      }];
    });
  });
}

export async function preparePosSale(input: any, operator: PosOperator) {
  const orderId = posOrderId(input?.requestId);
  if (!Array.isArray(input?.lines) || input.lines.length < 1 || input.lines.length > 20) {
    throw new PosError(400, 'Informe de 1 a 20 variações por venda.');
  }
  const lines: Selection[] = input.lines.map((line: any) => {
    if (typeof line?.code !== 'string' || !labelCode.test(line.code) || !Number.isSafeInteger(line.quantity) ||
        line.quantity < 1 || line.quantity > 100 || !Number.isSafeInteger(line.unitCents) || line.unitCents <= 0) {
      throw new PosError(400, 'Confira os códigos, preços e quantidades.');
    }
    return { code: line.code, quantity: line.quantity, unitCents: line.unitCents };
  });
  if (new Set(lines.map(line => line.code)).size !== lines.length) throw new PosError(400, 'Agrupe as unidades da mesma variação.');
  lines.sort((a, b) => a.code.localeCompare(b.code));
  const fingerprint = createHash('sha256').update(JSON.stringify(lines)).digest('hex');
  const db = getDb();
  const ref = db.collection('orders').doc(orderId);
  const replay = (order: any) => {
    if (order?.posFingerprint !== fingerprint) throw new PosError(409, 'Esta tentativa já pertence a outro carrinho.');
    return projection(order);
  };
  const existing = await ref.get();
  if (existing.exists) return replay(existing.data());

  const byCode = new Map((await loadPosVariants()).map(row => [row.code, row]));
  const expected = lines.map(line => {
    const variant = byCode.get(line.code);
    if (!variant || variant.available < line.quantity) throw new PosError(409, 'Saldo insuficiente. Atualize as peças do carrinho.');
    if (variant.unitCents !== line.unitCents) throw new PosError(409, 'O preço mudou. Atualize o carrinho e confira o valor.');
    return variant;
  });
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0) / 100;
  const now = new Date();
  const items = expected.map((variant, index) => ({
    id: variant.code, posCode: variant.code, productId: variant.productId,
    slug: variant.slug, variantKey: variant.variantKey, name: variant.name,
    color: variant.color, size: variant.size, quantity: lines[index].quantity,
    price: variant.unitCents / 100
  }));
  const order = await prepareManualOrderCosts({
    id: orderId, items, customerName: 'Venda presencial', customerPhone: '',
    origin: 'PDV', gateway: 'manual', isManual: true, orderKind: 'sale',
    status: 'payment_pending', productionStatus: 'ready', shippingStatus: 'pending',
    shippingMethod: 'Retirada', shipping: 0, subtotal: total, total,
    paymentStatus: 'pending', payment: { status: 'pending', paidAmount: 0, pendingAmount: total },
    amountPaid: 0, balanceDue: total, stockControl: 'move', inventoryLifecycle: 'reserved',
    suppressAutomaticNotifications: true, saleDate: financialDateKey(now),
    recordedBy: operator.email || operator.uid, posState: 'reserved', posFingerprint: fingerprint,
    posExpiresAt: new Date(now.getTime() + holdDuration).toISOString()
  }, db);
  await reserveStock(orderId, order.items, undefined, order, undefined, (allocated, catalog) => {
    for (const [index, item] of allocated.entries()) {
      const variant = expected[index];
      const product = catalog.find(product => product.id === variant.productId);
      const allocation = item.inventoryAllocations?.[0];
      if (!product || !isPosVariantEligible(product, variant.variantKey) || unitCents(product) !== variant.unitCents ||
          item.inventoryAllocations?.length !== 1 || allocation.productSlug !== variant.slug ||
          allocation.source !== variant.finish || allocation.variantKey !== variant.variantKey || allocation.quantity !== item.quantity) {
        throw new PosError(409, 'O preço ou o estoque físico mudou. Atualize o carrinho.');
      }
    }
  });
  return replay((await ref.get()).data());
}

export async function getPosSale(requestId: unknown) {
  const ref = getDb().collection('orders').doc(posOrderId(requestId));
  const order = (await ref.get()).data();
  if (!order?.posState) throw new PosError(404, 'Venda do PDV não encontrada.');
  return projection(order);
}

export async function chargePosSale(requestId: unknown, method: unknown, operator: PosOperator) {
  if (typeof method !== 'string' || !POS_METHODS.some(option => option === method)) throw new PosError(400, 'Escolha uma forma de pagamento.');
  const db = getDb();
  const ref = db.collection('orders').doc(posOrderId(requestId));
  return db.runTransaction(async tx => {
    const order = (await tx.get(ref)).data();
    if (!order?.posState) throw new PosError(404, 'Venda do PDV não encontrada.');
    if (['charging', 'completed'].includes(order.posState) && order.paymentMethod === method) return projection(order);
    if (order.posState !== 'reserved' || Date.parse(order.posExpiresAt) <= Date.now()) {
      throw new PosError(409, 'Reserva encerrada ou pagamento já iniciado. Consulte a venda.');
    }
    const patch = { posState: 'charging', paymentMethod: method, posChargeStartedBy: operator.uid, posChargeStartedAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() };
    tx.update(ref, patch);
    return projection({ ...order, ...patch });
  });
}

export async function completePosSale(requestId: unknown, operator: PosOperator) {
  const orderId = posOrderId(requestId);
  const db = getDb();
  const ref = db.collection('orders').doc(orderId);
  return db.runTransaction(async tx => {
    const order = (await tx.get(ref)).data();
    if (!order?.posState) throw new PosError(404, 'Venda do PDV não encontrada.');
    if (order.posState === 'completed') return projection(order);
    if (order.posState !== 'charging' || order.paymentStatus !== 'pending' || Number(order.amountPaid) !== 0 ||
        order.inventoryLifecycle !== 'reserved' || order.shippingStatus !== 'pending') {
      throw new PosError(409, 'Venda indisponível para confirmação. Confira o pedido antes de cobrar novamente.');
    }
    const drawerRef = order.paymentMethod === 'DINHEIRO' ? db.collection('pos_cash_drawer').doc('current') : null;
    const drawer = drawerRef ? (await tx.get(drawerRef)).data() : null;
    const card = ['DÉBITO', 'CRÉDITO'].includes(order.paymentMethod);
    const idempotencyKey = 'pos_payment_' + orderId;
    const eventId = deriveLedgerEventId(idempotencyKey);
    const eventRef = db.collection('financial_events').doc(eventId);
    if ((await tx.get(eventRef)).exists) throw new PosError(409, 'Recebimento já registrado. Confira o financeiro.');
    await consumeStockReservationInTransaction(tx, db, orderId, order.items, 'shipping_shipped_' + orderId, order);
    const stamp = new Date().toISOString();
    const day = financialDateKey(stamp)!;
    const total = order.total;
    const actor = operator.email || operator.uid;
    const patch = {
      ...(card ? { posCardSettlement: { state: 'awaiting' } } : {}),
      ...(drawer?.state === 'open' ? { posCashSessionId: drawer.sessionId } : {}),
      posState: 'completed', status: 'delivered', productionStatus: 'completed', shippingStatus: 'delivered',
      shipping: 0, deliveredAt: stamp, inventoryLifecycle: 'consumed',
      paymentStatus: 'approved', amountPaid: total, balanceDue: 0,
      payment: { status: 'approved', method: order.paymentMethod, paidAt: day, paidAmount: total, pendingAmount: 0 },
      paymentLogs: [{ id: eventId, amount: total, method: order.paymentMethod, date: day, recordedAt: stamp, recordedBy: actor }],
      history: FieldValue.arrayUnion({ type: 'manual_payment', status: 'approved', amount: total, timestamp: stamp, operator: actor, message: 'Pagamento e entrega confirmados no PDV.' }),
      updatedAt: FieldValue.serverTimestamp()
    };
    if (drawerRef && drawer?.state === 'open') {
      const cents = Math.round(total * 100);
      tx.update(drawerRef, { expectedCents: drawer.expectedCents + cents, salesCents: drawer.salesCents + cents });
    }
    tx.update(ref, patch);
    tx.set(eventRef, {
      id: eventId, orderId, type: 'payment_approved', amount: total, previousStatus: 'pending', newStatus: 'approved',
      previousPaidAmount: 0, newPaidAmount: total, previousPendingAmount: total, newPendingAmount: 0,
      previousRefundedAmount: 0, newRefundedAmount: 0, paymentMethod: order.paymentMethod, provider: 'manual',
      paymentDate: day, actorId: operator.uid, actorEmail: operator.email || '', idempotencyKey,
      reason: 'Recebimento confirmado no PDV', createdAt: stamp, recordedAt: FieldValue.serverTimestamp()
    });
    return projection({ ...order, ...patch });
  });
}

export async function cancelPosSale(requestId: unknown, operator: PosOperator, confirmedUnpaid: boolean, expiredOnly = false) {
  const orderId = posOrderId(requestId);
  const current = await getPosSale(requestId);
  if (current.state === 'cancelled') return current;
  const now = new Date();
  const result = await releaseStockReservation(orderId, [], 'pos_cancel_' + orderId, {
    validate: order => Boolean(order?.posState && order.paymentStatus === 'pending' && Number(order.amountPaid) === 0 && order.inventoryLifecycle === 'reserved' &&
      (expiredOnly ? order.posState === 'reserved' && Date.parse(order.posExpiresAt) <= now.getTime()
        : order.posState === 'reserved' || (order.posState === 'charging' && confirmedUnpaid))),
    update: {
      posState: 'cancelled', status: 'cancelled', paymentStatus: 'cancelled', 'payment.status': 'cancelled',
      balanceDue: 0, 'payment.pendingAmount': 0,
      inventoryLifecycle: 'released', stockReverted: true, stockRevertedAcknowledged: true,
      history: FieldValue.arrayUnion({ type: 'pos_cancelled', timestamp: now.toISOString(), operator: operator.email || operator.uid,
        message: expiredOnly ? 'Reserva do PDV expirada sem início de cobrança.' : 'Reserva do PDV cancelada sem pagamento.' }),
      updatedAt: FieldValue.serverTimestamp()
    }
  });
  const sale = await getPosSale(requestId);
  if (result.skipped && !expiredOnly && sale.state !== 'cancelled') throw new PosError(409, 'Só é possível cancelar uma venda sem recebimento confirmado.');
  return sale;
}

export async function expirePosReservations() {
  const db = getDb();
  const active = await db.collection('orders').where('posState', '==', 'reserved').limit(50).get();
  for (const doc of active.docs) {
    if (Date.parse(doc.data().posExpiresAt) <= Date.now()) await cancelPosSale(doc.id.slice('MANUAL-PDV-'.length), { uid: 'system' }, false, true);
  }
}
export async function listPendingPosSales() {
  const active = await getDb().collection('orders').where('posState', 'in', ['reserved', 'charging']).limit(50).get();
  return active.docs.map(doc => projection(doc.data()));
}
export function isPosStockConflict(error: unknown) { return error instanceof OutOfStockError; }

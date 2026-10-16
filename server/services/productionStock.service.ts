import { FieldValue } from 'firebase-admin/firestore';
import { aggregateInventoryItems, getVariantStats } from './store.service.js';

/** Blanks become work in progress when physically sent to printing. Never put
 * personalized pieces back into the blank pool on cancellation or a stage rewind. */
export async function transferGarmentsToProduction(transaction: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore, orderId: string, order: any, stage: string) {
  if (order.inventoryAllocationVersion !== 1) return;
  const plainItems = order.items.flatMap((item: any) => (item.inventoryAllocations || []).filter((a: any) => a.source === 'plain').map((a: any) => ({ ...item, parentSlug: a.productSlug, variantKey: a.variantKey, quantity: a.quantity, inventoryAllocations: undefined })));
  if (!plainItems.length) return;
  const ref = db.collection('production_stock').doc(orderId);
  const existing = await transaction.get(ref);
  const now = new Date().toISOString();
  const status = ['ready', 'completed'].includes(stage) ? 'ready' : 'in_production';
  if (existing.exists) {
    if (['shipped', 'cancelled'].includes(existing.data()?.status)) return;
    transaction.update(ref, { status, updatedAt: now });
    return;
  }
  const reads: any[] = [];
  for (const item of aggregateInventoryItems(plainItems)) {
    const invRef = db.collection('inventory').doc(item.parentSlug);
    const resRef = db.collection('stock_reservations').doc(`${orderId}_${item.parentSlug}_${item.variantKey}`);
    const inv = await transaction.get(invRef);
    const reservation = await transaction.get(resRef);
    if (!inv.exists || !reservation.exists || reservation.data()?.status !== 'active') throw new Error('INVENTORY_INCONSISTENCY: confira a reserva da camisa lisa antes de produzir.');
    reads.push({ item, invRef, resRef, data: inv.data(), reservation: reservation.data() });
  }
  const working = new Map(reads.map(r => [r.item.parentSlug, r.data]));
  for (const r of reads) {
    const data = working.get(r.item.parentSlug)!;
    const variant = data.variants[r.item.variantKey];
    const stats = getVariantStats(variant);
    const quantity = Number(r.reservation.quantity);
    if (quantity !== r.item.quantity || stats.physicalQuantity < quantity || stats.reservedQuantity < quantity) throw new Error('INVENTORY_INCONSISTENCY: saldo da camisa lisa não confere com a produção.');
    const variants = { ...data.variants, [r.item.variantKey]: { ...variant, physicalQuantity: stats.physicalQuantity - quantity, stock: stats.physicalQuantity - quantity, reservedQuantity: stats.reservedQuantity - quantity, availableQuantity: stats.availableQuantity, available: stats.availableQuantity > 0 } };
    working.set(r.item.parentSlug, { ...data, variants });
    const physical = Object.values(variants).reduce<number>((sum, v: any) => sum + Number(v.physicalQuantity ?? v.stock ?? 0), 0);
    const reserved = Object.values(variants).reduce<number>((sum, v: any) => sum + Number(v.reservedQuantity ?? 0), 0);
    transaction.update(r.invRef, { variants, totalPhysicalStock: physical, stock: physical, totalReservedStock: reserved, totalAvailableStock: physical - reserved, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(r.resRef, { status: 'consumed', source: 'production', consumedAt: now, updatedAt: now });
    transaction.set(db.collection('stock_movements').doc(`${orderId}_production_${r.item.parentSlug}_${r.item.variantKey}`), { orderId, productSlug: r.item.parentSlug, variantKey: r.item.variantKey, quantity, type: 'production_consumption', previousPhysicalQuantity: stats.physicalQuantity, newPhysicalQuantity: stats.physicalQuantity - quantity, previousReservedQuantity: stats.reservedQuantity, newReservedQuantity: stats.reservedQuantity - quantity, previousAvailableQuantity: stats.availableQuantity, newAvailableQuantity: stats.availableQuantity, createdAt: now, reason: `Camisa lisa enviada à estamparia do pedido #${orderId}` });
  }
  transaction.set(ref, { orderId, status, items: plainItems.map((item: any) => ({ productSlug: item.parentSlug, productId: item.productId || '', name: item.name, color: item.color, size: item.size, variantKey: item.variantKey, quantity: item.quantity })), createdAt: now, updatedAt: now });
}

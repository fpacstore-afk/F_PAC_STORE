import { FieldValue } from 'firebase-admin/firestore';
import { allocateGarments } from '../../shared/sharedGarmentStock.js';
import { aggregateInventoryItems, getVariantStats } from './store.service.js';

/** Reallocate edited custom orders atomically against their original reserved pools. */
export async function reconcileSharedStockEdit(tx: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore, orderId: string, order: any, nextItems: any[], revision: number) {
  const [products, inventory] = await Promise.all([tx.get(db.collection('products')), tx.get(db.collection('inventory'))]);
  const catalog = products.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  const data = new Map<string, any>(inventory.docs.map(doc => [doc.id, doc.data()]));
  const oldItems = aggregateInventoryItems(order.items);
  const oldByKey = new Map(oldItems.map(item => [`${item.parentSlug}::${item.variantKey}`, item]));
  const originals = new Map<string, any>();
  const reservations = new Map<string, any>();
  for (const item of oldItems) {
    const key = `${item.parentSlug}::${item.variantKey}`;
    const ref = db.collection('stock_reservations').doc(`${orderId}_${item.parentSlug}_${item.variantKey}`);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.status !== 'active' || snap.data()?.quantity !== item.quantity) throw new Error('Esta peça já entrou em produção ou sua reserva mudou. Confira a produção antes de editar.');
    reservations.set(key, { ref, data: snap.data() });
    const inv = data.get(item.parentSlug);
    const variant = inv?.variants?.[item.variantKey];
    const stats = getVariantStats(variant);
    if (!variant || stats.reservedQuantity < item.quantity) throw new Error('A reserva anterior não confere com o saldo da camisa lisa.');
    originals.set(key, stats);
    data.set(item.parentSlug, { ...inv, variants: { ...inv.variants, [item.variantKey]: { ...variant, reservedQuantity: stats.reservedQuantity - item.quantity, available: true } } });
  }
  const resolved = allocateGarments(nextItems, catalog, data);
  const newItems = aggregateInventoryItems(resolved);
  const newByKey = new Map(newItems.map(item => [`${item.parentSlug}::${item.variantKey}`, item]));
  const keys = new Set([...oldByKey.keys(), ...newByKey.keys()]);
  for (const key of keys) {
    if (!reservations.has(key)) {
      const item = newByKey.get(key)!;
      const ref = db.collection('stock_reservations').doc(`${orderId}_${item.parentSlug}_${item.variantKey}`);
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()?.status === 'consumed') throw new Error('Uma variação já foi utilizada na produção deste pedido.');
      reservations.set(key, { ref, data: snap.data() || {} });
    }
  }
  const now = new Date().toISOString();
  for (const key of keys) {
    const oldItem = oldByKey.get(key);
    const newItem = newByKey.get(key);
    const item = newItem || oldItem!;
    const inv = data.get(item.parentSlug);
    const variant = inv.variants[item.variantKey];
    const stats = getVariantStats(variant);
    const previous = originals.get(key) || stats;
    const reserved = stats.reservedQuantity + Number(newItem?.quantity || 0);
    const available = stats.physicalQuantity - reserved;
    const variants = { ...inv.variants, [item.variantKey]: { ...variant, reservedQuantity: reserved, availableQuantity: available, available: available > 0 } };
    data.set(item.parentSlug, { ...inv, variants });
    const physicalTotal = Object.values(variants).reduce<number>((sum, v: any) => sum + Number(v.physicalQuantity ?? v.stock ?? 0), 0);
    const reservedTotal = Object.values(variants).reduce<number>((sum, v: any) => sum + Number(v.reservedQuantity ?? 0), 0);
    tx.update(db.collection('inventory').doc(item.parentSlug), { variants, totalPhysicalStock: physicalTotal, stock: physicalTotal, totalReservedStock: reservedTotal, totalAvailableStock: physicalTotal - reservedTotal, updatedAt: FieldValue.serverTimestamp() });
    const reservation = reservations.get(key);
    tx.set(reservation.ref, { ...reservation.data, orderId, productSlug: item.parentSlug, variantKey: item.variantKey, quantity: newItem?.quantity || oldItem?.quantity || 0, status: newItem ? 'active' : 'released', updatedAt: now }, { merge: true });
    tx.set(db.collection('stock_movements').doc(`${orderId}_edit_${revision}_${item.parentSlug}_${item.variantKey}`), { orderId, productSlug: item.parentSlug, variantKey: item.variantKey, quantity: Math.abs(Number(newItem?.quantity || 0) - Number(oldItem?.quantity || 0)), type: 'reservation_change', previousPhysicalQuantity: stats.physicalQuantity, newPhysicalQuantity: stats.physicalQuantity, previousReservedQuantity: previous.reservedQuantity, newReservedQuantity: reserved, previousAvailableQuantity: previous.availableQuantity, newAvailableQuantity: available, createdAt: now, reason: `Edição ${revision} do pedido manual` });
  }
  return resolved;
}

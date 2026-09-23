import { getDb } from '../firebase.js';

type Transaction = FirebaseFirestore.Transaction;
type Firestore = FirebaseFirestore.Firestore;
type StampRequirement = { stampId: string; quantity: number };

/** Resolve the print recipe from the registered product, never from cart-supplied IDs. */
export async function stampRequirementsInTransaction(transaction: Transaction, db: Firestore, items: any[]): Promise<StampRequirement[]> {
  const requirements = new Map<string, number>();
  for (const item of items || []) {
    const quantity = Math.max(1, Math.trunc(Number(item.quantity) || 1));
    const custom = Array.isArray(item.customization?.prints) ? item.customization.prints : [];
    let ids: string[] = [];
    if (custom.length) {
      ids = custom.map((print: any) => String(print.stampId || '').trim()).filter(id => id && !id.startsWith('own_art_'));
    } else {
      const id = String(item.productId || item.slug || item.id || '').trim();
      if (id) {
        let product = await transaction.get(db.collection('products').doc(id));
        if (!product.exists && item.slug && item.slug !== id) product = await transaction.get(db.collection('products').doc(String(item.slug)));
        const recipe = product.data()?.stampIds;
        if (Array.isArray(recipe) && product.data()?.productFinish === 'printed') ids = recipe.map((stampId: unknown) => String(stampId || '').trim()).filter(Boolean).slice(0, 5);
      }
      // Manual PRIME orders contain a selected print even without the checkout customizer.
      if (!ids.length && Array.isArray(item.printConfigs)) ids = item.printConfigs.map((print: any) => String(print.stampId || '').trim()).filter(Boolean);
    }
    for (const stampId of ids) requirements.set(stampId, (requirements.get(stampId) || 0) + quantity);
  }
  return [...requirements].map(([stampId, quantity]) => ({ stampId, quantity }));
}

export async function applyOrderStampStockInTransaction(
  transaction: Transaction,
  db: Firestore,
  orderId: string,
  items: any[],
  action: 'order_debit' | 'order_release' | 'delivery_reconcile'
) {
  const markerRef = db.collection('stamp_stock_events').doc(`${orderId}_${action}`);
  if ((await transaction.get(markerRef)).exists) return;
  const original = action === 'order_debit' ? null : await transaction.get(db.collection('stamp_stock_events').doc(`${orderId}_order_debit`));
  if (action !== 'order_debit' && !original?.exists) return;
  const requirements: StampRequirement[] = action === 'order_debit'
    ? await stampRequirementsInTransaction(transaction, db, items)
    : (Array.isArray(original?.data()?.requirements) ? original.data()!.requirements : []);
  const reads: { ref: FirebaseFirestore.DocumentReference; stampId: string; quantity: number; before: number }[] = [];
  for (const requirement of requirements) {
    let ref = db.collection('designs').doc(requirement.stampId);
    let snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      ref = db.collection('estampas').doc(requirement.stampId);
      snapshot = await transaction.get(ref);
    }
    // Customer supplied artwork is not a managed stock item. Registered catalog
    // prints must exist; otherwise an order would silently lose its stock trace.
    if (!snapshot.exists) throw new Error(`Estampa ${requirement.stampId} não cadastrada no acervo.`);
    reads.push({ ref, ...requirement, before: Number(snapshot.data()?.stockBalance || 0) });
  }
  const createdAt = new Date().toISOString();
  for (const entry of reads) {
    const { ref, stampId, quantity, before } = entry;
    const deficit = action === 'delivery_reconcile' ? Math.min(quantity, Math.max(0, -before)) : 0;
    const delta = action === 'order_debit' ? -quantity : action === 'order_release' ? quantity : deficit;
    const after = before + delta;
    transaction.update(ref, { stockBalance: after, stockUpdatedAt: createdAt });
    const movementRef = db.collection('stamp_movements').doc(`${orderId}_${action}_${stampId}`);
    transaction.set(movementRef, { orderId, stampId, type: action, quantity: action === 'delivery_reconcile' ? deficit : quantity, delta, balanceBefore: before, balanceAfter: after, createdAt, reason: action === 'delivery_reconcile' ? 'Entrada de produção para cobrir saldo negativo; a baixa já ocorreu na criação do pedido.' : `Pedido ${orderId}` });
    if (deficit) {
      const consumptionRef = db.collection('stamp_movements').doc(`${orderId}_production_consumption_${stampId}`);
      transaction.set(consumptionRef, { orderId, stampId, type: 'production_consumption', quantity: deficit, delta: 0, balanceBefore: after, balanceAfter: after, createdAt, reason: 'Baixa física do material produzido e já reservado pelo pedido.' });
    }
  }
  transaction.set(markerRef, { orderId, action, createdAt, requirements });
}

export async function releaseUnmanagedOrderStamps(orderId: string, items: any[]) {
  const db = getDb();
  return db.runTransaction(transaction => applyOrderStampStockInTransaction(transaction, db, orderId, items, 'order_release'));
}

export async function adjustStampBalance(stampId: string, quantity: number, operator: string, reason: string) {
  const db = getDb();
  return db.runTransaction(async transaction => {
    const ref = db.collection('designs').doc(stampId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('Estampa não encontrada.');
    const before = Number(snapshot.data()?.stockBalance || 0);
    const after = before + quantity;
    const createdAt = new Date().toISOString();
    const movementRef = db.collection('stamp_movements').doc();
    transaction.update(ref, { stockBalance: after, stockUpdatedAt: createdAt });
    transaction.set(movementRef, { stampId, type: 'manual_adjustment', quantity: Math.abs(quantity), delta: quantity, balanceBefore: before, balanceAfter: after, operator, reason, createdAt });
    return { before, after };
  });
}

import { getDb } from '../firebase.js';
import { normalizePrimePrintSize } from '../../shared/primeArtworkSizing.js';
import { resolveProductStampRecipeEntries } from '../../shared/productStampRecipe.js';

type Transaction = FirebaseFirestore.Transaction;
type Firestore = FirebaseFirestore.Firestore;
type StampRequirement = { stampId: string; quantity: number; printSize?: string };
type RequirementInput = StampRequirement;
type StampRead = {
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
  stampId: string;
};

function cleanPrintSize(value: unknown): string {
  const raw = String(value || '').trim();
  return normalizePrimePrintSize(raw) || raw;
}

function sizeIdentity(value: unknown): string {
  return normalizePrimePrintSize(value) || String(value || '').trim().toLowerCase();
}

function recipeRequirementKey(stampId: string, printSize?: string): string {
  return `${stampId}\u0000${sizeIdentity(printSize)}`;
}

function addRequirement(map: Map<string, StampRequirement>, entry: RequirementInput) {
  const stampId = String(entry.stampId || '').trim();
  if (!stampId || stampId.startsWith('own_art_')) return;
  const printSize = cleanPrintSize(entry.printSize) || undefined;
  const key = recipeRequirementKey(stampId, printSize);
  const existing = map.get(key);
  map.set(key, { stampId, printSize, quantity: (existing?.quantity || 0) + entry.quantity });
}

async function collectRequirementInputs(transaction: Transaction, db: Firestore, items: any[]): Promise<StampRequirement[]> {
  const requirements = new Map<string, StampRequirement>();
  for (const item of items || []) {
    const quantity = Math.max(1, Math.trunc(Number(item.quantity) || 1));
    const custom = Array.isArray(item.customization?.prints) ? item.customization.prints : [];
    const id = String(item.productId || item.slug || item.id || '').trim();
    let productData: any;
    if (id) {
      let product = await transaction.get(db.collection('products').doc(id));
      if (!product.exists && item.slug && item.slug !== id) product = await transaction.get(db.collection('products').doc(String(item.slug)));
      productData = product.data();
    }

    // Ready products are server-authoritative: the selected garment color resolves
    // both the artwork variant (e.g. black FP on beige) and its print-size recipe.
    if (productData?.productFinish === 'printed') {
      const recipe = resolveProductStampRecipeEntries(productData, item.color);
      const colorRecipes = productData.stampIdsByColor;
      if (
        colorRecipes && typeof colorRecipes === 'object' && Object.keys(colorRecipes).length > 0 &&
        recipe.length === 0
      ) {
        throw new Error(`Receita de estampa não cadastrada para a cor "${String(item.color || '').trim()}" do produto "${String(productData.name || id)}".`);
      }

      // Checkout snapshots the server-resolved artwork before payment. Verify the
      // live recipe is unchanged, then debit that exact snapshot used on the order.
      const snapshot = Array.isArray(item.stampRecipe) ? item.stampRecipe : [];
      if (snapshot.length) {
        const signature = (entries: any[]) => entries.map(entry =>
          `${String(entry.stampId || '').trim()}\u0000${sizeIdentity(entry.printSize)}`
        );
        const expected = signature(recipe);
        const captured = signature(snapshot);
        if (expected.length !== captured.length || expected.some((value, index) => value !== captured[index])) {
          throw new Error('A receita de estampas do produto mudou durante o checkout. Atualize o carrinho e tente novamente.');
        }
        for (const print of snapshot) {
          addRequirement(requirements, { stampId: print.stampId, printSize: print.printSize, quantity });
        }
      } else {
        for (const print of recipe) {
          addRequirement(requirements, { stampId: print.stampId, printSize: print.printSize, quantity });
        }
      }
      continue;
    }

    if (custom.length) {
      for (const print of custom) {
        addRequirement(requirements, {
          stampId: String(print.stampId || ''),
          printSize: print.printSize || print.size,
          quantity,
        });
      }
      continue;
    }

    // Manual PRIME orders may carry a selected print outside the checkout customizer.
    if (Array.isArray(item.printConfigs)) {
      for (const print of item.printConfigs) {
        addRequirement(requirements, {
          stampId: String(print.stampId || ''),
          printSize: print.printSize || print.size,
          quantity,
        });
      }
    }
  }
  return [...requirements.values()];
}

function registeredSizeKeys(data: FirebaseFirestore.DocumentData): string[] {
  const declared = Array.isArray(data.availableSizes) ? data.availableSizes.map(cleanPrintSize).filter(Boolean) : [];
  if (declared.length) return [...new Set(declared)];
  const counted = data.stockBySize && typeof data.stockBySize === 'object'
    ? Object.keys(data.stockBySize).map(cleanPrintSize).filter(Boolean)
    : [];
  return [...new Set(counted)];
}

function resolveStockSize(data: FirebaseFirestore.DocumentData, requested: string | undefined, action: string): string | undefined {
  const keys = registeredSizeKeys(data);
  const stockBySize = data.stockBySize && typeof data.stockBySize === 'object' ? data.stockBySize as Record<string, number> : {};
  const originalStockKeys = Object.keys(stockBySize);
  const isReversal = action === 'order_release' || action === 'delivery_reconcile';

  // Legacy debit markers did not record a print size. Reverse those against the
  // legacy total only; guessing a new size would invent historical allocation.
  if (isReversal && !requested) return undefined;

  if (requested) {
    const identity = sizeIdentity(requested);
    const matching = keys.find(key => sizeIdentity(key) === identity)
      || originalStockKeys.find(key => sizeIdentity(key) === identity);
    if (matching) return matching;
    if (isReversal) return requested;
    throw new Error(`A medida ${requested} não está cadastrada no estoque da estampa ${String(data.code || data.name || '')}.`);
  }

  if (keys.length === 1) return keys[0];
  if (keys.length > 1) {
    throw new Error(`Selecione a medida da estampa ${String(data.code || data.name || '')} no cadastro do produto ou pedido manual.`);
  }
  return undefined;
}

function stockMapKey(stockBySize: Record<string, number>, size: string): string {
  return Object.keys(stockBySize).find(key => sizeIdentity(key) === sizeIdentity(size)) || size;
}

/** Resolve an immutable recipe from the registered product and its selected garment color. */
export async function stampRequirementsInTransaction(transaction: Transaction, db: Firestore, items: any[]): Promise<StampRequirement[]> {
  return collectRequirementInputs(transaction, db, items);
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
    ? await collectRequirementInputs(transaction, db, items)
    : (Array.isArray(original?.data()?.requirements) ? original.data()!.requirements : []);

  // Read each design document only once; a product may use the same art at more
  // than one size, and Firestore transactions require all reads before any writes.
  const stampReads = new Map<string, StampRead>();
  for (const requirement of requirements) {
    if (stampReads.has(requirement.stampId)) continue;
    let ref = db.collection('designs').doc(requirement.stampId);
    let snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      ref = db.collection('estampas').doc(requirement.stampId);
      snapshot = await transaction.get(ref);
    }
    // Customer supplied artwork is not a managed stock item. Registered catalog
    // prints must exist; otherwise an order would silently lose its stock trace.
    if (!snapshot.exists) throw new Error(`Estampa ${requirement.stampId} não cadastrada no acervo.`);
    stampReads.set(requirement.stampId, { ref, data: snapshot.data() || {}, stampId: requirement.stampId });
  }

  const resolvedRequirements = new Map<string, StampRequirement>();
  for (const requirement of requirements) {
    const stamp = stampReads.get(requirement.stampId)!;
    const printSize = resolveStockSize(stamp.data, requirement.printSize, action);
    const key = recipeRequirementKey(requirement.stampId, printSize);
    const existing = resolvedRequirements.get(key);
    resolvedRequirements.set(key, { stampId: requirement.stampId, printSize, quantity: (existing?.quantity || 0) + requirement.quantity });
  }

  const createdAt = new Date().toISOString();
  const updates = new Map<string, {
    stamp: StampRead;
    stockBySize: Record<string, number>;
    totalBefore: number;
    totalDelta: number;
    entries: Array<{ requirement: StampRequirement; sizeKey?: string; sizeBefore?: number; sizeDelta: number; sizeAfter?: number; delta: number; totalBefore: number; totalAfter: number }>;
  }>();

  for (const requirement of resolvedRequirements.values()) {
    const stamp = stampReads.get(requirement.stampId)!;
    const update = updates.get(requirement.stampId) || {
      stamp,
      stockBySize: { ...(stamp.data.stockBySize || {}) } as Record<string, number>,
      totalBefore: Number(stamp.data.stockBalance || 0),
      totalDelta: 0,
      entries: [],
    };
    const totalBefore = update.totalBefore + update.totalDelta;
    const sizeKey = requirement.printSize ? stockMapKey(update.stockBySize, requirement.printSize) : undefined;
    const sizeBefore = sizeKey
      ? Number(update.stockBySize[sizeKey] ?? (registeredSizeKeys(stamp.data).length === 1 ? stamp.data.stockBalance || 0 : 0))
      : undefined;
    const deficit = action === 'delivery_reconcile'
      ? Math.min(requirement.quantity, Math.max(0, -(sizeBefore ?? totalBefore)))
      : 0;
    const delta = action === 'order_debit' ? -requirement.quantity : action === 'order_release' ? requirement.quantity : deficit;
    const sizeDelta = sizeKey ? delta : 0;
    const totalAfter = totalBefore + delta;
    const sizeAfter = sizeKey ? (sizeBefore || 0) + sizeDelta : undefined;

    if (sizeKey) update.stockBySize[sizeKey] = sizeAfter!;
    update.totalDelta += delta;
    update.entries.push({ requirement, sizeKey, sizeBefore, sizeDelta, sizeAfter, delta, totalBefore, totalAfter });
    updates.set(requirement.stampId, update);
  }

  for (const [stampId, update] of updates) {
    const after = update.totalBefore + update.totalDelta;
    transaction.update(update.stamp.ref, {
      stockBalance: after,
      ...(Object.keys(update.stockBySize).length ? { stockBySize: update.stockBySize } : {}),
      stockUpdatedAt: createdAt,
    });
    for (const entry of update.entries) {
      const { requirement, sizeKey, sizeBefore, sizeAfter, totalBefore, totalAfter } = entry;
      const quantity = action === 'delivery_reconcile'
        ? Math.max(0, entry.delta)
        : requirement.quantity;
      const suffix = sizeKey ? `_${sizeIdentity(sizeKey).replace(/[^a-z0-9]+/g, '-')}` : '';
      const movementRef = db.collection('stamp_movements').doc(`${orderId}_${action}_${stampId}${suffix}`);
      transaction.set(movementRef, {
        orderId,
        stampId,
        ...(sizeKey ? { size: sizeKey, sizeBalanceBefore: sizeBefore, sizeBalanceAfter: sizeAfter } : {}),
        type: action,
        quantity,
        delta: entry.delta,
        balanceBefore: totalBefore,
        balanceAfter: totalAfter,
        createdAt,
        reason: action === 'delivery_reconcile'
          ? 'Entrada de produção para cobrir saldo negativo da medida; a baixa já ocorreu na criação do pedido.'
          : `Pedido ${orderId}`,
      });
      if (quantity && action === 'delivery_reconcile') {
        const consumptionRef = db.collection('stamp_movements').doc(`${orderId}_production_consumption_${stampId}${suffix}`);
        transaction.set(consumptionRef, {
          orderId,
          stampId,
          ...(sizeKey ? { size: sizeKey, sizeBalanceBefore: sizeAfter, sizeBalanceAfter: sizeAfter } : {}),
          type: 'production_consumption',
          quantity,
          delta: 0,
          balanceBefore: totalAfter,
          balanceAfter: totalAfter,
          createdAt,
          reason: 'Baixa física do material produzido e já reservado pelo pedido.',
        });
      }
    }
  }
  transaction.set(markerRef, { orderId, action, createdAt, requirements: [...resolvedRequirements.values()] });
}

/**
 * Reconcile the stock requirements recorded for an existing order while keeping
 * its original debit event immutable. Each edit gets its own idempotent movement
 * record and the order keeps a current requirements snapshot for the next edit.
 */
export async function reconcileOrderStampStockInTransaction(
  transaction: Transaction,
  db: Firestore,
  orderId: string,
  newItems: any[],
  editId: string,
  currentRequirements?: StampRequirement[]
) {
  const debitRef = db.collection('stamp_stock_events').doc(`${orderId}_order_debit`);
  const releaseRef = db.collection('stamp_stock_events').doc(`${orderId}_order_release`);
  const [debitSnap, releaseSnap] = await Promise.all([transaction.get(debitRef), transaction.get(releaseRef)]);
  const nextRaw = await stampRequirementsInTransaction(transaction, db, newItems);
  const previousRaw = Array.isArray(currentRequirements)
    ? currentRequirements
    : (Array.isArray(debitSnap.data()?.requirements) ? debitSnap.data()!.requirements : []);

  if (!debitSnap.exists && nextRaw.length) {
    throw Object.assign(new Error('Não há registro de baixa de estampas para reconciliar este pedido com segurança.'), { code: 'STAMP_STOCK_HISTORY_MISSING', status: 409 });
  }
  if (releaseSnap.exists && (previousRaw.length || nextRaw.length)) {
    throw Object.assign(new Error('O estoque de estampas deste pedido já foi liberado; reabra o pedido pelo fluxo de estoque antes de editar as artes.'), { code: 'STAMP_STOCK_ALREADY_RELEASED', status: 409 });
  }

  const stampReads = new Map<string, StampRead>();
  for (const requirement of [...previousRaw, ...nextRaw]) {
    const stampId = String(requirement.stampId || '').trim();
    if (!stampId || stampId.startsWith('own_art_') || stampReads.has(stampId)) continue;
    let ref = db.collection('designs').doc(stampId);
    let snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      ref = db.collection('estampas').doc(stampId);
      snapshot = await transaction.get(ref);
    }
    if (!snapshot.exists) throw Object.assign(new Error(`Estampa ${stampId} não cadastrada no acervo.`), { code: 'STAMP_NOT_FOUND', status: 409 });
    stampReads.set(stampId, { ref, data: snapshot.data() || {}, stampId });
  }

  const aggregate = (requirements: StampRequirement[]) => {
    const resolved = new Map<string, StampRequirement>();
    for (const requirement of requirements) {
      const stampId = String(requirement.stampId || '').trim();
      if (!stampId || stampId.startsWith('own_art_')) continue;
      const stamp = stampReads.get(stampId);
      if (!stamp) continue;
      const printSize = resolveStockSize(stamp.data, cleanPrintSize(requirement.printSize), 'order_debit');
      const key = recipeRequirementKey(stampId, printSize);
      const existing = resolved.get(key);
      resolved.set(key, { stampId, printSize, quantity: (existing?.quantity || 0) + Math.max(0, Math.trunc(Number(requirement.quantity) || 0)) });
    }
    return resolved;
  };

  const previous = aggregate(previousRaw);
  const next = aggregate(nextRaw);
  const changes = new Map<string, { stamp: StampRead; printSize?: string; previous: number; next: number }>();
  for (const [key, requirement] of previous) {
    changes.set(key, { stamp: stampReads.get(requirement.stampId)!, printSize: requirement.printSize, previous: requirement.quantity, next: next.get(key)?.quantity || 0 });
  }
  for (const [key, requirement] of next) {
    if (!changes.has(key)) changes.set(key, { stamp: stampReads.get(requirement.stampId)!, printSize: requirement.printSize, previous: 0, next: requirement.quantity });
  }

  const stampUpdates = new Map<string, { stamp: StampRead; stockBySize: Record<string, number>; totalBefore: number; totalDelta: number; entries: any[] }>();
  for (const change of changes.values()) {
    const { stamp, printSize, previous, next: newQuantity } = change;
    const update = stampUpdates.get(stamp.stampId) || {
      stamp,
      stockBySize: { ...(stamp.data.stockBySize || {}) } as Record<string, number>,
      totalBefore: Number(stamp.data.stockBalance || 0),
      totalDelta: 0,
      entries: [],
    };
    const sizeKey = printSize ? stockMapKey(update.stockBySize, printSize) : undefined;
    const sizeBefore = sizeKey
      ? Number(update.stockBySize[sizeKey] ?? (registeredSizeKeys(stamp.data).length === 1 ? stamp.data.stockBalance || 0 : 0))
      : undefined;
    const delta = previous - newQuantity;
    const totalBefore = update.totalBefore + update.totalDelta;
    const availableBefore = sizeKey ? sizeBefore! : totalBefore;
    if (newQuantity > previous && availableBefore < newQuantity - previous) {
      throw Object.assign(new Error(`Estoque insuficiente da estampa ${stamp.data.code || stamp.data.name || stamp.stampId}${printSize ? ` na medida ${printSize}` : ''} para aplicar esta alteração.`), { code: 'STAMP_STOCK_INSUFFICIENT', status: 409 });
    }
    const sizeAfter = sizeKey ? sizeBefore! + delta : undefined;
    if (sizeKey) update.stockBySize[sizeKey] = sizeAfter!;
    update.totalDelta += delta;
    update.entries.push({ printSize, sizeKey, sizeBefore, sizeAfter, totalBefore, delta });
    stampUpdates.set(stamp.stampId, update);
  }

  const createdAt = new Date().toISOString();
  const effectiveRequirements = [...next.values()];
  return {
    requirements: effectiveRequirements,
    apply: () => {
      for (const [stampId, update] of stampUpdates) {
        const totalAfter = update.totalBefore + update.totalDelta;
        transaction.update(update.stamp.ref, {
          stockBalance: totalAfter,
          ...(Object.keys(update.stockBySize).length ? { stockBySize: update.stockBySize } : {}),
          stockUpdatedAt: createdAt,
        });
        for (const entry of update.entries) {
          if (entry.delta === 0) continue;
          const suffix = entry.sizeKey ? `_${sizeIdentity(entry.sizeKey).replace(/[^a-z0-9]+/g, '-')}` : '';
          transaction.set(db.collection('stamp_movements').doc(`${orderId}_order_edit_${editId}_${encodeURIComponent(stampId)}${suffix}`), {
            orderId,
            stampId,
            ...(entry.sizeKey ? { size: entry.sizeKey, sizeBalanceBefore: entry.sizeBefore, sizeBalanceAfter: entry.sizeAfter } : {}),
            type: 'order_edit_adjustment',
            quantity: Math.abs(entry.delta),
            delta: entry.delta,
            balanceBefore: entry.totalBefore,
            balanceAfter: entry.totalBefore + entry.delta,
            createdAt,
            reason: `Ajuste de consumo de estampa por edição do pedido #${orderId}`,
          });
        }
      }

      transaction.set(db.collection('stamp_stock_events').doc(`${orderId}_order_edit_${editId}`), {
        orderId,
        action: 'order_edit_adjustment',
        createdAt,
        previousRequirements: [...previous.values()],
        requirements: effectiveRequirements,
      });
      return effectiveRequirements;
    },
  };
}

export async function releaseUnmanagedOrderStamps(orderId: string, items: any[]) {
  const db = getDb();
  return db.runTransaction(transaction => applyOrderStampStockInTransaction(transaction, db, orderId, items, 'order_release'));
}

export async function adjustStampBalance(stampId: string, quantity: number, operator: string, reason: string, size?: string) {
  const db = getDb();
  return db.runTransaction(async transaction => {
    const ref = db.collection('designs').doc(stampId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('Estampa não encontrada.');
    const data = snapshot.data() || {};
    const before = Number(data.stockBalance || 0);
    const after = before + quantity;
    const createdAt = new Date().toISOString();
    const requestedSize = cleanPrintSize(size);
    const registeredSizes = registeredSizeKeys(data);
    if (requestedSize && !registeredSizes.some(candidate => sizeIdentity(candidate) === sizeIdentity(requestedSize))) {
      throw new Error('Tamanho de estampa não cadastrado neste item.');
    }
    const stockBySize = { ...(data.stockBySize || {}) } as Record<string, number>;
    const sizeKey = requestedSize ? stockMapKey(stockBySize, requestedSize) : undefined;
    const sizeBefore = sizeKey
      ? Number(stockBySize[sizeKey] ?? (registeredSizes.length === 1 ? before : 0))
      : undefined;
    const sizeAfter = sizeKey ? sizeBefore! + quantity : undefined;
    if (sizeKey) stockBySize[sizeKey] = sizeAfter!;
    const movementRef = db.collection('stamp_movements').doc();
    transaction.update(ref, { stockBalance: after, ...(sizeKey ? { stockBySize } : {}), stockUpdatedAt: createdAt });
    transaction.set(movementRef, {
      stampId,
      type: 'manual_adjustment',
      quantity: Math.abs(quantity),
      delta: quantity,
      balanceBefore: before,
      balanceAfter: after,
      ...(sizeKey ? { size: sizeKey, sizeBalanceBefore: sizeBefore, sizeBalanceAfter: sizeAfter } : {}),
      operator,
      reason,
      createdAt,
    });
    return { before, after, size: sizeKey, sizeBefore, sizeAfter };
  });
}

/** Replace the full physical count by print size atomically and keep an audit trail. */
export async function recountStampSizes(stampId: string, counts: Record<string, number>, operator: string, reason: string) {
  const db = getDb();
  return db.runTransaction(async transaction => {
    const ref = db.collection('designs').doc(stampId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('Estampa não encontrada.');
    const data = snapshot.data() || {};
    const sizes = Array.isArray(data.availableSizes) ? data.availableSizes.map(cleanPrintSize).filter(Boolean) : [];
    if (!sizes.length) throw new Error('Cadastre pelo menos um tamanho antes de registrar a contagem física.');

    const suppliedKeys = Object.keys(counts || {});
    for (const size of sizes) {
      const matchingKey = suppliedKeys.find(key => sizeIdentity(key) === sizeIdentity(size));
      if (!matchingKey || !Number.isSafeInteger(counts[matchingKey]) || counts[matchingKey] < 0) {
        throw new Error(`Informe uma quantidade inteira não negativa para cada medida, incluindo ${size}.`);
      }
    }
    const oldMap = data.stockBySize && typeof data.stockBySize === 'object' ? data.stockBySize as Record<string, number> : {};
    const removedWithBalance = Object.entries(oldMap).find(([size, quantity]) =>
      !sizes.some(current => sizeIdentity(current) === sizeIdentity(size)) && Number(quantity) !== 0
    );
    if (removedWithBalance) throw new Error(`A medida ${removedWithBalance[0]} ainda tem saldo. Zere-a antes de removê-la do cadastro.`);

    const nextMap: Record<string, number> = {};
    for (const size of sizes) {
      const key = Object.keys(counts).find(candidate => sizeIdentity(candidate) === sizeIdentity(size))!;
      nextMap[size] = counts[key];
    }
    const before = Number(data.stockBalance || 0);
    const after = Object.values(nextMap).reduce((sum, quantity) => sum + quantity, 0);
    const previousTrackedTotal = Object.values(oldMap).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
    const unallocatedBefore = before - previousTrackedTotal;
    const createdAt = new Date().toISOString();
    const movementRefs = sizes.map(() => db.collection('stamp_movements').doc());

    transaction.update(ref, { stockBalance: after, stockBySize: nextMap, stockUpdatedAt: createdAt });
    sizes.forEach((size, index) => {
      const oldKey = Object.keys(oldMap).find(key => sizeIdentity(key) === sizeIdentity(size));
      const sizeBefore = Number(oldKey ? oldMap[oldKey] : (sizes.length === 1 ? before : 0));
      const sizeAfter = nextMap[size];
      transaction.set(movementRefs[index], {
        stampId,
        type: 'manual_recount',
        size,
        quantity: Math.abs(sizeAfter - sizeBefore),
        delta: sizeAfter - sizeBefore,
        sizeBalanceBefore: sizeBefore,
        sizeBalanceAfter: sizeAfter,
        balanceBefore: before,
        balanceAfter: after,
        ...(unallocatedBefore ? { unallocatedBalanceBefore: unallocatedBefore } : {}),
        operator,
        reason,
        createdAt,
      });
    });
    return { before, after, stockBySize: nextMap, unallocatedBefore };
  });
}

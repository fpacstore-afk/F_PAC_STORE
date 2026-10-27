import { DEFAULT_PRODUCT_COLOR_PRESETS } from '../../shared/productColorPresets';
import { randomUUID } from 'node:crypto';
import { applyVerifiedGarmentSpecs, garmentFamily, garmentProfiles } from '../../shared/garmentModels.js';
import { getVariantStats } from './store.service.js';

export const garmentBaseId = (id: string) => `garment-${id.toLowerCase()}`;
const clean = (value: any) => JSON.parse(JSON.stringify(value));
const totals = (variants: any) => {
  const rows = Object.values(variants).map(value => getVariantStats(value));
  const physical = rows.reduce((n, row) => n + row.physicalQuantity, 0), reserved = rows.reduce((n, row) => n + row.reservedQuantity, 0);
  return { stock: physical, totalPhysicalStock: physical, totalReservedStock: reserved, totalAvailableStock: physical - reserved, available: physical > reserved };
};
export async function readGarmentModels(db: any) {
  const [config, products, inventory] = await Promise.all([db.collection('pricing_workbench').doc('catalog').get(), db.collection('products').get(), db.collection('inventory').get()]);
  return { profiles: garmentProfiles(config.data()?.catalog), products: products.docs.map((doc: any) => ({ ...doc.data(), id: doc.id })), inventory: Object.fromEntries(inventory.docs.map((doc: any) => [doc.id, doc.data()])) };
}

/** Create empty, distinct pools. Never copy the legacy pool into both suppliers. */
export async function initializeGarmentModels(db: any, actor: string) {
  return db.runTransaction(async (tx: any) => {
    const config = await tx.get(db.collection('pricing_workbench').doc('catalog'));
    const profiles = garmentProfiles(config.data()?.catalog);
    if (!profiles.length) throw new Error('Cadastre as fichas dos fornecedores antes de preparar as bases.');
    const existingProducts = await tx.get(db.collection('products'));
    const refs = profiles.map(profile => ({ profile, product: db.collection('products').doc(garmentBaseId(profile.garmentModelId)), inventory: db.collection('inventory').doc(garmentBaseId(profile.garmentModelId)) }));
    const snapshots = await Promise.all(refs.map(async entry => ({ ...entry, productSnap: await tx.get(entry.product), inventorySnap: await tx.get(entry.inventory) })));
    const now = new Date().toISOString(); let created = 0;
    const oldCatalog = config.data()?.catalog;
    const nextCatalog = oldCatalog && { ...oldCatalog, entries: oldCatalog.entries.map((entry: any) => entry.kind === 'product' ? applyVerifiedGarmentSpecs(entry) : entry) };
    if (nextCatalog && JSON.stringify(nextCatalog) !== JSON.stringify(oldCatalog)) {
      tx.set(db.collection('pricing_workbench').doc('catalog'), { ...config.data(), catalog: nextCatalog, version: (config.data()?.version || 0) + 1, updatedAt: now });
      tx.set(db.collection('pricing_workbench_events').doc(randomUUID()), { type: 'garment_technical_tables', catalog: nextCatalog, previousCatalog: oldCatalog, actor, createdAt: now, version: (config.data()?.version || 0) + 1 });
    }
    for (const product of existingProducts.docs) if (garmentFamily(product.data()) && !product.data().modelSeparationRequired) tx.update(product.ref, { modelSeparationRequired: true, updatedAt: now });
    for (const entry of snapshots) {
      if (entry.productSnap.exists) continue;
      if (entry.inventorySnap.exists) throw new Error('Já existe saldo sem ficha para este modelo. Confira o cadastro antes de iniciar.');
      const p = entry.profile, id = entry.product.id;
      tx.set(entry.product, clean({ ...p, modelSeparationRequired: true, id, slug: id, sku: `FPAC-${p.sourceCode}`, name: `${p.garmentFamily === 'regata' ? 'Regata' : p.garmentFamily === 'oversized' ? 'Camiseta Oversized' : 'Camiseta Tradicional'} F PAC — ${p.garmentModelName}`, baseModel: p.garmentFamily === 'regata' ? 'Regata' : p.garmentFamily === 'oversized' ? 'Oversized Premium 240GSM' : 'Tradicional Suedine', category: p.garmentFamily === 'regata' ? 'Regatas' : p.garmentFamily === 'oversized' ? 'Camiseta Oversized F PAC' : 'Camiseta Tradicional F PAC', productType: 'tshirt', productFinish: 'plain', status: 'draft', primeBaseEnabled: true, collection: 'TODOS', price: 0, sizes: p.sizes, colors: p.sourceColors.map((name: string) => DEFAULT_PRODUCT_COLOR_PRESETS.find(color => color.name.toLowerCase() === name.toLowerCase()) || { name, hex: '#808080' }), images: [], specs: [], createdAt: now, updatedAt: now }));
      tx.set(entry.inventory, { productId: id, productSlug: id, name: p.garmentModelName, variants: {}, ...totals({}), createdAt: now, updatedAt: now });
      created++;
    }
    if (created) tx.set(db.collection('garment_model_events').doc(randomUUID()), { type: 'initialize', created, actor, createdAt: now });
    return { created, total: profiles.length };
  });
}

/** Move only physically counted, unreserved units. Both sides and audit are atomic. */
export async function transferGarmentModel(db: any, input: any, actor: string) {
  const { sourceId, garmentModelId, variantKey, quantity, expectedPhysicalQuantity, requestId } = input || {};
  if (![sourceId, garmentModelId, requestId].every(v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v)) || typeof variantKey !== 'string' || !variantKey || variantKey.length > 150 || /[./]/.test(variantKey) || !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(expectedPhysicalQuantity)) throw new Error('Confira modelo, variação, quantidade e saldo contado.');
  return db.runTransaction(async (tx: any) => {
    const eventRef = db.collection('garment_model_events').doc(requestId), targetId = garmentBaseId(garmentModelId);
    const [event, config, source, target] = await Promise.all([tx.get(eventRef), tx.get(db.collection('pricing_workbench').doc('catalog')), tx.get(db.collection('products').doc(sourceId)), tx.get(db.collection('products').doc(targetId))]);
    const operation = { sourceId, garmentModelId, variantKey, quantity, expectedPhysicalQuantity };
    if (event.exists) {
      if (!Object.entries(operation).every(([key, value]) => event.data().operation?.[key] === value)) throw new Error('Identificador já utilizado por outra transferência. Atualize a tela.');
      return { transferred: quantity, alreadyApplied: true };
    }
    const sourceData = source.data(), targetData = target.data(), profile = garmentProfiles(config.data()?.catalog).find(p => p.garmentModelId === garmentModelId);
    if (!source.exists || !target.exists || sourceData.productFinish !== 'plain' || sourceData.garmentModelId || !profile || targetData.garmentModelId !== garmentModelId || garmentFamily(sourceData) !== profile.garmentFamily) throw new Error('Selecione uma base mista e um modelo compatível.');
    const sourceSlug = sourceData.slug || sourceId;
    if (sourceSlug === targetId) throw new Error('Origem e destino precisam ser diferentes.');
    const sourceRef = db.collection('inventory').doc(sourceSlug), targetRef = db.collection('inventory').doc(targetId);
    const [sourceInv, targetInv] = await Promise.all([tx.get(sourceRef), tx.get(targetRef)]);
    const origin = sourceInv.data() || {}, destination = targetInv.data() || {}, stats = getVariantStats(origin.variants?.[variantKey]);
    if (stats.physicalQuantity !== expectedPhysicalQuantity) throw new Error('O saldo mudou. Atualize a tela antes de transferir.');
    if (quantity > stats.availableQuantity) throw new Error('Quantidade acima do saldo livre. Reservas existentes precisam permanecer na origem.');
    const size = (sourceData.sizes || []).find((s: string) => variantKey.endsWith(`_${s}`)), color = size && variantKey.slice(0, -(size.length + 1));
    if (!size || !color || !profile.sizes.includes(size)) throw new Error('O tamanho não pertence à ficha do modelo escolhido.');
    const oldTarget = getVariantStats(destination.variants?.[variantKey]);
    const sourceVariants = { ...origin.variants, [variantKey]: { ...origin.variants?.[variantKey], physicalQuantity: stats.physicalQuantity - quantity, stock: stats.physicalQuantity - quantity, reservedQuantity: stats.reservedQuantity, availableQuantity: stats.availableQuantity - quantity, available: stats.availableQuantity > quantity } };
    const targetVariants = { ...destination.variants, [variantKey]: { ...destination.variants?.[variantKey], color, size, physicalQuantity: oldTarget.physicalQuantity + quantity, stock: oldTarget.physicalQuantity + quantity, reservedQuantity: oldTarget.reservedQuantity, availableQuantity: oldTarget.availableQuantity + quantity, active: true, available: true, physicalCountVerified: true } };
    const now = new Date().toISOString();
    tx.set(sourceRef, { ...origin, variants: sourceVariants, ...totals(sourceVariants), updatedAt: now });
    tx.set(targetRef, { ...destination, variants: targetVariants, ...totals(targetVariants), updatedAt: now });
    {
      const originalColor = (sourceData.colors || []).find((c: any) => c.name === color);
      tx.update(target.ref, { colors: [...(targetData.colors || []).filter((c: any) => c.name !== color), originalColor || (targetData.colors || []).find((c: any) => c.name === color) || { name: color, hex: '#808080' }], updatedAt: now });
    }
    tx.set(eventRef, { type: 'classify_transfer', operation, actor, sourceSlug, targetId, createdAt: now });
    for (const [slug, type] of [[sourceSlug, 'saida'], [targetId, 'entrada']]) tx.set(db.collection('stock_movements').doc(`${requestId}_${type}`), { productSlug: slug, variantKey, quantity, type, reason: 'Separação física por modelo/fornecedor', relatedTransferId: requestId, operator: actor, createdAt: now });
    return { transferred: quantity, alreadyApplied: false };
  });
}

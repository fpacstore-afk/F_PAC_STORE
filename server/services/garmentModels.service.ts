import { isGarmentVariantAllowed } from '../../shared/sharedGarmentStock';
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

/** Owner-confirmed duplicate: identify the stock-bearing record in place.
 * No inventory, reservation, order or movement is rewritten or summed. */
export async function unifyGarmentModel(db: any, input: any, actor: string) {
  const { sourceId, garmentModelId, expectedPhysicalQuantity, requestId } = input || {};
  if (![sourceId, garmentModelId, requestId].every(v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v)) || !Number.isSafeInteger(expectedPhysicalQuantity) || expectedPhysicalQuantity < 0) throw new Error('Confira os dois cadastros e o saldo atual.');
  return db.runTransaction(async (tx: any) => {
    const eventRef = db.collection('garment_model_events').doc(requestId);
    const [event, config, products] = await Promise.all([tx.get(eventRef), tx.get(db.collection('pricing_workbench').doc('catalog')), tx.get(db.collection('products'))]);
    const operation = { sourceId, garmentModelId, expectedPhysicalQuantity };
    if (event.exists) {
      if (event.data().type !== 'unify_empty_duplicate' || !Object.entries(operation).every(([key, value]) => event.data().operation?.[key] === value)) throw new Error('Identificador já usado por outra operação.');
      return { ...event.data().result, alreadyApplied: true };
    }
    const source = products.docs.find((doc: any) => doc.id === sourceId);
    const duplicate = products.docs.find((doc: any) => doc.id === garmentBaseId(garmentModelId));
    const profile = garmentProfiles(config.data()?.catalog).find(p => p.garmentModelId === garmentModelId);
    const original = source?.data(), extra = duplicate?.data();
    if (!source || !duplicate || !profile || source.id === duplicate.id || original.productFinish !== 'plain' || original.garmentModelId || original.mergedIntoProductId || extra.mergedIntoProductId || extra.productFinish !== 'plain' || extra.garmentModelId !== garmentModelId || garmentFamily(original) !== profile.garmentFamily) throw new Error('Selecione a base original e o cadastro vazio do mesmo modelo.');
    if (products.docs.some((doc: any) => ![source.id, duplicate.id].includes(doc.id) && doc.data().productFinish === 'plain' && doc.data().garmentModelId === garmentModelId && !doc.data().mergedIntoProductId && !['archived','inactive'].includes(doc.data().status))) throw new Error('Existe outra base deste modelo. Confira antes de unificar.');
    const sourceSlug = original.slug || source.id, duplicateSlug = extra.slug || duplicate.id;
    const [sourceInventory, duplicateInventory] = await Promise.all([tx.get(db.collection('inventory').doc(sourceSlug)), tx.get(db.collection('inventory').doc(duplicateSlug))]);
    const inventory = sourceInventory.data() || {}, empty = duplicateInventory.data() || {};
    const balance = totals(inventory.variants || {}), otherBalance = totals(empty.variants || {});
    if (!sourceInventory.exists || balance.totalPhysicalStock !== expectedPhysicalQuantity) throw new Error('O saldo mudou. Atualize a tela antes de unificar.');
    const hasBalance = [otherBalance.stock, otherBalance.totalReservedStock, empty.stock, empty.physicalQuantity, empty.totalPhysicalStock, empty.reservedQuantity, empty.totalReservedStock].some(n => Number(n) !== 0 && Number.isFinite(Number(n)));
    if (hasBalance || Object.values(empty.variants || {}).some((v: any) => Number(v.physicalQuantity ?? v.stock ?? 0) !== 0 || Number(v.reservedQuantity ?? v.reserved ?? 0) !== 0)) throw new Error('O segundo cadastro possui saldo ou reservas. Esta unificação exige o duplicado vazio.');
    if ((original.sizes || []).some((size: string) => !profile.sizes.includes(size))) throw new Error('Há tamanhos fora da ficha selecionada. Confira os cadastros.');
    const links = products.docs.filter((doc: any) => [duplicate.id, duplicateSlug].includes(doc.data().stockBaseSlug));
    if (links.some((doc: any) => doc.data().garmentModelId && doc.data().garmentModelId !== garmentModelId)) throw new Error('Há um vínculo de outro modelo. Confira os cadastros.');
    const now = new Date().toISOString();
    // Keep the original matrix and availability switches exactly as configured.
    const { sizes: _sizes, ...identity } = profile;
    const identityUpdate = clean({ ...identity, id: source.id, slug: sourceSlug, name: `${profile.garmentFamily === 'regata' ? 'Regata' : profile.garmentFamily === 'oversized' ? 'Camiseta Oversized' : 'Camiseta Tradicional'} F PAC — ${profile.garmentModelName}`, sku: `FPAC-${profile.sourceCode}`, legacyReferences: [...new Set([...(original.legacyReferences || []), original.sku].filter(Boolean))], confirmedBaseModels: [...new Set([...(original.confirmedBaseModels || []), original.baseModel].filter(Boolean))], modelSeparationRequired: true, modelClassificationPending: false, mergedProductIds: [...new Set([...(original.mergedProductIds || []), duplicate.id])], updatedAt: now });
    const next = { ...original, ...identityUpdate };
    tx.update(source.ref, identityUpdate);
    tx.update(duplicate.ref, { status: 'archived', primeBaseEnabled: false, mergedIntoProductId: source.id, mergedIntoSlug: sourceSlug, mergedAt: now, updatedAt: now });
    for (const linked of links) if (![source.id, duplicate.id].includes(linked.id)) tx.update(linked.ref, { stockBaseSlug: sourceSlug, updatedAt: now });
    const result = { productId: source.id, sku: next.sku, physicalQuantity: balance.totalPhysicalStock, reservedQuantity: balance.totalReservedStock, archivedDuplicateId: duplicate.id };
    tx.set(eventRef, { type: 'unify_empty_duplicate', operation, actor, sourceSlug, duplicateSlug, previousSource: original, previousDuplicate: extra, relinkedProductIds: links.map((doc: any) => doc.id), result, createdAt: now });
    tx.set(db.collection('stock_movements').doc(`${requestId}_unify`), { productSlug: sourceSlug, type: 'product_merge', quantity: 0, reason: `Cadastros unificados: ${original.sku || source.id} + ${next.sku}. Saldo e reservas preservados.`, relatedTransferId: requestId, operator: actor, createdAt: now });
    return { ...result, alreadyApplied: false };
  });
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
      tx.set(entry.product, clean({ ...p, modelSeparationRequired: true, id, slug: id, sku: `FPAC-${p.sourceCode}`, name: `${p.garmentFamily === 'regata' ? 'Regata' : p.garmentFamily === 'oversized' ? 'Camiseta Oversized' : 'Camiseta Tradicional'} F PAC — ${p.garmentModelName}`, baseModel: p.garmentFamily === 'regata' ? 'Regata' : p.garmentFamily === 'oversized' ? 'Oversized Premium 240GSM' : 'Tradicional Suedine', category: p.garmentFamily === 'regata' ? 'Regatas' : p.garmentFamily === 'oversized' ? 'Camiseta Oversized F PAC' : 'Camiseta Tradicional F PAC', productType: 'tshirt', productFinish: 'plain', status: 'draft', primeBaseEnabled: true, collection: 'TODOS', price: 0, sizes: p.sizes, variants: p.sourceColors.flatMap((colorName: string) => p.sizes.map((size: string) => ({ sku: `${p.sourceCode}-${colorName}-${size}`, colorName, size, active: !p.sourceRestrictions.some((rule: any) => rule.colors.includes(colorName) && !rule.sizes.includes(size)) }))), colors: p.sourceColors.map((name: string) => DEFAULT_PRODUCT_COLOR_PRESETS.find(color => color.name.toLowerCase() === name.toLowerCase()) || { name, hex: '#808080' }), images: [], specs: [], createdAt: now, updatedAt: now }));
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
    const eventRef = db.collection('garment_model_events').doc(requestId);
    const [event, config, source, products] = await Promise.all([tx.get(eventRef), tx.get(db.collection('pricing_workbench').doc('catalog')), tx.get(db.collection('products').doc(sourceId)), tx.get(db.collection('products'))]);
    const operation = { sourceId, garmentModelId, variantKey, quantity, expectedPhysicalQuantity };
    if (event.exists) {
      if (!Object.entries(operation).every(([key, value]) => event.data().operation?.[key] === value)) throw new Error('Identificador já utilizado por outra transferência. Atualize a tela.');
      return { transferred: quantity, alreadyApplied: true };
    }
    const matches = products.docs.filter((doc: any) => doc.data().productFinish === 'plain' && doc.data().garmentModelId === garmentModelId && !doc.data().mergedIntoProductId && !['archived','inactive'].includes(doc.data().status));
    const target = matches.length === 1 ? matches[0] : undefined;
    const sourceData = source.data(), targetData = target?.data(), profile = garmentProfiles(config.data()?.catalog).find(p => p.garmentModelId === garmentModelId);
    if (!source.exists || !target || sourceData.productFinish !== 'plain' || sourceData.garmentModelId || !profile || targetData.garmentModelId !== garmentModelId || garmentFamily(sourceData) !== profile.garmentFamily) throw new Error('Selecione uma base mista e um modelo compatível.');
    const targetId = targetData.slug || target.id;
    const sourceSlug = sourceData.slug || sourceId;
    if (sourceSlug === targetId) throw new Error('Origem e destino precisam ser diferentes.');
    const sourceRef = db.collection('inventory').doc(sourceSlug), targetRef = db.collection('inventory').doc(targetId);
    const [sourceInv, targetInv] = await Promise.all([tx.get(sourceRef), tx.get(targetRef)]);
    const origin = sourceInv.data() || {}, destination = targetInv.data() || {}, stats = getVariantStats(origin.variants?.[variantKey]);
    if (stats.physicalQuantity !== expectedPhysicalQuantity) throw new Error('O saldo mudou. Atualize a tela antes de transferir.');
    if (quantity > stats.availableQuantity) throw new Error('Quantidade acima do saldo livre. Reservas existentes precisam permanecer na origem.');
    const size = (sourceData.sizes || []).find((s: string) => variantKey.endsWith(`_${s}`)), color = size && variantKey.slice(0, -(size.length + 1));
    if (!size || !color || !profile.sizes.includes(size) || !isGarmentVariantAllowed({ ...targetData, colors: [...(targetData.colors || []), { name: color }] }, variantKey)) throw new Error('O tamanho não pertence à ficha do modelo escolhido.');
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

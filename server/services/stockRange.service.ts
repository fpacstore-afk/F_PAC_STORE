import { createHash } from 'node:crypto';
import { STOCK_FAMILIES, stockFamily, stockFamilyDefinition } from '../../shared/stockFamilies';

const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const hash = (value: any) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const baseModels: Record<string, string> = { oversized:'Oversized Premium 240GSM', tradicional:'Tradicional Suedine', bermudas:'Bermuda Linho Cargo', regatas:'Regata', croppeds:'Cropped Oversized Feminino', casacos:'Casaco de Moletom', bones:'Boné de Telinha Trucker' };
const qty = (entry: any) => {
  const variants = Object.values(entry.variants || {}) as any[];
  const physical = variants.length ? variants.reduce((sum, v) => sum + Number(v.physicalQuantity ?? v.stock ?? 0), 0) : Number(entry.totalPhysicalStock ?? entry.physicalQuantity ?? entry.stock ?? 0);
  const reserved = variants.length ? variants.reduce((sum, v) => sum + Number(v.reservedQuantity ?? v.reserved ?? 0), 0) : Number(entry.totalReservedStock ?? entry.reservedQuantity ?? 0);
  if (!Number.isFinite(physical) || !Number.isFinite(reserved)) throw new Error('Há um saldo inválido. Confira o inventário antes de reorganizar.');
  return { physical, reserved };
};

/** Metadata-only plan. Stock-bearing IDs, slugs, model IDs and variants never move. */
export function planStockRange(products: any[], inventory: any[]) {
  const updates: { id: string; before: any; patch: any }[] = [], creates: { id: string; product: any; inventory: any }[] = [];
  for (const product of products) {
    if (product.mergedIntoProductId) continue;
    const family = stockFamilyDefinition(stockFamily(product));
    const patch: any = family ? { stockFamily:family.id, category:family.label, productType:family.productType } : { rangeArchived:true, status:'archived', primeBaseEnabled:false };
    if (family && product.productFinish === 'plain') patch.name = family.label;
    const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => product[key] !== value));
    if (Object.keys(changed).length) updates.push({ id: product.id, before:Object.fromEntries(Object.keys(changed).map(key => [key, { exists:product[key] !== undefined, value:product[key] ?? null }])), patch:changed });
  }
  for (const family of STOCK_FAMILIES) {
    if (products.some(p => p.productFinish === 'plain' && stockFamily(p) === family.id && !p.mergedIntoProductId && !p.rangeArchived && !['archived','inactive'].includes(p.status))) continue;
    const id = `base-${family.id}-fpac`;
    if (products.some(p => p.id === id || p.slug === id) || inventory.some(p => p.id === id)) throw new Error('A referência da nova base já existe. Confira o cadastro antes de aplicar.');
    creates.push({ id, product:{ id, slug:id, sku:`FPAC-BASE-${family.id.toUpperCase()}`, name:family.label, stockFamily:family.id, category:family.label, productType:family.productType, baseModel:baseModels[family.id], productFinish:'plain', collection:'TODOS', status:'draft', price:0, primeBaseEnabled:false, sizes:[], colors:[], variants:[], images:[], specs:[], stockMode:'shared', ...(family.collars ? { modelSeparationRequired:true, modelClassificationPending:true } : {}), setupPending:true }, inventory:{ productId:id, productSlug:id, name:family.label, variants:{}, stock:0, totalPhysicalStock:0, totalReservedStock:0, totalAvailableStock:0, available:false } });
  }
  const inventoryTotals = inventory.reduce((acc, value) => { const n=qty(value); return { physical:acc.physical+n.physical, reserved:acc.reserved+n.reserved }; },{physical:0,reserved:0});
  const fingerprint = hash({ products:products.map(p=>p).sort((a,b)=>a.id.localeCompare(b.id)), inventory:inventory.map(p=>p).sort((a,b)=>a.id.localeCompare(b.id)) });
  return { revision:'2026-10-29.1', fingerprint, updates, creates, inventoryTotals, families:STOCK_FAMILIES.map(f=>({ id:f.id,label:f.label })), archived:updates.filter(u=>u.patch.rangeArchived).map(u=>u.id) };
}

export async function previewStockRange(db: any) {
  const [products, inventory] = await Promise.all([db.collection('products').get(), db.collection('inventory').get()]);
  return planStockRange(products.docs.map((d: any)=>({...d.data(),id:d.id})),inventory.docs.map((d: any)=>({...d.data(),id:d.id})));
}

export async function applyStockRange(db: any, input: any, actor: string) {
  if (typeof input?.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.requestId) || typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint)) throw new Error('Atualize a prévia antes de aplicar a organização.');
  return db.runTransaction(async (tx: any) => {
    const eventRef = db.collection('stock_range_events').doc(input.requestId);
    const [event, productSnap, inventorySnap] = await Promise.all([tx.get(eventRef),tx.get(db.collection('products')),tx.get(db.collection('inventory'))]);
    if (event.exists) {
      if (event.data().fingerprint !== input.fingerprint) throw new Error('Identificador já utilizado por outra organização.');
      return { ...event.data().result, alreadyApplied:true };
    }
    const plan=planStockRange(productSnap.docs.map((d: any)=>({...d.data(),id:d.id})),inventorySnap.docs.map((d: any)=>({...d.data(),id:d.id})));
    if (plan.fingerprint !== input.fingerprint) throw new Error('Os cadastros ou saldos mudaram. Atualize a prévia antes de aplicar.');
    if (plan.updates.length + plan.creates.length*2 + 1 > 450) throw new Error('A organização exige revisão em lotes; nenhuma alteração foi aplicada.');
    const now=new Date().toISOString();
    for (const update of plan.updates) tx.update(db.collection('products').doc(update.id),{...update.patch,updatedAt:now});
    for (const created of plan.creates) {
      tx.set(db.collection('products').doc(created.id),{...created.product,createdAt:now,updatedAt:now});
      tx.set(db.collection('inventory').doc(created.id),{...created.inventory,createdAt:now,updatedAt:now});
    }
    const result={ updated:plan.updates.length, created:plan.creates.map(p=>({id:p.id,name:p.product.name})), archived:plan.archived, inventoryTotals:plan.inventoryTotals, preservedExistingInventory:true, preservedOrders:true, preservedPrices:true };
    tx.set(eventRef,{ revision:plan.revision, fingerprint:plan.fingerprint, actor, createdAt:now, beforeFields:plan.updates.map(u=>({id:u.id,fields:u.before})), appliedUpdates:plan.updates.map(u=>({id:u.id,patch:u.patch})), createdIds:plan.creates.map(p=>p.id), result });
    return {...result,alreadyApplied:false};
  });
}

import { getVariantStats } from './store.service.js';

/** Owner's physical count, 23/11/2026. These are final balances, not receipts. */
const SHEETS = [
  {
    id: 'garment-zim-comfort-160', modelId: 'ZIM-COMFORT-160', sku: 'FPAC-ZIM-COMFORT-160',
    baseModel: 'Camiseta Básica Tradicional', name: 'Camiseta Básica Tradicional F PAC — Zimm Comfort',
    fabric: '100% algodão 30.1', gsm: '160 g/m²', collar: 'Gola tradicional · ribana 1,5 cm',
    sizes: ['P','M','G','GG','XG'], colors: ['Preto','Verde Militar'],
    // The owner's counted XG is distinct, but the supplier picture lists only P–GG.
    supplierSizeUnverified: ['XG'],
    balances: { Preto_P: 1, Preto_M: 1, Preto_G: 1, Preto_GG: 0, Preto_XG: 2,
      'Verde Militar_P': 0, 'Verde Militar_M': 0, 'Verde Militar_G': 0, 'Verde Militar_GG': 0, 'Verde Militar_XG': 1 },
  },
  {
    id: 'garment-zim-dryfit-140', modelId: 'ZIM-DRYFIT-140', sku: 'FPAC-ZIM-DRYFIT-140',
    baseModel: 'Tradicional Dry Fit', name: 'Camiseta Tradicional Dry Fit F PAC — Zimm',
    fabric: '100% poliéster · tecido grão de arroz', gsm: '140 g/m²', collar: 'Não informado na ficha',
    sizes: ['P','M','G','GG'], colors: ['Preto'], supplierSizeUnverified: [],
    balances: { Preto_P: 1, Preto_M: 2, Preto_G: 3, Preto_GG: 2 },
  },
] as const;
const EVENT_ID = 'zimm_final_count_2026_11_23';
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const physical = (variant: any) => getVariantStats(variant).physicalQuantity;
const reserved = (variant: any) => getVariantStats(variant).reservedQuantity;
const stats = (variants: Record<string, any>) => {
  const values = Object.values(variants).map(variant => getVariantStats(variant));
  const totalPhysicalStock = sum(values.map(value => value.physicalQuantity));
  const totalReservedStock = sum(values.map(value => value.reservedQuantity));
  return { stock: totalPhysicalStock, totalPhysicalStock, totalReservedStock,
    totalAvailableStock: totalPhysicalStock - totalReservedStock, available: totalPhysicalStock > totalReservedStock };
};

async function inspect(db: any, tx?: any) {
  const productsRef = db.collection('products');
  const eventRef = db.collection('pending_inventory_imports').doc(EVENT_ID);
  const get = (ref: any) => tx ? tx.get(ref) : ref.get();
  const [products, event, ...inventories] = await Promise.all([
    get(productsRef), get(eventRef), ...SHEETS.map(sheet => get(db.collection('inventory').doc(sheet.id))),
  ]);
  const conflicts: string[] = [], lines: any[] = [];
  const existing = products.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  SHEETS.forEach((sheet, index) => {
    const base = existing.find((item: any) => item.id === sheet.id) as any;
    // A physical base with the same family under another ID must be inspected,
    // never silently duplicated or merged with stock from another fabric.
    const candidates = existing.filter((item: any) => item.productFinish === 'plain' &&
      !item.mergedIntoProductId && !['archived','inactive'].includes(item.status) &&
      (item.baseModel === sheet.baseModel || item.garmentModelId === sheet.modelId || item.sku === sheet.sku));
    if (candidates.some((item: any) => item.id !== sheet.id)) conflicts.push(`${sheet.baseModel}: já existe uma base física com outra referência. Confira SKU, fornecedor, reservas e histórico antes de cadastrar.`);
    if (base && (base.productFinish !== 'plain' || base.baseModel !== sheet.baseModel || base.garmentModelId !== sheet.modelId || base.sku !== sheet.sku)) conflicts.push(`${sheet.sku}: o identificador já pertence a outro cadastro.`);
    const inventory = inventories[index].data() || {};
    if (!base && inventories[index].exists) conflicts.push(`${sheet.sku}: há saldo sem produto correspondente; confira o cadastro.`);
    for (const [variantKey, counted] of Object.entries(sheet.balances)) {
      const old = inventory.variants?.[variantKey];
      const before = physical(old), held = reserved(old);
      if (before !== 0 || held !== 0) conflicts.push(`${sheet.sku} ${variantKey}: já existe saldo ou reserva; não substitua sem uma nova conferência.`);
      lines.push({ productId: sheet.id, sku: `${sheet.sku}-${variantKey.replace(/\s+/g, '-').replace('_', '-')}`, variantKey,
        previousPhysical: before, reserved: held, counted, difference: counted - before });
    }
  });
  return { event: event.exists ? event.data() : null, existing, inventories, conflicts,
    lines, countedTotal: sum(lines.map(line => line.counted)), previousTotal: sum(lines.map(line => line.previousPhysical)) };
}

export async function previewPendingZimmInventory(db: any) {
  const result = await inspect(db);
  return { countReference: '2026-11', countedTotal: result.countedTotal, previousTotal: result.previousTotal,
    lines: result.lines, conflicts: result.conflicts, alreadyApplied: Boolean(result.event) };
}

export async function applyPendingZimmInventory(db: any, actor: string) {
  if (!actor) throw new Error('Identifique o responsável pela contagem.');
  return db.runTransaction(async (tx: any) => {
    const report = await inspect(db, tx);
    if (report.event) return { ...report.event.result, alreadyApplied: true };
    if (report.conflicts.length) throw new Error(report.conflicts.join(' '));
    if (report.countedTotal !== 14 || report.previousTotal !== 0) throw new Error('A contagem mudou. Atualize a prévia antes de confirmar.');
    const now = new Date().toISOString();
    const differences: any[] = [];
    for (let index = 0; index < SHEETS.length; index++) {
      const sheet = SHEETS[index];
      const currentProduct = report.existing.find((item: any) => item.id === sheet.id) as any;
      const inventory = report.inventories[index].data() || {};
      const variants = { ...(inventory.variants || {}) };
      for (const [variantKey, counted] of Object.entries(sheet.balances)) {
        const split = variantKey.lastIndexOf('_');
        const color = variantKey.slice(0, split), size = variantKey.slice(split + 1);
        const previous = variants[variantKey] || {};
        variants[variantKey] = { ...previous, color, size, sku: `${sheet.sku}-${color.replace(/\s+/g, '-')}-${size}`,
          physicalQuantity: counted, stock: counted, reservedQuantity: 0, availableQuantity: counted,
          physicalCountVerified: true, available: counted > 0, active: true, updatedAt: now };
        if (counted > 0) {
          const movement = { productSlug: sheet.id, productId: sheet.id, variantKey, type: 'adjust',
            quantity: counted, previousPhysicalQuantity: 0, newPhysicalQuantity: counted,
            previousReservedQuantity: 0, newReservedQuantity: 0, previousAvailableQuantity: 0,
            newAvailableQuantity: counted, reason: 'Contagem física final de 23/11/2026 · Zimm · sem entrada de mercadoria',
            operator: actor, relatedTransferId: EVENT_ID, createdAt: now, timestamp: now };
          tx.create(db.collection('stock_movements').doc(`${EVENT_ID}_${sheet.id}_${variantKey.replace(/\s+/g, '-')}`), movement);
          differences.push({ productId: sheet.id, variantKey, previous: 0, final: counted, difference: counted });
        }
      }
      const product = { id: sheet.id, slug: sheet.id, sku: sheet.sku, name: sheet.name,
        supplierName: 'Zimm', garmentModelId: sheet.modelId, garmentModelName: sheet.name,
        baseModel: sheet.baseModel, stockFamily: 'tradicional', productFinish: 'plain', productType: 'tshirt',
        status: 'draft', primeBaseEnabled: false, modelSeparationRequired: true,
        fabric: sheet.fabric, gsm: sheet.gsm, collar: sheet.collar,
        sizes: sheet.sizes, colors: sheet.colors.map(name => ({ name, hex: name === 'Preto' ? '#111111' : '#555b43' })),
        supplierSizeUnverified: sheet.supplierSizeUnverified, price: 0,
        variants: Object.entries(sheet.balances).map(([key]) => { const split = key.lastIndexOf('_'); return { sku: `${sheet.sku}-${key.slice(0, split).replace(/\s+/g, '-')}-${key.slice(split + 1)}`, colorName: key.slice(0, split), size: key.slice(split + 1), active: true }; }),
        updatedAt: now };
      const ref = db.collection('products').doc(sheet.id);
      if (!currentProduct) tx.create(ref, { ...product, createdAt: now, images: [] });
      else tx.update(ref, { ...product, status: currentProduct.status, primeBaseEnabled: currentProduct.primeBaseEnabled,
        price: currentProduct.price, images: currentProduct.images || [],
        sizes: [...new Set([...(currentProduct.sizes || []), ...sheet.sizes])],
        colors: [...(currentProduct.colors || []).filter((color: any) => !sheet.colors.includes(color.name)), ...product.colors],
        variants: [...(currentProduct.variants || []).filter((variant: any) => !Object.hasOwn(sheet.balances, `${variant.colorName || variant.color}_${variant.size}`)), ...product.variants] });
      tx.set(db.collection('inventory').doc(sheet.id), { ...inventory, productId: sheet.id, productSlug: sheet.id, name: sheet.name,
        variants, ...stats(variants), createdAt: inventory.createdAt || now, updatedAt: now });
    }
    const result = { countedTotal: 14, changedVariants: differences.length, differences, preservedOtherProducts: true };
    tx.create(db.collection('pending_inventory_imports').doc(EVENT_ID), { actor, createdAt: now, result });
    return { ...result, alreadyApplied: false };
  });
}
